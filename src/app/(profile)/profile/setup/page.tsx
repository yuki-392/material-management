import { AuthorizationError, isProfileComplete, requireUser } from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { getAuthRedirect } from "@/lib/auth-routing.js";
import { redirect } from "next/navigation";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-indigo-700">
          研究室・ゼミのタスク管理
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          プロフィール設定
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Lab機能を利用する前に、教員・学生の区分を登録してください。学生は学生番号が必要です。
        </p>
        <ProfileForm
          name={profile?.name ?? ""}
          userType={profile?.userType ?? ""}
          studentNumber={profile?.studentNumber ?? ""}
        />
      </section>
    </main>
  );
}
