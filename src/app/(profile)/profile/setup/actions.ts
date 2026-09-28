"use server";

import {
  AuthorizationError,
  isProfileComplete,
  requireUser,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import type { ProfileActionState } from "@/lib/profile-form-state";
import { validateProfileInput } from "@/lib/profile-validation.js";
import { redirect } from "next/navigation";

export async function saveProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) {
    redirect("/login");
  }

  let currentUser;

  try {
    currentUser = await requireUser();
  } catch (error) {
    if (
      error instanceof AuthorizationError &&
      error.code === "UNAUTHENTICATED"
    ) {
      redirect("/login");
    }

    throw error;
  }

  const currentProfile = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { userType: true, studentNumber: true },
  });

  if (isProfileComplete(currentProfile)) {
    redirect("/labs");
  }

  const result = validateProfileInput({
    name: formData.get("name"),
    userType: formData.get("userType"),
    studentNumber: formData.get("studentNumber"),
  });

  if (!result.success) {
    return { fieldErrors: result.fieldErrors };
  }

  try {
    await prisma.user.update({
      where: { id: currentUser.id },
      data: result.data,
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return {
        fieldErrors: {
          studentNumber: "この学生番号はすでに登録されています。",
        },
      };
    }

    return {
      fieldErrors: {},
      formError: "プロフィールを保存できませんでした。時間をおいて再度お試しください。",
    };
  }

  redirect("/labs");
}

/** @param {unknown} error */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
