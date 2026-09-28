export const MAX_NAME_LENGTH = 100;
export const MAX_STUDENT_NUMBER_LENGTH = 50;

/**
 * @typedef {{ name: string | null, userType: "TEACHER" | "STUDENT", studentNumber: string | null }} ValidProfileInput
 * @typedef {Partial<Record<"name" | "userType" | "studentNumber", string>>} ProfileFieldErrors
 * @typedef {{ success: true, data: ValidProfileInput } | { success: false, fieldErrors: ProfileFieldErrors }} ProfileValidationResult
 */

/**
 * Validate and normalize untrusted profile form values.
 *
 * @param {{ name: unknown, userType: unknown, studentNumber: unknown }} input
 * @returns {ProfileValidationResult}
 */
export function validateProfileInput(input) {
  /** @type {ProfileFieldErrors} */
  const fieldErrors = {};

  const nameResult = readText(input.name);
  const userTypeResult = readText(input.userType);
  const studentNumberResult = readText(input.studentNumber);

  if (!nameResult.valid) {
    fieldErrors.name = "氏名は文字列で入力してください。";
  } else if (nameResult.value.length > MAX_NAME_LENGTH) {
    fieldErrors.name = `氏名は${MAX_NAME_LENGTH}文字以内で入力してください。`;
  }

  if (
    !userTypeResult.valid ||
    (userTypeResult.value !== "TEACHER" && userTypeResult.value !== "STUDENT")
  ) {
    fieldErrors.userType = "教員または学生を選択してください。";
  }

  if (!studentNumberResult.valid) {
    fieldErrors.studentNumber = "学生番号は文字列で入力してください。";
  } else if (studentNumberResult.value.length > MAX_STUDENT_NUMBER_LENGTH) {
    fieldErrors.studentNumber = `学生番号は${MAX_STUDENT_NUMBER_LENGTH}文字以内で入力してください。`;
  } else if (
    userTypeResult.valid &&
    userTypeResult.value === "STUDENT" &&
    studentNumberResult.value.length === 0
  ) {
    fieldErrors.studentNumber = "学生の場合は学生番号を入力してください。";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  const userType = /** @type {"TEACHER" | "STUDENT"} */ (
    userTypeResult.value
  );

  return {
    success: true,
    data: {
      name: nameResult.value || null,
      userType,
      studentNumber:
        userType === "STUDENT" ? studentNumberResult.value : null,
    },
  };
}

/** @param {unknown} value */
function readText(value) {
  if (value === null || value === undefined) {
    return { valid: true, value: "" };
  }

  if (typeof value !== "string") {
    return { valid: false, value: "" };
  }

  return { valid: true, value: value.trim() };
}
