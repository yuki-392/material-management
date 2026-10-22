"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AuthorizationError,
  requireLabMember,
} from "@/lib/authorization";
import { prisma } from "@/lib/db";
import {
  MaterialOperationError,
  createMaterial,
  deleteMaterial,
} from "@/lib/material-core.js";
import {
  MAX_MATERIAL_FILE_SIZE,
  validateMaterialInput,
} from "@/lib/material-validation.js";
import {
  deleteMaterialObject,
  putMaterialObject,
} from "@/lib/material-storage";
import { logMaterialError } from "@/lib/material-error-logging.js";
import type { MaterialFormState } from "@/lib/material-form-state";
import { StorageQuotaError } from "@/lib/storage-quota-core.js";

export async function uploadMaterialAction(
  _previousState: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  const labId = readString(formData.get("labId"));
  if (!labId || labId.length > 100) {
    return { formError: "Labを確認できませんでした。画面を再読み込みしてください。" };
  }

  const access = await getLabMemberAccess(labId);
  if (!access) {
    return { formError: "このLabの資料を操作できません。画面を再読み込みしてください。" };
  }

  const file = formData.get("file");
  if (!isFileEntry(file)) {
    return {
      fieldErrors: { file: "アップロードするファイルを選択してください。" },
    };
  }

  const validation = validateMaterialInput({
    title: formData.get("title"),
    description: formData.get("description"),
    file,
  });

  if (!validation.success) {
    return { fieldErrors: validation.fieldErrors };
  }

  if (file.size > MAX_MATERIAL_FILE_SIZE) {
    return { fieldErrors: { file: "ファイルサイズは4MiB以下にしてください。" } };
  }

  const saveError =
    "資料を保存できませんでした。時間をおいて再度お試しください。";
  let body: Uint8Array;
  try {
    body = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    logMaterialError("material.upload.file-read", error);
    return { formError: saveError };
  }

  try {
    await createMaterial(
      prisma,
      {
        putObject: putMaterialObject,
        deleteObject: deleteMaterialObject,
      },
      {
        labId: access.labId,
        userId: access.userId,
        ...validation.data,
        body,
      },
    );
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      if (error.code === "LAB_QUOTA_EXCEEDED") {
        return {
          formError:
            "この研究室の保存容量に達したため、資料を追加できません。管理者にお問い合わせください。",
        };
      }
      if (error.code === "GLOBAL_QUOTA_EXCEEDED") {
        return {
          formError:
            "アプリ全体の保存上限に達したため、資料を追加できません。管理者にお問い合わせください。",
        };
      }
    }

    if (!(error instanceof MaterialOperationError)) {
      logMaterialError("material.upload.unclassified", error);
    }

    return { formError: saveError };
  }

  const path = getMaterialsPath(access.labId);
  revalidatePath(path);
  redirect(path);
}

export async function deleteMaterialAction(
  _previousState: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  const labId = readString(formData.get("labId"));
  const materialId = readString(formData.get("materialId"));
  if (!labId || labId.length > 100 || !materialId || materialId.length > 100) {
    return { formError: "資料を確認できませんでした。画面を再読み込みしてください。" };
  }

  const access = await getLabMemberAccess(labId);
  if (!access) {
    return { formError: "このLabの資料を操作できません。画面を再読み込みしてください。" };
  }

  try {
    await deleteMaterial(
      prisma,
      { deleteObject: deleteMaterialObject },
      { labId: access.labId, materialId },
    );
  } catch (error) {
    if (error instanceof MaterialOperationError) {
      if (error.code === "STORAGE_DELETE_FAILED") {
        return {
          formError:
            "ストレージからファイルを削除できませんでした。資料情報は残しています。時間をおいて再度お試しください。",
        };
      }

      return { formError: "資料を確認できませんでした。画面を再読み込みしてください。" };
    }

    return {
      formError: "資料を削除できませんでした。時間をおいて再度お試しください。",
    };
  }

  const path = getMaterialsPath(access.labId);
  revalidatePath(path);
  redirect(path);
}

async function getLabMemberAccess(labId: string) {
  try {
    return await requireLabMember(labId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return null;
    }

    throw error;
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : null;
}

function isFileEntry(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.size === "number" &&
    typeof value.arrayBuffer === "function"
  );
}

function getMaterialsPath(labId: string) {
  return `/labs/${encodeURIComponent(labId)}/materials`;
}
