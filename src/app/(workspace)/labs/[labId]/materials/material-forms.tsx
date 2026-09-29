"use client";

import { useActionState, type FormEvent } from "react";

import type { MaterialFormState } from "@/lib/material-form-state";
import { initialMaterialFormState } from "@/lib/material-form-state";
import { deleteMaterialAction, uploadMaterialAction } from "./actions";
import {
  Button,
  FieldError,
  FormError,
  inputClassName,
  textareaClassName,
} from "@/components/ui";

export function MaterialUploadForm({ labId }: { labId: string }) {
  const [state, formAction, isPending] = useActionState<
    MaterialFormState,
    FormData
  >(uploadMaterialAction, initialMaterialFormState);

  return (
    <form
      action={formAction}
      className="mt-5 space-y-4"
      noValidate
    >
      <input name="labId" type="hidden" value={labId} />

      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor="material-title"
        >
          タイトル
        </label>
        <input
          aria-describedby={state.fieldErrors?.title ? "material-title-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.title)}
          className={inputClassName}
          id="material-title"
          maxLength={200}
          name="title"
          required
        />
        <FieldError id="material-title-error" message={state.fieldErrors?.title} />
      </div>

      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor="material-description"
        >
          説明（任意）
        </label>
        <textarea
          aria-describedby={state.fieldErrors?.description ? "material-description-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.description)}
          className={textareaClassName}
          id="material-description"
          maxLength={5000}
          name="description"
          rows={3}
        />
        <FieldError
          id="material-description-error"
          message={state.fieldErrors?.description}
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor="material-file"
        >
          ファイル
        </label>
        <input
          accept=".pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
          aria-describedby={state.fieldErrors?.file ? "material-file-error" : "material-file-help"}
          aria-invalid={Boolean(state.fieldErrors?.file)}
          className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:min-h-8 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          id="material-file"
          name="file"
          required
          type="file"
        />
        <p className="mt-1 text-xs text-slate-500" id="material-file-help">
          PDF、DOCX、PPTX、XLSX、JPEG、PNG（20MiB以下）
        </p>
        <FieldError id="material-file-error" message={state.fieldErrors?.file} />
      </div>

      {state.formError ? <FormError message={state.formError} /> : null}

      <Button disabled={isPending} type="submit">
        {isPending ? "アップロード中…" : "資料をアップロード"}
      </Button>
    </form>
  );
}

export function DeleteMaterialForm({
  labId,
  materialId,
  title,
}: {
  labId: string;
  materialId: string;
  title: string;
}) {
  const [state, formAction, isPending] = useActionState<
    MaterialFormState,
    FormData
  >(deleteMaterialAction, initialMaterialFormState);

  function confirmDeletion(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`「${title}」とファイルを削除しますか？`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmDeletion}>
      <input name="labId" type="hidden" value={labId} />
      <input name="materialId" type="hidden" value={materialId} />
      <Button disabled={isPending} type="submit" variant="danger">
        {isPending ? "削除中…" : "削除"}
      </Button>
      {state.formError ? <FormError message={state.formError} /> : null}
    </form>
  );
}
