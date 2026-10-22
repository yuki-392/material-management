import { notFound, redirect } from "next/navigation";

import {
  AuthorizationError,
  requireLabMember,
} from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { listLabMaterials } from "@/lib/material-core.js";
import { getLabStorageUsage } from "@/lib/storage-quota-core.js";
import {
  buildListPageHref,
  LIST_PAGE_SIZE,
  parseListPage,
  parseListSearch,
  parseMaterialType,
} from "@/lib/list-query.js";
import {
  Button,
  ButtonLink,
  Card,
  controlClassName,
  EmptyState,
  PageHeader,
  getButtonClassName,
} from "@/components/ui";
import { MaterialUploadForm, DeleteMaterialForm } from "./material-forms";

export default async function MaterialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ labId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ labId }, rawSearchParams] = await Promise.all([params, searchParams]);
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

  const filters = {
    query: parseListSearch(rawSearchParams.q),
    type: parseMaterialType(rawSearchParams.type),
    page: parseListPage(rawSearchParams.page),
  };
  const materialsPath = `/labs/${encodeURIComponent(access.labId)}/materials`;
  const [materials, storageUsage] = await Promise.all([
    listLabMaterials(prisma, {
      labId: access.labId,
      query: filters.query,
      type: filters.type || undefined,
      page: filters.page,
    }),
    getLabStorageUsage(prisma, access.labId),
  ]);
  const uploadBlocked = storageUsage.state.full || storageUsage.globalState.full;
  const uploadBlockedMessage = storageUsage.state.full
    ? "この研究室の保存容量に達したため、資料を追加できません。不要な資料を削除するか、管理者に割当変更を依頼してください。"
    : storageUsage.globalState.full
      ? "アプリ全体の保存上限に達したため、資料を追加できません。管理者にお問い合わせください。"
      : undefined;
  const resultStart =
    materials.totalCount === 0 ? 0 : (materials.page - 1) * LIST_PAGE_SIZE + 1;
  const resultEnd = Math.min(
    materials.page * LIST_PAGE_SIZE,
    materials.totalCount,
  );

  return (
    <div className="space-y-7 sm:space-y-8">
      <PageHeader
        eyebrow="資料管理"
        title="資料"
        description="Lab内で共有する研究資料をアップロードして管理します。"
        actions={
          <ButtonLink href="/labs" variant="secondary">
            Labへ戻る
          </ButtonLink>
        }
      />

      <Card aria-labelledby="storage-usage-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-700">容量の目安</p>
            <h2
              className="mt-1 text-xl font-bold text-slate-950"
              id="storage-usage-heading"
            >
              この研究室の保存量
            </h2>
          </div>
          <p className="text-sm font-semibold tabular-nums text-slate-700">
            {formatStorageGb(storageUsage.usedBytes)} / {formatStorageGb(storageUsage.limitBytes)}
          </p>
        </div>
        <div
          aria-label="研究室の保存容量使用率"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.min(storageUsage.state.percentUsed, 100)}
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200"
          role="meter"
        >
          <div
            className={`h-full rounded-full ${storageUsage.state.warning || storageUsage.state.full ? "bg-amber-500" : "bg-indigo-600"}`}
            style={{ width: `${Math.min(storageUsage.state.percentUsed, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          割当の {storageUsage.state.percentUsed}% を使用中
        </p>
        {storageUsage.state.warning || storageUsage.state.full ? (
          <p
            className={`mt-3 rounded-xl px-4 py-3 text-sm leading-5 ${storageUsage.state.full ? "border border-rose-200 bg-rose-50 text-rose-900" : "border border-amber-200 bg-amber-50 text-amber-950"}`}
            role={storageUsage.state.full ? "alert" : "status"}
          >
            {storageUsage.state.full
              ? "研究室の割当上限に達しています。資料を追加するには不要な資料を削除するか、管理者に割当変更を依頼してください。"
              : "保存容量が割当の80%に達しています。不要な資料を整理するか、管理者にご相談ください。"}
          </p>
        ) : null}
        {storageUsage.globalState.full ? (
          <p
            className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-900"
            role="alert"
          >
            アプリ全体の保存上限に達しているため、すべての研究室でアップロードを停止しています。
          </p>
        ) : null}
      </Card>

      <Card aria-labelledby="material-upload-heading" id="material-upload">
        <p className="text-sm font-semibold text-indigo-700">ファイル共有</p>
        <h2
          className="mt-1 text-xl font-bold text-slate-950"
          id="material-upload-heading"
        >
          資料を追加
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          対応形式はPDF、DOCX、PPTX、XLSX、JPEG、PNGです。
        </p>
        <MaterialUploadForm
          labId={access.labId}
          uploadBlocked={uploadBlocked}
          uploadBlockedMessage={uploadBlockedMessage}
        />
      </Card>

      <Card aria-labelledby="materials-list-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            className="text-xl font-bold text-slate-950"
            id="materials-list-heading"
          >
            登録済み資料
          </h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold tabular-nums text-slate-700">
            {materials.totalCount}件
            {materials.totalCount > 0
              ? `（${resultStart}〜${resultEnd}件表示）`
              : ""}
          </span>
        </div>

        <form
          action={materialsPath}
          className="mt-5 grid gap-4 border-y border-slate-200 py-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)_auto] lg:items-end"
          method="get"
        >
          <div>
            <label
              className="text-sm font-semibold text-slate-700"
              htmlFor="material-search"
            >
              キーワード
            </label>
            <input
              className={`mt-2 ${controlClassName}`}
              defaultValue={filters.query}
              id="material-search"
              maxLength={100}
              name="q"
              placeholder="タイトル・説明・ファイル名を検索"
              type="search"
            />
          </div>
          <div>
            <label
              className="text-sm font-semibold text-slate-700"
              htmlFor="material-type-filter"
            >
              ファイル形式
            </label>
            <select
              className={`mt-2 ${controlClassName}`}
              defaultValue={filters.type}
              id="material-type-filter"
              name="type"
            >
              <option value="">すべて</option>
              <option value="pdf">PDF</option>
              <option value="word">Word</option>
              <option value="powerpoint">PowerPoint</option>
              <option value="excel">Excel</option>
              <option value="image">画像</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit">検索</Button>
            <ButtonLink href={materialsPath} variant="secondary">
              条件をクリア
            </ButtonLink>
          </div>
        </form>

        {materials.totalCount === 0 ? (
          <div className="mt-5">
            <EmptyState
              title={
                filters.query || filters.type
                  ? "条件に一致する資料はありません"
                  : "まだ資料はありません"
              }
              description={
                filters.query || filters.type
                  ? "検索語やファイル形式を変更してください。"
                  : "最初の資料を登録すると、Labメンバーが認証付きで閲覧・ダウンロードできます。"
              }
              action={
                <ButtonLink
                  href={
                    filters.query || filters.type
                      ? materialsPath
                      : "#material-upload"
                  }
                  variant="secondary"
                >
                  {filters.query || filters.type ? "条件をクリア" : "資料の登録へ"}
                </ButtonLink>
              }
            />
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
            {materials.items.map((material) => {
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
                <li className="py-5 sm:py-6" key={material.id}>
                  <article className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-lg font-semibold text-slate-950">
                          {material.title}
                        </h3>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {getFileTypeLabel(material.contentType)}
                        </span>
                      </div>
                      <p className="mt-2 break-all text-sm font-medium text-slate-700">
                        {material.originalFileName}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        登録日：{formatDate(material.createdAt)}
                      </p>
                      <details className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 open:bg-slate-50/60">
                        <summary className="cursor-pointer rounded text-sm font-semibold text-indigo-800 marker:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">
                          詳細
                        </summary>
                        {material.description ? (
                          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                            {material.description}
                          </p>
                        ) : null}
                        <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
                          <div className="min-w-0">
                            <dt className="text-xs font-semibold text-slate-500">
                              ファイル形式
                            </dt>
                            <dd className="mt-1 break-all font-medium text-slate-800">
                              {material.contentType}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold text-slate-500">
                              サイズ
                            </dt>
                            <dd className="mt-1 font-medium tabular-nums text-slate-800">
                              {formatFileSize(material.sizeBytes)}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs font-semibold text-slate-500">
                              登録者
                            </dt>
                            <dd className="mt-1 break-words font-medium text-slate-800">
                              {uploaderName}
                            </dd>
                          </div>
                        </dl>
                      </details>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <a
                        className={getButtonClassName("secondary", "min-h-10")}
                        href={fileUrl}
                        rel={inline ? "noreferrer" : undefined}
                        target={inline ? "_blank" : undefined}
                        aria-label={
                          inline
                            ? `${material.title}を新しいタブで開く`
                            : `${material.title}をダウンロード`
                        }
                      >
                        {inline ? "開く" : "ダウンロード"}
                      </a>
                      <DeleteMaterialForm
                        labId={access.labId}
                        materialId={material.id}
                        title={material.title}
                      />
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        {materials.pageCount > 1 ? (
          <nav
            aria-label="資料一覧のページ"
            className="mt-5 flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-slate-600">
              {materials.page} / {materials.pageCount}ページ
            </p>
            <div className="flex gap-2">
              {materials.page > 1 ? (
                <ButtonLink
                  href={buildListPageHref(materialsPath, {
                    q: filters.query,
                    type: filters.type,
                    page: materials.page - 1,
                  })}
                  variant="secondary"
                >
                  前へ
                </ButtonLink>
              ) : (
                <Button disabled type="button" variant="secondary">
                  前へ
                </Button>
              )}
              {materials.page < materials.pageCount ? (
                <ButtonLink
                  href={buildListPageHref(materialsPath, {
                    q: filters.query,
                    type: filters.type,
                    page: materials.page + 1,
                  })}
                  variant="secondary"
                >
                  次へ
                </ButtonLink>
              ) : (
                <Button disabled type="button" variant="secondary">
                  次へ
                </Button>
              )}
            </div>
          </nav>
        ) : null}
      </Card>
    </div>
  );
}

function getFileTypeLabel(contentType: string) {
  const labels: Record<string, string> = {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "PowerPoint",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "Excel",
    "image/jpeg": "JPEG画像",
    "image/png": "PNG画像",
  };

  return labels[contentType] ?? "ファイル";
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  return `${(sizeBytes / 1024).toFixed(1)} KiB`;
}

function formatStorageGb(bytes: bigint) {
  return `${(Number(bytes) / 1_000_000_000).toFixed(2)} GB`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(date);
}
