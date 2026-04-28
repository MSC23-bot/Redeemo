# Category Taxonomy Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the data layer and discovery-API foundation for the locked category taxonomy spec — schema migration, seed update, tag system, primary descriptor, supply-aware visibility data, and discovery API meta envelope. No customer-app UI work.

**Architecture:** Additive Prisma migration that introduces a curated `Tag` system (Cuisine / Specialty / Highlight / Detail) alongside existing `Category` / `MerchantCategory`. Renames the existing free-text `MerchantTag` (merchant-suggested PENDING/APPROVED tags) to `MerchantSuggestedTag` to free the name for the new curated assignment join. Extends `Merchant` with a single `primaryDescriptorTagId` FK as the sole "primary tag" source of truth. Adds `merchantCountByCity` JSON denormalisation on `Category` and `Tag` to power supply-aware UI rules cheaply. Discovery API gets a `meta` envelope (`scope`, `resolvedArea`, `scopeExpanded`, `chipsHidden`) and a tag-filter query param.

**Tech Stack:** Node.js 24 · TypeScript · Prisma 7.7 (driver adapter `@prisma/adapter-pg`) · Fastify · PostgreSQL 16 (Neon) · Vitest. Generated Prisma client at `generated/prisma/client`. Datasource URL in `prisma.config.ts`. Seed runs via `npx prisma db seed`.

**Source spec:** [docs/superpowers/specs/2026-04-28-category-taxonomy-design.md](../specs/2026-04-28-category-taxonomy-design.md). All section references (§) point to that spec.

---

## File Structure

### Files to create
- `prisma/migrations/<timestamp>_category_taxonomy/migration.sql` — generated migration covering rename, new tables, new fields, indexes, CHECK constraints
- `prisma/seed-data/categories.ts` — exports the 11 top-level + 89 subcategory inventory as plain TS data
- `prisma/seed-data/tags.ts` — exports cuisine + specialty + highlight + detail tag dictionaries
- `prisma/seed-data/subcategoryTags.ts` — exports the SubcategoryTag join rules (which tags belong to which subcategories)
- `prisma/seed-data/redundantHighlights.ts` — exports RedundantHighlight rules
- `src/api/lib/scope.ts` — scope resolution helper (Tier 1–4 ladder, returns `{ scope, resolvedArea }`)
- `src/api/lib/merchantCount.ts` — recompute and update `merchantCountByCity` for `Category` and `Tag`
- `src/api/lib/tile.ts` — descriptor construction (`{tag.label} {subcategory.descriptorSuffix}` + de-dup) and highlight resolver (with redundancy filter)
- `tests/api/lib/scope.test.ts`
- `tests/api/lib/tile.test.ts`
- `tests/api/lib/merchantCount.test.ts`
- `tests/prisma/taxonomy-seed.test.ts` — seed integrity tests

### Files to modify
- `prisma/schema.prisma` — rename existing `MerchantTag` → `MerchantSuggestedTag`; add `Tag`, `SubcategoryTag`, new `MerchantTag` (curated join), `MerchantHighlight`, `RedundantHighlight`; extend `Category` and `Merchant`
- `prisma/seed.ts` — replace category/tag seeding logic; wire denormalisation backfill
- `src/api/customer/discovery/routes.ts` — extend `/search` query schema with `tagIds` and `scope`; add `meta` envelope to relevant responses; ensure `MerchantSuggestedTag` rename is reflected
- `src/api/customer/discovery/service.ts` — extend `searchMerchants` to filter by tag IDs; extend `listActiveCategories` to be supply-aware per scope; add `getCategoryMerchants(categoryId, scope)`; add tile descriptor + highlights to merchant responses; rename `merchantTag` references to `merchantSuggestedTag`
- `tests/api/customer/discovery.routes.test.ts` — extend with route-level tests for new query params (mocked service layer, matching the existing pattern)
- `tests/api/customer/discovery.service.test.ts` — NEW file: service-level tests with mocked Prisma covering tag filters, meta envelope construction, supply-aware filtering, descriptor + redundancy, de-dup rule end-to-end

---

## Task ordering principle

Schema before seed before service before tests for each unit. Frequent commits at task boundaries. Run the full backend test suite (`npx vitest run`) at the end of each major group to catch regressions early.

---

## Group 1 — Schema migration

### Task 1: Rename existing `MerchantTag` → `MerchantSuggestedTag` in schema

**Files:**
- Modify: `prisma/schema.prisma` lines 496–516 (MerchantTag block) + line 345 (Merchant relation)

- [ ] **Step 1: Update schema enum and model name**

In `prisma/schema.prisma`, replace the existing `enum MerchantTagStatus` and `model MerchantTag` block (lines 496–516) with:

```prisma
// ─────────────────────────────────────────
// MERCHANT-SUGGESTED TAGS
// (free-text tags merchants submit during onboarding,
//  moderated by admin. NOT the curated taxonomy Tag system.)
// ─────────────────────────────────────────

enum MerchantSuggestedTagStatus {
  PENDING
  APPROVED
  REJECTED
}

model MerchantSuggestedTag {
  id         String                       @id @default(uuid())
  merchantId String
  tag        String
  status     MerchantSuggestedTagStatus   @default(PENDING)

  merchant   Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)

  @@unique([merchantId, tag])
  @@index([tag])
}
```

- [ ] **Step 2: Update `Merchant` relation field name**

At line 345 of `prisma/schema.prisma`, change:
```prisma
tags                 MerchantTag[]
```
to:
```prisma
suggestedTags        MerchantSuggestedTag[]
```

- [ ] **Step 3: Commit schema change**

```bash
git add prisma/schema.prisma
git commit -m "refactor(prisma): rename MerchantTag to MerchantSuggestedTag

Frees the MerchantTag name for the new curated taxonomy tag system
landing in the next commits. Functional behaviour unchanged.
"
```

---

### Task 2: Update service-layer reference to renamed model

**Files:**
- Modify: `src/api/customer/discovery/service.ts:3` (import) and `src/api/customer/discovery/service.ts:612-613` (query)

- [ ] **Step 1: Update the import**

In `src/api/customer/discovery/service.ts`, change line 3 from:
```ts
  MerchantTagStatus,
```
to:
```ts
  MerchantSuggestedTagStatus,
```

- [ ] **Step 2: Update the query at lines ~612–613**

Change:
```ts
const tags = await prisma.merchantTag.findMany({
  where: { tag: { contains: q, mode: 'insensitive' }, status: MerchantTagStatus.APPROVED },
  ...
})
```
to:
```ts
const tags = await prisma.merchantSuggestedTag.findMany({
  where: { tag: { contains: q, mode: 'insensitive' }, status: MerchantSuggestedTagStatus.APPROVED },
  ...
})
```

- [ ] **Step 3: Run tests to confirm rename is consistent**

```bash
npx vitest run tests/api/customer/discovery.routes.test.ts
```

Expected: existing tests still pass (after the migration is applied in Task 4 — for now, expect type errors only on uncompiled code).

- [ ] **Step 4: Commit**

```bash
git add src/api/customer/discovery/service.ts
git commit -m "refactor(discovery): use MerchantSuggestedTag in service

Mirrors the prisma rename. No behavioural change.
"
```

---

### Task 3: Add new schema models for the curated taxonomy

**Files:**
- Modify: `prisma/schema.prisma` — add after the `MerchantSuggestedTag` block (around line 520, before `// CATEGORIES`)

- [ ] **Step 1: Add the four new models + Tag enum**

Insert this block after the renamed `MerchantSuggestedTag` model and before the `// CATEGORIES` section:

```prisma
// ─────────────────────────────────────────
// CURATED TAG TAXONOMY
// See docs/superpowers/specs/2026-04-28-category-taxonomy-design.md
// ─────────────────────────────────────────

enum TagType {
  CUISINE
  SPECIALTY
  HIGHLIGHT
  DETAIL
}

enum TagCreatedBy {
  SYSTEM
  ADMIN
}

model Tag {
  id                  String         @id @default(uuid())
  label               String
  type                TagType
  descriptorEligible  Boolean        @default(false)
  isActive            Boolean        @default(true)
  createdBy           TagCreatedBy   @default(SYSTEM)
  createdAt           DateTime       @default(now())
  merchantCountByCity Json           @default("{}")    // { cityId: count }

  subcategoryLinks    SubcategoryTag[]
  merchantLinks       MerchantTag[]
  merchantHighlights  MerchantHighlight[]
  redundantFor        RedundantHighlight[]
  primaryFor          Merchant[]     @relation("MerchantPrimaryDescriptorTag")

  @@unique([label, type])
  @@index([type, isActive])
}

model SubcategoryTag {
  id                String   @id @default(uuid())
  subcategoryId     String
  tagId             String
  isPrimaryEligible Boolean  @default(false)

  subcategory Category @relation(fields: [subcategoryId], references: [id], onDelete: Cascade)
  tag         Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([subcategoryId, tagId])
  @@index([tagId])
}

model MerchantTag {
  id         String @id @default(uuid())
  merchantId String
  tagId      String

  merchant Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  tag      Tag      @relation(fields: [tagId], references: [id])

  @@unique([merchantId, tagId])
  @@index([tagId])
}

model MerchantHighlight {
  id             String @id @default(uuid())
  merchantId     String
  highlightTagId String
  sortOrder      Int    @default(0)

  merchant Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  tag      Tag      @relation(fields: [highlightTagId], references: [id])

  @@unique([merchantId, highlightTagId])
  @@index([merchantId])
}

model RedundantHighlight {
  id             String  @id @default(uuid())
  subcategoryId  String
  highlightTagId String
  reason         String?

  subcategory Category @relation("CategoryRedundantHighlights", fields: [subcategoryId], references: [id], onDelete: Cascade)
  tag         Tag      @relation(fields: [highlightTagId], references: [id])

  @@unique([subcategoryId, highlightTagId])
}
```

- [ ] **Step 2: Extend the `Merchant` model**

In `prisma/schema.prisma`, inside `model Merchant {`, after the existing `primaryCategoryId String?` line, add:

```prisma
  primaryDescriptorTagId String?
```

And in the relations block of `Merchant`, add:

```prisma
  primaryDescriptorTag   Tag?                 @relation("MerchantPrimaryDescriptorTag", fields: [primaryDescriptorTagId], references: [id])
  tags                   MerchantTag[]
  highlights             MerchantHighlight[]
```

(The previous `tags` relation was renamed in Task 1 to `suggestedTags`. The new `tags` field here points at the curated `MerchantTag`.)

Also add the index:
```prisma
  @@index([primaryDescriptorTagId])
```

- [ ] **Step 3: Extend the `Category` model**

In the existing `model Category` block (lines 522–542), add the four new fields before `createdAt`:

```prisma
  descriptorState              CategoryDescriptorState?  // subcategories only
  descriptorSuffix             String?                    // override; defaults to category name
  minSubcategoryCountForChips  Int     @default(3)
  merchantCountByCity          Json    @default("{}")     // { cityId: count }
```

And add the new relation:
```prisma
  redundantHighlights RedundantHighlight[] @relation("CategoryRedundantHighlights")
```

Add the new enum above the `Category` model:

```prisma
enum CategoryDescriptorState {
  RECOMMENDED
  OPTIONAL
  HIDDEN
}
```

- [ ] **Step 4: Commit schema additions**

```bash
git add prisma/schema.prisma
git commit -m "feat(prisma): add curated tag taxonomy models

Adds Tag/SubcategoryTag/MerchantTag/MerchantHighlight/RedundantHighlight
plus Category.descriptorState/descriptorSuffix/minSubcategoryCountForChips/
merchantCountByCity and Merchant.primaryDescriptorTagId.

See docs/superpowers/specs/2026-04-28-category-taxonomy-design.md.
"
```

---

### Task 4: Generate and apply the Prisma migration

**Files:**
- Create: `prisma/migrations/<timestamp>_category_taxonomy/migration.sql` (generated)

- [ ] **Step 1: Generate migration**

```bash
npx prisma migrate dev --name category_taxonomy --create-only
```

Expected: a new directory `prisma/migrations/<timestamp>_category_taxonomy/` containing `migration.sql`.

- [ ] **Step 2: Review and edit the generated SQL — ensure RENAME, not DROP+CREATE**

Open `prisma/migrations/<timestamp>_category_taxonomy/migration.sql`. Prisma's heuristics SHOULD detect the existing `MerchantTag` rename via the shadow DB, but if Prisma's schema diff renders it as **DROP TABLE "MerchantTag"; CREATE TABLE "MerchantSuggestedTag"** (or DROP TYPE / CREATE TYPE for the enum), this is **unsafe** — it loses any existing data.

Verify the migration includes:

- `ALTER TABLE "MerchantTag" RENAME TO "MerchantSuggestedTag"` ✅ (safe — preserves rows and indexes)
- `ALTER TYPE "MerchantTagStatus" RENAME TO "MerchantSuggestedTagStatus"` ✅
- `CREATE TYPE "TagType" / "TagCreatedBy" / "CategoryDescriptorState"`
- `CREATE TABLE "Tag" / "SubcategoryTag" / "MerchantTag" / "MerchantHighlight" / "RedundantHighlight"` (this is a NEW `MerchantTag` model, after the rename)
- `ALTER TABLE "Category" ADD COLUMN "descriptorState" / "descriptorSuffix" / "minSubcategoryCountForChips" / "merchantCountByCity"`
- `ALTER TABLE "Merchant" ADD COLUMN "primaryDescriptorTagId"`
- All needed indexes and unique constraints

**If Prisma generated DROP+CREATE** for the rename, manually rewrite the relevant block to use `ALTER TABLE … RENAME TO …` and `ALTER TYPE … RENAME TO …`. The new `MerchantTag` table (curated taxonomy) must be created AFTER the rename completes, otherwise the new table name collides with the old one mid-migration.

Sequencing in the SQL file:

```sql
-- 1) Rename old MerchantTag artefacts first (preserves data)
ALTER TABLE "MerchantTag" RENAME TO "MerchantSuggestedTag";
ALTER TYPE "MerchantTagStatus" RENAME TO "MerchantSuggestedTagStatus";
-- (Prisma rename also covers the foreign-key constraint and indexes — verify in the diff)

-- 2) Create the new tag-system enums and tables (after the name is freed)
CREATE TYPE "TagType" AS ENUM (...);
CREATE TYPE "TagCreatedBy" AS ENUM (...);
CREATE TYPE "CategoryDescriptorState" AS ENUM (...);
CREATE TABLE "Tag" (...);
CREATE TABLE "SubcategoryTag" (...);
CREATE TABLE "MerchantTag" (...);  -- new curated join, name freed by step 1
CREATE TABLE "MerchantHighlight" (...);
CREATE TABLE "RedundantHighlight" (...);

-- 3) ALTER existing Category and Merchant to add new columns
ALTER TABLE "Category" ADD COLUMN ...;
ALTER TABLE "Merchant" ADD COLUMN "primaryDescriptorTagId" TEXT;
```

- [ ] **Step 3: Append the 3-cap database trigger for MerchantHighlight**

Prisma can't express the 3-row-per-merchant constraint declaratively. Append at the end of `migration.sql`:

```sql
-- Enforce hard cap of 3 highlights per merchant (§3.4).
-- Fires on INSERT and on UPDATE of merchantId so an UPDATE can't move
-- a row into a merchant already at the cap.
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
```

- [ ] **Step 4: Apply the migration**

```bash
npx prisma migrate dev
```

Expected: migration applies cleanly. Prisma client regenerates.

- [ ] **Step 5: Commit migration**

```bash
git add prisma/migrations/
git commit -m "feat(prisma): migration for curated tag taxonomy

Renames MerchantTag → MerchantSuggestedTag, adds Tag/SubcategoryTag/
MerchantTag/MerchantHighlight/RedundantHighlight tables, extends
Category and Merchant. Adds postgres trigger to enforce the hard
3-cap on MerchantHighlight per merchant.
"
```

---

### Task 5: Run full backend test suite to confirm migration doesn't break existing tests

- [ ] **Step 1: Run all backend tests**

```bash
npx vitest run
```

Expected: 285 existing tests still pass (subject to the rename — type errors should already be fixed in Task 2).

- [ ] **Step 2: Fix any unexpected breakages**

Most likely issues: a test or a service file still references `prisma.merchantTag` or `MerchantTagStatus`. Grep:
```bash
grep -rn "merchantTag\b\|MerchantTagStatus\b" src/ tests/ --include="*.ts" | grep -v "merchantSuggestedTag\|MerchantSuggestedTagStatus"
```

If any results, update them to the renamed model.

- [ ] **Step 3: Re-run tests until clean**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit any fixes if needed**

```bash
git add <fixed files>
git commit -m "test: align with MerchantTag rename"
```

---

## Group 2 — Tag taxonomy seed

### Task 6: Create seed-data file for the 11 top-level categories

**Files:**
- Create: `prisma/seed-data/categories.ts`

- [ ] **Step 1: Write the data file**

Create `prisma/seed-data/categories.ts`:

```ts
import type { CategoryDescriptorState } from '../../generated/prisma/client'

export type SeedTopLevelCategory = {
  name: string
  sortOrder: number
  pinColour?: string
  pinIcon?: string
}

export type SeedSubcategory = {
  parent: string                          // top-level category name
  name: string
  sortOrder: number
  descriptorState: CategoryDescriptorState
  descriptorSuffix?: string                // optional override
}

export const TOP_LEVEL_CATEGORIES: SeedTopLevelCategory[] = [
  { name: 'Food & Drink',           sortOrder: 1,  pinColour: '#E65100', pinIcon: 'fork-knife' },
  { name: 'Beauty & Wellness',      sortOrder: 2,  pinColour: '#E91E8C', pinIcon: 'sparkles' },
  { name: 'Health & Fitness',       sortOrder: 3,  pinColour: '#4CAF50', pinIcon: 'dumbbell' },
  { name: 'Out & About',            sortOrder: 4,  pinColour: '#9C27B0', pinIcon: 'compass' },
  { name: 'Shopping',               sortOrder: 5,  pinColour: '#7C4DFF', pinIcon: 'bag' },
  { name: 'Home & Local Services',  sortOrder: 6,  pinColour: '#607D8B', pinIcon: 'tools' },
  { name: 'Travel & Hotels',        sortOrder: 7,  pinColour: '#0097A7', pinIcon: 'bed' },
  { name: 'Health & Medical',       sortOrder: 8,  pinColour: '#F44336', pinIcon: 'stethoscope' },
  { name: 'Family & Kids',          sortOrder: 9,  pinColour: '#FF9800', pinIcon: 'family' },
  { name: 'Auto & Garage',          sortOrder: 10, pinColour: '#455A64', pinIcon: 'car' },
  { name: 'Pet Services',           sortOrder: 11, pinColour: '#795548', pinIcon: 'paw' },
]

export const SUBCATEGORIES: SeedSubcategory[] = [
  // Food & Drink (8)
  { parent: 'Food & Drink', name: 'Restaurant',        sortOrder: 1, descriptorState: 'RECOMMENDED', descriptorSuffix: 'Restaurant' },
  { parent: 'Food & Drink', name: 'Cafe & Coffee',     sortOrder: 2, descriptorState: 'OPTIONAL',    descriptorSuffix: 'Cafe' },
  { parent: 'Food & Drink', name: 'Bakery',            sortOrder: 3, descriptorState: 'OPTIONAL' },
  { parent: 'Food & Drink', name: 'Dessert Shop',      sortOrder: 4, descriptorState: 'OPTIONAL' },
  { parent: 'Food & Drink', name: 'Takeaway',          sortOrder: 5, descriptorState: 'RECOMMENDED' },
  { parent: 'Food & Drink', name: 'Bar',               sortOrder: 6, descriptorState: 'RECOMMENDED' },
  { parent: 'Food & Drink', name: 'Pub & Gastropub',   sortOrder: 7, descriptorState: 'RECOMMENDED' },
  { parent: 'Food & Drink', name: 'Food Hall',         sortOrder: 8, descriptorState: 'HIDDEN' },

  // Beauty & Wellness (9)
  { parent: 'Beauty & Wellness', name: 'Hair Salon',         sortOrder: 1, descriptorState: 'OPTIONAL' },
  { parent: 'Beauty & Wellness', name: 'Barber',             sortOrder: 2, descriptorState: 'HIDDEN' },
  { parent: 'Beauty & Wellness', name: 'Nail Salon',         sortOrder: 3, descriptorState: 'HIDDEN' },
  { parent: 'Beauty & Wellness', name: 'Beauty Salon',       sortOrder: 4, descriptorState: 'OPTIONAL' },
  { parent: 'Beauty & Wellness', name: 'Day Spa',            sortOrder: 5, descriptorState: 'OPTIONAL' },
  { parent: 'Beauty & Wellness', name: 'Massage Studio',     sortOrder: 6, descriptorState: 'OPTIONAL' },
  { parent: 'Beauty & Wellness', name: 'Aesthetics Clinic',  sortOrder: 7, descriptorState: 'RECOMMENDED' },
  { parent: 'Beauty & Wellness', name: 'Tanning Salon',      sortOrder: 8, descriptorState: 'HIDDEN' },
  { parent: 'Beauty & Wellness', name: 'Wellness Studio',    sortOrder: 9, descriptorState: 'RECOMMENDED' },

  // Health & Fitness (8)
  { parent: 'Health & Fitness', name: 'Gym',                            sortOrder: 1, descriptorState: 'RECOMMENDED' },
  { parent: 'Health & Fitness', name: 'Boutique Studio',                sortOrder: 2, descriptorState: 'RECOMMENDED', descriptorSuffix: 'Studio' },
  { parent: 'Health & Fitness', name: 'Boxing & Martial Arts Studio',   sortOrder: 3, descriptorState: 'RECOMMENDED', descriptorSuffix: 'Studio' },
  { parent: 'Health & Fitness', name: 'Climbing Gym',                   sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Health & Fitness', name: 'Dance Studio',                   sortOrder: 5, descriptorState: 'HIDDEN' },
  { parent: 'Health & Fitness', name: 'Swimming Pool',                  sortOrder: 6, descriptorState: 'HIDDEN' },
  { parent: 'Health & Fitness', name: 'Sports Club',                    sortOrder: 7, descriptorState: 'OPTIONAL' },
  { parent: 'Health & Fitness', name: 'Personal Trainer',               sortOrder: 8, descriptorState: 'OPTIONAL' },

  // Out & About (11)
  { parent: 'Out & About', name: 'Cinema',                           sortOrder: 1,  descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Live Venue',                       sortOrder: 2,  descriptorState: 'RECOMMENDED' },
  { parent: 'Out & About', name: 'Bowling & Games',                  sortOrder: 3,  descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Mini-Golf',                        sortOrder: 4,  descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Escape Room',                      sortOrder: 5,  descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Immersive Experience',             sortOrder: 6,  descriptorState: 'OPTIONAL' },
  { parent: 'Out & About', name: 'Class & Workshop',                 sortOrder: 7,  descriptorState: 'RECOMMENDED' },
  { parent: 'Out & About', name: 'Theme & Adventure Park',           sortOrder: 8,  descriptorState: 'OPTIONAL' },
  { parent: 'Out & About', name: 'Zoo & Wildlife Park',              sortOrder: 9,  descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Museum, Gallery & Historic Site',  sortOrder: 10, descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Tour & Day Trip',                  sortOrder: 11, descriptorState: 'RECOMMENDED' },

  // Shopping (9)
  { parent: 'Shopping', name: 'Fashion Boutique',         sortOrder: 1, descriptorState: 'RECOMMENDED' },
  { parent: 'Shopping', name: 'Homeware & Lifestyle',     sortOrder: 2, descriptorState: 'OPTIONAL' },
  { parent: 'Shopping', name: 'Gift Shop',                sortOrder: 3, descriptorState: 'HIDDEN' },
  { parent: 'Shopping', name: 'Jewellery Store',          sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Shopping', name: 'Florist',                  sortOrder: 5, descriptorState: 'HIDDEN' },
  { parent: 'Shopping', name: 'Bookshop',                 sortOrder: 6, descriptorState: 'HIDDEN' },
  { parent: 'Shopping', name: 'Independent Grocer & Deli',sortOrder: 7, descriptorState: 'HIDDEN' },
  { parent: 'Shopping', name: 'Vintage & Pre-Loved',      sortOrder: 8, descriptorState: 'OPTIONAL' },
  { parent: 'Shopping', name: 'Specialist Retailer',      sortOrder: 9, descriptorState: 'RECOMMENDED' },

  // Home & Local Services (11) — all HIDDEN; format is the descriptor
  { parent: 'Home & Local Services', name: 'Cleaner',                  sortOrder: 1,  descriptorState: 'OPTIONAL' },
  { parent: 'Home & Local Services', name: 'Gardener',                 sortOrder: 2,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Decorator & Handyman',     sortOrder: 3,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Locksmith',                sortOrder: 4,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Removals',                 sortOrder: 5,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Tailor & Alterations',     sortOrder: 6,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Laundry & Dry Cleaning',   sortOrder: 7,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Shoe Repair & Key Cutting',sortOrder: 8,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Tech Repair',              sortOrder: 9,  descriptorState: 'OPTIONAL' },
  { parent: 'Home & Local Services', name: 'Bike Repair',              sortOrder: 10, descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Print, Copy & Photo',      sortOrder: 11, descriptorState: 'HIDDEN' },

  // Travel & Hotels (7)
  { parent: 'Travel & Hotels', name: 'Hotel',              sortOrder: 1, descriptorState: 'RECOMMENDED' },
  { parent: 'Travel & Hotels', name: 'Boutique Hotel',     sortOrder: 2, descriptorState: 'HIDDEN' },
  { parent: 'Travel & Hotels', name: 'Spa Hotel',          sortOrder: 3, descriptorState: 'HIDDEN' },
  { parent: 'Travel & Hotels', name: 'B&B & Inn',          sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Travel & Hotels', name: 'Self-Catering',      sortOrder: 5, descriptorState: 'OPTIONAL' },
  { parent: 'Travel & Hotels', name: 'Holiday Park',       sortOrder: 6, descriptorState: 'HIDDEN' },
  { parent: 'Travel & Hotels', name: 'Glamping & Camping', sortOrder: 7, descriptorState: 'HIDDEN' },

  // Health & Medical (7)
  { parent: 'Health & Medical', name: 'Dental Clinic',                   sortOrder: 1, descriptorState: 'HIDDEN' },
  { parent: 'Health & Medical', name: 'Optician',                        sortOrder: 2, descriptorState: 'HIDDEN' },
  { parent: 'Health & Medical', name: 'Private GP',                      sortOrder: 3, descriptorState: 'OPTIONAL' },
  { parent: 'Health & Medical', name: 'Physio & Chiropractic Clinic',    sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Health & Medical', name: 'Aesthetics Clinic',               sortOrder: 5, descriptorState: 'RECOMMENDED' },
  { parent: 'Health & Medical', name: 'Hearing Centre',                  sortOrder: 6, descriptorState: 'HIDDEN' },
  { parent: 'Health & Medical', name: 'IV & Wellness Clinic',            sortOrder: 7, descriptorState: 'RECOMMENDED' },

  // Family & Kids (7)
  { parent: 'Family & Kids', name: 'Soft Play',              sortOrder: 1, descriptorState: 'OPTIONAL' },
  { parent: 'Family & Kids', name: "Kids' Class & Activity", sortOrder: 2, descriptorState: 'RECOMMENDED' },
  { parent: 'Family & Kids', name: 'Party Venue',            sortOrder: 3, descriptorState: 'RECOMMENDED' },
  { parent: 'Family & Kids', name: "Children's Hairdresser", sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Family & Kids', name: 'Tutoring',               sortOrder: 5, descriptorState: 'HIDDEN' },
  { parent: 'Family & Kids', name: "Toy & Kids' Boutique",   sortOrder: 6, descriptorState: 'HIDDEN' },
  { parent: 'Family & Kids', name: 'Family Photo Studio',    sortOrder: 7, descriptorState: 'HIDDEN' },

  // Auto & Garage (6)
  { parent: 'Auto & Garage', name: 'Garage & MOT',         sortOrder: 1, descriptorState: 'OPTIONAL' },
  { parent: 'Auto & Garage', name: 'Tyre Centre',          sortOrder: 2, descriptorState: 'HIDDEN' },
  { parent: 'Auto & Garage', name: 'Body Shop',            sortOrder: 3, descriptorState: 'HIDDEN' },
  { parent: 'Auto & Garage', name: 'Mobile Mechanic',      sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Auto & Garage', name: 'Car Wash & Detailing', sortOrder: 5, descriptorState: 'HIDDEN' },
  { parent: 'Auto & Garage', name: 'EV Charging',          sortOrder: 6, descriptorState: 'HIDDEN' },

  // Pet Services (6)
  { parent: 'Pet Services', name: 'Pet Groomer',             sortOrder: 1, descriptorState: 'HIDDEN' },
  { parent: 'Pet Services', name: 'Dog Walker',              sortOrder: 2, descriptorState: 'HIDDEN' },
  { parent: 'Pet Services', name: 'Pet Boarding & Daycare',  sortOrder: 3, descriptorState: 'HIDDEN' },
  { parent: 'Pet Services', name: 'Vet',                     sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Pet Services', name: 'Pet Training',            sortOrder: 5, descriptorState: 'OPTIONAL' },
  { parent: 'Pet Services', name: 'Pet Boutique',            sortOrder: 6, descriptorState: 'OPTIONAL' },
]
```

- [ ] **Step 2: Commit**

```bash
git add prisma/seed-data/categories.ts
git commit -m "data: add 11 top-level categories + 89 subcategories seed data"
```

---

### Task 7: Create seed-data file for tags (cuisine + specialty + highlights + details)

**Files:**
- Create: `prisma/seed-data/tags.ts`

- [ ] **Step 1: Write tag inventory**

Create `prisma/seed-data/tags.ts`. The full inventory mirrors §3.2–3.5 of the spec. Use this exact structure:

```ts
import type { TagType } from '../../generated/prisma/client'

export type SeedTag = { label: string; type: TagType; descriptorEligible: boolean }

// §3.2 — Cuisine (32 tags, all descriptor-eligible)
export const CUISINE_TAGS: SeedTag[] = [
  'British','Modern British','Modern European','Italian','French','Spanish','Portuguese','Greek','Turkish','Lebanese','Mediterranean',
  'Indian','Pakistani','Nepalese','Bangladeshi','Sri Lankan','Persian',
  'Chinese','Cantonese','Sichuan','Japanese','Korean','Thai','Vietnamese','Malaysian','Pan-Asian',
  'Mexican','American','Caribbean','Brazilian','African','Ethiopian',
  'Middle Eastern','Fusion',
].map((label) => ({ label, type: 'CUISINE' as const, descriptorEligible: true }))

// §3.3 — Specialty (descriptor-eligible explicitly listed)
type SpecialtyDef = { label: string; descriptorEligible: boolean }
const def = (label: string, eligible = false): SpecialtyDef => ({ label, descriptorEligible: eligible })

export const SPECIALTY_TAGS: SeedTag[] = [
  // Food & Drink
  def('Pizza', true), def('Burgers', true), def('Sushi', true), def('Ramen', true), def('Dim Sum', true),
  def('Tapas', true), def('Steakhouse', true), def('Seafood', true), def('BBQ', true), def('Brunch', true),
  def('Sunday Roast'), def('Afternoon Tea', true),
  def('Specialty Coffee', true), def('Matcha', true), def('Bubble Tea', true),
  def('Cocktails', true), def('Craft Beer', true), def('Wine Bar', true), def('Natural Wine'),
  def('Sports Bar', true), def('Karaoke', true),
  def('Patisserie', true), def('Gelato', true),
  def('Vegan', true), def('Plant-Based'), def('Vegetarian'),

  // Beauty & Wellness
  def('Manicure'), def('Pedicure'), def('Gel Nails'), def('Acrylics'), def('BIAB'),
  def('Lash Extensions'), def('Lash Lift'), def('Brow Lamination'), def('HD Brows'),
  def('Threading'), def('Waxing'),
  def('Hair Colour'), def('Balayage'), def('Highlights'), def('Keratin'), def('Blow Dry'),
  def('Curly Hair Specialist'), def("Men's Grooming"), def('Hot Towel Shave'),
  def('Facial'), def('Deep Tissue'), def('Sports Massage'), def('Hot Stone'), def('Lymphatic'), def('Reflexology'),
  def('Botox'), def('Dermal Fillers'), def('Lip Filler'), def('Skin Booster'), def('Microneedling'),
  def('Sauna'), def('Steam Room'), def('Float Tank'), def('IV Drip'),
  def('Hammam', true), def('Korean Spa', true),

  // Health & Fitness
  def('Yoga', true), def('Hot Yoga', true), def('Pilates', true), def('Reformer Pilates', true), def('Barre', true),
  def('HIIT', true), def('Spin', true), def('Cycling', true), def('Strength'),
  def('CrossFit', true), def('F45', true), def('Functional'), def('Bootcamp', true),
  def('Boxing', true), def('Kickboxing', true), def('Muay Thai', true), def('MMA', true), def('BJJ', true),
  def('Karate', true), def('Judo', true), def('Taekwondo', true),
  def('Bouldering', true), def('Indoor Climbing', true),
  def('Swimming'), def('Personal Training'),
  def('Ballet', true), def('Hip-Hop', true), def('Latin', true),

  // Out & About
  def('IMAX'), def('Boutique Cinema', true),
  def('Stand-Up Comedy'), def('Live Music'), def('Gig'), def('Theatre'), def('Musical'),
  def('Cookery Class', true), def('Pottery Class', true), def('Life Drawing', true),
  def('Wine Tasting', true), def('Cocktail Class', true), def('Candle-Making', true), def('Floristry Class', true),
  def('Walking Tour', true), def('Boat Trip', true), def('Ghost Tour', true), def('Food Tour', true),
  def('Helicopter Tour', true), def('Hot Air Balloon', true),
  def('Theme Park', true), def('Water Park', true), def('Adventure Park', true),
  def('Wildlife Safari', true), def('Aquarium', true),
  def('VR Experience', true), def('Themed Experience', true),

  // Shopping
  def('Womenswear', true), def('Menswear', true), def('Kidswear', true), def('Streetwear', true),
  def('Designer'), def('Vintage'), def('Sustainable'), def('Independent'),
  def('Homeware'), def('Books'),
  def('Records', true), def('Board Games', true), def('Comics', true), def('Art Supplies', true),
  def('Crafts', true), def('Models & Hobbies', true), def('Music Instruments', true),

  // Home & Local Services
  def('End of Tenancy'), def('Deep Clean'), def('Carpet Cleaning'), def('Office Cleaning'),
  def('Phone Repair'), def('Laptop Repair'), def('Tablet Repair'), def('Console Repair'),
  def('Wedding Alterations'), def('Bridal'), def('Suit Tailoring'),

  // Travel & Hotels
  def('Boutique', true), def('Spa', true), def('Resort', true), def('Country House', true),
  def('Adults-Only', true), def('Romantic', true),

  // Health & Medical
  def('Cosmetic Dentistry', true), def('Invisalign'), def('Orthodontics'),
  def('Eye Test'), def('Contact Lenses'), def('Designer Frames', true),
  def('Sports Physio', true), def('Pre/Post-Natal', true),

  // Family & Kids
  def('Toddler'), def('All-Ages'), def('Adventure'),
  def('Gymnastics', true), def('Swimming Lessons', true), def('Football', true),
  def('Drama', true), def('Music Lessons', true), def('Art', true), def('Coding', true),
  def('Birthday Party'), def('Themed Party'), def('Laser Tag', true),

  // Auto & Garage
  def('Mercedes Specialist', true), def('BMW Specialist', true), def('Classic Car', true),
  def('Performance', true), def('EV Specialist', true),

  // Pet Services
  def('Cat Grooming'), def('Mobile Grooming', true), def('Hand-Stripping'),
  def('Puppy Training', true), def('Behavioural', true),
].map(({ label, descriptorEligible }) => ({ label, type: 'SPECIALTY' as const, descriptorEligible }))

// §3.4 — Highlights (18 tags, never descriptor-eligible)
export const HIGHLIGHT_TAGS: SeedTag[] = [
  'Halal','Kosher','Vegan-Friendly','Vegetarian-Friendly',
  'Outdoor Seating','Beer Garden','Rooftop','Waterside',
  'Family-Friendly','Pet-Friendly','Wheelchair Accessible',
  'Date Night','Open Late',
  'Independent','Women-Owned','Black-Owned','LGBTQ+ Friendly','Eco-Conscious',
].map((label) => ({ label, type: 'HIGHLIGHT' as const, descriptorEligible: false }))

// §3.5 — Details (~35 tags, never descriptor-eligible)
export const DETAIL_TAGS: SeedTag[] = [
  // Dietary granularity
  'Gluten-Free Options','Dairy-Free Options','Nut-Free Options',
  // Space granularity (Group-Friendly demoted from Highlights — see spec)
  'Private Dining','Quiet','Live Sport','Baby-Changing','High Chairs','Group-Friendly',
  // Access granularity
  'Step-Free Access','Accessible Toilet','Hearing Loop',
  // Amenities
  'Free Wi-Fi','Parking','EV Charging','Air Conditioning',
  // Booking & service
  'Bookable Online','Walk-Ins Welcome','Reservation-Only','Same-Day Booking',
  'Takeaway Available','Delivery Available','Click & Collect',
  // Hours
  'Open Sundays','Open Bank Holidays','Open 24h',
  // Payment
  'Card-Only','Cash Accepted','Apple Pay','Contactless',
].map((label) => ({ label, type: 'DETAIL' as const, descriptorEligible: false }))

export const ALL_TAGS: SeedTag[] = [
  ...CUISINE_TAGS, ...SPECIALTY_TAGS, ...HIGHLIGHT_TAGS, ...DETAIL_TAGS,
]
```

- [ ] **Step 2: Verify counts compile and match spec**

Add a temporary log to the bottom of the file:
```ts
// Sanity check during development:
// 32 + ~165 + 18 + ~35 = ~250
```

- [ ] **Step 3: Commit**

```bash
git add prisma/seed-data/tags.ts
git commit -m "data: add curated tag inventory (cuisine/specialty/highlights/details)"
```

---

### Task 8: Create seed-data file for SubcategoryTag joins

**Files:**
- Create: `prisma/seed-data/subcategoryTags.ts`

- [ ] **Step 1: Write the join rules**

Create `prisma/seed-data/subcategoryTags.ts`. The rule is:

- Cuisine tags: joined ONLY to Food & Drink subcategories. `isPrimaryEligible = true` for Restaurant, Pub & Gastropub, Takeaway. `false` elsewhere.
- Specialty tags: joined to subcategories within their parent category, per the spec §3.3 grouping.
- Highlights and Details: joined to all subcategories (universal).

Use a parent-category-driven approach to avoid hand-listing every join. Implementation:

```ts
import { TOP_LEVEL_CATEGORIES, SUBCATEGORIES } from './categories'
import { CUISINE_TAGS, SPECIALTY_TAGS, HIGHLIGHT_TAGS, DETAIL_TAGS, type SeedTag } from './tags'

// Maps SPECIALTY tag label → parent top-level category name.
// Built by walking the §3.3 groups in tags.ts in declaration order
// and tagging each tag with its parent group as we go.
export const SPECIALTY_PARENT: Record<string, string> = {
  // Food & Drink
  'Pizza':'Food & Drink','Burgers':'Food & Drink','Sushi':'Food & Drink','Ramen':'Food & Drink','Dim Sum':'Food & Drink',
  'Tapas':'Food & Drink','Steakhouse':'Food & Drink','Seafood':'Food & Drink','BBQ':'Food & Drink','Brunch':'Food & Drink',
  'Sunday Roast':'Food & Drink','Afternoon Tea':'Food & Drink',
  'Specialty Coffee':'Food & Drink','Matcha':'Food & Drink','Bubble Tea':'Food & Drink',
  'Cocktails':'Food & Drink','Craft Beer':'Food & Drink','Wine Bar':'Food & Drink','Natural Wine':'Food & Drink',
  'Sports Bar':'Food & Drink','Karaoke':'Food & Drink',
  'Patisserie':'Food & Drink','Gelato':'Food & Drink',
  'Vegan':'Food & Drink','Plant-Based':'Food & Drink','Vegetarian':'Food & Drink',

  // Beauty & Wellness
  'Manicure':'Beauty & Wellness','Pedicure':'Beauty & Wellness','Gel Nails':'Beauty & Wellness','Acrylics':'Beauty & Wellness','BIAB':'Beauty & Wellness',
  'Lash Extensions':'Beauty & Wellness','Lash Lift':'Beauty & Wellness','Brow Lamination':'Beauty & Wellness','HD Brows':'Beauty & Wellness',
  'Threading':'Beauty & Wellness','Waxing':'Beauty & Wellness',
  'Hair Colour':'Beauty & Wellness','Balayage':'Beauty & Wellness','Highlights':'Beauty & Wellness','Keratin':'Beauty & Wellness','Blow Dry':'Beauty & Wellness',
  'Curly Hair Specialist':'Beauty & Wellness',"Men's Grooming":'Beauty & Wellness','Hot Towel Shave':'Beauty & Wellness',
  'Facial':'Beauty & Wellness','Deep Tissue':'Beauty & Wellness','Sports Massage':'Beauty & Wellness','Hot Stone':'Beauty & Wellness','Lymphatic':'Beauty & Wellness','Reflexology':'Beauty & Wellness',
  'Botox':'Beauty & Wellness','Dermal Fillers':'Beauty & Wellness','Lip Filler':'Beauty & Wellness','Skin Booster':'Beauty & Wellness','Microneedling':'Beauty & Wellness',
  'Sauna':'Beauty & Wellness','Steam Room':'Beauty & Wellness','Float Tank':'Beauty & Wellness','IV Drip':'Beauty & Wellness',
  'Hammam':'Beauty & Wellness','Korean Spa':'Beauty & Wellness',

  // Health & Fitness
  'Yoga':'Health & Fitness','Hot Yoga':'Health & Fitness','Pilates':'Health & Fitness','Reformer Pilates':'Health & Fitness','Barre':'Health & Fitness',
  'HIIT':'Health & Fitness','Spin':'Health & Fitness','Cycling':'Health & Fitness','Strength':'Health & Fitness',
  'CrossFit':'Health & Fitness','F45':'Health & Fitness','Functional':'Health & Fitness','Bootcamp':'Health & Fitness',
  'Boxing':'Health & Fitness','Kickboxing':'Health & Fitness','Muay Thai':'Health & Fitness','MMA':'Health & Fitness','BJJ':'Health & Fitness',
  'Karate':'Health & Fitness','Judo':'Health & Fitness','Taekwondo':'Health & Fitness',
  'Bouldering':'Health & Fitness','Indoor Climbing':'Health & Fitness',
  'Swimming':'Health & Fitness','Personal Training':'Health & Fitness',
  'Ballet':'Health & Fitness','Hip-Hop':'Health & Fitness','Latin':'Health & Fitness',

  // Out & About
  'IMAX':'Out & About','Boutique Cinema':'Out & About',
  'Stand-Up Comedy':'Out & About','Live Music':'Out & About','Gig':'Out & About','Theatre':'Out & About','Musical':'Out & About',
  'Cookery Class':'Out & About','Pottery Class':'Out & About','Life Drawing':'Out & About','Wine Tasting':'Out & About',
  'Cocktail Class':'Out & About','Candle-Making':'Out & About','Floristry Class':'Out & About',
  'Walking Tour':'Out & About','Boat Trip':'Out & About','Ghost Tour':'Out & About','Food Tour':'Out & About',
  'Helicopter Tour':'Out & About','Hot Air Balloon':'Out & About',
  'Theme Park':'Out & About','Water Park':'Out & About','Adventure Park':'Out & About',
  'Wildlife Safari':'Out & About','Aquarium':'Out & About',
  'VR Experience':'Out & About','Themed Experience':'Out & About',

  // Shopping
  'Womenswear':'Shopping','Menswear':'Shopping','Kidswear':'Shopping','Streetwear':'Shopping',
  'Designer':'Shopping','Vintage':'Shopping','Sustainable':'Shopping','Independent':'Shopping',
  'Homeware':'Shopping','Books':'Shopping',
  'Records':'Shopping','Board Games':'Shopping','Comics':'Shopping','Art Supplies':'Shopping',
  'Crafts':'Shopping','Models & Hobbies':'Shopping','Music Instruments':'Shopping',

  // Home & Local Services
  'End of Tenancy':'Home & Local Services','Deep Clean':'Home & Local Services','Carpet Cleaning':'Home & Local Services','Office Cleaning':'Home & Local Services',
  'Phone Repair':'Home & Local Services','Laptop Repair':'Home & Local Services','Tablet Repair':'Home & Local Services','Console Repair':'Home & Local Services',
  'Wedding Alterations':'Home & Local Services','Bridal':'Home & Local Services','Suit Tailoring':'Home & Local Services',

  // Travel & Hotels
  'Boutique':'Travel & Hotels','Spa':'Travel & Hotels','Resort':'Travel & Hotels','Country House':'Travel & Hotels',
  'Adults-Only':'Travel & Hotels','Romantic':'Travel & Hotels',

  // Health & Medical
  'Cosmetic Dentistry':'Health & Medical','Invisalign':'Health & Medical','Orthodontics':'Health & Medical',
  'Eye Test':'Health & Medical','Contact Lenses':'Health & Medical','Designer Frames':'Health & Medical',
  'Sports Physio':'Health & Medical','Pre/Post-Natal':'Health & Medical',

  // Family & Kids
  'Toddler':'Family & Kids','All-Ages':'Family & Kids','Adventure':'Family & Kids',
  'Gymnastics':'Family & Kids','Swimming Lessons':'Family & Kids','Football':'Family & Kids',
  'Drama':'Family & Kids','Music Lessons':'Family & Kids','Art':'Family & Kids','Coding':'Family & Kids',
  'Birthday Party':'Family & Kids','Themed Party':'Family & Kids','Laser Tag':'Family & Kids',

  // Auto & Garage
  'Mercedes Specialist':'Auto & Garage','BMW Specialist':'Auto & Garage','Classic Car':'Auto & Garage',
  'Performance':'Auto & Garage','EV Specialist':'Auto & Garage',

  // Pet Services
  'Cat Grooming':'Pet Services','Mobile Grooming':'Pet Services','Hand-Stripping':'Pet Services',
  'Puppy Training':'Pet Services','Behavioural':'Pet Services',
}

// Subcategories (by name) where Cuisine tags are eligible AS PRIMARY descriptor.
// Per §3.8: Restaurant, Pub & Gastropub, Takeaway = primary-eligible cuisines.
// Other Food & Drink subcategories (Cafe, Bar, Bakery, etc.) accept cuisine for filter
// but use specialty tags for descriptors.
export const PRIMARY_CUISINE_SUBCATEGORIES = new Set([
  'Restaurant','Pub & Gastropub','Takeaway',
])

// All Food & Drink subcategories accept cuisine tags (just not all primary-eligible)
export const FOOD_DRINK_SUBCATS_FOR_CUISINE = new Set([
  'Restaurant','Cafe & Coffee','Bakery','Dessert Shop','Takeaway','Bar','Pub & Gastropub','Food Hall',
])
```

- [ ] **Step 2: Commit**

```bash
git add prisma/seed-data/subcategoryTags.ts
git commit -m "data: add SubcategoryTag join rules"
```

---

### Task 9: Create seed-data file for RedundantHighlight rules

**Files:**
- Create: `prisma/seed-data/redundantHighlights.ts`

- [ ] **Step 1: Write the rules per spec §3.9**

```ts
export type RedundantHighlightRule = {
  subcategoryName: string
  highlightLabels: string[]
  reason: string
}

export const REDUNDANT_HIGHLIGHTS: RedundantHighlightRule[] = [
  // Pet-related subcategories — Pet-Friendly / Dog-Friendly is implicit
  ...['Vet','Pet Boutique','Pet Groomer','Pet Boarding & Daycare','Dog Walker','Pet Training']
    .map((subcategoryName) => ({
      subcategoryName,
      highlightLabels: ['Pet-Friendly'],
      reason: 'Implicit — pet services category',
    })),

  // Family/Kids-related subcategories — Family-Friendly / Kid-Friendly implicit
  ...['Soft Play',"Kids' Class & Activity",'Party Venue',"Children's Hairdresser",
      'Family Photo Studio',"Toy & Kids' Boutique",'Tutoring']
    .map((subcategoryName) => ({
      subcategoryName,
      highlightLabels: ['Family-Friendly'],
      reason: 'Implicit — family/kids category',
    })),

  // Wheelchair Accessible promoted to Detail for Aesthetics Clinic + Day Spa
  ...['Aesthetics Clinic','Day Spa']
    .map((subcategoryName) => ({
      subcategoryName,
      highlightLabels: ['Wheelchair Accessible'],
      reason: 'Detail-level facet for these formats; promote to Detail tag',
    })),

  // Bars are expected to be Open Late by baseline; show only when meaningfully later than normal
  ...['Bar','Pub & Gastropub']
    .map((subcategoryName) => ({
      subcategoryName,
      highlightLabels: ['Open Late'],
      reason: 'Bars open late by baseline; show only when meaningfully later than typical (admin-verified)',
    })),
]
```

- [ ] **Step 2: Commit**

```bash
git add prisma/seed-data/redundantHighlights.ts
git commit -m "data: add RedundantHighlight rules"
```

---

### Task 10: Rewrite the seed script

**Files:**
- Modify: `prisma/seed.ts` — replace the existing category seeding block (lines 60–115 approx) with the new orchestration

- [ ] **Step 1: Read the existing seed structure**

Read `prisma/seed.ts` end-to-end to understand the current flow (subscription plans, categories, RMV templates, merchants, etc.). The new flow will replace the categories-and-tags portion only; the merchant/subscription/voucher seeds keep their structure but reference the new categories by name.

- [ ] **Step 2: Replace the category/tag seeding block**

In `prisma/seed.ts`, replace the existing categories block (the `await prisma.category.upsert({...})` calls around lines 60–115) with this orchestrator. The seed should be idempotent (safe to re-run) AND must safely migrate from the previous 6+5 taxonomy without leaving orphaned rows:

```ts
import { TOP_LEVEL_CATEGORIES, SUBCATEGORIES } from './seed-data/categories'
import { ALL_TAGS, CUISINE_TAGS } from './seed-data/tags'
import { SPECIALTY_PARENT, FOOD_DRINK_SUBCATS_FOR_CUISINE, PRIMARY_CUISINE_SUBCATEGORIES } from './seed-data/subcategoryTags'
import { REDUNDANT_HIGHLIGHTS } from './seed-data/redundantHighlights'

// ── Migration step: rename old top-levels in place (preserves Category IDs ──
//    so existing RmvTemplate and MerchantCategory FK rows stay valid) ─────────
await prisma.category.updateMany({ where: { name: 'Retail & Shopping' },     data: { name: 'Shopping' } })
await prisma.category.updateMany({ where: { name: 'Entertainment' },         data: { name: 'Out & About' } })
await prisma.category.updateMany({ where: { name: 'Professional Services' }, data: { name: 'Home & Local Services' } })

// ── Migration step: delete legacy 5 sample subcategories ─────────────────────
//    None of these names match the new 89; if left in place they would collide
//    with the integrity test (§Group 5). MerchantCategory rows pointing at
//    them are absent in the existing seed (test merchants link only to
//    top-levels). Cascade is safe.
await prisma.category.deleteMany({
  where: {
    name: { in: ['Restaurants', 'Cafes & Coffee', 'Bars & Pubs', 'Hair Salons', 'Nail & Beauty'] },
    parentId: { not: null },
  },
})

// ── Top-level Categories (11) ──
const topLevelByName = new Map<string, string>()  // name → id
for (const cat of TOP_LEVEL_CATEGORIES) {
  const row = await prisma.category.upsert({
    where: { name: cat.name },
    update: { sortOrder: cat.sortOrder, pinColour: cat.pinColour, pinIcon: cat.pinIcon, isActive: true, parentId: null },
    create: { name: cat.name, sortOrder: cat.sortOrder, pinColour: cat.pinColour, pinIcon: cat.pinIcon, isActive: true },
  })
  topLevelByName.set(cat.name, row.id)
}

// ── Subcategories (89) ──
const subcatByName = new Map<string, string>()
for (const sub of SUBCATEGORIES) {
  const parentId = topLevelByName.get(sub.parent)!
  const row = await prisma.category.upsert({
    where: { name: sub.name },
    update: {
      parentId, sortOrder: sub.sortOrder, isActive: true,
      descriptorState: sub.descriptorState,
      descriptorSuffix: sub.descriptorSuffix ?? null,
    },
    create: {
      name: sub.name, parentId, sortOrder: sub.sortOrder, isActive: true,
      descriptorState: sub.descriptorState,
      descriptorSuffix: sub.descriptorSuffix ?? null,
    },
  })
  subcatByName.set(sub.name, row.id)
}

// ── Tags ──
const tagByLabelType = new Map<string, string>()  // `${label}|${type}` → id
for (const t of ALL_TAGS) {
  const row = await prisma.tag.upsert({
    where: { label_type: { label: t.label, type: t.type } },
    update: { descriptorEligible: t.descriptorEligible, isActive: true, createdBy: 'SYSTEM' },
    create: { label: t.label, type: t.type, descriptorEligible: t.descriptorEligible, isActive: true, createdBy: 'SYSTEM' },
  })
  tagByLabelType.set(`${t.label}|${t.type}`, row.id)
}

// ── SubcategoryTag joins ──
const subcategoryTagInserts: { subcategoryId: string; tagId: string; isPrimaryEligible: boolean }[] = []

// Cuisine → Food & Drink subcategories
for (const cuisine of CUISINE_TAGS) {
  const tagId = tagByLabelType.get(`${cuisine.label}|CUISINE`)!
  for (const subName of FOOD_DRINK_SUBCATS_FOR_CUISINE) {
    const subId = subcatByName.get(subName)!
    subcategoryTagInserts.push({
      subcategoryId: subId,
      tagId,
      isPrimaryEligible: PRIMARY_CUISINE_SUBCATEGORIES.has(subName),
    })
  }
}

// Specialty → all subcategories whose parent matches the specialty's parent
for (const [specialtyLabel, parentName] of Object.entries(SPECIALTY_PARENT)) {
  const tagId = tagByLabelType.get(`${specialtyLabel}|SPECIALTY`)!
  const subcatsUnderParent = SUBCATEGORIES.filter(s => s.parent === parentName)
  for (const sub of subcatsUnderParent) {
    const subId = subcatByName.get(sub.name)!
    subcategoryTagInserts.push({ subcategoryId: subId, tagId, isPrimaryEligible: false })
  }
}

// Highlights & Details → universal: every subcategory
const universalTagIds = ALL_TAGS
  .filter(t => t.type === 'HIGHLIGHT' || t.type === 'DETAIL')
  .map(t => tagByLabelType.get(`${t.label}|${t.type}`)!)

for (const sub of SUBCATEGORIES) {
  const subId = subcatByName.get(sub.name)!
  for (const tagId of universalTagIds) {
    subcategoryTagInserts.push({ subcategoryId: subId, tagId, isPrimaryEligible: false })
  }
}

// Bulk insert SubcategoryTag rows (idempotent via skipDuplicates)
await prisma.subcategoryTag.createMany({
  data: subcategoryTagInserts,
  skipDuplicates: true,
})

// ── RedundantHighlight rules ──
for (const rule of REDUNDANT_HIGHLIGHTS) {
  const subId = subcatByName.get(rule.subcategoryName)
  if (!subId) continue
  for (const highlightLabel of rule.highlightLabels) {
    const highlightId = tagByLabelType.get(`${highlightLabel}|HIGHLIGHT`)
    if (!highlightId) continue
    await prisma.redundantHighlight.upsert({
      where: { subcategoryId_highlightTagId: { subcategoryId: subId, highlightTagId: highlightId } },
      update: { reason: rule.reason },
      create: { subcategoryId: subId, highlightTagId: highlightId, reason: rule.reason },
    })
  }
}

console.log(`Seeded ${TOP_LEVEL_CATEGORIES.length} top-level + ${SUBCATEGORIES.length} subcategories, ${ALL_TAGS.length} tags, ${subcategoryTagInserts.length} subcategoryTag links, ${REDUNDANT_HIGHLIGHTS.length} redundant-highlight rules`)
```

- [ ] **Step 3: Reconcile the existing RmvTemplate seeding**

The existing seed creates RmvTemplates against the old 6 categories. The new 11 top-levels keep the same 6 names plus 5 new — verify the existing RmvTemplate code still resolves the `foodCat`, `beautyCat`, `fitnessCat`, `retailCat`, `entertainCat`, `servicesCat` references via the new names:

| Old reference | New top-level name | Matches? |
|---|---|---|
| `foodCat` (Food & Drink) | Food & Drink | Yes |
| `beautyCat` (Beauty & Wellness) | Beauty & Wellness | Yes |
| `Health & Fitness` | Health & Fitness | Yes |
| `Retail & Shopping` | **Shopping** | **NO — rename needed** |
| `Entertainment` | **Out & About** | **NO — rename needed** |
| `Professional Services` | **Home & Local Services** | **NO — rename needed** |

Update the existing RmvTemplate fetch block to look up the new names. If the existing code does `findMany({ where: { name: { in: [...] } } })`, swap the strings.

- [ ] **Step 4: Run the seed**

```bash
npx prisma db seed
```

Expected output: console logs confirming counts: 11 top-level + 89 subcategories, ~250 tags, ~XXXX subcategoryTag links, ~14 redundant-highlight rules.

- [ ] **Step 5: Manually verify with Prisma Studio (optional but recommended)**

```bash
npx prisma studio
```

Verify a sample: open `Category` → confirm 11 top-levels with correct sortOrder; click into Food & Drink → confirm 8 children. Open `Tag` → confirm `type` field has cuisine/specialty/highlight/detail values.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): wire 11-category 89-subcategory taxonomy + tag system

Replaces the partial 6+5 seed with the full locked taxonomy from
the design spec. Idempotent (safe to re-run). Updates RmvTemplate
references to the renamed top-level categories (Shopping,
Out & About, Home & Local Services).
"
```

---

### Task 11: Backfill test merchants — rename references, link to subcategories, add descriptors and highlights

**Files:**
- Modify: `prisma/seed.ts` — the Doha merchant seeding block (around line 332+)

The existing seed links each merchant to a **top-level** category via `Merchant.primaryCategoryId`. For the descriptor system to render usefully (`"Italian Restaurant"` not `"Italian Food & Drink"`), merchants must link at the **subcategory** level. This task does the rename AND the upgrade in one pass.

- [ ] **Step 1: Update merchant category references — rename old top-level names**

In the Doha merchant seed block, update these references:

- `'Retail & Shopping'` → `'Shopping'`
- `'Entertainment'` → `'Out & About'`
- `'Professional Services'` → `'Home & Local Services'`

Grep first to find all occurrences:
```bash
grep -n "'Retail & Shopping'\|'Entertainment'\|'Professional Services'" prisma/seed.ts
```

Replace each match.

- [ ] **Step 2: Migrate `Merchant.primaryCategoryId` to point at the subcategory**

For each Doha merchant in the existing seed block, change the `categoryId: foodCat.id` (top-level) to a subcategory id. Pick the most appropriate subcategory per merchant. Suggested mapping based on the existing Doha merchant descriptions:

| Merchant | New primary subcategory |
|---|---|
| Doha Diwan (traditional Qatari) | Restaurant |
| The Pearl Roastery | Cafe & Coffee |
| Spice Route (Indian) | Restaurant |
| Sakura Japanese Kitchen | Restaurant |
| West Bay Steakhouse | Restaurant |
| The Brunch Society | Cafe & Coffee |
| Bloom Beauty Lounge | Beauty Salon |
| (any Health & Fitness merchant) | Gym |
| (any Retail/Shopping merchant) | Fashion Boutique |
| (any Entertainment merchant) | Cinema |
| (any Professional Services merchant) | Cleaner |

Resolve each subcategory id via:
```ts
const restaurantSubcat = await prisma.category.findFirst({ where: { name: 'Restaurant' } })
// ... etc per subcategory needed
```

Then in the merchant `create` block, set `primaryCategoryId` to the subcategory id. Also keep the `MerchantCategory` join row pointing at the same subcategory.

- [ ] **Step 3: Add `primaryDescriptorTagId` to each test merchant**

For each Food & Drink merchant, attach a primary cuisine descriptor:

| Merchant | primaryDescriptorTag |
|---|---|
| Doha Diwan | Persian *(approximation for Qatari) — or keep null* |
| The Pearl Roastery | Specialty Coffee |
| Spice Route | Indian |
| Sakura Japanese Kitchen | Japanese |
| West Bay Steakhouse | Steakhouse |
| The Brunch Society | Brunch |
| Bloom Beauty Lounge | (null — Hair Salon doesn't need a descriptor by default) |

Resolve tag ids in the same pattern:
```ts
const indianTag = await prisma.tag.findFirst({ where: { label: 'Indian', type: 'CUISINE' } })
```

Set `primaryDescriptorTagId: indianTag.id` in the merchant create or via a follow-up update.

- [ ] **Step 4: Add 1–3 sample highlights per test merchant**

For at least three test merchants, add `MerchantHighlight` rows so the API tests in Group 5 have real data to assert against. Pick highlights consistent with the merchant character:

```ts
const independentTag  = await prisma.tag.findFirst({ where: { label: 'Independent',     type: 'HIGHLIGHT' } })
const womenOwnedTag   = await prisma.tag.findFirst({ where: { label: 'Women-Owned',     type: 'HIGHLIGHT' } })
const halalTag        = await prisma.tag.findFirst({ where: { label: 'Halal',           type: 'HIGHLIGHT' } })
const dateNightTag    = await prisma.tag.findFirst({ where: { label: 'Date Night',      type: 'HIGHLIGHT' } })

await prisma.merchantHighlight.createMany({
  data: [
    { merchantId: spiceRoute.id,          highlightTagId: halalTag!.id,     sortOrder: 0 },
    { merchantId: spiceRoute.id,          highlightTagId: dateNightTag!.id, sortOrder: 1 },
    { merchantId: spiceRoute.id,          highlightTagId: independentTag!.id, sortOrder: 2 },
    { merchantId: bloomBeautyLounge.id,   highlightTagId: womenOwnedTag!.id, sortOrder: 0 },
    { merchantId: bloomBeautyLounge.id,   highlightTagId: independentTag!.id, sortOrder: 1 },
    // … etc
  ],
  skipDuplicates: true,
})
```

(Note: the 3-cap trigger applies — three is the max per merchant.)

- [ ] **Step 5: Re-run the seed end-to-end**

```bash
npx prisma db seed
```

Expected: completes without errors. Test merchants now have subcategory-level primaryCategoryId, primaryDescriptorTagId, and 1–3 highlights each.

- [ ] **Step 6: Manually verify a sample (recommended)**

```bash
npx prisma studio
```

Open `Merchant` → find Spice Route → confirm `primaryCategoryId` points at Restaurant (not Food & Drink), `primaryDescriptorTagId` points at Indian, and `MerchantHighlight` has 3 rows.

- [ ] **Step 7: Commit**

```bash
git add prisma/seed.ts
git commit -m "fix(seed): migrate test merchants to subcategory + descriptor + highlights

Renames legacy top-level category references, links each test merchant
to a subcategory (not the top-level), populates primaryDescriptorTagId
where appropriate, and seeds 1–3 highlights per merchant so API
response tests have real data to assert against.
"
```

---

## Group 3 — Merchant count denormalisation & helpers

### Task 12: Implement scope resolution helper

**Files:**
- Create: `src/api/lib/scope.ts`
- Create: `tests/api/lib/scope.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/lib/scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveScope } from '../../../src/api/lib/scope'

describe('resolveScope', () => {
  it('returns nearby when lat/lng present and scope=nearby', () => {
    const r = resolveScope({ scope: 'nearby', lat: 51.5, lng: -0.1, profileCity: 'London' })
    expect(r).toEqual({ scope: 'nearby', resolvedArea: 'Nearby', radiusMiles: 2 })
  })

  it('returns city when scope=city', () => {
    const r = resolveScope({ scope: 'city', lat: 51.5, lng: -0.1, profileCity: 'London' })
    expect(r.scope).toBe('city')
    expect(r.resolvedArea).toBe('London')
  })

  it('returns platform when scope=platform', () => {
    const r = resolveScope({ scope: 'platform', lat: null, lng: null, profileCity: null })
    expect(r).toEqual({ scope: 'platform', resolvedArea: 'United Kingdom', radiusMiles: null })
  })

  it('falls back to city when no location and profileCity present', () => {
    const r = resolveScope({ scope: 'nearby', lat: null, lng: null, profileCity: 'Manchester' })
    expect(r.scope).toBe('city')
    expect(r.resolvedArea).toBe('Manchester')
  })

  it('falls back to platform when no location and no profileCity', () => {
    const r = resolveScope({ scope: 'nearby', lat: null, lng: null, profileCity: null })
    expect(r.scope).toBe('platform')
  })
})
```

- [ ] **Step 2: Run the failing test**

```bash
npx vitest run tests/api/lib/scope.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/api/lib/scope.ts`:

```ts
export type Scope = 'nearby' | 'city' | 'region' | 'platform'

export type ResolveScopeInput = {
  scope?: Scope | undefined
  lat: number | null
  lng: number | null
  profileCity: string | null
}

export type ResolvedScope = {
  scope: Scope
  resolvedArea: string
  radiusMiles: number | null   // null for region/platform
}

const NEARBY_RADIUS_MILES = 2
const REGION_RADIUS_MILES = 25

export function resolveScope(input: ResolveScopeInput): ResolvedScope {
  const requested = input.scope ?? 'nearby'

  // No location available: fall back per spec §4.6
  if (input.lat == null || input.lng == null) {
    if (input.profileCity) {
      return { scope: 'city', resolvedArea: input.profileCity, radiusMiles: null }
    }
    return { scope: 'platform', resolvedArea: 'United Kingdom', radiusMiles: null }
  }

  switch (requested) {
    case 'nearby':
      return { scope: 'nearby', resolvedArea: 'Nearby', radiusMiles: NEARBY_RADIUS_MILES }
    case 'city':
      return { scope: 'city', resolvedArea: input.profileCity ?? 'Your city', radiusMiles: null }
    case 'region':
      return { scope: 'region', resolvedArea: 'Wider area', radiusMiles: REGION_RADIUS_MILES }
    case 'platform':
      return { scope: 'platform', resolvedArea: 'United Kingdom', radiusMiles: null }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/lib/scope.test.ts
```

Expected: PASS — 5 cases.

- [ ] **Step 5: Commit**

```bash
git add src/api/lib/scope.ts tests/api/lib/scope.test.ts
git commit -m "feat(api): scope resolution helper for fallback ladder"
```

---

### Task 13: Implement tile descriptor + highlights helper

**Files:**
- Create: `src/api/lib/tile.ts`
- Create: `tests/api/lib/tile.test.ts`

- [ ] **Step 1: Write failing tests covering all spec rules**

Create `tests/api/lib/tile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildDescriptor } from '../../../src/api/lib/tile'

describe('buildDescriptor', () => {
  it('renders tag + suffix when both present', () => {
    expect(buildDescriptor('Italian', 'Restaurant')).toBe('Italian Restaurant')
  })

  it('renders subcategory.descriptorSuffix when no tag', () => {
    expect(buildDescriptor(null, 'Restaurant')).toBe('Restaurant')
  })

  it('drops suffix when tag label already contains it (de-dup forward)', () => {
    // "Cookery Class" tag, "Class & Workshop" suffix → "Cookery Class"
    expect(buildDescriptor('Cookery Class', 'Class & Workshop')).toBe('Cookery Class')
  })

  it('drops tag when suffix already contains it (de-dup reverse)', () => {
    // "Boutique" tag, "Boutique Hotel" suffix → "Boutique Hotel"
    expect(buildDescriptor('Boutique', 'Boutique Hotel')).toBe('Boutique Hotel')
  })

  it('is case-insensitive in de-dup', () => {
    expect(buildDescriptor('boutique', 'Boutique Hotel')).toBe('Boutique Hotel')
    expect(buildDescriptor('BOUTIQUE', 'boutique hotel')).toBe('boutique hotel')
  })

  it('returns subcategory name when both inputs null/empty', () => {
    expect(buildDescriptor(null, 'Vet')).toBe('Vet')
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/api/lib/tile.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/api/lib/tile.ts`:

```ts
/**
 * Spec §3.6 — descriptor construction with de-duplication rule.
 *
 * Pattern: `{tagLabel} {subcategoryDescriptorSuffix}`
 * De-dup rule: if either string (lowercased) contains the other,
 * render the longer one alone. Prevents:
 *   - "Boutique Boutique Hotel" (tag = "Boutique", suffix = "Boutique Hotel")
 *   - "Cookery Class Class & Workshop" (tag = "Cookery Class", suffix = "Class & Workshop")
 */
export function buildDescriptor(
  tagLabel: string | null,
  subcategoryDescriptorSuffix: string,
): string {
  if (!tagLabel) return subcategoryDescriptorSuffix

  const tagLower = tagLabel.toLowerCase()
  const suffixLower = subcategoryDescriptorSuffix.toLowerCase()

  if (suffixLower.includes(tagLower)) return subcategoryDescriptorSuffix
  if (tagLower.includes(suffixLower)) return tagLabel

  return `${tagLabel} ${subcategoryDescriptorSuffix}`
}

/**
 * Returns the descriptor suffix for a subcategory.
 * Falls back to the subcategory name when no override is set.
 */
export function descriptorSuffixFor(subcategory: { name: string; descriptorSuffix: string | null }): string {
  return subcategory.descriptorSuffix ?? subcategory.name
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run tests/api/lib/tile.test.ts
```

Expected: PASS — 6 cases.

- [ ] **Step 5: Commit**

```bash
git add src/api/lib/tile.ts tests/api/lib/tile.test.ts
git commit -m "feat(api): descriptor construction with de-dup rule (spec §3.6)"
```

---

### Task 14: Implement merchantCount denormalisation helper

**Files:**
- Create: `src/api/lib/merchantCount.ts`
- Create: `tests/api/lib/merchantCount.test.ts`

- [ ] **Step 1: Determine the city resolver strategy**

City for a merchant is derived from its main branch (`Branch.isMainBranch === true`). Schema confirms `Branch.city: String` is set during onboarding (e.g. "Shoreditch", "Manchester"). Use it directly as the city key — no geocoding needed for Plan 1.

- [ ] **Step 2: Write failing test**

Create `tests/api/lib/merchantCount.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { recomputeCategoryCounts, recomputeTagCounts } from '../../../src/api/lib/merchantCount'

// Use the existing test prisma instance (shared via beforeAll in tests/setup.ts or similar)
const prisma = new PrismaClient()

describe('recomputeCategoryCounts', () => {
  it('updates Category.merchantCountByCity with current merchant counts per city', async () => {
    // Fetch existing seeded merchant + category sample (Doha test data has merchants in Food & Drink)
    const foodCat = await prisma.category.findFirst({ where: { name: 'Food & Drink', parentId: null } })
    expect(foodCat).not.toBeNull()

    await recomputeCategoryCounts(prisma)

    const updated = await prisma.category.findUnique({ where: { id: foodCat!.id } })
    expect(updated!.merchantCountByCity).toBeTypeOf('object')
    // The exact city keys depend on seed data — assert structure only
    const counts = updated!.merchantCountByCity as Record<string, number>
    for (const [city, n] of Object.entries(counts)) {
      expect(typeof city).toBe('string')
      expect(typeof n).toBe('number')
      expect(n).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('recomputeTagCounts', () => {
  it('updates Tag.merchantCountByCity for tags that have merchant assignments', async () => {
    await recomputeTagCounts(prisma)

    const sampleTag = await prisma.tag.findFirst({ where: { type: 'CUISINE' } })
    expect(sampleTag).not.toBeNull()
    expect(typeof sampleTag!.merchantCountByCity).toBe('object')
  })
})
```

- [ ] **Step 3: Run test (should fail — module not found)**

```bash
npx vitest run tests/api/lib/merchantCount.test.ts
```

Expected: FAIL — module `../../../src/api/lib/merchantCount` not found.

- [ ] **Step 4: Write implementation**

Create `src/api/lib/merchantCount.ts`:

```ts
import type { PrismaClient } from '../../generated/prisma/client'

/**
 * Returns a city key for a merchant, derived from its main branch.
 * Branch.city is a non-null string set during merchant onboarding.
 */
function cityFor(branch: { city: string } | null): string | null {
  return branch?.city ?? null
}

/**
 * Recomputes Category.merchantCountByCity for all categories.
 * Called nightly; also invalidated on merchant create/suspend/category-change.
 */
export async function recomputeCategoryCounts(prisma: PrismaClient): Promise<void> {
  const categories = await prisma.category.findMany({ select: { id: true } })

  for (const cat of categories) {
    // Count merchants per city for this category
    const merchants = await prisma.merchant.findMany({
      where: {
        OR: [
          { primaryCategoryId: cat.id },
          { categories: { some: { categoryId: cat.id } } },
        ],
        status: 'ACTIVE',
      },
      include: {
        branches: { where: { isMainBranch: true }, select: { city: true } },
      },
    })

    const countByCity: Record<string, number> = {}
    for (const m of merchants) {
      const city = cityFor(m.branches[0] ?? null)
      if (!city) continue
      countByCity[city] = (countByCity[city] ?? 0) + 1
    }

    await prisma.category.update({
      where: { id: cat.id },
      data: { merchantCountByCity: countByCity },
    })
  }
}

/**
 * Recomputes Tag.merchantCountByCity for all tags.
 */
export async function recomputeTagCounts(prisma: PrismaClient): Promise<void> {
  const tags = await prisma.tag.findMany({ select: { id: true } })

  for (const tag of tags) {
    // Tag is carried via either MerchantTag or MerchantHighlight or Merchant.primaryDescriptorTagId
    const merchants = await prisma.merchant.findMany({
      where: {
        OR: [
          { primaryDescriptorTagId: tag.id },
          { tags: { some: { tagId: tag.id } } },
          { highlights: { some: { highlightTagId: tag.id } } },
        ],
        status: 'ACTIVE',
      },
      include: {
        branches: { where: { isMainBranch: true }, select: { city: true } },
      },
    })

    const countByCity: Record<string, number> = {}
    for (const m of merchants) {
      const city = cityFor(m.branches[0] ?? null)
      if (!city) continue
      countByCity[city] = (countByCity[city] ?? 0) + 1
    }

    await prisma.tag.update({
      where: { id: tag.id },
      data: { merchantCountByCity: countByCity },
    })
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npx vitest run tests/api/lib/merchantCount.test.ts
```

Expected: PASS — 2 cases.

- [ ] **Step 6: Commit**

```bash
git add src/api/lib/merchantCount.ts tests/api/lib/merchantCount.test.ts
git commit -m "feat(api): merchantCount denormalisation helper

Recomputes Category.merchantCountByCity and Tag.merchantCountByCity
keyed on Branch.city for the merchant's main branch (isMainBranch).
"
```

---

### Task 15: Hook merchantCount recompute into seed

**Files:**
- Modify: `prisma/seed.ts` — append a final block

- [ ] **Step 1: Add the recompute call after merchant seeding**

At the end of `prisma/seed.ts`, after all merchants are created:

```ts
// ── Backfill denormalised merchant counts ──
const { recomputeCategoryCounts, recomputeTagCounts } = await import('../src/api/lib/merchantCount')
await recomputeCategoryCounts(prisma)
await recomputeTagCounts(prisma)
console.log('Recomputed merchantCountByCity for categories and tags')
```

- [ ] **Step 2: Re-run seed**

```bash
npx prisma db seed
```

Expected: completes with logged counts. Open Prisma Studio and verify a category has populated `merchantCountByCity` JSON.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): backfill merchantCountByCity during seed"
```

---

## Group 4 — Discovery API extensions

### Task 16: Extend `/search` query schema with `tagIds` and `scope`

**Files:**
- Modify: `src/api/customer/discovery/routes.ts:15-36` (the `searchQuery` schema)

- [ ] **Step 1: Add `tagIds` and `scope` to the schema**

Update the `searchQuery` zod object in `src/api/customer/discovery/routes.ts` to include the new params. After the existing `amenityIds` line:

```ts
  amenityIds:      z.string().optional().transform(v => v ? v.split(',') : undefined),
  tagIds:          z.string().optional().transform(v => v ? v.split(',') : undefined),
  scope:           z.enum(['nearby','city','region','platform']).optional(),
```

- [ ] **Step 2: Pass through to the service**

Locate the `app.get('/api/v1/customer/search'...)` route handler. Pass `tagIds` and `scope` to `searchMerchants(...)`. (The handler structure is visible at lines 81+; the change is one or two new property forwarding lines into the existing call.)

- [ ] **Step 3: Commit**

```bash
git add src/api/customer/discovery/routes.ts
git commit -m "feat(discovery): add tagIds and scope params to /search schema"
```

---

### Task 17: Extend `searchMerchants` service to filter by tag IDs

**Files:**
- Modify: `src/api/customer/discovery/service.ts` — the `searchMerchants` function (around line 600+)

- [ ] **Step 1: Read the existing `searchMerchants` shape**

In `src/api/customer/discovery/service.ts`, find the `searchMerchants` function. Identify where the `where` clause is built. Note where existing `amenityIds`, `voucherTypes`, `categoryId`, `subcategoryId` filters apply.

- [ ] **Step 2: Add tagIds clause**

Where the `where` object is constructed, add a clause when `tagIds` is provided:

```ts
if (tagIds && tagIds.length > 0) {
  where.AND = [
    ...(where.AND ?? []),
    {
      OR: [
        { tags: { some: { tagId: { in: tagIds } } } },
        { highlights: { some: { highlightTagId: { in: tagIds } } } },
        { primaryDescriptorTagId: { in: tagIds } },
      ],
    },
  ]
}
```

This matches merchants carrying ANY of the requested tags via any of the three pathways (curated MerchantTag, MerchantHighlight, or primary descriptor).

- [ ] **Step 3: Add scope-based location filter**

Use the new `resolveScope` helper. If `scope === 'nearby'` and lat/lng available, the existing radius filter applies. If `scope === 'city'`, filter by `branches.city === profileCity` (where the user is). If `scope === 'platform'`, no location filter.

```ts
import { resolveScope } from '../../lib/scope'

// inside searchMerchants, after parsing inputs:
const profileCity = await resolveProfileCity(prisma, userId)  // helper below
const resolved = resolveScope({ scope, lat, lng, profileCity })

if (resolved.scope === 'city' && profileCity) {
  where.branches = {
    some: { city: profileCity, isMainBranch: true },
  }
}
// nearby uses existing radius logic; platform uses no location clause
```

Where `resolveProfileCity` is a small helper (place it in `src/api/lib/scope.ts` for reuse):

```ts
import type { PrismaClient } from '../../generated/prisma/client'

export async function resolveProfileCity(
  prisma: PrismaClient,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { city: true },
  })
  return user?.city ?? null
}
```

(`User.city` is a nullable `String?` per `prisma/schema.prisma` line 112 — verified.)

- [ ] **Step 4: Return the meta envelope**

Wrap the result of `searchMerchants`:

```ts
return {
  results: <existing merchants array>,
  meta: {
    scope: resolved.scope,
    resolvedArea: resolved.resolvedArea,
    scopeExpanded: scope != null && scope !== 'nearby',
    chipsHidden: false,  // not relevant for /search; always false here
  },
}
```

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/service.ts
git commit -m "feat(discovery): tagIds filter + scope expansion meta envelope on /search"
```

---

### Task 18: Make `/category` endpoint supply-aware

**Files:**
- Modify: `src/api/customer/discovery/service.ts` — the `listActiveCategories` function

- [ ] **Step 1: Read the current implementation**

Find `listActiveCategories` in the service file. It currently returns top-level categories with their basic shape.

- [ ] **Step 2: Extend to include subcategory supply-awareness per scope**

Update `listActiveCategories` to accept a scope:

```ts
import { resolveScope } from '../../lib/scope'

export async function listActiveCategories(
  prisma: PrismaClient,
  options?: { scope?: Scope; lat?: number | null; lng?: number | null; userId?: string | null },
) {
  const profileCity = options?.userId ? await resolveProfileCity(prisma, options.userId) : null
  const resolved = resolveScope({
    scope: options?.scope,
    lat: options?.lat ?? null,
    lng: options?.lng ?? null,
    profileCity,
  })

  const cityKey = resolved.scope === 'city' || resolved.scope === 'nearby' ? (profileCity ?? '') : null

  const topLevels = await prisma.category.findMany({
    where: { parentId: null, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, name: true, iconUrl: true, illustrationUrl: true, sortOrder: true,
      pinColour: true, pinIcon: true, merchantCountByCity: true,
      children: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, name: true, sortOrder: true, descriptorState: true,
          descriptorSuffix: true, merchantCountByCity: true,
        },
      },
    },
  })

  // Filter children by supply (if cityKey known)
  return topLevels.map((cat) => {
    const subcats = cityKey
      ? cat.children.filter((s) => {
          const counts = (s.merchantCountByCity as Record<string, number>) ?? {}
          return (counts[cityKey] ?? 0) > 0
        })
      : cat.children  // no city resolution → show all children

    const minChips = 3  // Spec §4.5 default
    const chipsHidden = subcats.length > 0 && subcats.length < minChips

    return {
      ...cat,
      children: subcats,
      chipsHidden,
    }
  })
}
```

- [ ] **Step 3: Update the route handler**

In `src/api/customer/discovery/routes.ts`, pass scope/lat/lng/userId to `listActiveCategories`:

```ts
app.get('/api/v1/customer/categories', async (req, reply) => {
  const { scope, lat, lng } = z.object({
    scope: z.enum(['nearby','city','region','platform']).optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
  }).parse(req.query)
  const userId = optionalUserId(req)
  const categories = await listActiveCategories(app.prisma, { scope, lat, lng, userId })
  return reply.send({ categories })
})
```

- [ ] **Step 4: Commit**

```bash
git add src/api/customer/discovery/service.ts src/api/customer/discovery/routes.ts
git commit -m "feat(discovery): supply-aware /category response with chip density flag"
```

---

### Task 19: Add `getCategoryMerchants` endpoint with meta envelope

**Files:**
- Modify: `src/api/customer/discovery/service.ts` — add the new function
- Modify: `src/api/customer/discovery/routes.ts` — register the route

- [ ] **Step 1: Add the service function**

In `src/api/customer/discovery/service.ts`, add:

```ts
export async function getCategoryMerchants(
  prisma: PrismaClient,
  categoryId: string,
  options: { scope?: Scope; lat?: number | null; lng?: number | null; userId?: string | null; limit: number; offset: number },
) {
  const profileCity = options.userId ? await resolveProfileCity(prisma, options.userId) : null
  const resolved = resolveScope({
    scope: options.scope,
    lat: options.lat ?? null,
    lng: options.lng ?? null,
    profileCity,
  })

  const where: any = {
    OR: [
      { primaryCategoryId: categoryId },
      { categories: { some: { categoryId } } },
    ],
    status: 'ACTIVE',
  }

  if (resolved.scope === 'city' && profileCity) {
    where.branches = { some: { city: profileCity, isMainBranch: true } }
  }
  // nearby + radius logic uses existing helpers (mirror searchMerchants)
  // platform: no location filter

  const merchants = await prisma.merchant.findMany({
    where,
    take: options.limit,
    skip: options.offset,
    // Include the same select shape used by searchMerchants for consistency
    include: {
      primaryCategory: { select: { id: true, name: true, descriptorSuffix: true } },
      primaryDescriptorTag: { select: { id: true, label: true } },
      highlights: { include: { tag: { select: { id: true, label: true } } }, orderBy: { sortOrder: 'asc' }, take: 3 },
      branches: { where: { isMainBranch: true }, select: { id: true, city: true, latitude: true, longitude: true } },
    },
  })

  // Determine chipsHidden by counting subcategories with merchants in scope
  const cityKey = resolved.scope === 'city' || resolved.scope === 'nearby' ? (profileCity ?? '') : null
  const subcats = await prisma.category.findMany({
    where: { parentId: categoryId, isActive: true },
    select: { id: true, merchantCountByCity: true },
  })
  const subcatsWithSupply = cityKey
    ? subcats.filter((s) => ((s.merchantCountByCity as Record<string, number>) ?? {})[cityKey] > 0)
    : subcats
  const chipsHidden = subcatsWithSupply.length < 3

  return {
    results: merchants,
    meta: {
      scope: resolved.scope,
      resolvedArea: resolved.resolvedArea,
      scopeExpanded: options.scope != null && options.scope !== 'nearby',
      chipsHidden,
    },
  }
}
```

- [ ] **Step 2: Register the route**

In `src/api/customer/discovery/routes.ts`, add:

```ts
app.get('/api/v1/customer/categories/:id/merchants', async (req, reply) => {
  const { id } = idParam.parse(req.params)
  const { scope, lat, lng, limit, offset } = z.object({
    scope: z.enum(['nearby','city','region','platform']).optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query)
  const userId = optionalUserId(req)
  const result = await getCategoryMerchants(app.prisma, id, { scope, lat, lng, userId, limit, offset })
  return reply.send(result)
})
```

- [ ] **Step 3: Commit**

```bash
git add src/api/customer/discovery/service.ts src/api/customer/discovery/routes.ts
git commit -m "feat(discovery): add /category/:id/merchants endpoint with scope meta"
```

---

### Task 20: Include descriptor + highlights in customer merchant responses

**Files:**
- Modify: `src/api/customer/discovery/service.ts` — extend `getCustomerMerchant` and `searchMerchants` shape

- [ ] **Step 1: Extend the Prisma `select` shape**

In `src/api/customer/discovery/service.ts`, locate the shared merchant-tile select shape (used by /home, /search, /category/:id/merchants, /merchants/:id). Add fields needed to construct the descriptor and resolve highlights:

```ts
primaryDescriptorTag: { select: { id: true, label: true } },
primaryCategory: {
  select: { id: true, name: true, descriptorSuffix: true },  // name + override suffix for buildDescriptor
},
highlights: {
  include: { tag: { select: { id: true, label: true } } },
  orderBy: { sortOrder: 'asc' },
  take: 3,
},
```

(`Merchant.primaryCategoryId` points at the merchant's primary subcategory after Task 11; the `primaryCategory` Prisma relation resolves to that subcategory's row.)

- [ ] **Step 2: Add the `filterRedundantHighlights` helper**

Add to `src/api/lib/tile.ts`:

```ts
export function filterRedundantHighlights<T extends { highlightTagId: string }>(
  highlights: T[],
  redundantHighlightTagIds: Set<string>,
): T[] {
  return highlights.filter((h) => !redundantHighlightTagIds.has(h.highlightTagId))
}
```

- [ ] **Step 3: Construct descriptor + filter highlights inside the service response**

The service is the single place that knows the descriptor construction rule (buildDescriptor + de-dup). Clients just render the returned string. Inside `searchMerchants` / `getCategoryMerchants` / `getCustomerMerchant`, after the Prisma fetch, transform each merchant:

```ts
import { buildDescriptor, descriptorSuffixFor, filterRedundantHighlights } from '../../lib/tile'

// Batch-fetch redundancy rules for all primary subcategory ids in this result set
const subcategoryIds = [...new Set(merchants.map((m) => m.primaryCategoryId).filter(Boolean) as string[])]
const redundantRows = subcategoryIds.length === 0 ? [] : await prisma.redundantHighlight.findMany({
  where: { subcategoryId: { in: subcategoryIds } },
  select: { subcategoryId: true, highlightTagId: true },
})
const redundantBySubcat = new Map<string, Set<string>>()
for (const r of redundantRows) {
  if (!redundantBySubcat.has(r.subcategoryId)) redundantBySubcat.set(r.subcategoryId, new Set())
  redundantBySubcat.get(r.subcategoryId)!.add(r.highlightTagId)
}

const transformed = merchants.map((m) => {
  const tagLabel = m.primaryDescriptorTag?.label ?? null
  const suffix = m.primaryCategory ? descriptorSuffixFor(m.primaryCategory) : (m.primaryCategory?.name ?? '')
  const descriptor = m.primaryCategory ? buildDescriptor(tagLabel, suffix) : null

  const redundantSet = m.primaryCategoryId
    ? redundantBySubcat.get(m.primaryCategoryId) ?? new Set<string>()
    : new Set<string>()
  const visibleHighlights = filterRedundantHighlights(m.highlights, redundantSet).slice(0, 3)

  return {
    ...m,
    descriptor,                  // rendered string with de-dup applied (null if no primary subcategory)
    highlights: visibleHighlights,
  }
})
```

Apply the same transform in `getCustomerMerchant` for the merchant-detail response.

- [ ] **Step 4: Commit**

```bash
git add src/api/customer/discovery/service.ts src/api/lib/tile.ts
git commit -m "feat(discovery): construct descriptor + filtered highlights server-side

Adds the rendered descriptor string (with de-dup rule from §3.6
applied) to merchant responses, plus filters highlights through
the RedundantHighlight rule table. Both happen at the service
layer so the API contract carries a fully-resolved tile shape.
"
```

---

## Group 5 — Backend tests

### Task 21: Test seed integrity — counts and structure

**Files:**
- Create: `tests/prisma/taxonomy-seed.test.ts`

- [ ] **Step 1: Write the integrity test**

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'

const prisma = new PrismaClient()

describe('Taxonomy seed integrity', () => {
  it('seeds 11 top-level categories', async () => {
    const count = await prisma.category.count({ where: { parentId: null } })
    expect(count).toBe(11)
  })

  it('seeds exactly the expected top-level names in display order', async () => {
    const cats = await prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      select: { name: true, sortOrder: true },
    })
    expect(cats.map((c) => c.name)).toEqual([
      'Food & Drink','Beauty & Wellness','Health & Fitness','Out & About','Shopping',
      'Home & Local Services','Travel & Hotels','Health & Medical','Family & Kids',
      'Auto & Garage','Pet Services',
    ])
  })

  it('seeds 89 subcategories across all top-levels', async () => {
    const count = await prisma.category.count({ where: { parentId: { not: null } } })
    expect(count).toBe(89)
  })

  it('seeds 32 cuisine tags, all descriptor-eligible', async () => {
    const cuisines = await prisma.tag.findMany({ where: { type: 'CUISINE' } })
    expect(cuisines.length).toBe(32)
    expect(cuisines.every((t) => t.descriptorEligible)).toBe(true)
  })

  it('seeds 18 highlight tags, none descriptor-eligible', async () => {
    const highlights = await prisma.tag.findMany({ where: { type: 'HIGHLIGHT' } })
    expect(highlights.length).toBe(18)
    expect(highlights.every((t) => !t.descriptorEligible)).toBe(true)
  })

  it('Group-Friendly is a Detail tag, not a Highlight', async () => {
    const groupFriendly = await prisma.tag.findFirst({ where: { label: 'Group-Friendly' } })
    expect(groupFriendly?.type).toBe('DETAIL')
  })

  it('seeds RedundantHighlight rule for Vet → Pet-Friendly', async () => {
    const vet = await prisma.category.findFirst({ where: { name: 'Vet' } })
    const petFriendly = await prisma.tag.findFirst({ where: { label: 'Pet-Friendly', type: 'HIGHLIGHT' } })
    const rule = await prisma.redundantHighlight.findUnique({
      where: { subcategoryId_highlightTagId: { subcategoryId: vet!.id, highlightTagId: petFriendly!.id } },
    })
    expect(rule).not.toBeNull()
  })

  it('seeds Cuisine tags with SubcategoryTag links to Restaurant subcategory', async () => {
    const restaurant = await prisma.category.findFirst({ where: { name: 'Restaurant' } })
    const links = await prisma.subcategoryTag.findMany({
      where: { subcategoryId: restaurant!.id, tag: { type: 'CUISINE' } },
    })
    expect(links.length).toBe(32)
    expect(links.every((l) => l.isPrimaryEligible)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test (will fail until seed has run on the test DB)**

```bash
npx prisma db seed
npx vitest run tests/prisma/taxonomy-seed.test.ts
```

Expected: 8 cases PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/prisma/taxonomy-seed.test.ts
git commit -m "test: taxonomy seed integrity (counts + structure + redundancy + joins)"
```

---

### Task 22: Test 3-cap database trigger on MerchantHighlight

**Files:**
- Create: `tests/prisma/merchant-highlight-cap.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'

const prisma = new PrismaClient()

describe('MerchantHighlight 3-cap trigger', () => {
  it('rejects insertion of a 4th highlight for the same merchant', async () => {
    // Pick any seeded merchant
    const merchant = await prisma.merchant.findFirst({ where: { status: 'ACTIVE' } })
    expect(merchant).not.toBeNull()

    const highlights = await prisma.tag.findMany({ where: { type: 'HIGHLIGHT' }, take: 4 })
    expect(highlights.length).toBe(4)

    // Clean any existing highlights for this merchant
    await prisma.merchantHighlight.deleteMany({ where: { merchantId: merchant!.id } })

    // Insert 3 — should succeed
    for (let i = 0; i < 3; i++) {
      await prisma.merchantHighlight.create({
        data: { merchantId: merchant!.id, highlightTagId: highlights[i].id, sortOrder: i },
      })
    }

    // Insert 4th — should throw
    await expect(prisma.merchantHighlight.create({
      data: { merchantId: merchant!.id, highlightTagId: highlights[3].id, sortOrder: 3 },
    })).rejects.toThrow(/merchant_highlight_cap_exceeded/)

    // Cleanup
    await prisma.merchantHighlight.deleteMany({ where: { merchantId: merchant!.id } })
  })
})
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/prisma/merchant-highlight-cap.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/prisma/merchant-highlight-cap.test.ts
git commit -m "test: MerchantHighlight 3-cap database trigger"
```

---

### Task 23: Route-level tests for /search (mocked service, matches existing convention)

**Files:**
- Modify: `tests/api/customer/discovery.routes.test.ts` — add cases that the route correctly forwards new query params to the service and returns the meta envelope unchanged.

The existing file already does `vi.mock('../../../src/api/customer/discovery/service', ...)` at module level. We extend that pattern.

- [ ] **Step 1: Add test cases for query-param forwarding**

Append to the existing route-test file:

```ts
describe('GET /api/v1/customer/search — new query params and meta envelope', () => {
  beforeEach(() => {
    vi.mocked(searchMerchants).mockReset()
  })

  it('forwards tagIds and scope to the service', async () => {
    vi.mocked(searchMerchants).mockResolvedValueOnce({
      results: [],
      meta: { scope: 'nearby', resolvedArea: 'Nearby', scopeExpanded: false, chipsHidden: false },
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?tagIds=t1,t2&scope=city',
    })

    expect(res.statusCode).toBe(200)
    expect(searchMerchants).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tagIds: ['t1', 't2'],
        scope: 'city',
      }),
    )
  })

  it('passes through the meta envelope from the service to the response body', async () => {
    vi.mocked(searchMerchants).mockResolvedValueOnce({
      results: [{ id: 'm1' }],
      meta: { scope: 'platform', resolvedArea: 'United Kingdom', scopeExpanded: true, chipsHidden: false },
    } as any)

    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/search?scope=platform' })
    const body = JSON.parse(res.body)
    expect(body.meta).toEqual({
      scope: 'platform',
      resolvedArea: 'United Kingdom',
      scopeExpanded: true,
      chipsHidden: false,
    })
  })
})
```

- [ ] **Step 2: Add route test for `/categories` (chipsHidden + supply-aware children)**

```ts
describe('GET /api/v1/customer/categories — chipsHidden flag passes through', () => {
  beforeEach(() => {
    vi.mocked(listActiveCategories).mockReset()
  })

  it('returns the categories array with chipsHidden as the service returns it', async () => {
    vi.mocked(listActiveCategories).mockResolvedValueOnce([
      { id: 'c1', name: 'Pet Services', children: [{ id: 's1', name: 'Vet' }], chipsHidden: true } as any,
    ])

    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/categories' })
    const body = JSON.parse(res.body)
    expect(body.categories[0].chipsHidden).toBe(true)
  })
})
```

- [ ] **Step 3: Add route test for `/categories/:id/merchants`**

```ts
describe('GET /api/v1/customer/categories/:id/merchants', () => {
  beforeEach(() => {
    vi.mocked(getCategoryMerchants).mockReset()
  })

  it('forwards path id and scope query to the service', async () => {
    vi.mocked(getCategoryMerchants).mockResolvedValueOnce({
      results: [],
      meta: { scope: 'city', resolvedArea: 'London', scopeExpanded: true, chipsHidden: false },
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/categories/cat-id-1/merchants?scope=city',
    })

    expect(res.statusCode).toBe(200)
    expect(getCategoryMerchants).toHaveBeenCalledWith(
      expect.anything(),
      'cat-id-1',
      expect.objectContaining({ scope: 'city' }),
    )
  })
})
```

(Add `getCategoryMerchants` to the existing `vi.mock(...)` of the discovery service module at the top of the file.)

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/api/customer/discovery.routes.test.ts
```

Expected: PASS — all new cases plus existing route tests still green.

- [ ] **Step 5: Commit**

```bash
git add tests/api/customer/discovery.routes.test.ts
git commit -m "test(discovery): route forwards tagIds/scope/chipsHidden through service"
```

---

### Task 24: Service-level test for tagIds filter (mocked Prisma)

**Files:**
- Create: `tests/api/customer/discovery.service.test.ts`

This is a NEW test file. Pattern matches `tests/api/auth/merchant.test.ts` lines 9–14: build a mock prisma object, exercise the real service code, assert the `prisma.*` calls have the expected shape.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchMerchants } from '../../../src/api/customer/discovery/service'

function makePrismaMock() {
  return {
    merchant: { findMany: vi.fn().mockResolvedValue([]) },
    user:     { findUnique: vi.fn().mockResolvedValue(null) },
    redundantHighlight: { findMany: vi.fn().mockResolvedValue([]) },
  } as any
}

describe('searchMerchants — tagIds filter builds correct where clause', () => {
  let prisma: ReturnType<typeof makePrismaMock>

  beforeEach(() => { prisma = makePrismaMock() })

  it('includes a tag-membership clause when tagIds is non-empty', async () => {
    await searchMerchants(prisma, { tagIds: ['tag-id-1', 'tag-id-2'], limit: 20, offset: 0 } as any)

    expect(prisma.merchant.findMany).toHaveBeenCalledTimes(1)
    const call = prisma.merchant.findMany.mock.calls[0][0]
    const where = call.where

    // The implementation builds AND[*].OR with three pathways: MerchantTag, MerchantHighlight,
    // primaryDescriptorTagId. Assert any of these clauses references the requested ids.
    const stringified = JSON.stringify(where)
    expect(stringified).toContain('tag-id-1')
    expect(stringified).toContain('tag-id-2')
    expect(stringified).toContain('primaryDescriptorTagId')
    expect(stringified).toContain('tags')          // MerchantTag.tagId path
    expect(stringified).toContain('highlights')    // MerchantHighlight.highlightTagId path
  })

  it('omits the tag-membership clause when tagIds is undefined', async () => {
    await searchMerchants(prisma, { limit: 20, offset: 0 } as any)
    const call = prisma.merchant.findMany.mock.calls[0][0]
    const stringified = JSON.stringify(call.where ?? {})
    expect(stringified).not.toContain('primaryDescriptorTagId')
  })
})
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/api/customer/discovery.service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/api/customer/discovery.service.test.ts
git commit -m "test(discovery): service-level tagIds where-clause test (mocked prisma)"
```

---

### Task 25: Service-level test for `meta` envelope on `searchMerchants`

**Files:**
- Modify: `tests/api/customer/discovery.service.test.ts`

- [ ] **Step 1: Append meta-envelope tests**

```ts
describe('searchMerchants — meta envelope', () => {
  let prisma: ReturnType<typeof makePrismaMock>
  beforeEach(() => { prisma = makePrismaMock() })

  it('returns scope=nearby and scopeExpanded=false when no scope requested but lat/lng given', async () => {
    const res = await searchMerchants(prisma, { lat: 51.5, lng: -0.1, limit: 20, offset: 0 } as any)
    expect(res.meta).toEqual(expect.objectContaining({
      scope: 'nearby',
      resolvedArea: 'Nearby',
      scopeExpanded: false,
    }))
  })

  it('returns scope=platform and scopeExpanded=true when scope=platform requested', async () => {
    const res = await searchMerchants(prisma, { scope: 'platform', limit: 20, offset: 0 } as any)
    expect(res.meta).toEqual(expect.objectContaining({
      scope: 'platform',
      resolvedArea: 'United Kingdom',
      scopeExpanded: true,
    }))
  })

  it('returns scope=city when scope=city is requested and a profileCity is resolvable', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ city: 'London' })

    const res = await searchMerchants(prisma, {
      scope: 'city', userId: 'user-1', lat: 51.5, lng: -0.1, limit: 20, offset: 0,
    } as any)
    expect(res.meta).toEqual(expect.objectContaining({
      scope: 'city',
      resolvedArea: 'London',
      scopeExpanded: true,
    }))
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/api/customer/discovery.service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/api/customer/discovery.service.test.ts
git commit -m "test(discovery): service meta envelope (scope, resolvedArea, scopeExpanded)"
```

---

### Task 26: Service-level tests for `listActiveCategories` and `getCategoryMerchants`

**Files:**
- Modify: `tests/api/customer/discovery.service.test.ts`

- [ ] **Step 1: Append `listActiveCategories` chip-density test**

```ts
import { listActiveCategories, getCategoryMerchants } from '../../../src/api/customer/discovery/service'

describe('listActiveCategories — supply-aware children + chipsHidden', () => {
  it('hides chip row when fewer than 3 subcategories have supply in the city', async () => {
    const prisma = {
      category: {
        findMany: vi.fn().mockResolvedValueOnce([
          {
            id: 'pet', name: 'Pet Services', sortOrder: 11, iconUrl: null, illustrationUrl: null,
            pinColour: '#795548', pinIcon: 'paw',
            merchantCountByCity: { London: 5 },
            children: [
              { id: 's1', name: 'Vet',         sortOrder: 4, descriptorState: 'HIDDEN', descriptorSuffix: null, merchantCountByCity: { London: 3 } },
              { id: 's2', name: 'Pet Groomer', sortOrder: 1, descriptorState: 'HIDDEN', descriptorSuffix: null, merchantCountByCity: { London: 2 } },
              { id: 's3', name: 'Pet Boutique',sortOrder: 6, descriptorState: 'OPTIONAL',descriptorSuffix: null, merchantCountByCity: { Manchester: 1 } },  // no London supply
            ],
          },
        ]),
      },
      user: { findUnique: vi.fn().mockResolvedValue({ city: 'London' }) },
    } as any

    const cats = await listActiveCategories(prisma, { userId: 'u1', scope: 'city' })

    const pets = cats[0]
    expect(pets.children.map((c: any) => c.name)).toEqual(['Vet', 'Pet Groomer'])  // s3 filtered out (no London supply)
    expect(pets.chipsHidden).toBe(true)  // 2 visible subcats, below the default 3
  })
})

describe('getCategoryMerchants — meta envelope and chipsHidden', () => {
  it('returns meta with chipsHidden=true when subcategories with supply < 3', async () => {
    const prisma = {
      merchant: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findUnique: vi.fn().mockResolvedValue({ city: 'London' }) },
      category: {
        findMany: vi.fn().mockResolvedValue([
          { id: 's1', merchantCountByCity: { London: 2 } },
          { id: 's2', merchantCountByCity: { Manchester: 5 } },  // no London supply
        ]),
      },
      redundantHighlight: { findMany: vi.fn().mockResolvedValue([]) },
    } as any

    const res = await getCategoryMerchants(prisma, 'cat-id-1', {
      userId: 'u1', scope: 'city', limit: 20, offset: 0,
    } as any)

    expect(res.meta.chipsHidden).toBe(true)
    expect(res.meta.scope).toBe('city')
    expect(res.meta.scopeExpanded).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/api/customer/discovery.service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/api/customer/discovery.service.test.ts
git commit -m "test(discovery): listActiveCategories + getCategoryMerchants supply-aware logic"
```

---

### Task 27: Service-level tests for descriptor construction, redundancy filter, and de-dup E2E

**Files:**
- Modify: `tests/api/customer/discovery.service.test.ts`

This task covers the user-locked end-to-end test for the de-duplication rule via API response.

- [ ] **Step 1: Append descriptor + redundancy tests**

```ts
describe('Merchant tile shape — descriptor + filtered highlights', () => {
  it('returns the constructed descriptor on a Restaurant + Italian merchant', async () => {
    const merchantRow = {
      id: 'm-1', businessName: 'Franco Manca', primaryCategoryId: 'sub-restaurant',
      primaryDescriptorTag: { id: 't-italian', label: 'Italian' },
      primaryCategory: { id: 'sub-restaurant', name: 'Restaurant', descriptorSuffix: 'Restaurant' },
      highlights: [
        { id: 'mh-1', highlightTagId: 't-indep',  sortOrder: 0, tag: { id: 't-indep', label: 'Independent' } },
      ],
    }
    const prisma = {
      merchant: { findMany: vi.fn().mockResolvedValue([merchantRow]) },
      user:     { findUnique: vi.fn().mockResolvedValue(null) },
      redundantHighlight: { findMany: vi.fn().mockResolvedValue([]) },
    } as any

    const res = await searchMerchants(prisma, { limit: 20, offset: 0 } as any)
    expect(res.results).toHaveLength(1)
    expect(res.results[0].descriptor).toBe('Italian Restaurant')
    expect(res.results[0].highlights.map((h: any) => h.tag.label)).toEqual(['Independent'])
  })

  it('filters out a redundant highlight (Pet-Friendly under Vet)', async () => {
    const vetMerchant = {
      id: 'm-vet', businessName: 'Suburban Vet', primaryCategoryId: 'sub-vet',
      primaryDescriptorTag: null,
      primaryCategory: { id: 'sub-vet', name: 'Vet', descriptorSuffix: null },
      highlights: [
        { id: 'mh-pf',    highlightTagId: 't-pet',   sortOrder: 0, tag: { id: 't-pet',   label: 'Pet-Friendly' } },
        { id: 'mh-indep', highlightTagId: 't-indep', sortOrder: 1, tag: { id: 't-indep', label: 'Independent' } },
      ],
    }
    const prisma = {
      merchant: { findMany: vi.fn().mockResolvedValue([vetMerchant]) },
      user:     { findUnique: vi.fn().mockResolvedValue(null) },
      redundantHighlight: { findMany: vi.fn().mockResolvedValue([
        { subcategoryId: 'sub-vet', highlightTagId: 't-pet' },  // Pet-Friendly is redundant under Vet
      ]) },
    } as any

    const res = await searchMerchants(prisma, { limit: 20, offset: 0 } as any)
    const labels = res.results[0].highlights.map((h: any) => h.tag.label)
    expect(labels).not.toContain('Pet-Friendly')
    expect(labels).toContain('Independent')
  })

  it('applies the descriptor de-dup rule (Cookery Class + Class & Workshop → "Cookery Class")', async () => {
    // End-to-end: merchant has primary descriptor tag "Cookery Class" and primary subcategory
    // "Class & Workshop". The de-dup rule (§3.6) collapses to the longer of the two alone.
    const cookerySchool = {
      id: 'm-csl', businessName: 'Cookery School London', primaryCategoryId: 'sub-cw',
      primaryDescriptorTag: { id: 't-cc', label: 'Cookery Class' },
      primaryCategory: { id: 'sub-cw', name: 'Class & Workshop', descriptorSuffix: 'Class & Workshop' },
      highlights: [],
    }
    const prisma = {
      merchant: { findMany: vi.fn().mockResolvedValue([cookerySchool]) },
      user:     { findUnique: vi.fn().mockResolvedValue(null) },
      redundantHighlight: { findMany: vi.fn().mockResolvedValue([]) },
    } as any

    const res = await searchMerchants(prisma, { limit: 20, offset: 0 } as any)
    expect(res.results[0].descriptor).toBe('Class & Workshop')
    // Per §3.6: when one string contains the other, render the LONGER alone.
    // "Class & Workshop" (16 chars) is longer than "Cookery Class" (13 chars), but neither
    // contains the other, so this assertion is wrong. Adjust:
  })

  it('applies the descriptor de-dup rule when tag contains the suffix', async () => {
    const merchant = {
      id: 'm-bh', businessName: 'Boutique-only Hotel', primaryCategoryId: 'sub-bh',
      // Subcategory "Boutique Hotel" already contains the tag "Boutique" — render subcategory alone.
      primaryDescriptorTag: { id: 't-b', label: 'Boutique' },
      primaryCategory: { id: 'sub-bh', name: 'Boutique Hotel', descriptorSuffix: 'Boutique Hotel' },
      highlights: [],
    }
    const prisma = {
      merchant: { findMany: vi.fn().mockResolvedValue([merchant]) },
      user:     { findUnique: vi.fn().mockResolvedValue(null) },
      redundantHighlight: { findMany: vi.fn().mockResolvedValue([]) },
    } as any

    const res = await searchMerchants(prisma, { limit: 20, offset: 0 } as any)
    expect(res.results[0].descriptor).toBe('Boutique Hotel')   // de-dup: not "Boutique Boutique Hotel"
  })
})
```

> Note for the implementer: the third "Cookery Class" test in step 1 above contains a deliberate self-correction comment — neither "Cookery Class" nor "Class & Workshop" contains the other, so the de-dup rule does NOT fire and the rendered descriptor is `"Cookery Class Class & Workshop"`. This is awkward and is the genuine behaviour. To get a cleaner descriptor, the seed for the `Class & Workshop` subcategory could set `descriptorSuffix: "Class"` (which IS contained in "Cookery Class" — de-dup would fire). Decide: either (a) leave the awkward two-string descriptor for this edge case, or (b) update Task 6's `SUBCATEGORIES` array to set `descriptorSuffix: 'Class'` for the "Class & Workshop" entry. Option (b) is cleaner; mark a TODO if not done.

- [ ] **Step 2: If you chose option (b), update Task 6's data and adjust the test**

In `prisma/seed-data/categories.ts`, change the `Class & Workshop` row to:
```ts
{ parent: 'Out & About', name: 'Class & Workshop', sortOrder: 7, descriptorState: 'RECOMMENDED', descriptorSuffix: 'Class' },
```

Then in the failing third test above, swap the assertion to:
```ts
expect(res.results[0].descriptor).toBe('Cookery Class')
```
because suffix `"Class"` is contained in tag `"Cookery Class"`, so de-dup renders the tag alone.

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/api/customer/discovery.service.test.ts
```

Expected: PASS — all four cases (Italian Restaurant, redundancy filter, Boutique Hotel de-dup, Cookery Class de-dup with the suffix override).

- [ ] **Step 4: Commit**

```bash
git add tests/api/customer/discovery.service.test.ts prisma/seed-data/categories.ts
git commit -m "test(discovery): descriptor + redundancy + de-dup rule (incl. Class & Workshop suffix)"
```

---

### Task 28: Run the full backend test suite, fix any regressions, final commit

- [ ] **Step 1: Run everything**

```bash
npx vitest run
```

Expected: all tests pass. Original 285 + new ~25 = ~310 passing.

- [ ] **Step 2: Investigate any regressions**

If any existing test fails, the most likely cause is:
- A merchant fixture references a category by old name (`'Retail & Shopping'`, `'Entertainment'`, `'Professional Services'`)
- Old `MerchantTagStatus` import not yet renamed somewhere
- A test fixture needs `primaryCategoryId` to point at a subcategory (Task 11 already did this for seed data; check if any unit-test fixtures still point at a top-level)

Fix in place; do not skip tests.

- [ ] **Step 3: Final integration commit**

If any fixes were needed:
```bash
git add <fixed files>
git commit -m "fix(tests): align fixtures with new taxonomy"
```

If no fixes:
```bash
echo "All tests green — no regressions"
```

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
```

Expected: no errors.

```bash
npx eslint src/ tests/ --ext .ts
```

Expected: no errors. Fix any if found, commit, then re-run.

---

## Plan complete

Foundation is in place. The data layer carries the full taxonomy; the discovery API exposes it via tag filters, the supply-aware `/categories` response, the new `/category/:id/merchants` endpoint, and the `meta` envelope. Tile responses now include `primaryDescriptorTag` and filtered `highlights`. The 3-cap on highlights is enforced at the database level. Seed integrity is tested.

**What is NOT in this plan (ships in Plan 2):**
- Customer-app UI rendering of subcategory chips, tag filter sheet, scope-expansion CTAs, descriptor labels, highlight chips on tiles
- Customer-website parity updates
- Home-feed rail scope labelling

**What is NOT in this plan (ships in Plan 3, after Phase 4 / 5 begin):**
- Merchant-onboarding picker rebuild (descriptor prompt, highlight picker with redundancy filter)
- Admin tooling for tag curation, redundancy rule editing, the moderation queue

---

## Scope coverage check (mapping spec → tasks)

| Spec section | Implementation task(s) |
|---|---|
| §1 Top-level Categories | Task 6, 10 |
| §2 Subcategories | Task 6, 10 |
| §3.1 Four tag types (model) | Task 3 |
| §3.2 Cuisine tags | Task 7, 10 |
| §3.3 Specialty tags | Task 7, 10 |
| §3.4 Highlights (18, 3-cap) | Task 3 (CHECK trigger), Task 7, 10, 22 |
| §3.5 Details (~35) | Task 7, 10 |
| §3.6 Primary Descriptor model | Task 3 (`primaryDescriptorTagId`), Task 13 (`buildDescriptor`), Task 20 (response wiring) |
| §3.8 Tag-to-subcategory join | Task 3 (`SubcategoryTag`), Task 8, 10 |
| §3.9 Highlights redundancy filter | Task 3 (`RedundantHighlight`), Task 9, 10, 20 |
| §3.10 Tag governance (closed-list, soft-deprecation) | Task 3 (`isActive`, `createdBy`); admin UI deferred to Plan 3 |
| §4.1 Visibility tiers | Task 18 (categories supply-aware), Task 19 (category/merchants result-aware) |
| §4.2–4.4 User-initiated vs passive modes | Task 17 (search scope), Task 18, 19 — UI consumption deferred to Plan 2 |
| §4.5 Subcategory chip density | Task 18, 19 (`chipsHidden` flag) |
| §4.7 API meta envelope | Task 17, 18, 19 (`scopeExpanded`, `chipsHidden`) |
| §4.9 Launch-phase behaviour | All implemented behaviours satisfy this implicitly; no separate "post-launch" mode required |
| §5 Schema | Task 1, 2, 3, 4 |
| §6 Governance | Task 3 (schema fields support it); admin UI deferred |
