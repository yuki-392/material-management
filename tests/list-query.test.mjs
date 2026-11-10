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
  parseMaterialUploader,
  parseMaterialType,
  parseTaskAssignee,
  parseTaskStatus,
} from "../src/lib/list-query.js";

test("normalizes a list search query and caps its length", () => {
  assert.equal(parseListSearch("  review paper  "), "review paper");
  assert.equal(parseListSearch("あ".repeat(101)).length, 100);
  assert.equal(parseListSearch(["first", "second"]), "");
  assert.equal(parseListSearch(undefined), "");
});

test("accepts only valid task statuses and material type filters", () => {
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

test("normalizes invalid page numbers and builds filter-preserving page links", () => {
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

test("parses task views, focus filters, sorting, and independent board pages", () => {
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

test("keeps task view, sort, focus, and board columns in navigation links", () => {
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
