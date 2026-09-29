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

test("trims the title and description and parses Tokyo local time", () => {
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

test("accepts unassigned tasks without a due date", () => {
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

test("rejects a missing, empty, or overly long title", () => {
  for (const title of [null, "   ", "x".repeat(201)]) {
    const result = validateTaskInput({ ...validInput, title });
    assert.equal(result.success, false);
    assert.ok(result.fieldErrors.title);
  }
});

test("rejects an overly long description and unsupported status", () => {
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

test("rejects malformed assignee and due date values", () => {
  const invalidAssignee = validateTaskInput({ ...validInput, assigneeId: 7 });
  assert.equal(invalidAssignee.success, false);
  assert.ok(invalidAssignee.fieldErrors.assigneeId);

  for (const dueAt of ["2026-02-30T09:00", "tomorrow", 123]) {
    const result = validateTaskInput({ ...validInput, dueAt });
    assert.equal(result.success, false);
    assert.ok(result.fieldErrors.dueAt);
  }
});

test("formats a stored instant as an Asia/Tokyo datetime-local value", () => {
  assert.equal(
    formatTokyoDateTimeLocal(new Date("2026-10-01T00:30:00.000Z")),
    "2026-10-01T09:30",
  );
});
