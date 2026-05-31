# Favourites Branch-Level Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 3C.1g Favourites end-to-end — branch-level Place favourites, voucher favourites surfaced properly, shared `<FavouriteHeart>` component owning every heart entry point, Favourites tab with Places + Vouchers, server-sorted Smart 7-bucket Vouchers list.

**Architecture:** Additive `FavouriteBranch` table + new routes alongside existing `FavouriteMerchant` (kept live during transition). Wire-contract additive emit (`selectedBranch.isFavourited`, `branches[i].isFavourited`, `voucher.isFavourited`). Customer-app introduces shared `<FavouriteHeart>` component that owns the `useFavourite()` hook and replaces all 10 inline heart consumers. New Favourites screen at `app/(app)/favourites.tsx`.

**Tech Stack:** Prisma 7 + PostgreSQL (Neon) + Fastify backend; Expo SDK 54 + React Native + expo-router + React Query 5 customer-app.

**Spec source:** `docs/superpowers/specs/2026-05-28-favourites-branch-level-design.md` v1.1.

---

## Code snippets in this plan are ILLUSTRATIVE

The TypeScript snippets in M1 and M2 task steps illustrate INTENT (what the code should do, what fields belong on which structs, what error codes to throw). They are NOT copy-paste templates.

The implementer MUST follow the existing repo style in place at implementation time. In particular:

- **Backend service functions take `prisma: PrismaClient` as their first parameter.** Every existing function in `src/api/customer/favourites/service.ts` follows this pattern (e.g. `addFavouriteMerchant(prisma, userId, merchantId)`). New `addFavouriteBranch` etc. MUST match — do not introduce a top-level singleton import.
- **Error throws use `new AppError('CODE')` from `src/api/shared/errors`**, not `new ApiError(...)`. The HTTP status is mapped via the AppError code, not passed inline.
- **Typed Prisma errors caught via `Prisma.PrismaClientKnownRequestError`** with the relevant `.code` discriminator (`P2002` for unique violation, `P2025` for not-found). Mirror the existing `addFavouriteMerchant` try/catch.
- **Imports use the established relative paths** in this repo (e.g. `'../../../../generated/prisma/client'` from inside `src/api/customer/favourites/service.ts`), not aliases.
- **Customer-app hooks, components, and screens follow the patterns already established** in adjacent features (Profile, Savings, Voucher Detail) — Zod parse-at-API-boundary, React Query keys, design-system imports, etc.

If any snippet conflicts with the existing repo pattern, **the repo pattern wins**. Match-then-deviate is wrong here.

---

## Milestones

| Milestone | Scope | Approximate task count | Review checkpoint |
|---|---|---|---|
| **M1 — Backend additive** | New schema + new routes + new service + wire-contract additive emit + backfill script + backend test pins | ~9 tasks | Code review subagent + spec compliance review + owner sign-off before M2 |
| **M2 — Customer-app surface** | API client + hook extension + `<FavouriteHeart>` + list hooks + new Favourites screen + tab-bar entry + 10-consumer migration + §O4 closure + BranchTile refactor + customer-app test pins | ~12 tasks | Code review subagent + owner device-QA before PR open |
| **Cleanup PR** (NOT bundled with v1) | Drop `FavouriteMerchant` table + endpoints + `merchant.isFavourited` field. Separate workstream after v1 stabilises | placeholder file referenced at end | Files later as its own small Tier 1 plan |

## Global file ownership boundaries

The implementer for each task owns ONLY the paths listed in that task's **Files** block. Any change outside those paths is a boundary violation — escalate to the lead integrator.

**Owned-across-all-tasks (broadly):**

- `prisma/schema.prisma`, `prisma/migrations/*`, `prisma/backfill-favourite-branches.ts` (M1 schema + migration + backfill)
- `src/api/customer/favourites/**` (M1 routes + service)
- `src/api/customer/discovery/service.ts` (M1 enrichBranchTiles + getCustomerMerchant additive emit; minimal touch — additive only)
- `src/api/customer/voucher/service.ts` (M1 getCustomerVoucher additive emit; minimal touch)
- `tests/api/customer/favourites/**` (M1 backend pins)
- `tests/api/customer/discovery/**` (M1 enrichment pin extensions)
- `tests/api/customer/merchant/**` (M1 additive-emit pins)
- `tests/api/customer/voucher/**` (M1 additive-emit pin)
- `tests/scripts/**` (M1 backfill pin)
- `apps/customer-app/src/features/favourites/**` (M2 — new feature directory)
- `apps/customer-app/src/lib/api/favourites.ts` (M2)
- `apps/customer-app/src/lib/api/voucher.ts` (M2 — additive Zod field)
- `apps/customer-app/src/lib/api/merchant.ts` or `discovery.ts` (M2 — additive Zod fields for new isFavourited locations)
- `apps/customer-app/src/hooks/useFavourite.ts` (M2 — extension)
- `apps/customer-app/app/(app)/favourites.tsx` (M2 — new route)
- `apps/customer-app/app/(app)/_layout.tsx` (M2 — tab-bar entry)
- `apps/customer-app/src/shared/BranchTile.tsx` (M2 — internal refactor)
- `apps/customer-app/src/features/search/components/SearchResultItem.tsx` (M2 consumer migration)
- `apps/customer-app/src/features/home/components/{FeaturedCarousel,TrendingSection,PopularSection,NearbyByCategory}.tsx` (M2 consumer migration — drop callbacks)
- `apps/customer-app/src/features/map/components/MapBranchTile.tsx` (M2 consumer migration)
- `apps/customer-app/src/features/merchant/components/{HeroSection,VoucherCard}.tsx` (M2 consumer migration)
- `apps/customer-app/src/features/voucher/components/CouponHeader.tsx` (M2 consumer migration — §O4)
- `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` (M2 — §O4 stub removal)
- `apps/customer-app/tests/**` (M2 customer-app pins — broad)

**Off-limits unless explicitly added:**

- Backend auth, redemption, savings, subscription, admin, merchant-portal services.
- Customer-web (separate workstream — §AS blocked on §BW).
- Design-system primitives outside what's already used.
- Plan 4 location services, locality resolution, GPS code.
- Any voucher-detail M2/M3/M4/M5 redemption logic (not in scope).

## Execution order

```
M1.1 schema migration
  ↓
M1.2 backfill script (committed but NOT run yet)
  ↓
M1.3 favourites/branches routes + service (addFavouriteBranch / removeFavouriteBranch / listFavouriteBranches)
  ↓
M1.4 listFavouriteVouchers v1.1 amendment (global sort + 7-bucket priority + URGENT_THRESHOLD_MS hardcode)
  ↓
M1.5 enrichBranchTiles flip (read FavouriteBranch instead of FavouriteMerchant)
  ↓
M1.6 getCustomerMerchant additive emit (selectedBranch.isFavourited + branches[i].isFavourited)
  ↓
M1.7 getCustomerVoucher additive emit (voucher.isFavourited) — closes §O4 backend gap
  ↓
M1.8 backend regression pins (parity + global sort + additive-emit pins)
  ↓
M1.9 RUN backfill script in dev (one-shot) + verify counts
  ↓
[ M1 REVIEW CHECKPOINT — owner sign-off before M2 ]
  ↓
M2.1 API client (lib/api/favourites.ts) + Zod schemas + additive Zod field on voucher.ts
  ↓
M2.2 useFavourite hook extension (branch discriminator + contextualQueryKey)
  ↓
M2.3 <FavouriteHeart> shared component + unit tests
  ↓
M2.4 list hooks (useFavouriteBranches, useFavouriteVouchers, useRemoveFavourite)
  ↓
M2.5 Favourites screen + cards + skeleton + empty state + undo toast
  ↓
M2.6 tab-bar entry in (app)/_layout.tsx
  ↓
M2.7 BranchTile internal refactor (renders FavouriteHeart, drops onFavourite prop)
  ↓
M2.8 consumer migration — search/home/map/category surfaces (drop parent-wired callbacks)
  ↓
M2.9 consumer migration — Merchant Profile HeroSection + VoucherCard
  ↓
M2.10 consumer migration — Voucher Detail CouponHeader + §O4 stub removal in VoucherDetailScreen
  ↓
M2.11 customer-app regression pins (FavouriteHeart contract + server-sort pin + all 10 surface pins)
  ↓
[ M2 REVIEW CHECKPOINT — code review subagent + owner device-QA ]
  ↓
PR open, SHA-bound merge after approval
```

---

## M1 — Backend additive

### Task M1.1 — Prisma schema migration: FavouriteBranch additive

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<YYYYMMDDHHMMSS>_favourite_branch_additive/migration.sql`

- [ ] **Step 1.1** — Add model to `schema.prisma` (alongside existing FavouriteMerchant and FavouriteVoucher):

```prisma
model FavouriteBranch {
  id         String   @id @default(cuid())
  userId     String
  branchId   String
  createdAt  DateTime @default(now())

  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  branch     Branch   @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@unique([userId, branchId])
  @@index([userId])
  @@index([branchId])
}
```

- [ ] **Step 1.2** — Add back-relations to `User` model:

```prisma
favouriteBranches FavouriteBranch[]
```

- [ ] **Step 1.3** — Add back-relation to `Branch` model:

```prisma
favouritedBy FavouriteBranch[]
```

- [ ] **Step 1.4** — Generate the migration:

```bash
npx prisma migrate dev --create-only --name favourite_branch_additive
```

- [ ] **Step 1.5** — Inspect the generated SQL. Confirm only `CREATE TABLE`, `CREATE UNIQUE INDEX`, `CREATE INDEX`, `ADD CONSTRAINT` statements. No drops, no alters of existing tables.

- [ ] **Step 1.6** — Apply the migration:

```bash
npx prisma migrate dev
```

- [ ] **Step 1.7** — Regenerate Prisma client:

```bash
npx prisma generate
```

- [ ] **Step 1.8** — Run backend type-check + tests:

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 1.9** — Commit:

```bash
git add prisma/schema.prisma prisma/migrations/<YYYYMMDDHHMMSS>_favourite_branch_additive
git commit -m "feat(favourites): add FavouriteBranch table — additive Prisma migration (M1.1)"
```

---

### Task M1.2 — Backfill script (committed, NOT run yet)

**Files:**
- Create: `prisma/backfill-favourite-branches.ts`
- Create: `tests/scripts/backfill-favourite-branches.test.ts`

- [ ] **Step 2.1** — Write `prisma/backfill-favourite-branches.ts`:

```ts
import { PrismaClient } from '../generated/prisma/client'

const prisma = new PrismaClient()

async function main(dryRun: boolean) {
  const merchantFavourites = await prisma.favouriteMerchant.findMany({
    select: {
      userId: true,
      merchantId: true,
      merchant: {
        select: {
          id: true,
          status: true,
          branches: {
            where: { isMainBranch: true, status: 'ACTIVE' },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  })

  let inserted = 0
  let skippedAlreadyFavourited = 0
  let skippedNoMainBranch = 0
  let skippedInactiveMerchant = 0

  for (const fm of merchantFavourites) {
    if (fm.merchant.status !== 'ACTIVE') {
      skippedInactiveMerchant += 1
      continue
    }
    const mainBranch = fm.merchant.branches[0]
    if (!mainBranch) {
      skippedNoMainBranch += 1
      continue
    }

    if (dryRun) {
      inserted += 1
      continue
    }

    try {
      await prisma.favouriteBranch.create({
        data: { userId: fm.userId, branchId: mainBranch.id },
      })
      inserted += 1
    } catch (e: any) {
      if (e.code === 'P2002') {
        skippedAlreadyFavourited += 1
      } else {
        throw e
      }
    }
  }

  console.log(
    `Backfill summary (dryRun=${dryRun}):\n` +
      `  inserted: ${inserted}\n` +
      `  skipped (already favourited): ${skippedAlreadyFavourited}\n` +
      `  skipped (no main branch): ${skippedNoMainBranch}\n` +
      `  skipped (inactive merchant): ${skippedInactiveMerchant}`,
  )
}

const dryRun = process.argv.includes('--dry-run')
main(dryRun).finally(() => prisma.$disconnect())
```

- [ ] **Step 2.2** — Write `tests/scripts/backfill-favourite-branches.test.ts` covering:
  - Idempotency (run twice → same `inserted` count first time, all skipped second time).
  - Multi-branch merchant → only main-branch entry created.
  - Merchant with no `isMainBranch=true` branch → skipped with count incremented.
  - Inactive merchant → skipped with count incremented.
  - `--dry-run` produces summary without writing.

- [ ] **Step 2.3** — Type-check + run pin:

```bash
npx tsc --noEmit
npx vitest run tests/scripts/backfill-favourite-branches.test.ts
```

- [ ] **Step 2.4** — Commit (do NOT run the script against shared data yet — that happens in M1.9):

```bash
git add prisma/backfill-favourite-branches.ts tests/scripts/backfill-favourite-branches.test.ts
git commit -m "feat(favourites): backfill script FavouriteMerchant → FavouriteBranch main-branch (M1.2)"
```

---

### Task M1.3 — favourites/branches routes + service

**Files:**
- Modify: `src/api/customer/favourites/routes.ts`
- Modify: `src/api/customer/favourites/service.ts`
- Create: `tests/api/customer/favourites/branches.routes.test.ts`
- Create: `tests/api/customer/favourites/branches.service.test.ts`

- [ ] **Step 3.1** — In `service.ts`, add `addFavouriteBranch` (mirror the existing `addFavouriteMerchant` signature + pattern — `prisma: PrismaClient` as first param, `AppError` for typed errors, `Prisma.PrismaClientKnownRequestError` for the catch):

```ts
// ILLUSTRATIVE — match the exact import + signature style of the existing
// addFavouriteMerchant in the same file. See "Code snippets are
// ILLUSTRATIVE" note at the top of this plan.
export async function addFavouriteBranch(
  prisma: PrismaClient,
  userId: string,
  branchId: string,
) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, status: true, merchant: { select: { status: true } } },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (branch.status !== 'ACTIVE' || branch.merchant.status !== 'ACTIVE') {
    throw new AppError('BRANCH_NOT_FOUND')
  }
  try {
    return await prisma.favouriteBranch.create({
      data: { userId, branchId },
      select: { id: true, branchId: true, createdAt: true },
    })
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('ALREADY_FAVOURITED')
    }
    throw e
  }
}
```

- [ ] **Step 3.2** — Add `removeFavouriteBranch` (mirror existing `removeFavouriteMerchant`):

```ts
export async function removeFavouriteBranch(
  prisma: PrismaClient,
  userId: string,
  branchId: string,
) {
  try {
    await prisma.favouriteBranch.delete({
      where: { userId_branchId: { userId, branchId } },
    })
    return { success: true }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new AppError('FAVOURITE_NOT_FOUND')
    }
    throw e
  }
}
```

- [ ] **Step 3.3** — Add `listFavouriteBranches(userId, page, limit)` with global sort `(isUnavailable asc, isOpen desc, favouritedAt desc)` — see spec §6.3 for the enrichment shape (branch + parent merchant + opening hours → isOpen, voucherCount, maxEstimatedSaving, ratings keyed on branch, isUnavailable). Apply `Branch.locationConfidence` redaction contract (`exposeBranchPosition(rawBranch)` per `project_location_confidence_redaction_contract.md`).

- [ ] **Step 3.4** — In `routes.ts`, register `POST /api/v1/customer/favourites/branches/:branchId`, `DELETE /api/v1/customer/favourites/branches/:branchId`, `GET /api/v1/customer/favourites/branches`. Use the same Zod pagination schema (`page: number().int().min(1)`, `limit: number().int().min(1).max(50).default(20)`).

- [ ] **Step 3.5** — Write `branches.routes.test.ts` covering POST/DELETE/GET + ALREADY_FAVOURITED + FAVOURITE_NOT_FOUND + BRANCH_NOT_FOUND + pagination.

- [ ] **Step 3.6** — Write `branches.service.test.ts` covering `listFavouriteBranches` enrichment + global sort across 25+ branches spanning open/closed/unavailable states + location-confidence redaction (POSTCODE_CENTROID branches don't expose lat/lng).

- [ ] **Step 3.7** — Type-check + run pins:

```bash
npx tsc --noEmit
npx vitest run tests/api/customer/favourites/
```

- [ ] **Step 3.8** — Commit:

```bash
git add src/api/customer/favourites tests/api/customer/favourites
git commit -m "feat(favourites): add /favourites/branches routes + service with global sort (M1.3)"
```

---

### Task M1.4 — listFavouriteVouchers v1.1 amendment (global sort + 7-bucket priority)

**Files:**
- Modify: `src/api/customer/favourites/service.ts` (existing `listFavouriteVouchers` function)
- Create: `tests/api/customer/favourites/vouchers.global-sort.test.ts`
- Create: `tests/api/customer/favourites/vouchers.threshold-parity.test.ts`

- [ ] **Step 4.1** — In `service.ts`, define the backend priority constant (with cross-reference comment):

```ts
// OWNER LOCKED Gate H 2026-05-11 — must equal customer-app constants in:
//   apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts
//   apps/customer-app/src/features/merchant/utils/voucherCardSort.ts
// Parity is pinned by tests/api/customer/favourites/vouchers.threshold-parity.test.ts.
const URGENT_THRESHOLD_MS = 60 * 60_000
```

- [ ] **Step 4.2** — Implement `computeVoucherPriorityBucket(voucher, now): 1..7` matching the customer-app `voucherCardPriority` 7-bucket logic. Inline the function in the service file.

- [ ] **Step 4.3** — Rewrite `listFavouriteVouchers` per spec §6.3:
  1. Fetch ALL `FavouriteVoucher` rows for `userId` (no LIMIT).
  2. Bulk-enrich each row (voucher + merchant + UserVoucherCycleState + subscription cycle anchor + expiry + TL availability window + REUSABLE cooldown state) — minimise per-row queries.
  3. Compute `priorityBucket` per row using `computeVoucherPriorityBucket(voucher, now)`.
  4. Sort by `(priorityBucket asc, favouritedAt desc)`.
  5. Apply pagination via `skip + take`.
  6. Return `{ items, total, page, limit }`.

- [ ] **Step 4.4** — Write `vouchers.global-sort.test.ts`:
  - Fixture: user with 25 favourite vouchers spanning all 7 priority buckets.
  - Some urgent vouchers favourited LAST (recent `favouritedAt`), some non-urgent favourited FIRST.
  - Request page 1 (limit 20) → first item is urgent regardless of `favouritedAt`.
  - Request page 2 (limit 20) → remaining items in priority order.
  - Pin: across both pages, the global priority ordering holds. **Regression pin against re-introducing page-local sort.**

- [ ] **Step 4.5** — Write `vouchers.threshold-parity.test.ts`. **Preferred implementation: exported backend constant.**

  Prefer this approach if it can be done cleanly:
  - Export `URGENT_THRESHOLD_MS` from a small backend constants module (e.g. `src/api/customer/favourites/constants.ts`) OR re-export from `src/api/customer/favourites/service.ts` if exporting from the service file is idiomatic in the existing codebase.
  - The pin imports the exported constant directly and asserts `URGENT_THRESHOLD_MS === 60 * 60_000`.
  - The exported constant's JSDoc includes the cross-reference to the customer-app constants and the Gate H 2026-05-11 lock attribution.

  Fall back to a static-source pin (read the source file via `fs.readFileSync` and assert the literal `60 * 60_000`) only if:
  - Exporting the constant creates awkward coupling (e.g. the service file already exports a large surface and a new constants module would feel out-of-place for one number), AND
  - The static-source pin is annotated with a leading comment explaining: (a) why the exported-constant approach was rejected, (b) what fragility this static pin introduces (file moves break the glob), and (c) under what future condition the pin should be refactored to an exported-constant pin instead.

  Either way, the assertion is the same: the backend constant value MUST equal `60 * 60_000` (the Gate H 2026-05-11 lock). The test name + JSDoc must reference the customer-app constants in `apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts` and `apps/customer-app/src/features/merchant/utils/voucherCardSort.ts` so a future contributor reading the failing test understands the full parity chain.

- [ ] **Step 4.6** — Type-check + run pins:

```bash
npx tsc --noEmit
npx vitest run tests/api/customer/favourites/vouchers
```

- [ ] **Step 4.7** — Commit:

```bash
git add src/api/customer/favourites/service.ts tests/api/customer/favourites/vouchers.global-sort.test.ts tests/api/customer/favourites/vouchers.threshold-parity.test.ts
git commit -m "feat(favourites): listFavouriteVouchers global sort by 7-bucket priority (M1.4 v1.1 amendment)"
```

---

### Task M1.5 — enrichBranchTiles flip (read FavouriteBranch)

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (the `enrichBranchTiles` function)
- Modify or create: `tests/api/customer/discovery/branch-tile-isFavourited.test.ts`

- [ ] **Step 5.1** — In `enrichBranchTiles`, replace the merchant-keyed favourite lookup:

```ts
// BEFORE (current):
// const favouriteMerchantIds = new Set(
//   (await prisma.favouriteMerchant.findMany({ where: { userId, merchantId: { in: merchantIds } } }))
//     .map(f => f.merchantId)
// )
// for each tile: tile.isFavourited = favouriteMerchantIds.has(tile.merchant.id)

// AFTER:
const branchIds = tiles.map(t => t.id)
const favouriteBranchIds = userId
  ? new Set(
      (await prisma.favouriteBranch.findMany({
        where: { userId, branchId: { in: branchIds } },
        select: { branchId: true },
      })).map(f => f.branchId)
    )
  : new Set<string>()
// for each tile: tile.isFavourited = favouriteBranchIds.has(tile.id)
```

- [ ] **Step 5.2** — Write or extend `branch-tile-isFavourited.test.ts`:
  - Fixture: user favourites Branch A of Merchant X (NOT Branch B).
  - Discovery query returns both Branch A and Branch B.
  - Assert Branch A `isFavourited=true`, Branch B `isFavourited=false`.
  - Regression pin against merchant-keyed lookup (which would mark BOTH as favourited).
  - Guest (userId=null) → all `isFavourited=false`.

- [ ] **Step 5.3** — Type-check + run pins:

```bash
npx tsc --noEmit
npx vitest run tests/api/customer/discovery/
```

- [ ] **Step 5.4** — Commit:

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/branch-tile-isFavourited.test.ts
git commit -m "feat(favourites): enrichBranchTiles reads FavouriteBranch (M1.5)"
```

---

### Task M1.6 — getCustomerMerchant additive emit (selectedBranch.isFavourited + branches[i].isFavourited)

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (`getCustomerMerchant`)
- Create or extend: `tests/api/customer/merchant/isFavourited-additive.test.ts`

- [ ] **Step 6.1** — In `getCustomerMerchant`, after the `selectedBranch` resolution, add:

```ts
const selectedBranchIsFavourited = userId && selectedBranch
  ? !!(await prisma.favouriteBranch.findUnique({
      where: { userId_branchId: { userId, branchId: selectedBranch.id } },
    }))
  : false
```

- [ ] **Step 6.2** — In the `branches[]` array enrichment, bulk-load favourite-branch IDs for the merchant's branches and thread `isFavourited` onto each branch entry.

- [ ] **Step 6.3** — Keep `merchant.isFavourited` unchanged (additive — still emit it during transition; cleanup PR removes it).

- [ ] **Step 6.4** — Customer-facing payload Zod (already exists) — add `isFavourited: z.boolean()` on the `selectedBranch` block and on each branches[] entry.

- [ ] **Step 6.5** — Write `isFavourited-additive.test.ts`:
  - User favourites Branch A (the selected branch).
  - Request `GET /merchants/M`.
  - Assert `merchant.isFavourited` still emits (additive transition).
  - Assert `selectedBranch.isFavourited === true`.
  - Assert `branches[]` entries each have `isFavourited` matching FavouriteBranch state.

- [ ] **Step 6.6** — Type-check + run pins:

```bash
npx tsc --noEmit
npx vitest run tests/api/customer/merchant/
```

- [ ] **Step 6.7** — Commit:

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/merchant
git commit -m "feat(favourites): getCustomerMerchant additive selectedBranch.isFavourited + branches[i].isFavourited (M1.6)"
```

---

### Task M1.7 — getCustomerVoucher additive emit (voucher.isFavourited) — closes §O4 backend gap

**Files:**
- Modify: `src/api/customer/voucher/service.ts` (`getCustomerVoucher`)
- Create: `tests/api/customer/voucher/isFavourited-additive.test.ts`

- [ ] **Step 7.1** — In `getCustomerVoucher`, add:

```ts
const isFavourited = userId
  ? !!(await prisma.favouriteVoucher.findUnique({
      where: { userId_voucherId: { userId, voucherId } },
    }))
  : false
```

Then thread `isFavourited` onto the response. Update the customer-facing payload Zod with `isFavourited: z.boolean()`.

- [ ] **Step 7.2** — Write `isFavourited-additive.test.ts`:
  - User favourites Voucher V.
  - Request `GET /vouchers/V`.
  - Assert `voucher.isFavourited === true`.
  - Guest → `isFavourited === false`.

- [ ] **Step 7.3** — Type-check + run pins:

```bash
npx tsc --noEmit
npx vitest run tests/api/customer/voucher/
```

- [ ] **Step 7.4** — Commit:

```bash
git add src/api/customer/voucher/service.ts tests/api/customer/voucher/isFavourited-additive.test.ts
git commit -m "feat(favourites): getCustomerVoucher additive voucher.isFavourited (M1.7 closes §O4 backend)"
```

---

### Task M1.8 — Backend regression pins sweep

**Files:**
- Possibly modify any existing tests that touched merchant-level favourites and need updating.

- [ ] **Step 8.1** — `grep -rn "FavouriteMerchant\|favouriteMerchants" tests/` — list every test file that references the merchant-level favourite model.

- [ ] **Step 8.2** — For each test file, decide: (a) needs update because behaviour changed, (b) keep as-is because it tests the still-live merchant routes during transition, (c) delete because dead.

- [ ] **Step 8.3** — Run the full backend sweep:

```bash
npx tsc --noEmit
npx vitest run
```

Expected: 0 new failures. Pre-existing baseline failures (`tests/api/customer/savings.service.test.ts` 4 errors) remain.

- [ ] **Step 8.4** — Commit any test updates:

```bash
git commit -m "chore(favourites): backend test sweep — keep merchant-level pins during transition (M1.8)"
```

---

### Task M1.9 — Run backfill in dev/local + CLI verification

**Scope: dev / local Neon branch ONLY.** This task is part of the M1 implementation pipeline and exercises the script against the developer's local Neon database. Production backfill (if ever needed — pre-launch context means there are no real users to migrate today) is explicitly OUT OF SCOPE here. If production migration becomes necessary later, it must be a separate owner-approved deployment runbook authored at that time. Do NOT export this step into a production runbook from the plan.

This is a one-shot operation, not a code change. **CLI-only verification — do NOT use Prisma Studio.**

- [ ] **Step 9.1** — Dry-run:

```bash
npx tsx prisma/backfill-favourite-branches.ts --dry-run
```

Expected output: summary of what WOULD be inserted. Inspect the counts. Confirm `inserted + skippedAlreadyFavourited + skippedNoMainBranch + skippedInactiveMerchant` sums to the total `FavouriteMerchant` row count.

- [ ] **Step 9.2** — Pre-run baseline count (so the post-run delta is verifiable):

```bash
npx tsx -e "import { PrismaClient } from './generated/prisma/client'; const p = new PrismaClient(); p.favouriteBranch.count().then(n => { console.log('pre-run FavouriteBranch rows:', n); return p.\$disconnect() })"
```

Record the number. On a fresh dev DB this should be 0.

- [ ] **Step 9.3** — Run for real:

```bash
npx tsx prisma/backfill-favourite-branches.ts
```

- [ ] **Step 9.4** — Post-run count verification:

```bash
npx tsx -e "import { PrismaClient } from './generated/prisma/client'; const p = new PrismaClient(); p.favouriteBranch.count().then(n => { console.log('post-run FavouriteBranch rows:', n); return p.\$disconnect() })"
```

Expected: `(post-run count) − (pre-run count) === inserted` from the script summary in Step 9.3.

- [ ] **Step 9.5** — Idempotency check — re-run the script:

```bash
npx tsx prisma/backfill-favourite-branches.ts
```

Expected: `inserted = 0`, `skippedAlreadyFavourited` equals the previous run's `inserted`. Row count unchanged.

- [ ] **Step 9.6** — Spot-check a multi-branch merchant case via CLI:

```bash
npx tsx -e "import { PrismaClient } from './generated/prisma/client'; const p = new PrismaClient(); (async () => { const m = await p.merchant.findFirst({ where: { branches: { some: { isMainBranch: true } } }, select: { id: true, businessName: true, branches: { select: { id: true, isMainBranch: true } } } }); console.log(JSON.stringify(m, null, 2)); const favs = await p.favouriteBranch.findMany({ where: { branchId: { in: m.branches.map(b => b.id) } }, select: { branchId: true, userId: true } }); console.log('FavouriteBranch rows for this merchant:', favs); await p.\$disconnect() })()"
```

Inspect the output and confirm: any `FavouriteBranch` row for this merchant references the branch where `isMainBranch=true`, never a secondary branch.

- [ ] **Step 9.7** — Document the local run output (pre-run count, post-run count, script summary, idempotency-run summary) in the M1 checkpoint message to the owner for review.

---

### [ M1 REVIEW CHECKPOINT ]

- [ ] **Dispatch code review subagent** on M1 commits (`prisma/`, `src/api/customer/favourites/`, `src/api/customer/discovery/`, `src/api/customer/voucher/`, `tests/api/customer/favourites/`, `tests/api/customer/discovery/`, `tests/api/customer/merchant/`, `tests/api/customer/voucher/`, `tests/scripts/`). Focus: spec compliance + global sort correctness + backfill idempotency.
- [ ] **Owner sign-off on M1** before starting M2. The backend additive emit must be verifiable by the customer-app via manual API call inspection before customer-app code consumes it.

---

## M2 — Customer-app surface

### Task M2.1 — API client + Zod schemas

**Files:**
- Create: `apps/customer-app/src/lib/api/favourites.ts`
- Modify: `apps/customer-app/src/lib/api/voucher.ts` (additive `isFavourited` field)
- Modify: `apps/customer-app/src/lib/api/merchant.ts` (or `discovery.ts` — wherever the merchant profile schema lives; additive `selectedBranch.isFavourited` + `branches[i].isFavourited`)
- Create: `apps/customer-app/tests/lib/api/favourites.test.ts`

- [ ] **Step 1.1** — Write `favourites.ts`:

```ts
import { z } from 'zod'
import { api } from '../api'

const favouriteBranchItemSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  branch: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string().nullable(),
    addressLine1: z.string().nullable(),
    city: z.string().nullable(),
    postcode: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    isOpen: z.boolean(),
  }),
  merchant: z.object({
    id: z.string(),
    businessName: z.string(),
    logo: z.string().nullable(),
    status: z.string(),
  }),
  voucherCount: z.number(),
  maxEstimatedSaving: z.number().nullable(),
  isUnavailable: z.boolean(),
  favouritedAt: z.string(),
})

const favouriteBranchesResponseSchema = z.object({
  items: z.array(favouriteBranchItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

// (Mirror the voucher response shape — existing schema may already cover this; extend if missing.)

export const favouritesApi = {
  getBranches: (page = 1, limit = 20) =>
    api.get<unknown>('/api/v1/customer/favourites/branches', { page, limit })
      .then(favouriteBranchesResponseSchema.parse),
  addBranch: (branchId: string) =>
    api.post(`/api/v1/customer/favourites/branches/${branchId}`),
  removeBranch: (branchId: string) =>
    api.del(`/api/v1/customer/favourites/branches/${branchId}`),
  getVouchers: (page = 1, limit = 20) =>
    api.get<unknown>('/api/v1/customer/favourites/vouchers', { page, limit })
      .then(/* existing voucher list schema */),
  addVoucher: (voucherId: string) =>
    api.post(`/api/v1/customer/favourites/vouchers/${voucherId}`),
  removeVoucher: (voucherId: string) =>
    api.del(`/api/v1/customer/favourites/vouchers/${voucherId}`),
  // Kept live during transition — removed in cleanup PR
  addMerchant: (merchantId: string) =>
    api.post(`/api/v1/customer/favourites/merchants/${merchantId}`),
  removeMerchant: (merchantId: string) =>
    api.del(`/api/v1/customer/favourites/merchants/${merchantId}`),
}
```

- [ ] **Step 1.2** — Extend `voucher.ts` schema with `isFavourited: z.boolean()` on the voucher detail response.

- [ ] **Step 1.3** — Extend `merchant.ts` (or `discovery.ts`) schema with `selectedBranch.isFavourited: z.boolean()` and `branches[i].isFavourited: z.boolean()`.

- [ ] **Step 1.4** — Write `favourites.test.ts` covering Zod parse parity for branches list + voucher list responses.

- [ ] **Step 1.5** — Type-check + run pin:

```bash
cd apps/customer-app && ./node_modules/.bin/tsc --noEmit
npx jest tests/lib/api/favourites.test.ts --forceExit
```

- [ ] **Step 1.6** — Commit:

```bash
git add apps/customer-app/src/lib/api/favourites.ts apps/customer-app/src/lib/api/voucher.ts apps/customer-app/src/lib/api/merchant.ts apps/customer-app/tests/lib/api/favourites.test.ts
git commit -m "feat(favourites): customer-app API client + additive Zod fields (M2.1)"
```

---

### Task M2.2 — useFavourite hook extension

**Files:**
- Modify: `apps/customer-app/src/hooks/useFavourite.ts`
- Modify: `apps/customer-app/tests/hooks/useFavourite.test.tsx`

- [ ] **Step 2.1** — Extend the discriminator:

```ts
type FavouriteEntity = 'branch' | 'voucher' | 'merchant'

interface UseFavouriteOptions {
  type: FavouriteEntity
  id: string
  initialIsFavourited: boolean
  contextualQueryKey?: readonly unknown[]
}
```

- [ ] **Step 2.2** — Implement the `'branch'` branch (POST/DELETE to `/favourites/branches/:id`) and invalidate `['favouriteBranches']`. Keep `'merchant'` working unchanged.

- [ ] **Step 2.3** — On `onSuccess`, also invalidate `contextualQueryKey` if provided.

- [ ] **Step 2.4** — Extend the test file:
  - New case: `'branch'` discriminator end-to-end (POST + invalidate).
  - New case: `contextualQueryKey` is invalidated alongside the list key.
  - Existing pessimistic-toggle pins continue passing.

- [ ] **Step 2.5** — Type-check + run pin:

```bash
cd apps/customer-app && npx jest tests/hooks/useFavourite.test.tsx --forceExit
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 2.6** — Commit:

```bash
git add apps/customer-app/src/hooks/useFavourite.ts apps/customer-app/tests/hooks/useFavourite.test.tsx
git commit -m "feat(favourites): useFavourite gains 'branch' discriminator + contextualQueryKey (M2.2)"
```

---

### Task M2.3 — `<FavouriteHeart>` shared component

**Files:**
- Create: `apps/customer-app/src/features/favourites/components/FavouriteHeart.tsx`
- Create: `apps/customer-app/src/features/favourites/__tests__/FavouriteHeart.test.tsx`

- [ ] **Step 3.1** — Implement `<FavouriteHeart>` per spec §7.2.1. Props: `entity`, `id`, `initialIsFavourited`, `tone?`, `size?`, `disabled?`, `contextualQueryKey?`, `testID?`. Internally calls `useFavourite()`.

- [ ] **Step 3.2** — Implement tone variants — `on-light`, `on-dark`, `on-gradient`. Each maps to a specific (icon stroke + icon fill + background overlay) combo per the existing surface patterns.

- [ ] **Step 3.3** — Implement the press handler + scale animation (1.0 → 1.15 → 1.0 over 200ms ease-out) gated by `useReduceMotion()`.

- [ ] **Step 3.4** — Implement accessibility — `accessibilityRole="button"`, `accessibilityLabel` switching on `isFavourited`, `accessibilityState={{ disabled }}`.

- [ ] **Step 3.5** — Write `FavouriteHeart.test.tsx`:
  - `entity="branch"` → press calls `useFavourite('branch', id, ...)` (mock the hook + assert).
  - `entity="voucher"` → same for voucher discriminator.
  - `contextualQueryKey` passes through to the hook.
  - `disabled={true}` suppresses press + applies dimmed style.
  - Reduce-motion: colour-only flip, no scale.
  - A11y label switches on `isFavourited`.
  - **Static-source pin**: read `apps/customer-app/src/` recursively; assert `useFavourite()` is called ONLY from `FavouriteHeart.tsx` and `useRemoveFavourite.ts`. Regression pin against future contributors calling it inline.

- [ ] **Step 3.6** — Type-check + run pin:

```bash
cd apps/customer-app && npx jest src/features/favourites/__tests__/FavouriteHeart.test.tsx --forceExit
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 3.7** — Commit:

```bash
git add apps/customer-app/src/features/favourites/components/FavouriteHeart.tsx apps/customer-app/src/features/favourites/__tests__/FavouriteHeart.test.tsx
git commit -m "feat(favourites): <FavouriteHeart> shared component + contract + static-source pin (M2.3)"
```

---

### Task M2.4 — List hooks (useFavouriteBranches, useFavouriteVouchers, useRemoveFavourite)

**Files:**
- Create: `apps/customer-app/src/features/favourites/hooks/useFavouriteBranches.ts`
- Create: `apps/customer-app/src/features/favourites/hooks/useFavouriteVouchers.ts`
- Create: `apps/customer-app/src/features/favourites/hooks/useRemoveFavourite.ts`
- Create: `apps/customer-app/src/features/favourites/__tests__/useRemoveFavourite.test.tsx`

- [ ] **Step 4.1** — Implement `useFavouriteBranches()` as `useInfiniteQuery` with `queryKey: ['favouriteBranches']`, `queryFn: ({ pageParam = 1 }) => favouritesApi.getBranches(pageParam, 20)`, `getNextPageParam: (lastPage) => lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined`.

- [ ] **Step 4.2** — Implement `useFavouriteVouchers()` identically (different endpoint).

- [ ] **Step 4.3** — Implement `useRemoveFavourite(type: 'branch' | 'voucher')`:
  - Optimistic `setQueryData` on the relevant list cache → splice the row out.
  - Hold the removed row + 4s timeout in a ref.
  - On `undo()` → splice the row back in + clear the timer (no DELETE fires).
  - On timeout → fire `favouritesApi.removeBranch(id)` or `removeVoucher(id)`. On error → restore the row + show error toast.

- [ ] **Step 4.4** — Write `useRemoveFavourite.test.tsx`:
  - Optimistic remove flips the list cache immediately.
  - `undo()` within 4s restores the row + no DELETE call fires.
  - Timeout after 4s fires DELETE.
  - DELETE error rolls back + shows error toast.

- [ ] **Step 4.5** — Type-check + run pin:

```bash
cd apps/customer-app && npx jest src/features/favourites/__tests__/useRemoveFavourite.test.tsx --forceExit
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4.6** — Commit:

```bash
git add apps/customer-app/src/features/favourites/hooks apps/customer-app/src/features/favourites/__tests__/useRemoveFavourite.test.tsx
git commit -m "feat(favourites): list hooks + useRemoveFavourite with optimistic-undo (M2.4)"
```

---

### Task M2.5 — Favourites screen + cards + skeleton + empty state + undo toast

**Files:**
- Create: `apps/customer-app/src/features/favourites/screens/FavouritesScreen.tsx`
- Create: `apps/customer-app/src/features/favourites/components/FavouritesHeader.tsx`
- Create: `apps/customer-app/src/features/favourites/components/BranchFavCard.tsx`
- Create: `apps/customer-app/src/features/favourites/components/VoucherFavCard.tsx`
- Create: `apps/customer-app/src/features/favourites/components/SwipeToRemove.tsx`
- Create: `apps/customer-app/src/features/favourites/components/UndoToast.tsx`
- Create: `apps/customer-app/src/features/favourites/components/FavouritesEmptyState.tsx`
- Create: `apps/customer-app/src/features/favourites/components/FavouritesSkeleton.tsx`
- Create: `apps/customer-app/src/features/favourites/__tests__/FavouritesScreen.test.tsx`
- Create: `apps/customer-app/src/features/favourites/__tests__/BranchFavCard.test.tsx`
- Create: `apps/customer-app/src/features/favourites/__tests__/VoucherFavCard.test.tsx`
- Create: `apps/customer-app/src/features/favourites/__tests__/vouchers-server-sort.test.tsx`
- Create: `apps/customer-app/app/(app)/favourites.tsx` (3-line re-export)

- [ ] **Step 5.1** — Implement `<FavouritesScreen>` with tab state from URL `?tab=places|vouchers`, default Places, safe-area-aware ScrollView wrapper (per the locked Profile pattern from PR #135 §3), pull-to-refresh, infinite scroll with `<FlatList>`.

- [ ] **Step 5.2** — Implement `<FavouritesHeader>` — tab switcher with counts ("Places · 12 / Vouchers · 8").

- [ ] **Step 5.3** — Implement `<BranchFavCard>` per spec §8.1. Tap → `router.push('/(app)/merchant/[id]?branch=<branchId>&from=favourites')`. No `<FavouriteHeart>` on the card (swipe-to-remove is the removal path).

- [ ] **Step 5.4** — Implement `<VoucherFavCard>` per spec §9.1. Renders state pill via `<VoucherCardStatePill>` (existing). Tap → `router.push('/(app)/voucher/[id]?from=favourites')`. No `<FavouriteHeart>`.

- [ ] **Step 5.5** — Implement `<SwipeToRemove>` pan-responder gesture wrapper. Reveals "Remove" affordance at 80pt slide threshold.

- [ ] **Step 5.6** — Implement `<UndoToast>` — slide-up from bottom, countdown bar over 4s, "Undo" button, dismisses on swipe-up.

- [ ] **Step 5.7** — Implement `<FavouritesEmptyState>` — lightweight icon (no bespoke illustration), per-tab copy, CTA button.

- [ ] **Step 5.8** — Implement `<FavouritesSkeleton>` — 3-5 skeleton rows matching the active card layout.

- [ ] **Step 5.9** — Create `app/(app)/favourites.tsx`:

```tsx
import { FavouritesScreen } from '@/features/favourites/screens/FavouritesScreen'
export default FavouritesScreen
```

- [ ] **Step 5.10** — Write the test files (`FavouritesScreen.test.tsx`, `BranchFavCard.test.tsx`, `VoucherFavCard.test.tsx`, `vouchers-server-sort.test.tsx`) covering the assertions in spec §14. The server-sort test mocks `favouritesApi.getVouchers` to return a deliberately-non-favouritedAt-sorted page and asserts the `<FlatList>` renders in that exact order.

- [ ] **Step 5.11** — Type-check + run pins:

```bash
cd apps/customer-app && npx jest src/features/favourites --forceExit
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5.12** — Commit:

```bash
git add apps/customer-app/src/features/favourites apps/customer-app/app/(app)/favourites.tsx
git commit -m "feat(favourites): FavouritesScreen + Places/Vouchers cards + skeleton + empty + undo (M2.5)"
```

---

### Task M2.6 — Tab-bar entry

**Files:**
- Modify: `apps/customer-app/app/(app)/_layout.tsx`

- [ ] **Step 6.1** — Add a `<Tabs.Screen name="favourites" options={{ title: 'Favourites', tabBarIcon: ({ focused }) => <FavouritesIcon focused={focused} /> }} />` between Map and Savings.

- [ ] **Step 6.2** — Add a small `FavouritesIcon` function in `_layout.tsx` matching the pattern of `HomeIcon` / `MapIcon` etc. Use Lucide `Heart` from `@/design-system/icons`.

- [ ] **Step 6.3** — Type-check + run smoke test on the route:

```bash
cd apps/customer-app && ./node_modules/.bin/tsc --noEmit
npx jest tests/app/_layout.test.tsx --forceExit  # if such a smoke test exists
```

- [ ] **Step 6.4** — Commit:

```bash
git add apps/customer-app/app/(app)/_layout.tsx
git commit -m "feat(favourites): add Favourites tab between Map and Savings (M2.6)"
```

---

### Task M2.7 — BranchTile internal refactor (renders FavouriteHeart, drops onFavourite prop)

**Files:**
- Modify: `apps/customer-app/src/shared/BranchTile.tsx`
- Modify: `apps/customer-app/tests/features/discovery/BranchTile.test.tsx` (or wherever the existing test lives)
- Create: `apps/customer-app/tests/features/home/home-rail-favourite-invalidation.test.tsx`

- [ ] **Step 7.1** — In `<BranchTile>`, replace the inline heart UI with:

```tsx
<FavouriteHeart
  entity="branch"
  id={branch.id}
  initialIsFavourited={branch.isFavourited}
  tone="on-gradient"  // BranchTile uses gradient cards
/>
```

- [ ] **Step 7.2** — Drop the `onFavourite?: () => void` callback prop from `<BranchTile>`'s interface. This is a breaking change for the rail consumers — they'll be updated in M2.8.

- [ ] **Step 7.3** — Update the BranchTile test to assert `<FavouriteHeart>` is rendered as a child (testID `favourite-heart` or similar).

- [ ] **Step 7.4** — Write `home-rail-favourite-invalidation.test.tsx` — pin that heart-tap on a Home rail BranchTile invalidates `['favouriteBranches']` (mock the query client, assert invalidation fires).

- [ ] **Step 7.5** — Type-check + run pins:

```bash
cd apps/customer-app && npx jest src/shared tests/features/home/home-rail-favourite-invalidation --forceExit
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 7.6** — Commit:

```bash
git add apps/customer-app/src/shared/BranchTile.tsx apps/customer-app/tests/features
git commit -m "feat(favourites): BranchTile renders FavouriteHeart, drops onFavourite prop (M2.7)"
```

---

### Task M2.8 — Consumer migration: search/home/map/category surfaces (drop callbacks)

**Files (rail consumers — drop `onFavourite` callback wiring):**
- Modify: `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx`
- Modify: `apps/customer-app/src/features/home/components/TrendingSection.tsx`
- Modify: `apps/customer-app/src/features/home/components/PopularSection.tsx`
- Modify: `apps/customer-app/src/features/home/components/NearbyByCategory.tsx`
- Modify: `apps/customer-app/src/features/map/components/MapBranchTile.tsx` (if it doesn't already use BranchTile, render `<FavouriteHeart>` directly)
- Modify: `apps/customer-app/src/features/search/components/SearchResultItem.tsx` (replace inline `useFavourite` with `<FavouriteHeart>`)
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx` (drop any `onFavourite` props passed down to rails)

- [ ] **Step 8.1** — For each rail component (FeaturedCarousel, TrendingSection, PopularSection, NearbyByCategory): remove the `onFavourite` callback prop on the BranchTile usage. The rail no longer needs to be involved.

- [ ] **Step 8.2** — In `<SearchResultItem>`: drop the inline `useFavourite('merchant', tile.merchant.id, ...)` call + inline heart UI. Replace with `<FavouriteHeart entity="branch" id={tile.id} initialIsFavourited={tile.isFavourited} tone="on-light" />`.

- [ ] **Step 8.3** — In `<MapBranchTile>`: same swap.

- [ ] **Step 8.4** — Update `SearchResultItem.test.tsx` per spec §14: heart calls `useFavourite('branch', tile.id, ...)` via `<FavouriteHeart>`.

- [ ] **Step 8.5** — Run focused tests on each surface + tsc:

```bash
cd apps/customer-app && npx jest tests/features/search tests/features/home tests/features/map --forceExit
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 8.6** — Commit:

```bash
git add apps/customer-app/src/features/{search,home,map} apps/customer-app/tests/features
git commit -m "feat(favourites): consumer migration — search/home/map/category use FavouriteHeart (M2.8)"
```

---

### Task M2.9 — Consumer migration: Merchant Profile (HeroSection + VoucherCard)

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/HeroSection.tsx`
- Modify: `apps/customer-app/src/features/merchant/components/VoucherCard.tsx`
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` (drop any callback wiring)
- Modify or create: `apps/customer-app/tests/features/merchant/hero-favourite-branch-switch.test.tsx`

- [ ] **Step 9.1** — In `<HeroSection>`: drop the inline `useFavourite('merchant', merchant.id, ...)` call + inline heart UI. Replace with:

```tsx
<FavouriteHeart
  entity="branch"
  id={selectedBranch.id}
  initialIsFavourited={selectedBranch.isFavourited}
  tone="on-dark"
  contextualQueryKey={['merchantProfile', merchantId, branchId]}
/>
```

- [ ] **Step 9.2** — In `<VoucherCard>`: drop the parent-wired heart wiring. Replace with `<FavouriteHeart entity="voucher" id={voucher.id} initialIsFavourited={voucher.isFavourited} tone="on-gradient" contextualQueryKey={['merchantProfile', merchantId, branchId]} />`. Keep the existing card layout (heart top-right corner).

- [ ] **Step 9.3** — In `<MerchantProfileScreen>`: remove any obsolete `onToggleFavourite` callback wiring to children.

- [ ] **Step 9.4** — Write or extend `hero-favourite-branch-switch.test.tsx`: pin that switching branches in the picker passes a new `id` + `initialIsFavourited` to `<FavouriteHeart>`. Heart visual re-evaluates on prop change.

- [ ] **Step 9.5** — Run focused tests + tsc:

```bash
cd apps/customer-app && npx jest tests/features/merchant src/features/merchant --forceExit
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 9.6** — Commit:

```bash
git add apps/customer-app/src/features/merchant apps/customer-app/tests/features/merchant
git commit -m "feat(favourites): consumer migration — Merchant Profile hero + voucher cards (M2.9)"
```

---

### Task M2.10 — Consumer migration: Voucher Detail + §O4 closure

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/CouponHeader.tsx`
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`
- Create: `apps/customer-app/tests/features/voucher/voucher-detail-favourite.test.tsx`

- [ ] **Step 10.1** — In `<CouponHeader>`: drop the `isFavourited` + `onFav` props. Inside the nav row, render:

```tsx
<FavouriteHeart
  entity="voucher"
  id={voucher.id}
  initialIsFavourited={voucher.isFavourited}
  tone="on-dark"
  contextualQueryKey={['voucher', voucherId]}
  disabled={isRedeemedThisCycle}
/>
```

- [ ] **Step 10.2** — In `<VoucherDetailScreen>`: delete the `handleFav` stub at line ~1005 (`Alert.alert('Coming next milestone', ...)`) and the `onFav={handleFav}` prop passing on `<CouponHeader>`.

- [ ] **Step 10.3** — Write `voucher-detail-favourite.test.tsx`: pin §O4 closure — `<CouponHeader>` renders `<FavouriteHeart>`, tapping it calls `useFavourite('voucher', ...)`, NOT `Alert.alert`.

- [ ] **Step 10.4** — Run focused tests + tsc:

```bash
cd apps/customer-app && npx jest tests/features/voucher src/features/voucher --forceExit
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 10.5** — Commit:

```bash
git add apps/customer-app/src/features/voucher apps/customer-app/tests/features/voucher
git commit -m "feat(favourites): Voucher Detail — §O4 closure via <FavouriteHeart> (M2.10)"
```

---

### Task M2.11 — Customer-app regression sweep

**Files:** none new; runs the full customer-app sweep.

- [ ] **Step 11.1** — Full customer-app sweep:

```bash
cd apps/customer-app && npx jest --forceExit
./node_modules/.bin/tsc --noEmit
```

Expected: 0 failures, tsc EXIT 0.

- [ ] **Step 11.2** — If any pre-existing test fails because of an integration with the new model, classify: (a) update test to reflect the new contract, (b) flag as a regression and fix the source.

- [ ] **Step 11.3** — Run the ownership-boundary check:

```bash
gh api repos/MSC23-bot/Redeemo/compare/main...feature/favourites-branch-level --jq '.files[].filename'
```

Confirm every file is within the global ownership boundary at the top of this plan.

- [ ] **Step 11.4** — Commit any final fixes:

```bash
git commit -m "fix(favourites): customer-app sweep cleanups (M2.11)"
```

---

### [ M2 REVIEW CHECKPOINT ]

- [ ] **Dispatch code review subagent** on M1 + M2 commits. Focus: spec compliance (every entry-point goes through `<FavouriteHeart>`), §O4 closure, no inline `useFavourite()` outside the canonical components, server-sort correctness (customer-app does NOT re-sort).
- [ ] **Owner device-QA** per the checklist below.
- [ ] Open PR via `gh pr create --base main --head feature/favourites-branch-level`.
- [ ] SHA-bound merge after owner approval (per the standing workflow hook).

---

## Regression-pin matrix (cross-reference)

Backend (per spec §13):

| Pin | File | Purpose |
|---|---|---|
| Routes | `tests/api/customer/favourites/branches.routes.test.ts` | POST/DELETE/GET + ALREADY_FAVOURITED + FAVOURITE_NOT_FOUND + BRANCH_NOT_FOUND |
| Service | `tests/api/customer/favourites/branches.service.test.ts` | listFavouriteBranches enrichment + global sort + location-confidence redaction |
| Vouchers global sort | `tests/api/customer/favourites/vouchers.global-sort.test.ts` | Cross-page priority ordering |
| Threshold parity | `tests/api/customer/favourites/vouchers.threshold-parity.test.ts` | Backend URGENT_THRESHOLD_MS = 60 * 60_000 |
| Discovery isFavourited | `tests/api/customer/discovery/branch-tile-isFavourited.test.ts` | Branch-keyed lookup |
| Merchant additive | `tests/api/customer/merchant/isFavourited-additive.test.ts` | selectedBranch.isFavourited + branches[i].isFavourited |
| Voucher additive | `tests/api/customer/voucher/isFavourited-additive.test.ts` | voucher.isFavourited (§O4 backend) |
| Backfill | `tests/scripts/backfill-favourite-branches.test.ts` | Idempotency + main-branch only + anomaly skip + dry-run |

Customer-app (per spec §14):

| Pin | File | Purpose |
|---|---|---|
| Hook | `apps/customer-app/tests/hooks/useFavourite.test.tsx` | Branch discriminator + contextualQueryKey |
| API | `apps/customer-app/tests/lib/api/favourites.test.ts` | Zod parse parity |
| Heart component | `apps/customer-app/src/features/favourites/__tests__/FavouriteHeart.test.tsx` | Contract + static-source pin |
| Screen | `apps/customer-app/src/features/favourites/__tests__/FavouritesScreen.test.tsx` | Tab switch + URL param + pull-to-refresh + empty + skeleton |
| Branch card | `apps/customer-app/src/features/favourites/__tests__/BranchFavCard.test.tsx` | States + tap → merchant profile |
| Voucher card | `apps/customer-app/src/features/favourites/__tests__/VoucherFavCard.test.tsx` | 9-state matrix + tap → voucher detail |
| Server sort | `apps/customer-app/src/features/favourites/__tests__/vouchers-server-sort.test.tsx` | No client-side re-sort |
| Remove + undo | `apps/customer-app/src/features/favourites/__tests__/useRemoveFavourite.test.tsx` | Optimistic + undo + error path |
| Voucher detail | `apps/customer-app/tests/features/voucher/voucher-detail-favourite.test.tsx` | §O4 closure |
| Home rail | `apps/customer-app/tests/features/home/home-rail-favourite-invalidation.test.tsx` | BranchTile renders FavouriteHeart, list invalidates |
| Merchant hero | `apps/customer-app/tests/features/merchant/hero-favourite-branch-switch.test.tsx` | Branch picker switch re-evaluates heart |
| Search | `apps/customer-app/tests/features/search/SearchResultItem.test.tsx` | Branch-level via FavouriteHeart |

---

## Device-QA checklist (M2 review checkpoint)

Run on iOS device after M2.11 verification passes. Each item must be visually confirmed.

### Heart entry points (must work on every surface)

- [ ] **Search results** — tap a heart on a result row → heart fills, persists on scroll, persists on Search exit + re-enter.
- [ ] **Home Featured rail** — heart on a featured tile → fills + invalidates Favourites tab (verify by switching to Favourites and back).
- [ ] **Home Trending rail** — same.
- [ ] **Home Popular rail** — same.
- [ ] **Home NearbyByCategory rail** — same.
- [ ] **Map carousel** — heart on a map carousel tile → fills.
- [ ] **Map list view** — heart on a list-view tile → fills.
- [ ] **Category results** — heart on a category result → fills.
- [ ] **Merchant Profile hero (single-branch merchant)** — heart fills.
- [ ] **Merchant Profile hero (multi-branch merchant) — branch switch** — favourite Branch A, switch picker to Branch B → heart icon EMPTY (Branch B is not favourited). Switch back to Branch A → heart icon FILLED.
- [ ] **Merchant Profile voucher card** — heart on a voucher card → fills.
- [ ] **Voucher Detail (`<CouponHeader>` nav row)** — heart in the nav row → fills. (Closes §O4 — was previously the `Alert("Coming next milestone")` stub.)
- [ ] **Voucher Detail in redeemed-this-cycle state** — heart icon dimmed (disabled), no press response.

### Favourites tab — Places

- [ ] Tab is present in the bottom tab bar between Map and Savings.
- [ ] Tap tab → Favourites screen opens with Places tab active by default.
- [ ] Tab header shows "Places · N" + "Vouchers · M" counts.
- [ ] Empty state when no favourites — shows lightweight icon + copy + "Discover places" CTA.
- [ ] CTA navigates to Home.
- [ ] After favouriting a few branches, the Places tab shows them sorted: open-now first, then closed-but-active, then unavailable last. Within each bucket, by recency.
- [ ] Card layout matches spec §8.1 — logo, branch name, merchant name, location, distance (if GPS), open/closed pill, voucher count.
- [ ] Tap a card → navigates to `/(app)/merchant/[id]?branch=<branchId>&from=favourites`. Back button returns to Favourites.
- [ ] Swipe left on a card → reveals "Remove" affordance.
- [ ] Tap Remove → card animates off; UndoToast appears with 4s countdown.
- [ ] Tap "Undo" within 4s → card animates back into the list.
- [ ] Let the toast time out → row stays gone after refresh.
- [ ] Pull-to-refresh on the list → fresh data fetched.
- [ ] Infinite scroll past 20 items → next page loads.

### Favourites tab — Vouchers

- [ ] Tab switch to Vouchers → tab content shows.
- [ ] Empty state per Vouchers tab — same pattern as Places with appropriate copy + "Browse vouchers" CTA.
- [ ] Sort across pages is globally correct: an urgent TIME_LIMITED voucher favourited LAST appears ABOVE non-urgent vouchers favourited earlier — even when paginating.
- [ ] All 9 voucher states render correctly:
  - [ ] Active + available — default styling.
  - [ ] Urgent (TIME_LIMITED <60min) — amber/coral pill with countdown.
  - [ ] REUSABLE available — "AVAILABLE NOW" green pill.
  - [ ] REUSABLE cooldown — 75% opacity + "Available again · 23m left" pill.
  - [ ] Redeemed this cycle (non-REUSABLE) — diagonal "Voucher Redeemed" overprint + "Returns DD MMM" pill.
  - [ ] TL outside window — 75% opacity + "Available Mon-Fri 12-2pm" or next-opening pill.
  - [ ] Unavailable (suspended) — greyed + "Unavailable" pill.
  - [ ] Expired — greyed + "Expired" pill.
  - [ ] Free-user locked — standard styling + lock affordance.
- [ ] Tap a voucher card → navigates to `/(app)/voucher/[id]?from=favourites`. Back returns to Favourites.
- [ ] Swipe-to-remove + undo works on the Vouchers tab.
- [ ] Pull-to-refresh works.
- [ ] Infinite scroll works.

### Cross-surface eventual consistency (acceptable per locked invariant)

- [ ] Toggle a heart on Home → switch to Favourites → row appears (fresh).
- [ ] Remove a row from Favourites tab → switch to Home → eventually (on focus + refetch) the heart on that tile updates to empty. Stale state until refetch is acceptable v1.

### Motion / animation

- [ ] Heart toggle has subtle scale animation (1.0 → 1.15 → 1.0). Toggle Settings → Reduce Motion ON → heart toggle animation is now colour-only (no scale).
- [ ] Card swipe animation is smooth.
- [ ] UndoToast slide-up is smooth + countdown bar progresses.

### Edge cases

- [ ] Guest user (no auth) — Favourites tab shows the empty state for both tabs (or sign-in prompt; v1 product call).
- [ ] No internet — Favourites tab gracefully shows skeleton/empty + retry pattern.
- [ ] Heart toggle while offline — pessimistic toggle never advances; show error toast.
- [ ] Voucher Detail in redeemed-state with the new disabled heart — visual confirms the heart is dimmed.

---

## Cleanup PR placeholder (NOT bundled with v1)

After v1 stabilises on `main`, file a separate Tier 1 cleanup PR.

**Cleanup PR scope (placeholder; full plan to be drafted at filing time):**

- Drop `useFavourite` `'merchant'` discriminator. Codebase grep confirms zero remaining call sites.
- Remove `favouritesApi.addMerchant` / `removeMerchant` from `apps/customer-app/src/lib/api/favourites.ts`.
- Remove `merchant.isFavourited` from `/merchants/:id` wire shape + corresponding Zod schema field on customer-app.
- Remove `addFavouriteMerchant` / `removeFavouriteMerchant` / `listFavouriteMerchants` from `src/api/customer/favourites/service.ts`.
- Remove `POST/DELETE /api/v1/customer/favourites/merchants/:id` + `GET /favourites/merchants` from `src/api/customer/favourites/routes.ts`.
- Drop `FavouriteMerchant` model from `prisma/schema.prisma` + new migration `<YYYYMMDDHHMMSS>_drop_favourite_merchant` (Prisma auto-stamps).
- Drop tests covering the removed code paths.
- Drop the v1 backfill script `prisma/backfill-favourite-branches.ts` (one-shot, no longer needed).

**Cleanup PR trigger:** owner direction after v1 ships and one stabilisation cycle passes.

**Placeholder filing location:** `docs/superpowers/plans/<YYYY-MM-DD>-favourites-cleanup.md` (to be created at trigger).

---

## Risks (cross-reference spec §17)

See spec §17 for the full risk + mitigation table. Plan-level highlights:

1. **Schema migration ordering in deployment** — migrate → backfill → release customer-app. Pre-launch context relaxes this, but the order is still enforced in the plan (M1.1 → M1.2 → M1.9 backfill → M1 review → M2).
2. **Backfill anomaly handling** — script logs skipped counts; owner reviews in M1.9.
3. **Cross-feature import of `<FavouriteHeart>`** — `src/shared/BranchTile.tsx`, `src/features/merchant/components/HeroSection.tsx`, `src/features/merchant/components/VoucherCard.tsx`, `src/features/voucher/components/CouponHeader.tsx` all import from `@/features/favourites/components/FavouriteHeart`. Matches the existing cross-feature import pattern (e.g. `useReduceMotion` from `features/profile/hooks/`). Acceptable.
4. **Static-source pin reliability** — the pin reads source files via `fs.readFileSync` to assert `useFavourite()` is not called outside canonical components. If a future refactor moves files, the pin may need its globs updated.
5. **Backend `URGENT_THRESHOLD_MS` drift** — guarded by `vouchers.threshold-parity.test.ts`. Both backend + customer-app constants should carry inline comments cross-referencing each other.
6. **Device-QA scope is large (~40 items)** — allocate a dedicated QA pass after M2.11. Don't time-box too short.

---

## Self-review

After completing each milestone, run:

1. **Spec compliance check**: re-read the spec at `docs/superpowers/specs/2026-05-28-favourites-branch-level-design.md` and verify every locked invariant in §2 + §5.3 + §6 + §7.2.1 + §9.3 holds in code.
2. **Placeholder scan**: `grep -n "TBD\|TODO\|FIXME\|XXX" docs/superpowers/plans/2026-05-28-favourites-branch-level.md` — none should remain.
3. **Tier-3 process discipline**: confirm spec + plan + reviews + device-QA all completed before PR open.

---

**Status:** Locked plan. Awaiting owner approval before subagent dispatch / manual execution.
