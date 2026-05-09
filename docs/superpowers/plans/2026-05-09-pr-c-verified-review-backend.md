# PR-C — Verified-review backend + routing implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** DRAFT — owner review pending. No implementation begins until this plan is reviewed and approved.
> **Date:** 2026-05-09
> **Workstream:** PR-C of the customer redemption polish pass (PR-A → PR-C → PR-B sequencing). PR-A merged 2026-05-09 at SHA `cd33c9a` (merge commit `a0bc8f3`).
> **Related plan:** [docs/superpowers/plans/2026-05-09-customer-redemption-polish-pass.md](2026-05-09-customer-redemption-polish-pass.md) — workstream charter + locked decisions §0.
> **Locked semantics:** §0.3 in the plan above (verified-review rules — staff validation NOT required).
> **Tier:** **Tier 2 / Tier 3 mix.** Backend schema migration + service validation = Tier 3 (architecture / contract change). Frontend wire-up = Tier 2 (rebaseline-style multi-file UI work).

---

**Goal:** Reintroduce the Rate & Review CTA on `SuccessPopup` with a real route to the merchant review surface, link the review to the redemption that triggered it, validate the linkage server-side, and surface the verification on the merchant reviews tab via a "Verified redemption" badge on `ReviewCard`.

**Architecture:** Additive `redemptionId String? @unique` column on `Review` + FK to `VoucherRedemption`. Server validates the linkage on every create/update by checking ownership + branch match + merchant-context match. Response shape gains `isVerified: boolean` derived from `redemptionId !== null`. Frontend plumbs `fromRedemptionId` from SuccessPopup → URL params → MerchantProfileScreen → ReviewsTab → WriteReviewSheet → API call. ReviewCard renders the verified badge when `review.isVerified === true`.

**Tech Stack:** Prisma 7 (driver adapter, no datasource URL in schema); Fastify + Zod on backend; React Native + Expo Router + TanStack Query on customer-app frontend. No new dependencies.

---

## 1. Background — locked decisions inherited from PR-A

These come from [the PR-A plan](2026-05-09-customer-redemption-polish-pass.md) and the §13 + §14 brief amendments. PR-C inherits and implements:

### §0.2 — Sequencing constraint

Rate & Review CTA cannot ship visible until the verified-review backend lands, so reviews submitted via that CTA never lose `redemptionId` attribution. PR-A explicitly hid the CTA via D12; PR-C reintroduces it.

### Path A — REPLACE existing reviewer-level `isVerified` semantics (LOCKED 2026-05-09 from owner Path A choice)

**Material discovery during T2 prep.** The reviews service already exposes `isVerified` in the API response, but the existing implementation has DIFFERENT semantics from the locked §0.3 rules:

- **Existing (`batchGetVerifiedSet` at `service.ts:10–20`):** "Has this user EVER validated a redemption at this branch?" — reviewer-level trust, bound to `(userId, branchId)`, REQUIRES `isValidated: true`.
- **PR-C §0.3:** "Is THIS review row linked to a specific redemption?" — review-level linkage, bound to `Review.redemptionId`, does NOT require `isValidated`.

Owner picked Path A: **fully replace** the existing semantics. Rationale: the badge should mean "this review came from a real redemption flow" (a per-review trust signal), not "this reviewer has been here before" (a per-reviewer trust signal). The badge becomes stricter and more trustworthy.

Implementation consequences:

1. Drop the `batchGetVerifiedSet` helper.
2. Add `redemptionId: true` to `REVIEW_SELECT`.
3. Derive `isVerified: review.redemptionId !== null` directly inside `formatReview` (single source of truth — no `opts.isVerified` plumbing).
4. Remove `isVerified` from the `formatReview` opts type.
5. Update existing tests that asserted the old "has validated past redemption → isVerified=true" behaviour.
6. Pre-PR-C reviews retain their original API shape but now report `isVerified: false` (because `redemptionId IS NULL`). Owner accepted this trade-off as part of Path A.

**No backfill of existing reviews.** Pre-PR-C reviews stay at `isVerified: false`. The badge becomes a forward-going signal of "linked to a specific redemption flow"; backfill would muddy that contract by attaching `redemptionId` to reviews that never went through the new flow.

### Review-system v2 — DEFERRED (Tier 3 brainstorm-first)

Owner direction 2026-05-09: the current review architecture (one per user-branch via `@@unique([userId, branchId])`, no abuse controls beyond `ReviewReport`/`isReported`) is a **placeholder**. PR-C does NOT touch it.

Future v2 needs to address:
- Multiple reviews per user-branch.
- Spam prevention.
- Foul-language / moderation tooling.
- Review rate limits.
- Merchant/branch abuse monitoring.
- Anti-flooding rules (one user can't flood a merchant or branch).

Tier 3 brainstorm-first when customer base + review volume warrant the investment. Recorded in [memory: project_deferred_followups_index.md §AI](../../../../.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md).

PR-C is intentionally narrow: link a review to its triggering redemption, mark verified, validate linkage. Nothing else about the review system changes.

### §0.3.1 — Auto-link + preserve amendment (LOCKED 2026-05-09 mid-PR-C)

After T1–T11 shipped, owner amended the verified-review contract: a review should be verified ALSO when the customer goes directly to the merchant-profile Reviews tab (no SuccessPopup CTA) and writes a review for a branch where they redeemed in the current cycle. Same row-level Path A contract (`isVerified ⇔ redemptionId !== null`); the server auto-populates the column when an eligible redemption exists.

**Three derivation paths in `upsertBranchReview`:**

| # | When | Behaviour |
|---|------|-----------|
| **Path A — strict** | Client passes explicit `data.redemptionId` | Validate the §0.3 5-condition rule. Mismatch → `REDEMPTION_NOT_FOUND` / `REDEMPTION_BRANCH_MISMATCH` / `REDEMPTION_MERCHANT_MISMATCH`. Match → persist that id. (Existing behaviour from T3.) |
| **Path B — auto-link** | Client does NOT pass `redemptionId` AND existing review has `redemptionId === null` (or no existing review) | Try to find the most recent eligible redemption: `userId` + `branchId` match, `voucher.merchantId === branch.merchantId`, `redeemedAt ∈ [cycleStart, cycleEnd)`. `orderBy redeemedAt desc, take 1`. None found → review persists with `redemptionId: null` (unverified, no error). |
| **Path C — preserve** | Client does NOT pass `redemptionId` AND existing review has `redemptionId !== null` | Keep the existing linkage. Don't clear, don't auto-link. (User editing rating/comment of an already-verified review must not lose verification.) |

**Cycle-window source:** `getCurrentCycleWindow(subscription.cycleAnchorDate, now)` (`src/api/subscription/cycle.ts`). If the user has no `Subscription` record (not even a cancelled one) → no auto-link possible (returns null, review persists unverified).

**Strictness asymmetry — intentional:**
- Path A (explicit): no cycle filter. User is asserting "this is the redemption I want linked"; server validates ownership / branch / merchant only. Verifies any redemption regardless of when it occurred.
- Path B (auto-link): cycle filter required. Server is inferring without explicit user confirmation, so the inference window is constrained to the current cycle. Limits abuse / staleness.

**Most-recent wins:** when multiple eligible redemptions exist in the current cycle window (rare — multiple vouchers redeemed at the same branch in the same month), the auto-link picks the most recent. This matches what the user is most likely thinking of when they sit down to write the review.

### §0.3 — Verified-review semantics (LOCKED — original 5-condition rule, still binding)

`review.isVerified === true` IFF all five conditions hold:

1. The review has a non-null `redemptionId`.
2. The redemption belongs to the authenticated customer (`redemption.userId === review.userId`).
3. The redemption's branch matches the review's target branch (`redemption.branchId === review.branchId`).
4. The redemption's voucher merchant matches the review branch's merchant (`redemption.voucher.merchantId === branch.merchantId`).
5. The redemption was successfully created (it exists in `VoucherRedemption` — no pending/failed states).

`isValidated === true` is a STRONGER signal but **explicitly NOT required**. Many merchants validate later or never; gating the verified badge on staff action would lock customers out of their own redemption-attribution.

### §0.10 / D11 / D24 — CTA framing

- `SuccessPopup` primary CTA stays `View voucher code` (D11).
- `SuccessPopup` secondary action returns: `Rate & Review` (PR-A defensive pin allows reintroduction).
- `RedemptionDetailsCard` CTA stays `Open staff view` (D24, PR-A).

---

## 2. File structure

### Files to create

| Path | Purpose |
|------|---------|
| `prisma/migrations/<timestamp>_add_review_redemption_link/migration.sql` | Additive nullable `redemptionId` column + FK + UNIQUE constraint on `Review` |
| `tests/api/customer/reviews/upsertBranchReview-redemption-link.test.ts` | Backend tests for redemption-link validation paths |
| `tests/api/customer/reviews/listMerchantReviews-isVerified.test.ts` | Backend tests for `isVerified` flag in list response |
| `apps/customer-app/tests/features/voucher/voucher-detail-rate-and-review-routing.test.tsx` | Frontend test for SuccessPopup → MerchantProfileScreen routing |
| `apps/customer-app/tests/features/merchant/merchant-profile-write-review-from-redemption.test.tsx` | Frontend test for WriteReviewSheet auto-open from URL params |
| `apps/customer-app/tests/features/merchant/review-card-verified-badge.test.tsx` | Frontend test for verified badge render |

### Files to modify

| Path | Change |
|------|--------|
| `prisma/schema.prisma` | Add `redemptionId String? @unique` + relation to `VoucherRedemption` on `Review` |
| `src/api/customer/reviews/service.ts` | Extend `upsertBranchReview` to accept + validate `redemptionId`; extend `listMerchantReviews` + `listBranchReviews` to surface `isVerified` |
| `src/api/customer/reviews/routes.ts` | Extend `reviewBody` Zod schema with optional `redemptionId` |
| `src/api/shared/errors.ts` | Add `REDEMPTION_BRANCH_MISMATCH` and `REDEMPTION_MERCHANT_MISMATCH` error codes (if not already present) |
| `apps/customer-app/src/lib/api/reviews.ts` | Extend `reviewSchema` with `isVerified: z.boolean()`; extend create-body type with optional `redemptionId` |
| `apps/customer-app/src/features/merchant/components/WriteReviewSheet.tsx` | Accept `fromRedemptionId?: string \| null` prop; render verified-banner when present; pass through to `useCreateReview` |
| `apps/customer-app/src/features/merchant/components/ReviewCard.tsx` | Render verified-redemption badge when `review.isVerified === true` |
| `apps/customer-app/src/features/merchant/components/ReviewsTab.tsx` | Accept `initialOpenWriteFor?: { branchId, redemptionId } \| null` prop; auto-open WriteReviewSheet on mount when set |
| `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` | Read URL params `openWriteReview=1`, `fromRedemption=<id>`, `branch=<id>`, `tab=reviews` on mount; route to ReviewsTab with `initialOpenWriteFor` |
| `apps/customer-app/src/features/merchant/hooks/useWriteReview.ts` | Pass `redemptionId` through to `reviewsApi.createReview` |
| `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx` | Reintroduce `Rate & Review` CTA in the secondary row; new `onRateReview: () => void` prop on Props |
| `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` | Wire `onRateReview` callback → `router.push('/(app)/merchant/<merchantId>?branch=<branchId>&tab=reviews&openWriteReview=1&fromRedemption=<redemptionId>')` |

### Test files to extend (existing)

| Path | Extension |
|------|-----------|
| `apps/customer-app/tests/features/voucher/success-popup.test.tsx` | Replace negative pins for "Rate & Review hidden" with positive pins for "Rate & Review CTA fires onRateReview". Re-add the `onRateReview` prop to `defaults` factory. |
| `apps/customer-app/tests/features/merchant/useWriteReview.test.tsx` | Pin `redemptionId` pass-through to `reviewsApi.createReview` |

---

## 3. Tasks

### Task 1 — Schema migration: add `redemptionId` to `Review`

**Files:**
- Modify: `prisma/schema.prisma:1031-1052` (the `Review` model block)
- Modify: `generated/prisma/client/*` (auto-generated by `prisma migrate dev`)
- Create: `prisma/migrations/<timestamp>_add_review_redemption_link/migration.sql`

- [ ] **Step 1: Update the Prisma schema**

In `prisma/schema.prisma`, replace the `Review` block to add the new column + relation:

```prisma
model Review {
  id           String   @id @default(uuid())
  userId       String
  branchId     String
  redemptionId String?  @unique
  rating       Int
  comment      String?
  isReported   Boolean  @default(false)
  reportReason String?
  isDeleted    Boolean  @default(false)
  isHidden     Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user         User                @relation(fields: [userId], references: [id])
  branch       Branch              @relation(fields: [branchId], references: [id])
  redemption   VoucherRedemption?  @relation(fields: [redemptionId], references: [id], onDelete: SetNull)
  reports      ReviewReport[]
  helpfuls     ReviewHelpful[]

  @@unique([userId, branchId])
  @@index([branchId])
  @@index([isReported])
}
```

Why `onDelete: SetNull`: a deleted redemption (rare — admin/audit cleanup) should NOT cascade-delete the review. Demote to non-verified instead.

- [ ] **Step 2: Add the back-reference on `VoucherRedemption`**

Find the `VoucherRedemption` model in `prisma/schema.prisma` and add the back-relation:

```prisma
review       Review?  // back-relation; at most one verified review per redemption (Review.redemptionId is @unique)
```

- [ ] **Step 3: Run migration in dev**

```bash
npx prisma migrate dev --name add_review_redemption_link
```

Expected: Prisma generates a new migration directory + applies it. The generated SQL should be:

```sql
ALTER TABLE "Review" ADD COLUMN "redemptionId" TEXT;
ALTER TABLE "Review" ADD CONSTRAINT "Review_redemptionId_key" UNIQUE ("redemptionId");
ALTER TABLE "Review" ADD CONSTRAINT "Review_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "VoucherRedemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Verify migration is safe (additive, nullable)**

Confirm in the generated migration.sql that:
- New column is nullable (`TEXT` without `NOT NULL`).
- New unique constraint allows multiple NULLs (Postgres default for `UNIQUE` on nullable).
- FK uses `ON DELETE SET NULL` (not CASCADE).
- No data backfill required — existing reviews stay with `redemptionId IS NULL`, which is `isVerified === false`.

- [ ] **Step 5: Run vitest baseline + commit**

Verify nothing broke:

```bash
npx vitest run --reporter=dot 2>&1 | tail -5
```

Expected: 483+ tests passing (existing baseline pre-PR-C).

```bash
git add prisma/schema.prisma prisma/migrations/<timestamp>_add_review_redemption_link/migration.sql generated/prisma/client
git commit -m "feat(review): add nullable redemptionId + FK to Review (PR-C T1)"
```

---

### Task 2 — Backend service: failing tests for redemption-link validation

**Files:**
- Create: `tests/api/customer/reviews/upsertBranchReview-redemption-link.test.ts`

- [ ] **Step 1: Write failing tests for the 5-condition validation**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { upsertBranchReview } from '../../../../src/api/customer/reviews/service'

const fakePrisma = () => ({
  branch:            { findUnique: vi.fn() },
  voucherRedemption: { findFirst:  vi.fn() },
  review:            { upsert:     vi.fn() },
})

describe('upsertBranchReview — redemption-link validation', () => {
  let prisma: ReturnType<typeof fakePrisma>

  beforeEach(() => {
    prisma = fakePrisma()
    prisma.branch.findUnique.mockResolvedValue({
      id: 'branch-1', merchantId: 'merchant-1', deletedAt: null,
    })
    prisma.review.upsert.mockResolvedValue({
      id: 'review-1', userId: 'user-1', branchId: 'branch-1',
      redemptionId: 'redemption-1', rating: 5, comment: 'Great',
      isReported: false, reportReason: null, isDeleted: false, isHidden: false,
      createdAt: new Date(), updatedAt: new Date(),
    })
  })

  it('SUCCESS: review with valid redemptionId persists redemptionId on the row', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-1', userId: 'user-1', branchId: 'branch-1',
      voucher: { merchantId: 'merchant-1' },
    })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
      rating: 5, comment: 'Great', redemptionId: 'redemption-1',
    })
    expect(prisma.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ redemptionId: 'redemption-1' }),
      update: expect.objectContaining({ redemptionId: 'redemption-1' }),
    }))
  })

  it('SUCCESS: review without redemptionId still creates (backwards-compat)', async () => {
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
      rating: 4, comment: 'Good',
    })
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
    expect(prisma.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ rating: 4, comment: 'Good' }),
    }))
  })

  it('REJECT: redemption owned by different user → REDEMPTION_NOT_FOUND', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)
    await expect(
      upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
        rating: 5, redemptionId: 'redemption-other-user',
      }),
    ).rejects.toMatchObject({ code: 'REDEMPTION_NOT_FOUND' })
    expect(prisma.review.upsert).not.toHaveBeenCalled()
  })

  it('REJECT: redemption.branchId does not match → REDEMPTION_BRANCH_MISMATCH', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-1', userId: 'user-1', branchId: 'branch-other',
      voucher: { merchantId: 'merchant-1' },
    })
    await expect(
      upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
        rating: 5, redemptionId: 'redemption-1',
      }),
    ).rejects.toMatchObject({ code: 'REDEMPTION_BRANCH_MISMATCH' })
    expect(prisma.review.upsert).not.toHaveBeenCalled()
  })

  it('REJECT: redemption.voucher.merchantId does not match → REDEMPTION_MERCHANT_MISMATCH', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-1', userId: 'user-1', branchId: 'branch-1',
      voucher: { merchantId: 'merchant-other' },
    })
    await expect(
      upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
        rating: 5, redemptionId: 'redemption-1',
      }),
    ).rejects.toMatchObject({ code: 'REDEMPTION_MERCHANT_MISMATCH' })
    expect(prisma.review.upsert).not.toHaveBeenCalled()
  })

  it('UPDATE: existing review row gains redemptionId via upsert', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-2', userId: 'user-1', branchId: 'branch-1',
      voucher: { merchantId: 'merchant-1' },
    })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
      rating: 5, redemptionId: 'redemption-2',
    })
    expect(prisma.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ redemptionId: 'redemption-2' }),
    }))
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run tests/api/customer/reviews/upsertBranchReview-redemption-link.test.ts 2>&1 | tail -10
```

Expected: 6 failures (function doesn't yet accept `redemptionId` or do validation).

---

### Task 3 — Backend service: implement redemption-link validation

**Files:**
- Modify: `src/api/customer/reviews/service.ts:166-???` (`upsertBranchReview` function)
- Modify: `src/api/shared/errors.ts` (add new error codes if missing)

- [ ] **Step 1: Add error codes to shared errors**

In `src/api/shared/errors.ts`, add (if not already present):

```ts
export const REDEMPTION_BRANCH_MISMATCH = httpError(400, 'REDEMPTION_BRANCH_MISMATCH', 'Redemption does not belong to this branch')
export const REDEMPTION_MERCHANT_MISMATCH = httpError(400, 'REDEMPTION_MERCHANT_MISMATCH', 'Redemption does not belong to this merchant')
```

(`REDEMPTION_NOT_FOUND` should already exist from PR #43 / Phase 2D — confirm before adding.)

- [ ] **Step 2: Extend `upsertBranchReview` signature + body**

```ts
export async function upsertBranchReview(
  prisma: PrismaLike,
  branchId: string,
  userId: string,
  data: { rating: number; comment?: string; redemptionId?: string },
) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId, deletedAt: null },
  })
  if (!branch) throw BRANCH_NOT_FOUND

  // Validate redemption linkage when provided.  Five conditions per
  // plan §0.3:
  //   1. review has a non-null redemptionId  (this branch — caller passed it)
  //   2. redemption belongs to the calling user
  //   3. redemption.branchId === target branchId
  //   4. redemption.voucher.merchantId === branch.merchantId
  //   5. redemption was successfully created (its existence covers this)
  if (data.redemptionId) {
    const redemption = await prisma.voucherRedemption.findFirst({
      where: { id: data.redemptionId, userId },
      select: { id: true, branchId: true, voucher: { select: { merchantId: true } } },
    })
    if (!redemption) throw REDEMPTION_NOT_FOUND
    if (redemption.branchId !== branchId) throw REDEMPTION_BRANCH_MISMATCH
    if (redemption.voucher.merchantId !== branch.merchantId) throw REDEMPTION_MERCHANT_MISMATCH
  }

  return prisma.review.upsert({
    where: { userId_branchId: { userId, branchId } },
    create: {
      userId,
      branchId,
      rating:       data.rating,
      comment:      data.comment ?? null,
      redemptionId: data.redemptionId ?? null,
    },
    update: {
      rating:       data.rating,
      comment:      data.comment ?? null,
      redemptionId: data.redemptionId ?? null,
    },
  })
}
```

- [ ] **Step 3: Run T2 tests, verify they pass**

```bash
npx vitest run tests/api/customer/reviews/upsertBranchReview-redemption-link.test.ts 2>&1 | tail -10
```

Expected: 6/6 passing.

- [ ] **Step 4: Run full backend sweep + commit**

```bash
npx vitest run --reporter=dot 2>&1 | tail -5
```

Expected: existing tests still pass (no regression).

```bash
git add src/api/customer/reviews/service.ts src/api/shared/errors.ts tests/api/customer/reviews/upsertBranchReview-redemption-link.test.ts
git commit -m "feat(review): validate redemption ownership/branch/merchant linkage on upsert (PR-C T2+T3)"
```

---

### Task 4 — Backend routes: extend `reviewBody` Zod schema

**Files:**
- Modify: `src/api/customer/reviews/routes.ts:21-24` (`reviewBody` definition)

- [ ] **Step 1: Add optional `redemptionId` to the Zod schema**

```ts
const reviewBody = z.object({
  rating:       z.number().int().min(1).max(5),
  comment:      z.string().max(500).optional(),
  redemptionId: z.string().min(1).optional(),
})
```

- [ ] **Step 2: Run an integration-style test**

(If the project has API integration tests — likely under `tests/api/customer/reviews/`. Add a test that POSTs to `/api/v1/customer/branches/:branchId/reviews` with a `redemptionId` body and verifies it propagates to the service.)

- [ ] **Step 3: Run routes tests + commit**

```bash
npx vitest run tests/api/customer/reviews/ 2>&1 | tail -5
git add src/api/customer/reviews/routes.ts
git commit -m "feat(review): accept redemptionId in upsert request body (PR-C T4)"
```

---

### Task 5 — Backend `isVerified` flag in list responses (EXPANDED for Path A)

**Files:**
- Modify: `src/api/customer/reviews/service.ts` — DROP `batchGetVerifiedSet` helper; add `redemptionId` to `REVIEW_SELECT`; derive `isVerified` directly in `formatReview`; remove `opts.isVerified` from `formatReview` signature; remove the `verifiedSet` lookup from `listMerchantReviews`, `listBranchReviews`, AND `upsertBranchReview`.
- Create: `tests/api/customer/reviews/listMerchantReviews-isVerified.test.ts`
- Update: any existing tests that asserted the old reviewer-level `isVerified` behaviour (assert Path A row-level instead).

**Path A net effect:** removes ~10 lines (the `batchGetVerifiedSet` function) and ~3 promise.all sites; adds ~1 line (`isVerified: review.redemptionId !== null`) inside `formatReview`. Single source of truth.

- [ ] **Step 1: Write failing test for `isVerified` flag in list response**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listMerchantReviews } from '../../../../src/api/customer/reviews/service'

describe('listMerchantReviews — isVerified flag', () => {
  it('isVerified=true when redemptionId is set on the row', async () => {
    const prisma: any = {
      review: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'r1', userId: 'u1', branchId: 'b1', redemptionId: 'red-1',
            rating: 5, comment: 'Great', createdAt: new Date(), updatedAt: new Date(),
            isReported: false, isDeleted: false, isHidden: false,
            user: { id: 'u1', firstName: 'A', lastInitial: 'B' },
            branch: { id: 'b1', name: 'Branch', merchantId: 'm1' },
            helpfuls: [],
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const result = await listMerchantReviews(prisma, 'm1', { limit: 10, offset: 0 })
    expect(result.reviews[0]).toMatchObject({ id: 'r1', isVerified: true })
  })

  it('isVerified=false when redemptionId is null', async () => {
    const prisma: any = {
      review: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'r2', userId: 'u1', branchId: 'b1', redemptionId: null,
            rating: 3, comment: 'OK', createdAt: new Date(), updatedAt: new Date(),
            isReported: false, isDeleted: false, isHidden: false,
            user: { id: 'u1', firstName: 'A', lastInitial: 'B' },
            branch: { id: 'b1', name: 'Branch', merchantId: 'm1' },
            helpfuls: [],
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const result = await listMerchantReviews(prisma, 'm1', { limit: 10, offset: 0 })
    expect(result.reviews[0]).toMatchObject({ id: 'r2', isVerified: false })
  })
})
```

- [ ] **Step 2: Update `listMerchantReviews` + `listBranchReviews` mappers**

In `src/api/customer/reviews/service.ts`, find the result mapper for each function and add `isVerified: review.redemptionId !== null` to the per-row shape. The Prisma `findMany` already returns the column once it's added to the model; we just need to surface it in the API response.

Also update the `select` projection (if any) to include `redemptionId`.

- [ ] **Step 3: Verify test passes + commit**

```bash
npx vitest run tests/api/customer/reviews/listMerchantReviews-isVerified.test.ts 2>&1 | tail -5
git add src/api/customer/reviews/service.ts tests/api/customer/reviews/listMerchantReviews-isVerified.test.ts
git commit -m "feat(review): surface isVerified flag in list responses (PR-C T5)"
```

---

### Task 6 — Frontend API client: extend reviewSchema + create body

**Files:**
- Modify: `apps/customer-app/src/lib/api/reviews.ts`

- [ ] **Step 1: Extend `reviewSchema` with `isVerified`**

```ts
export const reviewSchema = z.object({
  id:           z.string(),
  userId:       z.string(),
  branchId:     z.string(),
  rating:       z.number().int().min(1).max(5),
  comment:      z.string().nullable(),
  isVerified:   z.boolean(),  // PR-C: new
  createdAt:    z.string(),
  updatedAt:    z.string(),
  // ... existing fields ...
})
```

- [ ] **Step 2: Extend `createReview` body type**

```ts
async createReview(branchId: string, body: {
  rating: number
  comment?: string
  redemptionId?: string  // PR-C: new — optional, only set when reviewing from a redemption flow
}): Promise<Review> {
  const res = await api.post<unknown>(`/api/v1/customer/branches/${encodeURIComponent(branchId)}/reviews`, body)
  return reviewSchema.parse(res)
}
```

- [ ] **Step 3: Run jest sweep + commit**

```bash
cd apps/customer-app && npx tsc --noEmit
git add apps/customer-app/src/lib/api/reviews.ts
git commit -m "feat(review): client schema gains isVerified + createReview accepts redemptionId (PR-C T6)"
```

---

### Task 7 — Frontend hook: useWriteReview passes redemptionId through

**Files:**
- Modify: `apps/customer-app/src/features/merchant/hooks/useWriteReview.ts`
- Modify: `apps/customer-app/tests/features/merchant/useWriteReview.test.tsx`

- [ ] **Step 1: Write failing test for redemptionId pass-through**

```ts
it('passes redemptionId to reviewsApi.createReview when supplied', async () => {
  const createReviewSpy = jest.spyOn(reviewsApi, 'createReview')
    .mockResolvedValueOnce({ id: 'r1', isVerified: true /* ... */ } as any)
  const { result } = renderHook(() => useCreateReview('branch-1'), { wrapper })
  await act(() => result.current.mutateAsync({
    rating: 5, comment: 'Great', redemptionId: 'red-1',
  }))
  expect(createReviewSpy).toHaveBeenCalledWith('branch-1', expect.objectContaining({
    redemptionId: 'red-1',
  }))
})
```

- [ ] **Step 2: Update useCreateReview to accept + forward redemptionId**

```ts
export function useCreateReview(branchId: string) {
  return useMutation({
    mutationFn: (vars: { rating: number; comment?: string; redemptionId?: string }) =>
      reviewsApi.createReview(branchId, vars),
    // ... existing onSuccess invalidation ...
  })
}
```

- [ ] **Step 3: Verify test passes + commit**

```bash
npx jest tests/features/merchant/useWriteReview.test.tsx --forceExit
git add apps/customer-app/src/features/merchant/hooks/useWriteReview.ts apps/customer-app/tests/features/merchant/useWriteReview.test.tsx
git commit -m "feat(review): useCreateReview forwards redemptionId to API (PR-C T7)"
```

---

### Task 8 — Frontend WriteReviewSheet: accept fromRedemptionId + verified-banner

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/WriteReviewSheet.tsx`

- [ ] **Step 1: Write failing test for verified-banner render**

(In a new test file `apps/customer-app/tests/features/merchant/write-review-sheet-verified-banner.test.tsx` — or extend existing.)

```ts
it('shows verified-banner when fromRedemptionId is provided', () => {
  const { getByText } = render(
    <WriteReviewSheet
      visible
      branchId="b1"
      branchName="Brightlingsea"
      fromRedemptionId="red-1"
      onDismiss={jest.fn()}
    />,
  )
  expect(getByText(/verified/i)).toBeTruthy()
})

it('does NOT show verified-banner when fromRedemptionId is null', () => {
  const { queryByText } = render(
    <WriteReviewSheet
      visible
      branchId="b1"
      branchName="Brightlingsea"
      fromRedemptionId={null}
      onDismiss={jest.fn()}
    />,
  )
  expect(queryByText(/verified/i)).toBeNull()
})
```

- [ ] **Step 2: Add `fromRedemptionId?: string | null` prop + render**

Render a small banner at the top of the sheet when `fromRedemptionId` is non-null. Two-line treatment so the headline reads as the noun-phrase and the supporting line gives the precise mechanic — present-tense, customer-facing, branch-specific:

```tsx
{fromRedemptionId ? (
  <View style={styles.verifiedBanner} testID="write-review-verified-banner">
    <Text variant="label.lg" style={styles.verifiedBannerHeading}>
      Verified review
    </Text>
    <Text variant="body.sm" style={styles.verifiedBannerBody}>
      Linked to your voucher redemption at this branch.
    </Text>
  </View>
) : null}
```

Copy locked 2026-05-09 per owner review of the PR-C plan — sharper, present-tense, branch-specific. Replaces the original draft "Verified review · This will be marked as a verified redemption." (rejected as future-tense + less precise).

Pass `redemptionId: fromRedemptionId ?? undefined` to `useCreateReview.mutateAsync` on submit.

- [ ] **Step 3: Verify tests pass + commit**

```bash
npx jest tests/features/merchant/write-review-sheet-verified-banner.test.tsx --forceExit
git add apps/customer-app/src/features/merchant/components/WriteReviewSheet.tsx apps/customer-app/tests/features/merchant/write-review-sheet-verified-banner.test.tsx
git commit -m "feat(review): WriteReviewSheet verified banner + redemptionId pass-through (PR-C T8)"
```

---

### Task 9 — Frontend ReviewCard: verified-redemption badge

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/ReviewCard.tsx`
- Create: `apps/customer-app/tests/features/merchant/review-card-verified-badge.test.tsx`

- [ ] **Step 1: Write failing tests**

```ts
describe('ReviewCard — verified badge', () => {
  it('renders the verified badge when review.isVerified === true', () => {
    const { getByTestId } = render(
      <ReviewCard review={{ ...defaults(), isVerified: true } as any} />,
    )
    expect(getByTestId('review-card-verified-badge')).toBeTruthy()
  })

  it('does NOT render the verified badge when review.isVerified === false', () => {
    const { queryByTestId } = render(
      <ReviewCard review={{ ...defaults(), isVerified: false } as any} />,
    )
    expect(queryByTestId('review-card-verified-badge')).toBeNull()
  })

  it('badge accessibilityLabel reads "Verified redemption"', () => {
    const { getByTestId } = render(
      <ReviewCard review={{ ...defaults(), isVerified: true } as any} />,
    )
    expect(getByTestId('review-card-verified-badge').props.accessibilityLabel)
      .toBe('Verified redemption')
  })
})
```

- [ ] **Step 2: Render the badge**

In `ReviewCard.tsx`, near the rating row, render conditionally:

```tsx
{review.isVerified ? (
  <View
    testID="review-card-verified-badge"
    accessibilityLabel="Verified redemption"
    style={styles.verifiedBadge}
  >
    <Check size={12} color={color.savingsGreen} strokeWidth={2.4} />
    <Text variant="label.md" style={styles.verifiedBadgeText}>
      Verified redemption
    </Text>
  </View>
) : null}
```

- [ ] **Step 3: Verify tests pass + commit**

```bash
npx jest tests/features/merchant/review-card-verified-badge.test.tsx --forceExit
git add apps/customer-app/src/features/merchant/components/ReviewCard.tsx apps/customer-app/tests/features/merchant/review-card-verified-badge.test.tsx
git commit -m "feat(review): ReviewCard renders Verified redemption badge when isVerified (PR-C T9)"
```

---

### Task 10 — Frontend ReviewsTab: initialOpenWriteFor support

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/ReviewsTab.tsx`

- [ ] **Step 1: Add `initialOpenWriteFor?: { branchId: string; redemptionId?: string } | null` prop**

```tsx
type Props = {
  // ... existing props ...
  initialOpenWriteFor?: { branchId: string; redemptionId?: string } | null
}
```

- [ ] **Step 2: Auto-open WriteReviewSheet on mount when prop is set**

```tsx
const [writeOpen, setWriteOpen] = useState<{ branchId: string; redemptionId?: string } | null>(
  initialOpenWriteFor ?? null,
)
useEffect(() => {
  if (initialOpenWriteFor) setWriteOpen(initialOpenWriteFor)
}, [initialOpenWriteFor])
```

Pass `fromRedemptionId={writeOpen?.redemptionId ?? null}` to `<WriteReviewSheet>`.

- [ ] **Step 3: Run reviews-tab tests, fix any breakages, commit**

```bash
npx jest tests/features/merchant/reviews-tab- --forceExit
git add apps/customer-app/src/features/merchant/components/ReviewsTab.tsx
git commit -m "feat(review): ReviewsTab supports initialOpenWriteFor → auto-open WriteReviewSheet (PR-C T10)"
```

---

### Task 11 — Frontend MerchantProfileScreen: URL param handling

**Files:**
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`
- Create: `apps/customer-app/tests/features/merchant/merchant-profile-write-review-from-redemption.test.tsx`

- [ ] **Step 1: Write failing test**

```ts
it('opens WriteReviewSheet with redemptionId when URL has openWriteReview=1&fromRedemption=X', async () => {
  const { findByTestId } = render(
    <MerchantProfileScreen
      // ... pass URL params via test wrapper ...
      params={{
        id: 'merchant-1',
        branch: 'branch-1',
        tab: 'reviews',
        openWriteReview: '1',
        fromRedemption: 'redemption-1',
      }}
    />,
  )
  expect(await findByTestId('write-review-sheet')).toBeTruthy()
  expect(await findByTestId('write-review-verified-banner')).toBeTruthy()
})
```

- [ ] **Step 2: Read URL params + pipe to ReviewsTab**

```tsx
const params = useLocalSearchParams<{
  openWriteReview?: string
  fromRedemption?: string
  branch?: string
  tab?: string
}>()

const initialOpenWriteFor = params.openWriteReview === '1' && params.branch
  ? { branchId: params.branch, redemptionId: params.fromRedemption }
  : null

// ... pass to <ReviewsTab initialOpenWriteFor={initialOpenWriteFor} />
```

Also: when `tab === 'reviews'`, set the active tab to Reviews on mount.

After WriteReviewSheet opens once, scrub the params via `router.replace` so back-navigation doesn't re-open the sheet on cold-cache resolution. Mirrors the §O7 / branch-changed pattern from PR #35.

- [ ] **Step 3: Verify test passes + commit**

```bash
npx jest tests/features/merchant/merchant-profile-write-review-from-redemption.test.tsx --forceExit
git add apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/merchant-profile-write-review-from-redemption.test.tsx
git commit -m "feat(review): MerchantProfileScreen honours openWriteReview + fromRedemption URL params (PR-C T11)"
```

---

### Task 12 — Frontend SuccessPopup: reintroduce Rate & Review CTA

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx`
- Modify: `apps/customer-app/tests/features/voucher/success-popup.test.tsx`

- [ ] **Step 1: Add `onRateReview: () => void` to Props + destructure**

- [ ] **Step 2: Render the Rate & Review CTA**

In the secondary row beside Done, restore the structure (was preserved per §13.2 — secondary row is centred, no separator). The CTA returns alongside Done with a small dot separator OR as a single tertiary action followed by Done. Final visual treatment:

- Flat outlined pill (1px border at brand-rose 30% alpha)
- Text body.md, brand-rose
- Star icon 14pt, brand-rose
- Tap target ≥ 44×44pt

```tsx
<View style={styles.secondaryRow}>
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Rate and review"
    testID="success-rate-review"
    onPress={() => { lightHaptic(); onRateReview() }}
    style={({ pressed }) => [styles.tertiaryAction, pressed && styles.tertiaryPressed]}
  >
    <Star size={14} color={color.brandRose} strokeWidth={2.4} />
    <Text variant="label.md" style={styles.rateReviewText}>
      Rate & Review
    </Text>
  </Pressable>
  <View style={styles.tertiaryDot} />
  <Pressable {/* Done — unchanged */} />
</View>
```

- [ ] **Step 3: Update tests**

In `success-popup.test.tsx`:
- Re-add `onRateReview: jest.fn()` to `defaults` factory.
- DELETE the `negative pin: does NOT render the Rate & Review CTA` test (no longer the contract).
- ADD positive pins:
  - `Rate & Review CTA fires onRateReview when pressed`
  - `Rate & Review label is "Rate & Review"`
  - `Rate & Review accessibilityLabel is "Rate and review"`

- [ ] **Step 4: Verify tests pass + commit**

```bash
npx jest tests/features/voucher/success-popup.test.tsx --forceExit
git add apps/customer-app/src/features/voucher/components/SuccessPopup.tsx apps/customer-app/tests/features/voucher/success-popup.test.tsx
git commit -m "feat(voucher): reintroduce Rate & Review CTA on SuccessPopup (PR-C T12)"
```

---

### Task 13 — Frontend VoucherDetailScreen: wire onRateReview routing

**Files:**
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`
- Create: `apps/customer-app/tests/features/voucher/voucher-detail-rate-and-review-routing.test.tsx`

- [ ] **Step 1: Write failing test**

```ts
it('SuccessPopup onRateReview navigates to merchant profile reviews tab with redemption params', async () => {
  const routerPush = jest.fn()
  jest.spyOn(routerModule, 'useRouter').mockReturnValue({ push: routerPush } as any)

  const { findByTestId } = render(<VoucherDetailScreen voucherId="voucher-1" />)
  // ... trigger redeem flow → SuccessPopup mounts ...
  fireEvent.press(await findByTestId('success-rate-review'))

  expect(routerPush).toHaveBeenCalledWith({
    pathname: '/(app)/merchant/[id]',
    params: {
      id:              'merchant-1',
      branch:          'branch-1',
      tab:             'reviews',
      openWriteReview: '1',
      fromRedemption:  expect.any(String),
    },
  })
})
```

- [ ] **Step 2: Implement routing in `onRateReview`**

```tsx
<SuccessPopup
  // ... existing props ...
  onRateReview={() => {
    setSuccessPopup(null)
    router.push({
      pathname: '/(app)/merchant/[id]',
      params: {
        id:              voucher.merchant.id,
        branch:          successPopup.branchId ?? branchName,
        tab:             'reviews',
        openWriteReview: '1',
        fromRedemption:  successPopup.id,
      },
    })
  }}
/>
```

- [ ] **Step 3: Verify test passes + commit**

```bash
npx jest tests/features/voucher/voucher-detail-rate-and-review-routing.test.tsx --forceExit
git add apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx apps/customer-app/tests/features/voucher/voucher-detail-rate-and-review-routing.test.tsx
git commit -m "feat(voucher): wire SuccessPopup Rate & Review → merchant profile with redemption params (PR-C T13)"
```

---

### Task 15 — Auto-link + preserve amendment (PR-C §0.3.1, LOCKED 2026-05-09)

**Files:**
- Modify: `src/api/customer/reviews/service.ts` (`upsertBranchReview`)
- Create: `tests/api/customer/reviews.upsert-auto-link.test.ts`

**Test cases (TDD red phase first, ~10 cases):**

- AUTO-LINK happy: user submits without `redemptionId`, eligible redemption exists in current cycle → attached + isVerified=true
- AUTO-LINK no eligible: user has no current-cycle redemption at this branch → review persists with redemptionId=null (no error)
- AUTO-LINK previous-cycle redemption is NOT eligible (cycle filter)
- AUTO-LINK ignores wrong-branch redemption
- AUTO-LINK ignores wrong-merchant redemption (defensive)
- AUTO-LINK multiple eligible → most recent wins (`orderBy redeemedAt desc`)
- AUTO-LINK no Subscription record → returns null (no auto-link possible)
- PRESERVE: existing review has redemptionId=X, user edits without redemptionId → still X
- PRESERVE: existing review has null redemptionId, user edits without redemptionId → auto-link runs (Path B)
- STRICT-WINS: existing review has redemptionId=X, user submits explicit redemptionId=Y (valid) → switches to Y (validates strict)

**Implementation outline:**

```ts
// 1. Existing strict validation when data.redemptionId provided.
// 2. New: when data.redemptionId is undefined, peek the existing
//    review row (inside the tx) to know if it has a redemptionId.
//    - If existing.redemptionId !== null → use that (Path C).
//    - Else → call autoLinkRedemption() (Path B).
// 3. Pass the resolved redemptionId to the upsert/update branches.

async function autoLinkRedemption(
  prisma, userId, branchId, branchMerchantId, now,
): Promise<string | null> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { cycleAnchorDate: true },
  })
  if (!sub) return null
  const { cycleStart, cycleEnd } = getCurrentCycleWindow(sub.cycleAnchorDate, now)
  const r = await prisma.voucherRedemption.findFirst({
    where: {
      userId, branchId,
      voucher: { merchantId: branchMerchantId },
      redeemedAt: { gte: cycleStart, lt: cycleEnd },
    },
    orderBy: { redeemedAt: 'desc' },
    select: { id: true },
  })
  return r?.id ?? null
}
```

**Out of scope** for T15 (per owner direction):
- Multi-review per user-branch (deferred §AI v2).
- Spam / rate-limit / moderation tooling (deferred §AI v2).
- Backfilling pre-PR-C reviews via auto-link (no historical backfill).

### Task 14 — End-to-end integration verification + final tests

**Files:**
- (no new files)

- [ ] **Step 1: Run full backend vitest sweep**

```bash
npx vitest run --reporter=dot 2>&1 | tail -5
```

Expected: 483 + 8 (T2/T5 new) = 491+ passing.

- [ ] **Step 2: Run full customer-app jest sweep**

```bash
cd apps/customer-app && npx jest tests/features/voucher tests/features/merchant --forceExit 2>&1 | tail -7
```

Expected: 522 + 12 (T7/T8/T9/T11/T12/T13 new) = 534+ passing.

- [ ] **Step 3: tsc --noEmit**

```bash
cd apps/customer-app && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Manual on-device QA on Covelum vouchers (post-`prisma/reset-qa-redemption-cycle.ts` reset)**

1. Open Covelum → tap a voucher → tap Redeem.
2. Enter PIN.
3. SuccessPopup mounts. Verify Rate & Review CTA renders alongside Done.
4. Tap Rate & Review.
5. Land on `/(app)/merchant/<covelum-id>?branch=<branch-id>&tab=reviews&openWriteReview=1&fromRedemption=<redemption-id>`.
6. Reviews tab is active; WriteReviewSheet is open for the redeemed branch.
7. Verified-banner is visible at the top of the sheet.
8. Submit a 5-star review.
9. Sheet closes; back on Reviews tab.
10. The new review card shows the "Verified redemption" badge.
11. URL is scrubbed (no openWriteReview / fromRedemption params after sheet closes).

- [ ] **Step 5: Push branch + open PR-C**

```bash
git push -u origin feature/voucher-verified-review-pr-c
gh pr create --title "PR-C: verified-review backend + Rate & Review routing" --body "$(cat <<EOF
... PR description with §0.3 semantics, schema migration scope, frontend wiring, on-device QA log ...
EOF
)"
```

---

## 4. Self-review checklist (run after writing the plan)

| Check | Status |
|-------|--------|
| Spec coverage — every owner-listed scope item has a task | ✅ all 9 scope bullets covered |
| Placeholder scan — no TBD / TODO / "implement later" / "similar to Task N" without code | ✅ |
| Type consistency — `redemptionId`, `isVerified`, `fromRedemptionId` all spelled identically | ✅ |
| Test counts realistic — backend +8 / frontend +12 | ✅ |

## 5. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Migration applied in dev but not yet in production | High | Medium | Standard Prisma deploy flow runs the migration on production deploy — captured by existing CI/CD. Migration is additive nullable, so a no-op replay is safe. |
| R2 | Existing reviews lack `redemptionId` — they get `isVerified === false` | Certain | Low | Expected and documented. Pre-PR-C reviews stay non-verified retrospectively. Owner already accepted this in §0.3. |
| R3 | Same-user-same-branch upsert can change `redemptionId` from one redemption to another | Medium | Low | The unique constraint on `Review.redemptionId` allows this — old `redemptionId` becomes orphan attribution; the new linkage replaces it. The previous redemption simply has no review attached. |
| R4 | URL param round-trip forgets the `branch` value | Low | Medium | MerchantProfileScreen already handles `branch` URL param (PR #33). PR-C test pins the round-trip. |
| R5 | A user submits a review WITHOUT redemptionId, then reopens from redemption — does the upsert ATTACH the redemptionId? | Yes | Positive | The upsert UPDATE path sets `redemptionId: data.redemptionId ?? null` — if the new submit comes with a redemptionId, it ATTACHES. If without, it CLEARS. This is the documented behaviour. Tested in T2 (UPDATE path). |
| R6 | Frontend WriteReviewSheet auto-open races with merchant data fetch | Low | Medium | Wait for `merchantQuery.data` resolved before honouring `openWriteReview` param (mirrors §O7 fix from PR #33). Pinned by test. |

## 6. Out of scope (explicit)

- Promoting `verifiedByStaffValidation` flag (deferred per §0.3 — staff validation NOT a verified-review requirement).
- ReviewSortControl gains a `Verified only` filter — could be PR-C+1 if it grows scope; NOT in this PR.
- Email / push notification when a verified review is submitted — Phase 6.
- Backfilling historical reviews with redemptionId — out of scope. Pre-PR-C reviews stay non-verified.
- Changing the `isVerified` derivation rule mid-flight (e.g. requiring `isValidated`) — locked at §0.3.
- **Review system v2 — multi-review + abuse controls.** Owner direction 2026-05-09: current `@@unique([userId, branchId])` one-per-user-branch upsert + soft-delete/revive is a **placeholder**. v2 needs multiple reviews per user-branch, spam prevention, foul-language moderation, rate limits, anti-flooding rules, merchant/branch abuse monitoring, and a moderation queue. PR-C explicitly does NOT redesign the review architecture — only links a review to its triggering redemption via `Review.redemptionId`. Tier 3 brainstorm-first when customer volume warrants. Recorded in [memory deferred-followups §AI](../../../../.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md).
- Show-to-Staff polish — PR-B.
- Confetti on SuccessPopup — PR-B.
- Voucher Detail redeemed-state polish — PR-B.

## 7. Recommended sequencing (within PR-C)

```
T1  schema migration                 (backend, atomic — REQUIRED FIRST)
T2  service validation tests          (backend, TDD)
T3  service validation impl           (backend)
T4  routes Zod body                   (backend)
T5  isVerified flag in list           (backend)
─── milestone: backend complete ───
T6  client API schema + body          (frontend, light)
T7  useCreateReview hook              (frontend)
T8  WriteReviewSheet verified-banner  (frontend)
T9  ReviewCard verified badge         (frontend)
T10 ReviewsTab initialOpenWriteFor    (frontend)
T11 MerchantProfileScreen URL params  (frontend)
─── milestone: frontend reachable from URL ───
T12 SuccessPopup CTA reintroduction   (frontend, locked-decision-aware)
T13 VoucherDetailScreen routing       (frontend)
─── milestone: end-to-end working ───
T14 verification + on-device QA + PR  (release)
```

Estimated:
- Backend (T1–T5): 1 working session
- Frontend (T6–T13): 1.5–2 working sessions
- Verification + QA + PR (T14): 0.5 session
- **Total: 3–4 sessions**

Net diff estimate: ~600–800 LOC across 13 source/test files (similar to PR-A scope).

---

## 8. Owner approval gate

This plan does NOT mutate any code until owner approves. After approval:

1. Cut a fresh branch from `main` (currently at `a0bc8f3` post-PR-A merge): `feature/voucher-verified-review-pr-c`.
2. Implement T1–T13 with TDD discipline + per-task commits.
3. Run T14 verification + open PR-C.
4. Hand back for owner page-review + on-device QA.
5. SHA-bound merge per project workflow.

**Awaiting owner sign-off on:**

- [ ] Plan structure + task granularity
- [ ] Verified-review semantics implementation per §0.3 (no `isValidated` requirement)
- [ ] Migration shape (additive nullable column, FK with `ON DELETE SET NULL`)
- [ ] CTA visual treatment for the reintroduced Rate & Review on SuccessPopup (flat outlined pill, brand-rose ring + Star icon)
- [ ] Verified badge visual treatment on ReviewCard (small Check + savings-green text "Verified redemption")
- [ ] Verified banner copy on WriteReviewSheet — locked 2026-05-09: `Verified review` (heading) + `Linked to your voucher redemption at this branch.` (supporting line)
- [ ] URL param contract (`openWriteReview=1&fromRedemption=<id>&branch=<id>&tab=reviews`)
- [ ] Sequencing — T1 first, then linear T2–T14

Once approved, I'll begin T1 and report after each milestone (backend complete / frontend reachable / end-to-end working).

---

## 9. As shipped — PR #57 (LIVE on origin/main 2026-05-09, merge `a80f427`)

This addendum captures the final merged state versus the planned tasks above. Source of truth for the verified-review contract going forward; supersedes the planning sections wherever they diverge.

### Final verified-review contract — three derivation paths

`Review.redemptionId` is nullable, `@unique`, FK to `VoucherRedemption` with `ON DELETE SET NULL`. Surface-level rule: `isVerified = review.redemptionId !== null`. Staff validation (`isValidated`) is intentionally NOT required.

`upsertBranchReview` resolves the persisted `redemptionId` per three derivation paths:

| Path | Trigger | Behaviour |
|---|---|---|
| **A — strict** | caller passes `data.redemptionId` | validate the 5-condition rule BEFORE the upsert (ownership / branch / merchant / current-cycle window / existence). Failures throw 400 with `REDEMPTION_NOT_FOUND` / `REDEMPTION_BRANCH_MISMATCH` / `REDEMPTION_MERCHANT_MISMATCH`. **Cycle-window constraint added per Codex F1 (locked 2026-05-09)** — prevents replaying a stale (previous-cycle) redemption to verify a fresh review. Stale-redemption surfaces as `REDEMPTION_NOT_FOUND` (NOT a distinct cycle code) so existence isn't leaked. |
| **B — auto-link** | no explicit `redemptionId` AND no existing review row | `autoLinkRedemption()` finds the most-recent eligible redemption in the user's current cycle window via `getCurrentCycleWindow(sub.cycleAnchorDate, now)`. None → unverified, no error. No subscription → unverified, no error. Most-recent-wins: `orderBy: { redeemedAt: 'desc' }`. |
| **C — preserve** | no explicit `redemptionId` AND existing review row already has `redemptionId` set | keep the existing linkage. Editing a verified review without re-supplying `redemptionId` no longer silently strips the verified flag. REVIVE path (soft-deleted re-write) honours preserve too. |

Path A and Path B share the same `getUserCycleWindowOrNull` helper so the cycle constraint is DRY across both. The `Review.redemptionId @unique` constraint guards against a single redemption being claimed by two reviews.

### Shipped frontend behaviour

- **SuccessPopup Rate & Review CTA** — filled navy gradient pill (`['#010C35', '#1F2A55']`, navy shadow, white-on-navy Star + label), 48pt tap height. Top-right X close icon (inline flex child of the accent row to avoid the absolute-overlay overlap caught in device QA wave 2). Done text button removed entirely; dismissal via X / hardware back / scrim — all three route to `onDone`.
- **Voucher Detail prompt card** (`<ReviewPromptCard>`) — secondary card mounted immediately AFTER `<RedemptionDetailsCard>` in the redeemed-this-cycle state. Cream surface, 1px hairline border, no shadow on the card itself. CTA is the SAME navy gradient pill verbatim from SuccessPopup so both entry points share one identity. Heading "Share your experience"; body "Your review helps others choose this branch."; CTA "Rate & Review".
- **URL contract** — both entry points push to `/(app)/merchant/[id]?branch=<id>&tab=reviews&openWriteReview=1&fromRedemption=<id?>`. Just-redeemed path includes `fromRedemption` (in-memory `lastRedemption.id` from RedeemResponse). Cold-open return-visit path omits `fromRedemption` (persisted `voucher.lastRedemption` schema doesn't expose redemption id today) and relies on backend Path B auto-link to verify on submit.
- **MerchantProfileScreen receiving end** — lazy `useState` initialiser reads `screenParams.tab` so ReviewsTab mounts on render 1 (no Vouchers-tab flash). Effect on `initialOpenWriteFor` non-null forces `activeTab='reviews'` on every fresh attribution (handles both cold-mount AND the in-session repeat case where URL `tab` value didn't change). URL scrub deferred via `onAutoOpenConsumed` callback so ReviewsTab's auto-open effect consumes the prop BEFORE `router.replace` strips `openWriteReview` / `fromRedemption`.
- **WriteReviewSheet — "Update your review" framing (Option A locked)** — when `initialRating > 0 OR initialComment.trim().length > 0` (i.e. parent pre-filled from `myReview`), the sheet swaps title to "Update your review", submit CTA to "Update review", loading to "Updating…", and `BottomSheet` a11y label tracks. Verified banner stays compatible with both copy variants — an UPDATE can still earn verification on a fresh redemption (Path A or B). Multi-review architecture (Option B / review-system v2) remains deferred under §AI.
- **ReviewCard verified badge** — green Check icon + "Verified redemption" copy, savings-green tinted background, accessibility label "Verified redemption".

### Test totals at merge (head `1ce387a`)

- Backend full sweep — **553 / 553** (60 files)
- Customer-app voucher + merchant + lib/api/reviews — **847 / 847** (74 suites)
- Customer-app `tsc --noEmit` — clean

### Diverges from the original plan

- **§0.3.1 amendment (auto-link + preserve)** was added mid-flight via T15. Original §0.3 only had Path A (strict). Locked in plan §1 above; final contract documented in this addendum.
- **CTA visual treatment** was iterated three times: outlined brand-rose pill (T12) → outlined wider pill (T16 wave 2) → **filled navy gradient (T16 wave 3, final)**. The navy gradient locks visual consistency with the merchant-profile ActionRow Contact button.
- **SuccessPopup hierarchy** added X close icon top-right + removed Done button entirely (T16 device-QA wave 1). The bottom row carries only the Rate & Review pill now.
- **`<ReviewPromptCard>`** (T16) was a mid-flight addition not in the original task list. Added after device QA flagged the absence of a second entry point on Voucher Detail post-dismiss.
- **Path A current-cycle constraint** (Codex F1) caught at code review post-T15 — original Path A only enforced ownership/branch/merchant/existence. Cycle constraint added so explicit and auto-link paths share the same temporal boundary.
- **`fromRedemptionId` forwarded on populated-state ReviewsTab path** (Codex F2) — originally only the empty-state render path forwarded the prop, breaking the verified banner on branches that already had reviews.

### Known follow-ups carried forward (NOT shipped in PR-C)

- **Prompt card "Update your review" copy** (deferred Tier 1) — both entry-point cards keep "Share your experience" copy because `useCustomerVoucher` doesn't expose `myReview`. Once `myReview` is added to the voucher detail payload, the copy can become aware of existing reviews. Sheet itself already swaps once opened.
- **Persisted return-visit verified banner upfront** (deferred Tier 1) — needs `id` added to `voucherDetailLastRedemptionSchema`. Today the verified banner only shows on the in-memory just-redeemed path; cold-open return visits verify via Path B auto-link with the badge appearing AFTER submit.
- **Path A TOCTOU on hard-delete** (Minor, accepted) — the Path A `findFirst` + upsert run in separate transactions; if a redemption is hard-deleted between them, the upsert FK-violates. Hard-deletes are admin-only and rare; user retries cleanly.
- **Pre-PR-C reviews lose old "Verified" status** (locked behavioural note, no backfill) — existing reviews where the user had a validated redemption at that branch silently flip to non-verified post-deploy. Owner-locked at §0.3.

### Cross-refs

- Memory §AI — review-system v2 deferral (multi-review, abuse controls, moderation) remains intact and Tier 3 brainstorm-first.
- Memory `project_pr_c_verified_review_complete.md` — locked baseline summary for future sessions.
- `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md` §8.6 — voucher-detail spec verified-review delta.

