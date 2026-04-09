-- AlterTable
ALTER TABLE "VoucherRedemption" ADD COLUMN "redemptionCode" TEXT NOT NULL,
ADD COLUMN "isValidated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "validatedAt" TIMESTAMP(3),
ALTER COLUMN "validationMethod" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_redemptionCode_key" ON "VoucherRedemption"("redemptionCode");

-- CreateIndex
CREATE INDEX "VoucherRedemption_redemptionCode_idx" ON "VoucherRedemption"("redemptionCode");
