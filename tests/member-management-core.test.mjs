import assert from "node:assert/strict";
import test from "node:test";

import {
  MemberManagementError,
  addMemberByEmail,
  removeMemberAndClearAssignments,
} from "../src/lib/member-management-core.js";

function createFakeDatabase({
  users = [{ id: "user-new", email: "student@example.edu" }],
  memberships = [],
  tasks = [],
  failMemberDelete = false,
  failAfterMembershipCheck = false,
} = {}) {
  const state = {
    users: structuredClone(users),
    memberships: structuredClone(memberships),
    tasks: structuredClone(tasks),
  };
  const calls = [];

  const db = {
    user: {
      async findFirst(args) {
        calls.push(["user.findFirst", args]);
        const requested = args.where.email.equals.toLowerCase();
        return (
          state.users.find((user) => user.email?.toLowerCase() === requested) ??
          null
        );
      },
    },
    async $transaction(callback) {
      calls.push(["transaction"]);
      const pending = {
        memberships: structuredClone(state.memberships),
        tasks: structuredClone(state.tasks),
      };
      const tx = {
        labMember: {
          async findUnique(args) {
            calls.push(["labMember.findUnique", args]);
            if ("userId" in args.where) {
              return (
                pending.memberships.find(
                  (membership) => membership.userId === args.where.userId,
                ) ?? null
              );
            }
            const { labId, userId } = args.where.labId_userId;
            return (
              pending.memberships.find(
                (membership) =>
                  membership.labId === labId && membership.userId === userId,
              ) ?? null
            );
          },
          async create(args) {
            calls.push(["labMember.create", args]);
            if (
              pending.memberships.some(
                (membership) => membership.userId === args.data.userId,
              )
            ) {
              const error = new Error("unique constraint");
              error.code = "P2002";
              throw error;
            }
            pending.memberships.push({ ...args.data });
            return args.data;
          },
          async delete(args) {
            calls.push(["labMember.delete", args]);
            if (failMemberDelete) {
              throw new Error("simulated delete failure");
            }
            const { labId, userId } = args.where.labId_userId;
            const index = pending.memberships.findIndex(
              (membership) =>
                membership.labId === labId && membership.userId === userId,
            );
            if (index < 0) {
              const error = new Error("record not found");
              error.code = "P2025";
              throw error;
            }
            pending.memberships.splice(index, 1);
          },
        },
        task: {
          async updateMany(args) {
            calls.push(["task.updateMany", args]);
            if (failAfterMembershipCheck) {
              throw new Error("simulated task update failure");
            }
            let count = 0;
            for (const task of pending.tasks) {
              if (
                task.labId === args.where.labId &&
                task.assigneeId === args.where.assigneeId
              ) {
                task.assigneeId = args.data.assigneeId;
                count += 1;
              }
            }
            return { count };
          },
        },
      };

      const result = await callback(tx);
      state.memberships = pending.memberships;
      state.tasks = pending.tasks;
      return result;
    },
  };

  return { db, state, calls };
}

function expectMemberError(code) {
  return (error) =>
    error instanceof MemberManagementError && error.code === code;
}

test("adds an existing user by case-insensitive email inside a transaction", async () => {
  const { db, state, calls } = createFakeDatabase({
    users: [{ id: "user-new", email: "Student@Example.edu" }],
  });

  await addMemberByEmail(db, {
    labId: "lab-1",
    ownerId: "owner-1",
    email: "student@example.edu",
  });

  assert.deepEqual(state.memberships, [
    { labId: "lab-1", userId: "user-new" },
  ]);
  assert.deepEqual(calls[0], [
    "user.findFirst",
    {
      where: { email: { equals: "student@example.edu", mode: "insensitive" } },
      select: { id: true },
    },
  ]);
  assert.ok(calls.some(([name]) => name === "transaction"));
});

test("allows another distinct user to join a Lab that already has a member", async () => {
  const { db, state } = createFakeDatabase({
    memberships: [{ labId: "lab-1", userId: "existing-member" }],
  });

  await addMemberByEmail(db, {
    labId: "lab-1",
    ownerId: "owner-1",
    email: "student@example.edu",
  });

  assert.deepEqual(state.memberships, [
    { labId: "lab-1", userId: "existing-member" },
    { labId: "lab-1", userId: "user-new" },
  ]);
});

test("does not add an email without an existing application user", async () => {
  const { db, state } = createFakeDatabase({ users: [] });

  await assert.rejects(
    addMemberByEmail(db, {
      labId: "lab-1",
      ownerId: "owner-1",
      email: "unknown@example.edu",
    }),
    expectMemberError("USER_NOT_FOUND"),
  );
  assert.deepEqual(state.memberships, []);
});

test("rejects adding the owner as a member again", async () => {
  const { db, state } = createFakeDatabase({
    users: [{ id: "owner-1", email: "owner@example.edu" }],
  });

  await assert.rejects(
    addMemberByEmail(db, {
      labId: "lab-1",
      ownerId: "owner-1",
      email: "owner@example.edu",
    }),
    expectMemberError("CANNOT_ADD_SELF"),
  );
  assert.deepEqual(state.memberships, []);
});

test("rejects a user who is already a member of this Lab", async () => {
  const existing = [{ labId: "lab-1", userId: "user-new" }];
  const { db, state } = createFakeDatabase({ memberships: existing });

  await assert.rejects(
    addMemberByEmail(db, {
      labId: "lab-1",
      ownerId: "owner-1",
      email: "student@example.edu",
    }),
    expectMemberError("ALREADY_MEMBER"),
  );
  assert.deepEqual(state.memberships, existing);
});

test("rejects a user who belongs to a different Lab", async () => {
  const existing = [{ labId: "lab-2", userId: "user-new" }];
  const { db, state } = createFakeDatabase({ memberships: existing });

  await assert.rejects(
    addMemberByEmail(db, {
      labId: "lab-1",
      ownerId: "owner-1",
      email: "student@example.edu",
    }),
    expectMemberError("ALREADY_ASSIGNED"),
  );
  assert.deepEqual(state.memberships, existing);
});

test("maps a userId unique conflict to a safe already-assigned error", async () => {
  const { db, state } = createFakeDatabase({
    memberships: [{ labId: "lab-race", userId: "user-new" }],
  });
  const originalTransaction = db.$transaction;
  db.$transaction = async (callback) =>
    originalTransaction(async (tx) => {
      const originalFind = tx.labMember.findUnique;
      tx.labMember.findUnique = async (args) => {
        if ("userId" in args.where) return null;
        return originalFind(args);
      };
      return callback(tx);
    });

  await assert.rejects(
    addMemberByEmail(db, {
      labId: "lab-1",
      ownerId: "owner-1",
      email: "student@example.edu",
    }),
    expectMemberError("ALREADY_ASSIGNED"),
  );
  assert.deepEqual(state.memberships, [
    { labId: "lab-race", userId: "user-new" },
  ]);
});

test("removes membership and clears only tasks assigned in that Lab", async () => {
  const tasks = [
    { id: "task-1", labId: "lab-1", assigneeId: "user-new" },
    { id: "task-2", labId: "lab-1", assigneeId: "other-user" },
    { id: "task-3", labId: "lab-2", assigneeId: "user-new" },
  ];
  const { db, state, calls } = createFakeDatabase({
    memberships: [
      { labId: "lab-1", userId: "owner-1" },
      { labId: "lab-1", userId: "user-new" },
    ],
    tasks,
  });

  await removeMemberAndClearAssignments(db, {
    labId: "lab-1",
    ownerId: "owner-1",
    userId: "user-new",
  });

  assert.deepEqual(state.memberships, [{ labId: "lab-1", userId: "owner-1" }]);
  assert.deepEqual(state.tasks, [
    { id: "task-1", labId: "lab-1", assigneeId: null },
    { id: "task-2", labId: "lab-1", assigneeId: "other-user" },
    { id: "task-3", labId: "lab-2", assigneeId: "user-new" },
  ]);
  assert.ok(
    calls.findIndex(([name]) => name === "task.updateMany") <
      calls.findIndex(([name]) => name === "labMember.delete"),
  );
});

test("cannot remove the owner", async () => {
  const { db, state } = createFakeDatabase({
    memberships: [{ labId: "lab-1", userId: "owner-1" }],
  });

  await assert.rejects(
    removeMemberAndClearAssignments(db, {
      labId: "lab-1",
      ownerId: "owner-1",
      userId: "owner-1",
    }),
    expectMemberError("CANNOT_REMOVE_OWNER"),
  );
  assert.deepEqual(state.memberships, [{ labId: "lab-1", userId: "owner-1" }]);
});

test("cannot remove someone who is not a member of this Lab", async () => {
  const { db, state } = createFakeDatabase({
    memberships: [{ labId: "lab-2", userId: "user-new" }],
  });

  await assert.rejects(
    removeMemberAndClearAssignments(db, {
      labId: "lab-1",
      ownerId: "owner-1",
      userId: "user-new",
    }),
    expectMemberError("NOT_MEMBER"),
  );
  assert.deepEqual(state.memberships, [{ labId: "lab-2", userId: "user-new" }]);
});

test("rolls back task assignment clearing if membership deletion fails", async () => {
  const memberships = [
    { labId: "lab-1", userId: "owner-1" },
    { labId: "lab-1", userId: "user-new" },
  ];
  const tasks = [{ id: "task-1", labId: "lab-1", assigneeId: "user-new" }];
  const { db, state } = createFakeDatabase({
    memberships,
    tasks,
    failMemberDelete: true,
  });

  await assert.rejects(
    removeMemberAndClearAssignments(db, {
      labId: "lab-1",
      ownerId: "owner-1",
      userId: "user-new",
    }),
    /simulated delete failure/,
  );
  assert.deepEqual(state.memberships, memberships);
  assert.deepEqual(state.tasks, tasks);
});

test("rolls back when clearing task assignments fails", async () => {
  const memberships = [
    { labId: "lab-1", userId: "owner-1" },
    { labId: "lab-1", userId: "user-new" },
  ];
  const tasks = [{ id: "task-1", labId: "lab-1", assigneeId: "user-new" }];
  const { db, state } = createFakeDatabase({
    memberships,
    tasks,
    failAfterMembershipCheck: true,
  });

  await assert.rejects(
    removeMemberAndClearAssignments(db, {
      labId: "lab-1",
      ownerId: "owner-1",
      userId: "user-new",
    }),
    /simulated task update failure/,
  );
  assert.deepEqual(state.memberships, memberships);
  assert.deepEqual(state.tasks, tasks);
});
