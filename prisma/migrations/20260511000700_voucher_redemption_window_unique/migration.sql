-- AlterTable
ALTER TABLE "VoucherRedemption" ADD COLUMN     "windowStartsAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_userId_voucherId_windowStartsAt_key" ON "VoucherRedemption"("userId", "voucherId", "windowStartsAt");
