"use server";

import { refresh, revalidatePath } from "next/cache";

import {
  AuthorizationError,
  requireLabMember,
} from "@/lib/authorization";
import { prisma } from "@/lib/db";
import {
  MaterialOperationError,
  createMaterial,
  deleteMaterial,
  updateMaterial,
} from "@/lib/material-core.js";
import {
  MAX_MATERIAL_FILE_SIZE,
  validateMaterialInput,
  validateMaterialEditInput,
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

    if (error instanceof MaterialOperationError) {
      if (error.code === "METADATA_CREATE_UNCONFIRMED") {
        return { formError: "保存結果を確認できませんでした。再送信する前に資料一覧を確認してください。" };
      }
    } else {
      logMaterialError("material.upload.unclassified", error);
    }

    return { formError: saveError };
  }

  const path = getMaterialsPath(access.labId);
  revalidatePath(path);
  refresh();
  return { success: true };
}

export async function updateMaterialAction(
  _previousState: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  const labId = readString(formData.get("labId"));
  const materialId = readString(formData.get("materialId"));
  const revision = readString(formData.get("updatedAt"));
  const updatedAt = new Date(revision ?? "");
  if (!labId || !materialId || labId.length > 100 || materialId.length > 100 ||
      !Number.isFinite(updatedAt.getTime()) || updatedAt.toISOString() !== revision) {
    return { formError: "資料を確認できませんでした。画面を再読み込みしてください。" };
  }

  const access = await getLabMemberAccess(labId);
  if (!access) {
    return { formError: "このLabの資料を操作できません。画面を再読み込みしてください。" };
  }

  const file = formData.get("file");
  // multipartフォームでは、ファイルを選ばなくても空のFileが送信される。
  const replacement = isFileEntry(file) && file.name === "" && file.size === 0 ? null : file;
  const validation = validateMaterialEditInput({
    title: formData.get("title"),
    description: formData.get("description"),
    file: replacement,
  });
  if (!validation.success) return { fieldErrors: validation.fieldErrors };

  try {
    const fileData = validation.data.file && isFileEntry(replacement)
      ? { ...validation.data.file, body: new Uint8Array(await replacement.arrayBuffer()) }
      : null;
    await updateMaterial(prisma, { putObject: putMaterialObject, deleteObject: deleteMaterialObject }, {
      ...access, materialId, updatedAt,
      title: validation.data.title,
      description: validation.data.description,
      file: fileData,
    });
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      if (error.code === "LAB_QUOTA_EXCEEDED") {
        return { fieldErrors: { file: "研究室の残り容量を超えています。より小さいファイルを選んでください。" } };
      }
      if (error.code === "GLOBAL_QUOTA_EXCEEDED") {
        return { fieldErrors: { file: "アプリ全体の残り容量を超えています。より小さいファイルを選んでください。" } };
      }
      if (error.code === "RESERVATION_EXPIRED") {
        return { formError: "保存容量の予約が切れました。ファイルを選び直して再度保存してください。" };
      }
    }
    if (error instanceof MaterialOperationError) {
      if (error.code === "NOT_FOUND") {
        return { formError: "資料が見つからないか、編集権限がありません。" };
      }
      if (error.code === "CONFLICT") {
        return { formError: "資料が更新または削除されました。画面を再読み込みして確認してください。" };
      }
    }
    logMaterialError("material.update", error);
    return { formError: "資料を保存できませんでした。画面を再読み込みして確認してください。" };
  }

  revalidatePath(getMaterialsPath(access.labId));
  refresh();
  return { success: true };
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
      { ...access, materialId },
    );
  } catch (error) {
    if (error instanceof MaterialOperationError) {
      if (error.code === "STORAGE_DELETE_FAILED") {
        return {
          formError:
            "ストレージからファイルを削除できませんでした。資料情報は残しています。時間をおいて再度お試しください。",
        };
      }

      return { formError: "資料が見つからないか、削除権限がありません。" };
    }

    return {
      formError: "資料を削除できませんでした。時間をおいて再度お試しください。",
    };
  }

  const path = getMaterialsPath(access.labId);
  revalidatePath(path);
  refresh();
  return { success: true };
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
