-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('NOT_SIGNED', 'SIGNED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('BUSINESS_VERIFICATION_1', 'BUSINESS_VERIFICATION_2', 'PRICE_LIST', 'AGREEMENT');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('CLICK_TO_AGREE', 'ZOHO_SIGN');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "tradingName" TEXT,
    "companyNumber" TEXT,
    "vatNumber" TEXT,
    "status" "MerchantStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "contractStatus" "ContractStatus" NOT NULL DEFAULT 'NOT_SIGNED',
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "websiteUrl" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isMainBranch" BOOLEAN NOT NULL DEFAULT false,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'GB',
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "phone" TEXT,
    "email" TEXT,
    "websiteUrl" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "about" TEXT,
    "priceListUrl" TEXT,
    "redemptionPin" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchOpeningHours" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BranchOpeningHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchPhoto" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantDocument" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantContract" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "tcVersion" TEXT NOT NULL,
    "signatureMethod" "SignatureMethod" NOT NULL,
    "zohoSignRequestId" TEXT,

    CONSTRAINT "MerchantContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantTag" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "MerchantTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Merchant_status_idx" ON "Merchant"("status");

-- CreateIndex
CREATE INDEX "Branch_merchantId_idx" ON "Branch"("merchantId");

-- CreateIndex
CREATE INDEX "Branch_latitude_longitude_idx" ON "Branch"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Branch_isActive_idx" ON "Branch"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BranchOpeningHours_branchId_dayOfWeek_key" ON "BranchOpeningHours"("branchId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "BranchPhoto_branchId_idx" ON "BranchPhoto"("branchId");

-- CreateIndex
CREATE INDEX "MerchantDocument_merchantId_idx" ON "MerchantDocument"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantContract_merchantId_key" ON "MerchantContract"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantTag_tag_idx" ON "MerchantTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantTag_merchantId_tag_key" ON "MerchantTag"("merchantId", "tag");

-- AddForeignKey
ALTER TABLE "MerchantAdmin" ADD CONSTRAINT "MerchantAdmin_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchUser" ADD CONSTRAINT "BranchUser_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchOpeningHours" ADD CONSTRAINT "BranchOpeningHours_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPhoto" ADD CONSTRAINT "BranchPhoto_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantDocument" ADD CONSTRAINT "MerchantDocument_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantContract" ADD CONSTRAINT "MerchantContract_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantTag" ADD CONSTRAINT "MerchantTag_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
