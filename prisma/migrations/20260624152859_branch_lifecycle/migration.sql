-- CreateEnum
CREATE TYPE "BranchLifecycleStatus" AS ENUM ('PENDING_CREATE', 'LIVE', 'PENDING_CLOSE', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApprovalType" ADD VALUE 'BRANCH_CREATE';
ALTER TYPE "ApprovalType" ADD VALUE 'BRANCH_CLOSE';

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "closeReason" TEXT,
ADD COLUMN     "lifecycleStatus" "BranchLifecycleStatus" NOT NULL DEFAULT 'LIVE';

-- CreateIndex
CREATE INDEX "Branch_merchantId_lifecycleStatus_idx" ON "Branch"("merchantId", "lifecycleStatus");
