import Link from "next/link";
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
  CreateTaskForm,
  DeleteTaskForm,
  EditTaskForm,
  type EditableTask,
  type TaskFormMember,
} from "./task-forms";

const statusLabels = {
  TODO: "TODO",
  IN_PROGRESS: "進行中",
  DONE: "完了",
} as const;

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
    <div className="space-y-6">
      <div>
        <Link
          className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
          href="/labs"
        >
          ← Labに戻る
        </Link>
        <p className="mt-4 text-sm font-semibold text-indigo-700">{lab.name}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Task一覧
        </h1>
      </div>

      <section
        aria-labelledby="create-task-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <h2
          className="text-lg font-bold text-slate-900"
          id="create-task-heading"
        >
          Taskを作成
        </h2>
        <CreateTaskForm labId={access.labId} members={members} />
      </section>

      <section
        aria-labelledby="task-list-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            className="text-lg font-bold text-slate-900"
            id="task-list-heading"
          >
            Task一覧
          </h2>
          <p className="text-sm text-slate-500">{tasks.length}件</p>
        </div>

        {tasks.length === 0 ? (
          <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            Taskはまだありません。上のフォームから作成できます。
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {tasks.map((task, index) => {
              const editableTask = editableTasks[index];
              const assignee = task.assignee
                ? task.assignee.name?.trim() ||
                  task.assignee.email ||
                  "名前未設定"
                : null;

              return (
                <li className="py-5" key={task.id}>
                  <article>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 flex-1 break-words font-semibold text-slate-900">
                        {task.title}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {statusLabels[task.status]}
                      </span>
                    </div>

                    {task.description ? (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                        {task.description}
                      </p>
                    ) : null}

                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt className="font-medium text-slate-700">担当</dt>
                        <dd className="text-slate-600">
                          {assignee ?? "未設定"}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="font-medium text-slate-700">締切</dt>
                        <dd className="text-slate-600">
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

                    <details className="mt-4 rounded-lg border border-slate-200 px-4 py-3">
                      <summary className="cursor-pointer text-sm font-medium text-indigo-700">
                        編集
                      </summary>
                      <EditTaskForm
                        labId={access.labId}
                        members={members}
                        task={editableTask}
                      />
                    </details>

                    <div className="mt-3">
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
      </section>
    </div>
  );
}
