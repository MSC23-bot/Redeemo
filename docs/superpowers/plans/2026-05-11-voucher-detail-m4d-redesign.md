# Voucher Detail M4d TIME_LIMITED Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the TIME_LIMITED Voucher Detail screen so live status / countdown is part of the voucher identity (embedded in the hero), the coupon body carries availability + usage rule + description in a clean hierarchy, the explainer copy is rewritten to Redeemo tone, HowItWorks adds a TL-specific "Check the Window" step, and the M4b stop-gap components (FrostedCountdown, TimeLimitedBanner, TimeLimitedDetailsCard) are deleted in favour of the new structure.

**Architecture:** Single-PR scope built off main (`d94f874` + spec commit `b6975f6`). One new component `<HeroStatusBlock>` mounted inside `<CouponHeader>`. `useTimeLimited` hook gains an additive return shape (`currentWindow`, `nextWindow`, `msToClose`, `msToOpen`) plus a 1s tick gated on urgent-final-minute. `<CouponBodyCard>` gains four TL-only sections (Availability / Usage rule / Description / Offer ends). Description placement change is TIME_LIMITED-only per D6(C); non-TL voucher types are not visually altered in M4d. Phase 0 hardens the brittle voucher-detail-states fixture before any UI work begins. Three M4b components are deleted in the same commits that introduce their replacements.

**Tech Stack:** Expo SDK 54 customer-app, React 18, React Native, TypeScript strict, jest-expo + React Native Testing Library, Reanimated v3 (existing, for progress bar tween + reduced-motion).

**Predecessor docs:**
- Spec: `docs/superpowers/specs/2026-05-11-voucher-detail-m4d-redesign-design.md` (committed `b6975f6`).
- M4 backend payload spec: `docs/superpowers/specs/2026-05-10-voucher-detail-m4-time-limited-design.md`.
- Reference: `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/reference_london_clock_helper.md` (Hermes-robust formatter pattern).
- Reference: `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/feedback_time_limited_urgent_threshold_locked.md` (60 min URGENT_THRESHOLD_MS).

**Single-PR sequencing:** Phase 0 → Phase A → Phase B → Phase C → Phase D → Phase E → Phase F → Phase G → Phase H → Phase I. Branch off `main`. Owner on-device QA hold at Phase I.1 before push. Single PR per project standing rule.

---

## Files inventory

### New files
- `apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx` — hero-mounted status block; 11 state variants; progress bar; a11y live-region contract.
- `apps/customer-app/tests/features/voucher/hero-status-block.test.tsx` — pins all 11 states + progress bar mechanics + Hermes-robust formatters + reduced-motion + a11y live-region contract.

### Modified files
- `apps/customer-app/tests/features/voucher/voucher-detail-states.test.tsx` — Phase 0: add suite-level `jest.useFakeTimers()` + `jest.setSystemTime`. Phase G: update mount-order assertions for new components (HeroStatusBlock present, FrostedCountdown/TimeLimitedBanner/TimeLimitedDetailsCard absent).
- `apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts` — additive return shape (`currentWindow`, `nextWindow`, `msToClose`, `msToOpen`); new 1s tick gated on `windowState === 'urgent' && msToClose <= 60000`.
- `apps/customer-app/tests/features/voucher/use-time-limited.test.ts` — new pins for additive shape + 1s tick + tick-cleanup contract.
- `apps/customer-app/src/features/voucher/utils/countdownFormat.ts` — add `formatPrimaryWhen(boundary, now)` (A.1) + `formatUrgentCountdown(msToClose)` (A.2, dead-on-arrival under amended D10) + the M4d-amended family (A.5): `formatDuration` + `formatClosingCountdown` + `formatOpeningCountdown` + `formatAvailableAgainCountdown` + `formatClosingA11y` + `formatOpeningA11y` + `formatAvailableAgainA11y`.
- `apps/customer-app/tests/features/voucher/countdown-format.test.ts` — new pins for two new formatters.
- `apps/customer-app/src/features/voucher/components/CouponHeader.tsx` — accept `statusBlock?: React.ReactNode` prop; mount below the title; suppress description rendering when `voucher.type === 'TIME_LIMITED'`.
- `apps/customer-app/tests/features/voucher/coupon-header.test.tsx` — pin description-suppressed-for-TL + statusBlock-mounted contract.
- `apps/customer-app/src/features/voucher/components/CouponBody.tsx` — add four TL-only sections to `<CouponBodyCard>`; bump `<CouponTopCard>` banner image height 180→240 when present.
- `apps/customer-app/tests/features/voucher/coupon-body-tl-sections.test.tsx` — NEW test file pinning TL section order + visibility + non-TL unchanged.
- `apps/customer-app/src/features/voucher/components/HowItWorks.tsx` — branch on `voucher.type === 'TIME_LIMITED'` to insert "Check the Window" at index 1.
- `apps/customer-app/tests/features/voucher/how-it-works.test.tsx` — new pins for TL-step insertion + non-TL unchanged.
- `apps/customer-app/src/features/voucher/constants/productCopy.ts` — replace TIME_LIMITED explainer body; add `CHECK_THE_WINDOW_STEP` constant + TL-aware step-list helpers.
- `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` — delete `<FrostedCountdown>`/`<TimeLimitedBanner>`/`<TimeLimitedDetailsCard>` mount sites + imports + style blocks; wire `<HeroStatusBlock>` into `<CouponHeader>`; thread voucher type into `<CouponBodyCard>`.

### Deleted files (Phase H — all together, in commits that delete the corresponding mount sites)
- `apps/customer-app/src/features/voucher/components/FrostedCountdown.tsx`
- `apps/customer-app/tests/features/voucher/frosted-countdown.test.tsx`
- `apps/customer-app/src/features/voucher/components/TimeLimitedBanner.tsx`
- `apps/customer-app/tests/features/voucher/time-limited-banner.test.tsx`
- `apps/customer-app/src/features/voucher/components/TimeLimitedDetailsCard.tsx`
- `apps/customer-app/tests/features/voucher/time-limited-details-card.test.tsx`

---

## Phase 0 — §AM1 fixture hardening (closes §AM1)

Per D1 lock: suite-level `jest.useFakeTimers()` + `jest.setSystemTime('2026-05-11T12:00:00Z')` BEFORE any new M4d UI work.

**Scope fence (locked):** Phase 0 is **test-only**. No product source files (`src/...`) are modified. No state-machine logic changes. No hook changes. No copy changes. The single commit shape is `test(voucher): ...` — touching only `apps/customer-app/tests/features/voucher/voucher-detail-states.test.tsx`. If any product-behaviour change is tempted during Phase 0 (e.g. "while I'm in here, let me also fix X"), STOP and file it as a separate Phase A+ task.

### Task 0.1: Add suite-level fake-timers + fixed system-time to voucher-detail-states tests

**Files:**
- Modify: `apps/customer-app/tests/features/voucher/voucher-detail-states.test.tsx`

- [ ] **Step 1: Verify the two brittle tests currently exist + read their names**

Run: `grep -n "unavailable-today state\|unavailable-future-day state" apps/customer-app/tests/features/voucher/voucher-detail-states.test.tsx`

Expected: 2 lines matching `it('time-limited-unavailable-today state: ...', …)` and `it('time-limited-unavailable-future-day state: ...', …)`.

- [ ] **Step 2: Confirm the brittleness with one run at the relevant clock window**

If on-device clock is not after 21:30 London, this step is informational only. Otherwise, run the suite and confirm the two tests fail intermittently:

Run: `cd apps/customer-app && npx jest tests/features/voucher/voucher-detail-states.test.tsx --forceExit`

- [ ] **Step 3: Add suite-level `beforeEach` / `afterEach` block to the top of the describe**

Locate the `describe(...)` opener for the voucher-detail-states suite. Immediately inside it, before any `it(...)`, add:

```typescript
beforeEach(() => {
  jest.useFakeTimers()
  // Noon UTC = 13:00 BST on 2026-05-11. Sits well clear of the
  // 21:30 London brittleness boundary AND clear of next-day-rollover
  // edges with futureISO(180) / futureISO(1440). Locked: spec D1
  // (2026-05-11-voucher-detail-m4d-redesign-design.md §6 D1).
  jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
})

afterEach(() => {
  jest.useRealTimers()
})
```

- [ ] **Step 4: Run the suite 3× consecutively to confirm determinism**

Run: `cd apps/customer-app && for i in 1 2 3; do npx jest tests/features/voucher/voucher-detail-states.test.tsx --forceExit || break; done`

Expected: all 3 runs PASS. No flake.

- [ ] **Step 5: Run the full voucher suite to check for collateral damage (fake-timer collisions)**

Run: `cd apps/customer-app && npx jest tests/features/voucher/ --forceExit`

Expected: all green. If any suite that was previously green now fails because it relies on real timers, the failure is contained to `voucher-detail-states.test.tsx`'s suite scope (`beforeEach` only runs inside its own describe), so collateral damage should not happen — investigate as a real regression if it does.

- [ ] **Step 6: Commit Phase 0**

```bash
git add apps/customer-app/tests/features/voucher/voucher-detail-states.test.tsx
git commit -m "$(cat <<'EOF'
test(voucher): harden voucher-detail-states fixture with jest.setSystemTime (closes §AM1)

The two brittle TL-unavailable tests in voucher-detail-states.test.tsx
use real wall-clock + futureISO(180) arithmetic, which crosses midnight
London after ~21:30 local and flips the assertion target. Switch the
suite to fake timers pinned at 2026-05-11T12:00:00Z (noon UTC = 13:00
BST) so state-machine derivation is deterministic regardless of run
time.

Phase 0 of the M4d redesign per spec D1 lock. Must precede any new
M4d UI work so the new HeroStatusBlock + CouponBody pins inherit a
deterministic base.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase A — Hook + formatters extension

**Per-second tick scope fence (locked, owner direction 2026-05-11):** The 1-second `setInterval` introduced in Task A.4 is gated EXCLUSIVELY by `windowState === 'urgent' && msToClose > 0 && msToClose <= 60_000`. Per-second ticking MUST NOT run in any of these scenarios:

- **Normal active windows** (>60min remaining) — drive at 60s tick.
- **Urgent windows above the final-minute threshold** (15–60min, 1–15min) — drive at 60s tick.
- **Outside-window states** (`unavailable-today`, `unavailable-future-day`, `no-windows`) — drive at 60s tick.
- **Future-day countdowns** (any state with `nextWindowStartsAt` more than 60s away) — drive at 60s tick.
- **Merchant Profile cards (M4c)** — DO NOT tick per-second at all. Merchant cards use the existing Reanimated pulse-dot for urgency signalling, NOT a per-second clock update. Per-second ticking is a Voucher Detail HeroStatusBlock concern only.

If a future change considers extending the 1s tick scope, it must be a new spec/plan decision — not folded silently into M4d.

### Task A.1: Add `formatPrimaryWhen` formatter (Today / Tomorrow / Weekday at H:Mam/pm)

Per D3 canonical primary format: `<When> at <Hour><am/pm>` where `<When>` ∈ "Today" / "Tomorrow" / full weekday name.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/utils/countdownFormat.ts`
- Modify: `apps/customer-app/tests/features/voucher/countdown-format.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these `it(...)` blocks to the existing `describe('countdownFormat', ...)` or whichever section the existing formatter tests live in. If `countdown-format.test.ts` does not exist, create it with a minimal describe wrapper.

```typescript
import { formatPrimaryWhen } from '@/features/voucher/utils/countdownFormat'

describe('formatPrimaryWhen', () => {
  // Deterministic clock per Phase 0 pattern.
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))  // Monday noon UTC = 13:00 BST
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders "Today at 5pm" when boundary is later today (London local)', () => {
    const now = new Date('2026-05-11T12:00:00Z')                 // Mon 13:00 BST
    const boundary = new Date('2026-05-11T16:00:00Z')            // Mon 17:00 BST = 5pm
    expect(formatPrimaryWhen(boundary, now)).toBe('Today at 5pm')
  })

  it('renders "Today at 5:30pm" when boundary has minutes', () => {
    const now = new Date('2026-05-11T12:00:00Z')
    const boundary = new Date('2026-05-11T16:30:00Z')            // Mon 17:30 BST = 5:30pm
    expect(formatPrimaryWhen(boundary, now)).toBe('Today at 5:30pm')
  })

  it('renders "Tomorrow at 11am" when boundary is on the next London day', () => {
    const now = new Date('2026-05-11T12:00:00Z')                 // Mon 13:00 BST
    const boundary = new Date('2026-05-12T10:00:00Z')            // Tue 11:00 BST
    expect(formatPrimaryWhen(boundary, now)).toBe('Tomorrow at 11am')
  })

  it('renders "Saturday at 11am" when boundary is 5 days out', () => {
    const now = new Date('2026-05-11T12:00:00Z')                 // Monday
    const boundary = new Date('2026-05-16T10:00:00Z')            // Saturday 11:00 BST
    expect(formatPrimaryWhen(boundary, now)).toBe('Saturday at 11am')
  })

  it('renders "Wednesday at 12pm" using 12-hour noon convention', () => {
    const now = new Date('2026-05-11T12:00:00Z')                 // Monday
    const boundary = new Date('2026-05-13T11:00:00Z')            // Wednesday 12:00 BST
    expect(formatPrimaryWhen(boundary, now)).toBe('Wednesday at 12pm')
  })

  it('renders "Friday at 12am" using 12-hour midnight convention', () => {
    const now = new Date('2026-05-11T12:00:00Z')                 // Monday
    const boundary = new Date('2026-05-14T23:00:00Z')            // Friday 00:00 BST (next day)
    expect(formatPrimaryWhen(boundary, now)).toBe('Friday at 12am')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/countdown-format.test.ts -t "formatPrimaryWhen" --forceExit`

Expected: FAIL — `formatPrimaryWhen is not a function` or `is not exported from countdownFormat`.

- [ ] **Step 3: Implement `formatPrimaryWhen`**

Add to `apps/customer-app/src/features/voucher/utils/countdownFormat.ts` (after `formatClockHour12`, before `formatDayName`):

```typescript
/**
 * Renders the M4d hero-status-block primary line:
 *   "Today at <H>am/pm"
 *   "Tomorrow at <H>am/pm"
 *   "<Weekday> at <H>am/pm"  (2+ days out, full weekday name)
 *
 * Locked: spec D3 canonical primary format. Hermes-robust — uses
 * `formatToParts` numeric extraction + the hardcoded `DAYS_FULL`
 * array; avoids `weekday: 'long'`/'short' and `toLocaleTimeString`.
 * London-local for the day-comparison (matches the rest of the
 * voucher-detail surface).
 */
export function formatPrimaryWhen(boundary: Date, now: Date): string {
  const clock = formatClockHour12(boundary)
  const boundaryYmd = ymdFor(boundary)
  const nowYmd = ymdFor(now)
  if (sameYmd(boundaryYmd, nowYmd)) return `Today at ${clock}`
  const tomorrowYmd = addOneDay(nowYmd)
  if (sameYmd(boundaryYmd, tomorrowYmd)) return `Tomorrow at ${clock}`
  return `${formatDayName(boundary)} at ${clock}`
}

type Ymd = { year: number; month: number; day: number }

function ymdFor(date: Date): Ymd {
  const parts = YMD_FORMATTER.formatToParts(date)
  const get = (t: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find(x => x.type === t)
    if (!p) throw new Error(`ymdFor: missing ${t}`)
    return parseInt(p.value, 10)
  }
  return { year: get('year'), month: get('month'), day: get('day') }
}

function sameYmd(a: Ymd, b: Ymd): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

function addOneDay(ymd: Ymd): Ymd {
  // Use Date.UTC arithmetic — no DST exposure since we operate on
  // London-local calendar coordinates already extracted via YMD_FORMATTER.
  const t = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day))
  t.setUTCDate(t.getUTCDate() + 1)
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/countdown-format.test.ts -t "formatPrimaryWhen" --forceExit`

Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/utils/countdownFormat.ts apps/customer-app/tests/features/voucher/countdown-format.test.ts
git commit -m "$(cat <<'EOF'
feat(voucher): add formatPrimaryWhen for M4d hero-status-block primary line

Canonical primary format from spec D3: "<When> at <H>am/pm" where
<When> is "Today" / "Tomorrow" / full weekday name. Hermes-robust via
formatToParts numeric extraction + hardcoded DAYS_FULL array. Reuses
formatClockHour12 (existing) for the time portion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task A.2: Add `formatUrgentCountdown` formatter

Per D10: seconds only in the final 60 seconds of urgent state.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/utils/countdownFormat.ts`
- Modify: `apps/customer-app/tests/features/voucher/countdown-format.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { formatUrgentCountdown } from '@/features/voucher/utils/countdownFormat'

describe('formatUrgentCountdown', () => {
  it('returns "Closes in 23m" when 23 minutes remain', () => {
    expect(formatUrgentCountdown(23 * 60_000)).toBe('Closes in 23m')
  })

  it('returns "Closes in 1m" when 90 seconds remain (rounds down to whole minutes above the 60s threshold)', () => {
    // Above 60s: minute granularity. 90s → 1 minute.
    expect(formatUrgentCountdown(90_000)).toBe('Closes in 1m')
  })

  it('returns "Closes in 47s" when 47 seconds remain', () => {
    expect(formatUrgentCountdown(47_000)).toBe('Closes in 47s')
  })

  it('returns "Closes in 60s" when exactly 60 seconds remain', () => {
    // Boundary: 60s → still seconds-mode (inclusive on the consumer side).
    expect(formatUrgentCountdown(60_000)).toBe('Closes in 60s')
  })

  it('returns "Closes in 1s" when 1 second remains', () => {
    expect(formatUrgentCountdown(1_000)).toBe('Closes in 1s')
  })

  it('returns "Closes now" when msToClose is 0', () => {
    expect(formatUrgentCountdown(0)).toBe('Closes now')
  })

  it('returns "Closes now" when msToClose is negative (boundary already passed)', () => {
    expect(formatUrgentCountdown(-500)).toBe('Closes now')
  })

  it('returns "Closes in 1h 0m" when 60 minutes remain (above urgency band but consumer-facing edge)', () => {
    // Formatter is total-agnostic — caller decides when to invoke. Test that
    // duration math works at the urgency band's upper edge.
    expect(formatUrgentCountdown(60 * 60_000)).toBe('Closes in 1h 0m')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/countdown-format.test.ts -t "formatUrgentCountdown" --forceExit`

Expected: FAIL — `formatUrgentCountdown is not a function`.

- [ ] **Step 3: Implement `formatUrgentCountdown`**

Add to `countdownFormat.ts` (after `formatDurationCompact`):

```typescript
/**
 * M4d hero-status-block urgent-state primary formatter.
 *
 * Returns the user-facing countdown string given the absolute ms-until-
 * window-close. Seconds appear ONLY in the final 60 seconds (msToClose
 * ≤ 60_000). Above that, falls through to minute-or-coarser granularity
 * via `formatDurationCompact`. At or past the boundary, returns "Closes
 * now" until the parent state flips to outside-window.
 *
 * Locked: spec D10 final-60-seconds-only rule.
 */
export function formatUrgentCountdown(msToClose: number): string {
  if (msToClose <= 0) return 'Closes now'
  if (msToClose <= 60_000) {
    const seconds = Math.ceil(msToClose / 1_000)
    return `Closes in ${seconds}s`
  }
  return `Closes in ${formatDurationCompact(msToClose)}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/countdown-format.test.ts -t "formatUrgentCountdown" --forceExit`

Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/utils/countdownFormat.ts apps/customer-app/tests/features/voucher/countdown-format.test.ts
git commit -m "$(cat <<'EOF'
feat(voucher): add formatUrgentCountdown with final-60s seconds (D10)

Final-60-seconds-only seconds display per spec D10. Above 60s, falls
through to formatDurationCompact (minute granularity). At/past the
boundary, returns "Closes now" until the state machine flips outside
the window.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task A.3: Extend `useTimeLimited` return shape (additive: `currentWindow`, `nextWindow`, `msToClose`, `msToOpen`)

**Files:**
- Modify: `apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts`
- Modify: `apps/customer-app/tests/features/voucher/use-time-limited.test.ts`

- [ ] **Step 1: Write the failing test for the additive return shape**

Add to `use-time-limited.test.ts` (next to existing describe blocks; if the file uses jest fake-timers already, skip the new beforeEach):

```typescript
describe('useTimeLimited — M4d additive return shape', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('exposes currentWindow + msToClose when in active state', () => {
    const voucher = makeTLVoucher({
      currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T15:00:00Z' },
      nextWindow: null,
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.currentWindow).toEqual({
      startsAt: new Date('2026-05-11T10:00:00Z'),
      endsAt:   new Date('2026-05-11T15:00:00Z'),
    })
    expect(result.current.msToClose).toBe(3 * 60 * 60_000)  // 3 hours = 10_800_000
    expect(result.current.nextWindow).toBeNull()
    expect(result.current.msToOpen).toBeNull()
  })

  it('exposes nextWindow + msToOpen when in unavailable-today state', () => {
    const voucher = makeTLVoucher({
      currentWindow: null,
      nextWindow: { startsAt: '2026-05-11T17:00:00Z', endsAt: '2026-05-11T19:00:00Z' },
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.currentWindow).toBeNull()
    expect(result.current.msToClose).toBeNull()
    expect(result.current.nextWindow).toEqual({
      startsAt: new Date('2026-05-11T17:00:00Z'),
      endsAt:   new Date('2026-05-11T19:00:00Z'),
    })
    expect(result.current.msToOpen).toBe(5 * 60 * 60_000)  // 5 hours = 18_000_000
  })

  it('returns all four fields null when not TIME_LIMITED', () => {
    const voucher = makeNonTLVoucher()
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.currentWindow).toBeNull()
    expect(result.current.nextWindow).toBeNull()
    expect(result.current.msToClose).toBeNull()
    expect(result.current.msToOpen).toBeNull()
  })
})
```

The existing test file should already export `makeTLVoucher` / `makeNonTLVoucher` fixture helpers. If not, mirror them from the existing tests in the same file — do not invent new shapes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/use-time-limited.test.ts -t "M4d additive" --forceExit`

Expected: FAIL — `result.current.currentWindow is undefined` (the field doesn't exist on the return type yet).

- [ ] **Step 3: Extend the return type in `useTimeLimited.ts`**

Replace the existing `TimeLimitedState` type definition with the extended version:

```typescript
export type TimeLimitedState = {
  /** Is the voucher type TIME_LIMITED? Drives the "Time limited" badge. */
  isTimeLimited: boolean
  /** Derived window state — see `WindowState` union. */
  windowState: WindowState
  /**
   * Absolute UTC instant of the next consumer-visible boundary:
   *   • active / urgent → current window close
   *   • unavailable-today / unavailable-future-day → next window open
   *   • no-windows / not-time-limited → null
   */
  nextBoundaryAt: Date | null
  // ── M4d additive fields ──────────────────────────────────────
  /** Current window's startsAt + endsAt, or null when no window is open. */
  currentWindow: { startsAt: Date; endsAt: Date } | null
  /** Next window's startsAt + endsAt, or null when no upcoming window. */
  nextWindow: { startsAt: Date; endsAt: Date } | null
  /** ms remaining until currentWindow.endsAt; null when no currentWindow. */
  msToClose: number | null
  /** ms until nextWindow.startsAt; null when no nextWindow. */
  msToOpen: number | null
}
```

Then extend the `Computed` type and `computeState` to populate these. Replace the existing `Computed` definition + return:

```typescript
type Computed = {
  windowState: WindowState
  nextBoundaryAt: Date | null
  currentWindow: { startsAt: Date; endsAt: Date } | null
  nextWindow:    { startsAt: Date; endsAt: Date } | null
  msToClose: number | null
  msToOpen:  number | null
}
```

At the bottom of `computeState`, replace the return statement:

```typescript
  const currentWindowObj = voucher.currentWindow
    ? {
        startsAt: new Date(voucher.currentWindow.startsAt),
        endsAt:   new Date(voucher.currentWindow.endsAt),
      }
    : null
  const nextWindowObj = voucher.nextWindow
    ? {
        startsAt: new Date(voucher.nextWindow.startsAt),
        endsAt:   new Date(voucher.nextWindow.endsAt),
      }
    : null
  const msToClose = currentWindowObj
    ? currentWindowObj.endsAt.getTime() - now.getTime()
    : null
  const msToOpen = nextWindowObj
    ? nextWindowObj.startsAt.getTime() - now.getTime()
    : null

  return { windowState, nextBoundaryAt, currentWindow: currentWindowObj, nextWindow: nextWindowObj, msToClose, msToOpen }
```

Then update the `initialState` fallback (line ~159 in current source) so the not-TL path also returns the new null fields:

```typescript
  const initialState: Computed = isTimeLimited && voucher
    ? computeState(voucher, new Date())
    : { windowState: 'no-windows', nextBoundaryAt: null, currentWindow: null, nextWindow: null, msToClose: null, msToOpen: null }
```

And the not-TL branch inside `recompute`:

```typescript
  const recompute = () => {
    const v = voucherRef.current
    if (!v || v.type !== 'TIME_LIMITED') {
      setComputed({ windowState: 'no-windows', nextBoundaryAt: null, currentWindow: null, nextWindow: null, msToClose: null, msToOpen: null })
      return
    }
    setComputed(computeState(v, new Date()))
  }
```

Finally, expose the new fields in the hook's return statement:

```typescript
  return {
    isTimeLimited,
    windowState: computed.windowState,
    nextBoundaryAt: computed.nextBoundaryAt,
    currentWindow: computed.currentWindow,
    nextWindow:    computed.nextWindow,
    msToClose:     computed.msToClose,
    msToOpen:      computed.msToOpen,
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/use-time-limited.test.ts --forceExit`

Expected: All existing tests still PASS (additive change — no consumer broke). New 3 M4d tests also PASS.

- [ ] **Step 5: Run a broader sweep to confirm no consumer is mis-typed**

Run: `cd apps/customer-app && npx tsc --noEmit 2>&1 | grep -v "^$" | head -20`

Expected: zero new errors. (Pre-existing unrelated errors may remain — investigate any new ones.)

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts apps/customer-app/tests/features/voucher/use-time-limited.test.ts
git commit -m "$(cat <<'EOF'
feat(voucher): extend useTimeLimited return with currentWindow/nextWindow/msToClose/msToOpen (M4d)

Additive — no consumer change. New fields feed the M4d HeroStatusBlock
progress bar (% completed) and the final-60s seconds tick (msToClose).

Spec §8 hook additions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task A.4: Add 1-second tick gated on urgent-final-minute

Per D10 + §8: a SECOND `setInterval` ticks at 1s but ONLY when `windowState === 'urgent' && msToClose <= 60_000`. Cleared in all other states. Cleared on unmount + AppState background.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts`
- Modify: `apps/customer-app/tests/features/voucher/use-time-limited.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('useTimeLimited — M4d 1-second urgent-final-minute tick', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('updates msToClose every 1 second when urgent + msToClose <= 60_000', () => {
    // currentWindow closes 45 seconds from "now".
    const voucher = makeTLVoucher({
      currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T12:00:45Z' },
      nextWindow: null,
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.windowState).toBe('urgent')
    expect(result.current.msToClose).toBe(45_000)

    act(() => { jest.advanceTimersByTime(1_000) })
    expect(result.current.msToClose).toBe(44_000)

    act(() => { jest.advanceTimersByTime(1_000) })
    expect(result.current.msToClose).toBe(43_000)
  })

  it('does NOT install the 1s tick when urgent but msToClose > 60_000', () => {
    // urgent state but 5 minutes remain → minute granularity only.
    const voucher = makeTLVoucher({
      currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T12:05:00Z' },
      nextWindow: null,
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.windowState).toBe('urgent')
    expect(result.current.msToClose).toBe(5 * 60_000)

    // Advance 1s — should NOT trigger a recompute (interval not installed).
    act(() => { jest.advanceTimersByTime(1_000) })
    // Without a 1s tick, msToClose stays at the snapshot from initial render.
    // The 60s minute tick will eventually update it, but not at +1s.
    expect(result.current.msToClose).toBe(5 * 60_000)
  })

  it('clears the 1s tick when state transitions out of urgent (e.g., window closes → unavailable-today)', () => {
    // currentWindow closes 5 seconds from now; nextWindow opens at 17:00 BST.
    const voucher = makeTLVoucher({
      currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T12:00:05Z' },
      nextWindow:    { startsAt: '2026-05-11T16:00:00Z', endsAt: '2026-05-11T19:00:00Z' },
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.windowState).toBe('urgent')

    // Advance past the boundary +1ms — state should flip to unavailable-today.
    act(() => { jest.advanceTimersByTime(5_001) })
    expect(result.current.windowState).toBe('unavailable-today')

    // After transition, the 1s tick should be cleared. Advancing 1s does
    // not re-fire the 1s recompute (msToOpen would only update via the
    // 60s tick, which is a separate code path).
    const msToOpenBefore = result.current.msToOpen
    // Don't advance long enough to fire the 60s minute tick.
    act(() => { jest.advanceTimersByTime(500) })
    expect(result.current.msToOpen).toBe(msToOpenBefore)
  })

  it('clears the 1s tick on unmount', () => {
    const voucher = makeTLVoucher({
      currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T12:00:30Z' },
      nextWindow: null,
    })
    const { result, unmount } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.windowState).toBe('urgent')

    unmount()
    // After unmount, advancing time should not crash + not log warnings
    // about state updates on unmounted components.
    expect(() => { jest.advanceTimersByTime(5_000) }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/use-time-limited.test.ts -t "1-second urgent-final-minute" --forceExit`

Expected: FAIL — the 1s tick does not exist; tests will see `msToClose` not updating.

- [ ] **Step 3: Add the second-tick effect to `useTimeLimited.ts`**

Add a new `secondTickTimerRef` + effect AFTER the existing `intervalTimerRef` block (the 60s tick). The new effect mirrors the existing pattern but ticks at 1s and gates on `windowState === 'urgent' && msToClose <= 60_000`:

```typescript
  // M4d: per-second tick during the final 60 seconds of urgent state, so
  // the consumer-facing "Closes in 47s" countdown updates each second.
  // Outside that band, the 60s minute tick (above) is sufficient.
  //
  // Gated tightly so we don't burn battery / re-render every second across
  // the entire urgent state (which can last up to 60 minutes). Cleared on
  // state change, unmount, and AppState background. Locked: spec D10.
  const secondTickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wantsSecondTick =
    isTimeLimited &&
    stateKey === 'urgent' &&
    computed.msToClose !== null &&
    computed.msToClose <= 60_000 &&
    computed.msToClose > 0

  useEffect(() => {
    if (secondTickTimerRef.current) {
      clearInterval(secondTickTimerRef.current)
      secondTickTimerRef.current = null
    }
    if (!wantsSecondTick) return

    secondTickTimerRef.current = setInterval(() => {
      recompute()
    }, 1_000)

    return () => {
      if (secondTickTimerRef.current) {
        clearInterval(secondTickTimerRef.current)
        secondTickTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsSecondTick])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/use-time-limited.test.ts --forceExit`

Expected: all green, including the new 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts apps/customer-app/tests/features/voucher/use-time-limited.test.ts
git commit -m "$(cat <<'EOF'
feat(voucher): useTimeLimited 1s tick during urgent-final-minute (D10)

Gated on windowState === 'urgent' && msToClose ∈ (0, 60000]. Cleared on
state change, unmount, AppState background. Outside the band, the
existing 60s minute tick continues to drive re-renders for the
minute-granularity countdown.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

> **Amendment 2026-05-11 — duration-first precision rule supersedes A.2 + A.4.** Tasks A.2 and A.4 above shipped commits (`9238cc9` and `793bafd`) under the original "seconds only in final minute" lock. The owner's amendment to D3 + D10 (spec commit `594041f`) widens the precision rule:
>
> - Duration display: `"2d 4h"` / `"5h 12m"` / `"42m 15s"` / `"59s"` (4 tiers, minutes+seconds together under 1h).
> - Tick cadence: per-second whenever displayed countdown < 1 hour, in BOTH directions (msToClose / msToOpen).
> - A11y coarse stable labels extended (see spec D10 amendment).
>
> Tasks **A.5** and **A.6** below layer the corrected behaviour as new commits on top of A.2 + A.4. The old commits stay in history as honest record — no force-pushes, no amends.

### Task A.5: Duration-first formatter family (supersedes A.2)

Per spec D3 + D10 amendment: introduce a 4-tier `formatDuration` + three direction wrappers + three a11y label helpers. The old `formatUrgentCountdown` becomes equivalent to the new `formatClosingCountdown` under the new precision; rather than rename, leave `formatUrgentCountdown` exported but with its existing minute-only-above-60s behaviour and update all consumers to use `formatClosingCountdown` directly (zero consumers exist yet — A.2's export is dead-on-arrival to be cleaned up alongside §15 F1 post-M4d).

**Files:**
- Modify: `apps/customer-app/src/features/voucher/utils/countdownFormat.ts` — add 7 new exports.
- Modify: `apps/customer-app/tests/features/voucher/utils/countdownFormat.test.ts` — add tests for the 7 new exports.

- [ ] **Step 1: Write the failing tests**

Append after the existing `formatUrgentCountdown` describe block:

```typescript
import {
  formatDuration,
  formatClosingCountdown,
  formatOpeningCountdown,
  formatAvailableAgainCountdown,
  formatClosingA11y,
  formatOpeningA11y,
  formatAvailableAgainA11y,
} from '@/features/voucher/utils/countdownFormat'

describe('formatDuration (M4d amended D3 precision)', () => {
  // ── ≥ 1 day → "<d>d <h>h"
  it('renders "2d 4h" for 2 days 4 hours', () => {
    expect(formatDuration(2 * 86_400_000 + 4 * 3_600_000)).toBe('2d 4h')
  })
  it('renders "1d 0h" for exactly 1 day', () => {
    expect(formatDuration(86_400_000)).toBe('1d 0h')
  })
  // ── < 1 day, ≥ 1 hour → "<h>h <m>m"
  it('renders "5h 12m" for 5h 12m', () => {
    expect(formatDuration(5 * 3_600_000 + 12 * 60_000)).toBe('5h 12m')
  })
  it('renders "1h 0m" for exactly 1 hour', () => {
    expect(formatDuration(3_600_000)).toBe('1h 0m')
  })
  it('renders "23h 59m" just under 1 day', () => {
    expect(formatDuration(23 * 3_600_000 + 59 * 60_000)).toBe('23h 59m')
  })
  // ── < 1 hour, ≥ 1 minute → "<m>m <s>s"
  it('renders "42m 15s" for 42 minutes 15 seconds', () => {
    expect(formatDuration(42 * 60_000 + 15_000)).toBe('42m 15s')
  })
  it('renders "1m 0s" for exactly 1 minute', () => {
    expect(formatDuration(60_000)).toBe('1m 0s')
  })
  it('renders "59m 59s" just under 1 hour', () => {
    expect(formatDuration(59 * 60_000 + 59_000)).toBe('59m 59s')
  })
  // ── < 1 minute, > 0 → "<s>s"
  it('renders "59s" just under 1 minute', () => {
    expect(formatDuration(59_000)).toBe('59s')
  })
  it('renders "1s" for 1 second', () => {
    expect(formatDuration(1_000)).toBe('1s')
  })
  // ── ≤ 0 → "0s" (caller routes to "<verb> now")
  it('renders "0s" for 0 ms', () => {
    expect(formatDuration(0)).toBe('0s')
  })
  it('renders "0s" for negative ms', () => {
    expect(formatDuration(-1000)).toBe('0s')
  })
})

describe('formatClosingCountdown', () => {
  it('returns "Closes in 42m 15s" for under-1h closing', () => {
    expect(formatClosingCountdown(42 * 60_000 + 15_000)).toBe('Closes in 42m 15s')
  })
  it('returns "Closes in 1h 0m" for exactly 1 hour', () => {
    expect(formatClosingCountdown(3_600_000)).toBe('Closes in 1h 0m')
  })
  it('returns "Closes in 47s" under 1 minute', () => {
    expect(formatClosingCountdown(47_000)).toBe('Closes in 47s')
  })
  it('returns "Closes now" at 0 ms', () => {
    expect(formatClosingCountdown(0)).toBe('Closes now')
  })
  it('returns "Closes now" for negative ms', () => {
    expect(formatClosingCountdown(-500)).toBe('Closes now')
  })
})

describe('formatOpeningCountdown', () => {
  it('returns "Opens in 42m 15s"', () => {
    expect(formatOpeningCountdown(42 * 60_000 + 15_000)).toBe('Opens in 42m 15s')
  })
  it('returns "Opens in 5h 12m"', () => {
    expect(formatOpeningCountdown(5 * 3_600_000 + 12 * 60_000)).toBe('Opens in 5h 12m')
  })
  it('returns "Opens in 2d 4h" for multi-day countdown', () => {
    expect(formatOpeningCountdown(2 * 86_400_000 + 4 * 3_600_000)).toBe('Opens in 2d 4h')
  })
  it('returns "Opens in 47s" under 1 minute', () => {
    expect(formatOpeningCountdown(47_000)).toBe('Opens in 47s')
  })
  it('returns "Opens now" at 0 ms', () => {
    expect(formatOpeningCountdown(0)).toBe('Opens now')
  })
})

describe('formatAvailableAgainCountdown', () => {
  it('returns "Available again in 42m 15s"', () => {
    expect(formatAvailableAgainCountdown(42 * 60_000 + 15_000)).toBe('Available again in 42m 15s')
  })
  it('returns "Available again in 2d 4h" for multi-day', () => {
    expect(formatAvailableAgainCountdown(2 * 86_400_000 + 4 * 3_600_000)).toBe('Available again in 2d 4h')
  })
  it('returns "Available now" at 0 ms', () => {
    expect(formatAvailableAgainCountdown(0)).toBe('Available now')
  })
})

describe('formatClosingA11y — coarse stable labels (spec D10 amendment)', () => {
  it('returns "Closes in under a minute" when ms < 60_000 and > 0', () => {
    expect(formatClosingA11y(47_000)).toBe('Closes in under a minute')
    expect(formatClosingA11y(1_000)).toBe('Closes in under a minute')
  })
  it('returns "Closes in about N minutes" when 60_000 ≤ ms < 3_600_000', () => {
    expect(formatClosingA11y(42 * 60_000 + 15_000)).toBe('Closes in about 42 minutes')
    expect(formatClosingA11y(60_000)).toBe('Closes in about 1 minutes')  // single-form ok for now
  })
  it('returns null when ms ≥ 1 hour (caller uses eyebrow-as-label instead)', () => {
    expect(formatClosingA11y(3_600_000)).toBeNull()
    expect(formatClosingA11y(5 * 3_600_000)).toBeNull()
  })
  it('returns null at ≤ 0 ms', () => {
    expect(formatClosingA11y(0)).toBeNull()
    expect(formatClosingA11y(-100)).toBeNull()
  })
})

describe('formatOpeningA11y', () => {
  it('returns "Opens in under a minute" when ms < 60_000 and > 0', () => {
    expect(formatOpeningA11y(47_000)).toBe('Opens in under a minute')
  })
  it('returns "Opens in about N minutes" when 60_000 ≤ ms < 3_600_000', () => {
    expect(formatOpeningA11y(42 * 60_000 + 15_000)).toBe('Opens in about 42 minutes')
  })
  it('returns null when ms ≥ 1 hour', () => {
    expect(formatOpeningA11y(3_600_000)).toBeNull()
  })
})

describe('formatAvailableAgainA11y', () => {
  it('returns "Available again in under a minute" under 1 minute', () => {
    expect(formatAvailableAgainA11y(47_000)).toBe('Available again in under a minute')
  })
  it('returns "Available again in about N minutes" under 1 hour', () => {
    expect(formatAvailableAgainA11y(42 * 60_000 + 15_000)).toBe('Available again in about 42 minutes')
  })
  it('returns null when ms ≥ 1 hour', () => {
    expect(formatAvailableAgainA11y(3_600_000)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/customer-app && npx jest tests/features/voucher/utils/countdownFormat.test.ts -t "M4d amended D3 precision\|formatClosingCountdown\|formatOpeningCountdown\|formatAvailableAgainCountdown\|A11y" --forceExit
```

Expected: FAIL — all 7 new exports missing.

- [ ] **Step 3: Implement the 7 new exports**

Add to `apps/customer-app/src/features/voucher/utils/countdownFormat.ts`, placed near the other M4d formatters (after `formatPrimaryWhen` and `formatUrgentCountdown` from A.1/A.2):

```typescript
/**
 * M4d-amended duration formatter (spec D3 amendment 2026-05-11).
 *
 * 4-tier precision:
 *   ≥ 1 day            → "2d 4h"
 *   < 1 day, ≥ 1 hour  → "5h 12m"
 *   < 1 hour, ≥ 1 min  → "42m 15s"
 *   < 1 min, > 0       → "59s"
 *   ≤ 0                → "0s"  (caller routes to "<verb> now")
 *
 * Used by the duration-first hero status block primary line. Replaces
 * formatDurationCompact for the M4d hero — kept separate so the legacy
 * compact formatter (still used by formatPrimaryCountdown /
 * formatSupportingCountdown for the M4b FrostedCountdown / banner /
 * details card) is untouched until those components are deleted in
 * Phase H.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0s'

  const totalSeconds = Math.ceil(ms / 1_000)
  if (totalSeconds < 60) return `${totalSeconds}s`

  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes < 60) {
    const seconds = Math.ceil((ms - totalMinutes * 60_000) / 1_000)
    // Edge case: rounding-up seconds to 60 would render "Nm 60s" — bump minute, zero seconds.
    if (seconds === 60) return `${totalMinutes + 1}m 0s`
    return `${totalMinutes}m ${seconds}s`
  }

  const totalHours = Math.floor(ms / 3_600_000)
  if (totalHours < 24) {
    const minutes = Math.floor((ms - totalHours * 3_600_000) / 60_000)
    return `${totalHours}h ${minutes}m`
  }

  const totalDays = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms - totalDays * 86_400_000) / 3_600_000)
  return `${totalDays}d ${hours}h`
}

/** "Closes in <duration>" / "Closes now" */
export function formatClosingCountdown(ms: number): string {
  if (ms <= 0) return 'Closes now'
  return `Closes in ${formatDuration(ms)}`
}

/** "Opens in <duration>" / "Opens now" */
export function formatOpeningCountdown(ms: number): string {
  if (ms <= 0) return 'Opens now'
  return `Opens in ${formatDuration(ms)}`
}

/** "Available again in <duration>" / "Available now" */
export function formatAvailableAgainCountdown(ms: number): string {
  if (ms <= 0) return 'Available now'
  return `Available again in ${formatDuration(ms)}`
}

/**
 * Stable a11y label for the closing direction's polite live region.
 * Returns null for the ≥1h band — caller uses the eyebrow phrasing as
 * the accessibility label instead. Per spec D10 amendment 2026-05-11.
 */
export function formatClosingA11y(ms: number): string | null {
  if (ms <= 0) return null
  if (ms < 60_000) return 'Closes in under a minute'
  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000)
    return `Closes in about ${minutes} minutes`
  }
  return null
}

/** Stable a11y label for the opening direction. */
export function formatOpeningA11y(ms: number): string | null {
  if (ms <= 0) return null
  if (ms < 60_000) return 'Opens in under a minute'
  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000)
    return `Opens in about ${minutes} minutes`
  }
  return null
}

/** Stable a11y label for the available-again direction. */
export function formatAvailableAgainA11y(ms: number): string | null {
  if (ms <= 0) return null
  if (ms < 60_000) return 'Available again in under a minute'
  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000)
    return `Available again in about ${minutes} minutes`
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/customer-app && npx jest tests/features/voucher/utils/countdownFormat.test.ts --forceExit
```

Expected: all green — existing tests (including A.1's formatPrimaryWhen + A.2's formatUrgentCountdown) STILL PASS, the new ~36 tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd apps/customer-app && npx tsc --noEmit 2>&1 | grep countdownFormat | head -5
```

Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/voucher/utils/countdownFormat.ts apps/customer-app/tests/features/voucher/utils/countdownFormat.test.ts
git commit -m "$(cat <<'EOF'
feat(voucher): duration-first formatter family (M4d Task A.5, supersedes A.2)

7 new exports per spec D3 + D10 amendment 2026-05-11:
- formatDuration(ms) — 4-tier "2d 4h" / "5h 12m" / "42m 15s" / "59s"
- formatClosingCountdown / formatOpeningCountdown / formatAvailableAgainCountdown
- formatClosingA11y / formatOpeningA11y / formatAvailableAgainA11y (coarse stable labels for <1h band; null for ≥1h)

A.2's formatUrgentCountdown stays exported (dead-on-arrival under new
rule; cleanup deferred to a post-M4d sweep). HeroStatusBlock will
consume the new functions starting in Phase B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A.6: Widen 1s tick gate to under-1h in both directions (supersedes A.4)

Per spec D10 amendment: the 1-second `setInterval` runs whenever the displayed countdown is under 1 hour, regardless of direction. Current A.4 gate (`urgent && msToClose <= 60_000`) is too narrow — must widen to include msToClose < 3_600_000 OR msToOpen < 3_600_000.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts` — replace the `wantsSecondTick` boolean.
- Modify: `apps/customer-app/tests/features/voucher/use-time-limited.test.ts` — add 3 new tests for the wider gate; existing 4 A.4 tests stay green (the wider gate is a superset).

- [ ] **Step 1: Write the failing tests**

Append after the existing A.4 describe block (`useTimeLimited — M4d 1-second urgent-final-minute tick`):

```typescript
describe('useTimeLimited — M4d wider 1s tick under-1h both directions (Task A.6)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('installs 1s tick when urgent + msToClose 30 minutes (under 1h but above 60s — A.4 would have missed this)', () => {
    const voucher = baseVoucher({
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T12:30:00Z' },
      nextWindow: null,
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.windowState).toBe('urgent')
    expect(result.current.msToClose).toBe(30 * 60_000)

    act(() => { jest.advanceTimersByTime(1_000) })
    expect(result.current.msToClose).toBe(30 * 60_000 - 1_000)

    act(() => { jest.advanceTimersByTime(1_000) })
    expect(result.current.msToClose).toBe(30 * 60_000 - 2_000)
  })

  it('installs 1s tick when unavailable-today + msToOpen 30 minutes (opening direction)', () => {
    const voucher = baseVoucher({
      availabilityWindows: [{ dayOfWeek: 1, openTime: '15:00', closeTime: '18:00' }],
      currentWindow: null,
      nextWindow: { startsAt: '2026-05-11T12:30:00Z', endsAt: '2026-05-11T15:00:00Z' },  // 30 min from now
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.windowState).toBe('unavailable-today')
    expect(result.current.msToOpen).toBe(30 * 60_000)

    act(() => { jest.advanceTimersByTime(1_000) })
    expect(result.current.msToOpen).toBe(30 * 60_000 - 1_000)

    act(() => { jest.advanceTimersByTime(1_000) })
    expect(result.current.msToOpen).toBe(30 * 60_000 - 2_000)
  })

  it('does NOT install 1s tick when msToOpen is over 1 hour', () => {
    const voucher = baseVoucher({
      availabilityWindows: [{ dayOfWeek: 1, openTime: '17:00', closeTime: '19:00' }],
      currentWindow: null,
      nextWindow: { startsAt: '2026-05-11T14:00:00Z', endsAt: '2026-05-11T16:00:00Z' },  // 2h from now
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.windowState).toBe('unavailable-today')
    expect(result.current.msToOpen).toBe(2 * 3_600_000)

    act(() => { jest.advanceTimersByTime(1_000) })
    expect(result.current.msToOpen).toBe(2 * 3_600_000)  // unchanged — no 1s tick
  })
})
```

The existing A.4 tests (which test gates ≤60_000) MUST continue passing — they're a subset of the new gate. If any A.4 test fails after A.6's gate widens, that's a regression — STOP and report.

- [ ] **Step 2: Run new tests to confirm fail (and verify existing A.4 tests still pass)**

```bash
cd apps/customer-app && npx jest tests/features/voucher/use-time-limited.test.ts --forceExit
```

Expected:
- A.3 + A.4 tests: PASS (existing).
- A.6 new tests: FAIL — `msToClose` stays at 30*60_000 across timer advances (the wider gate isn't installed yet, so the 1s tick doesn't fire above 60s).

- [ ] **Step 3: Widen the `wantsSecondTick` gate in `useTimeLimited.ts`**

Locate the existing `wantsSecondTick` boolean (added in A.4):

```typescript
const wantsSecondTick =
  isTimeLimited &&
  stateKey === 'urgent' &&
  computed.msToClose !== null &&
  computed.msToClose <= 60_000 &&
  computed.msToClose > 0
```

Replace with the wider gate per spec D10 amendment:

```typescript
// M4d amendment 2026-05-11 — widened gate per spec D10. Tick per-second
// whenever displayed countdown < 1 hour, in EITHER direction:
//   • msToClose under 1h (closing — active/urgent states above 60s)
//   • msToOpen  under 1h (opening / available-again — unavailable-*
//                          and redeemed-this-window states)
// Merchant cards (M4c) untouched — they consume nothing from this gate.
const wantsSecondTick =
  isTimeLimited && (
    (computed.msToClose !== null && computed.msToClose > 0 && computed.msToClose < 3_600_000) ||
    (computed.msToOpen  !== null && computed.msToOpen  > 0 && computed.msToOpen  < 3_600_000)
  )
```

NOTE: do NOT touch the existing 60s `setInterval` (it continues to drive minute updates above 1h). The 1s `setInterval` and its `clearInterval` cleanup stay exactly as A.4 wrote them — only the GATE changes.

- [ ] **Step 4: Run all useTimeLimited tests**

```bash
cd apps/customer-app && npx jest tests/features/voucher/use-time-limited.test.ts --forceExit
```

Expected: all green — A.3 (3) + A.4 (4) + A.6 (3) = at least 10 M4d-additive tests PASS, plus all pre-existing tests.

- [ ] **Step 5: Run the broader voucher suite**

```bash
cd apps/customer-app && npx jest tests/features/voucher/ --forceExit 2>&1 | tail -6
```

Expected: all green.

- [ ] **Step 6: TypeScript check**

```bash
cd apps/customer-app && npx tsc --noEmit 2>&1 | grep useTimeLimited | head -5
```

Expected: zero matches.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts apps/customer-app/tests/features/voucher/use-time-limited.test.ts
git commit -m "$(cat <<'EOF'
feat(voucher): widen useTimeLimited 1s tick to under-1h both directions (M4d Task A.6, supersedes A.4)

Spec D10 amendment 2026-05-11. The 1s setInterval now runs whenever
the displayed countdown is under 1 hour, in EITHER direction:
  • msToClose < 3_600_000 (closing — active >60min above the M4c urgent
                            threshold; urgent ≤60min)
  • msToOpen  < 3_600_000 (opening — unavailable-today /
                            unavailable-future-day; available-again —
                            redeemed-this-window)

Both > 0 to skip the boundary moment (state machine flips). Existing
60s setInterval continues to drive minute updates above 1h. Merchant
Profile voucher cards (M4c) are unaffected — they consume no per-second
data from this hook.

A.4 (commit 793bafd) stays in branch history as record; this commit is
the corrective layer per the amendment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — `<HeroStatusBlock>` component

> **Amendment 2026-05-11 — under D3 + D10 amendment, Phase B tests below must be REWRITTEN before the engineer starts B.1.** The plan-text below was drafted under the original "clock-time primary" lock. Under the amended D3 (duration-first primary, clock-time supporting) + amended D10 (per-second tick under 1h in both directions; coarse stable a11y labels per direction):
>
> - **B.1 state-rendering tests:** the expected `getByTestId('hero-status-primary')` strings change from `"Open until 5:30pm"` / `"Today at 5pm"` / etc. → `"3h 12m"` / `"Closes in 42m 15s"` / `"Opens in 42m 15s"` / etc. per the new D3 table. The expected `getByTestId('hero-status-supporting')` strings change from the static schedule string → `"Ends 5:30pm today"` / `"Opens 5pm today"` / `"Saturday 11am"` per the new supporting-line format.
> - **B.2 progress bar tests:** unchanged conceptually — width math still uses `msToClose` / `msToOpen`. Colour bands still align with the M4c URGENT_THRESHOLD_MS (green >60min, amber ≤60min >15min, coral ≤15min). Eyebrow vs primary disambiguation moves up to the spec D3 table.
> - **B.3 a11y tests:** "Closes in under a minute" is now ONE of several stable labels; tests must also pin "Closes in about N minutes" (60_000 ≤ ms < 3_600_000) and the eyebrow-as-label path (ms ≥ 3_600_000). Opening + available-again directions get their own stable-label test pins. The `accessibilityElementsHidden` gate widens from "urgent final minute" to "wantsSecondTick === true" (i.e. any direction under 1h).
>
> **The engineer executing B.1 / B.2 / B.3 MUST consult the amended D3 + D10 spec sections (commit `594041f`) and apply the new strings + test expectations.** The Phase B intro a11y bullets below are kept for posterity but the third bullet's "Closes in under a minute" is now the ≤1m subcase, not the universal urgent-final-minute label.

**Reduced-motion + accessibility rule (locked, owner direction 2026-05-11; amended D10 widens scope):** Four concrete sub-rules:

1. **Countdown seconds may update visually.** The visible "42m 15s" / "47s" text updates each second under both normal-motion and reduced-motion (anywhere displayed countdown is < 1 hour). It's informational content (a fact about time), not decorative motion. The progress bar in Task B.2 uses plain `style.width` re-renders driven by the parent's tick cadence (60s above 1h, 1s under 1h) — no animation library is introduced, so there is no tween to suppress under reduced motion. **If a future task adds a Reanimated / Animated tween for the bar**, it MUST be gated on `useReducedMotion()` to fall through to a static width.
2. **`accessibilityLiveRegion` must NOT announce every second.** The seconds-display Text element is hidden from the accessibility tree (`accessibilityElementsHidden` iOS / `importantForAccessibility="no-hide-descendants"` Android) **whenever `wantsSecondTick === true`** — i.e. whenever any direction's displayed countdown is < 1 hour.
3. **Stable coarse live-region labels per direction (amended D10).** The polite live-region announces a STABLE string within each bucket, never per-second:
   - Closing direction, < 1 minute → `"Closes in under a minute"`
   - Closing direction, < 1 hour, ≥ 1 minute → `"Closes in about N minutes"` (N rounded)
   - Closing direction, ≥ 1 hour → eyebrow phrasing as label (`"Voucher available now"`)
   - Opening direction → mirror set: `"Opens in under a minute"` / `"Opens in about N minutes"` / eyebrow `"Opens today"` / `"Opens tomorrow"` / `"Opens <Weekday>"`
   - Available-again direction → `"Available again in under a minute"` / `"Available again in about N minutes"` / eyebrow `"Available again"`
   The string MUST NOT change at 47s → 46s → 30s → 5s, OR at 42m 15s → 42m 14s. It changes ONLY when the bucket flips (e.g. `< 1 hour` → `< 1 minute`, or window-close → state-machine flips to `unavailable-today`).
4. **Helpers `formatClosingA11y` / `formatOpeningA11y` / `formatAvailableAgainA11y` provide these strings.** All three live in `countdownFormat.ts` post-A.5. Each returns `null` for the ≥1h band — caller falls through to using the eyebrow string as the label.

### Task B.1: Component scaffolding + 11 visible-state rows

Per spec D2 visual treatment + D3 state table. The component renders a frosted card with eyebrow + primary + supporting lines, plus a slot for the progress bar (added in B.2).

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx`
- Create: `apps/customer-app/tests/features/voucher/hero-status-block.test.tsx`

- [ ] **Step 1: Write the failing tests (scaffolding + 11 states)**

```typescript
// apps/customer-app/tests/features/voucher/hero-status-block.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { HeroStatusBlock } from '@/features/voucher/components/HeroStatusBlock'

const SCHEDULE = 'Mon-Fri, 11am-3pm'

describe('HeroStatusBlock — state rendering (spec D3)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))  // Monday 13:00 BST
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('active state: "Available now" + "Today at 5:30pm" + schedule', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="active"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T16:30:00Z')}  // 5:30pm BST
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={4 * 60 * 60_000 + 30 * 60_000}
        msToOpen={null}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available now')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('Today at 5:30pm')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent(SCHEDULE)
  })

  it('urgent state (>60s remaining): "Closing soon" + "Closes in 23m"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:23:00Z')}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={23 * 60_000}
        msToOpen={null}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Closing soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('Closes in 23m')
  })

  it('urgent state final minute: "Closing soon" + "Closes in 47s"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:00:47Z')}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={47_000}
        msToOpen={null}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Closing soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('Closes in 47s')
  })

  it('unavailable-today state: "Opens today" + "Today at 5pm"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-today"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T16:00:00Z')}  // 5pm BST same day
        scheduleString={SCHEDULE}
        msToClose={null}
        msToOpen={4 * 60 * 60_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Opens today')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('Today at 5pm')
  })

  it('unavailable-future-day (tomorrow): "Opens tomorrow" + "Tomorrow at 11am"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-future-day"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-12T10:00:00Z')}  // Tuesday 11am BST
        scheduleString={SCHEDULE}
        msToClose={null}
        msToOpen={22 * 60 * 60_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Opens tomorrow')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('Tomorrow at 11am')
  })

  it('unavailable-future-day (Saturday): "Opens Saturday" + "Saturday at 11am"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-future-day"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-16T10:00:00Z')}  // Saturday 11am BST
        scheduleString={SCHEDULE}
        msToClose={null}
        msToOpen={5 * 24 * 60 * 60_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Opens Saturday')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('Saturday at 11am')
  })

  it('redeemed-this-window (later today): "Available again" + "Today at 5pm"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="redeemed-this-window"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T16:00:00Z')}
        scheduleString={SCHEDULE}
        msToClose={null}
        msToOpen={4 * 60 * 60_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available again')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('Today at 5pm')
  })

  it('redeemed-this-window (tomorrow): "Available again" + "Tomorrow at 11am"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="redeemed-this-window"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-12T10:00:00Z')}
        scheduleString={SCHEDULE}
        msToClose={null}
        msToOpen={22 * 60 * 60_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available again')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('Tomorrow at 11am')
  })

  it('redeemed-this-window (other day): "Available again" + "Saturday at 11am"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="redeemed-this-window"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-16T10:00:00Z')}
        scheduleString={SCHEDULE}
        msToClose={null}
        msToOpen={5 * 24 * 60 * 60_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available again')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('Saturday at 11am')
  })

  it('no-windows state: renders nothing (returns null)', () => {
    const { queryByTestId } = render(
      <HeroStatusBlock
        windowState="no-windows"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={null}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={null}
        msToOpen={null}
      />,
    )
    expect(queryByTestId('hero-status-eyebrow')).toBeNull()
    expect(queryByTestId('hero-status-block')).toBeNull()
  })

  it('expired state: renders nothing (returns null)', () => {
    const { queryByTestId } = render(
      <HeroStatusBlock
        windowState="expired"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowEndsAt={null}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={null}
        msToOpen={null}
      />,
    )
    expect(queryByTestId('hero-status-block')).toBeNull()
  })

  it('7-weekday defensive pin: full weekday names render for each day-of-week', () => {
    // Loop over 7 consecutive days starting Sun 2026-05-10, render the
    // unavailable-future-day eyebrow + primary, assert no abbreviated
    // name appears (regression guard for accidental .slice(0, 3) regressions
    // mirroring the M4c pin).
    const NOW = new Date('2026-05-04T12:00:00Z')                    // Monday week prior
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    DAYS.forEach((dayName, idx) => {
      // 2026-05-10 is a Sunday. Add idx days, then jump 7 days (1 week out)
      // so we're guaranteed unavailable-future-day (not "tomorrow").
      const dayMs = 24 * 60 * 60_000
      const boundary = new Date(NOW.getTime() + (7 + idx) * dayMs - 2 * 60 * 60_000)  // 11am London target
      const { getByTestId, unmount } = render(
        <HeroStatusBlock
          windowState="unavailable-future-day"
          now={NOW}
          currentWindowEndsAt={null}
          nextWindowStartsAt={boundary}
          scheduleString={SCHEDULE}
          msToClose={null}
          msToOpen={boundary.getTime() - NOW.getTime()}
        />,
      )
      expect(getByTestId('hero-status-eyebrow')).toHaveTextContent(`Opens ${dayName}`)
      expect(getByTestId('hero-status-primary')).toHaveTextContent(dayName)
      unmount()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hero-status-block.test.tsx --forceExit`

Expected: FAIL — `HeroStatusBlock` not found.

- [ ] **Step 3: Create `HeroStatusBlock.tsx`**

```typescript
// apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import type { WindowState } from '@/features/voucher/utils/timeLimitedWindow'
import {
  formatPrimaryWhen,
  formatUrgentCountdown,
  formatDayName,
} from '@/features/voucher/utils/countdownFormat'

/**
 * M4d hero-mounted status block for TIME_LIMITED vouchers.
 *
 * Mounts inside `<CouponHeader>` below the title (D2 lock). Renders an
 * inset frosted card over the voucher's type-coloured gradient, showing
 * eyebrow + primary + supporting + progress bar (B.2). Eleven state
 * variants per spec D3 + the "available again" redeemed-this-window
 * three-day variants.
 *
 * Renders null for 'no-windows' and 'expired' (existing expired seal
 * carries the message; no-windows means no schedule data).
 */

export type HeroStatusBlockState = WindowState | 'redeemed-this-window'

export type HeroStatusBlockProps = {
  windowState: HeroStatusBlockState
  /** Captured at parent render time so tests are deterministic. */
  now: Date
  /** Required for active/urgent + progress bar; null in other states. */
  currentWindowEndsAt: Date | null
  /** Required for unavailable-* and redeemed-this-window; null otherwise. */
  nextWindowStartsAt: Date | null
  /** Schedule string from scheduleString.ts (M4b-3). Always shown. */
  scheduleString: string
  /** ms to currentWindow.endsAt; drives urgent seconds countdown. */
  msToClose: number | null
  /** ms to nextWindow.startsAt; drives progress fill for upcoming. */
  msToOpen: number | null
}

export function HeroStatusBlock(props: HeroStatusBlockProps) {
  const { windowState, now, currentWindowEndsAt, nextWindowStartsAt, scheduleString, msToClose } = props
  if (windowState === 'no-windows' || windowState === 'expired') return null

  const { eyebrow, primary } = deriveEyebrowAndPrimary(props)
  if (!eyebrow || !primary) return null  // defensive — should not reach if state is one of the renderable rows

  return (
    <View testID="hero-status-block" style={styles.root}>
      <Text testID="hero-status-eyebrow" variant="label.eyebrow" style={styles.eyebrow}>
        {eyebrow}
      </Text>
      <Text testID="hero-status-primary" variant="display.sm" style={styles.primary}>
        {primary}
      </Text>
      <Text testID="hero-status-supporting" variant="body.sm" style={styles.supporting}>
        {scheduleString}
      </Text>
    </View>
  )
}

function deriveEyebrowAndPrimary(props: HeroStatusBlockProps): { eyebrow: string; primary: string } {
  const { windowState, now, currentWindowEndsAt, nextWindowStartsAt, msToClose } = props

  switch (windowState) {
    case 'active': {
      if (!currentWindowEndsAt) return { eyebrow: '', primary: '' }
      return {
        eyebrow: 'Available now',
        primary: `Open until ${currentWindowEndsAt ? formatClockHour12Short(currentWindowEndsAt) : ''}`.replace(' ', ' ').replace('Open until ', 'Open until '),  // formatted below
      }
    }
    case 'urgent': {
      // Primary uses msToClose-driven seconds-or-minutes formatter.
      return {
        eyebrow: 'Closing soon',
        primary: msToClose !== null ? formatUrgentCountdown(msToClose) : 'Closing soon',
      }
    }
    case 'unavailable-today':
    case 'unavailable-future-day':
    case 'redeemed-this-window': {
      if (!nextWindowStartsAt) return { eyebrow: '', primary: '' }
      const primary = formatPrimaryWhen(nextWindowStartsAt, now)
      const eyebrow = eyebrowForUpcoming(windowState, nextWindowStartsAt, now)
      return { eyebrow, primary }
    }
    default: {
      const _exhaustive: never = windowState
      void _exhaustive
      return { eyebrow: '', primary: '' }
    }
  }
}

function eyebrowForUpcoming(
  windowState: 'unavailable-today' | 'unavailable-future-day' | 'redeemed-this-window',
  boundary: Date,
  now: Date,
): string {
  if (windowState === 'redeemed-this-window') return 'Available again'
  // unavailable-* — derive Today / Tomorrow / Weekday off the SAME tomorrow-rule
  // helper used by formatPrimaryWhen. Re-using formatPrimaryWhen here would
  // give us "Today at 5pm" — we just want the day portion. Inline a small
  // delegation to keep the rule single-sourced.
  const sample = formatPrimaryWhen(boundary, now)  // "Today at 5pm" | "Tomorrow at 11am" | "Saturday at 11am"
  if (sample.startsWith('Today at ')) return 'Opens today'
  if (sample.startsWith('Tomorrow at ')) return 'Opens tomorrow'
  // 2+ days out — extract weekday from formatDayName for type safety.
  return `Opens ${formatDayName(boundary)}`
}

// We need 12-hour clock for "Open until 5:30pm" — call the existing helper.
// (Imported here to keep the hero block self-contained; the existing
// `formatClockHour12` lives in countdownFormat.ts.)
import { formatClockHour12 } from '@/features/voucher/utils/countdownFormat'
function formatClockHour12Short(date: Date): string {
  return formatClockHour12(date)
}

const styles = StyleSheet.create({
  root: {
    marginTop: 16,
    marginHorizontal: 0,  // already inset by parent CouponHeader paddings
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1,
    borderRadius: 12,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  primary: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  supporting: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },
})
```

Note on the inline `import { formatClockHour12 }` in the middle of the file — that's a clean-up the engineer should hoist to the top with the other imports. Inline shown above for clarity of dependency; final code MUST have ALL imports at the top of the file.

Also, the `active` state's `primary` field above contains some leftover formatting noise — replace its body with the clean version:

```typescript
    case 'active': {
      if (!currentWindowEndsAt) return { eyebrow: '', primary: '' }
      return {
        eyebrow: 'Available now',
        primary: `Open until ${formatClockHour12(currentWindowEndsAt)}`,
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hero-status-block.test.tsx --forceExit`

Expected: 12 tests PASS (11 states + 1 weekday-defensive pin).

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx apps/customer-app/tests/features/voucher/hero-status-block.test.tsx
git commit -m "$(cat <<'EOF'
feat(voucher): HeroStatusBlock component — 11 state variants (M4d Task B.1)

Renders eyebrow + primary + supporting lines per spec D3 table. Mounted
inside CouponHeader by Phase C. Returns null for no-windows / expired.
Reuses formatPrimaryWhen (A.1) for the canonical primary string +
formatUrgentCountdown (A.2) for the urgent-final-minute seconds.

Progress bar + a11y live-region contract land in B.2 + B.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task B.2: Add progress bar mechanics

Per D4 lock: bar EMPTIES left→right for active/urgent (time-left); bar FILLS left→right for unavailable-* (time-until-open); HIDDEN for redeemed-this-window + expired. Colour green/amber/coral by urgency thresholds. Eyebrow words disambiguate direction.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx`
- Modify: `apps/customer-app/tests/features/voucher/hero-status-block.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to the existing test file:

```typescript
describe('HeroStatusBlock — progress bar (spec D4)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('active state: progress bar EMPTIES — width % = msToClose / totalWindowMs', () => {
    const currentStart = new Date('2026-05-11T11:00:00Z')         // 12:00 BST (1h ago)
    const currentEnd   = new Date('2026-05-11T15:00:00Z')         // 16:00 BST (3h ahead)
    // Total window = 4h; remaining = 3h → 75%
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="active"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowStartsAt={currentStart}
        currentWindowEndsAt={currentEnd}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={3 * 60 * 60_000}
        msToOpen={null}
      />,
    )
    const bar = getByTestId('hero-status-progress-bar-fill')
    expect(bar.props.style.width).toBe('75%')
    expect(bar.props.style.backgroundColor).toBe('#34D399')       // green (>60min)
  })

  it('urgent state (>15min, <=60min): amber colour', () => {
    const currentStart = new Date('2026-05-11T11:00:00Z')
    const currentEnd   = new Date('2026-05-11T12:30:00Z')         // 30 min ahead
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowStartsAt={currentStart}
        currentWindowEndsAt={currentEnd}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={30 * 60_000}
        msToOpen={null}
      />,
    )
    const bar = getByTestId('hero-status-progress-bar-fill')
    expect(bar.props.style.backgroundColor).toBe('#FBBF24')       // amber
  })

  it('urgent state (<=15min): coral colour', () => {
    const currentStart = new Date('2026-05-11T11:00:00Z')
    const currentEnd   = new Date('2026-05-11T12:10:00Z')         // 10 min ahead
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowStartsAt={currentStart}
        currentWindowEndsAt={currentEnd}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={10 * 60_000}
        msToOpen={null}
      />,
    )
    const bar = getByTestId('hero-status-progress-bar-fill')
    expect(bar.props.style.backgroundColor).toBe('#FB7185')       // coral
  })

  it('unavailable-today: bar FILLS left→right, capped at 24h denominator', () => {
    // 4h until open → fill = 1 - (4h / 24h) = 1 - 0.1667 ≈ 83.3% capped scale.
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-today"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T16:00:00Z')}     // 4h ahead
        scheduleString={SCHEDULE}
        msToClose={null}
        msToOpen={4 * 60 * 60_000}
      />,
    )
    const bar = getByTestId('hero-status-progress-bar-fill')
    // Allow approximate match (width is a stringified percentage rounded to integer).
    expect(bar.props.style.width).toBe('83%')
    expect(bar.props.style.backgroundColor).toBe('rgba(255,255,255,0.65)')  // neutral
  })

  it('redeemed-this-window: progress bar HIDDEN', () => {
    const { queryByTestId } = render(
      <HeroStatusBlock
        windowState="redeemed-this-window"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T16:00:00Z')}
        scheduleString={SCHEDULE}
        msToClose={null}
        msToOpen={4 * 60 * 60_000}
      />,
    )
    expect(queryByTestId('hero-status-progress-bar-fill')).toBeNull()
  })
})
```

NOTE: this introduces a new prop `currentWindowStartsAt` to the component — needed to compute the total-window denominator for the active/urgent emptying bar. Existing tests in B.1 will need this prop passed too. **Add `currentWindowStartsAt: null` to all B.1 test invocations as part of this task** — Step 3 will list the props update.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hero-status-block.test.tsx -t "progress bar" --forceExit`

Expected: FAIL — `hero-status-progress-bar-fill` testID not found.

- [ ] **Step 3: Update `HeroStatusBlockProps`, B.1 tests, and component to add the bar**

In `HeroStatusBlock.tsx`, add `currentWindowStartsAt` to the prop type:

```typescript
export type HeroStatusBlockProps = {
  windowState: HeroStatusBlockState
  now: Date
  currentWindowStartsAt: Date | null  // NEW — needed for emptying-bar denominator
  currentWindowEndsAt: Date | null
  nextWindowStartsAt: Date | null
  scheduleString: string
  msToClose: number | null
  msToOpen: number | null
}
```

Add the progress bar render block + helpers:

```typescript
type BarSpec = { widthPct: number; color: string } | null

function deriveProgressBar(props: HeroStatusBlockProps): BarSpec {
  const { windowState, currentWindowStartsAt, currentWindowEndsAt, msToClose, msToOpen } = props

  if (windowState === 'redeemed-this-window' || windowState === 'no-windows' || windowState === 'expired') {
    return null
  }

  if (windowState === 'active' || windowState === 'urgent') {
    if (!currentWindowStartsAt || !currentWindowEndsAt || msToClose === null) return null
    const totalMs = currentWindowEndsAt.getTime() - currentWindowStartsAt.getTime()
    if (totalMs <= 0) return null
    const remainingPct = Math.max(0, Math.min(100, Math.round((msToClose / totalMs) * 100)))
    // Colour: green > 60min; amber ≤ 60min > 15min; coral ≤ 15min.
    let color = '#34D399'  // green
    if (msToClose <= 15 * 60_000) color = '#FB7185'        // coral
    else if (msToClose <= 60 * 60_000) color = '#FBBF24'   // amber
    return { widthPct: remainingPct, color }
  }

  // unavailable-today / unavailable-future-day → FILL bar
  if (msToOpen === null || msToOpen <= 0) return null
  const dayMs = 24 * 60 * 60_000
  const fillPct = Math.max(0, Math.min(100, Math.round((1 - msToOpen / dayMs) * 100)))
  return { widthPct: fillPct, color: 'rgba(255,255,255,0.65)' }
}
```

Render the bar (insert after the supporting text, inside the root View):

```jsx
{(() => {
  const bar = deriveProgressBar(props)
  if (!bar) return null
  return (
    <View testID="hero-status-progress-bar" style={styles.barTrack}>
      <View
        testID="hero-status-progress-bar-fill"
        style={[styles.barFill, { width: `${bar.widthPct}%`, backgroundColor: bar.color }]}
      />
    </View>
  )
})()}
```

Add styles:

```typescript
  barTrack: {
    marginTop: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
```

Update ALL existing B.1 test invocations to include `currentWindowStartsAt: null` (or a non-null Date where the active/urgent test required it). Update each `<HeroStatusBlock>` render call in the B.1 tests by adding the prop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hero-status-block.test.tsx --forceExit`

Expected: B.1 (12 tests) + B.2 (5 tests) all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx apps/customer-app/tests/features/voucher/hero-status-block.test.tsx
git commit -m "$(cat <<'EOF'
feat(voucher): HeroStatusBlock progress bar (M4d Task B.2)

Active/urgent: bar EMPTIES toward window close (width % = msToClose /
totalWindowMs). Unavailable-*: bar FILLS toward window open (width % =
1 - msToOpen/24h, capped). Redeemed-this-window + no-windows + expired:
bar HIDDEN.

Colours: green >60min, amber ≤60min >15min, coral ≤15min. Unavailable
states use neutral white at 0.65 alpha (no urgency).

Spec D4 lock — eyebrow words ("Closing" vs "Opens") disambiguate the
bar's direction; no literal label on the bar itself.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task B.3: A11y live-region contract + reduced-motion

Per D10 lock: seconds-display element MUST NOT fire per-second screen-reader announcements. Parent block announces ONCE on state transitions via stable summary string. Reduced motion DOES suppress the progress bar tween BUT does NOT suppress the seconds tick (informational, not decorative).

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx`
- Modify: `apps/customer-app/tests/features/voucher/hero-status-block.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('HeroStatusBlock — accessibility (spec D10)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('urgent-final-minute primary text is hidden from accessibility tree (no per-second a11y spam)', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowStartsAt={new Date('2026-05-11T11:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:00:47Z')}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={47_000}
        msToOpen={null}
      />,
    )
    const primary = getByTestId('hero-status-primary')
    // iOS: accessibilityElementsHidden true so VoiceOver doesn't read every tick.
    expect(primary.props.accessibilityElementsHidden).toBe(true)
    // Android: importantForAccessibility hidden so TalkBack skips it.
    expect(primary.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('non-urgent-final-minute primary text remains accessible', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="active"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowStartsAt={new Date('2026-05-11T11:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T15:00:00Z')}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={3 * 60 * 60_000}
        msToOpen={null}
      />,
    )
    const primary = getByTestId('hero-status-primary')
    expect(primary.props.accessibilityElementsHidden).not.toBe(true)
    expect(primary.props.importantForAccessibility).not.toBe('no-hide-descendants')
  })

  it('emits a stable live-region label for urgent-final-minute (does not include seconds)', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowStartsAt={new Date('2026-05-11T11:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:00:47Z')}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={47_000}
        msToOpen={null}
      />,
    )
    const region = getByTestId('hero-status-live-region')
    expect(region.props.accessibilityLiveRegion).toBe('polite')
    expect(region.props.accessibilityLabel).toBe('Closes in under a minute')
  })

  it('emits a different live-region label for urgent state above 60s', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={new Date('2026-05-11T12:00:00Z')}
        currentWindowStartsAt={new Date('2026-05-11T11:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:23:00Z')}
        nextWindowStartsAt={null}
        scheduleString={SCHEDULE}
        msToClose={23 * 60_000}
        msToOpen={null}
      />,
    )
    const region = getByTestId('hero-status-live-region')
    expect(region.props.accessibilityLabel).toBe('Closing soon, about 23 minutes left')
  })

  it('live-region label is STABLE across multiple 1s ticks within urgent-final-minute', () => {
    // Re-render the component at 1s intervals within the final 60s and
    // assert the accessibilityLabel never updates — the per-second tick
    // must not feed into the live region. Stable label is the locked
    // owner contract (2026-05-11).
    const baseStart = new Date('2026-05-11T11:00:00Z')
    const now = new Date('2026-05-11T12:00:00Z')
    const renderProps = (msToClose: number) => ({
      windowState: 'urgent' as const,
      now,
      currentWindowStartsAt: baseStart,
      currentWindowEndsAt: new Date(now.getTime() + msToClose),
      nextWindowStartsAt: null,
      scheduleString: SCHEDULE,
      msToClose,
      msToOpen: null,
    })
    const { getByTestId, rerender } = render(<HeroStatusBlock {...renderProps(47_000)} />)
    const initialLabel = getByTestId('hero-status-live-region').props.accessibilityLabel
    expect(initialLabel).toBe('Closes in under a minute')
    rerender(<HeroStatusBlock {...renderProps(46_000)} />)
    expect(getByTestId('hero-status-live-region').props.accessibilityLabel).toBe(initialLabel)
    rerender(<HeroStatusBlock {...renderProps(30_000)} />)
    expect(getByTestId('hero-status-live-region').props.accessibilityLabel).toBe(initialLabel)
    rerender(<HeroStatusBlock {...renderProps(1_000)} />)
    expect(getByTestId('hero-status-live-region').props.accessibilityLabel).toBe(initialLabel)
  })
})
```

(The `currentWindowEndsAt` computation in the last test is awkward — simplify by extracting it to a `new Date(startMs + msToClose)` outside the inline `props` factory in implementation review.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hero-status-block.test.tsx -t "accessibility" --forceExit`

Expected: FAIL.

- [ ] **Step 3: Add a11y handling to the component**

In `HeroStatusBlock.tsx`, compute the stable a11y summary label and mount an invisible live-region View. The label is set via `accessibilityLabel` (not as a child string) so VoiceOver / TalkBack read the string while the View itself stays visually hidden and child-free. Tests assert against `.props.accessibilityLabel` — see B.3 Step 1 tests.

Add a helper:

```typescript
/**
 * Derives the stable accessibility live-region label for the current
 * window state. STABLE means: across multiple 1s ticks within the same
 * windowState (especially urgent-final-minute), the returned string
 * must NOT change. The string changes ONLY when windowState itself
 * changes. Spec D10 lock — no per-second VoiceOver / TalkBack spam.
 */
function deriveLiveRegionLabel(props: HeroStatusBlockProps): string | null {
  const { windowState, msToClose, nextWindowStartsAt, now } = props

  if (windowState === 'no-windows' || windowState === 'expired') return null

  if (windowState === 'active') {
    return 'Voucher available now'
  }
  if (windowState === 'urgent') {
    if (msToClose !== null && msToClose <= 60_000) {
      // Stable string for the entire urgent-final-minute window —
      // does NOT include the seconds value. Owner-locked 2026-05-11.
      return 'Closes in under a minute'
    }
    if (msToClose !== null) {
      const minutes = Math.max(1, Math.round(msToClose / 60_000))
      return `Closing soon, about ${minutes} minutes left`
    }
    return 'Closing soon'
  }
  if (windowState === 'unavailable-today' || windowState === 'unavailable-future-day') {
    if (!nextWindowStartsAt) return 'Currently unavailable'
    const when = formatPrimaryWhen(nextWindowStartsAt, now)
    return `Currently unavailable, opens ${when.toLowerCase()}`
  }
  if (windowState === 'redeemed-this-window') {
    if (!nextWindowStartsAt) return 'Redeemed this window'
    const when = formatPrimaryWhen(nextWindowStartsAt, now)
    return `Redeemed this window, available again ${when.toLowerCase()}`
  }
  return null
}

function isUrgentFinalMinute(windowState: HeroStatusBlockState, msToClose: number | null): boolean {
  return windowState === 'urgent' && msToClose !== null && msToClose <= 60_000 && msToClose > 0
}
```

Update the primary Text element's a11y props conditionally — hide from a11y tree ONLY when in urgent-final-minute (so VoiceOver doesn't re-read the changing "47s" / "46s" / etc. text):

```jsx
<Text
  testID="hero-status-primary"
  variant="display.sm"
  style={styles.primary}
  accessibilityElementsHidden={isUrgentFinalMinute(windowState, msToClose) || undefined}
  importantForAccessibility={isUrgentFinalMinute(windowState, msToClose) ? 'no-hide-descendants' : undefined}
>
  {primary}
</Text>
```

Add the live-region sibling node inside the root View (after the progress bar). The View is **child-free** — only `accessibilityLabel` + `accessibilityLiveRegion` props feed the assistive tech:

```jsx
{(() => {
  const liveLabel = deriveLiveRegionLabel(props)
  if (!liveLabel) return null
  return (
    <View
      testID="hero-status-live-region"
      accessibilityLiveRegion="polite"
      accessibilityLabel={liveLabel}
      // Visually hidden — the live region is an a11y-only surface.
      // No child Text node — `accessibilityLabel` carries the string
      // and the View stays empty (prevents RN's "raw string child"
      // warning + keeps the test-level assertion shape simple).
      style={styles.liveRegionHidden}
    />
  )
})()}
```

Add the style:

```typescript
  liveRegionHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hero-status-block.test.tsx --forceExit`

Expected: all B.1, B.2, B.3 tests PASS. Tests assert against `.props.accessibilityLabel` on the live-region View (NOT `.children` — the View is child-free). Implementation matches.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx apps/customer-app/tests/features/voucher/hero-status-block.test.tsx
git commit -m "$(cat <<'EOF'
feat(voucher): HeroStatusBlock a11y live-region contract + reduced-motion (M4d Task B.3)

Urgent-final-minute primary text is hidden from accessibility tree
(accessibilityElementsHidden iOS / importantForAccessibility=no-hide-
descendants Android) so per-second visual updates don't fire
per-second VoiceOver / TalkBack spam.

Stable accessibilityLabel-driven live-region summary fires once on
state transition: "Closes in under a minute" in urgent-final-minute
(stable for all 60 ticks within the final-minute window). Owner-locked
spec D10 + amendment 2026-05-11.

Reduced motion: progress bar tween IS suppressed (decorative motion).
Seconds tick IS NOT suppressed (informational content — the seconds
remaining is a fact about time, not decoration).

Live-region View is child-free — accessibilityLabel carries the
announcement string; the View is visually hidden via the
liveRegionHidden style. Tests assert against .props.accessibilityLabel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — `<CouponHeader>` integration

### Task C.1: Add `statusBlock` slot + suppress description for TL only

Per D6(C): for `voucher.type === 'TIME_LIMITED'`, suppress the description slot and mount the `<HeroStatusBlock>` in its place. For all other voucher types, description renders unchanged.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/CouponHeader.tsx`
- Modify: `apps/customer-app/tests/features/voucher/coupon-header.test.tsx` (create if it does not exist)

- [ ] **Step 1: Confirm coupon-header.test.tsx exists OR create it**

Run: `ls apps/customer-app/tests/features/voucher/coupon-header.test.tsx 2>&1 | head -1`

If the file doesn't exist, scaffold it with:

```typescript
// apps/customer-app/tests/features/voucher/coupon-header.test.tsx
import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'
import { CouponHeader } from '@/features/voucher/components/CouponHeader'

const BASE_PROPS = {
  type: 'BOGO' as const,
  title: 'Sample voucher',
  description: 'A sample voucher description',
  estimatedSaving: 5,
  insetTop: 0,
  onBack: jest.fn(),
  onShare: jest.fn(),
  onFav: jest.fn(),
  isFavourited: false,
}

describe('CouponHeader', () => {
  it('renders description for non-TL voucher types', () => {
    const { getByText } = render(<CouponHeader {...BASE_PROPS} />)
    expect(getByText('A sample voucher description')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Write the failing tests for the new behaviour**

Add:

```typescript
it('suppresses description when type is TIME_LIMITED', () => {
  const { queryByText } = render(
    <CouponHeader {...BASE_PROPS} type="TIME_LIMITED" />,
  )
  expect(queryByText('A sample voucher description')).toBeNull()
})

it('mounts the statusBlock slot when provided', () => {
  const { getByTestId } = render(
    <CouponHeader
      {...BASE_PROPS}
      type="TIME_LIMITED"
      statusBlock={<Text testID="status-slot-content">STATUS</Text>}
    />,
  )
  expect(getByTestId('status-slot-content')).toBeTruthy()
})

it('does not render the statusBlock when not provided', () => {
  const { queryByTestId } = render(
    <CouponHeader {...BASE_PROPS} type="TIME_LIMITED" />,
  )
  expect(queryByTestId('hero-status-block')).toBeNull()
})

it('renders description for BOGO even when a statusBlock would otherwise mount (defensive)', () => {
  const { getByText, queryByTestId } = render(
    <CouponHeader
      {...BASE_PROPS}
      type="BOGO"
      statusBlock={<Text testID="status-slot-content">STATUS</Text>}
    />,
  )
  expect(getByText('A sample voucher description')).toBeTruthy()
  // statusBlock is TL-only — should NOT render even if passed.
  expect(queryByTestId('status-slot-content')).toBeNull()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/coupon-header.test.tsx --forceExit`

Expected: FAIL — `statusBlock` prop unknown.

- [ ] **Step 4: Update `CouponHeader.tsx`**

Add `statusBlock` to props:

```typescript
type Props = {
  // ... existing fields
  /**
   * M4d hero-mounted status block — TIME_LIMITED only. When voucher.type
   * is TIME_LIMITED AND this prop is provided, the description slot is
   * suppressed and statusBlock renders in its place. For all other voucher
   * types, this prop is ignored (description renders unchanged).
   */
  statusBlock?: React.ReactNode
}
```

In the render output, locate the description rendering and replace with:

```jsx
{voucher.type === 'TIME_LIMITED' && statusBlock ? (
  statusBlock
) : description ? (
  <Text variant="body.md" style={styles.description} numberOfLines={3}>
    {description}
  </Text>
) : null}
```

Adapt the snippet above to the actual existing description block in `CouponHeader.tsx` (the exact JSX shape varies; the principle is: for TIME_LIMITED with a statusBlock, render the statusBlock; otherwise existing behaviour).

Specifically the conditional should look like this in context (replace the existing description block):

```jsx
{type === 'TIME_LIMITED' && statusBlock ? (
  statusBlock
) : description ? (
  <Text /* existing description Text element */>
    {description}
  </Text>
) : null}
```

(Note: the prop is `type`, not `voucher.type` — `CouponHeader` already receives the type as a top-level prop.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/coupon-header.test.tsx --forceExit`

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/CouponHeader.tsx apps/customer-app/tests/features/voucher/coupon-header.test.tsx
git commit -m "$(cat <<'EOF'
feat(voucher): CouponHeader accepts statusBlock slot for TL (M4d Task C.1)

For voucher.type === 'TIME_LIMITED' with a statusBlock prop, the
description slot is suppressed and the statusBlock renders in its place.
All other voucher types keep description in the hero unchanged.

Spec D6(C) — TL-only scope. Universal description placement is the
§AN1 follow-up filed for after M4d ships.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — `<CouponBodyCard>` TL sections + `<CouponTopCard>` banner bump

**D6(C) lock restated (scope fence).** Phase D modifies coupon-body and banner-image behaviour **for TIME_LIMITED vouchers ONLY**. The voucher description is moved out of `<CouponHeader>` into `<CouponBodyCard>` **only when `voucher.type === 'TIME_LIMITED'`**. All other voucher types (BOGO, Discount, Freebie, Spend & Save, Reusable, Package Deal) keep their existing hero-with-description layout AND their existing coupon-body section structure. No re-layout of non-TL voucher types in this PR.

The transient hero asymmetry between TL (status-block-in-hero) and non-TL (description-in-hero) is acknowledged and accepted; universal description placement is the §AN1 follow-up filed for after M4d ships.

Task D.1's test plan includes an explicit regression pin (the "does NOT render TL-only sections for non-TL voucher types" test) to prevent accidental cross-type bleed.

### Task D.1: Add Availability + Usage rule + Description + Offer ends sections + bump banner image

Per D6(C) + D5: four new TL-only sections in CouponBodyCard, in order: Availability → Usage rule → Description → Terms → Fair Use → Offer ends. The existing Terms + Fair Use sections move down. Banner image bumps 180→240 when present.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/CouponBody.tsx`
- Create: `apps/customer-app/tests/features/voucher/coupon-body-tl-sections.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/customer-app/tests/features/voucher/coupon-body-tl-sections.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { CouponBodyCard, CouponTopCard } from '@/features/voucher/components/CouponBody'

const TL_PROPS_BASE = {
  type: 'TIME_LIMITED' as const,
  terms: 'In-house only. Cannot be combined with other offers.',
  description: 'Buy any pizza and get a free side salad.',
  scheduleString: 'Mon-Fri, 11am-3pm',
  expiryDate: null as string | null,
}

describe('CouponBodyCard — TIME_LIMITED sections (spec §5)', () => {
  it('renders Availability section for TL with schedule string', () => {
    const { getByTestId } = render(<CouponBodyCard {...TL_PROPS_BASE} />)
    const availability = getByTestId('coupon-body-availability')
    expect(availability).toBeTruthy()
    expect(availability.props.accessibilityLabel || '').toContain('Mon-Fri, 11am-3pm')
  })

  it('renders Usage rule section for TL with "Redeem once per active window" copy', () => {
    const { getByTestId } = render(<CouponBodyCard {...TL_PROPS_BASE} />)
    const usage = getByTestId('coupon-body-usage-rule')
    expect(usage).toBeTruthy()
    expect(usage.props.accessibilityLabel || '').toContain('once per active window')
  })

  it('renders Description section for TL (moved from hero per D6(C))', () => {
    const { getByText } = render(<CouponBodyCard {...TL_PROPS_BASE} />)
    expect(getByText('Buy any pizza and get a free side salad.')).toBeTruthy()
  })

  it('renders Offer ends section ONLY when expiryDate is non-null', () => {
    const withExpiry = render(<CouponBodyCard {...TL_PROPS_BASE} expiryDate="2026-12-31T00:00:00Z" />)
    expect(withExpiry.getByTestId('coupon-body-offer-ends')).toBeTruthy()

    const withoutExpiry = render(<CouponBodyCard {...TL_PROPS_BASE} expiryDate={null} />)
    expect(withoutExpiry.queryByTestId('coupon-body-offer-ends')).toBeNull()
  })

  it('sections render in DOM order: Availability → Usage rule → Description → Terms → Fair Use → Offer ends', () => {
    const { getByTestId, toJSON } = render(
      <CouponBodyCard {...TL_PROPS_BASE} expiryDate="2026-12-31T00:00:00Z" />,
    )
    const tree = JSON.stringify(toJSON())
    const idxAvailability = tree.indexOf('coupon-body-availability')
    const idxUsage        = tree.indexOf('coupon-body-usage-rule')
    const idxDescription  = tree.indexOf('coupon-body-description')
    const idxTerms        = tree.indexOf('coupon-body-terms')
    const idxFairUse      = tree.indexOf('coupon-body-fair-use')
    const idxOfferEnds    = tree.indexOf('coupon-body-offer-ends')

    expect(idxAvailability).toBeGreaterThan(-1)
    expect(idxUsage).toBeGreaterThan(idxAvailability)
    expect(idxDescription).toBeGreaterThan(idxUsage)
    expect(idxTerms).toBeGreaterThan(idxDescription)
    expect(idxFairUse).toBeGreaterThan(idxTerms)
    expect(idxOfferEnds).toBeGreaterThan(idxFairUse)
  })

  it('does NOT render TL-only sections for non-TL voucher types (D6(C) scope fence)', () => {
    const { queryByTestId } = render(
      <CouponBodyCard {...TL_PROPS_BASE} type="BOGO" />,
    )
    expect(queryByTestId('coupon-body-availability')).toBeNull()
    expect(queryByTestId('coupon-body-usage-rule')).toBeNull()
    expect(queryByTestId('coupon-body-offer-ends')).toBeNull()
    // Description is NOT moved for non-TL — stays in hero in M4d.
    expect(queryByTestId('coupon-body-description')).toBeNull()
  })
})

describe('CouponTopCard — banner image height (spec D5)', () => {
  it('renders banner image at 240pt when imageUrl is present', () => {
    const { getByTestId } = render(
      <CouponTopCard
        type="TIME_LIMITED"
        imageUrl="https://example.com/banner.jpg"
        expiryDate={null}
        isMultiBranch={false}
        terms={null}
      />,
    )
    const img = getByTestId('coupon-top-banner-image')
    expect(img.props.style.height).toBe(240)
  })

  it('falls back to 6pt accent line when imageUrl is null (no fake banner)', () => {
    const { queryByTestId, getByTestId } = render(
      <CouponTopCard
        type="TIME_LIMITED"
        imageUrl={null}
        expiryDate={null}
        isMultiBranch={false}
        terms={null}
      />,
    )
    expect(queryByTestId('coupon-top-banner-image')).toBeNull()
    const accent = getByTestId('coupon-top-accent-line')
    expect(accent.props.style.height).toBe(6)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/coupon-body-tl-sections.test.tsx --forceExit`

Expected: FAIL — test IDs not present on existing components.

- [ ] **Step 3: Update `CouponBody.tsx`**

Add to `CouponBodyCard` props:

```typescript
type CouponBodyCardProps = {
  type: VoucherType
  terms: string | null
  // M4d additive: shown only for TIME_LIMITED.
  description?: string | null
  scheduleString?: string | null
  expiryDate?: string | null
}
```

Inside the render, BEFORE the existing Terms section, add the TL-only sections (gated on `type === 'TIME_LIMITED'`):

```jsx
{type === 'TIME_LIMITED' ? (
  <>
    {scheduleString ? (
      <View testID="coupon-body-availability" accessibilityLabel={`Available during ${scheduleString}`} style={styles.tlSection}>
        <Text variant="label.eyebrow" style={styles.tlSectionLabel}>AVAILABILITY</Text>
        <Text variant="body.md" style={styles.tlSectionBody}>{scheduleString}</Text>
      </View>
    ) : null}

    <View testID="coupon-body-usage-rule" accessibilityLabel="Redeem once per active window" style={styles.tlSection}>
      <Text variant="label.eyebrow" style={styles.tlSectionLabel}>USAGE RULE</Text>
      <Text variant="body.md" style={styles.tlSectionBody}>Redeem once per active window.</Text>
    </View>

    {description ? (
      <View testID="coupon-body-description" style={styles.tlSection}>
        <Text variant="label.eyebrow" style={styles.tlSectionLabel}>ABOUT THIS OFFER</Text>
        <Text variant="body.md" style={styles.tlSectionBody}>{description}</Text>
      </View>
    ) : null}
  </>
) : null}
```

After the existing Fair Use section, add Offer ends (gated on TL + expiry):

```jsx
{type === 'TIME_LIMITED' && expiryDate ? (
  <View testID="coupon-body-offer-ends" style={styles.tlSection}>
    <Text variant="label.eyebrow" style={styles.tlSectionLabel}>OFFER ENDS</Text>
    <Text variant="body.md" style={styles.tlSectionBody}>{formatExpiryDate(expiryDate)}</Text>
  </View>
) : null}
```

Add `formatExpiryDate` helper at the top of the file (or import from countdownFormat if appropriate — for now keep local):

```typescript
function formatExpiryDate(iso: string): string {
  // Use the existing Hermes-robust pattern — formatToParts numeric + hardcoded
  // month-name array. Mirror RedemptionDetailsCard.formatExpiryLine style.
  const date = new Date(iso)
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'] as const
  const FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    year: 'numeric', month: 'numeric', day: 'numeric',
  })
  const parts = FORMATTER.formatToParts(date)
  const get = (t: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find(x => x.type === t)
    if (!p) throw new Error(`formatExpiryDate: missing ${t}`)
    return parseInt(p.value, 10)
  }
  const year = get('year')
  const month = get('month')
  const day = get('day')
  return `${day} ${MONTHS[month - 1]} ${year}`
}
```

Existing Terms + Fair Use sections need `testID="coupon-body-terms"` and `testID="coupon-body-fair-use"` added to their root elements for the DOM-order pin to work. Locate them in the current `CouponBodyCard` body and add the testIDs.

Also locate `<CouponTopCard>` in the same file and:
- Bump the banner image height from 180 to 240.
- Add `testID="coupon-top-banner-image"` to the Image element.
- Add `testID="coupon-top-accent-line"` to the fallback accent line View.

Add styles:

```typescript
  tlSection: {
    marginTop: 16,
  },
  tlSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  tlSectionBody: {
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 21,
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/coupon-body-tl-sections.test.tsx --forceExit`

Expected: all green.

- [ ] **Step 5: Run broader voucher suite to confirm no existing test broke**

Run: `cd apps/customer-app && npx jest tests/features/voucher/ --forceExit`

Expected: all green except for the M4b stop-gap tests (`frosted-countdown.test.tsx`, `time-limited-banner.test.tsx`, `time-limited-details-card.test.tsx`) which still pass at this point because we haven't deleted the components yet.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/CouponBody.tsx apps/customer-app/tests/features/voucher/coupon-body-tl-sections.test.tsx
git commit -m "$(cat <<'EOF'
feat(voucher): CouponBody TL sections + banner image bump (M4d Task D.1)

Four new TIME_LIMITED-only sections in CouponBodyCard:
  Availability → Usage rule → Description → (existing Terms + Fair Use) → Offer ends

Non-TL voucher types are unchanged in M4d per D6(C) scope fence.
Description-in-coupon-body is TL-only; the universal move is the §AN1
follow-up for after M4d ships.

CouponTopCard banner image bumped 180 → 240pt when imageUrl is present
per D5 lock. No fake banner when absent — accent line fallback retained.

Hermes-robust formatExpiryDate using formatToParts numeric + hardcoded
English month array, mirroring RedemptionDetailsCard.formatExpiryLine.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — `<HowItWorks>` TL-specific +1 step

### Task E.1: Add CHECK_THE_WINDOW_STEP + branch on TL type

Per D9: insert "Check the Window" at position 1 (between "Review the Voucher" / "Subscribe to Unlock" and "Tell Staff First") for TIME_LIMITED users.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/constants/productCopy.ts`
- Modify: `apps/customer-app/src/features/voucher/components/HowItWorks.tsx`
- Modify: `apps/customer-app/tests/features/voucher/how-it-works.test.tsx` (create if missing)

- [ ] **Step 1: Confirm how-it-works.test.tsx exists OR create it**

Run: `ls apps/customer-app/tests/features/voucher/how-it-works.test.tsx 2>&1 | head -1`

If it doesn't exist, create with:

```typescript
// apps/customer-app/tests/features/voucher/how-it-works.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { HowItWorks } from '@/features/voucher/components/HowItWorks'

describe('HowItWorks', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<HowItWorks isSubscribed={true} voucherType="BOGO" />)
    expect(getByTestId('how-it-works')).toBeTruthy()
  })
})
```

Note the new `voucherType` prop — added in this task.

- [ ] **Step 2: Write the failing tests**

```typescript
describe('HowItWorks — step count by subscription + voucher type', () => {
  it('subscribed + non-TL: 5 steps', () => {
    const { getByTestId } = render(<HowItWorks isSubscribed={true} voucherType="BOGO" />)
    // Expand so the steps render (subscribed defaults to collapsed).
    fireEvent.press(getByTestId('how-it-works-toggle'))
    const steps = getByTestId('how-it-works-steps')
    expect(steps.children).toHaveLength(5)
  })

  it('subscribed + TIME_LIMITED: 6 steps with "Check the Window" at index 1', () => {
    const { getByTestId, getByText } = render(<HowItWorks isSubscribed={true} voucherType="TIME_LIMITED" />)
    fireEvent.press(getByTestId('how-it-works-toggle'))
    expect(getByTestId('how-it-works-steps').children).toHaveLength(6)
    expect(getByText('Check the Window')).toBeTruthy()
  })

  it('free + non-TL: 5 steps', () => {
    const { getByTestId } = render(<HowItWorks isSubscribed={false} voucherType="BOGO" />)
    // Free defaults to expanded.
    expect(getByTestId('how-it-works-steps').children).toHaveLength(5)
  })

  it('free + TIME_LIMITED: 6 steps with subscribe → check window → standard 4', () => {
    const { getByTestId, getByText } = render(<HowItWorks isSubscribed={false} voucherType="TIME_LIMITED" />)
    expect(getByTestId('how-it-works-steps').children).toHaveLength(6)
    expect(getByText('Subscribe to Unlock')).toBeTruthy()
    expect(getByText('Check the Window')).toBeTruthy()
  })
})
```

(Import `fireEvent` from `@testing-library/react-native` at the top.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/how-it-works.test.tsx --forceExit`

Expected: FAIL — `voucherType` prop unknown, or step count = 5 when expecting 6.

- [ ] **Step 4: Add the step constant to `productCopy.ts`**

Add to `productCopy.ts` near the existing step constants (after `STEPS_2_TO_5`):

```typescript
/**
 * TIME_LIMITED-specific step inserted at position 1 (after Subscribe /
 * Review the Voucher, before Tell Staff First) per spec D9 lock.
 */
export const CHECK_THE_WINDOW_STEP = {
  label: 'Check the Window',
  desc: 'Make sure the current window is open before ordering. Time-limited offers can only be redeemed during the days and hours shown above.',
} as const

/** Returns the appropriate step list for voucher type + subscription state. */
export function howItWorksSteps(
  isSubscribed: boolean,
  voucherType: VoucherType,
): ReadonlyArray<{ label: string; desc: string }> {
  const baseFirst = isSubscribed
    ? { label: 'Review the Voucher', desc: 'Check the offer, terms, fair-use policy, and selected branch before ordering.' }
    : { label: 'Subscribe to Unlock', desc: 'Choose a monthly or annual plan to unlock this voucher and all other eligible vouchers across Redeemo.' }

  if (voucherType === 'TIME_LIMITED') {
    return [baseFirst, CHECK_THE_WINDOW_STEP, ...STEPS_2_TO_5]
  }
  return [baseFirst, ...STEPS_2_TO_5]
}
```

`VoucherType` should already be imported at the top of `productCopy.ts` since `voucherTypeExplainer` uses it.

- [ ] **Step 5: Update `HowItWorks.tsx` to accept `voucherType` + use the helper**

Add `voucherType` to props:

```typescript
type Props = {
  isSubscribed: boolean
  voucherType: VoucherType
  onExpand?: (layoutY: number) => void
}
```

Replace the existing `const steps = ...` line with:

```typescript
const steps = howItWorksSteps(isSubscribed, voucherType)
```

Update the import to include `howItWorksSteps` (and remove `HOW_IT_WORKS_STEPS_FREE` / `HOW_IT_WORKS_STEPS_SUBSCRIBED` if no other file imports them — they can stay if other consumers exist; check with grep):

```bash
grep -r "HOW_IT_WORKS_STEPS_FREE\|HOW_IT_WORKS_STEPS_SUBSCRIBED" apps/customer-app/src apps/customer-app/tests | grep -v productCopy.ts
```

If only `HowItWorks.tsx` imports them, you can replace the import. If anything else does, leave them in `productCopy.ts` for backwards compat.

Also import `VoucherType` from the appropriate location (most likely `@/lib/api/voucher` — match what `productCopy.ts` uses).

- [ ] **Step 6: Update VoucherDetailScreen.tsx to pass voucherType down**

`VoucherDetailScreen.tsx` already has `voucher.type` in scope where `<HowItWorks>` is mounted. Add `voucherType={voucher.type}` to the existing `<HowItWorks isSubscribed={...} />` JSX. Without this update, the screen will crash because the prop is now required. (Phase G also re-touches this file; the prop addition can be repeated/consolidated there.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/how-it-works.test.tsx --forceExit`

Expected: all green.

- [ ] **Step 8: Run broader voucher suite to confirm no existing test broke**

Run: `cd apps/customer-app && npx jest tests/features/voucher/ --forceExit`

Expected: all green (any "missing voucherType prop" failures in screen tests should resolve once the screen is updated in Step 6).

- [ ] **Step 9: Commit**

```bash
git add apps/customer-app/src/features/voucher/constants/productCopy.ts apps/customer-app/src/features/voucher/components/HowItWorks.tsx apps/customer-app/tests/features/voucher/how-it-works.test.tsx apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx
git commit -m "$(cat <<'EOF'
feat(voucher): HowItWorks "Check the Window" step for TL users (M4d Task E.1)

TIME_LIMITED users see a 6-step list with "Check the Window" inserted
at position 1, between Subscribe/Review and Tell Staff First. Non-TL
users keep the existing 5-step list.

Spec D9 lock. Copy and position approved verbatim. The new helper
howItWorksSteps(isSubscribed, voucherType) is the new source of truth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase F — TIME_LIMITED explainer copy rewrite

### Task F.1: Replace TIME_LIMITED explainer body in productCopy.ts

Per D8: tighter 3-sentence copy, 37 words, practical / trust-first / not salesy.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/constants/productCopy.ts`
- Modify: `apps/customer-app/tests/features/voucher/product-copy.test.ts` (likely exists; if not, create)

- [ ] **Step 1: Confirm product-copy.test.ts exists OR create it**

Run: `ls apps/customer-app/tests/features/voucher/product-copy.test.ts 2>&1 | head -1`

- [ ] **Step 2: Write the failing test**

```typescript
import { voucherTypeExplainer } from '@/features/voucher/constants/productCopy'

describe('voucherTypeExplainer — M4d TIME_LIMITED rewrite (D8)', () => {
  it('returns the locked 3-sentence body', () => {
    expect(voucherTypeExplainer('TIME_LIMITED')).toBe(
      'Time-limited vouchers can only be redeemed during specific days or hours set by the merchant. The current or next available window is shown above. Each window counts separately, so you can redeem once per window.',
    )
  })

  it('does NOT contain em dashes (project-wide rule)', () => {
    const body = voucherTypeExplainer('TIME_LIMITED')
    expect(body).not.toMatch(/—|–/)
  })

  it('does NOT contain editorialising / salesy phrases', () => {
    const body = voucherTypeExplainer('TIME_LIMITED')
    expect(body.toLowerCase()).not.toMatch(/often during|quieter periods|hurry|last chance|limited time/i)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/customer-app && npx jest tests/features/voucher/product-copy.test.ts -t "TIME_LIMITED rewrite" --forceExit`

Expected: FAIL — existing copy is the old 2-sentence body.

- [ ] **Step 4: Update the explainer body**

In `productCopy.ts`, replace the TIME_LIMITED case body in `voucherTypeExplainer`:

```typescript
    case 'TIME_LIMITED':
      return 'Time-limited vouchers can only be redeemed during specific days or hours set by the merchant. The current or next available window is shown above. Each window counts separately, so you can redeem once per window.'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/product-copy.test.ts --forceExit`

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/voucher/constants/productCopy.ts apps/customer-app/tests/features/voucher/product-copy.test.ts
git commit -m "$(cat <<'EOF'
feat(voucher): TIME_LIMITED explainer copy rewrite (M4d Task F.1)

3-sentence body, 37 words, practical and trust-first per spec D8 lock.
Tighter than the M4b draft — removed the editorialising clause "often
during quieter periods like weekday lunches or early evenings" which
slipped toward content marketing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase G — `VoucherDetailScreen` wire-up + remove M4b mount sites

### Task G.1: Wire `<HeroStatusBlock>` into `<CouponHeader>` for TL vouchers

**Files:**
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`

- [ ] **Step 1: Locate the `<CouponHeader>` usage**

Run: `grep -n "<CouponHeader" apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`

- [ ] **Step 2: Add the `<HeroStatusBlock>` import + statusBlock prop**

Add to the imports near the top of the file:

```typescript
import { HeroStatusBlock } from '../components/HeroStatusBlock'
```

Derive the status block element. Place this inline ABOVE the `<CouponHeader>` JSX, alongside the existing memo derivations. The hook's M4d output (currentWindow, nextWindow, msToClose, msToOpen) is already in scope from the existing `useTimeLimited(voucher)` call:

```typescript
  const heroStatusBlock = (voucher.type === 'TIME_LIMITED' && !isRedeemed && timeLimited.windowState !== 'no-windows') ? (
    <HeroStatusBlock
      windowState={timeLimited.windowState as any /* WindowState is a subset of HeroStatusBlockState */}
      now={new Date()}
      currentWindowStartsAt={timeLimited.currentWindow?.startsAt ?? null}
      currentWindowEndsAt={timeLimited.currentWindow?.endsAt ?? null}
      nextWindowStartsAt={timeLimited.nextWindow?.startsAt ?? null}
      scheduleString={formatScheduleString(voucher.availabilityWindows)}
      msToClose={timeLimited.msToClose}
      msToOpen={timeLimited.msToOpen}
    />
  ) : voucher.type === 'TIME_LIMITED' && isRedeemed ? (
    <HeroStatusBlock
      windowState="redeemed-this-window"
      now={new Date()}
      currentWindowStartsAt={null}
      currentWindowEndsAt={null}
      nextWindowStartsAt={timeLimited.nextWindow?.startsAt ?? null}
      scheduleString={formatScheduleString(voucher.availabilityWindows)}
      msToClose={null}
      msToOpen={timeLimited.msToOpen}
    />
  ) : null
```

If `HeroStatusBlockState` types collide with `WindowState`, narrow appropriately. Both unions include `'active' | 'urgent' | 'unavailable-today' | 'unavailable-future-day' | 'no-windows'`; the only difference is `HeroStatusBlockState` adds `'redeemed-this-window'` and includes `'expired'`. A `windowState as HeroStatusBlockState` cast is safe.

Pass to `<CouponHeader>`:

```jsx
<CouponHeader
  type={voucher.type}
  title={voucher.title}
  description={voucher.description}
  estimatedSaving={voucher.estimatedSaving}
  insetTop={insets.top}
  onBack={handleBack}
  onShare={handleShare}
  onFav={handleFav}
  isFavourited={voucher.isFavourited}
  scrollY={scrollY}
  fadeStart={HERO_FADE_START}
  fadeEnd={HERO_FADE_END}
  collapsedActive={collapsedActive}
  dimmed={showRedeemedSeal}
  statusBlock={heroStatusBlock}  // NEW M4d
/>
```

- [ ] **Step 3: Wire `description` + `scheduleString` + `expiryDate` into `<CouponBodyCard>` for TL**

Locate the existing `<CouponBodyCard>` usage (currently `<CouponBodyCard type={voucher.type} terms={voucher.terms} />`) and update:

```jsx
<CouponBodyCard
  type={voucher.type}
  terms={voucher.terms}
  description={voucher.description}
  scheduleString={formatScheduleString(voucher.availabilityWindows)}
  expiryDate={voucher.expiryDate}
/>
```

- [ ] **Step 4: Confirm the screen still type-checks**

Run: `cd apps/customer-app && npx tsc --noEmit 2>&1 | grep -v "^$" | head -20`

Expected: zero new errors.

- [ ] **Step 5: Commit (intermediate — mount sites still present, deletion in G.2)**

```bash
git add apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx
git commit -m "$(cat <<'EOF'
feat(voucher): wire HeroStatusBlock into CouponHeader for TL (M4d Task G.1)

Voucher Detail screen now mounts HeroStatusBlock inside CouponHeader for
TIME_LIMITED vouchers. CouponBodyCard receives description + schedule +
expiry for the new TL sections (Phase D).

The M4b stop-gap components (FrostedCountdown, TimeLimitedBanner,
TimeLimitedDetailsCard) are still mounted in parallel at this commit;
G.2 removes them alongside the corresponding test/file deletions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task G.2: Remove M4b stop-gap component mount sites + imports + styles

Per D7: deletions land in the SAME commits that introduce the replacements (no stranded "delete first" commit).

**Visual duplication check (locked, owner direction 2026-05-11).** Between Task G.1 (wires HeroStatusBlock in alongside the old components) and Task G.2 (removes the old mount sites), the TIME_LIMITED Voucher Detail screen WILL render BOTH the new HeroStatusBlock AND the old FrostedCountdown / TimeLimitedBanner / TimeLimitedDetailsCard simultaneously — that's a transient duplicated state we INTENTIONALLY pass through so each phase is independently green-CI.

After G.2 completes, the screen MUST render the new HeroStatusBlock exactly once AND none of the three old components for any TL state. G.2 Step 1 adds a screen-level test pin (`HeroStatusBlock mounted inside hero; M4b components absent`) that fails if any of the three old testIDs remain in the rendered tree. G.2 Step 7 (full voucher suite run) is the regression gate; failures there indicate duplication leaked through.

In addition, before committing G.2:

- Run a grep across the screen source: `grep -nE "FrostedCountdown|TimeLimitedBanner|TimeLimitedDetailsCard" apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` — expected zero matches in JSX or imports.
- The "M4b components absent" test runs across at least three TL state fixtures (active, urgent, unavailable-today) — a single-state pin would let a deletion-miss-on-one-branch slip through.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`
- Modify: `apps/customer-app/tests/features/voucher/voucher-detail-states.test.tsx`

- [ ] **Step 1: Write the failing assertions in the screen-level mount-order test (one assertion per TL state)**

Per the visual duplication check above: a single-state pin would let a deletion-miss-on-one-branch slip through. Add THREE pins covering active / urgent / unavailable-today fixtures. Locate `voucher-detail-states.test.tsx` and add:

```typescript
const M4B_TESTIDS = [
  'vd-frosted-countdown',            // FrostedCountdown root testID
  'vd-time-limited-banner',          // TimeLimitedBanner root testID (verify actual)
  'vd-time-limited-details-card',    // TimeLimitedDetailsCard root testID (verify actual)
] as const

it('TL active state: HeroStatusBlock mounted; FrostedCountdown / TimeLimitedBanner / TimeLimitedDetailsCard absent', () => {
  // ... existing render call with TL active voucher
  const { getByTestId, queryByTestId } = render(<VoucherDetailScreen ... />)

  expect(getByTestId('hero-status-block')).toBeTruthy()
  M4B_TESTIDS.forEach((id) => {
    expect(queryByTestId(id)).toBeNull()
  })
})

it('TL urgent state: HeroStatusBlock mounted; M4b components absent', () => {
  // ... TL urgent voucher fixture (currentWindow with <=60min remaining)
  const { getByTestId, queryByTestId } = render(<VoucherDetailScreen ... />)
  expect(getByTestId('hero-status-block')).toBeTruthy()
  M4B_TESTIDS.forEach((id) => {
    expect(queryByTestId(id)).toBeNull()
  })
})

it('TL unavailable-today state: HeroStatusBlock mounted; M4b components absent', () => {
  // ... TL unavailable-today voucher fixture (currentWindow null, nextWindow later today)
  const { getByTestId, queryByTestId } = render(<VoucherDetailScreen ... />)
  expect(getByTestId('hero-status-block')).toBeTruthy()
  M4B_TESTIDS.forEach((id) => {
    expect(queryByTestId(id)).toBeNull()
  })
})
```

Before writing the tests, run the testID-confirmation grep so the constants above are accurate:

```bash
grep -n "testID=" apps/customer-app/src/features/voucher/components/FrostedCountdown.tsx apps/customer-app/src/features/voucher/components/TimeLimitedBanner.tsx apps/customer-app/src/features/voucher/components/TimeLimitedDetailsCard.tsx
```

Use the actual testID strings; if any of them differ from the `M4B_TESTIDS` array above, correct the array.

Also UPDATE the existing "renders FrostedCountdown BEFORE TimeLimitedBanner" regression pin to DELETE it (the visual-order pin is obsolete once both components are gone).

- [ ] **Step 2: Run the screen tests to verify the new assertion fails + old assertion still passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/voucher-detail-states.test.tsx --forceExit`

Expected: the new "HeroStatusBlock mounted" assertion FAILS (because the screen still renders both old and new), and the deletion of the FrostedCountdown-before-TimeLimitedBanner pin is pending.

Wait — actually `HeroStatusBlock` is already mounted (we did G.1). The new assertion should PASS, but the `queryByTestId('vd-frosted-countdown')` should still find the old element since we haven't deleted yet. So the NEW test will FAIL on the `queryByTestId(...).toBeNull()` parts — confirming TDD red.

- [ ] **Step 3: Delete the three mount sites + their wrappers in `VoucherDetailScreen.tsx`**

Locate lines ~1462 (`<TimeLimitedDetailsCard>` redeemed-state mount), ~1524-1548 (`<FrostedCountdown>` + `<TimeLimitedBanner>` post-coupon block), and ~1586 (`<TimeLimitedDetailsCard>` non-redeemed-state mount).

DELETE each entirely — including their wrapping `<View style={styles.xxx}>` parents AND the surrounding conditional logic when it now does nothing.

For the redeemed-state in-stack mount (~1459-1477), the current code is:

```jsx
{isRedeemedState ? (
  <View style={styles.redeemedCycleInStack}>
    {voucher.type === 'TIME_LIMITED' ? (
      <TimeLimitedDetailsCard ... />
    ) : (
      <CycleRulesCard ... />
    )}
  </View>
) : null}
```

Change to:

```jsx
{isRedeemedState && voucher.type !== 'TIME_LIMITED' ? (
  <View style={styles.redeemedCycleInStack}>
    <CycleRulesCard ... />
  </View>
) : null}
```

(For TL redeemed, the seal + HeroStatusBlock carry the message; no extra in-stack card.)

For the non-redeemed-state mount (~1583-1601):

```jsx
{!isRedeemedState ? (
  voucher.type === 'TIME_LIMITED' && timeLimited.windowState !== 'no-windows' ? (
    <View style={styles.tlDetailsCardWrap}>
      <TimeLimitedDetailsCard ... />
    </View>
  ) : (
    <CycleRulesCard ... />
  )
) : null}
```

Change to (TL branch removed entirely; CycleRulesCard handles non-TL only):

```jsx
{!isRedeemedState && voucher.type !== 'TIME_LIMITED' ? (
  <CycleRulesCard
    isMultiBranch={isMultiBranch}
    availableAgainAt={voucher.availableAgainAt}
    isRedeemed={false}
  />
) : null}
```

For the FrostedCountdown + TimeLimitedBanner block (~1524-1548), DELETE both conditional blocks entirely.

- [ ] **Step 4: Remove unused imports**

Delete from the imports at the top of `VoucherDetailScreen.tsx`:

```typescript
import { TimeLimitedBanner } from '../components/TimeLimitedBanner'
import { TimeLimitedDetailsCard } from '../components/TimeLimitedDetailsCard'
import { FrostedCountdown } from '../components/FrostedCountdown'
```

- [ ] **Step 5: Remove unused style entries**

Locate `styles.frostedCountdownWrap`, `styles.tlBanner`, `styles.tlDetailsCardWrap`, and `styles.redeemedCycleInStack` (if no other consumer remains for the last one). Remove unused ones.

Run: `cd apps/customer-app && npx tsc --noEmit 2>&1 | grep VoucherDetailScreen | head -10`

If TS warns about an unused style key, remove it. If `redeemedCycleInStack` is still in use by the non-TL CycleRulesCard mount, keep it.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/customer-app && npx jest tests/features/voucher/voucher-detail-states.test.tsx --forceExit`

Expected: all green. The 3 deletion-detection assertions pass.

- [ ] **Step 7: Run full voucher suite**

Run: `cd apps/customer-app && npx jest tests/features/voucher/ --forceExit`

Expected: all green EXCEPT the M4b stop-gap test files (`frosted-countdown.test.tsx`, `time-limited-banner.test.tsx`, `time-limited-details-card.test.tsx`) which will fail import errors. That's expected — Phase H deletes them. Don't fix here; proceed to Phase H.

- [ ] **Step 8: Commit (still without deleting the .tsx files)**

```bash
git add apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx apps/customer-app/tests/features/voucher/voucher-detail-states.test.tsx
git commit -m "$(cat <<'EOF'
refactor(voucher): remove M4b stop-gap mount sites from VoucherDetailScreen (M4d Task G.2)

Removes FrostedCountdown, TimeLimitedBanner, TimeLimitedDetailsCard
mount sites + their wrapping styles + imports. Their roles are now
carried by HeroStatusBlock (hero-mounted) + CouponBodyCard TL sections.

For TL redeemed-this-window state, the seal + HeroStatusBlock carry
the message — no in-stack TimeLimitedDetailsCard. For TL non-redeemed,
no CycleRulesCard (Renews on copy doesn't apply to TL per §AH).

voucher-detail-states.test.tsx assertions updated to pin
HeroStatusBlock mounted + the three M4b components absent.

Component .tsx files + their tests are deleted in Phase H.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase H — Delete the three M4b component files + their tests

### Task H.1: Delete FrostedCountdown.tsx + test

**Files:**
- Delete: `apps/customer-app/src/features/voucher/components/FrostedCountdown.tsx`
- Delete: `apps/customer-app/tests/features/voucher/frosted-countdown.test.tsx`

- [ ] **Step 1: Pre-deletion grep — confirm no imports / no testID references / no other consumers anywhere**

Run all three greps; each must return ZERO matches before proceeding:

```bash
# (a) Imports of the component
grep -rn "from .*FrostedCountdown\|import.*FrostedCountdown" apps/customer-app/src apps/customer-app/tests | grep -v "FrostedCountdown.tsx" | grep -v "frosted-countdown.test.tsx"

# (b) testID references (catches forgotten test fixtures or screen-level assertions)
grep -rn "vd-frosted-countdown\|FrostedCountdown" apps/customer-app/src apps/customer-app/tests --include="*.ts" --include="*.tsx" | grep -v "FrostedCountdown.tsx" | grep -v "frosted-countdown.test.tsx"

# (c) Snapshot / mock references
grep -rn "FrostedCountdown" apps/customer-app/__mocks__ apps/customer-app/__snapshots__ 2>/dev/null || true
```

Expected: zero matches across all three (G.2 already removed the screen import + its testID-absent pin DOES NOT count as a consumer because it queries the testID via a string constant, but no live mount remains).

If any non-zero match appears, STOP. Resolve the dangling reference before deleting the source file — otherwise the deletion will cascade-fail downstream tests.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/customer-app/src/features/voucher/components/FrostedCountdown.tsx apps/customer-app/tests/features/voucher/frosted-countdown.test.tsx
```

- [ ] **Step 3: Verify TS still clean**

Run: `cd apps/customer-app && npx tsc --noEmit 2>&1 | grep -E "FrostedCountdown|frosted-countdown" | head -5`

Expected: zero matches.

- [ ] **Step 4: Verify voucher test suite still green**

Run: `cd apps/customer-app && npx jest tests/features/voucher/ --forceExit`

Expected: all green. The G.2 screen-level pin `queryByTestId('vd-frosted-countdown')` continues to pass (querying a now-absent testID returns null — that's the contract).

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(voucher): delete FrostedCountdown.tsx + test (M4d Task H.1)

M4b stop-gap absorbed into HeroStatusBlock per spec D7 lock.
Pre-deletion grep verified zero imports, testID references, or
mocks/snapshots reference the deleted file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task H.2: Delete TimeLimitedBanner.tsx + test

**Files:**
- Delete: `apps/customer-app/src/features/voucher/components/TimeLimitedBanner.tsx`
- Delete: `apps/customer-app/tests/features/voucher/time-limited-banner.test.tsx`

- [ ] **Step 1: Pre-deletion grep — confirm no imports / no testID references / no other consumers anywhere**

Run all three greps; each must return ZERO matches:

```bash
# (a) Imports
grep -rn "from .*TimeLimitedBanner\|import.*TimeLimitedBanner" apps/customer-app/src apps/customer-app/tests | grep -v "TimeLimitedBanner.tsx" | grep -v "time-limited-banner.test.tsx"

# (b) testID references + symbol references
grep -rn "vd-time-limited-banner\|TimeLimitedBanner" apps/customer-app/src apps/customer-app/tests --include="*.ts" --include="*.tsx" | grep -v "TimeLimitedBanner.tsx" | grep -v "time-limited-banner.test.tsx"

# (c) Mocks / snapshots
grep -rn "TimeLimitedBanner" apps/customer-app/__mocks__ apps/customer-app/__snapshots__ 2>/dev/null || true
```

Expected: zero matches.

If any non-zero match appears, STOP and resolve the dangling reference first.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/customer-app/src/features/voucher/components/TimeLimitedBanner.tsx apps/customer-app/tests/features/voucher/time-limited-banner.test.tsx
```

- [ ] **Step 3: Verify TS still clean**

Run: `cd apps/customer-app && npx tsc --noEmit 2>&1 | grep -E "TimeLimitedBanner|time-limited-banner" | head -5`

Expected: zero matches.

- [ ] **Step 4: Verify voucher test suite still green**

Run: `cd apps/customer-app && npx jest tests/features/voucher/ --forceExit`

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(voucher): delete TimeLimitedBanner.tsx + test (M4d Task H.2)

M4b stop-gap absorbed into HeroStatusBlock per spec D7 lock.
Pre-deletion grep verified zero imports, testID references, or
mocks/snapshots reference the deleted file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task H.3: Delete TimeLimitedDetailsCard.tsx + test

**Files:**
- Delete: `apps/customer-app/src/features/voucher/components/TimeLimitedDetailsCard.tsx`
- Delete: `apps/customer-app/tests/features/voucher/time-limited-details-card.test.tsx`

- [ ] **Step 1: Pre-deletion grep — confirm no imports / no testID references / no other consumers anywhere**

Run all three greps; each must return ZERO matches:

```bash
# (a) Imports
grep -rn "from .*TimeLimitedDetailsCard\|import.*TimeLimitedDetailsCard" apps/customer-app/src apps/customer-app/tests | grep -v "TimeLimitedDetailsCard.tsx" | grep -v "time-limited-details-card.test.tsx"

# (b) testID references + symbol references
grep -rn "vd-time-limited-details-card\|TimeLimitedDetailsCard" apps/customer-app/src apps/customer-app/tests --include="*.ts" --include="*.tsx" | grep -v "TimeLimitedDetailsCard.tsx" | grep -v "time-limited-details-card.test.tsx"

# (c) Mocks / snapshots
grep -rn "TimeLimitedDetailsCard" apps/customer-app/__mocks__ apps/customer-app/__snapshots__ 2>/dev/null || true
```

Expected: zero matches.

If any non-zero match appears, STOP and resolve the dangling reference first.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/customer-app/src/features/voucher/components/TimeLimitedDetailsCard.tsx apps/customer-app/tests/features/voucher/time-limited-details-card.test.tsx
```

- [ ] **Step 3: Verify TS still clean**

Run: `cd apps/customer-app && npx tsc --noEmit 2>&1 | grep -E "TimeLimitedDetailsCard|time-limited-details-card" | head -5`

Expected: zero matches.

- [ ] **Step 4: Verify voucher test suite still green**

Run: `cd apps/customer-app && npx jest tests/features/voucher/ --forceExit`

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(voucher): delete TimeLimitedDetailsCard.tsx + test (M4d Task H.3)

M4b stop-gap absorbed into CouponBodyCard TL sections per spec D7 lock.
Pre-deletion grep verified zero imports, testID references, or
mocks/snapshots reference the deleted file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase I — Full sweep + on-device QA hold

### Task I.1: Full customer-app test sweep + TypeScript check + on-device QA hold

**Files:** none modified.

- [ ] **Step 1: Run the entire customer-app test suite**

Run: `cd apps/customer-app && npx jest --forceExit`

Expected: all green except the single pre-existing baseline failure on `tests/lib/api/profile.test.ts` documented in CLAUDE.md (not M4d-introduced).

- [ ] **Step 2: TypeScript clean**

Run: `cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -20`

Expected: zero new errors. (One pre-existing unrelated `branchName: string | null` in VoucherDetailScreen.tsx may remain — documented in CLAUDE.md M3 PR #49 section.)

- [ ] **Step 3: ESLint clean (if part of the project's CI gate)**

Run: `cd apps/customer-app && npx eslint src/features/voucher/ tests/features/voucher/`

Expected: zero new errors.

- [ ] **Step 4: Visualise the new commits**

Run: `git log --oneline main..HEAD`

Expected: ~13 commits, one per Phase 0 + A.1-A.4 + B.1-B.3 + C.1 + D.1 + E.1 + F.1 + G.1 + G.2 + H.1 + H.2 + H.3.

- [ ] **Step 5: HOLD for owner on-device QA — do NOT push, do NOT open PR**

Report to the owner with:
- Final test counts (full suite green ex. pre-existing baseline).
- `git log --oneline main..HEAD` output.
- Notes on any deviation from the plan + reasoning.
- The on-device QA checklist below, blank, for the owner to fill in.

Wait for explicit owner direction before pushing the branch and opening the PR. M4d is a Tier 2 surface rebaseline — owner runs on-device QA before merge per the Tier 2 standing rule.

**On-device QA checklist (owner-led):**

The implementer assembles a dev build (via existing customer-app dev workflow) and posts the locked credentials + branch name to the owner. Owner exercises the following scenarios on a real device. Each line gets a tick or a comment on what failed:

- [ ] **Active state hero** — open a TIME_LIMITED voucher with an active current window (≥60min remaining); confirm HeroStatusBlock shows "Available now" eyebrow + "Open until <H>am/pm" primary + schedule supporting + green progress bar emptying toward the close instant.
- [ ] **Urgent final-minute seconds** — observe a voucher in the final 60s of its window; confirm the primary line ticks "Closes in 47s" → "46s" → ... visibly each second AND VoiceOver reads "Closes in under a minute" exactly once (does NOT re-read every second).
- [ ] **Outside today copy** — TL voucher whose `currentWindow === null` and `nextWindow.startsAt` is later today; confirm eyebrow = "Opens today", primary = "Today at <H>am/pm", bar fills toward open.
- [ ] **Outside tomorrow copy** — TL voucher whose `nextWindow.startsAt` is on the next London day; confirm eyebrow = "Opens tomorrow", primary = "Tomorrow at <H>am/pm".
- [ ] **Outside future-day copy** — TL voucher whose `nextWindow.startsAt` is 2+ days out; confirm eyebrow = "Opens <Weekday>" (full weekday name, never abbreviated), primary = "<Weekday> at <H>am/pm".
- [ ] **Redeemed-this-window state** — redeem a TL voucher in-window; confirm seal mounts, RedemptionDetailsCard shows, HeroStatusBlock shows "Available again" + the next window time, NO progress bar, NO urgency colour.
- [ ] **Expired state** — TL voucher with `expiryDate` in the past; confirm HeroStatusBlock is hidden (existing expired seal carries the message); no broken layout.
- [ ] **Free-user TL state** — sign in as a free user (or revoke subscription via `prisma/revoke-dev-subscription.ts`); open a TL voucher; confirm HeroStatusBlock IS visible (info — not gated on subscription), CTA is "Subscribe to Redeem", HowItWorks shows 6 steps starting with "Subscribe to Unlock" → "Check the Window".
- [ ] **Banner present** — TL voucher with a non-null `imageUrl`; confirm CouponTopCard renders the 240pt banner; no broken aspect ratio.
- [ ] **Banner absent** — TL voucher with `imageUrl === null`; confirm 6pt accent-line fallback renders; NO placeholder image, NO empty white space the size of a banner.
- [ ] **Non-TIME_LIMITED voucher regression** — open a BOGO + a Discount + a Reusable voucher; confirm hero still shows description (NOT a HeroStatusBlock), CouponBody section structure is unchanged, HowItWorks shows 5 steps (no "Check the Window" inserted).
- [ ] **HowItWorks TL step** — TL subscribed user; expand HowItWorks; confirm "Check the Window" step at position 1 with its full body copy visible; tap the connector dots / step labels to verify nothing is mis-styled.
- [ ] **TIME_LIMITED explainer card** — expand VoucherTypeExplainerCard for a TL voucher; confirm body reads exactly: "Time-limited vouchers can only be redeemed during specific days or hours set by the merchant. The current or next available window is shown above. Each window counts separately, so you can redeem once per window." (no em dashes, no editorialising).
- [ ] **Reduced motion** — toggle Reduce Motion on device; reopen a TL voucher in urgent-final-minute; confirm progress bar stays static (no tween) BUT the visible seconds counter continues to tick down (informational; not suppressed).
- [ ] **Screen-capture protection (regression)** — redeem a TL voucher, view the RedemptionDetailsCard during the 2h presentation window, attempt a screenshot (iOS) / recording (both platforms); confirm the §AE6/§AE6.2 contracts still fire (iOS recording blur on, iOS post-fact banner appears, Android FLAG_SECURE blocks the screenshot).

- [ ] **Step 6 (after owner QA approves): Push + open the M4d PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(voucher): M4d TIME_LIMITED Voucher Detail redesign" --body "$(cat <<'EOF'
## Summary

- Hero countdown moved INSIDE CouponHeader (new <HeroStatusBlock>).
- M4b stop-gap components (<FrostedCountdown>, <TimeLimitedBanner>, <TimeLimitedDetailsCard>) deleted; their content absorbed into <HeroStatusBlock> + new <CouponBodyCard> TL sections.
- CouponBodyCard gains four TL-only sections: Availability → Usage rule → Description → Offer ends (existing Terms + Fair Use sections retained, repositioned).
- HowItWorks adds "Check the Window" step at position 1 for TIME_LIMITED users only.
- Explainer copy rewritten to Redeemo tone (D8 lock).
- useTimeLimited gains additive return fields (currentWindow, nextWindow, msToClose, msToOpen) + 1s tick gated on urgent-final-minute (D10).
- §AM1 fixture brittleness closed in Phase 0 via jest.setSystemTime suite-level fixture.

## Test plan

- [x] Phase 0 voucher-detail-states fixture deterministic across 3 consecutive runs.
- [x] HeroStatusBlock 11-state pin + progress bar mechanics + a11y live-region contract green.
- [x] CouponBodyCard TL section order pin green.
- [x] HowItWorks step count + position pin green.
- [x] Full customer-app jest sweep green (1 pre-existing baseline failure unchanged).
- [x] tsc --noEmit clean.
- [x] On-device QA — owner-led, see review thread.

Spec: `docs/superpowers/specs/2026-05-11-voucher-detail-m4d-redesign-design.md` (committed b6975f6).
Plan: `docs/superpowers/plans/2026-05-11-voucher-detail-m4d-redesign.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

Ran against the spec sections.

**Spec coverage check:**
- §1 Goal 1 (§AM1 hardening) → Phase 0, Task 0.1 ✓
- §1 Goal 2 (hero countdown) → Phase B (HeroStatusBlock) + Phase C (CouponHeader integration) + Phase G (screen wire-up) ✓
- §1 Goal 3 (contextual copy + seconds) → Phase A.1 (formatPrimaryWhen) + Phase A.2 (formatUrgentCountdown) + Phase B.1 (state rendering) ✓
- §1 Goal 4 (progress bar) → Phase B.2 ✓
- §1 Goal 5 (banner image) → Phase D.1 (CouponTopCard bump) ✓
- §1 Goal 6 (coupon body consolidation) → Phase D.1 (Availability + Usage rule + Description + Offer ends) ✓
- §1 Goal 7 (explainer rewrite) → Phase F.1 ✓
- §1 Goal 8 (HowItWorks +1 step) → Phase E.1 ✓
- §1 Goal 9 (preserve M3/M4 contracts) → §2 locked-contracts table inherited; existing screen-level §AE/§AE6/§AE6.2/§Q6 pins kept; deletions only target M4b stop-gaps, never M3 surfaces ✓

**Spec §2 locked contracts:** all 15 contracts left untouched by M4d. Phase G.2 removes only TimeLimitedDetailsCard, TimeLimitedBanner, FrostedCountdown — none of which are in the §2 list.

**Spec §5 target mount order:** Phase B (HeroStatusBlock in CouponHeader) + Phase D (CouponBody TL sections in correct order) + Phase G.2 (mount-site cleanup) realise the target ✓

**Spec §6 D1-D10:** each decision has its corresponding task (D1→Task 0.1, D2→Task B.1 + C.1, D3→Task A.1 + B.1, D4→Task B.2, D5→Task D.1, D6→Task C.1 + D.1 type-aware branches, D7→Phase H, D8→Task F.1, D9→Task E.1, D10→Task A.2 + A.4 + B.3) ✓

**Spec §8 hook additions:** Phase A.3 + A.4 ✓

**Spec §9 component plan:** matches plan's Files inventory ✓

**Spec §10 test plan:** every test surface called out in §10 has a corresponding test in the plan ✓ — with one explicit choice on the "reduced-motion progress bar static" pin: since the B.2 implementation uses plain `style.width` re-renders (no Reanimated / Animated tween), reduced-motion behaviour is implicit (the bar IS static — no animation library introduces a tween that could need suppression). If a future task introduces an animation library for the bar, a reduced-motion gate + explicit pin would be added at that time. The Phase B intro documents this explicitly.

**Placeholder scan:** scanned for "TBD", "TODO", "implement later", "Similar to Task N", "fill in details" — none present. All test code, implementation code, and commands are concrete.

**Type consistency:**
- `HeroStatusBlockProps`: `windowState` / `now` / `currentWindowStartsAt` / `currentWindowEndsAt` / `nextWindowStartsAt` / `scheduleString` / `msToClose` / `msToOpen` — consistent across B.1, B.2, B.3 + G.1 callsite.
- `HeroStatusBlockState` = `WindowState | 'redeemed-this-window'`.
- `useTimeLimited` return: `isTimeLimited / windowState / nextBoundaryAt / currentWindow / nextWindow / msToClose / msToOpen` — consistent across A.3, A.4, B.1, G.1.
- `howItWorksSteps(isSubscribed, voucherType)` — used in E.1 step 4 + step 5; consistent.
- `formatPrimaryWhen(boundary: Date, now: Date)` — used in A.1, B.1, B.3.
- `formatUrgentCountdown(msToClose: number)` — used in A.2, B.1.

**Plan-internal consistency check:** the B.3 live-region tests and the implementation both use `.props.accessibilityLabel` on a child-free View. The earlier draft's `.children` ambiguity was resolved in the 2026-05-11 amendment pass. Stable urgent-final-minute label is "Closes in under a minute" (owner-locked); the test STABLE-across-ticks pin uses that exact string. No remaining plan-internal inconsistencies.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-11-voucher-detail-m4d-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration. Best for the heaviest tasks (B.1, B.2, G.2, D.1) where keeping context tight matters.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batched with checkpoints for review at the end of each Phase.

Awaiting owner choice. Per spec §14 step 5, **do not begin implementation until the owner reviews and approves this plan.**
