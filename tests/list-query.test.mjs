import assert from "node:assert/strict";
import test from "node:test";

import {
  buildListPageHref,
  parseListPage,
  parseTaskBoardPages,
  parseTaskFocus,
  parseTaskSort,
  parseTaskView,
  parseListSearch,
  parseListSelection,
  parseMaterialUploader,
  parseMaterialType,
  parseTaskAssignee,
  parseTaskStatus,
} from "../src/lib/list-query.js";

test("一覧の検索語を正規化し、文字数の上限を適用する", () => {
  assert.equal(parseListSearch("  review paper  "), "review paper");
  assert.equal(parseListSearch("あ".repeat(101)).length, 100);
  assert.equal(parseListSearch(["first", "second"]), "");
  assert.equal(parseListSearch(undefined), "");
});

test("有効なタスクの状態と資料の形式だけを絞り込み条件として受け付ける", () => {
  assert.equal(parseTaskStatus("IN_PROGRESS"), "IN_PROGRESS");
  assert.equal(parseTaskStatus("all"), "");
  assert.equal(parseTaskStatus(["DONE"]), "");

  assert.equal(parseTaskAssignee("member-1", ["member-1"]), "member-1");
  assert.equal(parseTaskAssignee("member-from-another-lab", ["member-1"]), "");
  assert.equal(parseTaskAssignee("unassigned", ["member-1"]), "unassigned");
  assert.equal(parseTaskAssignee("me", ["member-1"], "member-1"), "me");
  assert.equal(parseTaskAssignee("me", ["member-1"], "member-2"), "");
  assert.equal(parseTaskAssignee(["member-1"], ["member-1"]), "");

  assert.equal(parseMaterialType("image"), "image");
  assert.equal(parseMaterialType("audio"), "");
  assert.equal(parseMaterialType(["pdf"]), "");
  assert.equal(parseMaterialUploader("member-1", ["member-1"]), "member-1");
  assert.equal(parseMaterialUploader("member-2", ["member-1"]), "");
  assert.equal(parseMaterialUploader(["member-1"], ["member-1"]), "");
});

test("不正なページ番号を補正し、絞り込み条件を維持するページリンクを作る", () => {
  assert.equal(parseListPage("3"), 3);
  assert.equal(parseListPage("0"), 1);
  assert.equal(parseListPage("1.5"), 1);
  assert.equal(parseListPage(["2", "3"]), 1);

  assert.equal(
    buildListPageHref("/labs/lab-1/tasks", {
      q: "paper notes",
      status: "TODO",
      assignee: "member-1",
      page: 4,
    }),
    "/labs/lab-1/tasks?q=paper+notes&status=TODO&assignee=member-1&page=4",
  );
});

test("タスクの表示形式、絞り込み、並び順、ボード各列のページ番号を読み取る", () => {
  assert.equal(parseTaskView("board"), "board");
  assert.equal(parseTaskView("invalid"), "list");
  assert.equal(parseTaskFocus("overdue"), "overdue");
  assert.equal(parseTaskFocus("invalid"), "");
  assert.equal(parseTaskSort("due"), "due");
  assert.equal(parseTaskSort("invalid"), "recent");
  assert.deepEqual(
    parseTaskBoardPages({ todoPage: "2", inProgressPage: "3", donePage: "0" }),
    { TODO: 2, IN_PROGRESS: 3, DONE: 1 },
  );
});

test("一覧のリンクにタスクの表示形式、並び順、絞り込み、ボード各列のページ番号を引き継ぐ", () => {
  assert.equal(
    buildListPageHref("/labs/lab-1/tasks", {
      q: "paper notes",
      assignee: "me",
      view: "board",
      sort: "due",
      todoPage: 2,
      inProgressPage: 3,
      donePage: 1,
    }),
    "/labs/lab-1/tasks?q=paper+notes&assignee=me&view=board&sort=due&todoPage=2&inProgressPage=3&donePage=1",
  );
});

test("選択IDのあるリンクは一覧条件とページを保持し、一覧へのリンクでは選択を外す", () => {
  for (const key of ["taskId", "materialId"]) {
    const path = "/labs/lab-1/items";
    const filters = { q: "ゼミ", page: 2 };
    const url = new URL(buildListPageHref(path, { ...filters, [key]: "item-1" }), "https://example.test");
    assert.equal(url.searchParams.get(key), "item-1");
    assert.equal(url.searchParams.get("q"), "ゼミ");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(new URL(buildListPageHref(path, filters), url).searchParams.has(key), false);
  }
  assert.equal(parseListSelection(undefined), null);
  assert.equal(parseListSelection("item-1"), "item-1");
  for (const invalid of ["", " ", ["a", "b"], "x".repeat(101)]) {
    assert.equal(parseListSelection(invalid), "");
  }
});
