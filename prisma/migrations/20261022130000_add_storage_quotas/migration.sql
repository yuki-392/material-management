ALTER TABLE "Lab"
ADD COLUMN "storageLimitBytes" BIGINT NOT NULL DEFAULT 1000000000;

UPDATE "Lab" AS lab
SET "storageLimitBytes" = GREATEST(
    1000000000::BIGINT,
    COALESCE(
        (
            SELECT SUM(material."sizeBytes")::BIGINT
            FROM "Material" AS material
            WHERE material."labId" = lab.id
        ),
        0::BIGINT
    )
);

CREATE TABLE "StorageQuotaControl" (
    "id" TEXT NOT NULL,
    "labCount" INTEGER NOT NULL,
    "allocatedBytes" BIGINT NOT NULL,
    "reservedBytes" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "StorageQuotaControl_pkey" PRIMARY KEY ("id")
);

INSERT INTO "StorageQuotaControl" ("id", "labCount", "allocatedBytes", "reservedBytes")
SELECT
    'global',
    COUNT(*)::INTEGER,
    COALESCE(SUM("storageLimitBytes"), 0::BIGINT),
    0::BIGINT
FROM "Lab";

CREATE TABLE "StorageReservation" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StorageReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorageReservation_labId_expiresAt_idx"
ON "StorageReservation"("labId", "expiresAt");

CREATE INDEX "StorageReservation_expiresAt_idx"
ON "StorageReservation"("expiresAt");

ALTER TABLE "StorageReservation"
ADD CONSTRAINT "StorageReservation_labId_fkey"
FOREIGN KEY ("labId") REFERENCES "Lab"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
