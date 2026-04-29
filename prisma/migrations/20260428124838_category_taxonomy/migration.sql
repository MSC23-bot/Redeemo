-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: category_taxonomy
-- Generated: 2026-04-28
--
-- Step 1: Rename MerchantTag → MerchantSuggestedTag (preserves all rows)
-- Step 2: Rename MerchantTagStatus enum → MerchantSuggestedTagStatus
-- Step 3: Rename all indexes/constraints on the renamed table
-- Step 5: Create new enums (TagType, TagCreatedBy, CategoryDescriptorState)
-- Step 6: Create new tables (Tag, SubcategoryTag, MerchantTag, MerchantHighlight, RedundantHighlight)
-- Step 7: ALTER Category to add new columns
-- Step 8: ALTER Merchant to add primaryDescriptorTagId + FK + index
-- Step 9: Add all indexes and constraints for new tables
-- Step 10: Trigger — enforce hard 3-cap on MerchantHighlight per merchant
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Rename old MerchantTag table → MerchantSuggestedTag (preserves data)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "MerchantTag" RENAME TO "MerchantSuggestedTag";

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Rename enum MerchantTagStatus → MerchantSuggestedTagStatus
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE "MerchantTagStatus" RENAME TO "MerchantSuggestedTagStatus";

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Rename all indexes and constraints on the renamed table
-- (PostgreSQL keeps old names after RENAME TABLE — update them for Prisma)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "MerchantSuggestedTag" RENAME CONSTRAINT "MerchantTag_pkey" TO "MerchantSuggestedTag_pkey";
ALTER TABLE "MerchantSuggestedTag" RENAME CONSTRAINT "MerchantTag_merchantId_fkey" TO "MerchantSuggestedTag_merchantId_fkey";

ALTER INDEX "MerchantTag_tag_idx" RENAME TO "MerchantSuggestedTag_tag_idx";
ALTER INDEX "MerchantTag_merchantId_tag_key" RENAME TO "MerchantSuggestedTag_merchantId_tag_key";

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: Create new enums for the curated tag taxonomy
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE "TagType" AS ENUM ('CUISINE', 'SPECIALTY', 'HIGHLIGHT', 'DETAIL');

CREATE TYPE "TagCreatedBy" AS ENUM ('SYSTEM', 'ADMIN');

CREATE TYPE "CategoryDescriptorState" AS ENUM ('RECOMMENDED', 'OPTIONAL', 'HIDDEN');

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6: Create new curated taxonomy tables
-- MerchantTag name is now free (old table was renamed to MerchantSuggestedTag)
-- ─────────────────────────────────────────────────────────────────────────────

-- Tag: master list of curated tags (cuisine types, specialties, highlights, details)
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "TagType" NOT NULL,
    "descriptorEligible" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" "TagCreatedBy" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantCountByCity" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- SubcategoryTag: which tags are valid for a given subcategory
CREATE TABLE "SubcategoryTag" (
    "id" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "isPrimaryEligible" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SubcategoryTag_pkey" PRIMARY KEY ("id")
);

-- MerchantTag: curated tags assigned to a merchant (replaces old free-text model)
CREATE TABLE "MerchantTag" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "MerchantTag_pkey" PRIMARY KEY ("id")
);

-- MerchantHighlight: up to 3 highlight tags per merchant (enforced by trigger below)
CREATE TABLE "MerchantHighlight" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "highlightTagId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MerchantHighlight_pkey" PRIMARY KEY ("id")
);

-- RedundantHighlight: admin-curated list of highlight tags redundant for a subcategory
CREATE TABLE "RedundantHighlight" (
    "id" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "highlightTagId" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "RedundantHighlight_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 7: ALTER existing Category table — add new taxonomy columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Category"
    ADD COLUMN "descriptorState" "CategoryDescriptorState",
    ADD COLUMN "descriptorSuffix" TEXT,
    ADD COLUMN "minSubcategoryCountForChips" INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN "merchantCountByCity" JSONB NOT NULL DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 8: ALTER Merchant — add primaryDescriptorTagId + FK + index
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Merchant" ADD COLUMN "primaryDescriptorTagId" TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 9: Indexes and foreign key constraints for all new tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Tag indexes
CREATE UNIQUE INDEX "Tag_label_type_key" ON "Tag"("label", "type");
CREATE INDEX "Tag_type_isActive_idx" ON "Tag"("type", "isActive");

-- SubcategoryTag indexes
CREATE UNIQUE INDEX "SubcategoryTag_subcategoryId_tagId_key" ON "SubcategoryTag"("subcategoryId", "tagId");
CREATE INDEX "SubcategoryTag_tagId_idx" ON "SubcategoryTag"("tagId");

-- MerchantTag indexes
CREATE UNIQUE INDEX "MerchantTag_merchantId_tagId_key" ON "MerchantTag"("merchantId", "tagId");
CREATE INDEX "MerchantTag_tagId_idx" ON "MerchantTag"("tagId");

-- MerchantHighlight indexes
CREATE UNIQUE INDEX "MerchantHighlight_merchantId_highlightTagId_key" ON "MerchantHighlight"("merchantId", "highlightTagId");

-- RedundantHighlight indexes
CREATE UNIQUE INDEX "RedundantHighlight_subcategoryId_highlightTagId_key" ON "RedundantHighlight"("subcategoryId", "highlightTagId");
CREATE INDEX "RedundantHighlight_highlightTagId_idx" ON "RedundantHighlight"("highlightTagId");

-- Merchant.primaryDescriptorTagId index
CREATE INDEX "Merchant_primaryDescriptorTagId_idx" ON "Merchant"("primaryDescriptorTagId");

-- Foreign keys for Merchant.primaryDescriptorTagId
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_primaryDescriptorTagId_fkey"
    FOREIGN KEY ("primaryDescriptorTagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys for SubcategoryTag
ALTER TABLE "SubcategoryTag" ADD CONSTRAINT "SubcategoryTag_subcategoryId_fkey"
    FOREIGN KEY ("subcategoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubcategoryTag" ADD CONSTRAINT "SubcategoryTag_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys for MerchantTag (new curated model)
ALTER TABLE "MerchantTag" ADD CONSTRAINT "MerchantTag_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantTag" ADD CONSTRAINT "MerchantTag_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys for MerchantHighlight
ALTER TABLE "MerchantHighlight" ADD CONSTRAINT "MerchantHighlight_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantHighlight" ADD CONSTRAINT "MerchantHighlight_highlightTagId_fkey"
    FOREIGN KEY ("highlightTagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys for RedundantHighlight
ALTER TABLE "RedundantHighlight" ADD CONSTRAINT "RedundantHighlight_subcategoryId_fkey"
    FOREIGN KEY ("subcategoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RedundantHighlight" ADD CONSTRAINT "RedundantHighlight_highlightTagId_fkey"
    FOREIGN KEY ("highlightTagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 10: Trigger — enforce hard cap of 3 highlights per merchant (§3.4)
-- Fires on INSERT and on UPDATE of merchantId so an UPDATE can't move
-- a row into a merchant already at the cap.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_merchant_highlight_cap()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM "MerchantHighlight" WHERE "merchantId" = NEW."merchantId") >= 3 THEN
    RAISE EXCEPTION 'merchant_highlight_cap_exceeded: a merchant can have at most 3 highlights';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER merchant_highlight_cap_trigger
BEFORE INSERT OR UPDATE OF "merchantId" ON "MerchantHighlight"
FOR EACH ROW EXECUTE FUNCTION enforce_merchant_highlight_cap();
