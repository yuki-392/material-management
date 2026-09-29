import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorizationError,
  createAuthorizationHelpers,
} from "../src/lib/authorization-core.js";

const completeTeacherProfile = {
  userType: "TEACHER",
  studentNumber: null,
};

function createFixture({
  session = { user: { id: "user-1" } },
  profile = completeTeacherProfile,
  membership = { labId: "lab-1", userId: "user-1" },
  lab = { ownerId: "user-1" },
} = {}) {
  const calls = [];

  const db = {
    user: {
      async findUnique(args) {
        calls.push({ model: "user", args });
        return profile;
      },
    },
    labMember: {
      async findUnique(args) {
        calls.push({ model: "labMember", args });
        if ("userId" in args.where) {
          return membership?.userId === args.where.userId
            ? { labId: membership.labId }
            : null;
        }

        const key = args.where.labId_userId;
        return membership?.labId === key.labId && membership?.userId === key.userId
          ? { labId: membership.labId }
          : null;
      },
    },
    lab: {
      async findFirst(args) {
        calls.push({ model: "lab", args });
        return lab;
      },
    },
  };

  return {
    calls,
    helpers: createAuthorizationHelpers({
      getSession: async () => session,
      db,
    }),
  };
}

function hasCode(code) {
  return (error) =>
    error instanceof AuthorizationError &&
    error.code === code &&
    typeof error.status === "number";
}

test("requireUser rejects a request without an authenticated session", async () => {
  const { helpers, calls } = createFixture({ session: null });

  await assert.rejects(helpers.requireUser(), hasCode("UNAUTHENTICATED"));
  assert.deepEqual(calls, []);
});

test("requireProfileCompleteUser returns the session user after checking the profile", async () => {
  const { helpers, calls } = createFixture();

  assert.deepEqual(await helpers.requireProfileCompleteUser(), { id: "user-1" });
  assert.deepEqual(calls[0], {
    model: "user",
    args: {
      where: { id: "user-1" },
      select: { userType: true, studentNumber: true },
    },
  });
});

test("requireProfileCompleteUser rejects unauthenticated and incomplete users", async () => {
  const unauthenticated = createFixture({ session: null });
  await assert.rejects(
    unauthenticated.helpers.requireProfileCompleteUser(),
    hasCode("UNAUTHENTICATED"),
  );

  const incomplete = createFixture({
    profile: { userType: "STUDENT", studentNumber: null },
  });
  await assert.rejects(
    incomplete.helpers.requireProfileCompleteUser(),
    hasCode("PROFILE_INCOMPLETE"),
  );
});

test("requireLabMember checks the session user and only selects the membership labId", async () => {
  const { helpers, calls } = createFixture();

  assert.deepEqual(await helpers.requireLabMember("lab-1"), {
    userId: "user-1",
    labId: "lab-1",
  });
  assert.deepEqual(calls[0], {
    model: "user",
    args: {
      where: { id: "user-1" },
      select: { userType: true, studentNumber: true },
    },
  });
  assert.deepEqual(calls[1], {
    model: "labMember",
    args: {
      where: { labId_userId: { labId: "lab-1", userId: "user-1" } },
      select: { labId: true },
    },
  });
});

test("requireLabMember rejects a user who belongs to no Lab with a non-enumerating 404", async () => {
  const { helpers } = createFixture({ membership: null });

  await assert.rejects(helpers.requireLabMember("lab-1"), (error) => {
    assert.ok(hasCode("LAB_NOT_FOUND")(error));
    assert.equal(error.status, 404);
    return true;
  });
});

test("requireLabMember treats membership in another Lab like a missing Lab", async () => {
  const { helpers } = createFixture({
    membership: { labId: "lab-2", userId: "user-1" },
  });

  await assert.rejects(helpers.requireLabMember("lab-1"), (error) => {
    assert.ok(hasCode("LAB_NOT_FOUND")(error));
    assert.equal(error.status, 404);
    return true;
  });
});

test("requireLabMember blocks a profile that is not complete", async () => {
  const { helpers, calls } = createFixture({
    profile: { userType: "STUDENT", studentNumber: null },
  });

  await assert.rejects(
    helpers.requireLabMember("lab-1"),
    hasCode("PROFILE_INCOMPLETE"),
  );
  assert.equal(calls.some((call) => call.model === "labMember"), false);
});

test("requireLabOwner allows an owner who is also a Lab member", async () => {
  const { helpers, calls } = createFixture();

  assert.deepEqual(await helpers.requireLabOwner("lab-1"), {
    userId: "user-1",
    labId: "lab-1",
  });
  assert.deepEqual(calls[1], {
    model: "lab",
    args: {
      where: {
        id: "lab-1",
        members: { some: { userId: "user-1" } },
      },
      select: { ownerId: true },
    },
  });
});

test("requireLabOwner rejects a regular member without exposing a non-member Lab", async () => {
  const { helpers } = createFixture({ lab: { ownerId: "user-2" } });

  await assert.rejects(helpers.requireLabOwner("lab-1"), (error) => {
    assert.ok(hasCode("FORBIDDEN")(error));
    assert.equal(error.status, 403);
    return true;
  });
});

test("requireLabOwner returns the same 404 for a non-member as requireLabMember", async () => {
  const { helpers } = createFixture({
    membership: { labId: "lab-2", userId: "user-1" },
    lab: null,
  });

  await assert.rejects(helpers.requireLabOwner("lab-1"), (error) => {
    assert.ok(hasCode("LAB_NOT_FOUND")(error));
    assert.equal(error.status, 404);
    return true;
  });
});
