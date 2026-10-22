export const GIGABYTE_BYTES = 1_000_000_000n;
export const GLOBAL_STORAGE_LIMIT_BYTES = 9n * GIGABYTE_BYTES;
export const ALLOCATABLE_STORAGE_LIMIT_BYTES = 8n * GIGABYTE_BYTES;
export const DEFAULT_LAB_STORAGE_LIMIT_BYTES = GIGABYTE_BYTES;
export const MAX_LAB_COUNT = 8;
export const STORAGE_WARNING_PERCENT = 80;
export const STORAGE_RESERVATION_TTL_MS = 15 * 60 * 1000;
export const STORAGE_CONTROL_ID = "global";

/** @typedef {{usedBytes: bigint, limitBytes: bigint, percentUsed: number, warning: boolean, full: boolean}} StorageUsageState */
/** @typedef {{id: string, name: string, createdAt: Date, materialBytes: bigint, reservedBytes: bigint, usedBytes: bigint, limitBytes: bigint, state: StorageUsageState}} StorageLabOverview */
/** @typedef {{labs: StorageLabOverview[], labCount: number, allocatedBytes: bigint, totalUsedBytes: bigint, totalReservedBytes: bigint, effectiveUsedBytes: bigint, globalLimitBytes: bigint, allocationLimitBytes: bigint, globalState: StorageUsageState, overAllocated: boolean, overLabLimit: boolean}} StorageOverview */

export class StorageQuotaError extends Error {
  /**
   * @param {"LAB_QUOTA_EXCEEDED" | "GLOBAL_QUOTA_EXCEEDED" | "LAB_LIMIT_REACHED" | "STORAGE_CAPACITY_UNAVAILABLE" | "QUOTA_BELOW_USAGE" | "INVALID_QUOTA" | "STORAGE_QUOTA_CONFIGURATION_FAILED" | "RESERVATION_EXPIRED" | "LAB_NOT_FOUND"} code
   */
  constructor(code) {
    super(code);
    this.name = "StorageQuotaError";
    this.code = code;
  }
}

/** @param {number | bigint} usedBytes @param {number | bigint} limitBytes */
export function getStorageUsageState(usedBytes, limitBytes) {
  const used = toBigInt(usedBytes);
  const limit = toBigInt(limitBytes);
  const percentUsed = limit > 0n ? Number((used * 100n) / limit) : 0;

  return {
    usedBytes: used,
    limitBytes: limit,
    percentUsed,
    warning:
      limit > 0n && used * 100n >= limit * BigInt(STORAGE_WARNING_PERCENT),
    full: limit === 0n || used >= limit,
  };
}

/**
 * Parse a decimal GB value with at most nine fractional digits (one byte).
 * @param {unknown} value
 * @returns {bigint | null}
 */
export function parseStorageLimitGb(value) {
  if (
    typeof value !== "string" ||
    value.length > 11 ||
    !/^\d+(?:\.\d{1,9})?$/.test(value)
  ) {
    return null;
  }

  const [whole, fraction = ""] = value.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const units = BigInt(whole) * scale + BigInt(fraction || "0");
  const limit = (units * GIGABYTE_BYTES) / scale;

  if (limit > ALLOCATABLE_STORAGE_LIMIT_BYTES) {
    return null;
  }

  return limit;
}

/** @param {string | undefined} value */
export function parseAppAdminEmails(value) {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** @param {string | null | undefined} email @param {string | undefined} allowlist */
export function isAppAdminEmail(email, allowlist) {
  if (typeof email !== "string" || !email.trim()) {
    return false;
  }

  return parseAppAdminEmails(allowlist).includes(email.trim().toLowerCase());
}

/**
 * Reserve capacity before writing to object storage. The singleton control
 * row is updated first in every quota transaction so concurrent uploads and
 * quota changes serialize through the same PostgreSQL row lock.
 *
 * @param {any} db
 * @param {{labId: string, sizeBytes: number, now?: Date}} input
 */
export async function reserveStorageUpload(db, { labId, sizeBytes, now = new Date() }) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new StorageQuotaError("INVALID_QUOTA");
  }

  await expireStorageReservations(db, now);
  const reservationBytes = BigInt(sizeBytes);

  return db.$transaction(async (tx) => {
    const control = await lockStorageControl(tx);
    const lab = await tx.lab.findUnique({
      where: { id: labId },
      select: { storageLimitBytes: true },
    });
    if (!lab) {
      throw new StorageQuotaError("LAB_NOT_FOUND");
    }

    const [globalMaterialUsage, labMaterialUsage, labReservations] =
      await Promise.all([
        tx.material.aggregate({ _sum: { sizeBytes: true } }),
        tx.material.aggregate({
          where: { labId },
          _sum: { sizeBytes: true },
        }),
        tx.storageReservation.aggregate({
          where: { labId, expiresAt: { gt: now } },
          _sum: { sizeBytes: true },
        }),
      ]);

    const totalUsed = sumToBigInt(globalMaterialUsage._sum.sizeBytes);
    const labUsed = sumToBigInt(labMaterialUsage._sum.sizeBytes);
    const labReserved = sumToBigInt(labReservations._sum.sizeBytes);

    if (totalUsed + toBigInt(control.reservedBytes) + reservationBytes > GLOBAL_STORAGE_LIMIT_BYTES) {
      throw new StorageQuotaError("GLOBAL_QUOTA_EXCEEDED");
    }

    if (labUsed + labReserved + reservationBytes > toBigInt(lab.storageLimitBytes)) {
      throw new StorageQuotaError("LAB_QUOTA_EXCEEDED");
    }

    const reservation = await tx.storageReservation.create({
      data: {
        labId,
        sizeBytes: reservationBytes,
        expiresAt: new Date(now.getTime() + STORAGE_RESERVATION_TTL_MS),
      },
      select: { id: true },
    });
    await tx.storageQuotaControl.update({
      where: { id: STORAGE_CONTROL_ID },
      data: { reservedBytes: { increment: reservationBytes } },
    });

    return reservation.id;
  });
}

/** @param {any} db @param {string} reservationId */
export async function releaseStorageUpload(db, reservationId) {
  return db.$transaction(async (tx) => {
    await lockStorageControl(tx);
    const reservation = await tx.storageReservation.findUnique({
      where: { id: reservationId },
      select: { sizeBytes: true },
    });
    if (!reservation) {
      return false;
    }

    await tx.storageReservation.delete({ where: { id: reservationId } });
    await tx.storageQuotaControl.update({
      where: { id: STORAGE_CONTROL_ID },
      data: { reservedBytes: { decrement: toBigInt(reservation.sizeBytes) } },
    });
    return true;
  });
}

/**
 * Convert an active reservation into a Material row atomically. Expired
 * reservations are removed here too, so a slow request cannot reuse a stale
 * reservation after another request has released its capacity.
 * @param {any} db
 * @param {string} reservationId
 * @param {Record<string, unknown>} materialData
 * @param {Date} [now]
 */
export async function commitStorageUpload(
  db,
  reservationId,
  materialData,
  now = new Date(),
) {
  const result = await db.$transaction(async (tx) => {
    await lockStorageControl(tx);
    const reservation = await tx.storageReservation.findUnique({
      where: { id: reservationId },
      select: { sizeBytes: true, expiresAt: true },
    });
    if (!reservation) {
      return { expired: true };
    }

    if (reservation.expiresAt <= now) {
      await tx.storageReservation.delete({ where: { id: reservationId } });
      await tx.storageQuotaControl.update({
        where: { id: STORAGE_CONTROL_ID },
        data: { reservedBytes: { decrement: toBigInt(reservation.sizeBytes) } },
      });
      return { expired: true };
    }

    const material = await tx.material.create({ data: materialData });
    await tx.storageReservation.delete({ where: { id: reservationId } });
    await tx.storageQuotaControl.update({
      where: { id: STORAGE_CONTROL_ID },
      data: { reservedBytes: { decrement: toBigInt(reservation.sizeBytes) } },
    });
    return { expired: false, material };
  });

  if (result.expired) {
    throw new StorageQuotaError("RESERVATION_EXPIRED");
  }

  return result.material;
}

/** Remove expired reservations and their counter value under the quota lock. */
export async function expireStorageReservations(db, now = new Date()) {
  return db.$transaction(async (tx) => {
    await lockStorageControl(tx);
    const expired = await tx.storageReservation.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true, sizeBytes: true },
    });
    if (expired.length === 0) {
      return 0;
    }

    const expiredBytes = expired.reduce(
      (sum, reservation) => sum + toBigInt(reservation.sizeBytes),
      0n,
    );
    await tx.storageReservation.deleteMany({
      where: { id: { in: expired.map((reservation) => reservation.id) } },
    });
    await tx.storageQuotaControl.update({
      where: { id: STORAGE_CONTROL_ID },
      data: { reservedBytes: { decrement: expiredBytes } },
    });
    return expired.length;
  });
}

/**
 * Change one Lab's allocation without allowing a quota below registered or
 * currently reserved file sizes.
 * @param {any} db
 * @param {{labId: string, limitBytes: bigint, now?: Date}} input
 */
export async function updateLabStorageLimit(
  db,
  { labId, limitBytes, now = new Date() },
) {
  const requested = toBigInt(limitBytes);
  if (requested < 0n || requested > ALLOCATABLE_STORAGE_LIMIT_BYTES) {
    throw new StorageQuotaError("INVALID_QUOTA");
  }

  return db.$transaction(async (tx) => {
    const control = await lockStorageControl(tx);
    const lab = await tx.lab.findUnique({
      where: { id: labId },
      select: { id: true, storageLimitBytes: true },
    });
    if (!lab) {
      throw new StorageQuotaError("LAB_NOT_FOUND");
    }

    const [materialUsage, reservations] = await Promise.all([
      tx.material.aggregate({ where: { labId }, _sum: { sizeBytes: true } }),
      tx.storageReservation.aggregate({
        where: { labId, expiresAt: { gt: now } },
        _sum: { sizeBytes: true },
      }),
    ]);
    const inUse =
      sumToBigInt(materialUsage._sum.sizeBytes) +
      sumToBigInt(reservations._sum.sizeBytes);
    if (requested < inUse) {
      throw new StorageQuotaError("QUOTA_BELOW_USAGE");
    }

    const currentAllocation = toBigInt(lab.storageLimitBytes);
    const newAllocation =
      toBigInt(control.allocatedBytes) - currentAllocation + requested;
    if (
      newAllocation > ALLOCATABLE_STORAGE_LIMIT_BYTES &&
      newAllocation > toBigInt(control.allocatedBytes)
    ) {
      throw new StorageQuotaError("STORAGE_CAPACITY_UNAVAILABLE");
    }

    const updated = await tx.lab.update({
      where: { id: labId },
      data: { storageLimitBytes: requested },
      select: { id: true, storageLimitBytes: true },
    });
    await tx.storageQuotaControl.update({
      where: { id: STORAGE_CONTROL_ID },
      data: { allocatedBytes: newAllocation },
    });
    return updated;
  });
}

/**
 * Read a Lab's recorded and in-flight usage for the member-facing warning.
 * @param {any} db
 * @param {string} labId
 * @param {Date} [now]
 */
export async function getLabStorageUsage(db, labId, now = new Date()) {
  const [lab, materials, reservations, globalMaterials, globalReservations] =
    await Promise.all([
      db.lab.findUnique({
        where: { id: labId },
        select: { id: true, storageLimitBytes: true },
      }),
      db.material.aggregate({ where: { labId }, _sum: { sizeBytes: true } }),
      db.storageReservation.aggregate({
        where: { labId, expiresAt: { gt: now } },
        _sum: { sizeBytes: true },
      }),
      db.material.aggregate({ _sum: { sizeBytes: true } }),
      db.storageReservation.aggregate({
        where: { expiresAt: { gt: now } },
        _sum: { sizeBytes: true },
      }),
    ]);
  if (!lab) {
    throw new StorageQuotaError("LAB_NOT_FOUND");
  }

  const materialBytes = sumToBigInt(materials._sum.sizeBytes);
  const reservedBytes = sumToBigInt(reservations._sum.sizeBytes);
  const totalMaterialBytes = sumToBigInt(globalMaterials._sum.sizeBytes);
  const totalReservedBytes = sumToBigInt(globalReservations._sum.sizeBytes);
  const usedBytes = materialBytes + reservedBytes;
  const globalUsedBytes = totalMaterialBytes + totalReservedBytes;
  return {
    labId,
    materialBytes,
    reservedBytes,
    usedBytes,
    limitBytes: toBigInt(lab.storageLimitBytes),
    state: getStorageUsageState(usedBytes, lab.storageLimitBytes),
    globalUsedBytes,
    globalState: getStorageUsageState(
      globalUsedBytes,
      GLOBAL_STORAGE_LIMIT_BYTES,
    ),
  };
}

/**
 * Return minimal admin DTOs and aggregate usage. No user or file metadata is
 * included in the result.
 * @param {any} db
 * @param {Date} [now]
 * @returns {Promise<StorageOverview>}
 */
export async function getStorageOverview(db, now = new Date()) {
  const [control, labs, materialGroups, reservationGroups] = await Promise.all([
    db.storageQuotaControl.findUnique({ where: { id: STORAGE_CONTROL_ID } }),
    db.lab.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, createdAt: true, storageLimitBytes: true },
    }),
    db.material.groupBy({
      by: ["labId"],
      _sum: { sizeBytes: true },
    }),
    db.storageReservation.groupBy({
      by: ["labId"],
      where: { expiresAt: { gt: now } },
      _sum: { sizeBytes: true },
    }),
  ]);
  if (!control) {
    throw new StorageQuotaError("STORAGE_QUOTA_CONFIGURATION_FAILED");
  }

  const materialsByLab = new Map(
    materialGroups.map((group) => [group.labId, sumToBigInt(group._sum.sizeBytes)]),
  );
  const reservationsByLab = new Map(
    reservationGroups.map((group) => [group.labId, sumToBigInt(group._sum.sizeBytes)]),
  );
  const labRows = labs.map((lab) => {
    const materialBytes = materialsByLab.get(lab.id) ?? 0n;
    const reservedBytes = reservationsByLab.get(lab.id) ?? 0n;
    const limitBytes = toBigInt(lab.storageLimitBytes);
    const usedBytes = materialBytes + reservedBytes;
    return {
      id: lab.id,
      name: lab.name,
      createdAt: lab.createdAt,
      materialBytes,
      reservedBytes,
      usedBytes,
      limitBytes,
      state: getStorageUsageState(usedBytes, limitBytes),
    };
  });
  const totalUsedBytes = labRows.reduce((sum, lab) => sum + lab.materialBytes, 0n);
  const totalReservedBytes = labRows.reduce((sum, lab) => sum + lab.reservedBytes, 0n);
  const allocatedBytes = toBigInt(control.allocatedBytes);
  const labCount = Number(control.labCount);

  return {
    labs: labRows,
    labCount,
    allocatedBytes,
    totalUsedBytes,
    totalReservedBytes,
    effectiveUsedBytes: totalUsedBytes + totalReservedBytes,
    globalLimitBytes: GLOBAL_STORAGE_LIMIT_BYTES,
    allocationLimitBytes: ALLOCATABLE_STORAGE_LIMIT_BYTES,
    globalState: getStorageUsageState(
      totalUsedBytes + totalReservedBytes,
      GLOBAL_STORAGE_LIMIT_BYTES,
    ),
    overAllocated: allocatedBytes > ALLOCATABLE_STORAGE_LIMIT_BYTES,
    overLabLimit: labCount > MAX_LAB_COUNT,
  };
}

/** @param {any} db */
export async function getLabCreationCapacity(db) {
  const control = await db.storageQuotaControl.findUnique({
    where: { id: STORAGE_CONTROL_ID },
  });
  if (!control) {
    throw new StorageQuotaError("STORAGE_QUOTA_CONFIGURATION_FAILED");
  }

  const labCount = Number(control.labCount);
  const allocatedBytes = toBigInt(control.allocatedBytes);
  return {
    labCount,
    allocatedBytes,
    canCreate:
      labCount < MAX_LAB_COUNT &&
      allocatedBytes + DEFAULT_LAB_STORAGE_LIMIT_BYTES <=
        ALLOCATABLE_STORAGE_LIMIT_BYTES,
    maxLabCount: MAX_LAB_COUNT,
  };
}

/** @param {any} tx */
async function lockStorageControl(tx) {
  const locked = await tx.storageQuotaControl.updateMany({
    where: { id: STORAGE_CONTROL_ID },
    data: { reservedBytes: { increment: 0n } },
  });
  if (locked.count !== 1) {
    throw new StorageQuotaError("STORAGE_QUOTA_CONFIGURATION_FAILED");
  }
  const control = await tx.storageQuotaControl.findUnique({
    where: { id: STORAGE_CONTROL_ID },
  });
  if (!control) {
    throw new StorageQuotaError("STORAGE_QUOTA_CONFIGURATION_FAILED");
  }
  return control;
}

/** @param {unknown} value */
function sumToBigInt(value) {
  return value === null || value === undefined ? 0n : toBigInt(value);
}

/** @param {number | bigint} value */
function toBigInt(value) {
  return typeof value === "bigint" ? value : BigInt(value);
}
