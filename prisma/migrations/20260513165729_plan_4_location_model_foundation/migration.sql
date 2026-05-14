-- CreateEnum
CREATE TYPE "PopulationTier" AS ENUM ('UNKNOWN', 'HAMLET', 'VILLAGE', 'SMALL_TOWN', 'TOWN', 'LARGE_TOWN', 'CITY', 'METRO_CORE');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "LocationConfidence" AS ENUM ('MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED', 'POSTCODE_CENTROID', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "LadderProfile" AS ENUM ('LOCAL_TIGHT', 'LOCAL_NORMAL', 'MIXED_NORMAL', 'DESTINATION_LOCAL', 'DESTINATION_WIDE');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "adminCounty" TEXT,
ADD COLUMN     "ladDistrict" TEXT,
ADD COLUMN     "localityId" TEXT,
ADD COLUMN     "localityName" TEXT,
ADD COLUMN     "locationConfidence" "LocationConfidence" NOT NULL DEFAULT 'POSTCODE_CENTROID',
ADD COLUMN     "locationCountry" TEXT,
ADD COLUMN     "locationResolvedAt" TIMESTAMP(3),
ADD COLUMN     "postTown" TEXT,
ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "branchAnchorId" TEXT,
ADD COLUMN     "isNational" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "radiusMiles" DECIMAL(5,2),
ADD COLUMN     "targetCounties" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetLadDistricts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetLocalityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetRegions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "ladderProfile" "LadderProfile" NOT NULL DEFAULT 'MIXED_NORMAL',
ADD COLUMN     "ladderProfileOverride" "LadderProfile";

-- Intent-aware override of the safe default. After this UPDATE, the default
-- only matters for future inserts; the seed-time intentType mapping (in later
-- M1 tasks) keeps Category.ladderProfile aligned with each category's intent.
UPDATE "Category" SET "ladderProfile" =
  CASE
    WHEN "intentType" = 'LOCAL'       THEN 'LOCAL_NORMAL'::"LadderProfile"
    WHEN "intentType" = 'MIXED'       THEN 'MIXED_NORMAL'::"LadderProfile"
    WHEN "intentType" = 'DESTINATION' THEN 'DESTINATION_LOCAL'::"LadderProfile"
    ELSE 'MIXED_NORMAL'::"LadderProfile"
  END;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminCounty" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "ladDistrict" TEXT,
ADD COLUMN     "latitude" DECIMAL(10,8),
ADD COLUMN     "localityId" TEXT,
ADD COLUMN     "locationResolvedAt" TIMESTAMP(3),
ADD COLUMN     "longitude" DECIMAL(11,8),
ADD COLUMN     "postTown" TEXT,
ADD COLUMN     "region" TEXT;

-- CreateTable
CREATE TABLE "Locality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "postTown" TEXT,
    "ladDistrict" TEXT NOT NULL,
    "adminCounty" TEXT,
    "region" TEXT,
    "country" TEXT NOT NULL,
    "centerLat" DECIMAL(10,8) NOT NULL,
    "centerLng" DECIMAL(11,8) NOT NULL,
    "populationTier" "PopulationTier" NOT NULL DEFAULT 'UNKNOWN',
    "marketId" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Locality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalityCatchmentEdge" (
    "id" TEXT NOT NULL,
    "sourceLocalityId" TEXT NOT NULL,
    "targetLocalityId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "isCurated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalityCatchmentEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "MarketStatus" NOT NULL DEFAULT 'PAUSED',
    "anchorLocalityId" TEXT NOT NULL,
    "ladDistrict" TEXT,
    "adminCounty" TEXT,
    "region" TEXT,
    "country" TEXT NOT NULL,
    "targetMerchantCount" INTEGER,
    "launchedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Locality_slug_key" ON "Locality"("slug");

-- CreateIndex
CREATE INDEX "Locality_marketId_idx" ON "Locality"("marketId");

-- CreateIndex
CREATE INDEX "Locality_populationTier_idx" ON "Locality"("populationTier");

-- CreateIndex
CREATE INDEX "Locality_country_idx" ON "Locality"("country");

-- CreateIndex
CREATE INDEX "Locality_centerLat_centerLng_idx" ON "Locality"("centerLat", "centerLng");

-- CreateIndex
CREATE INDEX "LocalityCatchmentEdge_targetLocalityId_idx" ON "LocalityCatchmentEdge"("targetLocalityId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalityCatchmentEdge_sourceLocalityId_targetLocalityId_key" ON "LocalityCatchmentEdge"("sourceLocalityId", "targetLocalityId");

-- CreateIndex
CREATE UNIQUE INDEX "Market_slug_key" ON "Market"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Market_anchorLocalityId_key" ON "Market"("anchorLocalityId");

-- CreateIndex
CREATE INDEX "Market_status_idx" ON "Market"("status");

-- CreateIndex
CREATE INDEX "Branch_localityId_idx" ON "Branch"("localityId");

-- CreateIndex
CREATE INDEX "User_localityId_idx" ON "User"("localityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "Locality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_branchAnchorId_fkey" FOREIGN KEY ("branchAnchorId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locality" ADD CONSTRAINT "Locality_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalityCatchmentEdge" ADD CONSTRAINT "LocalityCatchmentEdge_sourceLocalityId_fkey" FOREIGN KEY ("sourceLocalityId") REFERENCES "Locality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalityCatchmentEdge" ADD CONSTRAINT "LocalityCatchmentEdge_targetLocalityId_fkey" FOREIGN KEY ("targetLocalityId") REFERENCES "Locality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_anchorLocalityId_fkey" FOREIGN KEY ("anchorLocalityId") REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
