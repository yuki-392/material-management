import { auth, signIn } from "@/auth";
import { AuthError } from "next-auth";
import { cookies } from "next/headers";

import { getLoginErrorMessage, LOGIN_UNAVAILABLE_MESSAGE } from "@/lib/auth-error.js";
import { isProfileComplete } from "@/lib/authorization";
import { getAuthRedirect } from "@/lib/auth-routing.js";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Button, FormError } from "@/components/ui";
import { LoginCard } from "./login-card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const missingEnvironmentVariables = getMissingAuthEnvironmentVariables();
  let message = getLoginErrorMessage(error);
  let destination: ReturnType<typeof getAuthRedirect> = null;

  if (!missingEnvironmentVariables.includes("AUTH_SECRET")) {
    try {
      const session = await auth();
      const profile = session?.user?.id
        ? await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { userType: true, studentNumber: true },
          })
        : null;
      destination = getAuthRedirect(
        "login",
        Boolean(session?.user?.id),
        isProfileComplete(profile),
      );

      // Auth.jsはセッションの読み取り失敗をログに記録し、nullを返すことがある。
      if (!session && !message && (await cookies()).getAll().some(({ name }) =>
        /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/.test(name)
      )) {
        message = "ログイン状態を確認できませんでした。もう一度Googleでログインしてください。";
      }
    } catch {
      console.error("ログイン時にセッションまたはプロフィールを確認できませんでした。");
      message = LOGIN_UNAVAILABLE_MESSAGE;
    }
  }

  if (destination) redirect(destination);

  async function signInWithGoogle() {
    "use server";

    if (getMissingAuthEnvironmentVariables().length > 0) {
      redirect("/login");
    }

    try {
      await signIn("google", { redirectTo: "/labs" });
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      redirect("/login/error?error=Configuration");
    }
  }

  return (
    <LoginCard>
      <h1 className="text-balance text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
        ログイン
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        研究室のタスクと資料を、メンバーと一緒に管理できます。Googleアカウントでログインしてください。
      </p>

      <ol className="mt-5 grid gap-2 rounded-xl bg-indigo-50/70 p-3 text-xs text-indigo-950">
        <li><span className="font-bold">1.</span> Googleでログイン</li>
        <li><span className="font-bold">2.</span> プロフィールを登録</li>
        <li><span className="font-bold">3.</span> Labを作成・参加</li>
      </ol>

      {message ? <div className="mt-6"><FormError message={message} /></div> : null}

      {missingEnvironmentVariables.length > 0 ? (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="status">
          <p className="font-semibold">Googleログインを利用できません。</p>
          <p className="mt-2 leading-6">
            サーバーの環境設定が不足しています。管理者は次の変数を設定してください。
          </p>
          <ul className="mt-2 list-inside list-disc font-mono text-xs">
            {missingEnvironmentVariables.map((variable) => (
              <li key={variable}>{variable}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-900">
            認証情報の値はこの画面には表示されません。
          </p>
        </div>
      ) : (
        <form action={signInWithGoogle} className="mt-6">
          <Button className="w-full" type="submit">
            Googleアカウントでログイン
          </Button>
        </form>
      )}
    </LoginCard>
  );
}
