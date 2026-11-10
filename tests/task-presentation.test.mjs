import assert from "node:assert/strict";
import test from "node:test";

import { getTaskDeadlineHint } from "../src/lib/task-presentation.js";

test("marks overdue open tasks and leaves completed or undated tasks quiet", () => {
  const now = new Date("2026-11-06T03:00:00.000Z");

  assert.equal(
    getTaskDeadlineHint(new Date("2026-11-06T02:59:00.000Z"), "TODO", now),
    "期限超過",
  );
  assert.equal(
    getTaskDeadlineHint(new Date("2026-11-06T02:59:00.000Z"), "DONE", now),
    "",
  );
  assert.equal(getTaskDeadlineHint(null, "TODO", now), "");
});

test("uses Tokyo calendar days for today's and upcoming deadlines", () => {
  const now = new Date("2026-11-06T14:30:00.000Z");

  assert.equal(
    getTaskDeadlineHint(new Date("2026-11-06T14:50:00.000Z"), "IN_PROGRESS", now),
    "今日まで",
  );
  assert.equal(
    getTaskDeadlineHint(new Date("2026-11-07T00:00:00.000Z"), "TODO", now),
    "あと1日",
  );
});
