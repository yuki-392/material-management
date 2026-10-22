/** @typedef {{label: string, href: string, match: "exact" | "section"}} WorkspaceNavigationItem */

/**
 * @param {string | null} labId
 * @param {boolean} [isAppAdmin]
 * @returns {WorkspaceNavigationItem[]}
 */
export function getWorkspaceNavigationItems(labId, isAppAdmin = false) {
  const items = [{ label: "Lab", href: "/labs", match: "exact" }];

  if (labId) {
    const encodedLabId = encodeURIComponent(labId);
    items.push(
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
    );
  }

  if (isAppAdmin) {
    items.push({
      label: "容量管理",
      href: "/admin/storage",
      match: "section",
    });
  }

  return items;
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
