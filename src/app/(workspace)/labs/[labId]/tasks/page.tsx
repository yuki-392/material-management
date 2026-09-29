import { notFound, redirect } from "next/navigation";

import {
  AuthorizationError,
  requireLabMember,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { listTasksForLab } from "@/lib/task-core.js";
import { formatTokyoDateTimeLocal } from "@/lib/task-validation.js";
import {
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  TaskStatusBadge,
} from "@/components/ui";

import {
  CreateTaskForm,
  DeleteTaskForm,
  EditTaskForm,
  type EditableTask,
  type TaskFormMember,
} from "./task-forms";

export default async function LabTasksPage({
  params,
}: {
  params: Promise<{ labId: string }>;
}) {
  const { labId } = await params;

  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) {
    redirect("/login");
  }

  let access;
  try {
    access = await requireLabMember(labId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }
      if (error.code === "PROFILE_INCOMPLETE") {
        redirect("/profile/setup");
      }
      if (error.code === "LAB_NOT_FOUND") {
        notFound();
      }
    }

    throw error;
  }

  const [lab, tasks, labMembers] = await Promise.all([
    prisma.lab.findUnique({
      where: { id: access.labId },
      select: { id: true, name: true },
    }),
    listTasksForLab(prisma, access.labId),
    prisma.labMember.findMany({
      where: { labId: access.labId },
      orderBy: { joinedAt: "asc" },
      select: {
        userId: true,
        user: {
          select: { name: true, email: true },
        },
      },
    }),
  ]);

  if (!lab) {
    notFound();
  }

  const members: TaskFormMember[] = labMembers.map((member) => ({
    id: member.userId,
    name: member.user.name,
    email: member.user.email,
  }));
  const editableTasks: EditableTask[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    assigneeId: task.assigneeId,
    dueAtLocal: formatTokyoDateTimeLocal(task.dueAt),
  }));

  return (
    <div className="space-y-7 sm:space-y-8">
      <PageHeader
        eyebrow={lab.name}
        title="Task"
        description="担当者・締切・進捗を確認し、Lab内の作業を管理します。"
        actions={
          <ButtonLink href="/labs" variant="secondary">
            Labへ戻る
          </ButtonLink>
        }
      />

      <Card aria-labelledby="create-task-heading" id="create-task">
        <div>
          <p className="text-sm font-semibold text-indigo-700">新しい作業</p>
          <h2
            className="mt-1 text-xl font-bold text-slate-950"
            id="create-task-heading"
          >
            Taskを作成
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            作成後も、Labメンバー全員が内容を編集できます。
          </p>
        </div>
        <CreateTaskForm labId={access.labId} members={members} />
      </Card>

      <Card aria-labelledby="task-list-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            className="text-xl font-bold text-slate-950"
            id="task-list-heading"
          >
            登録済みTask
          </h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold tabular-nums text-slate-700">
            {tasks.length}件
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="Taskはまだありません"
              description="最初のTaskを作成して、担当者や締切を共有しましょう。"
              action={
                <ButtonLink href="#create-task" variant="secondary">
                  作成フォームへ
                </ButtonLink>
              }
            />
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
            {tasks.map((task, index) => {
              const editableTask = editableTasks[index];
              const assignee = task.assignee
                ? task.assignee.name?.trim() ||
                  task.assignee.email ||
                  "名前未設定"
                : null;

              return (
                <li className="py-5 sm:py-6" key={task.id}>
                  <article>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h3 className="min-w-0 break-words text-lg font-semibold text-slate-950">
                        {task.title}
                      </h3>
                      <TaskStatusBadge status={task.status} />
                    </div>

                    {task.description ? (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                        {task.description}
                      </p>
                    ) : null}

                    <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2 sm:p-4">
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          担当者
                        </dt>
                        <dd className="mt-1 break-words font-medium text-slate-800">
                          {assignee ?? "未設定"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">締切</dt>
                        <dd className="mt-1 font-medium text-slate-800">
                          {task.dueAt
                            ? new Intl.DateTimeFormat("ja-JP", {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "Asia/Tokyo",
                              }).format(task.dueAt)
                            : "未設定"}
                        </dd>
                      </div>
                    </dl>

                    <details className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 open:bg-slate-50/60">
                      <summary className="cursor-pointer rounded text-sm font-semibold text-indigo-800 marker:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">
                        編集
                      </summary>
                      <EditTaskForm
                        labId={access.labId}
                        members={members}
                        task={editableTask}
                      />
                    </details>

                    <div className="mt-3 flex justify-end">
                      <DeleteTaskForm
                        labId={access.labId}
                        taskId={task.id}
                        taskTitle={task.title}
                      />
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
