# Customer Redemption Polish Pass — Plan

> **Status:** REV 2 — owner decisions locked 2026-05-09. PR-A file-level plan pending review (§3a). No implementation begins until §3a is reviewed.
> **Date:** 2026-05-09
> **Tier mix:** Tier 1 quick polish PR, Tier 2 design-pass PRs (each via `/impeccable` + `/ui-ux-pro-max`), explicit deferrals.
> **Predecessor:** PR #49 (M3 Show-to-Staff) + PRs #53/54/55 (§AG hardening) — all merged.
> **Related deferred-followups:** §P3 confetti, §P4 PIN backend-error routing, §Q1–Q5 redeemed-state visual pass, §R3 Rate & Review routing, §S2 SuccessPopup polish, §AE merchant notifications, §AH renews-vs-expires hierarchy.

---

## 0. Owner decisions (LOCKED 2026-05-09 — supersedes draft §2/§3 below)

The original §2/§3 sections are preserved as the deliberation audit trail. Where they conflict with the locked decisions in this section, **this section wins**.

### 0.1 — Tier split: APPROVED as drafted

PR-A (Tier 1 quick polish) → PR-B (Tier 2 design pass) → PR-C (Tier 2 verified-review backend) confirmed.

### 0.2 — Sequencing: APPROVED with one critical correction

**The Rate & Review CTA must NOT go live until PR-C lands.** Any review submitted via that CTA before PR-C exists loses its `redemptionId` linkage permanently — it cannot be retroactively attributed because the schema column doesn't exist yet. That's worse than a UX gap; it's a permanent data-quality hole.

Owner direction: *"PR-A's Rate & Review routing must not become a dead-end or misleading half-step."*

**Resolution: A5 (CTA hierarchy bump) and A6 (routing wire-up) move out of PR-A entirely. They land together in PR-C, the moment the backend can store the linkage.**

Revised PR scope split:

| PR | Tier | Scope | Visible Rate & Review CTA state |
|----|------|-------|---------------------------------|
| **PR-A (revised)** | T1 | A1 PIN logo, A2 PIN copy, A3 PIN spinner, A4 SuccessPopup saving | UNCHANGED — existing dead-end behaviour preserved (current code: tap → dismiss popup). Defensive pin against accidental wire-up. |
| **PR-C (revised)** | T2 | Schema migration, backend validation, ReviewCard verified badge, **A5 + A6 moved here** (CTA hierarchy + routing wire-up + WriteReviewSheet `fromRedemptionId` plumb-through + RedemptionDetailsCard Rate & Review entry point) | GOES LIVE — CTA elevated visually, routes to verified-review path. |
| **PR-B** | T2 | PIN full design pass, SuccessPopup confetti, Voucher Detail redeemed-state polish | unchanged from draft |

**Sequencing now reads: PR-A → PR-C → PR-B.** The design pass (PR-B) runs LAST because it can polish the now-final Rate & Review CTA visual in its proper home.

### 0.3 — Verified-review rule: REVISED per owner

The draft section §3 (PR-C, Open Question Q1) proposed requiring `isValidated === true`. **Owner override: do NOT require staff validation.** Many merchants validate later or never — gating verified-review on staff action would lock customers out of their own redemption-attribution.

**Locked verified-review semantics:**

`review.isVerified === true` IF AND ONLY IF all five conditions hold:

1. The review has a non-null `redemptionId`.
2. The redemption belongs to the authenticated customer (`redemption.userId === review.userId`).
3. The redemption's branch matches the review's target branch (`redemption.branchId === review.branchId`).
4. The redemption's merchant/voucher context matches the review's target (i.e. the redemption's `voucher.merchantId` matches the merchant the review's branch belongs to).
5. The redemption was successfully created through the app (it exists in `VoucherRedemption` with the standard guards passed — no pending/failed states).

`isValidated === true` is a STRONGER signal but explicitly NOT required. Staff validation may happen later or never; that does not invalidate the customer's verified-review claim.

**Future optional field (out of scope here):** a separate `verifiedByStaffValidation` flag could surface the stronger signal in a future review-trust UX layer (e.g. a darker-green "Verified at counter" badge alongside the standard "Verified redemption" badge). Not needed now; tracked as deferred-followup.

**Backend validation logic (revised):**
- `createOrUpdateReview` — accept optional `redemptionId`. If provided:
  - Lookup `VoucherRedemption` by id, scoped to `userId === req.user.sub` (404 with `REDEMPTION_NOT_FOUND` if no match — avoids leak).
  - Verify `redemption.branchId === branchId` param (else `REDEMPTION_BRANCH_MISMATCH`).
  - Verify `redemption.voucher.merchantId === branch.merchantId` (else `REDEMPTION_MERCHANT_MISMATCH`).
  - **No `isValidated` check.** The redemption row's existence + ownership + branch/merchant alignment is the verification.
  - Persist `redemptionId` on the review row.
- `getMerchantReviews` — include `isVerified: review.redemptionId !== null` in the response shape.

This means the backend's `isVerified` derivation is mechanical: presence of a valid `redemptionId` linkage. No additional state to track.

### 0.4 — Show-to-Staff Rate & Review entry: NOT ADDED

Confirmed. Show-to-Staff is the in-store handoff surface; pulling customer attention to a Rate CTA there competes with the staff interaction. Documented as hard-pass in §3 deferred items.

### 0.5 — Skills: APPROVED `/impeccable` + `/ui-ux-pro-max` for all polish + design

Confirmed for:
- PIN sheet layout/copy hierarchy (PR-A A1+A2+A3 shape brief; PR-B B1 full design pass).
- SuccessPopup hierarchy/animation/CTA treatment (PR-A A4 saving placement; PR-C A5 CTA elevation; PR-B B2 confetti).
- Voucher Detail redeemed-state polish (PR-B B3).

Every visual + copy decision passes through both skills before code is written. Code mutation begins only after the shape brief is owner-approved.

### 0.6 — Merchant email notification: APPROVED to defer

Item #5 from the original ask is its own workstream (Phase 6 / §AE dependency). SMS not preferred. Merchant app + push are Phase 4. Removed from this plan's PR scope.

### 0.7 — PR-A file-level plan: PENDING REVIEW

See §3a below. No implementation begins on PR-A until §3a is reviewed and approved.

### 0.9 — SuccessPopup composition: code REMOVED, simplified celebration (LOCKED 2026-05-09)

After on-device QA mid-PR-A, owner direction shifted: **the redemption code does NOT belong on the SuccessPopup**.

**Rationale:**

1. **Strengthens the §AB / §AE5 anti-fraud architecture.** The trust signal is the *live* Show-to-Staff screen (animated border, pulsing LIVE dot, ticking en-GB datetime, validated chip, screen-capture protection). A static popup can't carry those signals. Having the code on a popup creates a screenshot-friendly surface that bypasses the live-screen protection.
2. **Resolves duplication.** The code currently appeared on three surfaces (SuccessPopup, ShowToStaff, RedemptionDetailsCard). Removing it from the popup leaves it on the two surfaces where it actually belongs — the dedicated live screen and the persisted return-visit card.
3. **Cleaner mental model.** SuccessPopup confirms the redemption happened. The code lives on the dedicated screen the customer opens with one tap.

**Locked composition for the SuccessPopup (PR-A revised):**

| Element | State |
|---------|-------|
| Type-pastel accent row + check ring + "Redeemed" label + type chip | UNCHANGED |
| Voucher title + merchant name strip | UNCHANGED |
| Saving callout (`You saved £X.XX`) | UNCHANGED (A4 from earlier in PR-A) |
| Receipt rows (`Redeemed on`, `Branch`) | UNCHANGED — these stay; they confirm what + where |
| **Redemption code box** (`YOUR REDEMPTION CODE` + 4+4 code) | **REMOVED** |
| **Live timestamp ticker** | **REMOVED** (only existed as anti-fraud signal alongside the code) |
| **Anti-fraud disclosure** ("Staff scan or type this code from the Show to Staff screen.") | **REMOVED** (no code here, no need to disclose handoff mechanics) |
| **Title eyebrow** "Redeemed" | **REPLACED** — see §0.11 |
| Primary CTA | RENAMED — see §0.10 |
| **Rate & Review CTA** | **HIDDEN in PR-A**; reintroduced in PR-C with verified-review backend wire-up. See §0.2: PR-A must NOT present a CTA that doesn't actually route. |
| Done CTA | UNCHANGED |
| `useScreenCaptureProtection` hook | **REMOVED** (locked 2026-05-09 mid-implementation). Once the code is no longer rendered on this surface, SuccessPopup is no longer a sensitive code surface — there is nothing for screen-capture protection to guard. Code surfaces (`ShowToStaff`, `VoucherDetailScreen` while code is visible) keep their protection unchanged. |

**Implication for tests:** all existing pins on the code rendering, live timestamp, disclosure copy, Rate & Review CTA, AND screen-capture protection lifecycle (prevent on visible / allow on hide / cleanup-on-unmount) are removed or repurposed. New defensive pin: SuccessPopup MUST NOT render the code, live timestamp, OR install useScreenCaptureProtection (regression guard).

**Cross-ref deferred-followups:** the §AB iOS live-screen-trust framing and §AE6 / §AE6.2 protections on the code surfaces (ShowToStaff + Voucher Detail) are unchanged — those still install both `useScreenCaptureProtection` AND `useScreenshotGuard` as the locked anti-fraud architecture.

### 0.11 — SuccessPopup title: "Redeemed" → "Voucher redeemed successfully" (LOCKED 2026-05-09)

The previous accent-row eyebrow `Redeemed` (label.lg uppercase tracked) was too terse for the moment. Replaced with the explicit success statement `Voucher redeemed successfully`.

This sits in the accent row as the popup title (variant + sizing audited during implementation against §0.8 readability + density-with-scale; aim is for the title to read clearly at the top of the popup without competing with the saving callout).

Accessibility label on the popup wrapper updates to match: `"Voucher redeemed successfully"` (already the existing label).

### 0.12 — Show-to-Staff improvements: deferred to PR-B (LOCKED 2026-05-09)

Owner-requested Show-to-Staff polish surfaced during PR-A QA. Five items:

1. Move content down from the iPhone Dynamic Island / top safe area
2. Add the merchant logo
3. Add Redeemo branding (subtle / washed-back) so merchants see it as a Redeemo verification surface
4. Add the voucher description so staff can confirm what offer is being claimed
5. Keep code/QR as the main focus; supporting details support the code, not crowd it

**Classification: PR-B (Tier 2 design pass).**

**Rationale:**

- None of these are *required* to support the new "View voucher code" CTA. PR-A only changes WHICH CTA opens the Show-to-Staff screen, not what's on the screen.
- All five are visual / branding / spacing improvements — exactly the shape of work `/impeccable` + `/ui-ux-pro-max` shape briefs are for. Bundling into the existing PR-B design pass keeps the design work coherent (PR-B already covers PIN sheet full layout, SuccessPopup confetti, and Voucher Detail redeemed-state polish).
- Show-to-Staff is the load-bearing anti-fraud surface (§AB / §AE5 / §AE6). Adding merchant logo + voucher description + branding requires a layout audit that doesn't compromise the live-trust signals (animated border, pulsing LIVE dot, ticking datetime, validated chip). That's design-pass work, not Tier 1 polish.
- PR-A is already extending past its original scope; further expansion risks ballooning review surface.

**PR-A leaves Show-to-Staff visually unchanged.** The screen content stays as M3 shipped it. The CTA leading INTO the screen (from SuccessPopup + RedemptionDetailsCard) renames to `View voucher code`; the screen TITLE stays `Show to Staff` (per §0.10).

PR-B will pick up these five items as a dedicated Show-to-Staff design pass alongside the existing PR-B scope.

### 0.10 — CTA rename: "Show to Staff" → "View voucher code" (LOCKED 2026-05-09)

The CTA wording shifts to a customer's POV. "Show to Staff" carried the staff-perspective framing; "View voucher code" frames the action from the customer's perspective using the consumer-friendly word "voucher" (matches PRODUCT.md / customer-app domain language throughout).

**Affected surfaces (audit):**

| Surface | Old | New |
|---------|-----|-----|
| `SuccessPopup` primary CTA | `Show to Staff` | `View voucher code` |
| `RedemptionDetailsCard` CTA | `Show to Staff` | `View voucher code` |
| `RedemptionDetailsCard` in-window helper line | `Available to show staff until <date>.` | `Your voucher code is available until <date>.` |
| Accessibility labels on the above | match new copy | — |
| Test fixture pins for the above | match new copy | — |

**Untouched:**

- **`ShowToStaff` screen title — keep `Show to Staff`.** When the customer is *on* the screen with their code visible, "Show to Staff" reads as a clear instruction *to the customer about what to do next* (physically show the screen). The customer-friendly framing applies to the CTA leading INTO the screen; the screen identity itself stays action-instructive.
- **`useScreenshotGuard` / `useScreenCaptureProtection` internal docstrings + cross-refs to "Show to Staff"** — these are internal API docs / hook references, not customer-facing copy.

### 0.8 — Readability and scale: LOCKED first-class requirement (2026-05-09)

Owner direction: device QA has surfaced typography that feels too small / hard to read on real iPhones. **Readability and scale are now a first-class design requirement for this entire workstream — not an afterthought, not a per-component polish item.**

**Scope: applies to every surface this plan touches.** Specifically:
- **PIN sheet:** title, merchant/branch context line, helper copy, the 4 PIN indicator boxes, loading-state label.
- **SuccessPopup:** title (`REDEEMED`), redemption code (already 30pt 800), saving amount, live timestamp, receipt details (Redeemed on / Branch rows), CTA labels (`Show to Staff`, `Rate & Review`, `Done`).
- **RedemptionDetailsCard:** redeemed-state messaging, info rows, expiry helper line, expired notice card.
- **Any Rate & Review entry point copy + CTA labels** (introduced in PR-C).

**Locked design rules:**

1. **Use a clear type scale — no one-off random font bumps.** All increases must come from the existing design-system `Text` variants (`label.md`, `body.sm`, `body.md`, `heading.sm`, `heading.md`, etc). If a needed step doesn't exist in the scale, ADD a new variant to the design system before using it ad-hoc. Drift like "let's bump this single string from 13pt to 15pt" is disallowed; the bump goes into the variant.
2. **Hierarchy preservation.** Primary user-facing message is the largest; secondary details are smaller but still comfortable. Tertiary metadata (timestamps, attempts-remaining counters, etc) stays small but never below the design-system `label.sm` floor.
3. **Density increases proportionally with scale.** When type goes up, vertical padding + line-height + margin-between-elements all go up too. Never simply increase font size in a fixed-height container — the screen will feel cramped. Default ratios:
   - `lineHeight: fontSize * 1.40` for body text (matches the wave-6 §AE5 fix at `RedemptionDetailsCard.formatExpiryLine`).
   - Padding scales: when bumping from `spacing.md` to `spacing.lg`, also bump the surrounding container padding by one step.
4. **Accessibility + touch targets preserved.**
   - Minimum tap-target 44×44pt (iOS HIG) and 48×48dp (Android Material) — applies to PIN boxes, CTA buttons, Rate & Review entry, Done dismiss, all sheet headers' close buttons.
   - Dynamic Type support: `allowFontScaling` defaults to true. Test the surface at the system Dynamic Type setting "Large" AND "Extra Large" — both must remain usable without truncation or horizontal overflow.
   - Contrast ratios already pinned by design tokens; verify any new tinted backgrounds against WCAG AA (4.5:1 body, 3:1 large).
5. **Test on real devices, not just simulator.** Each PR's QA gate requires on-device verification on:
   - A smaller iPhone (iPhone SE 2nd/3rd gen OR iPhone 13 mini equivalent — physical screen size, not Simulator scaling).
   - A larger iPhone (iPhone 14 Pro / 15 / 15 Plus equivalent).
   - At minimum one Android device (Pixel 6 / 7 — covers the 6.1"–6.4" Android mainstream).
   Simulator-only QA does not count. Owner-direction reason: simulator anti-aliasing + DPI emulation flatters small type that's unreadable in hand.
6. **`/impeccable` + `/ui-ux-pro-max` shape brief MUST explicitly review:**
   - **Type scale** — does this surface use the shared scale, or is it dropping ad-hoc sizes?
   - **Density** — does padding/line-height match the scale, or does the surface feel cramped at the new sizes?
   - **Readability on a 6.1" phone in hand** — would the label, helper text, timestamp, code, and CTA all read comfortably without squinting?
   The shape brief is rejected if any of these three reviews are missing or marked "TBD".

**Guard against regression:** the locked rules above apply to PR-A, PR-B, and PR-C alike. No PR ships without a documented type-scale + density + on-device readability check in its PR description.

**Type-scale starting baseline (subject to design-system audit during PR-A shape brief):**

Current Redeemo `apps/customer-app/src/design-system/Text.tsx` exposes:
- `label.sm` (10–11pt), `label.md` (12–13pt), `label.lg` (14pt)
- `body.sm` (13–14pt), `body.md` (15–16pt), `body.lg` (17pt)
- `heading.sm` (18–20pt), `heading.md` (22–24pt), `heading.lg` (28pt+)
- `display.sm`, `display.md`

The shape brief audits whether the existing scale has the right step-distance for the surfaces in this plan, and proposes one of:
- (a) **Use existing scale, bump variant assignments.** E.g. PIN subtitle from `body.sm` → `body.md`. No new variants needed.
- (b) **Add 1–2 new variants** if the scale has a gap (e.g. between `heading.sm` and `heading.md`) that's blocking the desired hierarchy.
- (c) **Re-tune the scale globally** — Tier 3 work, NOT in scope for this plan; would be its own dedicated design-system PR.

The likely answer is (a) supplemented by 0–2 (b) additions. (c) is an explicit escape valve only invoked if the shape brief surfaces a structural problem.

---

## 1. Owner ask (verbatim scope)

Five items, classify Tier 1 / Tier 2 / Deferred and propose sequencing:

1. **Enter Branch PIN screen polish** — merchant logo in header, layout/typography/spacing improvements, friendlier warning copy explaining that entering correct PIN redeems the voucher and generates the staff handoff screen, communicate "cannot be undone" without sounding negative, loading/transition animation during redemption mutation.
2. **Voucher redeemed success screen** — more positive/celebratory feel, "voucher redeemed successfully" messaging, confetti animation, include saving amount, preserve existing live timestamp/anti-fraud, improve Rate & Review button colour/hierarchy.
3. **Rate & Review routing** — currently routes back to Voucher Detail / does not work; should take user to review surface; reviews from real redemptions should be marked verified; entry points from Success screen, Voucher Detail post-redemption, Show-to-Staff (if appropriate), and RedemptionDetailsCard.
4. **Voucher Detail redeemed-state polish** — refine washed-out hero treatment, polish the "Voucher Redeemed / Renews on \<date\>" seal, decide whether merchant card / voucher card on merchant profile redeemed state is in-scope or split as follow-up.
5. **Merchant notification baseline** — email notification to redeemed branch when voucher redeemed (SMS deferred due cost; merchant app + push are future work).

Owner-locked process: **all polish + design must run through `/impeccable` AND `/ui-ux-pro-max` before a single line of code is written.**

---

## 2. Tier classification

| # | Item | Tier | Rationale |
|---|------|------|-----------|
| 1 | PIN screen — logo, copy, loading-state animation | **Mixed: Tier 1 (logo prop + copy + spinner) + Tier 2 (full layout/typography pass)** | The logo+copy+spinner additions are bounded mechanical changes. Re-laying out the sheet to a new design baseline is a multi-decision design surface and needs `/impeccable`. |
| 2 | Success screen — saving amount + Rate & Review hierarchy | **Tier 1 (saving + CTA hierarchy) + Tier 2 (confetti + full design polish)** | Saving amount is a prop plumbing change (backend already returns `estimatedSaving`). Confetti is the §P3-deferred 7-layer Reanimated sequence with 2.8s duration; that's a Tier 2 motion design surface. |
| 3 | Rate & Review routing + verified-redemption badge | **Tier 2 — backend schema + frontend routing wire-up + design pass for the new entry points** | Adds `redemptionId` (nullable) to `Review` table, validation logic, ReviewCard verified-badge UI. Multi-file across backend + frontend + tests. |
| 4 | Voucher Detail redeemed-state polish (seal, washed-out hero) | **Tier 2 — bundled §Q1–Q5 design pass (`/impeccable` + `/ui-ux-pro-max`)** | Already defined as a Tier 2 follow-up in deferred-followups §Q1. Splits naturally: voucher-detail surface in this PR; merchant-profile voucher-card redeemed treatment (§Q4) deferred. |
| 5 | Merchant email notification | **Tier 2 — Phase 6 dependency (`Resend` integration not yet wired)** | Pulls Phase 6 forward. Needs Resend client wiring, transactional email template, branch-email resolver, audit log model, retry/backoff per §W production-resilience standing checklist. |

**One-line summary of the split:**
- **PR-A (Tier 1):** PIN logo + copy + spinner; Success saving + CTA hierarchy; Rate & Review frontend routing wire-up (closes the dead callback). Single PR, ~250–400 LOC, no backend, no schema changes.
- **PR-B (Tier 2 — `/impeccable` + `/ui-ux-pro-max`):** PIN full design pass + Success confetti + Voucher Detail redeemed-state polish. Three coordinated design surfaces; one PR with three milestones.
- **PR-C (Tier 2 — verified-redemption review):** schema migration + backend validation + WriteReviewSheet `redemptionId` plumb-through + ReviewCard verified badge.
- **Deferred to Phase 6 / §AE:** merchant email notification — full Resend integration with audit log.
- **Deferred to §Q4:** merchant-profile voucher-card redeemed treatment — bundle with future merchant-profile design pass.

---

## 3a. PR-A file-level plan (REVISED — locked scope per §0.2)

> **Status:** PENDING OWNER REVIEW. No code is written until this section is approved.
> **Scope contract:** A1 + A2 + A3 + A4 only. A5 + A6 are explicitly EXCLUDED — they ship in PR-C alongside the verified-review backend, the moment the schema can store `redemptionId` linkage. Defensive pins in PR-A's tests guard against accidental scope creep.

### A. Files touched

| # | File | Action | Estimated lines | Skill gate |
|---|------|--------|-----------------|------------|
| 1 | `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx` | EDIT — A1 logo prop+render, A2 copy + banner visual rework, A3 spinner state | ~100–140 net (+/− churn ~180) | `/impeccable` + `/ui-ux-pro-max` shape brief locks visual + copy |
| 2 | `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx` | EDIT — A4 saving callout strip | ~50–70 net | `/impeccable` + `/ui-ux-pro-max` shape brief locks placement + scale |
| 3 | `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` | EDIT — pass new props through | ~12 net | none — pure plumbing |
| 4 | `apps/customer-app/src/design-system/Text.tsx` | POSSIBLY EDIT — add 1–2 new variants if shape brief identifies a gap (per §0.8 option b) | ~0–40 net | `/impeccable` + `/ui-ux-pro-max` shape brief decides |
| 5 | `apps/customer-app/tests/features/voucher/pin-entry-sheet.test.tsx` | NEW | ~180 | n/a |
| 6 | `apps/customer-app/tests/features/voucher/success-popup.test.tsx` | EXTEND | ~70 | n/a |
| 7 | `apps/customer-app/tests/features/voucher/voucher-detail-redeem-flow.test.tsx` | EXTEND | ~40 | n/a |

**Total estimated: ~450–550 LOC across 7 files (4 source + 3 test). Pure additive — no behavioural change to any existing redeem path beyond the visible polish. Lowest-risk PR shape in this workstream.**

**No backend changes. No schema changes. No migrations. No new env vars. No new dependencies.**

### B. Per-file change detail

#### B1. `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx`

**A1 — merchant logo header (lines 28–34 Props, lines 232–245 render):**

```diff
type Props = {
  visible: boolean
  onDismiss: () => void
  onSubmit: (pin: string) => void
  merchantName: string
  branchName: string | null
+  /** Merchant logo URL from voucher.merchant.logoUrl. Null falls back
+   *  to text-only header. Surfaced 2026-05-09 polish pass. */
+  merchantLogoUrl: string | null
  isLoading: boolean
  error: UseRedeemError | null
}
```

Render: insert a 48×48 (NOT 40×40 per §0.8 readability scaling) rounded-corner `Image` ABOVE the `merchantName` line. Logo container has 1px ring at brand-rose 8% alpha + `radius.md`. Text-only fallback path remains identical when `merchantLogoUrl === null`.

**A2 — friendlier copy + disclaimer banner visual (lines 245–260 + lines ~340–360):**

Title (line ~247): keep `Enter Branch PIN`. Likely bumped from `heading.sm` → `heading.md` per §0.8 (decided in shape brief).

Subtitle replaced with two-line treatment:
- Line 1: `Ask staff at {merchantName} for their 4-digit PIN.` — `body.md` (was `body.sm`).
- Line 2: `Once you enter it, your voucher is locked in for this cycle.` — `label.md`, `color.navy.muted`. **Conscious framing choice: "locked in for this cycle" is factual + time-bounded; replaces alarmist "cannot be undone" / "permanently".**

Disclaimer banner rework (existing amber `AlertTriangle` block):
- Replace `AlertTriangle` icon with `Lock` icon (already imported at line 18).
- Replace amber tint with `color.cream.tint` background + brand-rose 12% alpha border ring.
- Copy: `Confirming this PIN locks your voucher for the current cycle. The redemption code we generate is your handoff to staff.` — `body.md` (was `label.md` or `body.sm` — bumped per §0.8).
- Padding bumped one spacing step to match the type scale (e.g. `spacing.md` → `spacing.lg`).

**A3 — pulsing-dot loading spinner (existing submit button area):**

When `isLoading === true`:
- Submit button text replaced with: `<PulsingDot color="white" size={8} />` + `Confirming…` label (`label.lg`, white).
- Button visual stays brand-gradient; only the inner content swaps.
- The button is already disabled when `isLoading` is true (existing behaviour) — no change to interaction logic, just visual feedback.
- On error, the spinner clears, the existing wrong-PIN shake + clear-digits + inline error bar fire — UNCHANGED.

`PulsingDot` import added from `@/design-system/motion/PulsingDot`. No new component creation — reuse the M3 design-system primitive.

**Defensive pin: NO change to `onSubmit` callback wiring, NO change to `submittedRef` logic, NO change to lockout countdown, NO change to AppState background-clear behaviour.**

#### B2. `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx`

**A4 — saving callout strip (between context strip line ~275 and code box line ~292):**

```diff
type Props = {
  visible: boolean
  redemptionCode: string
  redeemedAt: string
+  /** RedeemResponse.estimatedSaving — already on the wire (see
+   *  apps/customer-app/src/lib/api/redemption.ts:43). */
+  estimatedSaving: number
  voucherTitle: string
  voucherType: VoucherType
  merchantName: string
  branchName: string
  onShowToStaff: () => void
  onRateReview: () => void
  onDone: () => void
}
```

Render: new view between `<View style={styles.context}>` and `<View style={styles.codeBox}>`. Composition:
- Background: `color.savings.tint` (8% alpha green over cream).
- Border: 1px `color.savings.border` (12% alpha green).
- Layout: horizontal row, `spacing.md` padding, centered.
- Label: `You saved` — `label.md`, `color.savings.green`.
- Amount: `£{estimatedSaving.toFixed(2)}` — `heading.md`, weight 800, `color.savings.green`. **Tabular numeric** (`fontVariant: ['tabular-nums']`) so the amount aligns visually if it grows to 4 digits.
- Vertical margin: `spacing.md` from siblings (matches the §0.8 density-with-scale rule).

**Defensive pin: NO change to Rate & Review CTA visual hierarchy, NO change to `onRateReview` callback, NO change to popup entrance animation, NO change to live-timestamp ticker, NO change to screen-capture protection wiring.** A5 + A6 are PR-C scope.

#### B3. `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`

**Pure plumbing — pass new props through:**

```diff
<PinEntrySheet
  visible={pinSheetVisible}
  onDismiss={...}
  onSubmit={handlePinSubmit}
  merchantName={voucher.merchant.businessName}
  branchName={branchName}
+  merchantLogoUrl={voucher.merchant.logoUrl ?? null}
  isLoading={redeemMutation.isPending}
  error={redeemMutation.error ?? null}
/>
```

```diff
<SuccessPopup
  visible
  redemptionCode={successPopup.redemptionCode}
  redeemedAt={successPopup.redeemedAt}
+  estimatedSaving={successPopup.estimatedSaving}
  voucherTitle={voucher.title}
  voucherType={voucher.type}
  merchantName={voucher.merchant.businessName}
  branchName={branchName}
  onShowToStaff={...}
  onRateReview={() => {
    // M2 keeps the review path unchanged — closes the popup;
    // future milestones will route into the existing review flow.
+   // PR-A defensive pin: this dead-end behaviour stays UNCHANGED in
+   // PR-A. The routing wire-up + verified-review attribution land
+   // together in PR-C, the moment the backend can store the
+   // redemptionId linkage.
    setSuccessPopup(null)
  }}
  onDone={() => setSuccessPopup(null)}
/>
```

#### B4. `apps/customer-app/src/design-system/Text.tsx` (POSSIBLY EDIT)

If the shape brief surfaces a type-scale gap blocking the desired hierarchy, add 1–2 variants. Example candidates surfaced in initial inspection:
- `label.lg` may need a slight bump if the `Confirming…` button label needs more weight.
- A `body.md.tabular` variant if the saving amount needs distinct tabular-num rendering at body weight.

**Decision deferred to shape brief.** If no gap is found, this file is NOT edited. The plan does not commit to adding variants speculatively.

#### B5–B7. Test files

**`apps/customer-app/tests/features/voucher/pin-entry-sheet.test.tsx` (NEW):**

```ts
describe('PinEntrySheet — A1 merchant logo', () => {
  it('renders merchant logo when merchantLogoUrl is provided')
  it('falls back to text-only header when merchantLogoUrl is null')
  it('logo image has accessibility label of merchant name')
  it('logo container has the correct corner radius and ring treatment')
})

describe('PinEntrySheet — A2 copy', () => {
  it('title reads "Enter Branch PIN"')
  it('subtitle line 1 includes "Ask staff at {merchantName} for their 4-digit PIN."')
  it('subtitle line 2 includes "Once you enter it, your voucher is locked in for this cycle."')
  it('disclaimer banner uses Lock icon, not AlertTriangle')
  it('disclaimer banner copy includes "Confirming this PIN locks your voucher for the current cycle."')
  // §0.8 + PRODUCT.md tone negative pins:
  it('NO copy includes "cannot be undone"')
  it('NO copy includes "permanently"')
  it('NO copy includes em dash characters (— or –)')
  it('disclaimer banner uses cream tint, not amber')
})

describe('PinEntrySheet — A3 spinner', () => {
  it('shows pulsing dot + "Confirming…" label when isLoading is true')
  it('hides pulsing dot when isLoading transitions to false')
  it('submit button is disabled when isLoading is true')
  it('submit button returns to enabled state after error')
  it('wrong-PIN shake fires AFTER isLoading clears (existing behaviour preserved)')
  it('lockout countdown still renders when error is PIN_RATE_LIMIT_EXCEEDED')
})

describe('PinEntrySheet — §0.8 readability pins', () => {
  it('title uses heading.md (or higher)')
  it('subtitle uses body.md (or higher)')
  it('disclaimer banner copy uses body.md (or higher)')
  it('PIN box height is at least 48pt (iOS HIG tap target)')
  it('Confirming label uses label.lg (or higher)')
})
```

**`apps/customer-app/tests/features/voucher/success-popup.test.tsx` (EXTEND):**

```ts
describe('SuccessPopup — A4 saving amount', () => {
  it('renders "You saved £X.XX" when estimatedSaving is provided')
  it('saving callout DOM position is between context strip and code box')
  it('saving callout uses savingsGreen color tokens')
  it('amount renders with tabular-nums font variant')
  it('handles 4-digit savings without layout break (£1234.56)')
})

describe('SuccessPopup — PR-A defensive pins', () => {
  it('Rate & Review CTA visual is UNCHANGED (defensive pin against accidental A5 scope creep)')
  it('Rate & Review CTA still calls onRateReview prop (defensive pin)')
  it('Done CTA visual is UNCHANGED')
  it('live-timestamp ticker still ticks every 1s')
  it('useScreenCaptureProtection still gates on visible')
})

describe('SuccessPopup — §0.8 readability pins', () => {
  it('title uses heading.md (or higher)')
  it('saving label uses label.md and amount uses heading.md (or higher)')
  it('redemption code preserves 30pt 800 weight')
  it('CTA labels use label.lg (or higher)')
})
```

**`apps/customer-app/tests/features/voucher/voucher-detail-redeem-flow.test.tsx` (EXTEND):**

```ts
describe('VoucherDetailScreen — PR-A prop wiring', () => {
  it('PinEntrySheet receives merchantLogoUrl from voucher.merchant.logoUrl')
  it('PinEntrySheet receives null when voucher.merchant.logoUrl is missing')
  it('SuccessPopup receives estimatedSaving from RedeemResponse.estimatedSaving')
  // Defensive pin against accidental A6 scope creep in PR-A:
  it('onRateReview callback unchanged: still just dismisses popup')
  it('onRateReview does NOT route or push (defensive — PR-C lights this up)')
})
```

### C. Commit sequencing within PR-A

| # | Commit | Scope | Why this boundary |
|---|--------|-------|-------------------|
| 1 | `chore(voucher): commit /impeccable + /ui-ux-pro-max shape brief for PIN sheet + SuccessPopup polish` | Markdown notes-file under `docs/design-briefs/` capturing the locked visual + copy decisions per §0.8 | Locks the visual contract in git BEFORE any TSX changes. Future readers see the "why" trail. |
| 2 | `feat(voucher): add merchant logo + clearer copy to PIN entry sheet` | A1 + A2: logo prop, render, copy bumps, disclaimer banner rework | All copy + visual changes that move together (one design decision). |
| 3 | `feat(voucher): pulsing spinner state during PIN submission mutation` | A3: spinner state + pulsing dot import | Independent visual change with its own test surface. |
| 4 | `feat(voucher): show estimated saving on redemption success popup` | A4: SuccessPopup saving callout | Independent of PIN sheet; separate review-target. |
| 5 | `test(voucher): pin PIN sheet logo+copy+spinner and SuccessPopup saving` | All test additions + extensions | One test commit so reviewers can see the full coverage delta. |
| 6 | `chore(voucher): wire merchantLogoUrl + estimatedSaving from VoucherDetailScreen` | The plumbing in `VoucherDetailScreen.tsx` | Pure prop-wiring; can be in commit 2/4 if reviewers prefer fewer commits — owner call during shape brief. |

**Pre-commit on every commit:** `tsc --noEmit` clean + the focused test file passes + `eslint` clean.

### D. Test strategy

**Customer-app jest (no backend changes, no vitest needed):**

Pre-PR baseline: 444 tests passing on the modified-suite focus, 792 on the broader voucher sweep (per PR #49 merge counts).

PR-A target: same baselines + new pins. Estimated +35–40 new test cases across the three test files.

**On-device QA (per §0.8 — required, simulator-only does NOT count):**

| Device | Required check |
|--------|---------------|
| iPhone SE 2nd/3rd gen OR iPhone 13 mini | PIN sheet readable in hand; saving callout legible; spinner visible; logo doesn't crush header |
| iPhone 14 Pro / 15 / 15 Plus | Same surfaces feel proportional, not too sparse |
| Pixel 6 / 7 (or owner-available Android) | Same surfaces; FLAG_SECURE doesn't affect QR rendering on Show-to-Staff (regression check after the §AE6 wave 8 changes from PR #49) |

**Dynamic Type check:** at iOS Settings → Display → Text Size set to "Larger" AND "Larger 4/6", verify:
- PIN sheet title doesn't truncate.
- Subtitle wraps without overflow.
- Disclaimer banner text wraps without crashing the layout.
- Saving callout amount doesn't push the code box off-screen.

**Manual QA happy path on Covelum vouchers (post-`prisma/reset-qa-redemption-cycle.ts`):**
1. Open Covelum → tap a voucher → tap Redeem.
2. Verify PIN sheet shows Covelum logo, new title scale, new copy.
3. Enter wrong PIN — verify shake still works, error bar legible.
4. Enter correct PIN — verify spinner appears for the duration of the mutation, then SuccessPopup mounts.
5. Verify saving amount visible in callout strip.
6. Tap Rate & Review — verify popup STILL just dismisses (defensive pin behaviour).
7. Tap Done — verify popup dismisses cleanly, RedemptionDetailsCard mounts (existing M3 path).
8. Background the app, return — verify SuccessPopup state survives if it was open (existing M3 path).
9. Repeat on each device class above.

### E. Risks (revised PR-A — reduced from initial draft)

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Existing PIN lockout / shake / submitted-once contracts regress | Low | High | Existing test suites for those contracts must continue to pass; new spinner state tested as additive |
| R2 | New copy violates PRODUCT.md tone (em dashes, marketing puffery, alarmist phrasing) | Medium | Medium | Negative pins in `pin-entry-sheet.test.tsx` block "cannot be undone" / "permanently" / em dash characters |
| R3 | Saving amount placement competes with code hero for visual focus | Medium | Low | `/impeccable` + `/ui-ux-pro-max` shape brief locks the visual hierarchy + on-device QA confirms |
| R4 | Type-scale bump breaks Dynamic Type at "Extra Large" | Low | Medium | §0.8 Dynamic Type test cases pin against truncation/overflow |
| R5 | Logo image fails to load (network slow, 404) — leaves a blank box | Low | Low | Fall back to text-only header on image error (`<Image onError={...}>`); existing seed has logos populated for Covelum |
| R6 | Accidental A5/A6 scope creep — Rate & Review CTA goes live | Low | High (data attribution loss) | Defensive pins in `success-popup.test.tsx` AND `voucher-detail-redeem-flow.test.tsx` block accidental routing/visual change |

### F. Pre-implementation checks (run BEFORE shape brief)

1. **Confirm `voucher.merchant.logoUrl` non-null for at least one Covelum branch.** Run: `npx tsx prisma/check-user.ts` style script or quick prisma studio session. **Already verified during plan investigation — Covelum logos populated in seed.**
2. **Confirm `RedeemResponse.estimatedSaving` non-zero for the seed RMV+RCV vouchers.** **Already verified — `apps/customer-app/src/lib/api/redemption.ts:43` does `z.coerce.number()`.**
3. **Confirm `PulsingDot` size + color props accept the values needed.** Already used in M3 — no new API needed.
4. **Confirm the design-system has the spacing tokens needed at the bumped scale.** Surface in shape brief.

### G. Definition of done (PR-A)

PR-A is complete when ALL of the following hold:
- [ ] `/impeccable` + `/ui-ux-pro-max` shape brief committed and owner-approved.
- [ ] All 4 source files edited per §B; tests written per §B5–B7.
- [ ] `tsc --noEmit` clean across customer-app.
- [ ] Customer-app jest passes (focused suite + broader voucher sweep).
- [ ] On-device QA on iPhone (small + large) + Android per §0.8.
- [ ] Dynamic Type check at "Larger" AND "Larger 4/6" passes.
- [ ] Defensive pins for A5/A6 non-regression in test suites are GREEN.
- [ ] PR description includes type-scale + density + on-device readability check log per §0.8.
- [ ] Owner page-review lock obtained.
- [ ] Merged via SHA-bound `gh pr merge` per project workflow rules.

### H. Out of scope (PR-A explicit)

- A5: SuccessPopup Rate & Review CTA hierarchy bump → PR-C.
- A6: Rate & Review routing wire-up → PR-C.
- WriteReviewSheet `fromRedemptionId` plumb-through → PR-C.
- ReviewCard verified badge → PR-C.
- MerchantProfileScreen routes-from-redemption param honouring → PR-C.
- ReviewsTab `initialOpenWriteFor` prop → PR-C.
- RedemptionDetailsCard Rate & Review entry point → PR-C.
- All confetti / motion polish → PR-B.
- All redeemed-state visual polish (seal, washed-out hero) → PR-B.
- All merchant-profile voucher-card redeemed treatment → §Q4 future workstream.
- All merchant email notification → §AE workstream.

---

## 3. Detailed scope per PR (DRAFT — superseded by §0 and §3a)

> **NOTE:** §0 and §3a are the binding contract. The detail below is preserved as the deliberation audit trail. Where it conflicts with §0/§3a, §0/§3a wins.

### PR-A — Quick polish (Tier 1, ~250–400 LOC)

**Goal:** Ship the bounded improvements that need no design decisions and no backend work, so on-device QA can confirm the wins before the deeper Tier 2 work begins.

#### A1. PIN sheet — merchant logo header
- **File:** `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx`
  - Add `merchantLogoUrl: string | null` to Props (line 28).
  - Render a 40×40 rounded `Image` above `merchantName` line (lines 232–245) when provided; fall back to existing text-only header when null.
  - Use existing `radius.md` + a 1px brand-rose-tinted ring at 8% alpha (matches voucher-card logo treatment).
- **File:** `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`
  - Pass `merchantLogoUrl={voucher.merchant.logoUrl ?? null}` to `<PinEntrySheet>`.
- **Backend dependency:** `voucher.merchant.logoUrl` is already in `getCustomerVoucher` response (verified pre-implementation).

#### A2. PIN sheet — friendlier copy
- **File:** `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx` (lines ~245–260)
  - Title: `Enter Branch PIN` → keep (clear, unambiguous).
  - Subtitle: replace `Ask staff at {merchantName} for the 4-digit PIN to confirm this redemption.` with two-line treatment:
    - Line 1 (body.sm): `Ask staff at {merchantName} for their 4-digit PIN.`
    - Line 2 (label.md, navy.muted): `Once you enter it, your voucher is locked in for this cycle.`
  - **The "cannot be undone" framing.** PRODUCT.md tone is "confident plain-spoken" — never alarmist. The copy above implies finality through "locked in for this cycle" without using negative words like "cannot be undone" / "permanently" / "warning". Aligns with the §AB live-screen-trust positive framing.
- **The disclaimer banner** (existing, lines ~340–360 in PinEntrySheet — has a yellow `AlertTriangle`): rework copy + visual.
  - Visual: replace amber alert tint with a softer brand-cream tint + brand-rose `Lock` icon (already imported at line 18). The tone shifts from "warning" to "info-with-finality".
  - Copy: `Confirming this PIN locks your voucher for the current cycle. The redemption code we generate is your handoff to staff.`
  - This addresses owner direction "communicate 'cannot be undone' without sounding negative" — the framing is "locked for the cycle" (factual, time-bounded) rather than "cannot be undone" (alarming, irreversible).

#### A3. PIN sheet — loading/transition animation during mutation
- **File:** `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx`
  - Currently `isLoading` only disables the submit button; the user sees a frozen sheet with a 4th digit highlighted while the network call (200ms–2s) runs.
  - Add a subtle inline spinner state on the submit button row when `isLoading === true`:
    - Replace the brand-gradient submit button text with a pulsing `LIVE` dot pattern reused from `PulsingDot.tsx` + label `Confirming…` (label.md, white).
    - On success, the parent dismisses the sheet and SuccessPopup mounts — this is the existing transition; no new motion code needed for that boundary.
    - On error, the existing wrong-PIN shake + `clear digits` + inline error bar continues to work unchanged.
  - **Reuse `PulsingDot`** (already in `apps/customer-app/src/design-system/motion/PulsingDot.tsx`); do not introduce a new spinner component.

#### A4. SuccessPopup — saving amount
- **File:** `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx`
  - Add `estimatedSaving: number` to Props (currently lines 28–34 omit it).
  - Render a saving-callout strip BETWEEN the voucher-context strip (line ~275) and the code hero (line ~292). Strip composition:
    - `savingsGreen` background tint at 8% alpha (color already imported at line 474).
    - Label: `You saved` (label.md, savingsGreen).
    - Amount: `£{estimatedSaving.toFixed(2)}` (heading.sm, 800 weight, savingsGreen).
    - Visual rhythm: 12pt vertical padding, 8pt margin from siblings.
  - **Backend dependency:** `RedeemResponseSchema.estimatedSaving` is already on the wire (verified — `apps/customer-app/src/lib/api/redemption.ts:43`). No backend change.
- **File:** `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`
  - Pass `estimatedSaving={successPopup.estimatedSaving}` to `<SuccessPopup>` (line 1501–1508).

#### A5. SuccessPopup — Rate & Review CTA hierarchy improvement
- **File:** `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx` (line ~378–402)
  - Current: two flat tertiary actions in a row — `Rate & Review` (type-color text) + `Done` (navy text).
  - Owner direction: "improve Rate & Review button colour/hierarchy". The CTA should be findable but not compete with the primary `Show to Staff`.
  - Proposed: keep `Done` as the flat dismiss text, but elevate `Rate & Review` to a flat-pill secondary action with:
    - 1px border in the voucher-type color at 30% alpha.
    - Type-color text + small `Star` icon (lucide) at 14pt.
    - 12pt vertical padding × 16pt horizontal — quieter than `Show to Staff` (which is solid type-color), louder than `Done` (which is plain text).
  - **Visual hierarchy spec (running through `/impeccable` + `/ui-ux-pro-max` before final styling):**
    - Tier 1 — `Show to Staff` — solid type-color block (the action 99% of users take).
    - Tier 2 — `Rate & Review` — flat pill with type-color outline (the helpful follow-up).
    - Tier 3 — `Done` — plain navy text (the silent dismiss).

#### A6. Rate & Review routing — frontend wire-up
- **File:** `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` (line 1530–1534)
  - Current `onRateReview` callback just calls `setSuccessPopup(null)` — nothing else.
  - Replace with router.push to merchant profile reviews tab, with WriteReview pre-opened for the redemption's branch:
    ```tsx
    onRateReview={() => {
      setSuccessPopup(null)
      router.push({
        pathname: `/(app)/merchant/${voucher.merchant.id}`,
        params: {
          tab: 'reviews',
          openWriteReview: '1',
          branch: successPopup.branchId,           // already on RedeemResponse
          fromRedemption: successPopup.id,         // already on RedeemResponse
        },
      })
    }}
    ```
- **File:** `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`
  - Honour the new params: when `openWriteReview === '1'`, set the active tab to `reviews` AND open `WriteReviewSheet` for the passed `branch`. Pass `fromRedemption` through to the sheet (PR-C uses it for verified-review wire-up; in PR-A, the param is plumbed through but unused).
- **File:** `apps/customer-app/src/features/merchant/components/ReviewsTab.tsx`
  - Add `initialOpenWriteFor?: { branchId: string; redemptionId?: string }` prop. Honour on mount (open `WriteReviewSheet` for the branch).
- **File:** `apps/customer-app/src/features/merchant/components/WriteReviewSheet.tsx`
  - Add `fromRedemptionId?: string | null` prop. Plumbs through to `useCreateReview` (PR-C makes this load-bearing; in PR-A it's accepted-and-ignored).

**Out of scope for PR-A — moved to PR-C:**
- Backend `redemptionId` validation, schema migration, ReviewCard verified-badge UI.
- Show-to-Staff entry point for Rate & Review (owner asked to "consider"; my recommendation is **NO** — Show-to-Staff is the in-store handoff surface, and adding a CTA there pulls the customer's attention away from the staff interaction. The Success screen + RedemptionDetailsCard are sufficient entry points).
- RedemptionDetailsCard entry point — defer to PR-B (paired with the redeemed-state design pass that will redesign the card layout anyway).

#### PR-A test strategy
- **Backend:** none (no backend changes).
- **Customer-app jest:**
  - `success-popup.test.tsx` — extend with: estimatedSaving renders correctly; Rate & Review pill has correct accessibility role + label; tertiary hierarchy matches snapshot.
  - `pin-entry-sheet.test.tsx` (extend if exists, otherwise new): merchantLogoUrl renders + falls back to text-only when null; spinner state appears when `isLoading`; copy strings pin against new wording (negative pin: must NOT contain "cannot be undone" or "permanently").
  - `voucher-detail-redeem-flow.test.tsx` — extend: `onRateReview` push hits `/(app)/merchant/{id}` with the correct params (`tab=reviews`, `openWriteReview=1`, `branch`, `fromRedemption`).
  - `merchant-profile-write-review-routing.test.tsx` (new): when `openWriteReview=1` arrives in params, the WriteReviewSheet opens for the passed branch.
- **Manual on-device:** redeem flow end-to-end on Covelum vouchers; verify saving amount displays; tap Rate & Review → lands on merchant reviews tab with sheet open for the redeemed branch.

#### PR-A risks
- **R1 (low):** PIN spinner state could mask a hung mutation. **Mitigation:** the existing 30s react-query timeout still fires; spinner returns to enabled-submit state on error.
- **R2 (low):** Copy regression — owner has explicit anti-em-dash + no-marketing-puffery rule. **Mitigation:** copy lock-tested by `product-copy.test.ts` style tests; new strings added to the negative pin set.
- **R3 (medium):** Rate & Review routing needs the Reviews tab to be in a "ready to open WriteReview" state. If `useMerchantProfile` is still loading, the param-driven open is racey. **Mitigation:** gate on `merchantQuery.data` resolved before honouring the param (same pattern as the §O7 branch-race fix already in `MerchantProfileScreen`).
- **R4 (low):** The §Q6 cycle-rollover invariant — "load-bearing gate is `voucher.isRedeemedThisCycle`, NOT `lastRedemption`" — we're not touching that gate, but the new routing param flow must not pass `fromRedemption` into a state where it could be misused as a redemption-presence signal. **Mitigation:** PR-A treats `fromRedemption` as opaque routing context only; the WriteReviewSheet ignores it until PR-C.

#### PR-A sequencing (within the PR)
1. **Wave 1 — `/impeccable` + `/ui-ux-pro-max` design brief lock.** Run shape-stage on PIN sheet copy + visual hierarchy AND SuccessPopup CTA hierarchy. Owner approval before any code.
2. **Wave 2 — A1 + A2 + A3 (PIN sheet).** Single commit batch; run pin-entry-sheet tests.
3. **Wave 3 — A4 + A5 (SuccessPopup).** Single commit batch; run success-popup tests.
4. **Wave 4 — A6 (Rate & Review routing).** Single commit batch; run voucher-detail-redeem-flow + new merchant-profile-write-review-routing tests.
5. **Wave 5 — full jest + tsc clean + on-device QA on Covelum vouchers.**
6. **Wave 6 — owner page-review lock, then merge.**

**Estimated LOC:** ~250–400 lines diff. **Estimated time:** 1–2 working sessions.

---

### PR-B — Design pass: PIN + Success + redeemed-state polish (Tier 2, bundled)

**Goal:** Three coordinated design surfaces under one Tier 2 PR with `/impeccable` + `/ui-ux-pro-max`. Bundled because they share visual language (voucher-type committed color, en-GB London datetime, brand-rose seal treatment) and a single design pass keeps them coherent.

> **Process gate:** This PR cannot start until PR-A is merged AND owner has reviewed the on-device result. PR-A's quick wins might satisfy enough of the asks that PR-B's scope shrinks.

#### B1. PIN sheet — full layout/typography pass
- **File:** `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx`
- Run `/impeccable shape` (product register — settings/admin-y surface, not brand) on:
  - 4×PIN-box rhythm (current: 54×60 with 12px gap — likely too tight at the new typography weight).
  - Banner+title+subtitle vertical rhythm (currently feels stack-stack-stack; needs design pass).
  - Disclaimer banner visual contract (currently amber+AlertTriangle; PR-A flipped to brand-cream+Lock; this PR locks the final visual treatment).
  - Submit button — currently brand-gradient; consider voucher-type color committed treatment to match SuccessPopup.
- Run `/ui-ux-pro-max` for accessibility + interaction polish.

#### B2. SuccessPopup — confetti animation
- **File:** `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx`
- Add the v6 confetti sequence: 7 Reanimated layers, 2.8s sequence, ~150 lines of animation code. Currently documented as deferred at SuccessPopup.tsx:132–137.
- Run `/impeccable shape` AND `/ui-ux-pro-max` on the motion design — confetti should be celebratory but not slow the user from getting to `Show to Staff`. Specifically:
  - Confetti starts ~200ms AFTER popup entrance settles.
  - Confetti runs in a non-blocking layer (zIndex above scrim, below code hero so the trust-signal stays the focal point).
  - `prefers-reduced-motion` hard-disables confetti — fall back to a static type-color burst.

#### B3. Voucher Detail redeemed-state polish
- **Scope:** §Q1 + §Q2 + §Q3 + §S1 only. **EXCLUDES** §Q4 (merchant-profile voucher-card redeemed treatment) — split as follow-up.
- **File:** `apps/customer-app/src/features/voucher/components/RedeemedSeal.tsx` (already exists from §AE5)
  - Replace the text-based "VOUCHER REDEEMED" tilt-box with a polished SVG circular stamp. Owner-direction reference: `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md` §AE5.
  - Run `/impeccable shape` + `/ui-ux-pro-max` on the stamp design (brand register — this is identity-driven for the redeemed surface).
- **File:** `apps/customer-app/src/features/voucher/components/CouponHeader.tsx` (washed-out hero)
  - Current opacity 0.55 is the §AE5 stop-gap. Design-pass to a true washed-out treatment: desaturate the hero image to ~40% saturation + apply a brand-cream tint overlay at 25% alpha. Reference treatment exists in v6 mockup.
- **File:** `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx`
  - Final visual lock + add Rate & Review entry point (see PR-A scope-out — moved here because the card layout is being redesigned anyway).
- **File:** `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`
  - Honour the new redeemed-state contract (no behavioural changes; just routing the new components into the existing state machine).

**Explicitly out of scope (§Q4):** the redeemed-state treatment of the voucher card on the merchant-profile vouchers tab. Bundled into a future merchant-profile design pass because it requires re-locking the voucher-card design baseline (currently locked at PR #35).

#### PR-B test strategy
- Component snapshot pins for the three redesigned surfaces.
- Confetti motion tests: pin the 7-layer count, the 2.8s total duration, the reduced-motion fallback.
- §AE5 presentation-window tests already cover the 2-hour window — must not regress.
- §Q6 cycle-rollover invariant tests already cover the load-bearing gate — must not regress.
- Visual QA via `/impeccable critique` after implementation.

#### PR-B risks
- **R1:** Confetti adds GPU load on lower-end Android devices. **Mitigation:** `/ui-ux-pro-max` performance pass; reduced-motion fallback is the device-specific kill-switch.
- **R2:** Bundling three design surfaces in one PR makes review cognitively heavy. **Mitigation:** ship as three commits within one PR with clear commit boundaries; owner reviews each commit before merge.
- **R3:** Redeemed-state visual changes risk breaking the §AE5 hidden-CTA defense-in-depth pattern. **Mitigation:** §AE5 tests are pinned; any change that breaks them blocks merge.

**Estimated LOC:** ~600–900 lines diff. **Estimated time:** 3–4 working sessions including `/impeccable` + `/ui-ux-pro-max` shape gates and critique passes.

---

### PR-C — Verified-redemption review (Tier 2)

**Goal:** Reviews tied to a real redemption show a "Verified redemption" badge. Fraud-resistance + trust signal.

> **Process gate:** This PR cannot start until PR-A is merged. PR-A plumbs `fromRedemptionId` through the WriteReviewSheet as accepted-and-ignored; PR-C makes it load-bearing.

#### C1. Schema migration
- **File:** `prisma/schema.prisma`
  - `model Review` — add `redemptionId String? @unique` (nullable; one redemption can produce at most one verified review).
  - Add `redemption VoucherRedemption? @relation(...)`.
- **File:** `prisma/migrations/<timestamp>_add_verified_review_redemption_link/migration.sql`
  - Additive nullable column + FK + unique constraint. Backwards-compatible.

#### C2. Backend validation
- **File:** `src/api/customer/reviews/service.ts`
  - `createOrUpdateReview` — accept optional `redemptionId`. If provided:
    - Verify the redemption belongs to the calling user (else `REDEMPTION_NOT_FOUND` to avoid leak).
    - Verify the redemption's `branchId === branchId` param (else `REDEMPTION_BRANCH_MISMATCH`).
    - Verify the redemption is `isValidated === true` OR within the §AE5 2-hour presentation window (decision pending design — see open question Q1 below).
    - Persist `redemptionId` on the review row.
  - `getMerchantReviews` — include `isVerified: review.redemptionId !== null` in the response shape.
- **File:** `src/api/customer/reviews/routes.ts`
  - Update Zod body schema for the create/update endpoint.

#### C3. Frontend
- **File:** `apps/customer-app/src/lib/api/reviews.ts`
  - Extend `reviewSchema` with `isVerified: z.boolean()`.
  - Extend `createReview` body type with `redemptionId?: string`.
- **File:** `apps/customer-app/src/features/merchant/components/WriteReviewSheet.tsx`
  - When `fromRedemptionId` is present, pass through to `useCreateReview`.
  - Render a small banner at the top of the sheet: `Verified review · This will be marked as a verified redemption.` (label.md, savingsGreen).
- **File:** `apps/customer-app/src/features/merchant/components/ReviewCard.tsx`
  - When `review.isVerified === true`, render a small green checkmark badge with label `Verified redemption` next to the rating row.
- **File:** `apps/customer-app/src/features/merchant/components/ReviewSortControl.tsx` (consider, not committed)
  - Optionally add a `Verified only` filter — defer to PR-C+1 if it grows scope.

#### PR-C test strategy
- **Backend vitest:**
  - `createReview.test.ts` — verified-redemption happy path; mismatched-branch rejection; mismatched-user rejection (REDEMPTION_NOT_FOUND); unvalidated-redemption decision (Q1).
  - `getMerchantReviews.test.ts` — isVerified flag is set correctly when redemptionId is present.
- **Customer-app jest:**
  - `useWriteReview.test.tsx` — extend with verified-review payload assertion.
  - `review-card-helpful.test.tsx` (extend) or new `review-card-verified.test.tsx`: verified badge renders when `isVerified === true`.
  - `merchant-profile-write-review-routing.test.tsx` (extended from PR-A): the routed-from-redemption path produces a verified review.
- **Manual on-device:** redeem → tap Rate & Review → submit a review → confirm it shows as Verified on the merchant reviews tab.

#### PR-C risks
- **R1:** Backwards compatibility — `redemptionId` is nullable, so existing reviews are unaffected. Low risk.
- **R2:** `@unique` constraint on `redemptionId` means a customer cannot accidentally create two reviews for the same redemption. Edge case: if the WriteReviewSheet is opened twice with the same redemption (e.g. routing race), the second attempt should hit the `update` path (already supported by `createOrUpdateReview`).
- **R3:** §AE5 presentation-window vs validation timing — open question below.

#### PR-C open questions for owner
- **Q1:** Does the verified-review path require `isValidated === true`, or is "redemption exists within the presentation window" enough? **My recommendation:** require `isValidated === true` for the verified badge, otherwise allow the review to be filed but without the verified badge. Reasoning: a customer who taps Redeem but never actually used the voucher in-store should not get the trust badge. The presentation window's purpose is staff-handoff anti-fraud, not review-trust verification. Owner decision needed before PR-C starts.

**Estimated LOC:** ~400–600 lines diff. **Estimated time:** 2–3 working sessions.

---

### Deferred items (NOT in this workstream)

| Ref | Item | Why deferred | Where it lands |
|-----|------|--------------|----------------|
| §Q4 | Merchant-profile voucher-card redeemed treatment | Re-locks the locked voucher-card design baseline (PR #35). Needs its own merchant-profile design pass. | Future merchant-profile design pass (post Phase 4). |
| §AE | Merchant email notification on redemption (item #5 from owner ask) | Pulls Phase 6 (Resend integration) forward. Needs full transactional email infra: client wiring, template registry, branch-email resolver, audit log model, retry/backoff queue per §W. Estimated 600–900 LOC + Phase 6 dependency. | **Recommend dedicated planning session** — likely Tier 3 (brainstorm-first) given Phase 6 integration scope. |
| §AE-ext | SMS notification on redemption | Owner-flagged as cost-deferred. | Phase 6 / merchant-mobile-app workstream. |
| §AE-ext | Merchant mobile app push notification | Phase 4 dependency (merchant mobile app not yet built). | Phase 4. |
| Show-to-Staff Rate & Review entry point | Owner asked to consider; I'm recommending NO. | Show-to-Staff is the in-store staff handoff; adding a Rate CTA there pulls customer attention away from the staff interaction. | Hard pass — document in deferred-followups §R3. |

---

## 4. Test strategy summary

| PR | Backend tests | Frontend tests | Manual QA |
|----|---------------|----------------|-----------|
| PR-A | none | extend success-popup, pin-entry-sheet, voucher-detail-redeem-flow; new merchant-profile-write-review-routing | redeem flow on Covelum; saving amount; Rate & Review routes correctly |
| PR-B | none | snapshot pins on three redesigned surfaces; confetti motion tests; reduced-motion fallback | `/impeccable critique` after build; on-device redeem on real iPhone + Pixel |
| PR-C | createReview verified path + negatives; getMerchantReviews isVerified flag | useWriteReview verified payload; ReviewCard verified badge; full integration via routing test | redeem → review → confirm verified badge on merchant reviews tab |

**Standing constraints (do not regress):**
- §Q6 cycle-rollover invariant (load-bearing gate is `voucher.isRedeemedThisCycle`).
- §AE5 presentation-window 2-hour gate (setTimeout-at-expiry, not polling).
- §AB iOS live-screen-trust framing (never describe iOS as "screenshot prevention").
- §AC stay-signed-in / demand-driven refresh.
- 444 customer-app jest tests passing baseline.
- 483+ backend vitest tests passing baseline.

---

## 5. Risks and assumptions

### Cross-PR risks
- **CR1 — Tier-2 design-pass scope creep.** PR-B bundles three design surfaces under one PR. **Mitigation:** explicit milestone commits within the PR; owner reviews each commit before merge; if any single milestone grows past ~300 LOC it splits into its own PR.
- **CR2 — `/impeccable` + `/ui-ux-pro-max` shape gates not honoured.** Owner explicitly directed both skills MUST run before any code. **Mitigation:** every Tier 1 + Tier 2 wave starts with a `IMPECCABLE_PREFLIGHT` block that pins the gate state. Code mutation does not begin until both gates pass + owner approval on the shape brief.
- **CR3 — PRODUCT.md tone violations.** New copy strings must follow the "confident plain-spoken, no marketing puffery, no em dashes, British English" tone. **Mitigation:** copy lock-tested via `product-copy.test.ts` negative pins for each new string.
- **CR4 — Hermes-CLDR fragility on dates.** Any new date formatting (e.g. saving amount with locale, Rate & Review timestamp) must use the locked `londonNow` / `formatToParts` pattern. **Mitigation:** standing rule, audit checklist in deferred-followups §AG2.

### Assumptions
- **A1:** `voucher.merchant.logoUrl` is populated for all customer-visible merchants (verified in seed; production assumption confirmed via discovery service).
- **A2:** `RedeemResponse.estimatedSaving` is on the wire today (verified — `apps/customer-app/src/lib/api/redemption.ts:43`).
- **A3:** `WriteReviewSheet` already supports a "create or update" mode (verified — backend `createOrUpdateReview` + `@@unique([userId, branchId])` constraint).
- **A4:** The Reviews tab honours route params (`tab=reviews`) — verified via existing `MerchantProfileScreen` tab routing.
- **A5:** No outstanding Tier 1 hotfix work (e.g. §Y / §AD) blocks this workstream — verified, both closed via PR #50 + PR #51.

---

## 6. Recommended sequencing

```
[Owner approval of this plan]
         ↓
[Plan locked → docs/superpowers/plans/2026-05-09-customer-redemption-polish-pass.md committed]
         ↓
PR-A — Tier 1 quick polish (1–2 sessions)
  ├─ Wave 1: /impeccable + /ui-ux-pro-max shape brief (PIN copy, SuccessPopup CTA hierarchy)
  ├─ Wave 2–4: implement A1..A6 in commit batches
  ├─ Wave 5: full test sweep + tsc clean
  └─ Wave 6: owner page-review lock + merge
         ↓
[On-device QA — owner confirms PR-A wins, decides whether PR-B's scope shrinks]
         ↓
PR-B — Tier 2 design pass (3–4 sessions)
  ├─ Milestone B1: PIN full design pass (/impeccable + /ui-ux-pro-max)
  ├─ Milestone B2: SuccessPopup confetti
  ├─ Milestone B3: Voucher Detail redeemed-state polish
  └─ Owner page-review lock + merge
         ↓
PR-C — Verified-redemption review (2–3 sessions)
  ├─ Owner answers Q1 (verified-badge requires isValidated, or window-only?)
  ├─ Backend migration + service + routes + tests
  ├─ Frontend WriteReviewSheet + ReviewCard + tests
  ├─ Manual on-device verification
  └─ Owner page-review lock + merge
         ↓
[Customer redemption polish workstream COMPLETE]
         ↓
[Decision point: §AE merchant email notification — pull Phase 6 forward, or defer to merchant-portal track]
```

**Why this order:**
- PR-A first delivers visible improvements fast and surfaces unknowns (e.g. on-device QA might tell us the saving callout placement is wrong, which informs PR-B).
- PR-B requires PR-A's plumbing (Rate & Review param flow, RedemptionDetailsCard CTA position) — bundling them in one PR would balloon scope and violate the Tier 2 plan-first rule.
- PR-C requires PR-A's frontend `fromRedemptionId` plumbing already in place.
- Each PR is independently mergeable and reviewable.

---

## 7. Owner decision points before implementation begins

1. **Approve / amend tier classification** — agree the 5 scope items split across PR-A / PR-B / PR-C / deferred as proposed.
2. **Approve sequencing** — three sequential PRs, each gated on the prior merging + on-device QA.
3. **Decide Q1 (verified review trigger)** — `isValidated === true` only, OR `within presentation window` enough? My recommendation: `isValidated === true` only.
4. **Decide Show-to-Staff Rate & Review entry point** — owner asked to "consider"; I'm recommending NO. Confirm.
5. **Confirm `/impeccable` + `/ui-ux-pro-max` are the right design skills** — both will be run for every Tier 1 polish copy decision AND every Tier 2 visual decision. Confirm if any other skill (e.g. `interface-design`, `interaction-design`, `emil-design-eng`) should join the rotation.
6. **Confirm merchant email notification (item #5) is acceptably deferred** — pulls Phase 6 forward as a dedicated workstream rather than being bundled here.

---

## 8. Out of scope (explicit)

- All Phase 4 / merchant portal work.
- All Phase 5 / admin panel work.
- All Phase 6 / Resend integration (except as the §AE deferral target).
- Apple IAP / Google Play / subscription purchase flows.
- Map / Discovery / Search surfaces.
- Profile / Favourites / Savings tabs (separate Tier 2 rebaseline workstreams already queued).
- TIME_LIMITED voucher availability windows (M4, separate plan).
- REUSABLE multi-redemption (M5, brainstorm-first).
- Merchant-profile voucher-card redeemed-state treatment (§Q4 — future merchant-profile design pass).
- Show-to-Staff visual redesign beyond what M3 ships (separate workstream if needed).

---

**End of plan. Awaiting owner review.**
