"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AuthorizationError,
  requireLabMember,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import type { TaskFormState } from "@/lib/task-form-state";
import {
  TaskOperationError,
  createTask,
  deleteTask,
  updateTask,
} from "@/lib/task-core.js";
import { validateTaskInput } from "@/lib/task-validation.js";

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
    return { formError: "このLabのTaskを操作できません。ページを再読み込みしてください。" };
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
    return { formError: "このLabのTaskを操作できません。ページを再読み込みしてください。" };
  }

  const taskId = readString(formData.get("taskId"));
  if (!taskId || taskId.length > 100) {
    return { formError: "Taskを確認できませんでした。ページを再読み込みしてください。" };
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
    return { formError: "このLabのTaskを操作できません。ページを再読み込みしてください。" };
  }

  const taskId = readString(formData.get("taskId"));
  if (!taskId || taskId.length > 100) {
    return { formError: "Taskを確認できませんでした。ページを再読み込みしてください。" };
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
        formError: "Taskを確認できませんでした。ページを再読み込みしてください。",
      };
    }
  }

  return {
    formError: `Taskを${operation}できませんでした。時間をおいて再度お試しください。`,
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
