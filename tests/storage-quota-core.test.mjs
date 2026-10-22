import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOCATABLE_STORAGE_LIMIT_BYTES,
  DEFAULT_LAB_STORAGE_LIMIT_BYTES,
  GLOBAL_STORAGE_LIMIT_BYTES,
  MAX_LAB_COUNT,
  STORAGE_WARNING_PERCENT,
  STORAGE_RESERVATION_TTL_MS,
  getStorageUsageState,
  parseStorageLimitGb,
  parseAppAdminEmails,
  isAppAdminEmail,
  reserveStorageUpload,
  releaseStorageUpload,
  commitStorageUpload,
  getStorageOverview,
  updateLabStorageLimit,
} from "../src/lib/storage-quota-core.js";

test("defines decimal GB limits with an 8GB allocation pool and 1GB reserve", () => {
  assert.equal(GLOBAL_STORAGE_LIMIT_BYTES, 9_000_000_000n);
  assert.equal(ALLOCATABLE_STORAGE_LIMIT_BYTES, 8_000_000_000n);
  assert.equal(DEFAULT_LAB_STORAGE_LIMIT_BYTES, 1_000_000_000n);
  assert.equal(MAX_LAB_COUNT, 8);
  assert.equal(STORAGE_WARNING_PERCENT, 80);
});

test("warns at 80 percent and blocks at the Lab storage limit", () => {
  assert.deepEqual(getStorageUsageState(799_999_999n, 1_000_000_000n), {
    usedBytes: 799_999_999n,
    limitBytes: 1_000_000_000n,
    percentUsed: 79,
    warning: false,
    full: false,
  });
  assert.deepEqual(getStorageUsageState(800_000_000n, 1_000_000_000n), {
    usedBytes: 800_000_000n,
    limitBytes: 1_000_000_000n,
    percentUsed: 80,
    warning: true,
    full: false,
  });
  assert.equal(getStorageUsageState(1_000_000_000n, 1_000_000_000n).full, true);
  assert.equal(getStorageUsageState(1n, 0n).full, true);
  assert.equal(getStorageUsageState(0n, 0n).warning, false);
});

test("parses decimal GB quota input exactly down to one byte", () => {
  assert.equal(parseStorageLimitGb("1"), 1_000_000_000n);
  assert.equal(parseStorageLimitGb("0.25"), 250_000_000n);
  assert.equal(parseStorageLimitGb("0.001"), 1_000_000n);
  assert.equal(parseStorageLimitGb("0"), 0n);
  assert.equal(parseStorageLimitGb("1.000000001"), 1_000_000_001n);
  for (const value of ["", "-1", "8.000000001", "1e2", "NaN"]) {
    assert.equal(parseStorageLimitGb(value), null, `expected ${value} to be rejected`);
  }
  assert.equal(parseStorageLimitGb("0.0000000001"), null);
});

test("normalizes the server-side app admin email allowlist", () => {
  assert.deepEqual(
    parseAppAdminEmails(" Admin@Example.com, second@example.com ,,"),
    ["admin@example.com", "second@example.com"],
  );
  assert.deepEqual(parseAppAdminEmails(undefined), []);
  assert.equal(isAppAdminEmail("ADMIN@example.com", "admin@example.com"), true);
  assert.equal(isAppAdminEmail("other@example.com", "admin@example.com"), false);
  assert.equal(isAppAdminEmail(null, "admin@example.com"), false);
});

test("reports legacy Lab count, allocation overages, and usage warnings", async () => {
  const now = new Date("2026-10-22T00:00:00.000Z");
  const db = {
    storageQuotaControl: {
      findUnique: async () => ({
        id: "global",
        labCount: 9,
        allocatedBytes: 9_000_000_000n,
        reservedBytes: 0n,
      }),
    },
    lab: {
      findMany: async () => [
        {
          id: "legacy-lab",
          name: "Legacy lab",
          createdAt: now,
          storageLimitBytes: 1_000_000_000n,
        },
      ],
    },
    material: {
      groupBy: async () => [
        { labId: "legacy-lab", _sum: { sizeBytes: 800_000_000 } },
      ],
    },
    storageReservation: {
      groupBy: async () => [],
    },
  };

  const overview = await getStorageOverview(db, now);

  assert.equal(overview.overAllocated, true);
  assert.equal(overview.overLabLimit, true);
  assert.equal(overview.labs[0].state.warning, true);
  assert.equal(overview.labs[0].usedBytes, 800_000_000n);
});

function quotaDatabase({
  labLimitBytes = 1_000_000_000n,
  materialBytes = 0,
  labMaterialBytes = materialBytes,
  control = {
    id: "global",
    labCount: 1,
    allocatedBytes: 1_000_000_000n,
    reservedBytes: 0n,
  },
  reservations = [],
} = {}) {
  const state = {
    control: { ...control },
    labs: [{ id: "lab-1", name: "Lab one", storageLimitBytes: labLimitBytes }],
    materials: materialBytes
      ? [{ id: "existing-material", labId: "lab-1", sizeBytes: materialBytes }]
      : [],
    labMaterialBytes,
    reservations: reservations.map((reservation) => ({ ...reservation })),
  };
  let nextReservationId = 1;
  let transactionQueue = Promise.resolve();

  const delegates = {
    storageQuotaControl: {
      async updateMany({ where, data }) {
        if (where.id !== state.control.id) return { count: 0 };
        if (where.labCount?.lt !== undefined && state.control.labCount >= where.labCount.lt) {
          return { count: 0 };
        }
        if (
          where.allocatedBytes?.lte !== undefined &&
          state.control.allocatedBytes > where.allocatedBytes.lte
        ) {
          return { count: 0 };
        }
        applyUpdate(state.control, data);
        return { count: 1 };
      },
      async findUnique() {
        return { ...state.control };
      },
      async update({ data }) {
        applyUpdate(state.control, data);
        return { ...state.control };
      },
    },
    lab: {
      async findUnique({ where }) {
        return state.labs.find((lab) => lab.id === where.id) ?? null;
      },
      async update({ where, data }) {
        const lab = state.labs.find((row) => row.id === where.id);
        if (!lab) throw new Error("Lab missing");
        Object.assign(lab, data);
        return { id: lab.id, storageLimitBytes: lab.storageLimitBytes };
      },
    },
    material: {
      async aggregate({ where } = {}) {
        const total = state.materials
          .filter((row) => !where?.labId || row.labId === where.labId)
          .reduce((sum, row) => sum + row.sizeBytes, 0);
        if (where?.labId === "lab-1" && state.labMaterialBytes !== undefined) {
          return { _sum: { sizeBytes: state.labMaterialBytes } };
        }
        return { _sum: { sizeBytes: total } };
      },
      async create({ data }) {
        const material = { id: `material-${state.materials.length + 1}`, ...data };
        state.materials.push(material);
        state.labMaterialBytes += data.sizeBytes;
        return material;
      },
    },
    storageReservation: {
      async findMany({ where }) {
        return state.reservations
          .filter((row) => row.expiresAt <= where.expiresAt.lte)
          .map(({ id, sizeBytes }) => ({ id, sizeBytes }));
      },
      async aggregate({ where }) {
        const total = state.reservations
          .filter(
            (row) =>
              row.labId === where.labId &&
              row.expiresAt > where.expiresAt.gt,
          )
          .reduce((sum, row) => sum + row.sizeBytes, 0n);
        return { _sum: { sizeBytes: total } };
      },
      async create({ data }) {
        const reservation = { id: `reservation-${nextReservationId++}`, ...data };
        state.reservations.push(reservation);
        return reservation;
      },
      async findUnique({ where }) {
        return state.reservations.find((row) => row.id === where.id) ?? null;
      },
      async delete({ where }) {
        const index = state.reservations.findIndex((row) => row.id === where.id);
        if (index < 0) throw new Error("reservation missing");
        return state.reservations.splice(index, 1)[0];
      },
      async deleteMany({ where }) {
        const ids = new Set(where.id.in ?? [where.id]);
        const before = state.reservations.length;
        state.reservations = state.reservations.filter((row) => !ids.has(row.id));
        return { count: before - state.reservations.length };
      },
    },
  };
  const db = {
    ...delegates,
    async $transaction(callback) {
      const run = transactionQueue.then(async () => {
        const snapshot = structuredClone(state);
        try {
          return await callback(delegates);
        } catch (error) {
          Object.assign(state, snapshot);
          throw error;
        }
      });
      transactionQueue = run.catch(() => {});
      return run;
    },
  };

  return { db, state };
}

function applyUpdate(target, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) {
      target[key] += value.increment;
    } else if (value && typeof value === "object" && "decrement" in value) {
      target[key] -= value.decrement;
    } else {
      target[key] = value;
    }
  }
}

test("reserves upload capacity and rejects a concurrent upload past the global cap", async () => {
  const { db, state } = quotaDatabase({
    labLimitBytes: GLOBAL_STORAGE_LIMIT_BYTES,
    materialBytes: Number(GLOBAL_STORAGE_LIMIT_BYTES - 4_000_000n),
  });
  const now = new Date("2026-10-22T00:00:00.000Z");

  const results = await Promise.allSettled([
    reserveStorageUpload(db, { labId: "lab-1", sizeBytes: 4_000_000, now }),
    reserveStorageUpload(db, { labId: "lab-1", sizeBytes: 4_000_000, now }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    results.find((result) => result.status === "rejected").reason.code,
    "GLOBAL_QUOTA_EXCEEDED",
  );
  assert.equal(state.reservations.length, 1);
  assert.equal(state.control.reservedBytes, 4_000_000n);
});

test("rejects a reservation that exceeds the individual Lab quota", async () => {
  const { db, state } = quotaDatabase({
    labLimitBytes: 1_000_000_000n,
    materialBytes: 999_000_000,
  });

  await assert.rejects(
    reserveStorageUpload(db, {
      labId: "lab-1",
      sizeBytes: 2_000_000,
      now: new Date("2026-10-22T00:00:00.000Z"),
    }),
    (error) => error.code === "LAB_QUOTA_EXCEEDED",
  );
  assert.equal(state.reservations.length, 0);
  assert.equal(state.control.reservedBytes, 0n);
});

test("serializes concurrent uploads against one Lab's allocation", async () => {
  const { db, state } = quotaDatabase({
    labLimitBytes: 1_000_000_000n,
    materialBytes: 996_000_000,
  });

  const results = await Promise.allSettled([
    reserveStorageUpload(db, { labId: "lab-1", sizeBytes: 4_000_000 }),
    reserveStorageUpload(db, { labId: "lab-1", sizeBytes: 4_000_000 }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    results.find((result) => result.status === "rejected").reason.code,
    "LAB_QUOTA_EXCEEDED",
  );
  assert.equal(state.reservations.length, 1);
});

test("releases expired reservations before calculating available storage", async () => {
  const expiredAt = new Date("2026-10-22T00:00:00.000Z");
  const now = new Date("2026-10-22T00:15:01.000Z");
  const { db, state } = quotaDatabase({
    reservations: [
      { id: "expired", labId: "lab-1", sizeBytes: 500_000_000n, expiresAt: expiredAt },
    ],
    control: {
      id: "global",
      labCount: 1,
      allocatedBytes: 1_000_000_000n,
      reservedBytes: 500_000_000n,
    },
  });

  await reserveStorageUpload(db, { labId: "lab-1", sizeBytes: 10, now });

  assert.equal(state.reservations.length, 1);
  assert.notEqual(state.reservations[0].id, "expired");
  assert.equal(state.control.reservedBytes, 10n);
});

test("releases a failed upload reservation exactly once", async () => {
  const { db, state } = quotaDatabase();
  const reservationId = await reserveStorageUpload(db, {
    labId: "lab-1",
    sizeBytes: 123,
    now: new Date("2026-10-22T00:00:00.000Z"),
  });

  assert.equal(await releaseStorageUpload(db, reservationId), true);
  assert.equal(await releaseStorageUpload(db, reservationId), false);
  assert.equal(state.control.reservedBytes, 0n);
  assert.equal(state.reservations.length, 0);
});

test("converts a reservation into material usage in the same transaction", async () => {
  const { db, state } = quotaDatabase();
  const now = new Date("2026-10-22T00:00:00.000Z");
  const reservationId = await reserveStorageUpload(db, {
    labId: "lab-1",
    sizeBytes: 321,
    now,
  });
  const material = await commitStorageUpload(db, reservationId, {
    labId: "lab-1",
    title: "Notes",
    sizeBytes: 321,
  }, new Date(now.getTime() + STORAGE_RESERVATION_TTL_MS - 1));

  assert.equal(material.sizeBytes, 321);
  assert.equal(state.control.reservedBytes, 0n);
  assert.equal(state.reservations.length, 0);
  assert.equal(state.materials.length, 1);
});

test("rejects an expired upload and releases its capacity reservation", async () => {
  const { db, state } = quotaDatabase();
  const now = new Date("2026-10-22T00:00:00.000Z");
  const reservationId = await reserveStorageUpload(db, {
    labId: "lab-1",
    sizeBytes: 321,
    now,
  });

  await assert.rejects(
    commitStorageUpload(
      db,
      reservationId,
      { labId: "lab-1", title: "Expired", sizeBytes: 321 },
      new Date(now.getTime() + STORAGE_RESERVATION_TTL_MS),
    ),
    (error) => error.code === "RESERVATION_EXPIRED",
  );
  assert.equal(state.control.reservedBytes, 0n);
  assert.equal(state.reservations.length, 0);
  assert.equal(state.materials.length, 0);
});

test("rejects a Lab quota change below its stored usage", async () => {
  const { db, state } = quotaDatabase({ materialBytes: 500_000_000 });

  await assert.rejects(
    updateLabStorageLimit(db, {
      labId: "lab-1",
      limitBytes: 499_000_000n,
    }),
    (error) => error.code === "QUOTA_BELOW_USAGE",
  );
  assert.equal(state.labs[0].storageLimitBytes, 1_000_000_000n);
  assert.equal(state.control.allocatedBytes, 1_000_000_000n);
});

test("allows a Lab allocation to be reduced when usage still fits", async () => {
  const { db, state } = quotaDatabase({ materialBytes: 300_000_000 });

  const updated = await updateLabStorageLimit(db, {
    labId: "lab-1",
    limitBytes: 500_000_000n,
  });

  assert.equal(updated.storageLimitBytes, 500_000_000n);
  assert.equal(state.control.allocatedBytes, 500_000_000n);
});

test("rejects an increase that would exceed the eight-GB allocation pool", async () => {
  const { db, state } = quotaDatabase({
    control: {
      id: "global",
      labCount: 8,
      allocatedBytes: 8_000_000_000n,
      reservedBytes: 0n,
    },
  });

  await assert.rejects(
    updateLabStorageLimit(db, {
      labId: "lab-1",
      limitBytes: 1_000_000_001n,
    }),
    (error) => error.code === "STORAGE_CAPACITY_UNAVAILABLE",
  );
  assert.equal(state.labs[0].storageLimitBytes, 1_000_000_000n);
  assert.equal(state.control.allocatedBytes, 8_000_000_000n);
});
