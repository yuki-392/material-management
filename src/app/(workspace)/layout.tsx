import { auth, signOut } from "@/auth";
import { isProfileComplete } from "@/lib/authorization";
import { getAuthRedirect } from "@/lib/auth-routing.js";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Image from "next/image";
import type { ReactNode } from "react";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) {
    redirect("/login");
  }

  const session = await auth();

  if (!session?.user?.id) {
    const destination = getAuthRedirect("workspace", false, false);
    redirect(destination ?? "/login");
  }

  const profile = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { userType: true, studentNumber: true },
  });
  const destination = getAuthRedirect(
    "workspace",
    true,
    isProfileComplete(profile),
  );

  if (destination) {
    redirect(destination);
  }

  async function logOut() {
    "use server";

    const currentSession = await auth();
    if (!currentSession?.user) {
      redirect("/login");
    }

    await signOut({ redirectTo: "/login" });
  }

  const name = session.user.name?.trim() || "名前未設定";
  const email = session.user.email || "メールアドレス未設定";
  const avatarInitial = (session.user.name?.trim() || session.user.email || "U")
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-sm font-semibold text-indigo-700">
              研究室・ゼミのタスク管理
            </p>
            <p className="mt-1 text-xs text-slate-500">ワークスペース</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {session.user.image ? (
              <Image
                alt=""
                className="size-11 rounded-full object-cover"
                height={44}
                src={session.user.image}
                width={44}
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-11 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-800"
              >
                {avatarInitial}
              </span>
            )}

            <div className="min-w-0 flex-1 sm:flex-initial">
              <p className="truncate text-sm font-semibold text-slate-900">
                {name}
              </p>
              <p className="truncate text-xs text-slate-600">{email}</p>
            </div>

            <form action={logOut}>
              <button
                className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                type="submit"
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
