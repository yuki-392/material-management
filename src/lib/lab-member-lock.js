/**
 * 所属を前提とするタスクの書き込み前に所属行をロックする。
 * ロックは呼び出し元のトランザクション終了まで保持する。
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
