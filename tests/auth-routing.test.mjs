import assert from "node:assert/strict";
import test from "node:test";

import { getAuthRedirect } from "../src/lib/auth-routing.js";

test("root sends anonymous users to login and authenticated users to workspace", () => {
  assert.equal(getAuthRedirect("root", false), "/login");
  assert.equal(getAuthRedirect("root", true), "/labs");
});

test("login sends authenticated users to workspace", () => {
  assert.equal(getAuthRedirect("login", true), "/labs");
  assert.equal(getAuthRedirect("login", false), null);
});

test("workspace sends anonymous users to login", () => {
  assert.equal(getAuthRedirect("workspace", false), "/login");
  assert.equal(getAuthRedirect("workspace", true), null);
});
