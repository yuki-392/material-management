"use client";

import { useCloseAddDialogOnSuccess } from "@/components/add-dialog";
import { useActionState, useId, useState, type FormEvent } from "react";

import { MATERIAL_DESCRIPTION_MAX_LENGTH, MATERIAL_TITLE_MAX_LENGTH } from "@/lib/material-validation.js";
import type { MaterialFormState } from "@/lib/material-form-state";
import { initialMaterialFormState } from "@/lib/material-form-state";
import { deleteMaterialAction, updateMaterialAction, uploadMaterialAction } from "./actions";
import {
  Button,
  FieldError,
  FormError,
  inputClassName,
  textareaClassName,
} from "@/components/ui";

export function MaterialUploadForm({
  labId,
  uploadBlocked = false,
  uploadBlockedMessage,
}: {
  labId: string;
  uploadBlocked?: boolean;
  uploadBlockedMessage?: string;
}) {
  const [state, formAction, isPending] = useActionState<
    MaterialFormState,
    FormData
  >(uploadMaterialAction, initialMaterialFormState);
  useCloseAddDialogOnSuccess(state.success);

  return (
    <form
      action={formAction}
      className="mt-5 space-y-4"
      noValidate
    >
      <input name="labId" type="hidden" value={labId} />

      <MaterialFields state={state} />

      {state.formError ? <FormError message={state.formError} /> : null}

      {uploadBlockedMessage ? (
        <FormError message={uploadBlockedMessage} />
      ) : null}

      <Button disabled={isPending || uploadBlocked} type="submit">
        {isPending ? "アップロード中…" : "資料をアップロード"}
      </Button>
    </form>
  );
}

export function EditMaterialForm({
  labId, materialId, updatedAt, title, description,
}: {
  labId: string;
  materialId: string;
  updatedAt: string;
  title: string;
  description: string;
}) {
  const [state, formAction, isPending] = useActionState(async (previous: MaterialFormState, data: FormData) => {
    const file = data.get("file");
    // Remove the native empty picker before React serializes the request.
    if (file instanceof File && file.name === "" && file.size === 0) {
      data.delete("file");
    }
    const result = await updateMaterialAction(previous, data);
    return { ...result, reselectFile: data.has("file") && !result.success };
  }, initialMaterialFormState);

  return (
    <form action={formAction} className="mt-4 space-y-4" noValidate>
      <input name="labId" type="hidden" value={labId} />
      <input name="materialId" type="hidden" value={materialId} />
      <input name="updatedAt" type="hidden" value={updatedAt} />
      <MaterialFields initialTitle={title} initialDescription={description} isEdit state={state} />
      {state.formError ? <FormError message={state.formError} /> : null}
      {state.reselectFile ? <p className="text-sm text-slate-600" role="status">再度差し替える場合はファイルを選択してください。</p> : null}
      <Button disabled={isPending} type="submit">
        {isPending ? "保存中…" : "変更を保存"}
      </Button>
    </form>
  );
}

function MaterialFields({
  state,
  initialTitle = "",
  initialDescription = "",
  isEdit = false,
}: {
  state: MaterialFormState;
  initialTitle?: string;
  initialDescription?: string;
  isEdit?: boolean;
}) {
  const id = useId();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);

  return (
    <>
      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor={`${id}-title`}
        >
          タイトル
        </label>
        <input
          aria-describedby={state.fieldErrors?.title ? `${id}-title-error` : undefined}
          aria-invalid={Boolean(state.fieldErrors?.title)}
          className={inputClassName}
          id={`${id}-title`}
          maxLength={MATERIAL_TITLE_MAX_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
          name="title"
          required
        />
        <FieldError id={`${id}-title-error`} message={state.fieldErrors?.title} />
      </div>

      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor={`${id}-description`}
        >
          説明（任意）
        </label>
        <textarea
          aria-describedby={state.fieldErrors?.description ? `${id}-description-error` : undefined}
          aria-invalid={Boolean(state.fieldErrors?.description)}
          className={textareaClassName}
          id={`${id}-description`}
          maxLength={MATERIAL_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
          name="description"
          rows={3}
        />
        <FieldError
          id={`${id}-description-error`}
          message={state.fieldErrors?.description}
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor={`${id}-file`}
        >
          {isEdit ? "差し替えるファイル（任意）" : "ファイル"}
        </label>
        <input
          accept=".pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
          aria-describedby={state.fieldErrors?.file ? `${id}-file-error` : `${id}-file-help`}
          aria-invalid={Boolean(state.fieldErrors?.file)}
          className="mt-2 block min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:min-h-8 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          id={`${id}-file`}
          name="file"
          required={!isEdit}
          type="file"
        />
        <p className="mt-1 text-xs text-slate-500" id={`${id}-file-help`}>
          PDF、DOCX、PPTX、XLSX、JPEG、PNG（4MiB以下）
          {isEdit ? "。選択しない場合は現在のファイルを使います。" : ""}
        </p>
        <FieldError id={`${id}-file-error`} message={state.fieldErrors?.file} />
      </div>
    </>
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
