export const MAX_MATERIAL_FILE_SIZE = 20 * 1024 * 1024;
export const MATERIAL_TITLE_MAX_LENGTH = 200;
export const MATERIAL_DESCRIPTION_MAX_LENGTH = 5000;
export const MATERIAL_FILE_NAME_MAX_LENGTH = 255;

const allowedFilesByExtension = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/**
 * @typedef {{title: string, description: string | null, originalFileName: string, contentType: string, sizeBytes: number}} MaterialInput
 * @typedef {{success: true, data: MaterialInput} | {success: false, fieldErrors: Partial<Record<"title" | "description" | "file", string>>}} MaterialValidationResult
 */

/**
 * Validate fields submitted by the browser. This deliberately checks both the
 * extension and browser-provided MIME type; it does not inspect file bytes.
 *
 * @param {{title: unknown, description: unknown, file: unknown}} input
 * @returns {MaterialValidationResult}
 */
export function validateMaterialInput({ title, description, file }) {
  /** @type {Partial<Record<"title" | "description" | "file", string>>} */
  const fieldErrors = {};

  let normalizedTitle = "";
  if (typeof title !== "string") {
    fieldErrors.title = "タイトルを入力してください。";
  } else {
    normalizedTitle = title.trim();
    if (normalizedTitle.length === 0) {
      fieldErrors.title = "タイトルを入力してください。";
    } else if (normalizedTitle.length > MATERIAL_TITLE_MAX_LENGTH) {
      fieldErrors.title = `タイトルは${MATERIAL_TITLE_MAX_LENGTH}文字以内で入力してください。`;
    }
  }

  let normalizedDescription = null;
  if (description !== null) {
    if (typeof description !== "string") {
      fieldErrors.description = "説明は文字列で入力してください。";
    } else {
      const trimmedDescription = description.trim();
      if (trimmedDescription.length > MATERIAL_DESCRIPTION_MAX_LENGTH) {
        fieldErrors.description = `説明は${MATERIAL_DESCRIPTION_MAX_LENGTH}文字以内で入力してください。`;
      } else if (trimmedDescription.length > 0) {
        normalizedDescription = trimmedDescription;
      }
    }
  }

  let originalFileName = "";
  let contentType = "";
  let sizeBytes = 0;

  if (
    !isFileLike(file) ||
    typeof file.name !== "string" ||
    typeof file.type !== "string" ||
    typeof file.size !== "number"
  ) {
    fieldErrors.file = "アップロードするファイルを選択してください。";
  } else {
    originalFileName = getSafeFileName(file.name);
    contentType = file.type.toLowerCase();
    sizeBytes = file.size;

    if (!originalFileName) {
      fieldErrors.file = "ファイル名を確認してください。";
    } else if (originalFileName.length > MATERIAL_FILE_NAME_MAX_LENGTH) {
      fieldErrors.file = `ファイル名は${MATERIAL_FILE_NAME_MAX_LENGTH}文字以内にしてください。`;
    } else if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
      fieldErrors.file = "空のファイルはアップロードできません。";
    } else if (sizeBytes > MAX_MATERIAL_FILE_SIZE) {
      fieldErrors.file = "ファイルサイズは20MiB以下にしてください。";
    } else {
      const extension = getFileExtension(originalFileName);
      const expectedContentType = allowedFilesByExtension[extension];

      if (!expectedContentType || expectedContentType !== contentType) {
        fieldErrors.file =
          "PDF、DOCX、PPTX、XLSX、JPEG、PNGのいずれかを選択してください。";
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    data: {
      title: normalizedTitle,
      description: normalizedDescription,
      originalFileName,
      contentType,
      sizeBytes,
    },
  };
}

/** @param {unknown} value */
function isFileLike(value) {
  return typeof value === "object" && value !== null && "arrayBuffer" in value;
}

/** @param {string} fileName */
function getSafeFileName(fileName) {
  const leafName = fileName.split(/[\\/]/).at(-1) ?? "";
  return leafName.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

/** @param {string} fileName */
function getFileExtension(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex < 0 ? "" : fileName.slice(dotIndex).toLowerCase();
}
