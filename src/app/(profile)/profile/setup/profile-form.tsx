"use client";

import { useActionState } from "react";

import { saveProfile } from "./actions";
import {
  initialProfileActionState,
  type ProfileActionState,
} from "@/lib/profile-form-state";
import {
  Button,
  FieldError,
  FormError,
  inputClassName,
  selectClassName,
} from "@/components/ui";

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
          className={inputClassName}
          defaultValue={name}
          id="name"
          maxLength={100}
          name="name"
          aria-describedby={state.fieldErrors.name ? "name-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors.name)}
        />
        <FieldError id="name-error" message={state.fieldErrors.name} />
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
          className={selectClassName}
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
        <FieldError id="user-type-error" message={state.fieldErrors.userType} />
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
          className={inputClassName}
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
          <FieldError
            id="student-number-error"
            message={state.fieldErrors.studentNumber}
          />
        ) : (
          <p className="mt-1 text-xs text-slate-500" id="student-number-help">
            教員を選んだ場合、保存時に学生番号は未設定になります。
          </p>
        )}
      </div>

      {state.formError ? <FormError message={state.formError} /> : null}

      <Button
        className="w-full"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "保存中…" : "プロフィールを保存して続ける"}
      </Button>
    </form>
  );
}
