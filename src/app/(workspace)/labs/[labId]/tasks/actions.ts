"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AuthorizationError,
  requireLabMember,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import type {
  TaskFormState,
  TaskStatusFormState,
} from "@/lib/task-form-state";
import {
  TaskOperationError,
  createTask,
  deleteTask,
  updateTask,
  updateTaskStatus,
} from "@/lib/task-core.js";
import { validateTaskInput, type TaskStatusValue } from "@/lib/task-validation.js";
import { parseTaskStatus } from "@/lib/list-query.js";

export async function createTaskAction(
  _previousState: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const labId = readString(formData.get("labId"));
  if (!labId) {
    return { formError: "Labを確認できませんでした。ページを再読み込みしてください。" };
  }

  const access = await getTaskLabAccess(labId);
  if (!access) {
    return { formError: "このLabのタスクを操作できません。ページを再読み込みしてください。" };
  }

  const validation = validateTaskInput({
    title: formData.get("title"),
    description: formData.get("description"),
    status: "TODO",
    assigneeId: formData.get("assigneeId"),
    dueAt: formData.get("dueAt"),
  });

  if (!validation.success) {
    return { fieldErrors: validation.fieldErrors };
  }

  try {
    await createTask(prisma, access.labId, validation.data);
  } catch (error) {
    return getTaskOperationError(error, "作成");
  }

  refreshTaskList(access.labId);
}

export async function updateTaskAction(
  _previousState: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const labId = readString(formData.get("labId"));
  if (!labId) {
    return { formError: "Labを確認できませんでした。ページを再読み込みしてください。" };
  }

  const access = await getTaskLabAccess(labId);
  if (!access) {
    return { formError: "このLabのタスクを操作できません。ページを再読み込みしてください。" };
  }

  const taskId = readString(formData.get("taskId"));
  if (!taskId || taskId.length > 100) {
    return { formError: "タスクを確認できませんでした。ページを再読み込みしてください。" };
  }

  const validation = validateTaskInput({
    title: formData.get("title"),
    description: formData.get("description"),
    status: formData.get("status"),
    assigneeId: formData.get("assigneeId"),
    dueAt: formData.get("dueAt"),
  });

  if (!validation.success) {
    return { fieldErrors: validation.fieldErrors };
  }

  try {
    await updateTask(prisma, access.labId, taskId, validation.data);
  } catch (error) {
    return getTaskOperationError(error, "更新");
  }

  refreshTaskList(access.labId);
}

export async function updateTaskStatusAction(
  previousState: TaskStatusFormState,
  formData: FormData,
): Promise<TaskStatusFormState> {
  const labId = readString(formData.get("labId"));
  if (!labId) {
    return getTaskStatusError(previousState, "Labを確認できませんでした。ページを再読み込みしてください。");
  }

  const access = await getTaskLabAccess(labId);
  if (!access) {
    return getTaskStatusError(previousState, "このLabのタスクを操作できません。ページを再読み込みしてください。");
  }

  const taskId = readString(formData.get("taskId"));
  if (!taskId || taskId.length > 100) {
    return getTaskStatusError(previousState, "タスクを確認できませんでした。ページを再読み込みしてください。");
  }

  const status =
    formData.get("markDone") === "true"
      ? "DONE"
      : parseTaskStatus(formData.get("status"));
  if (!status) {
    return getTaskStatusError(previousState, "状態を確認できませんでした。再度選択してください。");
  }
  const validatedStatus = status as TaskStatusValue;

  try {
    await updateTaskStatus(prisma, access.labId, taskId, validatedStatus);
  } catch (error) {
    if (error instanceof TaskOperationError && error.code === "TASK_NOT_FOUND") {
      return getTaskStatusError(previousState, "このタスクを確認できませんでした。ページを再読み込みしてください。");
    }

    return getTaskStatusError(previousState, "状態を更新できませんでした。時間をおいて再度お試しください。");
  }

  revalidatePath(`/labs/${encodeURIComponent(access.labId)}/tasks`);
  refresh();
  return { success: "タスクの状態を更新しました。", status: validatedStatus };
}

export async function deleteTaskAction(
  _previousState: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const labId = readString(formData.get("labId"));
  if (!labId) {
    return { formError: "Labを確認できませんでした。ページを再読み込みしてください。" };
  }

  const access = await getTaskLabAccess(labId);
  if (!access) {
    return { formError: "このLabのタスクを操作できません。ページを再読み込みしてください。" };
  }

  const taskId = readString(formData.get("taskId"));
  if (!taskId || taskId.length > 100) {
    return { formError: "タスクを確認できませんでした。ページを再読み込みしてください。" };
  }

  try {
    await deleteTask(prisma, access.labId, taskId);
  } catch (error) {
    return getTaskOperationError(error, "削除");
  }

  refreshTaskList(access.labId);
}

async function getTaskLabAccess(labId: string) {
  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) {
    redirect("/login");
  }

  try {
    return await requireLabMember(labId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }
      if (error.code === "PROFILE_INCOMPLETE") {
        redirect("/profile/setup");
      }
      if (error.code === "LAB_NOT_FOUND") {
        return null;
      }
    }

    throw error;
  }
}

function refreshTaskList(labId: string): never {
  const path = `/labs/${encodeURIComponent(labId)}/tasks`;
  revalidatePath(path);
  redirect(path);
}

function getTaskOperationError(
  error: unknown,
  operation: "作成" | "更新" | "削除",
): TaskFormState {
  if (error instanceof TaskOperationError) {
    if (error.code === "ASSIGNEE_NOT_MEMBER") {
      return {
        fieldErrors: {
          assigneeId: "担当者には同じLabのメンバーを選択してください。",
        },
      };
    }

    if (error.code === "TASK_NOT_FOUND") {
      return {
        formError: "このタスクを確認できませんでした。ページを再読み込みしてください。",
      };
    }
  }

  return {
    formError: `タスクを${operation}できませんでした。時間をおいて再度お試しください。`,
  };
}

function getTaskStatusError(
  previousState: TaskStatusFormState,
  message: string,
): TaskStatusFormState {
  return {
    formError: message,
    ...(previousState.status ? { status: previousState.status } : {}),
  };
}

/** @param {FormDataEntryValue | null} value */
function readString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}
