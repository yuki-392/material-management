import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_LAB_NAME_LENGTH,
  validateLabName,
} from "../src/lib/lab-validation.js";

test("valid Lab names are trimmed before saving", () => {
  assert.deepEqual(validateLabName("  Vision Lab  "), {
    success: true,
    name: "Vision Lab",
  });
});

test("empty, non-string, and overly long Lab names are rejected", () => {
  assert.equal(validateLabName("   ").success, false);
  assert.equal(validateLabName(new File(["Lab"], "name.txt")).success, false);
  assert.equal(
    validateLabName("x".repeat(MAX_LAB_NAME_LENGTH + 1)).success,
    false,
  );
});
