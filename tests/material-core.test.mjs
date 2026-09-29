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

test("lists only a Lab's materials in newest-first order", async () => {
  let query;
  const expected = [materialRow()];
  const db = {
    material: {
      findMany: async (args) => {
        query = args;
        return expected;
      },
    },
  };

  const result = await listLabMaterials(db, { labId: "lab-1" });

  assert.deepEqual(result, expected);
  assert.deepEqual(query.where, { labId: "lab-1" });
  assert.deepEqual(query.orderBy, { createdAt: "desc" });
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
  });

  assert.deepEqual(operations, ["storage-put", "database-create"]);
  assert.equal(createdData.uploaderId, "session-user");
  assert.notEqual(createdData.storageKey, "client-controlled-key");
  assert.match(createdData.storageKey, /^labs\/lab-1\/materials\//);
});

test("compensates a failed metadata insert by deleting the uploaded object", async () => {
  const operations = [];
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
    }),
    /database failure/,
  );

  assert.equal(operations[0].startsWith("storage-put:labs/lab-1/materials/"), true);
  assert.equal(operations[1], "database-create");
  assert.equal(
    operations[2],
    `storage-delete:${operations[0].slice("storage-put:".length)}`,
  );
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
