import {
  AuthorizationError,
  requireProfileCompleteUser,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

import { LabForm } from "./lab-form";
import { ButtonLink, Card, PageHeader } from "@/components/ui";

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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="ワークスペース"
        title="Labを作成"
        description="Labを作成すると、あなたがOwner兼最初のメンバーになります。"
        actions={
          <ButtonLink href="/labs" variant="secondary">
            Labへ戻る
          </ButtonLink>
        }
      />
      <Card>
        <LabForm />
      </Card>
    </div>
  );
}
