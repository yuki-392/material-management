import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_MATERIAL_FILE_SIZE,
  validateMaterialInput,
  validateMaterialEditInput,
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

test("タイトルと説明の前後の空白を除き、ファイル名から親パスを取り除く", () => {
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

test("任意の説明が空白のみならnullに変換する", () => {
  const result = validateMaterialInput(validInput({ description: "  " }));

  assert.equal(result.success, true);
  assert.equal(result.data.description, null);
});

test("ファイルが未選択の場合と4MiBを超える場合は拒否する", () => {
  const missing = validateMaterialInput(validInput({ file: null }));
  const tooLarge = validateMaterialInput(
    validInput({ file: validFile({ size: MAX_MATERIAL_FILE_SIZE + 1 }) }),
  );

  assert.equal(MAX_MATERIAL_FILE_SIZE, 4 * 1024 * 1024);
  assert.ok(missing.fieldErrors.file);
  assert.ok(tooLarge.fieldErrors.file);
});

test("サイズがちょうど4MiBのファイルを受け付ける", () => {
  const result = validateMaterialInput(
    validInput({ file: validFile({ size: MAX_MATERIAL_FILE_SIZE }) }),
  );

  assert.equal(result.success, true);
});

test("未対応の拡張子やMIMEタイプと拡張子が一致しないファイルを拒否する", () => {
  const unsupported = validateMaterialInput(
    validInput({ file: validFile({ name: "program.exe", type: "application/octet-stream" }) }),
  );
  const mismatch = validateMaterialInput(
    validInput({ file: validFile({ name: "photo.png", type: "image/jpeg" }) }),
  );

  assert.ok(unsupported.fieldErrors.file);
  assert.ok(mismatch.fieldErrors.file);
});

test("タイトルが空欄または長すぎる場合と説明が長すぎる場合は拒否する", () => {
  const emptyTitle = validateMaterialInput(validInput({ title: "  " }));
  const longTitle = validateMaterialInput(validInput({ title: "x".repeat(201) }));
  const longDescription = validateMaterialInput(
    validInput({ description: "x".repeat(5001) }),
  );

  assert.ok(emptyTitle.fieldErrors.title);
  assert.ok(longTitle.fieldErrors.title);
  assert.ok(longDescription.fieldErrors.description);
});

test("ファイル名を含まないパスや長すぎるファイル名を拒否する", () => {
  const pathOnly = validateMaterialInput(
    validInput({ file: validFile({ name: "C:\\fakepath\\" }) }),
  );
  const longName = validateMaterialInput(
    validInput({ file: validFile({ name: `${"x".repeat(252)}.pdf` }) }),
  );

  assert.ok(pathOnly.fieldErrors.file);
  assert.ok(longName.fieldErrors.file);
});

test("編集時はファイルを選択せずに説明を空欄にできる", () => {
  assert.deepEqual(validateMaterialEditInput({ title: "  改訂版  ", description: "  ", file: null }), {
    success: true,
    data: { title: "改訂版", description: null, file: null },
  });
  assert.equal(validateMaterialEditInput({ title: "改訂版", description: "", file: "bad" }).success, false);
});

test("差し替えにも新規アップロードと同じ形式とサイズの制限を適用する", () => {
  assert.equal(validateMaterialEditInput(validInput({ file: validFile({ size: MAX_MATERIAL_FILE_SIZE }) })).success, true);
  for (const file of [
    validFile({ size: 0 }),
    validFile({ size: MAX_MATERIAL_FILE_SIZE + 1 }),
    validFile({ type: "text/plain" }),
  ]) {
    assert.ok(validateMaterialEditInput(validInput({ file })).fieldErrors.file);
  }
});
