import assert from "node:assert/strict";
import test from "node:test";

import { getMissingAuthEnvironmentVariables } from "../src/lib/auth-environment.js";

test("必須のAuth.js環境変数を値を公開せずに報告する", () => {
  const missing = getMissingAuthEnvironmentVariables({
    AUTH_SECRET: "local-secret-value",
    AUTH_GOOGLE_ID: "google-client-id-value",
  });

  assert.deepEqual(missing, ["AUTH_GOOGLE_SECRET"]);
  assert.equal(JSON.stringify(missing).includes("local-secret-value"), false);
  assert.equal(JSON.stringify(missing).includes("google-client-id-value"), false);
});

test("空欄や空白のみのAuth.js環境変数を未設定と判定する", () => {
  const missing = getMissingAuthEnvironmentVariables({
    AUTH_SECRET: " ",
    AUTH_GOOGLE_ID: "",
    AUTH_GOOGLE_SECRET: "google-secret-value",
  });

  assert.deepEqual(missing, ["AUTH_SECRET", "AUTH_GOOGLE_ID"]);
});

test("Auth.jsの必須環境変数がすべて設定済みなら不足を報告しない", () => {
  const missing = getMissingAuthEnvironmentVariables({
    AUTH_SECRET: "local-secret-value",
    AUTH_GOOGLE_ID: "google-client-id-value",
    AUTH_GOOGLE_SECRET: "google-secret-value",
  });

  assert.deepEqual(missing, []);
});
