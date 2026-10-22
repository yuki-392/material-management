import "server-only";

import { auth } from "@/auth";
import { isAppAdminEmail } from "@/lib/storage-quota-core.js";

export class AppAdminAuthorizationError extends Error {
  constructor() {
    super("App administrator access is required.");
    this.name = "AppAdminAuthorizationError";
  }
}

export async function requireAppAdmin() {
  const session = await auth();
  const user = session?.user;
  if (
    !user?.id ||
    !isAppAdminEmail(user.email, process.env.APP_ADMIN_EMAILS)
  ) {
    throw new AppAdminAuthorizationError();
  }

  return { id: user.id, email: user.email };
}
