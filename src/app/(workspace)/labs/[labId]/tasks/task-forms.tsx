"use client";

import { startTransition, useActionState, useOptimistic, type FormEvent } from "react";

import type { TaskStatusValue } from "@/lib/task-validation.js";
import { parseTaskStatus } from "@/lib/list-query.js";
import {
  initialTaskFormState,
  type TaskFormState,
  type TaskFieldName,
} from "@/lib/task-form-state";
import {
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
  updateTaskStatusAction,
} from "./actions";
import {
  Button,
  FieldError,
  FormError,
  inputClassName,
  selectClassName,
  TaskStatusBadge,
  textareaClassName,
} from "@/components/ui";

export type TaskFormMember = {
  id: string;
  name: string | null;
  email: string | null;
};

export type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatusValue;
  assigneeId: string | null;
  dueAtLocal: string;
};

export function CreateTaskForm({
  labId,
  members,
}: {
  labId: string;
  members: TaskFormMember[];
}) {
  const [state, formAction, isPending] = useActionState<
    TaskFormState,
    FormData
  >(createTaskAction, initialTaskFormState);

  return (
    <form action={formAction} className="mt-5 space-y-4" noValidate>
      <input name="labId" type="hidden" value={labId} />
      <TaskFields members={members} state={state} />
      {state.formError ? <FormError message={state.formError} /> : null}
      <Button disabled={isPending} type="submit">
        {isPending ? "作成中…" : "タスクを追加"}
      </Button>
    </form>
  );
}

export function EditTaskForm({
  labId,
  task,
  members,
}: {
  labId: string;
  task: EditableTask;
  members: TaskFormMember[];
}) {
  const [state, formAction, isPending] = useActionState<
    TaskFormState,
    FormData
  >(updateTaskAction, initialTaskFormState);

  return (
    <form action={formAction} className="mt-4 space-y-4" noValidate>
      <input name="labId" type="hidden" value={labId} />
      <input name="taskId" type="hidden" value={task.id} />
      <TaskFields members={members} state={state} task={task} />
      {state.formError ? <FormError message={state.formError} /> : null}
      <Button disabled={isPending} type="submit">
        {isPending ? "保存中…" : "変更を保存"}
      </Button>
    </form>
  );
}

export function TaskStatusControl({
  labId,
  taskId,
  status,
}: {
  labId: string;
  taskId: string;
  status: TaskStatusValue;
}) {
  const [state, dispatch, isPending] = useActionState(
    updateTaskStatusAction,
    { status },
  );
  const confirmedStatus = state.status ?? status;
  const [visibleStatus, setOptimisticStatus] = useOptimistic(confirmedStatus);
  const statusMessage = isPending
    ? "状態を更新中…"
    : state.formError || state.success || "選択すると自動で反映されます。";
  const statusMessageClass = state.formError && !isPending
    ? "text-rose-700"
    : state.success
      ? "text-emerald-700"
      : "text-slate-500";

  function updateStatus(nextStatus: TaskStatusValue) {
    const formData = new FormData();
    formData.set("labId", labId);
    formData.set("taskId", taskId);
    formData.set("status", nextStatus);

    startTransition(() => {
      setOptimisticStatus(nextStatus);
      dispatch(formData);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <TaskStatusBadge status={visibleStatus} />
        <TaskStatusSelect
          taskId={taskId}
          status={visibleStatus}
          disabled={isPending}
          onChange={updateStatus}
        />
        {visibleStatus !== "DONE" ? (
          <Button
            disabled={isPending}
            onClick={() => updateStatus("DONE")}
            type="button"
          >
            完了にする
          </Button>
        ) : null}
      </div>
      <p
        aria-live="polite"
        className={`min-h-5 text-xs ${statusMessageClass}`}
        role={state.formError && !isPending ? "alert" : "status"}
      >
        {statusMessage}
      </p>
    </div>
  );
}

function TaskStatusSelect({
  taskId,
  status,
  disabled,
  onChange,
}: {
  taskId: string;
  status: TaskStatusValue;
  disabled: boolean;
  onChange: (status: TaskStatusValue) => void;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={`task-status-${taskId}`}>
        タスクの状態
      </label>
      <select
        className={statusControlClassName(status)}
        disabled={disabled}
        id={`task-status-${taskId}`}
        name="status"
        onChange={(event) => {
          const nextStatus = parseTaskStatus(event.currentTarget.value);
          if (nextStatus) {
            onChange(nextStatus);
          }
        }}
        value={status}
      >
        <option value="TODO">未着手</option>
        <option value="IN_PROGRESS">進行中</option>
        <option value="DONE">完了</option>
      </select>
    </>
  );
}

export function DeleteTaskForm({
  labId,
  taskId,
  taskTitle,
}: {
  labId: string;
  taskId: string;
  taskTitle: string;
}) {
  const [state, formAction, isPending] = useActionState<
    TaskFormState,
    FormData
  >(deleteTaskAction, initialTaskFormState);

  function confirmDeletion(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`「${taskTitle}」を削除しますか？`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmDeletion}>
      <input name="labId" type="hidden" value={labId} />
      <input name="taskId" type="hidden" value={taskId} />
      <Button disabled={isPending} type="submit" variant="danger">
        {isPending ? "削除中…" : "タスクを削除"}
      </Button>
      {state.formError ? <FormError message={state.formError} /> : null}
    </form>
  );
}

function TaskFields({
  members,
  state,
  task,
}: {
  members: TaskFormMember[];
  state: TaskFormState;
  task?: EditableTask;
}) {
  const prefix = task ? `task-${task.id}` : "new-task";

  return (
    <>
      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor={`${prefix}-title`}
        >
          タイトル
        </label>
        <input
          aria-describedby={errorId(prefix, "title", state)}
          aria-invalid={Boolean(state.fieldErrors?.title)}
          className={inputClassName}
          defaultValue={task?.title ?? ""}
          id={`${prefix}-title`}
          maxLength={200}
          name="title"
          required
        />
        <FieldError id={`${prefix}-title-error`} message={state.fieldErrors?.title} />
      </div>

      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor={`${prefix}-description`}
        >
          説明（任意）
        </label>
        <textarea
          aria-describedby={errorId(prefix, "description", state)}
          aria-invalid={Boolean(state.fieldErrors?.description)}
          className={textareaClassName}
          defaultValue={task?.description ?? ""}
          id={`${prefix}-description`}
          maxLength={5000}
          name="description"
          rows={3}
        />
        <FieldError
          id={`${prefix}-description-error`}
          message={state.fieldErrors?.description}
        />
      </div>

      {task ? (
        <div>
          <label
            className="block text-sm font-medium text-slate-800"
            htmlFor={`${prefix}-status`}
          >
            ステータス
          </label>
          <select
            aria-describedby={errorId(prefix, "status", state)}
            aria-invalid={Boolean(state.fieldErrors?.status)}
            className={selectClassName}
            defaultValue={task.status}
            id={`${prefix}-status`}
            name="status"
            required
          >
            <option value="TODO">未着手</option>
            <option value="IN_PROGRESS">進行中</option>
            <option value="DONE">完了</option>
          </select>
          <FieldError
            id={`${prefix}-status-error`}
            message={state.fieldErrors?.status}
          />
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          新しいタスクは「未着手」として作成されます。
        </p>
      )}

      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor={`${prefix}-assignee`}
        >
          担当者（任意）
        </label>
        <select
          aria-describedby={errorId(prefix, "assigneeId", state)}
          aria-invalid={Boolean(state.fieldErrors?.assigneeId)}
          className={selectClassName}
          defaultValue={task?.assigneeId ?? ""}
          id={`${prefix}-assignee`}
          name="assigneeId"
        >
          <option value="">担当者なし</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name?.trim() || member.email || "名前未設定"}
            </option>
          ))}
        </select>
        <FieldError
          id={`${prefix}-assignee-error`}
          message={state.fieldErrors?.assigneeId}
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor={`${prefix}-due-at`}
        >
          締切日時（日本時間・任意）
        </label>
        <input
          aria-describedby={errorId(prefix, "dueAt", state)}
          aria-invalid={Boolean(state.fieldErrors?.dueAt)}
          className={inputClassName}
          defaultValue={task?.dueAtLocal ?? ""}
          id={`${prefix}-due-at`}
          name="dueAt"
          step={60}
          type="datetime-local"
        />
        <FieldError
          id={`${prefix}-due-at-error`}
          message={state.fieldErrors?.dueAt}
        />
      </div>
    </>
  );
}

function errorId(
  prefix: string,
  field: TaskFieldName,
  state: TaskFormState,
) {
  return state.fieldErrors?.[field] ? `${prefix}-${field}-error` : undefined;
}

function statusControlClassName(status: TaskStatusValue) {
  const statusStyles = {
    TODO: "border-slate-300 bg-slate-100 text-slate-700",
    IN_PROGRESS: "border-indigo-200 bg-indigo-50 text-indigo-900",
    DONE: "border-emerald-200 bg-emerald-50 text-emerald-900",
  } as const;

  return `min-h-10 rounded-xl border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${statusStyles[status]}`;
}
