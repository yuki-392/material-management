import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { isProfileComplete } from "@/lib/authorization";
import { getAuthRedirect } from "@/lib/auth-routing.js";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
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

  const membership = await prisma.labMember.findUnique({
    where: { userId: session.user.id },
    select: { labId: true },
  });

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
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <Link
              className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600"
              href="/labs"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-700 text-sm font-bold text-white shadow-sm"
              >
                研
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-950 group-hover:text-indigo-800">
                  研究室・ゼミ
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  タスク・資料管理
                </span>
              </span>
            </Link>

            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              {session.user.image ? (
                <Image
                  alt=""
                  className="size-10 shrink-0 rounded-full object-cover ring-2 ring-slate-100"
                  height={40}
                  src={session.user.image}
                  width={40}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-800 ring-2 ring-white"
                >
                  {avatarInitial}
                </span>
              )}

              <div className="min-w-0 max-w-[42vw] sm:max-w-52">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {name}
                </p>
                <p className="truncate text-xs text-slate-600">{email}</p>
              </div>

              <form action={logOut}>
                <Button
                  className="min-h-10 px-3 text-xs sm:text-sm"
                  type="submit"
                  variant="secondary"
                >
                  ログアウト
                </Button>
              </form>
            </div>
          </div>

          <div className="mt-4">
            <WorkspaceNavigation labId={membership?.labId ?? null} />
          </div>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 sm:py-9 lg:px-8"
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
