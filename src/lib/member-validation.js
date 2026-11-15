const MAX_EMAIL_LENGTH = 254;
const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * LabのOwnerが入力したメールアドレスを検証し、正規化する。
 * このアプリでは大文字・小文字を区別しないため、検索用の値は小文字に統一する。
 *
 * @param {unknown} value
 * @returns {{ success: true, email: string } | { success: false, error: string }}
 */
export function validateMemberEmail(value) {
  if (typeof value !== "string") {
    return { success: false, error: "メールアドレスを入力してください。" };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { success: false, error: "メールアドレスを入力してください。" };
  }

  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return {
      success: false,
      error: "メールアドレスは254文字以内で入力してください。",
    };
  }

  if (!BASIC_EMAIL_PATTERN.test(trimmed)) {
    return { success: false, error: "メールアドレスの形式を確認してください。" };
  }

  return { success: true, email: trimmed.toLowerCase() };
}
