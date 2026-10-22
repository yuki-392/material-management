export const LIST_PAGE_SIZE = 20;

/** @typedef {"" | "TODO" | "IN_PROGRESS" | "DONE"} TaskListStatus */
/** @typedef {"" | "pdf" | "word" | "powerpoint" | "excel" | "image"} MaterialListType */

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

/** @param {unknown} value @param {string[]} [memberIds] */
export function parseTaskAssignee(value, memberIds = []) {
  if (typeof value !== "string" || value.length > 100) {
    return "";
  }

  const assignee = value.trim();
  if (assignee === "unassigned") {
    return assignee;
  }

  return memberIds.includes(assignee) ? assignee : "";
}

/** @param {unknown} value @returns {MaterialListType} */
export function parseMaterialType(value) {
  return typeof value === "string" && materialTypes.has(value) ? value : "";
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

  for (const key of ["q", "status", "assignee", "type", "page"]) {
    const value = filters[key];
    if (typeof value === "string" && value) {
      params.set(key, value);
    } else if (key === "page" && Number.isSafeInteger(value) && value > 0) {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
