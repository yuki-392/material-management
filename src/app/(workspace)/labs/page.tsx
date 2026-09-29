import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AuthorizationError,
  requireProfileCompleteUser,
  requireLabMember,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { AddMemberForm, RemoveMemberForm } from "./member-management";

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
  let labAccess;

  try {
    labAccess = await requireLabMember(lab.id);
  } catch (error) {
    if (error instanceof AuthorizationError && error.code === "LAB_NOT_FOUND") {
      redirect("/labs");
    }

    throw error;
  }

  const members = await prisma.labMember.findMany({
    where: { labId: labAccess.labId },
    orderBy: { joinedAt: "asc" },
    select: {
      userId: true,
      joinedAt: true,
      user: {
        select: {
          name: true,
          email: true,
          userType: true,
        },
      },
    },
  });
  const isOwner = lab.ownerId === labAccess.userId;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-indigo-700">ワークスペース</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          {lab.name}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {isOwner ? "Owner・メンバー" : "メンバー"}
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

      <section
        aria-labelledby="lab-members-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            className="text-xl font-bold tracking-tight text-slate-900"
            id="lab-members-heading"
          >
            メンバー
          </h2>
          <p className="text-sm text-slate-500">{members.length}人</p>
        </div>

        <ul className="mt-5 divide-y divide-slate-200">
          {members.map((member) => {
            const memberName = member.user.name?.trim() || "名前未設定";
            const userTypeLabel =
              member.user.userType === "STUDENT"
                ? "学生"
                : member.user.userType === "TEACHER"
                  ? "教員"
                  : "未設定";
            const isMemberOwner = member.userId === lab.ownerId;

            return (
              <li
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                key={member.userId}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-slate-900">
                      {memberName}
                    </p>
                    {isMemberOwner ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                        Owner
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 break-all text-sm text-slate-600">
                    {member.user.email || "メールアドレス未登録"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {userTypeLabel} · 参加日{" "}
                    {new Intl.DateTimeFormat("ja-JP", {
                      dateStyle: "medium",
                      timeZone: "Asia/Tokyo",
                    }).format(member.joinedAt)}
                  </p>
                </div>

                {isOwner && !isMemberOwner ? (
                  <RemoveMemberForm
                    labId={lab.id}
                    memberName={memberName}
                    userId={member.userId}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        {isOwner ? (
          <div className="mt-5 border-t border-slate-200 pt-5">
            <h3 className="text-base font-semibold text-slate-900">
              メンバーを追加
            </h3>
            <AddMemberForm labId={lab.id} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
