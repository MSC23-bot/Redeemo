-- CreateEnum
CREATE TYPE "MerchantTagStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewReportReason" AS ENUM ('OFFENSIVE', 'SPAM', 'FAKE', 'OTHER');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "pinColour" TEXT,
ADD COLUMN     "pinIcon" TEXT;

-- AlterTable
ALTER TABLE "MerchantTag" ADD COLUMN     "status" "MerchantTagStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReviewReport" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reportedByUserId" TEXT NOT NULL,
    "reason" "ReviewReportReason" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewReport_reviewId_idx" ON "ReviewReport"("reviewId");

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
