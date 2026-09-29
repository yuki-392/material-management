"use client";

import { useActionState, type FormEvent } from "react";

import {
  addMemberAction,
  removeMemberAction,
} from "./member-actions";
import {
  initialMemberFormState,
  type MemberFormState,
} from "@/lib/member-form-state";

export function AddMemberForm({ labId }: { labId: string }) {
  const [state, formAction, isPending] = useActionState<
    MemberFormState,
    FormData
  >(addMemberAction, initialMemberFormState);

  return (
    <form action={formAction} className="mt-5 space-y-3" noValidate>
      <input name="labId" type="hidden" value={labId} />
      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor="member-email"
        >
          追加する人のメールアドレス
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            autoComplete="email"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
            id="member-email"
            maxLength={254}
            name="email"
            type="email"
            aria-describedby={state.emailError ? "member-email-error" : undefined}
            aria-invalid={Boolean(state.emailError)}
          />
          <button
            className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "追加中…" : "メンバーを追加"}
          </button>
        </div>
        {state.emailError ? (
          <p className="mt-1 text-sm text-red-700" id="member-email-error">
            {state.emailError}
          </p>
        ) : null}
      </div>
      {state.formError ? <FormError message={state.formError} /> : null}
      <p className="text-xs leading-5 text-slate-500">
        相手がこのアプリで一度Googleログインしている必要があります。
      </p>
    </form>
  );
}

export function RemoveMemberForm({
  labId,
  userId,
  memberName,
}: {
  labId: string;
  userId: string;
  memberName: string;
}) {
  const [state, formAction, isPending] = useActionState<
    MemberFormState,
    FormData
  >(removeMemberAction, initialMemberFormState);

  function confirmRemoval(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`${memberName}さんをLabから削除しますか？`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmRemoval}>
      <input name="labId" type="hidden" value={labId} />
      <input name="userId" type="hidden" value={userId} />
      <button
        className="min-h-9 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "削除中…" : "削除"}
      </button>
      {state.formError ? <FormError message={state.formError} /> : null}
    </form>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
      {message}
    </p>
  );
}
