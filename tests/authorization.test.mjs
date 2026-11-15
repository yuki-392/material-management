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

test("requireUserは認証済みセッションがないリクエストを拒否する", async () => {
  const { helpers, calls } = createFixture({ session: null });

  await assert.rejects(helpers.requireUser(), hasCode("UNAUTHENTICATED"));
  assert.deepEqual(calls, []);
});

test("requireProfileCompleteUserはプロフィールの完了を確認してセッションのユーザーを返す", async () => {
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

test("requireProfileCompleteUserは未認証またはプロフィールが未完了の場合に拒否する", async () => {
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

test("requireLabMemberはセッションのユーザーを確認し、所属情報からlabIdだけを取得する", async () => {
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

test("requireLabMemberはLab未所属のユーザーに対して存在の有無を区別できない404相当のエラーを返す", async () => {
  const { helpers } = createFixture({ membership: null });

  await assert.rejects(helpers.requireLabMember("lab-1"), (error) => {
    assert.ok(hasCode("LAB_NOT_FOUND")(error));
    assert.equal(error.status, 404);
    return true;
  });
});

test("requireLabMemberは別のLabに所属している場合にLabが見つからない場合と同じエラーを返す", async () => {
  const { helpers } = createFixture({
    membership: { labId: "lab-2", userId: "user-1" },
  });

  await assert.rejects(helpers.requireLabMember("lab-1"), (error) => {
    assert.ok(hasCode("LAB_NOT_FOUND")(error));
    assert.equal(error.status, 404);
    return true;
  });
});

test("requireLabMemberはプロフィールが未完了のユーザーを拒否する", async () => {
  const { helpers, calls } = createFixture({
    profile: { userType: "STUDENT", studentNumber: null },
  });

  await assert.rejects(
    helpers.requireLabMember("lab-1"),
    hasCode("PROFILE_INCOMPLETE"),
  );
  assert.equal(calls.some((call) => call.model === "labMember"), false);
});

test("requireLabOwnerは対象Labに所属するOwnerを許可する", async () => {
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

test("requireLabOwnerは一般メンバーを拒否し、未所属のLabの存在を明かさない", async () => {
  const { helpers } = createFixture({ lab: { ownerId: "user-2" } });

  await assert.rejects(helpers.requireLabOwner("lab-1"), (error) => {
    assert.ok(hasCode("FORBIDDEN")(error));
    assert.equal(error.status, 403);
    return true;
  });
});

test("requireLabOwnerは対象Labに所属していない場合にrequireLabMemberと同じ404相当のエラーを返す", async () => {
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
