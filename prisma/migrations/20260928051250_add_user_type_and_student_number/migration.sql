-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('TEACHER', 'STUDENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "studentNumber" TEXT,
ADD COLUMN     "userType" "UserType";

-- CreateIndex
CREATE UNIQUE INDEX "User_studentNumber_key" ON "User"("studentNumber");
