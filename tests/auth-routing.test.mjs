import assert from "node:assert/strict";
import test from "node:test";

import { getAuthRedirect } from "../src/lib/auth-routing.js";

test("トップページでは未認証ならログインへ、ログイン済みならプロフィールの状態に応じた画面へ移動する", () => {
  assert.equal(getAuthRedirect("root", false, false), "/login");
  assert.equal(getAuthRedirect("root", true, false), "/profile/setup");
  assert.equal(getAuthRedirect("root", true, true), "/labs");
});

test("ログイン画面ではログイン済みのユーザーをプロフィールの状態に応じた画面へ移動させる", () => {
  assert.equal(getAuthRedirect("login", true, false), "/profile/setup");
  assert.equal(getAuthRedirect("login", true, true), "/labs");
  assert.equal(getAuthRedirect("login", false, false), null);
});

test("ワークスペースでは未認証のユーザーをログイン画面へ移動させる", () => {
  assert.equal(getAuthRedirect("workspace", false, false), "/login");
  assert.equal(getAuthRedirect("workspace", true, false), "/profile/setup");
  assert.equal(getAuthRedirect("workspace", true, true), null);
});

test("プロフィール設定画面では未認証のユーザーと設定済みのユーザーを別の画面へ移動させる", () => {
  assert.equal(getAuthRedirect("profile-setup", false, false), "/login");
  assert.equal(getAuthRedirect("profile-setup", true, false), null);
  assert.equal(getAuthRedirect("profile-setup", true, true), "/labs");
});
