-- DropIndex
DROP INDEX "BranchOpeningHours_branchId_dayOfWeek_key";

-- CreateIndex
CREATE INDEX "BranchOpeningHours_branchId_dayOfWeek_idx" ON "BranchOpeningHours"("branchId", "dayOfWeek");
