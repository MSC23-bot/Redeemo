# PR-B — Customer Redemption Visual Design Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** DRAFT — pending owner review of the [shape brief](../../design-briefs/2026-05-09-pr-b-customer-redemption-visual-design-brief.md). No implementation begins until the brief is approved.
> **Date:** 2026-05-09
> **Tier:** **Tier 2 visual design pass.** Multi-file UI work; no backend, no schema, no contract changes.
> **Predecessor:** PR-A (PIN sheet + SuccessPopup polish, MERGED `cd33c9a`) → PR-C (verified-review backend + entry points, MERGED `a80f427`) → **PR-B (this plan)**.
> **Brief:** [docs/design-briefs/2026-05-09-pr-b-customer-redemption-visual-design-brief.md](../../design-briefs/2026-05-09-pr-b-customer-redemption-visual-design-brief.md) — full design direction + per-surface anchors + device QA gate.
> **Polish-pass charter:** [docs/superpowers/plans/2026-05-09-customer-redemption-polish-pass.md](2026-05-09-customer-redemption-polish-pass.md).

---

**Goal:** Land the Tier 2 visual design pass on five customer redemption surfaces — Show-to-Staff register shift, SuccessPopup subtle celebration motion, Voucher Detail redeemed-state targeted refinement, PIN sheet full layout audit, merchant-profile voucher card redeemed-state treatment (§Q4 fold-in) — without weakening anti-fraud surfaces, screen-capture protection, screenshot guard, validation polling, or the 2-hour presentation window.

**Architecture:** Pure frontend / customer-app changes. No backend, no Prisma migration, no contract change. Component-level visual restructure + new motion + Material/HIG parity verification. Existing testIDs preserved where possible; new testIDs added for new sub-elements (count-up amount, sparkle ring, REDEEMED stamp, vertical receipt header band, voucher description block).

**Tech Stack:** React Native + Expo (no new dependencies). Reanimated for new motion (count-up, sparkle); existing `useScreenCaptureProtection` / `useScreenshotGuard` / `useRedemptionPolling` / `useAutoHideTimer` hooks unchanged.

---

## File structure

### Files to MODIFY

- `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx` — vertical receipt restructure; new props `voucherDescription`, `merchantLogoUrl`; merchant initials fallback; eyebrow + footer wordmarks; type variant adjustments per brief §3.1.
- `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx` — count-up motion on saving callout; refined check-ring timing; sparkle/breathe ring around check-ring.
- `apps/customer-app/src/features/voucher/components/RedeemedSeal.tsx` — only if seal-positioning audit (T3) flags a fix; otherwise untouched.
- `apps/customer-app/src/features/voucher/components/ReviewPromptCard.tsx` — only if secondary-register audit (T3) flags a fix.
- `apps/customer-app/src/features/voucher/components/CycleRulesCard.tsx` — only if available-again-date prominence audit (T3) flags a fix.
- `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx` — only if audit (T4) surfaces issues; surgical fixes only.
- `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` — pass new props (`voucherDescription`, `merchantLogoUrl`) through to ShowToStaff at the two mount sites (SuccessPopup → ShowToStaff handoff, RedemptionDetailsCard → ShowToStaff handoff).
- `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx` — same prop plumbing for ShowToStaff handoff.
- `apps/customer-app/src/features/merchant/components/VoucherCard.tsx` — new `isRedeemed?: boolean` prop; redeemed-state visual variant (hero saturation, REDEEMED stamp overlay, "Already redeemed this cycle" inline label).
- `apps/customer-app/src/features/merchant/components/VouchersTab.tsx` — pass `isRedeemed` flag from existing `redeemedVoucherIds` prop into VoucherCard.

### New files (NEW)

- `apps/customer-app/src/features/voucher/components/SparkleRing.tsx` — small Reanimated component for the SuccessPopup sparkle/breathe ring around the check-ring. Single 1.2s opacity pulse 0 → 0.3 → 0; reduced-motion path renders nothing.
- `apps/customer-app/src/features/voucher/utils/useCountUp.ts` — hook for the SuccessPopup saving-callout count-up. Wraps Reanimated `useDerivedValue` + `withTiming`; reduced-motion snaps to final value.
- `apps/customer-app/src/features/merchant/components/VoucherCardRedeemedStamp.tsx` — small variant of `RedeemedSeal` styled for card-scale (30-40pt diameter, 5° tilt, ink-pressure shadow); reusable.

### Test files (NEW + EXTEND)

- New: `apps/customer-app/tests/features/voucher/show-to-staff-vertical-receipt.test.tsx` — vertical receipt layout pins, voucherDescription rendering, merchantLogoUrl null fallback, safe-area top inset, eyebrow + footer wordmark rendering.
- Extend: `apps/customer-app/tests/features/voucher/show-to-staff.test.tsx` (existing) — cross-pin existing 24-case anti-fraud + live-signal coverage stays GREEN.
- New: `apps/customer-app/tests/features/voucher/success-popup-celebration.test.tsx` — count-up motion (snap on reduced-motion), sparkle ring suppressed on reduced-motion, tabular-nums on saving amount, count-up duration cap.
- Extend: `apps/customer-app/tests/features/voucher/success-popup.test.tsx` (existing) — cross-pin existing 39-case visibility + CTA + close-icon coverage stays GREEN.
- New: `apps/customer-app/tests/features/merchant/voucher-card-redeemed-state.test.tsx` — `isRedeemed` prop renders REDEEMED stamp + saturation reduction + "Already redeemed this cycle" inline label; default `isRedeemed={false}` renders unchanged active card.
- Extend: `apps/customer-app/tests/features/voucher/voucher-detail-redeem-flow.test.tsx` (existing) — only if T3 surfaces visual changes that need pinning.
- Extend: `apps/customer-app/tests/features/merchant/write-review-sheet-update-copy.test.tsx` (existing) — no expected change.

---

## Tasks

### Task 0 — Owner approval gate

**This plan does NOT mutate any code until the [shape brief](../../design-briefs/2026-05-09-pr-b-customer-redemption-visual-design-brief.md) is owner-approved.** Cut a fresh `feature/voucher-pr-b-visual-design-pass` branch from `main` only after explicit go.

- [ ] **Step 1: Confirm shape brief approval.** Owner has signed off on the brief's per-surface direction, anti-fraud preservation, scope, and §Q4 fold-in.
- [ ] **Step 2: Cut branch from current main.**

```bash
git checkout main
git pull --ff-only
git checkout -b feature/voucher-pr-b-visual-design-pass
```

### Task 1 — Show-to-Staff register shift to "official document"

Implements brief §3.1 + §5.1.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx`
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` (two mount sites: SuccessPopup→ShowToStaff handler + RedemptionDetailsCard's `setShowToStaff` state → `<ShowToStaff>` mount)
- Modify: `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx` (existing `<ShowToStaff>` handler — only the prop-plumbing site, NOT the card's own visual)
- New test: `apps/customer-app/tests/features/voucher/show-to-staff-vertical-receipt.test.tsx`
- Cross-pin: existing `apps/customer-app/tests/features/voucher/show-to-staff.test.tsx` stays GREEN

#### Step 1.1: Extend the ShowToStaff component contract

- [ ] **Step 1: Add new props to ShowToStaff Props type.**

Add `voucherDescription: string | null` (from `voucher.description`) and `merchantLogoUrl: string | null` (from `voucher.merchant.logoUrl`). Both required (caller passes `null` explicitly when unavailable).

```ts
type Props = {
  visible: boolean
  redemptionCode: string
  voucherTitle: string
  voucherType: VoucherType
  voucherDescription: string | null   // NEW
  merchantName: string
  merchantLogoUrl: string | null       // NEW
  branchName: string
  customerName: string
  redeemedAt: string
  onValidated: () => void
  onDone: () => void
}
```

- [ ] **Step 2: Plumb props through the two mount sites.**

`VoucherDetailScreen.tsx`: when calling `setShowToStaff({...})`, capture `voucherDescription: voucher.description` and `merchantLogoUrl: voucher.merchant.logoUrl ?? null` in the state shape. The `<ShowToStaff>` JSX mount picks them up and forwards.

#### Step 1.2: Restructure the layout to vertical receipt geometry

- [ ] **Step 3: Replace the current QR-card-centered layout with vertical receipt geometry per brief §5.1.**

Top-down structure (replace the current SafeAreaView body):

```jsx
<SafeAreaView style={styles.container}>
  <View style={styles.identityZone}>
    <Image source={REDEEMO_LOGO} style={styles.redeemoLogo} testID="show-to-staff-redeemo-logo" />
    <Pressable accessibilityLabel="Close" testID="show-to-staff-close" onPress={onDone}>
      <X size={20} color={color.text.secondary} />
    </Pressable>
  </View>
  <View style={styles.eyebrowBlock}>
    <Text variant="label.eyebrow" style={styles.eyebrow}>Verified Voucher</Text>
  </View>
  <View style={styles.voucherInfoBlock}>
    <Text variant="heading.md" style={styles.voucherTitle} testID="show-to-staff-voucher-title">{voucherTitle}</Text>
    {voucherDescription ? (
      <Text variant="body.md" style={styles.voucherDescription} numberOfLines={3} ellipsizeMode="tail" testID="show-to-staff-voucher-description">{voucherDescription}</Text>
    ) : null}
  </View>
  <View style={styles.merchantBlock}>
    {merchantLogoUrl ? (
      <Image source={{ uri: merchantLogoUrl }} style={styles.merchantLogo} testID="show-to-staff-merchant-logo" onError={() => setMerchantLogoFailed(true)} />
    ) : (
      <View style={styles.merchantInitials} testID="show-to-staff-merchant-initials"><Text variant="heading.sm" style={styles.merchantInitialsText}>{getInitials(merchantName)}</Text></View>
    )}
    <View style={styles.merchantText}>
      <Text variant="heading.sm" style={styles.merchantName} testID="show-to-staff-merchant-name">{merchantName}</Text>
      <Text variant="label.lg" style={styles.merchantBranch} testID="show-to-staff-branch">{branchName}</Text>
    </View>
  </View>
  <View style={styles.qrAnchor}>
    <QRCodeBlock value={redemptionCode} testID="show-to-staff-qr" />
    <Text variant="mono.redemption" style={styles.code} testID="show-to-staff-code">{formatCode(redemptionCode)}</Text>
  </View>
  <View style={styles.liveSignalsBlock}>
    {/* existing live clock + LIVE dot + animated border + validation pill — UNCHANGED */}
  </View>
  <View style={styles.footer}>
    <Text variant="label.md" style={styles.footerText} testID="show-to-staff-footer">Verified through Redeemo</Text>
  </View>
</SafeAreaView>
```

- [ ] **Step 4: Add `getInitials` helper.**

```ts
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
```

- [ ] **Step 5: Style the new blocks per brief §3.1 typography hierarchy + §5.1 layout.**

Identity zone: 64pt min height, cream gradient `#FFF9F5 → #FCF0E5`, paddingHorizontal `spacing[4]`, paddingTop `insets.top + 16`. Redeemo logo 24pt height. X close icon 32pt circle, `color.text.secondary` X stroke.
Eyebrow block: paddingTop 24, paddingHorizontal 24, brand-rose colour.
Voucher info block: paddingHorizontal 24, paddingTop 8, gap 8.
Merchant block: paddingHorizontal 24, paddingTop 16, paddingBottom 16, flexDirection 'row', alignItems 'center', gap 12. Merchant logo 48×48 radius `radius.md`. Initials fallback 48×48 cream-tint background, brand-rose 8% alpha border, navy text.
QR anchor: paddingHorizontal 24, paddingTop 24, alignItems 'center'.
Live signals block: existing styles preserved.
Footer: paddingHorizontal 24, paddingBottom `insets.bottom + 12`, alignItems 'center', `color.text.tertiary`.

#### Step 1.3: Tests + reduced-motion + a11y

- [ ] **Step 6: Write the new test file `show-to-staff-vertical-receipt.test.tsx`** with the following pins:

```ts
describe('ShowToStaff — vertical receipt layout (PR-B T1)', () => {
  it('renders Redeemo identity-zone header at the top', () => {/* ... */})
  it('renders the "Verified Voucher" eyebrow above the voucher title', () => {/* ... */})
  it('renders the voucher title + description block', () => {/* ... */})
  it('truncates voucherDescription to 3 lines with ellipsis', () => {/* ... */})
  it('renders merchant logo when merchantLogoUrl is non-null', () => {/* ... */})
  it('renders merchant initials fallback when merchantLogoUrl is null', () => {/* ... */})
  it('renders merchant initials fallback when image errors out', () => {/* ... */})
  it('renders the QR + code block as the visual anchor', () => {/* ... */})
  it('renders the "Verified through Redeemo" footer', () => {/* ... */})
  it('safe-area top inset is honoured for the cream identity zone', () => {/* ... */})
  it('VoiceOver reads top-down: header → eyebrow → title → description → merchant → branch → code → live → footer', () => {/* ... */})
})

describe('ShowToStaff — anti-fraud + live signals (PR-B T1 regression)', () => {
  // Cross-reference existing show-to-staff.test.tsx — these MUST stay GREEN
  it('useScreenCaptureProtection still installed when visible (regression pin)', () => {/* ... */})
  it('useScreenshotGuard still installed on iOS when visible (regression pin)', () => {/* ... */})
  it('animated brand-rose border still renders (regression pin)', () => {/* ... */})
  it('LIVE dot still pulses (regression pin)', () => {/* ... */})
  it('live clock still ticks (regression pin)', () => {/* ... */})
  it('validation pill transition + auto-dismiss still fires (regression pin)', () => {/* ... */})
})
```

- [ ] **Step 7: Verify the existing 24-case `show-to-staff.test.tsx` stays GREEN.** Pass this gate before merging T1.

```bash
cd apps/customer-app
npx jest tests/features/voucher/show-to-staff --forceExit
```

Expected: existing 24 + new 17 = 41 passing.

- [ ] **Step 8: Commit T1.**

```bash
git add apps/customer-app/src/features/voucher/components/ShowToStaff.tsx \
        apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx \
        apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx \
        apps/customer-app/tests/features/voucher/show-to-staff-vertical-receipt.test.tsx
git commit -m "feat(voucher): Show-to-Staff vertical-receipt register shift (PR-B T1)"
```

### Task 2 — SuccessPopup subtle celebration motion

Implements brief §3.2 + §5.2.

**Files:**
- Modify: `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx`
- New: `apps/customer-app/src/features/voucher/components/SparkleRing.tsx`
- New: `apps/customer-app/src/features/voucher/utils/useCountUp.ts`
- New test: `apps/customer-app/tests/features/voucher/success-popup-celebration.test.tsx`
- Cross-pin: existing `tests/features/voucher/success-popup.test.tsx` stays GREEN (39 cases)

#### Step 2.1: Build the count-up hook

- [ ] **Step 1: Write `useCountUp.ts`.**

```ts
import { useEffect, useState } from 'react'
import { useReducedMotion } from 'react-native-reanimated'

export function useCountUp(target: number, durationMs: number): number {
  const reducedMotion = useReducedMotion()
  const [value, setValue] = useState(reducedMotion ? target : 0)
  useEffect(() => {
    if (reducedMotion) {
      setValue(target)
      return
    }
    const start = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - start
      const progress = Math.min(1, elapsed / durationMs)
      // ease-out-quart
      const eased = 1 - Math.pow(1 - progress, 4)
      setValue(target * eased)
      if (progress >= 1) clearInterval(id)
    }, 16) // ~60fps
    return () => clearInterval(id)
  }, [target, durationMs, reducedMotion])
  return value
}
```

- [ ] **Step 2: Wire `useCountUp` into the SuccessPopup saving callout.**

Replace the `£X.XX` Text node value with the count-up'd value, formatted as `£${value.toFixed(2)}`. Duration: `Math.min(1000, Math.max(600, target * 100))`.

#### Step 2.2: Build the SparkleRing component

- [ ] **Step 3: Write `SparkleRing.tsx`.**

```tsx
import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated'
import { useReducedMotion } from 'react-native-reanimated'
import { color } from '@/design-system/tokens'

type Props = {
  visible: boolean
  size?: number       // default 36
  delayMs?: number    // default 480
  durationMs?: number // default 1200
}

export function SparkleRing({ visible, size = 36, delayMs = 480, durationMs = 1200 }: Props) {
  const reducedMotion = useReducedMotion()
  const opacity = useSharedValue(0)

  useEffect(() => {
    if (!visible || reducedMotion) {
      opacity.value = 0
      return
    }
    opacity.value = withDelay(
      delayMs,
      withTiming(0.3, { duration: durationMs * 0.4, easing: Easing.out(Easing.exp) },
        () => { opacity.value = withTiming(0, { duration: durationMs * 0.6, easing: Easing.in(Easing.exp) }) }
      )
    )
  }, [visible, reducedMotion, delayMs, durationMs])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  if (reducedMotion) return null
  return (
    <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, style]} testID="success-popup-sparkle-ring" pointerEvents="none" />
  )
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: color.brandRose + '40', // 25% alpha hex variant
  },
})
```

- [ ] **Step 4: Mount `<SparkleRing>` in SuccessPopup around the check-ring.**

Position absolute, centered on the 22pt check ring. testID `success-popup-sparkle-ring` for tests.

- [ ] **Step 5: Refine check-ring scale-and-settle (optional polish).**

If on-device QA flags the existing 240ms cubic feels "snapped", add a 1-frame hold at scale=0.95 between 80% and 100% of the existing animation. Implementation: chain two `withTiming` calls in the existing entrance effect.

#### Step 2.3: Tests

- [ ] **Step 6: Write the new test file `success-popup-celebration.test.tsx`** with these pins:

```ts
describe('SuccessPopup — celebration motion (PR-B T2)', () => {
  it('saving amount renders with count-up motion ON when reduced-motion is OFF', () => {/* render with default; advance fake timers; assert intermediate values */})
  it('saving amount renders SNAPPED to final value when reduced-motion is ON', () => {/* mock useReducedMotion to true; assert final value renders immediately */})
  it('saving amount uses tabular-nums fontVariant', () => {/* assert style includes fontVariant: ['tabular-nums'] */})
  it('count-up duration capped at 1000ms regardless of target', () => {/* test with target=£999.99; assert max duration */})
  it('count-up duration min 600ms regardless of small target', () => {/* test with target=£0.50; assert min duration */})
  it('SparkleRing does NOT render when reduced-motion is ON', () => {/* mock useReducedMotion; query testID; expect null */})
  it('SparkleRing renders when reduced-motion is OFF', () => {/* default; query testID; expect found */})
  it('count-up + sparkle do NOT play when zero saving (REUSABLE)', () => {/* estimatedSaving=0; saving callout suppressed; sparkle still plays on check ring */})
})

describe('SuccessPopup — visibility + CTA + close-icon (PR-B T2 regression)', () => {
  // Cross-reference existing success-popup.test.tsx — these MUST stay GREEN
  it('top-right close icon still fires onDone (regression pin)', () => {/* ... */})
  it('Rate & Review pill still routes (regression pin)', () => {/* ... */})
  it('View voucher code still routes (regression pin)', () => {/* ... */})
})
```

- [ ] **Step 7: Verify the existing 39-case `success-popup.test.tsx` stays GREEN.**

```bash
npx jest tests/features/voucher/success-popup --forceExit
```

Expected: existing 39 + new 8 = 47 passing.

- [ ] **Step 8: Commit T2.**

```bash
git add apps/customer-app/src/features/voucher/components/SuccessPopup.tsx \
        apps/customer-app/src/features/voucher/components/SparkleRing.tsx \
        apps/customer-app/src/features/voucher/utils/useCountUp.ts \
        apps/customer-app/tests/features/voucher/success-popup-celebration.test.tsx
git commit -m "feat(voucher): SuccessPopup subtle celebration motion (PR-B T2)"
```

### Task 3 — Voucher Detail redeemed-state targeted refinement

Implements brief §3.3 + §5.3. Audit-driven; only changes if device QA surfaces a real issue.

**Files (potentially):**
- Modify: `apps/customer-app/src/features/voucher/components/RedeemedSeal.tsx` (only if seal-positioning audit flags a fix)
- Modify: `apps/customer-app/src/features/voucher/components/ReviewPromptCard.tsx` (only if secondary-register audit flags a fix)
- Modify: `apps/customer-app/src/features/voucher/components/CycleRulesCard.tsx` (only if available-again-date prominence audit flags a fix)

#### Step 3.1: Audit pass on three review areas

- [ ] **Step 1: Seal positioning audit.** Build the customer-app, navigate to a redeemed voucher, set Dynamic Type to AX1, AX3, AX5 in iOS Settings. Verify the seal at `insets.top + 96` doesn't clip into the RedemptionDetailsCard at any size. If clipping, anchor the seal to a fixed margin from the card's top instead of `insets`-derived.
- [ ] **Step 2: ReviewPromptCard secondary-register audit.** Visual review against the white RedemptionDetailsCard above it. If the cream tint on `color.cream` blends in too closely, drop the surface to `#FFF9F5` at 80% alpha or add a subtle navy-tint shadow. Document the decision.
- [ ] **Step 3: Available-again date prominence audit.** Visual review of the post-redemption CycleRulesCard variant. If the brand-rose tinted block is under-weighted, bump the date text from `heading.sm` → `heading.md`.

If all three audits pass with no changes needed, T3 is "no-op" and the next task starts.

#### Step 3.2: Apply surgical fixes (if any) + tests

- [ ] **Step 4: Apply only the minimal fix surfaced by Step 1-3.**
- [ ] **Step 5: Add regression pins to existing tests if the fix changes a behaviour or visual contract.**
- [ ] **Step 6: Verify existing voucher-detail-redeem-flow.test.tsx + voucher-detail-states + redemption-details-card + presentation-window utility tests stay GREEN.**

```bash
npx jest tests/features/voucher/voucher-detail-redeem-flow tests/features/voucher/voucher-detail-states tests/features/voucher/redemption-details-card tests/features/voucher/presentationWindow --forceExit
```

- [ ] **Step 7: Commit T3 (only if changes applied).**

```bash
git commit -m "fix(voucher): Voucher Detail redeemed-state targeted refinement (PR-B T3)"
```

### Task 4 — PIN sheet full layout audit

Implements brief §3.4 + §5.4. Audit-only; surgical fixes only if surfaced.

**Files (potentially):**
- Modify: `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx`

#### Step 4.1: Run the 8-item audit checklist

- [ ] **Step 1: Body text size verification** (≥16pt on all body text).
- [ ] **Step 2: PIN digit box height verification** (≥44pt).
- [ ] **Step 3: Touch target spacing** (≥8pt between PIN digit boxes; between submit + close).
- [ ] **Step 4: Dynamic Type AX5 stress test.** No truncation, no clipping on title / subtitle / lockout copy / digit boxes.
- [ ] **Step 5: iPhone SE 1st gen (375 × 667) layout** — submit button stays inside viewport.
- [ ] **Step 6: Android (Pixel 5) parity check.** Tap area, focus rings, back-button placement, error bar.
- [ ] **Step 7: Backend-error banner contrast 4.5:1.**
- [ ] **Step 8: Keyboard type stays numeric, no autofill suggestions.**

#### Step 4.2: Apply surgical fixes (if any)

- [ ] **Step 9: Apply only the minimal fixes surfaced by Steps 1-8.**
- [ ] **Step 10: Verify existing pin-entry-sheet.test.tsx stays GREEN.**

```bash
npx jest tests/features/voucher/pin-entry-sheet --forceExit
```

- [ ] **Step 11: Commit T4 (only if changes applied).**

```bash
git commit -m "fix(voucher): PIN sheet layout audit fixes (PR-B T4)"
```

### Task 5 — Merchant-profile voucher card redeemed-state (§Q4 fold-in)

Implements brief §3.5 + §5.5. Closes deferred-followup §Q4.

**Files:**
- Modify: `apps/customer-app/src/features/merchant/components/VoucherCard.tsx` — new `isRedeemed?: boolean` prop; redeemed-state visual variant.
- Modify: `apps/customer-app/src/features/merchant/components/VouchersTab.tsx` — pass `isRedeemed` flag from existing `redeemedVoucherIds` set.
- New: `apps/customer-app/src/features/merchant/components/VoucherCardRedeemedStamp.tsx` — small variant of `RedeemedSeal`.
- New test: `apps/customer-app/tests/features/merchant/voucher-card-redeemed-state.test.tsx`
- Cross-pin: existing `tests/features/merchant/voucher-card.test.tsx` stays GREEN.

#### Step 5.1: Build VoucherCardRedeemedStamp

- [ ] **Step 1: Write `VoucherCardRedeemedStamp.tsx`.** Mirror `RedeemedSeal.tsx` styling (brand-rose tilt + ink-pressure shadow + cream fill + brand-rose border) at smaller scale (30-40pt diameter, single word "REDEEMED" at `label.eyebrow`).

#### Step 5.2: Add isRedeemed variant to VoucherCard

- [ ] **Step 2: Extend VoucherCard Props.**

```ts
type Props = {
  // existing props...
  isRedeemed?: boolean  // NEW — when true, render redeemed-state visual variant
}
```

- [ ] **Step 3: When `isRedeemed === true`:**
  - Reduce hero gradient saturation to ~70% (apply via overlay `rgba(245, 240, 235, 0.3)` cream tint OR adjust gradient stops).
  - Render `<VoucherCardRedeemedStamp>` absolutely positioned top-right of the hero.
  - Render "Already redeemed this cycle" inline label below the saving block (`label.md`, `color.text.tertiary`).
  - Type chip stays full saturation (no change).
  - Title + description + saving stay full opacity (no change).

#### Step 5.3: Wire VouchersTab to pass isRedeemed

- [ ] **Step 4: VouchersTab plumbing.** The `redeemedVoucherIds: Set<string>` prop is already passed (existing). Pass `isRedeemed={redeemedVoucherIds.has(voucher.id)}` to each VoucherCard.

#### Step 5.4: Tests

- [ ] **Step 5: Write `voucher-card-redeemed-state.test.tsx`** with these pins:

```ts
describe('VoucherCard — redeemed-state variant (PR-B T5, §Q4)', () => {
  it('renders REDEEMED stamp when isRedeemed=true', () => {/* ... */})
  it('does NOT render REDEEMED stamp when isRedeemed=false (regression pin)', () => {/* ... */})
  it('does NOT render REDEEMED stamp when isRedeemed prop is omitted', () => {/* ... */})
  it('renders "Already redeemed this cycle" inline label when isRedeemed=true', () => {/* ... */})
  it('does NOT render the inline label when isRedeemed=false', () => {/* ... */})
  it('hero gradient saturation reduced when isRedeemed=true', () => {/* ... */})
  it('type chip stays full opacity in redeemed state', () => {/* ... */})
  it('title + description stay legible in redeemed state', () => {/* ... */})
  it('tap behaviour unchanged in redeemed state (still routes to Voucher Detail)', () => {/* ... */})
  it('Dynamic Type AX5: REDEEMED stamp + inline label do not collide', () => {/* ... */})
})
```

- [ ] **Step 6: Verify existing voucher-card.test.tsx stays GREEN.**

```bash
npx jest tests/features/merchant/voucher-card --forceExit
```

- [ ] **Step 7: Commit T5.**

```bash
git add apps/customer-app/src/features/merchant/components/VoucherCard.tsx \
        apps/customer-app/src/features/merchant/components/VouchersTab.tsx \
        apps/customer-app/src/features/merchant/components/VoucherCardRedeemedStamp.tsx \
        apps/customer-app/tests/features/merchant/voucher-card-redeemed-state.test.tsx
git commit -m "feat(merchant): voucher card redeemed-state visual variant (PR-B T5, closes §Q4)"
```

### Task 6 — Cross-cutting checklists (Dynamic Type + Android + reduced-motion regressions)

Implements brief §9.

#### Step 6.1: Dynamic Type stress pass

- [ ] **Step 1: AX5 stress test on all 5 surfaces.**
  - Show-to-Staff (vertical receipt reflows; QR + code + clock + validation stay legible)
  - SuccessPopup (count-up text doesn't push popup beyond viewport; saving callout reflows)
  - PIN sheet (PR-A bumps still hold; no clipping)
  - Voucher Detail redeemed-state (seal doesn't clip into card)
  - Merchant-profile voucher card redeemed-state (REDEEMED stamp + inline label don't collide)

#### Step 6.2: Android Material parity pass

- [ ] **Step 2: Build + run Android (Pixel 5 emulator).** All 5 surfaces verified for tap target size, focus rings, back-button placement, status bar contrast, navigation bar safe-area.

#### Step 6.3: Reduced-motion regression pass

- [ ] **Step 3: Reduced-motion verification on all 5 surfaces.**
  - Show-to-Staff: animated brand-rose border → static; LIVE dot pulse → static; validation pill transition → instant
  - SuccessPopup: count-up → snap; sparkle ring → suppressed; check-ring scale-and-settle → static
  - Voucher Detail redeemed-state: seal animation respects (none today, regression pin)
  - PIN sheet: spinner respects reduced-motion
  - Merchant-profile voucher card redeemed-state: REDEEMED stamp does not animate on mount

#### Step 6.4: Anti-fraud regression pass

- [ ] **Step 4: Anti-fraud regression verification.**
  - `useScreenCaptureProtection` lifecycle on Show-to-Staff + SuccessPopup + Voucher Detail (when code visible) verified with mocked `expo-screen-capture`
  - `useScreenshotGuard` lifecycle on Show-to-Staff + Voucher Detail (when code visible) verified
  - 2-hour presentation window gate on Voucher Detail respects (no PR-B change; regression pin only)
  - Validation polling + auto-hide timer + brightness boost regression-clean

### Task 7 — On-device QA + memory/doc updates

#### Step 7.1: On-device QA

- [ ] **Step 1: Run the full §10 device QA checklist from the brief.** Each surface has its own gate; ALL must pass before opening the PR.

#### Step 7.2: Memory + docs (post-merge)

- [ ] **Step 2: Add the "Phase 3C.1k — PR-B Visual Design Pass" section to CLAUDE.md.**
- [ ] **Step 3: Add the §X "As shipped" addendum to this plan doc.**
- [ ] **Step 4: Add the §8.X update note to `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md`** for Show-to-Staff register shift.
- [ ] **Step 5: Mark §Q4 SHIPPED in `project_deferred_followups_index.md`** (and confirm §Q1, §Q2, §Q3, §Q5 stay deferred).
- [ ] **Step 6: Add the new memory file `project_pr_b_visual_design_pass_complete.md`** as the locked baseline (mirror PR-C's pattern).
- [ ] **Step 7: Add the index pointer in `MEMORY.md`** to the new memory file.

#### Step 7.3: Open the PR

- [ ] **Step 8: Run the final test sweep.**

```bash
cd apps/customer-app && npx tsc --noEmit
npx jest tests/features/voucher tests/features/merchant tests/lib --forceExit
cd ../.. && npx vitest run
```

Expected: all green. New tests added to the totals; no regression.

- [ ] **Step 9: Push branch + open PR-B.** Description: link to brief, scope summary, the device QA checklist as the test plan, list of files touched.

---

## Self-review checklist

Run this against the plan before handing back for owner approval:

1. **Spec coverage:** Brief §1-§14 — every section has a corresponding task or explicit "no-op" gate.
2. **Placeholder scan:** No "TBD", "TODO", "implement later" without code blocks. Visual-audit tasks (T3, T4) document the pass criteria explicitly.
3. **Type consistency:** New props (`voucherDescription`, `merchantLogoUrl`, `isRedeemed`) consistent across consumer + provider sites.
4. **Anti-fraud preservation:** §9.5 of the brief is covered by T6 Step 4 regression pass.
5. **Out-of-scope respect:** §12 of the brief — §Q1, §Q2, §Q3, §Q5 stay deferred. T5 closes §Q4 only.

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Show-to-Staff vertical receipt doesn't fit single-screen on iPhone SE (375 × 667) at default Dynamic Type | T1 Step 6 includes the iPhone SE small-screen layout test. If it fails, vertical-scroll with the QR + live signals as a sticky-bottom block. |
| 2 | Cream-on-cream warmth + dim ambient light reduces QR contrast below the camera-readable threshold | Existing brightness boost compensates. T6 Step 4 verifies. If still problematic, the QR card stays on a slightly higher-contrast tint without breaking the receipt aesthetic. |
| 3 | SuccessPopup count-up + sparkle pushes the popup entrance to feel "busy" | Owner picked subtle (option B). If on-device review feels heavy, drop sparkle and keep count-up only — count-up alone is the data-driven motion. |
| 4 | T3 audit surfaces a §Q1-Q5-territory issue that's bigger than "surgical fix" | Document the finding; defer to its own pass. Do NOT expand PR-B. |
| 5 | T4 audit surfaces a PIN sheet copy issue | Owner-approved copy stays unless a clear readability issue. Surface to owner; don't change unilaterally. |
| 6 | Merchant-profile voucher card redeemed variant gradient saturation (70%) reads too aggressive or too subtle | T5 Step 4 + T6 Step 1 includes visual review. Adjust within 60-80% range. |
| 7 | Android Material parity check surfaces issues that PR-A didn't catch | Treat as bugs to fix in PR-B. Document in §X "As shipped" addendum post-merge. |

## Out of scope (explicit)

Per brief §12. Do NOT touch:

- §Q1 — washed-out coupon body redesign on Voucher Detail
- §Q2 — REDEEMED stamp on the coupon body (separate from §Q4 hero stamp on the merchant-profile card)
- §Q3 — dimmed merchant card on Voucher Detail
- §Q5 — Settings → Redemption History past-cycle surface
- §S1 / §S3 PIN sheet additional polish beyond layout audit
- Confetti / celebration motion (§P3) — owner picked subtle (B)
- Show-to-Staff entry point on validated transition (§Z2) — rejected at PR-C
- Backend changes (any)
- `myReview` exposure on `getCustomerVoucher` payload (Tier 1 follow-up)
- `redemption.id` on `voucherDetailLastRedemptionSchema` (Tier 1 follow-up)

## Recommended sequencing (within PR-B)

T0 (gate) → T1 (Show-to-Staff register shift; the most architectural change) → T2 (SuccessPopup celebration; isolated motion work) → T5 (merchant-profile voucher card; isolated visual work) → T3 (Voucher Detail redeemed-state audit; surgical or no-op) → T4 (PIN sheet audit; surgical or no-op) → T6 (cross-cutting regression pass) → T7 (QA + docs + PR).

T1 first because it's the biggest geometry change and any other surface might cross-reference its testIDs. T2 + T5 are isolated; can run in parallel if subagent-driven. T3 + T4 are audits; their fixes (if any) are surgical. T6 is the cross-cutting checkpoint. T7 closes out.

## Owner approval gate

This plan does NOT mutate any code until the [shape brief](../../design-briefs/2026-05-09-pr-b-customer-redemption-visual-design-brief.md) is owner-approved. After approval:

1. Cut a fresh `feature/voucher-pr-b-visual-design-pass` branch from `main`.
2. Implement T0-T7 with the per-task TDD discipline + per-surface device-QA gates.
3. Run `/impeccable critique` + `/ui-ux-pro-max` Pre-Delivery Checklist before opening PR-B.
4. Hand back for owner page-review + on-device QA.
5. SHA-bound merge.

**Awaiting owner sign-off on:**

- [ ] Plan structure + task granularity
- [ ] T1 Show-to-Staff vertical receipt layout decisions (header band, eyebrow, voucher description block, merchant identity block, footer wordmark)
- [ ] T1 graceful logo fallback behaviour (initials when `merchantLogoUrl` null)
- [ ] T2 SuccessPopup motion implementations (count-up + sparkle ring + refined check-ring) + reduced-motion paths
- [ ] T3 Voucher Detail audit-only approach (surgical fixes only)
- [ ] T4 PIN sheet audit-only approach (surgical fixes only)
- [ ] T5 merchant-profile voucher card redeemed variant + REDEEMED stamp + 70% saturation + inline label
- [ ] T6 cross-cutting regression checklist as the device-QA merge gate
- [ ] T7 docs + memory updates pattern (mirror PR-C)
- [ ] Out-of-scope respect (§Q1, §Q2, §Q3, §Q5 stay deferred)
- [ ] Sequencing T0 → T1 → T2 → T5 → T3 → T4 → T6 → T7

Once approved, implementation begins.

---

## §AS. As Shipped (T8 device-QA + impeccable rounds, locked at PR head `545882a`)

The implementation diverged from this plan in several owner-direction-driven ways during the 12-round T8 device-QA + impeccable-pass cycle. The full per-surface as-shipped contract lives in the brief at [§A](../../design-briefs/2026-05-09-pr-b-customer-redemption-visual-design-brief.md). This section captures only the structural divergences from the task list above.

### Tasks added beyond T0-T7

- **T8a-T8r — 12 device-QA + impeccable rounds.** Each round was a focused commit (one workstream per commit) on top of the T1-T5 baseline. Round trail: T8a (backend `isRedeemedThisCycle`) → T8b/T8c (initial SuccessPopup + Show-to-Staff fixes from device QA) → T8e/T8f (brand-correctness fixes — only one navy is brand-locked per PRODUCT.md) → T8g (Show-to-Staff content discipline + diagonal stamp on merchant card) → T8h (cache invalidation + nav-buttons-not-dimmed + count copy) → T8i (Voucher Detail hero seal REVERTED to pre-`8802084` — the T8h "premium hairline" was applied to the wrong surface; refined treatment moved to merchant card) → T8j (impeccable: card-body recession via wash + flat shadow) → T8k (interaction-design: card stamp redesigned as diagonal Mustica overprint with motion entry) → T8l (impeccable BranchPickerSheet) → T8m (impeccable PinEntrySheet) → T8n (impeccable + interface-design SuccessPopup — Mustica display tier on title + saving) → T8o (owner: enlarge green check) → T8p (impeccable Show-to-Staff — `mono.redemption` variant) → T8q (QR overlay swapped to brand SVG + white anchor) → T8r (QR overlay navy + slightly bigger + identity-zone gap tightened).

### Surface scope changes vs original plan

- **Voucher BranchPickerSheet** — NOT in the original plan (T0-T7); added at T8l as part of the impeccable design-system alignment pass alongside PinEntrySheet T8m.
- **PinEntrySheet** — was audit-only at T4; T8m promoted to a full impeccable pass (token alignment + Mustica title + button-primary-lg spec) without touching any owner-iterated copy or layout decision.
- **Voucher Detail hero seal** — was `dimmed` prop addition at T3; T8i reverted to pre-`8802084` rubber-stamp `RedeemedSeal` exactly. The `dimmed` prop architecture remains (selectively applied to gradient + content + saveBadge; nav row stays full opacity).
- **Merchant Profile voucher card stamp** — original plan §3.5 single-word "REDEEMED" stamp top-right corner shipped at T5; iterated through T8i (centered "Voucher Redeemed" cream pill) → T8k (diagonal Mustica Pro Semibold 22pt cancellation overprint at -10°). Final shipped state in brief §A.1.

### Closed deferrals

- **§Q4 — Merchant Profile redeemed-card treatment** — closed via T5 + T8a (backend) + T8j (card body) + T8k (stamp). Marked closed in deferred-followups memory.

### Test totals at merge (`545882a`)

- Customer-app jest full suite: **1309/1310 ✅** (1 pre-existing baseline failure on `tests/lib/api/profile.test.ts` — documented existing-state, not introduced by PR-B).
- Voucher + merchant scope: **941/941 ✅** across 77 suites.
- Backend vitest: **553/553 ✅** across 60 files.
- `tsc --noEmit` (customer-app): clean.
