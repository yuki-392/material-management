import assert from "node:assert/strict";
import test from "node:test";

import {
  TaskOperationError,
  createTask,
  deleteTask,
  listTasksForLab,
  updateTaskStatus,
  updateTask,
} from "../src/lib/task-core.js";

function createFakeDatabase({ memberships = [], tasks = [] } = {}) {
  const state = {
    memberships: structuredClone(memberships),
    tasks: structuredClone(tasks),
  };
  const calls = [];

  function createTransactionDatabase(pendingTasks) {
    return {
      labMember: {
        async findUnique(args) {
          calls.push(["labMember.findUnique", args]);
          const { labId, userId } = args.where.labId_userId;
          return (
            state.memberships.find(
              (membership) =>
                membership.labId === labId && membership.userId === userId,
            ) ?? null
          );
        },
      },
      task: {
        async create(args) {
          calls.push(["task.create", args]);
          const task = {
            id: `task-${pendingTasks.length + 1}`,
            ...args.data,
          };
          pendingTasks.push(task);
          return { id: task.id };
        },
        async findFirst(args) {
          calls.push(["task.findFirst", args]);
          return (
            pendingTasks.find(
              (task) =>
                task.id === args.where.id && task.labId === args.where.labId,
            ) ?? null
          );
        },
        async updateMany(args) {
          calls.push(["task.updateMany", args]);
          const task = pendingTasks.find(
            (candidate) =>
              candidate.id === args.where.id &&
              candidate.labId === args.where.labId,
          );
          if (!task) return { count: 0 };
          Object.assign(task, args.data);
          return { count: 1 };
        },
      },
    };
  }

  const db = {
    task: {
      async findMany(args) {
        calls.push(["task.findMany", args]);
        return state.tasks.filter((task) => task.labId === args.where.labId);
      },
      async updateMany(args) {
        calls.push(["task.updateMany", args]);
        const task = state.tasks.find(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.labId === args.where.labId,
        );
        if (!task) return { count: 0 };
        Object.assign(task, args.data);
        return { count: 1 };
      },
      async deleteMany(args) {
        calls.push(["task.deleteMany", args]);
        const before = state.tasks.length;
        state.tasks = state.tasks.filter(
          (task) =>
            task.id !== args.where.id || task.labId !== args.where.labId,
        );
        return { count: before - state.tasks.length };
      },
    },
    async $transaction(callback) {
      calls.push(["transaction"]);
      const pendingTasks = structuredClone(state.tasks);
      const result = await callback(createTransactionDatabase(pendingTasks));
      state.tasks = pendingTasks;
      return result;
    },
  };

  return { db, state, calls };
}

const taskInput = {
  title: "Read paper",
  description: null,
  status: "TODO",
  assigneeId: null,
  dueAt: null,
};

function expectTaskError(code) {
  return (error) => error instanceof TaskOperationError && error.code === code;
}

test("searches, filters, and paginates tasks within the authorized Lab", async () => {
  const calls = [];
  const expectedTasks = [{ id: "task-21", labId: "lab-1", title: "Own task" }];
  const db = {
    task: {
      async count(args) {
        calls.push(["task.count", args]);
        return 23;
      },
      async findMany(args) {
        calls.push(["task.findMany", args]);
        return expectedTasks;
      },
    },
  };

  const result = await listTasksForLab(db, {
    labId: "lab-1",
    query: "paper",
    status: "TODO",
    assigneeId: "member-1",
    page: 2,
  });

  const expectedWhere = {
    labId: "lab-1",
    status: "TODO",
    assigneeId: "member-1",
    OR: [
      { title: { contains: "paper", mode: "insensitive" } },
      { description: { contains: "paper", mode: "insensitive" } },
    ],
  };
  assert.deepEqual(result, {
    items: expectedTasks,
    totalCount: 23,
    page: 2,
    pageCount: 2,
  });
  assert.deepEqual(calls[0], ["task.count", { where: expectedWhere }]);
  assert.equal(calls[1][0], "task.findMany");
  assert.deepEqual(calls[1][1].where, expectedWhere);
  assert.deepEqual(calls[1][1].orderBy, [
    { createdAt: "desc" },
    { id: "desc" },
  ]);
  assert.equal(calls[1][1].skip, 20);
  assert.equal(calls[1][1].take, 20);
  assert.equal(calls[1][1].select.assignee.select.email, true);
});

test("filters unassigned tasks and clamps a stale page to the last page", async () => {
  let findManyArgs;
  const db = {
    task: {
      count: async ({ where }) => {
        assert.deepEqual(where, { labId: "lab-1", assigneeId: null });
        return 21;
      },
      findMany: async (args) => {
        findManyArgs = args;
        return [];
      },
    },
  };

  const result = await listTasksForLab(db, {
    labId: "lab-1",
    assigneeId: null,
    page: 9,
  });

  assert.equal(result.page, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(findManyArgs.skip, 20);
});

test("orders tasks by deadline and can limit results to overdue open tasks", async () => {
  let countArgs;
  let findManyArgs;
  const db = {
    task: {
      count: async (args) => {
        countArgs = args;
        return 1;
      },
      findMany: async (args) => {
        findManyArgs = args;
        return [];
      },
    },
  };
  const overdueBefore = new Date("2026-11-06T12:00:00.000Z");

  await listTasksForLab(db, {
    labId: "lab-1",
    sort: "due",
    overdueBefore,
  });

  assert.deepEqual(countArgs.where, {
    labId: "lab-1",
    AND: [
      { status: { not: "DONE" } },
      { dueAt: { lt: overdueBefore } },
    ],
  });
  assert.deepEqual(findManyArgs.orderBy, [
    { dueAt: { sort: "asc", nulls: "last" } },
    { createdAt: "desc" },
    { id: "desc" },
  ]);
});

test("updates only a Task status when both its id and Lab match", async () => {
  const task = {
    id: "task-1",
    labId: "lab-1",
    ...taskInput,
    title: "Keep task details",
    description: "Keep this description",
    assigneeId: "member-1",
  };
  const { db, state, calls } = createFakeDatabase({ tasks: [task] });

  await updateTaskStatus(db, "lab-1", "task-1", "DONE");

  assert.equal(state.tasks[0].status, "DONE");
  assert.equal(state.tasks[0].title, "Keep task details");
  assert.equal(state.tasks[0].description, "Keep this description");
  assert.equal(state.tasks[0].assigneeId, "member-1");
  assert.ok(
    calls.some(
      ([name, args]) =>
        name === "task.updateMany" &&
        args.where.id === "task-1" &&
        args.where.labId === "lab-1" &&
        args.data.status === "DONE" &&
        Object.keys(args.data).length === 1,
    ),
  );
});

test("rejects invalid Task statuses before writing", async () => {
  const task = { id: "task-1", labId: "lab-1", ...taskInput };
  const { db, state, calls } = createFakeDatabase({ tasks: [task] });

  await assert.rejects(
    updateTaskStatus(db, "lab-1", "task-1", "ARCHIVED"),
    expectTaskError("INVALID_STATUS"),
  );
  assert.equal(state.tasks[0].status, "TODO");
  assert.equal(calls.some(([name]) => name === "task.updateMany"), false);
});

test("does not update a Task outside the requested Lab", async () => {
  const task = { id: "task-1", labId: "lab-2", ...taskInput };
  const { db, state, calls } = createFakeDatabase({ tasks: [task] });

  await assert.rejects(
    updateTaskStatus(db, "lab-1", "task-1", "DONE"),
    expectTaskError("TASK_NOT_FOUND"),
  );
  assert.equal(state.tasks[0].status, "TODO");
  assert.ok(
    calls.some(
      ([name, args]) =>
        name === "task.updateMany" &&
        args.where.id === "task-1" &&
        args.where.labId === "lab-1",
    ),
  );
});

test("creates a Task with no assignee", async () => {
  const { db, state, calls } = createFakeDatabase();

  await createTask(db, "lab-1", taskInput);

  assert.deepEqual(state.tasks, [
    {
      id: "task-1",
      labId: "lab-1",
      ...taskInput,
    },
  ]);
  assert.equal(calls.filter(([name]) => name === "transaction").length, 1);
});

test("creates a Task assigned to a member of the same Lab", async () => {
  const { db, state, calls } = createFakeDatabase({
    memberships: [{ labId: "lab-1", userId: "member-1" }],
  });

  await createTask(db, "lab-1", { ...taskInput, assigneeId: "member-1" });

  assert.equal(state.tasks[0].assigneeId, "member-1");
  assert.ok(
    calls.some(
      ([name, args]) =>
        name === "labMember.findUnique" &&
        args.where.labId_userId.labId === "lab-1" &&
        args.where.labId_userId.userId === "member-1",
    ),
  );
});

test("rejects an assignee who belongs to another Lab", async () => {
  const { db, state } = createFakeDatabase({
    memberships: [{ labId: "lab-2", userId: "member-2" }],
  });

  await assert.rejects(
    createTask(db, "lab-1", { ...taskInput, assigneeId: "member-2" }),
    expectTaskError("ASSIGNEE_NOT_MEMBER"),
  );
  assert.deepEqual(state.tasks, []);
});

test("updates a Task only when both its id and Lab match", async () => {
  const task = {
    id: "task-1",
    labId: "lab-1",
    ...taskInput,
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
  };
  const { db, state, calls } = createFakeDatabase({ tasks: [task] });
  const updateData = { ...taskInput, title: "Updated task", status: "DONE" };

  await updateTask(db, "lab-1", "task-1", updateData);

  assert.equal(state.tasks[0].title, "Updated task");
  assert.equal(state.tasks[0].status, "DONE");
  assert.ok(
    calls.some(
      ([name, args]) =>
        name === "task.updateMany" &&
        args.where.id === "task-1" &&
        args.where.labId === "lab-1",
    ),
  );
});

test("does not update a Task from a different Lab", async () => {
  const task = { id: "task-other", labId: "lab-2", ...taskInput };
  const { db, state, calls } = createFakeDatabase({ tasks: [task] });

  await assert.rejects(
    updateTask(db, "lab-1", "task-other", {
      ...taskInput,
      title: "Attempted change",
    }),
    expectTaskError("TASK_NOT_FOUND"),
  );
  assert.equal(state.tasks[0].title, "Read paper");
  assert.equal(
    calls.some(
      ([name, args]) =>
        name === "task.updateMany" && args.where.labId === "lab-2",
    ),
    false,
  );
});

test("does not update when a new assignee is not a member of that Lab", async () => {
  const task = { id: "task-1", labId: "lab-1", ...taskInput };
  const { db, state } = createFakeDatabase({
    tasks: [task],
    memberships: [{ labId: "lab-2", userId: "member-2" }],
  });

  await assert.rejects(
    updateTask(db, "lab-1", "task-1", {
      ...taskInput,
      assigneeId: "member-2",
    }),
    expectTaskError("ASSIGNEE_NOT_MEMBER"),
  );
  assert.equal(state.tasks[0].assigneeId, null);
});

test("deletes a Task only inside the authorized Lab", async () => {
  const tasks = [
    { id: "task-1", labId: "lab-1" },
    { id: "task-2", labId: "lab-2" },
  ];
  const { db, state, calls } = createFakeDatabase({ tasks });

  await deleteTask(db, "lab-1", "task-1");

  assert.deepEqual(state.tasks, [tasks[1]]);
  assert.deepEqual(calls.at(-1), [
    "task.deleteMany",
    { where: { id: "task-1", labId: "lab-1" } },
  ]);
});

test("does not delete a Task from another Lab, returning the same missing error", async () => {
  const task = { id: "task-other", labId: "lab-2" };
  const { db, state, calls } = createFakeDatabase({ tasks: [task] });

  await assert.rejects(
    deleteTask(db, "lab-1", "task-other"),
    expectTaskError("TASK_NOT_FOUND"),
  );
  assert.deepEqual(state.tasks, [task]);
  assert.deepEqual(calls.at(-1), [
    "task.deleteMany",
    { where: { id: "task-other", labId: "lab-1" } },
  ]);
});
