-- Replace the global Category.name @unique with a compound (name, parentId) uniqueness
-- using NULLS NOT DISTINCT so top-level categories (parentId IS NULL) cannot have
-- duplicate names. Allows cross-listed subcategories per spec §2.8 (e.g. "Aesthetics
-- Clinic" appearing under both Beauty & Wellness and Health & Medical).

-- Drop the old global unique
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_name_key";
DROP INDEX IF EXISTS "Category_name_key";

-- Add the new compound unique with NULLS NOT DISTINCT (Postgres 15+)
ALTER TABLE "Category"
  ADD CONSTRAINT "Category_name_parentId_key"
  UNIQUE NULLS NOT DISTINCT ("name", "parentId");
