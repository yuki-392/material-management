import { auth, signIn } from "@/auth";
import { getAuthRedirect } from "@/lib/auth-routing.js";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const missingEnvironmentVariables =
    getMissingAuthEnvironmentVariables();

  if (!missingEnvironmentVariables.includes("AUTH_SECRET")) {
    const session = await auth();
    const destination = getAuthRedirect("login", Boolean(session?.user));

    if (destination) {
      redirect(destination);
    }
  }

  async function signInWithGoogle() {
    "use server";

    if (getMissingAuthEnvironmentVariables().length > 0) {
      redirect("/login");
    }

    await signIn("google", { redirectTo: "/labs" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-indigo-700">
          研究室・ゼミのタスク管理
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          ログイン
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Googleアカウントでログインしてください。
        </p>

        {missingEnvironmentVariables.length > 0 ? (
          <div
            className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            role="status"
          >
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
            <button
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              type="submit"
            >
              Googleでログイン
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
