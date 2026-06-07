-- SEC-C3 (Gate-PR-4a): additive seed/demo-data flag on the customer-facing
-- entities. Default false (real). prisma/seed.ts marks all seeded rows true;
-- customer-facing API queries exclude isTestData=true rows (Gate-PR-4b).

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "isTestData" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "isTestData" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "isTestData" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Merchant_isTestData_idx" ON "Merchant"("isTestData");

-- CreateIndex
CREATE INDEX "Branch_isTestData_idx" ON "Branch"("isTestData");

-- CreateIndex
CREATE INDEX "Voucher_isTestData_idx" ON "Voucher"("isTestData");
