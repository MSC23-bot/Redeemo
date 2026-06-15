-- AlterTable
ALTER TABLE "AdminApproval" ADD COLUMN     "lastStaleAlertAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AdminApproval_status_claimedAt_idx" ON "AdminApproval"("status", "claimedAt");
