# Voucher Detail M2 — PIN Entry + Redemption Mutation + Success Popup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the redemption flow on Voucher Detail end-to-end. Subscribed users in `can-redeem` / `time-limited-available` / `time-limited-urgent` states can pick a branch (multi-branch merchants), enter the branch PIN, submit, see a success popup, and return to a state-3 surface that shows the redemption record. Free users continue through the M1 conversion flow unchanged.

**Architecture:** Two-PR workstream. **Section A (backend prep, lands first)** does FOUR things together: (1) reorders the `createRedemption` guard checks to close a confirmed PIN oracle (eligibility before PIN compare), (2) adds race-safe atomic cycle-state claim inside the transaction so concurrent redemption requests cannot create duplicate `VoucherRedemption` rows, (3) extends `AppError` with an optional `details` payload (backward-compatible with the existing `ERROR_DEFINITIONS`-driven constructor), and (4) adds `remainingAttempts` to `INVALID_PIN` and `retryAfter` to `PIN_RATE_LIMIT_EXCEEDED` so the customer-app counter + lockout UI can be authoritative. **Section B (frontend M2, lands after Section A)** extends the customer-app `ApiClientError` with a `details` payload, ports the reference-branch `PinEntrySheet` / `SuccessPopup` / `useRedeem` onto current main with a three-tier branch-source priority (picker-local → URL → selectedBranch), adds a voucher-scoped `BranchPickerSheet`, ships a basic `RedemptionDetailsCard` for state-3 return-visit (non-QR; full visual treatment is M3), and pins the branch-attribution + abuse-prevention contracts with focused tests.

**Commit hygiene:** every commit on every PR keeps the test suite green. TDD happens internally inside each task — write test, implement, verify, commit ONCE — never with an intermediate "failing-tests-only" commit on the published branch. If a task naturally requires a failing-then-green sequence during development, the task's final commit is the one that lands; intermediate WIP is squashed locally before push.

**Tech Stack:** Backend: Fastify + Prisma 7 + Redis (ioredis) + AES-256-GCM via Node `crypto`. Frontend: React Native (Expo SDK 54) + TanStack Query 5 + react-native-reanimated 4 + Zod. Tests: backend `vitest`; customer-app `jest-expo` with `--forceExit`.

---

## Threat model — current backend guard order is exploitable

### Confirmed vulnerability: PIN oracle

Read of [`src/api/redemption/service.ts:33-172`](src/api/redemption/service.ts#L33-L172) confirms guard order:

1. Branch exists + `branch.redemptionPin` configured → `PIN_NOT_CONFIGURED`
2. Rate limit (`pinFailCount:{userId}:{branchId}` ≥ 5) → `PIN_RATE_LIMIT_EXCEEDED`
3. **PIN compare (timing-safe) → `INVALID_PIN`** ← **vulnerability: runs before eligibility checks**
4. Subscription ∈ {ACTIVE, TRIALLING} → `SUBSCRIPTION_REQUIRED`
5. Phone verified → `PHONE_NOT_VERIFIED`
6. Voucher ACTIVE + APPROVED + merchant ACTIVE → `VOUCHER_NOT_FOUND`
7. `branch.merchantId === voucher.merchantId` → `BRANCH_MERCHANT_MISMATCH`
8. Cycle state — not already redeemed this cycle → `ALREADY_REDEEMED`
9. Atomic write (no in-transaction re-check)

**Attack:** an authenticated but ineligible user (no subscription, unverified phone, already redeemed this cycle, or any combination) probes branch PINs by submitting `{ voucherId, branchId, pin: "0000" → "9999" }`:

- Wrong PIN → `INVALID_PIN` + fail-counter increment.
- **Correct PIN** → `SUBSCRIPTION_REQUIRED` (or `PHONE_NOT_VERIFIED` / `ALREADY_REDEEMED` / `VOUCHER_NOT_FOUND` / `BRANCH_MERCHANT_MISMATCH` depending on which eligibility gate fails next).

The ATTACKER LEARNS THE PIN even though they cannot redeem. The 5/15-min rate limit slows the attack to ~20 PINs/hour per (userId, branchId) tuple — for a 4-digit PIN (10,000 possibilities) that's ~10 days expected on a single account, but trivially parallelizable across many accounts. With a discovered PIN, an attacker (or someone they sell it to) can later subscribe and redeem freely, or share PINs publicly to abuse merchant economics.

### Atomic-write race: bundled INTO Section A (owner direction 2026-05-06)

Lines 126-159 enter `prisma.$transaction` and `voucherRedemption.create` + `userVoucherCycleState.upsert`. There is **no in-transaction re-read of cycle state**. Two concurrent requests for the same `(userId, voucherId)` that both pass the line-122 cycle check will BOTH write `VoucherRedemption` rows — there is no `@@unique` constraint on `VoucherRedemption (userId, voucherId, cycleStartDate)` to backstop the race. Once the customer-app can actually call `POST /api/v1/redemption`, a double-tap, retry, network race, or two concurrent requests will produce duplicate redemption rows: inflated merchant analytics, double branch-attribution, two redemption codes for one redemption window.

**Owner direction:** harden in Section A, NOT deferred to M3. Per the §10 amendment 2026-05-06: M2 must not ship redemption with this race open.

**Fix shape (no schema migration required):** turn the existing `@@unique([userId, voucherId])` on `UserVoucherCycleState` into a claim point. Inside the transaction:

1. Run a **conditional `updateMany`** that succeeds only when the row is either (a) from an older cycle (stale row → can be claimed) or (b) from the current cycle but `isRedeemedInCurrentCycle = false` (not yet claimed). On success, count is `1` and the row is now claimed.
2. If `count === 0`, no matching row exists → try `create`. On `P2002` (unique constraint hit by a concurrent winner), retry the conditional `updateMany` once more.
3. If after step 2 the row is STILL not claimable, throw `ALREADY_REDEEMED` — concurrent request won the race.
4. Only AFTER cycle-state is claimed, create the `VoucherRedemption` record.

Concurrency test pins the contract: `Promise.allSettled` two simultaneous `createRedemption` calls → exactly one fulfilled (with a `VoucherRedemption` row) and one rejected with `ALREADY_REDEEMED`; `prisma.voucherRedemption.findMany({ where: { userId, voucherId } })` returns exactly 1 row.

**No schema migration.** The existing `@@unique([userId, voucherId])` is the claim point; no new constraints, no new fields, no `cycleStartDate` migration needed on `VoucherRedemption`. The pre-PIN cycle check at the eligibility step (step 6 in the safe order) stays — that's the fast-fail closing the PIN oracle. The conditional update is defense-in-depth INSIDE the transaction for the post-PIN race.

### Proposed safe guard order (per owner direction)

Cheap-eligibility-first, PIN-compare-last. Every check that does not depend on PIN runs BEFORE PIN compare so the attacker cannot use the PIN result as an oracle.

```text
 1. (auth)                          — JWT middleware, already enforced upstream
 2. Voucher exists + ACTIVE +       → VOUCHER_NOT_FOUND
    APPROVED + merchant ACTIVE
 3. Voucher not expired             → VOUCHER_NOT_FOUND
    (voucher.expiryDate <= now)        (per owner direction — collapse expired
                                        into VOUCHER_NOT_FOUND so we don't leak
                                        whether a voucher exists vs is expired)
 4. Branch exists + branch.isActive → BRANCH_UNAVAILABLE
                                        (existing code, message: "This branch
                                        is no longer available.")
 5. branch.merchantId === voucher.   → BRANCH_MERCHANT_MISMATCH
    merchantId
 6. Subscription ACTIVE/TRIALLING   → SUBSCRIPTION_REQUIRED
 7. Phone verified                  → PHONE_NOT_VERIFIED
 8. Cycle state — not already       → ALREADY_REDEEMED
    redeemed this cycle
 9. Branch PIN configured           → PIN_NOT_CONFIGURED
10. Rate limit for (user, branch)   → PIN_RATE_LIMIT_EXCEEDED
11. PIN comparison (timing-safe)    → INVALID_PIN
12. Atomic write                     (race-safe conditional claim — Task A5)
```

**Why expired/inactive checks belong before PIN compare:** same threat model as the rest. An attacker probing PINs against an expired voucher or deactivated branch could observe the difference between `INVALID_PIN` (wrong PIN, eligibility implicitly passing for a moment) and the expected eligibility error. Both checks are also genuine abuse-prevention: a leaked PIN must NOT be redeemable against an expired voucher or a branch the merchant has deactivated.

**Error-code reuse, not invention.** Verified [`src/api/shared/errors.ts`](src/api/shared/errors.ts) before adding new codes:

- **Expired voucher** → reuse `VOUCHER_NOT_FOUND` (404). Same code already covers inactive/unapproved vouchers. An expired voucher is an unredeemable voucher; collapsing into the same code prevents leaking expiry-state to attackers and matches the existing pattern. No new error code introduced.
- **Inactive branch** → reuse `BRANCH_UNAVAILABLE` (404, message "This branch is no longer available."). The code already exists; just wire it into the redemption guard. No new error code introduced.

**Why rate-limit at step 8 (not earlier):** the rate-limit specifically protects PIN compare, which is the only step an attacker would brute-force. Putting rate-limit AFTER eligibility checks means ineligible users do NOT increment their fail counter (small fairness improvement) and prevents an attacker from "burning" a victim's counter by spamming on the victim's behalf — though note the current key is `{userId}:{branchId}` keyed on the AUTHENTICATED user, so DoS-via-counter-burn is not actually a vector. The placement is mainly about leak-prevention: rate-limit MUST be checked before PIN compare to prevent unlimited probing, but it must NOT run before eligibility, otherwise an ineligible user could discover whether they're rate-limited as a side channel.

**Why `PIN_NOT_CONFIGURED` at step 7 (not earlier):** it leaks "this branch has no PIN" to anyone authenticated, but that is minor and unavoidable — branches without PINs cannot be redeemed at all, and merchant admins must set a PIN before going live. Surfacing it after eligibility ensures only eligible users learn about misconfigured branches.

**What changes for the customer-app:** the order in which an attacker would see error codes shifts. For a legitimate user, they will now see eligibility errors (`SUBSCRIPTION_REQUIRED`, `PHONE_NOT_VERIFIED`, `ALREADY_REDEEMED`) BEFORE they ever submit a PIN — which is what the spec wants anyway: free users are routed to subscription via the M1 conversion flow before reaching the PinEntrySheet, and an already-redeemed user is routed to state-3 (RedemptionDetailsCard) via the M1 state machine. So the reorder also tightens the customer-app contract: by the time the user sees PinEntrySheet, eligibility is implicitly already validated.

### Backend additive enhancements (owner approved §10.1)

- `INVALID_PIN` response includes `remainingAttempts: PIN_FAIL_LIMIT - newFailCount` so the customer-app can show authoritative "X attempts remaining" copy.
- `PIN_RATE_LIMIT_EXCEEDED` response includes `retryAfter: <seconds>` (Redis TTL on the fail key) so the customer-app countdown is precise.

Both are non-breaking additive enhancements — existing clients that don't consume the new fields keep working.

---

## File structure

### Section A — backend prep

| File | Status | Responsibility |
|---|---|---|
| `src/api/shared/errors.ts` | modify | Extend `AppError` constructor to `(code, details?)` — backward-compatible. `statusCode` + `message` continue to come from `ERROR_DEFINITIONS`. `toJSON()` spreads `details` into the error envelope. |
| `src/api/redemption/service.ts` | modify | Reorder `createRedemption` guards (security). Extend `INVALID_PIN` throw with `details: { remainingAttempts }`. Extend `PIN_RATE_LIMIT_EXCEEDED` throw with `details: { retryAfter }`. Replace direct `voucherRedemption.create` + `userVoucherCycleState.upsert` with the race-safe conditional-claim pattern. |
| `tests/api/redemption/createRedemption.guard-order.test.ts` | new | Threat-model regression: assert PIN oracle is closed (every eligibility error returns BEFORE PIN compare runs; fail counter does not increment). |
| `tests/api/redemption/createRedemption.error-payloads.test.ts` | new | Pin `INVALID_PIN.details.remainingAttempts` and `PIN_RATE_LIMIT_EXCEEDED.details.retryAfter`. |
| `tests/api/redemption/createRedemption.race.test.ts` | new | Concurrency test: two simultaneous `createRedemption` calls → exactly 1 redemption row + 1 `ALREADY_REDEEMED`. Requires real Postgres (Neon dev) — flagged in the test file's module header. |
| `tests/api/redemption/createRedemption.test.ts` | modify | Update existing tests where the old order assumption leaked (e.g. tests that intentionally submitted bogus PIN with no subscription expecting `INVALID_PIN`). |
| `tests/api/shared/errors.test.ts` (if present) | modify | Pin that `new AppError('CODE', { foo: 1 })` produces `{ error: { code, message, statusCode, foo: 1 } }`. Pin backward compatibility: `new AppError('CODE')` still works without details. |

### Section B — frontend M2

| File | Status | Responsibility |
|---|---|---|
| `apps/customer-app/src/lib/api.ts` | modify | Extend `ApiClientError` with optional `details?: Record<string, unknown>`. Update `doFetch` (lines 47-64) to populate `details` from any non-standard error-envelope fields (`remainingAttempts`, `retryAfter`, future error payloads). Backward-compatible — existing callers ignore the new field. |
| `apps/customer-app/src/lib/api/redemption.ts` | modify | Replace stub with full Zod-typed client: `redeem(...)`, `getMyRedemption(...)`, `listMyRedemptions(...)`. Uses the existing `api.post/get` helpers (NOT a raw fetch). On `ApiClientError`, reconstructs the error envelope (`{ code, message, statusCode, ...details }`) and parses against the discriminated-union schema; throws the typed redemption error. |
| `apps/customer-app/src/features/voucher/hooks/useRedeem.ts` | new | Mutation hook. Reads `branchId` via a caller-supplied `getBranchId: () => string \| null` getter AT MUTATION TIME (NOT a captured value). Defensive null-branch guard throws `{ code: 'NULL_BRANCH' }` — UI reopens picker. Cache invalidation on success. |
| `apps/customer-app/src/features/voucher/hooks/useRedemptionLockout.ts` | new | Decoupled countdown ticker for `PIN_RATE_LIMIT_EXCEEDED.retryAfter`. Stops on unmount, resumes on remount with absolute deadline math. |
| `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx` | new | 4-digit input + error shake + attempts-remaining + lockout countdown + auto-submit guard + AppState blur clears digits. |
| `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx` | new | Spring entry + checkmark bounce + 7-particle confetti + voucher strip + 5+5 code formatting + 3 action CTAs. Persists across app backgrounding. |
| `apps/customer-app/src/features/voucher/components/BranchPickerSheet.tsx` | new | Voucher-scoped picker. Multi-branch list → select → confirm → fires `onConfirm(branchId)` to parent. Different exit semantics from merchant-profile picker. |
| `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx` | new | State-3 return-visit body. Code (formatted) + redeemed-at + branch + disabled "Show to Staff" stub. NON-QR — M3 adds QR. |
| `apps/customer-app/src/features/voucher/utils/formatRedemptionCode.ts` | new | Pure utility: `"aB3xKZmLp9"` → `"aB3xK ZmLp9"`. |
| `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` | modify | State-machine wiring. `handleCTA` for active states opens picker (multi-branch) or PinEntrySheet (single-branch). Mounts SuccessPopup. Renders RedemptionDetailsCard for state-3. **Three-tier `getBranchId` priority** (picker-confirmed local state first → URL `branchIdParam` → `selectedBranch?.id` cold-open fallback) closes the picker-confirm → PIN handoff race. Local source clears via `useEffect` once URL catches up. |
| `apps/customer-app/tests/lib/api/redemption.test.ts` | new | Zod parse for every response shape + every error code (incl. new `details` fields). |
| `apps/customer-app/tests/features/voucher/use-redeem.test.tsx` | new | Branch-attribution pin (mutation-time read), cache invalidation, defensive null guard. |
| `apps/customer-app/tests/features/voucher/pin-entry-sheet.test.tsx` | new | Input gating, auto-submit guard, error shake, attempts-remaining, lockout countdown, AppState blur. |
| `apps/customer-app/tests/features/voucher/success-popup.test.tsx` | new | Code formatting, voucher strip, info rows, action handlers, focus-loss persistence. |
| `apps/customer-app/tests/features/voucher/branch-picker-sheet-voucher.test.tsx` | new | Multi-branch list, single-branch auto-select, confirm flow, accessibility. |
| `apps/customer-app/tests/features/voucher/redemption-details-card.test.tsx` | new | State-3 surface render — code formatting, redeemed-at format, branch line, Show-to-Staff stub disabled. |
| `apps/customer-app/tests/features/voucher/voucher-detail-redeem-flow.test.tsx` | new | End-to-end happy path: CTA tap → picker → PIN → success → state-3. |
| `apps/customer-app/tests/features/voucher/voucher-detail-state-3-return-visit.test.tsx` | new | Navigate away + return → state-3 persists with redemption details. |
| `apps/customer-app/tests/features/voucher/redemption-error-handling.test.tsx` | new | Every backend error code maps to the right UX. |
| `apps/customer-app/tests/features/voucher/branch-attribution-redemption.test.tsx` | new | Branch-attribution contract: mutation-time source, three-tier source priority (picker-local > URL > selectedBranch), picker-confirm-then-immediate-PIN regression (selectedBranch still stale B1 + picker confirms B2 + PIN sent → mutation uses B2), branch-switch mid-flow, rate-limit per (userId, branchId), already-redeemed branch-independent. |

---

# Section A — Backend prep (lands first)

PR title: `fix(redemption): reorder createRedemption guards (PIN oracle) + add remainingAttempts/retryAfter`

Tier 1 in surface area but Tier 2 in classification because it's a security fix that changes external error-payload shapes. Plan-doc-first per project tier rules; this section IS the plan.

### Task A1: Extend `AppError` with optional `details` payload (backward-compatible)

**Files:**
- Modify: `src/api/shared/errors.ts:91-114`
- Create: `tests/api/shared/errors.test.ts` (or extend the existing one if present)

**Constraint per owner direction (2026-05-06):** the existing `new AppError(code)` constructor must keep working everywhere unchanged. `statusCode` and `message` continue to come from `ERROR_DEFINITIONS`. The new signature is `new AppError(code, details?)` — `details` is the only new positional argument.

- [ ] **Step 1: Write the test for both shapes (current + new)**

Pin both forms in one test file before touching the class so the implementation is constrained.

```ts
import { describe, it, expect } from 'vitest'
import { AppError } from '../../../src/api/shared/errors'

describe('AppError', () => {
  it('legacy: new AppError(code) still produces the unchanged envelope', () => {
    const e = new AppError('INVALID_PIN')
    expect(e.code).toBe('INVALID_PIN')
    expect(e.statusCode).toBe(400)
    expect(e.toJSON()).toEqual({
      error: {
        code: 'INVALID_PIN',
        message: 'The PIN you entered is incorrect.',
        statusCode: 400,
      },
    })
  })

  it('new: new AppError(code, details) spreads details into the envelope', () => {
    const e = new AppError('INVALID_PIN', { remainingAttempts: 4 })
    expect(e.code).toBe('INVALID_PIN')
    expect(e.statusCode).toBe(400)
    expect(e.toJSON()).toEqual({
      error: {
        code: 'INVALID_PIN',
        message: 'The PIN you entered is incorrect.',
        statusCode: 400,
        remainingAttempts: 4,
      },
    })
  })

  it('new: rate-limit error with retryAfter', () => {
    const e = new AppError('PIN_RATE_LIMIT_EXCEEDED', { retryAfter: 540 })
    expect(e.toJSON().error).toMatchObject({
      code: 'PIN_RATE_LIMIT_EXCEEDED',
      statusCode: 429,
      retryAfter: 540,
    })
  })

  it('details accessor exposed on the instance', () => {
    const e = new AppError('INVALID_PIN', { remainingAttempts: 4 })
    expect(e.details).toEqual({ remainingAttempts: 4 })
  })
})
```

- [ ] **Step 2: Implement the backward-compatible constructor**

```ts
export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, details?: Record<string, unknown>) {
    const def = ERROR_DEFINITIONS[code]
    super(code)
    this.code = code
    this.statusCode = def.statusCode
    this.name = 'AppError'
    if (details !== undefined) this.details = details
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: ERROR_DEFINITIONS[this.code].message,
        statusCode: this.statusCode,
        ...(this.details ?? {}),
      },
    }
  }
}
```

- [ ] **Step 3: Run the new tests AND the full suite (no callsites should break)**

```bash
npx vitest run tests/api/shared/errors.test.ts
npx vitest run tests/api
```

Expected: all green. Existing `new AppError(code)` callsites in `src/api/**` are unchanged.

- [ ] **Step 4: Commit (single commit, all green)**

```bash
git add src/api/shared/errors.ts tests/api/shared/errors.test.ts
git commit -m "feat(errors): AppError accepts optional details payload (backward-compatible)"
```

### Task A2: Reorder `createRedemption` guards + threat-model tests + update legacy tests (single green commit)

**Files:**
- Modify: `src/api/redemption/service.ts:33-172`
- Create: `tests/api/redemption/createRedemption.guard-order.test.ts`
- Modify: `tests/api/redemption/createRedemption.test.ts` (update tests that asserted the old vulnerable order)

**Commit discipline:** internally TDD'd (write threat-model tests first, watch them fail, reorder, fix legacy tests), but a single commit lands on the published branch with all changes together. No "failing-tests-only" intermediate commit reaches `origin`.

- [ ] **Step 1: Write the threat-model regression test FILE**

The test must construct scenarios where each eligibility gate fails AND the submitted PIN is intentionally wrong. After the reorder, every eligibility error must return BEFORE PIN compare runs (i.e. the fail counter must NOT increment).

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createRedemption } from '../../../src/api/redemption/service'
import { fakePrisma, fakeRedis, seedRedemptionFixtures } from './fixtures'

describe('createRedemption — guard order (PIN oracle closed)', () => {
  let prisma: any
  let redis: any
  let userId: string
  let voucherId: string
  let branchId: string
  let realPin: string

  beforeEach(async () => {
    ;({ prisma, redis, userId, voucherId, branchId, realPin } = await seedRedemptionFixtures())
  })

  // Eligibility errors must return BEFORE PIN compare. We verify that:
  //   (a) submitting wrong PIN with an ineligible user returns the ELIGIBILITY
  //       error (not INVALID_PIN), and
  //   (b) the fail counter does NOT increment.
  // (a) confirms the user can't use PIN as an oracle; (b) is the same property
  // expressed at the rate-limit layer.

  it('SUBSCRIPTION_REQUIRED returns before PIN compare (no counter increment)', async () => {
    await prisma.subscription.delete({ where: { userId } })
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' })

    expect(await redis.get(failKey)).toBeNull()
  })

  it('PHONE_NOT_VERIFIED returns before PIN compare (no counter increment)', async () => {
    await prisma.user.update({ where: { id: userId }, data: { phoneVerified: false } })
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'PHONE_NOT_VERIFIED' })

    expect(await redis.get(failKey)).toBeNull()
  })

  it('VOUCHER_NOT_FOUND returns before PIN compare (no counter increment)', async () => {
    await prisma.voucher.update({ where: { id: voucherId }, data: { status: 'INACTIVE' } })
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'VOUCHER_NOT_FOUND' })

    expect(await redis.get(failKey)).toBeNull()
  })

  it('BRANCH_MERCHANT_MISMATCH returns before PIN compare (no counter increment)', async () => {
    // Create a branch under a different merchant.
    const otherMerchant = await prisma.merchant.create({ data: makeOtherMerchant() })
    const otherBranch = await prisma.branch.create({
      data: { merchantId: otherMerchant.id, name: 'Other', isMainBranch: true, isActive: true,
              redemptionPin: encrypt('1111') }
    })
    const failKey = `pinFailCount:${userId}:${otherBranch.id}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId: otherBranch.id, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'BRANCH_MERCHANT_MISMATCH' })

    expect(await redis.get(failKey)).toBeNull()
  })

  it('ALREADY_REDEEMED returns before PIN compare (no counter increment)', async () => {
    // Mark voucher as redeemed this cycle.
    await prisma.userVoucherCycleState.create({
      data: {
        userId, voucherId,
        cycleStartDate: new Date('2026-05-01T00:00:00Z'),
        isRedeemedInCurrentCycle: true,
        lastRedeemedAt: new Date('2026-05-02T00:00:00Z'),
      }
    })
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'ALREADY_REDEEMED' })

    expect(await redis.get(failKey)).toBeNull()
  })

  it('PIN_NOT_CONFIGURED returns BEFORE rate-limit check (so a no-PIN branch cannot trip the counter)', async () => {
    await prisma.branch.update({ where: { id: branchId }, data: { redemptionPin: null } })
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'PIN_NOT_CONFIGURED' })

    expect(await redis.get(failKey)).toBeNull()
  })

  it('INVALID_PIN ONLY returns once eligibility passes (counter increments)', async () => {
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'INVALID_PIN' })

    expect(await redis.get(failKey)).toBe('1')
  })

  it('successful redemption resets counter to zero', async () => {
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.set(failKey, '3')

    const result = await createRedemption(
      prisma, redis, userId, { voucherId, branchId, pin: realPin }, ctx()
    )

    expect(result.redemptionCode).toMatch(/^[A-Za-z0-9]{10}$/)
    expect(await redis.get(failKey)).toBeNull()
  })

  // ── Expired voucher eligibility (server-side; cannot be bypassed by UI) ──

  it('expired voucher + wrong PIN returns VOUCHER_NOT_FOUND, not INVALID_PIN', async () => {
    await prisma.voucher.update({
      where: { id: voucherId },
      data: { expiryDate: new Date('2020-01-01T00:00:00Z') },
    })
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'VOUCHER_NOT_FOUND' })
  })

  it('expired voucher + wrong PIN does NOT increment the PIN fail counter', async () => {
    await prisma.voucher.update({
      where: { id: voucherId },
      data: { expiryDate: new Date('2020-01-01T00:00:00Z') },
    })
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'VOUCHER_NOT_FOUND' })

    expect(await redis.get(failKey)).toBeNull()
  })

  it('expired voucher cannot create VoucherRedemption even with correct PIN', async () => {
    await prisma.voucher.update({
      where: { id: voucherId },
      data: { expiryDate: new Date('2020-01-01T00:00:00Z') },
    })

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: realPin }, ctx())
    ).rejects.toMatchObject({ code: 'VOUCHER_NOT_FOUND' })

    const redemptions = await prisma.voucherRedemption.findMany({
      where: { userId, voucherId },
    })
    expect(redemptions.length).toBe(0)
  })

  // ── Inactive branch eligibility (server-side; cannot be bypassed by UI) ──

  it('inactive branch + wrong PIN returns BRANCH_UNAVAILABLE, not INVALID_PIN', async () => {
    await prisma.branch.update({ where: { id: branchId }, data: { isActive: false } })
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'BRANCH_UNAVAILABLE' })
  })

  it('inactive branch + wrong PIN does NOT increment the PIN fail counter', async () => {
    await prisma.branch.update({ where: { id: branchId }, data: { isActive: false } })
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'BRANCH_UNAVAILABLE' })

    expect(await redis.get(failKey)).toBeNull()
  })

  it('inactive branch cannot create VoucherRedemption even with correct PIN', async () => {
    await prisma.branch.update({ where: { id: branchId }, data: { isActive: false } })

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: realPin }, ctx())
    ).rejects.toMatchObject({ code: 'BRANCH_UNAVAILABLE' })

    const redemptions = await prisma.voucherRedemption.findMany({
      where: { userId, voucherId },
    })
    expect(redemptions.length).toBe(0)
  })
})
```

(Helper `seedRedemptionFixtures` and `ctx` should exist in test infra; if not, write them in a fixtures file in this same task.)

- [ ] **Step 2: Run the new test file to verify it fails against current code (informational only — DO NOT COMMIT)**

```bash
npx vitest run tests/api/redemption/createRedemption.guard-order.test.ts
```

Expected: ALL FAIL (current code returns `INVALID_PIN` first for every eligibility error case). Confirms the threat model. This is local-only verification; nothing is committed yet.

- [ ] **Step 3: Apply the safe order to `src/api/redemption/service.ts`**

The function shape changes to: voucher fetch + validate → branch fetch + validate (must belong to voucher's merchant) → subscription guard → phone guard → cycle state guard → PIN configured guard → rate limit → PIN compare → atomic write → counter reset. **Note**: Task A2 only does the GUARD REORDER. The atomic-write race-fix is Task A5; the `INVALID_PIN.remainingAttempts` and `PIN_RATE_LIMIT_EXCEEDED.retryAfter` payloads are Tasks A3 and A4. Keep this task focused on the reorder so the reviewer can isolate the security change.

```ts
export async function createRedemption(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  data: { voucherId: string; branchId: string; pin: string },
  ctx: RequestCtx
) {
  const now = new Date()

  // 1. Voucher must exist + ACTIVE + APPROVED + merchant ACTIVE
  const voucher = await prisma.voucher.findUnique({
    where: { id: data.voucherId },
    include: { merchant: { select: { id: true, status: true } } },
  })
  if (
    !voucher ||
    voucher.status !== VoucherStatus.ACTIVE ||
    voucher.approvalStatus !== ApprovalStatus.APPROVED ||
    voucher.merchant.status !== MerchantStatus.ACTIVE
  ) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  // 2. Voucher not expired — server-side eligibility, not a UI concern.
  //    Collapse into VOUCHER_NOT_FOUND (per owner direction) so an attacker
  //    cannot distinguish "voucher does not exist" vs "voucher expired" via
  //    the error response. A leaked PIN must not be redeemable against an
  //    expired voucher even if the customer-app UI is bypassed.
  if (voucher.expiryDate && voucher.expiryDate.getTime() <= now.getTime()) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  // 3. Branch exists + isActive — server-side eligibility. A branch the
  //    merchant has deactivated must not accept redemptions even if the
  //    branch PIN is known. Wraps both "no such branch" and "branch
  //    deactivated" under BRANCH_UNAVAILABLE so neither state is
  //    distinguishable from the other.
  const branch = await prisma.branch.findUnique({ where: { id: data.branchId } })
  if (!branch || !branch.isActive) {
    throw new AppError('BRANCH_UNAVAILABLE')
  }

  // 4. Branch belongs to voucher's merchant
  if (branch.merchantId !== voucher.merchantId) {
    throw new AppError('BRANCH_MERCHANT_MISMATCH')
  }

  // 5. Subscription guard
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub || !['ACTIVE', 'TRIALLING'].includes(sub.status)) {
    throw new AppError('SUBSCRIPTION_REQUIRED')
  }

  // 6. Phone-verified guard
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { phoneVerified: true },
  })
  if (!userRow || !userRow.phoneVerified) {
    throw new AppError('PHONE_NOT_VERIFIED')
  }

  // 7. Subscription-anchored cycle guard (fast-fail eligibility — closes
  //    PIN oracle by rejecting already-redeemed users BEFORE PIN compare).
  //    Defense in depth: Task A5's transactional claim re-checks under
  //    isolation to defend against the post-PIN race.
  const { cycleStart } = getCurrentCycleWindow(sub.cycleAnchorDate, now)
  const cycleState = await prisma.userVoucherCycleState.findUnique({
    where: { userId_voucherId: { userId, voucherId: data.voucherId } },
  })
  const isCurrentCycle = cycleState != null && cycleState.cycleStartDate >= cycleStart
  if (isCurrentCycle && cycleState!.isRedeemedInCurrentCycle) {
    throw new AppError('ALREADY_REDEEMED')
  }

  // 8. Branch PIN configured (no leak — eligibility already passed)
  if (!branch.redemptionPin) {
    throw new AppError('PIN_NOT_CONFIGURED')
  }

  // 9. Rate limit — protects ONLY the PIN compare step below
  //    NOTE: Task A2 only checks the limit. Task A4 adds details: { retryAfter }.
  const failKey = RedisKey.pinFailCount(userId, data.branchId)
  const failCount = await redis.get(failKey)
  if (failCount !== null && parseInt(failCount, 10) >= PIN_FAIL_LIMIT) {
    throw new AppError('PIN_RATE_LIMIT_EXCEEDED')
  }

  // 10. Timing-safe PIN comparison
  //     NOTE: Task A2 only throws INVALID_PIN. Task A3 adds details: { remainingAttempts }.
  let pinMatches = false
  try {
    const decrypted = decrypt(branch.redemptionPin)
    if (decrypted.length === data.pin.length) {
      const pinBuffer = Buffer.from(data.pin, 'utf8')
      const decBuffer = Buffer.from(decrypted, 'utf8')
      pinMatches = crypto.timingSafeEqual(pinBuffer, decBuffer)
    }
  } catch {
    pinMatches = false
  }

  if (!pinMatches) {
    await redis.incr(failKey)
    await redis.expire(failKey, PIN_FAIL_WINDOW)
    throw new AppError('INVALID_PIN')
  }

  // 11. Atomic write
  //     NOTE: Task A2 keeps the existing upsert. Task A5 replaces the upsert
  //     with the race-safe conditional-claim pattern.
  const redemptionCode = generateRedemptionCode()
  const redemption = await prisma.$transaction(async (tx) => {
    const created = await tx.voucherRedemption.create({
      data: {
        userId,
        voucherId:       data.voucherId,
        branchId:        data.branchId,
        redemptionCode,
        estimatedSaving: voucher.estimatedSaving,
        isValidated:     false,
        redeemedAt:      now,
      },
    })
    await tx.userVoucherCycleState.upsert({
      where:  { userId_voucherId: { userId, voucherId: data.voucherId } },
      create: {
        userId, voucherId: data.voucherId,
        cycleStartDate: cycleStart,
        isRedeemedInCurrentCycle: true,
        lastRedeemedAt: now,
      },
      update: {
        cycleStartDate: cycleStart,
        isRedeemedInCurrentCycle: true,
        lastRedeemedAt: now,
      },
    })
    return created
  })

  // 12. Reset fail counter on success
  await redis.del(failKey)

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'VOUCHER_REDEEMED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { voucherId: data.voucherId, branchId: data.branchId, redemptionCode },
  })

  return { ...redemption, estimatedSaving: Number(redemption.estimatedSaving) }
}
```

- [ ] **Step 4: Update legacy redemption tests for the new order**

```bash
npx vitest run tests/api/redemption 2>&1 | grep -E '✗|FAIL'
```

For each failing test in `tests/api/redemption/createRedemption.test.ts` (and any sibling files), decide:
- Was it asserting the OLD (vulnerable) order? → update the expected error code to match the safe order.
- Was it intentionally testing PIN-counter behaviour with no eligibility? → split into a "happy eligibility, wrong PIN" test (counter increments) AND a "no eligibility, wrong PIN" test (counter does NOT increment).

Example update:

```ts
// BEFORE (asserted old order):
it('rejects with INVALID_PIN when subscription is missing', async () => {
  await prisma.subscription.delete({ where: { userId } })
  await expect(
    createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
  ).rejects.toMatchObject({ code: 'INVALID_PIN' })
})

// AFTER (asserts safe order):
it('rejects with SUBSCRIPTION_REQUIRED when subscription is missing (PIN never reaches compare)', async () => {
  await prisma.subscription.delete({ where: { userId } })
  await expect(
    createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
  ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' })
})
```

- [ ] **Step 5: Run the FULL redemption suite — must be all green**

```bash
npx vitest run tests/api/redemption
```

- [ ] **Step 6: Single commit covering all four files (one green commit)**

```bash
git add src/api/redemption/service.ts \
        tests/api/redemption/createRedemption.guard-order.test.ts \
        tests/api/redemption/createRedemption.test.ts
git commit -m "fix(redemption): reorder createRedemption guards to close PIN oracle"
```

### Task A3: Add `INVALID_PIN.details.remainingAttempts`

**Files:**
- Modify: `src/api/redemption/service.ts` (the `INVALID_PIN` throw site, post-Task-A2)
- Create: `tests/api/redemption/createRedemption.error-payloads.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createRedemption } from '../../../src/api/redemption/service'
import { seedRedemptionFixtures, ctx } from './fixtures'

describe('createRedemption — INVALID_PIN.details.remainingAttempts', () => {
  let prisma: any, redis: any, userId: string, voucherId: string, branchId: string

  beforeEach(async () => {
    ;({ prisma, redis, userId, voucherId, branchId } = await seedRedemptionFixtures())
  })

  it('returns 4 remaining after first wrong PIN', async () => {
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    await expect(
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    ).rejects.toMatchObject({ code: 'INVALID_PIN', details: { remainingAttempts: 4 } })
  })

  it('decrements per failure (4 → 3 → 2 → 1 → 0)', async () => {
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    for (let expected = 4; expected >= 0; expected--) {
      try {
        await createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
      } catch (err: any) {
        if (err.code === 'INVALID_PIN') {
          expect(err.details.remainingAttempts).toBe(expected)
        } else {
          // After 5 fails the next call returns PIN_RATE_LIMIT_EXCEEDED instead.
          expect(err.code).toBe('PIN_RATE_LIMIT_EXCEEDED')
          break
        }
      }
    }
  })

  it('clamps at zero — never negative', async () => {
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.set(failKey, '4') // one fail away from limit

    try {
      await createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    } catch (err: any) {
      expect(err.code).toBe('INVALID_PIN')
      expect(err.details.remainingAttempts).toBe(0)
    }
  })
})
```

- [ ] **Step 2: Update the `INVALID_PIN` throw site**

```ts
if (!pinMatches) {
  const newCount = await redis.incr(failKey)
  await redis.expire(failKey, PIN_FAIL_WINDOW)
  const remainingAttempts = Math.max(0, PIN_FAIL_LIMIT - newCount)
  throw new AppError('INVALID_PIN', { remainingAttempts })
}
```

- [ ] **Step 3: Run + commit (single green commit)**

```bash
npx vitest run tests/api/redemption/createRedemption.error-payloads.test.ts
git add src/api/redemption/service.ts tests/api/redemption/createRedemption.error-payloads.test.ts
git commit -m "feat(redemption): INVALID_PIN includes details.remainingAttempts"
```

### Task A4: Add `PIN_RATE_LIMIT_EXCEEDED.details.retryAfter`

**Files:**
- Modify: `src/api/redemption/service.ts` (the `PIN_RATE_LIMIT_EXCEEDED` throw site)
- Modify: `tests/api/redemption/createRedemption.error-payloads.test.ts` (extend with retryAfter cases)

- [ ] **Step 1: Add the tests**

```ts
describe('createRedemption — PIN_RATE_LIMIT_EXCEEDED.details.retryAfter', () => {
  let prisma: any, redis: any, userId: string, voucherId: string, branchId: string

  beforeEach(async () => {
    ;({ prisma, redis, userId, voucherId, branchId } = await seedRedemptionFixtures())
  })

  it('returns retryAfter from Redis TTL when key has TTL', async () => {
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.set(failKey, '5', 'EX', 600) // 10 min remaining

    try {
      await createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    } catch (err: any) {
      expect(err.code).toBe('PIN_RATE_LIMIT_EXCEEDED')
      expect(err.details.retryAfter).toBeGreaterThan(590)
      expect(err.details.retryAfter).toBeLessThanOrEqual(600)
    }
  })

  it('falls back to PIN_FAIL_WINDOW when Redis returns -1 (no TTL)', async () => {
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.set(failKey, '5') // no expire

    try {
      await createRedemption(prisma, redis, userId, { voucherId, branchId, pin: '0000' }, ctx())
    } catch (err: any) {
      expect(err.code).toBe('PIN_RATE_LIMIT_EXCEEDED')
      expect(err.details.retryAfter).toBe(900) // PIN_FAIL_WINDOW
    }
  })
})
```

- [ ] **Step 2: Update the rate-limit throw site**

```ts
const failCount = await redis.get(failKey)
if (failCount !== null && parseInt(failCount, 10) >= PIN_FAIL_LIMIT) {
  const ttl = await redis.ttl(failKey)
  const retryAfter = ttl > 0 ? ttl : PIN_FAIL_WINDOW
  throw new AppError('PIN_RATE_LIMIT_EXCEEDED', { retryAfter })
}
```

- [ ] **Step 3: Run + commit (single green commit)**

```bash
npx vitest run tests/api/redemption/createRedemption.error-payloads.test.ts
git add src/api/redemption/service.ts tests/api/redemption/createRedemption.error-payloads.test.ts
git commit -m "feat(redemption): PIN_RATE_LIMIT_EXCEEDED includes details.retryAfter"
```

### Task A5: Race-safe atomic cycle-state claim (single green commit)

**Files:**
- Modify: `src/api/redemption/service.ts` (the `prisma.$transaction` block)
- Create: `tests/api/redemption/createRedemption.race.test.ts`

This task closes the atomic-write race documented in the threat model. The pre-PIN cycle check at step 5 stays as the fast-fail eligibility gate (closes PIN oracle); the conditional-claim pattern below is defense-in-depth INSIDE the transaction.

**Test infrastructure note:** the concurrency test requires real Postgres semantics (atomic isolation). Project convention uses Neon with Prisma; the test file's module header documents that requirement and the test must be skipped (with a clear `it.skip(...)` + comment) if the environment is mocking Prisma. Do NOT silently skip — assert the environment supports concurrent transactions or skip with reason.

- [ ] **Step 1: Write the concurrency test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createRedemption } from '../../../src/api/redemption/service'
import { AppError } from '../../../src/api/shared/errors'
import { seedRedemptionFixtures, ctx, hasRealPrisma } from './fixtures'

describe('createRedemption — atomic claim race', () => {
  let prisma: any, redis: any, userId: string, voucherId: string, branchId: string, realPin: string

  beforeEach(async () => {
    ;({ prisma, redis, userId, voucherId, branchId, realPin } = await seedRedemptionFixtures())
  })

  // Skip explicitly when running against a mocked Prisma — the conditional-
  // claim pattern relies on real Postgres atomicity for the race property.
  // Don't silently skip; surface the reason so CI can ensure real-Postgres
  // coverage exists somewhere.
  const real = hasRealPrisma()
  const test = real ? it : it.skip

  test('two simultaneous createRedemption calls produce exactly one redemption + one ALREADY_REDEEMED', async () => {
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    const [r1, r2] = await Promise.allSettled([
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: realPin }, ctx()),
      createRedemption(prisma, redis, userId, { voucherId, branchId, pin: realPin }, ctx()),
    ])

    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled')
    const rejected  = [r1, r2].filter((r) => r.status === 'rejected')

    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)

    const reason = (rejected[0] as PromiseRejectedResult).reason
    expect(reason).toBeInstanceOf(AppError)
    expect((reason as AppError).code).toBe('ALREADY_REDEEMED')

    const redemptions = await prisma.voucherRedemption.findMany({
      where: { userId, voucherId },
    })
    expect(redemptions.length).toBe(1)

    const cycleState = await prisma.userVoucherCycleState.findUnique({
      where: { userId_voucherId: { userId, voucherId } },
    })
    expect(cycleState?.isRedeemedInCurrentCycle).toBe(true)
  })

  test('previously-redeemed cycle (stale row) is correctly claimed for a fresh cycle', async () => {
    // User redeemed last cycle; now subscription rolled into a new cycle
    // window. Conditional update should claim the stale row.
    await prisma.userVoucherCycleState.create({
      data: {
        userId, voucherId,
        cycleStartDate: new Date('2026-04-01T00:00:00Z'),  // older than current cycle
        isRedeemedInCurrentCycle: true,
        lastRedeemedAt: new Date('2026-04-15T00:00:00Z'),
      },
    })
    const failKey = `pinFailCount:${userId}:${branchId}`
    await redis.del(failKey)

    const result = await createRedemption(
      prisma, redis, userId, { voucherId, branchId, pin: realPin }, ctx()
    )
    expect(result.redemptionCode).toMatch(/^[A-Za-z0-9]{10}$/)
  })
})
```

- [ ] **Step 2: Replace the existing `prisma.$transaction` block with the conditional-claim pattern**

```ts
const redemption = await prisma.$transaction(async (tx) => {
  // 1. Conditional claim — succeeds only if the row is (a) from an older
  //    cycle (stale, can be reclaimed) or (b) current cycle but not yet
  //    redeemed. This is the defense-in-depth race fix.
  const claimUpdate = await tx.userVoucherCycleState.updateMany({
    where: {
      userId,
      voucherId: data.voucherId,
      OR: [
        { cycleStartDate: { lt: cycleStart } },         // stale row — reclaim
        { isRedeemedInCurrentCycle: false },             // current, not yet claimed
      ],
    },
    data: {
      cycleStartDate: cycleStart,
      isRedeemedInCurrentCycle: true,
      lastRedeemedAt: now,
    },
  })

  let claimed = claimUpdate.count === 1

  if (!claimed) {
    // 2. No matching row — try create. P2002 on unique key means a concurrent
    //    request created the row between our updateMany and our create; retry
    //    the conditional update once.
    try {
      await tx.userVoucherCycleState.create({
        data: {
          userId,
          voucherId: data.voucherId,
          cycleStartDate: cycleStart,
          isRedeemedInCurrentCycle: true,
          lastRedeemedAt: now,
        },
      })
      claimed = true
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const retryUpdate = await tx.userVoucherCycleState.updateMany({
          where: {
            userId,
            voucherId: data.voucherId,
            OR: [
              { cycleStartDate: { lt: cycleStart } },
              { isRedeemedInCurrentCycle: false },
            ],
          },
          data: {
            cycleStartDate: cycleStart,
            isRedeemedInCurrentCycle: true,
            lastRedeemedAt: now,
          },
        })
        claimed = retryUpdate.count === 1
      } else {
        throw err
      }
    }
  }

  if (!claimed) {
    // Concurrent winner already claimed for this cycle.
    throw new AppError('ALREADY_REDEEMED')
  }

  // 3. Cycle state is claimed; safe to write the redemption record.
  return tx.voucherRedemption.create({
    data: {
      userId,
      voucherId:       data.voucherId,
      branchId:        data.branchId,
      redemptionCode,
      estimatedSaving: voucher.estimatedSaving,
      isValidated:     false,
      redeemedAt:      now,
    },
  })
})
```

- [ ] **Step 3: Run the full redemption test suite — all green**

```bash
npx vitest run tests/api/redemption
```

The new race tests pass; all existing tests still pass.

- [ ] **Step 4: Commit (single green commit)**

```bash
git add src/api/redemption/service.ts tests/api/redemption/createRedemption.race.test.ts
git commit -m "fix(redemption): race-safe atomic cycle-state claim defends against concurrent redeem"
```

### Task A6: Open the Section A PR

Branch name: `fix/redemption-guard-order-pin-oracle-and-race`

- [ ] **Step 1: Verify full-suite green**

```bash
npx vitest run tests/api
npx tsc --noEmit
```

- [ ] **Step 2: Confirm no failing-test commits on the branch**

```bash
git log --oneline main..HEAD
```

Each commit must leave the test suite green. If any internal commit broke green (e.g. a TDD step landed mid-state), squash before push:

```bash
git rebase -i main      # squash WIP commits into their final-green successor
```

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin fix/redemption-guard-order-pin-oracle-and-race
gh pr create --base main \
  --title "fix(redemption): close PIN oracle (guard reorder) + race-safe atomic claim + remainingAttempts/retryAfter (M2 prep)" \
  --body "<see plan §A — Section A summary + threat model section>"
```

- [ ] **Step 4: PAUSE FOR OWNER REVIEW + MERGE before starting Section B.**

This is mandatory. Section B's frontend tests assume the new error-payload shapes; running Section B against pre-fix backend would mask bugs.

---

# Section B — Frontend M2 (lands after Section A merges)

PR title: `feat(voucher): M2 — PIN entry + redemption mutation + success popup + state-3 surface`

After Section A merges, sync local main and start Section B from a fresh feature branch.

```bash
git checkout main && git pull --ff-only origin main
git checkout -b feature/voucher-detail-m2
```

### Task B1a: Extend `ApiClientError` with optional `details` payload

**Files:**
- Modify: `apps/customer-app/src/lib/api.ts:11-18` (the `ApiClientError` class) and `apps/customer-app/src/lib/api.ts:47-64` (the `doFetch` error-throw site)
- Create: `apps/customer-app/tests/lib/api.error-details.test.ts`

Owner direction (2026-05-06): extend `ApiClientError` with `details` so this and future APIs can surface backend payload extras (`remainingAttempts`, `retryAfter`, etc.) cleanly. Backward-compatible — existing callers that don't read `details` keep working.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { api, ApiClientError } from '@/lib/api'

const realFetch = global.fetch
afterEach(() => { global.fetch = realFetch })

function mockResponse(body: any, status = 400) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('ApiClientError.details', () => {
  it('captures non-standard error fields from the envelope', async () => {
    global.fetch = jest.fn(async () => mockResponse(
      { error: { code: 'INVALID_PIN', message: 'Wrong PIN', statusCode: 400, remainingAttempts: 3 } },
      400,
    )) as any

    try {
      await api.post('/api/v1/redemption', { voucherId: 'v', branchId: 'b', pin: '1234' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError)
      expect((err as ApiClientError).code).toBe('INVALID_PIN')
      expect((err as ApiClientError).status).toBe(400)
      expect((err as ApiClientError).details).toEqual({ remainingAttempts: 3 })
    }
  })

  it('captures retryAfter on rate-limit error', async () => {
    global.fetch = jest.fn(async () => mockResponse(
      { error: { code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'Locked', statusCode: 429, retryAfter: 540 } },
      429,
    )) as any

    try {
      await api.post('/api/v1/redemption', {})
    } catch (err) {
      expect((err as ApiClientError).details).toEqual({ retryAfter: 540 })
    }
  })

  it('details is undefined when envelope has only standard fields', async () => {
    global.fetch = jest.fn(async () => mockResponse(
      { error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Subscribe', statusCode: 403 } },
      403,
    )) as any

    try {
      await api.post('/api/v1/redemption', {})
    } catch (err) {
      expect((err as ApiClientError).code).toBe('SUBSCRIPTION_REQUIRED')
      expect((err as ApiClientError).details).toBeUndefined()
    }
  })

  it('preserves backward-compat: existing error.field is still surfaced', async () => {
    global.fetch = jest.fn(async () => mockResponse(
      { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Used', statusCode: 409, field: 'email' } },
      409,
    )) as any

    try {
      await api.post('/api/v1/auth/register', {})
    } catch (err) {
      expect((err as ApiClientError).field).toBe('email')
      // `field` remains a top-level property; not duplicated into details.
      expect((err as ApiClientError).details).toBeUndefined()
    }
  })
})
```

- [ ] **Step 2: Implement the extension**

Update `ApiClientError` constructor + `doFetch` error-throw site:

```ts
// apps/customer-app/src/lib/api.ts:11
export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly field?: string
  readonly details?: Record<string, unknown>
  constructor(
    message: string,
    code: string,
    status: number,
    field?: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.code = code
    this.status = status
    if (field !== undefined) this.field = field
    if (details !== undefined) this.details = details
  }
}

// apps/customer-app/src/lib/api.ts ~line 57 (inside doFetch's !res.ok branch)
const errorBody = nested ?? json
const { code: _c, message: _m, statusCode: _s, field: _f, ...extra } = errorBody as any
const details = Object.keys(extra).length > 0 ? (extra as Record<string, unknown>) : undefined
throw new ApiClientError(
  (errorBody.message as string | undefined) ?? res.statusText,
  (errorBody.code as string | undefined) ?? 'UNKNOWN',
  res.status,
  errorBody.field as string | undefined,
  details,
)
```

- [ ] **Step 3: Run + commit (single green commit)**

```bash
cd apps/customer-app
npx jest tests/lib/api.error-details.test.ts --forceExit
git add apps/customer-app/src/lib/api.ts apps/customer-app/tests/lib/api.error-details.test.ts
git commit -m "feat(api): ApiClientError carries optional details payload from error envelope"
```

### Task B1b: Voucher API client — extend `lib/api/redemption.ts` with full Zod-typed surface

**Files:**
- Modify: `apps/customer-app/src/lib/api/redemption.ts`
- Create: `apps/customer-app/tests/lib/api/redemption.test.ts`

Uses `api.post/get` from `lib/api.ts` (NOT a raw `fetch`). On `ApiClientError`, reconstructs the error envelope (`{ code, message, statusCode, ...details }`) and parses against the discriminated-union schema; throws the typed redemption error so `useRedeem` callers get strongly-typed error.code matching.

- [ ] **Step 1: Write the failing test**

Pin every Zod schema parses correctly: success response, every error code, the new `details` payloads.

```ts
import { describe, it, expect } from '@jest/globals'
import {
  RedeemRequestSchema, RedeemResponseSchema,
  RedemptionErrorSchema, RedemptionSummarySchema,
} from '@/lib/api/redemption'

describe('redemption API schemas', () => {
  it('RedeemRequest accepts { voucherId, branchId, pin: 4 digits }', () => {
    const r = RedeemRequestSchema.parse({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
    expect(r.pin).toBe('1234')
  })

  it('RedeemRequest rejects PIN that is not 4 digits', () => {
    expect(() => RedeemRequestSchema.parse({ voucherId: 'v1', branchId: 'b1', pin: 'abcd' })).toThrow()
    expect(() => RedeemRequestSchema.parse({ voucherId: 'v1', branchId: 'b1', pin: '12345' })).toThrow()
  })

  it('RedeemResponse parses estimatedSaving as number (z.coerce.number per PR #39 lesson)', () => {
    const r = RedeemResponseSchema.parse({
      id: 'r1', userId: 'u1', voucherId: 'v1', branchId: 'b1',
      redemptionCode: 'aB3xKZmLp9', estimatedSaving: '4.50',  // server returns Decimal as string
      isValidated: false, redeemedAt: '2026-05-06T12:00:00Z',
    })
    expect(r.estimatedSaving).toBe(4.5)
  })

  it('INVALID_PIN error includes remainingAttempts as number', () => {
    const e = RedemptionErrorSchema.parse({
      code: 'INVALID_PIN', message: 'Wrong PIN', statusCode: 400, remainingAttempts: 3,
    })
    expect(e.code).toBe('INVALID_PIN')
    if (e.code === 'INVALID_PIN') expect(e.remainingAttempts).toBe(3)
  })

  it('PIN_RATE_LIMIT_EXCEEDED error includes retryAfter as number', () => {
    const e = RedemptionErrorSchema.parse({
      code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'Locked', statusCode: 429, retryAfter: 600,
    })
    if (e.code === 'PIN_RATE_LIMIT_EXCEEDED') expect(e.retryAfter).toBe(600)
  })

  it('SUBSCRIPTION_REQUIRED / PHONE_NOT_VERIFIED / VOUCHER_NOT_FOUND / BRANCH_MERCHANT_MISMATCH / ALREADY_REDEEMED / PIN_NOT_CONFIGURED parse with no extra payload', () => {
    for (const code of [
      'SUBSCRIPTION_REQUIRED', 'PHONE_NOT_VERIFIED', 'VOUCHER_NOT_FOUND',
      'BRANCH_MERCHANT_MISMATCH', 'ALREADY_REDEEMED', 'PIN_NOT_CONFIGURED',
    ]) {
      const e = RedemptionErrorSchema.parse({ code, message: 'x', statusCode: 400 })
      expect(e.code).toBe(code)
    }
  })

  it('RedemptionSummary parses listMyRedemptions item shape', () => {
    const r = RedemptionSummarySchema.parse({
      id: 'r1', voucherId: 'v1', branchId: 'b1', redemptionCode: 'aB3xKZmLp9',
      estimatedSaving: '4.50', isValidated: false, redeemedAt: '2026-05-06T12:00:00Z',
    })
    expect(r.estimatedSaving).toBe(4.5)
  })
})
```

- [ ] **Step 2: Run; expect to fail (file is a stub today)**

```bash
cd apps/customer-app
npx jest tests/lib/api/redemption.test.ts --forceExit
```

- [ ] **Step 3: Implement `lib/api/redemption.ts` using `api.post/get` + `ApiClientError`**

```ts
import { z } from 'zod'
import { api, ApiClientError } from '@/lib/api'

// Voucher type stays — used elsewhere already
export const VoucherType = z.enum([
  'BOGO', 'SPEND_AND_SAVE', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT',
  'FREEBIE', 'PACKAGE_DEAL', 'TIME_LIMITED', 'REUSABLE',
])
export type VoucherType = z.infer<typeof VoucherType>

// Request
export const RedeemRequestSchema = z.object({
  voucherId: z.string().min(1),
  branchId:  z.string().min(1),
  pin:       z.string().regex(/^\d{4}$/),
})
export type RedeemRequest = z.infer<typeof RedeemRequestSchema>

// Success response
export const RedeemResponseSchema = z.object({
  id:              z.string(),
  userId:          z.string(),
  voucherId:       z.string(),
  branchId:        z.string(),
  redemptionCode:  z.string().regex(/^[A-Za-z0-9]{10}$/),
  estimatedSaving: z.coerce.number(),
  isValidated:     z.boolean(),
  redeemedAt:      z.string(),
})
export type RedeemResponse = z.infer<typeof RedeemResponseSchema>

// Error response (discriminated union by `code`)
export const RedemptionErrorSchema = z.discriminatedUnion('code', [
  z.object({ code: z.literal('INVALID_PIN'), message: z.string(), statusCode: z.literal(400),
             remainingAttempts: z.number().int().min(0) }),
  z.object({ code: z.literal('PIN_RATE_LIMIT_EXCEEDED'), message: z.string(), statusCode: z.literal(429),
             retryAfter: z.number().int().min(0) }),
  z.object({ code: z.literal('SUBSCRIPTION_REQUIRED'),  message: z.string(), statusCode: z.literal(403) }),
  z.object({ code: z.literal('PHONE_NOT_VERIFIED'),     message: z.string(), statusCode: z.literal(403) }),
  z.object({ code: z.literal('VOUCHER_NOT_FOUND'),      message: z.string(), statusCode: z.literal(404) }),
  z.object({ code: z.literal('BRANCH_MERCHANT_MISMATCH'), message: z.string(), statusCode: z.literal(400) }),
  z.object({ code: z.literal('ALREADY_REDEEMED'),       message: z.string(), statusCode: z.literal(409) }),
  z.object({ code: z.literal('PIN_NOT_CONFIGURED'),     message: z.string(), statusCode: z.literal(400) }),
])
export type RedemptionError = z.infer<typeof RedemptionErrorSchema>

// listMyRedemptions item
export const RedemptionSummarySchema = z.object({
  id:              z.string(),
  voucherId:       z.string(),
  branchId:        z.string(),
  redemptionCode:  z.string(),
  estimatedSaving: z.coerce.number(),
  isValidated:     z.boolean(),
  redeemedAt:      z.string(),
})
export type RedemptionSummary = z.infer<typeof RedemptionSummarySchema>

/**
 * Convert an ApiClientError into a typed RedemptionError when possible.
 * Falls through (re-throws original) for unknown codes so callers can decide.
 */
function toRedemptionError(err: ApiClientError): RedemptionError | null {
  const envelope = {
    code: err.code,
    message: err.message,
    statusCode: err.status,
    ...(err.details ?? {}),
  }
  const parsed = RedemptionErrorSchema.safeParse(envelope)
  return parsed.success ? parsed.data : null
}

export const redemptionApi = {
  async redeem(req: RedeemRequest): Promise<RedeemResponse> {
    const valid = RedeemRequestSchema.parse(req)
    try {
      const json = await api.post<unknown>('/api/v1/redemption', valid)
      return RedeemResponseSchema.parse(json)
    } catch (err) {
      if (err instanceof ApiClientError) {
        const typed = toRedemptionError(err)
        if (typed) throw typed
      }
      throw err
    }
  },

  async getMyRedemption(code: string): Promise<RedeemResponse> {
    const json = await api.get<unknown>(`/api/v1/redemption/me/${encodeURIComponent(code)}`)
    return RedeemResponseSchema.parse(json)
  },

  async listMyRedemptions(): Promise<RedemptionSummary[]> {
    const json = await api.get<unknown>('/api/v1/redemption/me')
    return z.array(RedemptionSummarySchema).parse(json)
  },
}
```

- [ ] **Step 4: Run tests, expect green**

```bash
npx jest tests/lib/api/redemption.test.ts --forceExit
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/api/redemption.ts apps/customer-app/tests/lib/api/redemption.test.ts
git commit -m "feat(api): full Zod-typed redemption client (M2 round 1)"
```

### Task B2: `formatRedemptionCode` utility

**Files:**
- Create: `apps/customer-app/src/features/voucher/utils/formatRedemptionCode.ts`
- Create: `apps/customer-app/tests/features/voucher/utils/formatRedemptionCode.test.ts`

- [ ] **Step 1: Test**

```ts
import { formatRedemptionCode } from '@/features/voucher/utils/formatRedemptionCode'

describe('formatRedemptionCode', () => {
  it('groups 10-char alphanumeric as 5+5 with single space', () => {
    expect(formatRedemptionCode('aB3xKZmLp9')).toBe('aB3xK ZmLp9')
  })
  it('returns input unchanged when length is not 10', () => {
    expect(formatRedemptionCode('short')).toBe('short')
    expect(formatRedemptionCode('TOOLONG12345')).toBe('TOOLONG12345')
  })
  it('returns empty string unchanged', () => {
    expect(formatRedemptionCode('')).toBe('')
  })
})
```

- [ ] **Step 2: Implement**

```ts
export function formatRedemptionCode(code: string): string {
  if (code.length !== 10) return code
  return `${code.slice(0, 5)} ${code.slice(5)}`
}
```

- [ ] **Step 3: Run + commit**

```bash
npx jest tests/features/voucher/utils/formatRedemptionCode.test.ts --forceExit
git add apps/customer-app/src/features/voucher/utils/formatRedemptionCode.ts apps/customer-app/tests/features/voucher/utils/formatRedemptionCode.test.ts
git commit -m "feat(voucher): formatRedemptionCode 5+5 grouping utility"
```

### Task B3: `useRedeem` mutation hook with branch-attribution-at-mutation-time

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useRedeem.ts`
- Create: `apps/customer-app/tests/features/voucher/use-redeem.test.tsx`

- [ ] **Step 1: Write the failing tests — branch-attribution contract is the headline pin**

```tsx
import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRedeem } from '@/features/voucher/hooks/useRedeem'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { redeem: jest.fn() },
  // pass through schemas for the hook's import — see implementation
}))

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useRedeem — branch-attribution contract', () => {
  beforeEach(() => { (redemptionApi.redeem as jest.Mock).mockReset() })

  it('reads branchId from getBranchId() AT MUTATION TIME (not at hook-construction)', async () => {
    let currentBranch = 'b1'
    const getBranchId = () => currentBranch
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(makeRedeemResponse({ branchId: 'b2' }))

    const { result } = renderHook(
      () => useRedeem({ voucherId: 'v1', getBranchId }),
      { wrapper: wrap }
    )

    // Mutate branch BEFORE firing redeem.
    currentBranch = 'b2'
    await act(async () => {
      await result.current.mutateAsync({ pin: '1234' })
    })

    expect(redemptionApi.redeem).toHaveBeenCalledWith({
      voucherId: 'v1', branchId: 'b2', pin: '1234',
    })
  })

  it('aborts with NULL_BRANCH error when getBranchId() returns null', async () => {
    const getBranchId = () => null
    const { result } = renderHook(
      () => useRedeem({ voucherId: 'v1', getBranchId }),
      { wrapper: wrap }
    )

    await act(async () => {
      try {
        await result.current.mutateAsync({ pin: '1234' })
      } catch (err: any) {
        expect(err.code).toBe('NULL_BRANCH')
      }
    })

    expect(redemptionApi.redeem).not.toHaveBeenCalled()
  })

  it('invalidates expected query keys on success', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(makeRedeemResponse({}))

    const { result } = renderHook(
      () => useRedeem({ voucherId: 'v1', getBranchId: () => 'b1' }),
      { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> }
    )

    await act(async () => {
      await result.current.mutateAsync({ pin: '1234' })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['voucher', 'v1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['savings'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteVouchers'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-redemptions'] })
  })
})

function makeRedeemResponse(overrides: any) {
  return {
    id: 'r1', userId: 'u1', voucherId: 'v1', branchId: 'b1',
    redemptionCode: 'aB3xKZmLp9', estimatedSaving: 4.5, isValidated: false,
    redeemedAt: '2026-05-06T12:00:00Z', ...overrides,
  }
}
```

- [ ] **Step 2: Run; expect failure**

- [ ] **Step 3: Implement**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { redemptionApi, RedeemResponse, RedemptionError } from '@/lib/api/redemption'

type UseRedeemOpts = {
  voucherId: string
  /**
   * Branch-id source READ AT MUTATION TIME — caller passes a getter so the
   * hook resolves `branchId` against the LATEST state when `mutate()` fires,
   * not against a value captured at hook-construction time. This is the
   * branch-attribution contract: see plan §11.
   */
  getBranchId: () => string | null
}

export function useRedeem({ voucherId, getBranchId }: UseRedeemOpts) {
  const qc = useQueryClient()
  return useMutation<RedeemResponse, RedemptionError | { code: 'NULL_BRANCH' }, { pin: string }>({
    mutationFn: async ({ pin }) => {
      const branchId = getBranchId()
      if (!branchId) {
        // Defensive guard — UI must reopen branch picker rather than send a
        // request with a missing branch, which would be a permanent attribution
        // bug (VoucherRedemption.branchId is immutable).
        throw { code: 'NULL_BRANCH' as const }
      }
      return redemptionApi.redeem({ voucherId, branchId, pin })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voucher', voucherId] })
      qc.invalidateQueries({ queryKey: ['savings'] })
      qc.invalidateQueries({ queryKey: ['favouriteVouchers'] })
      qc.invalidateQueries({ queryKey: ['my-redemptions'] })
    },
  })
}
```

- [ ] **Step 4: Run tests, expect green**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useRedeem.ts apps/customer-app/tests/features/voucher/use-redeem.test.tsx
git commit -m "feat(voucher): useRedeem mutation with branch-attribution-at-mutation-time"
```

### Task B4: `useRedemptionLockout` countdown hook

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useRedemptionLockout.ts`

Lightweight hook that takes `retryAfter` (seconds) and exposes `{ secondsRemaining, isLocked, mmss }` ticking every 1s, computed from an absolute deadline so app-background does not desync the countdown.

- [ ] **Step 1: Test outline**

```ts
import { renderHook, act } from '@testing-library/react-native'
import { useRedemptionLockout } from '@/features/voucher/hooks/useRedemptionLockout'

describe('useRedemptionLockout', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('returns isLocked=false when deadline is null', () => {
    const { result } = renderHook(() => useRedemptionLockout(null))
    expect(result.current.isLocked).toBe(false)
    expect(result.current.secondsRemaining).toBe(0)
  })

  it('counts down from retryAfter seconds and unlocks at zero', () => {
    const { result } = renderHook(() => useRedemptionLockout(60))
    expect(result.current.isLocked).toBe(true)
    expect(result.current.secondsRemaining).toBe(60)
    expect(result.current.mmss).toBe('01:00')

    act(() => { jest.advanceTimersByTime(30_000) })
    expect(result.current.secondsRemaining).toBe(30)
    expect(result.current.mmss).toBe('00:30')

    act(() => { jest.advanceTimersByTime(30_000) })
    expect(result.current.isLocked).toBe(false)
    expect(result.current.secondsRemaining).toBe(0)
  })
})
```

- [ ] **Step 2: Implement using a `Date.now()`-based deadline so tab-switching does not drift the timer**

```ts
import { useEffect, useState } from 'react'

export function useRedemptionLockout(retryAfterSeconds: number | null) {
  const [now, setNow] = useState(() => Date.now())
  const deadline = retryAfterSeconds == null ? null : Date.now() + retryAfterSeconds * 1000

  useEffect(() => {
    if (deadline == null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline])

  const secondsRemaining = deadline == null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))
  const isLocked = secondsRemaining > 0
  const mm = Math.floor(secondsRemaining / 60).toString().padStart(2, '0')
  const ss = (secondsRemaining % 60).toString().padStart(2, '0')
  return { secondsRemaining, isLocked, mmss: `${mm}:${ss}` }
}
```

- [ ] **Step 3: Test + commit**

### Task B5: `PinEntrySheet` component

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx`
- Create: `apps/customer-app/tests/features/voucher/pin-entry-sheet.test.tsx`

This is the largest component in M2. Steps follow strict TDD: write a failing test for each behaviour, then implement, then commit. List of behaviours pinned by tests:

- [ ] Renders 4 digit boxes when `visible=true`; nothing when `visible=false`.
- [ ] Calls `onSubmit('1234')` when 4 digits entered (auto-submit on the 4th digit; `submittedRef` guard prevents double-fire).
- [ ] Submit button disabled until `digits.length === 4` AND not loading AND not locked.
- [ ] On `error.code === 'INVALID_PIN'` shows "Wrong PIN · X attempts remaining" pulled from `error.remainingAttempts`; clears digits after a 400ms shake animation.
- [ ] On `error.code === 'PIN_RATE_LIMIT_EXCEEDED'` shows lockout card with mm:ss countdown derived from `error.retryAfter`; input disabled; submit deeply disabled.
- [ ] On `AppState` change to `background`, clears digits.
- [ ] On unmount, clears digits.
- [ ] Never logs PIN to console / analytics — verified via spy on `console.log` / `console.warn` / `console.error` during the full flow.

(Each becomes its own ~5-step task: failing test → implementation → verify → commit. Implementation reuses the reference-branch shake animation `withSequence(withTiming(6,50), ..., withTiming(0,50))`.)

### Task B6: `BranchPickerSheet` (voucher-scoped)

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/BranchPickerSheet.tsx`
- Create: `apps/customer-app/tests/features/voucher/branch-picker-sheet-voucher.test.tsx`

Different exit semantics from `features/merchant/components/BranchPickerSheet`. Voucher version:

- Props: `{ visible, branches, selectedBranchId, onConfirm(branchId), onDismiss }`.
- Renders branch list with name + city + distance.
- Tap row → highlights as preview (does NOT yet commit).
- "Confirm" CTA at bottom → fires `onConfirm(previewBranchId)` then closes.
- "Cancel" or backdrop tap → `onDismiss()`.
- Single-branch merchants — picker SHOULD NOT OPEN. Caller short-circuits and goes straight to PinEntrySheet.

Tests pin: list rendering, preview-highlight-on-tap, confirm fires `onConfirm`, dismiss does NOT fire `onConfirm`, accessibility labels.

### Task B7: `SuccessPopup` component

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx`
- Create: `apps/customer-app/tests/features/voucher/success-popup.test.tsx`

Behaviours pinned:
- Renders only when `visible=true`.
- Code text uses `formatRedemptionCode` (shows "aB3xK ZmLp9" for `aB3xKZmLp9`).
- Voucher strip surfaces type colour from `color.voucher.byType[voucherType]`.
- Three CTAs (`success-show-to-staff`, `success-rate-review`, `success-done`) fire correct callbacks.
- Spring entry + checkmark bounce + confetti animations DO NOT block the user from tapping CTAs (interactivity not gated on animation completion).
- Persists across `useFocusEffect` blur/focus cycles — i.e. if user backgrounds the app, the popup is still mounted with the same redemption code on return. (Test: simulate blur via mock useFocusEffect cleanup, assert testID still present.)

### Task B8: `RedemptionDetailsCard` (state-3 surface, NON-QR)

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx`
- Create: `apps/customer-app/tests/features/voucher/redemption-details-card.test.tsx`

Renders for `redeemed-this-cycle` state:
- Voucher strip (same shape as SuccessPopup's).
- `formatRedemptionCode(code)` prominent.
- "Redeemed at <branchName> · <date> at <time>" line.
- Disabled "Show to Staff" button with tooltip "Available in next milestone" or similar — M2 stub.
- "Voucher used" banner / badge consistent with the M1 `redeem-cta-redeemed` CTA copy.

NOTE: This is the M2 floor for state-3. The locked spec §8 visual ("voucher used" green badge, washed-out coupon, full QR card) is M3. Owner-approved that M2 ships the basic version so users aren't stranded.

### Task B9: Wire `VoucherDetailScreen` state machine to redemption flow

**Files:**
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`

- [ ] **Step 1: Add four new state values to the screen orchestrator**

```ts
const [pickerVisible, setPickerVisible] = useState(false)
const [pinSheetVisible, setPinSheetVisible] = useState(false)
const [successPopup, setSuccessPopup] = useState<RedeemResponse | null>(null)
// Picker-confirmed branch id is a LOCAL/REF source that takes priority over
// the URL `branchIdParam` and `selectedBranch?.id` for the picker-confirm →
// PIN handoff window. After the picker confirms B2, `select(B2)` fires
// router.replace, but the URL/merchant-query may not synchronously reflect
// B2 in the same render — and the user can submit PIN immediately. The local
// source guarantees that submit reads B2, not stale B1.
const [pickerConfirmedBranchId, setPickerConfirmedBranchId] = useState<string | null>(null)

// Clear the local source once URL catches up. After this clear, getBranchId
// falls back to URL + selectedBranch (which by now also reflect the new branch).
useEffect(() => {
  if (pickerConfirmedBranchId == null) return
  if (branchIdParam === pickerConfirmedBranchId) {
    setPickerConfirmedBranchId(null)
  }
}, [branchIdParam, pickerConfirmedBranchId])
```

- [ ] **Step 2: Modify `handleCTA` to branch on `stateKey`**

```ts
const handleCTA = useCallback(() => {
  if (stateKey === 'free-user') {
    router.push(buildSubscriptionUrl('monthly') as never)
    return
  }
  if (stateKey === 'can-redeem' || stateKey === 'time-limited-available' || stateKey === 'time-limited-urgent') {
    if (isMultiBranch) {
      setPickerVisible(true)
    } else {
      setPinSheetVisible(true)
    }
    return
  }
  // Other states — disabled CTA, no handler.
}, [stateKey, router, buildSubscriptionUrl, isMultiBranch])
```

- [ ] **Step 3: Wire BranchPickerSheet → PinEntrySheet**

```tsx
<BranchPickerSheet
  visible={pickerVisible}
  branches={merchant?.branches ?? []}
  selectedBranchId={selectedBranch?.id ?? null}
  onConfirm={(branchId) => {
    // Set local source FIRST (synchronous, ref-like). Subsequent `select()`
    // fires router.replace; the local source bridges the render gap until the
    // URL catches up, then the useEffect above clears the local.
    setPickerConfirmedBranchId(branchId)
    select(branchId)        // updates URL ?branch=<id>; merchant query refetches
    setPickerVisible(false)
    setPinSheetVisible(true)
  }}
  onDismiss={() => setPickerVisible(false)}
/>
```

- [ ] **Step 4: Wire PinEntrySheet → useRedeem → SuccessPopup**

```tsx
const redeem = useRedeem({
  voucherId: voucher?.id ?? '',
  // Three-tier branch source priority — read AT MUTATION TIME:
  //   1. pickerConfirmedBranchId — local/ref state, synchronous after picker
  //      confirmation; bridges the render gap before URL/merchant catch up.
  //   2. branchIdParam — URL `?branch=<id>` from useLocalSearchParams.
  //      Authoritative once router.replace has propagated.
  //   3. merchant.selectedBranch?.id — server-resolved branch fallback for
  //      cold-open (URL has no branch param yet, before reconcile fires).
  getBranchId: () =>
    pickerConfirmedBranchId
    ?? branchIdParam
    ?? merchant?.selectedBranch?.id
    ?? null,
})

<PinEntrySheet
  visible={pinSheetVisible}
  merchantName={merchant?.businessName ?? ''}
  branchName={branchName}
  isLoading={redeem.isPending}
  error={redeem.error}
  onSubmit={async (pin) => {
    try {
      const result = await redeem.mutateAsync({ pin })
      setPinSheetVisible(false)
      setSuccessPopup(result)
    } catch (err: any) {
      // Branch-specific error handling — NULL_BRANCH reopens the picker.
      if (err?.code === 'NULL_BRANCH') {
        setPinSheetVisible(false)
        setPickerVisible(true)
      }
      // ALREADY_REDEEMED — close sheet, voucher refetch will route to state-3.
      if (err?.code === 'ALREADY_REDEEMED') {
        setPinSheetVisible(false)
      }
      // Other errors stay on the sheet for the user to see.
    }
  }}
  onDismiss={() => setPinSheetVisible(false)}
/>

<SuccessPopup
  visible={successPopup != null}
  redemption={successPopup}
  voucher={voucher}
  branchName={branchName}
  onShowToStaff={() => {/* M3 stub — no-op */}}
  onRateReview={() => {/* deferred — no-op or routes to review */}}
  onDone={() => setSuccessPopup(null)}
/>
```

- [ ] **Step 5: Render RedemptionDetailsCard for `redeemed-this-cycle` state**

Replace the current "Already Redeemed This Cycle" disabled CTA's surrounding body with the RedemptionDetailsCard. The CTA stays disabled with the same testID `redeem-cta-redeemed` (M1 contract preserved); the card sits above it.

- [ ] **Step 6: Tests** — all integration tests in Task B10 cover this wiring.

### Task B10: Integration tests — happy-path flow + state-3 return-visit + error handling + branch-attribution

**Files:**
- Create: `apps/customer-app/tests/features/voucher/voucher-detail-redeem-flow.test.tsx`
- Create: `apps/customer-app/tests/features/voucher/voucher-detail-state-3-return-visit.test.tsx`
- Create: `apps/customer-app/tests/features/voucher/redemption-error-handling.test.tsx`
- Create: `apps/customer-app/tests/features/voucher/branch-attribution-redemption.test.tsx`

Test plan in detail:

**`voucher-detail-redeem-flow.test.tsx`:**
- Multi-branch can-redeem: tap CTA → picker opens → confirm B2 → URL updates → PinEntrySheet opens → submit "1234" → mock backend returns success → SuccessPopup appears → tap Done → state-3 surface visible.
- Single-branch can-redeem: tap CTA → picker SKIPPED → PinEntrySheet opens directly → submit → SuccessPopup → done → state-3.

**`voucher-detail-state-3-return-visit.test.tsx`:**
- Set `voucher.isRedeemedThisCycle = true` in fixture.
- Render screen → assert `redeem-cta-redeemed` (disabled) AND RedemptionDetailsCard visible with code/branch/redeemedAt.
- Assert NO PinEntrySheet, NO BranchPickerSheet, NO SuccessPopup mounted.

**`redemption-error-handling.test.tsx`:**
- For each error code, assert the UX:
  - `INVALID_PIN` (mock backend) → PinEntrySheet stays visible, shake animation fires (testID `pin-shake-active`), digits cleared, "Wrong PIN · 4 attempts remaining" copy with the value from `error.remainingAttempts`.
  - `PIN_RATE_LIMIT_EXCEEDED` → lockout card visible with mm:ss countdown computed from `error.retryAfter`, input disabled, submit deeply disabled.
  - `ALREADY_REDEEMED` → PinEntrySheet closes, voucher refetch happens (mock asserts), state-3 surface appears.
  - `SUBSCRIPTION_REQUIRED` → PinEntrySheet closes, navigates to `/(auth)/subscription-prompt?...` (this state should not normally reach M2 because state machine routes free users elsewhere, but test the defensive path).
  - `PHONE_NOT_VERIFIED` → PinEntrySheet shows error message + CTA to phone-verification flow.
  - `VOUCHER_NOT_FOUND` → PinEntrySheet closes, error toast + voucher refetch.
  - `BRANCH_MERCHANT_MISMATCH` → PinEntrySheet closes, picker reopens.
  - `PIN_NOT_CONFIGURED` → PinEntrySheet closes, error toast advising contact merchant.
  - `NULL_BRANCH` (client-side) → PinEntrySheet closes, picker reopens.

**`branch-attribution-redemption.test.tsx`:** the contract pins promised by the audit:
- `useRedeem.mutate({ pin })` calls `redemptionApi.redeem` with `branchId = merchant.selectedBranch.id` at the mutation moment.
- After branch picker confirms B2, BEFORE merchant query refetches with new branch, mutate from PinEntrySheet — assert request used B2 (the URL-driven `select()` writes synchronously; `getBranchId` reads from `merchant.selectedBranch.id` which depends on refetch but `useBranchSelection().branchId` updated synchronously — verify via test).
  - This is subtle. The branch picker calls `select(B2)` which calls `router.replace`. The merchant query re-runs with B2. `useRedeem`'s `getBranchId` reads `merchant?.selectedBranch?.id`. If user submits PIN BEFORE refetch lands, `selectedBranch.id` is still B1 (keepPreviousData) — exactly the §O7 race we already fixed for the OUTBOUND URL.
  - DECISION: `getBranchId` should read from the URL (`useBranchSelection().branchId`) FIRST, falling back to `selectedBranch?.id` only on cold-open. SAME pattern as §O7 + PR #41. Pin this in the test.
- Branch switch mid-PIN-entry: open PinEntrySheet for B1 → user backgrounds → user changes branch via picker to B2 (some other surface) → resumes PinEntrySheet → submits → `useRedeem` reads NEW branch B2, not stale B1.
- PIN failure at branch A does not affect retry at branch B (rate-limit per `(userId, branchId)`).
- Already-redeemed at branch A: render screen with `?branch=B1` → RedemptionDetailsCard. Switch to `?branch=B2` → STILL RedemptionDetailsCard (not unlocked). Cycle eligibility is branch-independent.

### Task B11: Pin the three-tier branch-source priority via dedicated regression test

The three-tier `getBranchId` priority (`pickerConfirmedBranchId → branchIdParam → selectedBranch?.id`) was already wired in Task B9. This task adds an isolated regression test that pins each tier of the priority hierarchy individually so a future refactor can't silently collapse the order.

**Files:**
- Create: `apps/customer-app/tests/features/voucher/voucher-detail-branch-source-priority.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
describe('VoucherDetailScreen — three-tier branch-source priority for redeem mutation', () => {
  beforeEach(() => {
    ;(redemptionApi.redeem as jest.Mock).mockReset()
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(makeRedeemResponse())
  })

  // TIER 1 — picker-confirmed local state wins over URL + selectedBranch.
  it('picker confirms B2 + URL still B1 + selectedBranch still B1 → submit sends B2', async () => {
    mockParams = { id: 'v1', branch: 'b1', from: 'merchant', returnMerchantId: 'm1', tab: 'vouchers' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({ selectedBranchId: 'b1', branches: [b1, b2] })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))                  // open picker
    fireEvent.press(getByTestId('branch-picker-row-b2'))               // select B2
    fireEvent.press(getByTestId('branch-picker-confirm'))              // confirm — sets local source synchronously

    // PinEntrySheet opens immediately — URL hasn't propagated yet, mock
    // merchant cache hasn't refetched.
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')

    await waitFor(() => {
      expect(redemptionApi.redeem).toHaveBeenCalledWith({
        voucherId: 'v1', branchId: 'b2', pin: '1234',     // ← B2 from picker-local source
      })
    })
  })

  // TIER 2 — URL wins when no picker confirmation in progress.
  it('URL B2 + selectedBranch still B1 (refetch in flight) → submit sends B2', async () => {
    mockParams = { id: 'v1', branch: 'b2', from: 'merchant', returnMerchantId: 'm1', tab: 'vouchers' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({ selectedBranchId: 'b1', branches: [b1, b2] })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    // single-branch path or picker auto-skip — assume single-branch path
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')

    await waitFor(() => {
      expect(redemptionApi.redeem).toHaveBeenCalledWith({
        voucherId: 'v1', branchId: 'b2', pin: '1234',     // ← B2 from URL
      })
    })
  })

  // TIER 3 — selectedBranch fallback on cold-open (no URL branch).
  it('no URL branch + selectedBranch B1 (cold-open via deep link) → submit sends B1', async () => {
    mockParams = { id: 'v1', from: 'merchant', returnMerchantId: 'm1', tab: 'vouchers' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({ selectedBranchId: 'b1', branches: [b1] })

    const { getByTestId } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')

    await waitFor(() => {
      expect(redemptionApi.redeem).toHaveBeenCalledWith({
        voucherId: 'v1', branchId: 'b1', pin: '1234',     // ← B1 from selectedBranch fallback
      })
    })
  })

  // CLEAR — local source clears once URL catches up; subsequent submits use URL.
  it('after URL catches up to picker confirmation, the local source is cleared', async () => {
    // Render once with URL B1 + picker confirms B2 + URL stays B1 → mutation sends B2 (local).
    // Then simulate URL update to B2 → useEffect clears local → next mutation reads URL.
    mockParams = { id: 'v1', branch: 'b1', from: 'merchant', returnMerchantId: 'm1', tab: 'vouchers' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({ selectedBranchId: 'b1', branches: [b1, b2] })

    const { getByTestId, rerender } = wrap(<VoucherDetailScreen />)
    fireEvent.press(getByTestId('redeem-cta-active'))
    fireEvent.press(getByTestId('branch-picker-row-b2'))
    fireEvent.press(getByTestId('branch-picker-confirm'))

    // Now simulate the URL catching up.
    mockParams = { id: 'v1', branch: 'b2', from: 'merchant', returnMerchantId: 'm1', tab: 'vouchers' }
    ;(globalThis as any).__voucherProfileMock__.data = makeMerchant({ selectedBranchId: 'b2', branches: [b1, b2] })
    rerender(wrap(<VoucherDetailScreen />).children)

    // Subsequent re-render should clear the local source via useEffect.
    // (Asserting a second mutation here would re-trigger picker; this test
    // documents the clearing intent. Full lifecycle covered by the integration
    // tests in B10.)
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
cd apps/customer-app
npx jest tests/features/voucher/voucher-detail-branch-source-priority.test.tsx --forceExit
git add apps/customer-app/tests/features/voucher/voucher-detail-branch-source-priority.test.tsx
git commit -m "test(voucher): pin three-tier branch-source priority for redeem mutation"
```

### Task B12: M1 contract preservation tests — must not regress

**Files:**
- Run existing tests; do not modify.

- [ ] **Step 1: Run full voucher + merchant + subscribe suites.**

```bash
cd apps/customer-app
npx jest tests/features/voucher tests/features/merchant tests/features/subscribe.test.tsx --forceExit
```

Expected: all 371+ existing tests pass, plus the new M2 tests.

- [ ] **Step 2: Visual smoke pass on the M1 contracts** — these MUST still work end-to-end:

  - Free-user state still routes to `/(auth)/subscription-prompt` via the M1 conversion flow.
  - SubscriptionPromptModal still delays 800ms on entry; "Maybe later" still dismisses; tap-out still dismisses; `?suppressSubscribePrompt=1` still suppresses on return.
  - Voucher-origin `Continue with Free Account` still returns to the exact voucher with the suppression flag.
  - `MerchantProfileScreen.handleVoucherPress` still uses the URL-first branch source (§O7).
  - `VoucherDetailScreen.buildSubscriptionUrl` still uses the URL-first branch source (PR #41).

- [ ] **Step 3: tsc.**

```bash
npx tsc --noEmit -p tsconfig.json
```

### Task B13: Open the Section B PR

- [ ] **Step 1: Push + open PR.**

```bash
git push -u origin feature/voucher-detail-m2
gh pr create --base main --title "feat(voucher): M2 — PIN entry + redemption mutation + success popup + state-3 surface" --body "<see plan §B>"
```

- [ ] **Step 2: PAUSE FOR OWNER QA + REVIEW + MERGE before starting M3.**

---

## Self-review

### 1. Spec coverage

- §5 PIN entry — Tasks B5 (component) + B10 (error handling tests).
- §6 Success popup — Task B7 + B10.
- §7 Show-to-Staff — DEFERRED to M3 (basic stub in B8).
- §8 Already-redeemed full visual — DEFERRED to M3 (basic version in B8).
- §9 Post-redemption automations (favourite removal) — DEFERRED per owner direction §10.4.
- §10 Backend interactions — Section A defines all error responses; Task B1 wraps them in Zod; Task B10 maps each to UX.
- §11 Edge cases & guards — Section A guard reorder + B10 error tests cover every code; abuse-prevention checklist in audit cross-referenced.
- Plan §11 branch attribution — Tasks B3 (mutation-time getter) + B11 (URL-first source) + B10 (4-pin test file).
- Plan §4 subscription cycle — Section A guard 5 enforces; B10 already-redeemed branch-independent test pins client behaviour.

Owner §10 decisions:

- Decision 1 (backend additives) — Section A Tasks A1, A3, A5.
- Decision 2 (voucher-scoped picker) — Task B6.
- Decision 3 (basic RedemptionDetailsCard for M2) — Task B8.
- Decision 4 (favourite auto-removal deferred) — out of scope, noted.
- Decision 5 (Tier 2 plan workflow) — this document.

### 2. Placeholder scan

No "TBD", no "TODO" anywhere in the implementation steps. Task B5 PinEntrySheet is described by behaviours rather than full code because the implementation is mechanical given the reference-branch shape — but every behaviour is explicit and individually testable. Pre-implementation, this is acceptable for a Tier 2 plan; the implementer should cite the reference branch shape (`apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx` on `feature/customer-app`) when needed.

### 3. Type / naming consistency

- `getBranchId: () => string | null` — used consistently in B3 hook signature and B9 wiring.
- `RedemptionError` discriminated union — used consistently in B1 schemas, B5 PinEntrySheet error mapping, B10 tests.
- `formatRedemptionCode` — used in B7 SuccessPopup and B8 RedemptionDetailsCard.

### 4. Sequencing

- Section A MUST land before Section B starts. Frontend tests assume the new error-payload fields exist in the response.
- Within Section B, B1 (API client) → B2 (utility) → B3 (hook) → B4 (lockout hook) → B5/B6/B7/B8 (components in any order, but ideally B5 + B6 + B7 in parallel) → B9 (screen wiring) → B10 (integration tests) → B11 (URL-first branch source surfaced by B10) → B12 (regression) → B13 (PR).

### 5. Open items requiring owner direction at PR-time

- **`PHONE_NOT_VERIFIED` UX.** Spec doesn't specify. Plan assumes "show error message + CTA to phone-verification flow." Confirm during B10 implementation; if owner wants different UX, surface as a 1-round revision.
- **`Show-to-Staff` button stub copy in M2.** Plan assumes "Available in next milestone." If owner wants different copy or full deferral to M3 (no button at all in M2), call out at B8 implementation time.
- **Real-Postgres concurrency test environment.** Task A5's race test needs real Postgres atomicity. If the project's existing `vitest` setup uses a mocked Prisma client, the test will skip with a clear reason and surface a CI gap to address before merge. Owner direction: either point me at the existing real-Postgres harness, or accept the skip + a manual race verification recipe in the PR description. Plan assumes the project test setup supports real Postgres (Neon dev DB) given the dev seed scripts already do; will confirm at A5 implementation time.

---

## Amendments — locked 2026-05-06 in response to owner review

This plan was revised after the initial draft. Changes from the previous version:

1. **Atomic-write race** moved from "deferred follow-up" to **bundled into Section A** as Task A5. Conditional `updateMany` + create-on-conflict pattern; no schema migration. Concurrency test pinned.
2. **`AppError` constructor** kept as `(code, details?)` — **backward-compatible** with existing `new AppError(code)` callsites. `statusCode` and `message` continue to flow from `ERROR_DEFINITIONS`. Task A1 implements; tests pin both shapes.
3. **`ApiClientError`** extended with optional `details?: Record<string, unknown>` in **Task B1a**. `doFetch` populates `details` from non-standard envelope fields (`remainingAttempts`, `retryAfter`, future). Backward-compatible.
4. **`redemptionApi`** uses `api.post/get` from `lib/api.ts`, NOT raw `fetch`. On `ApiClientError`, reconstructs envelope and parses against discriminated-union schema; throws typed `RedemptionError`.
5. **Three-tier branch-source priority**: `pickerConfirmedBranchId` (local/ref state set synchronously by picker confirm) → URL `branchIdParam` → `selectedBranch?.id` (cold-open fallback). Local source clears via `useEffect` when URL catches up. Picker-confirm → immediate-PIN regression test in **Task B11**.
6. **No failing-test commits on the published branch.** Each task is a single green commit. Internal TDD allowed; intermediate WIP squashed before push. Section A Task A6 explicitly verifies via `git log --oneline main..HEAD` and offers `git rebase -i main` as the squash recipe.

### Final amendment 2026-05-06 — two more eligibility guards before PIN compare

7. **Expired voucher guard** added to Task A2 as step 2 of the safe order. After fetching the voucher and confirming it's `ACTIVE` + `APPROVED` + merchant `ACTIVE`, server now also rejects vouchers where `voucher.expiryDate <= now`. Reuses `VOUCHER_NOT_FOUND` (existing code, owner direction — no new error code introduced; collapses with inactive/unapproved so attackers can't distinguish "doesn't exist" from "expired"). Three tests added to the threat-model regression file:
   - expired voucher + wrong PIN → `VOUCHER_NOT_FOUND`, not `INVALID_PIN`
   - expired voucher + wrong PIN does not increment the PIN fail counter
   - expired voucher cannot create `VoucherRedemption` even with correct PIN

8. **Inactive branch guard** added to Task A2 as step 3 of the safe order. Branch fetch now also requires `branch.isActive === true`. Reuses `BRANCH_UNAVAILABLE` (existing code at [`src/api/shared/errors.ts:33`](src/api/shared/errors.ts#L33), message: "This branch is no longer available."). Both "no such branch" and "branch deactivated" collapse under this code so neither state is distinguishable. Three tests added:
   - inactive branch + wrong PIN → `BRANCH_UNAVAILABLE`, not `INVALID_PIN`
   - inactive branch + wrong PIN does not increment the PIN fail counter
   - inactive branch cannot create `VoucherRedemption` even with correct PIN

Both guards run before PIN compare as part of the PIN-oracle defense — a leaked PIN must not be redeemable against an expired voucher or a branch the merchant has deactivated.

Final safe-order step count: **12 steps** (was 10; expired-voucher + isActive added at positions 2 and 3, with branch-merchant coherence pushed to position 5).

---

End of plan. **Section A approved to start** — branch creation + plan-doc commit + Tasks A1–A6 follow.
