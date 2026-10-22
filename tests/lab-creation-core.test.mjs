import assert from "node:assert/strict";
import test from "node:test";

import {
  LabCreationError,
  createLabWithOwner,
} from "../src/lib/lab-creation-core.js";

function createFakeDatabase({
  existingMemberships = [],
  failMembershipCreation = false,
  simulateMembershipRace = false,
  labCount = 0,
  allocatedBytes = 0n,
} = {}) {
  const state = {
    labs: [],
    memberships: [...existingMemberships],
  };
  const calls = [];
  let nextLabId = 1;
  const control = { labCount, allocatedBytes };

  const db = {
    async $transaction(callback) {
      calls.push("transaction");
      const pendingLabs = [];
      const pendingMemberships = [];

      const tx = {
        storageQuotaControl: {
          async findUnique() {
            return { ...control };
          },
          async updateMany(args) {
            calls.push(["control.updateMany", args]);
            if (
              control.labCount >= args.where.labCount.lt ||
              control.allocatedBytes > args.where.allocatedBytes.lte
            ) {
              return { count: 0 };
            }
            control.labCount += args.data.labCount.increment;
            control.allocatedBytes += args.data.allocatedBytes.increment;
            return { count: 1 };
          },
        },
        labMember: {
          async findUnique(args) {
            calls.push(["findUnique", args]);
            if (simulateMembershipRace) return null;
            return (
              state.memberships.find(
                (membership) =>
                  membership.userId === args.where.userId,
              ) ?? null
            );
          },
          async create(args) {
            calls.push(["member.create", args]);
            if (failMembershipCreation) {
              throw new Error("simulated membership insert failure");
            }

            if (
              state.memberships.some(
                (membership) =>
                  membership.userId === args.data.userId,
              )
            ) {
              const error = new Error("unique constraint");
              error.code = "P2002";
              error.meta = { target: ["userId"] };
              throw error;
            }

            const membership = {
              labId: args.data.labId,
              userId: args.data.userId,
            };
            pendingMemberships.push(membership);
            return membership;
          },
        },
        lab: {
          async create(args) {
            calls.push(["lab.create", args]);
            const lab = { id: `lab-${nextLabId++}`, ...args.data };
            pendingLabs.push(lab);
            return { id: lab.id };
          },
        },
      };

      const result = await callback(tx);
      state.labs.push(...pendingLabs);
      state.memberships.push(...pendingMemberships);
      return result;
    },
  };

  return { db, state, calls, control };
}

test("creates the Lab and owner membership in one transaction", async () => {
  const { db, state, calls, control } = createFakeDatabase();

  const result = await createLabWithOwner(db, "user-1", "Vision Lab");

  assert.deepEqual(result, { id: "lab-1" });
  assert.equal(calls.filter((call) => call === "transaction").length, 1);
  assert.deepEqual(state.labs, [
    {
      id: "lab-1",
      name: "Vision Lab",
      ownerId: "user-1",
      storageLimitBytes: 1_000_000_000n,
    },
  ]);
  assert.deepEqual(state.memberships, [
    { labId: "lab-1", userId: "user-1" },
  ]);
  assert.deepEqual(control, {
    labCount: 1,
    allocatedBytes: 1_000_000_000n,
  });
  assert.deepEqual(calls.slice(1).map((call) => call[0]), [
    "findUnique",
    "control.updateMany",
    "lab.create",
    "member.create",
  ]);
});

test("rejects Lab creation after eight lifetime slots have been used", async () => {
  const { db, state, control } = createFakeDatabase({ labCount: 8 });

  await assert.rejects(
    createLabWithOwner(db, "user-1", "Ninth Lab"),
    (error) =>
      error instanceof LabCreationError && error.code === "LAB_LIMIT_REACHED",
  );
  assert.deepEqual(state.labs, []);
  assert.deepEqual(control, { labCount: 8, allocatedBytes: 0n });
});

test("rejects Lab creation when a full one-GB allocation is unavailable", async () => {
  const { db, state, control } = createFakeDatabase({
    labCount: 7,
    allocatedBytes: 7_500_000_001n,
  });

  await assert.rejects(
    createLabWithOwner(db, "user-1", "Another Lab"),
    (error) =>
      error instanceof LabCreationError &&
      error.code === "STORAGE_CAPACITY_UNAVAILABLE",
  );
  assert.deepEqual(state.labs, []);
  assert.deepEqual(control, { labCount: 7, allocatedBytes: 7_500_000_001n });
});

test("serializes concurrent Lab creation at the final count and allocation slot", async () => {
  const { db, state, control } = createFakeDatabase({
    labCount: 7,
    allocatedBytes: 7_000_000_000n,
  });

  const results = await Promise.allSettled([
    createLabWithOwner(db, "user-1", "Lab one"),
    createLabWithOwner(db, "user-2", "Lab two"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    results.find((result) => result.status === "rejected").reason.code,
    "LAB_LIMIT_REACHED",
  );
  assert.equal(state.labs.length, 1);
  assert.equal(state.memberships.length, 1);
  assert.deepEqual(control, { labCount: 8, allocatedBytes: 8_000_000_000n });
});

test("rejects a User who already has a Lab membership", async () => {
  const existingMemberships = [{ labId: "lab-existing", userId: "user-1" }];
  const { db, state, calls } = createFakeDatabase({ existingMemberships });

  await assert.rejects(
    createLabWithOwner(db, "user-1", "Another Lab"),
    (error) =>
      error instanceof LabCreationError && error.code === "ALREADY_MEMBER",
  );
  assert.deepEqual(state.labs, []);
  assert.deepEqual(state.memberships, existingMemberships);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "lab.create"), false);
});

test("rolls back the Lab when creating its owner membership fails", async () => {
  const { db, state } = createFakeDatabase({ failMembershipCreation: true });

  await assert.rejects(
    createLabWithOwner(db, "user-1", "Vision Lab"),
    /simulated membership insert failure/,
  );
  assert.deepEqual(state.labs, []);
  assert.deepEqual(state.memberships, []);
});

test("maps a concurrent userId unique conflict to an already-member error", async () => {
  const existingMemberships = [{ labId: "lab-from-racing-request", userId: "user-1" }];
  const { db, state } = createFakeDatabase({
    existingMemberships,
    simulateMembershipRace: true,
  });

  await assert.rejects(
    createLabWithOwner(db, "user-1", "Another Lab"),
    (error) =>
      error instanceof LabCreationError && error.code === "ALREADY_MEMBER",
  );
  assert.deepEqual(state.labs, []);
  assert.deepEqual(state.memberships, existingMemberships);
});
