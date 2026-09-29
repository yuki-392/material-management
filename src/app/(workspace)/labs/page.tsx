import { redirect } from "next/navigation";

import {
  AuthorizationError,
  requireProfileCompleteUser,
  requireLabMember,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
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
      <div className="space-y-6">
        <PageHeader
          eyebrow="ワークスペース"
          title="Lab"
          description="研究室のメンバーとタスクや資料を共有する場所です。"
        />
        <Card>
          <EmptyState
            title="まだLabに所属していません"
            description="Labを作成すると、あなたがOwner兼最初のメンバーになります。Ownerから招待される場合は、登録済みのメールアドレスを伝えてください。"
            action={<ButtonLink href="/labs/new">Labを作成する</ButtonLink>}
          />
        </Card>
      </div>
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
    <div className="space-y-7 sm:space-y-8">
      <PageHeader
        eyebrow="ワークスペース"
        title={lab.name}
        description={`${isOwner ? "Owner兼メンバー" : "メンバー"} · 作成日 ${new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }).format(lab.createdAt)}`}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <div>
            <p className="text-sm font-semibold text-indigo-700">タスク管理</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Task</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              担当者・締切・進捗をLabのメンバーと共有します。
            </p>
          </div>
          <ButtonLink
            className="mt-5 self-start"
            href={`/labs/${encodeURIComponent(lab.id)}/tasks`}
            variant="secondary"
          >
            Taskを開く
          </ButtonLink>
        </Card>

        <Card className="flex flex-col">
          <div>
            <p className="text-sm font-semibold text-indigo-700">資料管理</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">資料</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              研究に使うPDFやOfficeファイルをLab内で共有します。
            </p>
          </div>
          <ButtonLink
            className="mt-5 self-start"
            href={`/labs/${encodeURIComponent(lab.id)}/materials`}
            variant="secondary"
          >
            資料を開く
          </ButtonLink>
        </Card>
      </div>

      <Card
        aria-labelledby="lab-members-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-700">所属と管理</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950" id="lab-members-heading">
              メンバー
            </h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold tabular-nums text-slate-700">
            {members.length}人
          </span>
        </div>

        {members.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="メンバーがいません"
              description="LabのOwnerが最初のメンバーとして登録されます。"
            />
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
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
                  className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6"
                  key={member.userId}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-semibold text-slate-950">
                        {memberName}
                      </p>
                      {isMemberOwner ? (
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                          Owner
                        </span>
                      ) : null}
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {userTypeLabel}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-sm text-slate-600">
                      {member.user.email || "メールアドレス未登録"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      参加日{" "}
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
        )}

        {isOwner ? (
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 sm:p-5">
            <h3 className="text-base font-semibold text-slate-950">
              メンバーを追加
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              追加する人がアプリでGoogleログイン済みである必要があります。
            </p>
            <AddMemberForm labId={lab.id} />
          </div>
        ) : (
          <p className="mt-5 text-sm text-slate-500">
            メンバーの追加・削除はOwnerが行います。
          </p>
        )}
      </Card>
    </div>
  );
}
