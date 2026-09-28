import { auth } from "@/auth";
import { isProfileComplete } from "@/lib/authorization";
import { getAuthRedirect } from "@/lib/auth-routing.js";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function HomePage() {
  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) {
    redirect("/login");
  }

  const session = await auth();
  const profile = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { userType: true, studentNumber: true },
      })
    : null;
  const destination = getAuthRedirect(
    "root",
    Boolean(session?.user?.id),
    isProfileComplete(profile),
  );

  redirect(destination ?? "/login");
}
