import assert from "node:assert/strict";
import test from "node:test";

import { validateMemberEmail } from "../src/lib/member-validation.js";

test("trims and normalizes a member email for case-insensitive lookup", () => {
  assert.deepEqual(validateMemberEmail("  Student@Example.EDU  "), {
    success: true,
    email: "student@example.edu",
  });
});

test("rejects an empty member email", () => {
  assert.deepEqual(validateMemberEmail("   "), {
    success: false,
    error: "メールアドレスを入力してください。",
  });
});

test("rejects malformed and excessively long member emails", () => {
  assert.equal(validateMemberEmail("not-an-email").success, false);
  assert.equal(validateMemberEmail(`${"a".repeat(250)}@x.jp`).success, false);
});
