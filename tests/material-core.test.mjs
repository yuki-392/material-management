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

test("searches, filters, and paginates only a Lab's materials", async () => {
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
    page: 1,
  });
  const expectedWhere = {
    labId: "lab-1",
    contentType: { in: ["image/jpeg", "image/png"] },
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

test("returns the first empty page when there are no matching materials", async () => {
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

test("uploads with a server-created key and the session uploader id", async () => {
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

test("rejects a quota-limited upload before writing to storage", async () => {
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

test("compensates a failed metadata insert by deleting the uploaded object", async () => {
  const operations = [];
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);
  const db = {
    material: {
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
    operations[3],
    `storage-delete:${operations[1].slice("storage-put:".length)}`,
  );
  assert.equal(operations[4], "quota-release");
  assert.deepEqual(logs, [
    ["Material operation failed.", { stage: "material.upload.metadata-create", name: "Error" }],
  ]);
});

test("tags storage upload failures and skips metadata creation", async () => {
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

test("logs storage configuration failures separately from object upload failures", async () => {
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

test("logs safe context when upload compensation fails", async () => {
  const operations = [];
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);
  const db = {
    material: {
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
    "storage-delete",
    "quota-release",
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

test("looks up a file using both Material id and Lab id, then fetches the DB key", async () => {
  let query;
  let fetchedKey;
  const expectedBody = new Uint8Array([37, 80, 68, 70]);
  const db = {
    material: {
      findFirst: async (args) => {
        query = args;
        return materialRow();
      },
    },
  };
  const storage = {
    getObject: async (key) => {
      fetchedKey = key;
      return { body: expectedBody };
    },
  };

  const result = await getMaterialFile(db, storage, {
    labId: "lab-1",
    materialId: "material-1",
  });

  assert.deepEqual(query.where, { id: "material-1", labId: "lab-1" });
  assert.equal(fetchedKey, "labs/lab-1/materials/key-1");
  assert.equal(result.body, expectedBody);
});

test("does not request storage when the Material is absent from the requested Lab", async () => {
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

test("deletes the object before deleting a Lab-scoped metadata row", async () => {
  const operations = [];
  const db = {
    material: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { id: "material-1", labId: "lab-1" });
        return materialRow();
      },
      deleteMany: async ({ where }) => {
        operations.push("database-delete");
        assert.deepEqual(where, { id: "material-1", labId: "lab-1" });
        return { count: 1 };
      },
    },
  };
  const storage = {
    deleteObject: async (key) => {
      operations.push("storage-delete");
      assert.equal(key, "labs/lab-1/materials/key-1");
    },
  };

  await deleteMaterial(db, storage, {
    labId: "lab-1",
    materialId: "material-1",
  });

  assert.deepEqual(operations, ["storage-delete", "database-delete"]);
});

test("keeps the DB row when object deletion fails", async () => {
  let databaseDeleted = false;
  const db = {
    material: {
      findFirst: async () => materialRow(),
      deleteMany: async () => {
        databaseDeleted = true;
        return { count: 1 };
      },
    },
  };
  const storage = {
    deleteObject: async () => {
      throw new Error("storage unavailable");
    },
  };

  await assert.rejects(
    deleteMaterial(db, storage, {
      labId: "lab-1",
      materialId: "material-1",
    }),
    (error) =>
      error instanceof MaterialOperationError &&
      error.code === "STORAGE_DELETE_FAILED",
  );
  assert.equal(databaseDeleted, false);
});

test("uses inline responses for PDF/images and attachment for Office files", () => {
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

test("sanitizes file names before placing them in HTTP headers", () => {
  const response = createMaterialFileResponse(
    materialRow({ originalFileName: 'bad\r\n"name".pdf' }),
    new Uint8Array([1]),
  );

  assert.doesNotMatch(response.headers.get("content-disposition"), /\r|\n/);
});
