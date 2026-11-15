import assert from "node:assert/strict";
import test from "node:test";

import { validateMemberEmail } from "../src/lib/member-validation.js";

test("メンバー検索用のメールアドレスは前後の空白を除き、小文字に統一する", () => {
  assert.deepEqual(validateMemberEmail("  Student@Example.EDU  "), {
    success: true,
    email: "student@example.edu",
  });
});

test("空欄のメンバー用メールアドレスを拒否する", () => {
  assert.deepEqual(validateMemberEmail("   "), {
    success: false,
    error: "メールアドレスを入力してください。",
  });
});

test("形式が不正または文字数超過のメンバー用メールアドレスを拒否する", () => {
  assert.equal(validateMemberEmail("not-an-email").success, false);
  assert.equal(validateMemberEmail(`${"a".repeat(250)}@x.jp`).success, false);
});
