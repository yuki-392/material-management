import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const [surface, path, selection] of [
  ["タスク", "tasks", "taskId"],
  ["資料", "materials", "materialId"],
]) {
  const page = readFileSync(
    new URL(`../src/app/(workspace)/labs/[labId]/${path}/page.tsx`, import.meta.url),
    "utf8",
  );

  test(`${surface}の一覧はURLから選択を読み、共有の詳細ペインと追加ダイアログを使う`, () => {
    assert.match(page, new RegExp(`parseListSelection\\(rawSearchParams\\.${selection}\\)`));
    assert.match(page, /<ListDetailLayout\b/);
    assert.match(page, /<AddDialog\b/);
    assert.match(page, /import Form from "next\/form";/);
    assert.match(page, /<Form\b[^>]*scroll=\{false\}/);

    if (path === "tasks") {
      assert.match(page, /<TaskBoardResults\b/);
      assert.match(page, /<TaskListResults\b/);
    } else {
      assert.match(page, /name="uploader"/);
      assert.match(page, /uploadBlocked=\{uploadBlocked\}/);
    }
  });
}
