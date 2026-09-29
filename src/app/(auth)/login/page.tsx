import { auth, signIn } from "@/auth";
import { isProfileComplete } from "@/lib/authorization";
import { getAuthRedirect } from "@/lib/auth-routing.js";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Button, Card } from "@/components/ui";

export default async function LoginPage() {
  const missingEnvironmentVariables =
    getMissingAuthEnvironmentVariables();

  if (!missingEnvironmentVariables.includes("AUTH_SECRET")) {
    const session = await auth();
    const profile = session?.user?.id
      ? await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { userType: true, studentNumber: true },
        })
      : null;
    const destination = getAuthRedirect(
      "login",
      Boolean(session?.user?.id),
      isProfileComplete(profile),
    );

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
    <main
      className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 sm:py-16"
      id="main-content"
      tabIndex={-1}
    >
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-xl bg-indigo-700 text-sm font-bold text-white shadow-sm"
          >
            研
          </span>
          <div>
            <p className="text-sm font-bold text-slate-950">
              研究室・ゼミ
            </p>
            <p className="mt-0.5 text-xs text-slate-500">タスク・資料管理</p>
          </div>
        </div>
        <h1 className="text-balance text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          ログイン
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          研究室のタスクと資料を、メンバーと一緒に管理できます。Googleアカウントでログインしてください。
        </p>

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
      </Card>
    </main>
  );
}
