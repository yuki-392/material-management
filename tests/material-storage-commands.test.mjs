import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateBucketCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  ensureMaterialBucket,
  getMaterialObject,
  putMaterialObject,
} from "../src/lib/material-storage-commands.js";

test("ファイルのアップロード時にバケットを作成しない", async () => {
  const commands = [];
  const client = {
    send: async (command) => {
      commands.push(command);
    },
  };

  await putMaterialObject(client, {
    bucket: "lab-materials",
    key: "labs/lab-1/materials/key-1",
    body: new Uint8Array([1, 2, 3]),
    contentType: "application/pdf",
    sizeBytes: 3,
  });

  assert.equal(commands.length, 1);
  assert.ok(commands[0] instanceof PutObjectCommand);
  assert.equal(commands[0].input.Bucket, "lab-materials");
});

test("ローカルの初期設定でバケットを作成し、既に存在する場合も続行する", async () => {
  const commands = [];
  const client = {
    send: async (command) => {
      commands.push(command);
      const error = new Error("already exists");
      error.name = "BucketAlreadyOwnedByYou";
      throw error;
    },
  };

  await ensureMaterialBucket(client, "lab-materials");

  assert.equal(commands.length, 1);
  assert.ok(commands[0] instanceof CreateBucketCommand);
  assert.equal(commands[0].input.Bucket, "lab-materials");
});

test("バケットが既に存在する場合以外はローカル初期設定の失敗を伝える", async () => {
  const accessDenied = Object.assign(new Error("denied"), {
    name: "AccessDenied",
  });
  const client = { send: async () => { throw accessDenied; } };

  await assert.rejects(
    ensureMaterialBucket(client, "lab-materials"),
    (error) => error === accessDenied,
  );
});

test("S3のNoSuchKeyを本文なしの取得結果に変換する", async () => {
  const client = {
    async send(command) {
      assert.ok(command instanceof GetObjectCommand);
      assert.deepEqual(command.input, { Bucket: "lab-materials", Key: "old-key" });
      throw new NoSuchKey({ $metadata: { httpStatusCode: 404 }, message: "gone" });
    },
  };
  assert.deepEqual(await getMaterialObject(client, "lab-materials", "old-key"), { body: null });
});

test("NoSuchKey以外のストレージエラーはそのまま返す", async () => {
  for (const [name, status] of [["AccessDenied", 403], ["NoSuchBucket", 404], ["TimeoutError", undefined]]) {
    const failure = Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });
    const client = { async send() { throw failure; } };
    await assert.rejects(getMaterialObject(client, "lab-materials", "old-key"), (error) => error === failure);
  }
});
