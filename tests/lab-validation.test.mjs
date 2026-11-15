import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_LAB_NAME_LENGTH,
  validateLabName,
} from "../src/lib/lab-validation.js";

test("有効なLab名は前後の空白を除いてから保存する", () => {
  assert.deepEqual(validateLabName("  Vision Lab  "), {
    success: true,
    name: "Vision Lab",
  });
});

test("空欄、文字列以外、文字数超過のLab名を拒否する", () => {
  assert.equal(validateLabName("   ").success, false);
  assert.equal(validateLabName(new File(["Lab"], "name.txt")).success, false);
  assert.equal(
    validateLabName("x".repeat(MAX_LAB_NAME_LENGTH + 1)).success,
    false,
  );
});
