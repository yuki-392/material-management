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
import { Button, FormError, controlClassName } from "@/components/ui";

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
            className={`${controlClassName} min-w-0 flex-1`}
            id="member-email"
            maxLength={254}
            name="email"
            type="email"
            aria-describedby={state.emailError ? "member-email-error" : undefined}
            aria-invalid={Boolean(state.emailError)}
          />
          <Button className="shrink-0" disabled={isPending} type="submit">
            {isPending ? "追加中…" : "メンバーを追加"}
          </Button>
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
      <Button
        className="sm:min-h-10"
        disabled={isPending}
        type="submit"
        variant="danger"
      >
        {isPending ? "削除中…" : "削除"}
      </Button>
      {state.formError ? <FormError message={state.formError} /> : null}
    </form>
  );
}
