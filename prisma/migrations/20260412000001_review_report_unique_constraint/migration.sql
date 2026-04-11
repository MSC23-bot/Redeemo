-- DropIndex
DROP INDEX "ReviewReport_reviewId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "ReviewReport_reviewId_reportedByUserId_key" ON "ReviewReport"("reviewId", "reportedByUserId");

