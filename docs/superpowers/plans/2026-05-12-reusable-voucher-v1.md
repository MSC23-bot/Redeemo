# REUSABLE Voucher v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver REUSABLE as a cooldown-based reusable voucher type (R3+R4 hybrid per audit §T1), distinct from cycle (one-per-cycle) and TIME_LIMITED (window-bound), as a single atomic Tier 3 PR.

**Architecture:** Add one nullable column `Voucher.cooldownSeconds` plus two DB CHECK constraints. Introduce a third type-aware branch in `createRedemption` (REUSABLE pre-PIN cooldown check + post-PIN atomic claim under `pg_advisory_xact_lock`). REUSABLE skips `UserVoucherCycleState` entirely; the cooldown gate is computed from `MAX(VoucherRedemption.redeemedAt) for (userId, voucherId)`. Customer payload exposes `effectiveCooldownSeconds`, `availableAgainAt` (type-specific semantics), `lastRedemption` (2h presentation-window-gated, independent of cooldown), and per-card `reusableState`. Frontend gets two new components (`<ReusableRulesCard>`, `<ReusableGuidanceCard>`), two new `HeroStatusBlock` states (`reusable-available`, `reusable-cooldown`), a new merchant card pill variant, and a 5-state Voucher Detail matrix that includes state 4 (cooldown elapsed + presentation still alive = active Redeem CTA + persisted card visible together).

**Tech Stack:** Prisma 7.7 + PostgreSQL 16 (Neon serverless), Node 24 + TypeScript backend (vitest), React Native + Expo SDK 54 + jest-expo customer-app, React Query 5, Zod 3.

**Spec:** [`docs/superpowers/specs/2026-05-12-reusable-voucher-design.md`](../specs/2026-05-12-reusable-voucher-design.md) — locked decisions D1–D55 + amendments 2026-05-12. Treat as canonical for design questions; this plan is the implementation contract.

---

## File structure

### Backend — created
- `prisma/migrations/<timestamp>_add_voucher_cooldown_seconds/migration.sql` — column + 2 CHECK constraints
- `src/api/redemption/reusable.ts` — constants (DEFAULT/MIN cooldown seconds) + helpers (`effectiveCooldownSeconds`, `computeAvailableAgainAt`)
- `tests/api/redemption/reusable.test.ts` — unit tests for the helpers
- `tests/api/redemption/cooldown-guard.test.ts` — backend tests for Guard 8a REUSABLE branch
- `tests/api/redemption/advisory-lock-race.integration.test.ts` — real-DB race protection test
- `tests/api/redemption/atomic-claim-reusable.test.ts` — atomic-claim branch tests (mocked + transactional)

### Backend — modified
- `prisma/schema.prisma` — add `cooldownSeconds Int?` to `Voucher`
- `src/api/redemption/service.ts` — Guard 8a REUSABLE branch + atomic-claim REUSABLE branch + new `REUSABLE_COOLDOWN_ACTIVE` error
- `src/api/redemption/errors.ts` (if separate module) OR inline in service — register the new error code shape
- `src/api/customer/discovery/service.ts` — `getCustomerVoucher` REUSABLE deltas (`effectiveCooldownSeconds`, `availableAgainAt`, `isRedeemedThisCycle: false`, `lastRedemption` gating) + `getCustomerMerchant` per-card `reusableState`
- `src/api/merchant/voucher/routes.ts` — Zod validation for `cooldownSeconds` (null OR ≥1800; REUSABLE-only)
- `tests/api/redemption/service.test.ts` — existing tests stay green; add REUSABLE-specific cases
- `tests/api/customer/discovery/voucher-payload.test.ts` — REUSABLE payload contract tests
- `tests/api/merchant/voucher-validation.test.ts` — `cooldownSeconds` Zod validation tests

### Frontend (customer-app) — created
- `apps/customer-app/src/features/voucher/utils/cooldownFormat.ts` — `formatCooldownDurationHuman(seconds)` ("4 hours" / "30 minutes" / "1 day" / "7 days")
- `apps/customer-app/src/features/voucher/components/ReusableRulesCard.tsx` — replaces `<CycleRulesCard>` for REUSABLE
- `apps/customer-app/src/features/voucher/components/ReusableGuidanceCard.tsx` — parallel to PR #70 TL guidance card
- `apps/customer-app/tests/features/voucher/utils/cooldownFormat.test.ts` — helper unit tests
- `apps/customer-app/tests/features/voucher/components/reusable-rules-card.test.tsx` — component test
- `apps/customer-app/tests/features/voucher/components/reusable-guidance-card.test.tsx` — component test
- `apps/customer-app/tests/features/voucher/reusable-state-matrix.test.tsx` — 5-state matrix coverage on VoucherDetailScreen

### Frontend (customer-app) — modified
- `apps/customer-app/src/lib/api/voucher.ts` — Zod schema additions
- `apps/customer-app/src/lib/api/merchant.ts` — MerchantVoucher Zod additions
- `apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx` — add `'reusable-available'` + `'reusable-cooldown'` states
- `apps/customer-app/src/features/voucher/components/CouponBody.tsx` — insert `<ReusableGuidanceCard>` for REUSABLE
- `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` — state matrix routing, `<ReusableRulesCard>` swap, HowItWorks REUSABLE step, hero seal suppression, D44 expiry suppression
- `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx` — `REUSABLE_COOLDOWN_ACTIVE` error inline rendering
- `apps/customer-app/src/features/merchant/components/VoucherCardStatePill.tsx` — REUSABLE pill states
- `apps/customer-app/src/features/merchant/components/VoucherCard.tsx` — opacity for cooldown state + sort bucket integration
- `apps/customer-app/src/features/voucher/constants/productCopy.ts` — explainer body rewrite + HowItWorks step
- `apps/customer-app/tests/features/voucher/hero-status-block.test.tsx` — REUSABLE state pins
- `apps/customer-app/tests/features/voucher/coupon-body-tl-sections.test.tsx` — extend or add parallel REUSABLE section test
- `apps/customer-app/tests/features/merchant/voucher-card.test.tsx` — REUSABLE pill pins

---

## Pre-flight

Run BEFORE Task 1.

- [ ] **Pre.1 — Branch off main**

```bash
git checkout main
git pull --ff-only
git checkout -b feature/reusable-voucher-v1
```

- [ ] **Pre.2 — Baseline test pass (backend)**

Run: `npx vitest run`
Expected: All passing (current baseline: 553/553 at f65b082 / e4a69d0 / 9c1af59).

If failures appear before any change, STOP and resolve before starting Task 1.

- [ ] **Pre.3 — Baseline test pass (customer-app)**

Run from `apps/customer-app`:
```bash
cd apps/customer-app && npx jest --forceExit
```
Expected: 1529/1530 passing (1 documented pre-existing baseline failure in `tests/lib/api/profile.test.ts`).

- [ ] **Pre.4 — Baseline TypeScript clean**

Run from repo root: `npx tsc --noEmit`
Run from `apps/customer-app`: `npx tsc --noEmit`
Both: expected clean (no errors).

---

## Task 1: Schema migration + DB CHECK constraints

**Files:**
- Modify: `prisma/schema.prisma` (Voucher model)
- Create: `prisma/migrations/<timestamp>_add_voucher_cooldown_seconds/migration.sql`

- [ ] **Step 1.1 — Add the column to the Prisma schema**

Open `prisma/schema.prisma`. Find the `Voucher` model (around line 812). Insert the new column after `expiryDate`:

```prisma
model Voucher {
  // … existing fields up through expiryDate …
  expiryDate      DateTime?
  cooldownSeconds Int?           // REUSABLE only; null = platform default (4h);
                                 // server-clamped to floor 1800s at redemption time.
  // … rest of existing fields …
}
```

- [ ] **Step 1.2 — Generate the migration**

Run from repo root:
```bash
npx prisma migrate dev --name add_voucher_cooldown_seconds --create-only
```

This creates a migration directory `prisma/migrations/<timestamp>_add_voucher_cooldown_seconds/` containing `migration.sql`. The `--create-only` flag prevents auto-apply so we can extend the SQL with CHECK constraints before applying.

- [ ] **Step 1.3 — Add the two CHECK constraints to migration.sql**

Open the newly-generated `migration.sql`. The Prisma-generated content adds the column. Append the two CHECK constraints:

```sql
-- Prisma-generated: column add (already present in the file)
-- ALTER TABLE "Voucher" ADD COLUMN "cooldownSeconds" INTEGER;

-- Manual addition: floor + REUSABLE-only CHECK constraints.
-- Per spec §4.3 + D3. Same pattern as the existing §AG3
-- RedemptionScreenshotEvent_platform_check.
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_cooldownSeconds_min_check"
  CHECK ("cooldownSeconds" IS NULL OR "cooldownSeconds" >= 1800);

ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_cooldownSeconds_reusable_only_check"
  CHECK ("type" = 'REUSABLE' OR "cooldownSeconds" IS NULL);
```

- [ ] **Step 1.4 — Apply the migration**

Run:
```bash
npx prisma migrate dev
```

Expected: migration applies cleanly to the Neon dev DB. Prisma client regenerates.

- [ ] **Step 1.5 — Verify constraints exist (manual SQL probe)**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public."Voucher"'::regclass
  AND conname LIKE 'Voucher_cooldownSeconds%';
SQL
```

Expected: two rows, both with `contype = 'c'` (CHECK) and correct expressions. If zero rows, the manual additions weren't applied — re-check `migration.sql` and re-run.

- [ ] **Step 1.6 — Migration validation test (D51 Amendment 2)**

Create `tests/api/redemption/cooldown-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '../../../src/lib/prisma'

describe('Voucher.cooldownSeconds — DB CHECK constraints', () => {
  it('rejects cooldownSeconds < 1800 (floor)', async () => {
    // Try to insert a REUSABLE voucher with cooldownSeconds = 1799 — should fail.
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Voucher" (
          "id", "merchantId", "code", "type", "title",
          "estimatedSaving", "status", "approvalStatus",
          "cooldownSeconds", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          (SELECT id FROM "Merchant" LIMIT 1),
          'TEST-COOLDOWN-FLOOR', 'REUSABLE', 'Test',
          0, 'DRAFT', 'PENDING',
          1799,
          now(), now()
        )
      `
    ).rejects.toThrow(/Voucher_cooldownSeconds_min_check/)
  })

  it('rejects non-null cooldownSeconds on non-REUSABLE voucher (scope check)', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Voucher" (
          "id", "merchantId", "code", "type", "title",
          "estimatedSaving", "status", "approvalStatus",
          "cooldownSeconds", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          (SELECT id FROM "Merchant" LIMIT 1),
          'TEST-COOLDOWN-SCOPE', 'BOGO', 'Test',
          0, 'DRAFT', 'PENDING',
          3600,
          now(), now()
        )
      `
    ).rejects.toThrow(/Voucher_cooldownSeconds_reusable_only_check/)
  })

  it('accepts cooldownSeconds = 1800 (floor inclusive)', async () => {
    // Should succeed.
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "Voucher" (
        "id", "merchantId", "code", "type", "title",
        "estimatedSaving", "status", "approvalStatus",
        "cooldownSeconds", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        (SELECT id FROM "Merchant" LIMIT 1),
        'TEST-COOLDOWN-OK-FLOOR', 'REUSABLE', 'Test',
        0, 'DRAFT', 'PENDING',
        1800,
        now(), now()
      ) RETURNING id
    `
    expect(ids.length).toBe(1)
    await prisma.voucher.delete({ where: { id: ids[0]!.id } })
  })

  it('accepts cooldownSeconds = null on REUSABLE', async () => {
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "Voucher" (
        "id", "merchantId", "code", "type", "title",
        "estimatedSaving", "status", "approvalStatus",
        "cooldownSeconds", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        (SELECT id FROM "Merchant" LIMIT 1),
        'TEST-COOLDOWN-OK-NULL-REUSABLE', 'REUSABLE', 'Test',
        0, 'DRAFT', 'PENDING',
        NULL,
        now(), now()
      ) RETURNING id
    `
    expect(ids.length).toBe(1)
    await prisma.voucher.delete({ where: { id: ids[0]!.id } })
  })

  it('accepts cooldownSeconds = null on non-REUSABLE', async () => {
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "Voucher" (
        "id", "merchantId", "code", "type", "title",
        "estimatedSaving", "status", "approvalStatus",
        "cooldownSeconds", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        (SELECT id FROM "Merchant" LIMIT 1),
        'TEST-COOLDOWN-OK-NULL-BOGO', 'BOGO', 'Test',
        0, 'DRAFT', 'PENDING',
        NULL,
        now(), now()
      ) RETURNING id
    `
    expect(ids.length).toBe(1)
    await prisma.voucher.delete({ where: { id: ids[0]!.id } })
  })
})
```

- [ ] **Step 1.7 — Run schema test**

Run: `npx vitest run tests/api/redemption/cooldown-schema.test.ts`
Expected: 5 tests pass.

- [ ] **Step 1.8 — Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ tests/api/redemption/cooldown-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): add Voucher.cooldownSeconds + DB CHECK constraints

REUSABLE v1 — first commit. Adds the column the rest of the feature
depends on. Two CHECK constraints (floor + REUSABLE-only) enforce
integrity even if a future migration/script bypasses Zod or service
validation. Same pattern as the existing §AG3 RedemptionScreenshotEvent
platform check.

Migration validates both constraints exist + 5 ingress scenarios
(reject below floor, reject non-REUSABLE scope, accept floor-inclusive,
accept null on REUSABLE, accept null on non-REUSABLE).

Spec §4.1, §4.3, D1, D3.
EOF
)"
```

---

## Task 2: REUSABLE constants module + helpers

**Files:**
- Create: `src/api/redemption/reusable.ts`
- Create: `tests/api/redemption/reusable.test.ts`

- [ ] **Step 2.1 — Write the failing tests first**

Create `tests/api/redemption/reusable.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REUSABLE_COOLDOWN_SECONDS,
  MIN_REUSABLE_COOLDOWN_SECONDS,
  effectiveCooldownSeconds,
  computeAvailableAgainAt,
} from '../../../src/api/redemption/reusable'

describe('REUSABLE constants + helpers', () => {
  describe('constants', () => {
    it('DEFAULT_REUSABLE_COOLDOWN_SECONDS is 4 hours (14400s)', () => {
      expect(DEFAULT_REUSABLE_COOLDOWN_SECONDS).toBe(4 * 60 * 60)
    })

    it('MIN_REUSABLE_COOLDOWN_SECONDS is 30 minutes (1800s)', () => {
      expect(MIN_REUSABLE_COOLDOWN_SECONDS).toBe(30 * 60)
    })
  })

  describe('effectiveCooldownSeconds', () => {
    it('returns DEFAULT when cooldownSeconds is null', () => {
      expect(effectiveCooldownSeconds({ cooldownSeconds: null })).toBe(14400)
    })

    it('returns merchant value when >= floor', () => {
      expect(effectiveCooldownSeconds({ cooldownSeconds: 3600 })).toBe(3600)
      expect(effectiveCooldownSeconds({ cooldownSeconds: 1800 })).toBe(1800)
      expect(effectiveCooldownSeconds({ cooldownSeconds: 86400 })).toBe(86400)
    })

    it('clamps merchant value to floor when below MIN', () => {
      // Defense in depth — should be unreachable in practice due to Zod + DB CHECK,
      // but the runtime clamp is the non-bypassable safety net.
      expect(effectiveCooldownSeconds({ cooldownSeconds: 0 })).toBe(1800)
      expect(effectiveCooldownSeconds({ cooldownSeconds: 60 })).toBe(1800)
      expect(effectiveCooldownSeconds({ cooldownSeconds: 1799 })).toBe(1800)
    })
  })

  describe('computeAvailableAgainAt', () => {
    it('returns null when lastRedeemedAt is null', () => {
      expect(computeAvailableAgainAt(null, { cooldownSeconds: null })).toBeNull()
    })

    it('returns lastRedeemedAt + effectiveCooldown (default 4h)', () => {
      const last = new Date('2026-05-12T12:00:00Z')
      const result = computeAvailableAgainAt(last, { cooldownSeconds: null })
      expect(result).not.toBeNull()
      expect(result!.toISOString()).toBe('2026-05-12T16:00:00.000Z')
    })

    it('returns lastRedeemedAt + merchant cooldown', () => {
      const last = new Date('2026-05-12T12:00:00Z')
      const result = computeAvailableAgainAt(last, { cooldownSeconds: 1800 })
      expect(result!.toISOString()).toBe('2026-05-12T12:30:00.000Z')
    })

    it('clamps when merchant cooldown is below floor', () => {
      const last = new Date('2026-05-12T12:00:00Z')
      const result = computeAvailableAgainAt(last, { cooldownSeconds: 60 })
      // Clamped to 1800 → +30min
      expect(result!.toISOString()).toBe('2026-05-12T12:30:00.000Z')
    })

    it('handles 7-day cooldown correctly', () => {
      const last = new Date('2026-05-12T12:00:00Z')
      const result = computeAvailableAgainAt(last, { cooldownSeconds: 7 * 24 * 60 * 60 })
      expect(result!.toISOString()).toBe('2026-05-19T12:00:00.000Z')
    })
  })
})
```

- [ ] **Step 2.2 — Run tests to verify they fail**

Run: `npx vitest run tests/api/redemption/reusable.test.ts`
Expected: FAIL — cannot find module `../../../src/api/redemption/reusable`.

- [ ] **Step 2.3 — Implement the module**

Create `src/api/redemption/reusable.ts`:

```ts
/**
 * REUSABLE voucher cooldown — constants and helpers.
 *
 * REUSABLE v1 is a cooldown-based reusable voucher type. Customer is
 * blocked from re-redeeming the same (userId, voucherId) until
 * effectiveCooldownSeconds has elapsed since the last redemption.
 *
 * Server-enforced minimum floor (MIN_REUSABLE_COOLDOWN_SECONDS) is the
 * non-bypassable safety net — Math.max clamps even if a bad value
 * somehow slipped past Zod validation + DB CHECK constraint. Defense
 * in depth per spec §4.4.
 *
 * Spec: docs/superpowers/specs/2026-05-12-reusable-voucher-design.md §4.5
 */

/** Platform default — 4 hours (14400s). Used when Voucher.cooldownSeconds is null. */
export const DEFAULT_REUSABLE_COOLDOWN_SECONDS = 4 * 60 * 60

/** Server-enforced minimum floor — 30 minutes (1800s). */
export const MIN_REUSABLE_COOLDOWN_SECONDS = 30 * 60

/**
 * Resolve the effective cooldown for a REUSABLE voucher.
 *
 * - null cooldownSeconds → platform default (4h)
 * - non-null → merchant value, clamped to floor at runtime
 */
export function effectiveCooldownSeconds(
  voucher: { cooldownSeconds: number | null },
): number {
  return Math.max(
    voucher.cooldownSeconds ?? DEFAULT_REUSABLE_COOLDOWN_SECONDS,
    MIN_REUSABLE_COOLDOWN_SECONDS,
  )
}

/**
 * Compute when a user becomes eligible to redeem this REUSABLE voucher again,
 * given their most recent redemption time.
 *
 * - null lastRedeemedAt → null (no prior redemption, available now)
 * - otherwise → lastRedeemedAt + effectiveCooldownSeconds
 *
 * The caller is responsible for comparing against `now` to decide whether
 * the user is currently in cooldown.
 */
export function computeAvailableAgainAt(
  lastRedeemedAt: Date | null,
  voucher: { cooldownSeconds: number | null },
): Date | null {
  if (!lastRedeemedAt) return null
  return new Date(lastRedeemedAt.getTime() + effectiveCooldownSeconds(voucher) * 1000)
}
```

- [ ] **Step 2.4 — Run tests to verify they pass**

Run: `npx vitest run tests/api/redemption/reusable.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 2.5 — TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 2.6 — Commit**

```bash
git add src/api/redemption/reusable.ts tests/api/redemption/reusable.test.ts
git commit -m "$(cat <<'EOF'
feat(redemption): REUSABLE constants + helpers module

src/api/redemption/reusable.ts:
  - DEFAULT_REUSABLE_COOLDOWN_SECONDS = 14400 (4h)
  - MIN_REUSABLE_COOLDOWN_SECONDS     =  1800 (30min)
  - effectiveCooldownSeconds(voucher) — Math.max clamp safety net
  - computeAvailableAgainAt(lastRedeemedAt, voucher)

Mirrors the M4a getCurrentWindowOccurrence modular pattern. Backend
uses these for redemption guard + customer payload. Customer-app
does not import — server sends availableAgainAt as ISO string.

Spec §4.5, D5.
EOF
)"
```

---

## Task 3: Redemption service — pre-PIN Guard 8a REUSABLE branch

**Files:**
- Modify: `src/api/redemption/service.ts` — add Guard 8a REUSABLE branch + new error code registration
- Create: `tests/api/redemption/cooldown-guard.test.ts` — guard tests
- Modify: existing error registry (location depends on current code layout — verify at implementation time)

### Step 3.1 — Locate the guard order in `service.ts`

Read `src/api/redemption/service.ts`. Find the `createRedemption` function. Locate the type-aware redemption check at "Guard 7" — currently has two branches: `if (voucher.type === 'TIME_LIMITED') { … }` else `{ // cycle voucher branch using UserVoucherCycleState … }`.

Confirm line numbers match the imports needed. Confirm `prisma` and `redis` are imported. Confirm `AppError` and any error-code enum/type registry can take a new code.

### Step 3.2 — Register the new error code

If there is a typed error registry / Zod enum / shared types file declaring error codes, add `'REUSABLE_COOLDOWN_ACTIVE'`. Verify the customer-app's `apps/customer-app/src/lib/api/redemption.ts` error-type union also needs updating — that goes in Task 7 alongside the Zod schema additions, but the BACKEND-SIDE error code registration happens HERE.

- [ ] **Step 3.2 — Add `REUSABLE_COOLDOWN_ACTIVE` to the backend error code registry**

If `AppError` accepts free-form code strings, no central registration needed; skip. Otherwise add the new code where existing codes (`ALREADY_REDEEMED`, `ALREADY_REDEEMED_THIS_WINDOW`, etc.) are declared. The payload shape is `{ availableAgainAt: string }` (ISO).

### Step 3.3 — Write failing tests for Guard 8a

- [ ] **Step 3.3 — Create cooldown-guard tests**

Create `tests/api/redemption/cooldown-guard.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRedemption } from '../../../src/api/redemption/service'
import { prisma } from '../../../src/lib/prisma'
// NB: import paths may differ — verify against the existing repo conventions
// in tests/api/redemption/service.test.ts.

const NOW = new Date('2026-05-12T12:00:00Z')

describe('createRedemption — REUSABLE pre-PIN Guard 8a (cooldown)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fast-fails REUSABLE_COOLDOWN_ACTIVE when last redemption inside cooldown', async () => {
    // Set up: REUSABLE voucher with 4h cooldown (default null).
    // Last redemption 1h ago. cooldown active for 3 more hours.
    const lastRedeemedAt = new Date(NOW.getTime() - 60 * 60 * 1000)
    const expectedAvailableAgainAt = new Date(lastRedeemedAt.getTime() + 4 * 60 * 60 * 1000)

    // Mock prisma queries: voucher lookup returns REUSABLE; latest redemption returns lastRedeemedAt.
    // (Exact mocking pattern depends on existing service.test.ts conventions.)
    // Example using vi.spyOn:
    vi.spyOn(prisma.voucher, 'findUnique').mockResolvedValueOnce({
      id: 'vid', type: 'REUSABLE', status: 'ACTIVE', approvalStatus: 'APPROVED',
      cooldownSeconds: null,
      merchant: { id: 'mid', status: 'ACTIVE' },
      availabilityWindows: [],
      // … other fields fixture-shaped
    } as any)
    // … plus mocks for branch, subscription, user, voucherRedemption.findFirst returning lastRedeemedAt

    await expect(
      createRedemption({ userId: 'uid', voucherId: 'vid', branchId: 'bid', pin: '1234' })
    ).rejects.toMatchObject({
      code: 'REUSABLE_COOLDOWN_ACTIVE',
      context: { availableAgainAt: expectedAvailableAgainAt.toISOString() },
    })
  })

  it('passes Guard 8a when cooldown elapsed', async () => {
    // Last redemption 5h ago. cooldown was 4h. Available now.
    const lastRedeemedAt = new Date(NOW.getTime() - 5 * 60 * 60 * 1000)
    // … mock setup similar to above …
    // Expect: Guard 8a passes (does not throw COOLDOWN_ACTIVE).
    // It will likely fail later at PIN compare or atomic-claim, but NOT at 8a.
  })

  it('passes Guard 8a when no prior redemption', async () => {
    // voucherRedemption.findFirst returns null. Guard 8a passes through.
  })

  it('uses MIN floor (1800s) when merchant cooldownSeconds is below floor', async () => {
    // Merchant cooldownSeconds = 60 (somehow slipped past Zod + DB).
    // Last redemption 5min ago.
    // 5min < 30min floor → still in cooldown → COOLDOWN_ACTIVE with availableAgainAt = lastRedeemedAt + 30min.
  })

  it('uses merchant cooldownSeconds when >= floor', async () => {
    // Merchant cooldownSeconds = 7200 (2h).
    // Last redemption 1h ago → COOLDOWN_ACTIVE with availableAgainAt = lastRedeemedAt + 2h.
  })

  it('does NOT fire Guard 8a for non-REUSABLE voucher types', async () => {
    // BOGO voucher, recent redemption — cycle gate fires, NOT cooldown gate.
  })
})
```

- [ ] **Step 3.4 — Run tests to verify they fail**

Run: `npx vitest run tests/api/redemption/cooldown-guard.test.ts`
Expected: FAIL — Guard 8a branch doesn't exist yet, so REUSABLE flows through the existing cycle-state gate and produces wrong error codes.

### Step 3.5 — Implement Guard 8a

- [ ] **Step 3.5 — Add Guard 8a REUSABLE branch + function-scope cooldown hoist**

In `src/api/redemption/service.ts`, locate the existing Guard 7 type-aware redemption check. Modify it to add the REUSABLE branch:

Before (existing):
```ts
if (voucher.type === 'TIME_LIMITED') {
  // existing TL branch …
} else {
  // existing cycle-voucher branch …
}
```

After:
```ts
// Function-scope hoist (D12) — shared between Guard 8a and the atomic-claim
// transaction below. Only computed for REUSABLE; remains undefined for other types.
let effectiveCooldownMs: number | undefined = undefined
if (voucher.type === 'REUSABLE') {
  effectiveCooldownMs = effectiveCooldownSeconds(voucher) * 1000
}

if (voucher.type === 'TIME_LIMITED') {
  // existing TL branch — unchanged
  // …
} else if (voucher.type === 'REUSABLE') {
  // (NEW) Pre-PIN fast-fail cooldown check.
  const latest = await prisma.voucherRedemption.findFirst({
    where:   { userId, voucherId: data.voucherId },
    orderBy: { redeemedAt: 'desc' },
    select:  { redeemedAt: true },
  })
  if (latest && now.getTime() < latest.redeemedAt.getTime() + effectiveCooldownMs!) {
    throw new AppError('REUSABLE_COOLDOWN_ACTIVE', {
      availableAgainAt: new Date(
        latest.redeemedAt.getTime() + effectiveCooldownMs!,
      ).toISOString(),
    })
  }
  // REUSABLE bypasses UserVoucherCycleState entirely — no read, no write.
} else {
  // existing cycle-voucher branch — unchanged
  // …
}
```

Import `effectiveCooldownSeconds` at the top of the file:
```ts
import { effectiveCooldownSeconds } from './reusable'
```

- [ ] **Step 3.6 — Run tests to verify they pass**

Run: `npx vitest run tests/api/redemption/cooldown-guard.test.ts`
Expected: 6 tests pass.

- [ ] **Step 3.7 — Verify existing tests still green**

Run: `npx vitest run tests/api/redemption/`
Expected: all existing redemption tests still pass. The TL branch and cycle branch are unchanged structurally — only the wrapping `if/else` chain gained a REUSABLE arm.

- [ ] **Step 3.8 — Commit**

```bash
git add src/api/redemption/service.ts tests/api/redemption/cooldown-guard.test.ts
git commit -m "$(cat <<'EOF'
feat(redemption): pre-PIN Guard 8a REUSABLE branch

Adds the third type-aware branch to createRedemption's Guard 7 chain.
REUSABLE fast-fails with REUSABLE_COOLDOWN_ACTIVE when the latest
redemption for (userId, voucherId) is inside the effective cooldown
window. Payload carries availableAgainAt as ISO string.

effectiveCooldownMs is hoisted to function scope (D12) so the atomic-
claim transaction in the next commit can re-use it under the advisory
lock. REUSABLE explicitly skips UserVoucherCycleState (Q2 + Q5 D13).

Spec §5.1, §5.2, D7-D12.
EOF
)"
```

---

## Task 4: Redemption service — atomic-claim REUSABLE branch + advisory lock + real-DB race test

**Files:**
- Modify: `src/api/redemption/service.ts` — atomic-claim REUSABLE branch with advisory lock
- Create: `tests/api/redemption/atomic-claim-reusable.test.ts` — mocked branch tests
- Create: `tests/api/redemption/advisory-lock-race.integration.test.ts` — **real-DB** race test (D51 Amendment 1)

### Step 4.1 — Write mocked atomic-claim tests

- [ ] **Step 4.1 — Create atomic-claim mocked tests**

Create `tests/api/redemption/atomic-claim-reusable.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRedemption } from '../../../src/api/redemption/service'
// … imports + setup mirroring cooldown-guard.test.ts

const NOW = new Date('2026-05-12T12:00:00Z')

describe('createRedemption — REUSABLE atomic claim', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('on success: inserts VoucherRedemption with windowStartsAt=null + no UserVoucherCycleState write', async () => {
    // Mock the full flow: voucher lookup, branch, subscription, phone, Guard 8a pass,
    // PIN compare pass. Then the transaction runs.
    // Assert: voucherRedemption.create called with windowStartsAt: null.
    // Assert: userVoucherCycleState.upsert NOT called.
  })

  it('on transactional re-check failure: rejects with REUSABLE_COOLDOWN_ACTIVE', async () => {
    // Pre-PIN Guard 8a passes (latest redemption is older than cooldown).
    // Inside the transaction, the lock-acquire returns, then re-read shows a NEW
    // redemption inserted by a concurrent transaction. throw COOLDOWN_ACTIVE.
  })

  it('calls pg_advisory_xact_lock with hashtext(userId) + hashtext(voucherId)', async () => {
    // Spy on tx.$executeRaw and assert the lock call shape.
    // (Implementation-detail-sensitive; useful as a smoke test for the lock-call wiring.)
  })

  it('lock release is implicit on transaction commit (no manual unlock)', async () => {
    // Assert: no pg_advisory_xact_unlock call. Postgres releases on commit.
  })
})
```

- [ ] **Step 4.2 — Run tests to verify they fail**

Run: `npx vitest run tests/api/redemption/atomic-claim-reusable.test.ts`
Expected: FAIL — atomic-claim branch for REUSABLE doesn't exist yet.

### Step 4.3 — Implement atomic-claim REUSABLE branch

- [ ] **Step 4.3 — Add atomic-claim REUSABLE branch with advisory lock**

In `src/api/redemption/service.ts`, locate the existing `prisma.$transaction(async (tx) => { … })` block that handles the atomic claim. Extend with a REUSABLE branch BEFORE the TIME_LIMITED branch:

```ts
await prisma.$transaction(async (tx) => {
  if (voucher.type === 'REUSABLE') {
    // (NEW) Advisory lock — serializes concurrent redemption attempts for
    // this (userId, voucherId). Released on commit/rollback (Postgres
    // automatically releases pg_advisory_xact_lock at transaction end).
    //
    // Implementation note (spec amendment 2026-05-12): the two-int form
    // is the design contract. Postgres hashtext(text) returns int4, which
    // matches pg_advisory_xact_lock(int, int) signature. If a cast is
    // needed at runtime, adjust here while preserving the invariant:
    // lock keyed on (userId, voucherId), transaction-scoped only.
    // The real-DB race test in advisory-lock-race.integration.test.ts is
    // the canonical proof for whichever expression ships.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${data.voucherId}))
    `

    // Authoritative cooldown re-check under the lock.
    const latest = await tx.voucherRedemption.findFirst({
      where:   { userId, voucherId: data.voucherId },
      orderBy: { redeemedAt: 'desc' },
      select:  { redeemedAt: true },
    })
    if (latest && now.getTime() < latest.redeemedAt.getTime() + effectiveCooldownMs!) {
      throw new AppError('REUSABLE_COOLDOWN_ACTIVE', {
        availableAgainAt: new Date(
          latest.redeemedAt.getTime() + effectiveCooldownMs!,
        ).toISOString(),
      })
    }

    // Insert. windowStartsAt stays null (D11) — Postgres distinct-NULL
    // semantics keep the existing @@unique([userId, voucherId, windowStartsAt])
    // constraint non-conflicting.
    await tx.voucherRedemption.create({ data: {
      userId,
      voucherId: data.voucherId,
      branchId: data.branchId,
      redemptionCode,
      estimatedSaving: voucher.estimatedSaving,
      windowStartsAt: null,
    }})

    // Explicitly NO UserVoucherCycleState write — REUSABLE bypasses it.
    return
  }

  if (voucher.type === 'TIME_LIMITED') {
    // existing TL atomic-claim — unchanged
  } else {
    // existing cycle-voucher atomic-claim — unchanged
  }
})
```

- [ ] **Step 4.4 — Run mocked tests to verify they pass**

Run: `npx vitest run tests/api/redemption/atomic-claim-reusable.test.ts`
Expected: 4 tests pass.

### Step 4.5 — Real-DB integration test (D51 Amendment 1)

- [ ] **Step 4.5 — Create the real-DB race test**

Create `tests/api/redemption/advisory-lock-race.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../../src/lib/prisma'
import { createRedemption } from '../../../src/api/redemption/service'

/**
 * Real-DB integration test for the REUSABLE advisory-lock race protection.
 *
 * Per spec §5.5 (D51 Amendment 1, amendment 2026-05-12): this is the
 * CANONICAL proof that whichever lock expression ships actually serialises
 * two concurrent transactions for the same (userId, voucherId).
 *
 * Mocked tests prove branch shape + error format. They cannot prove the
 * lock semantics — only a real Postgres pg_advisory_xact_lock can.
 *
 * Setup: real Neon DB. Creates fixture user + merchant + REUSABLE voucher +
 * branch with a known PIN. Tears down on each test.
 *
 * Test: kick off two concurrent createRedemption calls for the same
 * (userId, voucherId) but at the same instant. Exactly one must succeed
 * (commits a VoucherRedemption row) and exactly one must fail with
 * REUSABLE_COOLDOWN_ACTIVE.
 */

const NOW = new Date('2026-05-12T12:00:00Z')

describe('REUSABLE advisory lock — real-DB race (integration)', () => {
  let userId: string
  let voucherId: string
  let branchId: string
  let merchantId: string

  beforeEach(async () => {
    // Create fixture user, merchant, branch, voucher inside the DB.
    // Use unique codes to avoid collisions with existing test runs.
    const ts = Date.now()
    const merchant = await prisma.merchant.create({
      data: { name: `race-test-merchant-${ts}`, status: 'ACTIVE', /* … minimum required */ },
    })
    merchantId = merchant.id

    const branch = await prisma.branch.create({
      data: {
        merchantId, name: `race-test-branch-${ts}`,
        // PIN: encrypted form for "1234"; reuse the existing encrypt helper
        // from src/api/branch/pin.ts (verify path at implementation time).
        redemptionPin: /* encrypted "1234" */,
      },
    })
    branchId = branch.id

    const voucher = await prisma.voucher.create({
      data: {
        merchantId,
        code: `RACE-${ts}`,
        type: 'REUSABLE',
        title: 'Race-test reusable',
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        estimatedSaving: '0.00',
        cooldownSeconds: 1800,   // 30min floor — short enough to test
      },
    })
    voucherId = voucher.id

    const user = await prisma.user.create({
      data: {
        email: `race-test-${ts}@redeemo.test`,
        phoneVerified: true,
        // … minimum required fields …
      },
    })
    userId = user.id

    await prisma.subscription.create({
      data: {
        userId, status: 'ACTIVE',
        cycleAnchorDate: new Date('2026-01-01T00:00:00Z'),
        // … minimum subscription fields …
      },
    })
  })

  afterEach(async () => {
    // Tear down fixtures in dependency order.
    await prisma.voucherRedemption.deleteMany({ where: { userId } })
    await prisma.subscription.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.voucher.deleteMany({ where: { id: voucherId } })
    await prisma.branch.deleteMany({ where: { id: branchId } })
    await prisma.merchant.deleteMany({ where: { id: merchantId } })
  })

  it('two concurrent redemption attempts: exactly one succeeds, the other fails with REUSABLE_COOLDOWN_ACTIVE', async () => {
    // Fire both attempts concurrently.
    const [result1, result2] = await Promise.allSettled([
      createRedemption({ userId, voucherId, branchId, pin: '1234' }),
      createRedemption({ userId, voucherId, branchId, pin: '1234' }),
    ])

    // Sort into (succeeded, failed).
    const succeeded = [result1, result2].filter(r => r.status === 'fulfilled')
    const failed    = [result1, result2].filter(r => r.status === 'rejected')

    // Exactly one succeeded.
    expect(succeeded.length).toBe(1)
    expect(failed.length).toBe(1)

    // The failed one has the expected error code + payload.
    const reason = (failed[0] as PromiseRejectedResult).reason
    expect(reason.code).toBe('REUSABLE_COOLDOWN_ACTIVE')
    expect(reason.context).toHaveProperty('availableAgainAt')
    expect(typeof reason.context.availableAgainAt).toBe('string')

    // Exactly one VoucherRedemption row exists in the DB.
    const rows = await prisma.voucherRedemption.findMany({ where: { userId, voucherId } })
    expect(rows.length).toBe(1)
  })
})
```

> **Note for implementer:** The exact branch-PIN encryption helper, the minimum required fields for `merchant`, `user`, `branch`, `subscription`, and the prisma import path may differ from this skeleton. Adjust based on the existing patterns in `prisma/seed.ts` and other integration tests in `tests/api/`. The CONTRACT this test must enforce is unchanged: two concurrent calls → exactly one success → exactly one REUSABLE_COOLDOWN_ACTIVE.

- [ ] **Step 4.6 — Run the real-DB integration test**

Run: `npx vitest run tests/api/redemption/advisory-lock-race.integration.test.ts`
Expected: 1 test passes against the live Neon dev DB.

If it fails: this is the moment to verify the actual lock signature. Inspect Postgres `pg_locks` during the test to confirm advisory locks are being acquired. If `hashtext` casting is ambiguous, adjust the lock-call expression in `service.ts` (e.g. add `::int` casts) while preserving the per-(userId, voucherId) invariant, then re-run.

- [ ] **Step 4.7 — Full redemption suite + tsc**

Run: `npx vitest run tests/api/redemption/`
Expected: all green.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4.8 — Commit**

```bash
git add src/api/redemption/service.ts tests/api/redemption/atomic-claim-reusable.test.ts tests/api/redemption/advisory-lock-race.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(redemption): REUSABLE atomic-claim with advisory lock + real-DB race test

Adds the third atomic-claim branch (REUSABLE) inside the prisma transaction.
Acquires pg_advisory_xact_lock per (userId, voucherId) — two-int form,
auto-released on commit/rollback. Re-reads the latest redemption under
the lock for the authoritative cooldown check. Inserts VoucherRedemption
with windowStartsAt=null; explicitly NO UserVoucherCycleState write.

Real-DB integration test (D51 Amendment 1, spec §5.5) proves the lock
actually serialises: two concurrent createRedemption calls for the same
(userId, voucherId) result in exactly one VoucherRedemption row + one
REUSABLE_COOLDOWN_ACTIVE rejection.

Spec §5.2, §5.4, §5.5, D7-D12, amendment 2026-05-12.
EOF
)"
```

---

## Task 5: Customer payload — `getCustomerVoucher` REUSABLE deltas

**Files:**
- Modify: `src/api/customer/discovery/service.ts` — `getCustomerVoucher` REUSABLE branch
- Modify: `tests/api/customer/discovery/voucher-payload.test.ts` (or equivalent — verify name at implementation time)

### Step 5.1 — Write failing payload contract tests

- [ ] **Step 5.1 — Add REUSABLE payload contract tests**

Open `tests/api/customer/discovery/voucher-payload.test.ts` (or the equivalent existing file). Add:

```ts
describe('getCustomerVoucher — REUSABLE deltas (spec §6.1)', () => {
  it('returns effectiveCooldownSeconds = 14400 when Voucher.cooldownSeconds is null', async () => {
    // Fixture: REUSABLE voucher with cooldownSeconds = null.
    // Assert: payload.voucher.effectiveCooldownSeconds === 14400.
  })

  it('returns effectiveCooldownSeconds = merchant value when set', async () => {
    // Fixture: REUSABLE voucher with cooldownSeconds = 3600.
    // Assert: payload.voucher.effectiveCooldownSeconds === 3600.
  })

  it('returns effectiveCooldownSeconds = null for non-REUSABLE voucher', async () => {
    // Fixture: BOGO voucher.
    // Assert: payload.voucher.effectiveCooldownSeconds === null.
  })

  it('isRedeemedThisCycle is always false for REUSABLE (D13)', async () => {
    // Fixture: REUSABLE voucher; user has a redemption row from 1h ago.
    // Assert: payload.isRedeemedThisCycle === false.
  })

  it('availableAgainAt = lastRedeemedAt + effectiveCooldownMs (in cooldown)', async () => {
    // Last redemption 1h ago, 4h cooldown → availableAgainAt 3h from now.
  })

  it('availableAgainAt = null when no prior redemption', async () => {
    // No redemption history.
    // Assert: payload.availableAgainAt === null.
  })

  it('availableAgainAt = null when cooldown elapsed', async () => {
    // Last redemption 5h ago, 4h cooldown → availableAgainAt should still
    // compute to 1h ago, but the convention is null when <= now to make
    // the customer-app branch simpler. (Implementation: compute and check.)
  })

  it('lastRedemption payload present within 2h of redemption', async () => {
    // Redemption 1h ago → presentation window alive → lastRedemption populated.
  })

  it('lastRedemption payload null after 2h, regardless of cooldown (D14)', async () => {
    // Redemption 3h ago, cooldown 4h → still in cooldown but presentation expired.
    // Assert: payload.lastRedemption === null AND payload.availableAgainAt is set.
    // This is the two-clock independence pin.
  })

  it('lastRedemption payload present in state 4 (presentation alive, cooldown elapsed)', async () => {
    // Redemption 35min ago, 30min cooldown → presentation alive, cooldown elapsed.
    // Assert: payload.lastRedemption populated AND payload.availableAgainAt = null.
  })
})
```

- [ ] **Step 5.2 — Run tests to verify they fail**

Run: `npx vitest run tests/api/customer/discovery/voucher-payload.test.ts`
Expected: FAIL — `effectiveCooldownSeconds` field missing, `isRedeemedThisCycle` returns true for REUSABLE post-redemption, etc.

### Step 5.3 — Implement payload changes

- [ ] **Step 5.3 — Modify `getCustomerVoucher` to emit REUSABLE-aware payload**

Open `src/api/customer/discovery/service.ts`. Find `getCustomerVoucher`. Make these changes:

1. Import the helpers:
```ts
import { effectiveCooldownSeconds, computeAvailableAgainAt } from '../../redemption/reusable'
```

2. After fetching the voucher, compute REUSABLE-specific fields:
```ts
// REUSABLE: bypass the cycle-state gate; compute cooldown-based availability.
let effectiveCooldownSecondsValue: number | null = null
let availableAgainAt: string | null = null
let isRedeemedThisCycle = /* existing computation for non-REUSABLE */ false

if (voucher.type === 'REUSABLE') {
  effectiveCooldownSecondsValue = effectiveCooldownSeconds(voucher)

  // For REUSABLE, the "available again" gate is based on the latest redemption.
  const latest = await prisma.voucherRedemption.findFirst({
    where:   { userId, voucherId },
    orderBy: { redeemedAt: 'desc' },
    select:  { redeemedAt: true },
  })
  const computed = computeAvailableAgainAt(latest?.redeemedAt ?? null, voucher)
  // Surface only when in the future; <= now means available now (null per Q5).
  if (computed && computed > now) {
    availableAgainAt = computed.toISOString()
  }
  isRedeemedThisCycle = false  // D13 lock
}
// For non-REUSABLE, retain existing logic (TIME_LIMITED + cycle vouchers).
```

3. Add `effectiveCooldownSeconds: effectiveCooldownSecondsValue` and the new `availableAgainAt` (REUSABLE semantics) to the return payload.

4. Confirm `lastRedemption` gating already enforces the 2h presentation window from M3 — that's the locked M3 contract. For REUSABLE, the same gating applies unchanged (D14).

- [ ] **Step 5.4 — Run tests to verify they pass**

Run: `npx vitest run tests/api/customer/discovery/voucher-payload.test.ts`
Expected: 10 tests pass.

- [ ] **Step 5.5 — Backend full sweep + tsc**

Run: `npx vitest run`
Run: `npx tsc --noEmit`
Both expected clean.

- [ ] **Step 5.6 — Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/voucher-payload.test.ts
git commit -m "$(cat <<'EOF'
feat(payload): getCustomerVoucher REUSABLE deltas

Adds REUSABLE-specific fields to the customer voucher payload:
  - effectiveCooldownSeconds (server-clamped, never null for REUSABLE)
  - availableAgainAt (ISO; null when current time >= lastRedeemedAt + cooldown)
  - isRedeemedThisCycle: false always for REUSABLE (D13)

lastRedemption gating unchanged — stays 2h presentation-window-only
per M3 contract + Q5 D14. Two-clock independence (presentation window
vs cooldown) is now testable end-to-end: 10 new payload contract pins
including state 4 (cooldown elapsed + presentation alive simultaneously).

Spec §6.1, §6.3, D13-D16.
EOF
)"
```

---

## Task 6: Customer payload — `getCustomerMerchant` per-card `reusableState`

**Files:**
- Modify: `src/api/customer/discovery/service.ts` — `getCustomerMerchant` per-voucher block
- Modify: `tests/api/customer/discovery/merchant-payload.test.ts` (or equivalent)

- [ ] **Step 6.1 — Write failing test for `reusableState` on merchant voucher cards**

Add to the merchant-payload test file:

```ts
describe('getCustomerMerchant — per-card reusableState (spec §6.4)', () => {
  it('REUSABLE voucher: reusableState.availableAgainAt populated in cooldown', async () => {
    // Fixture: REUSABLE voucher; last redemption 1h ago, 4h cooldown.
    // Assert: voucher.reusableState.availableAgainAt is set to ISO of (last + 4h).
  })

  it('REUSABLE voucher: reusableState.availableAgainAt = null when no recent redemption', async () => {
    // Fixture: REUSABLE voucher; no redemption history.
    // Assert: voucher.reusableState.availableAgainAt === null.
  })

  it('REUSABLE voucher: reusableState omitted/null when cooldown elapsed', async () => {
    // Last redemption 5h ago, 4h cooldown → no longer in cooldown.
    // Assert: reusableState.availableAgainAt === null.
  })

  it('non-REUSABLE voucher: reusableState field absent/null', async () => {
    // Fixture: BOGO voucher.
    // Assert: voucher.reusableState is null or undefined.
  })
})
```

- [ ] **Step 6.2 — Run tests to verify they fail**

Run: `npx vitest run tests/api/customer/discovery/merchant-payload.test.ts`
Expected: FAIL.

- [ ] **Step 6.3 — Implement reusableState on merchant cards**

In `getCustomerMerchant`, when mapping per-voucher data, add the same kind of REUSABLE branch:

```ts
let reusableState: { availableAgainAt: string | null } | null = null
if (voucher.type === 'REUSABLE') {
  const latest = await prisma.voucherRedemption.findFirst({
    where:   { userId, voucherId: voucher.id },
    orderBy: { redeemedAt: 'desc' },
    select:  { redeemedAt: true },
  })
  const computed = computeAvailableAgainAt(latest?.redeemedAt ?? null, voucher)
  reusableState = {
    availableAgainAt: (computed && computed > now) ? computed.toISOString() : null,
  }
}
// Attach reusableState to the voucher card payload (null for non-REUSABLE).
```

> **Performance note:** if N voucher cards each fire a separate `findFirst`, this becomes N queries per merchant profile. Consider batching with a single `groupBy` or `findMany + Map` lookup keyed on `voucherId`. Verify N at typical merchant sizes (5-15 vouchers) and decide if optimisation is needed for v1 or deferred. If deferred, add an `// OPTIMISE-LATER` comment so the next perf pass picks it up.

- [ ] **Step 6.4 — Run tests to verify they pass**

Run: `npx vitest run tests/api/customer/discovery/merchant-payload.test.ts`
Expected: 4 tests pass.

- [ ] **Step 6.5 — Backend full sweep + tsc**

Run: `npx vitest run`
Run: `npx tsc --noEmit`
Both expected clean.

- [ ] **Step 6.6 — Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/merchant-payload.test.ts
git commit -m "$(cat <<'EOF'
feat(payload): getCustomerMerchant per-card reusableState

Per-voucher reusableState: { availableAgainAt: ISO | null } added to
MerchantVoucher cards for REUSABLE types. Null/omitted for non-REUSABLE.
Drives the merchant card pill state in Task 11.

Spec §6.4, D17.
EOF
)"
```

---

## Task 7: Voucher API client + Zod schemas (customer-app)

**Files:**
- Modify: `apps/customer-app/src/lib/api/voucher.ts` — `voucherDetailSchema` additions
- Modify: `apps/customer-app/src/lib/api/merchant.ts` — `merchantVoucherSchema` additions
- Modify: `apps/customer-app/src/lib/api/redemption.ts` — `REUSABLE_COOLDOWN_ACTIVE` error type union
- Modify: existing tests in `apps/customer-app/tests/lib/api/`

- [ ] **Step 7.1 — Failing tests for Zod parsing**

Add to the voucher-API test file (verify path at implementation time):

```ts
describe('voucherDetailSchema — REUSABLE fields', () => {
  it('parses effectiveCooldownSeconds as number for REUSABLE', () => {
    const result = voucherDetailSchema.safeParse({
      // … existing fields …
      voucher: { /* … */ type: 'REUSABLE', effectiveCooldownSeconds: 14400, /* … */ },
      availableAgainAt: '2026-05-12T16:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('parses effectiveCooldownSeconds as null for non-REUSABLE', () => {
    const result = voucherDetailSchema.safeParse({
      voucher: { /* … */ type: 'BOGO', effectiveCooldownSeconds: null, /* … */ },
    })
    expect(result.success).toBe(true)
  })

  it('parses availableAgainAt as null when present', () => {
    // Cycle voucher payload — availableAgainAt may already be present from prior work.
    // Confirm null parses cleanly.
  })
})
```

- [ ] **Step 7.2 — Run to verify fail**

Run from `apps/customer-app`: `npx jest tests/lib/api/voucher.test.ts --forceExit`
Expected: FAIL.

- [ ] **Step 7.3 — Extend Zod schemas**

In `apps/customer-app/src/lib/api/voucher.ts`:

```ts
const voucherCoreSchema = z.object({
  // … existing fields …
  type: z.enum(['BOGO', 'SPEND_AND_SAVE', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT',
                'FREEBIE', 'PACKAGE_DEAL', 'TIME_LIMITED', 'REUSABLE']),
  effectiveCooldownSeconds: z.number().nullable(),  // REUSABLE only; null otherwise
  // … existing fields …
})

export const voucherDetailSchema = z.object({
  // … existing fields …
  voucher: voucherCoreSchema,
  isRedeemedThisCycle: z.boolean(),
  availableAgainAt: z.string().nullable(),  // ISO; type-specific semantics
  lastRedemption: lastRedemptionSchema.nullable(),  // existing — 2h presentation gated
  // … existing fields …
})
```

In `apps/customer-app/src/lib/api/merchant.ts`:

```ts
const merchantVoucherSchema = z.object({
  // … existing fields …
  reusableState: z.object({ availableAgainAt: z.string().nullable() }).nullable().optional(),
})
```

In `apps/customer-app/src/lib/api/redemption.ts`:

```ts
// Add to the error code union:
export type RedemptionErrorCode =
  | 'ALREADY_REDEEMED'
  | 'ALREADY_REDEEMED_THIS_WINDOW'
  | 'REUSABLE_COOLDOWN_ACTIVE'   // NEW
  | 'BRANCH_MERCHANT_MISMATCH'
  // … existing codes …
```

The `REUSABLE_COOLDOWN_ACTIVE` error payload type:
```ts
export type ReusableCooldownActiveContext = { availableAgainAt: string }   // ISO
```

- [ ] **Step 7.4 — Run tests to verify they pass**

Run: `npx jest tests/lib/api/ --forceExit`
Expected: all green.

- [ ] **Step 7.5 — `tsc --noEmit`**

Run from `apps/customer-app`: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7.6 — Commit**

```bash
git add apps/customer-app/src/lib/api/voucher.ts apps/customer-app/src/lib/api/merchant.ts apps/customer-app/src/lib/api/redemption.ts apps/customer-app/tests/lib/api/
git commit -m "$(cat <<'EOF'
feat(customer-app): Zod schemas + error type for REUSABLE payload

voucherDetailSchema gains effectiveCooldownSeconds (number | null);
merchantVoucherSchema gains reusableState ({ availableAgainAt } | null).
RedemptionErrorCode union gains REUSABLE_COOLDOWN_ACTIVE with
{ availableAgainAt: ISO } context.

Spec §6.1, §6.4, §5.3.
EOF
)"
```

---

## Task 8: `<HeroStatusBlock>` REUSABLE states

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx`
- Modify: `apps/customer-app/src/features/voucher/utils/timeLimitedWindow.ts` (if `WindowState` type lives there — extend the union)
- Modify: `apps/customer-app/tests/features/voucher/hero-status-block.test.tsx` — add REUSABLE state pins

- [ ] **Step 8.1 — Failing tests for REUSABLE eyebrows + supporting**

Add to `tests/features/voucher/hero-status-block.test.tsx`:

```tsx
describe('HeroStatusBlock — REUSABLE states (M5)', () => {
  const NOW = new Date('2026-05-12T12:00:00Z')

  it('reusable-available: eyebrow "Available now", primary + supporting suppressed', () => {
    const { getByTestId, queryByTestId } = render(
      <HeroStatusBlock
        windowState="reusable-available"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={null}
        msToClose={null}
        msToOpen={null}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available now')
    expect(queryByTestId('hero-status-primary')).toBeNull()    // suppressed
    expect(queryByTestId('hero-status-supporting')).toBeNull() // suppressed
  })

  it('reusable-cooldown ≥1h: eyebrow "Available again", primary countdown, supporting "Available again from <T> today"', () => {
    // availableAgainAt 3h 30m from now → primary "3h 30m"; supporting "Available again from 3:30pm today"
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="reusable-cooldown"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date(NOW.getTime() + 3 * 3_600_000 + 30 * 60_000)}
        msToClose={null}
        msToOpen={3 * 3_600_000 + 30 * 60_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available again')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('3h 30m')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available again from 3:30pm today')
  })

  it('reusable-cooldown <1h: eyebrow "Available again", primary "42m 15s", supporting "Available again from 1:42pm today"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="reusable-cooldown"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date(NOW.getTime() + 42 * 60_000 + 15_000)}
        msToClose={null}
        msToOpen={42 * 60_000 + 15_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available again')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('42m 15s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available again from 1:42pm today')
  })

  it('reusable-cooldown <1m: eyebrow "Available again", primary "47s"', () => {
    // edge case — <1m to available again
  })

  it('reusable-cooldown crosses midnight: supporting "Available again from 2am tomorrow"', () => {
    // 22:45 UTC now; availableAgainAt 01:15 next day UTC = 02:15 BST = 2:15am tomorrow
  })

  it('reusable-cooldown: progress bar HIDDEN (no denominator)', () => {
    const { queryByTestId } = render(
      <HeroStatusBlock
        windowState="reusable-cooldown"
        now={NOW}
        // … same setup as above …
        msToOpen={2 * 3_600_000}
      />,
    )
    expect(queryByTestId('hero-status-progress-bar')).toBeNull()
    expect(queryByTestId('hero-status-progress-bar-fill')).toBeNull()
  })

  it('reusable-available: progress bar HIDDEN', () => {
    // similar — no bar in available state either
  })

  it('a11y live-region — reusable-cooldown <1m: "Available again in under a minute"', () => {
    // mirrors formatAvailableAgainA11y locked
  })

  it('a11y live-region — reusable-cooldown <1h ≥1m: "Available again in about N minutes"', () => {
    // mirrors locked
  })

  it('a11y live-region — reusable-cooldown ≥1h: eyebrow-as-label "Available again" (no "Voucher " prefix per D38)', () => {
    // verifies the D38 amendment
  })
})
```

- [ ] **Step 8.2 — Run tests to verify they fail**

Run: `npx jest tests/features/voucher/hero-status-block.test.tsx --forceExit`
Expected: FAIL — REUSABLE states not in the enum.

- [ ] **Step 8.3 — Extend `WindowState` + `HeroStatusBlock`**

If `WindowState` is exported from `apps/customer-app/src/features/voucher/utils/timeLimitedWindow.ts`, extend:
```ts
export type WindowState =
  | 'active'
  | 'urgent'
  | 'unavailable-today'
  | 'unavailable-future-day'
  | 'no-windows'
  | 'reusable-available'    // NEW
  | 'reusable-cooldown'     // NEW
```

In `HeroStatusBlock.tsx`:
- Update the `HeroStatusBlockState` type to include the new values (already extends `WindowState` plus `'redeemed-this-window' | 'expired'`).
- Update the header doc comment to mention the REUSABLE states.
- In `deriveContent(props)`, add branches:

```ts
if (windowState === 'reusable-available') {
  return { eyebrow: 'Available now', primary: '', supporting: '' }
}

if (windowState === 'reusable-cooldown') {
  // msToOpen drives the countdown primary (same primary format as
  // the existing cycle/TL "opening direction"). nextWindowStartsAt
  // is the available-again instant.
  if (msToOpen === null || !nextWindowStartsAt) return null
  const supporting = formatSupportingClock(
    nextWindowStartsAt, now, 'Available again from',
  )
  return {
    eyebrow:    'Available again',
    primary:    formatDuration(msToOpen),
    supporting,
  }
}
```

- Suppress progress bar for REUSABLE: in `deriveProgressBar(props)`, add at the top:
```ts
if (windowState === 'reusable-available' || windowState === 'reusable-cooldown') {
  return null
}
```

- Update `deriveLiveRegionLabel` to handle REUSABLE: route `'reusable-cooldown'` through `formatAvailableAgainA11y(msToOpen)`. For `'reusable-available'`, return null (suppressed primary means nothing to announce).

In the render block, conditionally hide primary + supporting when content has empty strings (or refactor `Content` to allow `null` for those fields).

- [ ] **Step 8.4 — Run tests to verify they pass**

Run: `npx jest tests/features/voucher/hero-status-block.test.tsx --forceExit`
Expected: all REUSABLE state pins pass + existing tests still green.

- [ ] **Step 8.5 — `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8.6 — Commit**

```bash
git add apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx apps/customer-app/src/features/voucher/utils/timeLimitedWindow.ts apps/customer-app/tests/features/voucher/hero-status-block.test.tsx
git commit -m "$(cat <<'EOF'
feat(voucher): HeroStatusBlock REUSABLE states

Adds 'reusable-available' + 'reusable-cooldown' to WindowState.
Reusable-available: eyebrow "Available now"; primary + supporting suppressed.
Reusable-cooldown: eyebrow "Available again"; primary = countdown via
formatDuration; supporting = "Available again from <T> today/tomorrow/<Day>"
via formatSupportingClock. Progress bar suppressed for both REUSABLE states
(no meaningful denominator).

A11y live-region uses formatAvailableAgainA11y for <1h band; eyebrow-
as-label "Available again" verbatim for ≥1h band (D38, no "Voucher " prefix).

Spec §7.3, D21, D38.
EOF
)"
```

---

## Task 9: `<ReusableRulesCard>` + `<ReusableGuidanceCard>` + `formatCooldownDurationHuman`

**Files:**
- Create: `apps/customer-app/src/features/voucher/utils/cooldownFormat.ts`
- Create: `apps/customer-app/src/features/voucher/components/ReusableRulesCard.tsx`
- Create: `apps/customer-app/src/features/voucher/components/ReusableGuidanceCard.tsx`
- Create: `apps/customer-app/tests/features/voucher/utils/cooldownFormat.test.ts`
- Create: `apps/customer-app/tests/features/voucher/components/reusable-rules-card.test.tsx`
- Create: `apps/customer-app/tests/features/voucher/components/reusable-guidance-card.test.tsx`

### Step 9.1 — `formatCooldownDurationHuman` (helper)

- [ ] **Step 9.1 — Write failing tests for the helper**

Create `apps/customer-app/tests/features/voucher/utils/cooldownFormat.test.ts`:

```ts
import { formatCooldownDurationHuman } from '@/features/voucher/utils/cooldownFormat'

describe('formatCooldownDurationHuman', () => {
  it('30 minutes', () => {
    expect(formatCooldownDurationHuman(1800)).toBe('30 minutes')
  })

  it('1 hour (singular)', () => {
    expect(formatCooldownDurationHuman(3600)).toBe('1 hour')
  })

  it('4 hours (plural)', () => {
    expect(formatCooldownDurationHuman(14400)).toBe('4 hours')
  })

  it('1 day (singular)', () => {
    expect(formatCooldownDurationHuman(24 * 3600)).toBe('1 day')
  })

  it('7 days (plural)', () => {
    expect(formatCooldownDurationHuman(7 * 24 * 3600)).toBe('7 days')
  })

  it('non-round minutes fallback', () => {
    // 90 minutes = 1.5 hours. Choose readable form. Spec doesn't fully pin
    // this — picking "1 hour 30 minutes" as the readable form for v1.
    expect(formatCooldownDurationHuman(90 * 60)).toBe('1 hour 30 minutes')
  })

  it('non-round hours fallback', () => {
    // 25 hours = 1 day 1 hour
    expect(formatCooldownDurationHuman(25 * 3600)).toBe('1 day 1 hour')
  })
})
```

- [ ] **Step 9.2 — Run to verify fail**

Run: `npx jest tests/features/voucher/utils/cooldownFormat.test.ts --forceExit`
Expected: FAIL.

- [ ] **Step 9.3 — Implement the helper**

Create `apps/customer-app/src/features/voucher/utils/cooldownFormat.ts`:

```ts
/**
 * Human-readable cooldown duration formatter for the <ReusableRulesCard>
 * body — "Available again every <duration>".
 *
 * Distinct from countdownFormat.formatDuration which produces compact
 * countdown shapes ("4h 0m", "30m 15s"). This helper produces natural-
 * language forms ("4 hours", "30 minutes", "1 day", "7 days") suitable
 * for sentence-form copy.
 *
 * Spec §9 copy ledger (ReusableRulesCard body).
 */
export function formatCooldownDurationHuman(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`

  const hours = Math.floor(minutes / 60)
  const remainderMinutes = minutes % 60
  if (hours < 24) {
    const hoursLabel = hours === 1 ? '1 hour' : `${hours} hours`
    if (remainderMinutes === 0) return hoursLabel
    const minutesLabel = remainderMinutes === 1 ? '1 minute' : `${remainderMinutes} minutes`
    return `${hoursLabel} ${minutesLabel}`
  }

  const days = Math.floor(hours / 24)
  const remainderHours = hours % 24
  const daysLabel = days === 1 ? '1 day' : `${days} days`
  if (remainderHours === 0) return daysLabel
  const hoursLabel = remainderHours === 1 ? '1 hour' : `${remainderHours} hours`
  return `${daysLabel} ${hoursLabel}`
}
```

- [ ] **Step 9.4 — Run helper tests**

Run: `npx jest tests/features/voucher/utils/cooldownFormat.test.ts --forceExit`
Expected: 7 tests pass.

### Step 9.5 — `<ReusableRulesCard>`

- [ ] **Step 9.5 — Write failing component tests**

Create `apps/customer-app/tests/features/voucher/components/reusable-rules-card.test.tsx`:

```tsx
import { render } from '@testing-library/react-native'
import { ReusableRulesCard } from '@/features/voucher/components/ReusableRulesCard'

describe('<ReusableRulesCard>', () => {
  it('renders title "Reusable voucher"', () => {
    const { getByText } = render(<ReusableRulesCard effectiveCooldownSeconds={14400} />)
    expect(getByText('Reusable voucher')).toBeTruthy()
  })

  it('renders body with "every 4 hours" for 14400s cooldown', () => {
    const { getByText } = render(<ReusableRulesCard effectiveCooldownSeconds={14400} />)
    expect(getByText(/Available again every 4 hours\. Your subscription must stay active to redeem\./)).toBeTruthy()
  })

  it('renders body with "every 30 minutes" for 1800s', () => {
    const { getByText } = render(<ReusableRulesCard effectiveCooldownSeconds={1800} />)
    expect(getByText(/every 30 minutes/)).toBeTruthy()
  })

  it('renders body with "every 1 day" for 86400s', () => {
    const { getByText } = render(<ReusableRulesCard effectiveCooldownSeconds={86400} />)
    expect(getByText(/every 1 day/)).toBeTruthy()
  })

  it('has testID voucher-detail-reusable-rules', () => {
    const { getByTestId } = render(<ReusableRulesCard effectiveCooldownSeconds={14400} />)
    expect(getByTestId('voucher-detail-reusable-rules')).toBeTruthy()
  })
})
```

- [ ] **Step 9.6 — Run to verify fail**

Run: `npx jest tests/features/voucher/components/reusable-rules-card.test.tsx --forceExit`
Expected: FAIL — component doesn't exist.

- [ ] **Step 9.7 — Implement `<ReusableRulesCard>`**

Create `apps/customer-app/src/features/voucher/components/ReusableRulesCard.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { formatCooldownDurationHuman } from '../utils/cooldownFormat'

/**
 * ReusableRulesCard — explains the REUSABLE voucher cadence + that
 * subscription is required to redeem. Replaces <CycleRulesCard> on
 * Voucher Detail for REUSABLE voucher types.
 *
 * Surface treatment mirrors the existing CycleRulesCard / TL cards
 * (warm tinted background, no nested card stacking).
 *
 * Spec §7.3, D23, D27, D37.
 */

type Props = {
  effectiveCooldownSeconds: number
}

const NAVY      = '#010C35'
const TEXT_2ND  = '#4B5563'

export function ReusableRulesCard({ effectiveCooldownSeconds }: Props) {
  const duration = formatCooldownDurationHuman(effectiveCooldownSeconds)
  const body = `Available again every ${duration}. Your subscription must stay active to redeem.`

  return (
    <View testID="voucher-detail-reusable-rules" style={styles.card}>
      <Text variant="label.md" style={styles.title}>Reusable voucher</Text>
      <Text variant="body.md" style={styles.body}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FDFBF8',
    borderRadius: 16,
    padding: 18,
    marginTop: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: NAVY,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: TEXT_2ND,
  },
})
```

> **Implementer note:** confirm surface treatment matches `<CycleRulesCard>` exactly at implementation time — same padding scale, border radius, font sizes. If `<CycleRulesCard>` uses a slightly different colour or shadow, align here for visual consistency. Don't introduce a new card style if an existing one fits.

- [ ] **Step 9.8 — Run tests to verify they pass**

Run: `npx jest tests/features/voucher/components/reusable-rules-card.test.tsx --forceExit`
Expected: 5 tests pass.

### Step 9.9 — `<ReusableGuidanceCard>`

- [ ] **Step 9.9 — Write failing component tests**

Create `apps/customer-app/tests/features/voucher/components/reusable-guidance-card.test.tsx`:

```tsx
import { render } from '@testing-library/react-native'
import { ReusableGuidanceCard } from '@/features/voucher/components/ReusableGuidanceCard'

describe('<ReusableGuidanceCard>', () => {
  it('renders locked title "Your code stays available"', () => {
    const { getByText } = render(<ReusableGuidanceCard />)
    expect(getByText('Your code stays available')).toBeTruthy()
  })

  it('renders locked body', () => {
    const { getByText } = render(<ReusableGuidanceCard />)
    expect(
      getByText(/After you redeem, your code stays available to show staff for up to 2 hours\. This voucher becomes available again after the time shown above\./),
    ).toBeTruthy()
  })

  it('has testID voucher-detail-reusable-guidance', () => {
    const { getByTestId } = render(<ReusableGuidanceCard />)
    expect(getByTestId('voucher-detail-reusable-guidance')).toBeTruthy()
  })

  it('a11y label covers title + body', () => {
    const { getByTestId } = render(<ReusableGuidanceCard />)
    const card = getByTestId('voucher-detail-reusable-guidance')
    const a11y = card.props.accessibilityLabel || ''
    expect(a11y).toContain('Your code stays available')
    expect(a11y).toContain('show staff for up to 2 hours')
  })
})
```

- [ ] **Step 9.10 — Run to verify fail**

Run: `npx jest tests/features/voucher/components/reusable-guidance-card.test.tsx --forceExit`
Expected: FAIL.

- [ ] **Step 9.11 — Implement `<ReusableGuidanceCard>`**

Create `apps/customer-app/src/features/voucher/components/ReusableGuidanceCard.tsx`. Mirror the PR #70 TL guidance card surface treatment exactly (pale amber, 1px hairline, brand-rose Info glyph) for consistency:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Info } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

/**
 * ReusableGuidanceCard — explains the two-clock independence (2h
 * presentation window vs cooldown) for REUSABLE vouchers. Sits
 * between USAGE RULE and ABOUT THIS OFFER on Voucher Detail, parallel
 * placement to the PR #70 TL guidance card.
 *
 * Surface treatment matches the TL guidance card from PR #70 exactly:
 * pale amber inner card, 1px hairline border, brand-rose Info glyph.
 *
 * Spec §7.3, §9 copy ledger, D24.
 */

const NAVY     = '#010C35'
const TEXT_2ND = '#4B5563'
const ROSE     = '#E20C04'

export function ReusableGuidanceCard() {
  const a11yLabel =
    'Your code stays available. After you redeem, your code stays available to show staff for up to 2 hours. This voucher becomes available again after the time shown above.'

  return (
    <View
      testID="voucher-detail-reusable-guidance"
      accessibilityLabel={a11yLabel}
      style={styles.card}
    >
      <View style={styles.heading}>
        <Info size={16} color={ROSE} strokeWidth={2} />
        <Text variant="label.md" style={styles.title}>Your code stays available</Text>
      </View>
      <Text variant="body.sm" style={styles.body}>
        After you redeem, your code stays available to show staff for up to 2 hours. This voucher becomes available again after the time shown above.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: '#FEF7E6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.18)',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: NAVY,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: TEXT_2ND,
  },
})
```

- [ ] **Step 9.12 — Run tests to verify they pass**

Run: `npx jest tests/features/voucher/components/ --forceExit`
Expected: all green.

- [ ] **Step 9.13 — `tsc --noEmit`**

Expected: clean.

- [ ] **Step 9.14 — Commit**

```bash
git add apps/customer-app/src/features/voucher/utils/cooldownFormat.ts apps/customer-app/src/features/voucher/components/ReusableRulesCard.tsx apps/customer-app/src/features/voucher/components/ReusableGuidanceCard.tsx apps/customer-app/tests/features/voucher/utils/cooldownFormat.test.ts apps/customer-app/tests/features/voucher/components/reusable-rules-card.test.tsx apps/customer-app/tests/features/voucher/components/reusable-guidance-card.test.tsx
git commit -m "$(cat <<'EOF'
feat(voucher): ReusableRulesCard + ReusableGuidanceCard + formatCooldownDurationHuman

New helper for sentence-form duration ("4 hours", "30 minutes", "1 day").
Distinct from countdownFormat.formatDuration (which is countdown-shaped).

<ReusableRulesCard>: title "Reusable voucher"; body
"Available again every <duration>. Your subscription must stay active
to redeem." Replaces <CycleRulesCard> for REUSABLE on Voucher Detail.

<ReusableGuidanceCard>: title "Your code stays available"; body
locks the two-clock independence (2h presentation vs cooldown). Pale
amber surface + 1px hairline + brand-rose Info glyph, mirroring the
PR #70 TL guidance card exactly.

Spec §7.3, §9 copy ledger, D22-D24, D27, D37.
EOF
)"
```

---

## Task 10: `<VoucherDetailScreen>` state matrix + REUSABLE routing + D44 expiry suppression

**Files:**
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` — REUSABLE state routing
- Modify: `apps/customer-app/src/features/voucher/components/CouponBody.tsx` — insert `<ReusableGuidanceCard>` for REUSABLE
- Modify: `apps/customer-app/src/features/voucher/constants/productCopy.ts` — HowItWorks REUSABLE step + explainer body rewrite
- Modify: `apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts` (or equivalent — verify name) — derive REUSABLE state OR introduce new hook `useReusable.ts`
- Create: `apps/customer-app/tests/features/voucher/reusable-state-matrix.test.tsx` — 5-state matrix coverage

### Step 10.1 — Decide on the state-derivation hook

The existing `useTimeLimited` hook derives `windowState`, `msToClose`, `msToOpen`, etc. for TIME_LIMITED vouchers. REUSABLE needs similar derivation but the inputs differ: `availableAgainAt` (ISO) drives both `windowState` and `msToOpen`.

Cleanest path: **create a sibling hook `useReusable`** that:
- Reads `availableAgainAt` from the payload.
- Computes `windowState`: `'reusable-cooldown'` if `availableAgainAt && availableAgainAt > now`, else `'reusable-available'`.
- Computes `msToOpen` for the countdown.
- Ticks per second when in cooldown (similar to `useTimeLimited`'s tick).

VoucherDetailScreen routes based on `voucher.type === 'REUSABLE'` to use `useReusable` vs `useTimeLimited` vs the existing cycle-voucher derivation.

### Step 10.2 — Write failing tests

- [ ] **Step 10.2 — Create `reusable-state-matrix.test.tsx`**

Create `apps/customer-app/tests/features/voucher/reusable-state-matrix.test.tsx`. Cover all 5 states from spec §7.1 + the D44 expiry-suppression case. Each test mounts `<VoucherDetailScreen>` with a mocked payload fixture matching the state's trigger and asserts the visible UI.

```tsx
import { render, waitFor } from '@testing-library/react-native'
import { VoucherDetailScreen } from '@/features/voucher/screens/VoucherDetailScreen'

const NOW = new Date('2026-05-12T12:00:00Z')

// Helper to build a REUSABLE voucher fixture for a given (availableAgainAt, lastRedemption) combo.
function reusableFixture(opts: {
  availableAgainAt?: string | null
  lastRedemption?: { code: string; redeemedAt: string } | null
  expiryDate?: string | null
}) {
  return {
    voucher: {
      id: 'rv-1', type: 'REUSABLE', title: 'Free coffee', description: '…',
      effectiveCooldownSeconds: 14400,
      estimatedSaving: '3.00',
      expiryDate: opts.expiryDate ?? null,
      // … other required fields
    },
    isRedeemedThisCycle: false,
    availableAgainAt: opts.availableAgainAt ?? null,
    lastRedemption: opts.lastRedemption ?? null,
  }
}

describe('VoucherDetailScreen — REUSABLE state matrix (spec §7.1)', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(NOW) })
  afterEach(() => { jest.useRealTimers() })

  it('state 1 — Available now: active Redeem CTA, no RedemptionDetailsCard, eyebrow "Available now"', async () => {
    const fixture = reusableFixture({ availableAgainAt: null, lastRedemption: null })
    const { queryByTestId, getByTestId } = render(/* … screen with fixture … */)

    await waitFor(() => {
      expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available now')
      expect(queryByTestId('redemption-details-card')).toBeNull()
      expect(getByTestId('redeem-cta-button').props.accessibilityState?.disabled).toBeFalsy()
    })
  })

  it('state 2 — Available again + recent redemption: persisted card + disabled CTA + countdown', async () => {
    const lastRedeemedAt = new Date(NOW.getTime() - 30 * 60_000)   // 30 min ago
    const availableAgainAt = new Date(NOW.getTime() + 3 * 3_600_000 + 30 * 60_000)  // 3h 30m
    const fixture = reusableFixture({
      availableAgainAt: availableAgainAt.toISOString(),
      lastRedemption: { code: 'ABCD1234', redeemedAt: lastRedeemedAt.toISOString() },
    })
    const { getByTestId } = render(/* … */)

    await waitFor(() => {
      expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available again')
      expect(getByTestId('hero-status-primary')).toHaveTextContent('3h 30m')
      expect(getByTestId('redemption-details-card')).toBeTruthy()
      expect(getByTestId('redeem-cta-button').props.accessibilityState?.disabled).toBe(true)
      // CTA copy includes the countdown
    })
  })

  it('state 3 — presentation expired, still in cooldown: countdown shown, NO RedemptionDetailsCard (D26)', async () => {
    // 3h ago redemption, 4h cooldown. Presentation expired (>2h). lastRedemption null.
    const fixture = reusableFixture({
      availableAgainAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
      lastRedemption: null,
    })
    const { queryByTestId, getByTestId } = render(/* … */)

    await waitFor(() => {
      expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available again')
      expect(queryByTestId('redemption-details-card')).toBeNull()
    })
  })

  it('state 4 — cooldown elapsed, presentation still alive: active CTA + persisted card simultaneously', async () => {
    // 30min cooldown, redemption 35min ago. Cooldown elapsed; presentation alive (35min < 2h).
    const lastRedeemedAt = new Date(NOW.getTime() - 35 * 60_000)
    const fixture = reusableFixture({
      availableAgainAt: null,
      lastRedemption: { code: 'PREV1234', redeemedAt: lastRedeemedAt.toISOString() },
    })
    const { getByTestId } = render(/* … */)

    await waitFor(() => {
      expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available now')
      expect(getByTestId('redemption-details-card')).toBeTruthy()  // OLD code still visible
      expect(getByTestId('redeem-cta-button').props.accessibilityState?.disabled).toBeFalsy()  // NEW redemption available
    })
  })

  it('state 5 — expired voucher: dimmed hero, disabled CTA, "Offer ended"', async () => {
    const fixture = reusableFixture({
      expiryDate: new Date(NOW.getTime() - 60 * 60_000).toISOString(),  // expired 1h ago
    })
    // assert standard expired-state UI
  })
})

describe('VoucherDetailScreen — REUSABLE D44 expiry-before-cooldown', () => {
  it('suppresses "Available again in 3h 30m" when availableAgainAt > expiryDate', async () => {
    const expiryDate = new Date(NOW.getTime() + 1 * 60 * 60_000)         // 1h from now
    const availableAgainAt = new Date(NOW.getTime() + 4 * 60 * 60_000)   // 4h from now — past expiry

    const fixture = reusableFixture({
      availableAgainAt: availableAgainAt.toISOString(),
      expiryDate: expiryDate.toISOString(),
    })
    const { queryByText, getByText } = render(/* … */)

    await waitFor(() => {
      // The standard countdown is suppressed.
      expect(queryByText(/Available again in/)).toBeNull()
      // The replacement copy is shown.
      expect(getByText('Offer ends before it becomes available again')).toBeTruthy()
    })
  })

  it('shows normal countdown when availableAgainAt <= expiryDate', async () => {
    // Sanity counter-test to make sure suppression only fires when needed.
    const expiryDate = new Date(NOW.getTime() + 8 * 60 * 60_000)
    const availableAgainAt = new Date(NOW.getTime() + 4 * 60 * 60_000)
    const fixture = reusableFixture({
      availableAgainAt: availableAgainAt.toISOString(),
      expiryDate: expiryDate.toISOString(),
    })
    const { getByText, queryByText } = render(/* … */)

    await waitFor(() => {
      expect(getByText(/Available again in/)).toBeTruthy()
      expect(queryByText(/Offer ends before/)).toBeNull()
    })
  })

  it('REUSABLE has no hero RedeemedSeal at any state (D25)', async () => {
    // Mount in state 2 (recently redeemed) — verify no <RedeemedSeal> on hero.
    const lastRedeemedAt = new Date(NOW.getTime() - 30 * 60_000)
    const fixture = reusableFixture({
      availableAgainAt: new Date(NOW.getTime() + 3 * 3_600_000).toISOString(),
      lastRedemption: { code: 'ABCD', redeemedAt: lastRedeemedAt.toISOString() },
    })
    const { queryByTestId } = render(/* … */)

    await waitFor(() => {
      expect(queryByTestId('voucher-detail-hero-seal')).toBeNull()
    })
  })
})
```

- [ ] **Step 10.3 — Run tests to verify they fail**

Run: `npx jest tests/features/voucher/reusable-state-matrix.test.tsx --forceExit`
Expected: FAIL.

### Step 10.4 — Implement REUSABLE state routing in VoucherDetailScreen

- [ ] **Step 10.4 — Add `useReusable` hook**

Create `apps/customer-app/src/features/voucher/hooks/useReusable.ts`:

```ts
import { useEffect, useState } from 'react'

/**
 * Derives REUSABLE voucher state from the payload.
 *
 * - `availableAgainAt` (ISO from server) gates the cooldown state.
 * - Ticks per second when in cooldown to keep `msToOpen` fresh for
 *   the HeroStatusBlock countdown primary.
 *
 * Returns the same shape as useTimeLimited so VoucherDetailScreen
 * can plug either hook into HeroStatusBlock.
 *
 * Spec §7.3.
 */

export type ReusableState = {
  windowState: 'reusable-available' | 'reusable-cooldown'
  msToOpen: number | null
  nextWindowStartsAt: Date | null
  /** Computed: availableAgainAt > expiryDate (D44 suppression flag). */
  cooldownExtendsPastExpiry: boolean
}

export function useReusable(
  availableAgainAt: string | null,
  expiryDate: string | null,
): ReusableState {
  const [now, setNow] = useState(() => new Date())

  const availableAgainDate = availableAgainAt ? new Date(availableAgainAt) : null
  const inCooldown = !!(availableAgainDate && availableAgainDate.getTime() > now.getTime())

  useEffect(() => {
    if (!inCooldown) return
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [inCooldown])

  const expiryDateObj = expiryDate ? new Date(expiryDate) : null
  const cooldownExtendsPastExpiry = !!(
    availableAgainDate && expiryDateObj && availableAgainDate > expiryDateObj
  )

  if (inCooldown && availableAgainDate) {
    return {
      windowState: 'reusable-cooldown',
      msToOpen: availableAgainDate.getTime() - now.getTime(),
      nextWindowStartsAt: availableAgainDate,
      cooldownExtendsPastExpiry,
    }
  }

  return {
    windowState: 'reusable-available',
    msToOpen: null,
    nextWindowStartsAt: null,
    cooldownExtendsPastExpiry: false,
  }
}
```

- [ ] **Step 10.5 — Modify `VoucherDetailScreen` to route REUSABLE**

In `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`:

1. Import `useReusable`, `ReusableRulesCard`, `ReusableGuidanceCard`.

2. Branch on `voucher.type === 'REUSABLE'` to compute the screen state:
```ts
const reusable = voucher.type === 'REUSABLE'
  ? useReusable(payload.availableAgainAt, voucher.expiryDate)
  : null
```

3. When REUSABLE, swap:
   - `<CycleRulesCard>` → `<ReusableRulesCard effectiveCooldownSeconds={voucher.effectiveCooldownSeconds!} />`
   - Add `<ReusableGuidanceCard />` in the body (passed through `<CouponBody>` — see Task 10.6).
   - Pass `reusable.windowState` and `reusable.msToOpen` and `reusable.nextWindowStartsAt` to `<HeroStatusBlock>`.

4. Disabled CTA copy in cooldown:
```tsx
const ctaLabel = reusable?.windowState === 'reusable-cooldown'
  ? `Available again in ${formatDuration(reusable.msToOpen!)}`
  : /* existing label routing */
```

5. **D44 expiry suppression**:
```tsx
{reusable?.cooldownExtendsPastExpiry && (
  <Text testID="expiry-before-available-again-note" style={styles.supportingNote}>
    Offer ends before it becomes available again
  </Text>
)}
// AND: in HeroStatusBlock supporting line / disabled CTA copy, branch on
// reusable.cooldownExtendsPastExpiry to suppress the "Available again in …" string.
```

6. **Hero seal suppression for REUSABLE** (D25): the hero seal is currently rendered conditionally on `stateKey === 'redeemed-this-cycle'`. REUSABLE never reaches that state since `isRedeemedThisCycle` is always false (D13) — so the existing condition naturally excludes REUSABLE. Add a defensive comment + test pin to lock the behaviour.

7. **HowItWorks REUSABLE step** — see Step 10.7.

- [ ] **Step 10.6 — Modify `<CouponBody>` to render `<ReusableGuidanceCard>`**

In `apps/customer-app/src/features/voucher/components/CouponBody.tsx`:

```tsx
import { ReusableGuidanceCard } from './ReusableGuidanceCard'

// Inside CouponBodyCard, after the existing TIME_LIMITED section render block:
{voucher.type === 'REUSABLE' && (
  <ReusableGuidanceCard />
)}
```

> **Implementer:** verify the exact insertion point matches §7.3 spec — between USAGE RULE and ABOUT THIS OFFER. Mirrors how the PR #70 TL guidance card sits in the same slot for TIME_LIMITED.

### Step 10.7 — HowItWorks REUSABLE step + explainer body rewrite

- [ ] **Step 10.7 — Modify `productCopy.ts`**

In `apps/customer-app/src/features/voucher/constants/productCopy.ts`:

1. Rewrite `voucherTypeExplainer('REUSABLE')` body — atomic with backend (D36 + spec §9):

```ts
case 'REUSABLE':
  // Locked 2026-05-12 (REUSABLE v1 ships).
  return 'An ongoing offer that becomes available again after each redemption. The exact timing depends on the offer, usually a few hours.'
```

2. Add the REUSABLE HowItWorks step (parallel to TL's `CHECK_THE_WINDOW_STEP`):

```ts
export const USE_IT_AGAIN_STEP = {
  label: 'Use it again',
  desc:  'After you redeem this voucher, it becomes available again after a short time. The exact timing depends on the offer.',
} as const
```

3. Wire it into `howItWorksSteps`:

```ts
export function howItWorksSteps(opts: {
  isSubscribed: boolean
  voucherType: VoucherType
}): ReadonlyArray<{ label: string; desc: string }> {
  const baseFirst = opts.isSubscribed ? REVIEW_THE_VOUCHER_STEP : SUBSCRIBE_TO_UNLOCK_STEP
  if (opts.voucherType === 'TIME_LIMITED') {
    return [baseFirst, CHECK_THE_WINDOW_STEP, ...STEPS_2_TO_5]
  }
  if (opts.voucherType === 'REUSABLE') {
    return [baseFirst, USE_IT_AGAIN_STEP, ...STEPS_2_TO_5]
  }
  return [baseFirst, ...STEPS_2_TO_5]
}
```

- [ ] **Step 10.8 — Update existing HowItWorks tests to cover REUSABLE variant**

Add to `tests/features/voucher/how-it-works.test.tsx`:

```ts
it('subscribed + REUSABLE: 6 steps with "Use it again" at index 1', () => {
  const steps = howItWorksSteps({ isSubscribed: true, voucherType: 'REUSABLE' })
  expect(steps).toHaveLength(6)
  expect(steps[1]?.label).toBe('Use it again')
})

it('REUSABLE subscribed: "Use it again" step body contains the locked copy', () => {
  // mount HowItWorks for REUSABLE; assert body text
  expect(getByText(/After you redeem this voucher, it becomes available again after a short time/)).toBeTruthy()
})
```

- [ ] **Step 10.9 — Run full Voucher Detail test suite**

Run from `apps/customer-app`:
```bash
npx jest tests/features/voucher/ --forceExit
```
Expected: all green including the new state matrix tests, hero status block REUSABLE pins, HowItWorks REUSABLE step pins.

- [ ] **Step 10.10 — `tsc --noEmit`**

Expected: clean.

- [ ] **Step 10.11 — Commit**

```bash
git add apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx apps/customer-app/src/features/voucher/hooks/useReusable.ts apps/customer-app/src/features/voucher/components/CouponBody.tsx apps/customer-app/src/features/voucher/constants/productCopy.ts apps/customer-app/tests/features/voucher/reusable-state-matrix.test.tsx apps/customer-app/tests/features/voucher/how-it-works.test.tsx
git commit -m "$(cat <<'EOF'
feat(voucher): VoucherDetailScreen REUSABLE state matrix + routing

- useReusable hook: derives windowState + msToOpen + cooldownExtendsPastExpiry
  from availableAgainAt + expiryDate. Ticks per second in cooldown.
- VoucherDetailScreen routes REUSABLE to use useReusable; swaps CycleRulesCard
  for ReusableRulesCard; inserts ReusableGuidanceCard in coupon body.
- 5-state matrix coverage (state 1-5 + the genuine REUSABLE distinguisher
  state 4: cooldown elapsed + presentation alive = active CTA + persisted card).
- D44 expiry-before-cooldown frontend-computed: suppresses false countdown,
  shows "Offer ends before it becomes available again" supporting copy.
- HowItWorks REUSABLE step "Use it again" inserted at index 1.
- VoucherTypeExplainer REUSABLE body rewritten (atomic deploy with backend).
- Hero seal naturally excluded by isRedeemedThisCycle=false invariant (D25).

Spec §7.1, §7.3, §7.4, D20-D27, D36, D39, amendment 2026-05-12.
EOF
)"
```

---

## Task 11: Merchant card pill REUSABLE states

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/VoucherCardStatePill.tsx` — add REUSABLE pill branches
- Modify: `apps/customer-app/src/features/merchant/components/VoucherCard.tsx` — opacity 75% for cooldown state
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` (or wherever the sort logic lives) — sort bucket integration (D33)
- Modify: `apps/customer-app/tests/features/merchant/voucher-card.test.tsx` — REUSABLE pill pins + sort

### Step 11.1 — Failing tests

- [ ] **Step 11.1 — Add REUSABLE pill tests**

Add to `apps/customer-app/tests/features/merchant/voucher-card.test.tsx`:

```ts
describe('VoucherCard — REUSABLE state pill (M5)', () => {
  const renderPill = (overrides: Partial<MerchantVoucher>, now: Date) =>
    render(
      <VoucherCard
        voucher={mk({ type: 'REUSABLE', ...overrides })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
        now={now}
      />,
    )

  it('reusable-available: "AVAILABLE NOW" standalone + green pulse + opacity 100%', () => {
    const { getByTestId, getByText, queryByTestId } = renderPill(
      { reusableState: { availableAgainAt: null } },
      new Date('2026-05-12T12:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-reusable-available')).toBeTruthy()
    expect(getByText('AVAILABLE NOW')).toBeTruthy()
    expect(getByTestId('merchant-card-pill-pulse-dot')).toBeTruthy()
  })

  it('reusable-cooldown ≤60min: "AVAILABLE AGAIN · 23m left" + no pulse + opacity 75%', () => {
    const now = new Date('2026-05-12T12:00:00Z')
    const availableAgainAt = new Date(now.getTime() + 23 * 60_000)
    const { getByTestId, getByText, queryByTestId } = renderPill(
      { reusableState: { availableAgainAt: availableAgainAt.toISOString() } },
      now,
    )
    expect(getByTestId('merchant-card-pill-reusable-cooldown')).toBeTruthy()
    expect(getByText('AVAILABLE AGAIN · 23m left')).toBeTruthy()
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
  })

  it('reusable-cooldown >60min: "AVAILABLE AGAIN · From 4pm today"', () => {
    const now = new Date('2026-05-12T12:00:00Z')                 // 13:00 BST
    const availableAgainAt = new Date('2026-05-12T15:00:00Z')    // 16:00 BST = 4pm
    const { getByText } = renderPill(
      { reusableState: { availableAgainAt: availableAgainAt.toISOString() } },
      now,
    )
    expect(getByText('AVAILABLE AGAIN · From 4pm today')).toBeTruthy()
  })

  it('reusable-cooldown >60min, tomorrow: "AVAILABLE AGAIN · From 11am tomorrow"', () => { /* … */ })
  it('reusable-cooldown >60min, future-day: "AVAILABLE AGAIN · From 12pm WEDNESDAY"', () => { /* … */ })

  it('reusable-cooldown card opacity 0.75 (matches TL outside-window)', () => {
    const now = new Date('2026-05-12T12:00:00Z')
    const availableAgainAt = new Date(now.getTime() + 2 * 3_600_000)
    const { getByTestId } = renderPill(
      { reusableState: { availableAgainAt: availableAgainAt.toISOString() } },
      now,
    )
    const card = getByTestId('merchant-voucher-card')
    const flat = Array.isArray(card.props.style) ? card.props.style.flat(Infinity) : [card.props.style]
    const opacityEntry = flat.find((s: any) => s && s.opacity === 0.75)
    expect(opacityEntry).toBeTruthy()
  })

  it('reusable-available card opacity 1.0', () => { /* … */ })

  it('NO rubber-stamp overprint at any REUSABLE state (D35)', () => {
    // Verify no <RedeemedOverprint /> testID/component appears regardless of state.
  })
})

describe('VoucherCardStatePill — REUSABLE sort buckets', () => {
  // Asserts that the sort function (or whatever drives Vouchers tab ordering)
  // groups REUSABLE-available with TL-active, and REUSABLE-cooldown with
  // TL-unavailable-today. Intra-Bucket-2 sort by nearest availableAgainAt /
  // nextWindow.startsAt.
})
```

- [ ] **Step 11.2 — Run to verify fail**

Run: `npx jest tests/features/merchant/voucher-card.test.tsx --forceExit`
Expected: FAIL.

### Step 11.3 — Implement REUSABLE pill states

- [ ] **Step 11.3 — Add REUSABLE branches to `<VoucherCardStatePill>`**

In `VoucherCardStatePill.tsx`, add a new branch:

```ts
// REUSABLE state (M5).
if (voucher.type === 'REUSABLE') {
  const availableAgainAt = voucher.reusableState?.availableAgainAt
    ? new Date(voucher.reusableState.availableAgainAt)
    : null

  if (!availableAgainAt || availableAgainAt <= now) {
    // State 1 — Available now.
    return (
      <Pill
        testID="merchant-card-pill-reusable-available"
        copy="AVAILABLE NOW"
        showPulseDot
      />
    )
  }

  const msUntilAvailable = availableAgainAt.getTime() - now.getTime()
  let copy: string

  if (msUntilAvailable <= 60 * 60_000) {
    // ≤60 min: "AVAILABLE AGAIN · 23m left"
    copy = `AVAILABLE AGAIN · ${formatDurationCompact(msUntilAvailable)} left`
  } else {
    // >60 min: "AVAILABLE AGAIN · From 4pm today" / "tomorrow" / "<WEEKDAY>"
    const day = dayContext(availableAgainAt, now)
    copy = `AVAILABLE AGAIN · From ${formatClockHour12(availableAgainAt)} ${day}`
  }

  return (
    <Pill
      testID="merchant-card-pill-reusable-cooldown"
      copy={copy}
    />
  )
}
```

`Pill` is the existing internal component (or inline rendering — verify the existing structure). Pulse-dot only on available state; no pulse on cooldown (D31). No urgency colours for REUSABLE ever.

### Step 11.4 — Card opacity 75% in cooldown

- [ ] **Step 11.4 — Adjust card opacity**

In `VoucherCard.tsx`, find the opacity logic that handles TL unavailable states. Add an OR-condition for REUSABLE cooldown:

```ts
const isReusableCooldown =
  voucher.type === 'REUSABLE' &&
  voucher.reusableState?.availableAgainAt &&
  new Date(voucher.reusableState.availableAgainAt) > now

const cardOpacity = (isTLOutsideWindow || isReusableCooldown) ? 0.75 : 1.0
```

### Step 11.5 — Sort bucket integration (D33)

- [ ] **Step 11.5 — Extend sort logic**

Locate the existing voucher-tab sort function (likely in `MerchantProfileScreen.tsx` or a dedicated sort util). Extend the bucket assignment:

```ts
function sortBucket(voucher: MerchantVoucher, now: Date): 1 | 2 | 3 | 4 {
  if (isExpired(voucher, now)) return 4
  if (voucher.type === 'TIME_LIMITED') { /* existing TL buckets */ }
  if (voucher.type === 'REUSABLE') {
    if (!voucher.reusableState?.availableAgainAt) return 1  // available
    return new Date(voucher.reusableState.availableAgainAt) > now ? 2 : 1
  }
  // cycle vouchers: existing logic
}

// Within Bucket 2, sort by nearest available time:
function bucket2SortKey(voucher: MerchantVoucher): number {
  if (voucher.type === 'TIME_LIMITED') return new Date(voucher.nextWindow!.startsAt).getTime()
  if (voucher.type === 'REUSABLE')     return new Date(voucher.reusableState!.availableAgainAt!).getTime()
  return Number.MAX_SAFE_INTEGER  // cycle redeemed — push to end of bucket
}
```

- [ ] **Step 11.6 — Run tests**

Run: `npx jest tests/features/merchant/voucher-card.test.tsx --forceExit`
Expected: all REUSABLE pill + sort pins pass + existing tests still green.

- [ ] **Step 11.7 — `tsc --noEmit` + sweep**

Run: `npx tsc --noEmit` and `npx jest tests/features/merchant/ --forceExit`
Both expected clean.

- [ ] **Step 11.8 — Commit**

```bash
git add apps/customer-app/src/features/merchant/components/VoucherCardStatePill.tsx apps/customer-app/src/features/merchant/components/VoucherCard.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/voucher-card.test.tsx
git commit -m "$(cat <<'EOF'
feat(merchant): VoucherCardStatePill REUSABLE pill states + sort buckets

REUSABLE pill states:
  Available     → "AVAILABLE NOW" + green pulse + opacity 100%
  Cooldown ≤60m → "AVAILABLE AGAIN · 23m left" + no pulse + opacity 75%
  Cooldown >60m → "AVAILABLE AGAIN · From 4pm today" / tomorrow / <WEEKDAY>

No urgency colour bands for REUSABLE — nothing bad happens at cooldown
expiry (D31). No rubber-stamp overprint at any REUSABLE state (D35).

Sort buckets:
  Bucket 1: TL active/urgent + REUSABLE-available + cycle-not-redeemed
  Bucket 2: TL unavailable-today + REUSABLE-cooldown
  Intra-Bucket-2 sort by nearest available time (TL nextWindow.startsAt,
  REUSABLE reusableState.availableAgainAt).

Spec §8, D28-D35.
EOF
)"
```

---

## Task 12: PinEntrySheet `REUSABLE_COOLDOWN_ACTIVE` error rendering + Zod cooldown validation at merchant ingress

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx` — inline error rendering
- Modify: `src/api/merchant/voucher/routes.ts` — Zod validation for `cooldownSeconds`
- Modify: `tests/api/merchant/voucher-validation.test.ts` — Zod ingress tests
- Modify: existing PinEntrySheet test file — inline error display

### Step 12.1 — Zod ingress validation

- [ ] **Step 12.1 — Failing test for cooldownSeconds Zod validation**

Add to `tests/api/merchant/voucher-validation.test.ts`:

```ts
describe('Voucher create/update — cooldownSeconds Zod validation', () => {
  it('rejects cooldownSeconds < 1800 on REUSABLE', async () => {
    const res = await app.inject({
      method: 'POST', url: '/merchant/voucher',
      headers: { authorization: 'Bearer …' },
      payload: { type: 'REUSABLE', cooldownSeconds: 1799, /* … */ },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toContain('cooldown')
  })

  it('rejects non-null cooldownSeconds on non-REUSABLE', async () => {
    const res = await app.inject({
      method: 'POST', url: '/merchant/voucher',
      payload: { type: 'BOGO', cooldownSeconds: 3600, /* … */ },
    })
    expect(res.statusCode).toBe(400)
  })

  it('accepts cooldownSeconds = 1800 on REUSABLE', async () => { /* … */ })
  it('accepts null cooldownSeconds on REUSABLE', async () => { /* … */ })
  it('accepts null cooldownSeconds on non-REUSABLE', async () => { /* … */ })
})
```

- [ ] **Step 12.2 — Run to verify fail**

- [ ] **Step 12.3 — Add Zod validation to `src/api/merchant/voucher/routes.ts`**

```ts
const voucherCreateSchema = z.object({
  type: z.enum([...]),
  // … existing fields …
  cooldownSeconds: z.number().int().min(1800).nullable().optional(),
}).refine(
  (data) => data.type === 'REUSABLE' || data.cooldownSeconds == null,
  { message: 'cooldownSeconds may only be set on REUSABLE vouchers', path: ['cooldownSeconds'] },
)
```

### Step 12.4 — PinEntrySheet error rendering

- [ ] **Step 12.4 — Failing test for inline error display**

Add to PinEntrySheet's existing test file:

```ts
it('renders REUSABLE_COOLDOWN_ACTIVE error inline with availableAgainAt copy', () => {
  // Mock useRedeem to throw with REUSABLE_COOLDOWN_ACTIVE.
  // Expected: "This voucher is available again at 5pm today" or
  // "This voucher is available again in 32 minutes" depending on time-to-available.
})
```

- [ ] **Step 12.5 — Implement error mapping**

In `PinEntrySheet.tsx`, extend the existing error-display logic (PR #45 added inline copy for several non-PIN errors):

```ts
if (error.code === 'REUSABLE_COOLDOWN_ACTIVE') {
  const availableAgainAt = new Date(error.context.availableAgainAt)
  const msToAvailable = availableAgainAt.getTime() - now.getTime()

  let message: string
  if (msToAvailable < 60 * 60_000) {
    // <1h: "in N minutes"
    const minutes = Math.ceil(msToAvailable / 60_000)
    message = `This voucher is available again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  } else {
    // ≥1h: "at HH:MM today/tomorrow/<Day>"
    const day = dayContext(availableAgainAt, now)
    const clock = formatClockHour12(availableAgainAt)
    message = `This voucher is available again at ${clock} ${day}`
  }

  return <InlineError message={message} />
}
```

- [ ] **Step 12.6 — Run tests, tsc, commit**

```bash
git add src/api/merchant/voucher/routes.ts tests/api/merchant/voucher-validation.test.ts apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx <relevant frontend tests>
git commit -m "$(cat <<'EOF'
feat(redemption): Zod cooldown validation + PinEntrySheet error rendering

Backend: merchant voucher create/update endpoint rejects cooldownSeconds
< 1800 OR non-null on non-REUSABLE vouchers. Three-layer validation:
Zod (this commit), runtime clamp (Task 2), DB CHECK (Task 1).

Frontend: PinEntrySheet renders REUSABLE_COOLDOWN_ACTIVE error inline:
  "This voucher is available again in N minutes" (<1h band)
  "This voucher is available again at 5pm today" (≥1h band — sentence
  form uses "at"; pill abbreviation uses "From" per spec §9 voice note).

Spec §4.4, §9, §5.3, D41.
EOF
)"
```

---

## Task 13: Cross-cutting tests + spec self-review + sweep

**Files:**
- Run full sweep
- Update spec / plan if any drift found
- Final commit if necessary

- [ ] **Step 13.1 — Full backend sweep**

Run: `npx vitest run`
Expected: all green. Confirm new tests added in Tasks 1-6 and 12 land in the count.

- [ ] **Step 13.2 — Full customer-app sweep**

Run from `apps/customer-app`: `npx jest --forceExit`
Expected: all green except the 1 documented pre-existing baseline failure (`tests/lib/api/profile.test.ts`).

- [ ] **Step 13.3 — TypeScript clean (both projects)**

Run from repo root: `npx tsc --noEmit`
Run from `apps/customer-app`: `npx tsc --noEmit`
Both expected clean.

- [ ] **Step 13.4 — Spec coverage cross-check**

Re-read the spec, section by section. For each locked decision D1–D55, confirm a task or commit message implements it. List any gaps.

If gaps found: add a follow-up commit fixing them before pushing.

- [ ] **Step 13.5 — Device QA gate (mid-PR)**

Per spec §11.3 gate 3 — physical device QA before pre-merge. Walk:
- Voucher Detail: states 1, 2, 3, 4, 5 render correctly. State 4 simultaneous-CTA-and-card behaves.
- D44 expiry-before-cooldown: suppression copy appears.
- HeroStatusBlock countdown ticks per second in cooldown.
- HowItWorks "Use it again" step renders for REUSABLE.
- ReusableRulesCard reads "every 4 hours" / similar.
- ReusableGuidanceCard reads the locked copy.
- Merchant Profile cards: REUSABLE-available pill, REUSABLE-cooldown pill ≤60min, REUSABLE-cooldown pill >60min, opacity 75% in cooldown.
- Sort buckets: REUSABLE-available alongside TL-active; REUSABLE-cooldown alongside TL-unavailable-today.
- PinEntrySheet: REUSABLE_COOLDOWN_ACTIVE inline error renders correctly.
- Atomic-deploy: VoucherTypeExplainer body reads the new "ongoing offer" copy, not the old "once per cycle" copy.

If issues surface: fix + add test + commit. Re-run full sweep.

- [ ] **Step 13.6 — Push branch + open PR**

```bash
git push -u origin feature/reusable-voucher-v1
gh pr create --title "feat(voucher): REUSABLE v1 — cooldown-based reusable voucher type (M5)" \
  --body "$(cat <<'EOF'
## Summary

REUSABLE v1: cooldown-based reusable voucher type. R3+R4 hybrid per audit §T1:
merchant-configurable Voucher.cooldownSeconds; platform default 4h; server-
enforced floor 30min; no R5 count caps in v1.

Tier 3 atomic PR per spec D50 — schema + service guard + payload + frontend +
copy + explainer all together. Eliminates the explainer-copy atomicity hazard
where the customer-facing "once per cycle" copy would conflict with backend
allowing reuse.

Spec: docs/superpowers/specs/2026-05-12-reusable-voucher-design.md (D1-D55)
Plan: docs/superpowers/plans/2026-05-12-reusable-voucher-v1.md

## What ships

Backend:
- Voucher.cooldownSeconds Int? + 2 DB CHECK constraints
- src/api/redemption/reusable.ts (constants + helpers)
- Guard 8a pre-PIN cooldown check + atomic-claim under pg_advisory_xact_lock
- REUSABLE skips UserVoucherCycleState entirely
- Customer payload: effectiveCooldownSeconds, availableAgainAt (REUSABLE
  semantics), isRedeemedThisCycle: false always, reusableState on merchant cards
- Typed error: REUSABLE_COOLDOWN_ACTIVE { availableAgainAt: ISO }

Frontend:
- HeroStatusBlock: reusable-available + reusable-cooldown states; progress
  bar suppressed (no denominator)
- ReusableRulesCard (replaces CycleRulesCard for REUSABLE)
- ReusableGuidanceCard (parallel to PR #70 TL guidance card)
- VoucherDetailScreen: 5-state matrix incl. state 4 (cooldown elapsed +
  presentation alive = active CTA + persisted card)
- D44 expiry-before-cooldown: frontend-computed suppression
- HowItWorks "Use it again" step at index 1 for REUSABLE
- VoucherTypeExplainer body rewritten (atomic with backend)
- Merchant card pill: REUSABLE-available / REUSABLE-cooldown ≤60m / >60m
- Card opacity 75% in cooldown; sort buckets folded in
- PinEntrySheet inline REUSABLE_COOLDOWN_ACTIVE error

Tests:
- Real-DB integration test for advisory-lock race (D51 Amendment 1)
- DB CHECK constraint validation tests (D51 Amendment 2)
- State matrix coverage for 5 states + D44 expiry suppression
- Cooldown formatter helper unit tests
- Component pin tests for both new cards
- Backend payload contract tests for two-clock independence

## Test plan

- [x] backend vitest sweep clean
- [x] customer-app jest sweep clean (modulo 1 pre-existing baseline failure on profile.test.ts)
- [x] tsc clean (root + customer-app)
- [x] real-DB advisory-lock race test passes against Neon
- [ ] on-device QA walks the state matrix
- [ ] pre-merge SHA-bound scope check via gh api compare

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> **Pause point:** After PR creation, owner reviews + walks device QA. Do not merge until owner SHA-binds the merge per the git-safety hook contract.

- [ ] **Step 13.7 — Pre-merge SHA-bound merge (owner-triggered)**

When owner approves:
```bash
HEAD_SHA=$(gh pr view <N> --json headRefOid --jq .headRefOid)
REDEEMO_PR_SCOPE_VERIFIED=$HEAD_SHA gh pr merge <N> --merge
```

- [ ] **Step 13.8 — Post-merge cleanup**

```bash
git checkout main
git pull --ff-only
git branch -d feature/reusable-voucher-v1
git push origin --delete feature/reusable-voucher-v1
```

Update memory:
- Mark §T1 audit-time risks as CLOSED in `project_deferred_followups_index.md`.
- Add `project_reusable_voucher_v1_complete.md` to memory with the as-shipped state.
- Reference §Z1-§Z8 as v2/follow-up trackers.

---

## Self-Review checklist

### Spec coverage (verify before pushing the branch)

| Spec section | Implemented in task |
|---|---|
| §2 Locked product model | Task 1 (column) + Task 2 (constants) |
| §3 Behavioural differences | Task 3 + Task 4 (guard + atomic claim) |
| §4 Schema + CHECK constraints | Task 1 |
| §4.5 Constants module | Task 2 |
| §5.1 Guard 8a pre-PIN | Task 3 |
| §5.2 Atomic claim + advisory lock | Task 4 |
| §5.3 Typed error | Task 3 (register) + Task 12 (frontend display) |
| §5.5 Real-DB race test (D51 A1) | Task 4 |
| §6.1 getCustomerVoucher payload | Task 5 |
| §6.3 Two-clock independence | Task 5 (payload tests pin it) |
| §6.4 getCustomerMerchant per-card | Task 6 |
| §7.1 5-state matrix | Task 10 |
| §7.3 Component deltas | Tasks 8, 9, 10 |
| §7.4 D44 expiry suppression | Task 10 |
| §8 Merchant card pill | Task 11 |
| §9 Copy ledger (full) | Tasks 9, 10, 12 |
| §10 Edge cases | Tasks 4 (race), 5 (payload), 10 (state matrix), 12 (error display) |
| §11.2 Plan task shape | This plan |
| §13 D1-D55 ratifications | Distributed across all 13 tasks |

### Placeholder scan

Grep this plan for `TBD`, `TODO`, `FIXME`, `Similar to Task`. None should appear.

### Type consistency

- `cooldownSeconds: Int?` — used consistently in Prisma + Zod (backend + frontend) + helpers + tests.
- `availableAgainAt: string | null` (ISO) — same shape across payload, error context, customer-app schema.
- `reusableState: { availableAgainAt: string | null } | null` — same shape across backend payload + customer-app schema + merchant card pill.
- `effectiveCooldownSeconds(voucher): number` — consistent return type; used in service + payload.
- `computeAvailableAgainAt(...): Date | null` — used in service + payload.
- `windowState` extends `'reusable-available' | 'reusable-cooldown'` — added consistently in HeroStatusBlock + useReusable + tests.

---

## Notes for future v2 (deferred §Z1-§Z8)

- **§Z1** — full "Final redemption" hero state for cooldown-past-expiry (this v1 ships the simple supporting-copy form per §7.4).
- **§Z2** — push notification on cooldown clear (needs Phase 6 FCM).
- **§Z3** — date-form rendering in `dayContext` for >7d cooldowns.
- **§Z4** — R5 expansion: maxRedemptionsPerWindow + windowSeconds per audit §T1.
- **§Z5** — older still-live REUSABLE codes via Profile → Redemption History.
- **§Z6** — merchant portal voucher-type-immutability enforcement (Phase 4).
- **§Z7** — merchant analytics distinguishing unique-customer vs redemption-event counts (Phase 4).
- **§Z8** — mark §T1 audit-time risks CLOSED in memory post-v1 merge.

---

**End of plan. Awaiting owner plan review before any implementation.**

Per spec D54, the next step is owner review of this plan document. Do NOT auto-invoke subagent-driven-development or executing-plans skills until the owner explicitly greenlights the implementation.
