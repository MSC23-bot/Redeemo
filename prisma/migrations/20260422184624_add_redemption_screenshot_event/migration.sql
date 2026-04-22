-- AlterTable
ALTER TABLE "SupportTicket" ALTER COLUMN "attachmentUrls" DROP DEFAULT;

-- CreateTable
CREATE TABLE "RedemptionScreenshotEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redemptionId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedemptionScreenshotEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedemptionScreenshotEvent_redemptionId_occurredAt_idx" ON "RedemptionScreenshotEvent"("redemptionId", "occurredAt");

-- CreateIndex
CREATE INDEX "RedemptionScreenshotEvent_userId_idx" ON "RedemptionScreenshotEvent"("userId");

-- AddForeignKey
ALTER TABLE "RedemptionScreenshotEvent" ADD CONSTRAINT "RedemptionScreenshotEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionScreenshotEvent" ADD CONSTRAINT "RedemptionScreenshotEvent_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "VoucherRedemption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
