import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AuthorizationError,
  requireLabMember,
} from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { listLabMaterials } from "@/lib/material-core.js";
import { MaterialUploadForm, DeleteMaterialForm } from "./material-forms";

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ labId: string }>;
}) {
  const { labId } = await params;
  let access;

  try {
    access = await requireLabMember(labId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }

      if (error.code === "PROFILE_INCOMPLETE") {
        redirect("/profile/setup");
      }

      notFound();
    }

    throw error;
  }

  const materials = await listLabMaterials(prisma, {
    labId: access.labId,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-700">Lab資料</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            資料
          </h1>
        </div>
        <Link
          className="text-sm font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-4 hover:text-indigo-900"
          href="/labs"
        >
          Labへ戻る
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold text-slate-900">資料を追加</h2>
        <MaterialUploadForm labId={access.labId} />
      </section>

      <section
        aria-labelledby="materials-list-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            className="text-lg font-bold text-slate-900"
            id="materials-list-heading"
          >
            登録済み資料
          </h2>
          <p className="text-sm text-slate-500">{materials.length}件</p>
        </div>

        {materials.length === 0 ? (
          <p className="mt-5 rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-600">
            まだ資料はありません。
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {materials.map((material) => {
              const fileUrl = `/api/labs/${encodeURIComponent(access.labId)}/materials/${encodeURIComponent(material.id)}/file`;
              const inline = [
                "application/pdf",
                "image/jpeg",
                "image/png",
              ].includes(material.contentType);
              const uploaderName =
                material.uploader?.name?.trim() ||
                material.uploader?.email ||
                "登録者不明";

              return (
                <li className="py-5" key={material.id}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold text-slate-900">
                        {material.title}
                      </h3>
                      {material.description ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
                          {material.description}
                        </p>
                      ) : null}
                      <p className="mt-2 break-all text-sm text-slate-600">
                        {material.originalFileName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {material.contentType} · {formatFileSize(material.sizeBytes)} · {uploaderName} · {formatDate(material.createdAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <a
                        className="inline-flex min-h-10 items-center rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        href={fileUrl}
                        rel={inline ? "noreferrer" : undefined}
                        target={inline ? "_blank" : undefined}
                      >
                        {inline ? "開く" : "ダウンロード"}
                      </a>
                      <DeleteMaterialForm
                        labId={access.labId}
                        materialId={material.id}
                        title={material.title}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  return `${(sizeBytes / 1024).toFixed(1)} KiB`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(date);
}
