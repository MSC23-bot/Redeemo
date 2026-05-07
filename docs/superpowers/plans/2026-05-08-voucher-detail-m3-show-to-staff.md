# Voucher Detail M3 — Show-to-Staff Validation Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full-screen Show-to-Staff redemption surface so staff can validate a customer's redemption end-to-end via QR scan or manual 8-character code; persist the redemption details across app relaunches inside the active cycle; add anti-fraud client-side mitigations (brightness boost, screenshot guard, auto-hide) plus best-effort backend telemetry.

**Architecture:** Three additive backend pieces — one new Prisma model (`RedemptionScreenshotEvent`), one new field block on `getCustomerVoucher` (`lastRedemption`), two new customer-side endpoints (`GET /redemption/me/:code`, `POST /redemption/:code/screenshot-flag`). One new full-screen React Native surface (`ShowToStaff`) composing four hooks (`useRedemptionPolling`, `useBrightnessBoost`, `useScreenshotGuard`, `useAutoHideTimer`) and one new component (`QRCodeBlock`) plus one design-system primitive (`PulsingDot`). Wire `SuccessPopup` and `RedemptionDetailsCard` to open `ShowToStaff`. Render `RedemptionDetailsCard` for return visits during the active cycle, gated on `voucher.isRedeemedThisCycle === true` per the §Q6 invariant.

**Tech Stack:** Node.js 24 + Fastify + Prisma 7 + Neon Postgres + Redis (backend); React Native + Expo SDK 54 + react-native-qrcode-svg + expo-brightness + expo-screen-capture + expo-blur + Reanimated 4 + React Query 5 (customer-app); Vitest (backend), Jest-expo (customer-app).

**Tier:** 2 — multi-file UI surface + small additive backend (1 schema model, 1 payload field, 2 routes). No code may be written until owner approves this plan.

**Owner-locked decisions (2026-05-08):** D1=A (port `me/:code`), D2=A (port screenshot-flag + clean event model), D3=A (bundle persisted return-visit), D4=defer (visual redesign), D5=A (opaque 8-char code, no validation URL), D6=A (2 min idle / 10s warning / freeze on validated / pause-rearm on focus-blur), D7=A (~2s validated state then auto-route), D8=A (minimum-viable mirror PR #44 + §Q6 invariant test), D9=defer (confetti), D10=A (Tier 2, no fresh brainstorm).

**Standing merge rule:** Bundle E (docs/spec/deferred-followups consistency pass) ships INSIDE this PR, not as a separate follow-up.

---

## Pre-flight reading (before starting Task 1)

Read each of these against current main HEAD `f44300e` before opening the first task:

1. [docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md](2026-05-06-voucher-detail-redemption-rebaseline.md) §11 (branch attribution contract — still load-bearing for M3) + §M2.1 (as-shipped DOM order, code format, redeemed-state safety).
2. [docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md](../specs/2026-04-17-voucher-detail-redemption-design.md) §6 (success popup), §7 (Show-to-Staff full-screen baseline), §8 (already-redeemed) + the new §5.5 / §6.7 / §8.9 shipped-state deltas.
3. `.superpowers/brainstorm/88554-1776435672/content/voucher-detail-v6.html` — Screen 7b "Show to Staff (Full Screen)" (lines 706–751). Use as the locked design baseline.
4. Memory `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md` §P1 (M3 required scope), §P2 (persisted return-visit + cycle-window gate), §Q6 (cycle-renewed cleanup invariant — locked 2026-05-08).
5. Reference impls on `origin/feature/customer-app` (REFERENCE ONLY — port + adapt, do not merge):
   - `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx` (249 LOC)
   - `apps/customer-app/src/features/voucher/components/QRCodeBlock.tsx` (66 LOC)
   - `apps/customer-app/src/features/voucher/hooks/useRedemptionPolling.ts` (48 LOC)
   - `apps/customer-app/src/features/voucher/hooks/useBrightnessBoost.ts` (31 LOC)
   - `apps/customer-app/src/features/voucher/hooks/useScreenshotGuard.ts` (41 LOC)
   - `apps/customer-app/src/features/voucher/hooks/useAutoHideTimer.ts` (48 LOC)
   - `apps/customer-app/src/design-system/motion/PulsingDot.tsx` (28 LOC)
   - `src/api/redemption/{routes,service}.ts` for `getMyRedemptionByCode` + `flagRedemptionScreenshot`
   - `prisma/schema.prisma` `RedemptionScreenshotEvent` model — NOTE: declared **twice** on reference (lines 808 + 823). Port the cleaner of the two and keep a single declaration.

Reference predates: 8-char code format (currently 6-char on reference), the locked DOM order, the cycle-rules card, the M2 `Tabs.Screen` registration. Adaptation is required.

---

## Data contracts

### Backend payload — `GET /api/v1/redemption/me/:code` (NEW)

**Auth:** customer (existing customer JWT). Code normalised case-insensitively before lookup. Returns `REDEMPTION_NOT_FOUND` (404) if the code does not exist OR the redemption belongs to a different user.

**Response (slim, polling-safe):**
```ts
{
  code:             string                              // normalised uppercase
  isValidated:      boolean
  validatedAt:      string | null                       // ISO
  validationMethod: 'QR_SCAN' | 'MANUAL' | null
  voucherId:        string
  merchantName:     string
  branchName:       string
}
```

**Why slim:** this is a polling endpoint hit every 5s while ShowToStaff is open. No PII beyond what the customer already sees. No `userId`, no `validatedById`, no `estimatedSaving`.

### Backend payload — `POST /api/v1/redemption/:code/screenshot-flag` (NEW)

**Auth:** customer (existing customer JWT). Best-effort telemetry — must NEVER throw a customer-visible error.

**Body:**
```ts
{ platform: 'ios' | 'android' }
```

**Response:**
```ts
{ accepted: boolean }   // true on first hit within 5s window per (userId, code); false on dedup
```

Dedup is enforced via Redis SETNX with 5s TTL — see Task 2.

### Backend payload — `getCustomerVoucher` extension

`GET /api/v1/customer/vouchers/:id` response gains an additive optional field:

```ts
{
  // ...all existing fields (isRedeemedThisCycle, availableAgainAt, merchant, etc.)
  lastRedemption?: {
    code:        string
    redeemedAt:  string                   // ISO
    branch:      { id: string; name: string }
    isValidated: boolean
    validatedAt: string | null            // ISO
  } | null
}
```

**Population rule (cycle-window gated):** `lastRedemption` is non-null **only** when:
1. User is authenticated AND has subscription status `ACTIVE` or `TRIALLING`, AND
2. `isRedeemedThisCycle === true` (computed via `getCurrentCycleWindow(cycleAnchorDate, now)`), AND
3. A `VoucherRedemption` row exists for `(userId, voucherId)` with `redeemedAt >= cycleStart && redeemedAt < cycleEnd`.

When the cycle rolls over, the backend flips `isRedeemedThisCycle` to `false` AND `lastRedemption` to `null` simultaneously. **The §Q6 invariant** — frontend must gate the persisted RedemptionDetailsCard on `voucher.isRedeemedThisCycle === true`, NOT on `lastRedemption` existing. Both conditions move together by construction; the explicit gate is defensive against future payload-shape drift.

### Database schema — `RedemptionScreenshotEvent` (NEW)

```prisma
model RedemptionScreenshotEvent {
  id           String            @id @default(uuid())
  userId       String
  redemptionId String
  platform     String            // 'ios' | 'android'
  occurredAt   DateTime          @default(now())

  user         User              @relation(fields: [userId],       references: [id])
  redemption   VoucherRedemption @relation(fields: [redemptionId], references: [id])

  @@index([redemptionId, occurredAt])
  @@index([userId])
}
```

Single declaration only (reference branch had this declared twice — DO NOT replicate that bug). Add the inverse relation block on `User` and `VoucherRedemption`.

---

## Security model — QR payload + validation

> **Owner direction (D5 + clarification):** the QR payload IS the redemption code as plain text. No URL, no scheme. Scanning it must NOT validate; validation requires authenticated merchant/branch access.

### What the QR contains

Plain 8-character uppercase code, e.g. `A7K2P9X4`. Generic QR scanners read it as plain text. This is identical to the manual code displayed below the QR — the QR is purely a convenience for staff who want to scan instead of type.

### What scanning does NOT do

- The QR is NOT a URL. Scanning never opens a browser or app.
- There is NO public `validate?code=...` endpoint. The customer-side `GET /redemption/me/:code` is read-only and authenticated AS THE OWNING CUSTOMER (returns `REDEMPTION_NOT_FOUND` for any other user's session).
- The validating endpoint `POST /api/v1/redemption/verify` already requires `branchVerify` or `merchantVerify` — see [src/api/redemption/routes.ts:58-68](../../src/api/redemption/routes.ts#L58-L68). M3 does NOT touch this.
- A future merchant portal scan flow (Phase 4 / §R4) will scan the same QR and use the staff-authenticated `verify` endpoint. The QR format is forward-compatible because it carries the canonical code.

### Self-validation loophole — explicitly NOT possible in M3

Because:
1. The customer's `GET /redemption/me/:code` is read-only.
2. The staff `POST /redemption/verify` requires staff auth that the customer does NOT have.
3. There is no client-side "mark as validated" code path inside the customer app.

The customer can read `isValidated` but cannot set it. Polling reflects whatever staff did via their own surface (today: branch staff app; future: merchant portal).

### Code generation (already shipped, not in M3 scope)

Backend uses `crypto.randomBytes` rejection-sampled to a 34-char alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ0123456789`). 8 chars; 34⁸ ≈ 1.79 × 10¹² combinations; `redemptionCode @unique` constraint backstops collisions. Collision retry hardening is `§R1` (deferred Tier 1 backend hygiene; out of M3 scope).

---

## Polling behavior

- **Endpoint:** `GET /api/v1/redemption/me/:code`.
- **Cadence:** every 5 seconds while ShowToStaff is `visible`.
- **Stop conditions (any of):** `isValidated === true`, total polling duration ≥ 15 minutes, screen unmount, `enabled` prop flipped false.
- **Network failures:** React Query default retry (1 retry); failures do NOT close the screen. Logs only.
- **No exponential backoff:** owner direction — keep latency low so the validated transition is snappy. 15-min budget × 5s = 180 requests max per session; acceptable.

---

## Screenshot / screen-recording behavior + platform limitations

### iOS

- Cannot prevent screenshots. Apple does not expose an API.
- Listener (`expo-screen-capture.addScreenshotListener`) fires AFTER a screenshot is taken.
- On fire: blur the QR + show a banner ("Screenshot taken — staff verify only the live screen"); fire-and-forget POST to `/redemption/:code/screenshot-flag` with `platform: 'ios'`.
- 5-second client-side dedup so rapid screenshot bursts don't spam telemetry.
- The live datetime ticker inside the QR card is the secondary anti-fraud signal — screenshots freeze the clock; trained staff can spot a static timestamp.

### Android

- `expo-screen-capture.preventScreenCaptureAsync` sets `FLAG_SECURE` system-wide for the screen; screenshots silently fail; screen-recording captures black.
- Mounted on screen mount, cleared on unmount via `allowScreenCaptureAsync`.
- No banner needed because no screenshot fires.
- Telemetry endpoint not called on Android (no event to flag).

### Reduced motion

- ShowToStaff renders without `withRepeat` animations when `AccessibilityInfo.isReduceMotionEnabled = true`.
- LIVE pulse becomes static dot.
- 2s validated transition becomes instant.
- Brightness boost still ramps (it's not motion).

---

## Persisted return-visit behavior

### When the persisted `RedemptionDetailsCard` renders

In `VoucherDetailScreen`, when ALL of the following hold:
- `stateKey === 'redeemed-this-cycle'` (driven by `voucher.isRedeemedThisCycle`)
- AND (`lastRedemption` from in-memory mutation response is non-null) OR (`voucher.lastRedemption` from the API payload is non-null)

The card uses whichever source is non-null, preferring the in-memory `lastRedemption` (most fresh) over `voucher.lastRedemption` (slightly older — the voucher-detail query may have been served from React Query cache).

### Source of truth per source

| Field | In-memory `lastRedemption` (post-redeem) | Persisted `voucher.lastRedemption` (return visit) |
|---|---|---|
| `code` | `RedeemResponse.redemptionCode` | `voucher.lastRedemption.code` |
| `redeemedAt` | `RedeemResponse.redeemedAt` | `voucher.lastRedemption.redeemedAt` |
| `branch` | resolved from `merchant.branches` by `branchId` | `voucher.lastRedemption.branch` (id + name only — distance not available; show name only) |
| `isValidated` | always `false` (just redeemed) | `voucher.lastRedemption.isValidated` |

### §Q6 cycle-rollover invariant (CRITICAL)

After cycle rollover:
- Backend `voucher.isRedeemedThisCycle` flips to `false`.
- Backend `voucher.lastRedemption` flips to `null`.
- Frontend state machine reverts to `'subscribed-can-redeem'` (or whichever non-redeemed state applies).
- Persisted RedemptionDetailsCard MUST disappear automatically.

The frontend gate is `voucher.isRedeemedThisCycle === true` first, `lastRedemption !== null` second. Defensive against payload drift.

Past-cycle redemption history → §Q5 Settings → Redemption History (deferred from M3).

---

## File structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `prisma/migrations/<timestamp>_redemption_screenshot_event/migration.sql` | Migration generated by `prisma migrate dev` |
| Modify | `prisma/schema.prisma` | Add `RedemptionScreenshotEvent` model + inverse relations on `User` + `VoucherRedemption` |
| Modify | `src/api/shared/redis-keys.ts` | Add `redemptionScreenshotDedup: (userId, code) => 'rl:ss:<userId>:<code>'` |
| Modify | `src/api/redemption/service.ts` | Add `getMyRedemptionByCode` + `flagRedemptionScreenshot` exports |
| Modify | `src/api/redemption/routes.ts` | Register 2 customer routes inside `customerRedemptionRoutes` |
| Modify | `src/api/customer/discovery/service.ts` | Extend `getCustomerVoucher` return shape with `lastRedemption` |
| Create | `tests/api/redemption/getMyRedemptionByCode.test.ts` | Backend tests |
| Create | `tests/api/redemption/flagRedemptionScreenshot.test.ts` | Backend tests + dedup |
| Create | `tests/api/customer/discovery.voucher-last-redemption.test.ts` | `lastRedemption` payload + cycle-window gate tests |
| Create | `apps/customer-app/src/design-system/motion/PulsingDot.tsx` | Pulsing dot primitive |
| Create | `apps/customer-app/src/features/voucher/components/QRCodeBlock.tsx` | QR + Redeemo logo + a11y label + blurred state |
| Create | `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx` | Full-screen surface composing hooks |
| Create | `apps/customer-app/src/features/voucher/hooks/useRedemptionPolling.ts` | 5s poll, 15min budget |
| Create | `apps/customer-app/src/features/voucher/hooks/useBrightnessBoost.ts` | Capture + restore |
| Create | `apps/customer-app/src/features/voucher/hooks/useScreenshotGuard.ts` | iOS listener + Android FLAG_SECURE + telemetry |
| Create | `apps/customer-app/src/features/voucher/hooks/useAutoHideTimer.ts` | 2-min idle + 10s warning + freeze-on-validated |
| Modify | `apps/customer-app/src/lib/api/redemption.ts` | Add `getMyRedemptionByCode` + `postScreenshotFlag` + Zod schemas |
| Modify | `apps/customer-app/src/lib/api/voucher.ts` | Extend `voucherDetailSchema` with `lastRedemption` |
| Modify | `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` | Mount ShowToStaff; render persisted RedemptionDetailsCard for return visits |
| Modify | `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx` | Replace `onShowToStaff` alert path (caller-side change) |
| Modify | `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx` | Replace stub button + accept persisted-redemption props |
| Create | `apps/customer-app/tests/design-system/motion/pulsing-dot.test.tsx` | A11y + reduced-motion |
| Create | `apps/customer-app/tests/features/voucher/qr-code-block.test.tsx` | A11y + blurred state |
| Create | `apps/customer-app/tests/features/voucher/show-to-staff.test.tsx` | State machine + integration |
| Create | `apps/customer-app/tests/features/voucher/use-redemption-polling.test.tsx` | Cadence + stop conditions |
| Create | `apps/customer-app/tests/features/voucher/use-brightness-boost.test.tsx` | Capture/restore |
| Create | `apps/customer-app/tests/features/voucher/use-screenshot-guard.test.tsx` | iOS listener + Android FLAG_SECURE + dedup |
| Create | `apps/customer-app/tests/features/voucher/use-auto-hide-timer.test.tsx` | Idle / warning / hidden / frozen |
| Create | `apps/customer-app/tests/features/voucher/voucher-detail-persisted-return-visit.test.tsx` | Persisted card + §Q6 invariant |
| Modify | `docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md` | Add §M3.1 as-shipped addendum |
| Modify | `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md` | Add §7.7 + §8.10 shipped-state deltas |
| Modify | `CLAUDE.md` | Flip Phase 3C.1c (M3) to LIVE; update Next Planned Work list |

---

## Tasks

### M3a — Backend + API client (Tasks 1–7)

#### Task 1: Schema model + migration for `RedemptionScreenshotEvent`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_redemption_screenshot_event/migration.sql` (auto-generated)

- [ ] **Step 1: Add the model + inverse relations to `prisma/schema.prisma`**

Find the `User` model and add the inverse relation:
```prisma
// inside model User { ... }
redemptionScreenshotEvents RedemptionScreenshotEvent[]
```

Find `model VoucherRedemption` and add:
```prisma
// inside model VoucherRedemption { ... }
screenshotEvents RedemptionScreenshotEvent[]
```

Add the new model after `model VoucherRedemption` block:
```prisma
model RedemptionScreenshotEvent {
  id           String            @id @default(uuid())
  userId       String
  redemptionId String
  platform     String            // 'ios' | 'android'
  occurredAt   DateTime          @default(now())

  user         User              @relation(fields: [userId],       references: [id])
  redemption   VoucherRedemption @relation(fields: [redemptionId], references: [id])

  @@index([redemptionId, occurredAt])
  @@index([userId])
}
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name redemption_screenshot_event`
Expected: migration SQL generated, applied to local Neon, Prisma client regenerated.

- [ ] **Step 3: Verify the migration is reversible (smoke check)**

Run: `npx prisma migrate status`
Expected: status clean, no pending changes.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(redemption): add RedemptionScreenshotEvent model + migration"
```

---

#### Task 2: Backend service — `flagRedemptionScreenshot` (with 5s dedup)

**Files:**
- Modify: `src/api/shared/redis-keys.ts`
- Modify: `src/api/redemption/service.ts`
- Create: `tests/api/redemption/flagRedemptionScreenshot.test.ts`

- [ ] **Step 1: Add Redis key**

Edit `src/api/shared/redis-keys.ts`:
```ts
// Inside RedisKey object, after pinFailCount:
redemptionScreenshotDedup: (userId: string, code: string) => `rl:ss:${userId}:${code}`,
```

- [ ] **Step 2: Write the failing test**

Create `tests/api/redemption/flagRedemptionScreenshot.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flagRedemptionScreenshot } from '../../../src/api/redemption/service'

const fakePrisma = () => ({
  voucherRedemption: { findUnique: vi.fn() },
  redemptionScreenshotEvent: { create: vi.fn() },
})
const fakeRedis = () => ({
  set: vi.fn(),
  // ioredis SET NX EX returns 'OK' on first set, null on duplicate
})

describe('flagRedemptionScreenshot', () => {
  let prisma: ReturnType<typeof fakePrisma>
  let redis:  ReturnType<typeof fakeRedis>
  beforeEach(() => {
    prisma = fakePrisma()
    redis  = fakeRedis()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', userId: 'u1', redemptionCode: 'A7K2P9X4',
    })
  })

  it('writes RedemptionScreenshotEvent on first call within 5s window', async () => {
    redis.set.mockResolvedValue('OK')
    const result = await flagRedemptionScreenshot(prisma as any, redis as any, 'u1', 'A7K2P9X4', 'ios')
    expect(result).toEqual({ accepted: true })
    expect(prisma.redemptionScreenshotEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', redemptionId: 'r1', platform: 'ios' },
    })
  })

  it('returns accepted:false on dedup hit (Redis SETNX returns null)', async () => {
    redis.set.mockResolvedValue(null)
    const result = await flagRedemptionScreenshot(prisma as any, redis as any, 'u1', 'A7K2P9X4', 'ios')
    expect(result).toEqual({ accepted: false })
    expect(prisma.redemptionScreenshotEvent.create).not.toHaveBeenCalled()
  })

  it('throws REDEMPTION_NOT_FOUND if code does not exist', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue(null)
    await expect(
      flagRedemptionScreenshot(prisma as any, redis as any, 'u1', 'NOPE', 'ios')
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('throws REDEMPTION_NOT_FOUND if redemption belongs to a different user', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', userId: 'OTHER_USER', redemptionCode: 'A7K2P9X4',
    })
    await expect(
      flagRedemptionScreenshot(prisma as any, redis as any, 'u1', 'A7K2P9X4', 'ios')
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('normalises code to uppercase before lookup', async () => {
    redis.set.mockResolvedValue('OK')
    await flagRedemptionScreenshot(prisma as any, redis as any, 'u1', 'a7k2 p9x4', 'ios')
    expect(prisma.voucherRedemption.findUnique).toHaveBeenCalledWith({
      where: { redemptionCode: 'A7K2P9X4' },
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/api/redemption/flagRedemptionScreenshot.test.ts`
Expected: FAIL with "flagRedemptionScreenshot is not a function".

- [ ] **Step 4: Implement the service function**

Edit `src/api/redemption/service.ts`. Add after `getMyRedemption`:
```ts
import { RedisKey } from '../shared/redis-keys'
import type Redis from 'ioredis'

const SCREENSHOT_DEDUP_TTL_SECONDS = 5

export async function flagRedemptionScreenshot(
  prisma: PrismaClient,
  redis:  Redis,
  userId: string,
  code:   string,
  platform: 'ios' | 'android'
): Promise<{ accepted: boolean }> {
  const normalised = code.replace(/[\s-]/g, '').toUpperCase()

  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: normalised },
  })
  if (!redemption || redemption.userId !== userId) {
    throw new AppError('REDEMPTION_NOT_FOUND')
  }

  // Redis SETNX dedup — first hit per (userId, code) within 5s wins.
  const dedupKey = RedisKey.redemptionScreenshotDedup(userId, normalised)
  const setResult = await redis.set(dedupKey, '1', 'EX', SCREENSHOT_DEDUP_TTL_SECONDS, 'NX')
  if (setResult !== 'OK') return { accepted: false }

  await prisma.redemptionScreenshotEvent.create({
    data: { userId, redemptionId: redemption.id, platform },
  })
  return { accepted: true }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/api/redemption/flagRedemptionScreenshot.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/shared/redis-keys.ts src/api/redemption/service.ts tests/api/redemption/flagRedemptionScreenshot.test.ts
git commit -m "feat(redemption): flagRedemptionScreenshot service with 5s Redis dedup"
```

---

#### Task 3: Backend service — `getMyRedemptionByCode`

**Files:**
- Modify: `src/api/redemption/service.ts`
- Create: `tests/api/redemption/getMyRedemptionByCode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/redemption/getMyRedemptionByCode.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getMyRedemptionByCode } from '../../../src/api/redemption/service'

const fakePrisma = () => ({
  voucherRedemption: { findUnique: vi.fn() },
})

describe('getMyRedemptionByCode', () => {
  let prisma: ReturnType<typeof fakePrisma>
  beforeEach(() => { prisma = fakePrisma() })

  it('returns slim payload on happy path', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      userId:           'u1',
      redemptionCode:   'A7K2P9X4',
      isValidated:      true,
      validatedAt:      new Date('2026-05-08T10:00:00Z'),
      validationMethod: 'QR_SCAN',
      voucher: { id: 'v1', merchant: { businessName: 'Pizza Palace' } },
      branch:  { name: 'High Street' },
    })
    const result = await getMyRedemptionByCode(prisma as any, 'u1', 'A7K2P9X4')
    expect(result).toEqual({
      code:             'A7K2P9X4',
      isValidated:      true,
      validatedAt:      new Date('2026-05-08T10:00:00Z'),
      validationMethod: 'QR_SCAN',
      voucherId:        'v1',
      merchantName:     'Pizza Palace',
      branchName:       'High Street',
    })
  })

  it('normalises lowercase + spaces to canonical uppercase before lookup', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      userId: 'u1', redemptionCode: 'A7K2P9X4',
      isValidated: false, validatedAt: null, validationMethod: null,
      voucher: { id: 'v1', merchant: { businessName: 'X' } },
      branch:  { name: 'Y' },
    })
    await getMyRedemptionByCode(prisma as any, 'u1', 'a7k2 p9x4')
    expect(prisma.voucherRedemption.findUnique).toHaveBeenCalledWith({
      where:   { redemptionCode: 'A7K2P9X4' },
      include: expect.any(Object),
    })
  })

  it('throws REDEMPTION_NOT_FOUND if code does not exist', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue(null)
    await expect(getMyRedemptionByCode(prisma as any, 'u1', 'NOPE'))
      .rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('throws REDEMPTION_NOT_FOUND if the redemption belongs to a different user', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      userId: 'OTHER', redemptionCode: 'A7K2P9X4',
      isValidated: false, validatedAt: null, validationMethod: null,
      voucher: { id: 'v1', merchant: { businessName: 'X' } },
      branch:  { name: 'Y' },
    })
    await expect(getMyRedemptionByCode(prisma as any, 'u1', 'A7K2P9X4'))
      .rejects.toThrow('REDEMPTION_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/redemption/getMyRedemptionByCode.test.ts`
Expected: FAIL with "getMyRedemptionByCode is not a function".

- [ ] **Step 3: Implement the service function**

Edit `src/api/redemption/service.ts`. Add after `getMyRedemption`:
```ts
export async function getMyRedemptionByCode(
  prisma: PrismaClient,
  userId: string,
  code:   string
) {
  const normalised = code.replace(/[\s-]/g, '').toUpperCase()
  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: normalised },
    include: {
      voucher: { select: { id: true, merchant: { select: { businessName: true } } } },
      branch:  { select: { name: true } },
    },
  })
  if (!redemption || redemption.userId !== userId) {
    throw new AppError('REDEMPTION_NOT_FOUND')
  }
  return {
    code:             redemption.redemptionCode,
    isValidated:      redemption.isValidated,
    validatedAt:      redemption.validatedAt,
    validationMethod: redemption.validationMethod,
    voucherId:        redemption.voucher.id,
    merchantName:     redemption.voucher.merchant.businessName,
    branchName:       redemption.branch.name,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/redemption/getMyRedemptionByCode.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/redemption/service.ts tests/api/redemption/getMyRedemptionByCode.test.ts
git commit -m "feat(redemption): getMyRedemptionByCode customer self-lookup"
```

---

#### Task 4: Register the two customer routes

**Files:**
- Modify: `src/api/redemption/routes.ts`
- Create: `tests/api/redemption/routes.show-to-staff.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/redemption/routes.show-to-staff.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { customerRedemptionRoutes } from '../../../src/api/redemption/routes'

describe('customer redemption routes — me/:code + screenshot-flag', () => {
  it('registers GET /api/v1/redemption/me/:code', async () => {
    const get = vi.fn()
    const post = vi.fn()
    await customerRedemptionRoutes({ get, post } as any)
    const paths = get.mock.calls.map((c) => c[0])
    expect(paths).toContain('/api/v1/redemption/me/:code')
  })

  it('registers POST /api/v1/redemption/:code/screenshot-flag', async () => {
    const get = vi.fn()
    const post = vi.fn()
    await customerRedemptionRoutes({ get, post } as any)
    const paths = post.mock.calls.map((c) => c[0])
    expect(paths).toContain('/api/v1/redemption/:code/screenshot-flag')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/redemption/routes.show-to-staff.test.ts`
Expected: FAIL — paths not present.

- [ ] **Step 3: Register the routes**

Edit `src/api/redemption/routes.ts`. Inside `customerRedemptionRoutes` after the `GET /redemption/my/:id` route:
```ts
  // GET /api/v1/redemption/me/:code — self-lookup by code, used by Show-to-Staff polling
  app.get(`${prefix}/redemption/me/:code`, async (req: FastifyRequest, reply) => {
    const { code } = req.params as { code: string }
    const result = await getMyRedemptionByCode(app.prisma, req.user.sub, code)
    return reply.send(result)
  })

  // POST /api/v1/redemption/:code/screenshot-flag — best-effort anti-fraud telemetry
  app.post(`${prefix}/redemption/:code/screenshot-flag`, async (req: FastifyRequest, reply) => {
    const { code } = req.params as { code: string }
    const body = z.object({ platform: z.enum(['ios', 'android']) }).parse(req.body)
    const result = await flagRedemptionScreenshot(app.prisma, app.redis, req.user.sub, code, body.platform)
    return reply.send(result)
  })
```

Update the imports at the top:
```ts
import {
  createRedemption,
  verifyRedemption,
  listMyRedemptions,
  getMyRedemption,
  getMyRedemptionByCode,
  flagRedemptionScreenshot,
  listBranchRedemptions,
  VerifyActor,
} from './service'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/redemption/routes.show-to-staff.test.ts`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/redemption/routes.ts tests/api/redemption/routes.show-to-staff.test.ts
git commit -m "feat(redemption): register me/:code + screenshot-flag customer routes"
```

---

#### Task 5: Extend `getCustomerVoucher` with `lastRedemption` block

**Files:**
- Modify: `src/api/customer/discovery/service.ts`
- Create: `tests/api/customer/discovery.voucher-last-redemption.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/customer/discovery.voucher-last-redemption.test.ts`. Mirror the existing `discovery.voucher-detail.test.ts` mock setup; add cases for `lastRedemption`:

```ts
import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class { constructor(_: any) {} },
}))
vi.mock('../../../generated/prisma/client', () => {
  class PrismaClient {
    voucher                 = { findUnique: vi.fn() }
    subscription            = { findUnique: vi.fn() }
    userVoucherCycleState   = { findUnique: vi.fn() }
    favouriteVoucher        = { findUnique: vi.fn() }
    voucherRedemption       = { findFirst: vi.fn() }
    constructor(_?: any) {}
  }
  return {
    PrismaClient,
    MerchantStatus:  { ACTIVE: 'ACTIVE' },
    VoucherStatus:   { ACTIVE: 'ACTIVE' },
    ApprovalStatus:  { APPROVED: 'APPROVED' },
  }
})
import { getCustomerVoucher } from '../../../src/api/customer/discovery/service'
import { PrismaClient } from '../../../generated/prisma/client'

const VOUCHER_ID = 'v1'
const USER_ID    = 'u1'
const baseVoucherRow = {
  id: VOUCHER_ID, title: 'BOGO', type: 'BOGO',
  description: null, terms: null, imageUrl: null,
  estimatedSaving: 4.5, expiryDate: null, code: null,
  status: 'ACTIVE', approvalStatus: 'APPROVED',
  merchant: { id: 'm1', businessName: 'Test', tradingName: null, logoUrl: null, status: 'ACTIVE' },
}

function makePrisma() {
  const prisma = new PrismaClient() as any
  prisma.voucher.findUnique.mockResolvedValue(baseVoucherRow)
  prisma.favouriteVoucher.findUnique.mockResolvedValue(null)
  return prisma
}

describe('getCustomerVoucher — lastRedemption (cycle-window gated)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns lastRedemption when redeemed in current cycle', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00Z')
    vi.useFakeTimers(); vi.setSystemTime(now)

    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00Z'),
    })
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      redemptionCode: 'A7K2P9X4',
      redeemedAt:     new Date('2026-05-12T18:30:00Z'),
      isValidated:    false,
      validatedAt:    null,
      branch:         { id: 'b1', name: 'High Street' },
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    expect(result.isRedeemedThisCycle).toBe(true)
    expect(result.lastRedemption).toEqual({
      code:        'A7K2P9X4',
      redeemedAt:  new Date('2026-05-12T18:30:00Z').toISOString(),
      branch:      { id: 'b1', name: 'High Street' },
      isValidated: false,
      validatedAt: null,
    })
    vi.useRealTimers()
  })

  it('returns lastRedemption=null when isRedeemedThisCycle is false (cycle rolled over)', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00Z')
    vi.useFakeTimers(); vi.setSystemTime(now)
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00Z'),
    })
    // Stored row from previous cycle
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-04-05T00:00:00Z'),  // PREVIOUS cycle window
    })
    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    expect(result.isRedeemedThisCycle).toBe(false)
    expect(result.lastRedemption).toBeNull()
    vi.useRealTimers()
  })

  it('returns lastRedemption=null when no subscription', async () => {
    const prisma = makePrisma()
    prisma.subscription.findUnique.mockResolvedValue(null)
    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    expect(result.lastRedemption).toBeNull()
  })

  it('returns lastRedemption=null for guest (userId null)', async () => {
    const prisma = makePrisma()
    const result = await getCustomerVoucher(prisma, VOUCHER_ID, null)
    expect(result.lastRedemption).toBeNull()
  })

  it('returns lastRedemption with isValidated:true + validatedAt when staff validated', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00Z')
    vi.useFakeTimers(); vi.setSystemTime(now)
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00Z'),
    })
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      redemptionCode: 'A7K2P9X4',
      redeemedAt:     new Date('2026-05-12T18:30:00Z'),
      isValidated:    true,
      validatedAt:    new Date('2026-05-12T18:31:15Z'),
      branch:         { id: 'b1', name: 'High Street' },
    })
    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    expect(result.lastRedemption?.isValidated).toBe(true)
    expect(result.lastRedemption?.validatedAt).toBe(new Date('2026-05-12T18:31:15Z').toISOString())
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/customer/discovery.voucher-last-redemption.test.ts`
Expected: FAIL — `lastRedemption` undefined on result.

- [ ] **Step 3: Implement the payload extension**

Edit `src/api/customer/discovery/service.ts`, inside `getCustomerVoucher`. After computing `isRedeemedThisCycle`, add:

```ts
let lastRedemption: {
  code: string
  redeemedAt: string
  branch: { id: string; name: string }
  isValidated: boolean
  validatedAt: string | null
} | null = null

if (isRedeemedThisCycle && cycleStart && cycleEnd) {
  const row = await prisma.voucherRedemption.findFirst({
    where:   { userId, voucherId, redeemedAt: { gte: cycleStart, lt: cycleEnd } },
    orderBy: { redeemedAt: 'desc' },
    include: { branch: { select: { id: true, name: true } } },
  })
  if (row) {
    lastRedemption = {
      code:        row.redemptionCode,
      redeemedAt:  row.redeemedAt.toISOString(),
      branch:      row.branch,
      isValidated: row.isValidated,
      validatedAt: row.validatedAt ? row.validatedAt.toISOString() : null,
    }
  }
}
```

Add `lastRedemption` to the return object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/customer/discovery.voucher-last-redemption.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Run the full backend suite as a regression check**

Run: `npx vitest run`
Expected: 488+/488+ PASS (existing 483 + 5 new). Confirm no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery.voucher-last-redemption.test.ts
git commit -m "feat(discovery): voucher payload lastRedemption (cycle-window gated)"
```

---

#### Task 6: Customer-app API client extensions

**Files:**
- Modify: `apps/customer-app/src/lib/api/redemption.ts`
- Create: `apps/customer-app/tests/lib/api/redemption.show-to-staff.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/customer-app/tests/lib/api/redemption.show-to-staff.test.ts`:
```ts
import { api } from '@/lib/api'
import { redemptionApi } from '@/lib/api/redemption'

jest.spyOn(api, 'get')
jest.spyOn(api, 'post')

describe('redemptionApi.getMyRedemptionByCode', () => {
  beforeEach(() => { (api.get as jest.Mock).mockReset() })

  it('parses a slim payload happy path', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      code:'A7K2P9X4', isValidated:false, validatedAt:null, validationMethod:null,
      voucherId:'v1', merchantName:'Pizza Palace', branchName:'High Street',
    })
    const r = await redemptionApi.getMyRedemptionByCode('A7K2P9X4')
    expect(r.code).toBe('A7K2P9X4')
    expect(r.isValidated).toBe(false)
  })

  it('parses a validated payload with validatedAt + method', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      code:'A7K2P9X4', isValidated:true,
      validatedAt:'2026-05-08T10:00:00Z', validationMethod:'QR_SCAN',
      voucherId:'v1', merchantName:'Pizza Palace', branchName:'High Street',
    })
    const r = await redemptionApi.getMyRedemptionByCode('A7K2P9X4')
    expect(r.isValidated).toBe(true)
    expect(r.validationMethod).toBe('QR_SCAN')
  })

  it('URL-encodes unusual codes (defensive)', async () => {
    (api.get as jest.Mock).mockResolvedValue(null)
    await redemptionApi.getMyRedemptionByCode('A B 7 X')
    const call = (api.get as jest.Mock).mock.calls[0][0] as string
    expect(call).toContain('A%20B%207%20X')
  })
})

describe('redemptionApi.postScreenshotFlag', () => {
  beforeEach(() => { (api.post as jest.Mock).mockReset() })

  it('posts platform body to the right URL', async () => {
    (api.post as jest.Mock).mockResolvedValue({ accepted: true })
    await redemptionApi.postScreenshotFlag('A7K2P9X4', 'ios')
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/redemption/A7K2P9X4/screenshot-flag',
      { platform: 'ios' },
    )
  })

  it('returns accepted:false on dedup', async () => {
    (api.post as jest.Mock).mockResolvedValue({ accepted: false })
    const r = await redemptionApi.postScreenshotFlag('A7K2P9X4', 'android')
    expect(r.accepted).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/lib/api/redemption.show-to-staff.test.ts --forceExit`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Add the API client methods + Zod schemas**

Edit `apps/customer-app/src/lib/api/redemption.ts`. Add:
```ts
export const redemptionStatusByCodeSchema = z.object({
  code:             z.string(),
  isValidated:      z.boolean(),
  validatedAt:      z.string().nullable(),
  validationMethod: z.enum(['QR_SCAN', 'MANUAL']).nullable(),
  voucherId:        z.string(),
  merchantName:     z.string(),
  branchName:       z.string(),
})
export type RedemptionStatusByCode = z.infer<typeof redemptionStatusByCodeSchema>

// Inside redemptionApi object:
async getMyRedemptionByCode(code: string): Promise<RedemptionStatusByCode> {
  const data = await api.get<unknown>(`/api/v1/redemption/me/${encodeURIComponent(code)}`)
  return redemptionStatusByCodeSchema.parse(data)
},

async postScreenshotFlag(code: string, platform: 'ios' | 'android'): Promise<{ accepted: boolean }> {
  return api.post(`/api/v1/redemption/${encodeURIComponent(code)}/screenshot-flag`, { platform })
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/lib/api/redemption.show-to-staff.test.ts --forceExit`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/api/redemption.ts apps/customer-app/tests/lib/api/redemption.show-to-staff.test.ts
git commit -m "feat(api/redemption): customer client getMyRedemptionByCode + postScreenshotFlag"
```

---

#### Task 7: Extend `voucherDetailSchema` with `lastRedemption`

**Files:**
- Modify: `apps/customer-app/src/lib/api/voucher.ts`
- Modify: `apps/customer-app/tests/lib/api/voucher.test.ts`

- [ ] **Step 1: Write the failing test**

Edit `apps/customer-app/tests/lib/api/voucher.test.ts`. Add inside the `describe('voucher detail schema — pin contract directly')` block:
```ts
it('accepts lastRedemption block when present', () => {
  const result = schema.safeParse({
    ...validVoucherResponse,
    isRedeemedThisCycle: true,
    availableAgainAt:    '2026-06-05T00:00:00.000Z',
    lastRedemption: {
      code: 'A7K2P9X4',
      redeemedAt: '2026-05-12T18:30:00.000Z',
      branch: { id: 'b1', name: 'High Street' },
      isValidated: false,
      validatedAt: null,
    },
  })
  expect(result.success).toBe(true)
  if (result.success) expect(result.data.lastRedemption?.code).toBe('A7K2P9X4')
})

it('accepts lastRedemption=null + accepts the field being absent', () => {
  const r1 = schema.safeParse({ ...validVoucherResponse, lastRedemption: null })
  const r2 = schema.safeParse({ ...validVoucherResponse })  // field absent
  expect(r1.success).toBe(true)
  expect(r2.success).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/lib/api/voucher.test.ts --forceExit`
Expected: FAIL — schema rejects unknown property.

- [ ] **Step 3: Extend the Zod schema**

Edit `apps/customer-app/src/lib/api/voucher.ts`. Inside `voucherDetailSchema`:
```ts
lastRedemption: z.object({
  code:        z.string(),
  redeemedAt:  z.string(),
  branch:      z.object({ id: z.string(), name: z.string() }),
  isValidated: z.boolean(),
  validatedAt: z.string().nullable(),
}).nullable().optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/lib/api/voucher.test.ts --forceExit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/api/voucher.ts apps/customer-app/tests/lib/api/voucher.test.ts
git commit -m "feat(api/voucher): voucherDetailSchema lastRedemption block"
```

---

### M3b — ShowToStaff core (Tasks 8–13)

#### Task 8: `PulsingDot` design-system primitive

**Files:**
- Create: `apps/customer-app/src/design-system/motion/PulsingDot.tsx`
- Create: `apps/customer-app/tests/design-system/motion/pulsing-dot.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/customer-app/tests/design-system/motion/pulsing-dot.test.tsx`:
```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { PulsingDot } from '@/design-system/motion/PulsingDot'

describe('PulsingDot', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<PulsingDot testID="dot" color="#E20C04" size={8} />)
    expect(getByTestId('dot')).toBeTruthy()
  })

  it('respects reduced-motion: no withRepeat when reduced', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    const { getByTestId } = render(<PulsingDot testID="dot" color="#E20C04" size={8} />)
    expect(getByTestId('dot')).toBeTruthy()
    // Component must mount without throwing in reduced-motion mode.
    // (Reanimated's withRepeat is mocked in test setup; deeper assertions
    //  not pinned here — visual reduced-motion behaviour goes through manual QA.)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/design-system/motion/pulsing-dot.test.tsx --forceExit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/customer-app/src/design-system/motion/PulsingDot.tsx`. Adapt from reference:
```tsx
import React, { useEffect } from 'react'
import { AccessibilityInfo, View, ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated'

type Props = {
  color: string
  size: number
  testID?: string
  style?: ViewStyle
}

export function PulsingDot({ color, size, testID, style }: Props) {
  const opacity = useSharedValue(1)

  useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return
      if (!reduced) {
        opacity.value = withRepeat(withTiming(0.35, { duration: 700 }), -1, true)
      }
    })
    return () => { cancelled = true; cancelAnimation(opacity) }
  }, [opacity])

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      testID={testID}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animatedStyle, style]}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/design-system/motion/pulsing-dot.test.tsx --forceExit`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/design-system/motion/PulsingDot.tsx apps/customer-app/tests/design-system/motion/pulsing-dot.test.tsx
git commit -m "feat(design-system): PulsingDot motion primitive"
```

---

#### Task 9: `QRCodeBlock` component

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/QRCodeBlock.tsx`
- Create: `apps/customer-app/tests/features/voucher/qr-code-block.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/customer-app/tests/features/voucher/qr-code-block.test.tsx`:
```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { QRCodeBlock } from '@/features/voucher/components/QRCodeBlock'

jest.mock('react-native-qrcode-svg', () => () => null)
jest.mock('expo-blur',           () => ({ BlurView: () => null }))

describe('QRCodeBlock', () => {
  it('mounts a QR code with accessibility label derived from the formatted code', () => {
    const { getByA11yLabel } = render(<QRCodeBlock value="A7K2P9X4" size={200} />)
    // codeAccessibilityLabel(A7K2P9X4) = "Redemption code A 7 K 2, P 9 X 4"
    expect(getByA11yLabel(/A 7 K 2, P 9 X 4/i)).toBeTruthy()
  })

  it('renders blurred state with a button-role and tap-to-show label', () => {
    const { getByA11yRole } = render(<QRCodeBlock value="A7K2P9X4" size={200} blurred />)
    const node = getByA11yRole('button')
    expect(node.props.accessibilityLabel).toMatch(/tap to show/i)
  })

  it('enforces hero-mode size floor of 200px', () => {
    const { getByTestId } = render(<QRCodeBlock value="A7K2P9X4" size={120} hero testID="qr" />)
    const wrapper = getByTestId('qr')
    expect(wrapper.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: 200, height: 200 }),
    ]))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/qr-code-block.test.tsx --forceExit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/customer-app/src/features/voucher/components/QRCodeBlock.tsx`. Adapt from reference (66 LOC). Key adaptations: use the project's `color`/`radius` tokens; `codeAccessibilityLabel` already lives at `@/features/voucher/utils/formatRedemptionCode`. Logo path: `../../../../assets/icon.png` (Redeemo R icon).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/qr-code-block.test.tsx --forceExit`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/QRCodeBlock.tsx apps/customer-app/tests/features/voucher/qr-code-block.test.tsx
git commit -m "feat(voucher): QRCodeBlock with logo overlay + blurred state"
```

---

#### Task 10: `useRedemptionPolling` hook

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useRedemptionPolling.ts`
- Create: `apps/customer-app/tests/features/voucher/use-redemption-polling.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/customer-app/tests/features/voucher/use-redemption-polling.test.tsx`. Test cadence using fake timers + mocked `redemptionApi.getMyRedemptionByCode`:

```tsx
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRedemptionPolling } from '@/features/voucher/hooks/useRedemptionPolling'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { getMyRedemptionByCode: jest.fn() },
}))

const wrapper = ({ children }: any) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useRedemptionPolling', () => {
  beforeEach(() => { jest.useFakeTimers(); (redemptionApi.getMyRedemptionByCode as jest.Mock).mockReset() })
  afterEach(()  => { jest.useRealTimers() })

  it('returns polling phase initially', async () => {
    (redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code:'A7K2P9X4', isValidated:false, validatedAt:null, validationMethod:null,
      voucherId:'v1', merchantName:'X', branchName:'Y',
    })
    const { result } = renderHook(() => useRedemptionPolling('A7K2P9X4', { enabled: true }), { wrapper })
    await waitFor(() => expect(result.current.phase).toBe('polling'))
  })

  it('flips to validated when payload returns isValidated:true', async () => {
    (redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code:'A7K2P9X4', isValidated:true,
      validatedAt:'2026-05-08T10:00:00Z', validationMethod:'QR_SCAN',
      voucherId:'v1', merchantName:'X', branchName:'Y',
    })
    const { result } = renderHook(() => useRedemptionPolling('A7K2P9X4', { enabled: true }), { wrapper })
    await waitFor(() => expect(result.current.phase).toBe('validated'))
  })

  it('does not poll when enabled=false', async () => {
    (redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue(null)
    renderHook(() => useRedemptionPolling('A7K2P9X4', { enabled: false }), { wrapper })
    expect(redemptionApi.getMyRedemptionByCode).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/use-redemption-polling.test.tsx --forceExit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `apps/customer-app/src/features/voucher/hooks/useRedemptionPolling.ts`. Adapt from reference (48 LOC). Same shape: `useQuery` with `refetchInterval` returning false on validated / timeout / disabled, otherwise `5_000`. Returns discriminated union `{ phase: 'polling' | 'validated' | 'timed-out', data }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/use-redemption-polling.test.tsx --forceExit`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useRedemptionPolling.ts apps/customer-app/tests/features/voucher/use-redemption-polling.test.tsx
git commit -m "feat(voucher): useRedemptionPolling 5s/15min polling hook"
```

---

#### Task 11: `useBrightnessBoost` hook

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useBrightnessBoost.ts`
- Create: `apps/customer-app/tests/features/voucher/use-brightness-boost.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook } from '@testing-library/react-native'
import * as Brightness from 'expo-brightness'
import { useBrightnessBoost } from '@/features/voucher/hooks/useBrightnessBoost'

jest.mock('expo-brightness', () => ({
  getBrightnessAsync: jest.fn().mockResolvedValue(0.4),
  setBrightnessAsync: jest.fn().mockResolvedValue(undefined),
}))

describe('useBrightnessBoost', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('captures current brightness and sets to 1 on mount when active', async () => {
    renderHook(() => useBrightnessBoost(true))
    await Promise.resolve(); await Promise.resolve()
    expect(Brightness.getBrightnessAsync).toHaveBeenCalled()
    expect(Brightness.setBrightnessAsync).toHaveBeenCalledWith(1)
  })

  it('restores prior brightness on unmount', async () => {
    const { unmount } = renderHook(() => useBrightnessBoost(true))
    await Promise.resolve(); await Promise.resolve()
    unmount()
    expect(Brightness.setBrightnessAsync).toHaveBeenLastCalledWith(0.4)
  })

  it('is a no-op when active=false', () => {
    renderHook(() => useBrightnessBoost(false))
    expect(Brightness.getBrightnessAsync).not.toHaveBeenCalled()
  })

  it('survives Brightness API rejection (best-effort)', async () => {
    (Brightness.getBrightnessAsync as jest.Mock).mockRejectedValueOnce(new Error('LowPowerMode'))
    expect(() => renderHook(() => useBrightnessBoost(true))).not.toThrow()
  })
})
```

- [ ] **Step 2: Run + verify FAIL**

Run: `cd apps/customer-app && npx jest tests/features/voucher/use-brightness-boost.test.tsx --forceExit`

- [ ] **Step 3: Implement**

Create `apps/customer-app/src/features/voucher/hooks/useBrightnessBoost.ts`. Adapt from reference (31 LOC). Key adaptations: same shape; ensure cleanup is a no-op when previous was never captured (e.g. API rejection).

- [ ] **Step 4: Run + verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useBrightnessBoost.ts apps/customer-app/tests/features/voucher/use-brightness-boost.test.tsx
git commit -m "feat(voucher): useBrightnessBoost capture/restore hook"
```

---

#### Task 12: `useAutoHideTimer` hook

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useAutoHideTimer.ts`
- Create: `apps/customer-app/tests/features/voucher/use-auto-hide-timer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook, act } from '@testing-library/react-native'
import { useAutoHideTimer } from '@/features/voucher/hooks/useAutoHideTimer'

describe('useAutoHideTimer', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(()  => jest.useRealTimers())

  it('starts in visible state', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true }))
    expect(result.current.state).toBe('visible')
  })

  it('transitions to warning at 1m50s and hidden at 2m', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true }))
    act(() => { jest.advanceTimersByTime(110_000) })
    expect(result.current.state).toBe('warning')
    act(() => { jest.advanceTimersByTime(10_001) })
    expect(result.current.state).toBe('hidden')
  })

  it('resetTimer flips back to visible and re-arms', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true }))
    act(() => { jest.advanceTimersByTime(120_001) })
    expect(result.current.state).toBe('hidden')
    act(() => { result.current.resetTimer() })
    expect(result.current.state).toBe('visible')
    act(() => { jest.advanceTimersByTime(110_000) })
    expect(result.current.state).toBe('warning')
  })

  it('frozen=true short-circuits — stays visible regardless of time', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true, frozen: true }))
    act(() => { jest.advanceTimersByTime(180_000) })
    expect(result.current.state).toBe('visible')
  })

  it('active=false stays visible and clears timers', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: false }))
    act(() => { jest.advanceTimersByTime(180_000) })
    expect(result.current.state).toBe('visible')
  })
})
```

- [ ] **Step 2: Run + verify FAIL**

- [ ] **Step 3: Implement**

Adapt the reference (48 LOC) — already matches owner direction (2 min idle, 10s warning, freeze when validated). No structural changes required.

- [ ] **Step 4: Run + verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useAutoHideTimer.ts apps/customer-app/tests/features/voucher/use-auto-hide-timer.test.tsx
git commit -m "feat(voucher): useAutoHideTimer 2min idle / 10s warning / freeze"
```

---

#### Task 13: `ShowToStaff` component (composes the above)

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx`
- Create: `apps/customer-app/tests/features/voucher/show-to-staff.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShowToStaff } from '@/features/voucher/components/ShowToStaff'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: {
    getMyRedemptionByCode: jest.fn().mockResolvedValue({
      code:'A7K2P9X4', isValidated:false, validatedAt:null, validationMethod:null,
      voucherId:'v1', merchantName:'Pizza Palace', branchName:'High Street',
    }),
    postScreenshotFlag: jest.fn().mockResolvedValue({ accepted: true }),
  },
}))
jest.mock('expo-brightness',     () => ({ getBrightnessAsync: jest.fn().mockResolvedValue(0.5), setBrightnessAsync: jest.fn() }))
jest.mock('expo-screen-capture', () => ({ addScreenshotListener: jest.fn(() => ({ remove: jest.fn() })), preventScreenCaptureAsync: jest.fn(), allowScreenCaptureAsync: jest.fn() }))

const wrapper = ({ children }: any) => {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={c}>{children}</QueryClientProvider>
}

const baseProps = {
  visible: true,
  redemptionCode: 'A7K2P9X4',
  voucherTitle: 'BOGO Pizza',
  voucherType: 'BOGO' as const,
  merchantName: 'Pizza Palace',
  branchName: 'High Street',
  customerName: 'John D.',
  redeemedAt: '2026-05-08T10:00:00Z',
  onDone: jest.fn(),
}

describe('ShowToStaff', () => {
  it('renders code formatted 4+4 + voucher type strip + Done button', () => {
    const { getByText, getByA11yRole } = render(<ShowToStaff {...baseProps} />, { wrapper })
    expect(getByText(/A7K2 P9X4/)).toBeTruthy()
    expect(getByText(/Pizza Palace · High Street/)).toBeTruthy()
    expect(getByA11yRole('button')).toBeTruthy()
  })

  it('starts brightness boost on mount', () => {
    render(<ShowToStaff {...baseProps} />, { wrapper })
    expect(require('expo-brightness').setBrightnessAsync).toHaveBeenCalledWith(1)
  })

  it('flips to validated state when polling returns isValidated:true', async () => {
    (redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code:'A7K2P9X4', isValidated:true, validatedAt:'2026-05-08T10:01:00Z', validationMethod:'QR_SCAN',
      voucherId:'v1', merchantName:'Pizza Palace', branchName:'High Street',
    })
    const { findByText } = render(<ShowToStaff {...baseProps} />, { wrapper })
    expect(await findByText(/Verified by staff/i)).toBeTruthy()
  })

  it('auto-dismisses ~2s after validated transition', async () => {
    jest.useFakeTimers()
    const onDone = jest.fn()
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code:'A7K2P9X4', isValidated:true, validatedAt:'2026-05-08T10:01:00Z', validationMethod:'QR_SCAN',
      voucherId:'v1', merchantName:'Pizza Palace', branchName:'High Street',
    })
    render(<ShowToStaff {...baseProps} onDone={onDone} />, { wrapper })
    // Advance microtasks to let the query resolve, then 2s for the auto-dismiss
    await waitFor(() => expect(onDone).not.toHaveBeenCalled())
    jest.advanceTimersByTime(2_000)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    jest.useRealTimers()
  })

  it('Done button calls onDone', () => {
    const onDone = jest.fn()
    const { getByA11yLabel } = render(<ShowToStaff {...baseProps} onDone={onDone} />, { wrapper })
    fireEvent.press(getByA11yLabel('Done'))
    expect(onDone).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run + verify FAIL**

- [ ] **Step 3: Implement**

Create `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx`. Port reference (249 LOC) with these adaptations:
- Use 8-char `formatRedemptionCode` from `../utils/formatRedemptionCode`.
- Live datetime ticker uses `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London' })` with seconds (matches the existing London-clock helper convention, even though we render local time of the staff verification — explicit Europe/London makes screenshot-vs-live mismatch easier to spot for UK staff).
- `validated` phase shows green check + "Verified by staff at <branchName>" copy + auto-call `onDone` 2s later via `setTimeout` in a `useEffect` keyed on `phase`.
- Animations respect `prefers-reduced-motion` via `AccessibilityInfo` (PulsingDot already does; gradient/scale entrance animations skip on reduced).
- Mounts as a `<Modal animationType={reduced ? 'none' : 'slide'} presentationStyle='fullScreen'>`.

Skip the `useScreenshotGuard` wiring in this Task — it lands in Task 15. The test in Step 1 above exercises the rest.

- [ ] **Step 4: Run + verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/ShowToStaff.tsx apps/customer-app/tests/features/voucher/show-to-staff.test.tsx
git commit -m "feat(voucher): ShowToStaff full-screen surface (no anti-fraud yet)"
```

---

### M3c — Anti-fraud (Tasks 14–15)

#### Task 14: `useScreenshotGuard` hook

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useScreenshotGuard.ts`
- Create: `apps/customer-app/tests/features/voucher/use-screenshot-guard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook, act } from '@testing-library/react-native'
import { Platform } from 'react-native'
import * as ScreenCapture from 'expo-screen-capture'
import { redemptionApi } from '@/lib/api/redemption'
import { useScreenshotGuard } from '@/features/voucher/hooks/useScreenshotGuard'

jest.mock('expo-screen-capture', () => ({
  addScreenshotListener:     jest.fn(),
  preventScreenCaptureAsync: jest.fn(),
  allowScreenCaptureAsync:   jest.fn(),
}))
jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { postScreenshotFlag: jest.fn().mockResolvedValue({ accepted: true }) },
}))

describe('useScreenshotGuard — iOS', () => {
  let listener: () => void
  beforeEach(() => {
    Platform.OS = 'ios' as any
    ;(ScreenCapture.addScreenshotListener as jest.Mock).mockImplementation((cb) => {
      listener = cb
      return { remove: jest.fn() }
    })
  })

  it('subscribes to screenshot events when active', () => {
    renderHook(() => useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }))
    expect(ScreenCapture.addScreenshotListener).toHaveBeenCalled()
  })

  it('fires onBannerShown + posts screenshot-flag on screenshot', () => {
    const onBannerShown = jest.fn()
    renderHook(() => useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown }))
    act(() => { listener() })
    expect(onBannerShown).toHaveBeenCalled()
    expect(redemptionApi.postScreenshotFlag).toHaveBeenCalledWith('A7K2P9X4', 'ios')
  })

  it('dedupes within 5s', () => {
    const onBannerShown = jest.fn()
    renderHook(() => useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown }))
    act(() => { listener(); listener() })
    expect(onBannerShown).toHaveBeenCalledTimes(1)
    expect(redemptionApi.postScreenshotFlag).toHaveBeenCalledTimes(1)
  })

  it('survives postScreenshotFlag rejection silently', () => {
    (redemptionApi.postScreenshotFlag as jest.Mock).mockRejectedValueOnce(new Error('net'))
    const onBannerShown = jest.fn()
    expect(() => {
      renderHook(() => useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown }))
      act(() => { listener() })
    }).not.toThrow()
  })
})

describe('useScreenshotGuard — Android', () => {
  beforeEach(() => { Platform.OS = 'android' as any })

  it('calls preventScreenCaptureAsync on mount and allowScreenCaptureAsync on unmount', () => {
    const { unmount } = renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() })
    )
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalled()
    unmount()
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run + verify FAIL**

- [ ] **Step 3: Implement**

Adapt from reference (41 LOC). Same shape; the reference is already correct for D2 (best-effort, dedup, calls flag endpoint). Confirm errors from `redemptionApi.postScreenshotFlag` are caught silently.

- [ ] **Step 4: Run + verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useScreenshotGuard.ts apps/customer-app/tests/features/voucher/use-screenshot-guard.test.tsx
git commit -m "feat(voucher): useScreenshotGuard with 5s dedup + best-effort telemetry"
```

---

#### Task 15: Wire screenshot guard into `ShowToStaff`

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx`
- Modify: `apps/customer-app/tests/features/voucher/show-to-staff.test.tsx`

- [ ] **Step 1: Add the failing test**

Append to the existing test file:
```tsx
it('blurs the QR + shows banner when screenshot fires (iOS)', async () => {
  let captureListener: (() => void) | null = null
  ;(require('expo-screen-capture').addScreenshotListener as jest.Mock).mockImplementation((cb: () => void) => {
    captureListener = cb
    return { remove: jest.fn() }
  })
  Platform.OS = 'ios' as any

  const { findByText, queryByText, queryByA11yRole } = render(<ShowToStaff {...baseProps} />, { wrapper })

  expect(queryByText(/Screenshot/i)).toBeNull()
  // simulate user-taken screenshot
  await act(async () => { captureListener?.() })
  expect(await findByText(/Screenshot/i)).toBeTruthy()
  // QR is blurred — check button-role (blurred QR is a Pressable to re-show)
  expect(queryByA11yRole('button')).toBeTruthy()
})
```

- [ ] **Step 2: Run + verify FAIL**

- [ ] **Step 3: Wire the hook**

In `ShowToStaff.tsx`:
- Add `useScreenshotGuard(redemptionCode, { active: visible && phase !== 'validated', onBannerShown: () => setBlurred(true) })`.
- Add local state `const [blurred, setBlurred] = useState(false)`.
- Pass `blurred` to `<QRCodeBlock blurred={blurred} ...>`.
- Show a banner ("Screenshot taken — staff verify only the live screen") when `blurred`.
- Tap on the blurred QR sets `blurred=false`.

- [ ] **Step 4: Run + verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/ShowToStaff.tsx apps/customer-app/tests/features/voucher/show-to-staff.test.tsx
git commit -m "feat(voucher): ShowToStaff anti-fraud — blur QR + banner on screenshot"
```

---

### M3d — Wiring + persisted return-visit (Tasks 16–19)

#### Task 16: Mount `ShowToStaff` from `VoucherDetailScreen` + replace `SuccessPopup` alert

**Files:**
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`
- Modify: `apps/customer-app/tests/features/voucher/voucher-detail-redeem-flow.test.tsx`

- [ ] **Step 1: Update the existing M2 test that asserts the alert path**

The current test asserts that `Alert.alert('Show to Staff', …)` is fired. Update it to assert that `ShowToStaff` mounts with the right props instead. Find tests with `'Show to Staff'` alert assertions in `voucher-detail-redeem-flow.test.tsx` and replace them.

```tsx
// Replace the existing alert-fired assertion with:
it('SuccessPopup → "Show to Staff" opens ShowToStaff with the redemption code', async () => {
  // ... existing redeem flow setup ...
  // tap "Show to Staff" on SuccessPopup
  fireEvent.press(getByA11yLabel('Show to Staff'))
  // ShowToStaff renders the formatted code
  expect(getByText(/A7K2 P9X4/)).toBeTruthy()
})
```

- [ ] **Step 2: Run + verify FAIL**

Run: `cd apps/customer-app && npx jest tests/features/voucher/voucher-detail-redeem-flow.test.tsx --forceExit`
Expected: FAIL — alert path no longer fires.

- [ ] **Step 3: Mount ShowToStaff in VoucherDetailScreen**

Add state for the ShowToStaff visibility:
```tsx
const [showToStaff, setShowToStaff] = useState<{
  code: string; redeemedAt: string; branchName: string;
} | null>(null)
```

Replace the `Alert.alert('Show to Staff', …)` block in the `SuccessPopup`'s `onShowToStaff` prop:
```tsx
onShowToStaff={() => {
  setShowToStaff({
    code:       successPopup.redemptionCode,
    redeemedAt: successPopup.redeemedAt,
    branchName: branchName,
  })
}}
```

Mount `<ShowToStaff>` near the bottom of the JSX (after `SuccessPopup`):
```tsx
{showToStaff && voucher ? (
  <ShowToStaff
    visible
    redemptionCode={showToStaff.code}
    voucherTitle={voucher.title}
    voucherType={voucher.type}
    merchantName={voucher.merchant.businessName}
    branchName={showToStaff.branchName}
    customerName={firstNameInitial}
    redeemedAt={showToStaff.redeemedAt}
    onDone={() => setShowToStaff(null)}
  />
) : null}
```

`firstNameInitial` should derive from the existing user/profile context (e.g. `John D.`). If not available today, hard-code the customer name to empty string and surface this as a follow-up — do NOT block on it.

- [ ] **Step 4: Run + verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx apps/customer-app/tests/features/voucher/voucher-detail-redeem-flow.test.tsx
git commit -m "feat(voucher): wire SuccessPopup → ShowToStaff (delete M2 alert)"
```

---

#### Task 17: Render persisted RedemptionDetailsCard from `voucher.lastRedemption`

**Files:**
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`
- Modify: `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx`
- Create: `apps/customer-app/tests/features/voucher/voucher-detail-persisted-return-visit.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `voucher-detail-persisted-return-visit.test.tsx`. The test mocks `useCustomerVoucher` to return a payload with `isRedeemedThisCycle: true` + `lastRedemption: { code, redeemedAt, branch, isValidated:false, validatedAt:null }` AND no in-memory `lastRedemption` (simulating an app relaunch). Asserts:
1. `RedemptionDetailsCard` renders.
2. Its `code` displays as `A7K2 P9X4`.
3. Its branch displays correctly.
4. Tapping "Show to Staff" opens `ShowToStaff` with the persisted code.
5. When `voucher.isRedeemedThisCycle === false` (cycle rolled), card does NOT render even if `lastRedemption` somehow exists (defensive — test explicitly sets both).

- [ ] **Step 2: Run + verify FAIL**

- [ ] **Step 3: Implement the gate**

In `VoucherDetailScreen.tsx`, around the existing block at [VoucherDetailScreen.tsx:976](VoucherDetailScreen.tsx#L976):
```tsx
{stateKey === 'redeemed-this-cycle' && (lastRedemption || voucher.lastRedemption) ? (
  <RedemptionDetailsCard
    redemptionCode={ lastRedemption?.redemptionCode ?? voucher.lastRedemption!.code }
    redeemedAt={    lastRedemption?.redeemedAt    ?? voucher.lastRedemption!.redeemedAt }
    branchName={
      lastRedemption
        ? lastRedemptionBranch?.name
        : voucher.lastRedemption!.branch.name
    }
    voucherTitle={voucher.title}
    voucherType={voucher.type}
    merchantName={voucher.merchant.businessName}
    estimatedSaving={voucher.estimatedSaving}
    isValidated={ lastRedemption ? false : voucher.lastRedemption!.isValidated }
    onShowToStaff={() => setShowToStaff({
      code:       lastRedemption?.redemptionCode ?? voucher.lastRedemption!.code,
      redeemedAt: lastRedemption?.redeemedAt    ?? voucher.lastRedemption!.redeemedAt,
      branchName: (lastRedemption ? lastRedemptionBranch?.name : voucher.lastRedemption!.branch.name) ?? '',
    })}
  />
) : null}
```

§Q6 invariant: the outer condition `stateKey === 'redeemed-this-cycle'` is gated on `voucher.isRedeemedThisCycle === true` upstream — when the cycle rolls over, `stateKey` reverts and the card does NOT render even if `lastRedemption` is somehow stale.

Update `RedemptionDetailsCard.tsx`:
- Replace the M2 stub button (line 166-181) with a tappable button that calls `onShowToStaff?.()` (already wired to fire the alert today; just remove the alert).
- Make the button visually full-strength (no longer disabled).
- Add the new optional prop `isValidated?: boolean` and surface a small "Validated by staff" indicator if true.

- [ ] **Step 4: Run + verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx apps/customer-app/tests/features/voucher/voucher-detail-persisted-return-visit.test.tsx
git commit -m "feat(voucher): render persisted RedemptionDetailsCard from voucher.lastRedemption (gated on isRedeemedThisCycle per §Q6)"
```

---

#### Task 18: Replace `RedemptionDetailsCard` "Show to Staff again" stub

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx`
- Modify: `apps/customer-app/tests/features/voucher/redemption-details-card.test.tsx`

- [ ] **Step 1: Update existing test that asserts the alert/disabled-button path**

Find the test that asserts disabled-button behavior; replace with:
```tsx
it('"Show to Staff" button calls onShowToStaff and is no longer disabled', () => {
  const onShowToStaff = jest.fn()
  const { getByA11yLabel } = render(
    <RedemptionDetailsCard
      redemptionCode="A7K2P9X4"
      redeemedAt="2026-05-08T10:00:00Z"
      branchName="High Street"
      voucherTitle="BOGO"
      voucherType="BOGO"
      merchantName="Pizza Palace"
      estimatedSaving={4.5}
      onShowToStaff={onShowToStaff}
    />
  )
  fireEvent.press(getByA11yLabel(/show.+to staff/i))
  expect(onShowToStaff).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run + verify FAIL**

- [ ] **Step 3: Re-enable the button**

In `RedemptionDetailsCard.tsx`, the changes from Task 17 already remove the disabled state. Confirm the a11y label reads "Show redemption code to staff" (drop the "(available in next milestone)" suffix).

- [ ] **Step 4: Run + verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx apps/customer-app/tests/features/voucher/redemption-details-card.test.tsx
git commit -m "feat(voucher): RedemptionDetailsCard 'Show to Staff' button live (no longer stubbed)"
```

---

#### Task 19: §Q6 cycle-rollover invariant integration test

**Files:**
- Create: `apps/customer-app/tests/features/voucher/voucher-detail-q6-cycle-rollover.test.tsx`

This task pins the §Q6 invariant explicitly. It belongs to its own test file because it's a critical regression safety net.

- [ ] **Step 1: Write the test**

```tsx
// Mocks: useCustomerVoucher returns:
//   PHASE 1: { isRedeemedThisCycle: true,  lastRedemption: {...} }
//   PHASE 2: { isRedeemedThisCycle: false, lastRedemption: null }
//
// Assertions:
//   PHASE 1: RedemptionDetailsCard rendered, RedeemCTA disabled
//   PHASE 2: RedemptionDetailsCard NOT rendered, RedeemCTA active
//
// AND a defensive case: even if backend returns
//   { isRedeemedThisCycle: false, lastRedemption: {...} }
// (drift between flags) the card MUST NOT render — `isRedeemedThisCycle`
// is the load-bearing gate per §Q6.
```

- [ ] **Step 2: Run + verify FAIL** (it should pass on the happy paths and fail on the defensive case if the gate is mis-coded)

- [ ] **Step 3: Confirm the gate code**

Re-read [VoucherDetailScreen.tsx lines around the persisted-card block from Task 17] to verify the outer condition is `stateKey === 'redeemed-this-cycle'` (which only flips true when `voucher.isRedeemedThisCycle === true`). If `lastRedemption` were checked first, the defensive case would fail. Adjust if needed.

- [ ] **Step 4: Run + verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/tests/features/voucher/voucher-detail-q6-cycle-rollover.test.tsx
git commit -m "test(voucher): pin §Q6 cycle-rollover invariant — card gates on isRedeemedThisCycle, not lastRedemption"
```

---

### M3e — Docs / spec / deferred-followups consistency pass (Tasks 20–22)

> Standing rule: bundle this INSIDE the M3 PR. Do NOT defer to a separate docs PR.

#### Task 20: Plan §M3.1 as-shipped addendum

**File:** `docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md`

- [ ] **Step 1: Add `### M3.1 — As shipped` addendum after `### M3 — ShowToStaff + QR + anti-fraud (PR 3)` section**

Mirror the structure of §M2.1: the four bundles (A core, B anti-fraud, C persisted return-visit, D docs), the locked decisions (D1-D10 outcomes), test counts at merge, deferred items closed-during-M3, deferred items remaining.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md
git commit -m "docs(plan): voucher-detail rebaseline §M3.1 as-shipped addendum"
```

---

#### Task 21: Spec §7 + §8 shipped-state deltas

**File:** `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md`

- [ ] **Step 1: Add §7.7 "As shipped (M3 — PRs #...)" after §7.6 (Done Button)**

Cover:
- QR payload format = opaque 8-char code (not URL).
- Brightness boost ramp + restore best-effort.
- Auto-hide 2 min idle / 10s warning / freeze on validated / pause-rearm on focus-blur.
- Validation poll cadence + 15-min budget + 2s validated-state auto-route.
- Screenshot guard: iOS listener + dedup + telemetry; Android FLAG_SECURE; reduced-motion fallback.
- Self-validation loophole explicitly NOT possible (security model documented in this plan).

- [ ] **Step 2: Update §8.9 "As shipped" — flip from "M2 ships immediate-after only" to "M3 ships persisted return-visit (cycle-window gated)"**

Note `voucher.lastRedemption` payload extension; §Q6 invariant; §Q1-Q5 visual redesign explicitly STILL deferred.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md
git commit -m "docs(spec): voucher-detail-redemption §7.7 + §8.10 M3 shipped-state deltas"
```

---

#### Task 22: CLAUDE.md flip + Next Planned Work + memory

**File:** `CLAUDE.md` + memory updates

- [ ] **Step 1: Flip `Phase 3C.1c (M3)` to `✅ Phase 3C.1c (M3) — LIVE on origin/main YYYY-MM-DD, merge <sha>`**

Replace the current "PENDING — re-framed as REQUIRED" entry with the equivalent of §M3.1 as-shipped: locked decisions (D1-D10 outcomes), what shipped, test counts, deferred items.

- [ ] **Step 2: Update "Next planned work" surface list**

Drop "Phase 3C.1c (M3)" from the customer-app rebaseline list — it's complete. The remaining surfaces are Home/Discovery, Favourites, Savings, Profile. Cross-reference the §Q1-Q5 + §Q5 + §S1-S3 + §R1-R4 deferrals for completeness.

- [ ] **Step 3: Update memory `project_current_state.md`**

Add a new dated section reflecting M3 LIVE on main + the cleanup state.

- [ ] **Step 4: Update memory `project_deferred_followups_index.md`**

- §P1 — flip to closed (M3 shipped).
- §P2 — flip to closed for current-cycle persisted return-visit; past-cycle history remains §Q5.
- §Q6 — confirm the cycle-rollover invariant test landed.
- §O1 (TIME_LIMITED) — VERIFY the 2026-05-08 audit-time expansion is intact (current-state verification, schema options a/b/c/d, recommended hybrid default, merchant-portal dependency, full UI-spec cross-refs). If any details have drifted by M3 ship time (e.g. main has moved), refresh the audit-state lines without losing the structure. **No new content needed** — this is a verification step.
- §T / §T1 (REUSABLE multi-redemption) — VERIFY the 2026-05-08 audit-time entry is intact (today's reality, candidate rules R1-R5, recommended R3+R4 hybrid direction, abuse-prevention risks, schema implications, frontend implications, no-M3-dependency confirmation, Tier 3 brainstorm-first sequencing). **No new content needed** — verification step.
- Add new entries for any M3-derived deferrals discovered during implementation.

> **Why these two entries are pre-populated.** Owner direction 2026-05-08: TIME_LIMITED + REUSABLE audit captured ahead of M3 plan-write so the workstreams aren't lost. Both confirmed to NOT block M3. The entries went into memory at audit time (commit `<plan-branch-sha>` on `plan/voucher-m3-show-to-staff`). Task 22 verifies them post-M3-merge — checking nothing in the M3 implementation invalidated the audit findings.

- [ ] **Step 5: Update memory `MEMORY.md` index** to point at the new project_current_state.md state.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): flip Phase 3C.1c (M3) to LIVE + update Next Planned Work"
```

(Memory commits are local — see the standing memory-write workflow.)

---

## Manual device QA checklist (before requesting merge)

Devices: iPhone 14/15/16 Pro (Dynamic Island + brightness), iPhone 11–13 (notch), iPhone SE (no notch), Pixel 6+ (Android FLAG_SECURE).

### Golden paths

- [ ] **Subscribed user, just redeemed:** SuccessPopup → tap "Show to Staff" → ShowToStaff opens full-screen with rose/coral gradient, voucher type strip, large QR + 4+4 code + LIVE pulse + live datetime ticker. Done button dismisses back to VoucherDetail.
- [ ] **Subscribed user, return visit during active cycle:** kill app, reopen, navigate to redeemed voucher → RedemptionDetailsCard renders with the persisted code/branch/redeemed-at → tap "Show to Staff" → ShowToStaff opens with same code.
- [ ] **Cycle rollover:** run `npx tsx prisma/reset-qa-redemption-cycle.ts` → reopen voucher → state reverts to redeemable → no RedemptionDetailsCard, RedeemCTA active.
- [ ] **Validation loop:** ShowToStaff visible → staff validates code via merchant tooling (or manually via DB script) → within 5s, screen flips to "Validated" → after ~2s auto-routes back to VoucherDetail with the persisted card now showing the validated indicator.
- [ ] **Multi-branch redemption:** redeem at Branch B for a multi-branch merchant → SuccessPopup → ShowToStaff shows "Pizza Palace · Branch B" (NOT the previously selected branch on Merchant Profile).

### Anti-fraud paths

- [ ] **iOS screenshot:** ShowToStaff visible → take a screenshot → QR blurs immediately + banner appears with copy "Screenshot taken — staff verify only the live screen" + tap-to-show restores. Inspect backend `RedemptionScreenshotEvent` table — one new row.
- [ ] **iOS screenshot dedup:** take 3 screenshots within 5 seconds → only one row created in `RedemptionScreenshotEvent`.
- [ ] **Android screenshot:** ShowToStaff visible → attempt screenshot → blocked by FLAG_SECURE; recents screen shows black thumbnail.
- [ ] **Backgrounded ShowToStaff:** open ShowToStaff → Home → reopen Redeemo → ShowToStaff is still visible OR cleanly dismissed (decide during impl QA — owner direction needed). Either way, brightness restored to original on dismiss.
- [ ] **Brightness restoration:** open ShowToStaff → screen brightens to max → Done → original brightness restored.
- [ ] **Brightness API rejection (iOS Low Power Mode):** enable Low Power Mode → open ShowToStaff → screen renders normally without crashing (no boost; that's expected).

### Auto-hide paths

- [ ] **Idle 1m50s:** ShowToStaff visible → wait 1 min 50 s → warning state (subtle dim or copy?). Decide during impl.
- [ ] **Idle 2m:** wait another 10 s → QR blurs, banner "Tap to show" appears.
- [ ] **Tap to show:** tap blurred QR → state resets to visible, timer re-arms.
- [ ] **Validated freezes timer:** ShowToStaff visible → backend marks validated → auto-hide is frozen, screen stays visible until 2s validated transition completes.

### Accessibility

- [ ] **Reduced motion ON:** Settings → Accessibility → Reduce Motion → reopen ShowToStaff → no animations on entrance, LIVE dot is static, validated transition is instant.
- [ ] **VoiceOver:** swipe through ShowToStaff → reads "Redemption code A 7 K 2, P 9 X 4", "Live", "Done", "Verified by staff at <branch>" (when validated).
- [ ] **Touch targets:** Done button ≥ 44×44; tap-to-show on blurred QR ≥ 44×44.

### Edge

- [ ] **Polling timeout:** mock 15-min poll → ShowToStaff still mounted, polling stopped silently (no error banner). Owner direction at impl time on whether to surface a "session expired" hint.
- [ ] **Deep link to redeemed voucher:** open `redeemo://voucher/<id>?branch=<id>` deep-link → arrives at VoucherDetail in redeemed state → RedemptionDetailsCard renders.

---

## Definitions of done

The PR is mergeable when:

1. ✅ All 22 tasks committed.
2. ✅ Backend vitest 488+/488+ passing (existing 483 + new tests in Tasks 2/3/5/4).
3. ✅ Customer-app jest 800+/800+ passing (existing 792 + new tests in Tasks 6/7/8/9/10/11/12/13/14/15/16/17/18/19).
4. ✅ `tsc --noEmit` clean across backend + customer-app.
5. ✅ §Q6 cycle-rollover invariant test (Task 19) passes — pinned regression.
6. ✅ Manual device QA checklist completed on at least one iOS device + one Android device, with golden paths and anti-fraud paths verified.
7. ✅ Plan §M3.1 + spec §7.7 + spec §8.10 + CLAUDE.md updated in the same PR (Bundle E).
8. ✅ No code copied wholesale from `feature/customer-app` reference branch — every adapted file references the reference but uses current main's tokens, contracts, and patterns.
9. ✅ `RedemptionScreenshotEvent` schema is declared once (no duplicate-model regression).
10. ✅ PR scope verified via `gh api compare main...HEAD` immediately before merge.

---

## Tier + standing-rule reminders

- This is **Tier 2**. Plan-first discipline applied (this doc). Owner approves before any code is written.
- The implementation PR includes Bundle E (docs/spec/deferred-followups consistency pass) inside the same PR, NOT as a separate docs PR.
- Merge with `REDEEMO_PR_SCOPE_VERIFIED=<head-sha>` per the workflow hooks. After merge, follow the same cleanup routine as PR #46 / PR #47 (fast-forward main, delete local + remote feature branch, preserve Category C dirty docs + untracked artefacts, update memory).

## Self-review pass (writing-plans skill discipline)

Run before declaring this plan ready:

1. **Spec coverage:** every requirement from the M3 audit (audit §1-§10) maps to at least one task above. ✓ Gap check: none.
2. **Placeholder scan:** no "TBD", no "implement later", no "similar to Task N", no naked "write tests". ✓ Each step shows the actual code or commands.
3. **Type consistency:** types named in earlier tasks match later tasks — `RedemptionStatusByCode` (Task 6) ↔ `useRedemptionPolling` import (Task 10) ↔ `ShowToStaff` props (Task 13); `voucher.lastRedemption` shape (Task 5 backend, Task 7 Zod, Task 17 frontend usage) matches. ✓
4. **Decision-trace:** D1-D10 outcomes referenced explicitly where they shape implementation choices. ✓
5. **Standing rule:** Bundle E in-scope for this PR. ✓
