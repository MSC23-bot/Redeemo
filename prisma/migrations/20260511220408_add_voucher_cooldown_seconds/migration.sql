-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "cooldownSeconds" INTEGER;

-- Manual addition: floor + REUSABLE-only CHECK constraints.
-- Per spec §4.3 + D3. Same pattern as the existing §AG3
-- RedemptionScreenshotEvent_platform_check.
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_cooldownSeconds_min_check"
  CHECK ("cooldownSeconds" IS NULL OR "cooldownSeconds" >= 1800);

ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_cooldownSeconds_reusable_only_check"
  CHECK ("type" = 'REUSABLE' OR "cooldownSeconds" IS NULL);
