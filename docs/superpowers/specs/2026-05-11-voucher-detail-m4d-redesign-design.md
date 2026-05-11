# Voucher Detail — M4d TIME_LIMITED Redesign — Design Spec (Amendment)

**Tier:** 2 (surface rebaseline; plan-first per `feedback_workflow_tier_calibration.md`)
**Status:** **Locked** — D1–D10 + §11 owner-locked 2026-05-11; ready for `superpowers:writing-plans`
**Date:** 2026-05-11
**Spec author:** Claude (Opus 4.7)
**Predecessors:**
- `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md` (M1/M2/M3 voucher detail)
- `docs/superpowers/specs/2026-05-10-voucher-detail-m4-time-limited-design.md` (M4 TIME_LIMITED spec — backend payload + customer-app un-stub)

**Implementation track:** customer-app only. No backend changes. No schema changes. Owner-locked at 2026-05-11 ("not changing Prisma in M4d").

---

## 0. Why this amendment

M4b shipped the M4 spec literally: `<FrostedCountdown>` + `<TimeLimitedBanner>` + `<TimeLimitedDetailsCard>` mounted between the coupon body and the redeem CTA. On-device QA after PR #65 surfaced that the TIME_LIMITED live status reads as **secondary information attached below the voucher**, when the product principle "voucher is the screen" demands it be **part of the voucher identity** — visible the instant the screen loads, anchored in the hero.

M4c shipped the merchant-profile pill states cleanly. M4d is the matching Voucher Detail redesign: status countdown moves to the hero, the M4b stop-gap components dissolve, the coupon body absorbs the schedule + usage rule + description into a single details hierarchy, and the TIME_LIMITED explainer copy is rewritten to Redeemo's voice (UK 25–45, mobile-first, in-transit / in-store, no Groupon-y theatre).

§AM1 fixture brittleness is bundled as Phase 0 because the existing TL state tests will be the regression net for the M4d redesign; they MUST be deterministic before new tests are added.

---

## 1. Goals

Owner-stated, locked:

1. **§AM1 fixture hardening.** Harden the 2 brittle Voucher Detail state tests with `jest.setSystemTime` BEFORE adding new tests.
2. **Hero countdown.** Redesign Voucher Detail so TIME_LIMITED live status / countdown is prominent in the hero.
3. **Contextual copy.** AM/PM, today / tomorrow / full weekday / date wording, seconds where appropriate.
4. **Progress bar.** Add progress / loading bar for active or upcoming windows.
5. **Merchant banner.** Include merchant banner image if available.
6. **Coupon-body consolidation.** Move TIME_LIMITED details, availability, usage rule, and description into the coupon details area with better hierarchy.
7. **Explainer rewrite.** Rewrite TIME_LIMITED explainer copy using Redeemo audience profile.
8. **HowItWorks +1 step.** Add one TIME_LIMITED-specific HowItWorks step.
9. **Preserve M3/M4 contracts.** Redemption flow, screen capture protection, redeemed state, expired precedence, flat `error.nextWindowAt`, M4c merchant-card behaviour.

---

## 2. Locked contracts (in-scope; MUST NOT regress)

| Contract | Source |
|---|---|
| `useScreenCaptureProtection(codeVisibleOnVoucherDetail)` mounts when redemption code surface visible (Android FLAG_SECURE + iOS recording blur) | §AE6 PR #49 |
| `useScreenshotGuard(codeVisibleOnVoucherDetail)` iOS post-fact detection + auto-dismiss banner | §AE6.2 PR #49 |
| `useBrightnessBoost`, `useAutoHideTimer`, `useRedemptionPolling` on ShowToStaff entry path | M3 |
| `<RedemptionDetailsCard>` mount gate = `stateKey === 'redeemed-this-cycle' \|\| 'redeemed-this-window'`, NOT `lastRedemption` data presence | §Q6 |
| §AE5 inner notice card replaces redemption code box after presentation window closes | M3 PR #49 |
| 2-hour `PRESENTATION_WINDOW_MS` constant unchanged | M3 |
| Expired-precedence: expired wins over redeemed and over time-limited variants (locked as M2 D4 — not to be confused with M4d D4 progress bar) | M2 |
| `PinEntrySheet` handles `VOUCHER_OUTSIDE_AVAILABILITY_WINDOW` + `ALREADY_REDEEMED_THIS_WINDOW` (FLAT `error.nextWindowAt`) | M4a/b |
| M4c merchant-profile pill behaviour (60min URGENT threshold, sort buckets, stale-payload guard) | M4c |
| Hero seal `RedeemedSeal` absolute overlay at `top = insets.top + 96`, `pointerEvents='none'` | M3 wave 8 |
| `showRedeemedSeal` vs `blockShowToStaffMount` boolean split | M3 wave 8 |
| URL-driven back nav (`from`, `returnMerchantId`, `branch`, `tab`) | M1 |
| `<CycleRulesCard>` early-returns on `availableAgainAt === null` (non-TL cycle copy) | §AH |
| `<RedeemedSeal>` subtitle: TIME_LIMITED → "Available again in Xh Ym" from `nextWindow.startsAt`; non-TL → "Renews on `<date>`" from `availableAgainAt` | §AH, M4b-12 |
| Hermes-robust formatters only — no `weekday: 'long'/'short'`, no `toLocaleTimeString` | reference §London-clock-helper |

---

## 3. Out of scope

- Backend changes (no Prisma, no payload changes, no new error codes).
- M3 redemption flow / Show-to-Staff / screen capture protection / redemption details card — UNCHANGED.
- Non-TIME_LIMITED voucher types — visual / structural UNCHANGED in M4d (D6 locked as TL-only; see D6 + §15 F1 for the universal description follow-up).
- Redeemed-state visual redesign (washed-out coupon, full SVG stamp) — remains §Q1 deferred.
- TIME_LIMITED merchant-side authoring UI (Phase 4 Merchant Portal).
- Backend `presentationExpiresAt` mirror — remains §AF deferred.

---

## 4. Current state (baseline)

Mount order on Voucher Detail for TIME_LIMITED subscribed non-redeemed:

```
<CouponHeader>             ← title + description + saving badge + nav row + seal slot
<PerforationLine outer>
<CouponTopCard>            ← banner image (180pt) OR 6pt type-accent line, + pills row
<PerforationLine inner>
<CouponBodyCard>           ← Terms + Fair Use
<FrostedCountdown>         ← M4b-7 — frosted band, primary countdown text
<TimeLimitedBanner>        ← M4b-5 — active / urgent / unavailable variant
<TimeLimitedDetailsCard>   ← M4b-6 — schedule + window times + usage rule + final expiry
<MerchantRow>
<VoucherTypeExplainerCard>
<HowItWorks>
```

For redeemed-this-window state, `<TimeLimitedDetailsCard>` mounts higher (after `<ReviewPromptCard>`), and FrostedCountdown / TimeLimitedBanner are suppressed.

---

## 5. Target state (M4d)

Proposed mount order for TIME_LIMITED subscribed non-redeemed:

```
<CouponHeader>             ← title + saving badge + nav row + seal slot
                              + NEW <HeroStatusBlock> (embedded inside hero, below title)
<PerforationLine outer>
<CouponTopCard>            ← merchant banner image (bumped 180→240pt when present)
                              OR 6pt type-accent line (when absent — unchanged)
                              + pills row (unchanged)
<PerforationLine inner>
<CouponBodyCard>           ← NEW section order:
                              1. Availability (TL only — schedule + current/next window times)
                              2. Usage rule (always; TL-specific copy)
                              3. Description (merchant-authored; MOVED from hero — see D6)
                              4. Terms & Conditions (unchanged)
                              5. Fair Use Policy (unchanged)
                              6. Offer ends (TL with expiryDate only)
<MerchantRow>              ← unchanged
<VoucherTypeExplainerCard> ← NEW body copy (D8)
<HowItWorks>               ← NEW step inserted for TL users (D9)
```

Components deleted: `<FrostedCountdown>`, `<TimeLimitedBanner>`, `<TimeLimitedDetailsCard>` (see D7).

For redeemed-this-window state, the hero seal + `<RedemptionDetailsCard>` carry the redemption state; `<HeroStatusBlock>` renders the **next-window time** in a calm treatment (no progress bar, no urgency colour). Exact wording is locked in the D3 table row for `redeemed-this-window`.

For expired state, `<HeroStatusBlock>` is suppressed (the existing expired seal carries the message).

---

## 6. Design decisions (D1–D10) — LOCKED 2026-05-11

All decisions owner-locked. The "Owner gate" prompts have been removed; option choices and clarifications are captured inline as "**Locked:**" callouts.

### D1 — §AM1 fixture hardening approach (Phase 0)

**Options:**
- (A) Suite-level `jest.useFakeTimers()` + `jest.setSystemTime('2026-05-11T12:00:00Z')` in `beforeEach`.
- (B) Per-test `jest.setSystemTime` only on the 2 brittle tests, leave the rest using real timers.
- (C) Refactor tests to inject `now` explicitly into a test-only `now` prop on the screen.

**Recommendation: (A).** Hardens all current tests AND all new M4d tests with one block. Zero downside — most tests don't read the clock, and those that do (state-machine derivation) currently pass at any clock time except for the 180-min arithmetic edge. Suite-level fake-timers is already a common pattern in this repo's animation-heavy tests; no new infrastructure.

**Concrete fix:**
```typescript
beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))  // noon UTC = 13:00 BST
})

afterEach(() => {
  jest.useRealTimers()
})
```

12:00 UTC sits well clear of the 21:30 London brittleness boundary AND clear of any potential next-day-rollover edge with `futureISO(180)` / `futureISO(1440)`.

**Locked: Option (A).** Phase 0 must harden §AM1 with suite-level `jest.setSystemTime('2026-05-11T12:00:00Z')` BEFORE any new M4d UI work.

---

### D2 — Hero countdown placement

**Options:**
- (A) Embed `<HeroStatusBlock>` INSIDE `<CouponHeader>`, mounted below the title row, above the description slot (which becomes empty for TL — see D6).
- (B) Sticky countdown band BETWEEN hero and coupon body, scrolls with content.
- (C) Keep FrostedCountdown mount location but rebuild with hero-grade visuals.

**Recommendation: (A).** Makes the live status part of voucher identity, not a banner attached to it. Aligns with PRODUCT.md principle "voucher is the screen". On-device the user sees window status WITHOUT scrolling — first impression carries the urgency / availability message.

(B) adds a 2nd attention-grabbing element near the save badge — visually busy. (C) is conservative but doesn't move the conceptual needle; the on-device QA push-back was specifically about hero prominence.

**Visual treatment for `<HeroStatusBlock>` (subject to visual companion review if owner wants to see mockups):**
- Inset card sitting on top of the hero gradient, ~16pt margin from edges
- Frosted-glass surface: `rgba(255, 255, 255, 0.16)` base, white border at `rgba(255, 255, 255, 0.24)`, 12pt radius
- Three text tiers:
  - Eyebrow (label.eyebrow, white 0.75 alpha, 11pt 700 letterspacing 1.5): state label (see D3)
  - Primary (display.sm, white, 22pt 800): countdown / clock-time / "Available now"
  - Supporting (body.sm, white 0.65 alpha, 12pt 500): schedule context ("Mon-Fri, 11am-3pm")
- Progress bar below the lines (see D4)
- Reduced-motion-safe: progress bar uses tween-on-tick, not continuous spring; static state under `useReducedMotion()`.

**Locked: Option (A).** `<HeroStatusBlock>` mounts inside `<CouponHeader>` below the title. Visual treatment direction approved per the bullet list above; on-device QA loop will refine.

---

### D3 — Countdown precision per state

| State | Eyebrow | Primary | Supporting |
|---|---|---|---|
| active (>60min remaining) | "Available now" | "Open until 5:30pm" | "Mon-Fri, 11am-3pm" |
| urgent (≤60min, >1min remaining) | "Closing soon" | "Closes in 23m" | "Mon-Fri, 11am-3pm" |
| urgent final minute (≤60s) | "Closing soon" | "Closes in 47s" | "Mon-Fri, 11am-3pm" |
| unavailable-today (opens later today) | "Opens today" | "Opens at 5pm" | "Mon-Fri, 11am-3pm" |
| unavailable-future-day (tomorrow) | "Opens tomorrow" | "Opens at 11am" | "Mon-Fri, 11am-3pm" |
| unavailable-future-day (other) | "Opens Saturday" | "Opens at 11am" | "Mon-Fri, 11am-3pm" |
| no-windows (no schedule) | hidden | hidden | hidden |
| expired | hidden | hidden | hidden |
| redeemed-this-window (later today) | "Available again" | "Today at 5pm" | "Mon-Fri, 11am-3pm" |
| redeemed-this-window (tomorrow) | "Available again" | "Tomorrow at 11am" | "Mon-Fri, 11am-3pm" |
| redeemed-this-window (other day) | "Available again" | "Saturday at 11am" | "Mon-Fri, 11am-3pm" |

**Tomorrow rule:** if the next window opens on the calendar day immediately after `now` (London local), use "tomorrow"; if 2+ days away, use the full weekday name. Same rule applies to both "Opens" eyebrow and "Available again" eyebrow.

**Time format:** 12-hour with am/pm throughout. `formatClockHour12` already exists. "5pm" not "5:00pm" when minutes are zero; "5:30pm" when not.

**Canonical primary format:** `<When> at <Hour><am/pm>` where `<When>` is one of "Today" / "Tomorrow" / full weekday name. Always use clock-time, never relative duration ("in 2h 30m"). Relative duration is reserved for the hero seal subtitle ("Available again in 2h 30m" per §AH M4b-12), not for the hero status block — keeping the two surfaces visually distinct.

**Recommendation: as above.** Calm copy when calm; precise when precise; seconds only in the final minute (the moment that demands them).

**Locked: table approved.** Use AM/PM throughout; contextual today / tomorrow / full weekday wording per the table. Seconds appear only in the final-minute urgent row — never in any other state. See D10 for the seconds-implementation contract.

---

### D4 — Progress bar mechanics

**Recommendation:**
- **Active / urgent:** horizontal bar that EMPTIES left-to-right as window approaches close. Width % = `msToClose / totalWindowMs`. Calm visual cue that time is consumed.
- **Unavailable today / future day:** REVERSED — bar FILLS as opening time approaches. Width % = `1 - (msToOpen / 24h)` capped. Anticipation, not exhaustion.
- **Redeemed-this-window:** bar HIDDEN (calm state — the next-window time alone is the message).
- **Expired:** bar HIDDEN.

**Colour:**
- Active (>60min): green `#34D399`
- Urgent (≤60min, >15min): amber `#FBBF24`
- Urgent (≤15min): coral `#FB7185`
- Unavailable: white at 0.65 alpha (neutral; not urgency-coloured)

**Height:** 4pt slim band, 2pt radius.

**Animation:** tween over 300ms on each 60s tick (smooth — not jerky); seconds-precision in final minute tweens per-second. `useReducedMotion()` → static at current %.

**Caveat — `totalWindowMs` derivation:** we need the WHOLE window's `startsAt` to know the % completed. The hook currently returns `nextBoundaryAt` only. **Hook addition:** `useTimeLimited` adds `currentWindow: { startsAt, endsAt } | null` to its return shape (cheap — already computed internally; just expose). For upcoming windows, the bar represents "time to open" relative to NOW (or to some sensible upper bound like 24h, capped).

**Locked: approved with reinforced copy/visual semantics.**

The bar's direction MUST always be made unambiguous by the eyebrow + primary copy, not by the bar itself:

| Bar behaviour | Eyebrow + primary text the user sees | What the bar means |
|---|---|---|
| EMPTIES left→right | "Available now" / "Closing soon" + "Open until 5:30pm" / "Closes in 23m" | **Time left** in the open window |
| FILLS left→right | "Opens today" / "Opens tomorrow" / "Opens `<Day>`" + "Opens at 5pm" | **Time until** the window opens |

The eyebrow words "Closing" vs "Opens" are the user-facing semantic key. The bar reinforces the eyebrow visually; it never carries meaning alone. No literal "time left" / "opens in" label on the bar itself (would be redundant and add clutter).

Animation, height, colour scheme approved as recommended. Reduced-motion path required (static at current %).

---

### D5 — Banner image prominence

**Current:** `<CouponTopCard>` renders banner image at 180pt height when `voucher.imageUrl` present; falls back to a 6pt type-accent line when null.

**Recommendation:** **No architectural change.** Keep banner image in `<CouponTopCard>`. Bump height to **240pt** when image is present (more prominent without dominating). Keep the 6pt accent-line fallback when null.

**Rationale:** Moving banner image into the hero would clash with the type-coloured gradient that drives voucher identity. The hero gradient is the visual signature; the banner image is merchant content. They belong in adjacent zones, not stacked.

**Goal #5 wording was "include merchant banner image if available"** — current code already does. Owner-confirmed during M4c QA that the goal is about visibility / prominence, not relocation.

**Locked: keep in `<CouponTopCard>`, bump 180→240pt when `voucher.imageUrl` is present.** When `imageUrl` is null, fall back to the existing 6pt type-accent line — **no placeholder / fake banner image** when the merchant hasn't uploaded one (PRODUCT.md §5 anti-fabrication rule).

---

### D6 — Description placement (universal vs TL-only)

**Current:** description renders in `<CouponHeader>` (15pt 500 muted, 3-line max).

**Goal #6 says:** "Move TIME_LIMITED details, availability, usage rule, and description into the coupon details area with better hierarchy."

**Two interpretations:**
- (A) **TL-only:** description moves to coupon body for TIME_LIMITED only. Non-TL hero unchanged. Visual inconsistency between types.
- (B) **Universal:** description moves to coupon body for all voucher types. Hero strips down to title + saving badge + nav. Consistent across types. Bigger blast radius (affects 6+ voucher types' visual).

**Recommendation: (B) — universal move.** Hero is identity (gradient + type colour + title + saving). Description is content (lives with terms / fair use / availability). The visual inconsistency in (A) is worse than a one-time universal change. Description in body also reads better at long lengths (hero 3-line ellipsis truncates real merchant copy).

**Caveat:** (B) requires non-TL voucher detail visual review on-device. Voucher Detail visual tests across all types must regenerate. Bigger PR scope than pure TL redesign.

**Compromise option (C):** TL-only for M4d (ship the TL redesign clean), file universal description move as a separate Tier 1 follow-up if owner agrees in principle but wants to scope M4d tighter.

**Locked: Option (C).** M4d moves description into coupon body **for TIME_LIMITED only**. Non-TL voucher types' hero is UNCHANGED in M4d. Universal description placement is filed as a Tier 1 follow-up (see §15 below) for a separate PR after M4d ships.

**Implementation note:** `<CouponHeader>` becomes type-aware:
- `voucher.type === 'TIME_LIMITED'` → description slot suppressed; `<HeroStatusBlock>` mounts in the space.
- All other types → description renders in hero exactly as today.

The visual inconsistency between types is acknowledged and accepted as a transient state pending the follow-up.

---

### D7 — Component delete vs refactor

**Recommendation: DELETE all three M4b components.**
- `<FrostedCountdown>` (`components/FrostedCountdown.tsx`) — DELETE. Absorbed into `<HeroStatusBlock>` (new, mounted inside `<CouponHeader>`).
- `<TimeLimitedBanner>` (`components/TimeLimitedBanner.tsx`) — DELETE. Its messaging is carried by `<HeroStatusBlock>` eyebrow + primary copy.
- `<TimeLimitedDetailsCard>` (`components/TimeLimitedDetailsCard.tsx`) — DELETE. Fields absorbed into new "Availability" + "Usage rule" + "Offer ends" sections in `<CouponBodyCard>`.

**Rationale:** these were M4b stop-gaps that implemented the M4 spec literally. M4d is the real design; carrying them forward would mean two visual languages for the same information. Cleaner to delete + replace.

**Test artefacts:** `tests/features/voucher/frosted-countdown.test.tsx`, `tests/features/voucher/time-limited-banner.test.tsx`, `tests/features/voucher/time-limited-details-card.test.tsx` — DELETE alongside. New tests pin `<HeroStatusBlock>` + new `<CouponBodyCard>` sections.

**Locked: DELETE all three** (`<FrostedCountdown>`, `<TimeLimitedBanner>`, `<TimeLimitedDetailsCard>`) plus their test files, once their content is properly absorbed into `<HeroStatusBlock>` + the new `<CouponBodyCard>` sections. Deletions land in the **same commits** that introduce the replacements — never as a stranded "delete first" commit that breaks tests.

---

### D8 — Explainer copy rewrite

**Current:**
- Title: "What is a time-limited voucher?"
- Body: "This voucher is only redeemable during specific times or days. Check availability before ordering."

**Locked copy:**
- Title: **KEEP** "What is a time-limited voucher?" — matches per-type pattern locked 2026-05-07.
- Body (3 sentences, 37 words, practical, trust-first, not salesy):
  > "Time-limited vouchers can only be redeemed during specific days or hours set by the merchant. The current or next available window is shown above. Each window counts separately, so you can redeem once per window."

**Tone anchors applied:**
- "Confident, plain-spoken." (PRODUCT.md §Tone)
- "No marketing puffery." (PRODUCT.md §Tone)
- "Quick orientation: is this voucher for me, what does it save, where do I redeem, can I redeem it now." (PRODUCT.md §Users)
- "Trust-first. Fair-use rules are visible, not buried." (PRODUCT.md §Tone)

**What was tightened from draft:** removed the editorialising clause "often during quieter periods like weekday lunches or early evenings" (slipping toward content marketing — not the Redeemo voice). Reworded "You'll see the … above" → "The current or next available window is shown above" (less conversational, more direct).

---

### D9 — HowItWorks +1 step

**Current step order (subscribed user):**
0. Review the Voucher
1. Tell Staff First
2. Redeem When Ready
3. Enter the Branch PIN
4. Show & Save

**Proposed for TIME_LIMITED subscribed users (NEW step inserted at position 1):**
0. Review the Voucher
1. **Check the Window** — "Make sure the current window is open before ordering. Time-limited offers can only be redeemed during the days and hours shown above."
2. Tell Staff First
3. Redeem When Ready
4. Enter the Branch PIN
5. Show & Save

Non-TL users: keep current 5-step list.
TL free users: subscribe-step at position 0, then check-window at position 1, then standard 4 redemption steps → 6 steps total.

**Implementation:** branch on `voucher.type === 'TIME_LIMITED'` inside `<HowItWorks>`; insert the new step into the step array. New copy lives in `productCopy.ts`.

**Locked: approved.** Insert "Check the Window" at position 1 for TIME_LIMITED users. Copy and position approved verbatim. Non-TL users keep the current 5-step list.

---

### D10 — Seconds in final minute

**Recommendation:** seconds ONLY in the final 60 seconds of urgent state. "Closes in 47s". Earlier than that, minute granularity is plenty (matches M4b countdown locked rule "no seconds, per-minute when within hours").

**Implementation:**
- `useTimeLimited` adds `msToClose: number | null` and `msToOpen: number | null` to its return shape.
- A SECOND `setInterval` ticks at 1s, but ONLY runs when `windowState === 'urgent' && msToClose <= 60_000`. Cleared in any other state.
- New formatter `formatUrgentCountdown(msToClose)` returns:
  - >60s remaining → "Closes in 23m" (uses existing minute math)
  - ≤60s, >0s → "Closes in 47s"
  - ≤0s → "Closes now" (renders briefly until the boundary `setTimeout` flips state to outside-window)

**Reduced-motion:** seconds tick is informational (the time-of-day "47s left" is a fact), not decorative motion. KEEP it active under `useReducedMotion()` (same reasoning as the live timestamp on Show-to-Staff).

**Locked: final 60 seconds only.** Approved with two reinforced sub-rules:

1. **Keep under reduced motion.** The seconds-tick text is informational, not animation. `useReducedMotion()` does NOT suppress it. (`useReducedMotion()` DOES suppress the progress bar tween — see D4.)
2. **No accessibility live-region spam.** The seconds tick MUST NOT fire a per-second screen-reader announcement. Concrete contract:
   - The seconds-display sub-element renders with `accessibilityElementsHidden={true}` (iOS) / `importantForAccessibility="no-hide-descendants"` (Android) — the visual text updates but the assistive-tech tree is unchanged each second.
   - The parent `<HeroStatusBlock>` announces ONCE on state transitions (e.g., `urgent` → `urgent-final-minute`, or `active` → `urgent`) via a single `accessibilityLiveRegion="polite"` change to a stable summary string ("Closing soon. About one minute left."). No per-second updates to that string.
   - State transitions out of `urgent-final-minute` (window close → state flips to `unavailable-today` / `unavailable-future-day`) re-announce the new summary once.
   - Test pin in `hero-status-block.test.tsx`: assert seconds-display has the hidden-from-a11y prop AND the live-region summary string is stable across multiple 1s ticks in the same urgent-final-minute window.

---

## 7. Phase 0 — Fixture hardening (precedes all M4d code)

Per goal #1: harden the 2 brittle Voucher Detail state tests with `jest.setSystemTime` BEFORE adding new tests.

**Phase 0 tasks:**
1. Add `beforeEach` / `afterEach` block to `tests/features/voucher/voucher-detail-states.test.tsx`:
   ```typescript
   beforeEach(() => {
     jest.useFakeTimers()
     jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
   })
   afterEach(() => {
     jest.useRealTimers()
   })
   ```
2. Verify both brittle tests now pass DETERMINISTICALLY:
   - Line 362–375: `time-limited-unavailable-today state: no current window, nextWindow later today`
   - Line 377–385: `time-limited-unavailable-future-day state: no current window, nextWindow > 24h`
3. Run suite 3× consecutively to confirm no flakiness reintroduced via fake-timer interactions with `useTimeLimited` boundary timers / 60s tick.
4. Commit as a **standalone commit before any M4d implementation work** — `test(voucher): harden voucher-detail-states fixture with jest.setSystemTime (closes §AM1)`.

This commit closes deferred-followups §AM1 entirely.

---

## 8. Hook additions

`useTimeLimited(voucher, now)` extends its return shape:

```typescript
export type TimeLimitedState = {
  isTimeLimited: boolean
  windowState: WindowState        // unchanged
  nextBoundaryAt: Date | null     // unchanged
  // NEW (M4d):
  currentWindow: { startsAt: Date; endsAt: Date } | null
  nextWindow: { startsAt: Date; endsAt: Date } | null
  msToClose: number | null        // currentWindow.endsAt - now; null if no currentWindow
  msToOpen: number | null         // nextWindow.startsAt - now; null if no nextWindow
}
```

Backwards-compatible — no consumer change for tests that only read `windowState` / `nextBoundaryAt`. New consumer is `<HeroStatusBlock>` for progress bar + seconds countdown.

Second `setInterval` (1s) added; gated on `windowState === 'urgent' && msToClose <= 60_000`. Cleared in all other states. Cleared on unmount. Cleared on AppState background. AppState resume re-evaluates `windowState` before deciding whether to restart the 1s tick.

---

## 9. Component plan

| Component | Action | Path |
|---|---|---|
| `<HeroStatusBlock>` | **NEW** | `apps/customer-app/src/features/voucher/components/HeroStatusBlock.tsx` |
| `<CouponHeader>` | MODIFY — mount `<HeroStatusBlock>` below title; conditionally suppress description for TL (D6) | `apps/customer-app/src/features/voucher/components/CouponHeader.tsx` |
| `<CouponBodyCard>` | MODIFY — add Availability / Usage rule / Description / Offer ends sections | `apps/customer-app/src/features/voucher/components/CouponBody.tsx` |
| `<CouponTopCard>` | MODIFY — banner image 180→240pt when present | `apps/customer-app/src/features/voucher/components/CouponBody.tsx` |
| `<HowItWorks>` | MODIFY — branch on `voucher.type === 'TIME_LIMITED'` to insert new step | `apps/customer-app/src/features/voucher/components/HowItWorks.tsx` |
| `<FrostedCountdown>` | DELETE | `apps/customer-app/src/features/voucher/components/FrostedCountdown.tsx` |
| `<TimeLimitedBanner>` | DELETE | `apps/customer-app/src/features/voucher/components/TimeLimitedBanner.tsx` |
| `<TimeLimitedDetailsCard>` | DELETE | `apps/customer-app/src/features/voucher/components/TimeLimitedDetailsCard.tsx` |
| `VoucherDetailScreen.tsx` | MODIFY — mount-order change per §5; delete imports + mount sites | `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` |
| `useTimeLimited.ts` | MODIFY — extended return shape per §8 | `apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts` |
| `countdownFormat.ts` | MODIFY — add `formatUrgentCountdown(msToClose)` | `apps/customer-app/src/features/voucher/utils/countdownFormat.ts` |
| `productCopy.ts` | MODIFY — replace TIME_LIMITED explainer body; add new HowItWorks step copy | `apps/customer-app/src/features/voucher/constants/productCopy.ts` |

---

## 10. Test plan

Phase 0 (preceded all M4d implementation):
- Fixture hardening commit per §7.

M4d test additions:
- **HeroStatusBlock state tests** (new file `tests/features/voucher/hero-status-block.test.tsx`):
  - All 11 state variants from D3 table render the right eyebrow + primary + supporting text (active / urgent / urgent-final / unavailable-today / unavailable-tomorrow / unavailable-other-day / no-windows / expired / redeemed-this-window-today / redeemed-this-window-tomorrow / redeemed-this-window-other-day)
  - 7-weekday defensive pin for `formatDayName` (mirrors M4c pin)
  - Hermes-robust pin: assert no `weekday: 'long'/'short'` usage AND no `toLocaleTimeString` calls
  - Reduced-motion pin: progress bar static under `useReducedMotion() === true`
  - Seconds tick: with `windowState === 'urgent'` + `msToClose ∈ [0, 60000]`, primary updates per second; outside the range, primary updates per minute only
- **VoucherDetailScreen mount order test** (extend `voucher-detail-states.test.tsx`):
  - For each TL state, assert `<HeroStatusBlock>` testID appears INSIDE the `<CouponHeader>` subtree (DOM-order regression pin)
  - Assert `<FrostedCountdown>` / `<TimeLimitedBanner>` / `<TimeLimitedDetailsCard>` testIDs are ABSENT
  - Assert new CouponBody sections (`coupon-body-availability`, `coupon-body-usage-rule`, etc.) appear for TL
- **CouponBody section order pin** (new file `tests/features/voucher/coupon-body-tl-sections.test.tsx`):
  - For TL vouchers: Availability → Usage rule → Description → Terms → Fair Use → Offer ends DOM order
  - For non-TL: existing order preserved (D6 locked as (C) — non-TL CouponBody unchanged in M4d)
- **HowItWorks TL-specific step pin** (extend `tests/features/voucher/how-it-works.test.tsx`):
  - TL subscribed: 6 steps, "Check the Window" at index 1
  - TL free: 7 steps, subscribe + check window + standard 4
  - Non-TL: 5 steps unchanged
- **Hero seal IN-WINDOW pin** (existing §AE pin in `voucher-detail-redeem-flow.test.tsx`):
  - Verify seal still appears AT TOP of hero for in-window redeemed state (regression pin against absorbing hero status block on top of seal)
- **Screen-capture protection pin** (existing §AE6 pins):
  - Verify `useScreenCaptureProtection` still mounts on redeemed-this-window + in-presentation-window
  - Verify `useScreenshotGuard` still mounts on iOS

---

## 11. Visual companion need

The hero status block is a small but high-stakes visual element. Owner can:
- (a) Lock D2 + D3 + D4 from the text in this spec; proceed to implementation with on-device QA loop.
- (b) Request a visual-companion mockup pass before locking — 3 frames (active / urgent / unavailable-future-day) at hero-zoom, showing the new block over the type-coloured gradient.

Recommendation: (a). The visual language is well-anchored by existing FrostedCountdown + RedeemedSeal patterns. On-device QA will catch any remaining issues faster than a mockup loop. If on-device QA surfaces a layout problem, we can spin a mockup at that point.

**Locked: (a).** Proceed to implementation with on-device QA loop; mockup pass is reserved as a fallback if on-device QA surfaces a layout problem.

---

## 12. Open questions

**All closed 2026-05-11.** Decisions D1–D10 and §11 visual-companion locked by owner. Lock summary:

| ID | Decision | Lock |
|---|---|---|
| D1 | §AM1 fixture hardening | (A) suite-level `jest.setSystemTime('2026-05-11T12:00:00Z')` in `beforeEach`, BEFORE any new M4d UI work |
| D2 | Hero countdown placement | (A) `<HeroStatusBlock>` embedded inside `<CouponHeader>` below the title |
| D3 | Countdown precision per state | Table approved; AM/PM throughout; contextual today/tomorrow/full weekday wording; seconds only in final minute |
| D4 | Progress bar mechanics | Approved; eyebrow words ("Closing" vs "Opens") disambiguate bar direction; no literal label on the bar itself |
| D5 | Banner image | Keep in `<CouponTopCard>`, bump 180→240pt when present; no fake banner when absent |
| D6 | Description placement | (C) TL-only in M4d; universal placement filed as Tier 1 follow-up (§15) |
| D7 | Three-component delete | Approved; deletions land in same commits as replacements (no stranded delete-first commit) |
| D8 | Explainer copy | Tightened from draft (51→37 words; removed editorialising clause); approved |
| D9 | HowItWorks +1 step | "Check the Window" at position 1 for TL users; approved |
| D10 | Seconds in final minute | Approved; informational text (kept under reduced motion); NO per-second a11y live-region announcement |
| §11 | Visual companion | (a) Proceed to implementation with on-device QA loop |

---

## 13. Cross-references

- `docs/superpowers/specs/2026-05-10-voucher-detail-m4-time-limited-design.md` — the M4 TIME_LIMITED spec this amends
- `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md` — M1/M2/M3 voucher detail (locked contracts in §2 here)
- `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md` §AM1 — fixture brittleness
- `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/feedback_time_limited_urgent_threshold_locked.md` — 60min URGENT_THRESHOLD_MS
- `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/reference_london_clock_helper.md` — Hermes-robust formatter pattern
- `PRODUCT.md` — Redeemo audience profile + tone anchors
- `CLAUDE.md` Phase 3C.1c M4a/M4b/M4c shipped sections

---

## 14. Sequencing

1. ~~Owner reviews this spec amendment.~~ ✅ 2026-05-11
2. ~~Owner locks decisions D1–D10 (and §11 visual-companion choice).~~ ✅ 2026-05-11
3. ~~Spec amendment doc updated inline with locked decisions; self-review pass; committed.~~ ← current step
4. `superpowers:writing-plans` skill invoked to produce the M4d implementation plan with Phase 0 fixture hardening as the first task, then the M4d redesign in TDD increments.
5. Owner reviews the plan.
6. Implementation begins (Tier 2 plan-first discipline).

**Do not begin implementation until step 5 completes.**

---

## 15. Follow-ups filed for after M4d ships

### F1 — Universal description placement (Tier 1)

**Source:** D6 lock (C).

**Scope:** Move voucher description out of `<CouponHeader>` for ALL voucher types into the coupon body, matching the placement M4d introduces for TIME_LIMITED. Eliminates the transient type-aware hero asymmetry M4d creates.

**Why deferred:** keeps M4d's blast radius bounded to TIME_LIMITED visual + structural work. Universal description move requires on-device QA across BOGO / Discount / Freebie / Spend & Save / Reusable variants, plus visual-test regeneration for each hero variant.

**Pickup criteria:** any time after M4d ships and is in main. No urgent trigger. Bundle with the next non-TL voucher detail polish PR if one materialises, otherwise file as a standalone Tier 1 PR.

**Cross-ref:** to be added to `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md` once spec is committed.
