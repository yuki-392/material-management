import { buildListPageHref } from "@/lib/list-query.js";
import { getTaskDeadlineHint } from "@/lib/task-presentation.js";
import { formatTokyoDateTimeLocal } from "@/lib/task-validation.js";
import { Button, ButtonLink, EmptyState } from "@/components/ui";

import {
  DeleteTaskForm,
  EditTaskForm,
  TaskStatusControl,
  type EditableTask,
  type TaskFormMember,
} from "./task-forms";
import { listTasksForLab } from "@/lib/task-core.js";

type TaskItem = Awaited<ReturnType<typeof listTasksForLab>>["items"][number];
type TaskList = Awaited<ReturnType<typeof listTasksForLab>>;
type TaskFilters = {
  q: string;
  status: string;
  assignee: string;
  view: "list" | "board";
  sort: "recent" | "due";
  focus: string;
};

const columns = [
  { status: "TODO", title: "未着手", color: "border-slate-300 bg-slate-100" },
  { status: "IN_PROGRESS", title: "進行中", color: "border-indigo-200 bg-indigo-50" },
  { status: "DONE", title: "完了", color: "border-emerald-200 bg-emerald-50" },
] as const;

export function TaskListResults({
  labId,
  tasks,
  members,
  filters,
}: {
  labId: string;
  tasks: TaskList;
  members: TaskFormMember[];
  filters: TaskFilters;
}) {
  if (!tasks.items.length) {
    return (
      <EmptyState
        title={filters.q || filters.status || filters.assignee || filters.focus ? "条件に一致するタスクはありません" : "タスクはまだありません"}
        description={filters.q || filters.status || filters.assignee || filters.focus ? "検索語や絞り込み条件を変更してください。" : "最初のタスクを追加して、担当者や締切を共有しましょう。"}
      />
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {tasks.items.map((task) => (
        <li className="py-4 first:pt-0 last:pb-0 sm:py-5" key={task.id}>
          <TaskRow labId={labId} task={task} members={members} />
        </li>
      ))}
    </ul>
  );
}

export function TaskBoardResults({
  labId,
  columnsByStatus,
  members,
  path,
  filters,
}: {
  labId: string;
  columnsByStatus: Record<(typeof columns)[number]["status"], TaskList>;
  members: TaskFormMember[];
  path: string;
  filters: TaskFilters;
}) {
  const totalCount = columns.reduce(
    (count, column) => count + columnsByStatus[column.status].totalCount,
    0,
  );

  return (
    <div>
      {totalCount === 0 ? (
        <p className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600" role="status">
          {filters.q || filters.assignee || filters.focus ? "条件に一致するタスクはありません。検索や絞り込みを変更してください。" : "タスクはまだありません。最初のタスクを追加しましょう。"}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        {columns.map(({ status, title, color }) => {
          const result = columnsByStatus[status];
          const pageKey =
            status === "TODO"
              ? "todoPage"
              : status === "IN_PROGRESS"
                ? "inProgressPage"
                : "donePage";
          const pageFilters = {
            q: filters.q,
            status: filters.status,
            assignee: filters.assignee,
            view: "board",
            sort: filters.sort,
            focus: filters.focus,
            todoPage: columnsByStatus.TODO.page,
            inProgressPage: columnsByStatus.IN_PROGRESS.page,
            donePage: columnsByStatus.DONE.page,
          };

          return (
            <section
              aria-labelledby={`task-column-${status}`}
              className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4"
              key={status}
            >
              <header className="mb-3 flex items-center justify-between gap-2">
                <h3
                  className="flex items-center gap-2 text-sm font-bold text-slate-900"
                  id={`task-column-${status}`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-2.5 rounded-full border ${color}`}
                  />
                  {title}
                </h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">
                  {result.totalCount}件
                </span>
              </header>
              {result.items.length ? (
                <ul className="space-y-3">
                  {result.items.map((task) => (
                    <li key={task.id}>
                      <TaskRow board labId={labId} task={task} members={members} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-5 text-center text-sm text-slate-500">
                  この列にタスクはありません
                </p>
              )}
              {result.pageCount > 1 ? (
                <nav
                  aria-label={`${title}列のページ`}
                  className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-3"
                >
                  <span className="text-xs tabular-nums text-slate-500">
                    {result.page} / {result.pageCount}ページ
                  </span>
                  <div className="flex gap-1.5">
                    {result.page > 1 ? (
                      <ButtonLink
                        className="min-h-9 px-3 text-xs"
                        href={buildListPageHref(path, {
                          ...pageFilters,
                          [pageKey]: result.page - 1,
                        })}
                        variant="secondary"
                      >
                        前へ
                      </ButtonLink>
                    ) : (
                      <Button className="min-h-9 px-3 text-xs" disabled type="button" variant="secondary">
                        前へ
                      </Button>
                    )}
                    {result.page < result.pageCount ? (
                      <ButtonLink
                        className="min-h-9 px-3 text-xs"
                        href={buildListPageHref(path, {
                          ...pageFilters,
                          [pageKey]: result.page + 1,
                        })}
                        variant="secondary"
                      >
                        次へ
                      </ButtonLink>
                    ) : (
                      <Button className="min-h-9 px-3 text-xs" disabled type="button" variant="secondary">
                        次へ
                      </Button>
                    )}
                  </div>
                </nav>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function TaskPagination({
  tasks,
  path,
  filters,
}: {
  tasks: TaskList;
  path: string;
  filters: TaskFilters;
}) {
  if (tasks.pageCount < 2) return null;

  const pageFilters = {
    q: filters.q,
    status: filters.status,
    assignee: filters.assignee,
    view: filters.view,
    sort: filters.sort,
    focus: filters.focus,
  };

  return (
    <nav aria-label="タスク一覧のページ" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      <p className="text-sm text-slate-600">{tasks.page} / {tasks.pageCount}ページ</p>
      <div className="flex gap-2">
        {tasks.page > 1 ? <ButtonLink href={buildListPageHref(path, { ...pageFilters, page: tasks.page - 1 })} variant="secondary">前へ</ButtonLink> : <Button disabled type="button" variant="secondary">前へ</Button>}
        {tasks.page < tasks.pageCount ? <ButtonLink href={buildListPageHref(path, { ...pageFilters, page: tasks.page + 1 })} variant="secondary">次へ</ButtonLink> : <Button disabled type="button" variant="secondary">次へ</Button>}
      </div>
    </nav>
  );
}

export function TaskRow({
  labId,
  task,
  members,
  board = false,
}: {
  labId: string;
  task: TaskItem;
  members: TaskFormMember[];
  board?: boolean;
}) {
  const dueHint = getTaskDeadlineHint(task.dueAt, task.status, new Date());
  const assignee = task.assignee?.name?.trim() || task.assignee?.email || "未設定";
  const editableTask: EditableTask = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    assigneeId: task.assigneeId,
    dueAtLocal: formatTokyoDateTimeLocal(task.dueAt),
  };

  return (
    <article className={board ? "min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" : "grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-2">
          <h3 className="min-w-0 flex-1 break-words text-base font-semibold leading-6 text-slate-950">{task.title}</h3>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="max-w-full truncate">担当：{assignee}</span>
          <span className={dueHint === "期限超過" ? "font-semibold text-rose-700" : dueHint === "今日まで" ? "font-semibold text-amber-700" : ""}>
            締切：{task.dueAt ? formatDate(task.dueAt) : "未設定"}{dueHint ? ` · ${dueHint}` : ""}
          </span>
        </div>
        {task.description ? <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-5 text-slate-600">{task.description}</p> : null}
      </div>
      <div className={board ? "mt-3 space-y-2 border-t border-slate-100 pt-3" : "flex min-w-0 flex-col items-start gap-2 md:items-end"}>
        <TaskStatusControl key={`${task.id}-${task.status}`} labId={labId} taskId={task.id} status={task.status} />
        <details className="w-full rounded-lg border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">編集・削除</summary>
          <EditTaskForm labId={labId} members={members} task={editableTask} />
          <div className="mt-3 border-t border-slate-200 pt-3">
            <DeleteTaskForm labId={labId} taskId={task.id} taskTitle={task.title} />
          </div>
        </details>
      </div>
    </article>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}
