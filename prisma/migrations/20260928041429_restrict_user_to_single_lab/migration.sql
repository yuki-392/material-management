-- DropIndex
DROP INDEX "LabMember_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "LabMember_userId_key" ON "LabMember"("userId");
