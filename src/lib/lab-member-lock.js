/**
 * Take the membership lock before writing any tasks that depend on it.
 * The lock stays held until the caller's transaction ends.
 * @param {Pick<import("../generated/prisma/client").Prisma.TransactionClient, "$queryRaw">} tx
 * @param {string} labId
 * @param {string} userId
 */
export async function lockLabMembership(tx, labId, userId) {
  const rows = /** @type {{ userId: string }[]} */ (await tx.$queryRaw`
    SELECT "userId" FROM "LabMember"
    WHERE "labId" = ${labId} AND "userId" = ${userId}
    FOR UPDATE
  `);
  return rows.length > 0;
}
