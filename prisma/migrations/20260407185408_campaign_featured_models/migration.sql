-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bannerImageUrl" TEXT,
    "targetLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMerchant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "costGbp" DECIMAL(10,2) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMerchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeaturedMerchant" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "costGbp" DECIMAL(10,2) NOT NULL,
    "radiusMiles" DECIMAL(5,2) NOT NULL,
    "targetLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortByDistance" BOOLEAN NOT NULL DEFAULT true,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeaturedMerchant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignMerchant_campaignId_idx" ON "CampaignMerchant"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignMerchant_merchantId_idx" ON "CampaignMerchant"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMerchant_campaignId_merchantId_key" ON "CampaignMerchant"("campaignId", "merchantId");

-- CreateIndex
CREATE INDEX "FeaturedMerchant_merchantId_idx" ON "FeaturedMerchant"("merchantId");

-- CreateIndex
CREATE INDEX "FeaturedMerchant_isActive_idx" ON "FeaturedMerchant"("isActive");

-- CreateIndex
CREATE INDEX "FeaturedMerchant_startDate_endDate_idx" ON "FeaturedMerchant"("startDate", "endDate");

-- AddForeignKey
ALTER TABLE "CampaignMerchant" ADD CONSTRAINT "CampaignMerchant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMerchant" ADD CONSTRAINT "CampaignMerchant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedMerchant" ADD CONSTRAINT "FeaturedMerchant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
