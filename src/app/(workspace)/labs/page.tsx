import { redirect } from "next/navigation";

import {
  AuthorizationError,
  requireProfileCompleteUser,
  requireLabMember,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { getLabCreationCapacity } from "@/lib/storage-quota-core.js";
import { ButtonLink, Card, EmptyState, PageHeader, TaskStatusBadge } from "@/components/ui";
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
    const capacity = await getLabCreationCapacity(prisma);
    const canCreateLab = capacity.canCreate;
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="ワークスペース"
          title="Lab"
          description="研究室のメンバーとタスクや資料を共有する場所です。"
        />
        <Card>
          <EmptyState
            title={canCreateLab ? "まだLabに所属していません" : "Labを作成できません"}
            description={
              canCreateLab
                ? "Labを作成すると、あなたがOwner兼最初のメンバーになります。Ownerから招待される場合は、登録済みのメールアドレスを伝えてください。"
                : capacity.labCount >= capacity.maxLabCount
                  ? "アプリで作成できる研究室は累計8件までです。管理者にお問い合わせください。"
                  : "新しい研究室に割り当てる保存容量がありません。管理者にお問い合わせください。"
            }
            action={canCreateLab ? <ButtonLink href="/labs/new">Labを作成する</ButtonLink> : undefined}
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
  const now = new Date();
  const [myTasks, upcomingTasks, recentMaterials] = await Promise.all([
    prisma.task.findMany({
      where: { labId: labAccess.labId, assigneeId: labAccess.userId, status: { not: "DONE" } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 5,
      select: { id: true, title: true, status: true, dueAt: true },
    }),
    prisma.task.findMany({
      where: { labId: labAccess.labId, status: { not: "DONE" }, dueAt: { not: null } },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: 5,
      select: { id: true, title: true, status: true, dueAt: true, assignee: { select: { name: true, email: true } } },
    }),
    prisma.material.findMany({
      where: { labId: labAccess.labId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 4,
      select: { id: true, title: true, description: true, contentType: true, createdAt: true, uploader: { select: { name: true, email: true } } },
    }),
  ]);
  const tasksHref = `/labs/${encodeURIComponent(lab.id)}/tasks`;
  const materialsHref = `/labs/${encodeURIComponent(lab.id)}/materials`;

  return (
    <div className="space-y-7 sm:space-y-8">
      <PageHeader
        eyebrow="ワークスペース"
        title={lab.name}
        description={`${isOwner ? "Owner兼メンバー" : "メンバー"} · タスク、締切、最近の資料を確認できます`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card aria-labelledby="my-tasks-heading" className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-indigo-700">自分が担当</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950" id="my-tasks-heading">未完了のタスク</h2>
            </div>
            <ButtonLink className="min-h-9 px-3 text-xs" href={`${tasksHref}?assignee=me`} variant="secondary">一覧を見る</ButtonLink>
          </div>
          {myTasks.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {myTasks.map((task) => (
                <li className="flex min-w-0 items-start justify-between gap-3 py-3" key={task.id}>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-900">{task.title}</p>
                    <p className={`mt-1 text-xs ${task.dueAt && task.dueAt < now ? "font-semibold text-rose-700" : "text-slate-500"}`}>{task.dueAt ? `締切 ${formatTokyoDate(task.dueAt)}${task.dueAt < now ? " · 期限超過" : ""}` : "締切未設定"}</p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3"><EmptyState title="担当中の未完了タスクはありません" description="担当が割り当てられると、ここから締切と進捗を確認できます。" action={<ButtonLink href={tasksHref} variant="secondary">タスクを見る</ButtonLink>} /></div>
          )}
        </Card>

        <Card aria-labelledby="upcoming-tasks-heading" className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-amber-700">Lab全体</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950" id="upcoming-tasks-heading">締切が近いタスク</h2>
            </div>
            <ButtonLink className="min-h-9 px-3 text-xs" href={`${tasksHref}?sort=due`} variant="secondary">締切順で見る</ButtonLink>
          </div>
          {upcomingTasks.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {upcomingTasks.map((task) => (
                <li className="flex min-w-0 items-start justify-between gap-3 py-3" key={task.id}>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-900">{task.title}</p>
                    <p className={`mt-1 text-xs ${task.dueAt && task.dueAt < now ? "font-semibold text-rose-700" : "text-slate-500"}`}>{task.assignee?.name?.trim() || task.assignee?.email || "担当者なし"} · 締切 {task.dueAt ? `${formatTokyoDate(task.dueAt)}${task.dueAt < now ? " · 期限超過" : ""}` : "未設定"}</p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3"><EmptyState title="近い締切のタスクはありません" description="新しいタスクを登録したり、一覧で未設定の締切を確認できます。" action={<ButtonLink href={tasksHref} variant="secondary">タスクを見る</ButtonLink>} /></div>
          )}
        </Card>

        <Card aria-labelledby="recent-materials-heading" className="p-4 sm:col-span-2 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-700">最近追加</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950" id="recent-materials-heading">資料</h2>
            </div>
            <ButtonLink className="min-h-9 px-3 text-xs" href={materialsHref} variant="secondary">資料一覧を見る</ButtonLink>
          </div>
          {recentMaterials.length ? (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {recentMaterials.map((material) => (
                <li className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3" key={material.id}>
                  <p className="break-words text-sm font-semibold text-slate-900">{material.title}</p>
                  <p className="mt-1 line-clamp-2 break-words text-sm text-slate-600">{material.description || getMaterialTypeLabel(material.contentType)}</p>
                  <p className="mt-2 text-xs text-slate-500">{material.uploader?.name?.trim() || material.uploader?.email || "登録者不明"} · {formatTokyoDate(material.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3"><EmptyState title="最近追加された資料はありません" description="資料を追加すると、投稿者と登録日をここで確認できます。" action={<ButtonLink href={materialsHref} variant="secondary">資料を追加</ButtonLink>} /></div>
          )}
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

function formatTokyoDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function getMaterialTypeLabel(contentType: string) {
  if (contentType === "application/pdf") return "PDF";
  if (contentType.startsWith("image/")) return "画像ファイル";
  if (contentType.includes("wordprocessingml")) return "Wordファイル";
  if (contentType.includes("presentationml")) return "PowerPointファイル";
  if (contentType.includes("spreadsheetml")) return "Excelファイル";
  return "資料ファイル";
}
