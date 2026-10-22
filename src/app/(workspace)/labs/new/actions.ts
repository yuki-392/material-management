"use server";

import {
  AuthorizationError,
  requireProfileCompleteUser,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import {
  LabCreationError,
  createLabWithOwner,
} from "@/lib/lab-creation-core.js";
import { prisma } from "@/lib/db";
import type { LabActionState } from "@/lib/lab-form-state";
import { validateLabName } from "@/lib/lab-validation.js";
import { redirect } from "next/navigation";

export async function createLabAction(
  _previousState: LabActionState,
  formData: FormData,
): Promise<LabActionState> {
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

  const validation = validateLabName(formData.get("name"));

  if (!validation.success) {
    return { nameError: validation.error };
  }

  try {
    await createLabWithOwner(prisma, currentUser.id, validation.name);
  } catch (error) {
    if (
      error instanceof LabCreationError &&
      error.code === "ALREADY_MEMBER"
    ) {
      return {
        formError: "すでにLabに所属しています。現在のLabを確認してください。",
      };
    }

    if (error instanceof LabCreationError) {
      if (error.code === "LAB_LIMIT_REACHED") {
        return {
          formError:
            "アプリで作成できる研究室は累計8件までです。管理者にお問い合わせください。",
        };
      }
      if (error.code === "STORAGE_CAPACITY_UNAVAILABLE") {
        return {
          formError:
            "新しい研究室に割り当てる保存容量がありません。管理者にお問い合わせください。",
        };
      }
    }

    return {
      formError: "Labを作成できませんでした。時間をおいて再度お試しください。",
    };
  }

  redirect("/labs");
}
