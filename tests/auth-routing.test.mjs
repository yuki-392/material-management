import assert from "node:assert/strict";
import test from "node:test";

import { getAuthRedirect } from "../src/lib/auth-routing.js";

test("root sends anonymous users to login and routes signed-in users by profile status", () => {
  assert.equal(getAuthRedirect("root", false, false), "/login");
  assert.equal(getAuthRedirect("root", true, false), "/profile/setup");
  assert.equal(getAuthRedirect("root", true, true), "/labs");
});

test("login routes signed-in users by profile status", () => {
  assert.equal(getAuthRedirect("login", true, false), "/profile/setup");
  assert.equal(getAuthRedirect("login", true, true), "/labs");
  assert.equal(getAuthRedirect("login", false, false), null);
});

test("workspace sends anonymous users to login", () => {
  assert.equal(getAuthRedirect("workspace", false, false), "/login");
  assert.equal(getAuthRedirect("workspace", true, false), "/profile/setup");
  assert.equal(getAuthRedirect("workspace", true, true), null);
});

test("profile setup sends anonymous and completed users away", () => {
  assert.equal(getAuthRedirect("profile-setup", false, false), "/login");
  assert.equal(getAuthRedirect("profile-setup", true, false), null);
  assert.equal(getAuthRedirect("profile-setup", true, true), "/labs");
});
