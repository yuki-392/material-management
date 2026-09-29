/**
 * @typedef {{
 *   labMember: {
 *     findUnique: (args: { where: { userId: string }, select: { labId: true } }) => Promise<{ labId: string } | null>,
 *     create: (args: { data: { labId: string, userId: string } }) => Promise<unknown>
 *   },
 *   lab: {
 *     create: (args: { data: { name: string, ownerId: string }, select: { id: true } }) => Promise<{ id: string }>
 *   }
 * }} LabCreationTransaction
 * @typedef {{ $transaction: <T>(callback: (tx: LabCreationTransaction) => Promise<T>) => Promise<T> }} LabCreationDatabase
 * @typedef {"ALREADY_MEMBER"} LabCreationErrorCode
 */

export class LabCreationError extends Error {
  /** @param {LabCreationErrorCode} code */
  constructor(code) {
    super("The current user already belongs to a Lab.");
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

      const lab = await tx.lab.create({
        data: { name, ownerId },
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
