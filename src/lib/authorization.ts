import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  AuthorizationError,
  createAuthorizationHelpers,
  isProfileComplete,
} from "@/lib/authorization-core.js";

export { AuthorizationError, isProfileComplete };

const authorization = createAuthorizationHelpers({
  getSession: auth,
  db: prisma,
});

export const {
  requireUser,
  requireLabMember,
  requireLabOwner,
} = authorization;
