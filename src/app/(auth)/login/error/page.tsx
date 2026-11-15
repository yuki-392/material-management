import { ButtonLink } from "@/components/ui";
import { getLoginErrorMessage, LOGIN_UNAVAILABLE_MESSAGE } from "@/lib/auth-error.js";

import { LoginCard } from "../login-card";

export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const message = getLoginErrorMessage(error) ?? LOGIN_UNAVAILABLE_MESSAGE;

  return (
    <LoginCard>
      <h1 className="text-balance text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
        ログインできませんでした
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
      <ButtonLink className="mt-6 w-full" href="/login">ログイン画面へ戻る</ButtonLink>
    </LoginCard>
  );
}
