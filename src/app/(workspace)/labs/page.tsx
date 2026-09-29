import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AuthorizationError,
  requireProfileCompleteUser,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";

export default async function LabsPage() {
  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) {
    redirect("/login");
  }

  let currentUser;

  try {
    currentUser = await requireProfileCompleteUser();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }

      if (error.code === "PROFILE_INCOMPLETE") {
        redirect("/profile/setup");
      }
    }

    throw error;
  }

  const membership = await prisma.labMember.findUnique({
    where: { userId: currentUser.id },
    select: {
      lab: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          createdAt: true,
        },
      },
    },
  });

  if (!membership) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-indigo-700">ワークスペース</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Lab
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
          まだLabに所属していません。新しく作成すると、あなたがOwner兼メンバーになります。
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          href="/labs/new"
        >
          Labを作成する
        </Link>
      </section>
    );
  }

  const lab = membership.lab;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-indigo-700">ワークスペース</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        {lab.name}
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        {lab.ownerId === currentUser.id ? "Owner・メンバー" : "メンバー"}
      </p>
      <dl className="mt-6 border-t border-slate-200 pt-4 text-sm">
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          <dt className="font-medium text-slate-700">作成日</dt>
          <dd className="text-slate-600">
            {new Intl.DateTimeFormat("ja-JP", {
              dateStyle: "medium",
              timeZone: "Asia/Tokyo",
            }).format(lab.createdAt)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
