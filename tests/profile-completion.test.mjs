import assert from "node:assert/strict";
import test from "node:test";

import { isProfileComplete } from "../src/lib/authorization-core.js";

test("a teacher profile is complete only when student number is absent", () => {
  assert.equal(
    isProfileComplete({ userType: "TEACHER", studentNumber: null }),
    true,
  );
  assert.equal(
    isProfileComplete({ userType: "TEACHER", studentNumber: "12345" }),
    false,
  );
});

test("a student profile is complete only when student number has content", () => {
  assert.equal(
    isProfileComplete({ userType: "STUDENT", studentNumber: " s12345 " }),
    true,
  );
  assert.equal(
    isProfileComplete({ userType: "STUDENT", studentNumber: "  " }),
    false,
  );
});

test("missing and unsupported profile data is incomplete", () => {
  assert.equal(isProfileComplete(null), false);
  assert.equal(isProfileComplete({ userType: null, studentNumber: null }), false);
  assert.equal(isProfileComplete({ userType: "ADMIN", studentNumber: null }), false);
});
