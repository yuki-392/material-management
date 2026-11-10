import Form from "next/form";
import { notFound, redirect } from "next/navigation";

import { AuthorizationError, requireLabMember } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { listLabMaterials } from "@/lib/material-core.js";
import { getLabStorageUsage } from "@/lib/storage-quota-core.js";
import {
  buildListPageHref,
  LIST_PAGE_SIZE,
  parseListPage,
  parseListSearch,
  parseMaterialType,
  parseMaterialUploader,
} from "@/lib/list-query.js";
import { Button, ButtonLink, Card, controlClassName, EmptyState, PageHeader, getButtonClassName } from "@/components/ui";
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
      if (error.code === "UNAUTHENTICATED") redirect("/login");
      if (error.code === "PROFILE_INCOMPLETE") redirect("/profile/setup");
      notFound();
    }
    throw error;
  }

  const materialsPath = `/labs/${encodeURIComponent(access.labId)}/materials`;
  const [labMembers, storageUsage] = await Promise.all([
    prisma.labMember.findMany({
      where: { labId: access.labId },
      orderBy: { joinedAt: "asc" },
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
    getLabStorageUsage(prisma, access.labId),
  ]);
  const filters = {
    query: parseListSearch(rawSearchParams.q),
    type: parseMaterialType(rawSearchParams.type),
    uploader: parseMaterialUploader(rawSearchParams.uploader, labMembers.map((member) => member.userId)),
    page: parseListPage(rawSearchParams.page),
  };
  const materials = await listLabMaterials(prisma, {
    labId: access.labId,
    query: filters.query,
    type: filters.type || undefined,
    uploaderId: filters.uploader || undefined,
    page: filters.page,
  });
  const uploadBlocked = storageUsage.state.full || storageUsage.globalState.full;
  const uploadBlockedMessage = storageUsage.state.full
    ? "この研究室の保存容量に達したため、資料を追加できません。不要な資料を削除するか、管理者に割当変更を依頼してください。"
    : storageUsage.globalState.full
      ? "アプリ全体の保存上限に達したため、管理者にお問い合わせください。"
      : undefined;
  const resultStart = materials.totalCount === 0 ? 0 : (materials.page - 1) * LIST_PAGE_SIZE + 1;
  const resultEnd = Math.min(materials.page * LIST_PAGE_SIZE, materials.totalCount);
  const hasActiveFilters = Boolean(filters.query || filters.type || filters.uploader);
  const clearHref = materialsPath;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="研究室の共有資料"
        title="資料"
        description="タイトル・投稿者・内容から探して、Labのメンバーと安全に共有できます。"
        actions={<ButtonLink href="#material-upload" variant="primary">＋ 資料を追加</ButtonLink>}
      />

      <Card aria-labelledby="storage-usage-heading" className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,2fr)_auto] sm:items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-800" id="storage-usage-heading">保存容量</h2>
            <p className="mt-1 text-xs text-slate-500">{storageUsage.state.percentUsed}% 使用中</p>
          </div>
          <div aria-label="研究室の保存容量使用率" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.min(storageUsage.state.percentUsed, 100)} className="h-2.5 overflow-hidden rounded-full bg-slate-200" role="meter">
            <div className={`h-full rounded-full transition-[width] duration-500 ${storageUsage.state.warning || storageUsage.state.full ? "bg-amber-500" : "bg-indigo-600"}`} style={{ width: `${Math.min(storageUsage.state.percentUsed, 100)}%` }} />
          </div>
          <p className="text-sm font-semibold tabular-nums text-slate-700 sm:text-right">{formatStorageGb(storageUsage.usedBytes)} <span className="font-normal text-slate-500">/ {formatStorageGb(storageUsage.limitBytes)}</span></p>
        </div>
        {storageUsage.state.warning || storageUsage.state.full ? (
          <p className={`mt-3 rounded-xl px-3 py-2.5 text-sm ${storageUsage.state.full ? "border border-rose-200 bg-rose-50 text-rose-900" : "border border-amber-200 bg-amber-50 text-amber-950"}`} role={storageUsage.state.full ? "alert" : "status"}>
            {storageUsage.state.full ? "割当上限に達しています。不要な資料を整理するか、管理者に割当変更をご相談ください。" : "保存容量が割当の80%に達しています。不要な資料を整理するか、管理者にご相談ください。"}
          </p>
        ) : null}
        {storageUsage.globalState.full ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900" role="alert">アプリ全体の保存上限に達しているため、アップロードを停止しています。</p> : null}
      </Card>

      <details className="group rounded-2xl border border-indigo-200 bg-white shadow-sm" id="material-upload">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-base font-bold text-slate-950">資料を追加</span>
            <span className="mt-1 block text-sm text-slate-600">ファイル形式：PDF・Word・PowerPoint・Excel・画像（4MiB以下）</span>
          </span>
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-lg font-semibold text-indigo-800 transition-transform group-open:rotate-45">＋</span>
        </summary>
        <div className="border-t border-slate-100 px-4 py-5 sm:px-6">
          <MaterialUploadForm labId={access.labId} uploadBlocked={uploadBlocked} uploadBlockedMessage={uploadBlockedMessage} />
        </div>
      </details>

      <Card aria-labelledby="materials-list-heading" className="p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950" id="materials-list-heading">資料一覧</h2>
            <p className="mt-1 text-sm text-slate-600">{materials.totalCount}件{materials.totalCount ? `（${resultStart}〜${resultEnd}件）` : ""}</p>
          </div>
        </div>

        <Form action={materialsPath} className="mt-4 grid gap-3 border-y border-slate-200 py-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)_minmax(10rem,1fr)_auto] lg:items-end" scroll={false}>
          <div>
            <label className="text-xs font-semibold text-slate-700" htmlFor="material-search">キーワード</label>
            <input className={`mt-1.5 ${controlClassName}`} defaultValue={filters.query} id="material-search" maxLength={100} name="q" placeholder="タイトル・説明・ファイル名" type="search" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700" htmlFor="material-type-filter">ファイル形式</label>
            <select className={`mt-1.5 ${controlClassName}`} defaultValue={filters.type} id="material-type-filter" name="type">
              <option value="">すべて</option><option value="pdf">PDF</option><option value="word">Word</option><option value="powerpoint">PowerPoint</option><option value="excel">Excel</option><option value="image">画像</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700" htmlFor="material-uploader-filter">投稿者</label>
            <select className={`mt-1.5 ${controlClassName}`} defaultValue={filters.uploader} id="material-uploader-filter" name="uploader">
              <option value="">全員</option>
              {labMembers.map((member) => <option key={member.userId} value={member.userId}>{member.user.name?.trim() || member.user.email || "名前未設定"}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit">検索</Button>
            <ButtonLink href={clearHref} scroll={false} variant="secondary">クリア</ButtonLink>
          </div>
        </Form>

        {materials.totalCount === 0 ? (
          <div className="mt-5">
            <EmptyState
              title={hasActiveFilters ? "条件に一致する資料はありません" : "まだ資料はありません"}
              description={hasActiveFilters ? "キーワード・形式・投稿者を変更してみてください。" : "最初の資料を登録すると、Labのメンバーが閲覧・ダウンロードできます。"}
              action={hasActiveFilters ? <ButtonLink href={clearHref} variant="secondary">条件をクリア</ButtonLink> : <ButtonLink href="#material-upload" variant="secondary">資料を追加</ButtonLink>}
            />
          </div>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {materials.items.map((material) => {
              const fileUrl = `/api/labs/${encodeURIComponent(access.labId)}/materials/${encodeURIComponent(material.id)}/file`;
              const inline = ["application/pdf", "image/jpeg", "image/png"].includes(material.contentType);
              const uploaderName = material.uploader?.name?.trim() || material.uploader?.email || "登録者不明";

              return (
                <li className="py-4 sm:py-5" key={material.id}>
                  <article className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 break-words text-base font-semibold text-slate-950">{material.title}</h3>
                        <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">{getFileTypeLabel(material.contentType)}</span>
                      </div>
                      <p className="mt-1.5 break-all text-sm text-slate-600">{material.originalFileName}</p>
                      {material.description ? <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">{material.description}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>投稿者：<span className="font-semibold text-slate-700">{uploaderName}</span></span>
                        <span>登録日：{formatDate(material.createdAt)}</span>
                        <span>{formatFileSize(material.sizeBytes)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <a className={getButtonClassName("secondary", "min-h-10")} href={fileUrl} rel={inline ? "noreferrer" : undefined} target={inline ? "_blank" : undefined} aria-label={inline ? `${material.title}を新しいタブで開く` : `${material.title}をダウンロード`}>
                        {inline ? "開く" : "ダウンロード"}
                      </a>
                      <DeleteMaterialForm labId={access.labId} materialId={material.id} title={material.title} />
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        {materials.pageCount > 1 ? (
          <nav aria-label="資料一覧のページ" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-sm text-slate-600">{materials.page} / {materials.pageCount}ページ</p>
            <div className="flex gap-2">
              {materials.page > 1 ? <ButtonLink href={buildListPageHref(materialsPath, { q: filters.query, type: filters.type, uploader: filters.uploader, page: materials.page - 1 })} variant="secondary">前へ</ButtonLink> : <Button disabled type="button" variant="secondary">前へ</Button>}
              {materials.page < materials.pageCount ? <ButtonLink href={buildListPageHref(materialsPath, { q: filters.query, type: filters.type, uploader: filters.uploader, page: materials.page + 1 })} variant="secondary">次へ</ButtonLink> : <Button disabled type="button" variant="secondary">次へ</Button>}
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
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "image/jpeg": "JPEG画像",
    "image/png": "PNG画像",
  };
  return labels[contentType] ?? "ファイル";
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(sizeBytes / 1024).toFixed(1)} KiB`;
}

function formatStorageGb(sizeBytes: bigint | number) {
  return `${(Number(sizeBytes) / (1024 ** 3)).toFixed(2)} GiB`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }).format(date);
}
