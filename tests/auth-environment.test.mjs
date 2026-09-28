import assert from "node:assert/strict";
import test from "node:test";

import { getMissingAuthEnvironmentVariables } from "../src/lib/auth-environment.js";

test("reports required Auth.js variables without exposing their values", () => {
  const missing = getMissingAuthEnvironmentVariables({
    AUTH_SECRET: "local-secret-value",
    AUTH_GOOGLE_ID: "google-client-id-value",
  });

  assert.deepEqual(missing, ["AUTH_GOOGLE_SECRET"]);
  assert.equal(JSON.stringify(missing).includes("local-secret-value"), false);
  assert.equal(JSON.stringify(missing).includes("google-client-id-value"), false);
});

test("reports blank and whitespace-only Auth.js variables as missing", () => {
  const missing = getMissingAuthEnvironmentVariables({
    AUTH_SECRET: " ",
    AUTH_GOOGLE_ID: "",
    AUTH_GOOGLE_SECRET: "google-secret-value",
  });

  assert.deepEqual(missing, ["AUTH_SECRET", "AUTH_GOOGLE_ID"]);
});

test("reports no missing Auth.js variables when all values are present", () => {
  const missing = getMissingAuthEnvironmentVariables({
    AUTH_SECRET: "local-secret-value",
    AUTH_GOOGLE_ID: "google-client-id-value",
    AUTH_GOOGLE_SECRET: "google-secret-value",
  });

  assert.deepEqual(missing, []);
});
