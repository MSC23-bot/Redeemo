-- AlterEnum
ALTER TYPE "CommunicationStatus" ADD VALUE 'QUEUED';

-- AlterTable
ALTER TABLE "CommunicationLog" ADD COLUMN     "payload" JSONB,
ALTER COLUMN "status" SET DEFAULT 'QUEUED';

-- CreateIndex
CREATE INDEX "CommunicationLog_status_sentAt_idx" ON "CommunicationLog"("status", "sentAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_externalId_idx" ON "CommunicationLog"("externalId");
