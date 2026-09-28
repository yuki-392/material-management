/**
 * @param {"root" | "login" | "workspace" | "profile-setup"} route
 * @param {boolean} isAuthenticated
 * @param {boolean} profileComplete
 * @returns {"/login" | "/labs" | "/profile/setup" | null}
 */
export function getAuthRedirect(route, isAuthenticated, profileComplete) {
  if (route === "root") {
    if (!isAuthenticated) return "/login";
    return profileComplete ? "/labs" : "/profile/setup";
  }

  if (route === "login" && isAuthenticated) {
    return profileComplete ? "/labs" : "/profile/setup";
  }

  if (route === "workspace") {
    if (!isAuthenticated) return "/login";
    return profileComplete ? null : "/profile/setup";
  }

  if (route === "profile-setup") {
    if (!isAuthenticated) return "/login";
    return profileComplete ? "/labs" : null;
  }

  return null;
}
