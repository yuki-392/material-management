import assert from "node:assert/strict";
import test from "node:test";

import {
  getWorkspaceNavigationItems,
  isWorkspaceNavigationItemActive,
} from "../src/lib/workspace-navigation.js";

test("shows only the Lab link when the user has no Lab", () => {
  assert.deepEqual(getWorkspaceNavigationItems(null), [
    { label: "Lab", href: "/labs", match: "exact" },
  ]);
});

test("shows Lab, Task, and Material links scoped to the current Lab", () => {
  assert.deepEqual(getWorkspaceNavigationItems("lab-123"), [
    { label: "Lab", href: "/labs", match: "exact" },
    {
      label: "Task",
      href: "/labs/lab-123/tasks",
      match: "section",
    },
    {
      label: "資料",
      href: "/labs/lab-123/materials",
      match: "section",
    },
  ]);
});

test("encodes the Lab id before building navigation links", () => {
  const items = getWorkspaceNavigationItems("lab/123");

  assert.equal(items[1].href, "/labs/lab%2F123/tasks");
  assert.equal(items[2].href, "/labs/lab%2F123/materials");
});

test("marks an exact page or a nested page in the matching section active", () => {
  const [lab, task, materials] = getWorkspaceNavigationItems("lab-123");

  assert.equal(isWorkspaceNavigationItemActive("/labs", lab), true);
  assert.equal(isWorkspaceNavigationItemActive("/labs/new", lab), false);
  assert.equal(
    isWorkspaceNavigationItemActive("/labs/lab-123/tasks", task),
    true,
  );
  assert.equal(
    isWorkspaceNavigationItemActive(
      "/labs/lab-123/tasks/task-1",
      task,
    ),
    true,
  );
  assert.equal(
    isWorkspaceNavigationItemActive("/labs/lab-123/materials", materials),
    true,
  );
  assert.equal(
    isWorkspaceNavigationItemActive("/labs/lab-123/materials-old", materials),
    false,
  );
});
