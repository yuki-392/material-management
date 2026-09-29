-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originalFileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Material_storageKey_key" ON "Material"("storageKey");

-- CreateIndex
CREATE INDEX "Material_labId_createdAt_idx" ON "Material"("labId", "createdAt");

-- CreateIndex
CREATE INDEX "Material_uploaderId_idx" ON "Material"("uploaderId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
