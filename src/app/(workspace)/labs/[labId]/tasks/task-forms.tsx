"use client";

import { useActionState, type FormEvent } from "react";

import type { TaskStatusValue } from "@/lib/task-validation.js";
import {
  initialTaskFormState,
  type TaskFormState,
  type TaskFieldName,
} from "@/lib/task-form-state";
import {
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from "./actions";

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
      <button
        className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "作成中…" : "Taskを作成"}
      </button>
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
      <button
        className="min-h-10 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "保存中…" : "変更を保存"}
      </button>
    </form>
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
      <button
        className="min-h-10 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "削除中…" : "Taskを削除"}
      </button>
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
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
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
          className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
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
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
            defaultValue={task.status}
            id={`${prefix}-status`}
            name="status"
            required
          >
            <option value="TODO">TODO</option>
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
          新しいTaskはTODOとして作成されます。
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
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
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
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
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

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="mt-1 text-sm text-red-700" id={id}>
      {message}
    </p>
  ) : null;
}

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
      {message}
    </p>
  );
}
