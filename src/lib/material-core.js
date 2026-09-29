import { randomUUID } from "node:crypto";

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
  /** @param {"NOT_FOUND" | "STORAGE_DELETE_FAILED" | "STORAGE_OBJECT_MISSING"} code */
  constructor(code) {
    super(code);
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
 */
export async function createMaterial(db, storage, input) {
  const storageKey = `labs/${input.labId}/materials/${randomUUID()}`;

  await storage.putObject({
    key: storageKey,
    body: input.body,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });

  try {
    return await db.material.create({
      data: {
        labId: input.labId,
        title: input.title,
        description: input.description,
        originalFileName: input.originalFileName,
        storageKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        uploaderId: input.userId,
      },
    });
  } catch (error) {
    try {
      await storage.deleteObject(storageKey);
    } catch {
      console.error(
        "Material upload compensation failed after a metadata insert error.",
      );
    }

    throw error;
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
