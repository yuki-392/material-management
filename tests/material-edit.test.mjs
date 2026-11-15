import assert from "node:assert/strict";
import test from "node:test";
import { canManageMaterial, updateMaterial } from "../src/lib/material-core.js";
import { StorageQuotaError } from "../src/lib/storage-quota-core.js";

function fixture() {
  const original = {
    id: "material", labId: "lab", title: "Original", description: "Notes",
    updatedAt: new Date("2026-09-28T10:00:00Z"), storageKey: "old-key",
    uploaderId: "author", sizeBytes: 20, lab: { ownerId: "owner" },
  };
  let row = { ...original };
  const operations = [];
  const db = { material: {
    async findFirst({ where }) {
      assert.deepEqual(where, { id: "material", labId: "lab" });
      return row;
    },
    async findUnique({ where }) {
      return row?.storageKey === where.storageKey ? row : null;
    },
    async updateMany({ where, data }) {
      if (!row || where.storageKey !== row.storageKey || +where.updatedAt !== +row.updatedAt) return { count: 0 };
      operations.push(["update"]);
      row = { ...row, ...data };
      return { count: 1 };
    },
  }};
  const storage = {
    async putObject({key}) { operations.push(["put", key]); },
    async deleteObject(key) { operations.push(["delete", key]); },
  };
  const quota = {
    async reserve(_db, {sizeBytes}) { operations.push(["reserve", sizeBytes]); return "reservation"; },
    async commit(_db, _reservation, update) { await update(db); operations.push(["consume"]); },
    async release() { operations.push(["release"]); },
  };
  const input = { labId: "lab", materialId: "material", userId: "author", updatedAt: original.updatedAt, title: "Edited", description: null, file: null };
  const file = (sizeBytes) => ({ sizeBytes, contentType: "application/pdf", originalFileName: "new.pdf", body: new Uint8Array(sizeBytes) });
  return { db, storage, quota, input, operations, file, get row() { return row; } };
}

test("only the author and Lab owner can manage a material", () => {
  for (const [userId, expected] of [["author", true], ["owner", true], ["member", false]]) {
    assert.equal(canManageMaterial(userId, "author", "owner"), expected);
  }
  assert.equal(canManageMaterial("owner", null, "owner"), true);
  assert.equal(canManageMaterial("author", null, "owner"), false);
});

test("metadata editing uses only the database; stale versions and regular members are rejected", async () => {
  const f = fixture();
  await assert.rejects(updateMaterial(f.db, f.storage, { ...f.input, userId: "member" }, f.quota), { code: "NOT_FOUND" });
  await updateMaterial(f.db, f.storage, f.input, f.quota);
  assert.deepEqual(f.operations, [["update"]]);
  assert.equal(f.row.title, "Edited");
  assert.equal(f.row.description, null);
  assert.equal(f.row.storageKey, "old-key");
  await assert.rejects(updateMaterial(f.db, f.storage, f.input, f.quota), { code: "CONFLICT" });
});

test("replacement reserves only growth, switches the reference before removing the old file", async () => {
  for (const size of [10, 20, 30]) {
    const f = fixture();
    await updateMaterial(f.db, f.storage, { ...f.input, file: f.file(size) }, f.quota);
    const key = f.row.storageKey;
    assert.match(key, /^labs\/lab\/materials\//);
    assert.equal(f.row.id, "material");
    assert.equal(f.row.uploaderId, "author");
    assert.equal(f.row.sizeBytes, size);
    assert.deepEqual(f.operations, [
      ...(size > 20 ? [["reserve", 10]] : []), ["put", key], ["update"],
      ...(size > 20 ? [["consume"]] : []), ["delete", "old-key"],
    ]);
  }
});

test("quota rejection skips storage, expired reservation cleans up the new file", async () => {
  const f = fixture();
  f.quota.reserve = async () => { throw new StorageQuotaError("LAB_QUOTA_EXCEEDED"); };
  await assert.rejects(updateMaterial(f.db, f.storage, { ...f.input, file: f.file(30) }, f.quota), { code: "LAB_QUOTA_EXCEEDED" });
  assert.deepEqual(f.operations, []);
  f.quota.reserve = async () => "reservation";
  f.quota.commit = async () => { throw new StorageQuotaError("RESERVATION_EXPIRED"); };
  await assert.rejects(updateMaterial(f.db, f.storage, { ...f.input, file: f.file(30) }, f.quota), { code: "RESERVATION_EXPIRED" });
  assert.equal(f.row.storageKey, "old-key");
  assert.deepEqual(f.operations, [["put", f.operations[0][1]], ["delete", f.operations[0][1]], ["release"]]);
});

test("a lost commit response does not remove a file referenced by the database", async () => {
  const f = fixture();
  f.quota.commit = async (db, _reservation, update) => {
    await update(db);
    throw new Error("connection lost");
  };
  await updateMaterial(f.db, f.storage, { ...f.input, file: f.file(30) }, f.quota);
  assert.deepEqual(f.operations.filter(([name]) => name === "delete"), [["delete", "old-key"]]);
  assert.equal(f.row.sizeBytes, 30);
});

test("a failed new upload releases capacity and leaves the current version available", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = fixture();
  f.storage.putObject = async ({ key }) => {
    f.operations.push(["put", key]);
    throw new Error("storage offline");
  };
  await assert.rejects(updateMaterial(f.db, f.storage, { ...f.input, file: f.file(30) }, f.quota), /storage offline/);
  assert.equal(f.row.storageKey, "old-key");
  assert.deepEqual(f.operations, [["reserve", 10], ["put", f.operations[1][1]], ["delete", f.operations[1][1]], ["release"]]);
});

test("a cleanup failure keeps the new version live and records its stage", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const f = fixture();
  f.storage.deleteObject = async () => { throw new Error("private credential"); };
  await updateMaterial(f.db, f.storage, { ...f.input, file: f.file(20) }, f.quota);
  assert.notEqual(f.row.storageKey, "old-key");
  assert.deepEqual(log.mock.calls[0].arguments, [
    "Material operation failed.", { stage: "material.replace.old-delete", name: "Error" },
  ]);
});

test("a second replacement of the same revision loses and cleans up its staged file", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    updateMaterial(f.db, f.storage, { ...f.input, file: f.file(10) }, f.quota),
    updateMaterial(f.db, f.storage, { ...f.input, file: f.file(15) }, f.quota),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const failure = results.find((result) => result.status === "rejected");
  assert.equal(failure.reason.code, "CONFLICT");
  const staged = f.operations.filter(([name, key]) => name === "put" && key !== f.row.storageKey);
  assert.equal(staged.length, 1);
  assert.ok(f.operations.some(([name, key]) => name === "delete" && key === staged[0][1]));
  assert.ok(!f.operations.some(([name, key]) => name === "delete" && key === f.row.storageKey));
});
