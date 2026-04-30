-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: supply_aware_correction
-- Generated: 2026-04-29
--
-- Step 1: Create CategoryIntentType enum
-- Step 2: Add intentType column to Category
-- Step 3: Drop minSubcategoryCountForChips column from Category
-- Step 4: Create CategoryAmenity table with FK constraints
-- Step 5: Tighten BranchAmenity.amenityId FK to ON DELETE RESTRICT
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Create CategoryIntentType enum
-- (must be created BEFORE the column that uses it)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE "CategoryIntentType" AS ENUM ('LOCAL', 'DESTINATION', 'MIXED');

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Add intentType column to Category (nullable)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Category" ADD COLUMN "intentType" "CategoryIntentType";

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Drop minSubcategoryCountForChips column from Category
-- (IF EXISTS guard: column was added in category_taxonomy migration; idempotent
--  if that migration path did not include the column)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Category" DROP COLUMN IF EXISTS "minSubcategoryCountForChips";

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Create CategoryAmenity table
-- Junction table linking categories to their eligible amenities
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "CategoryAmenity" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,

    CONSTRAINT "CategoryAmenity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryAmenity_categoryId_amenityId_key" ON "CategoryAmenity"("categoryId", "amenityId");

ALTER TABLE "CategoryAmenity" ADD CONSTRAINT "CategoryAmenity_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategoryAmenity" ADD CONSTRAINT "CategoryAmenity_amenityId_fkey"
    FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: Tighten BranchAmenity.amenityId FK to ON DELETE RESTRICT
-- (prevents deleting an amenity that is in use on any branch)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "BranchAmenity" DROP CONSTRAINT IF EXISTS "BranchAmenity_amenityId_fkey";

ALTER TABLE "BranchAmenity" ADD CONSTRAINT "BranchAmenity_amenityId_fkey"
    FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
