-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originalFileName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Material_objectKey_key" ON "Material"("objectKey");

-- CreateIndex
CREATE INDEX "Material_labId_createdAt_idx" ON "Material"("labId", "createdAt");

-- CreateIndex
CREATE INDEX "Material_uploadedById_idx" ON "Material"("uploadedById");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
