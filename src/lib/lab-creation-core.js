import {
  ALLOCATABLE_STORAGE_LIMIT_BYTES,
  DEFAULT_LAB_STORAGE_LIMIT_BYTES,
  MAX_LAB_COUNT,
  STORAGE_CONTROL_ID,
  StorageQuotaError,
} from "./storage-quota-core.js";

/**
 * @typedef {{
 *   labMember: {
 *     findUnique: (args: { where: { userId: string }, select: { labId: true } }) => Promise<{ labId: string } | null>,
 *     create: (args: { data: { labId: string, userId: string } }) => Promise<unknown>
 *   },
 *   lab: {
 *     create: (args: { data: { name: string, ownerId: string, storageLimitBytes: bigint }, select: { id: true } }) => Promise<{ id: string }>
 *   },
 *   storageQuotaControl: {
 *     updateMany: (args: any) => Promise<{ count: number }>,
 *     findUnique: (args: any) => Promise<{ labCount: number } | null>
 *   }
 * }} LabCreationTransaction
 * @typedef {{ $transaction: <T>(callback: (tx: LabCreationTransaction) => Promise<T>) => Promise<T> }} LabCreationDatabase
 * @typedef {"ALREADY_MEMBER" | "LAB_LIMIT_REACHED" | "STORAGE_CAPACITY_UNAVAILABLE" | "STORAGE_QUOTA_CONFIGURATION_FAILED"} LabCreationErrorCode
 */

export class LabCreationError extends Error {
  /** @param {LabCreationErrorCode} code */
  constructor(code) {
    super(code);
    this.name = "LabCreationError";
    this.code = code;
  }
}

/**
 * Create a Lab and its owner's membership as one atomic operation.
 *
 * @param {LabCreationDatabase} db
 * @param {string} ownerId
 * @param {string} name
 * @returns {Promise<{ id: string }>}
 */
export async function createLabWithOwner(db, ownerId, name) {
  try {
    return await db.$transaction(async (tx) => {
      const existingMembership = await tx.labMember.findUnique({
        where: { userId: ownerId },
        select: { labId: true },
      });

      if (existingMembership) {
        throw new LabCreationError("ALREADY_MEMBER");
      }

      const allocation = await tx.storageQuotaControl.updateMany({
        where: {
          id: STORAGE_CONTROL_ID,
          labCount: { lt: MAX_LAB_COUNT },
          allocatedBytes: {
            lte:
              ALLOCATABLE_STORAGE_LIMIT_BYTES -
              DEFAULT_LAB_STORAGE_LIMIT_BYTES,
          },
        },
        data: {
          labCount: { increment: 1 },
          allocatedBytes: { increment: DEFAULT_LAB_STORAGE_LIMIT_BYTES },
        },
      });

      if (allocation.count !== 1) {
        const control = await tx.storageQuotaControl.findUnique({
          where: { id: STORAGE_CONTROL_ID },
          select: { labCount: true },
        });
        if (!control) {
          throw new LabCreationError("STORAGE_QUOTA_CONFIGURATION_FAILED");
        }
        throw new LabCreationError(
          control.labCount >= MAX_LAB_COUNT
            ? "LAB_LIMIT_REACHED"
            : "STORAGE_CAPACITY_UNAVAILABLE",
        );
      }

      const lab = await tx.lab.create({
        data: {
          name,
          ownerId,
          storageLimitBytes: DEFAULT_LAB_STORAGE_LIMIT_BYTES,
        },
        select: { id: true },
      });

      await tx.labMember.create({
        data: { labId: lab.id, userId: ownerId },
      });

      return { id: lab.id };
    });
  } catch (error) {
    if (error instanceof LabCreationError) {
      throw error;
    }
    if (error instanceof StorageQuotaError) {
      throw new LabCreationError("STORAGE_QUOTA_CONFIGURATION_FAILED");
    }

    if (isUniqueConstraintViolation(error)) {
      throw new LabCreationError("ALREADY_MEMBER");
    }

    throw error;
  }
}

/** @param {unknown} error */
function isUniqueConstraintViolation(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
