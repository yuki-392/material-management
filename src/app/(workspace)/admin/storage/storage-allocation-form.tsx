"use client";

import { useActionState } from "react";

import { Button, FormError, inputClassName } from "@/components/ui";
import {
  initialStorageAdminFormState,
  type StorageAdminFormState,
} from "@/lib/storage-admin-form-state";
import { updateLabStorageLimitAction } from "./actions";

export function StorageAllocationForm({
  labId,
  limitGb,
}: {
  labId: string;
  limitGb: string;
}) {
  const [state, formAction, isPending] = useActionState<
    StorageAdminFormState,
    FormData
  >(updateLabStorageLimitAction, initialStorageAdminFormState);
  const inputId = `storage-limit-${labId}`;

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input name="labId" type="hidden" value={labId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-32 flex-1">
          <label
            className="block text-xs font-semibold text-slate-700"
            htmlFor={inputId}
          >
            割当容量（GB）
          </label>
          <input
            className={inputClassName}
            defaultValue={limitGb}
            id={inputId}
            inputMode="decimal"
            max="8"
            min="0"
            name="limitGb"
            required
            step="any"
            type="number"
          />
        </div>
        <Button disabled={isPending} type="submit" variant="secondary">
          {isPending ? "更新中…" : "割当を更新"}
        </Button>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        アップロード中の予約を含む現在量未満にはできません。全Labの割当合計は8GB以下です。
      </p>
      {state.formError ? <FormError message={state.formError} /> : null}
      {state.formSuccess ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {state.formSuccess}
        </p>
      ) : null}
    </form>
  );
}
