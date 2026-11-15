import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_NAME_LENGTH,
  MAX_STUDENT_NUMBER_LENGTH,
  validateProfileInput,
} from "../src/lib/profile-validation.js";

test("学生プロフィールの入力値の前後の空白を除き、学生番号を保持する", () => {
  assert.deepEqual(
    validateProfileInput({
      name: "  Yuki Takahashi  ",
      userType: "STUDENT",
      studentNumber: "  s12345  ",
    }),
    {
      success: true,
      data: {
        name: "Yuki Takahashi",
        userType: "STUDENT",
        studentNumber: "s12345",
      },
    },
  );
});

test("教員プロフィールで送信された学生番号は未設定にする", () => {
  assert.deepEqual(
    validateProfileInput({
      name: "Teacher",
      userType: "TEACHER",
      studentNumber: "should-be-cleared",
    }),
    {
      success: true,
      data: {
        name: "Teacher",
        userType: "TEACHER",
        studentNumber: null,
      },
    },
  );
});

test("名前は任意で、空白のみの場合はnullに変換する", () => {
  assert.deepEqual(
    validateProfileInput({ name: "  ", userType: "TEACHER", studentNumber: "" }),
    {
      success: true,
      data: { name: null, userType: "TEACHER", studentNumber: null },
    },
  );
});

test("未対応のユーザー種別を拒否する", () => {
  const result = validateProfileInput({
    name: "Yuki",
    userType: "ADMIN",
    studentNumber: "s12345",
  });

  assert.equal(result.success, false);
  assert.ok(result.fieldErrors.userType);
});

test("学生には空欄でない学生番号が必要", () => {
  for (const studentNumber of ["", "  "]) {
    const result = validateProfileInput({
      name: "Yuki",
      userType: "STUDENT",
      studentNumber,
    });

    assert.equal(result.success, false);
    assert.ok(result.fieldErrors.studentNumber);
  }
});

test("不正な項目値と文字数超過を拒否する", () => {
  const invalidValue = validateProfileInput({
    name: new File(["text"], "name.txt"),
    userType: "TEACHER",
    studentNumber: "",
  });
  assert.equal(invalidValue.success, false);
  assert.ok(invalidValue.fieldErrors.name);

  const longName = validateProfileInput({
    name: "x".repeat(MAX_NAME_LENGTH + 1),
    userType: "TEACHER",
    studentNumber: "",
  });
  assert.equal(longName.success, false);
  assert.ok(longName.fieldErrors.name);

  const longStudentNumber = validateProfileInput({
    name: "Yuki",
    userType: "STUDENT",
    studentNumber: "x".repeat(MAX_STUDENT_NUMBER_LENGTH + 1),
  });
  assert.equal(longStudentNumber.success, false);
  assert.ok(longStudentNumber.fieldErrors.studentNumber);
});
