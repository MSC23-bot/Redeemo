-- CreateEnum
CREATE TYPE "PhotoModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED');

-- AlterTable
ALTER TABLE "BranchPhoto" ADD COLUMN     "moderationCheckedAt" TIMESTAMP(3),
ADD COLUMN     "moderationDetail" TEXT,
ADD COLUMN     "moderationStatus" "PhotoModerationStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "BranchPhoto_branchId_moderationStatus_idx" ON "BranchPhoto"("branchId", "moderationStatus");

-- Backfill (PR-0.6): every EXISTING photo predates the gate and is curated/
-- reference data, so approve it — otherwise the discovery APPROVED filter would
-- hide all current photos. New rows keep the column DEFAULT 'PENDING'. Safe in
-- this transaction because PhotoModerationStatus is freshly CREATEd here (not an
-- ALTER TYPE ADD VALUE), so its values are usable immediately.
UPDATE "BranchPhoto" SET "moderationStatus" = 'APPROVED';
