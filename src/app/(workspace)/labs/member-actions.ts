"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AuthorizationError,
  requireLabOwner,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import {
  MemberManagementError,
  addMemberByEmail,
  removeMemberAndClearAssignments,
} from "@/lib/member-management-core.js";
import { prisma } from "@/lib/db";
import type { MemberFormState } from "@/lib/member-form-state";
import { validateMemberEmail } from "@/lib/member-validation.js";

export async function addMemberAction(
  _previousState: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const labId = formData.get("labId");
  if (typeof labId !== "string" || labId.trim().length === 0) {
    return { formError: "Labを確認できませんでした。画面を再読み込みしてください。" };
  }

  const owner = await getCurrentLabOwner(labId);
  if (!owner) {
    return { formError: "この操作を行う権限がありません。" };
  }

  const email = validateMemberEmail(formData.get("email"));
  if (!email.success) {
    return { emailError: email.error };
  }

  try {
    await addMemberByEmail(prisma, {
      labId,
      ownerId: owner.userId,
      email: email.email,
    });
  } catch (error) {
    if (error instanceof MemberManagementError) {
      return { formError: getAddMemberErrorMessage(error.code) };
    }

    return {
      formError: "メンバーを追加できませんでした。時間をおいて再度お試しください。",
    };
  }

  revalidatePath("/labs");
  redirect("/labs");
}

export async function removeMemberAction(
  _previousState: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const labId = formData.get("labId");
  const userId = formData.get("userId");
  if (
    typeof labId !== "string" ||
    labId.trim().length === 0 ||
    typeof userId !== "string" ||
    userId.trim().length === 0
  ) {
    return { formError: "削除対象を確認できませんでした。画面を再読み込みしてください。" };
  }

  const owner = await getCurrentLabOwner(labId);
  if (!owner) {
    return { formError: "この操作を行う権限がありません。" };
  }

  try {
    await removeMemberAndClearAssignments(prisma, {
      labId,
      ownerId: owner.userId,
      userId,
    });
  } catch (error) {
    if (error instanceof MemberManagementError) {
      return { formError: getRemoveMemberErrorMessage(error.code) };
    }

    return {
      formError: "メンバーを削除できませんでした。時間をおいて再度お試しください。",
    };
  }

  revalidatePath("/labs");
  redirect("/labs");
}

async function getCurrentLabOwner(labId: string) {
  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) {
    redirect("/login");
  }

  try {
    return await requireLabOwner(labId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }
      if (error.code === "PROFILE_INCOMPLETE") {
        redirect("/profile/setup");
      }
      if (error.code === "LAB_NOT_FOUND") {
        redirect("/labs");
      }
      if (error.code === "FORBIDDEN") {
        return null;
      }
    }

    throw error;
  }
}

function getAddMemberErrorMessage(code: MemberManagementError["code"]): string {
  switch (code) {
    case "USER_NOT_FOUND":
      return "このメールアドレスで登録済みのユーザーが見つかりません。相手が一度Googleログインしているか確認してください。";
    case "CANNOT_ADD_SELF":
      return "Owner本人はすでにメンバーです。";
    case "ALREADY_MEMBER":
      return "このユーザーはすでにこのLabのメンバーです。";
    case "ALREADY_ASSIGNED":
      return "このユーザーはすでに別のLabに所属しているか、追加処理と競合しました。";
    case "CANNOT_REMOVE_OWNER":
    case "NOT_MEMBER":
      return "メンバーを追加できませんでした。画面を再読み込みしてください。";
  }
}

function getRemoveMemberErrorMessage(code: MemberManagementError["code"]): string {
  switch (code) {
    case "CANNOT_REMOVE_OWNER":
      return "Owner自身は削除できません。";
    case "NOT_MEMBER":
      return "対象ユーザーはこのLabのメンバーではありません。画面を再読み込みしてください。";
    case "USER_NOT_FOUND":
    case "CANNOT_ADD_SELF":
    case "ALREADY_MEMBER":
    case "ALREADY_ASSIGNED":
      return "メンバーを削除できませんでした。画面を再読み込みしてください。";
  }
}
