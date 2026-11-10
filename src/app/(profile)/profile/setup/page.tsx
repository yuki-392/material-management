import { AuthorizationError, isProfileComplete, requireUser } from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { getAuthRedirect } from "@/lib/auth-routing.js";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";

import { ProfileForm } from "./profile-form";

export default async function ProfileSetupPage() {
  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) {
    redirect("/login");
  }

  let currentUser;

  try {
    currentUser = await requireUser();
  } catch (error) {
    if (
      error instanceof AuthorizationError &&
      error.code === "UNAUTHENTICATED"
    ) {
      const destination = getAuthRedirect("profile-setup", false, false);
      redirect(destination ?? "/login");
    }

    throw error;
  }

  const profile = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { name: true, userType: true, studentNumber: true },
  });

  const destination = getAuthRedirect(
    "profile-setup",
    true,
    isProfileComplete(profile),
  );

  if (destination) {
    redirect(destination);
  }

  return (
    <main
      className="app-shell flex min-h-screen items-center justify-center px-4 py-10 sm:py-16"
      id="main-content"
      tabIndex={-1}
    >
      <Card className="w-full max-w-xl p-6 sm:p-8">
        <PageHeader
          eyebrow="アカウント設定"
          title="プロフィール設定"
          description="区分を登録してください。学生は学生番号が必要です。保存後、Labを作成するか、Ownerから招待されたLabに参加できます。"
        />
        <ProfileForm
          name={profile?.name ?? ""}
          userType={profile?.userType ?? ""}
          studentNumber={profile?.studentNumber ?? ""}
        />
      </Card>
    </main>
  );
}
