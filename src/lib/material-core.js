import { randomUUID } from "node:crypto";
import { logMaterialError } from "./material-error-logging.js";
import { LIST_PAGE_SIZE } from "./list-query.js";
import {
  StorageQuotaError,
  commitStorageUpload,
  commitStorageReplacement,
  releaseStorageUpload,
  reserveStorageUpload,
} from "./storage-quota-core.js";

/** @typedef {import("@/generated/prisma/client").PrismaClient} PrismaClient */

const inlineContentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const allowedContentTypes = new Set([
  ...inlineContentTypes,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const materialTypeContentTypes = {
  pdf: ["application/pdf"],
  word: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  powerpoint: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  excel: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  image: ["image/jpeg", "image/png"],
};

export class MaterialOperationError extends Error {
  /**
   * @param {"NOT_FOUND" | "CONFLICT" | "STORAGE_CONFIGURATION_FAILED" | "STORAGE_UPLOAD_FAILED" | "METADATA_CREATE_FAILED" | "STORAGE_DELETE_FAILED" | "STORAGE_OBJECT_MISSING" | "QUOTA_RESERVATION_FAILED"} code
   * @param {unknown} [cause]
   */
  constructor(code, cause) {
    super(code, { cause });
    this.name = "MaterialOperationError";
    this.code = code;
  }
}

/**
 * Read a filtered page of this Lab's Material rows, newest first.
 * @param {PrismaClient} db
 * @param {{labId: string, query?: string, type?: keyof typeof materialTypeContentTypes, uploaderId?: string, page?: number}} input
 */
export async function listLabMaterials(db, input) {
  const where = { labId: input.labId };
  if (input.type) {
    where.contentType = { in: materialTypeContentTypes[input.type] };
  }
  if (input.uploaderId) {
    where.uploaderId = input.uploaderId;
  }
  if (input.query) {
    where.OR = [
      { title: { contains: input.query, mode: "insensitive" } },
      { description: { contains: input.query, mode: "insensitive" } },
      { originalFileName: { contains: input.query, mode: "insensitive" } },
    ];
  }

  const totalCount = await db.material.count({ where });
  const pageCount = Math.max(1, Math.ceil(totalCount / LIST_PAGE_SIZE));
  const page = Math.max(1, Math.min(input.page ?? 1, pageCount));
  const items = await db.material.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * LIST_PAGE_SIZE,
    take: LIST_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      description: true,
      originalFileName: true,
      contentType: true,
      sizeBytes: true,
      createdAt: true,
      updatedAt: true,
      uploaderId: true,
      uploader: { select: { name: true, email: true } },
    },
  });

  return { items, totalCount, page, pageCount };
}

/**
 * Store the file before metadata. A failed DB insert triggers a best-effort
 * compensating delete because the database and S3 cannot share a transaction.
 * @param {PrismaClient} db
 * @param {{putObject: (input: {key: string, body: Uint8Array, contentType: string, sizeBytes: number}) => Promise<void>, deleteObject: (key: string) => Promise<void>}} storage
 * @param {{labId: string, userId: string, title: string, description: string | null, originalFileName: string, contentType: string, sizeBytes: number, body: Uint8Array}} input
 * @param {{reserve?: typeof reserveStorageUpload, commit?: typeof commitStorageUpload, release?: typeof releaseStorageUpload}} [quota]
 */
export async function createMaterial(db, storage, input, quota = {}) {
  const storageKey = `labs/${input.labId}/materials/${randomUUID()}`;
  const reserve = quota.reserve ?? reserveStorageUpload;
  const commit = quota.commit ?? commitStorageUpload;
  const release = quota.release ?? releaseStorageUpload;
  let reservationId;

  try {
    reservationId = await reserve(db, {
      labId: input.labId,
      sizeBytes: input.sizeBytes,
    });
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      throw error;
    }
    logMaterialError("material.upload.quota-reserve", error);
    throw new MaterialOperationError("QUOTA_RESERVATION_FAILED", error);
  }

  try {
    await storage.putObject({
      key: storageKey,
      body: input.body,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
  } catch (error) {
    const isConfigurationError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "MISSING_STORAGE_CONFIGURATION" ||
        error.code === "INVALID_STORAGE_ENDPOINT");
    logMaterialError(
      isConfigurationError
        ? "material.upload.storage-config"
        : "material.upload.storage-put",
      error,
    );
    await releaseReservationSafely(release, db, reservationId);
    throw new MaterialOperationError(
      isConfigurationError
        ? "STORAGE_CONFIGURATION_FAILED"
        : "STORAGE_UPLOAD_FAILED",
      error,
    );
  }

  try {
    return await commit(db, reservationId, {
      labId: input.labId,
      title: input.title,
      description: input.description,
      originalFileName: input.originalFileName,
      storageKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploaderId: input.userId,
    });
  } catch (error) {
    logMaterialError("material.upload.metadata-create", error);

    try {
      await storage.deleteObject(storageKey);
    } catch (cleanupError) {
      logMaterialError("material.upload.compensation-delete", cleanupError);
    }

    await releaseReservationSafely(release, db, reservationId);

    throw new MaterialOperationError("METADATA_CREATE_FAILED", error);
  }
}

/** @param {typeof releaseStorageUpload} release @param {PrismaClient} db @param {string} reservationId @param {string} [stage] */
async function releaseReservationSafely(release, db, reservationId, stage = "material.upload.reservation-release") {
  try {
    await release(db, reservationId);
  } catch (error) {
    logMaterialError(stage, error);
  }
}

/**
 * Resolve a file by both its Material id and Lab id, then read only the object
 * key stored in that matching database row.
 * @param {PrismaClient} db
 * @param {{getObject: (key: string) => Promise<{body: ReadableStream<Uint8Array> | Uint8Array | null}>}} storage
 * @param {{labId: string, materialId: string}} input
 */
export async function getMaterialFile(db, storage, { labId, materialId }) {
  const material = await db.material.findFirst({
    where: { id: materialId, labId },
    select: {
      id: true,
      labId: true,
      originalFileName: true,
      storageKey: true,
      contentType: true,
      sizeBytes: true,
    },
  });

  if (!material) {
    throw new MaterialOperationError("NOT_FOUND");
  }

  const object = await storage.getObject(material.storageKey);
  if (!object?.body) {
    throw new MaterialOperationError("STORAGE_OBJECT_MISSING");
  }

  return { material, body: object.body };
}

/** @param {string} userId @param {string | null} uploaderId @param {string} ownerId */
export function canManageMaterial(userId, uploaderId, ownerId) {
  return userId === ownerId || userId === uploaderId;
}

/** @typedef {Pick<PrismaClient, "material">} MaterialReader */
/** @typedef {{labId: string, materialId: string, userId: string}} MaterialAccess */
/** @typedef {{originalFileName: string, contentType: string, sizeBytes: number, body: Uint8Array}} ReplacementFile */
/** @typedef {{putObject: (file: Omit<ReplacementFile, "originalFileName"> & {key: string}) => Promise<void>, deleteObject: (key: string) => Promise<void>}} MaterialWriter */

/** @param {MaterialReader} db @param {MaterialAccess} input */
async function requireManagedMaterial(db, { labId, materialId, userId }) {
  const material = await db.material.findFirst({
    where: { id: materialId, labId },
    select: {
      id: true,
      storageKey: true,
      sizeBytes: true,
      updatedAt: true,
      uploaderId: true,
      lab: { select: { ownerId: true } },
    },
  });
  if (!material || !canManageMaterial(userId, material.uploaderId, material.lab.ownerId)) {
    throw new MaterialOperationError("NOT_FOUND");
  }
  return material;
}

/**
 * @param {PrismaClient} db
 * @param {MaterialWriter} storage
 * @param {MaterialAccess & {updatedAt: Date, title: string, description: string | null, file: ReplacementFile | null}} input
 * @param {{reserve?: typeof reserveStorageUpload, commit?: typeof commitStorageReplacement, release?: typeof releaseStorageUpload}} quota
 */
export async function updateMaterial(db, storage, input, quota = {}) {
  const material = await requireManagedMaterial(db, input);
  if (material.updatedAt.getTime() !== input.updatedAt.getTime()) {
    throw new MaterialOperationError("CONFLICT");
  }

  const where = {
    id: input.materialId,
    labId: input.labId,
    storageKey: material.storageKey,
    updatedAt: material.updatedAt,
  };
  /** @type {import("@/generated/prisma/client").Prisma.MaterialUpdateManyMutationInput} */
  const metadata = {
    title: input.title,
    description: input.description,
    updatedAt: new Date(Math.max(Date.now(), material.updatedAt.getTime() + 1)),
  };

  if (!input.file) {
    await updateMaterialIfCurrent(db, where, metadata);
    return;
  }

  const { body, contentType, originalFileName, sizeBytes } = input.file;
  const growth = sizeBytes - material.sizeBytes;
  const reservationId = growth > 0
    ? await (quota.reserve ?? reserveStorageUpload)(db, { labId: input.labId, sizeBytes: growth })
    : null;
  const newKey = `labs/${input.labId}/materials/${randomUUID()}`;
  let storageSaved = false;

  try {
    await storage.putObject({ key: newKey, body, contentType, sizeBytes });
    storageSaved = true;
    /** @param {MaterialReader} tx */
    const update = (tx) => updateMaterialIfCurrent(tx, where, {
      ...metadata, storageKey: newKey, contentType, originalFileName, sizeBytes,
    });

    if (reservationId) {
      await (quota.commit ?? commitStorageReplacement)(db, reservationId, update);
    } else {
      await update(db);
    }
  } catch (error) {
    // A lost commit response can leave the new file live. Verify before cleanup.
    let committed = false;
    try {
      committed = storageSaved && Boolean(await db.material.findUnique({
        where: { storageKey: newKey },
        select: { id: true },
      }));
      if (!committed) await deleteReplacementObject(storage, newKey, "material.replace.compensation-delete");
    } catch (lookupError) {
      logMaterialError("material.replace.commit-check", lookupError);
    }
    if (reservationId) {
      await releaseReservationSafely(quota.release ?? releaseStorageUpload, db, reservationId, "material.replace.reservation-release");
    }
    if (!committed) throw error;
  }

  await deleteReplacementObject(storage, material.storageKey, "material.replace.old-delete");
}

/**
 * @param {MaterialReader} db
 * @param {import("@/generated/prisma/client").Prisma.MaterialWhereInput} where
 * @param {import("@/generated/prisma/client").Prisma.MaterialUpdateManyMutationInput} data
 */
async function updateMaterialIfCurrent(db, where, data) {
  if ((await db.material.updateMany({ where, data })).count !== 1) {
    throw new MaterialOperationError("CONFLICT");
  }
}

/** @param {Pick<MaterialWriter, "deleteObject">} storage @param {string} key @param {string} stage */
async function deleteReplacementObject(storage, key, stage) {
  try {
    await storage.deleteObject(key);
  } catch (error) {
    logMaterialError(stage, error);
  }
}

/**
 * Lock the material during removal so a replacement cannot switch its key
 * after deletion has read it but before the database row is removed.
 * @param {PrismaClient} db
 * @param {Pick<MaterialWriter, "deleteObject">} storage
 * @param {MaterialAccess} input
 */
export async function deleteMaterial(db, storage, input) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Material"
      WHERE "id" = ${input.materialId} AND "labId" = ${input.labId}
      FOR UPDATE
    `;
    const material = await requireManagedMaterial(tx, input);

    try {
      await storage.deleteObject(material.storageKey);
    } catch {
      throw new MaterialOperationError("STORAGE_DELETE_FAILED");
    }

    await tx.material.delete({ where: { id: material.id, labId: input.labId } });
  }, { timeout: 20_000 });
}

/**
 * @param {{originalFileName: string, contentType: string, sizeBytes: number}} material
 * @param {ReadableStream<Uint8Array> | Uint8Array} body
 */
export function createMaterialFileResponse(material, body) {
  const fileName = sanitizeDownloadFileName(material.originalFileName);
  const contentType = allowedContentTypes.has(material.contentType)
    ? material.contentType
    : "application/octet-stream";
  const disposition = inlineContentTypes.has(contentType)
    ? "inline"
    : "attachment";
  const asciiFallback = fileName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(material.sizeBytes),
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** @param {string} fileName */
function sanitizeDownloadFileName(fileName) {
  const leafName = fileName.split(/[\\/]/).at(-1) ?? "";
  const safeName = leafName.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return safeName || "download";
}
