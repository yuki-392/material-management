import assert from "node:assert/strict";
import test from "node:test";

import {
  MaterialOperationError,
  createMaterial,
  createMaterialFileResponse,
  deleteMaterial,
  getMaterialFile,
  listLabMaterials,
} from "../src/lib/material-core.js";
import { StorageQuotaError } from "../src/lib/storage-quota-core.js";

function createTestQuota(operations = []) {
  return {
    reserve: async () => {
      operations.push("quota-reserve");
      return "reservation-1";
    },
    commit: async (db, reservationId, data) => {
      assert.equal(reservationId, "reservation-1");
      return db.material.create({ data });
    },
    release: async (_db, reservationId) => {
      assert.equal(reservationId, "reservation-1");
      operations.push("quota-release");
      return true;
    },
  };
}

function materialRow(overrides = {}) {
  return {
    id: "material-1",
    labId: "lab-1",
    title: "Lab notes",
    description: null,
    originalFileName: "paper.pdf",
    storageKey: "labs/lab-1/materials/key-1",
    contentType: "application/pdf",
    sizeBytes: 1024,
    uploaderId: "user-1",
    createdAt: new Date("2026-09-28T10:00:00.000Z"),
    updatedAt: new Date("2026-09-28T10:00:00.000Z"),
    ...overrides,
  };
}

test("対象Lab内の資料だけを検索・絞り込み・ページ分割する", async () => {
  const calls = [];
  const expected = [materialRow()];
  const db = {
    material: {
      count: async (args) => {
        calls.push(["material.count", args]);
        return 1;
      },
      findMany: async (args) => {
        calls.push(["material.findMany", args]);
        return expected;
      },
    },
  };

  const result = await listLabMaterials(db, {
    labId: "lab-1",
    query: "paper",
    type: "image",
    uploaderId: "user-1",
    page: 1,
  });
  const expectedWhere = {
    labId: "lab-1",
    contentType: { in: ["image/jpeg", "image/png"] },
    uploaderId: "user-1",
    OR: [
      { title: { contains: "paper", mode: "insensitive" } },
      { description: { contains: "paper", mode: "insensitive" } },
      { originalFileName: { contains: "paper", mode: "insensitive" } },
    ],
  };

  assert.deepEqual(result, {
    items: expected,
    totalCount: 1,
    page: 1,
    pageCount: 1,
  });
  assert.deepEqual(calls[0], ["material.count", { where: expectedWhere }]);
  assert.equal(calls[1][0], "material.findMany");
  assert.deepEqual(calls[1][1].where, expectedWhere);
  assert.deepEqual(calls[1][1].orderBy, [
    { createdAt: "desc" },
    { id: "desc" },
  ]);
  assert.equal(calls[1][1].skip, 0);
  assert.equal(calls[1][1].take, 20);
});

test("一致する資料がない場合は空の1ページ目を返す", async () => {
  let findManyArgs;
  const db = {
    material: {
      count: async () => 0,
      findMany: async (args) => {
        findManyArgs = args;
        return [];
      },
    },
  };

  const result = await listLabMaterials(db, { labId: "lab-1", page: 5 });

  assert.deepEqual(result, {
    items: [],
    totalCount: 0,
    page: 1,
    pageCount: 1,
  });
  assert.equal(findManyArgs.skip, 0);
});

test("サーバーが生成したキーとセッションの投稿者IDを使ってアップロードする", async () => {
  const operations = [];
  let createdData;
  const db = {
    material: {
      create: async ({ data }) => {
        operations.push("database-create");
        createdData = data;
        return materialRow(data);
      },
    },
  };
  const storage = {
    putObject: async ({ key, body, contentType, sizeBytes }) => {
      operations.push("storage-put");
      assert.match(key, /^labs\/lab-1\/materials\/[0-9a-f-]{36}$/);
      assert.deepEqual(body, new Uint8Array([1, 2, 3]));
      assert.equal(contentType, "application/pdf");
      assert.equal(sizeBytes, 3);
      return key;
    },
    deleteObject: async () => operations.push("storage-delete"),
  };

  await createMaterial(db, storage, {
    labId: "lab-1",
    userId: "session-user",
    title: "Lab notes",
    description: null,
    originalFileName: "paper.pdf",
    contentType: "application/pdf",
    sizeBytes: 3,
    body: new Uint8Array([1, 2, 3]),
    storageKey: "client-controlled-key",
  }, createTestQuota(operations));

  assert.deepEqual(operations, ["quota-reserve", "storage-put", "database-create"]);
  assert.equal(createdData.uploaderId, "session-user");
  assert.notEqual(createdData.storageKey, "client-controlled-key");
  assert.match(createdData.storageKey, /^labs\/lab-1\/materials\//);
});

test("容量上限を超えるアップロードはストレージに書き込む前に拒否する", async () => {
  let storageCalled = false;
  const quota = {
    reserve: async () => {
      throw new StorageQuotaError("LAB_QUOTA_EXCEEDED");
    },
    commit: async () => assert.fail("quota-limited upload cannot commit"),
    release: async () => assert.fail("no reservation was created"),
  };
  const storage = {
    putObject: async () => {
      storageCalled = true;
    },
    deleteObject: async () => {},
  };

  await assert.rejects(
    createMaterial(
      { material: { create: async () => assert.fail("DB must not be called") } },
      storage,
      {
        labId: "lab-1",
        userId: "user-1",
        title: "Lab notes",
        description: null,
        originalFileName: "paper.pdf",
        contentType: "application/pdf",
        sizeBytes: 4,
        body: new Uint8Array([1, 2, 3, 4]),
      },
      quota,
    ),
    (error) => error instanceof StorageQuotaError && error.code === "LAB_QUOTA_EXCEEDED",
  );
  assert.equal(storageCalled, false);
});

test("DBに資料を登録できなかった場合は保存済みのファイルを補償削除する", async () => {
  const operations = [];
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);
  const db = {
    material: {
      findUnique: async () => {
        operations.push("database-check");
        return null;
      },
      create: async () => {
        operations.push("database-create");
        throw new Error("database failure");
      },
    },
  };
  const storage = {
    putObject: async ({ key }) => operations.push(`storage-put:${key}`),
    deleteObject: async (key) => operations.push(`storage-delete:${key}`),
  };

  try {
    await assert.rejects(
      createMaterial(db, storage, {
        labId: "lab-1",
        userId: "user-1",
        title: "Lab notes",
        description: null,
        originalFileName: "paper.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
        body: new Uint8Array([1, 2, 3]),
      }, createTestQuota(operations)),
      (error) =>
        error instanceof MaterialOperationError &&
        error.code === "METADATA_CREATE_FAILED" &&
        error.cause?.message === "database failure",
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(operations[0], "quota-reserve");
  assert.equal(operations[1].startsWith("storage-put:labs/lab-1/materials/"), true);
  assert.equal(operations[2], "database-create");
  assert.equal(
    operations[5],
    `storage-delete:${operations[1].slice("storage-put:".length)}`,
  );
  assert.equal(operations[3], "quota-release");
  assert.equal(operations[4], "database-check");
  assert.deepEqual(logs, [
    ["Material operation failed.", { stage: "material.upload.metadata-create", name: "Error" }],
  ]);
});

test("ストレージへの保存に失敗した場合はエラーを分類し、資料をDBに登録しない", async () => {
  const storageFailure = Object.assign(new Error("storage failure"), {
    name: "AccessDenied",
  });
  let databaseCalled = false;
  const db = {
    material: {
      create: async () => {
        databaseCalled = true;
      },
    },
  };
  const storage = {
    putObject: async () => { throw storageFailure; },
    deleteObject: async () => {},
  };

  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    await assert.rejects(
      createMaterial(db, storage, {
        labId: "lab-1",
        userId: "user-1",
        title: "Lab notes",
        description: null,
        originalFileName: "paper.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
        body: new Uint8Array([1, 2, 3]),
      }, createTestQuota()),
      (error) =>
        error instanceof MaterialOperationError &&
        error.code === "STORAGE_UPLOAD_FAILED" &&
        error.cause === storageFailure,
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(databaseCalled, false);
  assert.deepEqual(logs, [
    ["Material operation failed.", { stage: "material.upload.storage-put", name: "AccessDenied" }],
  ]);
});

test("ストレージ設定の失敗とファイル保存の失敗を区別してログに記録する", async () => {
  const configurationFailure = Object.assign(
    new Error("storage credentials are missing"),
    { code: "MISSING_STORAGE_CONFIGURATION" },
  );
  const db = { material: { create: async () => assert.fail("DB must not be called") } };
  const storage = {
    putObject: async () => { throw configurationFailure; },
    deleteObject: async () => {},
  };
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);

  try {
    await assert.rejects(
      createMaterial(db, storage, {
        labId: "lab-1",
        userId: "user-1",
        title: "Lab notes",
        description: null,
        originalFileName: "paper.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
        body: new Uint8Array([1, 2, 3]),
      }, createTestQuota()),
      (error) =>
        error instanceof MaterialOperationError &&
        error.code === "STORAGE_CONFIGURATION_FAILED" &&
        error.cause === configurationFailure,
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(logs, [
    [
      "Material operation failed.",
      {
        stage: "material.upload.storage-config",
        name: "Error",
        code: "MISSING_STORAGE_CONFIGURATION",
      },
    ],
  ]);
});

test("補償削除に失敗した場合は安全な情報だけをログに記録する", async () => {
  const operations = [];
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);
  const db = {
    material: {
      findUnique: async () => {
        operations.push("database-check");
        return null;
      },
      create: async () => {
        operations.push("database-create");
        throw Object.assign(new Error("database failure with private row data"), {
          code: "P2002",
        });
      },
    },
  };
  const storage = {
    putObject: async () => operations.push("storage-put"),
    deleteObject: async () => {
      operations.push("storage-delete");
      throw Object.assign(new Error("private storage key"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403, requestId: "request-456" },
      });
    },
  };

  try {
    await assert.rejects(
      createMaterial(db, storage, {
        labId: "lab-1",
        userId: "user-1",
        title: "Lab notes",
        description: null,
        originalFileName: "private-paper.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
        body: new Uint8Array([1, 2, 3]),
      }, createTestQuota(operations)),
      (error) =>
        error instanceof MaterialOperationError &&
        error.code === "METADATA_CREATE_FAILED",
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(operations, [
    "quota-reserve",
    "storage-put",
    "database-create",
    "quota-release",
    "database-check",
    "storage-delete",
  ]);
  assert.equal(logs.length, 2);
  assert.deepEqual(logs[0][1], {
    stage: "material.upload.metadata-create",
    name: "Error",
    code: "P2002",
  });
  assert.deepEqual(logs[1][1], {
    stage: "material.upload.compensation-delete",
    name: "AccessDenied",
    httpStatusCode: 403,
    requestId: "request-456",
  });
  assert.doesNotMatch(JSON.stringify(logs), /private|paper|user-1|lab-1/);
});

test("資料IDとLab IDで資料を検索し、DBに記録されたキーでファイルを取得する", async () => {
  const queries = [];
  const fetchedKeys = [];
  const expectedBody = new Uint8Array([37, 80, 68, 70]);
  const db = {
    material: {
      findFirst: async (args) => {
        queries.push(args.where);
        return materialRow();
      },
    },
  };
  const storage = {
    getObject: async (key) => {
      fetchedKeys.push(key);
      return { body: expectedBody };
    },
  };

  const result = await getMaterialFile(db, storage, {
    labId: "lab-1",
    materialId: "material-1",
  });

  assert.deepEqual(queries, [{ id: "material-1", labId: "lab-1" }]);
  assert.deepEqual(fetchedKeys, ["labs/lab-1/materials/key-1"]);
  assert.equal(result.body, expectedBody);
});

test("対象Labで資料が見つからない場合はストレージにアクセスしない", async () => {
  let storageCalled = false;
  const db = { material: { findFirst: async () => null } };
  const storage = { getObject: async () => (storageCalled = true) };

  await assert.rejects(
    getMaterialFile(db, storage, {
      labId: "other-lab",
      materialId: "material-1",
    }),
    (error) => error instanceof MaterialOperationError && error.code === "NOT_FOUND",
  );
  assert.equal(storageCalled, false);
});

const fileLookup = { labId: "lab-1", materialId: "material-1" };

function createFileReads(rows, bodies) {
  const reads = [];
  const keys = [];
  const db = {
    material: {
      async findFirst({ where }) {
        reads.push(where);
        assert.ok(rows.length > 0, "unexpected extra database lookup");
        return rows.shift();
      },
    },
  };
  const storage = {
    async getObject(key) {
      keys.push(key);
      assert.ok(bodies.length > 0, "unexpected extra storage lookup");
      const body = bodies.shift();
      if (body instanceof Error) throw body;
      return { body };
    },
  };
  return { reads, keys, db, storage };
}

test("旧キーが見つからない場合は再取得し、差し替え後のファイルと資料情報を返す", async () => {
  const old = materialRow();
  const body = new Uint8Array([1, 2, 3]);
  const replacement = materialRow({
    storageKey: "replacement-key",
    originalFileName: "seminar.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: body.byteLength,
  });
  const { reads, keys, db, storage } = createFileReads([old, replacement], [null, body]);

  const file = await getMaterialFile(db, storage, fileLookup);
  const response = createMaterialFileResponse(file.material, file.body);

  assert.deepEqual(reads, Array(2).fill({ id: fileLookup.materialId, labId: fileLookup.labId }));
  assert.deepEqual(keys, [old.storageKey, replacement.storageKey]);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), body);
  assert.equal(response.headers.get("content-type"), replacement.contentType);
  assert.equal(response.headers.get("content-length"), String(body.byteLength));
  assert.match(response.headers.get("content-disposition"), /^attachment;.*seminar\.docx/);
});

for (const scenario of [
  { label: "資料行が削除された", current: null, code: "NOT_FOUND", keys: 1 },
  { label: "キーが変わっていない", current: materialRow(), code: "STORAGE_OBJECT_MISSING", keys: 1 },
  { label: "差し替え後のファイルも見つからない", current: materialRow({ storageKey: "replacement-key" }), code: "STORAGE_OBJECT_MISSING", keys: 2 },
]) {
  test(`${scenario.label}場合はファイル取得を打ち切る`, async () => {
    const { reads, keys, db, storage } = createFileReads([materialRow(), scenario.current], [null, null]);

    await assert.rejects(getMaterialFile(db, storage, fileLookup), { code: scenario.code });

    assert.equal(reads.length, 2);
    assert.equal(keys.length, scenario.keys);
  });
}

test("ストレージ障害では資料を再検索しない", async () => {
  const failure = new Error("storage offline");
  const { reads, keys, db, storage } = createFileReads([materialRow()], [failure]);

  await assert.rejects(getMaterialFile(db, storage, fileLookup), (error) => error === failure);
  assert.equal(reads.length, 1);
  assert.equal(keys.length, 1);
});

test("資料行をロックし、ファイルを削除してから対象Labの資料行を削除する", async () => {
  const operations = [];
  const tx = {
    async $queryRaw(_strings, ...values) {
      assert.deepEqual(values, ["material-1", "lab-1"]);
      operations.push("lock");
    },
    material: {
      async findFirst({ where }) {
        assert.deepEqual(where, { id: "material-1", labId: "lab-1" });
        return materialRow({ lab: { ownerId: "owner" } });
      },
      async delete({ where }) {
        operations.push("database-delete");
        assert.deepEqual(where, { id: "material-1", labId: "lab-1" });
      },
    },
  };
  const db = { $transaction: (callback) => callback(tx) };
  const storage = {
    async deleteObject(key) {
      operations.push("storage-delete");
      assert.equal(key, "labs/lab-1/materials/key-1");
    },
  };
  const input = { labId: "lab-1", materialId: "material-1", userId: "owner" };

  await deleteMaterial(db, storage, input);
  assert.deepEqual(operations, ["lock", "storage-delete", "database-delete"]);

  operations.length = 0;
  await assert.rejects(deleteMaterial(db, storage, { ...input, userId: "member" }), { code: "NOT_FOUND" });
  assert.deepEqual(operations, ["lock"]);

  operations.length = 0;
  storage.deleteObject = async () => { throw new Error("storage unavailable"); };
  await assert.rejects(deleteMaterial(db, storage, input), { code: "STORAGE_DELETE_FAILED" });
  assert.deepEqual(operations, ["lock"]);
});

test("PDFと画像はブラウザーで表示し、Officeファイルは添付として返す", () => {
  const pdf = createMaterialFileResponse(
    materialRow(),
    new Uint8Array([1]),
  );
  const office = createMaterialFileResponse(
    materialRow({
      originalFileName: "report.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    new Uint8Array([1]),
  );

  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.match(pdf.headers.get("content-disposition"), /^inline;/);
  assert.equal(pdf.headers.get("cache-control"), "private, no-store");
  assert.match(office.headers.get("content-disposition"), /^attachment;/);
  assert.match(office.headers.get("content-disposition"), /report\.docx/);
});

test("HTTPヘッダーに入れる前にファイル名から危険な文字を除く", () => {
  const response = createMaterialFileResponse(
    materialRow({ originalFileName: 'bad\r\n"name".pdf' }),
    new Uint8Array([1]),
  );

  assert.doesNotMatch(response.headers.get("content-disposition"), /\r|\n/);
});

test("PostgreSQLの登録成功の応答を受け取れなくても登録済み資料を復旧する", async (t) => {
  t.mock.method(console, "error", () => {});
  const body = new Uint8Array([1, 2, 3]);
  let row;
  let uploadedKey;
  let reservationChecked = false;
  const db = {
    material: {
      async findUnique({ where }) {
        assert.equal(reservationChecked, true);
        assert.deepEqual(where, { storageKey: uploadedKey, labId: "lab-1" });
        return row;
      },
      async findFirst({ where }) {
        assert.deepEqual(where, { id: row.id, labId: "lab-1" });
        return row;
      },
    },
  };
  const storage = {
    async putObject({ key }) { uploadedKey = key; },
    async deleteObject() { assert.fail("referenced object must be kept"); },
    async getObject(key) {
      assert.equal(key, uploadedKey);
      return { body };
    },
  };
  const result = await createMaterial(db, storage, {
    labId: "lab-1", userId: "user-1", title: "Lab notes", description: null,
    originalFileName: "paper.pdf", contentType: "application/pdf", sizeBytes: body.length, body,
  }, {
    reserve: async () => "reservation-1",
    commit: async (_db, _reservationId, data) => {
      row = { id: "material-1", ...data };
      throw new Error("connection lost after commit");
    },
    release: async () => {
      reservationChecked = true;
      return false;
    },
  });
  assert.equal(result, row);
  assert.equal((await getMaterialFile(db, storage, {
    labId: "lab-1", materialId: result.id,
  })).body, body);
});

test("予約が期限切れの場合は資料行がないと確認してからファイルを削除する", async (t) => {
  t.mock.method(console, "error", () => {});
  const operations = [];
  let uploadedKey;
  const db = { material: { async findUnique() {
    operations.push("check");
    return null;
  } } };

  await assert.rejects(createMaterial(db, {
    async putObject({ key }) { uploadedKey = key; },
    async deleteObject(key) {
      assert.equal(key, uploadedKey);
      operations.push("delete");
    },
  }, {
    labId: "lab-1", userId: "user-1", title: "Lab notes", description: null,
    originalFileName: "paper.pdf", contentType: "application/pdf", sizeBytes: 1, body: new Uint8Array(1),
  }, {
    reserve: async () => "reservation-1",
    commit: async () => { throw new StorageQuotaError("RESERVATION_EXPIRED"); },
    release: async () => { operations.push("release"); return false; },
  }), { code: "METADATA_CREATE_FAILED" });

  assert.deepEqual(operations, ["release", "check", "delete"]);
});

for (const [failureStage, label] of [
  ["reservation-release", "予約の解放"],
  ["commit-check", "登録結果の確認"],
]) {
  test(`${label}に失敗した場合はアップロードしたファイルを保持する`, async (t) => {
    const log = t.mock.method(console, "error", () => {});
    const db = { material: { async findUnique() {
      assert.equal(failureStage, "commit-check");
      throw new Error("private connection string");
    } } };
    let deleted = false;

    await assert.rejects(createMaterial(db, {
      putObject: async () => {},
      deleteObject: async () => { deleted = true; },
    }, {
      labId: "lab-1", userId: "user-1", title: "Lab notes", description: null,
      originalFileName: "paper.pdf", contentType: "application/pdf", sizeBytes: 1, body: new Uint8Array(1),
    }, {
      reserve: async () => "reservation-1",
      commit: async () => { throw new Error("unknown commit outcome"); },
      release: async () => {
        if (failureStage === "reservation-release") throw new Error("private connection string");
        return true;
      },
    }), { code: "METADATA_CREATE_UNCONFIRMED" });
    assert.equal(deleted, false);
    assert.deepEqual(log.mock.calls[1].arguments[1], {
      stage: `material.upload.${failureStage}`, name: "Error",
    });
  });
}
