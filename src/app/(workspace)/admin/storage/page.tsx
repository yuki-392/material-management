import { notFound } from "next/navigation";

import { AppAdminAuthorizationError, requireAppAdmin } from "@/lib/app-admin-authorization";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { StorageQuotaError, getStorageOverview } from "@/lib/storage-quota-core.js";
import { StorageAllocationForm } from "./storage-allocation-form";

export const dynamic = "force-dynamic";

const GIGABYTE_BYTES = 1_000_000_000n;

export default async function StorageAdminPage() {
  try {
    await requireAppAdmin();
  } catch (error) {
    if (error instanceof AppAdminAuthorizationError) {
      notFound();
    }
    throw error;
  }

  let overview: Awaited<ReturnType<typeof getStorageOverview>>;
  try {
    overview = await getStorageOverview(prisma);
  } catch (error) {
    if (
      error instanceof StorageQuotaError &&
      error.code === "STORAGE_QUOTA_CONFIGURATION_FAILED"
    ) {
      return (
        <div className="space-y-6">
          <PageHeader
            eyebrow="管理者専用"
            title="ストレージ容量"
            description="Labごとの資料保存量と割当を管理します。"
          />
          <Card>
            <p className="font-semibold text-amber-900">容量制御が初期化されていません。</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              本番DBにストレージ容量のPrismaマイグレーションを適用してから、ページを再読み込みしてください。
            </p>
          </Card>
        </div>
      );
    }
    throw error;
  }

  const allocationPercent = getPercent(
    overview.allocatedBytes,
    overview.allocationLimitBytes,
  );
  const globalPercent = getPercent(
    overview.effectiveUsedBytes,
    overview.globalLimitBytes,
  );

  return (
    <div className="space-y-7 sm:space-y-8">
      <PageHeader
        eyebrow="管理者専用"
        title="ストレージ容量"
        description="Labごとの保存量と割当を確認し、未使用の容量を再配分します。"
        actions={
          <ButtonLink href="/labs" variant="secondary">
            Lab一覧へ戻る
          </ButtonLink>
        }
      />

      {overview.overAllocated || overview.overLabLimit ? (
        <div
          className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"
          role="status"
        >
          <h2 className="font-bold">現在の設定が新規受付の上限を超えています</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6">
            {overview.overAllocated ? (
              <li>既存Labへの割当合計が8GBを超えています。割当を減らすまで、新規Labと割当増加は受け付けません。</li>
            ) : null}
            {overview.overLabLimit ? (
              <li>既存Lab数が累計上限の8件を超えています。現在のLabと資料は保持されます。</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          label="アプリ全体の使用量"
          value={`${formatGb(overview.effectiveUsedBytes)} / ${formatGb(overview.globalLimitBytes)}`}
          percent={globalPercent}
          warning={overview.globalState.warning}
          warningText={
            overview.globalState.full
              ? "全体上限に達しています。全Labのアップロードを停止中です。"
              : overview.globalState.warning
                ? "全体使用量が80%に達しています。"
                : undefined
          }
        />
        <SummaryCard
          label="Labへの割当"
          value={`${formatGb(overview.allocatedBytes)} / ${formatGb(overview.allocationLimitBytes)}`}
          percent={allocationPercent}
          warning={overview.overAllocated}
          warningText={overview.overAllocated ? "割当合計が上限を超えています。" : undefined}
        />
        <Card>
          <p className="text-sm font-semibold text-slate-600">作成済みLab数</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">
            {overview.labCount} / 8件
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            8件は累計上限です。Labの削除や枠の再利用はありません。
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-700">Labごとの割当</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">研究室一覧</h2>
          </div>
          <p className="text-sm tabular-nums text-slate-600">
            使用量 {formatGb(overview.totalUsedBytes)} ・予約中 {formatGb(overview.totalReservedBytes)}
          </p>
        </div>

        {overview.labs.length === 0 ? (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            まだLabは作成されていません。
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
            {overview.labs.map((lab) => (
              <li className="py-5 sm:py-6" key={lab.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-semibold text-slate-950">
                      {lab.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      作成日 {formatDate(lab.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-slate-700">
                    使用 {formatGb(lab.usedBytes)} / 割当 {formatGb(lab.limitBytes)}
                  </p>
                </div>

                <StorageMeter
                  label={`${lab.name}の使用量`}
                  percent={Math.min(lab.state.percentUsed, 100)}
                  warning={lab.state.warning}
                />

                {lab.state.warning || lab.state.full ? (
                  <p className="mt-2 text-sm font-medium text-amber-800" role="status">
                    {lab.state.full
                      ? "割当上限に達しています。このLabのアップロードを停止中です。"
                      : "このLabの使用量が割当の80%に達しています。"}
                  </p>
                ) : null}

                <StorageAllocationForm
                  labId={lab.id}
                  limitGb={formatGbExact(lab.limitBytes)}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs leading-5 text-slate-500">
        使用量はDBに登録済みの資料と有効なアップロード予約の合計です。Backblaze上の旧バージョンやDBに登録されていない孤立ファイルは含まれないため、予備容量とストレージのライフサイクル設定を維持してください。
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  percent,
  warning,
  warningText,
}: {
  label: string;
  value: string;
  percent: number;
  warning: boolean;
  warningText?: string;
}) {
  return (
    <Card>
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{value}</p>
      <StorageMeter label={label} percent={percent} warning={warning} />
      {warningText ? (
        <p className="mt-2 text-sm font-medium text-amber-800" role="status">
          {warningText}
        </p>
      ) : null}
    </Card>
  );
}

function StorageMeter({
  label,
  percent,
  warning,
}: {
  label: string;
  percent: number;
  warning: boolean;
}) {
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.min(percent, 100)}
      className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200"
      role="meter"
    >
      <div
        className={`h-full rounded-full ${warning ? "bg-amber-500" : "bg-indigo-600"}`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function getPercent(used: bigint, limit: bigint) {
  return limit > 0n ? Number((used * 100n) / limit) : 0;
}

function formatGb(bytes: bigint) {
  return `${(Number(bytes) / Number(GIGABYTE_BYTES)).toFixed(2)} GB`;
}

function formatGbExact(bytes: bigint) {
  const whole = bytes / GIGABYTE_BYTES;
  const remainder = bytes % GIGABYTE_BYTES;
  if (remainder === 0n) {
    return whole.toString();
  }
  const fraction = remainder.toString().padStart(9, "0").replace(/0+$/, "");
  return `${whole}.${fraction}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeZone: "Asia/Tokyo",
  }).format(date);
}
