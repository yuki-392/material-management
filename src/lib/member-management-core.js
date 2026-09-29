/**
 * @typedef {"USER_NOT_FOUND" | "CANNOT_ADD_SELF" | "ALREADY_MEMBER" | "ALREADY_ASSIGNED" | "CANNOT_REMOVE_OWNER" | "NOT_MEMBER"} MemberManagementErrorCode
 * @typedef {{
 *   user: {
 *     findFirst: (args: {
 *       where: { email: { equals: string, mode: "insensitive" } },
 *       select: { id: true }
 *     }) => Promise<{ id: string } | null>
 *   },
 *   $transaction: <T>(callback: (tx: MemberManagementTransaction) => Promise<T>) => Promise<T>
 * }} MemberManagementDatabase
 * @typedef {{
 *   labMember: {
 *     findUnique: (args: {
 *       where:
 *         | { labId_userId: { labId: string, userId: string } }
 *         | { userId: string },
 *       select: { userId?: true, labId?: true }
 *     }) => Promise<{ userId?: string, labId?: string } | null>,
 *     create: (args: { data: { labId: string, userId: string } }) => Promise<unknown>,
 *     delete: (args: { where: { labId_userId: { labId: string, userId: string } } }) => Promise<unknown>
 *   },
 *   task: {
 *     updateMany: (args: {
 *       where: { labId: string, assigneeId: string },
 *       data: { assigneeId: null }
 *     }) => Promise<{ count: number }>
 *   }
 * }} MemberManagementTransaction
 */

const errorMessages = {
  USER_NOT_FOUND: "No registered user was found for this email address.",
  CANNOT_ADD_SELF: "The Lab owner is already a member.",
  ALREADY_MEMBER: "The user is already a member of this Lab.",
  ALREADY_ASSIGNED: "The user already belongs to a Lab.",
  CANNOT_REMOVE_OWNER: "The Lab owner cannot be removed.",
  NOT_MEMBER: "The user is not a member of this Lab.",
};

export class MemberManagementError extends Error {
  /** @param {MemberManagementErrorCode} code */
  constructor(code) {
    super(errorMessages[code]);
    this.name = "MemberManagementError";
    this.code = code;
  }
}

/**
 * Look up an existing account by email and add it if it has no Lab membership.
 * The database unique constraint on LabMember.userId is the final race guard.
 *
 * @param {MemberManagementDatabase} db
 * @param {{ labId: string, ownerId: string, email: string }} input
 */
export async function addMemberByEmail(db, { labId, ownerId, email }) {
  const targetUser = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  if (!targetUser) {
    throw new MemberManagementError("USER_NOT_FOUND");
  }

  if (targetUser.id === ownerId) {
    throw new MemberManagementError("CANNOT_ADD_SELF");
  }

  try {
    return await db.$transaction(async (tx) => {
      const existingMembership = await tx.labMember.findUnique({
        where: { labId_userId: { labId, userId: targetUser.id } },
        select: { userId: true },
      });

      if (existingMembership) {
        throw new MemberManagementError("ALREADY_MEMBER");
      }

      const membershipElsewhere = await tx.labMember.findUnique({
        where: { userId: targetUser.id },
        select: { labId: true },
      });

      if (membershipElsewhere) {
        throw new MemberManagementError("ALREADY_ASSIGNED");
      }

      return tx.labMember.create({
        data: { labId, userId: targetUser.id },
      });
    });
  } catch (error) {
    if (error instanceof MemberManagementError) {
      throw error;
    }

    if (hasPrismaCode(error, "P2002")) {
      throw new MemberManagementError("ALREADY_ASSIGNED");
    }

    if (hasPrismaCode(error, "P2003")) {
      throw new MemberManagementError("USER_NOT_FOUND");
    }

    throw error;
  }
}

/**
 * Clear the removed member's assignments in this Lab and delete membership
 * atomically so either both operations commit or neither does.
 *
 * @param {MemberManagementDatabase} db
 * @param {{ labId: string, ownerId: string, userId: string }} input
 */
export async function removeMemberAndClearAssignments(
  db,
  { labId, ownerId, userId },
) {
  if (userId === ownerId) {
    throw new MemberManagementError("CANNOT_REMOVE_OWNER");
  }

  try {
    return await db.$transaction(async (tx) => {
      const membership = await tx.labMember.findUnique({
        where: { labId_userId: { labId, userId } },
        select: { userId: true },
      });

      if (!membership) {
        throw new MemberManagementError("NOT_MEMBER");
      }

      const clearedAssignments = await tx.task.updateMany({
        where: { labId, assigneeId: userId },
        data: { assigneeId: null },
      });

      await tx.labMember.delete({
        where: { labId_userId: { labId, userId } },
      });

      return { clearedAssignments: clearedAssignments.count };
    });
  } catch (error) {
    if (error instanceof MemberManagementError) {
      throw error;
    }

    if (hasPrismaCode(error, "P2025")) {
      throw new MemberManagementError("NOT_MEMBER");
    }

    throw error;
  }
}

/** @param {unknown} error @param {string} code */
function hasPrismaCode(error, code) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
