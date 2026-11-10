import { LIST_PAGE_SIZE } from "./list-query.js";

/**
 * @typedef {"ASSIGNEE_NOT_MEMBER" | "INVALID_STATUS" | "TASK_NOT_FOUND"} TaskOperationErrorCode
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
  INVALID_STATUS: "The requested Task status is invalid.",
  TASK_NOT_FOUND: "Task not found in this Lab.",
};

const taskStatuses = new Set(["TODO", "IN_PROGRESS", "DONE"]);

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
 * @param {{labId: string, query?: string, status?: "TODO" | "IN_PROGRESS" | "DONE", assigneeId?: string | null, page?: number, sort?: "recent" | "due", overdueBefore?: Date}} input
 */
export async function listTasksForLab(db, input) {
  const where = { labId: input.labId };
  if (input.status) {
    where.status = input.status;
  }
  if (input.overdueBefore) {
    where.AND = [
      { status: { not: "DONE" } },
      { dueAt: { lt: input.overdueBefore } },
    ];
  }
  if (input.assigneeId !== undefined) {
    where.assigneeId = input.assigneeId;
  }
  if (input.query) {
    where.OR = [
      { title: { contains: input.query, mode: "insensitive" } },
      { description: { contains: input.query, mode: "insensitive" } },
    ];
  }

  const totalCount = await db.task.count({ where });
  const pageCount = Math.max(1, Math.ceil(totalCount / LIST_PAGE_SIZE));
  const page = Math.max(1, Math.min(input.page ?? 1, pageCount));
  const items = await db.task.findMany({
    where,
    orderBy:
      input.sort === "due"
        ? [
            { dueAt: { sort: "asc", nulls: "last" } },
            { createdAt: "desc" },
            { id: "desc" },
          ]
        : [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * LIST_PAGE_SIZE,
    take: LIST_PAGE_SIZE,
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

  return { items, totalCount, page, pageCount };
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
 * Update only the status on a Task in the requested Lab.
 * @param {import("../generated/prisma/client").PrismaClient} db
 * @param {string} labId
 * @param {string} taskId
 * @param {unknown} status
 */
export async function updateTaskStatus(db, labId, taskId, status) {
  if (!taskStatuses.has(status)) {
    throw new TaskOperationError("INVALID_STATUS");
  }

  const result = await db.task.updateMany({
    where: { id: taskId, labId },
    data: { status },
  });

  if (result.count === 0) {
    throw new TaskOperationError("TASK_NOT_FOUND");
  }

  return { id: taskId, status };
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
