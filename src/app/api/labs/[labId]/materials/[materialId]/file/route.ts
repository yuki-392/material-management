import {
  AuthorizationError,
  requireLabMember,
} from "@/lib/authorization";
import { prisma } from "@/lib/db";
import {
  MaterialOperationError,
  createMaterialFileResponse,
  getMaterialFile,
} from "@/lib/material-core.js";
import { getMaterialObject } from "@/lib/material-storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ labId: string; materialId: string }> },
) {
  const { labId, materialId } = await context.params;

  try {
    const access = await requireLabMember(labId);
    const file = await getMaterialFile(
      prisma,
      { getObject: getMaterialObject },
      { labId: access.labId, materialId },
    );

    return createMaterialFileResponse(file.material, file.body);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "UNAUTHENTICATED") {
        return new Response("ログインが必要です。", { status: 401 });
      }

      if (error.code === "PROFILE_INCOMPLETE") {
        return new Response("プロフィールを完了してください。", { status: 403 });
      }

      return new Response("資料が見つかりません。", { status: 404 });
    }

    if (
      error instanceof MaterialOperationError &&
      (error.code === "NOT_FOUND" || error.code === "STORAGE_OBJECT_MISSING")
    ) {
      return new Response("資料が見つかりません。", { status: 404 });
    }

    console.error("Material file retrieval failed.");
    return new Response("資料を取得できませんでした。", { status: 503 });
  }
}
