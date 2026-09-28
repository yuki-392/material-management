import { auth } from "@/auth";
import { getAuthRedirect } from "@/lib/auth-routing.js";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { redirect } from "next/navigation";

export default async function HomePage() {
  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) {
    redirect("/login");
  }

  const session = await auth();
  const destination = getAuthRedirect("root", Boolean(session?.user));

  redirect(destination ?? "/login");
}
