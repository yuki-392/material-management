import { notFound, redirect } from "next/navigation";

import {
  AuthorizationError,
  requireLabMember,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { listTasksForLab } from "@/lib/task-core.js";
import {
  buildListPageHref,
  LIST_PAGE_SIZE,
  parseListPage,
  parseListSearch,
  parseTaskAssignee,
  parseTaskStatus,
} from "@/lib/list-query.js";
import { formatTokyoDateTimeLocal } from "@/lib/task-validation.js";
import {
  Button,
  ButtonLink,
  Card,
  controlClassName,
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
  searchParams,
}: {
  params: Promise<{ labId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ labId }, rawSearchParams] = await Promise.all([params, searchParams]);

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

  const [lab, labMembers] = await Promise.all([
    prisma.lab.findUnique({
      where: { id: access.labId },
      select: { id: true, name: true },
    }),
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
  const filters = {
    query: parseListSearch(rawSearchParams.q),
    status: parseTaskStatus(rawSearchParams.status),
    assignee: parseTaskAssignee(
      rawSearchParams.assignee,
      members.map((member) => member.id),
    ),
    page: parseListPage(rawSearchParams.page),
  };
  const tasks = await listTasksForLab(prisma, {
    labId: access.labId,
    query: filters.query,
    status: filters.status || undefined,
    assigneeId:
      filters.assignee === "unassigned"
        ? null
        : filters.assignee || undefined,
    page: filters.page,
  });
  const editableTasks: EditableTask[] = tasks.items.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    assigneeId: task.assigneeId,
    dueAtLocal: formatTokyoDateTimeLocal(task.dueAt),
  }));
  const tasksPath = `/labs/${encodeURIComponent(access.labId)}/tasks`;
  const resultStart = tasks.totalCount === 0 ? 0 : (tasks.page - 1) * LIST_PAGE_SIZE + 1;
  const resultEnd = Math.min(tasks.page * LIST_PAGE_SIZE, tasks.totalCount);
  const hasActiveFilters = Boolean(
    filters.query || filters.status || filters.assignee,
  );

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
            {tasks.totalCount}件
            {tasks.totalCount > 0 ? `（${resultStart}〜${resultEnd}件表示）` : ""}
          </span>
        </div>

        <form
          action={tasksPath}
          className="mt-5 grid gap-4 border-y border-slate-200 py-5 md:grid-cols-2 xl:grid-cols-4"
          method="get"
        >
          <div className="md:col-span-2">
            <label
              className="text-sm font-semibold text-slate-700"
              htmlFor="task-search"
            >
              キーワード
            </label>
            <input
              className={`mt-2 ${controlClassName}`}
              defaultValue={filters.query}
              id="task-search"
              maxLength={100}
              name="q"
              placeholder="タイトル・説明を検索"
              type="search"
            />
          </div>
          <div>
            <label
              className="text-sm font-semibold text-slate-700"
              htmlFor="task-status-filter"
            >
              状態
            </label>
            <select
              className={`mt-2 ${controlClassName}`}
              defaultValue={filters.status}
              id="task-status-filter"
              name="status"
            >
              <option value="">すべて</option>
              <option value="TODO">未着手</option>
              <option value="IN_PROGRESS">進行中</option>
              <option value="DONE">完了</option>
            </select>
          </div>
          <div>
            <label
              className="text-sm font-semibold text-slate-700"
              htmlFor="task-assignee-filter"
            >
              担当者
            </label>
            <select
              className={`mt-2 ${controlClassName}`}
              defaultValue={filters.assignee}
              id="task-assignee-filter"
              name="assignee"
            >
              <option value="">すべて</option>
              <option value="unassigned">未設定</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name?.trim() || member.email || "名前未設定"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-4">
            <Button type="submit">検索</Button>
            <ButtonLink href={tasksPath} variant="secondary">
              条件をクリア
            </ButtonLink>
          </div>
        </form>

        {tasks.totalCount === 0 ? (
          <div className="mt-5">
            <EmptyState
              title={
                hasActiveFilters
                  ? "条件に一致するTaskはありません"
                  : "Taskはまだありません"
              }
              description={
                hasActiveFilters
                  ? "検索語や絞り込み条件を変更してください。"
                  : "最初のTaskを作成して、担当者や締切を共有しましょう。"
              }
              action={
                <ButtonLink
                  href={hasActiveFilters ? tasksPath : "#create-task"}
                  variant="secondary"
                >
                  {hasActiveFilters ? "条件をクリア" : "作成フォームへ"}
                </ButtonLink>
              }
            />
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
            {tasks.items.map((task, index) => {
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

                    <dl className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2 sm:p-4">
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

                    <details className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 open:bg-slate-50/60">
                      <summary className="cursor-pointer rounded text-sm font-semibold text-indigo-800 marker:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">
                        {task.description ? "説明・編集" : "編集"}
                      </summary>
                      {task.description ? (
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                          {task.description}
                        </p>
                      ) : null}
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

        {tasks.pageCount > 1 ? (
          <nav
            aria-label="Task一覧のページ"
            className="mt-5 flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-slate-600">
              {tasks.page} / {tasks.pageCount}ページ
            </p>
            <div className="flex gap-2">
              {tasks.page > 1 ? (
                <ButtonLink
                  href={buildListPageHref(tasksPath, {
                    q: filters.query,
                    status: filters.status,
                    assignee: filters.assignee,
                    page: tasks.page - 1,
                  })}
                  variant="secondary"
                >
                  前へ
                </ButtonLink>
              ) : (
                <Button disabled type="button" variant="secondary">
                  前へ
                </Button>
              )}
              {tasks.page < tasks.pageCount ? (
                <ButtonLink
                  href={buildListPageHref(tasksPath, {
                    q: filters.query,
                    status: filters.status,
                    assignee: filters.assignee,
                    page: tasks.page + 1,
                  })}
                  variant="secondary"
                >
                  次へ
                </ButtonLink>
              ) : (
                <Button disabled type="button" variant="secondary">
                  次へ
                </Button>
              )}
            </div>
          </nav>
        ) : null}
      </Card>
    </div>
  );
}
