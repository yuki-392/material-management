/** @typedef {{label: string, href: string, match: "exact" | "section"}} WorkspaceNavigationItem */

/**
 * @param {string | null} labId
 * @returns {WorkspaceNavigationItem[]}
 */
export function getWorkspaceNavigationItems(labId) {
  const items = [{ label: "Lab", href: "/labs", match: "exact" }];

  if (!labId) {
    return items;
  }

  const encodedLabId = encodeURIComponent(labId);

  return [
    ...items,
    {
      label: "Task",
      href: `/labs/${encodedLabId}/tasks`,
      match: "section",
    },
    {
      label: "資料",
      href: `/labs/${encodedLabId}/materials`,
      match: "section",
    },
  ];
}

/**
 * @param {string} pathname
 * @param {WorkspaceNavigationItem} item
 */
export function isWorkspaceNavigationItemActive(pathname, item) {
  if (item.match === "exact") {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
