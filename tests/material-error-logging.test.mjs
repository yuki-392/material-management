import assert from "node:assert/strict";
import test from "node:test";

import { getSafeMaterialErrorDetails } from "../src/lib/material-error-logging.js";

test("ストレージのエラーから安全に記録できる構造化フィールドだけを取り出す", () => {
  const error = Object.assign(
    new Error("request URL contains a private key and filename.pdf"),
    {
      name: "S3ServiceException",
      code: "AccessDenied",
      $metadata: { httpStatusCode: 403, requestId: "request-123" },
      secretAccessKey: "private-secret",
      key: "labs/lab-1/materials/private-key",
    },
  );

  const details = getSafeMaterialErrorDetails("storage.put", error);

  assert.deepEqual(details, {
    stage: "storage.put",
    name: "S3ServiceException",
    code: "AccessDenied",
    httpStatusCode: 403,
    requestId: "request-123",
  });
  assert.doesNotMatch(JSON.stringify(details), /private|filename|labs/);
});

test("ストレージ事業者のメタデータがないエラーも処理する", () => {
  assert.deepEqual(
    getSafeMaterialErrorDetails("material.file-read", new Error("details")),
    { stage: "material.file-read", name: "Error" },
  );
});
