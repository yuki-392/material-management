export const MAX_LAB_NAME_LENGTH = 100;

/**
 * @typedef {{ success: true, name: string } | { success: false, error: string }} LabNameValidation
 */

/** @param {unknown} value @returns {LabNameValidation} */
export function validateLabName(value) {
  if (typeof value !== "string") {
    return { success: false, error: "Lab名を文字列で入力してください。" };
  }

  const name = value.trim();

  if (name.length === 0) {
    return { success: false, error: "Lab名を入力してください。" };
  }

  if (name.length > MAX_LAB_NAME_LENGTH) {
    return {
      success: false,
      error: `Lab名は${MAX_LAB_NAME_LENGTH}文字以内で入力してください。`,
    };
  }

  return { success: true, name };
}
