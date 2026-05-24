-- AlterTable
ALTER TABLE "VoucherRedemption" ADD COLUMN     "isTestData" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "VoucherRedemption_isTestData_idx" ON "VoucherRedemption"("isTestData");
