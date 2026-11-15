import assert from "node:assert/strict";
import test from "node:test";

import { getLoginErrorMessage } from "../src/lib/auth-error.js";

test("サーバー障害、Googleログイン失敗、アカウント不一致、アクセス拒否を日本語で案内する", () => {
  assert.match(getLoginErrorMessage("Configuration"), /時間をおいて/);
  assert.match(getLoginErrorMessage("OAuthCallbackError"), /Googleログインを完了できませんでした/);
  assert.match(getLoginErrorMessage("OAuthAccountNotLinked"), /以前使ったGoogleアカウント/);
  assert.match(getLoginErrorMessage("AccessDenied"), /アクセスが許可されませんでした/);
});

test("未知のエラー、空欄、複数の値を受け取っても固定の案内だけを返す", () => {
  const fallback = getLoginErrorMessage("Default");
  assert.match(fallback, /ログインできませんでした/);
  for (const value of ["postgres://secret", "<script>", "__proto__", "", ["Configuration", "secret"]]) {
    assert.equal(getLoginErrorMessage(value), fallback);
  }
});

test("エラー未指定ならログイン画面にはエラーの案内を出さない", () => {
  assert.equal(getLoginErrorMessage(undefined), null);
});
