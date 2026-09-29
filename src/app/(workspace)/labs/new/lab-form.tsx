"use client";

import { useActionState } from "react";
import Link from "next/link";

import { createLabAction } from "./actions";
import {
  initialLabActionState,
  type LabActionState,
} from "@/lib/lab-form-state";

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
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
          id="name"
          maxLength={100}
          name="name"
          required
        />
        {state.nameError ? (
          <p className="mt-1 text-sm text-red-700" id="lab-name-error">
            {state.nameError}
          </p>
        ) : null}
      </div>

      {state.formError ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "作成中…" : "Labを作成"}
        </button>
        <Link
          className="min-h-11 rounded-lg px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          href="/labs"
        >
          戻る
        </Link>
      </div>
    </form>
  );
}
