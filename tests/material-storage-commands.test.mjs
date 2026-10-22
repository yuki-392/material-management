import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  ensureMaterialBucket,
  putMaterialObject,
} from "../src/lib/material-storage-commands.js";

test("uploads an object without attempting to create its bucket", async () => {
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

test("creates the local bucket during setup and tolerates an existing bucket", async () => {
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

test("does not hide local bucket setup failures other than an existing bucket", async () => {
  const accessDenied = Object.assign(new Error("denied"), {
    name: "AccessDenied",
  });
  const client = { send: async () => { throw accessDenied; } };

  await assert.rejects(
    ensureMaterialBucket(client, "lab-materials"),
    (error) => error === accessDenied,
  );
});
