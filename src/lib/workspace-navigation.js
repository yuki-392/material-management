/** @typedef {{label: string, href: string, match: "exact" | "section" | "anchor"}} WorkspaceNavigationItem */

/**
 * @param {string | null} labId
 * @param {boolean} [isAppAdmin]
 * @returns {WorkspaceNavigationItem[]}
 */
export function getWorkspaceNavigationItems(labId, isAppAdmin = false) {
  const items = [{ label: "ホーム", href: "/labs", match: "exact" }];

  if (labId) {
    const encodedLabId = encodeURIComponent(labId);
    items.push(
      {
        label: "タスク",
        href: `/labs/${encodedLabId}/tasks`,
        match: "section",
      },
      {
        label: "資料",
        href: `/labs/${encodedLabId}/materials`,
        match: "section",
      },
      {
        label: "メンバー",
        href: "/labs#lab-members-heading",
        match: "anchor",
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

  if (item.match === "anchor") {
    return false;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
