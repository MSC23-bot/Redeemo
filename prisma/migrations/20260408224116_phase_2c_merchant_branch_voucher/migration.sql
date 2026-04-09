-- CreateEnum
CREATE TYPE "PendingEditStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('REGISTERED', 'BRANCH_ADDED', 'CONTRACT_SIGNED', 'RMV_CONFIGURED', 'SUBMITTED', 'APPROVED', 'LIVE', 'SUSPENDED', 'NEEDS_CHANGES');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApprovalType" ADD VALUE 'MERCHANT_IDENTITY_EDIT';
ALTER TYPE "ApprovalType" ADD VALUE 'BRANCH_IDENTITY_EDIT';

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "onboardingStep" "OnboardingStep" NOT NULL DEFAULT 'REGISTERED',
ADD COLUMN     "primaryCategoryId" TEXT;

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "isRmv" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "merchantFields" JSONB,
ADD COLUMN     "rmvTemplateId" TEXT;

-- CreateTable
CREATE TABLE "MerchantPendingEdit" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "status" "PendingEditStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "MerchantPendingEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchPendingEdit" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "includesPhotos" BOOLEAN NOT NULL DEFAULT false,
    "status" "PendingEditStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "BranchPendingEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RmvTemplate" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "voucherType" "VoucherType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "allowedFields" JSONB NOT NULL,
    "minimumSaving" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RmvTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantPendingEdit_merchantId_idx" ON "MerchantPendingEdit"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantPendingEdit_status_idx" ON "MerchantPendingEdit"("status");

-- CreateIndex
CREATE INDEX "BranchPendingEdit_branchId_idx" ON "BranchPendingEdit"("branchId");

-- CreateIndex
CREATE INDEX "BranchPendingEdit_merchantId_idx" ON "BranchPendingEdit"("merchantId");

-- CreateIndex
CREATE INDEX "BranchPendingEdit_status_idx" ON "BranchPendingEdit"("status");

-- CreateIndex
CREATE INDEX "RmvTemplate_categoryId_idx" ON "RmvTemplate"("categoryId");

-- CreateIndex
CREATE INDEX "RmvTemplate_isActive_idx" ON "RmvTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RmvTemplate_categoryId_title_key" ON "RmvTemplate"("categoryId", "title");

-- CreateIndex
CREATE INDEX "Merchant_primaryCategoryId_idx" ON "Merchant"("primaryCategoryId");

-- CreateIndex
CREATE INDEX "Voucher_isRmv_idx" ON "Voucher"("isRmv");

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_primaryCategoryId_fkey" FOREIGN KEY ("primaryCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantPendingEdit" ADD CONSTRAINT "MerchantPendingEdit_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPendingEdit" ADD CONSTRAINT "BranchPendingEdit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPendingEdit" ADD CONSTRAINT "BranchPendingEdit_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmvTemplate" ADD CONSTRAINT "RmvTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_rmvTemplateId_fkey" FOREIGN KEY ("rmvTemplateId") REFERENCES "RmvTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
