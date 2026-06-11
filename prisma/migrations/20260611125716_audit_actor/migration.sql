-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('ADMIN', 'MERCHANT_ADMIN', 'BRANCH_MANAGER', 'BRANCH_STAFF', 'CUSTOMER', 'SYSTEM');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "actorType" "ActorType",
ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB,
ADD COLUMN     "reason" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
