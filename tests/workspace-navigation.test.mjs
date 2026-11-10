import assert from "node:assert/strict";
import test from "node:test";

import {
  getWorkspaceNavigationItems,
  isWorkspaceNavigationItemActive,
} from "../src/lib/workspace-navigation.js";

test("shows only the Lab link when the user has no Lab", () => {
  assert.deepEqual(getWorkspaceNavigationItems(null), [
    { label: "ホーム", href: "/labs", match: "exact" },
  ]);
});

test("shows home, Lab tools, and member navigation", () => {
  assert.deepEqual(getWorkspaceNavigationItems("lab-123"), [
    { label: "ホーム", href: "/labs", match: "exact" },
    {
      label: "タスク",
      href: "/labs/lab-123/tasks",
      match: "section",
    },
    {
      label: "資料",
      href: "/labs/lab-123/materials",
      match: "section",
    },
    { label: "メンバー", href: "/labs#lab-members-heading", match: "anchor" },
  ]);
});

test("encodes the Lab id before building navigation links", () => {
  const items = getWorkspaceNavigationItems("lab/123");

  assert.equal(items[1].href, "/labs/lab%2F123/tasks");
  assert.equal(items[2].href, "/labs/lab%2F123/materials");
  assert.equal(items[3].href, "/labs#lab-members-heading");
});

test("shows the storage administration link only for app administrators", () => {
  assert.deepEqual(getWorkspaceNavigationItems("lab-123", true).at(-1), {
    label: "容量管理",
    href: "/admin/storage",
    match: "section",
  });
  assert.equal(
    getWorkspaceNavigationItems("lab-123", false).some(
      (item) => item.href === "/admin/storage",
    ),
    false,
  );
});

test("marks an exact page or a nested page in the matching section active", () => {
  const [lab, task, materials, members] = getWorkspaceNavigationItems("lab-123");

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
  assert.equal(isWorkspaceNavigationItemActive("/labs", members), false);
});
