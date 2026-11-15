const TOKYO_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 未完了タスクの締切の近さを、日本時間の日付に基づく短い文言で返す。
 * @param {Date | null} dueAt
 * @param {"TODO" | "IN_PROGRESS" | "DONE"} status
 * @param {Date} [now]
 */
export function getTaskDeadlineHint(dueAt, status, now = new Date()) {
  if (!dueAt || status === "DONE") {
    return "";
  }

  if (dueAt.getTime() < now.getTime()) {
    return "期限超過";
  }

  const dayDifference =
    getTokyoDayNumber(dueAt) - getTokyoDayNumber(now);

  return dayDifference === 0 ? "今日まで" : `あと${dayDifference}日`;
}

/** @param {Date} date */
function getTokyoDayNumber(date) {
  const parts = TOKYO_DATE_FORMATTER.formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return (
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)) /
    86_400_000
  );
}
