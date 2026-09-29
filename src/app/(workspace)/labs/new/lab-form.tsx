"use client";

import { useActionState } from "react";

import { createLabAction } from "./actions";
import {
  initialLabActionState,
  type LabActionState,
} from "@/lib/lab-form-state";
import {
  Button,
  ButtonLink,
  FieldError,
  FormError,
  inputClassName,
} from "@/components/ui";

export function LabForm() {
  const [state, formAction, isPending] = useActionState<
    LabActionState,
    FormData
  >(createLabAction, initialLabActionState);

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor="name"
        >
          Lab名
        </label>
        <input
          autoComplete="organization"
          aria-describedby={state.nameError ? "lab-name-error" : undefined}
          aria-invalid={Boolean(state.nameError)}
          className={inputClassName}
          id="name"
          maxLength={100}
          name="name"
          required
        />
        <FieldError id="lab-name-error" message={state.nameError} />
      </div>

      {state.formError ? <FormError message={state.formError} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button disabled={isPending} type="submit">
          {isPending ? "作成中…" : "Labを作成"}
        </Button>
        <ButtonLink href="/labs" variant="secondary">
          戻る
        </ButtonLink>
      </div>
    </form>
  );
}
