/**
 * @typedef {"ASSIGNEE_NOT_MEMBER" | "TASK_NOT_FOUND"} TaskOperationErrorCode
 * @typedef {{
 *   title: string,
 *   description: string | null,
 *   status: "TODO" | "IN_PROGRESS" | "DONE",
 *   assigneeId: string | null,
 *   dueAt: Date | null
 * }} TaskData
 * @typedef {Array<{
 *   id: string,
 *   title: string,
 *   description: string | null,
 *   status: "TODO" | "IN_PROGRESS" | "DONE",
 *   assigneeId: string | null,
 *   dueAt: Date | null,
 *   createdAt: Date,
 *   assignee: { id: string, name: string | null, email: string | null } | null
 * }>} TaskListItems
 * @typedef {{
 *   task: {
 *     deleteMany: (args: { where: { id: string, labId: string } }) => Promise<{ count: number }>
 *   },
 *   $transaction: <T>(callback: (tx: TaskTransaction) => Promise<T>) => Promise<T>
 * }} TaskDatabase
 * @typedef {{
 *   labMember: {
 *     findUnique: (args: {
 *       where: { labId_userId: { labId: string, userId: string } },
 *       select: { userId: true }
 *     }) => Promise<{ userId: string } | null>
 *   },
 *   task: {
 *     create: (args: { data: TaskData & { labId: string }, select: { id: true } }) => Promise<{ id: string }>,
 *     findFirst: (args: {
 *       where: { id: string, labId: string },
 *       select: { id: true }
 *     }) => Promise<{ id: string } | null>,
 *     updateMany: (args: {
 *       where: { id: string, labId: string },
 *       data: TaskData
 *     }) => Promise<{ count: number }>
 *   }
 * }} TaskTransaction
 */

const errorMessages = {
  ASSIGNEE_NOT_MEMBER: "The selected assignee is not a member of this Lab.",
  TASK_NOT_FOUND: "Task not found in this Lab.",
};

export class TaskOperationError extends Error {
  /** @param {TaskOperationErrorCode} code */
  constructor(code) {
    super(errorMessages[code]);
    this.name = "TaskOperationError";
    this.code = code;
  }
}

/**
 * Read Task rows inside one Lab. Call only after the viewer's membership has
 * been checked by `requireLabMember`.
 *
 * @param {import("../generated/prisma/client").PrismaClient} db
 * @param {string} labId
 */
export function listTasksForLab(db, labId) {
  return db.task.findMany({
    where: { labId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      assigneeId: true,
      dueAt: true,
      createdAt: true,
      assignee: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}

/**
 * @param {TaskDatabase} db
 * @param {string} labId
 * @param {TaskData} data
 */
export function createTask(db, labId, data) {
  return db.$transaction(async (tx) => {
    await requireAssigneeMembership(tx, labId, data.assigneeId);

    return tx.task.create({
      data: { ...data, labId },
      select: { id: true },
    });
  });
}

/**
 * Update uses both the Task id and Lab id in its reads and write, so a caller
 * cannot edit a Task from another Lab by substituting its id.
 *
 * @param {TaskDatabase} db
 * @param {string} labId
 * @param {string} taskId
 * @param {TaskData} data
 */
export function updateTask(db, labId, taskId, data) {
  return db.$transaction(async (tx) => {
    const existingTask = await tx.task.findFirst({
      where: { id: taskId, labId },
      select: { id: true },
    });

    if (!existingTask) {
      throw new TaskOperationError("TASK_NOT_FOUND");
    }

    await requireAssigneeMembership(tx, labId, data.assigneeId);

    const result = await tx.task.updateMany({
      where: { id: taskId, labId },
      data,
    });

    if (result.count === 0) {
      throw new TaskOperationError("TASK_NOT_FOUND");
    }

    return { id: taskId };
  });
}

/**
 * @param {TaskDatabase} db
 * @param {string} labId
 * @param {string} taskId
 */
export async function deleteTask(db, labId, taskId) {
  const result = await db.task.deleteMany({
    where: { id: taskId, labId },
  });

  if (result.count === 0) {
    throw new TaskOperationError("TASK_NOT_FOUND");
  }

  return { id: taskId };
}

/** @param {TaskTransaction} tx @param {string} labId @param {string | null} assigneeId */
async function requireAssigneeMembership(tx, labId, assigneeId) {
  if (assigneeId === null) {
    return;
  }

  const membership = await tx.labMember.findUnique({
    where: { labId_userId: { labId, userId: assigneeId } },
    select: { userId: true },
  });

  if (!membership) {
    throw new TaskOperationError("ASSIGNEE_NOT_MEMBER");
  }
}
