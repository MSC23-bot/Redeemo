-- CreateEnum
CREATE TYPE "VoucherEditKind" AS ENUM ('CHANGE', 'END');

-- AlterEnum
ALTER TYPE "ApprovalStatus" ADD VALUE 'WITHDRAWN';

-- AlterEnum
ALTER TYPE "ApprovalType" ADD VALUE 'VOUCHER_EDIT';

-- CreateTable
CREATE TABLE "VoucherPendingEdit" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "kind" "VoucherEditKind" NOT NULL,
    "proposedChanges" JSONB,
    "reason" TEXT,
    "status" "PendingEditStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "VoucherPendingEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoucherPendingEdit_voucherId_status_idx" ON "VoucherPendingEdit"("voucherId", "status");

-- CreateIndex
CREATE INDEX "VoucherPendingEdit_merchantId_status_idx" ON "VoucherPendingEdit"("merchantId", "status");

-- AddForeignKey
ALTER TABLE "VoucherPendingEdit" ADD CONSTRAINT "VoucherPendingEdit_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherPendingEdit" ADD CONSTRAINT "VoucherPendingEdit_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
