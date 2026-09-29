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
} = {}) {
  const state = {
    labs: [],
    memberships: [...existingMemberships],
  };
  const calls = [];
  let nextLabId = 1;

  const db = {
    async $transaction(callback) {
      calls.push("transaction");
      const pendingLabs = [];
      const pendingMemberships = [];

      const tx = {
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

  return { db, state, calls };
}

test("creates the Lab and owner membership in one transaction", async () => {
  const { db, state, calls } = createFakeDatabase();

  const result = await createLabWithOwner(db, "user-1", "Vision Lab");

  assert.deepEqual(result, { id: "lab-1" });
  assert.equal(calls.filter((call) => call === "transaction").length, 1);
  assert.deepEqual(state.labs, [
    { id: "lab-1", name: "Vision Lab", ownerId: "user-1" },
  ]);
  assert.deepEqual(state.memberships, [
    { labId: "lab-1", userId: "user-1" },
  ]);
  assert.deepEqual(calls.slice(1).map((call) => call[0]), [
    "findUnique",
    "lab.create",
    "member.create",
  ]);
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
