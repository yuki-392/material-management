export const LIST_PAGE_SIZE = 20;

/** @typedef {"" | "TODO" | "IN_PROGRESS" | "DONE"} TaskListStatus */
/** @typedef {"" | "pdf" | "word" | "powerpoint" | "excel" | "image"} MaterialListType */
/** @typedef {"list" | "board"} TaskView */
/** @typedef {"recent" | "due"} TaskSort */
/** @typedef {"" | "overdue"} TaskFocus */

const taskStatuses = new Set(["TODO", "IN_PROGRESS", "DONE"]);
const materialTypes = new Set([
  "pdf",
  "word",
  "powerpoint",
  "excel",
  "image",
]);

/** @param {unknown} value */
export function parseListSearch(value) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

/** @param {unknown} value @returns {TaskListStatus} */
export function parseTaskStatus(value) {
  return typeof value === "string" && taskStatuses.has(value) ? value : "";
}

/** @param {unknown} value @returns {TaskView} */
export function parseTaskView(value) {
  return value === "board" ? "board" : "list";
}

/** @param {unknown} value @returns {TaskSort} */
export function parseTaskSort(value) {
  return value === "due" ? "due" : "recent";
}

/** @param {unknown} value @returns {TaskFocus} */
export function parseTaskFocus(value) {
  return value === "overdue" ? "overdue" : "";
}

/**
 * @param {{[key: string]: string | string[] | undefined}} searchParams
 * @returns {Record<"TODO" | "IN_PROGRESS" | "DONE", number>}
 */
export function parseTaskBoardPages(searchParams) {
  return {
    TODO: parseListPage(searchParams.todoPage),
    IN_PROGRESS: parseListPage(searchParams.inProgressPage),
    DONE: parseListPage(searchParams.donePage),
  };
}

/** @param {unknown} value @param {string[]} [memberIds] */
export function parseTaskAssignee(value, memberIds = [], currentUserId = "") {
  if (typeof value !== "string" || value.length > 100) {
    return "";
  }

  const assignee = value.trim();
  if (assignee === "me") {
    return memberIds.includes(currentUserId) ? "me" : "";
  }

  if (assignee === "unassigned") {
    return assignee;
  }

  return memberIds.includes(assignee) ? assignee : "";
}

/** @param {unknown} value @returns {MaterialListType} */
export function parseMaterialType(value) {
  return typeof value === "string" && materialTypes.has(value) ? value : "";
}

/** @param {unknown} value @param {string[]} memberIds */
export function parseMaterialUploader(value, memberIds) {
  return typeof value === "string" && memberIds.includes(value) ? value : "";
}

/** @param {unknown} value */
export function parseListPage(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return 1;
  }

  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/** @param {string} path @param {Record<string, string | number | undefined>} filters */
export function buildListPageHref(path, filters) {
  const params = new URLSearchParams();

  for (const key of [
    "q",
    "status",
    "assignee",
    "type",
    "uploader",
    "view",
    "sort",
    "focus",
    "page",
    "todoPage",
    "inProgressPage",
    "donePage",
  ]) {
    const value = filters[key];
    if (typeof value === "string" && value) {
      params.set(key, value);
    } else if (
      key.toLowerCase().endsWith("page") &&
      Number.isSafeInteger(value) &&
      value > 0
    ) {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
