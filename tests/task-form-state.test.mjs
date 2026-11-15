import assert from "node:assert/strict";
import test from "node:test";

import { getTaskFormValues } from "../src/lib/task-form-state.ts";

test("保存に失敗したフォームの空欄と未正規化の入力を保持する", () => {
  const input = {
    title: " タスク名 ",
    description: "",
    status: "IN_PROGRESS",
    assigneeId: "member-1",
    dueAt: "2026-11-17T12:34",
  };

  assert.deepEqual(getTaskFormValues(input), input);
});

test("ファイルや未送信の値をフォームの文字列として返さない", () => {
  assert.deepEqual(getTaskFormValues({
    title: new File(["content"], "draft.txt"),
    description: null,
    status: "TODO",
    assigneeId: null,
    dueAt: "",
  }), {
    title: "",
    description: "",
    status: "TODO",
    assigneeId: "",
    dueAt: "",
  });
});
