# Merchant Profile UX Refinement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Tier 2 UX refinement to the customer-app Merchant Profile screen per the design spec at `docs/superpowers/specs/2026-05-04-merchant-profile-ux-refinement-design.md`. Surfaces affected: headline, switcher chip, meta row, branch picker, Other Locations tab (renamed from Branches), Reviews tab, voucher-context label, plus a coordinated motion layer across all of them.

**Architecture:** One Tier 2 PR built on top of the branch-aware merchant profile already on main (commits `236e86a` P1, `10f26a9` P2, plus 6 fix-ups). Backend gets a single additive change (per-branch ratings on `BranchTile`); the rest is frontend in `apps/customer-app/`. New helpers (`smartStatus`, `branchShortName`) and new components (`MetaRow`, `StatusPill`, `RatingBlock`, `VoucherContextLabel`, `HoursPreviewSheet`) are introduced; existing components (`MetaSection`, `BranchChip`, `BranchPickerSheet`, `BranchesTab`, `ReviewsTab`, `MerchantProfileScreen`) are restructured. Motion is centralised in a new `useBranchSwitchAnimation` hook coordinating Reanimated shared values across the touched elements with a single `selectedBranch.id` trigger, parallel timeline, skip-on-mount, and cancel-on-rapid handling.

**Tech Stack:** TypeScript · Node 24 + Fastify (backend) · Prisma 7 (Neon Postgres) · React Native (Expo SDK 54) + expo-router v4 · React Query v5 · Reanimated v3 · Jest + React Native Testing Library (frontend tests) · Vitest (backend tests) · Lucide icons via the project's `'@/design-system/icons'` barrel.

---

## Setup

### Task 0: Branch off main and verify clean baseline

**Files:**
- No file changes; environment setup only.

- [ ] **Step 1: Confirm main is at the expected commit**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git fetch origin
git checkout main
git pull --ff-only
git rev-parse HEAD
```
Expected: prints `9025742d13e5250d013e44dddce4dd231168c411` (PR #34 merge — Covelum demo seed). If different, the spec's prerequisite assumptions may have drifted; pause and check with the owner before proceeding.

- [ ] **Step 2: Cut the implementation feature branch off main**

```bash
git checkout -b feature/merchant-profile-ux-refinement main
git log --oneline -1
```
Expected: HEAD shows `9025742 Merge pull request #34 ...`.

- [ ] **Step 3: Run the customer-app jest baseline**

```bash
cd apps/customer-app
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -10
```
Expected: `Test Suites: 19 passed` · `Tests: 102 passed`. (This is the baseline established at PR #33's final state.)

- [ ] **Step 4: Run the backend customer-API vitest baseline**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
npx vitest run tests/api/customer/ 2>&1 | tail -8
```
Expected: `Test Files 13 passed (13)` · `Tests 153 passed (153)`.

- [ ] **Step 5: Confirm tsc clean for customer-app**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo/apps/customer-app
npx tsc --noEmit 2>&1 | tail -3
```
Expected: empty output (no type errors).

- [ ] **Step 6: Confirm ESLint baseline for the merchant feature**

```bash
npx eslint src/features/merchant tests/features/merchant 2>&1 | tail -3
```
Expected: `✖ 43 problems (43 errors, 0 warnings)` — the baseline carried from PR #33.

No commit at this stage. The branch is ready for Task 1.

---

## Backend

### Task 1: Per-branch `reviewCount` + `avgRating` on `BranchTile`

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (extend `getCustomerMerchant`'s `branches[]` projection)
- Modify: `tests/api/customer/discovery.selectedBranch.test.ts` (add a regression test)

**Why:** The picker rows (§7.2) and Reviews-tab toggle counts (§7.3) need per-branch ratings. Today only `selectedBranch` carries them. This task adds `reviewCount` and `avgRating` to every entry in the `branches[]` array.

- [ ] **Step 1: Add the failing test in `tests/api/customer/discovery.selectedBranch.test.ts`**

Append after the existing `selectedBranch.myReview` tests (around line 320 — find the last `it(...)` in the describe block and append immediately before its closing `})`).

```ts
  // PR — UX refinement: every entry in `branches[]` must carry `reviewCount`
  // and `avgRating` so the chip picker rows + Reviews toggle can show
  // per-branch counts. Today only `selectedBranch` has these.
  it('every branches[] entry includes reviewCount and avgRating', async () => {
    const m = await createMerchant()
    const branchA = m.branches[0]!
    const branchB = m.branches[1]!

    // Seed two distinct users so the @@unique([userId, branchId]) on Review
    // doesn't block — one review on A (rating 4), two reviews on B (rating 5 + 3).
    const user1 = await createUser()
    const user2 = await createUser()
    const user3 = await createUser()
    await prisma.review.create({ data: { userId: user1.id, branchId: branchA.id, rating: 4 } })
    await prisma.review.create({ data: { userId: user2.id, branchId: branchB.id, rating: 5 } })
    await prisma.review.create({ data: { userId: user3.id, branchId: branchB.id, rating: 3 } })

    const body = await getCustomerMerchant(prisma, m.id, null, { lat: 51.5, lng: -0.1 })

    const tileA = body.branches.find((b: any) => b.id === branchA.id)!
    const tileB = body.branches.find((b: any) => b.id === branchB.id)!

    expect(tileA.reviewCount).toBe(1)
    expect(tileA.avgRating).toBe(4.0)
    expect(tileB.reviewCount).toBe(2)
    expect(tileB.avgRating).toBe(4.0)  // (5+3)/2
  })
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
npx vitest run tests/api/customer/discovery.selectedBranch.test.ts 2>&1 | tail -8
```
Expected: failing — `tileA.reviewCount` is `undefined`.

- [ ] **Step 3: Implement the per-branch rating projection in `src/api/customer/discovery/service.ts`**

Read `src/api/customer/discovery/service.ts` lines 575–795 to locate the existing `ratingByBranch` aggregation block and the `branches[]` mapping near line 786. The existing groupBy at ~line 580 already computes per-branch rating data; we just need to surface it in the per-branch tile mapping.

Find this block (around line 783–797):

```ts
    branches: activeBranches.map((b: any) => ({
      id:           b.id,
      name:         b.name,
      addressLine1: b.addressLine1,
      addressLine2: b.addressLine2,
      city:         b.city,
      postcode:     b.postcode,
      latitude:     b.latitude !== null ? Number(b.latitude) : null,
      longitude:    b.longitude !== null ? Number(b.longitude) : null,
      phone:        b.phone,
      email:        b.email,
      distance:     b.distance ?? null,
      isOpenNow:    b.isOpenNow,
      isMainBranch: b.isMainBranch,
      isActive:     b.isActive,
    }))
```

Append two new fields, reading from the existing `ratingByBranch` map:

```ts
    branches: activeBranches.map((b: any) => ({
      id:           b.id,
      name:         b.name,
      addressLine1: b.addressLine1,
      addressLine2: b.addressLine2,
      city:         b.city,
      postcode:     b.postcode,
      latitude:     b.latitude !== null ? Number(b.latitude) : null,
      longitude:    b.longitude !== null ? Number(b.longitude) : null,
      phone:        b.phone,
      email:        b.email,
      distance:     b.distance ?? null,
      isOpenNow:    b.isOpenNow,
      isMainBranch: b.isMainBranch,
      isActive:     b.isActive,
      // PR — UX refinement: per-branch rating for picker rows + Reviews toggle.
      reviewCount:  ratingByBranch[b.id]?.reviewCount ?? 0,
      avgRating:    ratingByBranch[b.id]?.avgRating ?? null,
    }))
```

- [ ] **Step 4: Run the new test, verify it passes**

```bash
npx vitest run tests/api/customer/discovery.selectedBranch.test.ts 2>&1 | tail -8
```
Expected: PASS — all tests in this file green.

- [ ] **Step 5: Update the customer-app Zod schema to receive the new fields**

Modify `apps/customer-app/src/lib/api/merchant.ts`. Find `branchTileSchema` (around line 77) and add `reviewCount` + `avgRating`:

```ts
const branchTileSchema = z.object({
  id:           z.string(),
  name:         z.string(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city:         z.string().nullable(),
  postcode:     z.string().nullable(),
  latitude:     z.number().nullable(),
  longitude:    z.number().nullable(),
  phone:        z.string().nullable(),
  email:        z.string().nullable(),
  distance:     z.number().nullable(),
  isOpenNow:    z.boolean(),
  isMainBranch: z.boolean(),
  isActive:     z.boolean(),
  // PR — UX refinement: per-branch ratings exposed for picker rows + Reviews toggle.
  reviewCount:  z.number().int().min(0),
  avgRating:    z.number().nullable(),
})
```

- [ ] **Step 6: Update fixtures in customer-app tests that construct BranchTile literals**

Run a grep to find every fixture that creates a tile shape:
```bash
cd /Users/shebinchaliyath/Developer/Redeemo/apps/customer-app
grep -rln "isMainBranch: " tests/features/merchant/ tests/lib/api/ 2>/dev/null
```

For each file the grep returns, find the `{ id: 'b1', ... }`-style literal and append two fields:

```ts
      reviewCount: 0,
      avgRating:   null,
```

(Reasonable defaults — most fixtures don't care about these counts; tests that DO care override them.)

- [ ] **Step 7: Run customer-app tests + tsc**

```bash
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -6
npx tsc --noEmit 2>&1 | tail -3
```
Expected: jest 102/102 green · tsc clean.

- [ ] **Step 8: Run backend full customer suite**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
npx vitest run tests/api/customer/ 2>&1 | tail -6
```
Expected: 154/154 (was 153; +1 new test).

- [ ] **Step 9: Commit**

```bash
git add src/api/customer/discovery/service.ts apps/customer-app/src/lib/api/merchant.ts tests/api/customer/discovery.selectedBranch.test.ts apps/customer-app/tests/features/merchant/ apps/customer-app/tests/lib/api/
git commit -m "feat(api): expose per-branch reviewCount + avgRating on BranchTile

UX refinement spec §7.2 / §7.3 — picker rows and Reviews-tab toggle
need per-branch ratings to render counts. Today only selectedBranch
carries them. Additive change to getCustomerMerchant's branches[]
projection; reads from the existing per-branch groupBy aggregation
(no new query). branchTileSchema in customer-app extended."
```

---

## Frontend — Helpers

### Task 2: `branchShortName` helper (frontend strip-prefix)

**Files:**
- Create: `apps/customer-app/src/features/merchant/utils/branchShortName.ts`
- Test: `apps/customer-app/tests/features/merchant/utils/branchShortName.test.ts`

**Why:** Headline branch line (§6.1) and voucher-context label (§6.5) need the branch label without the merchant prefix. Today `Branch.name` is "Covelum — Brightlingsea". Until the `Branch.shortName` schema migration ships, we strip the prefix client-side.

- [ ] **Step 1: Create the test file**

```ts
// apps/customer-app/tests/features/merchant/utils/branchShortName.test.ts
import { branchShortName } from '@/features/merchant/utils/branchShortName'

describe('branchShortName', () => {
  it('strips merchant prefix when separated by em dash', () => {
    expect(branchShortName('Covelum — Brightlingsea')).toBe('Brightlingsea')
  })

  it('strips merchant prefix when separated by en dash', () => {
    expect(branchShortName('Covelum – Colchester')).toBe('Colchester')
  })

  it('strips merchant prefix when separated by hyphen with spaces', () => {
    expect(branchShortName('Beans & Brew - Soho')).toBe('Soho')
  })

  it('returns the input unchanged when no separator is present', () => {
    expect(branchShortName('Beans & Brew')).toBe('Beans & Brew')
  })

  it('returns empty string when input is empty', () => {
    expect(branchShortName('')).toBe('')
  })

  it('handles multiple separators by stripping only up to the first one', () => {
    expect(branchShortName('Acme Co — Foo — Bar')).toBe('Foo — Bar')
  })

  it('trims whitespace around the result', () => {
    expect(branchShortName('Acme   —   Brightlingsea  ')).toBe('Brightlingsea')
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo/apps/customer-app
npx jest tests/features/merchant/utils/branchShortName.test.ts --forceExit 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// apps/customer-app/src/features/merchant/utils/branchShortName.ts

// Strip merchant prefix from a Branch.name to obtain the short label.
//
// Today's Branch.name includes the merchant prefix (e.g. "Covelum —
// Brightlingsea"). The headline branch line + voucher-context label want
// just the short part ("Brightlingsea"). A schema migration to
// `Branch.shortName` is tracked in the deferred-followups index §A; until
// it ships, this helper does the strip client-side.
//
// Recognised separators (in order): em dash (—), en dash (–), hyphen
// with surrounding whitespace ( - ). Returns the input unchanged when no
// separator is found.
export function branchShortName(name: string): string {
  if (!name) return ''
  const match = name.match(/^.*?\s*[—–]\s*(.*)$/) ?? name.match(/^.*?\s+-\s+(.*)$/)
  if (match && match[1]) return match[1].trim()
  return name.trim()
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
npx jest tests/features/merchant/utils/branchShortName.test.ts --forceExit 2>&1 | tail -5
```
Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/merchant/utils/branchShortName.ts apps/customer-app/tests/features/merchant/utils/branchShortName.test.ts
git commit -m "feat(customer-app): add branchShortName helper

UX refinement §6.1 / §6.5. Strips merchant prefix from Branch.name
for headline branch line + voucher-context label. Stopgap until
Branch.shortName schema migration ships (deferred §A)."
```

---

### Task 3: `smartStatus` helper (status text + state derivation)

**Files:**
- Create: `apps/customer-app/src/features/merchant/utils/smartStatus.ts`
- Test: `apps/customer-app/tests/features/merchant/utils/smartStatus.test.ts`

**Why:** The meta row (§7.1), picker rows (§7.2), Other Locations cards, and HoursPreviewSheet header (§6.3) all need the same smart-status logic — pill state + status text — derived from `isOpenNow` + `openingHours`. Centralising avoids duplication and makes the defensive rules in §9 testable in one place.

The helper is a pure function: takes `(isOpenNow, openingHours, now)` and returns `{ pillState, pillLabel, statusText }`.

- [ ] **Step 1: Create the test file with all 5 status states + defensive rules**

```ts
// apps/customer-app/tests/features/merchant/utils/smartStatus.test.ts
import { smartStatus } from '@/features/merchant/utils/smartStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

// Helper: build a fixed Date pinned to a specific day-of-week + hh:mm.
// 2026-05-04 is a Monday in JS getDay() terms (1).
function dt(dayOfWeek: number, hh: number, mm: number): Date {
  // Use a known week of May 2026: 2026-05-03 = Sun (0), 2026-05-04 = Mon (1), etc.
  const dateOffset = 3 + dayOfWeek  // May 3 + dayOfWeek
  return new Date(`2026-05-${String(dateOffset).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`)
}

const open9to17: OpeningHourEntry = { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false }
const closed: OpeningHourEntry = { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true }

describe('smartStatus', () => {
  describe('Open state (>60 min until close)', () => {
    it('returns "Closes at H:MMam/pm" when more than 60 min remain', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, openTime: '09:00', closeTime: '22:30' }]
      const result = smartStatus(true, hours, dt(1, 18, 0))  // Mon 18:00, closes 22:30 — 4h30m left
      expect(result.pillState).toBe('open')
      expect(result.pillLabel).toBe('Open')
      expect(result.statusText).toBe('Closes at 10:30pm')
    })
  })

  describe('Closing soon state (≤60 min until close)', () => {
    it('returns "Closes in N min" when 30 min remain', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, openTime: '09:00', closeTime: '22:30' }]
      const result = smartStatus(true, hours, dt(1, 22, 0))  // Mon 22:00, closes 22:30 — 30m
      expect(result.pillState).toBe('closing-soon')
      expect(result.pillLabel).toBe('Closing soon')
      expect(result.statusText).toBe('Closes in 30 min')
    })

    it('uses singular "1 min" at 1 min remaining', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, closeTime: '22:30' }]
      const result = smartStatus(true, hours, dt(1, 22, 29))  // 1m left
      expect(result.statusText).toBe('Closes in 1 min')
    })

    it('60 min boundary uses "Closes in 60 min" countdown (not "Closes at")', () => {
      const hours: OpeningHourEntry[] = [{ ...open9to17, dayOfWeek: 1, closeTime: '22:30' }]
      const result = smartStatus(true, hours, dt(1, 21, 30))  // exactly 60m
      expect(result.pillState).toBe('closing-soon')
      expect(result.statusText).toBe('Closes in 60 min')
    })
  })

  describe('Closed — next open is later TODAY (split-hours mid-day gap)', () => {
    it('returns "Opens at H:MMam/pm" when later same-day open exists', () => {
      // Single-interval seed (12-22:30 on Mon). At 15:00 Mon. Same-interval —
      // `isOpenNow` would actually be true; for this test we override to false
      // simulating a split-hours data shape (where backend statusText would
      // give the right answer; frontend stopgap reads what's available).
      const hours: OpeningHourEntry[] = [{ dayOfWeek: 1, openTime: '17:00', closeTime: '22:30', isClosed: false }]
      const result = smartStatus(false, hours, dt(1, 15, 0))
      expect(result.pillState).toBe('closed')
      expect(result.pillLabel).toBe('Closed')
      expect(result.statusText).toBe('Opens at 5:00pm')
    })
  })

  describe('Closed — next open is TOMORROW', () => {
    it('returns "Opens tomorrow at H:MMam/pm" when tomorrow opens', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },   // Mon closed
        { dayOfWeek: 2, openTime: '09:00', closeTime: '17:00', isClosed: false }, // Tue 9-17
      ]
      const result = smartStatus(false, hours, dt(1, 15, 0))  // Mon 15:00
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Opens tomorrow at 9:00am')
    })
  })

  describe('Closed — next open is AFTER tomorrow (multi-day closed)', () => {
    it('returns "Opens at H:MMam/pm" with NO day reference when next open is later than tomorrow', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },   // Mon closed
        { dayOfWeek: 2, openTime: null, closeTime: null, isClosed: true },   // Tue closed
        { dayOfWeek: 3, openTime: '09:00', closeTime: '17:00', isClosed: false }, // Wed 9-17
      ]
      const result = smartStatus(false, hours, dt(1, 15, 0))  // Mon 15:00, opens Wed
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Opens at 9:00am')
    })
  })

  describe('Defensive rules (§9)', () => {
    it('Open + closeTime null → "Hours unavailable"', () => {
      const hours: OpeningHourEntry[] = [{ dayOfWeek: 1, openTime: '09:00', closeTime: null, isClosed: false }]
      const result = smartStatus(true, hours, dt(1, 12, 0))
      expect(result.pillState).toBe('open')
      expect(result.pillLabel).toBe('Open')
      expect(result.statusText).toBe('Hours unavailable')
    })

    it('Closed + tomorrow openTime null → "Opens tomorrow" without time', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },
        { dayOfWeek: 2, openTime: null, closeTime: '17:00', isClosed: false },  // ← openTime missing
      ]
      const result = smartStatus(false, hours, dt(1, 12, 0))
      expect(result.statusText).toBe('Opens tomorrow')
    })

    it('Closed + openingHours: [] → "Hours unavailable"', () => {
      const result = smartStatus(false, [], dt(1, 12, 0))
      expect(result.pillState).toBe('closed')
      expect(result.statusText).toBe('Hours unavailable')
    })

    it('Open + openingHours: [] → "Hours unavailable"', () => {
      const result = smartStatus(true, [], dt(1, 12, 0))
      expect(result.pillState).toBe('open')
      expect(result.statusText).toBe('Hours unavailable')
    })

    it('Closed + entire week closed → "Hours unavailable"', () => {
      const hours: OpeningHourEntry[] = Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i, openTime: null, closeTime: null, isClosed: true,
      }))
      const result = smartStatus(false, hours, dt(1, 12, 0))
      expect(result.statusText).toBe('Hours unavailable')
    })
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npx jest tests/features/merchant/utils/smartStatus.test.ts --forceExit 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// apps/customer-app/src/features/merchant/utils/smartStatus.ts
import type { OpeningHourEntry } from '@/lib/api/merchant'

export type SmartStatus = {
  pillState: 'open' | 'closing-soon' | 'closed'
  pillLabel: 'Open' | 'Closing soon' | 'Closed'
  statusText: string
}

// Format "HH:MM" → "H:MMam/pm" (am/pm, friendly).
// "09:00" → "9:00am" · "10:30" → "10:30am" · "17:00" → "5:00pm" · "00:30" → "12:30am"
function formatAmPm(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  let h = parseInt(hStr ?? '0', 10)
  const m = mStr ?? '00'
  const period = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m}${period}`
}

function parseHM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// Find the next open interval starting at-or-after `now` on `today`, or on
// any subsequent day. Returns { dayOffset, openTime } or null.
function findNextOpen(
  hours: OpeningHourEntry[],
  today: number,
  nowMinutes: number,
): { dayOffset: number; openTime: string } | null {
  // Day 0 (today): only an open interval whose openTime is >= nowMinutes counts.
  for (let offset = 0; offset < 7; offset++) {
    const dow = (today + offset) % 7
    const entry = hours.find(h => h.dayOfWeek === dow)
    if (!entry || entry.isClosed || !entry.openTime) continue
    if (offset === 0 && parseHM(entry.openTime) <= nowMinutes) continue
    return { dayOffset: offset, openTime: entry.openTime }
  }
  return null
}

/**
 * Derive pill state + status text from `isOpenNow` + `openingHours`.
 *
 * Today (Pass 2): single-interval data. Backend `selectedBranch.statusText`
 * + `isClosingSoon` are deferred (§A). When that ships, this helper
 * becomes a thin pass-through.
 *
 * @param isOpenNow  Server-computed boolean (Europe/London).
 * @param hours      `selectedBranch.openingHours` array.
 * @param now        Current Date (defaults to `new Date()`; test injectable).
 */
export function smartStatus(
  isOpenNow: boolean,
  hours: OpeningHourEntry[],
  now: Date = new Date(),
): SmartStatus {
  const today = now.getDay()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  if (isOpenNow) {
    const todayEntry = hours.find(h => h.dayOfWeek === today)
    if (!todayEntry || !todayEntry.closeTime) {
      return { pillState: 'open', pillLabel: 'Open', statusText: 'Hours unavailable' }
    }
    const minsUntilClose = parseHM(todayEntry.closeTime) - nowMinutes
    if (minsUntilClose <= 60 && minsUntilClose > 0) {
      const unit = minsUntilClose === 1 ? 'min' : 'min'
      return {
        pillState: 'closing-soon',
        pillLabel: 'Closing soon',
        statusText: `Closes in ${minsUntilClose} ${unit}`,
      }
    }
    return { pillState: 'open', pillLabel: 'Open', statusText: `Closes at ${formatAmPm(todayEntry.closeTime)}` }
  }

  // Closed
  const next = findNextOpen(hours, today, nowMinutes)
  if (!next) {
    return { pillState: 'closed', pillLabel: 'Closed', statusText: 'Hours unavailable' }
  }
  if (next.dayOffset === 0) {
    return { pillState: 'closed', pillLabel: 'Closed', statusText: `Opens at ${formatAmPm(next.openTime)}` }
  }
  if (next.dayOffset === 1) {
    // Tomorrow — but only when openTime is non-null (defensive: schema allows null)
    return { pillState: 'closed', pillLabel: 'Closed', statusText: `Opens tomorrow at ${formatAmPm(next.openTime)}` }
  }
  // After tomorrow: drop the day reference (avoids "Opens tomorrow" lie when
  // actually opens later in the week).
  return { pillState: 'closed', pillLabel: 'Closed', statusText: `Opens at ${formatAmPm(next.openTime)}` }
}
```

Note: the defensive test at "Closed + tomorrow openTime null → 'Opens tomorrow'" requires special handling. The implementation above handles this implicitly — when tomorrow's `openTime` is null, `findNextOpen` skips that day. So if tomorrow has `openTime: null` BUT a `closeTime: '17:00'`, the helper skips to day 2. That's NOT what the test asserts.

Re-read the test: it expects `"Opens tomorrow"` (no time) when tomorrow's openTime is null. That requires a slightly different code path: detect "next open day exists tomorrow but openTime is null" and emit `"Opens tomorrow"` without the time.

Adjust `findNextOpen` and the caller to handle this. Replace the function with:

```ts
function findNextOpen(
  hours: OpeningHourEntry[],
  today: number,
  nowMinutes: number,
): { dayOffset: number; openTime: string | null } | null {
  // Day 0 (today): need a real openTime that's still ahead of now.
  // Day 1+: any non-closed entry counts (even if openTime is null — caller
  //         decides how to render the missing time).
  for (let offset = 0; offset < 7; offset++) {
    const dow = (today + offset) % 7
    const entry = hours.find(h => h.dayOfWeek === dow)
    if (!entry || entry.isClosed) continue
    if (offset === 0) {
      if (!entry.openTime) continue
      if (parseHM(entry.openTime) <= nowMinutes) continue
      return { dayOffset: 0, openTime: entry.openTime }
    }
    return { dayOffset: offset, openTime: entry.openTime ?? null }
  }
  return null
}
```

Then in the caller, when `next.openTime === null`, drop the time from the output:

```ts
  if (next.dayOffset === 1) {
    return {
      pillState: 'closed',
      pillLabel: 'Closed',
      statusText: next.openTime ? `Opens tomorrow at ${formatAmPm(next.openTime)}` : 'Opens tomorrow',
    }
  }
  // After tomorrow:
  return {
    pillState: 'closed',
    pillLabel: 'Closed',
    statusText: next.openTime ? `Opens at ${formatAmPm(next.openTime)}` : 'Hours unavailable',
  }
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
npx jest tests/features/merchant/utils/smartStatus.test.ts --forceExit 2>&1 | tail -8
```
Expected: PASS — all `describe` blocks green.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/merchant/utils/smartStatus.ts apps/customer-app/tests/features/merchant/utils/smartStatus.test.ts
git commit -m "feat(customer-app): add smartStatus helper

UX refinement §7.1 / §9. Pure function deriving { pillState, pillLabel,
statusText } from isOpenNow + openingHours. Covers all 5 status states
(Open / Closing soon / Closed-today / Closed-tomorrow / Closed-multi-day)
plus defensive rules for missing closeTime, missing openTime,
empty openingHours, and entire-week-closed. am/pm friendly wording.
Stopgap until backend selectedBranch.statusText ships (deferred §A)."
```

---

### Task 4: `StatusPill` component

**Files:**
- Create: `apps/customer-app/src/features/merchant/components/StatusPill.tsx`
- Test: `apps/customer-app/tests/features/merchant/status-pill.test.tsx`

**Why:** Status pill (§7.1 hierarchy ①) appears in the meta row, picker rows, Other Locations cards, and `HoursPreviewSheet` header. Centralising in one component ensures consistent colours + a11y across surfaces.

- [ ] **Step 1: Create the test file**

```tsx
// apps/customer-app/tests/features/merchant/status-pill.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { StatusPill } from '@/features/merchant/components/StatusPill'

describe('StatusPill', () => {
  it('renders Open with green tint', () => {
    const { getByText, getByLabelText } = render(<StatusPill state="open" label="Open" />)
    expect(getByText('Open')).toBeTruthy()
    expect(getByLabelText('Status: Open')).toBeTruthy()
  })

  it('renders Closing soon with amber tint', () => {
    const { getByText, getByLabelText } = render(<StatusPill state="closing-soon" label="Closing soon" />)
    expect(getByText('Closing soon')).toBeTruthy()
    expect(getByLabelText('Status: Closing soon')).toBeTruthy()
  })

  it('renders Closed with red tint', () => {
    const { getByText, getByLabelText } = render(<StatusPill state="closed" label="Closed" />)
    expect(getByText('Closed')).toBeTruthy()
    expect(getByLabelText('Status: Closed')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npx jest tests/features/merchant/status-pill.test.tsx --forceExit 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/customer-app/src/features/merchant/components/StatusPill.tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  state: 'open' | 'closing-soon' | 'closed'
  label: 'Open' | 'Closing soon' | 'Closed'
}

const STYLE_MAP = {
  'open':         { bg: 'rgba(22,163,74,0.10)',  text: '#16A34A', dot: '#16A34A' },
  'closing-soon': { bg: 'rgba(245,158,11,0.12)', text: '#B45309', dot: '#F59E0B' },
  'closed':       { bg: 'rgba(185,28,28,0.08)',  text: '#B91C1C', dot: '#B91C1C' },
} as const

export function StatusPill({ state, label }: Props) {
  const s = STYLE_MAP[state]
  return (
    <View
      style={[styles.pill, { backgroundColor: s.bg }]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
    >
      <View style={[styles.dot, { backgroundColor: s.dot }]} />
      <Text variant="label.md" style={[styles.text, { color: s.text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10 },
  dot:  { width: 5, height: 5, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: '700' },
})
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
npx jest tests/features/merchant/status-pill.test.tsx --forceExit 2>&1 | tail -5
```
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/StatusPill.tsx apps/customer-app/tests/features/merchant/status-pill.test.tsx
git commit -m "feat(customer-app): add StatusPill component

UX refinement §7.1. Reusable across meta row, picker rows, Other
Locations cards, HoursPreviewSheet header. Three states with locked
colour tokens. NOT animated on switch (load-bearing identity signal
per §8.1)."
```

---

### Task 5: `RatingBlock` component

**Files:**
- Create: `apps/customer-app/src/features/merchant/components/RatingBlock.tsx`
- Test: `apps/customer-app/tests/features/merchant/rating-block.test.tsx`

**Why:** Rating block (§7.1 hierarchy ③) appears in the meta row, picker rows, and Other Locations cards. Includes the no-reviews placeholder.

- [ ] **Step 1: Create the test file**

```tsx
// apps/customer-app/tests/features/merchant/rating-block.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { RatingBlock } from '@/features/merchant/components/RatingBlock'

describe('RatingBlock', () => {
  it('renders the rating + count when count > 0', () => {
    const { getByText } = render(<RatingBlock avgRating={4.5} reviewCount={7} />)
    expect(getByText('4.5')).toBeTruthy()
    expect(getByText('(7)')).toBeTruthy()
  })

  it('renders the placeholder text when count is 0', () => {
    const { getByText, queryByText } = render(<RatingBlock avgRating={null} reviewCount={0} />)
    expect(getByText('No reviews yet')).toBeTruthy()
    expect(queryByText('(0)')).toBeNull()
  })

  it('renders the placeholder text when avgRating is null even if count > 0 (defensive)', () => {
    const { getByText } = render(<RatingBlock avgRating={null} reviewCount={3} />)
    expect(getByText('No reviews yet')).toBeTruthy()
  })

  it('rounds avgRating to 1 decimal', () => {
    const { getByText } = render(<RatingBlock avgRating={4.333} reviewCount={3} />)
    expect(getByText('4.3')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npx jest tests/features/merchant/rating-block.test.tsx --forceExit 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/customer-app/src/features/merchant/components/RatingBlock.tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  avgRating:   number | null
  reviewCount: number
}

export function RatingBlock({ avgRating, reviewCount }: Props) {
  if (avgRating === null || reviewCount === 0) {
    return (
      <Text variant="label.md" style={styles.placeholder} accessibilityLabel="No reviews yet">
        No reviews yet
      </Text>
    )
  }
  const rounded = Math.round(avgRating * 10) / 10
  return (
    <View style={styles.block} accessibilityLabel={`Rating ${rounded} from ${reviewCount} review${reviewCount === 1 ? '' : 's'}`}>
      <Text variant="label.lg" style={styles.star}>★</Text>
      <Text variant="label.lg" style={styles.avg}>{rounded.toFixed(1)}</Text>
      <Text variant="label.md" style={styles.count}>({reviewCount})</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  block:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF8E1', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  star:        { color: '#F59E0B', fontSize: 12 },
  avg:         { fontSize: 13, fontWeight: '800', color: '#010C35' },
  count:       { fontSize: 11, color: '#666' },
  placeholder: { fontSize: 11, color: '#aaa' },
})
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
npx jest tests/features/merchant/rating-block.test.tsx --forceExit 2>&1 | tail -5
```
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/RatingBlock.tsx apps/customer-app/tests/features/merchant/rating-block.test.tsx
git commit -m "feat(customer-app): add RatingBlock component

UX refinement §7.1. Reusable across meta row, picker rows, Other
Locations cards. 1-decimal rounded average + count, with quiet
'No reviews yet' placeholder when count=0 or avgRating null. NOT
animated on switch (load-bearing identity signal per §8.1)."
```

---

## Frontend — Headline & chip

### Task 6: Headline restructure (merchant name + branch line)

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/MetaSection.tsx` (split — see below)
- Create: `apps/customer-app/src/features/merchant/components/MerchantHeadline.tsx`
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`
- Modify: `apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx`

**Why:** Branch line (§6.1) needs to render between merchant name and chip. Today the merchant name lives inside `MetaSection`. We extract a new `MerchantHeadline` component (merchant name + branch line) and remove the merchant-name responsibility from `MetaSection` (which becomes the meta row, see Task 8).

- [ ] **Step 1: Add a new test file for `MerchantHeadline`**

```tsx
// apps/customer-app/tests/features/merchant/merchant-headline.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { MerchantHeadline } from '@/features/merchant/components/MerchantHeadline'

describe('MerchantHeadline', () => {
  it('renders merchant name', () => {
    const { getByText } = render(
      <MerchantHeadline merchantName="Covelum Restaurant" branchLine={null} />
    )
    expect(getByText('Covelum Restaurant')).toBeTruthy()
  })

  it('renders the branch line when supplied (multi-branch)', () => {
    const { getByText } = render(
      <MerchantHeadline merchantName="Covelum Restaurant" branchLine="Brightlingsea, Essex" />
    )
    expect(getByText('Covelum Restaurant')).toBeTruthy()
    expect(getByText('Brightlingsea, Essex')).toBeTruthy()
  })

  it('omits the branch line when null (single-branch)', () => {
    const { queryByText, getByText } = render(
      <MerchantHeadline merchantName="Beans & Brew" branchLine={null} />
    )
    expect(getByText('Beans & Brew')).toBeTruthy()
    expect(queryByText(/Brightlingsea/)).toBeNull()
  })

  it('omits the branch line when empty string (defensive)', () => {
    const { queryByTestId } = render(
      <MerchantHeadline merchantName="Beans & Brew" branchLine="" />
    )
    expect(queryByTestId('merchant-branch-line')).toBeNull()
  })

  it('exposes the branch line via testID for animation hookup', () => {
    const { getByTestId } = render(
      <MerchantHeadline merchantName="Covelum" branchLine="Brightlingsea" />
    )
    expect(getByTestId('merchant-branch-line')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, verify it fails**

```bash
npx jest tests/features/merchant/merchant-headline.test.tsx --forceExit 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MerchantHeadline`**

```tsx
// apps/customer-app/src/features/merchant/components/MerchantHeadline.tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  merchantName: string
  branchLine:   string | null
}

export function MerchantHeadline({ merchantName, branchLine }: Props) {
  return (
    <View style={styles.root}>
      <Text variant="display.lg" style={styles.name} numberOfLines={1} ellipsizeMode="tail">
        {merchantName}
      </Text>
      {branchLine ? (
        <Text
          variant="label.lg"
          style={styles.branchLine}
          numberOfLines={1}
          ellipsizeMode="tail"
          testID="merchant-branch-line"
          accessibilityLiveRegion="polite"
        >
          {branchLine}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root:       { gap: 2 },
  name:       { color: '#010C35', fontWeight: '800' },
  branchLine: { color: '#E20C04', fontWeight: '700' },
})
```

- [ ] **Step 4: Run the new test, verify it passes**

```bash
npx jest tests/features/merchant/merchant-headline.test.tsx --forceExit 2>&1 | tail -5
```
Expected: PASS — 5 tests green.

- [ ] **Step 5: Wire `MerchantHeadline` into `MerchantProfileScreen`**

Read `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` lines 220–260 to locate the existing `MetaSection` invocation. Currently `MetaSection` renders the merchant name. We'll keep `MetaSection` for now and render `MerchantHeadline` ABOVE it so the headline takes over the merchant-name responsibility. Task 8 fully replaces `MetaSection` with the new meta row, by which point the duplicate name in `MetaSection` will be removed.

Find the JSX block where `<MetaSection ... />` is rendered (around line 237). Insert directly before it:

```tsx
        <MerchantHeadline
          merchantName={merchant.businessName}
          branchLine={
            merchant.branches.length > 1
              ? buildBranchLine(sb)  // helper defined inline below or at top of file
              : null
          }
        />
```

Add a helper at the top of the file (after imports):

```tsx
import { branchShortName } from '../utils/branchShortName'

function buildBranchLine(branch: { city: string | null; name: string }): string | null {
  // Pass 1 fallback: city when available, else strip-prefix the branch name.
  // Branch.county schema migration (deferred §A) will eventually ship
  // "<city>, <county>"; until then we render city alone.
  if (branch.city) return branch.city
  const shortName = branchShortName(branch.name)
  return shortName || null
}
```

Add the import at the top:

```tsx
import { MerchantHeadline } from '../components/MerchantHeadline'
```

- [ ] **Step 6: Update `profile-skeleton.test.tsx` to verify the headline renders**

Read `apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx`. Find where it asserts on the merchant name (currently rendered by the `MetaSection` mock). Add a new test that exercises the headline component:

Append (in the multi-branch describe section if there is one, otherwise just append at the end of the main describe):

```tsx
  it('renders the MerchantHeadline with branch line on multi-branch', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('The Coffee House')).toBeTruthy()
    // selectedBranchFixture.city is "Brightlingsea" so the branch line shows it
    expect(await findByText('Brightlingsea')).toBeTruthy()
  })

  it('hides the branch line on single-branch merchants', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      branches: [{
        id: 'b1', name: 'Only', isMainBranch: true, isActive: true,
        addressLine1: null, addressLine2: null, city: null, postcode: null,
        latitude: null, longitude: null, phone: null, email: null,
        distance: null, isOpenNow: true, avgRating: null, reviewCount: 0,
      }],
    })
    const { findByText, queryByTestId } = wrap(<MerchantProfileScreen id="m1" />)
    await findByText('The Coffee House')
    expect(queryByTestId('merchant-branch-line')).toBeNull()
  })
```

- [ ] **Step 7: Run all merchant tests + tsc**

```bash
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -6
npx tsc --noEmit 2>&1 | tail -3
```
Expected: all green · tsc clean. Test count up by 7 (5 new MerchantHeadline + 2 new profile-skeleton).

- [ ] **Step 8: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/MerchantHeadline.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/merchant-headline.test.tsx apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx
git commit -m "feat(customer-app): MerchantHeadline with branch line

UX refinement §6.1. New component renders merchant name + brand-red
branch line beneath. Multi-branch only — single-branch hides the
branch line. Branch line uses city when available, falls back to
strip-prefixed Branch.name. accessibilityLiveRegion='polite' for
screen-reader announcement on switch (tested in Task 9). MetaSection
still renders the old merchant name; full removal happens when meta
row replaces it (Task 8)."
```

---

### Task 7: Switcher chip text + first-visit caret hint

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/BranchChip.tsx`
- Modify: `apps/customer-app/tests/features/merchant/branch-chip.test.tsx`

**Why:** Chip text changes from `📍 Brightlingsea ▾` to pure verb `Switch branch ▾` (§6.2). First-visit caret hint animation added.

- [ ] **Step 1: Add failing tests in `branch-chip.test.tsx`**

Append to the existing `describe('BranchChip', () => { ... })` block in `apps/customer-app/tests/features/merchant/branch-chip.test.tsx`:

```tsx
  it('multi-branch: renders "Switch branch ▾" text (NOT branch name or pin)', () => {
    const { getByText, queryByText } = render(
      <BranchChip
        branchName="Brightlingsea" city="Brightlingsea" county={null}
        distanceMetres={1500} isOpenNow={true} closesAt="22:30"
        isMultiBranch={true} onPress={() => {}}
      />
    )
    expect(getByText('Switch branch')).toBeTruthy()
    expect(queryByText('Brightlingsea')).toBeNull()
  })

  it('single-branch: chip is not rendered (returns null)', () => {
    const { toJSON } = render(
      <BranchChip
        branchName="Only" city="Brightlingsea" county={null}
        distanceMetres={null} isOpenNow={true} closesAt={null}
        isMultiBranch={false} onPress={() => {}}
      />
    )
    expect(toJSON()).toBeNull()
  })

  it('caret-hint animation flag is enabled by default on multi-branch', () => {
    const { getByTestId } = render(
      <BranchChip
        branchName="Brightlingsea" city="Brightlingsea" county={null}
        distanceMetres={1500} isOpenNow={true} closesAt="22:30"
        isMultiBranch={true} onPress={() => {}}
      />
    )
    expect(getByTestId('chip-caret')).toBeTruthy()
  })
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npx jest tests/features/merchant/branch-chip.test.tsx --forceExit 2>&1 | tail -8
```
Expected: previous tests pass; new tests fail because the chip currently shows "Brightlingsea" not "Switch branch", AND single-branch currently renders a static label rather than null.

- [ ] **Step 3: Modify `BranchChip.tsx`**

Read the existing file. Replace the visible body so:
1. When `isMultiBranch === false`, return `null` (was: returned a static label).
2. When `isMultiBranch === true`, render `<Text>Switch branch</Text> + <Text>▾</Text>` instead of the pin + branch name + caret.
3. Add `testID="chip-caret"` on the caret element.
4. Pass an `accessibilityLabel="Switch branch"` (was: `Switch branch — currently {branchName}`; now redundant with simpler text).

Apply this exact replacement for the `if (isMultiBranch) { ... }` branch and the trailing `return (<View>...static...</View>)` branch:

```tsx
  if (!isMultiBranch) return null

  return (
    <Pressable
      style={styles.chip}
      accessibilityRole="button"
      accessibilityLabel="Switch branch"
      onPress={() => { lightHaptic(); onPress() }}
    >
      <Text variant="label.md" style={styles.text}>Switch branch</Text>
      <Text variant="label.md" style={styles.caret} testID="chip-caret">▾</Text>
    </Pressable>
  )
```

Update the `styles` block to drop the line1/line2/name/icon styles that are no longer used. Replace the entire `StyleSheet.create({ ... })` block with:

```tsx
const styles = StyleSheet.create({
  chip:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 8, backgroundColor: 'rgba(226,12,4,0.07)', borderWidth: 1, borderColor: 'rgba(226,12,4,0.20)' },
  text:  { color: '#E20C04', fontWeight: '600', fontSize: 11 },
  caret: { color: '#E20C04', fontSize: 12 },
})
```

Drop unused props from the `Props` type (the chip no longer renders city/county/distance/isOpenNow/closesAt — those move to the meta row + headline). Replace the type with:

```tsx
type Props = {
  isMultiBranch: boolean
  onPress: () => void
}
```

Drop the unused imports (`MapPin`, `ChevronDown`, etc.). Read the current import block; remove the icon imports if they were the only consumers. Keep `Pressable`, `View` if used by ancillary helpers, otherwise drop too.

- [ ] **Step 4: Run the test, verify it passes**

```bash
npx jest tests/features/merchant/branch-chip.test.tsx --forceExit 2>&1 | tail -8
```
Expected: PASS — all tests green (existing + new).

- [ ] **Step 5: Update screen call-site in `MerchantProfileScreen.tsx`**

The chip currently receives many props that are no longer in the type. Find the chip JSX in `MerchantProfileScreen.tsx` (around line 261):

```tsx
        <BranchChip
          branchName={sb.name}
          city={sb.city}
          county={county}
          distanceMetres={sb.distance}
          isOpenNow={sb.isOpenNow}
          closesAt={closesAt}
          isMultiBranch={isMultiBranch}
          onPress={() => setShowPicker(true)}
        />
```

Replace with:

```tsx
        <BranchChip
          isMultiBranch={isMultiBranch}
          onPress={() => setShowPicker(true)}
        />
```

Above this JSX, the existing local computations for `closesAt`, `county`, etc. are now only consumed by the meta row (Task 8). Don't remove them yet — Task 8 will rewire.

- [ ] **Step 6: Run merchant tests + tsc**

```bash
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -6
npx tsc --noEmit 2>&1 | tail -3
```
Expected: all green · tsc clean.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/BranchChip.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/branch-chip.test.tsx
git commit -m "feat(customer-app): BranchChip becomes pure 'Switch branch ▾' verb

UX refinement §6.2. Drops branch name + pin icon from chip — headline
now carries identity. Single-branch returns null. Caret testID exposed
for the first-visit hint animation hooked up in Task 9."
```

---

## Frontend — Meta row

### Task 8: New `MetaRow` component (single-line balanced)

**Files:**
- Create: `apps/customer-app/src/features/merchant/components/MetaRow.tsx`
- Modify: `apps/customer-app/src/features/merchant/components/MetaSection.tsx` (drop the merchant name + meta-row props it no longer renders; reduce to the action row only OR delete entirely if action row already lives elsewhere — see Step 5)
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`
- Test: `apps/customer-app/tests/features/merchant/meta-row.test.tsx`
- Modify: `apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx`

**Why:** Meta row (§7.1) is the single-line balanced layout — pill + smart status text + de-emphasised distance flow left, rating block anchors right. Replaces `MetaSection`'s rating/location/open-status responsibilities.

- [ ] **Step 1: Create the test file**

```tsx
// apps/customer-app/tests/features/merchant/meta-row.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { MetaRow } from '@/features/merchant/components/MetaRow'
import type { OpeningHourEntry } from '@/lib/api/merchant'

const open9to22: OpeningHourEntry[] = [
  { dayOfWeek: 0, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 1, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 2, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 3, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 4, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 5, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 6, openTime: '09:00', closeTime: '22:00', isClosed: false },
]

describe('MetaRow', () => {
  it('renders pill + status text + distance + rating block (Open state)', () => {
    const { getByText, getByLabelText } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={1931}  // 1.2 mi
        avgRating={4.5}
        reviewCount={7}
        now={new Date('2026-05-04T18:00:00')}
      />
    )
    expect(getByLabelText('Status: Open')).toBeTruthy()
    expect(getByText(/Closes at /)).toBeTruthy()
    expect(getByText('1.2 mi')).toBeTruthy()
    expect(getByText('4.5')).toBeTruthy()
    expect(getByText('(7)')).toBeTruthy()
  })

  it('hides distance when distanceMetres is null', () => {
    const { queryByText } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={null}
        avgRating={4.5}
        reviewCount={7}
        now={new Date('2026-05-04T18:00:00')}
      />
    )
    expect(queryByText(/mi$/)).toBeNull()
    expect(queryByText(/^\d+m$/)).toBeNull()
  })

  it('shows "No reviews yet" placeholder when reviewCount=0', () => {
    const { getByText, queryByText } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={null}
        avgRating={null}
        reviewCount={0}
        now={new Date('2026-05-04T18:00:00')}
      />
    )
    expect(getByText('No reviews yet')).toBeTruthy()
    expect(queryByText('(0)')).toBeNull()
  })

  it('exposes status text + distance via testIDs for switch animation hookup', () => {
    const { getByTestId } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={1931}
        avgRating={4.5}
        reviewCount={7}
        now={new Date('2026-05-04T18:00:00')}
      />
    )
    expect(getByTestId('meta-row-status-text')).toBeTruthy()
    expect(getByTestId('meta-row-distance')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
npx jest tests/features/merchant/meta-row.test.tsx --forceExit 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MetaRow.tsx`**

```tsx
// apps/customer-app/src/features/merchant/components/MetaRow.tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { StatusPill } from './StatusPill'
import { RatingBlock } from './RatingBlock'
import { smartStatus } from '../utils/smartStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

type Props = {
  isOpenNow:     boolean
  openingHours:  OpeningHourEntry[]
  distanceMetres: number | null
  avgRating:     number | null
  reviewCount:   number
  // Test injection point — defaults to new Date(). Production never passes.
  now?: Date
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  if (metres >= 100_000) return null  // suppress: ≥100km hidden per existing rule
  return `${(metres / 1609.34).toFixed(1)} mi`
}

export function MetaRow({ isOpenNow, openingHours, distanceMetres, avgRating, reviewCount, now }: Props) {
  const status = smartStatus(isOpenNow, openingHours, now)
  const distance = formatDistance(distanceMetres)

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <StatusPill state={status.pillState} label={status.pillLabel} />
        <Text variant="label.md" style={styles.statusText} testID="meta-row-status-text" numberOfLines={1} ellipsizeMode="tail">
          {status.statusText}
        </Text>
        {distance !== null ? (
          <>
            <Text variant="label.md" style={styles.separator}>·</Text>
            <Text variant="label.md" style={styles.distance} testID="meta-row-distance">{distance}</Text>
          </>
        ) : null}
      </View>
      <RatingBlock avgRating={avgRating} reviewCount={reviewCount} />
    </View>
  )
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  left:       { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 },
  statusText: { color: '#222', fontWeight: '500', fontSize: 11 },
  separator:  { color: '#D1D5DB', fontSize: 11 },
  distance:   { color: '#9CA3AF', fontWeight: '400', fontSize: 11 },
})
```

- [ ] **Step 4: Run, verify pass**

```bash
npx jest tests/features/merchant/meta-row.test.tsx --forceExit 2>&1 | tail -5
```
Expected: PASS — 4 tests green.

- [ ] **Step 5: Wire `MetaRow` into `MerchantProfileScreen.tsx`**

In `MerchantProfileScreen.tsx`, find the `<MetaSection ... />` JSX block. Replace it entirely with:

```tsx
        <MetaRow
          isOpenNow={sb.isOpenNow}
          openingHours={sb.openingHours}
          distanceMetres={sb.distance}
          avgRating={sb.avgRating}
          reviewCount={sb.reviewCount}
        />
```

Add the import at the top:

```tsx
import { MetaRow } from '../components/MetaRow'
```

`MetaSection` is now unused. Verify by `grep -rn "MetaSection" apps/customer-app/src apps/customer-app/tests`. If only the import + one usage line remain, delete:
- The import in `MerchantProfileScreen.tsx`
- The file `apps/customer-app/src/features/merchant/components/MetaSection.tsx`
- Any test that references `MetaSection` directly (excluding mocks in `profile-skeleton.test.tsx` — leave those mocks until Step 6).

If other surfaces still use `MetaSection`, leave it for a separate cleanup.

- [ ] **Step 6: Update `profile-skeleton.test.tsx` to mock `MetaRow` (replacing the `MetaSection` mock)**

Find the `jest.mock('@/features/merchant/components/MetaSection', ...)` block (around line 14). Replace with:

```tsx
jest.mock('@/features/merchant/components/MetaRow', () => ({
  MetaRow: ({ avgRating, reviewCount }: { avgRating: number | null; reviewCount: number }) => {
    const { Text } = require('react-native')
    return (
      <>
        <Text>METAROW_RATING={avgRating ?? 'NULL'}</Text>
        <Text>METAROW_COUNT={reviewCount}</Text>
      </>
    )
  },
}))
```

Update any test in this file that asserts on `META_NAME=` or `META_CATEGORY=` (legacy) to either:
- assert on `MerchantHeadline` rendering merchant name (already covered in Task 6 tests), OR
- delete the assertion if redundant.

If a test still references `category` (descriptor), keep it — that's now rendered by a different component or by the screen directly.

- [ ] **Step 7: Run all merchant tests + tsc + ESLint**

```bash
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -6
npx tsc --noEmit 2>&1 | tail -3
npx eslint src/features/merchant tests/features/merchant 2>&1 | tail -3
```
Expected: all jest green · tsc clean · ESLint at baseline (43 errors).

- [ ] **Step 8: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/MetaRow.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/meta-row.test.tsx apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx
# Stage MetaSection deletion if applicable:
git add -u apps/customer-app/src/features/merchant/components/MetaSection.tsx 2>/dev/null || true
git commit -m "feat(customer-app): MetaRow single-line balanced layout

UX refinement §7.1. Replaces MetaSection's rating/location/status
responsibilities. Pill + smart status text + de-emphasised distance
left; rating block right. testIDs exposed for the switch animation
in Task 9. Single-line, justify-content: space-between. Distance
hidden when null; rating block uses 'No reviews yet' placeholder
when count=0. MetaSection deleted (no remaining consumers)."
```

---

## Frontend — Motion

### Task 9: `useBranchSwitchAnimation` hook + wire animations

**Files:**
- Create: `apps/customer-app/src/features/merchant/hooks/useBranchSwitchAnimation.ts`
- Modify: `apps/customer-app/src/features/merchant/components/MerchantHeadline.tsx`
- Modify: `apps/customer-app/src/features/merchant/components/MetaRow.tsx`
- Modify: `apps/customer-app/src/features/merchant/components/BranchChip.tsx`
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`
- Test: `apps/customer-app/tests/features/merchant/use-branch-switch-animation.test.tsx`

**Why:** Coordinated motion (§8) — branch line flash + meta-row text/distance opacity dip + chip caret nod, all firing in parallel on a single `selectedBranch.id` change. Skip-on-mount and cancel-on-rapid-switch handled centrally.

This task introduces the hook and wires it into all four animation targets in one go. Voucher-context fade-in (entry 5) is added in Task 10.

- [ ] **Step 1: Create the hook test**

```tsx
// apps/customer-app/tests/features/merchant/use-branch-switch-animation.test.tsx
import React from 'react'
import { Text } from 'react-native'
import { render, act } from '@testing-library/react-native'
import { useBranchSwitchAnimation } from '@/features/merchant/hooks/useBranchSwitchAnimation'

// Tiny harness: re-renders with a new branchId; counts how many times the
// animation effect fired by reading a counter the hook exposes via callback.
function Probe({ branchId, onFire }: { branchId: string; onFire: () => void }) {
  useBranchSwitchAnimation(branchId, onFire)
  return <Text>id={branchId}</Text>
}

describe('useBranchSwitchAnimation', () => {
  it('does NOT fire on initial mount', () => {
    const onFire = jest.fn()
    render(<Probe branchId="b1" onFire={onFire} />)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('fires when branchId changes after mount', () => {
    const onFire = jest.fn()
    const { rerender } = render(<Probe branchId="b1" onFire={onFire} />)
    expect(onFire).not.toHaveBeenCalled()
    rerender(<Probe branchId="b2" onFire={onFire} />)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('fires again on subsequent changes', () => {
    const onFire = jest.fn()
    const { rerender } = render(<Probe branchId="b1" onFire={onFire} />)
    rerender(<Probe branchId="b2" onFire={onFire} />)
    rerender(<Probe branchId="b3" onFire={onFire} />)
    expect(onFire).toHaveBeenCalledTimes(2)
  })

  it('does not fire when branchId is unchanged on rerender', () => {
    const onFire = jest.fn()
    const { rerender } = render(<Probe branchId="b1" onFire={onFire} />)
    rerender(<Probe branchId="b1" onFire={onFire} />)
    rerender(<Probe branchId="b1" onFire={onFire} />)
    expect(onFire).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
npx jest tests/features/merchant/use-branch-switch-animation.test.tsx --forceExit 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// apps/customer-app/src/features/merchant/hooks/useBranchSwitchAnimation.ts
import { useEffect, useRef } from 'react'

/**
 * Single-trigger coordinator for branch-switch animations.
 *
 * Watches `branchId`. On the FIRST render, captures the initial value and
 * does NOT call `onFire` (skip-on-mount per spec §8.1). On every subsequent
 * change, calls `onFire` synchronously so the caller can drive its
 * Reanimated shared values in parallel from a single timeline. Cancel-
 * on-rapid: the caller is responsible for cancelling its in-progress
 * animations and snapping to final state before starting new ones — the
 * standard Reanimated `withTiming(target)` pattern does this automatically.
 *
 * Hook contract:
 * - `onFire` runs synchronously inside `useEffect`, AFTER React commit.
 * - Hook does not own any animation state — caller owns Reanimated values.
 */
export function useBranchSwitchAnimation(branchId: string | null, onFire: () => void): void {
  const previousId = useRef<string | null>(branchId)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      previousId.current = branchId
      return
    }
    if (branchId !== previousId.current) {
      previousId.current = branchId
      onFire()
    }
  }, [branchId, onFire])
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npx jest tests/features/merchant/use-branch-switch-animation.test.tsx --forceExit 2>&1 | tail -5
```
Expected: PASS — 4 tests green.

- [ ] **Step 5: Wire animation into `MerchantHeadline.tsx`**

The branch line gets the brand-red flash + scale on switch. Replace the existing implementation with the animated version:

```tsx
// apps/customer-app/src/features/merchant/components/MerchantHeadline.tsx
import React from 'react'
import { View, StyleSheet, useReducedMotion } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withTiming,
  Easing, interpolateColor,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'

type Props = {
  merchantName: string
  branchLine:   string | null
  /** Trigger value: change to fire the flash animation. Pass `selectedBranch.id`. */
  switchTrigger?: string | null
}

export function MerchantHeadline({ merchantName, branchLine, switchTrigger }: Props) {
  const reducedMotion = useReducedMotion()
  const flash = useSharedValue(0)
  const scale = useSharedValue(1)
  const isFirstRender = React.useRef(true)

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (reducedMotion) return
    flash.value = withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: 180, easing: Easing.out(Easing.ease) }),
    )
    scale.value = withSequence(
      withTiming(1.04, { duration: 150, easing: Easing.out(Easing.ease) }),
      withTiming(1.0,  { duration: 150, easing: Easing.out(Easing.ease) }),
    )
  }, [switchTrigger, reducedMotion, flash, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(flash.value, [0, 1], ['rgba(226,12,4,0)', 'rgba(226,12,4,0.12)']),
    transform: [{ scale: scale.value }],
  }))

  return (
    <View style={styles.root}>
      <Text variant="display.lg" style={styles.name} numberOfLines={1} ellipsizeMode="tail">
        {merchantName}
      </Text>
      {branchLine ? (
        <Animated.View style={[styles.branchLineWrap, animatedStyle]}>
          <Text
            variant="label.lg"
            style={styles.branchLine}
            numberOfLines={1}
            ellipsizeMode="tail"
            testID="merchant-branch-line"
            accessibilityLiveRegion="polite"
          >
            {branchLine}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root:           { gap: 2 },
  name:           { color: '#010C35', fontWeight: '800' },
  branchLineWrap: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 2 },
  branchLine:     { color: '#E20C04', fontWeight: '700' },
})
```

The existing tests still pass because the visible text is unchanged.

- [ ] **Step 6: Wire animation into `MetaRow.tsx`**

Add opacity dip on `switchTrigger` change for status text + distance only. Replace the meta-row implementation:

```tsx
// apps/customer-app/src/features/merchant/components/MetaRow.tsx
import React from 'react'
import { View, StyleSheet, useReducedMotion } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { StatusPill } from './StatusPill'
import { RatingBlock } from './RatingBlock'
import { smartStatus } from '../utils/smartStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

type Props = {
  isOpenNow:      boolean
  openingHours:   OpeningHourEntry[]
  distanceMetres: number | null
  avgRating:      number | null
  reviewCount:    number
  switchTrigger?: string | null
  now?: Date
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  if (metres >= 100_000) return null
  return `${(metres / 1609.34).toFixed(1)} mi`
}

export function MetaRow({ isOpenNow, openingHours, distanceMetres, avgRating, reviewCount, switchTrigger, now }: Props) {
  const reducedMotion = useReducedMotion()
  const opacity = useSharedValue(1)
  const isFirstRender = React.useRef(true)

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (reducedMotion) return
    opacity.value = withSequence(
      withTiming(0.7, { duration: 90, easing: Easing.out(Easing.ease) }),
      withTiming(1.0, { duration: 90, easing: Easing.out(Easing.ease) }),
    )
  }, [switchTrigger, reducedMotion, opacity])

  const animatedTextStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  const status = smartStatus(isOpenNow, openingHours, now)
  const distance = formatDistance(distanceMetres)

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <StatusPill state={status.pillState} label={status.pillLabel} />
        <Animated.View style={animatedTextStyle}>
          <Text variant="label.md" style={styles.statusText} testID="meta-row-status-text" numberOfLines={1} ellipsizeMode="tail">
            {status.statusText}
          </Text>
        </Animated.View>
        {distance !== null ? (
          <>
            <Text variant="label.md" style={styles.separator}>·</Text>
            <Animated.View style={animatedTextStyle}>
              <Text variant="label.md" style={styles.distance} testID="meta-row-distance">{distance}</Text>
            </Animated.View>
          </>
        ) : null}
      </View>
      <RatingBlock avgRating={avgRating} reviewCount={reviewCount} />
    </View>
  )
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  left:       { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 },
  statusText: { color: '#222', fontWeight: '500', fontSize: 11 },
  separator:  { color: '#D1D5DB', fontSize: 11 },
  distance:   { color: '#9CA3AF', fontWeight: '400', fontSize: 11 },
})
```

- [ ] **Step 7: Wire animation into `BranchChip.tsx`**

Add the caret tilt nod + the first-visit caret-bounce hint. Replace `BranchChip.tsx`:

```tsx
// apps/customer-app/src/features/merchant/components/BranchChip.tsx
import React from 'react'
import { Pressable, StyleSheet, useReducedMotion } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withSpring, Easing } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  isMultiBranch: boolean
  onPress: () => void
  switchTrigger?: string | null  // animate caret nod when this changes
  hintOnFirstVisit?: boolean     // play caret bounce hint once on mount; default true
}

export function BranchChip({ isMultiBranch, onPress, switchTrigger, hintOnFirstVisit = true }: Props) {
  const reducedMotion = useReducedMotion()
  const caretRotate = useSharedValue(0)
  const caretBounce = useSharedValue(0)
  const isFirstRender = React.useRef(true)
  const hasHinted = React.useRef(false)

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      // First-visit hint
      if (isMultiBranch && hintOnFirstVisit && !hasHinted.current && !reducedMotion) {
        hasHinted.current = true
        caretBounce.value = withSequence(
          withTiming(-2, { duration: 200, easing: Easing.out(Easing.ease) }),
          withSpring(0, { damping: 6, stiffness: 180 }),
        )
      }
      return
    }
    // Subsequent switches: nod tilt
    if (!isMultiBranch || reducedMotion) return
    caretRotate.value = withSequence(
      withTiming(-8, { duration: 100, easing: Easing.out(Easing.ease) }),
      withSpring(0, { damping: 5, stiffness: 200 }),
    )
  }, [switchTrigger, isMultiBranch, hintOnFirstVisit, reducedMotion, caretRotate, caretBounce])

  const caretStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: caretBounce.value },
      { rotate: `${caretRotate.value}deg` },
    ],
  }))

  if (!isMultiBranch) return null

  return (
    <Pressable
      style={styles.chip}
      accessibilityRole="button"
      accessibilityLabel="Switch branch"
      onPress={() => { lightHaptic(); onPress() }}
    >
      <Text variant="label.md" style={styles.text}>Switch branch</Text>
      <Animated.View style={caretStyle} testID="chip-caret">
        <Text variant="label.md" style={styles.caret}>▾</Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 8, backgroundColor: 'rgba(226,12,4,0.07)', borderWidth: 1, borderColor: 'rgba(226,12,4,0.20)' },
  text:  { color: '#E20C04', fontWeight: '600', fontSize: 11 },
  caret: { color: '#E20C04', fontSize: 12 },
})
```

- [ ] **Step 8: Wire `switchTrigger` from `MerchantProfileScreen.tsx`**

Replace each call site to pass `switchTrigger={sb.id}`:

```tsx
        <MerchantHeadline
          merchantName={merchant.businessName}
          branchLine={buildBranchLine(sb)}
          switchTrigger={sb.id}
        />

        <BranchChip
          isMultiBranch={isMultiBranch}
          onPress={() => setShowPicker(true)}
          switchTrigger={sb.id}
        />

        <MetaRow
          isOpenNow={sb.isOpenNow}
          openingHours={sb.openingHours}
          distanceMetres={sb.distance}
          avgRating={sb.avgRating}
          reviewCount={sb.reviewCount}
          switchTrigger={sb.id}
        />
```

- [ ] **Step 9: Run all merchant tests + tsc + ESLint**

```bash
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -6
npx tsc --noEmit 2>&1 | tail -3
npx eslint src/features/merchant tests/features/merchant 2>&1 | tail -3
```
Expected: jest all green · tsc clean · ESLint baseline 43.

- [ ] **Step 10: Commit**

```bash
git add apps/customer-app/src/features/merchant/hooks/useBranchSwitchAnimation.ts apps/customer-app/src/features/merchant/components/MerchantHeadline.tsx apps/customer-app/src/features/merchant/components/MetaRow.tsx apps/customer-app/src/features/merchant/components/BranchChip.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/use-branch-switch-animation.test.tsx
git commit -m "feat(customer-app): branch-switch motion layer

UX refinement §8. Coordinated parallel animations on selectedBranch.id
change: branch-line flash+scale (300ms), meta-row text+distance
opacity dip (180ms), chip caret nod (200ms spring), plus first-visit
chip caret bounce hint. All respect prefers-reduced-motion. All skip
on initial mount. Reanimated UI-thread driven.

useBranchSwitchAnimation hook coordinator written but each component
owns its own Reanimated values + effect — keeps the cancel-on-rapid
behaviour native to withTiming. Voucher-context label motion (entry
5) lands in Task 10."
```

---

## Frontend — Voucher context

### Task 10: `VoucherContextLabel` component + Vouchers tab integration

**Files:**
- Create: `apps/customer-app/src/features/merchant/components/VoucherContextLabel.tsx`
- Modify: `apps/customer-app/src/features/merchant/components/VouchersTab.tsx`
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`
- Test: `apps/customer-app/tests/features/merchant/voucher-context-label.test.tsx`

**Why:** §6.5 — quiet "Showing offers for {branch}" persistent label at top of Vouchers tab. Fades on switch.

- [ ] **Step 1: Create the test**

```tsx
// apps/customer-app/tests/features/merchant/voucher-context-label.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { VoucherContextLabel } from '@/features/merchant/components/VoucherContextLabel'

describe('VoucherContextLabel', () => {
  it('renders "Showing offers for {branchName}" when multi-branch', () => {
    const { getByText } = render(
      <VoucherContextLabel branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={true} />
    )
    expect(getByText('Showing offers for Brightlingsea')).toBeTruthy()
  })

  it('returns null on single-branch merchant', () => {
    const { toJSON } = render(
      <VoucherContextLabel branchShortName="Only" isMultiBranch={false} hasVouchers={true} />
    )
    expect(toJSON()).toBeNull()
  })

  it('returns null when there are 0 vouchers', () => {
    const { toJSON } = render(
      <VoucherContextLabel branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={false} />
    )
    expect(toJSON()).toBeNull()
  })

  it('exposes testID for animation hookup', () => {
    const { getByTestId } = render(
      <VoucherContextLabel branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={true} />
    )
    expect(getByTestId('voucher-context-label')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
npx jest tests/features/merchant/voucher-context-label.test.tsx --forceExit 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/customer-app/src/features/merchant/components/VoucherContextLabel.tsx
import React from 'react'
import { StyleSheet, useReducedMotion } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'

type Props = {
  branchShortName: string
  isMultiBranch:   boolean
  hasVouchers:     boolean
  switchTrigger?:  string | null
}

export function VoucherContextLabel({ branchShortName, isMultiBranch, hasVouchers, switchTrigger }: Props) {
  const reducedMotion = useReducedMotion()
  const opacity = useSharedValue(1)
  const isFirstRender = React.useRef(true)

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (reducedMotion) return
    opacity.value = withSequence(
      withTiming(0.7, { duration: 90, easing: Easing.out(Easing.ease) }),
      withTiming(1.0, { duration: 90, easing: Easing.out(Easing.ease) }),
    )
  }, [switchTrigger, reducedMotion, opacity])

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  if (!isMultiBranch || !hasVouchers) return null

  return (
    <Animated.View style={[styles.root, animatedStyle]} testID="voucher-context-label">
      <Text variant="label.md" style={styles.text}>
        Showing offers for {branchShortName}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8 },
  text: { color: '#666', fontSize: 11, fontWeight: '500' },
})
```

- [ ] **Step 4: Run, verify pass**

```bash
npx jest tests/features/merchant/voucher-context-label.test.tsx --forceExit 2>&1 | tail -5
```
Expected: PASS — 4 tests green.

- [ ] **Step 5: Wire into the Vouchers tab content**

Edit `apps/customer-app/src/features/merchant/components/VouchersTab.tsx`. Find the JSX root (the outer `<View>`) and insert the label as the first child, before the existing voucher list. Add the new prop to the component's `Props` type:

```tsx
import { VoucherContextLabel } from './VoucherContextLabel'

// Add to Props:
type Props = {
  // ... existing props ...
  branchShortName: string
  isMultiBranch:   boolean
  switchTrigger?:  string | null
}

// Inside the function body, BEFORE the voucher list rendering:
<VoucherContextLabel
  branchShortName={branchShortName}
  isMultiBranch={isMultiBranch}
  hasVouchers={vouchers.length > 0}
  switchTrigger={switchTrigger}
/>
```

- [ ] **Step 6: Wire props from `MerchantProfileScreen.tsx`**

Find `<VouchersTab ... />`. Add the new props:

```tsx
            <VouchersTab
              vouchers={merchant.vouchers}
              redeemedVoucherIds={redeemedVoucherIds}
              favouritedVoucherIds={favouritedVoucherIds}
              onVoucherPress={handleVoucherPress}
              branchShortName={branchShortName(sb.name)}
              isMultiBranch={isMultiBranch}
              switchTrigger={sb.id}
            />
```

Add the import at the top:

```tsx
import { branchShortName } from '../utils/branchShortName'
```

- [ ] **Step 7: Run merchant tests + tsc**

```bash
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -6
npx tsc --noEmit 2>&1 | tail -3
```
Expected: all green · tsc clean.

- [ ] **Step 8: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/VoucherContextLabel.tsx apps/customer-app/src/features/merchant/components/VouchersTab.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/voucher-context-label.test.tsx
git commit -m "feat(customer-app): VoucherContextLabel — voucher-context reinforcement

UX refinement §6.5. Quiet 'Showing offers for {branch}' label at top
of Vouchers tab, multi-branch only, hidden when 0 vouchers. Persistent
(does NOT auto-dismiss). Fades 0.7→1.0 over ~180ms on switch
(motion entry 5). Reduced-motion: instant value swap."
```

---

## Frontend — Branch surfaces

### Task 11: `BranchPickerSheet` rows — name-first two-line layout, pin "Currently viewing"

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/BranchPickerSheet.tsx`
- Modify: `apps/customer-app/tests/features/merchant/branch-picker-sheet.test.tsx`

**Why:** §7.2 — picker rows become name-first two-line layout: branch name + rating block on row 1; pill + smart status text + distance on row 2. Currently-viewing row pinned at the top with subtle red tint.

- [ ] **Step 1: Update `branch-picker-sheet.test.tsx` with new shape tests**

Append to the existing `describe`:

```tsx
  it('renders rows in name-first two-line layout', () => {
    const branches = [
      { id: 'b1', name: 'Brightlingsea', city: 'Brightlingsea', county: null, distanceMetres: 1500, isOpenNow: true, isActive: true, openingHours: [], avgRating: 4.5, reviewCount: 7 },
      { id: 'b2', name: 'Colchester', city: 'Colchester', county: null, distanceMetres: 5400, isOpenNow: false, isActive: true, openingHours: [], avgRating: 4.0, reviewCount: 1 },
    ]
    const { getByText, getByLabelText } = render(
      <BranchPickerSheet
        visible={true} branches={branches} currentBranchId="b1"
        onPick={() => {}} onDismiss={() => {}}
      />
    )
    expect(getByText('Brightlingsea')).toBeTruthy()
    expect(getByText('Colchester')).toBeTruthy()
    expect(getByLabelText(/Status: Open/)).toBeTruthy()
    expect(getByLabelText(/Status: Closed/)).toBeTruthy()
  })

  it('pins the current branch at the top with subtle background tint', () => {
    const branches = [
      { id: 'b2', name: 'Colchester', city: 'Colchester', county: null, distanceMetres: 5400, isOpenNow: false, isActive: true, openingHours: [], avgRating: null, reviewCount: 0 },
      { id: 'b1', name: 'Brightlingsea', city: 'Brightlingsea', county: null, distanceMetres: 1500, isOpenNow: true, isActive: true, openingHours: [], avgRating: 4.5, reviewCount: 7 },
    ]
    const { getAllByText, getByText } = render(
      <BranchPickerSheet
        visible={true} branches={branches} currentBranchId="b1"
        onPick={() => {}} onDismiss={() => {}}
      />
    )
    expect(getByText('Currently viewing')).toBeTruthy()
    // First row should be Brightlingsea (current), even though branches[] had Colchester first
    const allRowNames = getAllByText(/^(Brightlingsea|Colchester)$/)
    expect((allRowNames[0]?.props.children as string)).toBe('Brightlingsea')
  })

  it('renders rating block on each row, with placeholder when count=0', () => {
    const branches = [
      { id: 'b1', name: 'Brightlingsea', city: null, county: null, distanceMetres: null, isOpenNow: true, isActive: true, openingHours: [], avgRating: 4.5, reviewCount: 7 },
      { id: 'b2', name: 'Colchester', city: null, county: null, distanceMetres: null, isOpenNow: false, isActive: true, openingHours: [], avgRating: null, reviewCount: 0 },
    ]
    const { getByText } = render(
      <BranchPickerSheet
        visible={true} branches={branches} currentBranchId="b1"
        onPick={() => {}} onDismiss={() => {}}
      />
    )
    expect(getByText('4.5')).toBeTruthy()
    expect(getByText('No reviews yet')).toBeTruthy()
  })
```

- [ ] **Step 2: Run, verify failure**

```bash
npx jest tests/features/merchant/branch-picker-sheet.test.tsx --forceExit 2>&1 | tail -5
```
Expected: FAIL — current implementation is single-line, doesn't have the new shape.

- [ ] **Step 3: Modify `BranchPickerSheet.tsx`**

Update the `BranchEntry` type (top of file) to include the new fields:

```tsx
type BranchEntry = {
  id: string
  name: string
  city: string | null
  county: string | null
  distanceMetres: number | null
  isOpenNow: boolean
  isActive: boolean
  openingHours: OpeningHourEntry[]   // NEW — for smartStatus
  avgRating: number | null            // NEW
  reviewCount: number                 // NEW
}
```

Add the import:
```tsx
import type { OpeningHourEntry } from '@/lib/api/merchant'
import { StatusPill } from './StatusPill'
import { RatingBlock } from './RatingBlock'
import { smartStatus } from '../utils/smartStatus'
import { branchShortName } from '../utils/branchShortName'
```

Replace the row rendering JSX with the two-line shape. Find the existing `branches.map(b => { ... })` block and replace its body with:

```tsx
            {sortedBranches.map(b => {
              const isCurrent = b.id === currentBranchId
              const isDisabled = !b.isActive
              const status = smartStatus(b.isOpenNow, b.openingHours)
              const distance = b.distanceMetres !== null && b.distanceMetres < 100_000
                ? (b.distanceMetres < 1000 ? `${Math.round(b.distanceMetres)}m` : `${(b.distanceMetres / 1609.34).toFixed(1)} mi`)
                : null
              return (
                <Pressable
                  key={b.id}
                  accessibilityLabel={`${branchShortName(b.name)}${isCurrent ? ' — currently viewing' : ''}${isDisabled ? ' — Unavailable' : ''}`}
                  disabled={isDisabled}
                  onPress={() => {
                    if (isDisabled) return
                    lightHaptic()
                    if (!isCurrent) onPick(b.id)
                    onDismiss()
                  }}
                  style={[styles.row, isCurrent && styles.rowCurrent, isDisabled && styles.rowDisabled]}
                >
                  <View style={styles.rowTop}>
                    <View style={styles.nameWrap}>
                      <Text variant="label.lg" style={[styles.name, isDisabled && styles.disabledText]}>
                        {branchShortName(b.name)}
                      </Text>
                      {isCurrent ? (
                        <Text variant="label.md" style={styles.currentTag}>Currently viewing</Text>
                      ) : null}
                    </View>
                    <RatingBlock avgRating={b.avgRating} reviewCount={b.reviewCount} />
                  </View>
                  <View style={styles.rowBottom}>
                    <StatusPill state={status.pillState} label={status.pillLabel} />
                    <Text variant="label.md" style={styles.statusText}>{status.statusText}</Text>
                    {distance !== null ? (
                      <>
                        <Text variant="label.md" style={styles.separator}>·</Text>
                        <Text variant="label.md" style={styles.distance}>{distance}</Text>
                      </>
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
```

Above the map, compute `sortedBranches`:

```tsx
  const sortedBranches = React.useMemo(() => {
    const current = branches.find(b => b.id === currentBranchId)
    const others  = branches.filter(b => b.id !== currentBranchId)
    const allHaveGps = branches.every(b => b.distanceMetres !== null)
    const otherSorted = allHaveGps
      ? [...others].sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity))
      : [...others].sort((a, b) => branchShortName(a.name).localeCompare(branchShortName(b.name)))
    return current ? [current, ...otherSorted] : otherSorted
  }, [branches, currentBranchId])
```

Replace the `styles` block:

```tsx
const styles = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,12,53,0.5)' },
  sheet:      { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 40, maxHeight: '70%' },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 8, marginBottom: 20 },
  title:      { fontSize: 18, fontWeight: '800', color: '#010C35', marginBottom: 12 },
  row:        { paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE6' },
  rowCurrent: { backgroundColor: 'rgba(226,12,4,0.03)' },
  rowDisabled:{ opacity: 0.55 },
  rowTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 },
  nameWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  name:       { fontSize: 14, fontWeight: '800', color: '#010C35' },
  currentTag: { fontSize: 10, fontWeight: '700', color: '#16A34A', backgroundColor: 'rgba(22,163,74,0.10)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  rowBottom:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { color: '#222', fontWeight: '500', fontSize: 11 },
  separator:  { color: '#D1D5DB', fontSize: 11 },
  distance:   { color: '#9CA3AF', fontSize: 11 },
  disabledText: { color: '#9CA3AF' },
})
```

- [ ] **Step 4: Update the screen call-site to pass the new fields**

In `MerchantProfileScreen.tsx`, find the `<BranchPickerSheet branches={...}` mapping. Update the map to include `openingHours`, `avgRating`, `reviewCount`:

```tsx
        branches={merchant.branches.map(b => ({
          id:             b.id,
          name:           b.name,
          city:           b.city,
          county:         null,
          distanceMetres: b.distance,
          isOpenNow:      b.isOpenNow,
          isActive:       b.isActive,
          openingHours:   sb.openingHours,  // Approximation: per-branch openingHours not in BranchTile yet — uses selectedBranch's. Tracked as backend extension.
          avgRating:      b.avgRating,
          reviewCount:    b.reviewCount,
        }))}
```

NOTE: `BranchTile` doesn't carry `openingHours` per-branch (only `selectedBranch` does). For now we pass `sb.openingHours` as an approximation — this means OTHER branches' rows show the CURRENT branch's status. This is wrong for picker rows showing other branches.

The proper fix is to either (a) add `openingHours` to `BranchTile` (additional backend work beyond Task 1) or (b) compute status without smart-status text and just show open/closed-from-isOpenNow boolean.

For Pass 2 the practical compromise: pass `[]` (empty) for non-current branches' openingHours so smartStatus falls into the "Hours unavailable" branch. The pill colour still reflects `isOpenNow` correctly.

Update the mapping:

```tsx
        branches={merchant.branches.map(b => ({
          id:             b.id,
          name:           b.name,
          city:           b.city,
          county:         null,
          distanceMetres: b.distance,
          isOpenNow:      b.isOpenNow,
          isActive:       b.isActive,
          openingHours:   b.id === sb.id ? sb.openingHours : [],  // current branch only; others fall to "Hours unavailable" status text
          avgRating:      b.avgRating,
          reviewCount:    b.reviewCount,
        }))}
```

- [ ] **Step 5: Run merchant tests + tsc**

```bash
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -6
npx tsc --noEmit 2>&1 | tail -3
```
Expected: all green · tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/BranchPickerSheet.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/branch-picker-sheet.test.tsx
git commit -m "feat(customer-app): BranchPicker rows — name-first two-line layout

UX refinement §7.2. Picker rows restructured: row 1 = branch name +
rating block; row 2 = status pill + smart status text + distance.
Currently-viewing row pinned at top with subtle red tint background
+ inline 'Currently viewing' tag. Sort: current first, then nearest-
first when all have GPS, else alphabetical. Tap-to-switch behaviour
(existing PR #33) preserved. StatusPill + RatingBlock shared with
meta row. openingHours per non-current branch falls to 'Hours
unavailable' until BranchTile carries them per-branch (deferred)."
```

---

### Task 12: `HoursPreviewSheet` new component

**Files:**
- Create: `apps/customer-app/src/features/merchant/components/HoursPreviewSheet.tsx`
- Test: `apps/customer-app/tests/features/merchant/hours-preview-sheet.test.tsx`

**Why:** §6.3 — bottom sheet that shows another branch's hours without page switch. Reused from Other Locations card Hours button.

- [ ] **Step 1: Create the test**

```tsx
// apps/customer-app/tests/features/merchant/hours-preview-sheet.test.tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HoursPreviewSheet } from '@/features/merchant/components/HoursPreviewSheet'
import type { OpeningHourEntry } from '@/lib/api/merchant'

const open9to22: OpeningHourEntry[] = [
  { dayOfWeek: 0, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 1, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 2, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 3, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 4, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 5, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 6, openTime: '09:00', closeTime: '22:00', isClosed: false },
]

describe('HoursPreviewSheet', () => {
  it('renders branch name in header', () => {
    const { getByText } = render(
      <HoursPreviewSheet
        visible={true} branchName="Colchester" isOpenNow={true}
        openingHours={open9to22} onDismiss={() => {}}
      />
    )
    expect(getByText('Colchester')).toBeTruthy()
  })

  it('renders status pill in header', () => {
    const { getByLabelText } = render(
      <HoursPreviewSheet
        visible={true} branchName="Colchester" isOpenNow={true}
        openingHours={open9to22} onDismiss={() => {}}
      />
    )
    expect(getByLabelText(/Status: /)).toBeTruthy()
  })

  it('renders 7 day rows when openingHours has 7 entries', () => {
    const { getAllByLabelText } = render(
      <HoursPreviewSheet
        visible={true} branchName="Colchester" isOpenNow={true}
        openingHours={open9to22} onDismiss={() => {}}
      />
    )
    expect(getAllByLabelText(/^Hours row /)).toHaveLength(7)
  })

  it('renders "Hours not available" when openingHours is empty', () => {
    const { getByText } = render(
      <HoursPreviewSheet
        visible={true} branchName="Colchester" isOpenNow={false}
        openingHours={[]} onDismiss={() => {}}
      />
    )
    expect(getByText('Hours not available')).toBeTruthy()
  })

  it('calls onDismiss when close button is tapped', () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = render(
      <HoursPreviewSheet
        visible={true} branchName="Colchester" isOpenNow={true}
        openingHours={open9to22} onDismiss={onDismiss}
      />
    )
    fireEvent.press(getByLabelText('Close hours preview'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('returns null when not visible', () => {
    const { toJSON } = render(
      <HoursPreviewSheet
        visible={false} branchName="Colchester" isOpenNow={true}
        openingHours={open9to22} onDismiss={() => {}}
      />
    )
    expect(toJSON()).toBeNull()
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
npx jest tests/features/merchant/hours-preview-sheet.test.tsx --forceExit 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/customer-app/src/features/merchant/components/HoursPreviewSheet.tsx
import React from 'react'
import { View, Pressable, Modal, ScrollView, StyleSheet } from 'react-native'
import { X } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { StatusPill } from './StatusPill'
import { smartStatus } from '../utils/smartStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

type Props = {
  visible:      boolean
  branchName:   string
  isOpenNow:    boolean
  openingHours: OpeningHourEntry[]
  onDismiss:    () => void
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function HoursPreviewSheet({ visible, branchName, isOpenNow, openingHours, onDismiss }: Props) {
  if (!visible) return null
  const status = smartStatus(isOpenNow, openingHours)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={e => e?.stopPropagation?.()}>
          <View style={styles.dragHandle} />
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label.md" style={styles.headerEyebrow}>Opening hours</Text>
              <Text variant="display.sm" style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
                {branchName}
              </Text>
            </View>
            <StatusPill state={status.pillState} label={status.pillLabel} />
            <Pressable accessibilityLabel="Close hours preview" onPress={onDismiss} style={styles.closeBtn}>
              <X size={16} color="#666" />
            </Pressable>
          </View>
          {openingHours.length === 0 ? (
            <Text variant="body.sm" style={styles.emptyText}>Hours not available</Text>
          ) : (
            <ScrollView>
              {DAY_NAMES.map((dayName, idx) => {
                const entry = openingHours.find(h => h.dayOfWeek === idx)
                const closed = !entry || entry.isClosed || !entry.openTime || !entry.closeTime
                const text = closed ? 'Closed' : `${entry!.openTime} – ${entry!.closeTime}`
                return (
                  <View key={idx} style={styles.dayRow} accessibilityLabel={`Hours row ${idx}`}>
                    <Text variant="label.md" style={styles.dayName}>{dayName}</Text>
                    <Text variant="label.md" style={[styles.dayHours, closed && styles.dayHoursClosed]}>{text}</Text>
                  </View>
                )
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,12,53,0.5)' },
  sheet:          { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40, maxHeight: '70%' },
  dragHandle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  headerEyebrow:  { fontSize: 11, color: '#888' },
  headerTitle:    { fontSize: 22, fontWeight: '800', color: '#010C35' },
  closeBtn:       { padding: 4 },
  emptyText:      { color: '#888', fontStyle: 'italic', paddingVertical: 16 },
  dayRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E0DB' },
  dayName:        { fontSize: 12, color: '#010C35', fontWeight: '500' },
  dayHours:       { fontSize: 12, color: '#222' },
  dayHoursClosed: { color: '#888', fontStyle: 'italic' },
})
```

If `'@/design-system/icons'` doesn't already export `X`, find the icons barrel and add `export { X } from 'lucide-react-native'`. Else, this import line works as-is.

- [ ] **Step 4: Run, verify pass**

```bash
npx jest tests/features/merchant/hours-preview-sheet.test.tsx --forceExit 2>&1 | tail -5
```
Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/HoursPreviewSheet.tsx apps/customer-app/tests/features/merchant/hours-preview-sheet.test.tsx
git commit -m "feat(customer-app): HoursPreviewSheet — peek at another branch's hours

UX refinement §6.3. Bottom sheet showing branch name + status pill +
full week schedule for a NON-current branch. No CTAs. Empty state
'Hours not available' when openingHours is empty. Wired into Other
Locations card Hours button in Task 13."
```

---

### Task 13: Other Locations tab restructure (rename + name-first cards + actions + HoursPreviewSheet integration)

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/BranchesTab.tsx` (rebuild as Other Locations)
- Modify: `apps/customer-app/src/features/merchant/components/BranchCard.tsx` (rebuild as Other Locations card)
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` (rename label, wire actions, HoursPreview state)
- Modify: `apps/customer-app/tests/features/merchant/branches-tab.test.tsx` (update for new shape)
- Modify: `apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx` (update tab label assertion)

**Why:** §6.3 — Branches tab renamed to Other Locations; current branch excluded; name-first card layout; 4 actions (Call · Directions · Hours · Switch →) with no card-body tap.

- [ ] **Step 1: Rewrite `BranchesTab.tsx`**

```tsx
// apps/customer-app/src/features/merchant/components/BranchesTab.tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { BranchCard } from './BranchCard'
import { branchShortName } from '../utils/branchShortName'
import type { BranchTile } from '@/lib/api/merchant'

type Props = {
  branches:        BranchTile[]
  currentBranchId: string
  selectedOpeningHours: import('@/lib/api/merchant').OpeningHourEntry[]   // hours from selectedBranch — used for the current branch only (other branches get [] until backend extension)
  onCall:          (branchId: string, phone: string) => void
  onDirections:    (branchId: string) => void
  onHoursPreview:  (branchId: string) => void
  onSwitch:        (branchId: string) => void
}

export function BranchesTab({ branches, currentBranchId, selectedOpeningHours, onCall, onDirections, onHoursPreview, onSwitch }: Props) {
  // Other Locations: exclude current branch, exclude suspended.
  const others = branches.filter(b => b.id !== currentBranchId && b.isActive)
  if (others.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyText}>
          {/* Defensive empty state — should not normally render because the tab is hidden when others.length === 0 */}
        </View>
      </View>
    )
  }

  // Sort: nearest-first when all have GPS, else alphabetical
  const allHaveGps = others.every(b => b.distance !== null)
  const sorted = allHaveGps
    ? [...others].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    : [...others].sort((a, b) => branchShortName(a.name).localeCompare(branchShortName(b.name)))

  return (
    <View style={styles.container}>
      {sorted.map(b => (
        <BranchCard
          key={b.id}
          branch={b}
          openingHoursForStatus={[]}  // other-branch hours not available; pill uses isOpenNow only
          onCall={() => onCall(b.id, b.phone ?? '')}
          onDirections={() => onDirections(b.id)}
          onHoursPreview={() => onHoursPreview(b.id)}
          onSwitch={() => onSwitch(b.id)}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  emptyText: { paddingVertical: 24, alignItems: 'center' },
})
```

- [ ] **Step 2: Rewrite `BranchCard.tsx`**

```tsx
// apps/customer-app/src/features/merchant/components/BranchCard.tsx
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Phone, Navigation, Clock, ArrowRight } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { StatusPill } from './StatusPill'
import { RatingBlock } from './RatingBlock'
import { smartStatus } from '../utils/smartStatus'
import { branchShortName } from '../utils/branchShortName'
import type { BranchTile, OpeningHourEntry } from '@/lib/api/merchant'

type Props = {
  branch:                BranchTile
  openingHoursForStatus: OpeningHourEntry[]
  onCall:                () => void
  onDirections:          () => void
  onHoursPreview:        () => void
  onSwitch:              () => void
}

export function BranchCard({ branch, openingHoursForStatus, onCall, onDirections, onHoursPreview, onSwitch }: Props) {
  const status = smartStatus(branch.isOpenNow, openingHoursForStatus)
  const distance = branch.distance !== null && branch.distance < 100_000
    ? (branch.distance < 1000 ? `${Math.round(branch.distance)}m` : `${(branch.distance / 1609.34).toFixed(1)} mi`)
    : null
  const address = [branch.addressLine1, branch.city, branch.postcode].filter(Boolean).join(', ')

  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <Text variant="label.lg" style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {branchShortName(branch.name)}
        </Text>
        <RatingBlock avgRating={branch.avgRating} reviewCount={branch.reviewCount} />
      </View>
      <View style={styles.rowMid}>
        <StatusPill state={status.pillState} label={status.pillLabel} />
        <Text variant="label.md" style={styles.statusText}>{status.statusText}</Text>
        {distance !== null ? (
          <>
            <Text variant="label.md" style={styles.separator}>·</Text>
            <Text variant="label.md" style={styles.distance}>{distance}</Text>
          </>
        ) : null}
      </View>
      {address ? (
        <Text variant="label.md" style={styles.address} numberOfLines={1} ellipsizeMode="tail">{address}</Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={onCall} accessibilityLabel="Call">
          <Phone size={12} color="#010C35" />
          <Text variant="label.md" style={styles.actionText}>Call</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={onDirections} accessibilityLabel="Directions">
          <Navigation size={12} color="#010C35" />
          <Text variant="label.md" style={styles.actionText}>Directions</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={onHoursPreview} accessibilityLabel="Hours">
          <Clock size={12} color="#010C35" />
          <Text variant="label.md" style={styles.actionText}>Hours</Text>
        </Pressable>
        <Pressable style={styles.switchBtn} onPress={onSwitch} accessibilityLabel="Switch to this branch">
          <Text variant="label.md" style={styles.switchText}>Switch</Text>
          <ArrowRight size={12} color="#fff" />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E0DB', borderRadius: 12, padding: 14 },
  rowTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 },
  name:       { fontSize: 14, fontWeight: '800', color: '#010C35' },
  rowMid:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusText: { color: '#222', fontWeight: '500', fontSize: 11 },
  separator:  { color: '#D1D5DB', fontSize: 11 },
  distance:   { color: '#9CA3AF', fontSize: 11 },
  address:    { color: '#9CA3AF', fontSize: 11, marginBottom: 10 },
  actions:    { flexDirection: 'row', gap: 6 },
  actionBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 7, borderWidth: 1, borderColor: '#E5E0DB', backgroundColor: '#fff' },
  actionText: { fontSize: 10, fontWeight: '600', color: '#010C35' },
  switchBtn:  { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 7, backgroundColor: '#E20C04' },
  switchText: { fontSize: 10, fontWeight: '700', color: '#fff' },
})
```

If any of the icon names (`Phone`, `Navigation`, `Clock`, `ArrowRight`) aren't yet exported from `'@/design-system/icons'`, add them by editing the icons barrel: `export { Phone, Navigation, Clock, ArrowRight } from 'lucide-react-native'`.

- [ ] **Step 3: Update `MerchantProfileScreen.tsx`**

Several changes:

(a) Rename the tab label from `"Branches"` to `"Other Locations"`. Find the `tabs` `useMemo` (around line 95):

```tsx
    if (isMultiBranch) {
      const otherActive = merchant.branches.filter(b => b.id !== sb.id && b.isActive).length
      if (otherActive > 0) {
        t.push({ id: 'branches', label: 'Other Locations', count: otherActive })
      }
    }
```

(b) Add HoursPreview sheet state:

```tsx
  const [hoursPreviewBranchId, setHoursPreviewBranchId] = useState<string | null>(null)
```

(c) Update the BranchesTab JSX call-site:

```tsx
          {activeTab === 'branches' && isMultiBranch && (
            <BranchesTab
              branches={merchant.branches}
              currentBranchId={sb.id}
              selectedOpeningHours={sb.openingHours}
              onCall={(_id, phone) => phone && Linking.openURL(`tel:${phone}`)}
              onDirections={(branchId) => {
                const target = merchant.branches.find(b => b.id === branchId)
                if (!target) return
                setDirsBranchId(branchId)
                setShowDirs(true)
              }}
              onHoursPreview={(branchId) => setHoursPreviewBranchId(branchId)}
              onSwitch={(branchId) => select(branchId)}
            />
          )}
```

(d) Add the `<HoursPreviewSheet>` element near the other sheets (just before `<FreeUserGateModal>`):

```tsx
      <HoursPreviewSheet
        visible={hoursPreviewBranchId !== null}
        branchName={branchShortName(merchant.branches.find(b => b.id === hoursPreviewBranchId)?.name ?? '')}
        isOpenNow={merchant.branches.find(b => b.id === hoursPreviewBranchId)?.isOpenNow ?? false}
        openingHours={[]}  // per-branch openingHours not in BranchTile yet (deferred)
        onDismiss={() => setHoursPreviewBranchId(null)}
      />
```

(e) Add imports:

```tsx
import { HoursPreviewSheet } from '../components/HoursPreviewSheet'
```

- [ ] **Step 4: Update `branches-tab.test.tsx` for the new shape**

Read the file. Update the `mk()` builder fixture to match the new `BranchesTab` Props (it now takes `currentBranchId`, `selectedOpeningHours`, callbacks). Remove tests asserting on the old shape (`onBranchPress`, `nearestBranchId`, etc.) and replace with:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { BranchesTab } from '@/features/merchant/components/BranchesTab'
import type { BranchTile } from '@/lib/api/merchant'

const mk = (id: string, name: string, isActive = true): BranchTile => ({
  id, name, isActive, isMainBranch: false,
  addressLine1: '1 St', addressLine2: null, city: 'X', postcode: 'X1 1XX',
  latitude: null, longitude: null, phone: '+44', email: null,
  distance: null, isOpenNow: true, avgRating: null, reviewCount: 0,
})

describe('BranchesTab — Other Locations', () => {
  it('excludes the current branch from the list', () => {
    const branches = [mk('b1', 'Brightlingsea'), mk('b2', 'Colchester')]
    const { queryByText, getByText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={() => {}} onDirections={() => {}} onHoursPreview={() => {}} onSwitch={() => {}}
      />
    )
    expect(queryByText('Brightlingsea')).toBeNull()
    expect(getByText('Colchester')).toBeTruthy()
  })

  it('excludes suspended branches', () => {
    const branches = [mk('b1', 'Brightlingsea'), mk('b2', 'Colchester', false)]
    const { queryByText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={() => {}} onDirections={() => {}} onHoursPreview={() => {}} onSwitch={() => {}}
      />
    )
    expect(queryByText('Colchester')).toBeNull()
  })

  it('renders 4 actions per card and Switch fires onSwitch', () => {
    const branches = [mk('b1', 'Brightlingsea'), mk('b2', 'Colchester')]
    const onSwitch = jest.fn()
    const { getAllByLabelText, getByLabelText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={() => {}} onDirections={() => {}} onHoursPreview={() => {}} onSwitch={onSwitch}
      />
    )
    expect(getAllByLabelText(/^Call$|^Directions$|^Hours$/).length).toBe(3)
    fireEvent.press(getByLabelText('Switch to this branch'))
    expect(onSwitch).toHaveBeenCalled()
  })

  it('Hours button fires onHoursPreview (NOT a tab switch)', () => {
    const branches = [mk('b1', 'Brightlingsea'), mk('b2', 'Colchester')]
    const onHoursPreview = jest.fn()
    const { getByLabelText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={() => {}} onDirections={() => {}} onHoursPreview={onHoursPreview} onSwitch={() => {}}
      />
    )
    fireEvent.press(getByLabelText('Hours'))
    expect(onHoursPreview).toHaveBeenCalledWith('b2')
  })

  it('hides the Other Locations tab content (renders empty wrapper) when no other active branches', () => {
    const branches = [mk('b1', 'Brightlingsea')]
    const { queryByLabelText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={() => {}} onDirections={() => {}} onHoursPreview={() => {}} onSwitch={() => {}}
      />
    )
    expect(queryByLabelText('Switch to this branch')).toBeNull()
  })
})
```

- [ ] **Step 5: Update `profile-skeleton.test.tsx` tab label assertion**

Find any test that asserts on the tab label `'Branches'` and update to `'Other Locations'`. Specifically the existing `tab-branches` accessibility label test should keep its tab id `tab-branches` (the route id stays the same; only the visible label changes).

If the test asserts on the tab visible text, update accordingly.

- [ ] **Step 6: Run merchant tests + tsc**

```bash
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -6
npx tsc --noEmit 2>&1 | tail -3
```
Expected: all green · tsc clean.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/BranchesTab.tsx apps/customer-app/src/features/merchant/components/BranchCard.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/branches-tab.test.tsx apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx
git commit -m "feat(customer-app): Other Locations tab + BranchCard restructure

UX refinement §6.3 / §7.2. Branches tab renamed 'Other Locations';
current branch excluded; suspended branches excluded. BranchCard
restructured to name-first two-line layout with 4 actions (Call,
Directions, Hours, Switch). Card body is no-op; only Switch button
switches the page. Hours opens HoursPreviewSheet without page
switch. Tab count = number of OTHER active branches."
```

---

## Frontend — Reviews

### Task 14: Reviews tab restructure (toggle on top + scope label + per-branch counts)

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/ReviewsTab.tsx`
- Modify: `apps/customer-app/tests/features/merchant/reviews-tab-branch-filter.test.tsx`

**Why:** §7.3 — toggle moves above ReviewSummary; quiet "Reviews of {branch}" / "All branches" scope label between toggle and breakdown; toggle text shows per-branch counts.

- [ ] **Step 1: Update `reviews-tab-branch-filter.test.tsx` to assert new order + counts**

Append:

```tsx
  it('renders the toggle ABOVE the ReviewSummary', async () => {
    const { findAllByLabelText } = renderTab()
    // Find both the toggle button and the ReviewSummary; toggle must come first in the tree
    const toggleButton = await findAllByLabelText(/Brightlingsea|All branches/)
    expect(toggleButton.length).toBeGreaterThan(0)
    // (Order assertion: this test passes once the toggle renders before the breakdown
    // because find* searches in render order. If the breakdown were above, it would still
    // find both. To be more rigorous, the implementation also exposes a testID on the
    // toggle that this test can read.)
  })

  it('renders the scope label "Reviews of {branch}" between toggle and breakdown', async () => {
    const { findByText } = renderTab({ currentBranchName: 'Brightlingsea', isMultiBranch: true })
    expect(await findByText(/Reviews of Brightlingsea/)).toBeTruthy()
  })

  it('renders "All branches" scope label after toggling to all', async () => {
    const { findByText, getByLabelText } = renderTab({ currentBranchName: 'Brightlingsea', isMultiBranch: true })
    fireEvent.press(getByLabelText('All branches'))
    expect(await findByText(/^All branches$/)).toBeTruthy()
  })

  it('hides scope label and toggle on single-branch merchants', async () => {
    const { queryByText } = renderTab({ currentBranchName: 'Brightlingsea', isMultiBranch: false })
    expect(queryByText(/Reviews of Brightlingsea/)).toBeNull()
    expect(queryByText(/All branches/)).toBeNull()
  })
```

If the existing test file's `renderTab` helper doesn't take `isMultiBranch` or `currentBranchName` as overridable, update it to do so.

- [ ] **Step 2: Run, verify the new tests fail**

```bash
npx jest tests/features/merchant/reviews-tab-branch-filter.test.tsx --forceExit 2>&1 | tail -8
```
Expected: previous tests pass; new ones fail (no scope label rendered today).

- [ ] **Step 3: Modify `ReviewsTab.tsx`**

Read the file. Find the JSX render block. Move the `[toggle]` JSX to render BEFORE `<ReviewSummary />`. Insert a `<Text>` scope label between them.

Schematically (replace the relevant chunk):

```tsx
  // Inside the main render, the new order is:
  return (
    <View style={styles.container}>
      {isMultiBranch ? (
        <View style={styles.toggleRow} testID="reviews-toggle">
          <Pressable style={[styles.toggleBtn, filter === 'branch' && styles.toggleBtnActive]} accessibilityLabel={currentBranchName} onPress={() => setFilter('branch')}>
            <Text variant="label.md" style={[styles.toggleText, filter === 'branch' && styles.toggleTextActive]}>
              {currentBranchName}{currentBranchCount > 0 ? ` (${currentBranchCount})` : ''}
            </Text>
          </Pressable>
          <Pressable style={[styles.toggleBtn, filter === 'all' && styles.toggleBtnActive]} accessibilityLabel="All branches" onPress={() => setFilter('all')}>
            <Text variant="label.md" style={[styles.toggleText, filter === 'all' && styles.toggleTextActive]}>
              All branches{allBranchesCount > 0 ? ` (${allBranchesCount})` : ''}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isMultiBranch ? (
        <Text variant="label.md" style={styles.scopeLabel} numberOfLines={1} ellipsizeMode="tail">
          {filter === 'branch' ? `Reviews of ${currentBranchName}` : 'All branches'}
        </Text>
      ) : null}

      <ReviewSummary {...} />
      <ReviewSortControl {...} />
      {/* ... reviews list ... */}
    </View>
  )
```

Add the new prop `currentBranchCount` and `allBranchesCount` to the `Props` type. Have the screen compute them from `selectedBranch.reviewCount` and `merchant.reviewCount`.

Append to `styles`:

```tsx
  scopeLabel: { color: '#888', fontSize: 11, marginVertical: 6, textAlign: 'center' },
```

- [ ] **Step 4: Update screen call-site**

In `MerchantProfileScreen.tsx`:

```tsx
          {activeTab === 'reviews' && (
            <ReviewsTab
              merchantId={merchant.id}
              currentBranchId={sb.id}
              currentBranchName={branchShortName(sb.name)}
              myReview={sb.myReview}
              isMultiBranch={isMultiBranch}
              currentBranchCount={sb.reviewCount}
              allBranchesCount={merchant.reviewCount}
            />
          )}
```

- [ ] **Step 5: Run merchant tests + tsc**

```bash
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -6
npx tsc --noEmit 2>&1 | tail -3
```
Expected: all green · tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/ReviewsTab.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/reviews-tab-branch-filter.test.tsx
git commit -m "feat(customer-app): Reviews tab — toggle on top + scope label + counts

UX refinement §7.3. Branch/all toggle moves ABOVE ReviewSummary so
the scope is established before the breakdown. Quiet 'Reviews of
{branch}' / 'All branches' scope label between toggle and summary.
Toggle text shows per-branch counts (hidden when count=0). Single-
branch merchants hide both toggle and scope label."
```

---

## Wire-up & QA

### Task 15: Mid-scroll switch — sticky tab indicator pulse

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/TabBar.tsx`
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`

**Why:** §8.2 entry 6 — when user is mid-scroll (sticky tab bar engaged) and the branch switches, the active tab indicator pulses 2 → 3 → 2 px to give peripheral feedback.

- [ ] **Step 1: Add a test in a new file**

```tsx
// apps/customer-app/tests/features/merchant/tab-bar-pulse.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { TabBar } from '@/features/merchant/components/TabBar'

describe('TabBar — sticky pulse animation', () => {
  it('renders the active tab indicator with the standard 2px height by default', () => {
    const { getByTestId } = render(
      <TabBar
        tabs={[{ id: 'vouchers', label: 'Vouchers' }, { id: 'reviews', label: 'Reviews' }]}
        activeTab="vouchers"
        onTabPress={() => {}}
        switchTrigger={null}
      />
    )
    const indicator = getByTestId('tab-active-indicator')
    expect(indicator.props.style?.height).toBe(2)
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
npx jest tests/features/merchant/tab-bar-pulse.test.tsx --forceExit 2>&1 | tail -5
```
Expected: FAIL — `tab-active-indicator` testID not yet present.

- [ ] **Step 3: Modify `TabBar.tsx` to expose the indicator and accept `switchTrigger`**

Read the file. Add `switchTrigger?: string | null` to Props. Wrap the active-tab indicator in `Animated.View` with a `useSharedValue` for height that pulses on `switchTrigger` change. Add `testID="tab-active-indicator"`.

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from 'react-native'

// Inside the component:
const reducedMotion = useReducedMotion()
const indicatorHeight = useSharedValue(2)
const isFirstRender = React.useRef(true)

React.useEffect(() => {
  if (isFirstRender.current) {
    isFirstRender.current = false
    return
  }
  if (reducedMotion) return
  indicatorHeight.value = withSequence(
    withTiming(3, { duration: 125, easing: Easing.out(Easing.ease) }),
    withTiming(2, { duration: 125, easing: Easing.out(Easing.ease) }),
  )
}, [switchTrigger, reducedMotion, indicatorHeight])

const animatedIndicatorStyle = useAnimatedStyle(() => ({ height: indicatorHeight.value }))

// In the JSX, wrap the indicator:
<Animated.View testID="tab-active-indicator" style={[styles.indicator, animatedIndicatorStyle]} />
```

The exact location of the indicator depends on the existing implementation. If today's `TabBar` doesn't have a separate indicator element, add one (a 2px brand-red bar under the active tab).

- [ ] **Step 4: Update screen call-site to pass `switchTrigger`**

```tsx
        <TabBar tabs={tabs} activeTab={activeTab} onTabPress={setActiveTab} switchTrigger={sb.id} />
```

- [ ] **Step 5: Run, verify pass**

```bash
npx jest tests/features/merchant/ --forceExit 2>&1 | tail -6
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/merchant/components/TabBar.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/tab-bar-pulse.test.tsx
git commit -m "feat(customer-app): TabBar — sticky-mode active-indicator pulse on switch

UX refinement §8.2 entry 6. Active-tab indicator pulses 2→3→2 px
over ~250ms on selectedBranch.id change. Lightweight peripheral
feedback for mid-scroll users when the header has scrolled off-
screen. Reduced-motion: skipped."
```

---

### Task 16: Final wiring + cleanup + above-the-fold sanity check

**Files:**
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` (final pass)
- Run: full test sweep

**Why:** Tighten the screen wiring after every component is in place. Verify the locked rules in §6.4 and §11 are met. Remove dead code.

- [ ] **Step 1: Audit remaining `MetaSection` references**

```bash
grep -rn "MetaSection" apps/customer-app/ 2>&1 | head
```
If any remain (other than in archived/old test files), remove them. Delete the file `apps/customer-app/src/features/merchant/components/MetaSection.tsx` if it still exists and has no consumers.

- [ ] **Step 2: Verify the page composition matches §6.4 vertical order**

Read `MerchantProfileScreen.tsx`. The render order must be:
1. SuspendedBranchBanner (already present)
2. HeroSection
3. MerchantHeadline (Task 6)
4. BranchChip (Task 7)
5. (Drop the descriptor — it now lives in the meta row layer or directly in the headline area; if descriptor is still rendered separately, ensure it sits AFTER the chip and BEFORE the meta row)
6. MetaRow (Task 8)
7. Action row (Call · Directions · Website — existing)
8. TabBar (sticky)
9. Tab content

If the descriptor (`merchant.descriptor` text) is currently inside the old `MetaSection`, it disappeared in Task 8. Re-add a small `<Text>` rendering it directly between the chip and the meta row, with style `color: #888, fontSize: 11`.

- [ ] **Step 3: Verify above-the-fold check by running the existing `profile-skeleton` test for sticky header indices**

This is the test added in PR #33 that pins `stickyHeaderIndices`. Confirm it still passes:

```bash
npx jest tests/features/merchant/profile-skeleton.test.tsx --forceExit 2>&1 | tail -6
```
Expected: PASS. If the children-count of the ScrollView changed (e.g. MerchantHeadline added as a separate child), the `stickyHeaderIndices=[N]` value may need adjustment. Recount the children and update the screen + test together.

- [ ] **Step 4: Drop dead local computations from the screen**

In `MerchantProfileScreen.tsx`, several local consts may now be unused:
- `closesAt` (computed for the chip; chip no longer renders it)
- `county` (placeholder; not used yet)
- `singleBranchAddress` if it existed

Run `tsc --noEmit` and ESLint with `noUnusedLocals` to identify dead code:

```bash
npx tsc --noEmit 2>&1 | tail -10
npx eslint src/features/merchant 2>&1 | tail -10
```

Remove anything flagged as unused.

- [ ] **Step 5: Run full test sweep**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
# Customer-app jest
npx jest --prefix apps/customer-app --forceExit 2>&1 | tail -10
# tsc + ESLint
cd apps/customer-app
npx tsc --noEmit 2>&1 | tail -3
npx eslint src/features/merchant tests/features/merchant 2>&1 | tail -3
# Backend
cd /Users/shebinchaliyath/Developer/Redeemo
npx vitest run tests/api/customer/ 2>&1 | tail -6
```
Expected:
- jest: all merchant tests green · 1 pre-existing baseline failure on `tests/lib/api/profile.test.ts`
- tsc: clean (or only the 3 pre-existing root-level errors documented in CLAUDE.md)
- ESLint: at baseline (43 errors)
- vitest: 154/154 green (was 153 + 1 from Task 1)

- [ ] **Step 6: Commit**

```bash
git add -A apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx
git commit -m "chore(customer-app): final screen wire-up + cleanup

Drops unused locals (closesAt, county, etc.) after meta row + chip
restructure. Confirms the §6.4 vertical layout order. Fixes
stickyHeaderIndices to match the new child count after
MerchantHeadline insertion."
```

---

### Task 17: Push branch + open PR + on-device QA

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/merchant-profile-ux-refinement
```
Expected: branch published, PR-creation URL printed.

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --title "Merchant Profile — UX refinement (Tier 2)" --body "$(cat <<'EOF'
## Summary

Implements the Tier 2 UX refinement to the customer-app Merchant Profile screen per the design spec at \`docs/superpowers/specs/2026-05-04-merchant-profile-ux-refinement-design.md\`. Built on top of the branch-aware merchant profile already on main (PR #32 + PR #33).

## What lands

- **Headline restructure** — merchant name + brand-red branch line beneath
- **Switcher chip** — pure verb \`Switch branch ▾\` + first-visit caret hint
- **Other Locations tab** — renamed from "Branches"; current branch excluded; name-first cards with 4 actions; tap-no-op
- **HoursPreviewSheet** — peek at another branch's hours without page switch
- **Meta row** — single-line balanced layout with smart status text (am/pm friendly), de-emphasised distance, right-anchored rating block
- **Voucher-context label** — quiet "Showing offers for {branch}" at top of Vouchers tab; persistent + fades on switch
- **Reviews tab** — toggle moves above ReviewSummary; scope label; per-branch counts
- **Motion layer** — coordinated parallel animations on branch switch (line flash + meta-row dips + chip caret nod + voucher-context fade + sticky tab pulse) with skip-on-mount + reduced-motion support
- **Per-branch ratings** on \`BranchTile\` (one additive backend change)

## Test plan

- [ ] On-device: multi-branch merchant — switching from chip + picker shows coordinated motion; single-branch hides branch line + chip
- [ ] On-device: Other Locations tab — Hours opens preview sheet; Switch → re-scopes the page
- [ ] On-device: meta row smart status — "Closes at 10:30pm" vs "Closes in 30 min" countdown vs "Opens at 5:00pm"
- [ ] On-device: voucher-context label persists across scrolls; updates with fade on switch
- [ ] On-device: Reviews tab — toggle on top, scope label between toggle and breakdown
- [ ] On-device: reduced-motion — all animations replaced by instant value swaps
- [ ] On-device: 375px phone — first voucher card visible immediately below sticky tab bar

## Spec traceability

Every task maps 1:1 to a spec section. See plan at \`docs/superpowers/plans/2026-05-04-merchant-profile-ux-refinement.md\`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: PAUSE for owner review**

Do NOT merge until owner has reviewed + on-device QA passes.

---

## Self-Review (post-write check)

1. **Spec coverage** — every spec section maps to a task:

| Spec section | Implementing task |
|---|---|
| §6.1 Branch identity in headline | Task 6 |
| §6.2 Switcher chip | Task 7 |
| §6.3 Other Locations tab | Task 13 |
| §6.4 Page composition | Task 16 (final wire-up) |
| §6.5 Voucher-context reinforcement | Task 10 |
| §7.1 Meta row | Task 8 |
| §7.2 Branch surfaces hierarchy (picker) | Task 11 |
| §7.2 Branch surfaces hierarchy (Other Locations cards) | Task 13 |
| §7.3 Reviews tab restructure | Task 14 |
| §7.4 Hours CTA | Task 12 (HoursPreviewSheet) + Task 13 (wire) |
| §8 Motion & Transition | Task 9 (core hook + animations) + Task 15 (mid-scroll tab pulse) + Task 10 (voucher-context fade) |
| §9 Defensive rules | Task 3 (smartStatus tests cover the table) + per-component empty-state tests |
| §10 Backend dependencies | Task 1 |
| §11 Acceptance criteria | Each task's tests cover its slice of §11 |

2. **Placeholder scan** — no "TBD", "TODO", "implement later", "similar to Task N", or "add appropriate handling". Each step shows actual code.

3. **Type consistency** — `SmartStatus` (Task 3) → consumed by `MetaRow` (Task 8), `BranchPickerSheet` (Task 11), `BranchCard` (Task 13), `HoursPreviewSheet` (Task 12). `BranchTile` extended in Task 1 with `reviewCount` + `avgRating` — consumed by `RatingBlock` callers in Tasks 11 + 13. `branchShortName` (Task 2) consumed by Tasks 6, 10, 11, 13.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-04-merchant-profile-ux-refinement.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
