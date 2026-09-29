import {
  AuthorizationError,
  requireProfileCompleteUser,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

import { LabForm } from "./lab-form";

export default async function NewLabPage() {
  if (getMissingAuthEnvironmentVariables().includes("AUTH_SECRET")) {
    redirect("/login");
  }

  let currentUser;

  try {
    currentUser = await requireProfileCompleteUser();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }

      if (error.code === "PROFILE_INCOMPLETE") {
        redirect("/profile/setup");
      }
    }

    throw error;
  }

  const membership = await prisma.labMember.findUnique({
    where: { userId: currentUser.id },
    select: { labId: true },
  });

  if (membership) {
    redirect("/labs");
  }

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-indigo-700">ワークスペース</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        Labを作成
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        作成したUserがOwnerと最初のメンバーになります。
      </p>
      <LabForm />
    </section>
  );
}
