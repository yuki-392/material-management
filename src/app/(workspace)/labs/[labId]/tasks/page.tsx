import Form from "next/form";
import { notFound, redirect } from "next/navigation";

import { AuthorizationError, requireLabMember } from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { listTasksForLab } from "@/lib/task-core.js";
import {
  buildListPageHref,
  parseListPage,
  parseListSearch,
  parseTaskAssignee,
  parseTaskBoardPages,
  parseTaskFocus,
  parseTaskSort,
  parseTaskStatus,
  parseTaskView,
} from "@/lib/list-query.js";
import { Button, ButtonLink, Card, controlClassName, PageHeader } from "@/components/ui";
import { CreateTaskForm, type TaskFormMember } from "./task-forms";
import { TaskBoardResults, TaskListResults, TaskPagination } from "./task-results";

export default async function LabTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ labId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ labId }, rawSearchParams] = await Promise.all([params, searchParams]);

  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) redirect("/login");

  let access;
  try {
    access = await requireLabMember(labId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "UNAUTHENTICATED") redirect("/login");
      if (error.code === "PROFILE_INCOMPLETE") redirect("/profile/setup");
      if (error.code === "LAB_NOT_FOUND") notFound();
    }
    throw error;
  }

  const [lab, labMembers] = await Promise.all([
    prisma.lab.findUnique({ where: { id: access.labId }, select: { id: true, name: true } }),
    prisma.labMember.findMany({
      where: { labId: access.labId },
      orderBy: { joinedAt: "asc" },
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  if (!lab) notFound();

  const members: TaskFormMember[] = labMembers.map((member) => ({
    id: member.userId,
    name: member.user.name,
    email: member.user.email,
  }));
  const filters = {
    query: parseListSearch(rawSearchParams.q),
    status: parseTaskStatus(rawSearchParams.status),
    assignee: parseTaskAssignee(rawSearchParams.assignee, members.map((member) => member.id), access.userId),
    view: parseTaskView(rawSearchParams.view),
    sort: parseTaskSort(rawSearchParams.sort),
    focus: parseTaskFocus(rawSearchParams.focus),
    page: parseListPage(rawSearchParams.page),
    boardPages: parseTaskBoardPages(rawSearchParams),
  };
  const tasksPath = `/labs/${encodeURIComponent(access.labId)}/tasks`;
  const assigneeId = filters.assignee === "me"
    ? access.userId
    : filters.assignee === "unassigned"
      ? null
      : filters.assignee || undefined;
  const overdueBefore = filters.focus === "overdue" ? new Date() : undefined;
  const queryOptions = {
    labId: access.labId,
    query: filters.query,
    assigneeId,
    sort: filters.sort,
    overdueBefore,
  };

  const [tasks, todoTasks, inProgressTasks, doneTasks] = await Promise.all([
    filters.view === "list"
      ? listTasksForLab(prisma, { ...queryOptions, status: filters.status || undefined, page: filters.page })
      : Promise.resolve(null),
    filters.view === "board"
      ? listTasksForLab(prisma, { ...queryOptions, status: "TODO", page: filters.boardPages.TODO })
      : Promise.resolve(null),
    filters.view === "board"
      ? listTasksForLab(prisma, { ...queryOptions, status: "IN_PROGRESS", page: filters.boardPages.IN_PROGRESS })
      : Promise.resolve(null),
    filters.view === "board"
      ? listTasksForLab(prisma, { ...queryOptions, status: "DONE", page: filters.boardPages.DONE })
      : Promise.resolve(null),
  ]);

  const boardColumns = filters.view === "board" && todoTasks && inProgressTasks && doneTasks
    ? { TODO: todoTasks, IN_PROGRESS: inProgressTasks, DONE: doneTasks }
    : null;
  const totalCount = tasks?.totalCount ?? (boardColumns
    ? boardColumns.TODO.totalCount + boardColumns.IN_PROGRESS.totalCount + boardColumns.DONE.totalCount
    : 0);
  const commonFilters = {
    q: filters.query,
    assignee: filters.assignee,
    view: filters.view,
    sort: filters.sort,
    focus: filters.focus,
  };
  const filterHref = (next: { assignee?: string; focus?: string }) => buildListPageHref(tasksPath, {
    q: filters.query,
    assignee: next.assignee !== undefined ? next.assignee : filters.assignee,
    view: filters.view,
    sort: filters.sort,
    focus: next.focus !== undefined ? next.focus : filters.focus,
    status: filters.view === "list" ? filters.status : undefined,
  });

  return (
    <div className="space-y-6 sm:space-y-7">
      <PageHeader
        eyebrow={lab.name}
        title="タスク"
        description="担当・締切・進捗をまとめて確認し、Lab内の作業を管理します。"
        actions={<ButtonLink href={filterHref({}) + "#create-task"} variant="primary">＋ タスクを追加</ButtonLink>}
      />

      <Card aria-labelledby="task-list-heading" className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950" id="task-list-heading">タスク一覧</h2>
            <p className="mt-1 text-sm text-slate-600">{totalCount}件{filters.focus === "overdue" ? "の期限超過タスク" : "のタスク"}を表示</p>
          </div>
          <div aria-label="タスクの表示形式" className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(["list", "board"] as const).map((view) => (
              <ButtonLink
                aria-current={filters.view === view ? "page" : undefined}
                className="min-h-9 px-3 text-xs sm:text-sm"
                href={buildListPageHref(tasksPath, { ...commonFilters, status: view === "list" ? filters.status : undefined, view })}
                key={view}
                variant={filters.view === view ? "primary" : "secondary"}
              >
                {view === "list" ? "一覧" : "ボード"}
              </ButtonLink>
            ))}
          </div>
        </div>

        <Form action={tasksPath} className="mt-4 grid gap-3 border-y border-slate-200 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_auto] xl:items-end" scroll={false}>
          <input name="view" type="hidden" value={filters.view} />
          <input name="sort" type="hidden" value={filters.sort} />
          <input name="focus" type="hidden" value={filters.focus} />
          <div>
            <label className="text-xs font-semibold text-slate-700" htmlFor="task-search">キーワード</label>
            <input className={`mt-1.5 ${controlClassName}`} defaultValue={filters.query} id="task-search" maxLength={100} name="q" placeholder="タスク名・説明" type="search" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700" htmlFor="task-assignee-filter">担当者</label>
            <select className={`mt-1.5 ${controlClassName}`} defaultValue={filters.assignee} id="task-assignee-filter" name="assignee">
              <option value="">すべて</option>
              <option value="me">自分の担当</option>
              <option value="unassigned">担当者なし</option>
              {members.filter((member) => member.id !== access.userId).map((member) => (
                <option key={member.id} value={member.id}>{member.name?.trim() || member.email || "名前未設定"}</option>
              ))}
            </select>
          </div>
          {filters.view === "list" ? (
            <div>
              <label className="text-xs font-semibold text-slate-700" htmlFor="task-status-filter">状態</label>
              <select className={`mt-1.5 ${controlClassName}`} defaultValue={filters.status} id="task-status-filter" name="status">
                <option value="">すべて</option><option value="TODO">未着手</option><option value="IN_PROGRESS">進行中</option><option value="DONE">完了</option>
              </select>
            </div>
          ) : null}
          {filters.view === "board" && filters.status ? <input name="status" type="hidden" value={filters.status} /> : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1">
            <Button type="submit">検索</Button>
            <ButtonLink href={tasksPath} scroll={false} variant="secondary">クリア</ButtonLink>
          </div>
        </Form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold text-slate-500">クイック表示</span>
          <ButtonLink className="min-h-9 px-3 text-xs" href={filterHref({ assignee: filters.assignee === "me" ? "" : "me" })} variant={filters.assignee === "me" ? "primary" : "secondary"}>自分の担当</ButtonLink>
          <ButtonLink className="min-h-9 px-3 text-xs" href={filterHref({ focus: filters.focus === "overdue" ? "" : "overdue" })} variant={filters.focus === "overdue" ? "primary" : "secondary"}>期限超過</ButtonLink>
          <Form action={tasksPath} className="ml-auto flex items-center gap-2" scroll={false}>
            <input name="q" type="hidden" value={filters.query} />
            <input name="assignee" type="hidden" value={filters.assignee} />
            <input name="view" type="hidden" value={filters.view} />
            <input name="focus" type="hidden" value={filters.focus} />
            {filters.view === "list" && filters.status ? <input name="status" type="hidden" value={filters.status} /> : null}
            <label className="text-xs font-semibold text-slate-600" htmlFor="task-sort">並び順</label>
            <select className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" defaultValue={filters.sort} id="task-sort" name="sort">
              <option value="recent">新着順</option><option value="due">締切が近い順</option>
            </select>
            <Button className="min-h-9 px-3 text-xs" type="submit" variant="secondary">適用</Button>
          </Form>
        </div>

        <div className="mt-5">
          {boardColumns ? (
            <TaskBoardResults labId={access.labId} columnsByStatus={boardColumns} members={members} path={tasksPath} filters={{ q: filters.query, status: filters.status, assignee: filters.assignee, view: filters.view, sort: filters.sort, focus: filters.focus }} />
          ) : tasks ? (
            <TaskListResults labId={access.labId} tasks={tasks} members={members} filters={{ q: filters.query, status: filters.status, assignee: filters.assignee, view: filters.view, sort: filters.sort, focus: filters.focus }} />
          ) : null}
          {tasks ? <TaskPagination tasks={tasks} path={tasksPath} filters={{ q: filters.query, status: filters.status, assignee: filters.assignee, view: filters.view, sort: filters.sort, focus: filters.focus }} /> : null}
        </div>
      </Card>

      <details className="group rounded-2xl border border-indigo-200 bg-white shadow-sm" id="create-task">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-base font-bold text-slate-950">タスクを追加</span>
            <span className="mt-1 block text-sm text-slate-600">担当者・締切・説明を登録できます</span>
          </span>
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-lg font-semibold text-indigo-800 transition-transform group-open:rotate-45">＋</span>
        </summary>
        <div className="border-t border-slate-100 px-4 py-5 sm:px-6">
          <CreateTaskForm labId={access.labId} members={members} />
        </div>
      </details>
    </div>
  );
}
