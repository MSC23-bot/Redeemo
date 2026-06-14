/*
  Warnings:

  - Added the required column `recipientId` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'IN_APP';

-- AlterEnum
ALTER TYPE "NotificationRecipientType" ADD VALUE 'ADMIN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_MERCHANT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_MERCHANT_RESUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_CLAIM_STALE';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_OWNER_EMAIL_BOUNCED';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_DELIVERY_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_REVIEW_ASSIGNED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "recipientId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Notification_recipientType_recipientId_isRead_idx" ON "Notification"("recipientType", "recipientId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_recipientType_recipientId_sentAt_idx" ON "Notification"("recipientType", "recipientId", "sentAt");
