# REUSABLE Voucher — Product Model & Implementation Design (M5 v1)

> **Status:** Spec drafted 2026-05-12 from Tier 3 brainstorm. **AWAITING OWNER REVIEW** before any implementation plan is written.
>
> **Tier:** 3 (product-model workstream — REUSABLE has distinct redemption semantics from TIME_LIMITED and regular cycle vouchers).
>
> **Audience:** future plan-writer + implementing engineer + future Phase 4 merchant-portal designer.
>
> **Cross-ref:** memory `project_deferred_followups_index.md` §T1 (audit-time enumeration, locked 2026-05-08), §AE (M3 presentation-window contract), §Q5 (deferred Profile → Redemption History surface), §O1/§T (TIME_LIMITED design + audit).

---

## 1. Goal

Deliver REUSABLE as a genuine cooldown-based reusable voucher type, distinct from cycle vouchers (one-per-cycle) and TIME_LIMITED (window-bound). Replace today's label-only behaviour where REUSABLE flows through the same one-per-cycle gate as BOGO/DISCOUNT/etc.

**Customer mental model:** *"Redeem this voucher, then it becomes available again after a short time."*

**Merchant intent:** loyalty patterns like "free coffee every visit", "£5 off every Monday", "weekend brunch deal you can come back for" — ongoing engagement, not a once-per-month offer.

---

## 2. Locked product model (Q1)

REUSABLE v1 is a **merchant-configurable cooldown-based voucher**.

| Parameter | Value |
|---|---|
| Rule family (R3 + R4 hybrid) | One redemption per cooldown interval per `(userId, voucherId)` |
| Platform default cooldown | **4 hours** (`DEFAULT_REUSABLE_COOLDOWN_SECONDS = 14400`) |
| Server-enforced minimum floor | **30 minutes** (`MIN_REUSABLE_COOLDOWN_SECONDS = 1800`) |
| Merchant override | `Voucher.cooldownSeconds Int?` — null falls back to default; non-null is clamped to floor at redemption time |
| Practical maximum (display-clean) | 7 days (`dayContext` helper supports up to Sunday-name display) |
| Hard schema upper cap | None (D47) — merchant portal UI will recommend presets |
| Future expansion | Per-window count caps (R5 from §T1 audit) deferred to v2 — see §Z4 |

**Suggested merchant portal presets** (Phase 4): 30 min / 1 h / 2 h / 4 h / 12 h / 24 h / 7 d.

**Customer-facing language rule:** Internal code uses `cooldown` (constants, typed errors, logs). External UI never uses the word — always **"available again"** language. Locked Q8 D42.

---

## 3. Behavioural differences from cycle / TIME_LIMITED (Q2)

| | Cycle vouchers (today) | TIME_LIMITED (M4) | **REUSABLE (v1)** |
|---|---|---|---|
| Gate model | `UserVoucherCycleState.isRedeemedInCurrentCycle` bit | `VoucherRedemption.redeemedAt` within current window-occurrence | `MAX(redeemedAt)` for `(userId, voucherId)` vs `now − effectiveCooldown` |
| Reset trigger | Subscription cycle rollover | Next window-occurrence starts | Time passing — cooldown elapses |
| Cross-cycle behaviour | Resets on cycle anchor | Independent of cycle | **Independent of cycle** (cooldown survives cycle rollover) |
| `UserVoucherCycleState` write? | Yes — flips `isRedeemedInCurrentCycle = true` | No | **No** |
| `lastRedemption` payload meaning | "the redemption in this cycle" | "the redemption in this window" | **"the most recent redemption ever"** (gated by 2h presentation window only) |
| Terminal "redeemed" state | Yes — locked until cycle resets | Yes — locked until next window | **No** — always either Available or in cooldown |
| Race protection | None needed (cycle state is single bit) | `@@unique(userId, voucherId, windowStartsAt)` | **`pg_advisory_xact_lock(hashtext(userId), hashtext(voucherId))`** inside transaction (Q4 D7) |
| Effective rule | One-per-cycle | One-per-window-occurrence | `effectiveCooldown = max(voucher.cooldownSeconds ?? 14400, 1800)` |
| Per-branch scope? | merchant-wide | merchant-wide | **merchant-wide** (D49) — branch-hopping does NOT bypass cooldown |

Subscription guard, voucher-status guard, branch-coherence guard, phone-verified guard, PIN guard, branch-PIN-configured guard — all unchanged. Only the cycle/window check changes for REUSABLE.

---

## 4. Schema (Q3)

### 4.1 New column on `Voucher`

```prisma
model Voucher {
  // … existing fields …
  cooldownSeconds Int?  // REUSABLE only; null = use platform default (4h);
                        // floor 30 min, clamped server-side at redemption time.
}
```

### 4.2 No other model changes

| Model | Change | Reason |
|---|---|---|
| `VoucherRedemption` | None | `redeemedAt` already exists and is load-bearing. `@@index([userId, voucherId])` already supports the "latest redemption" query. `windowStartsAt` stays NULL for REUSABLE (Postgres distinct-NULL semantics preserve the existing `@@unique([userId, voucherId, windowStartsAt])` constraint non-conflicting). |
| `UserVoucherCycleState` | None | REUSABLE never reads or writes this table. |
| Indexes | None v1 (`[userId, voucherId]` already covers the latest-redemption query). | An optimisation `[userId, voucherId, redeemedAt(sort: Desc)]` is deferred to v2 if perf signals it (D6). |

### 4.3 DB CHECK constraints (D3)

Migration adds two constraints (Prisma 7 has no inline `@@check`; goes via raw SQL in the migration file — same pattern as the existing §AG3 `RedemptionScreenshotEvent.platform` check):

```sql
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_cooldownSeconds_min_check"
  CHECK ("cooldownSeconds" IS NULL OR "cooldownSeconds" >= 1800);

ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_cooldownSeconds_reusable_only_check"
  CHECK ("type" = 'REUSABLE' OR "cooldownSeconds" IS NULL);
```

**Plan task must include a verification step that both CHECK constraints exist in the migration SQL AND are covered by service-level + API-validation tests (Q10 D51 Amendment 2).**

### 4.4 Defense-in-depth validation

| Layer | Rule |
|---|---|
| API ingress (Zod) | If `type === 'REUSABLE'`: `cooldownSeconds` is `null OR int >= 1800`. If `type !== 'REUSABLE'`: must be `null`. |
| Service / guard runtime | `effectiveCooldownSeconds(voucher) = max(voucher.cooldownSeconds ?? DEFAULT, MIN)` — clamps even if a bad value somehow slipped past Zod. The non-bypassable safety net. |
| DB CHECK | Above two constraints — final integrity layer. |

### 4.5 New module: `src/api/redemption/reusable.ts`

```ts
export const DEFAULT_REUSABLE_COOLDOWN_SECONDS = 4 * 60 * 60   // 14400 (4h)
export const MIN_REUSABLE_COOLDOWN_SECONDS     = 30 * 60       // 1800  (30min)

export function effectiveCooldownSeconds(voucher: { cooldownSeconds: number | null }): number {
  return Math.max(voucher.cooldownSeconds ?? DEFAULT_REUSABLE_COOLDOWN_SECONDS,
                  MIN_REUSABLE_COOLDOWN_SECONDS)
}

export function computeAvailableAgainAt(
  lastRedeemedAt: Date | null,
  voucher: { cooldownSeconds: number | null },
): Date | null {
  if (!lastRedeemedAt) return null
  return new Date(lastRedeemedAt.getTime() + effectiveCooldownSeconds(voucher) * 1000)
}
```

Mirrors the M4a `getCurrentWindowOccurrence` modular pattern. Backend uses these for the guard + payload. Customer-app **does not import them** — server sends the customer `availableAgainAt` as an ISO string; client renders.

### 4.6 Voucher type immutability (D4)

Voucher type is creation-time locked. Merchant portal in Phase 4 must disallow mid-cycle type mutation on existing vouchers (this is the merchant portal's enforcement layer; no schema or runtime work in v1 — see §Z6).

---

## 5. Redemption guard order (Q4)

### 5.1 Pre-PIN guards (eligibility, fast-fail)

| # | Guard | REUSABLE behaviour |
|---|---|---|
| 1 | Voucher exists + ACTIVE + APPROVED + load `availabilityWindows` | Unchanged. Loads `cooldownSeconds` too. |
| 2 | `voucher.merchant.status === 'ACTIVE'` | Unchanged. |
| 3 | TIME_LIMITED availability-window check | Skipped — branch fires only for TL. |
| 4 | Branch exists | Unchanged. |
| 5 | Branch-merchant coherence | Unchanged. |
| 6 | Subscription guard (ACTIVE/TRIALLING) | Unchanged. REUSABLE still requires active subscription. |
| 7 | Phone-verified guard | Unchanged. |
| **7b** | **(NEW)** Compute `effectiveCooldownMs` at function scope for REUSABLE | Shared by Guard 8a + atomic-claim. |
| 8 | Voucher-type-aware redemption check — **three branches**: | TL → window-occurrence check (unchanged). REUSABLE → cooldown check (NEW). Cycle → `UserVoucherCycleState` (unchanged). |
| 8a | **REUSABLE (NEW)** — fast-fail cooldown check | `latest = findFirst({ userId, voucherId, orderBy: { redeemedAt: 'desc' } })`. If `latest && now < latest.redeemedAt + effectiveCooldownMs` → `throw new AppError('REUSABLE_COOLDOWN_ACTIVE', { availableAgainAt: <ISO> })`. |
| 9 | Branch PIN configured | Unchanged. |
| 10 | Rate-limit on PIN compare (5 fails / 15 min per `(userId, branchId)`) | Unchanged. The cooldown floor (30 min) is already the rate-limit for successful redemptions; no additional successful-redemption rate-limit needed (D10). |
| 11 | PIN compare | Unchanged. |

### 5.2 Atomic claim — post-PIN match, inside `prisma.$transaction`

> **Implementation note (spec amendment 2026-05-12):** the lock-call signature shown below is the design contract. Implementation **MUST verify** the exact runtime signature against Postgres: `pg_advisory_xact_lock` accepts `(bigint)` or `(int, int)`, and `hashtext` returns `int4`. If `hashtext(text)` resolves to `int4` cleanly in our Neon Postgres install, the two-int form below works as written. If the cast is ambiguous in any way, the implementation should adjust to a valid two-int expression (e.g. explicit `::int` casts) while preserving the invariants: lock keyed per `(userId, voucherId)`, transaction-scoped only. The §5.5 real-DB integration test is the proof point for whichever lock expression is chosen.

```ts
await prisma.$transaction(async (tx) => {
  if (voucher.type === 'REUSABLE') {
    // (NEW) Advisory lock — serializes concurrent redemption attempts for
    // this (userId, voucherId). Released on commit/rollback. Two-int form
    // (D7) keeps unrelated (userId, voucherId) pairs parallel.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${data.voucherId}))
    `

    // Authoritative cooldown re-check under the lock.
    const latest = await tx.voucherRedemption.findFirst({
      where:   { userId, voucherId: data.voucherId },
      orderBy: { redeemedAt: 'desc' },
      select:  { redeemedAt: true },
    })
    if (latest && now.getTime() < latest.redeemedAt.getTime() + effectiveCooldownMs) {
      throw new AppError('REUSABLE_COOLDOWN_ACTIVE', {
        availableAgainAt: new Date(latest.redeemedAt.getTime() + effectiveCooldownMs).toISOString(),
      })
    }

    // Insert. windowStartsAt stays null (REUSABLE doesn't use it; Postgres
    // distinct-NULL semantics keep @@unique([userId,voucherId,windowStartsAt])
    // non-conflicting).
    await tx.voucherRedemption.create({ data: {
      userId, voucherId: data.voucherId, branchId: data.branchId,
      redemptionCode, estimatedSaving: voucher.estimatedSaving,
      windowStartsAt: null,
    }})

    // (NEW) Explicitly NO UserVoucherCycleState write — REUSABLE bypasses it.
    return
  }

  if (voucher.type === 'TIME_LIMITED') {
    // … existing TL atomic-claim branch unchanged …
  }

  // … existing cycle-voucher atomic-claim branch unchanged
  //     (UserVoucherCycleState upsert + VoucherRedemption insert) …
})
```

### 5.3 Typed error contract

```ts
class AppError {
  code: 'REUSABLE_COOLDOWN_ACTIVE'
  context: { availableAgainAt: string }   // ISO; = lastRedeemedAt + effectiveCooldownMs
}
```

Customer-app surfaces this in PinEntrySheet as inline copy: `"This voucher is available again in N minutes"` (sentence-form uses "in" / "at"; pill abbreviation uses "From") — see §8 ledger.

### 5.4 Why both a pre-PIN check AND a transactional re-check

The pre-PIN check at Guard 8a is a **UX optimisation** — fast-fails users in cooldown before they enter a PIN. It is **non-authoritative** because a competing transaction could land between Guard 8a and the atomic-claim transaction.

The transactional re-check under the advisory lock is the **authoritative gate**. Both check the same condition; only the second one matters for correctness. The pre-PIN check also closes a (minor) PIN-probing oracle by fast-failing without exposing PIN-compare timing.

### 5.5 Real-DB integration test (Q10 D51 Amendment 1)

The plan **MUST** include an explicit real-DB integration test for the advisory lock — not just mocked Prisma:

- Two concurrent REUSABLE redemption attempts for the same `(userId, voucherId)`.
- One succeeds.
- The other returns `REUSABLE_COOLDOWN_ACTIVE` with `availableAgainAt`.
- This exercises real Postgres `pg_advisory_xact_lock`, not a Prisma mock.

Mocked tests are still useful for branch/error shape, but they cannot prove the lock semantics.

**Test responsibility (spec amendment 2026-05-12):** this integration test is the **canonical proof** that the chosen lock expression actually serialises two concurrent transactions for the same `(userId, voucherId)`. The exact lock call (single-bigint vs two-int form, `hashtext` vs explicit cast, etc.) is an implementation detail — but whichever form ships **must pass this test**. If the test exposes that the originally-specced two-int form is malformed against the live DB, implementation adjusts the lock expression and re-runs the test; the spec design contract (per-`(userId, voucherId)`, transaction-scoped) is what's load-bearing, not the literal SQL signature.

---

## 6. Customer API payload (Q5)

### 6.1 `getCustomerVoucher` — payload deltas for REUSABLE

| Field | Today (cycle / TL) | REUSABLE | Comment |
|---|---|---|---|
| `voucher.type` | unchanged | `'REUSABLE'` | client-side branch discriminator |
| `voucher.effectiveCooldownSeconds` | not present | **(NEW)** number (always set for REUSABLE; null otherwise) | server-computed via `effectiveCooldownSeconds(voucher)` — already clamped to floor. Powers explainer card cadence copy. Raw `voucher.cooldownSeconds` is **never** exposed to the client (D19). |
| `isRedeemedThisCycle` | boolean — load-bearing gate for cycle redeemed UI | **always `false`** for REUSABLE (D13) | REUSABLE has no terminal cycle-redeemed state. Frontend `voucher.type === 'REUSABLE'` branch routes to REUSABLE UI; cycle-state gate is no-op for that branch. |
| `availableAgainAt` | cycle: ISO of next cycle anchor | **ISO of `lastRedeemedAt + effectiveCooldownMs`** OR `null` if `<= now` (no prior redemption OR cooldown elapsed) | Field reused with type-specific semantics (D16). Customer copy is already type-agnostic ("Available again …"). |
| `lastRedemption` | cycle-window-gated block | **2h presentation-window-gated block** (D14) — same shape and gate as M3; gated by `now < redeemedAt + 2h` only (NOT by cooldown) | See §6.3. |

### 6.2 Redemption response (POST `/redemption`) — payload for REUSABLE

Existing shape (M3): `{ code, redeemedAt, branch, presentationExpiresAt, voucher: { …refreshed… } }`. For REUSABLE, no new top-level fields — the refreshed voucher carries the new `availableAgainAt` (≈ `redeemedAt + effectiveCooldownMs`). React Query invalidation in `useRedeem.onSuccess` already picks it up + already invalidates `['merchantProfile']` (PR-B T8h).

### 6.3 Presentation window vs cooldown window — independence lock

**Locked principle:** the 2h presentation window (Show-to-Staff lifecycle, from M3 §AE) and the REUSABLE cooldown window are independent clocks.

| Scenario (last redemption at 12:00, cooldown 4h, presentation 2h) | `availableAgainAt` | `lastRedemption` | UI state |
|---|---|---|---|
| 12:30 (inside both) | `16:00` | present | "Available again in 3h 30m" + persisted RedemptionDetailsCard + Show-to-Staff live |
| 14:30 (presentation expired, cooldown active) | `16:00` | **null** | "Available again in 1h 30m" + NO card |
| 16:30 (both expired) | `null` | null | "Available now" + active Redeem CTA |
| 12:30 with cooldown 30min (state 4) | `12:30 + 0:30 = 13:00` later: by 13:30 cooldown elapsed, presentation still alive | present | "Available now" + persisted card (both affordances live simultaneously) |

**Do not extend the Show-to-Staff / RedemptionDetailsCard lifecycle beyond 2h just because the cooldown is longer.** Do not invent a collapsed RedemptionDetailsCard for state 3 when `lastRedemption` is null.

### 6.4 `getCustomerMerchant` — per-card payload deltas for REUSABLE

```ts
type MerchantVoucher = {
  // … existing fields …
  type: VoucherType
  // M4c added for TIME_LIMITED:
  currentWindow: { startsAt: string; endsAt: string } | null
  nextWindow:    { startsAt: string; endsAt: string } | null
  // M5 ADD for REUSABLE:
  reusableState?: { availableAgainAt: string | null }
  // …
}
```

Omitted for non-REUSABLE — same pattern as `currentWindow` omitted for non-TL.

`isRedeemedThisCycle` is always `false` for REUSABLE rows. PR-B's diagonal "Voucher Redeemed" cancellation overprint does NOT appear for REUSABLE — REUSABLE has no terminal redeemed state (D18).

### 6.5 Subscription gate behaviour

If user's subscription is cancelled / expired:
- Guard 6 (subscription) blocks new redemptions with `SUBSCRIPTION_REQUIRED` (existing).
- `lastRedemption` block from a prior subscribed redemption stays visible during its own 2h presentation window — consistent with cycle vouchers (D45).
- Redeem CTA flips to `Subscribe to Redeem · £6.99/mo` (existing free-user routing). Cooldown countdown is suppressed from hero; cooldown info becomes data-only.

---

## 7. Voucher Detail UI states (Q6)

### 7.1 State matrix

The cross-product of presentation × cooldown × expiry yields 5 effective states:

| | State | Trigger | Hero | Status block | RedemptionDetailsCard | Redeem CTA |
|---|---|---|---|---|---|---|
| **1** | Available now | no recent redemption OR cooldown elapsed AND outside 2h presentation | full presence | "Available now" eyebrow; primary + supporting suppressed | hidden | active |
| **2** | Available again — recently redeemed | inside 2h presentation, inside cooldown | full presence (no dim, no seal — D25) | "Available again" eyebrow / countdown primary / "Available again from 16:00 today" supporting | persisted (M3 lifecycle) | disabled with "Available again in 3h 30m" countdown |
| **3** | Available again — presentation expired, still in cooldown | outside 2h, inside cooldown | full presence | "Available again" / countdown / "Available again from 16:00 today" | **hidden** (no collapsed surface — D26 amendment: don't invent data the payload doesn't carry) | disabled with countdown |
| **4** | Available now — still within presentation window | inside 2h presentation, cooldown elapsed | full presence | "Available now" eyebrow; primary + supporting suppressed | **persisted** (M3 lifecycle continues for the OLD code until 2h passes) | **active** (NEW redemption available) |
| **5** | Expired | `voucher.expiryDate < now` | dimmed (existing expired pattern) | "Offer ended" / disabled | hidden after presentation; persisted during presentation | disabled "Offer ended" |

**State 4 is the genuine REUSABLE distinguisher** — cooldown elapsed but presentation window still active means active Redeem CTA + latest RedemptionDetailsCard visible simultaneously. New code = new redemption row; old code stays valid for staff verification during its own 2h window. Two affordances on the screen.

### 7.2 Older overlapping codes (≤30min-floor cooldown)

If cooldown = 30 min (floor) and presentation = 2h, user can accumulate up to 4 overlapping live redemptions. `<RedemptionDetailsCard>` on Voucher Detail shows only the **latest** redemption (the M3 single-card pattern). Older still-live codes accessible only via Profile → Redemption History (deferred §Z5).

### 7.3 Component deltas

| Component | TL/cycle today | REUSABLE delta |
|---|---|---|
| `<HeroStatusBlock>` | TL window states + locked PR #70 wording | Adds `'reusable-available'` + `'reusable-cooldown'` to `windowState`. Hero progress bar **suppressed** for REUSABLE (no meaningful denominator). Eyebrow / primary / supporting per state matrix above. |
| Hero overprint (`<RedeemedSeal>`) | Cycle: full stamp + dim. TL: not used. | **Not used for REUSABLE** (D25). |
| `<CycleRulesCard>` | Cycle: "Refresh on <date>". TL: hidden. | **Replaced** by `<ReusableRulesCard>` for REUSABLE. |
| Guidance card (PR #70 TL "Redeem before the window ends") | TL only | New `<ReusableGuidanceCard>` for REUSABLE — same surface treatment (pale amber inner card, 1px hairline border, brand-rose 16pt Info glyph). |
| `<HowItWorks>` | 5 steps. TL inserts "Check the Window" at index 1. | REUSABLE inserts "Use it again" at index 1. |
| `<RedemptionDetailsCard>` | M3 2h presentation-window-gated. §AE5 inner notice after window. | **Unchanged for REUSABLE** — same M3 contract. Renders when `lastRedemption` is populated; absent when null. State 4 shows it alongside an ACTIVE Redeem CTA. |
| Sticky bottom Redeem CTA | Existing routing | Active in states 1 + 4. Disabled-with-countdown in 2 + 3. Existing free-user / expired routing unchanged. |

### 7.4 Q9 D44 — Expiry-before-available-again

If `expiryDate` exists AND `availableAgainAt > expiryDate`:

- **Suppress** the standard "Available again in 3h 30m" countdown.
- **Show** supporting copy: `"Offer ends before it becomes available again"`.
- Can be rendered in the hero status block supporting line, or as a small note where the available-again line would have appeared.
- Full hero "Final redemption" treatment remains deferred to §Z1.
- The plan **MUST** include test coverage for:
  - last redeemed + cooldown active state, AND
  - `availableAgainAt > expiryDate` case, AND
  - UI does NOT show "Available again in …" countdown, AND
  - UI DOES show the expiry-before-available-again message.

**Payload ownership (spec amendment 2026-05-12):** the comparison `availableAgainAt > expiryDate` is **frontend-computed at render time** from the two payload fields already on `getCustomerVoucher`: `voucher.expiryDate` (existing) and the REUSABLE-specific `availableAgainAt` (added per §6.1). **No new backend metadata is required in v1.** The typed error `REUSABLE_COOLDOWN_ACTIVE { availableAgainAt }` (§5.3) stays unchanged — it carries only the available-again instant, not any expiry-relationship flag. If implementation discovers a gap (e.g. server needs to denormalise the comparison for performance or consistency reasons), surface it as a spec amendment at plan-review time; do not invent backend fields silently.

---

## 8. Merchant Profile cards (Q7)

### 8.1 State pill — copy + treatment

Pattern: `<STATE> · <detail>` (matches locked M4c TL pill). State 1 standalone (no `· detail` because there's no natural window-end).

| State | Trigger | Pill copy | Pulse-dot | Card opacity |
|---|---|---|---|---|
| Reusable-available | `reusableState.availableAgainAt === null` OR `<= now` | `AVAILABLE NOW` (standalone) | green `#34D399` (same as TL active) | 100% |
| Reusable-cooldown (≤60 min) | `(availableAgainAt − now) <= 60min` | `AVAILABLE AGAIN · 23m left` (countdown via `formatDurationCompact`) | none | 75% |
| Reusable-cooldown (>60 min) | `(availableAgainAt − now) > 60min` | `AVAILABLE AGAIN · From 4pm today` / `From 11am tomorrow` / `From 12pm WEDNESDAY` (using `formatClockHour12` + `dayContext`) | none | 75% |
| Expired | `voucher.expiryDate < now` | existing expired treatment | none | existing |

No coral / amber urgency band for REUSABLE — nothing bad happens at cooldown expiry (D31).

No cadence sub-headline ("Every 4 hours") on the merchant card in v1 (D34). Cadence visibility lives on Voucher Detail.

No rubber-stamp overprint at any state (D35).

### 8.2 testIDs

| State | testID |
|---|---|
| Reusable-available | `merchant-card-pill-reusable-available` |
| Reusable-cooldown (any sub-threshold) | `merchant-card-pill-reusable-cooldown` |

One testID covers both cooldown sub-thresholds — copy threshold (≤60min vs >60min) is asserted via text, not separate testID. Mirrors TL's `unavailable-today` / `unavailable-future-day` pattern (D32).

### 8.3 Sort buckets on the Vouchers tab (D33)

| Bucket | TL voucher state | REUSABLE state | Cycle voucher state |
|---|---|---|---|
| 1. Actionable now | active + urgent (in current window) | reusable-available | not-yet-redeemed-this-cycle |
| 2. Soon / blocked | unavailable-today | reusable-cooldown | redeemed-this-cycle |
| 3. Future | unavailable-future-day | — | — |
| 4. Terminal | expired | expired | expired |

Within Bucket 2, sort by **nearest available time** where possible:
- TL → `nextWindow.startsAt`
- REUSABLE → `reusableState.availableAgainAt`

### 8.4 Free-user / subscription gate

Free user sees same REUSABLE pill state. Tapping the card → Voucher Detail → subscribe prompt (existing free-user routing). Sub gate is at the Redeem CTA, not the card-render layer.

---

## 9. Customer-facing copy ledger (Q8)

All REUSABLE customer-facing strings in one place. Internal `cooldown` term confined to code paths and typed errors. External UI uses "available again" exclusively. Word **"wait"** minimised in customer copy — prefer "time" / "timing" / "from".

| Surface | Location | Copy |
|---|---|---|
| VoucherType chip label | voucher cards + detail header | `Reusable` (unchanged) |
| VoucherType explainer card title | Voucher Detail explainer | `What is a reusable voucher?` (unchanged) |
| VoucherType explainer card body | Voucher Detail explainer | *"An ongoing offer that becomes available again after each redemption. The exact timing depends on the offer, usually a few hours."* (D36 — atomic flip with backend; do NOT use "wait") |
| HeroStatusBlock — reusable-available eyebrow | Voucher Detail | `Available now` (primary + supporting suppressed) |
| HeroStatusBlock — reusable-cooldown eyebrow | Voucher Detail | `Available again` (eyebrow); primary = countdown via `formatDuration`; supporting = `Available again from <HH:MMam/pm> today` / `tomorrow` / `<Weekday>` via `formatSupportingClock` |
| A11y live-region — cooldown <1m | Voucher Detail | `Available again in under a minute` (existing `formatAvailableAgainA11y`) |
| A11y live-region — cooldown <1h ≥1m | Voucher Detail | `Available again in about <N> minutes` (existing) |
| A11y live-region — cooldown ≥1h | Voucher Detail | eyebrow-as-label: `Available again` (no "Voucher " prefix) (D38) |
| `<ReusableRulesCard>` title | Voucher Detail | `Reusable voucher` (D37) |
| `<ReusableRulesCard>` body | Voucher Detail | *"Available again every \<duration\>. Your subscription must stay active to redeem."* (duration via NEW helper `formatCooldownDurationHuman(effectiveCooldownSeconds)` → "4 hours" / "30 minutes" / "1 day" / "7 days" — NOT the existing countdown-shaped `formatDuration`. New helper lives at `apps/customer-app/src/features/voucher/utils/cooldownFormat.ts` alongside related REUSABLE formatters.) |
| `<ReusableGuidanceCard>` title | Voucher Detail | `Your code stays available` |
| `<ReusableGuidanceCard>` body | Voucher Detail | *"After you redeem, your code stays available to show staff for up to 2 hours. This voucher becomes available again after the time shown above."* |
| HowItWorks REUSABLE step — title | Voucher Detail | `Use it again` |
| HowItWorks REUSABLE step — body | Voucher Detail | *"After you redeem this voucher, it becomes available again after a short time. The exact timing depends on the offer."* |
| Disabled Redeem CTA (states 2 + 3) | Voucher Detail bottom CTA | `Available again in 3h 30m` (relative countdown via `formatDuration` — sticky CTA uses relative form consistently) (D39) |
| Expiry-before-cooldown supporting line | Voucher Detail | `Offer ends before it becomes available again` (D44) |
| Merchant card pill — reusable-available | Merchant Profile | `AVAILABLE NOW` |
| Merchant card pill — reusable-cooldown ≤60 min | Merchant Profile | `AVAILABLE AGAIN · 23m left` |
| Merchant card pill — reusable-cooldown >60 min | Merchant Profile | `AVAILABLE AGAIN · From 4pm today` / `From 11am tomorrow` / `From 12pm WEDNESDAY` |
| `REUSABLE_COOLDOWN_ACTIVE` PIN sheet inline error | PinEntrySheet | `This voucher is available again in N minutes` / `This voucher is available again at 5pm today` (D41) — sentence form uses "at"; pill abbreviation uses "From" (intentional surface asymmetry) |
| Free-user subscribe CTA | Voucher Detail bottom | `Subscribe to Redeem · £6.99/mo` (unchanged) |

### Banned phrases — confirmed absent from all customer-facing strings

`cooldown` (UI), `wait period`, `unlimited`, `exploit`, `loophole`, `hack`, `frequency limit`, `rate-limited`, `throttle`, `reset` (cycle-implied), em dash in customer copy, Groupon-y theatre, US idioms. The word **"wait"** is minimised — one acceptable use as "short time" instead.

### Atomic-deploy lock

`voucherTypeExplainer('REUSABLE')` body update + service guard + customer payload + frontend rendering all land in the **same PR** (Q10 D50). Otherwise the explainer would briefly say "redeem once per cycle, returns next cycle" while backend allows reuse.

---

## 10. Edge cases (Q9)

### 10.1 Time boundaries

| Case | Resolution |
|---|---|
| Cooldown crosses midnight (London) | Handled — `dayContext` yields "today/tomorrow/`<Weekday>`" from London-local day. |
| Cooldown crosses subscription cycle anchor | No-op — cooldown timestamp-based, independent of cycle. |
| Cooldown longer than 24 h (up to 7d preset) | Display via `dayContext` weekday name. |
| Cooldown shorter than 1 min | Impossible — floor 30 min. |
| Server vs device clock drift | Server-authoritative; pre-PIN re-validates; PIN sheet renders fresh `availableAgainAt`. |

### 10.2 Expiry interaction

| Case | Resolution |
|---|---|
| Cooldown extends past `voucher.expiryDate` | **D44**: suppress false countdown; show "Offer ends before it becomes available again". §Z1 deferred for full "Final redemption" hero treatment. |
| Expiry passes mid-presentation-window | Backend still returns the voucher (so Show-to-Staff renders persisted code); voucher Detail renders state 5 hero + persisted RedemptionDetailsCard. After 2h, voucher disappears from customer surfaces. |
| Voucher type mutation mid-cycle | Disallowed at merchant portal layer (D4). §Z6 enforcement. |

### 10.3 Branch switching

| Case | Resolution |
|---|---|
| Branch hop during cooldown | Cooldown keyed on `(userId, voucherId)` — merchant-wide, NOT per-branch (D49). |
| In-flight redemption + branch switch | Advisory lock covers this — second attempt fails with `REUSABLE_COOLDOWN_ACTIVE`. |
| Branch attribution per redemption | Each `VoucherRedemption.branchId` independent — appears as distinct history rows. |

### 10.4 Subscription gate

| Case | Resolution |
|---|---|
| Sub cancelled mid-cooldown | **D45**: subscribe CTA preempts cooldown UI; cooldown countdown suppressed from hero; cooldown info data-only. 2h Show-to-Staff persisted card still renders. |
| Sub cancelled then reactivated | No special handling — cooldown timestamp-based, user resumes wherever timestamps put them. |
| Sub PAST_DUE during cooldown | Same as cancelled — Guard 6 blocks; CTA → "Resubscribe". |
| Persisted code visibility during sub cancellation | M3 contract: 2h presentation window is sub-independent. |

### 10.5 Race conditions / PIN flow

| Case | Resolution |
|---|---|
| Two simultaneous PIN attempts on same `(userId, voucherId)` | Advisory lock — first commits, second fails with `REUSABLE_COOLDOWN_ACTIVE` (real-DB test required — §5.5). |
| PIN attempt with stale `availableAgainAt` | Pre-PIN check fast-fails. PIN sheet renders fresh `availableAgainAt`. |
| App backgrounded mid-cooldown | Cooldown timestamp-based; re-foreground refetches; React Query yields current state. |
| Network slow during redeem | Guard 8a fast-fails; PIN compare + atomic-claim proceed as today otherwise. |

### 10.6 Cross-feature interactions

| Case | Resolution |
|---|---|
| Favourites | No interaction — favourites independent of state. |
| Search/discovery feed cards | Same pill state machine + sort buckets as merchant profile (§8). |
| Savings calc | **D46**: every REUSABLE redemption counts as independent value-extraction event. |
| Profile → Redemption History | Deferred §Z5 — v1 backend produces necessary data per `VoucherRedemption` row. |
| Staff validation of overlapping codes | Each redemption has its own `redemptionCode` + `isValidated`. Staff validates the code presented; others unaffected. |
| Push "Available again" notification | **D48**: deferred to v2 (§Z2). |

---

## 11. Implementation sequencing (Q10)

### 11.1 PR shape — single atomic Tier 3 PR (D50)

Schema migration + service guard + customer payload + frontend UI + copy + explainer + tests all ship in ONE PR. Eliminates the explainer-copy atomicity hazard from Q8 § "atomic-deploy lock". Matches the M3 PR #49 / PR-B PR #60 precedent for large coherent PRs.

### 11.2 Plan task shape (D51) — ~12-13 tasks, one coherent PR carrying ~13-18 commits

| Task | Scope |
|---|---|
| 1 | Schema migration + CHECK constraints (§4.1, §4.3). Migration file. Smoke test that migrations apply cleanly. **Verification step that both CHECK constraints exist in migration SQL and are covered by service/API-validation tests (D51 Amendment 2).** |
| 2 | `src/api/redemption/reusable.ts` constants + helpers (§4.5). Unit tests. |
| 3 | Service guard pre-PIN Guard 8a REUSABLE branch (§5.1). Backend tests for cooldown active / expired / no prior redemption. |
| 4 | Service atomic-claim — advisory lock + transactional re-check (§5.2). **Real-DB integration test for advisory-lock race protection (D51 Amendment 1)** — two concurrent attempts, one succeeds, the other gets `REUSABLE_COOLDOWN_ACTIVE`. |
| 5 | Customer payload — `getCustomerVoucher` REUSABLE deltas (§6.1). Including Q9 D44 expiry-before-available-again metadata if surfaced server-side, or computed client-side from raw fields. Payload schema tests. |
| 6 | Customer payload — `getCustomerMerchant` per-card `reusableState` (§6.4). |
| 7 | Voucher API client + Zod schemas (frontend) — `effectiveCooldownSeconds`, `reusableState`, `availableAgainAt` REUSABLE semantics. |
| 8 | `<HeroStatusBlock>` REUSABLE states (§7.3). Eyebrow / primary / supporting / a11y / progress bar suppression. Tests. |
| 9 | `<ReusableRulesCard>` + `<ReusableGuidanceCard>` new components (§7.3, §9 copy ledger) + new helper `formatCooldownDurationHuman` at `apps/customer-app/src/features/voucher/utils/cooldownFormat.ts` (human-readable "4 hours" / "30 minutes" / "1 day" / "7 days" — distinct from countdown `formatDuration`). Unit tests for the helper + component tests. |
| 10 | `<VoucherDetailScreen>` state matrix routing (§7.1). All 5 states + Q9 D44 expiry branch + state 4 coexistence pin. HowItWorks new step. Hero seal suppression. End-to-end state matrix tests. |
| 11 | Merchant card pill REUSABLE states (§8). Pill copy + green pulse-dot + opacity 75% + testIDs. Sort bucket integration (D33). |
| 12 | Copy carry-over (§9 ledger). VoucherTypeExplainer REUSABLE body rewrite. HowItWorks step. PIN sheet `REUSABLE_COOLDOWN_ACTIVE` inline error rendering. Full string sweep. |
| 13 | Cross-cutting tests + spec self-review. State matrix coverage, edge cases (§10), tsc clean, jest full sweep, backend vitest full sweep. |

Each task = one commit (or 2-3 for the larger ones). All tasks ship in ONE PR.

### 11.3 Owner gates (D52)

| Gate | Purpose |
|---|---|
| Spec review (now → after this doc is committed; before any plan work) | Catches design issues before they propagate to plan + code |
| Plan review (after writing-plans skill produces the plan doc; before implementation) | Catches task-shape issues before code |
| Mid-PR device QA (after Voucher Detail state matrix + merchant card pill land in worktree) | Validates customer experience on physical device |
| Pre-merge PR review (live `gh api compare` scope check) | Existing project pattern; SHA-bound merge |

### 11.4 No `writing-plans` auto-invocation (D54)

After this spec is committed, **do NOT auto-invoke writing-plans**. Owner reviews the spec file first, then explicitly approves the plan workstream.

---

## 12. Deferred follow-ups (D55)

| Code | Item | Tier | When |
|---|---|---|---|
| **§Z1** | Q9 D44 — Full "Final redemption" hero treatment when cooldown extends past expiry (v1 ships the simple supporting-copy form per §7.4) | Tier 1 polish | Future device QA / polish pass if real merchant configs surface this case meaningfully |
| **§Z2** | Q9 D48 — Push "Available again" notification on cooldown clear | Tier 2 | After Phase 6 FCM wiring lands |
| **§Z3** | Q9 D47 — Date-form rendering in `dayContext` for cooldowns >7 days | Tier 1 polish | Only if merchant config demand surfaces |
| **§Z4** | §T1 R5 expansion — `maxRedemptionsPerWindow` + `windowSeconds` count-cap rules | Tier 3 | v2 — re-brainstorm when merchant demand for count caps materialises |
| **§Z5** | Q6 D26 — Older still-live REUSABLE codes accessible via Profile → Redemption History | Tier 2 | When the deferred §Q5 Profile → Redemption History surface ships |
| **§Z6** | Phase 4 — Disallow voucher type mutation in merchant portal (Q3 D4 enforcement layer) | Tier 2 | With Phase 4 merchant portal |
| **§Z7** | Phase 4 — Merchant analytics distinguishing unique-customer-count vs redemption-event-count for REUSABLE | Tier 2 | With Phase 4 merchant analytics |
| **§Z8** | §T1 carry-forward — Audit-time risks (merchant cost runaway, branch-hopping, savings double-count) all addressed in v1 — mark §T1 CLOSED post-v1 ship | bookkeeping | After v1 merges |

---

## 13. Locked decisions (D1–D55)

| Q | D | Decision |
|---|---|---|
| Q1 | — | R3 + R4 hybrid: cooldownSeconds merchant-configurable, default 4h, floor 30min, no R5 in v1 |
| Q2 | — | Race-protection: Postgres advisory lock per (userId, voucherId), two-int form |
| Q2 | — | REUSABLE skips `UserVoucherCycleState` entirely |
| Q3 | D1 | Add `cooldownSeconds Int?` to Voucher |
| Q3 | D2 | Floor enforced at API ingress AND in redemption guard |
| Q3 | D3 | DB CHECK constraints: `IS NULL OR >= 1800` AND `type='REUSABLE' OR IS NULL` |
| Q3 | D4 | Voucher type creation-time locked (Phase 4 merchant-portal enforces; §Z6) |
| Q3 | D5 | Constants module: `src/api/redemption/reusable.ts` |
| Q3 | D6 | Defer `[userId, voucherId, redeemedAt desc]` index to v2 |
| Q4 | D7 | Two-int advisory lock form `pg_advisory_xact_lock(hashtext(userId), hashtext(voucherId))` |
| Q4 | D8 | Keep pre-PIN fast-fail at Guard 8a + authoritative transactional re-check |
| Q4 | D9 | Error: `REUSABLE_COOLDOWN_ACTIVE` payload `{ availableAgainAt: <ISO> }` |
| Q4 | D10 | No additional successful-redemption rate-limit on top of cooldown |
| Q4 | D11 | Insert `windowStartsAt: null` for REUSABLE (relies on Postgres unique-NULL distinct) |
| Q4 | D12 | Hoist `effectiveCooldownMs` to function scope, shared by Guard 8a + atomic-claim |
| Q5 | D13 | `isRedeemedThisCycle` always `false` for REUSABLE |
| Q5 | D14 | `lastRedemption` gated by 2h presentation window only, independent of cooldown |
| Q5 | D15 | Expose `effectiveCooldownSeconds` on customer voucher payload |
| Q5 | D16 | Reuse `availableAgainAt` for REUSABLE (no `reusableAvailableAt`) |
| Q5 | D17 | Add `reusableState: { availableAgainAt }` to MerchantVoucher cards |
| Q5 | D18 | No redeemed-overprint on REUSABLE merchant cards |
| Q5 | D19 | Don't expose raw `voucher.cooldownSeconds` to customer-app |
| Q6 | D20 | Lock 5-state matrix including state 4 (Available now + persisted card coexistence) |
| Q6 | D21 | `HeroStatusBlock` adds `reusable-available` + `reusable-cooldown`. Hero progress bar suppressed for REUSABLE. |
| Q6 | D22 | HowItWorks step: title "Use it again", body "After you redeem this voucher, it becomes available again after a short time. The exact timing depends on the offer." |
| Q6 | D23 | `<ReusableRulesCard>` replaces `<CycleRulesCard>` for REUSABLE |
| Q6 | D24 | `<ReusableGuidanceCard>` between USAGE RULE and ABOUT THIS OFFER |
| Q6 | D25 | No dim, no `<RedeemedSeal>`, no rubber-stamp hero overprint for REUSABLE |
| Q6 | D26 | Voucher Detail surfaces only the latest redemption; state 3 has no collapsed details card if payload is null |
| Q6 | D27 | `<ReusableRulesCard>` and `<ReusableGuidanceCard>` as two separate components |
| Q7 | D28 | State 1 pill: `AVAILABLE NOW` standalone, green pulse-dot, 100% opacity |
| Q7 | D29 | State 2 pill copy: `AVAILABLE AGAIN · 23m left` (≤60min) / `AVAILABLE AGAIN · From <time> today/tomorrow/<Day>` (>60min) |
| Q7 | D30 | State 2 card opacity 75% |
| Q7 | D31 | No pulse-dot in state 2; no urgency colour for REUSABLE ever |
| Q7 | D32 | testIDs: `merchant-card-pill-reusable-available` + `merchant-card-pill-reusable-cooldown` |
| Q7 | D33 | Sort buckets: REUSABLE-available joins TL-active in Bucket 1; REUSABLE-cooldown joins TL-unavailable-today in Bucket 2. Intra-Bucket-2 sort by nearest available time. |
| Q7 | D34 | No "Every 4 hours" sub-headline on merchant cards in v1 |
| Q7 | D35 | No rubber-stamp overprint at any REUSABLE state |
| Q8 | D36 | VoucherTypeExplainer REUSABLE body: "An ongoing offer that becomes available again after each redemption. The exact timing depends on the offer, usually a few hours." |
| Q8 | D37 | `<ReusableRulesCard>` title: `Reusable voucher` |
| Q8 | D38 | A11y eyebrow-as-label ≥1h: `Available again` verbatim, no "Voucher " prefix |
| Q8 | D39 | Disabled CTA copy: `Available again in 3h 30m` (relative countdown, consistent) |
| Q8 | D40 | Success popup unchanged for REUSABLE |
| Q8 | D41 | `REUSABLE_COOLDOWN_ACTIVE` PIN sheet error: "This voucher is available again in N minutes" / "This voucher is available again at 5pm today" |
| Q8 | D42 | Drop "cooldown" from all customer-facing copy; internal-only |
| Q8 | D43 | Minimise "wait" in customer copy; prefer "time" / "timing" / "from" |
| Q9 | D44 | Cooldown-past-expiry: suppress false countdown, show "Offer ends before it becomes available again" supporting copy; full hero treatment deferred §Z1 |
| Q9 | D45 | Sub cancelled mid-cooldown: subscribe CTA preempts cooldown UI; cooldown info data-only; 2h presentation card still renders |
| Q9 | D46 | Every REUSABLE redemption counts toward savings |
| Q9 | D47 | No hard upper cap on cooldownSeconds in schema; practical 7d display ceiling |
| Q9 | D48 | Push "Available again" notifications deferred to v2 (§Z2) |
| Q9 | D49 | Cooldown keyed on (userId, voucherId) — merchant-wide |
| Q10 | D50 | Single atomic Tier 3 PR |
| Q10 | D51 | ~12-13 plan tasks, one PR with ~13-18 commits. Amendment 1: real-DB advisory-lock race test. Amendment 2: migration CHECK-constraint validation tests. |
| Q10 | D52 | Owner gates: spec review → plan review → mid-PR device QA → pre-merge scope check |
| Q10 | D53 | Spec at `docs/superpowers/specs/2026-05-12-reusable-voucher-design.md` |
| Q10 | D54 | After spec lock, do NOT auto-invoke writing-plans; pause for owner review |
| Q10 | D55 | Include §Z1–§Z8 deferred follow-ups in spec |

---

## 14. Out of scope (v1)

- Per-window count caps (R5) — §Z4
- Push notifications when cooldown clears — §Z2
- Date-form rendering in `dayContext` for >7d cooldowns — §Z3
- Profile → Redemption History surface for older live codes — §Z5
- Merchant portal voucher-type-immutability enforcement — §Z6
- Merchant analytics distinguishing unique-customer vs redemption-event counts — §Z7
- "Final redemption" hero treatment when cooldown extends past expiry — §Z1
- Merchant-side Phase 4 work (voucher portal UI for cooldown configuration with preset chooser)

---

## 15. Cross-references

- Memory `project_deferred_followups_index.md` §T1 — audit-time enumeration (locked 2026-05-08), now mostly closed by this v1
- Memory `project_deferred_followups_index.md` §AE — M3 presentation-window contract (load-bearing for §6.3 independence rule)
- Memory `project_deferred_followups_index.md` §Q5 — deferred Profile → Redemption History (§Z5 dependency)
- Memory `project_deferred_followups_index.md` §AG3 — Postgres CHECK constraint precedent (`RedemptionScreenshotEvent.platform`)
- Existing spec `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md` — Voucher Detail base surface
- Existing plan `docs/superpowers/plans/2026-05-10-voucher-detail-m4-time-limited.md` §2885 — Phase 4 / M5 forward-compat note for `VoucherAvailabilityWindow.maxRedemptionsPerWindow` (R5 expansion path; §Z4)
- Existing copy `apps/customer-app/src/features/voucher/constants/productCopy.ts:162-168` — current REUSABLE explainer body (atomic flip target in v1 PR)

---

**End of spec.** Owner: please review and either approve to proceed to writing-plans, or request amendments inline.
