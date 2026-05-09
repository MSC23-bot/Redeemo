# PIN Sheet + SuccessPopup Polish — Shape Brief (PR-A)

> **Status:** DRAFT — pending owner review. **No production code is written until this brief is owner-approved and committed.**
> **Date:** 2026-05-09
> **Plan reference:** [docs/superpowers/plans/2026-05-09-customer-redemption-polish-pass.md](../superpowers/plans/2026-05-09-customer-redemption-polish-pass.md) §0 + §3a (PR-A locked scope).
> **Skills consulted:** `/impeccable` principles + Emil Kowalski / `interaction-design` motion principles + `interface-design` typography/density rules. Owner has directed `/ui-ux-pro-max` review focus on type scale, density, readability — encoded into §3 of this brief.

---

## 1. Purpose + binding context

This brief locks the visual + copy + interaction decisions for PR-A's four scope items (A1–A4). It is the design contract referenced from PR-A's commit 1, and the production-code commits 2–6 must match it exactly.

**Locked rules above this brief (none of them re-litigated here):**

- **§0 Owner decisions** — PR-A scope is A1+A2+A3+A4 only. A5+A6 (Rate & Review CTA hierarchy + routing) ship in PR-C. This brief does not propose any change to the existing dead-end `onRateReview` callback behaviour.
- **§0.3 Verified-review semantics** — out of scope for PR-A.
- **§0.8 Readability and scale** — first-class. Type scale, density, on-device readability all reviewed in §3 + §6 of this brief.
- **PRODUCT.md tone** — confident plain-spoken, no marketing puffery, no em dashes, British English. Negative pins enforced in tests.
- **Anti-references** — NOT Groupon, NOT SaaS dashboard, NOT fintech, NOT food-delivery coupon UI.
- **Owner-clarification 1 (2026-05-09)** — copy must NOT feel like the voucher is being "locked away" from the user. Positive, clear, factual framing.
- **Owner-clarification 2 (2026-05-09)** — PIN loading state lightweight, fast-feeling, NOT "payment-processing heavy".

### 1.1 Persona-source decision (2026-05-09)

A search of the repo for a separate written customer-persona document (filename or content match for `persona / customer profile / target audience / primary user`) returned **no canonical persona file in-repo**. The only candidates surfaced were:

- [PRODUCT.md](../../PRODUCT.md) `## Users` — short customer profile synthesised from CLAUDE.md as input to `/impeccable`.
- [docs/source-materials/customer-app-srs.pdf](../source-materials/customer-app-srs.pdf) — 105-page SRS; persona section presence unverified (the Read tool's PDF pipeline needs `poppler-utils`, which is not installed; owner explicitly declined to install).
- `.superpowers/brainstorm/57077-1776323986/content/design-personality.html` — a 4-option design-direction prompt, not a persona document.

**Owner direction (2026-05-09):** for PR-A, ground all copy in PRODUCT.md alone — specifically the four sections `## Users`, `## Tone`, `## Anti-references`, `## Strategic principles`. If a fuller customer-persona document turns up later, the copy is reconcilable against it via the rationale anchors in §5 of this brief. PR-A is not blocked on persona discovery.

**The PRODUCT.md customer framing applied here:**

- Mobile-first, often outdoors or in transit during discovery, in-store at the redemption moment.
- Wants quick orientation: *"is this voucher for me, what does it save, where do I redeem, can I redeem it now."*
- Sceptical of voucher apps that bury terms in legalese.
- Often brings friends/family — group-context awareness.

**The PRODUCT.md tone applied here:**

- Confident, plain-spoken. No marketing puffery.
- Trust-first. Money savings + redemption mechanics stated precisely.
- Fair-use rules visible, not buried.
- No em dashes (locked 2026-05-02).
- British English (favourite, colour, behaviour).

This brief's copy section (§5) cross-references back to these anchors so each line is auditable.

---

## 2. Register classification (per `/impeccable`)

| Surface | Register | Rationale |
|---------|----------|-----------|
| **PIN entry sheet** | **Product** | Utility surface — design SERVES the redemption action. Functional first. Brand expression lives in the submit-button gradient + brand-rose accent ring on the logo. Anti-reference: SaaS-cream + AlertTriangle banner reads like an admin error console. |
| **SuccessPopup** | **Product (with brand-moment accent)** | Utility surface confirming the redemption, with one committed brand moment via the voucher-type pastel gradient accent row. The code is the visual hero (anti-fraud requirement). The new saving callout is functional information, not a celebration trophy. Anti-reference: gradient-everywhere "you did it!" SaaS modal. |

**Implication for both surfaces:**
- One committed accent (voucher-type colour for SuccessPopup; brand-rose for PIN sheet submit + logo ring).
- Tinted neutrals everywhere else (cream, navy, savings-green at low alpha for the saving callout).
- No nested cards. No glassmorphism. No gradient text. No side-stripe borders. (Per `/impeccable` shared design laws + the [Voucher Detail Fair Use override](../../memory/feedback_voucher_detail_fair_use_card.md) which is irrelevant here — neither surface has a Fair Use card.)

---

## 3. Type scale audit

### 3.1 Current Redeemo type scale (verified from `apps/customer-app/src/design-system/tokens.ts:117`)

| Variant | Size / Line / Tracking | Use today |
|---------|------------------------|-----------|
| `display.xl` | 40 / 44 | Marketing splashes |
| `display.lg` | 32 / 36 | Hero numerics |
| `display.md` | 26 / 30 | Section heroes |
| `display.sm` | 22 / 26 | Sub-heroes |
| `heading.lg` | 20 / 26 | Page titles |
| `heading.md` | 18 / 24 | Card / sheet titles |
| `heading.sm` | 16 / 22 | Sub-section titles |
| `body.lg`    | 18 / 28 | Long-form copy |
| `body.md`    | 16 / 24 | Standard body |
| `body.sm`    | 14 / 21 | Secondary body |
| `label.lg`   | 14 / 18 (ls 0.2) | Small primary labels |
| `label.md`   | 12 / 16 (ls 0.4) | Metadata, eyebrow-y labels |
| `label.eyebrow` | 11 / 14 (ls 1.8 uppercase) | True eyebrows |
| `mono.redemption` | 28 / 34 (ls 4) | Redemption code rendering |

**Audit verdict (per §0.8):** the scale itself is sound — there's a clean step-distance from `body.sm` (14) to `body.md` (16) to `body.lg` (18) and `heading.sm` (16) to `heading.md` (18). **No new variants needed for PR-A.** Option (a) from §0.8 applies: bump existing variant assignments. (b) and (c) not invoked.

### 3.2 Current usage on PIN sheet (audited 2026-05-09)

| Element | Current variant | Issue per §0.8 | Proposed bump |
|---------|-----------------|----------------|---------------|
| `merchantLine` (line 234) | `label.md` (12) | Too small — this IS the merchant identity at the top of the sheet | `body.md` (16), weight increase via design-system `Lato-SemiBold` if needed |
| `branchLine` (line 238) | `label.md` (12) | Too small — branch context anchors the customer to which PIN they're entering | `body.sm` (14) |
| Title `Enter Branch PIN` (line 245) | `heading.sm` (16) | Borderline — sheet title competes with merchant identity | `heading.md` (18) |
| Subtitle (line 248) | `body.sm` (14) | Borderline — primary instruction copy | `body.md` (16) |
| `lockoutTitle` (line 259) | `label.md` (12) | Too small — "Too many wrong PINs" is critical info | `heading.sm` (16) |
| `lockoutBody` (line 262) | `body.sm` (14) | OK; keep | (no change) |
| Lockout countdown (line 267) | `heading.sm` (16) | Too small for a numeric countdown — needs presence | `heading.md` (18) |
| `lockoutLabel` (line 273) | `label.md` (12) | OK eyebrow-y; keep | (no change) |
| `pinDigit` (line 293) | `heading.md` (18) | Tight for 4-digit indicator boxes | `heading.lg` (20) |
| `errorBarText` (line 329) | `label.md` (12) | Borderline; user needs to read the error | `body.sm` (14) |
| `backendErrorTitle` (line 344) | `label.md` (12) | Too small for a banner title | `heading.sm` (16) |
| `backendErrorBody` (line 347) | `body.sm` (14) | OK; keep | (no change) |
| `disclaimerText` (line 357) | `label.md` (12) | Too small — primary "you're about to redeem" framing | `body.md` (16) |
| `submitText` (line 385) | `label.md` (12) | Too small for the primary CTA on a sheet | `body.md` (16), Lato-SemiBold via variant |

### 3.3 Current usage on SuccessPopup (audited 2026-05-09)

| Element | Current variant | Issue per §0.8 | Proposed bump |
|---------|-----------------|----------------|---------------|
| Accent label `Redeemed` (line 255) | `label.md` (12) | Eyebrow-style — keep small but consider `label.lg` weight | `label.lg` (14) |
| Type chip `BOGO` etc (line 262) | `label.md` (12) | OK eyebrow; keep | (no change) |
| Voucher title (`contextTitle`, line 276) | `label.md` (12) | Too small — this names the voucher the user just redeemed | `heading.sm` (16) |
| Merchant name (`contextMerchant`, line 279) | `label.md` (12) | Too small; secondary to title | `body.sm` (14) |
| Code label `YOUR REDEMPTION CODE` (line 299) | `label.md` (12) | Eyebrow-y; keep | (no change) |
| Redemption code (`heading.md` at line 303) | `heading.md` (18) | **Wait** — actual code uses `mono.redemption` (28pt) per the actual styles. Keep. | (no change) |
| Live timestamp (line 311) | `label.md` (12) | Anti-fraud trust signal — needs to be readable BUT not compete with code | `body.sm` (14) |
| Receipt details body (line 341) | `body.sm` (14) | OK; keep | (no change) |
| Primary CTA `Show to Staff` (line 367) | `label.md` (12) | Too small for a primary action | `body.md` (16) Lato-SemiBold |
| Rate & Review CTA (line 389) | `label.md` (12) | **DEFENSIVE PIN** — PR-A keeps as-is per §0.2 owner correction. Visual elevation moves to PR-C. | (NO CHANGE in PR-A) |
| Done CTA (line 406) | `label.md` (12) | **DEFENSIVE PIN** — PR-A keeps as-is. | (NO CHANGE in PR-A) |
| Info row label (line 421) | `label.md` (12) | Eyebrow-y receipt label; keep | (no change) |
| Info row value (line 424) | `label.md` (12) | Receipt value beside its label; keep proportionate | (no change) |

### 3.4 New element — saving callout (A4)

| Element | Variant | Rationale |
|---------|---------|-----------|
| Saving label `You saved` | `label.lg` (14, ls 0.2) | Primary label, slightly weightier than `label.md` |
| Saving amount `£X.XX` | `heading.md` (18) | Readable amount, comfortably weighty without dominating the code hero (28pt) |

**Tabular numerics:** the amount renders with `fontVariant: ['tabular-nums']` so digits align — visual stability when amounts grow from £6.99 to £69.99 to £1,234.56.

### 3.5 Type-scale review summary

- **No new variants added.** Option (a) from §0.8.
- **All bumps come from the existing scale.** No ad-hoc font sizes.
- **Hierarchy preserved:** primary message largest (PIN sheet title `heading.md`, SuccessPopup voucher title `heading.sm`, code `mono.redemption`), secondary smaller but readable (`body.md` / `body.sm`), tertiary metadata stays at `label.md` (12) — never below.
- **Allow font scaling** is already on (`Text.tsx:43-44`) with `maxFontSizeMultiplier={1.4}`. Dynamic Type at "Larger 4/6" caps cleanly.

---

## 4. PIN sheet — final visual spec (A1 + A2)

### 4.1 Header block — merchant logo + identity

**Composition (top to bottom):**

```
┌────────────────────────────────────────┐
│              [48 × 48 logo]             │  ← A1 NEW: merchant logo
│            Covelum Restaurant           │  ← merchantLine bumped to body.md (16)
│             Coventry · Earlsdon         │  ← branchLine body.sm (14), navy.muted
│                                         │
│              Enter Branch PIN           │  ← title bumped to heading.md (18)
│                                         │
│  Ask staff at Covelum Restaurant for    │  ← subtitle line 1 bumped to body.md (16)
│       their 4-digit PIN.                │
│                                         │
│  When you confirm it, we'll create the  │  ← subtitle line 2 body.md (16) navy.muted
│      code staff can check.              │
│                                         │
│         [ ] [ ] [ ] [ ]                 │  ← PIN boxes 56×64 (was 54×60), gap 14
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ 🔒 Confirming the correct PIN      │  │  ← disclaimer banner bumped to body.md
│  │    redeems this voucher for this  │  │     cream tint, brand-rose 12% ring,
│  │    cycle. Continue when you're    │  │     Lock icon (NOT AlertTriangle)
│  │    ready to use it.               │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │     [Confirming…]   [pulsing]    │   │  ← submit btn body.md (16) Lato-SemiBold
│  └──────────────────────────────────┘   │     brand-gradient (unchanged)
└────────────────────────────────────────┘
```

### 4.2 Visual decisions locked

**Logo (A1):**
- Size: **48 × 48** (NOT 40 × 40 originally proposed — bumped per §0.8 readability scaling).
- Corner radius: `radius.md` (12).
- Ring: 1px solid `brand.rose` at 8% alpha (≈ rgba(226, 12, 4, 0.08)).
- Centered horizontally above merchantLine.
- Bottom margin: `spacing[3]` (12) before merchantLine.
- Fallback: when `merchantLogoUrl === null` OR `<Image onError>` fires, the logo block is omitted entirely (NOT a placeholder square). Header reverts to text-only — same vertical position for merchantLine.

**Header text rhythm:**
- merchantLine (`body.md` 16, Lato-SemiBold via design-system semibold variant): bottom margin `spacing[1]` (4).
- branchLine (`body.sm` 14, Lato-Regular, `color.text.secondary`): bottom margin `spacing[5]` (20) — break before the title.
- Title (`heading.md` 18, Lato-SemiBold via heading variant): bottom margin `spacing[3]` (12).
- Subtitle two-line treatment (see §5 for copy): line spacing follows variant `lineHeight: 24`. Bottom margin to PIN boxes: `spacing[6]` (24).

**PIN box bumps:**
- Box dimensions: **56 × 64** (was 54 × 60). Larger touch target + comfortable spacing for the bumped digit `heading.lg` (20).
- Gap between boxes: **14** (was 12). Density-with-scale per §0.8.
- Active box: `brand.rose` border + soft 4% alpha rose ring (existing visual; preserved).
- Filled box: `brand.rose` border + white background (unchanged).

**Disclaimer banner rework:**
- Icon: `Lock` from `lucide-react-native` (already imported). Size 18 (was 16 with AlertTriangle). Color: `brand.rose`.
- Background: `cream.tint` (≈ rgba(255, 249, 245, 1)) — replaces amber.
- Border: 1px `brand.rose` at 12% alpha — replaces orange border.
- Padding: vertical `spacing[4]` (16) — was `spacing[3]` (12). Density-with-scale.
- Border radius: `radius.md` (12).
- Body text: `body.md` (16), `color.text.primary`, Lato-Regular, line-height 24.

**Submit button:**
- Background gradient unchanged (brand-rose / brand-coral committed accent — this IS the brand moment).
- Padding: vertical `spacing[4]` (16). Bumped from existing.
- Corner radius: `radius.md` (12).
- Min-height: 56 (was 48 or so) — comfortable tap target at bumped text size.
- Disabled opacity: `opacity.disabled` (0.4) — unchanged.

### 4.3 Accessibility specifics

- Logo `<Image accessibilityLabel={merchantName}>` — screen readers announce "Covelum Restaurant logo".
- Title element `accessibilityRole="header"` — already inherited from `Text variant="heading.md"`.
- Disclaimer banner `accessibilityLabel` reads the full copy.
- Submit button: when loading, `accessibilityState={{ disabled: true, busy: true }}`.
- All tap targets ≥ 44×44pt: PIN boxes (56×64 ✓), submit button (full-width × 56 ✓), close X (existing 44×44 ✓).

---

## 5. PIN sheet — final copy spec (LOCKED 2026-05-09 by owner direction)

**Source of truth:** PRODUCT.md `## Users` + `## Tone` + `## Anti-references` + `## Strategic principles`. See §1.1 for the persona-source decision (no separate persona file located in-repo).

**Locked principles:**
- Confident, plain-spoken. No marketing puffery.
- Trust-first. Redemption mechanics stated precisely.
- Calm and customer-friendly, but NOT at the cost of hiding the consequence.
- Avoid punitive / legalistic framing: "cannot be undone", "permanently", "irreversible", "warning", "by confirming, you agree…".
- Avoid locked-away framing: "your voucher is locked", "the voucher is gone".
- Avoid vague forward-look: "it refreshes next cycle" by itself is too soft if it's the only consequence statement.
- Avoid internal-jargon: "staff handoff code" reads as product-team shorthand, not customer-facing.
- Em dashes (—, –) banned. Hyphens for compound modifiers only.
- British English.

**Customer goals the copy must serve (per PRODUCT.md `## Users`):**
- Quick orientation — *"is this voucher for me, what does it save, where do I redeem, can I redeem it now."*
- Trust — sceptical of voucher apps that bury terms in legalese; precision is reassurance.
- In-store context — staff are physically present at the redemption moment.

**Facts the customer must take away from the PIN sheet:**
1. Ask staff for the 4-digit PIN (the one action they need to take next).
2. Confirming the correct PIN redeems this voucher (the unambiguous consequence).
3. The redemption is for this cycle (the cycle-bound consequence — explicit, not vague).
4. The app creates the code staff can check (the mechanic, in plain words).
5. They should only continue when ready to use the voucher (the calm gate).

The locked copy below covers all five facts without legalistic phrasing.

### 5.1 Subtitle (above PIN keypad) — LOCKED

**Line 1:** `Ask staff at {merchantName} for their 4-digit PIN.`

- Anchors the in-store context (staff are present, customer is at the merchant).
- Plain instruction, no flourish. Matches PRODUCT.md `## Tone` *"confident, plain-spoken."*
- Branch context is implicit because the sheet was opened from a specific branch.

**Line 2:** `When you confirm it, we'll create the code staff can check.`

- Explains the mechanic precisely (PRODUCT.md `## Tone` *"trust-first. Redemption mechanics stated precisely"*).
- Drops internal jargon: previous draft used "staff handoff code"; revised to "the code staff can check" — describes what the staff DO with it, in plain customer-facing words.
- "We'll create" (cooperative, forward-looking, instructive). Sets the expectation that it's instant — which the loading spinner backs up.

**Alternatives considered (rejected):**

| Candidate | Reason rejected |
|-----------|-----------------|
| ❌ "Once you enter it, your voucher is locked in for this cycle." | Owner-clarification 1: feels like the voucher is being locked AWAY from the user. |
| ❌ "We'll create your staff handoff code as soon as you confirm." | "Staff handoff code" reads as internal product-team jargon, not customer-facing language. |
| ❌ "Entering the PIN redeems your voucher and uses it for this cycle." | Too transactional; obscures the staff-handoff mechanic. |
| ❌ "Tap your PIN to redeem." | Too sparse; fails the "trust-first / precision" PRODUCT.md tone test. |

### 5.2 Disclaimer banner — LOCKED

**Body (single paragraph, `body.md` 16 with line-height 24):**

> `Confirming the correct PIN redeems this voucher for this cycle. Continue when you're ready to use it.`

- **Sentence 1 — the consequence, stated explicitly:** "Confirming the correct PIN redeems this voucher for this cycle." Trust-first precision per PRODUCT.md `## Tone`. The cycle-bound nature is on the surface, not buried. "The correct PIN" sets the right contract — wrong PINs do not redeem.
- **Sentence 2 — the calm gate:** "Continue when you're ready to use it." Customer-friendly. No "warning". No "cannot be undone". Reads as polite reassurance that the customer is in control of the timing. Aligns with PRODUCT.md `## Tone` *"plain-spoken"* + serves the customer-goal of *"can I redeem it now."*
- **Total length: 16 words.** Reads in one breath. Fits comfortably on 3 lines at `body.md` 16 on iPhone SE width.
- **Cycle-rollover messaging deliberately scoped here:** the brief DOES NOT include "It refreshes next cycle." inside the disclaimer banner. Reasoning:
  - The Voucher Detail screen (parent of this PIN sheet) already surfaces `CycleRulesCard` which spells out the next-cycle availability with the actual renewal date. Repeating it on the PIN sheet adds noise without adding information.
  - Per PRODUCT.md `## Strategic principles` rule 6 (*"backend-driven"*), cycle date is data-driven and lives where the data lives. Sticking soft "it refreshes next cycle" copy on the PIN sheet would compete with the precise dated message already on screen.
  - Owner-direction 2026-05-09 explicitly flagged "it refreshes next cycle" as too vague to be the closing line of the disclaimer.

**Alternatives considered (rejected):**

| Candidate | Reason rejected |
|-----------|-----------------|
| ❌ "Confirming this PIN locks your voucher for the current cycle. The redemption code we generate is your handoff to staff." | Owner-clarification 1: "locks your voucher" reads as punitive. "Handoff to staff" still leans on internal jargon. |
| ❌ "Confirming the PIN redeems your voucher and creates the code staff will check. It refreshes next cycle." | Owner direction 2026-05-09: "it refreshes next cycle" too vague as a closing line; CycleRulesCard already covers cycle date. |
| ❌ "Confirming the correct PIN redeems this voucher for this cycle and creates the code staff will check. Continue when you're ready to use it." | Owner-suggested softer two-clause form. Excellent in isolation, but at `body.md` 16 the line wraps to 4 lines on iPhone SE width and the disclaimer banner starts to dominate. The locked one-clause form (16 words vs 25) reads as weight-appropriate for the surface. **Documented as the fallback if on-device QA shows the locked form reads as too clipped.** |
| ❌ "By confirming, you redeem this voucher. It cannot be redeemed again until next cycle." | "Cannot be redeemed" negation-framed; PRODUCT.md `## Anti-references` (NOT a typical food-delivery coupon UI: throwaway promo language) rules this out. |
| ❌ "Your voucher will be marked used after this PIN is confirmed. Save again next cycle!" | "Save again next cycle!" reads like marketing puffery — PRODUCT.md `## Tone` explicitly bans. |

### 5.3 §AH note (renews vs expires)

The locked disclaimer copy intentionally does NOT condition on `expiryDate < availableAgainAt` ("if still valid"). Per CLAUDE.md memory and the §AH locked workstream, voucher expiry / merchant-set offer end is a Phase 4 dependency. Current seed has `Voucher.expiryDate === null` so the conflict cannot manifest today. PR-A copy is correct for today's data model. When §AH lands, the PIN sheet may gain a conditional second-line variant for final-cycle vouchers (e.g. "Offer ends on \<date\>"); the brief here is forward-compatible because the locked sentence 1 ("redeems this voucher for this cycle") still holds in the final-cycle case.

### 5.4 Title — LOCKED

`Enter Branch PIN` — unchanged. Direct, unambiguous, scannable. `heading.md` (18).

### 5.5 Submit button (idle state) — LOCKED

`Confirm` — single word. `body.md` (16), Lato-SemiBold, white on brand-gradient.

| Candidate | Reason rejected |
|-----------|-----------------|
| ❌ `Redeem voucher` | Overlaps with the disclaimer banner; redundant. |
| ❌ `Submit PIN` | Transactional; reads like a form submit, not an action. |
| ❌ `Confirm and redeem` | Long; truncates on iPhone SE width at the bumped type size. |

### 5.6 Submit button (loading state) — LOCKED, see §6

Per Owner-clarification 2 (lightweight, not heavy), see §6 for the locked spec.

### 5.7 Error states (existing; PR-A preserves verbatim)

The existing INVALID_PIN, PIN_RATE_LIMIT_EXCEEDED, PIN_NOT_CONFIGURED, BRANCH_UNAVAILABLE, BRANCH_MERCHANT_MISMATCH, PHONE_NOT_VERIFIED, SUBSCRIPTION_REQUIRED, VOUCHER_NOT_FOUND error copy is **out of scope for PR-A** (preserved verbatim). It was last touched in PR #45 and locked there. Non-regression test pin in `pin-entry-sheet.test.tsx` ensures no accidental change.

### 5.3 Title — locked

`Enter Branch PIN` — unchanged. Direct, unambiguous, scannable. heading.md (18).

### 5.4 Submit button (idle state) — locked

`Confirm` — single word. `body.md` (16), Lato-SemiBold, white on brand-gradient.

**Alternatives considered (rejected):**
- ❌ `Redeem voucher` — overlaps with the disclaimer banner; redundant.
- ❌ `Submit PIN` — transactional; reads like a form submit, not an action.
- ❌ `Confirm and redeem` — long; truncates on iPhone SE width at the bumped type size.

### 5.5 Submit button (loading state) — locked, see §6

Per Owner-clarification 2 (lightweight, not heavy), see §6 for the locked spec.

### 5.6 Error states (existing; PR-A preserves verbatim)

The existing INVALID_PIN, PIN_RATE_LIMIT_EXCEEDED, PIN_NOT_CONFIGURED, BRANCH_UNAVAILABLE, BRANCH_MERCHANT_MISMATCH, PHONE_NOT_VERIFIED, SUBSCRIPTION_REQUIRED, VOUCHER_NOT_FOUND error copy is **out of scope for PR-A** (preserved verbatim). It was last touched in PR #45 and locked there. Non-regression test pin in `pin-entry-sheet.test.tsx` ensures no accidental change.

---

## 6. PIN sheet — loading state spec (A3, per Owner-clarification 2)

**Locked principle:** lightweight, fast-feeling, NOT "payment-processing heavy". The mutation typically completes in 200ms–2s. The spinner's job is to confirm the app is working, not to ceremoniously stage the redemption.

### 6.1 Visual spec

When `isLoading === true`:

- Submit button content swaps inline:
  - Text `Confirm` (body.md, white, Lato-SemiBold)
  - → swaps to: `<PulsingDot color="white" size={6} />` + `Confirming…` (body.md, white, Lato-SemiBold).
  - Gap between dot and label: `spacing[2]` (8).
- **Pulsing dot is small (size 6, NOT size 8 originally proposed).** Reduces visual weight. The dot pulses at the existing PulsingDot rhythm (≈ 1.2s cycle). NOT a spinning loader, NOT a progress bar, NOT a percentage indicator.
- Button background gradient stays exactly as idle. **No darkening, no opacity drop, no gradient shift.** The user sees the same button surface, with content swapped — implying continuity and speed.
- Button height stays `56` — no shift. Sheet stays geometrically stable; nothing reflows.

### 6.2 Interaction spec

- **Repeat-submit blocked at three layers (defense-in-depth):**
  1. `disabled` prop on the button (existing — `isLoading || isLocked || digits.length < 4`).
  2. `submittedRef.current = true` guard (existing PR #44 pattern preventing double-fire on the same digit-set).
  3. `pointerEvents="none"` on the button container while `isLoading` (NEW in PR-A — even if the disabled prop somehow fails on a specific RN version, taps don't reach the handler).
- **Sheet stays stable:** no scrim, no overlay, no modal-on-modal. The sheet keeps its existing 50% scrim, the button content swaps in place, the user can still see the masked PIN digits above (intentional — they can verify what they sent if they need to retry).
- **Cancel path:** the close X (top-right of sheet) remains tap-active during loading. If the user hits close mid-mutation, the sheet dismisses immediately and the parent's `onDismiss` fires. The mutation continues in the background; if it succeeds, the SuccessPopup mounts normally (existing M2 behaviour preserved). If it errors, the toast/error path absorbs it without re-opening the sheet.
- **No timeout overlay.** The existing 30s `react-query` timeout fires error-state if the mutation hangs; the spinner clears, error bar appears.

### 6.3 Copy

`Confirming…` — three syllables, single word, ellipsis carrying the "in-progress" implication. NO dramatic alternatives:
- ❌ `Processing your redemption…` — heavy, payment-processing-feel.
- ❌ `Validating PIN with branch…` — implies a multi-step backend pipeline that may worry the user.
- ❌ `Redeeming your voucher, please wait…` — long, blocks the eye, "please wait" feels apologetic.
- ❌ `Working on it…` — informal but vague. `Confirming…` is more accurate.

### 6.4 Motion spec (per Emil Kowalski / interaction-design)

- **No content-swap animation.** The transition from `Confirm` → `Confirming… [dot]` is instant (0ms). Animating the swap would draw attention to the loading state itself; we want the opposite — make it pass quickly.
- **PulsingDot uses its existing rhythm.** Already locked at 1.2s cycle, opacity 0.4 → 1.0 → 0.4. Hardware-accelerated transform/opacity only. No layout-property animation. Reduced motion: PulsingDot already respects the system flag (existing M3 behaviour preserved).
- **Button press feedback unchanged.** Existing `:pressed` state (`scale(0.97)` if implemented, otherwise opacity 0.85) preserved.
- **No success animation between `Confirming…` and SuccessPopup mount.** The SuccessPopup's existing entrance animation (320ms ease-out-expo from §M2 wave 14) IS the transition. Layering a "PIN confirmed!" check onto the button before the popup mounts would add ~300ms of perceived wait — opposite of "fast-feeling".

### 6.5 Error transition

When `isLoading: true → false` AND `error !== null`:
- Spinner content collapses back to `Confirm` (instant swap).
- Existing wrong-PIN shake (±6 / ±3 px, 400ms ease-in-out) fires.
- Existing clear-digits + error-bar render fires.
- Submit button returns to enabled state (per existing logic).
- **No additional motion.** The error feedback is the existing PR #44 / PR #45 contract; PR-A doesn't change it.

---

## 7. SuccessPopup — saving callout final spec (A4)

### 7.1 Composition

Insert a new strip between the existing `<View style={styles.context}>` (voucher title + merchant) and `<View style={styles.codeBox}>` (code hero).

```
┌─────────────────────────────────────────┐
│  [type-pastel accent row + "Redeemed"]   │  ← unchanged
│                                         │
│     2-for-1 Brunch                      │  ← contextTitle bumped to heading.sm (16)
│     Covelum Restaurant                  │  ← contextMerchant body.sm (14)
│                                         │
│  ┌──────────────────────────────────┐   │  ← NEW: saving callout
│  │   You saved   £6.99              │   │     savings-green tint, savings-green
│  └──────────────────────────────────┘   │     border, label.lg + heading.md
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  YOUR REDEMPTION CODE            │   │  ← code hero unchanged
│  │  A7K2 P9X4                       │   │     mono.redemption (28)
│  │  Live: 09 May 2026 · 14:24:38   │   │     timestamp body.sm (14, was label.md)
│  └──────────────────────────────────┘   │
│                                         │
│  ... receipt rows ...                   │  ← unchanged (info rows)
│  ... CTAs ...                           │  ← UNCHANGED in PR-A (defensive pin)
└─────────────────────────────────────────┘
```

### 7.2 Visual decisions locked

- **Background:** `color.savings.greenTint` if exists in token set, otherwise `rgba(76, 175, 80, 0.08)` — savings-green at 8% alpha over cream. (Token name to confirm during implementation; if not present, add as `color.savings.tint` rather than ad-hoc inline rgba.)
- **Border:** 1px `color.savings.green` at 14% alpha. Subtle definition, no harsh outline.
- **Border radius:** `radius.md` (12).
- **Padding:** vertical `spacing[3]` (12), horizontal `spacing[4]` (16).
- **Layout:** horizontal flex row, `justifyContent: 'center'`, `alignItems: 'baseline'`.
- **Label `You saved`:** `label.lg` (14), `color.savings.green`, Lato-Medium, letter-spacing 0.2.
- **Amount `£X.XX`:** `heading.md` (18), `color.savings.green`, Lato-SemiBold, `fontVariant: ['tabular-nums']`.
- **Gap between label and amount:** `spacing[2]` (8).
- **Outer margin:** `spacing[4]` (16) top from context strip; `spacing[4]` (16) bottom to code hero. Density-with-scale per §0.8.

### 7.3 Decisions deliberated + locked

**Q:** Should the saving amount be the visual hero (compete with the code)?
**A:** **No.** The code IS the staff-handoff trust signal — anti-fraud requirement from M3. The saving is a confirmation of value, not the moment. Amount `heading.md` (18) sits comfortably below the `mono.redemption` (28) hierarchy.

**Q:** Should `£0.00` saving render the callout?
**A:** **No.** Suppress the callout entirely if `estimatedSaving === 0` — there's nothing celebratory about zero savings, and it would read as a bug. Test pin: `pin: 'estimatedSaving === 0 hides callout'`.

**Q:** What about `estimatedSaving < 0` (theoretically impossible but defensive)?
**A:** Suppress. Same logic as zero. Backend always coerces via `z.coerce.number()`; if for any reason a negative leaks through, hide rather than surface.

**Q:** Currency formatting — locale-aware or hardcoded GBP?
**A:** **Hardcoded `£` prefix + `.toFixed(2)`** for PR-A. Reasoning:
- Redeemo is UK-only (CLAUDE.md project context, "UK-based digital marketplace").
- Locale-aware currency formatting via `Intl.NumberFormat` is fragile on Hermes (per §AG2 Hermes-CLDR rule). Even if it worked today, the de-facto standard pattern in this codebase is `£${value.toFixed(2)}` — see CycleRulesCard, BannerCard, etc.
- A future i18n workstream would touch this token-by-token; not worth pulling forward into PR-A.

### 7.4 Live timestamp tweak (related — same surface)

The live ticking timestamp (line 311, currently `label.md` 12) is bumped to `body.sm` (14) per §3.3 audit. Rationale:
- Per Owner-clarification on §0.8 readability, timestamps inside the code-hero box need to be readable enough that staff can verify the second-counter is moving (the screenshot-detection trust signal). 12pt was too tight against the 28pt code.
- `body.sm` (14) sits just below `body.md`, reads comfortably without competing.

This is a SCOPED bump WITHIN A4 — same surface, same redesign moment. Not scope creep; the timestamp lives inside the code box that's part of the SuccessPopup polish.

---

## 8. Density & spacing rhythm (per §0.8)

**Locked principle:** when type goes up, padding + line-height + margin go up too. Never bump font size alone.

### 8.1 PIN sheet — density-with-scale audit

| Element | Current padding | Bumped padding | Reason |
|---------|----------------|----------------|--------|
| Sheet outer padding | `spacing[5]` (20) | `spacing[5]` (20) | Existing horizontal padding works — no change |
| Header block bottom margin | `spacing[5]` (20) | `spacing[6]` (24) | Title bumped one step → margin bumps |
| Subtitle to PIN-boxes gap | `spacing[5]` (20) | `spacing[6]` (24) | Subtitle bumped → density-with-scale |
| PIN-boxes to disclaimer gap | `spacing[5]` (20) | `spacing[6]` (24) | Disclaimer bumped → density-with-scale |
| Disclaimer banner inner padding | `spacing[3]` (12) | `spacing[4]` (16) | Body text bumped → padding bumps |
| Disclaimer to submit gap | `spacing[4]` (16) | `spacing[5]` (20) | Comfort breathing space below the banner |
| Submit button vertical padding | (existing) | `spacing[4]` (16) | Inside button at body.md text |

### 8.2 SuccessPopup — density-with-scale audit

| Element | Current | Bumped | Reason |
|---------|---------|--------|--------|
| Voucher title bottom margin | `spacing[1]` (4) | `spacing[2]` (8) | Title bumped to heading.sm → margin bumps |
| Context strip to saving callout | n/a (NEW) | `spacing[4]` (16) | New element; clean break |
| Saving callout to code box | n/a (NEW) | `spacing[4]` (16) | New element; clean break |
| Saving callout inner padding | n/a (NEW) | `12 / 16` v/h | Comfortable for `heading.md` amount |

**Cumulative effect:** SuccessPopup grows by ~80–100pt vertical (saving callout adds ~60pt; misc bumps add ~30–40pt). Need to confirm the popup still fits comfortably above the keyboard / safe areas on iPhone SE 2nd gen (smallest target). On-device QA validates.

### 8.3 PIN sheet cumulative growth

PIN sheet grows by ~60–80pt vertical (header bumps ~20pt; PIN box gap and size ~10pt; disclaimer bump ~15pt; submit ~8pt; gap bumps ~20pt). Sheet uses the existing `BottomSheet` design-system component which auto-adjusts to content height; growth is absorbed.

---

## 9. Accessibility & touch targets (per §0.8)

- All interactive elements ≥ 44×44pt.
- PIN boxes: 56×64 ✓.
- Submit button: full-width × min-height 56 ✓.
- Sheet close X: 44×44 ✓ (existing).
- Logo image: not interactive; no touch target requirement, but `accessibilityLabel={merchantName}` for screen readers.
- Disclaimer banner: `accessibilityRole="alert"` is OVERKILL — it's not an alert, it's an info banner. Use default `text` role; the Lock icon has `accessibilityElementsHidden={true}`.
- Saving callout: `accessibilityLabel="You saved £{amount} pounds"` for screen readers (composes the visual label + amount into one announcement).
- Live timestamp: `accessibilityLiveRegion="polite"` already set on the existing `<Text>`; preserved.

**Dynamic Type test cases (encoded in test suite per §0.8):**

| iOS setting | Expected behaviour |
|-------------|-------------------|
| Default | Specs above |
| Larger | All text scales by `maxFontSizeMultiplier=1.4`; layout absorbs |
| Larger 4/6 | Capped at multiplier 1.4; no truncation; PIN sheet may need to scroll if it exceeds viewport (BottomSheet handles this) |
| Reduce Motion ON | PulsingDot stops animating (existing PulsingDot behaviour); button shows static dot + "Confirming…" |

---

## 10. On-device readability checklist (per §0.8 — required before PR-A merge)

PR-A's PR description must include this checklist filled in. Simulator-only verification does NOT count.

| # | Device | Action | Pass criteria |
|---|--------|--------|---------------|
| 1 | iPhone SE 2nd/3rd gen OR iPhone 13 mini (physical) | Open PIN sheet for Covelum voucher | Logo readable, merchant name not truncated, subtitle 2-line wrap clean, disclaimer banner fits without horizontal scroll |
| 2 | Same | Type 4 digits → submit | Spinner appears within 50ms of tap, button stays geometrically stable, no layout shift |
| 3 | Same | Force wrong PIN | Shake fires, error bar legible at body.sm 14 |
| 4 | Same | Successful redeem | SuccessPopup mounts, saving callout legible, code hero dominates visually |
| 5 | Same | Settings → Display → Text Size = Larger | Surfaces above re-tested, no truncation |
| 6 | iPhone 14 Pro / 15 / 15 Plus (physical) | Same 5 checks | Surfaces feel proportional, not too sparse |
| 7 | Pixel 6 / 7 (physical) | Same 5 checks | Android FLAG_SECURE on Show-to-Staff still works (regression check) |
| 8 | Any device | VoiceOver / TalkBack on | All elements announced correctly with the new accessibility labels |
| 9 | Any device | Reduce Motion ON | PulsingDot static; SuccessPopup entrance still works |

---

## 11. Out of scope (PR-A — explicit reminders from §0/§3a)

| Item | Where it lands |
|------|---------------|
| SuccessPopup Rate & Review CTA hierarchy bump | PR-C |
| Rate & Review routing wire-up | PR-C |
| Verified-redemption review backend | PR-C |
| WriteReviewSheet `fromRedemptionId` plumb-through | PR-C |
| ReviewCard verified badge | PR-C |
| Confetti animation on SuccessPopup | PR-B |
| PIN sheet full layout/typography redesign (beyond §3.2 bumps) | PR-B |
| Voucher Detail redeemed-state polish (seal, washed-out hero) | PR-B |
| Merchant-profile voucher-card redeemed treatment | §Q4 deferred |
| Merchant email notification | §AE deferred / Phase 6 |
| TIME_LIMITED voucher availability windows | M4 separate plan |
| §AH renews-vs-expires copy hierarchy | Phase 4 / Merchant Portal |

---

## 12. Approval gates

This shape brief must be approved by the owner before:
1. Commit 1 (this brief committed to git as `chore(voucher): commit shape brief …`).
2. Any TSX file edit on `PinEntrySheet.tsx`, `SuccessPopup.tsx`, `VoucherDetailScreen.tsx`.

**Decisions the owner is asked to confirm before approval:**

| # | Decision | Locked value | Status |
|---|----------|--------------|--------|
| D1 | Subtitle line 1 + 2 final wording | Line 1: `Ask staff at {merchantName} for their 4-digit PIN.` + Line 2: `When you confirm it, we'll create the code staff can check.` | **LOCKED 2026-05-09** by owner direction. Grounded in PRODUCT.md `## Users` + `## Tone`. |
| D2 | Disclaimer banner copy | `Confirming the correct PIN redeems this voucher for this cycle. Continue when you're ready to use it.` | **LOCKED 2026-05-09** by owner direction. Two-clause softer fallback documented in §5.2 if on-device QA shows the locked form reads too clipped. |
| D3 | Submit button idle copy | `Confirm` | **LOCKED 2026-05-09** |
| D4 | Submit button loading copy | `Confirming…` + small pulsing dot | **LOCKED 2026-05-09** |
| D5 | Logo size 48×48 (not 40×40) | 48×48 per §0.8 readability | **LOCKED 2026-05-09** |
| D6 | PIN box size 56×64 (was 54×60) + gap 14 (was 12) | 56×64, gap 14 per §0.8 density-with-scale | **LOCKED 2026-05-09** |
| D7 | Type-scale bumps per §3.2 + §3.3 | All bumps from existing scale; no new variants | **LOCKED 2026-05-09** |
| D8 | Live timestamp bump from `label.md` 12 → `body.sm` 14 | Bump per §0.8 readability | **LOCKED 2026-05-09** |
| D9 | Saving callout suppression rule (`estimatedSaving <= 0` hides) | Suppress | **LOCKED 2026-05-09** |
| D10 | Currency formatting `£${amount.toFixed(2)}` (hardcoded GBP) | Hardcoded; locale-aware deferred to future i18n workstream | **LOCKED 2026-05-09** |

**All decisions D1–D10 LOCKED 2026-05-09 by owner approval. Brief is now binding for PR-A commits 2–6.**

---

**End of shape brief. Awaiting owner approval before commit + production code.**
