import assert from "node:assert/strict";
import test from "node:test";

import { isProfileComplete } from "../src/lib/authorization-core.js";

test("教員のプロフィールは学生番号が未設定の場合に限り完了と判定する", () => {
  assert.equal(
    isProfileComplete({ userType: "TEACHER", studentNumber: null }),
    true,
  );
  assert.equal(
    isProfileComplete({ userType: "TEACHER", studentNumber: "12345" }),
    false,
  );
});

test("学生のプロフィールは学生番号が入力されている場合に限り完了と判定する", () => {
  assert.equal(
    isProfileComplete({ userType: "STUDENT", studentNumber: " s12345 " }),
    true,
  );
  assert.equal(
    isProfileComplete({ userType: "STUDENT", studentNumber: "  " }),
    false,
  );
});

test("プロフィールが未入力または未対応の値を含む場合は未完了と判定する", () => {
  assert.equal(isProfileComplete(null), false);
  assert.equal(isProfileComplete({ userType: null, studentNumber: null }), false);
  assert.equal(isProfileComplete({ userType: "ADMIN", studentNumber: null }), false);
});
