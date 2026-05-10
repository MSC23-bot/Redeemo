# Voucher Detail M4 — TIME_LIMITED Vouchers (v1 Design Spec)

**Status:** Locked. Brainstorm complete 2026-05-10. Ready for `superpowers:writing-plans`.

**Tier:** Tier 2 (plan-first; UI/UX is fully specified by this doc + the existing voucher-detail spec §4b + merchant-profile spec §3.2; only schema-shape and behaviour locks were genuinely open at brainstorm time).

**Cross-refs:**
- Discovery report (in-session, 2026-05-10) — what was open at brainstorm start.
- `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md` §O1 (TIME_LIMITED audit), §AH (renewal vs expiry copy), §T (TIME_LIMITED + REUSABLE umbrella), §R4 (Phase 4 Merchant Portal), §AE5 (M3 presentation window), §Q1 / §Q5 (redeemed-state design + Profile → Redemption History), §G (Phase 6 comms).
- `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md` — existing voucher-detail spec; §4b carries the original Screens 1a/1b/1c framing that this spec supersedes/extends.
- `docs/superpowers/specs/2026-04-17-merchant-profile-design.md` §3.2 — original merchant-profile TIME_LIMITED card states (this spec adopts a calmer treatment per D6).
- M3 contracts: presentation-window helper, hero seal overlay, `useScreenCaptureProtection`, `useScreenshotGuard`, `RedemptionDetailsCard` — all preserved verbatim, composed against by this spec.
- `docs/operations/redis-namespaces.md` — Redis namespaces (no new namespaces in M4).
- §W production-resilience standing checklist — must be consulted at plan-write time.

**Scope:** Customer-app + backend only. No Merchant Portal UI in v1 (defer to Phase 4 §R4). No Discovery / Home / Map TIME_LIMITED treatment (defer to post-Plan-4 rebaseline).

---

## 1. Locked product model

**TIME_LIMITED v1 = "one redemption per active window occurrence."**

A merchant defines recurring weekly windows (e.g. Mon-Fri 11am-3pm). Each window-occurrence is one chance for a customer to redeem the voucher. After redeeming during one occurrence, the voucher becomes unavailable for that occurrence; when the next occurrence opens, the voucher becomes available again.

Example: Mon-Fri 11-3 lunch BOGO. Customer redeems Tuesday at 13:42. Voucher is "redeemed for Tuesday's window" until Wednesday 11:00. Wednesday 11:00 → voucher available again. Customer redeems Wednesday at 12:30. Voucher is "redeemed for Wednesday's window" until Thursday 11:00. Etc.

Across a 30-day month with 5 weekday windows per week, a single customer could redeem this voucher up to ~22 times. **This is the product value proposition** — not a bug, not a leak. The subscription gates participation.

This is materially different from the current voucher-detail spec §4b's implicit assumption ("once-per-cycle, only redeemable during windows"). The v1 product model rejects that framing because it produced no distinct value — TIME_LIMITED would have just been a constraint on a regular voucher. Model B gives TIME_LIMITED a genuine product purpose: drive repeat visits during merchant-controlled time slots.

### 1.1 Distinction from REUSABLE (M5, deferred)

| | TIME_LIMITED (M4 v1) | REUSABLE (M5, future) |
|---|---|---|
| Anchored to | Wall-clock windows (Mon 12-6pm) | Per-redemption cooldown (e.g. 24h since last) |
| Available state changes with | Time-of-day clock (window opens / closes) | Personal redemption clock (cooldown elapses) |
| Customer mental model | "every Tuesday lunch" | "once a day" |
| Merchant intent | Drive repeat visits during slow merchant-set hours | Drive ongoing engagement (loyalty) |
| Schema | `VoucherAvailabilityWindow` table | TBD M5 — likely `cooldownSeconds` + `maxRedemptionsPerWindow` |

These do not overlap. TIME_LIMITED is window-bounded; REUSABLE is cooldown-bounded. Different rules, different fraud profiles, different UX.

### 1.2 Forward-compatibility to configurable usage policy

v1 hardcodes "one redemption per window occurrence." Future Phase 4 + REUSABLE M5 may add:
- max X redemptions per window
- unlimited redemptions during window
- merchant-configurable cooldown

To accommodate this without churn, the schema is designed so that adding `maxRedemptionsPerWindow Int @default(1)` to `VoucherAvailabilityWindow` is a non-breaking additive migration. v1 hardcodes the rule at limit=1; future portal sets the column.

### 1.3 Anti-abuse note (Phase 4 dependency, captured)

Merchants may overuse TIME_LIMITED to reduce always-available customer value. Phase 4 Merchant Portal may need:
- Soft cap by ratio: max 50% of merchant's published vouchers can be TIME_LIMITED.
- Or hard floor: merchant must have at least one ACTIVE non-TIME_LIMITED voucher to publish a TIME_LIMITED one.
- Or admin guidance only with periodic review.

NOT in M4 v1 scope. Captured here for Phase 4. To be added to deferred-followups §T as a pointer.

---

## 2. Owner decisions D1-D8 (locked)

| # | Decision | Locked at |
|---|---|---|
| **D1** | Schema = recurring weekly windows only. `VoucherAvailabilityWindow` table mirrors `BranchOpeningHours`. NO `availableFrom` / one-shot column on `Voucher`. Forward-compat: `maxRedemptionsPerWindow` is an additive migration. | §3.1 + §3.2 |
| **D2** | TIME_LIMITED stays a distinct voucher type for v1. Availability windows attach only to TIME_LIMITED vouchers via merchant CRUD validation. The 8-type enum is unchanged. | §3.3 |
| **D3** | Wall-clock `"HH:mm"` strings, interpreted as Europe/London server-side. Mirrors `BranchOpeningHours`. UK-only. International expansion (Phase 6) gets a coordinated timezone migration. | §3.4 |
| **D4** | Expired-precedes-redeemed across ALL voucher types. If `voucher.expiryDate < now`, the expired surface wins regardless of redemption history. Eventual recovery path: Profile → Redemption History (§Q5). **Note: §Q5 is a deferred Tier 2 surface and is NOT a M4 v1 prerequisite — see §8.1 for the known-limitation framing.** | §5.1 (state precedence) |
| **D5** | Merchant CRUD API extension supports `availabilityWindows` on create/update. NO stopgap admin UI. NO Phase 4 portal in v1. | §3.6 |
| **D6** | Calmer-than-spec merchant-profile voucher cards: pill + pulse-dot only, no full-card glow. Sort order: active TIME_LIMITED → non-TIME_LIMITED active → outside-window TIME_LIMITED → redeemed-this-cycle → (expired hidden). | §6 |
| **D7** | NO Discovery / Home / Map TIME_LIMITED-specific treatment in v1. Type colour gradient + label only, via existing tokens. Discovery rebaseline (post-Plan-4) revisits. | §8 |
| **D8** | 3-PR sequence: M4a (backend + schema + API) → M4b (customer-app Voucher Detail + un-stub + §AH copy) → M4c (merchant-profile cards). | §10 |

---

## 3. Schema, backend behaviour, API contract

### 3.1 New schema

```prisma
model VoucherAvailabilityWindow {
  id        String  @id @default(uuid())
  voucherId String
  dayOfWeek Int     // 0=Sun, 1=Mon, ..., 6=Sat (matches BranchOpeningHours)
  openTime  String  // "HH:mm" wall-clock, Europe/London
  closeTime String  // "HH:mm" wall-clock, Europe/London

  voucher   Voucher @relation(fields: [voucherId], references: [id], onDelete: Cascade)

  @@index([voucherId])
}

model Voucher {
  // ... existing fields unchanged ...
  availabilityWindows VoucherAvailabilityWindow[]
}
```

No other schema changes. `Voucher.expiryDate` (existing universal field) is unchanged. `UserVoucherCycleState` is unchanged.

Migration: `20260510_add_voucher_availability_window` — additive only, zero impact on existing voucher data.

### 3.2 Schema validation rules (locked)

These rules are enforced at merchant CRUD layer (request validation), not at the database layer (Prisma has no native check-constraint syntax for this complexity):

1. **Each row = one active window occurrence.** Split-day windows (e.g. Monday 11-3 + Monday 6-10pm) are valid as TWO rows; the customer can redeem once in each occurrence. Same calendar day, different occurrences.
2. **Half-open time ranges:** `[openTime, closeTime)`. Exactly `11:00` is active; exactly `15:00` is no longer active. Avoids boundary ambiguity.
3. **No cross-midnight in a single row; use `"24:00"` for end-of-day close.** A late-night window like Friday 22:00 → Saturday 02:00 is split into two rows: `(dayOfWeek: 5, "22:00", "24:00")` AND `(dayOfWeek: 6, "00:00", "02:00")`. The literal string `"24:00"` is accepted ONLY as a `closeTime` value and means "end of this calendar day" (i.e. minute 1440). It is NEVER valid as an `openTime`. This eliminates the one-minute gap between `"23:59"` and the next day's `"00:00"` that the half-open-range semantic would otherwise create. Validation regex: `openTime` matches `/^([01]\d|2[0-3]):[0-5]\d$/` (00:00 through 23:59); `closeTime` matches `/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/` (00:01 through 23:59 OR the special 24:00 sentinel). The validation rule "closeTime > openTime" still holds when both are converted to minutes (`"24:00"` = 1440). Backend window-state math treats `"24:00"` as the next-day midnight boundary, which is the same instant as `"00:00"` of the following row — boundary continuous, no gap, no overlap.
4. **No overlapping windows for the same `(voucherId, dayOfWeek)`.** Monday 11:00-15:00 and Monday 14:00-18:00 must be rejected — overlap means a single timestamp could belong to two occurrences and accidentally allow extra redemptions. Split-day with non-overlapping windows is allowed (lunch 11-3 + dinner 6-10 is fine; 11-3 + 14-6 is invalid).
5. **Window ⊆ branch opening hours is NOT enforced in v1.** Merchant can configure a 2am window even if the branch is closed at 2am. Trust merchants for v1; Phase 4 portal will add validation when there's a UI to surface the warning.
6. **Wall-clock semantics for DST/BST.** "11am" means "whatever the local clock says." During spring-forward, "01:30" doesn't exist; during fall-back, "01:30" exists twice. Acceptable for UK-only v1; users rarely redeem at 1:30am.
7. **At least one window required to publish/activate** (R5 lock). A TIME_LIMITED voucher with zero `VoucherAvailabilityWindow` rows MUST NOT be set to `status: ACTIVE`. Draft state (zero windows) is allowed; transition to ACTIVE is rejected. Enforced at submit/publish time.

### 3.3 TIME_LIMITED is a distinct type (D2)

The existing 8-value `VoucherType` enum stays as-is. Availability windows attach only to TIME_LIMITED vouchers via merchant CRUD validation:

- POST `/api/v1/merchant/vouchers` with `type: TIME_LIMITED` and missing/empty `availabilityWindows` → reject submit/publish (rule 7) but allow draft.
- POST with `type !== 'TIME_LIMITED'` and any `availabilityWindows` provided → reject ("availabilityWindows requires type=TIME_LIMITED").
- PATCH that adds `availabilityWindows` to a non-TIME_LIMITED voucher → reject.
- PATCH that changes `type` from TIME_LIMITED to another type while windows exist → reject (require deleting windows first).

The schema does NOT enforce these via foreign-key or trigger constraints. CRUD-layer validation is the source of truth.

### 3.4 Timezone (D3)

`openTime` and `closeTime` are stored as `"HH:mm"` strings, interpreted as Europe/London wall-clock by both backend and customer-app code. Mirror the existing `BranchOpeningHours` pattern.

Backend: extend the existing `apps/customer-app/src/features/merchant/utils/londonNow.ts` Hermes-robust pattern to a server-side helper at `src/api/shared/londonClock.ts`. Export `getLondonClock(now: Date): { dayOfWeek: number; minutes: number }` with the same `formatToParts` numeric extraction (no `weekday: 'short'`, no `toLocaleTimeString`).

Customer-app: continue to use the existing `londonNow.ts` helper. Extend with helpers for window math (see §3.7).

### 3.5 Window-occurrence semantics

A "window-occurrence" is one specific anchored instance of a recurring window — e.g. "Monday 13 May 2026 11:00 → 15:00 Europe/London" is one occurrence; "Tuesday 14 May 2026 11:00 → 15:00 Europe/London" is the next occurrence of the same `VoucherAvailabilityWindow` row.

For redemption-guard purposes, the **current window-occurrence** at time `now` is computed as:

1. Compute `getLondonClock(now)` → `{ dayOfWeek, minutes }` where `minutes` is the wall-clock time-of-day in minutes since midnight Europe/London.
2. Find any `VoucherAvailabilityWindow` row for this voucher where:
   - `row.dayOfWeek === dayOfWeek`
   - `parseTime(row.openTime) <= minutes < parseTime(row.closeTime)`
3. If found → "window is currently open." Compute occurrence start/end as concrete `Date` instants in Europe/London for that day.
4. If not found → "currently outside any window." Compute the **next** occurrence by scanning forward through `VoucherAvailabilityWindow` rows in calendar order (today's later windows first, then tomorrow, etc., wrapping after 7 days).

Window-occurrence boundaries are derived deterministically from current time + window definitions. They are NOT stored per-voucher — derivable on demand.

### 3.6 Customer payload extensions

Two endpoints carry voucher data that the customer-app needs for TIME_LIMITED state rendering:

- **`GET /api/v1/customer/vouchers/:id`** — `getCustomerVoucher`, single-voucher detail, drives Voucher Detail (M4b).
- **`GET /api/v1/customer/merchants/:id`** — `getCustomerMerchant`, includes a voucher list, drives Merchant Profile voucher cards (M4c).

Both gain the same TIME_LIMITED fields. M4c reads the same shape from the merchant-profile payload so cards don't need a second round-trip per voucher.

#### 3.6.1 New fields (both endpoints, on every voucher row)

```typescript
// New fields on the voucher row payload
availabilityWindows: Array<{
  dayOfWeek: number       // 0-6
  openTime: string        // "HH:mm"
  closeTime: string       // "HH:mm" or "24:00" (sentinel; see §3.2 rule 3)
}>                        // [] for non-TIME_LIMITED; non-empty for ACTIVE TIME_LIMITED (rule 7)

currentWindow: {
  startsAt: string        // ISO instant in UTC
  endsAt:   string        // ISO instant in UTC
} | null                  // non-null ONLY when TIME_LIMITED AND a window is currently open

nextWindow: {
  startsAt: string        // ISO instant in UTC — the NEXT window-occurrence to open
  endsAt:   string        // ISO instant in UTC
} | null                  // null only when no windows are configured (degenerate state)

redeemedWindow: {
  startsAt: string        // ISO instant in UTC — start of the window-occurrence the redemption anchors to
  endsAt:   string        // ISO instant in UTC — end of that occurrence
} | null
// Non-null ONLY when (TIME_LIMITED AND a VoucherRedemption for (userId, voucherId) anchors to a
// window-occurrence whose redeemed-state surface should still render).
//
// Specifically, this is non-null iff EITHER:
//   (a) currentWindow !== null AND a redemption exists with redeemedAt in [currentWindow.startsAt,
//       currentWindow.endsAt); in which case redeemedWindow === currentWindow.
//   (b) currentWindow === null AND a redemption exists with redeemedAt in the most-recently-closed
//       window-occurrence, AND now < nextWindow.startsAt (so the redeemed-state surface persists
//       until the next window opens, which would reset the eligibility).
//
// Customer-app reads `redeemedWindow !== null` as the load-bearing flag for rendering the hero
// seal + RedemptionDetailsCard in the time-limited-redeemed-window state. The explicit window
// boundaries on the field make the "which window does this redemption anchor to?" question
// answerable without re-deriving from `lastRedemption.redeemedAt` + window definitions client-side.
```

The legacy boolean `redeemedThisWindow` from earlier drafts is **rejected** — it collapsed two semantically distinct cases ("currently inside an open window with redemption" vs "between windows but redeemed-state still surfaces") into one ambiguous boolean. `redeemedWindow: { startsAt, endsAt } | null` is the locked shape.

#### 3.6.2 `isRedeemedThisCycle` for TIME_LIMITED

`isRedeemedThisCycle` (existing field, used by non-TIME_LIMITED state machine) is **always `false` for TIME_LIMITED vouchers**, by construction:

- Backend redemption guard for TIME_LIMITED bypasses `UserVoucherCycleState` entirely (§3.8) — no cycle-state row is ever written for a TIME_LIMITED redemption.
- `getCustomerVoucher` + `getCustomerMerchant` derive `isRedeemedThisCycle` from cycle-state; absence of the row = `false`.

Customer-app **MUST NOT** branch on `isRedeemedThisCycle` for TIME_LIMITED. Branch on `redeemedWindow !== null` instead. The state-machine in §5.1 enforces this via voucher-type branching.

#### 3.6.3 `lastRedemption` for TIME_LIMITED

`lastRedemption` (existing M3 field, persisted return-visit RedemptionDetailsCard) — for TIME_LIMITED:
- Returns the **most recent** `VoucherRedemption` for this user+voucher, regardless of which window-occurrence.
- The 2-hour presentation window helper still derives from `lastRedemption.redeemedAt + 2h`.
- If the most-recent redemption is older than 2 hours AND outside its anchoring window-occurrence (i.e. `redeemedWindow === null`), the persisted card surface collapses per existing M3 §AE5 behaviour.
- `redeemedWindow !== null` is the load-bearing flag for "render the seal + RedemptionDetailsCard." `lastRedemption !== null` is necessary for the card to have any data to show, but on its own is NOT sufficient — `redeemedWindow !== null` AND `lastRedemption !== null` must both hold (by construction they move together for TIME_LIMITED).

#### 3.6.4 `availableAgainAt` for TIME_LIMITED — explicitly NULL (no semantic overload)

`availableAgainAt` (existing field, cycle-renewal ISO timestamp for non-TIME_LIMITED) is **always `null` for TIME_LIMITED vouchers**, by lock.

Earlier drafts proposed overloading the field to mean "next window-occurrence open" for TIME_LIMITED. This is rejected — `availableAgainAt` is consumed by existing customer-app code paths (seal subtitle, CycleRulesCard, etc.) that treat it as cycle-renewal semantics. Overloading would silently break those code paths when the voucher type is TIME_LIMITED.

For TIME_LIMITED, customer-app reads **`nextWindow.startsAt`** to drive the "Available again in Xh Ym" copy in the seal subtitle + blue banner under RedemptionDetailsCard. The TIME_LIMITED-specific copy templates (§5.4) explicitly reference `nextWindow.startsAt`, never `availableAgainAt`.

Component-level lock: `<CycleRulesCard>` early-returns when `availableAgainAt === null`, so it correctly hides itself for TIME_LIMITED vouchers without any type branching at the call site. The new `<TimeLimitedDetailsCard>` (§4) takes its place for TIME_LIMITED, reading from `availabilityWindows` + `currentWindow` + `nextWindow`.

#### 3.6.5 Merchant Profile payload size

Adding the four TIME_LIMITED fields to every voucher row in `getCustomerMerchant` increases payload size proportional to merchant voucher count. For a merchant with 10 TIME_LIMITED vouchers each having 5 windows, the additional payload per voucher is roughly:
- `availabilityWindows`: ~5 × 60 bytes = ~300 bytes
- `currentWindow` / `nextWindow` / `redeemedWindow`: 3 × ~100 bytes = ~300 bytes
- Total extra per voucher: ~600 bytes

For 10 such vouchers, ~6 KB extra. Acceptable. Non-TIME_LIMITED vouchers carry `availabilityWindows: []` + `currentWindow: null` + `nextWindow: null` + `redeemedWindow: null` (~40 bytes overhead per voucher). If payload size becomes a concern at scale, M4 + Phase 4 can introduce a derived `cardState` discriminator that compresses the per-row payload. Not v1 scope.

### 3.7 Customer-app derived helpers (no new module — extend existing)

Add to `apps/customer-app/src/features/merchant/utils/londonNow.ts` (or a new `apps/customer-app/src/features/voucher/utils/timeLimitedWindow.ts`, owner's call at plan time):

- `getCurrentWindowOccurrence(windows, now): { startsAt: Date, endsAt: Date } | null` — pure function.
- `getNextWindowOccurrence(windows, now): { startsAt: Date, endsAt: Date } | null` — pure function.
- `getWindowState(voucher, now): 'active' | 'urgent' | 'unavailable-today' | 'unavailable-future-day' | 'no-windows'` — derives the state.
- All using `formatToParts` numeric extraction + hardcoded English day-name array per the locked Hermes-robust pattern (`reference_london_clock_helper.md`).

### 3.8 Backend redemption guard

Today's guard order: voucher status → expiry → branch → branch-merchant coherence → subscription → phone-verified → cycle → PIN → claim.

New guard order (R6 locked):

1. **Voucher exists + ACTIVE + APPROVED + merchant ACTIVE** (existing — VOUCHER_NOT_FOUND on miss).
2. **Voucher not expired** (existing — `voucher.expiryDate <= now` collapses to VOUCHER_NOT_FOUND).
3. **NEW: Availability window check** — IF `voucher.type === 'TIME_LIMITED'`:
   - Compute `currentWindowOccurrence` per §3.5.
   - If null → throw `VOUCHER_OUTSIDE_AVAILABILITY_WINDOW` with payload `{ nextWindowAt: ISO | null, schedule: "Mon-Fri, 11am-3pm" | null }` (R1 locked).
4. **Branch valid + active + matches merchant** (existing — BRANCH_UNAVAILABLE / BRANCH_MERCHANT_MISMATCH).
5. **Subscription guard** (existing — SUBSCRIPTION_REQUIRED).
6. **Phone-verified guard** (existing — PHONE_NOT_VERIFIED).
7. **NEW: Window-occurrence redemption check** (replaces the existing cycle check FOR TIME_LIMITED ONLY):
   - IF `voucher.type === 'TIME_LIMITED'`: query `VoucherRedemption` for `(userId, voucherId)` with `redeemedAt` within `currentWindowOccurrence.startsAt` to `currentWindowOccurrence.endsAt`. If any row exists → throw `ALREADY_REDEEMED_THIS_WINDOW` with payload `{ nextWindowAt: ISO | null }`.
   - ELSE (any non-TIME_LIMITED type): existing cycle check unchanged — throw `ALREADY_REDEEMED` if `cycleState.isRedeemedInCurrentCycle`.
8. **PIN match + rate-limit** (existing).
9. **Atomic redemption claim** (existing — Prisma `$transaction` with cross-transaction P2002 retry from PR #43):
   - Insert `VoucherRedemption` with generated `redemptionCode`.
   - For non-TIME_LIMITED: upsert `UserVoucherCycleState`.
   - For TIME_LIMITED: do NOT touch `UserVoucherCycleState` — bypass the cycle-state machinery entirely. The `VoucherRedemption.redeemedAt` field IS the source of truth.

### 3.9 New typed errors

| Code | When | Payload | Customer-facing copy |
|---|---|---|---|
| `VOUCHER_OUTSIDE_AVAILABILITY_WINDOW` | TIME_LIMITED voucher, no current window-occurrence open at server `now` | `{ nextWindowAt: ISO \| null, schedule: string \| null }` | "Not available right now. Available again \<formatted nextWindowAt\>." |
| `ALREADY_REDEEMED_THIS_WINDOW` | TIME_LIMITED voucher, user already redeemed in current window-occurrence | `{ nextWindowAt: ISO \| null }` | "You've already used this offer for this window. Available again \<formatted nextWindowAt\>." |

Both errors include `nextWindowAt` so the customer-app can render graceful actionable copy without a separate round-trip. If the window happened to close between PIN entry and submit (edge case R1), the rejected-mid-redemption response gives the user the same "Try again next window" message inline.

### 3.10 Merchant CRUD API extension (D5)

`POST /api/v1/merchant/vouchers` and `PATCH /api/v1/merchant/vouchers/:id` accept:

```typescript
availabilityWindows?: Array<{
  dayOfWeek: number   // 0-6
  openTime: string    // "HH:mm" matching /^([01]\d|2[0-3]):[0-5]\d$/
  closeTime: string   // "HH:mm"
}>
```

Validation per §3.2 rules 1-7. Reject with structured error if any rule fails:
- `INVALID_AVAILABILITY_WINDOWS` with `details: { row: number, rule: 'cross-midnight' | 'overlap' | 'malformed-time' | ... }`.

Submit/publish (`POST .../:id/submit`) for a TIME_LIMITED voucher with zero windows → reject with `TIME_LIMITED_REQUIRES_WINDOW`.

NO merchant portal UI in M4. The API is the contract. Phase 4 builds a UI on top.

---

## 4. Voucher Detail content layout (TIME_LIMITED-specific section)

Voucher Detail for TIME_LIMITED shares the SAME overall layout as other voucher types — title, merchant/branch context, saving, description, fair-use/terms, branch details, cycle/renewal/redeemed sections — and ADDS a TIME_LIMITED-specific details block that explains the offer's timing rules:

| Field | Source | Visibility |
|---|---|---|
| **Available during** | Schedule string derived from `availabilityWindows` (e.g. "Mon-Fri, 11am-3pm" or "Tuesdays, 6-10pm" or "Mon-Fri, 11am-3pm and 6pm-10pm") | All states |
| **Current window ends** | `currentWindow.endsAt` formatted as clock-time | Only when `state === 'active' \|\| 'urgent'` |
| **Next available** | `nextWindow.startsAt` formatted as duration + clock-time anchor | Only when `state === 'unavailable-*' \|\| 'redeemed-window'` |
| **Usage rule** | Static copy: "Redeem once per active window." | All states (educational) |
| **Offer ends** | `voucher.expiryDate` formatted per §AH precedence rules | Only when expiryDate is set AND state !== 'expired' |
| **Renews on** | NEVER for TIME_LIMITED — replaced by "Available again" derived from `nextWindow` | n/a (replaced) |

The TIME_LIMITED-specific block is a card or list section that sits between the existing CycleRulesCard slot and MerchantRow on Voucher Detail. Component name (locked at writing-plans time): likely `<TimeLimitedDetailsCard>` or `<AvailabilityCard>`. The component reads from `voucher.availabilityWindows`, `voucher.currentWindow`, `voucher.nextWindow`, `voucher.expiryDate`.

Schedule string formatting (locked):
- Single contiguous range across multiple days → "Mon-Fri, 11am-3pm" (compact).
- Single day only → "Tuesdays, 6-10pm" (with -s plural).
- Split-day same hours → not possible per schema rule 1; split-day means different hours.
- Split-day different hours → "Mon-Fri, 11am-3pm and 6pm-10pm" (note the "and").
- Multiple disjoint day ranges → "Mon-Fri, 11am-3pm and Sat-Sun, 12pm-4pm".
- Cross-midnight (split into two rows per §3.2 rule 3) → display as one logical range: "Fridays, 10pm-2am". The schedule formatter detects the `closeTime: "24:00"` + adjacent `dayOfWeek+1, openTime: "00:00"` pattern and merges them. (Implementation hint at writing-plans time.)

---

## 5. Voucher Detail — state machine + per-state visual contract

### 5.1 State precedence (locked, D4 + R6)

The 12-state machine in `VoucherDetailScreen.tsx` extends with two new TIME_LIMITED states. Precedence top-to-bottom (first match wins):

```
1. loading                    — voucherQuery.isLoading || isSubLoading
2. error                      — voucherQuery.isError || !voucher || branchErrored
3. expired                    — voucher.expiryDate < now             ← UNIVERSAL, expired-first
4. redeemed-this-cycle        — !TIME_LIMITED && voucher.isRedeemedThisCycle
   redeemed-this-window       — TIME_LIMITED && voucher.redeemedWindow !== null
5. free-user                  — !isSubscribed                        ← R2 lock: free user inside active window sees subscribe gate
6. time-limited-urgent        — TIME_LIMITED && currentWindow !== null && minutesUntil(currentWindow.endsAt) < 60
   time-limited-active        — TIME_LIMITED && currentWindow !== null && minutesUntil(currentWindow.endsAt) ≥ 60
   time-limited-unavailable-today  — TIME_LIMITED && currentWindow === null && nextWindow.startsAt is today (Europe/London)
   time-limited-unavailable-future — TIME_LIMITED && currentWindow === null && nextWindow.startsAt is tomorrow+
7. can-redeem                 — default (non-TIME_LIMITED, subscribed, not expired/redeemed)
```

Note: for TIME_LIMITED vouchers, the state-machine NEVER reaches `can-redeem` — TIME_LIMITED routes through the `time-limited-*` branches.

### 5.2 Six visual states (locked)

| State | Hero | Frosted countdown banner | Banner-below-coupon | CTA | Notes |
|---|---|---|---|---|---|
| **active** (≥60 min remaining) | Amber gradient, full colour | Primary "Active until 14:30" + supporting "Ends in 2h 14m · Mon-Fri, 11am-3pm". Calm visual. | Calm amber "Available Now" banner — explains per-window rule. | Brand-red gradient "Redeem This Voucher" | `vd-state-time-limited-active` |
| **urgent** (<60 min remaining) | Same amber. Frosted banner shifts to urgent variant (slight red tint, `rgba(180,83,9,0.4)` background). | Primary "Ending in 18m" + supporting "Ends at 15:00 · Mon-Fri, 11am-3pm". | Coral urgent "Window Closing Soon" — calm copy, no "HURRY!". | Brand-red gradient — unchanged. | `vd-state-time-limited-urgent` |
| **unavailable-today** | Full-colour amber (NOT washed out — voucher is alive, just not now). | Primary "Available in 3h 12m" + supporting "Starts at 17:00 · Mon-Fri, 5-7pm". | Calm blue "Not Currently Available" + schedule. | Disabled navy two-line: "Not Available Right Now" / "Mon-Fri, 5-7pm". | `vd-state-time-limited-unavailable-today` |
| **unavailable-future-day** | Same. | Primary "Starts in 2d 4h" + supporting "Tuesday 18:00 · Tuesdays, 6-10pm". | Same calm blue. | Same disabled navy two-line. | `vd-state-time-limited-unavailable-future-day` |
| **redeemed-this-window** | Dim 0.55, hero seal overlay (existing M3 §AE5 contract). | Frosted banner dimmed (opacity 0.4). | Two pieces: (1) `<RedemptionDetailsCard>` with Show-to-Staff button during 2h handoff; helper line "Available to show staff until HH:MM today". (2) Calm blue banner "Available again in 18h 24m" + supporting "Tuesday 12:00 · Mon-Fri, 12-6pm". | No bottom CTA — redemption already happened. | `vd-state-time-limited-redeemed-window` |
| **expired** | Washed out (`grayscale(0.5) brightness(0.7) opacity 0.7`). Vivid red "Voucher Expired" badge OUTSIDE filtered hero. | Empty placeholder ("—"). | Red-tinted "Offer Ended" with expiry date. | Disabled grey "Voucher Has Expired". | `vd-state-time-limited-expired` |

### 5.3 Countdown system v2 (locked)

Universal rules:
- **No seconds anywhere.** Per-minute updates within hours; per-hour updates in days territory.
- **Update mechanism:** setTimeout-at-boundary (mirroring M3 §AE5 presentation-window pattern). NOT `setInterval` polling. On AppState foreground, recompute window state from `Date.now()` and re-arm the next setTimeout.
- **Visual urgency activated ONLY in the `urgent` state** (last 60 min of an active window). All other states stay calm — premium/helpful tone, not panic-timer.

Format rules per state:

| State | Primary | Supporting | Update cadence |
|---|---|---|---|
| **active** ≥60min | "Active until HH:MM" (clock-time) | "Ends in Xh Ym · schedule" | per-minute |
| **urgent** <60min | "Ending in Xm" (duration) | "Ends at HH:MM · schedule" | per-minute |
| **unavailable-today** | "Available in Xh Ym" (duration) | "Starts at HH:MM · schedule" | per-minute |
| **unavailable-future-day** | "Starts in Xd Yh" (duration; Xd Yh Zm if <48h out) | "Day HH:MM · schedule" | per-hour ≥24h, per-minute <24h |
| **redeemed-this-window** | Seal subtitle "Available again in Xh Ym" + same in blue banner under RedemptionDetailsCard | "Day HH:MM · schedule" | per-hour ≥24h, per-minute <24h |
| **expired** | (none) | (none) | n/a |

Test IDs for regression pins:
- `vd-frosted-countdown-primary`
- `vd-frosted-countdown-supporting`
- `seal-subtitle-available-again` (TIME_LIMITED-only, replaces existing `seal-subtitle-renews-on`)
- `vd-rd-availability-helper` — the 2h handoff helper line ("Available to show staff until 15:42 today")
- `vd-banner-next-window` — the calm blue banner under RedemptionDetailsCard for redeemed state

### 5.4 Copy locks (Voucher Detail TIME_LIMITED)

#### Hero/frosted banner copy

| State | Label tiny | Primary | Supporting |
|---|---|---|---|
| active ≥60min | "Active until" | clock-time HH:MM | "Ends in Xh Ym · schedule" |
| urgent <60min | "Ending in" | "Xm" | "Ends at HH:MM · schedule" |
| unavailable-today | "Available in" | duration | "Starts at HH:MM · schedule" |
| unavailable-future-day | "Starts in" | duration | "Day HH:MM · schedule" |
| redeemed (window-occurrence) | (frosted dimmed) | (dimmed) | (dimmed) |
| expired | "Was active" | "—" | schedule (dimmed) |

#### Banner-below-coupon (full sentence)

| State | Title | Body |
|---|---|---|
| active | "Available Now" | "Redeem within today's window. You can use this offer once each window — \<other windows still available this week / day\> ." |
| urgent | "Window Closing Soon" | "Today's lunch window ends at HH:MM. Other weekday windows are still available." |
| unavailable-today | "Not Currently Available" | "This voucher can be redeemed \<schedule sentence\>. Come back at HH:MM." |
| unavailable-future-day | "Not Currently Available" | "This voucher can be redeemed \<schedule sentence\>." |
| redeemed-this-window | "Available again in Xh Ym" | "Day HH:MM · schedule. Same offer, fresh redemption." |
| expired | "Offer Ended" | "This voucher expired on DD MMMM YYYY. The offer is no longer available." |

#### CTA copy

| State | CTA |
|---|---|
| active / urgent | Primary "Redeem This Voucher" (brand-red gradient) |
| unavailable-today | Disabled navy: line 1 "Not Available Right Now" / line 2 schedule |
| unavailable-future-day | Same disabled navy two-line |
| redeemed-this-window | (no bottom CTA — `<RedemptionDetailsCard>` carries Show-to-Staff button during handoff) |
| expired | Disabled grey "Voucher Has Expired" |

#### §AH copy reconciliation (TIME_LIMITED-specific)

The locked §AH convention ("Renews on" for cycle / "Offer ends" for merchant expiry, never blended) gains a third concept for TIME_LIMITED only:

- **"Available again \<date+time\>"** = next window-occurrence open. **Source: `voucher.nextWindow.startsAt`** (NOT `voucher.availableAgainAt`, which is `null` for TIME_LIMITED per §3.6.4). Used on:
  - Hero seal subtitle (replaces "Renews on" for TIME_LIMITED).
  - Calm blue banner under `<RedemptionDetailsCard>` in redeemed state.
- **"Renews on"** is NEVER used for TIME_LIMITED. Component-level lock: `<CycleRulesCard>` early-returns when `availableAgainAt === null`, so it correctly hides itself for TIME_LIMITED. The new `<TimeLimitedDetailsCard>` (§4) takes its place. (For non-TIME_LIMITED, §AH remains as-is and reads from `availableAgainAt`.)
- **"Offer ends"** for TIME_LIMITED only when `voucher.expiryDate` is set AND not yet expired. Sits as small-print line under "Available during" schedule in the TIME_LIMITED-specific details block (§4). Format: "Offer ends DD MMMM YYYY".
- §AH §1748 final-cycle case (`expiryDate < cycleEnd`) — for TIME_LIMITED this case manifests as "voucher's hard expiry is before the next window-occurrence start" (`expiryDate < nextWindow.startsAt`). UI: surface BOTH "Available again Tuesday 12pm" AND "Offer ends Wed 14 May" with the offer-ends line in a slightly heavier visual weight ("This is your last window").

#### Free-user state inside an active TIME_LIMITED window (R2 lock)

The state-machine routes a free user to the `free-user` branch (subscription gate is the primary action). On Voucher Detail:

- Type badge ("Time-Limited Offer" with amber gradient hero) remains visible.
- Schedule text ("Mon-Fri, 11am-3pm") shown in supporting copy under the type badge.
- Frosted countdown banner: hidden or dimmed — countdown is for subscribed users with redemption intent.
- CTA: subscription-prompt CTA (existing free-user gate flow), NOT the redemption CTA. Dimmed amber detail block stays visible so the user understands what they'd be unlocking.
- Sticky bottom CTA navigates to `/(auth)/subscription-prompt` with the source attribution preserved (existing M2 contract).

This honours the lock: free user sees subscription gate as primary; type/schedule visible as supporting; no enabled redemption surface.

### 5.5 Boundary-race recovery (R1 lock)

Edge case: user is at PIN entry at 14:59:50 (last 10 seconds of an 11:00-15:00 window). Submit fires at 15:00:01. Server rejects with `VOUCHER_OUTSIDE_AVAILABILITY_WINDOW` payload `{ nextWindowAt: <Tuesday 11:00 ISO>, schedule: "Mon-Fri, 11am-3pm" }`.

Customer-app behaviour:
- `<PinEntrySheet>` displays inline error: "This window just closed. Try again next window: Tuesday 11am."
- Sheet does NOT auto-dismiss — user reads the message and dismisses manually.
- After dismiss, Voucher Detail state-machine re-derives → flips to `time-limited-unavailable-future-day`.
- No client-side mitigation (server is source of truth). The client countdown might briefly show "0m" before the boundary timer fires; that's acceptable.

Test pin: backend test that rejects a redemption attempt 1ms after window-close; frontend test that the inline error renders on `VOUCHER_OUTSIDE_AVAILABILITY_WINDOW` response.

---

## 6. Merchant Profile voucher-card states (D6 lock)

### 6.1 Visual treatment

Card colour gradient (existing amber `#F4D072 → #BC6D1C`) and "Time limited" label preserved across all states. State signal lives in the **top-right pill** (NOT the card frame, NOT a full-card glow):

| State | Pill copy | Pulse-dot | Card opacity | Card lift |
|---|---|---|---|---|
| active | "Active · ends 14:30" (clock-time) | semantic green, 2s pulse | 100% | type-tinted shadow (existing PR-B) |
| urgent (<30 min) | "Ending in 18m" | urgency coral, 1.5s pulse | 100% | type-tinted shadow |
| unavailable today | "Available 5pm" / "Available 11am" | (none) | 75% | flat shadow |
| unavailable future day | "Available Mon" / "Tomorrow 12pm" | (none) | 75% | flat shadow |
| redeemed-this-window | (no pill — existing PR-B `Voucher Redeemed` overprint) | (none) | (PR-B redeemed treatment) | flat per PR-B |
| expired | (hidden by default) | n/a | n/a | n/a |

Animation reserved for `active` and `urgent` ONLY — same scaling principle as M3 LIVE pulse: animation = something is live or ending right now.

### 6.2 Pill copy conventions (compact)

NEVER duration phrases on cards. NEVER ticking seconds. Per-minute updates only.

| Situation | Pill copy |
|---|---|
| Active, > 60 min remaining | "Active · ends HH:MM" (24h clock) |
| Active, ≥ 60 min but rounded clock-time clearer | "Active · ends 9pm" (round to clock-hour for far-from-boundary readability) |
| Urgent, < 30 min remaining | "Ending in 18m" |
| Outside window opens today | "Available HH:MM" (e.g. "Available 5pm") |
| Outside window opens tomorrow | "Tomorrow 12pm" |
| Outside window opens later this week | "Tue 12pm" / "Mon 11am" (3-letter day + clock-time) |

### 6.3 Sort order (locked)

```
1. Redeemable now bucket
   1a. Ending-soon TIME_LIMITED (urgency-tier active — top of bucket for action)
   1b. Active TIME_LIMITED (calm)
   1c. Non-TIME_LIMITED active (existing voucher list, sorted per current default)
2. Available later bucket — outside-window TIME_LIMITED, sorted by next-active-time ascending
3. Redeemed this cycle / window — existing PR-B redeemed treatment
4. Expired — HIDDEN by default
```

Rationale: time-sensitive items deserve top placement to drive action. Without prioritisation, an active lunch deal is buried under permanent BOGOs and the user misses the window. Urgent state at the very top within the redeemable bucket because it's the most action-time-sensitive.

Outside-window cards remain visible (NOT hidden) because users still need to learn the offer exists and know when to come back. 75% opacity (NOT 50% like redeemed — keep the distinction) signals "exists but not actionable right now."

### 6.4 Test IDs

`merchant-card-pill-active`, `merchant-card-pill-urgent`, `merchant-card-pill-unavailable-today`, `merchant-card-pill-unavailable-future-day`, `merchant-card-pill-pulse-dot` (asserts pulse-dot presence per state).

---

## 7. Show-to-Staff / 2-hour presentation window (M3 contract preserved)

No changes to M3 contracts. All of these compose against TIME_LIMITED unchanged:

- **Presentation window** = `redeemedAt + 2h`, regardless of voucher type or window state. Anchored to redemption time, NOT to voucher window time.
- **Edge case (preserved per spec §11 row 953):** user redeems Monday 14:55 (last 5 min of 11-3 window). Presentation window runs to 16:55. Window closes 15:00. Show-to-Staff is fully active 14:55-16:55. Same for redemption at 17:55 of a 15-18 window — presentation extends to 19:55 even though window closed at 18:00.
- **Code visibility / `useScreenCaptureProtection` / `useScreenshotGuard` / `useBrightnessBoost` / `useAutoHideTimer`** — all unchanged.
- **§AE5 inner notice card** ("Staff handoff window ended") — unchanged. Renders when `!isPresentationActive && !isValidated` regardless of voucher type.
- **§AE6.2 iOS post-fact screenshot detection on Voucher Detail** — unchanged. Active when code surface is visible.

Edge case introduced by TIME_LIMITED: the 2h handoff helper line ("Available to show staff until HH:MM today") and the next-window banner ("Available again in Xh Ym") sit on the same screen during the redeemed-this-window state. They are about different things and must be visually separated:
- Helper line attaches to the `<RedemptionDetailsCard>` body (existing M3 placement).
- Next-window banner sits BELOW `<RedemptionDetailsCard>` as a separate element with calm blue treatment.

---

## 8. Out of scope (deferred, captured)

| Item | Where deferred | Reason |
|---|---|---|
| Discovery / Home / Map TIME_LIMITED treatment | Post-Plan-4 Discovery rebaseline | Discovery itself is unsettled (`project_discovery_sequencing_plan4.md`); building a TIME_LIMITED-aware rail now creates rework |
| Active-now / starts-soon Discovery rails | Same | Same |
| Home-card countdowns | Same | Same |
| Notification on window-open (push) | Phase 6 §G comms (FCM) | Comms layer not built yet; valuable but not a M4 v1 blocker |
| Merchant Portal window-editor UI | Phase 4 §R4 | M4 ships the API contract; portal builds UI on top |
| Phase 4 anti-abuse policy (max ratio of TIME_LIMITED per merchant) | Phase 4 §R4 / §T extension | No production data yet to inform policy; capture now, decide later |
| One-shot `availableFrom` campaign-window field | Not needed | Merchant uses `expiryDate` (existing) for end; if "starts later" surfaces as a real need, separate workstream |
| REUSABLE multi-redemption (M5) | Tier 3 brainstorm-first per §T1 | Different product (cooldown-based); intentionally separate v1 |
| Per-branch / per-voucher timezone | Phase 6 international | UK-only v1 |
| Profile → Redemption History TIME_LIMITED rendering | §Q5 Tier 2 standalone surface | Each TIME_LIMITED redemption is a discrete event in History (locked); UI design when §Q5 picks up. See §8.1 below for known-limitation framing — M4 does NOT depend on §Q5. |

### 8.1 Known limitation — expired-while-redeemed code recovery

D4 locks "expired-precedes-redeemed" across all voucher types: if `voucher.expiryDate < now`, the expired surface wins on Voucher Detail regardless of redemption history. The eventual recovery path for past redemption codes is Profile → Redemption History (§Q5).

**§Q5 is a deferred Tier 2 surface and IS NOT shipped in M4.** Until §Q5 ships, the following edge case is a known limitation:

- A customer who redeemed a TIME_LIMITED (or any) voucher and whose redemption is still within the 2-hour Show-to-Staff handoff window when the voucher's `expiryDate` passes will lose the in-app code surface on Voucher Detail at the expiry instant. The Show-to-Staff modal cannot be re-opened from Voucher Detail because the screen now renders the expired state.
- If the staff has not yet validated by the expiry instant, the customer's code is functionally orphaned from the customer-app UI until §Q5 ships.
- Database state is preserved (the `VoucherRedemption` row persists indefinitely); only the UI surface is unavailable.

**Mitigation in M4:** none. This is an explicit accepted limitation, NOT a bug. Two factors keep the practical impact low for v1:

1. Today's seed/production data has `expiryDate: null` on virtually all vouchers — the case cannot manifest at any meaningful frequency until Phase 4 Merchant Portal lets merchants set non-null expiry dates.
2. The 2-hour handoff window is narrow; an expiry that lands inside it is an unusual edge case (a merchant would have to set expiry to an exact mid-handoff timestamp).

**Phase 4 / §Q5 priority:** when Merchant Portal voucher CRUD ships expiry editing, §Q5 (Profile → Redemption History) MUST ship before or in the same release. Without §Q5, the limitation above starts to manifest in real customer scenarios. Captured as a sequencing dependency in `project_deferred_followups_index.md` §Q5 + §R4 cross-reference at memory-update time (§11).

**Customer-app implementation lock:** the spec does NOT instruct any code to point users at §Q5 ("see your history" copy, in-app navigation hints to a non-existent surface) until §Q5 ships. M4's expired-state surface (§5.2 row 6) is self-contained: red badge + "Offer Ended · This voucher expired on DD MMMM YYYY" copy, no recovery affordance.

---

## 9. Test contract (regression pins)

### 9.1 Backend tests (M4a)

- Schema migration applies + reverses cleanly.
- CRUD validation rules 1-7 each have a positive + negative test (12+ assertions). Includes:
  - Cross-midnight `"24:00"` accepted as `closeTime`, REJECTED as `openTime`.
  - `closeTime` parsing: `"24:00"` → minute 1440; arithmetic comparison `closeTime > openTime` works correctly.
  - Cross-midnight integration: Friday `(5, "22:00", "24:00")` + Saturday `(6, "00:00", "02:00")` — confirm a redemption at 23:59:30 falls inside Friday's window AND a redemption at 00:00:30 falls inside Saturday's window. No gap at 23:59 → 00:00.
  - Rule 4 (no overlapping windows for `(voucherId, dayOfWeek)`): 5+ adjacency cases including back-to-back non-overlap (`11:00-15:00` + `15:00-18:00` accepted — boundary touching is not overlap per half-open semantics).
  - Rule 7 (at least one window to publish/activate): submit/publish a TIME_LIMITED voucher with zero windows → `TIME_LIMITED_REQUIRES_WINDOW`.
- Window-occurrence helper function: 10+ pure-function tests including BST/GMT boundary, midnight boundary, half-open ranges, multi-window same day, no-windows, cross-midnight transition (23:59:59.999 → 00:00:00.000 with `"24:00"` adjacent `"00:00"`).
- Redemption guard `VOUCHER_OUTSIDE_AVAILABILITY_WINDOW`: 4 cases (current window open vs closed, with/without nextWindow). Payload shape verified.
- Redemption guard `ALREADY_REDEEMED_THIS_WINDOW`: 4 cases (same window-occurrence, prior window-occurrence, fresh window after rollover, future-day window). Payload shape verified.
- Redemption guard order: order tested explicitly via fixture sequence — voucher status → expiry → availability window → branch → subscription → cycle/window-redemption guard → PIN → claim.
- Atomic claim: TIME_LIMITED does not touch `UserVoucherCycleState` (negative pin — assert no row created post-redemption for TIME_LIMITED).
- `getCustomerVoucher` payload: `availabilityWindows` / `currentWindow` / `nextWindow` / `redeemedWindow` shape + values across 6 voucher fixtures (active, urgent boundary, outside-today, outside-future, redeemed, expired). Explicit assertions:
  - `redeemedWindow` is `{ startsAt, endsAt }` shape OR `null` (NOT a boolean).
  - `redeemedWindow === currentWindow` when redemption is inside the open window.
  - `redeemedWindow === previousWindowOccurrence` when between windows AND redeemed in the just-closed occurrence.
  - `availableAgainAt === null` for TIME_LIMITED (NOT overloaded).
  - `isRedeemedThisCycle === false` for TIME_LIMITED (always — cycle-state row is never written).
- `getCustomerMerchant` (merchant-profile endpoint) — voucher rows in the returned payload INCLUDE the same TIME_LIMITED fields (`availabilityWindows`, `currentWindow`, `nextWindow`, `redeemedWindow`). Shape tests + payload-size sanity check on a merchant with 10+ TIME_LIMITED vouchers.

### 9.2 Customer-app tests (M4b)

- `useTimeLimited` un-stubbed: 12+ pure-function tests covering all 4 states (active / urgent / unavailable-today / unavailable-future-day / no-windows) + boundary transitions + AppState resume + Hermes-robust formatter coverage.
- 12-state machine: 6 new states have happy-path render tests.
- `<TimeLimitedDetailsCard>` (or equivalent): renders each TIME_LIMITED-specific row per state.
- §AH copy: seal subtitle "Available again \<date+time\>" replaces "Renews on" for TIME_LIMITED.
- Boundary-race: PIN entry rejected with `VOUCHER_OUTSIDE_AVAILABILITY_WINDOW` shows graceful copy; sheet doesn't auto-dismiss.
- Free-user state: subscription gate is primary; type badge + schedule visible; no enabled redemption CTA.
- Test-IDs: all listed in §5.3 + §5.4 + §6.4.

### 9.3 Customer-app tests (M4c)

- Merchant card pill renders correct copy + pulse for each state.
- Sort order test: fixture with one of each state, ordered output matches §6.3.
- 75% opacity for outside-window cards (NOT 50% — distinction from redeemed).
- Expired hidden by default.
- **Data source pin:** `<VoucherCard>` reads TIME_LIMITED state fields (`availabilityWindows`, `currentWindow`, `nextWindow`, `redeemedWindow`) directly from the `getCustomerMerchant` payload row — NO additional round-trip to `getCustomerVoucher` per card.
- Schedule string formatter pure-function tests: 10+ scenarios including cross-midnight merge (Friday `"22:00-24:00"` + Saturday `"00:00-02:00"` → "Fridays, 10pm-2am" display).

### 9.4 Device-QA scenarios

Locked at brainstorm time:
- **Branch open + voucher window open** → can redeem.
- **Branch closed + voucher window open** → BRANCH_UNAVAILABLE (existing).
- **Branch open + voucher window closed** → VOUCHER_OUTSIDE_AVAILABILITY_WINDOW.
- **Multi-branch merchant: London open + Edinburgh closed at 11:30 with window 11-3.** Branch picker shows both; user picks Edinburgh → BRANCH_UNAVAILABLE.
- **Window-close mid-redemption** (the 14:59:50 → 15:00:01 case).
- **Active-now lunch window with Tuesday-redeemed previous occurrence** → Voucher Detail shows active/redeemable state; cycle-state from the Tuesday redemption is irrelevant (TIME_LIMITED bypasses cycle-state).
- **AppState backgrounding across boundary**: voucher in active state → app backgrounded → boundary passes while backgrounded → app foregrounded → state correctly flipped to urgent or unavailable-today.

---

## 10. Sequencing — 3-PR breakdown (D8 lock)

### M4a: Backend + schema + API contract
- Prisma migration adding `VoucherAvailabilityWindow` table.
- Backend `getCustomerVoucher` payload extensions per §3.6 (single-voucher detail endpoint, drives M4b Voucher Detail).
- Backend `getCustomerMerchant` payload extensions per §3.6 — every voucher row in the merchant-profile response gains `availabilityWindows`, `currentWindow`, `nextWindow`, `redeemedWindow`. Drives M4c voucher cards. Same shape as `getCustomerVoucher` so the customer-app can use one Zod schema for both call sites.
- Backend redemption guard order per §3.8 with new typed errors.
- Backend window-occurrence helper functions (`src/api/shared/londonClock.ts` extension or new module).
- Merchant CRUD API extension per §3.10 with validation rules per §3.2 (including cross-midnight `"24:00"` sentinel parsing).
- Customer-app voucher schema (`apps/customer-app/src/lib/api/voucher.ts` + merchant-profile schema in `lib/api/merchant.ts` or equivalent) extended; redemption error types extended.
- Seed admin script: `prisma/seed-time-limited-fixtures.ts` populating Covelum/Kovalam demo windows.
- Operations doc: append section to `docs/operations/redis-namespaces.md` (or new `docs/operations/voucher-availability-windows.md`) — API contract reference for future Phase 4 portal.
- Backend tests per §9.1 (includes merchant-profile payload extension tests + cross-midnight integration test).

**Gate:** PR-1 review must verify the redemption-guard order + typed-error payload shapes + cross-midnight `"24:00"` sentinel behaviour + merchant-profile payload extension before merge.

### M4b: Customer-app un-stub + Voucher Detail Screens 1a/1b/1c + §AH copy
- `useTimeLimited` real implementation: window-occurrence math + per-minute + per-hour boundary timers + AppState resume + Hermes-robust formatters.
- 12-state machine: extends with the new states per §5.1.
- 3-variant `<TimeLimitedBanner>` wired (or replace with new component if visual treatment requires it).
- `<TimeLimitedDetailsCard>` (new component) renders the §4 TIME_LIMITED-specific block.
- Voucher Detail Screens per §5.2 — countdown system v2 per §5.3, copy locks per §5.4.
- §AH copy reconciliation: seal subtitle "Available again" for TIME_LIMITED (preserve existing for non-TIME_LIMITED).
- Free-user state per §5.4.
- Boundary-race graceful copy per §5.5.
- Frontend tests per §9.2.

**Gate:** PR-2 review must verify (a) state-machine precedence per §5.1, (b) Hermes-robust countdown formatters, (c) test-IDs all present, (d) §AH "Renews on" still works for non-TIME_LIMITED.

### M4c: Merchant Profile voucher-card states
- `<VoucherCard>` pill layer per §6.1 + §6.2.
- Sort order per §6.3.
- Visual states (75% opacity for outside-window, hidden for expired).
- Tests per §9.3.

**Gate:** PR-3 review must verify (a) calmer-than-spec animation discipline, (b) sort order on a multi-state fixture, (c) compact pill copy never includes durations, (d) hidden-by-default for expired.

---

## 11. Deferred-followups to capture (memory updates)

To be appended to `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md` at plan-write time:

- §O1 — flip status to ✅ CLOSED (this M4 spec supersedes the audit-time entry); preserve original framing for historical record.
- §AH — extend with TIME_LIMITED-specific "Available again" rule per §5.4 of this spec.
- §T extension — add Phase 4 anti-abuse policy note: "merchants may overuse TIME_LIMITED; Phase 4 portal may need ratio cap or admin review."
- §G extension — add Phase 6 push-notification "voucher window now open" pointer.
- §Q5 extension — add TWO notes: (a) "TIME_LIMITED redemptions appear as discrete history rows, one per window-occurrence redemption." (b) **Sequencing dependency:** when Phase 4 Merchant Portal voucher CRUD ships expiry editing (allowing non-null `expiryDate` on TIME_LIMITED vouchers), §Q5 (Profile → Redemption History) MUST ship before or in the same release. Without §Q5, the known limitation in §8.1 (expired-while-redeemed code orphaning) starts manifesting in real customer scenarios. Memory entry should cross-reference §R4 (Phase 4) for this dependency.

`MEMORY.md` index entry to update: §O1 transition, plus a new entry pointing at this spec.

---

## 12. Open questions for writing-plans

These are minor follow-ups for the writing-plans phase, not brainstorm gaps:

1. Component naming — is `<TimeLimitedDetailsCard>` the right name or should it be `<AvailabilityCard>` or part of an existing card? Decide at writing-plans time.
2. Schedule formatter — pure-function utility that converts `availabilityWindows[]` → human-readable schedule string ("Mon-Fri, 11am-3pm"). Belongs in `apps/customer-app/src/features/voucher/utils/`. Test contract: 10+ scenarios including cross-midnight merge, split-day, single-day, multi-disjoint-ranges.
3. Backend `londonClock.ts` extraction — does the existing customer-app helper get duplicated or extracted into a shared package? Likely the latter; decide at writing-plans time.
4. Decimal handling for any new analytics fields (none in v1, but flag for future Phase 4 portal).
5. Test fixture set — exact set of demo windows (lunch + happy hour + Tuesday wing night + weekend brunch + split-day + cross-midnight) for backend integration tests.

---

## 13. End of spec

This document locks the v1 product model, schema, backend behaviour, customer payload, Voucher Detail UX (including countdown system v2), merchant-profile card treatment, sequencing, and test contract for TIME_LIMITED M4.

**Next step:** hand off to `superpowers:writing-plans` to produce the implementation plan with detailed, ordered tasks per the 3-PR sequence. NO implementation begins before the plan is owner-approved.
