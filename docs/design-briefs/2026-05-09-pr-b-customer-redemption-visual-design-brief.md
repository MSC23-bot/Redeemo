# PR-B Customer Redemption Visual Design Pass — Shape Brief

> **Status:** DRAFT — pending owner review. **No production code is written until this brief is owner-approved.**
> **Date:** 2026-05-09
> **Plan:** [docs/superpowers/plans/2026-05-09-pr-b-customer-redemption-visual-design-pass.md](../superpowers/plans/2026-05-09-pr-b-customer-redemption-visual-design-pass.md)
> **Polish-pass charter:** [docs/superpowers/plans/2026-05-09-customer-redemption-polish-pass.md](../superpowers/plans/2026-05-09-customer-redemption-polish-pass.md) — PR-A → PR-C → PR-B sequencing.
> **Tier:** **Tier 2 visual design pass.** Multi-file UI work; no backend, no schema, no contract changes.
> **Skills:** `/impeccable shape` Phase 2 brief structure + `/ui-ux-pro-max` rule citations woven in.

---

## 1. Feature Summary

PR-B is the visual design pass following PR-A (PIN sheet + SuccessPopup polish, MERGED 2026-05-09 at `cd33c9a`) and PR-C (verified-review backend + entry points, MERGED 2026-05-09 at `a80f427`). Five customer-redemption surfaces in scope: **Show-to-Staff register shift to "official document"**, **SuccessPopup subtle celebration motion**, **Voucher Detail redeemed-state targeted refinement**, **PIN sheet full layout audit**, and **merchant-profile voucher card redeemed-state treatment** (§Q4 fold-in from the broader §Q1-Q5 redeemed-state design pass).

Anti-fraud surfaces — screen-capture protection, screenshot guard, live signal hierarchy, validation polling, the 2-hour presentation window gate — are preserved verbatim. No functional, contract, or backend changes. The brief calls out per-surface design intent + cross-cutting checklists (Dynamic Type, Android parity, reduced-motion, screenshot/recording protection) so the implementation plan can pin every constraint.

## 2. Primary User Action

PR-B touches two distinct user contexts. Both must succeed independently:

- **At the redemption moment** (Show-to-Staff + SuccessPopup): customer presents a voucher code to staff with confidence; feels rewarded for the redemption.
- **Browsing merchant profile** (voucher card redeemed-state): customer scans their voucher list and instantly recognises which vouchers they've already redeemed in this cycle.

Voucher Detail redeemed-state and PIN sheet are smaller refinement targets in service of the two primary contexts above.

## 3. Design Direction (per surface)

### 3.1 Show-to-Staff — register: COMMITTED

**Direction (locked from owner Round 1 answer 1):** register shift to "official document". Apple Wallet pass / boarding pass / verified-ticket energy. The screen IS the proof of redemption; not a "QR card" pattern.

- **Scene sentence**: *"Branch staff in a dim, busy restaurant or bar at 7pm, glancing at a customer's phone for 3 seconds while juggling other tables."* This forces a high-contrast, instantly-scannable layout with one strong identity zone (Redeemo + merchant) and one anchor (the code). Dim ambient light + customer-side brightness boost drives the cream-on-cream warmth of the receipt body so the QR + signals stay legible.
- **Anchor references**: Apple Wallet boarding pass (vertical receipt + clear identity zone + scannable code anchor), Eventbrite mobile ticket (event title prominence + verified seal), Apple Pay payment confirmation (live signal hierarchy + validation transition).
- **Anti-references**: Generic "QR card on a screen" pattern. Stripe receipt (too transactional, no celebration). Groupon coupon screen (too cluttered, no trust). Ticketmaster ticket (too dense, too "ticket-stub" decorative).
- **Color strategy**: Cream identity zone (Redeemo header; matches PRODUCT.md design-system anchor `#FFF9F5 → #FCF0E5` vertical) + warm-cream document body + navy text for content + brand-rose for live signals (animated border, LIVE dot ticker) + savings-green for the validated state pill. The voucher-type pastel gradient does NOT bleed into Show-to-Staff — this surface is staff-facing, type colour belongs on customer-facing surfaces.
- **Typography hierarchy** (top-down):
  - Eyebrow: `label.eyebrow` (11pt, ls 1.8, uppercase) "Verified Voucher"
  - Voucher title: `heading.md` (18 / 24, weight 700, navy)
  - Voucher description: `body.md` (16 / 24, weight 400-500, navy.muted) — 2-3 lines max with `truncation-strategy: ellipsis after line 3`
  - Merchant name: `heading.sm` (16 / 22, weight 700, navy)
  - Branch: `label.lg` (14 / 18, ls 0.2, navy.tertiary)
  - Code: `mono.redemption` (28 / 34, ls 4) — UNCHANGED
  - Live clock: `body.sm` (14 / 21) — UNCHANGED
- **`/ui-ux-pro-max` rule citations**: `safe-area-awareness`, `dynamic-type`, `voiceover-sr`, `correct-brand-logos`, `consistent-icon-sizing`, `state-clarity`, `weight-hierarchy`, `truncation-strategy`, `motion-meaning`, `reduced-motion`.

### 3.2 SuccessPopup — register: RESTRAINED

**Direction (locked from owner Round 1 answer 2):** subtle celebration. No heavy confetti. Strengthen what's there.

- **Scene sentence**: *"Customer has just redeemed at the counter; phone is in hand for 2-3 seconds before they tap to show staff."* Short attention window. The celebration must register in 1-2 seconds without delaying the user's path forward.
- **Anchor references**: native iOS payment confirmation modal, Apple Pay success animation (subtle check + breath), Stripe payment success (brand glow + restraint).
- **Anti-references**: Confetti/balloon party-app celebration (Robinhood, Cash App). 7-layer Reanimated sequences. Bouncy/elastic spring physics ("too bouncy" was already locked-rejected on the merchant-profile subscribe-prompt).
- **Color strategy**: existing cream popup body (`color.cream`) + voucher-type pastel accent row (already locked PR-A T11) + savings-green callout + navy-gradient secondary CTA (locked PR-C T16). NEW: soft brand-rose sparkle ring around the check ring on entrance only.
- **New motion** (3 elements, all on entrance, all skippable under reduced-motion):
  - Saving amount count-up: 0 → `estimatedSaving.toFixed(2)`, 600-1000ms, `ease-out-quart`. Tabular-nums prevents shift. Plays once on mount.
  - Check-ring polish: existing scale-and-settle gets a 1-frame pause at scale=0.95 before the final settle (more "earned" feel; current 240ms cubic stays).
  - Soft brand sparkle/breathe: ~1.2s single pulse, opacity 0 → 0.3 → 0, on a 36pt ring around the 22pt check-ring. Brand-rose 25% alpha → transparent. Plays once after check-ring lands (delay = 480ms).
- **Reduced motion path**: count-up still plays (it's data, not decoration). Check-ring renders static at scale=1. Sparkle ring suppressed entirely.
- **`/ui-ux-pro-max` rule citations**: `duration-timing` (≤300ms micro; complex ≤400ms; >500ms avoided — the sparkle's 1.2s is a single soft pulse, not a sequence, exception accepted), `motion-meaning`, `excessive-motion` (max 1-2 elements per view: count-up + sparkle is the budget, check-ring already exists), `interruptible`, `reduced-motion`, `number-tabular`.

### 3.3 Voucher Detail redeemed-state — register: TARGETED (no register shift)

**Direction (locked from owner Round 1 answer 3):** targeted refinement within current geometry. Leave §Q1-Q5 (washed-out coupon, REDEEMED stamp on coupon body, dimmed merchant card, Settings → Redemption History past-cycle surface) to their own design pass — except §Q4 (merchant-profile voucher card redeemed-state) which folds into PR-B per §3.5 below.

- **Scope**: review three things and propose surgical changes only where materially broken.
  1. Seal-vs-hero-vs-RedemptionDetailsCard visual stack (Dynamic Type AX1+ stress test; confirm seal at `insets.top + 96` doesn't clip into the card under bumped type).
  2. ReviewPromptCard secondary register against the staff-handoff RedemptionDetailsCard above it (cream-tinted card vs white card — does it read as "secondary action" or just "second card in the stack"?).
  3. Available-again date treatment in CycleRulesCard (post-redemption variant, the brand-rose tinted block — does it earn its visual weight?).
- **Anchor references**: existing PR #49 / PR #57 shipped state.
- **Color strategy**: unchanged.
- **`/ui-ux-pro-max` rule citations**: `whitespace-balance`, `visual-hierarchy`, `truncation-strategy`, `dynamic-type`, `elevation-consistent`.

### 3.4 PIN sheet — register: AUDIT (no register shift)

**Direction**: spacing, density, readability audit only. Owner-approved copy stays unless a clear layout/readability issue surfaces.

- **Scope**: confirm PR-A's type bumps still hold under Dynamic Type AX5; check small-screen iPhone SE 1st gen (375pt) layout; verify Android Material parity (tap target sizes, focus rings, back button placement, error bar positioning).
- **Anchor references**: existing PR-A shipped state.
- **`/ui-ux-pro-max` rule citations**: `readable-font-size` (16px body min on mobile), `touch-friendly-input` (≥44pt input height), `text-styles-system`, `weight-hierarchy`, `whitespace-balance`, `inline-validation`, `error-clarity`, `field-grouping`.

### 3.5 Merchant-profile voucher card redeemed-state — register: TARGETED (small contained variant)

**Direction (NEW scope item from owner; closes §Q4 of the deferred §Q1-Q5 redeemed-state pass):** add a clear redeemed-state visual variant to the merchant-profile voucher card. Use the same "Voucher Redeemed" stamp visual language from Voucher Detail's `RedeemedSeal` component (small variant suitable for card scale).

- **Scene sentence**: *"Customer is browsing a merchant they like, sees the merchant has 6 vouchers, and needs to know at a glance which ones they've already used this cycle vs which are still available to redeem."* Decision-support context, not transaction context.
- **Anchor references**: Voucher Detail's existing `RedeemedSeal` (brand-rose stamp tilt + ink-pressure textShadow, locked PR #49). Generic "VOID" stamp on bank statements / passport stamps (rotational tilt + cream-on-cream feel).
- **Anti-references**: Striked-through "sold out" patterns (too commerce-y; doesn't fit Redeemo's tone). Greyscale-everything fade (loses the type identity that makes the card recognisable).
- **Color strategy**: existing per-type pastel gradient retained at ~70% saturation + REDEEMED stamp overlay + "Already redeemed this cycle" inline label. Type chip stays full saturation (still tells you what type the voucher is). Title + description stay full opacity (still legible).
- **Stamp specs** (small variant of `RedeemedSeal`):
  - 30-40pt diameter, top-right corner of the card hero, ~5° rotation
  - Brand-rose `#E20C04` text, ~50% opacity (rubber-stamp ink-pressure feel preserved)
  - Cream fill `#FFF6EE`, 2px brand-rose border
  - Single word: "REDEEMED" (label.eyebrow / 11pt 800 / ls 1.8 / uppercase)
- **`/ui-ux-pro-max` rule citations**: `state-clarity`, `visual-hierarchy`, `truncation-strategy`, `consistency` (use existing RedeemedSeal language), `color-not-only` (stamp + saturation + inline label all carry the redeemed signal — colour is supplementary, not the only cue).

## 4. Scope

| Axis | Decision |
|---|---|
| Fidelity | **Production-ready.** All five surfaces ship. |
| Breadth | **5 surfaces:** Show-to-Staff, SuccessPopup, Voucher Detail redeemed-state, PIN sheet, merchant-profile voucher card. |
| Interactivity | **Shipped-quality components.** On-device QA required at small-screen, large-screen, dim-light, bright-light, Dynamic Type AX5, reduced-motion, dark mode (where applicable). |
| Time intent | **Polish until it ships, but tight scope.** Do NOT expand into §Q1, §Q2, §Q3, §Q5 (washed-out coupon, REDEEMED stamp on coupon body, dimmed merchant card on Voucher Detail, Settings → Redemption History) — those stay deferred to their own design pass. |
| Anti-fraud | **Locked verbatim.** Screen-capture protection, screenshot guard, live signal hierarchy, validation polling, 2-hour presentation window — all preserved. Tests pin this. |

## 5. Layout Strategy (per surface)

### 5.1 Show-to-Staff — vertical receipt geometry

```
┌─────────────────────────────────────────────┐
│  ●  Redeemo wordmark        [X close]        │  ← Cream identity-zone band, ~64pt, safe-area top + 16
├─────────────────────────────────────────────┤
│  VERIFIED VOUCHER (eyebrow)                  │  ← label.eyebrow, brand-rose, ls 1.8
│                                              │
│  Free Filter Coffee with Any Thali           │  ← heading.md, navy, weight 700
│                                              │
│  Order any thali plate and receive a         │  ← body.md, navy.muted, ≤3 lines
│  complimentary house coffee. In-house only.  │     ellipsis after line 3
├─────────────────────────────────────────────┤
│  [logo]   Covelum Restaurant                 │  ← merchant logo 48×48 + heading.sm name
│           Brightlingsea                      │  ← label.lg branch
├─────────────────────────────────────────────┤
│                                              │
│      ┌──────────────────────────┐            │
│      │                          │            │  ← QR code block (existing) + animated
│      │         [  QR  ]         │            │     brand-rose border (existing)
│      │                          │            │
│      └──────────────────────────┘            │
│                                              │
│             A7K2 P9X4                        │  ← mono.redemption (existing)
│                                              │
├─────────────────────────────────────────────┤
│  ● LIVE   08 May 2026 · 14:24:38            │  ← live clock + LIVE dot (existing)
│                                              │
│  [   ✓ Verified by staff at Brightlingsea ] │  ← validation pill (existing)
├─────────────────────────────────────────────┤
│           Verified through Redeemo           │  ← footer, label.md, navy.tertiary
└─────────────────────────────────────────────┘
```

- Safe area: top inset = `insets.top + 16` minimum (cream band absorbs notch / Dynamic Island clearance). Bottom inset for footer = `insets.bottom + 12`.
- Customer-side brightness boost (existing) compensates for the dim-restaurant scene; the cream identity zone reads as "official document" under boost.
- Vertical scroll: page is single-screen on iPhone 13+ at default Dynamic Type. Under AX1+ scrolling kicks in; the QR code stays the visual anchor (header + voucher info scroll above; live clock + validation stay sticky-bottom of QR card).

### 5.2 SuccessPopup — current architecture preserved

No structural change. New motion only. Three additions, all entrance-only, all reduced-motion-aware:

```
[ existing structure unchanged ]

(a) Saving callout: NEW count-up on the £X.XX value
    - 0 → estimatedSaving over 600-1000ms
    - ease-out-quart easing
    - tabular-nums on the numeric Text component
    - Reduced motion: snap to final value

(b) Check ring: REFINED scale-and-settle
    - Existing 240ms cubic preserved
    - Add a 1-frame hold at scale=0.95 between 80% and 100% progress
    - Reads as "earned, not snapped"

(c) Sparkle/breathe: NEW soft pulse
    - 36pt brand-rose 25% alpha ring around the 22pt check ring
    - Single 1.2s opacity pulse: 0 → 0.3 → 0
    - Triggers 480ms after check-ring lands
    - Reduced motion: suppressed entirely
```

### 5.3 Voucher Detail redeemed-state — surgical adjustments only

Three review areas + decisions:

| # | Review area | Default if not broken |
|---|---|---|
| 1 | Seal at `insets.top + 96` under Dynamic Type AX1+ | Confirm during on-device QA. If clipping into the RedemptionDetailsCard, anchor to a margin from the card's top instead of insets-derived. |
| 2 | ReviewPromptCard secondary register | Default: keep as-is (cream card + 1px hairline border + navy-gradient CTA verbatim per PR-C T16). On-device check: does it read secondary against the white RedemptionDetailsCard above? If too similar, drop to a more transparent surface (`#FFF9F5` at 80% alpha) so the visual depth distinction is stronger. |
| 3 | Available-again date treatment in CycleRulesCard (post-redemption variant) | Default: brand-rose tinted block stays. On-device check: does the date text earn the prominence? If under-weighted, bump from heading.sm → heading.md. |

### 5.4 PIN sheet — audit checklist

| Check | Standard | Notes |
|---|---|---|
| Body text size | ≥16pt (`readable-font-size`) | PR-A bumped most variants; verify all body text ≥ body.md (16). |
| Input height | ≥44pt (`touch-friendly-input`) | PIN digit boxes; verify on small-screen 375pt. |
| Touch target spacing | ≥8pt (`touch-spacing`) | Between PIN digit boxes; between submit + close. |
| Dynamic Type AX5 | No truncation, no clipping | Stress test all type variants from PR-A. |
| Android Material parity | Tap area ≥48dp, focus ring colour, back-button placement | Build + run on Android emulator. |
| Reduced motion | Loading states / progress indicators | Verify spinner respects reduced-motion. |
| Error bar contrast | 4.5:1 (`color-accessible-pairs`) | Backend-error banner copy. |
| Keyboard type | numeric, no autofill | `keyboardType="number-pad"` + `textContentType="none"` (locked PR-A). |

If any item fails, surgical fix only — no register shift, no copy changes unless owner approves.

### 5.5 Merchant-profile voucher card redeemed-state

```
┌─────────────────────────────────────────┐
│ [ pastel gradient @ 70% saturation ]    │  ← Hero strip (existing)
│                                         │     - Saturation drop is the calm signal
│                  ┌──────────────┐        │     - Type chip stays at 100%
│                  │  REDEEMED    │  ← stamp│  ← 30-40pt brand-rose stamp, top-right
│                  └──────────────┘        │     ~5° rotation, ink-pressure shadow
│  [ FREEBIE ]  ← type chip               │
└─────────────────────────────────────────┘
│  Free Filter Coffee with Any Thali     │  ← Title (full opacity)
│  Order any thali plate and receive…    │  ← Description (full opacity)
│                                         │
│  You'd save £2.50 (existing)           │
│  Already redeemed this cycle           │  ← NEW: label.md, navy.tertiary
└─────────────────────────────────────────┘
```

- Card structure unchanged; redeemed variant adds:
  - Hero gradient saturation reduction (~30%)
  - REDEEMED stamp overlay (top-right, absolute, pointerEvents='none')
  - "Already redeemed this cycle" inline label below the saving block
- Tap behaviour unchanged: opens Voucher Detail with existing route params.

## 6. Key States

### Show-to-Staff (existing states + visual updates)

| State | Visual notes |
|---|---|
| Active (default, in-window, not validated) | Vertical receipt with code + LIVE clock + animated brand-rose border (existing). New: Redeemo header + voucher description block + merchant identity row. |
| Validated (just-transitioned) | Existing 2s validated pill animation + onDone. New: subtle savings-green sparkle on the validation pill (one-shot, ~400ms). Auto-dismisses to onDone. |
| Background → foreground | Layout intact (Modal stays mounted); polling + clock + animated border resume. Unchanged. |
| Reduced motion | Animated border → static brand-rose border. LIVE dot pulse → static. Validation pill transition → instant. |
| Auto-hide (2-min idle) | Existing dim treatment kicks in; one-tap to wake. Unchanged. |
| Out-of-window (>2h) | Modal won't open (gated upstream by Voucher Detail logic). No PR-B change here. |

### SuccessPopup

| State | Visual notes |
|---|---|
| Default | Subtle celebration plays once on entrance (count-up + check-ring polish + sparkle). |
| Reduced motion | Count-up still plays (data). Check-ring static. Sparkle suppressed. |
| Long savings (£999.99) | Tabular-nums prevents shift; count-up duration capped at 1000ms regardless of magnitude. |
| Zero saving (REUSABLE) | Saving callout suppressed (existing). No celebration on the callout. Check-ring + sparkle still play. |
| Onboarded → home | Existing dismiss path (X / hardware back / scrim) — all route to onDone. |

### Voucher Detail redeemed-state

| State | Visual notes |
|---|---|
| Within 2h window (just-redeemed OR returning visit) | Seal + hero dim + RedemptionDetailsCard + ReviewPromptCard + CycleRulesCard. Refinements per §5.3. |
| After 2h window | Seal + hero dim + "Staff handoff window ended" inner notice card + ReviewPromptCard. Unchanged. |
| Validated | Validated pill replaces "Show to Staff" button on RedemptionDetailsCard (existing). |
| Cycle rolled-over | §Q6 invariant: entire redeemed-state surface unmounts. Unchanged. |
| Reduced motion | Seal stamp tilt/textShadow stays static; no entrance animation on the seal (currently does not animate either). |

### PIN sheet

No state changes. Audit-only.

### Merchant-profile voucher card redeemed-state

| State | Visual notes |
|---|---|
| Active (default) | Existing. |
| Redeemed this cycle | Hero saturation 70% + REDEEMED stamp overlay + "Already redeemed this cycle" inline label. |
| Loading | Existing skeleton. |
| Reduced motion | Stamp does not animate on mount (renders static). |

## 7. Interaction Model

### Show-to-Staff

- Customer arrives via SuccessPopup "View voucher code" OR RedemptionDetailsCard "Show to Staff" button (existing routing).
- Phone moves toward staff; staff scans QR or manually enters code.
- Backend marks `isValidated: true`; polling picks up; validation pill animates with savings-green sparkle.
- Customer dismisses (X close button OR auto-dismiss 2s after validation OR hardware back).
- Background then resume: timer + polling pause cleanly (existing).

### SuccessPopup

- Entrance: scale + translateY (existing) + check-ring scale-settle (existing, refined timing) + saving count-up (NEW) + sparkle breathe (NEW).
- Tap "View voucher code" → close popup, open Show-to-Staff Modal (existing).
- Tap "Rate & Review" → close popup, push to Merchant Profile Reviews tab (existing PR-C).
- Tap X close icon → onDone fires (existing PR-C).

### Voucher Detail redeemed-state

Interactions unchanged from PR-C. Visual refinement only.

### PIN sheet

Interactions unchanged from PR-A. Audit only.

### Merchant-profile voucher card redeemed-state

- Tap → opens Voucher Detail with `from=merchant&...` (existing route, unchanged).
- Long-press / favourite toggle: existing (unchanged).
- The redeemed visual variant doesn't disable the card; the user can still tap into Voucher Detail to see their redemption details.

## 8. Content Requirements

### 8.1 Show-to-Staff (NEW content)

- Header eyebrow: **"Verified Voucher"** (locked).
- Footer: **"Verified through Redeemo"** (small).
- Voucher description: pulled from `voucher.description` (already in the customer-app voucher payload). The ShowToStaff component needs a new prop `voucherDescription: string | null` plumbed from VoucherDetailScreen / RedemptionDetailsCard's mount sites.
- Merchant logo: pulled from `voucher.merchant.logoUrl` (already in payload). Component needs a new prop `merchantLogoUrl: string | null` and graceful collapse to merchant initials in a circle when null.
- Branch name: pulled from `lastRedemption.branch.name` (already plumbed via `branchName` prop).
- All other copy unchanged from M3.

### 8.2 SuccessPopup (NO new copy)

- Saving callout: same `£X.XX` format. NEW: count-up animation on the value.
- All other copy unchanged from PR-A.

### 8.3 Voucher Detail redeemed-state

Copy unchanged. Refinement only.

### 8.4 PIN sheet

Copy unchanged. Owner-approved from PR-A.

### 8.5 Merchant-profile voucher card redeemed-state (NEW)

- Stamp text: **"REDEEMED"** (single word, label.eyebrow / 11pt 800 / ls 1.8 / uppercase). Reads at card scale.
- Inline label: **"Already redeemed this cycle"** (matches existing language across other surfaces — Voucher Detail "redeemed this cycle" CTA helper, RedemptionDetailsCard summary).

## 9. Cross-cutting requirements

### 9.1 Type scale and readability

- All body text ≥16pt on mobile (`readable-font-size`).
- Hierarchy through scale + weight contrast ≥1.25 ratio between steps (`/impeccable` Typography law).
- Number values use tabular-nums (`number-tabular`) — saving callout count-up, redemption code, live clock.
- Truncation: `truncation-strategy` — prefer wrapping; ellipsis after a defined max-line count; full text via expand/tap if needed.

### 9.2 Spacing and density on small iPhones (375pt iPhone SE 1st gen)

- Safe horizontal insets: 16pt minimum (existing `spacing[4]`); 22pt on Voucher Detail in-stack mounts (existing).
- Vertical rhythm: 16pt between major blocks (existing `gap: spacing[4]`); 12pt within blocks; 8pt micro-gaps.
- Show-to-Staff vertical receipt: must fit single-screen on 375 × 667 at default Dynamic Type. Stress tested.

### 9.3 Dynamic Type

- Apple Dynamic Type respected on all surfaces.
- AX5 (largest accessibility size) stress test on Show-to-Staff (new vertical receipt geometry must reflow without truncation), SuccessPopup (count-up text doesn't push the popup beyond viewport), PIN sheet (PR-A bumps need re-verification at AX5), merchant-profile voucher card (REDEEMED stamp + inline label must not collide).
- Truncation strategies per surface in §5.

### 9.4 Android parity

- `/ui-ux-pro-max` rule: `platform-adaptive` — respect Material idioms where they diverge from iOS HIG.
- Touch targets: 48×48dp minimum on Android (44×44pt on iOS).
- Material elevation tokens for cards (existing `elevation-consistent` rule).
- Back button behaviour: hardware back must dismiss SuccessPopup → onDone, dismiss Show-to-Staff → onDone (existing `Modal.onRequestClose` paths preserved).
- Navigation: existing tab-bar + back-stack semantics (no PR-B change).
- Test pass: build + run Android emulator (Pixel 5 default profile) for all 5 surfaces.

### 9.5 Anti-fraud surfaces — LOCKED, NO PR-B CHANGES

- `useScreenCaptureProtection` (Android FLAG_SECURE + iOS 11+ recording blur) on Show-to-Staff, SuccessPopup, Voucher Detail when code is visible. **Preserved verbatim.**
- `useScreenshotGuard` (iOS post-fact screenshot listener) on Show-to-Staff + Voucher Detail when code is visible. **Preserved verbatim.**
- Live signal hierarchy: animated border + LIVE dot + ticking clock + validation pill. **Preserved verbatim.**
- Validation polling (5s interval, 15min timeout). **Preserved verbatim.**
- 2-hour presentation window gate on Voucher Detail. **Preserved verbatim.**
- iOS framing: never describe screenshots as "prevented" on iOS (post-fact only). Locked rule from memory §AB.

### 9.6 Screenshot / screen-recording constraints

- Show-to-Staff: code visible → `useScreenCaptureProtection` ON, `useScreenshotGuard` ON.
- SuccessPopup: code NOT visible → `useScreenCaptureProtection` ON (popup-as-sensitive surface, preserved), `useScreenshotGuard` OFF (intentional — popup is short-lived).
- Voucher Detail: code visible (via persisted `lastRedemption` during 2h window AND not validated) → `useScreenCaptureProtection` ON, `useScreenshotGuard` ON. Same gate as today.
- All other PR-B surfaces (PIN sheet, Voucher Detail non-redeemed states, merchant-profile voucher card) → no screen-capture protection (no code rendered).

### 9.7 Reduced motion

- All NEW motion in PR-B (count-up, sparkle, validation pill sparkle, any seal animation) MUST respect reduced motion.
- `prefers-reduced-motion` (web) / `useAccessibilityInfo().reduceMotionEnabled` (RN) gating per `/ui-ux-pro-max` `reduced-motion` rule.
- Tests pin the reduced-motion path explicitly per surface.

## 10. Device QA Checklist (mandatory before merge)

Adopted from `/ui-ux-pro-max` Pre-Delivery Checklist + per-PR-B specifics.

### Show-to-Staff
- [ ] Vertical receipt fits single-screen on iPhone 13/14/15 mini at default Dynamic Type
- [ ] Safe-area: cream header doesn't clip Dynamic Island on iPhone 14 Pro / 15 Pro
- [ ] Dynamic Type AX1, AX3, AX5: layout reflows without truncation; QR stays visible
- [ ] Android (Pixel 5): cream header layout, navigation bar safe-area, status bar contrast
- [ ] Brightness boost still ramps + restores cleanly
- [ ] `useScreenCaptureProtection` lifecycle: prevents on mount, allows on unmount (verified via expo-screen-capture mock)
- [ ] iOS screenshot fires banner ("Screenshot detected. Staff verify only the live screen.")
- [ ] Animated brand-rose border still alive at 60fps
- [ ] LIVE dot still pulses (or static under reduced motion)
- [ ] Live clock ticks every second
- [ ] Validation pill transition + 2s auto-dismiss + onDone
- [ ] Auto-hide after 2-min idle still kicks in
- [ ] Background → foreground: timer + clock + polling resume cleanly
- [ ] Hardware back / X close → onDone
- [ ] Reduced motion: live signals reduce gracefully; QR + code + clock + validation stay legible
- [ ] VoiceOver: read order = Redeemo header → eyebrow → voucher title → description → merchant → branch → code → live clock → validation status

### SuccessPopup
- [ ] Saving count-up: 0 → £X.XX, 600-1000ms cap; tabular-nums prevents shift
- [ ] Check-ring scale-and-settle: refined timing reads as "earned"
- [ ] Sparkle/breathe ring: single 1.2s pulse, doesn't compete with check-ring
- [ ] Reduced motion: count-up plays; check-ring static; sparkle suppressed
- [ ] X close icon top-right: 44pt+ tap area (hitSlop), accessibility "Close"
- [ ] Rate & Review pill (existing PR-C navy gradient) unchanged
- [ ] View voucher code (existing PR-C brand gradient) unchanged
- [ ] Long savings (£999.99) doesn't push popup beyond 340pt max-width
- [ ] Zero saving (REUSABLE): callout suppressed; count-up + sparkle still play on check-ring
- [ ] Modal scrim tap dismisses; hardware back dismisses; X dismisses — all route to onDone
- [ ] Android: Material elevation, hardware back behaviour
- [ ] Dynamic Type AX5: title doesn't truncate; saving amount stays inside callout

### Voucher Detail redeemed-state
- [ ] Seal at `insets.top + 96` doesn't clip into RedemptionDetailsCard at any Dynamic Type size
- [ ] ReviewPromptCard reads as secondary register against RedemptionDetailsCard above
- [ ] Available-again date in CycleRulesCard reads with appropriate prominence
- [ ] All other PR-C / M3 behaviours regression-clean
- [ ] Reduced motion: seal renders static; existing reduced-motion paths preserved

### PIN sheet
- [ ] All body text ≥16pt
- [ ] PIN digit boxes ≥44pt height; ≥8pt spacing between
- [ ] Dynamic Type AX5: no truncation, no clipping on title / subtitle / lockout copy / digit boxes
- [ ] iPhone SE 1st gen (375 × 667): layout doesn't push submit button below viewport
- [ ] Android (Pixel 5): tap area, focus rings, back button placement, error bar
- [ ] Backend-error banner contrast 4.5:1
- [ ] Keyboard type stays numeric; no autofill suggestions

### Merchant-profile voucher card redeemed-state
- [ ] Hero saturation reduction (~70%) recognisable as "muted" but type identity preserved
- [ ] REDEEMED stamp legible at card scale; doesn't clip into hero image
- [ ] Stamp tilt + ink-pressure shadow consistent with Voucher Detail's RedeemedSeal
- [ ] "Already redeemed this cycle" inline label doesn't push other content
- [ ] Tap behaviour unchanged (still opens Voucher Detail with correct params)
- [ ] Card stays recognisable in a list mixed with active vouchers (visual scan test)
- [ ] Dynamic Type AX5: stamp + inline label don't collide
- [ ] Reduced motion: stamp does not animate on mount

### Cross-cutting (all surfaces)
- [ ] Safe-area: top notch / Dynamic Island clearance + bottom gesture-bar clearance verified
- [ ] No emoji as structural icons (use Lucide / @expo/vector-icons / SvgXml)
- [ ] All new icons from Lucide (consistent stroke width, corner radius)
- [ ] Brand-rose `#E20C04`, navy `#010C35`, savings-green used consistently from `color.*` tokens
- [ ] Reduced-motion paths verified per surface
- [ ] No layout-shift on entrance animations (transform + opacity only)
- [ ] On-device verification at low ambient light (dim restaurant scene for Show-to-Staff)
- [ ] On-device verification at bright sunlight (visibility of seal + redemption code)

## 11. Expected files touched

### Show-to-Staff
- `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx` — vertical receipt restructure; new props `voucherDescription`, `merchantLogoUrl`; merchant initials fallback; type variant adjustments
- `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` — pass new props through to ShowToStaff
- `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx` — `<ShowToStaff>` mount site, pass new props through
- `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx` — `setShowToStaff` state shape may grow new fields if we plumb voucherDescription via state
- New tests: vertical receipt layout pins, voucherDescription rendering, merchantLogoUrl null fallback, Dynamic Type AX5 reflow, safe-area top inset, reduced-motion live signals

### SuccessPopup
- `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx` — new motion: useSharedValue for count-up, sparkle ring component, refined check-ring timing
- New tests: count-up motion (snap on reduced-motion), sparkle ring suppressed under reduced-motion, tabular-nums on saving amount

### Voucher Detail redeemed-state
- `apps/customer-app/src/features/voucher/components/RedeemedSeal.tsx` — only if seal positioning needs change (else untouched)
- `apps/customer-app/src/features/voucher/components/ReviewPromptCard.tsx` — only if secondary register adjustment needed
- `apps/customer-app/src/features/voucher/components/CycleRulesCard.tsx` — only if available-again date prominence adjustment needed
- New tests: only if behaviour changes (most likely visual-only, regression pins on existing tests)

### PIN sheet
- `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx` — only if audit surfaces issues
- New tests: AX5 stress test (already partially covered by PR-A); Android parity stress test

### Merchant-profile voucher card redeemed-state
- `apps/customer-app/src/features/merchant/components/VoucherCard.tsx` — new `isRedeemed?: boolean` prop; redeemed-state visual variant (hero saturation, REDEEMED stamp overlay, inline label)
- `apps/customer-app/src/features/merchant/components/VouchersTab.tsx` — pass `isRedeemed` flag from `redeemedVoucherIds` prop (already plumbed for the existing `redeemedVoucherIds` set used elsewhere)
- New tests: redeemed-state visual variant pin (stamp + saturation + inline label all render together; stamp does not render on active state)

### Memory + docs (post-merge)
- `CLAUDE.md` — new "Phase 3C.1k" section
- `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md` — §7.7 / §8 deltas for Show-to-Staff register shift + §Q4 closure note
- `docs/superpowers/plans/2026-05-09-pr-b-customer-redemption-visual-design-pass.md` — §X "As shipped" addendum
- Memory: new `project_pr_b_visual_design_pass_complete.md` baseline
- Memory: `project_deferred_followups_index.md` — §Q4 marked SHIPPED via PR-B; §Q1, §Q2, §Q3, §Q5 stay deferred

## 12. Out of scope (explicit)

| Item | Why deferred |
|---|---|
| §Q1 — washed-out coupon body redesign on Voucher Detail | Larger Tier 2 design pass; touches the core voucher silhouette and per-type gradient system |
| §Q2 — REDEEMED stamp on coupon body (not on hero) | Same workstream as §Q1 |
| §Q3 — dimmed merchant card on Voucher Detail redeemed-state | Same workstream |
| §Q5 — Settings → Redemption History past-cycle surface | Separate feature surface (cross-feature; touches Profile area) |
| §S1 / §S3 PIN sheet additional polish (beyond layout audit) | Owner approved PR-A copy; only audit-level changes allowed |
| Confetti / celebration motion (§P3) | Owner picked subtle celebration; confetti stays deferred indefinitely |
| Show-to-Staff entry point on validated transition (§Z2) | Rejected at PR-C planning; not revisiting in PR-B |
| Backend changes (any) | PR-B is frontend-only Tier 2 visual pass |
| `myReview` exposure on `getCustomerVoucher` payload (Tier 1 follow-up) | Out of scope; would need backend addition |
| `redemption.id` on `voucherDetailLastRedemptionSchema` (Tier 1 follow-up) | Out of scope; would need backend addition |

## 13. Recommended References

- `/impeccable` references to load during implementation: `spatial-design.md` (Show-to-Staff vertical receipt), `motion-design.md` (SuccessPopup celebration), `interaction-design.md` (validation pill transition), `typography.md` (Show-to-Staff hierarchy), `color-and-contrast.md` (cream-on-cream warmth, dim-restaurant ambient).
- `/ui-ux-pro-max` Quick Reference §1-§7 + Pre-Delivery Checklist as the device-QA gate.
- `/ui-ux-pro-max` `--stack react-native` for component-specific guidance during implementation.

## 14. Open Questions

These remain for the implementer to resolve at impl time, NOT blockers for owner brief approval:

- [ ] **Show-to-Staff merchant logo fallback**: confirm graceful collapse — if `voucher.merchant.logoUrl` is null, render merchant initials in a 48pt circle (cream bg, navy text, weight 700). Recommend this default; needs design critique at impl time.
- [ ] **Show-to-Staff dim-restaurant contrast**: at what device brightness does cream/navy contrast hold? On-device QA pass at 30% brightness without the brightness-boost hook (worst case) confirms.
- [ ] **SuccessPopup count-up duration**: 600-1000ms is the proposed range. On-device check; adjust within range.
- [ ] **SuccessPopup sparkle anchor reference**: Apple Pay micro-celebration is the closest. Implement; iterate via critique pass at impl time.
- [ ] **Voucher Detail redeemed-state seal-vs-card stack**: only on-device QA can confirm the AX1+ behaviour. If clipping, anchor to card top instead of insets.
- [ ] **Merchant-profile voucher card stamp size**: 30-40pt diameter is the proposed range. On-device review at small (375pt) + large (430pt) device widths.
- [ ] **Merchant-profile voucher card gradient saturation**: 70% is the proposed value. Visual review against active card siblings in a list view.

---

## Owner sign-off gate

This brief does NOT mutate any code until owner approves. After approval:

1. PR-B implementation plan ([2026-05-09-pr-b-customer-redemption-visual-design-pass.md](../superpowers/plans/2026-05-09-pr-b-customer-redemption-visual-design-pass.md)) becomes the task driver.
2. Cut a fresh implementation branch from `main` (currently at `d530392` post-PR-#58 docs sync).
3. Implement T1-T7 with the per-surface device-QA gates from §10.
4. Run `/impeccable critique` and `/ui-ux-pro-max` Pre-Delivery Checklist before opening PR-B.
5. Hand back for owner page-review + on-device QA pass.
6. SHA-bound merge.

**Awaiting owner sign-off on:**

- [ ] Brief structure + per-surface design direction
- [ ] Show-to-Staff register shift (§3.1) — Apple Wallet pass / boarding pass anchor + cream identity zone + vertical receipt geometry
- [ ] SuccessPopup subtle celebration motion (§3.2) — count-up + check-ring polish + sparkle/breathe ring; reduced-motion paths
- [ ] Voucher Detail redeemed-state targeted refinement (§3.3) — three review areas, surgical changes only
- [ ] PIN sheet audit checklist (§5.4) — 8 audit items, surgical fixes only if surfaced
- [ ] Merchant-profile voucher card redeemed-state (§3.5) — REDEEMED stamp + 70% saturation + inline label, closes §Q4
- [ ] §Q4 fold-in confirmed (and §Q1, §Q2, §Q3, §Q5 stay deferred to their own design pass)
- [ ] Anti-fraud preservation (§9.5) — locked verbatim, no PR-B changes
- [ ] Out-of-scope list (§12) — explicit deferrals
- [ ] Device QA checklist (§10) — adopted as the merge gate

Once approved, the implementation plan ([2026-05-09-pr-b-customer-redemption-visual-design-pass.md](../superpowers/plans/2026-05-09-pr-b-customer-redemption-visual-design-pass.md)) drives the work task-by-task with TDD where applicable.

---

## §A. As Shipped (T8 device-QA + impeccable rounds, locked at PR head `545882a`)

The implementation diverged from the initial brief in several owner-direction-driven ways during the 12-round T8 device-QA + impeccable-pass cycle. This addendum captures the final shipped contract per surface; the body sections above are preserved as the original brief intent.

### A.1. Merchant-profile voucher card redeemed-state (was §3.5 single-word "REDEEMED" stamp)

**Final shipped state** (T5 → T8i → T8j → T8k):

- Stamp text: **"Voucher Redeemed"** two words (was "REDEEMED" single word at brief §3.5).
- Position: **centered overlay across the card hero** (was top-right corner at brief §3.5; the absolute placement collided with the heart icon at narrower widths and read as "sticker affixed to product" rather than "voucher used").
- Visual treatment: **diagonal Mustica Pro Semibold 22pt cancellation overprint at -10° rotation, brand-rose @ α 0.32, letter-spacing 5pt, NO backdrop / NO border / NO shadow** (was rubber-stamp small variant per brief §3.5; the rubber-stamp aesthetic at small scale read as "cheap" per owner T8h direction).
- Entry motion: scale 1.18→1.0 + opacity 0→1, 320ms ease-out-quart, reduced-motion safe.
- Card body recession: cream wash overlay 0.55 alpha + flat shadow + brand-R watermark muted 0.14→0.06 — DESIGN.md "Flat-By-Default Rule" (active cards lift, redeemed cards sit).
- "Already redeemed this cycle" inline label below saving block: **preserved verbatim from the brief.**
- Title + description full opacity: **preserved verbatim per brief §3.5 anti-reference.**
- VoucherContextLabel: count drops by `redeemedVoucherIds.size`, "All offers redeemed this cycle" copy when count = 0 + totalCount > 0 (T8h).

**Closes:** deferred-followups §Q4 fully.

### A.2. Show-to-Staff (was §3.1 cream Apple-Wallet pass / vertical receipt)

**Final shipped state** (T8c → T8f → T8g → T8h → T8p → T8r):

- Register: **solid brand navy `#010C35` base + brand-rose 25/10/0 glow overlay** (was cream Apple-Wallet-pass identity zone at brief §3.1; T8c shifted to navy trust surface for brand correctness — the brief's cream register was rejected as "nothing to do with our branding" mid-implementation).
- Identity zone: **horizontal Redeemo lockup top-left** (R icon + "Redeemo" wordmark, 6pt gap) — owner T8r direction tightened from 10pt to 6pt for cohesive lockup.
- Eyebrow: **"Present to Staff"** in brand-rose all-caps `label.eyebrow` (T8h) — replaces misleading "Verified Voucher" copy (the voucher isn't verified until staff scans the QR).
- Content discipline: only LIVE pulsing dot + QR + 4+4 code chip + live ticking clock live INSIDE the animated brand-rose code-card border. Voucher-type chip moved ABOVE QR card; redeemed timestamp moved BELOW.
- Code chip (T8g): pale brand-rose tinted chip wrapping the 4+4 code so it reads as a distinct scannable block separate from the QR.
- Code typography (T8p): Lato Bold 28pt + 4pt letter-spacing per DESIGN.md "Mono Redemption Rule" (was `display.md` Mustica Pro 26pt + ls 5; the variant is reserved for the redemption code surface only).
- Receipt rows below QR card: split into **"Date Redeemed"** + **"Time Redeemed"** rows (with seconds) — was single combined row at brief.
- Done button (T8g): **brand-rose gradient pill at the bottom**, replacing X close icon top-right (single dismissal affordance; Modal.onRequestClose continues to wire hardware back).
- QR overlay logo (T8q + T8r): canonical `<RedeemoLogo>` SVG component recoloured **navy** (matches QR modules), bumped 18%→20% of QR diameter, white anchor square at 1.3× the logo for a clean centre — replaces the previous near-white PNG asset that was invisible against the white QR background.

**All anti-fraud surfaces preserved verbatim:** `useScreenCaptureProtection`, `useScreenshotGuard`, `useBrightnessBoost`, `useAutoHideTimer`, `useRedemptionPolling`, 2-hour presentation window, validated transition + 2s auto-dismiss, AppState backgrounding contract.

### A.3. SuccessPopup (was §3.2 subtle celebration motion)

**Final shipped state** (T8b → T8e → T8n → T8o):

- Hero: **solid brand navy + brand-rose 25/10/0 glow overlay** (T8e brand-correctness fix replaces the fabricated 2-stop navy gradient that violated the brand lock — only one navy is brand-locked).
- Title: **"Voucher redeemed successfully"** at `display.sm` Mustica Pro Semibold 22pt + −0.3 tracking (was `heading.md` Lato Semibold 18 + fontWeight 800 override; T8n moves to display tier per Mustica-for-Display Rule for the celebration moment).
- Voucher-type chip in second hero row (T8e): outlined brand-rose 70% pill against the navy hero (was no chip at brief; owner direction added the type chip so customers see WHAT they redeemed at the success moment).
- Saving callout signature: **"You saved" + £X.XX count-up at `display.md` Mustica Pro Semibold 26pt + −0.5 tracking** (T8n elevation per DESIGN.md "saving is the data; data is the hero"). The savings-green count-up is the popup's signature.
- Green check ring (T8o owner direction): **30pt diameter inside a 44pt slot, 18pt glyph, SparkleRing halo at 64pt** (was 22pt / 36pt / 14pt / 56pt — owner asked for "increase the size of the green tick icon").
- Primary CTA: brand red→coral gradient `View voucher code`, radius `radius.md` (12), shadow `0.20 / 14` per Glow-is-the-CTA Rule.
- Rate & Review pill (T8e): **skeleton-red treatment** — outlined brand-rose, transparent fill, brand-rose Star icon + label (was filled navy gradient at PR-C T16 → owner direction "skeleton red button with the typography in red, and the icon as well, without having a solid color inside").
- X close icon top-right of hero (PR-C T16 device-QA fix wave 2).
- **Code rendering, anti-fraud disclosure, `useScreenCaptureProtection` ALL REMOVED** mid-PR-A (locked at §0.9). The popup is no longer a sensitive code surface — code lives on `<ShowToStaff>` + persisted `<RedemptionDetailsCard>`. The brief §3.2 confetti remained deferred (folded into §S2 future polish pass).

### A.4. Voucher Detail hero seal — REVERTED to pre-`8802084` (T8i)

A T8h "premium hairline" redesign was applied to the wrong surface (the Voucher Detail hero `RedeemedSeal`). Owner direction at T8i: restore the original rubber-stamp design exactly as approved pre-`8802084`. The refined hairline-accent treatment moved to the Merchant Profile voucher card stamp (§A.1) where it was always intended.

**Final shipped Voucher Detail hero:** owner-approved rubber-stamp `RedeemedSeal` design — tilt -8°, ink-fade band, ink-mid band, cream speckles, ink-pressure textShadow, stamp-impact entrance with overshoot. **Preserved verbatim** from the M3 baseline.

`CouponHeader` still receives a `dimmed` prop for the redeemed-state visual recession, but applied SELECTIVELY to gradient + content + saveBadge ONLY — the nav row (back / share / favourite) stays full opacity per owner T8h direction. T8h additionally added merchant-profile cache invalidation in `useRedeem.onSuccess` so the Voucher tab card flips to redeemed state immediately on return.

### A.5. PinEntrySheet (was §5.4 audit-only)

Initial brief was audit-only. T8m impeccable pass closed token-alignment gaps without touching any owner-iterated decision (subtitle two-line treatment, disclaimer D2 copy, sentence-per-line lockout discipline all preserved verbatim):

- Title: `heading.md` + 800 override → `display.sm` Mustica Pro 22pt + −0.3 tracking.
- PIN boxes idle bg: `color.cream` → `color.surface.tint` (Cream-for-Identity Rule); border weight 2→1.5px; radius `lg`→`md`; idle border hardcoded → `color.border.subtle` token.
- Disclaimer card bg: `color.cream` → `color.surface.tint`.
- Backend error banner: hardcoded amber `#92400E` → `color.warning` token.
- Lockout body: hardcoded amber → `color.text.secondary` (was inconsistent with the danger-red title and timer).
- Submit: radius `lg`→`md`, shadow `0.30 / 24` → `0.20 / 18`, label `body.md` + 800 override → `heading.sm`.
- Header bottom border: 1px → `StyleSheet.hairlineWidth`.

### A.6. Voucher BranchPickerSheet (NEW scope add — was not in the original brief)

T8l impeccable pass on the voucher-redemption branch picker (the sheet that opens when the user is about to redeem):

- Title: `heading.md` + 800 override → `display.sm` Mustica Pro 22pt + −0.3 tracking (gateway moment between branch confirmation and redemption — Mustica-for-Display Rule).
- Branch rows: per-row bordered cards → list with hairline `StyleSheet.hairlineWidth` dividers (No-Card-On-Card Rule — rows inside a sheet are nested cards).
- MapPin icon: 32×32 grey-square wrapper → inline 20pt icon (drops the SaaS-y wrapper).
- Selected row bg: `color.cream` → `color.surface.tint` per Cream-for-Identity Rule (cream is identity-zone framing; surface.tint is the quieter cream-adjacent reserved for state).
- Confirm CTA: radius `lg`→`md`, shadow `0.30 / 24` → `0.20 / 18`, label `body.md`→`heading.sm`.

### A.7. Test totals at merge (`545882a`)

- Customer-app jest full suite: **1309/1310 ✅** (1 pre-existing baseline failure on `tests/lib/api/profile.test.ts` — documented existing-state, not introduced by PR-B).
- Voucher + merchant scope: **941/941 ✅** across 77 suites.
- Backend vitest: **553/553 ✅** across 60 files.
- `tsc --noEmit` (customer-app): clean.

### A.8. Closed deferrals

- **§Q4 — Merchant Profile redeemed-card treatment** — closed via T5 + T8a (backend `isRedeemedThisCycle` flag) + T8j (card-body recession) + T8k (diagonal Mustica overprint stamp).
