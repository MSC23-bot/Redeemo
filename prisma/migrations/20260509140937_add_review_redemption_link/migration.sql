-- PR-C 2026-05-09: link Review to VoucherRedemption for the
-- verified-review backend.  Additive nullable column + FK with
-- ON DELETE SET NULL.  Existing rows stay with redemptionId IS NULL
-- (= isVerified === false in the API derivation).

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "redemptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Review_redemptionId_key" ON "Review"("redemptionId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "VoucherRedemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
