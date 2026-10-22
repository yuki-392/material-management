import {
  AuthorizationError,
  requireProfileCompleteUser,
} from "@/lib/authorization";
import { getMissingAuthEnvironmentVariables } from "@/lib/auth-environment.js";
import { prisma } from "@/lib/db";
import { getLabCreationCapacity } from "@/lib/storage-quota-core.js";
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

  const capacity = await getLabCreationCapacity(prisma);
  if (!capacity.canCreate) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          eyebrow="ワークスペース"
          title="Labを作成できません"
          description="研究室数または保存容量の上限に達しています。"
          actions={
            <ButtonLink href="/labs" variant="secondary">
              Labへ戻る
            </ButtonLink>
          }
        />
        <Card>
          <p className="text-sm leading-6 text-slate-700" role="status">
            {capacity.labCount >= capacity.maxLabCount
              ? "アプリで作成できる研究室は累計8件までです。"
              : "新しい研究室に割り当てる保存容量がありません。"}管理者にお問い合わせください。
          </p>
        </Card>
      </div>
    );
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
