import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_MATERIAL_FILE_SIZE,
  validateMaterialInput,
} from "../src/lib/material-validation.js";

function validFile(overrides = {}) {
  return {
    name: "paper.pdf",
    type: "application/pdf",
    size: 1024,
    arrayBuffer: async () => new ArrayBuffer(0),
    ...overrides,
  };
}

function validInput(overrides = {}) {
  return {
    title: "  Lab notes  ",
    description: "  Meeting notes  ",
    file: validFile(),
    ...overrides,
  };
}

test("trims the title and description and strips path components from file names", () => {
  const result = validateMaterialInput(
    validInput({ file: validFile({ name: "C:\\fakepath\\paper.pdf" }) }),
  );

  assert.equal(result.success, true);
  assert.deepEqual(result.data, {
    title: "Lab notes",
    description: "Meeting notes",
    originalFileName: "paper.pdf",
    contentType: "application/pdf",
    sizeBytes: 1024,
  });
});

test("converts a whitespace-only optional description to null", () => {
  const result = validateMaterialInput(validInput({ description: "  " }));

  assert.equal(result.success, true);
  assert.equal(result.data.description, null);
});

test("rejects missing files and files larger than 20 MiB", () => {
  const missing = validateMaterialInput(validInput({ file: null }));
  const tooLarge = validateMaterialInput(
    validInput({ file: validFile({ size: MAX_MATERIAL_FILE_SIZE + 1 }) }),
  );

  assert.ok(missing.fieldErrors.file);
  assert.ok(tooLarge.fieldErrors.file);
});

test("accepts a file exactly at the 20 MiB limit", () => {
  const result = validateMaterialInput(
    validInput({ file: validFile({ size: MAX_MATERIAL_FILE_SIZE }) }),
  );

  assert.equal(result.success, true);
});

test("rejects unsupported extensions and MIME type/extension mismatches", () => {
  const unsupported = validateMaterialInput(
    validInput({ file: validFile({ name: "program.exe", type: "application/octet-stream" }) }),
  );
  const mismatch = validateMaterialInput(
    validInput({ file: validFile({ name: "photo.png", type: "image/jpeg" }) }),
  );

  assert.ok(unsupported.fieldErrors.file);
  assert.ok(mismatch.fieldErrors.file);
});

test("rejects an empty or overlong title and an overlong description", () => {
  const emptyTitle = validateMaterialInput(validInput({ title: "  " }));
  const longTitle = validateMaterialInput(validInput({ title: "x".repeat(201) }));
  const longDescription = validateMaterialInput(
    validInput({ description: "x".repeat(5001) }),
  );

  assert.ok(emptyTitle.fieldErrors.title);
  assert.ok(longTitle.fieldErrors.title);
  assert.ok(longDescription.fieldErrors.description);
});

test("rejects path-only and overlong file names", () => {
  const pathOnly = validateMaterialInput(
    validInput({ file: validFile({ name: "C:\\fakepath\\" }) }),
  );
  const longName = validateMaterialInput(
    validInput({ file: validFile({ name: `${"x".repeat(252)}.pdf` }) }),
  );

  assert.ok(pathOnly.fieldErrors.file);
  assert.ok(longName.fieldErrors.file);
});
