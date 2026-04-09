-- DropIndex
DROP INDEX "BranchPendingEdit_branchId_idx";

-- DropIndex
DROP INDEX "BranchPendingEdit_merchantId_idx";

-- DropIndex
DROP INDEX "BranchPendingEdit_status_idx";

-- DropIndex
DROP INDEX "MerchantPendingEdit_merchantId_idx";

-- DropIndex
DROP INDEX "MerchantPendingEdit_status_idx";

-- DropIndex
DROP INDEX "RmvTemplate_categoryId_idx";

-- DropIndex
DROP INDEX "RmvTemplate_isActive_idx";

-- CreateIndex
CREATE INDEX "BranchPendingEdit_branchId_status_idx" ON "BranchPendingEdit"("branchId", "status");

-- CreateIndex
CREATE INDEX "BranchPendingEdit_merchantId_status_idx" ON "BranchPendingEdit"("merchantId", "status");

-- CreateIndex
CREATE INDEX "MerchantPendingEdit_merchantId_status_idx" ON "MerchantPendingEdit"("merchantId", "status");

-- CreateIndex
CREATE INDEX "RmvTemplate_categoryId_isActive_idx" ON "RmvTemplate"("categoryId", "isActive");
