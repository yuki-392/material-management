const MAX_EMAIL_LENGTH = 254;
const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Validate and normalize an email entered by a Lab owner.
 * Lowercasing is used for lookup because email addresses are treated
 * case-insensitively by this application.
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
