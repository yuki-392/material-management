"use server";

import { revalidatePath } from "next/cache";

import {
  AppAdminAuthorizationError,
  requireAppAdmin,
} from "@/lib/app-admin-authorization";
import { prisma } from "@/lib/db";
import type { StorageAdminFormState } from "@/lib/storage-admin-form-state";
import {
  StorageQuotaError,
  parseStorageLimitGb,
  updateLabStorageLimit,
} from "@/lib/storage-quota-core.js";

export async function updateLabStorageLimitAction(
  _previousState: StorageAdminFormState,
  formData: FormData,
): Promise<StorageAdminFormState> {
  try {
    await requireAppAdmin();
  } catch (error) {
    if (error instanceof AppAdminAuthorizationError) {
      return { formError: "管理者権限が必要です。" };
    }
    throw error;
  }

  const rawLabId = formData.get("labId");
  const rawLimitGb = formData.get("limitGb");
  const labId = typeof rawLabId === "string" ? rawLabId.trim() : "";
  const limitBytes =
    typeof rawLimitGb === "string"
      ? parseStorageLimitGb(rawLimitGb.trim())
      : null;

  if (!labId || labId.length > 100 || limitBytes === null) {
    return {
      formError: "研究室と容量を確認してください。容量は0〜8GBで入力できます。",
    };
  }

  try {
    await updateLabStorageLimit(prisma, { labId, limitBytes });
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      if (error.code === "QUOTA_BELOW_USAGE") {
        return {
          formError: "割当容量は現在の使用量（アップロード中を含む）以上にしてください。",
        };
      }
      if (error.code === "STORAGE_CAPACITY_UNAVAILABLE") {
        return {
          formError: "Labへの割当合計が8GBを超えるため変更できません。",
        };
      }
      if (error.code === "LAB_NOT_FOUND") {
        return { formError: "研究室が見つかりません。画面を再読み込みしてください。" };
      }
      if (error.code === "INVALID_QUOTA") {
        return { formError: "容量は0〜8GBで入力してください。" };
      }
    }

    console.error("Storage quota administration failed.", {
      stage: "admin.storage.limit-update",
      code: error instanceof StorageQuotaError ? error.code : "UNEXPECTED",
    });
    return {
      formError: "容量を変更できませんでした。時間をおいて再度お試しください。",
    };
  }

  revalidatePath("/admin/storage");
  revalidatePath("/labs");
  revalidatePath("/labs/new");
  revalidatePath(`/labs/${encodeURIComponent(labId)}/materials`);

  return { formSuccess: "割当容量を更新しました。" };
}
