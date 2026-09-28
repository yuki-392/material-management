-- Roll back the local-only Material table after confirming it contains no rows.
BEGIN;
ALTER TABLE "Material" DROP CONSTRAINT "Material_labId_fkey";
ALTER TABLE "Material" DROP CONSTRAINT "Material_uploadedById_fkey";
DROP TABLE "Material";
COMMIT;
