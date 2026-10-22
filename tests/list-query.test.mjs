import assert from "node:assert/strict";
import test from "node:test";

import {
  buildListPageHref,
  parseListPage,
  parseListSearch,
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
  assert.equal(parseTaskAssignee(["member-1"], ["member-1"]), "");

  assert.equal(parseMaterialType("image"), "image");
  assert.equal(parseMaterialType("audio"), "");
  assert.equal(parseMaterialType(["pdf"]), "");
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
