import { handlers } from "@/auth";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import type { NextRequest } from "next/server";

function requireAuthEnvironment(
  handler: (request: NextRequest) => Promise<Response>,
) {
  return async (request: NextRequest) => {
    const missingEnvironmentVariables =
      getMissingAuthEnvironmentVariables();

    if (missingEnvironmentVariables.length > 0) {
      return Response.json(
        {
          error: "Auth.js is not configured.",
          missingEnvironmentVariables,
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return handler(request);
  };
}

export const GET = requireAuthEnvironment(handlers.GET);
export const POST = requireAuthEnvironment(handlers.POST);
