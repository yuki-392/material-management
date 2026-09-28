/**
 * @param {"root" | "login" | "workspace"} route
 * @param {boolean} isAuthenticated
 * @returns {"/login" | "/labs" | null}
 */
export function getAuthRedirect(route, isAuthenticated) {
  if (route === "root") {
    return isAuthenticated ? "/labs" : "/login";
  }

  if (route === "login" && isAuthenticated) {
    return "/labs";
  }

  if (route === "workspace" && !isAuthenticated) {
    return "/login";
  }

  return null;
}
