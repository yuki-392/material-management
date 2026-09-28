import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_NAME_LENGTH,
  MAX_STUDENT_NUMBER_LENGTH,
  validateProfileInput,
} from "../src/lib/profile-validation.js";

test("student profile trims values and keeps the student number", () => {
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

test("teacher profile clears any submitted student number", () => {
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

test("name is optional but whitespace becomes null", () => {
  assert.deepEqual(
    validateProfileInput({ name: "  ", userType: "TEACHER", studentNumber: "" }),
    {
      success: true,
      data: { name: null, userType: "TEACHER", studentNumber: null },
    },
  );
});

test("unsupported user type is rejected", () => {
  const result = validateProfileInput({
    name: "Yuki",
    userType: "ADMIN",
    studentNumber: "s12345",
  });

  assert.equal(result.success, false);
  assert.ok(result.fieldErrors.userType);
});

test("students must submit a non-empty student number", () => {
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

test("unexpected field values and excessive lengths are rejected", () => {
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
