import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTokyoDateTimeLocal,
  validateTaskInput,
} from "../src/lib/task-validation.js";

const validInput = {
  title: "  Read paper  ",
  description: "  Summarize the method.  ",
  status: "IN_PROGRESS",
  assigneeId: "user-1",
  dueAt: "2026-10-01T09:30",
};

test("タイトルと説明の前後の空白を除き、日本時間の締切を解釈する", () => {
  const result = validateTaskInput(validInput);

  assert.equal(result.success, true);
  assert.deepEqual(result.data, {
    title: "Read paper",
    description: "Summarize the method.",
    status: "IN_PROGRESS",
    assigneeId: "user-1",
    dueAt: new Date("2026-10-01T00:30:00.000Z"),
  });
});

test("担当者と締切が未設定のタスクを受け付ける", () => {
  const result = validateTaskInput({
    ...validInput,
    description: "   ",
    assigneeId: "",
    dueAt: "",
    status: "TODO",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.description, null);
  assert.equal(result.data.assigneeId, null);
  assert.equal(result.data.dueAt, null);
});

test("タイトルが未入力・空欄・文字数超過の場合は拒否する", () => {
  for (const title of [null, "   ", "x".repeat(201)]) {
    const result = validateTaskInput({ ...validInput, title });
    assert.equal(result.success, false);
    assert.ok(result.fieldErrors.title);
  }
});

test("説明が長すぎる場合や未対応の状態が指定された場合は拒否する", () => {
  const longDescription = validateTaskInput({
    ...validInput,
    description: "x".repeat(5001),
  });
  assert.equal(longDescription.success, false);
  assert.ok(longDescription.fieldErrors.description);

  const invalidStatus = validateTaskInput({ ...validInput, status: "BLOCKED" });
  assert.equal(invalidStatus.success, false);
  assert.ok(invalidStatus.fieldErrors.status);
});

test("形式が不正な担当者と締切を拒否する", () => {
  const invalidAssignee = validateTaskInput({ ...validInput, assigneeId: 7 });
  assert.equal(invalidAssignee.success, false);
  assert.ok(invalidAssignee.fieldErrors.assigneeId);

  for (const dueAt of ["2026-02-30T09:00", "tomorrow", 123]) {
    const result = validateTaskInput({ ...validInput, dueAt });
    assert.equal(result.success, false);
    assert.ok(result.fieldErrors.dueAt);
  }
});

test("保存された日時を日本時間のdatetime-local入力用に整形する", () => {
  assert.equal(
    formatTokyoDateTimeLocal(new Date("2026-10-01T00:30:00.000Z")),
    "2026-10-01T09:30",
  );
});
