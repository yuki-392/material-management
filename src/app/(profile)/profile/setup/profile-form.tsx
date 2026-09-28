"use client";

import { useActionState } from "react";

import { saveProfile } from "./actions";
import {
  initialProfileActionState,
  type ProfileActionState,
} from "@/lib/profile-form-state";

type UserTypeValue = "" | "TEACHER" | "STUDENT";

type ProfileFormProps = {
  name: string;
  userType: UserTypeValue;
  studentNumber: string;
};

export function ProfileForm({
  name,
  userType,
  studentNumber,
}: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState<
    ProfileActionState,
    FormData
  >(saveProfile, initialProfileActionState);

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor="name"
        >
          氏名（任意）
        </label>
        <input
          autoComplete="name"
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
          defaultValue={name}
          id="name"
          maxLength={100}
          name="name"
          aria-describedby={state.fieldErrors.name ? "name-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors.name)}
        />
        {state.fieldErrors.name ? (
          <p className="mt-1 text-sm text-red-700" id="name-error">
            {state.fieldErrors.name}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          Googleアカウントの氏名を初期値にしています。必要に応じて変更できます。
        </p>
      </div>

      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor="userType"
        >
          区分
        </label>
        <select
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
          defaultValue={userType}
          id="userType"
          name="userType"
          required
          aria-describedby={
            state.fieldErrors.userType ? "user-type-error" : undefined
          }
          aria-invalid={Boolean(state.fieldErrors.userType)}
        >
          <option value="">選択してください</option>
          <option value="STUDENT">学生</option>
          <option value="TEACHER">教員</option>
        </select>
        {state.fieldErrors.userType ? (
          <p className="mt-1 text-sm text-red-700" id="user-type-error">
            {state.fieldErrors.userType}
          </p>
        ) : null}
      </div>

      <div>
        <label
          className="block text-sm font-medium text-slate-800"
          htmlFor="studentNumber"
        >
          学生番号（学生の場合は必須）
        </label>
        <input
          autoComplete="off"
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
          defaultValue={studentNumber}
          id="studentNumber"
          maxLength={50}
          name="studentNumber"
          aria-describedby={
            state.fieldErrors.studentNumber
              ? "student-number-error"
              : "student-number-help"
          }
          aria-invalid={Boolean(state.fieldErrors.studentNumber)}
        />
        {state.fieldErrors.studentNumber ? (
          <p className="mt-1 text-sm text-red-700" id="student-number-error">
            {state.fieldErrors.studentNumber}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500" id="student-number-help">
            教員を選んだ場合、保存時に学生番号は未設定になります。
          </p>
        )}
      </div>

      {state.formError ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.formError}
        </p>
      ) : null}

      <button
        className="min-h-11 w-full rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "保存中…" : "プロフィールを保存して続ける"}
      </button>
    </form>
  );
}
