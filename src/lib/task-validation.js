export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 5000;

const ALLOWED_STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);
const TOKYO_LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;

/**
 * @typedef {"TODO" | "IN_PROGRESS" | "DONE"} TaskStatusValue
 * @typedef {{
 *   title: string,
 *   description: string | null,
 *   status: TaskStatusValue,
 *   assigneeId: string | null,
 *   dueAt: Date | null
 * }} TaskInput
 * @typedef {{ success: true, data: TaskInput } | { success: false, fieldErrors: Partial<Record<"title" | "description" | "status" | "assigneeId" | "dueAt", string>> }} TaskValidationResult
 */

/**
 * Validate FormData-derived task fields without trusting browser validation.
 * `datetime-local` input is interpreted in Asia/Tokyo and converted to an
 * absolute instant before it is stored in PostgreSQL timestamptz.
 *
 * @param {{ title: unknown, description: unknown, status: unknown, assigneeId: unknown, dueAt: unknown }} input
 * @returns {TaskValidationResult}
 */
export function validateTaskInput({
  title,
  description,
  status,
  assigneeId,
  dueAt,
}) {
  const fieldErrors = {};
  let normalizedTitle = "";
  let normalizedDescription = null;
  let normalizedAssigneeId = null;
  let normalizedDueAt = null;

  if (typeof title !== "string") {
    fieldErrors.title = "タイトルを入力してください。";
  } else {
    normalizedTitle = title.trim();
    if (normalizedTitle.length === 0) {
      fieldErrors.title = "タイトルを入力してください。";
    } else if (normalizedTitle.length > TASK_TITLE_MAX_LENGTH) {
      fieldErrors.title = `タイトルは${TASK_TITLE_MAX_LENGTH}文字以内で入力してください。`;
    }
  }

  if (description === null) {
    normalizedDescription = null;
  } else if (typeof description !== "string") {
    fieldErrors.description = "説明は文字列で入力してください。";
  } else {
    const trimmedDescription = description.trim();
    if (trimmedDescription.length > TASK_DESCRIPTION_MAX_LENGTH) {
      fieldErrors.description = `説明は${TASK_DESCRIPTION_MAX_LENGTH}文字以内で入力してください。`;
    } else {
      normalizedDescription = trimmedDescription || null;
    }
  }

  if (!ALLOWED_STATUSES.has(status)) {
    fieldErrors.status = "ステータスを選択してください。";
  }

  if (assigneeId === null || assigneeId === "") {
    normalizedAssigneeId = null;
  } else if (typeof assigneeId !== "string") {
    fieldErrors.assigneeId = "担当者を選択してください。";
  } else {
    const trimmedAssigneeId = assigneeId.trim();
    if (trimmedAssigneeId.length > 100) {
      fieldErrors.assigneeId = "担当者を確認してください。";
    } else {
      normalizedAssigneeId = trimmedAssigneeId || null;
    }
  }

  const dueAtResult = parseTokyoDateTime(dueAt);
  if (!dueAtResult.success) {
    fieldErrors.dueAt = dueAtResult.error;
  } else {
    normalizedDueAt = dueAtResult.value;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    data: {
      title: normalizedTitle,
      description: normalizedDescription,
      status,
      assigneeId: normalizedAssigneeId,
      dueAt: normalizedDueAt,
    },
  };
}

/** @param {unknown} value */
function parseTokyoDateTime(value) {
  if (value === null || value === "") {
    return { success: true, value: null };
  }

  if (typeof value !== "string") {
    return { success: false, error: "締切日時を確認してください。" };
  }

  const match = TOKYO_LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) {
    return { success: false, error: "締切日時を確認してください。" };
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (year < 1000 || month < 1 || month > 12 || hour > 23 || minute > 59) {
    return { success: false, error: "締切日時を確認してください。" };
  }

  const localAsUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    localAsUtc.getUTCFullYear() !== year ||
    localAsUtc.getUTCMonth() !== month - 1 ||
    localAsUtc.getUTCDate() !== day
  ) {
    return { success: false, error: "締切日時を確認してください。" };
  }

  const tokyoOffsetMilliseconds = 9 * 60 * 60 * 1000;
  return {
    success: true,
    value: new Date(localAsUtc.getTime() - tokyoOffsetMilliseconds),
  };
}

/**
 * Format a stored instant for an Asia/Tokyo `datetime-local` input.
 *
 * @param {Date | null} value
 */
export function formatTokyoDateTimeLocal(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue]),
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
