import { randomUUID } from "node:crypto";
import { logMaterialError } from "./material-error-logging.js";
import {
  StorageQuotaError,
  commitStorageUpload,
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

export class MaterialOperationError extends Error {
  /**
   * @param {"NOT_FOUND" | "STORAGE_CONFIGURATION_FAILED" | "STORAGE_UPLOAD_FAILED" | "METADATA_CREATE_FAILED" | "STORAGE_DELETE_FAILED" | "STORAGE_OBJECT_MISSING" | "QUOTA_RESERVATION_FAILED"} code
   * @param {unknown} [cause]
   */
  constructor(code, cause) {
    super(code, { cause });
    this.name = "MaterialOperationError";
    this.code = code;
  }
}

/**
 * Read only this Lab's Material rows, newest first.
 * @param {PrismaClient} db
 * @param {{labId: string}} input
 */
export function listLabMaterials(db, { labId }) {
  return db.material.findMany({
    where: { labId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      originalFileName: true,
      contentType: true,
      sizeBytes: true,
      createdAt: true,
      uploader: { select: { name: true, email: true } },
    },
  });
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

/** @param {typeof releaseStorageUpload} release @param {PrismaClient} db @param {string} reservationId */
async function releaseReservationSafely(release, db, reservationId) {
  try {
    await release(db, reservationId);
  } catch (error) {
    logMaterialError("material.upload.reservation-release", error);
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

/**
 * Delete the external object before removing its metadata. A failed object
 * deletion leaves the database row available for a later retry.
 * @param {PrismaClient} db
 * @param {{deleteObject: (key: string) => Promise<void>}} storage
 * @param {{labId: string, materialId: string}} input
 */
export async function deleteMaterial(db, storage, { labId, materialId }) {
  const material = await db.material.findFirst({
    where: { id: materialId, labId },
    select: { id: true, storageKey: true },
  });

  if (!material) {
    throw new MaterialOperationError("NOT_FOUND");
  }

  try {
    await storage.deleteObject(material.storageKey);
  } catch {
    throw new MaterialOperationError("STORAGE_DELETE_FAILED");
  }

  const deleted = await db.material.deleteMany({
    where: { id: material.id, labId },
  });

  if (deleted.count !== 1) {
    throw new MaterialOperationError("NOT_FOUND");
  }
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
