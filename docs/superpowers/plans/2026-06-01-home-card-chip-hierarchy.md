# Home Card / Chip Hierarchy — Batch 1B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Tier:** 2 (rebaseline of shared component; cascades to six consumer surfaces).
**Spec:** `docs/superpowers/specs/2026-06-01-home-visual-system-design.md` (§9.7, §10.2, §10.3, §11.1, §11.3, §11.5, §12).
**Reference prototype:** `.superpowers/brainstorm/home-card-chip-hierarchy/content/batch-1a-prototype.html`.

---

## Goal

Lock and implement the spec §9.7 BranchTile contract end-to-end. Promote name + info typography to Lato Semibold 16pt + Lato Regular 13pt, move the proximity indicator from a standalone chip in the pill row to a semantic-coloured inline clause inside the info line (nested `<Text>` child preserves the per-band sage / amber / brand-rose signal locked by PR #126 v1.8), neutralise VoucherCountPill, type-promote SavePill + StarRating, extend FavouriteHeart tap target to 44pt with differentiated add (lightHaptic + scale-bounce) vs remove (selection haptic + 0.92 dip) per spec §10.3, lock the info-line composition order (descriptor / locality / distance leading, with proximity as a sibling) and rely on native tail ellipsis for overflow (width-aware segment dropping deferred to a follow-up), and verify the promoted type survives Dynamic Type Largest (the design-system `<Text>` cap of `maxFontSizeMultiplier=1.4`) across Home rails, Map carousel, and Category results.

## Architecture

Batch 1B is a Tier 2 pure-presentation rebuild of the shared `<BranchTile>` (Home Featured / Popular / Trending / NearbyByCategory, Map carousel, Category results) plus four pill primitives (`SavePill`, `VoucherCountPill`, `StarRating`, `ProximityBandChip`) and the canonical `<FavouriteHeart>`.

Backend wire shape is untouched: `BranchTile` Zod schema, `homeFeedResponseSchema`, `inAreaResponseSchema`, `categoryMerchantsResponseSchema` stay byte-identical. No `lib/api/*.ts` files are modified.

Implementation order is TDD-strict per `superpowers:test-driven-development`:

1. Extract the info-line composition into a pure helper so the composition order (descriptor / locality / distance leading + sibling proximity clause) and the proximity-clause semantic colour can both be unit-tested without rendering anything. Overflow handling is native tail ellipsis on the leading Text; no width-aware segment drop in Batch 1B.
2. Promote name + info typography (Lato Semibold 16pt name, Lato Regular 13pt info).
3. Rebuild info line via the helper: descriptor / locality / distance / inline proximity clause as a nested `<Text>` carrying the per-band semantic colour.
4. Retire `<ProximityBandChip>` from the BranchTile pill row (mount-only removal; the component file stays exported for any future Discovery surface).
5. Add `flexWrap: 'wrap'` to the pill row AND remove `overflow: 'hidden'` from the card so a Dynamic-Type-Largest second row of pills does not get clipped by the card mask (reviewer #1 critical gap on flexWrap-vs-overflow).
6. Type-promote pill primitives: VoucherCountPill neutral 11pt SemiBold, SavePill 11pt SemiBold, StarRating 13pt rating + 11pt count + 14pt star.
7. Extend `<FavouriteHeart>` tap target to a 12-per-side `hitSlop` object (44pt effective on 28pt visual = comfortably above the 44pt minimum).
8. Split the haptic + animation per spec §10.3: ADD path fires `lightHaptic()` and the 1.0 → 1.15 → 1.0 pop; REMOVE path fires `haptics.selection()` and a 1.0 → 0.92 → 1.0 dip; reduce-motion path stays colour-only flip on both.
9. Rewrite or extend cross-surface test pins so PopularSection, MapBranchTile, Trending, FeaturedCarousel, NearbyByCategory and Category results all stay green after the chip-to-inline-clause flip.
10. Cross-surface FavouriteHeart audit + device QA matrix sign-off.

Each task is bounded to two to five minutes of focused implementation for a skilled engineer with zero Redeemo context. Commits happen at owner-approved checkpoints (see § Optional commit checkpoints near the end of this doc), not as part of executing each task.

## Tech Stack

React Native (Expo SDK 54), TypeScript strict, Reanimated 3, `expo-image`, `expo-haptics`, `lucide-react-native`, `jest-expo` (`--forceExit` per CLAUDE.md), `@testing-library/react-native`, `@tanstack/react-query` (only inside the test wrapper).

Design system: `@/design-system` tokens (`color`, `radius`, `spacing`, `elevation`, `typography`, `Text` variants), `PressableScale` motion primitive, `useReduceMotion()` hook, `haptics` named export at `@/design-system/haptics` (exposes both `lightHaptic` (impact light) and `haptics.selection` (selection)).

Fonts: Lato Regular / SemiBold / Bold. Mustica Pro is reserved for display surfaces on Home (header greeting, rail titles, chrome card titles) and MUST NOT appear inside BranchTile body content per spec §9.7.

Test runner: `npx jest --forceExit` from `<REDEEMO_ROOT>/apps/customer-app/` per CLAUDE.md "Running Tests".

Hook discipline: `useFavourite()` may only be called from `FavouriteHeart.tsx` + `useFavourite.ts` itself per the static-source allowlist pin at `apps/customer-app/src/features/favourites/__tests__/FavouriteHeart.test.tsx`. Batch 1B does NOT add new `useFavourite` callers; the haptics import added in Task 8 is unrelated to that allowlist.

No backend, no Prisma, no Zod schema, no `lib/api/*.ts` changes.

### Path conventions

The plan uses `<REDEEMO_ROOT>` as a portable placeholder for the active main checkout of the Redeemo repo. On this machine `<REDEEMO_ROOT>` resolves to `/Users/shebinchaliyath/Developer/Redeemo` for the main checkout. The plan deliberately does NOT hard-code the `.worktrees/customer-app/` worktree path because that worktree is currently checked out to `chore/fix-auth-followups` (not main). If you choose to run commands from a worktree instead, substitute its absolute path — node_modules + babel cache are shared as of 2026-04-26 (see "Test command stability" near the end of this doc for the full rationale).

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `apps/customer-app/src/features/shared/BranchTile.tsx` | modify | Promote name (16pt Lato-SemiBold) + info (13pt Lato-Regular) typography per §9.7. Replace inline string `infoText` composition with the new `composeInfoLine()` pure helper. Render info line as a parent `<Text>` with a nested `<Text>` child for the proximity clause carrying the band-specific colour (sage / amber / brand-rose per PR #126 v1.8). Remove the `<ProximityBandChip>` JSX mount + its import. Remove `overflow: 'hidden'` from `styles.card` AND add `flexWrap: 'wrap'` to `styles.pillRow` so Dynamic Type Largest does not clip a wrapped second row. Drop the unused `spacing` import alongside Task 2's drop (or keep if a token gap surfaces; documented inline). Document Map carousel close-button-vs-heart non-conflict (MapBranchTile's outer close button is independent of BranchTile's `showClose` prop). |
| `apps/customer-app/src/features/shared/infoLine.ts` | create | Pure helper module exporting `composeInfoLine({descriptor, locality, distance, proximity})` returning `{ leading: string, proximity: string \| null }`. Drives both the visible info line AND the accessibility label cascade. Pure function = unit-testable without any React render. |
| `apps/customer-app/src/features/shared/VoucherCountPill.tsx` | modify | Replace brand-rose tinted background (`rgba(226,12,4,0.08)` + `color.brandRose` text) with neutral treatment: `color.surface.subtle` background + `color.text.primary` text. Bump `fontSize` 10pt to 11pt. Swap `fontFamily: 'Lato-Bold'` to `'Lato-SemiBold'` (Bold is reserved for name per §9.7). Add `if (count <= 0) return null` defensive null guard (closes a latent caller bug where count=0 rendered "0 vouchers"). |
| `apps/customer-app/src/features/shared/SavePill.tsx` | modify | Bump `fontSize` 10pt to 11pt. Swap `fontFamily: 'Lato-Bold'` to `'Lato-SemiBold'` per §9.7. Keep mint LinearGradient, emerald text `#047857`, `Math.round(amount)` copy, null/zero-amount guard, padding, radius. |
| `apps/customer-app/src/features/shared/StarRating.tsx` | modify | Bump rating Text `fontSize` 11pt to 13pt, count Text `fontSize` 10pt to 11pt, Star icon `size` 12 to 14. Add `testID="star-rating-icon"` to the Star JSX element so the size prop can be asserted directly without coupling to `lucide-react-native`'s `forwardRef` internals. Use `color.text.primary` (navy) for rating, `color.text.tertiary` for count (token alignment per reviewer #1 minor). Keep amber star `#F59E0B`, Lato-Bold weight on rating (count stays Lato-Regular), `null` guard. |
| `apps/customer-app/tests/features/shared/StarRating.test.tsx` | create | NEW standalone suite. Pins (a) `getByTestId('star-rating-icon').props.size === 14`; (b) rating Text flat style has `fontSize: 13` + `fontFamily: 'Lato-Bold'`; (c) count Text flat style has `fontSize: 11`; (d) `rating === null` returns `null` (preserve existing null-guard). Decouples the icon-size guarantee from BranchTile composition so a future BranchTile redesign that drops StarRating cannot silently lose the pin. |
| `apps/customer-app/src/features/favourites/components/FavouriteHeart.tsx` | modify | Change `hitSlop={10}` (numeric) to `hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}` (object form) per §11.1. Branch the press handler on `isFavourited` BEFORE toggling: add path runs `lightHaptic()` and the existing 1.0 → 1.15 → 1.0 pop (320ms total split per leg, ease-out cubic); remove path runs `haptics.selection()` and a 1.0 → 0.92 → 1.0 dip (200ms total split per leg, ease-out quad). Reduce-motion path: colour-only flip on BOTH directions (skip pop AND dip), but haptics still fire (haptics are not gated by reduce-motion per the project's standing rule — they're a separate accessibility channel). DO NOT swap the outer `Pressable` for `PressableScale` (would create a competing scale source against the Reanimated animation; documented in spec risk notes). |
| `apps/customer-app/tests/features/shared/infoLine.test.ts` | create | NEW pure-function suite for `composeInfoLine()`. Pins (a) full 4-segment compose with IN_YOUR_AREA returns leading `"Italian Restaurant · Brightlingsea · 1.0 miles away"` and proximity `"In your area"`; (b) NEARBY band returns proximity `null`; (c) null/undefined band returns proximity `null`; (d) A_LITTLE_FURTHER returns `"A short trip away"`; (e) NEAREST_ON_REDEEMO returns `"Nearest match on Redeemo"`; (f) null distance returns leading without orphan separator; (g) null locality + null distance + non-null proximity returns descriptor-only leading and the proximity child; (h) all null returns leading=descriptor only, proximity=null; (i) composition order is descriptor / locality / distance joined by ` · ` with proximity returned as a separate sibling string — no segment-drop cascade is implemented; overflow handling is delegated to native tail ellipsis on the leading Text. |
| `apps/customer-app/tests/features/shared/BranchTile.typography.test.tsx` | create | NEW suite locking spec §9.7 typography. Pins (a) merchant name `<Text>` flat style has `fontSize: 16` + `fontFamily: 'Lato-SemiBold'`; (b) info-line `<Text>` flat style has `fontSize: 13` + `fontFamily: 'Lato-Regular'`. Uses `StyleSheet.flatten()` (not `Object.assign`) per reviewer #4 minor — robust against numeric StyleSheet IDs. Uses `makeBranchTile()` fixture from `tests/fixtures/branchTile.ts` (NOT inline fixtures) to dodge the `distance` vs `distanceMetres` wire-field trap from reviewer #1 / #2 / #4 critical. |
| `apps/customer-app/tests/features/shared/BranchTile.infoLine.test.tsx` | create | NEW render-level suite covering composition, semantic colour, and absence of `<ProximityBandChip>`. Pins (a) full 4-segment text appears in DOM for IN_YOUR_AREA tile; (b) NEARBY band suppresses the proximity child node entirely (queryByText returns null for all three band labels); (c) null band suppresses; (d) A_LITTLE_FURTHER renders "A short trip away" inside the info `<Text>` with `color: color.warning` on the inner `<Text>` child; (e) NEAREST_ON_REDEEMO renders "Nearest match on Redeemo" with `color: color.brandRose` on the inner child; (f) IN_YOUR_AREA renders "In your area" with `color: color.success`; (g) null distance + IN_YOUR_AREA does NOT produce double-separator (`· ·`); (h) null locality fields do NOT produce double-separator; (i) all-null compose leaves descriptor-only leading + no proximity child. |
| `apps/customer-app/tests/features/shared/BranchTile.pillRow.test.tsx` | create | NEW suite locking post-Batch-1B pill-row composition. Pins (a) both `VoucherCountPill` + `SavePill` render when both have content (`getByText('3 vouchers')` + `getByText('Save up to £9')`); (b) only `VoucherCountPill` renders when `maxEstimatedSaving === null`; (c) `VoucherCountPill` is suppressed when `voucherCount === 0` (defensive null-guard pin); (d) NO `ProximityBandChip` element renders inside the tile regardless of band — asserted via `UNSAFE_queryByType(ProximityBandChip)` returning null (reviewer #1 important on fragile label-only negative pin); (e) `styles.pillRow` flat style includes `flexWrap: 'wrap'`; (f) `styles.card` flat style does NOT include `overflow: 'hidden'` (closes the flexWrap-vs-overflow critical gap); (g) `VoucherCountPill` flat text style has `fontSize: 11` + `fontFamily: 'Lato-SemiBold'`; (h) `SavePill` flat text style has `fontSize: 11` + `fontFamily: 'Lato-SemiBold'`; (i) `StarRating` rating-number flat style has `fontSize: 13`; (j) `StarRating` count flat style has `fontSize: 11`. Star icon `size: 14` is pinned by the new standalone `StarRating.test.tsx` suite (see Task 5), NOT by this BranchTile composition suite — keeps the icon-size guarantee decoupled from BranchTile's child mount so a future BranchTile redesign that drops StarRating cannot silently lose the pin. |
| `apps/customer-app/tests/features/shared/BranchTile.tapPropagation.test.tsx` | create | NEW suite locking layered-tap contract: tapping the heart must NOT also fire the card's `onPress`. Pins (a) heart press calls `lightHaptic()` (when adding) or `haptics.selection()` (when removing) and does NOT call `onPress`; (b) card body press DOES call `onPress` and does NOT call any haptic from the heart. Defends against accidental gesture bubble-up after the `hitSlop` expansion. |
| `apps/customer-app/tests/features/shared/BranchTile.locality.test.tsx` | modify | Rewrite the 7-pin matrix + 2 realistic-payload pins to reference the new helper's output AND lock the intentional a11y label asymmetry. Pins for IN_YOUR_AREA / A_LITTLE_FURTHER / NEAREST_ON_REDEEMO realistic payloads must now ALSO assert that distance + proximity strings are NOT substrings of the `accessibilityLabel` (reviewer #1 important: lock the spec-compliant cascade asymmetry against silent regression). The §DH realistic-payload pin (Covelum Brightlingsea + Covelum Colchester) survives copy-unchanged because `proximityBand: 'IN_YOUR_AREA'` now adds a 4th visible segment but the existing `/^Indian Restaurant · Brightlingsea/` regex prefix still matches. |
| `apps/customer-app/tests/features/shared/BranchTile.proximity-chip.test.tsx` | modify | Refactor from "standalone chip element rendered" to "inline proximity clause rendered inside info-line `<Text>`". Keep the three label strings + the three null-band defensive pins. Add a top-of-file JSDoc explaining the file name now refers to "the proximity clause replacing the chip" rather than the chip element itself (file rename deferred to a Tier 0 hygiene PR to avoid CI churn). The new pins use `getByText(/^Italian Restaurant · .* · 1\.0 miles away · In your area$/)` full-string anchors so future fixture changes can't accidentally pass via partial match. |
| `apps/customer-app/tests/features/shared/BranchTile.distance-format.test.tsx` | modify | Verify the 3 existing pins still pass against the new info-line composition (`formatDistance` copy "X.X miles away" is unchanged and the substring assertions survive). Add 1 new pin: null distance with non-null proximityBand renders `"Café · In your area"` (descriptor + proximity, no orphan separator and no empty distance segment). |
| `apps/customer-app/tests/features/shared/BranchTile.image.test.tsx` | modify | Verify the 5 existing pins still pass (no banner / logo / placeholder changes in this batch). Regression safety net; no rewrites expected. Included in Task 14's regression sweep. |
| `apps/customer-app/src/features/favourites/__tests__/FavouriteHeart.test.tsx` | modify | Add 6 new pins: (a) `hitSlop` equals the object form `{ top: 12, bottom: 12, left: 12, right: 12 }`; (b) 28pt visual + 12pt slop equals 52pt effective tap target on each axis (asserts arithmetic `>= 44`); (c) press on UNFAVOURITED tile fires `lightHaptic()` exactly once and runs the 1.15 pop; (d) press on FAVOURITED tile fires `haptics.selection()` exactly once and runs the 0.92 dip; (e) disabled press does NOT fire any haptic; (f) reduce-motion press still fires the per-direction haptic but skips both pop and dip. Preserves all 17 existing pins (`useFavourite` plumbing, brand-rose tones, size, disabled, accessibility labels, static-source allowlist). Haptic mocks added at the top alongside the existing `jest.mock` block (hoisted above imports per jest semantics; see Task 8 implementation notes). |
| `apps/customer-app/tests/features/home/components/FeaturedCarousel.test.tsx` | modify | Verify the existing FEATURED badge + distance substring pins still pass against the rebuilt BranchTile. Distance copy "X.X miles away" is unchanged; FEATURED badge unchanged. Regression safety net; included in Task 14. |
| `apps/customer-app/tests/features/home/components/PopularSection.test.tsx` | modify | Update the `getByText('In your area')` chip-presence pin to a stricter assertion: use `getAllByText(/In your area/)` with a length check OR full-string anchor `getByText(/Restaurant · .* · In your area$/)` per reviewer #1 important on substring-matcher fragility. Reason: a future regression that double-renders both the chip AND the inline clause would silently pass with a naive substring matcher. Preserve null-band negative pin. |
| `apps/customer-app/tests/features/map/MapBranchTile.test.tsx` | modify | Same change as PopularSection BUT additionally defend against the merchant-name collision (the test fixture uses `businessName: 'In Your Area Cafe'` which contains the substring "In your area" — confirmed in the existing test file at line 212-225). Use a regex with a leading separator anchor: `getByText(/· In your area$/)` matches the inline clause but not the merchant name. Preserve merchant-name, close-button, Covelum 2-card, onBranchPress, multi-branch dot-indicator pins unchanged. |
| `apps/customer-app/tests/features/search/SearchResultItem.proximity-chip.test.tsx` | (verify only — no edits) | Plan explicitly does NOT touch this file. SearchResultItem renders its OWN `proximityRowLabel` helper, NOT the shared `<ProximityBandChip>`. Confirmed via grep. The `'In your area'` string in this file is unaffected by Batch 1B. Included in Task 14's regression sweep as a defence-in-depth check. |
| `apps/customer-app/tests/design-system/components/ProximityBandChip.test.tsx` | (verify only — no edits) | The component file stays exported; its standalone unit tests continue to pass. Included in Task 14's regression sweep. |
| `apps/customer-app/src/design-system/components/ProximityBandChip.tsx` | modify | Add a top-of-file JSDoc note documenting the Batch 1B BranchTile retirement: "Mounted as a standalone chip element by zero production callers as of Batch 1B (2026-06-01). Replaced inline inside `<BranchTile>` info line with the same semantic-colour mapping. Component remains exported for any future Discovery surface that wants a standalone chip treatment." Also add `testID="proximity-band-chip"` to the outer `<View>` so future negative assertions can use `queryByTestId` instead of fragile label queries. No behavioural change. |
| `apps/customer-app/tests/_meta/proximity-chip-no-jsx-consumers.test.ts` | create | NEW meta-pin (mirrors the existing static-source allowlist pattern at `src/features/favourites/__tests__/FavouriteHeart.test.tsx`). Walks `apps/customer-app/src` and asserts NO `.tsx` file mounts `<ProximityBandChip` as a JSX element. The component file itself + the import inside `ProximityBandChip.tsx` are allowlisted. Defends against a future accidental remount in BranchTile or another surface, since the inline clause is now the locked treatment. |

---

## Task 1: Plan doc kickoff (owner-approved checkpoint)

**Files:**
- Create: `docs/superpowers/plans/2026-06-01-home-card-chip-hierarchy.md` (this file)

- [ ] **Step 1: Verify Tier 2 classification**

Per CLAUDE.md "Workflow Tier Calibration": this batch touches the shared `<BranchTile>`, 4 pill primitives, AND the shared `<FavouriteHeart>` (cascades to six consumer surfaces). Per "all rebaseline work is Tier 2 by default" + "Tier 2 + 3 require plan/spec docs first", this is Tier 2.

- [ ] **Step 2: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

When the owner approves, stage `docs/superpowers/plans/2026-06-01-home-card-chip-hierarchy.md` and commit with the message recorded in the Optional commit checkpoints section. Do NOT auto-stage or auto-commit as part of executing this task.

---

## Task 2: BranchTile token + import audit (radius.lg + spacing)

**Files:**
- Verify: `apps/customer-app/src/design-system/tokens.ts` (no edits)
- Modify: `apps/customer-app/src/features/shared/BranchTile.tsx` (line 6 import + verify radius usage)

- [ ] **Step 1: Verify radius.lg resolves to 16pt**

Read `apps/customer-app/src/design-system/tokens.ts` line 82: `radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, pill: 9999 }`. Confirms `radius.lg === 16` per spec §9.7. The existing `borderRadius: radius.lg` on `styles.card` is already correct. No code change.

- [ ] **Step 2: Decide on the `spacing` import**

Read the existing `BranchTile.tsx` import at line 6: `import { Text, color, radius, spacing, elevation } from '@/design-system'`. The `spacing` token is currently UNUSED inside the StyleSheet (hardcoded values 18 / 12 / 10 / 6 / 4 appear in `styles.content`, `styles.pillRow`). The spacing scale is `[0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]` (verified) — there is no `spacing[1.5]` and no fractional indices, so the existing `6pt` gap on `styles.pillRow` has no clean token mapping.

Decision (closes reviewer #4 important on Task 2 contradiction with Tasks 6/8): keep the `spacing` import. Task 6 (Step 4) uses `marginRight: spacing[1]` (= 4pt) on the name style, which has a clean token mapping. The `pillRow` `gap: 6` stays as a literal with an inline comment explaining the no-clean-token reason. No import removal step in this batch; the pre-existing token-vs-literal inconsistency in `styles.content` is left as-is and flagged as a deferred follow-up at the foot of this doc.

- [ ] **Step 3: No commit checkpoint for Task 2**

Task 2 is a verification-only step. No diff, no commit. Findings carry forward into Tasks 3 / 6 / 8.

---

## Task 3: VoucherCountPill — neutral treatment + 11pt SemiBold + null-guard

**Files:**
- Modify: `apps/customer-app/src/features/shared/VoucherCountPill.tsx`
- Test (created later in Task 9): `apps/customer-app/tests/features/shared/BranchTile.pillRow.test.tsx`

- [ ] **Step 1: Open the current component**

Current implementation:

```tsx
import React from 'react'
import { View } from 'react-native'
import { Text, color, radius, spacing } from '@/design-system'

export function VoucherCountPill({ count }: { count: number }) {
  return (
    <View style={{ backgroundColor: 'rgba(226,12,4,0.08)', borderRadius: radius.pill, paddingHorizontal: spacing[2], paddingVertical: 2 }}>
      <Text variant="label.md" style={{ color: color.brandRose, fontFamily: 'Lato-Bold', fontSize: 10 }}>
        {count} {count === 1 ? 'voucher' : 'vouchers'}
      </Text>
    </View>
  )
}
```

- [ ] **Step 2: Replace with neutral treatment + 11pt + null-guard**

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, color, radius, spacing } from '@/design-system'

export function VoucherCountPill({ count }: { count: number }) {
  if (count <= 0) return null
  const label = count === 1 ? '1 voucher' : `${count} vouchers`
  return (
    <View style={styles.pill}>
      <Text variant="label.md" style={styles.text}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: color.surface.subtle,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 11,
    color: color.text.primary,
  },
})
```

Token notes (reviewer #2 minor on surface.subtle vs cream): `color.surface.subtle` (`#F3F4F6`, flat cool grey) is the deliberate choice over `color.surface.tint` (cream). DESIGN.md "Cream-for-Identity" rule reserves cream for state surfaces (selected branch picker rows, redemption details card hero) — the voucher count pill is NOT identity, it is metadata, so flat grey is correct. The pill stays visually neutral so the SavePill (mint gradient) can carry the visual emphasis on rails where both render.

- [ ] **Step 3: No standalone test file**

Pill behaviour is observable through BranchTile. Tasks 9 step pins (g) + null-guard pin (c) cover this component.

- [ ] **Step 4: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 4: SavePill — 11pt Lato-SemiBold

**Files:**
- Modify: `apps/customer-app/src/features/shared/SavePill.tsx`

- [ ] **Step 1: Update font weight + size**

Current:

```tsx
<Text variant="label.md" style={{ color: '#047857', fontFamily: 'Lato-Bold', fontSize: 10 }}>
  Save up to £{Math.round(amount)}
</Text>
```

Replace with:

```tsx
<Text variant="label.md" style={{ color: '#047857', fontFamily: 'Lato-SemiBold', fontSize: 11 }}>
  Save up to £{Math.round(amount)}
</Text>
```

Keep the LinearGradient (`['#ECFDF5', '#D1FAE5']`), the `Math.round` copy, the null/zero-amount guard, and all padding / radius unchanged. Lato-SemiBold (Bold is reserved for the merchant name per spec §9.7).

- [ ] **Step 2: No standalone test file**

Observable through BranchTile. Task 9 pins (h) covers this.

- [ ] **Step 3: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 5: StarRating — 13pt rating, 11pt count, 14pt star

**Files:**
- Modify: `apps/customer-app/src/features/shared/StarRating.tsx`

- [ ] **Step 1: Update sizes + tokens**

Current:

```tsx
<Star size={12} fill="#F59E0B" color="#F59E0B" />
<Text variant="label.md" style={{ fontSize: 11, fontFamily: 'Lato-Bold', color: '#010C35' }}>
  {rating.toFixed(1)}
</Text>
<Text variant="label.md" style={{ fontSize: 10, color: '#9CA3AF' }}>
  ({count})
</Text>
```

Replace with:

```tsx
import React from 'react'
import { View } from 'react-native'
import { Star } from 'lucide-react-native'
import { Text, color } from '@/design-system'

export function StarRating({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Star testID="star-rating-icon" size={14} fill="#F59E0B" color="#F59E0B" />
      <Text variant="label.md" style={{ fontSize: 13, fontFamily: 'Lato-Bold', color: color.text.primary }}>
        {rating.toFixed(1)}
      </Text>
      <Text variant="label.md" style={{ fontSize: 11, color: color.text.tertiary }}>
        ({count})
      </Text>
    </View>
  )
}
```

Token migration (reviewer #1 important on hex literal vs token): `'#010C35'` → `color.text.primary`, `'#9CA3AF'` → `color.text.tertiary`. Star colour stays as an inline hex (`#F59E0B` is amber; there is no dedicated amber token). Gap bumped 2 → 3 to keep visual proportion against the larger glyph. `testID="star-rating-icon"` on the Star element exists so the standalone test in Step 2 can assert the `size` prop directly without coupling to `lucide-react-native`'s `forwardRef` internals.

This cascades to BOTH BranchTile (via its `<StarRating>` mount in `styles.nameRow`) AND `MapListView`'s `BranchRow` (verified by grep). MapListView's `BranchRow` test asserts only on merchant-name, distance, and thumbnail colour — those copy strings do not change, so MapListView tests survive. Task 14 regression sweep includes `tests/features/map/MapListView.test.tsx` as a defence-in-depth check.

- [ ] **Step 2: Create the standalone test file**

Create `apps/customer-app/tests/features/shared/StarRating.test.tsx` so the icon-size guarantee is decoupled from BranchTile composition (a future BranchTile redesign that drops StarRating cannot silently lose the pin). This replaces the previous deferral to Task 9 pin (k), which was comment-only and code-review-dependent.

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { StarRating } from '@/features/shared/StarRating'

describe('StarRating — Batch 1B type-promote + testID-pinned icon size', () => {
  it('Star icon renders at size=14 (testID-pinned)', () => {
    const { getByTestId } = render(<StarRating rating={4.5} count={12} />)
    expect(getByTestId('star-rating-icon').props.size).toBe(14)
  })

  it('rating Text renders at 13pt Lato-Bold', () => {
    const { getByText } = render(<StarRating rating={4.5} count={12} />)
    const flat = StyleSheet.flatten(getByText('4.5').props.style)
    expect(flat.fontSize).toBe(13)
    expect(flat.fontFamily).toBe('Lato-Bold')
  })

  it('count Text renders at 11pt', () => {
    const { getByText } = render(<StarRating rating={4.5} count={12} />)
    const flat = StyleSheet.flatten(getByText('(12)').props.style)
    expect(flat.fontSize).toBe(11)
  })

  it('rating === null returns null (preserves existing null-guard)', () => {
    const { toJSON } = render(<StarRating rating={null} count={0} />)
    expect(toJSON()).toBeNull()
  })
})
```

Task 9 pins (i)+(j) still cover rating + count fontSize via BranchTile as a defence-in-depth check; pin (k) (Star size) moves out of Task 9 into this standalone suite.

- [ ] **Step 3: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 6: Extract `composeInfoLine()` pure helper + write the helper unit-test suite

**Files:**
- Create: `apps/customer-app/src/features/shared/infoLine.ts`
- Create: `apps/customer-app/tests/features/shared/infoLine.test.ts`

- [ ] **Step 1: Write the failing test FIRST**

Create `apps/customer-app/tests/features/shared/infoLine.test.ts`:

```ts
import { composeInfoLine } from '@/features/shared/infoLine'

describe('composeInfoLine — spec §9.7 info-line composition', () => {
  it('full 4-segment compose with IN_YOUR_AREA', () => {
    const out = composeInfoLine({
      descriptor: 'Italian Restaurant',
      locality:   'Brightlingsea',
      distance:   '1.0 miles away',
      band:       'IN_YOUR_AREA',
    })
    expect(out.leading).toBe('Italian Restaurant · Brightlingsea · 1.0 miles away')
    expect(out.proximity).toBe('In your area')
  })

  it('NEARBY band returns proximity=null (no chip / clause)', () => {
    const out = composeInfoLine({
      descriptor: 'Italian Restaurant',
      locality:   'Brightlingsea',
      distance:   '1.0 miles away',
      band:       'NEARBY',
    })
    expect(out.leading).toBe('Italian Restaurant · Brightlingsea · 1.0 miles away')
    expect(out.proximity).toBeNull()
  })

  it('null band returns proximity=null', () => {
    const out = composeInfoLine({
      descriptor: 'Italian Restaurant',
      locality:   'Brightlingsea',
      distance:   '1.0 miles away',
      band:       null,
    })
    expect(out.proximity).toBeNull()
  })

  it('undefined band returns proximity=null', () => {
    const out = composeInfoLine({
      descriptor: 'Italian Restaurant',
      locality:   'Brightlingsea',
      distance:   '1.0 miles away',
      band:       undefined,
    })
    expect(out.proximity).toBeNull()
  })

  it('A_LITTLE_FURTHER returns "A short trip away"', () => {
    expect(composeInfoLine({
      descriptor: 'Café',
      locality:   '',
      distance:   '',
      band:       'A_LITTLE_FURTHER',
    }).proximity).toBe('A short trip away')
  })

  it('NEAREST_ON_REDEEMO returns "Nearest match on Redeemo"', () => {
    expect(composeInfoLine({
      descriptor: 'Café',
      locality:   '',
      distance:   '',
      band:       'NEAREST_ON_REDEEMO',
    }).proximity).toBe('Nearest match on Redeemo')
  })

  it('empty distance produces no orphan separator in leading', () => {
    const out = composeInfoLine({
      descriptor: 'Café',
      locality:   'Brightlingsea',
      distance:   '',
      band:       'IN_YOUR_AREA',
    })
    expect(out.leading).toBe('Café · Brightlingsea')
    expect(out.proximity).toBe('In your area')
  })

  it('empty locality produces no orphan separator in leading', () => {
    const out = composeInfoLine({
      descriptor: 'Café',
      locality:   '',
      distance:   '1.0 miles away',
      band:       'IN_YOUR_AREA',
    })
    expect(out.leading).toBe('Café · 1.0 miles away')
    expect(out.proximity).toBe('In your area')
  })

  it('all-null compose returns descriptor-only leading + null proximity', () => {
    const out = composeInfoLine({
      descriptor: 'Café',
      locality:   '',
      distance:   '',
      band:       null,
    })
    expect(out.leading).toBe('Café')
    expect(out.proximity).toBeNull()
  })

  it('composition order is descriptor / locality / distance with proximity as a separate sibling', () => {
    // The helper does not implement any width-aware segment-drop cascade.
    // It documents composition order via its return shape:
    //   - leading contains [descriptor, locality, distance] joined by ` · `
    //   - proximity returned SEPARATELY so consumers can render it as
    //     a nested <Text> sibling.
    // Overflow handling is delegated to native RN tail ellipsis on the
    // leading Text (`numberOfLines={1}`). Native ellipsis does NOT respect
    // segment boundaries — it cuts whatever overflows from the right and
    // can clip mid-segment. A real width-aware segment-drop is deferred
    // to a follow-up (see DSN.6).
    expect(composeInfoLine({
      descriptor: 'D',
      locality:   'L',
      distance:   'X',
      band:       'IN_YOUR_AREA',
    })).toEqual({ leading: 'D · L · X', proximity: 'In your area' })
  })

  it('descriptor is the load-bearing final survivor — never empty', () => {
    // Defensive: if a consumer somehow passes a fully empty fixture,
    // leading collapses to an empty string. The helper does NOT throw;
    // it is the consumer's job to suppress the empty-leading render.
    const out = composeInfoLine({ descriptor: '', locality: '', distance: '', band: null })
    expect(out.leading).toBe('')
    expect(out.proximity).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest tests/features/shared/infoLine.test.ts --forceExit
```

Expected: FAIL with `Cannot find module '@/features/shared/infoLine'` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `apps/customer-app/src/features/shared/infoLine.ts`:

```ts
/**
 * Batch 1B (2026-06-01) — pure-function composition helper for the
 * shared <BranchTile> info line per spec §9.7.
 *
 * Returns:
 *   - leading: a single string composed of [descriptor, locality, distance]
 *     joined by ` · ` (Unicode middot U+00B7), null/empty segments dropped
 *     via `.filter(Boolean)` so there are no orphan separators.
 *   - proximity: the per-band human-friendly clause OR null for NEARBY /
 *     null / undefined / unknown bands. Returned separately so the consumer
 *     can render it as a nested <Text> child carrying the band-specific
 *     semantic colour (sage / amber / brand-rose per PR #126 v1.8 lock).
 *
 * Overflow handling is delegated to native RN tail ellipsis on the
 * leading Text (`numberOfLines={1}`). Native ellipsis cuts whatever
 * overflows from the right and does NOT respect segment boundaries —
 * mid-segment clipping can occur under tight widths. There is no
 * width-aware segment-drop cascade in Batch 1B. Proximity is rendered
 * as a sibling Text and could be conditionally dropped by a future
 * onLayout-driven polish (see DSN.6) independently of the leading.
 * The §DH descriptor → locality → distance composition order is the
 * locked product-rule baseline.
 */

import type { ProximityBand } from '@/lib/api/discovery'

export type InfoLineInput = {
  descriptor: string
  locality:   string
  distance:   string
  band:       ProximityBand | null | undefined
}

export type InfoLineOutput = {
  leading:   string
  proximity: string | null
}

const BAND_LABEL: Record<ProximityBand, string | null> = {
  NEARBY:             null,
  IN_YOUR_AREA:       'In your area',
  A_LITTLE_FURTHER:   'A short trip away',
  NEAREST_ON_REDEEMO: 'Nearest match on Redeemo',
}

export function composeInfoLine(input: InfoLineInput): InfoLineOutput {
  const leading   = [input.descriptor, input.locality, input.distance].filter(Boolean).join(' · ')
  const proximity = input.band == null ? null : BAND_LABEL[input.band] ?? null
  return { leading, proximity }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command. Expected: `Tests: 11 passed, 11 total`.

- [ ] **Step 5: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 7: BranchTile typography promotion (name 16pt, info 13pt)

**Files:**
- Modify: `apps/customer-app/src/features/shared/BranchTile.tsx` (lines 187, 192, 284-291)
- Create: `apps/customer-app/tests/features/shared/BranchTile.typography.test.tsx`

- [ ] **Step 1: Write the failing test FIRST**

Create `apps/customer-app/tests/features/shared/BranchTile.typography.test.tsx`:

```tsx
import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile typography promotion (spec §9.7)', () => {
  it('merchant name renders at 16pt Lato-SemiBold', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const nameNode = getByText('Covelum')
    const flat = StyleSheet.flatten(nameNode.props.style)
    expect(flat.fontSize).toBe(16)
    expect(flat.fontFamily).toBe('Lato-SemiBold')
  })

  it('info line renders at 13pt Lato-Regular', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // The info line is the parent <Text> containing the descriptor leading.
    // We anchor on a substring unique to the info line (not the merchant name
    // 'Covelum' and not the proximity child).
    const infoNode = getByText(/^Italian Restaurant · Brightlingsea · 1\.0 miles away/)
    const flat = StyleSheet.flatten(infoNode.props.style)
    expect(flat.fontSize).toBe(13)
    expect(flat.fontFamily).toBe('Lato-Regular')
  })
})
```

Notes (reviewer #1 + #2 + #4 critical fixes baked in):
- Fixture uses `makeBranchTile()` (NOT inline). Wire field is `distance` not `distanceMetres`.
- Uses `StyleSheet.flatten()` (NOT `Object.assign`) per reviewer #4 minor — robust against numeric StyleSheet IDs.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest tests/features/shared/BranchTile.typography.test.tsx --forceExit
```

Expected: FAIL (current code uses 13pt Lato-Bold name + 10.5pt info).

- [ ] **Step 3: Promote typography in BranchTile.tsx**

Locate the `styles.name` + `styles.info` entries (lines 284-291) and replace:

```tsx
name: {
  fontSize: 16,
  fontFamily: 'Lato-SemiBold',
  color: color.text.primary,
  flex: 1,
  marginRight: spacing[1],
},
info: {
  fontSize: 13,
  fontFamily: 'Lato-Regular',
  color: color.text.tertiary,
},
```

Token alignment per reviewer #1 important: `'#010C35'` → `color.text.primary`; `'#9CA3AF'` → `color.text.tertiary`; `marginRight: 4` → `marginRight: spacing[1]` (= 4pt, exact token match).

Inside the JSX at the existing `nameRow` (line 187): the current `<Text variant="body.sm" style={styles.name} numberOfLines={1}>` keeps `variant="body.sm"` because the inline style fully overrides `fontSize` + `fontFamily`. The `<Text>` design-system component still applies `allowFontScaling` + `maxFontSizeMultiplier=1.4` (verified at `src/design-system/Text.tsx:43-44`), which honours spec §11.5 Dynamic Type rule with the project's intentional 1.4× cap.

Same for the info line at line 192: `<Text variant="label.md" style={styles.info} numberOfLines={1}>` keeps the variant; inline `styles.info` overrides size + family.

- [ ] **Step 4: Run test to verify it passes**

Re-run the test command. Expected: `Tests: 2 passed, 2 total`.

- [ ] **Step 5: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 8: FavouriteHeart — 44pt hitSlop + split haptic/animation per spec §10.3

**Files:**
- Modify: `apps/customer-app/src/features/favourites/components/FavouriteHeart.tsx`
- Modify: `apps/customer-app/src/features/favourites/__tests__/FavouriteHeart.test.tsx`

- [ ] **Step 1: Write the failing tests FIRST**

Open `apps/customer-app/src/features/favourites/__tests__/FavouriteHeart.test.tsx`.

First, add the haptic mock alongside the existing `jest.mock` block. Jest hoists `jest.mock(...)` calls above imports automatically, so place it between the existing reanimated mock (ends line 71) and the FavouriteHeart import (line 73). Add immediately after the reanimated mock:

```tsx
const mockLightHaptic     = jest.fn()
const mockSelectionHaptic = jest.fn()
jest.mock('@/design-system/haptics', () => ({
  __esModule: true,
  lightHaptic: () => mockLightHaptic(),
  haptics: {
    selection: () => mockSelectionHaptic(),
  },
}))
```

Add to the existing `beforeEach` (currently lines 75-82):

```tsx
mockLightHaptic.mockReset()
mockSelectionHaptic.mockReset()
```

Then append at the end of the file, after the existing static-source pin block:

```tsx
describe('FavouriteHeart — Batch 1B hitSlop + split haptic/animation (spec §10.3 + §11.1)', () => {
  it('hitSlop is the Batch 1B locked 12-per-side object form', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />,
    )
    expect(getByTestId('heart').props.hitSlop).toEqual({ top: 12, bottom: 12, left: 12, right: 12 })
  })

  it('effective tap target is at least 44pt on each axis (28pt visual + 12pt slop = 52pt)', () => {
    const visual    = 28
    const slop      = { top: 12, bottom: 12, left: 12, right: 12 }
    const onYAxis   = visual + slop.top  + slop.bottom
    const onXAxis   = visual + slop.left + slop.right
    expect(onYAxis).toBeGreaterThanOrEqual(44)
    expect(onXAxis).toBeGreaterThanOrEqual(44)
  })

  it('ADD path (initially unfavourited) press fires lightHaptic() exactly once', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />,
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockLightHaptic).toHaveBeenCalledTimes(1)
    expect(mockSelectionHaptic).not.toHaveBeenCalled()
  })

  it('REMOVE path (initially favourited) press fires haptics.selection() exactly once', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={true} testID="heart" />,
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1)
    expect(mockLightHaptic).not.toHaveBeenCalled()
  })

  it('disabled press does NOT fire any haptic', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} disabled testID="heart" />,
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockLightHaptic).not.toHaveBeenCalled()
    expect(mockSelectionHaptic).not.toHaveBeenCalled()
  })

  it('reduce-motion press still fires the per-direction haptic but skips withSequence', () => {
    mockReduceMotionValue = true
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />,
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockLightHaptic).toHaveBeenCalledTimes(1)
    expect(mockWithSequenceCalls).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest src/features/favourites/__tests__/FavouriteHeart.test.tsx --forceExit
```

Expected: 6 new failures (hitSlop number-vs-object, no haptic imports, no per-direction branching).

- [ ] **Step 3: Update FavouriteHeart implementation**

Open `apps/customer-app/src/features/favourites/components/FavouriteHeart.tsx`.

Add the haptic import at the top alongside the existing imports:

```tsx
import { lightHaptic, haptics } from '@/design-system/haptics'
```

Update the constants block (line 88-89) to express the split timings:

```tsx
// Spec §10.3 — ADD: 1.0 → 1.15 → 1.0 (320ms spring-equivalent split per leg).
// REMOVE: 1.0 → 0.92 → 1.0 (200ms ease-out split per leg). Reduce-motion
// skips both animations but haptics still fire (haptics are a separate
// accessibility channel and not gated by Reduce Motion in this codebase).
const ADD_PEAK         = 1.15
const ADD_HALF_MS      = 160
const REMOVE_TROUGH    = 0.92
const REMOVE_HALF_MS   = 100
```

Replace the existing `handlePress` (lines 115-130) with the split-path version:

```tsx
const handlePress = useCallback(() => {
  if (disabled || isLoading) return
  // Resolve the intent BEFORE toggle() flips local state. isFavourited
  // here is the pre-toggle value (the hook exposes the same value via
  // its initialIsFavourited / mutation-pre-state contract).
  const isAdding = !isFavourited
  if (isAdding) {
    lightHaptic()
  } else {
    void haptics.selection()
  }
  if (!reduceMotion) {
    if (isAdding) {
      scale.value = withSequence(
        withTiming(ADD_PEAK, { duration: ADD_HALF_MS, easing: Easing.out(Easing.cubic) }),
        withTiming(1,        { duration: ADD_HALF_MS, easing: Easing.out(Easing.cubic) }),
      )
    } else {
      scale.value = withSequence(
        withTiming(REMOVE_TROUGH, { duration: REMOVE_HALF_MS, easing: Easing.out(Easing.quad) }),
        withTiming(1,             { duration: REMOVE_HALF_MS, easing: Easing.out(Easing.quad) }),
      )
    }
  }
  void toggle().catch(() => {
    // Optimistic-with-rollback path — see useFavourite docstring.
  })
}, [disabled, isLoading, isFavourited, reduceMotion, scale, toggle])
```

Update the `Pressable` (line 140-149) to change `hitSlop`:

```tsx
<Pressable
  onPress={handlePress}
  disabled={disabled}
  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
  accessibilityRole="button"
  accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
  accessibilityState={{ disabled }}
  testID={testID}
  style={styles.pressable}
>
```

Add `Easing` to the existing reanimated import block (currently line 17-23 — `Easing` is already imported per the existing component, so no edit needed; verify on read).

DO NOT swap the outer `Pressable` for `PressableScale` (would create a competing scale source against the Reanimated animation — owner direction locked in spec §10.3 risk notes).

- [ ] **Step 4: Run test to verify it passes**

Re-run. Expected: `Tests: 23 passed, 23 total` (17 existing + 6 new).

- [ ] **Step 5: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 9: BranchTile pill-row rebuild — drop ProximityBandChip mount + flexWrap + remove card overflow

**Files:**
- Modify: `apps/customer-app/src/features/shared/BranchTile.tsx` (line 195-203 + StyleSheet)
- Modify: `apps/customer-app/src/design-system/components/ProximityBandChip.tsx` (add testID + JSDoc)
- Create: `apps/customer-app/tests/features/shared/BranchTile.pillRow.test.tsx`
- Create: `apps/customer-app/tests/_meta/proximity-chip-no-jsx-consumers.test.ts`

- [ ] **Step 1: Add testID to ProximityBandChip (defends the negative pin)**

Open `apps/customer-app/src/design-system/components/ProximityBandChip.tsx`. Add to the outer `<View>` at line 117-123:

```tsx
<View
  testID="proximity-band-chip"
  accessible
  accessibilityRole="text"
  accessibilityLabel={accessibilityLabel ?? label}
  style={[styles.chip, { backgroundColor: variant.bg }]}
>
```

Also add a top-of-file JSDoc note above the existing `// ─── Plan 4 M3.6 ───` comment block:

```tsx
/**
 * Batch 1B (2026-06-01) status: this component is no longer mounted by
 * <BranchTile>. The same per-band copy and the same semantic colour
 * mapping are now rendered as a nested <Text> child INSIDE the
 * BranchTile info line so the chip surface area shrinks to typography
 * weight. The component file stays exported for any future Discovery
 * surface that wants a standalone chip treatment (Search results,
 * Merchant Profile branches tab, etc.) and its standalone unit tests
 * at tests/design-system/components/ProximityBandChip.test.tsx remain
 * green.
 *
 * Active JSX mounts as of 2026-06-01: zero.
 *
 * A static-source meta-pin at tests/_meta/proximity-chip-no-jsx-
 * consumers.test.ts enforces zero JSX mounts; if a future surface
 * needs the standalone chip, allowlist that file in the meta-pin
 * AND document the surface here.
 */
```

- [ ] **Step 2: Write the failing pill-row test FIRST**

Create `apps/customer-app/tests/features/shared/BranchTile.pillRow.test.tsx`:

```tsx
import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile pill row (Batch 1B)', () => {
  it('renders VoucherCountPill + SavePill when both have content', () => {
    const tile = makeBranchTile({
      proximityBand:  'IN_YOUR_AREA',
      distance:       500,
      merchant: {
        businessName:       'Covelum',
        descriptor:         'Italian Restaurant',
        voucherCount:       3,
        maxEstimatedSaving: 9,
      },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('3 vouchers')).toBeTruthy()
    expect(getByText('Save up to £9')).toBeTruthy()
  })

  it('renders only VoucherCountPill when maxEstimatedSaving is null', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', voucherCount: 3, maxEstimatedSaving: null },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('3 vouchers')).toBeTruthy()
    expect(queryByText(/Save up to/)).toBeNull()
  })

  it('hides VoucherCountPill when count is 0 (null-guard)', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'No Vouchers', voucherCount: 0 } })
    const { queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByText(/voucher/)).toBeNull()
  })

  it('NEVER renders the ProximityBandChip element inside the tile (proximity moved to info line)', () => {
    const tile = makeBranchTile({ proximityBand: 'IN_YOUR_AREA' })
    const { queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByTestId('proximity-band-chip')).toBeNull()
  })

  it('NEVER renders the ProximityBandChip for any band value', () => {
    const bands = ['NEARBY', 'IN_YOUR_AREA', 'A_LITTLE_FURTHER', 'NEAREST_ON_REDEEMO'] as const
    for (const band of bands) {
      const tile = makeBranchTile({ proximityBand: band })
      const { queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
      expect(queryByTestId('proximity-band-chip')).toBeNull()
    }
  })

  it('pill-row style includes flexWrap:"wrap" so Dynamic Type Largest wraps gracefully', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'Covelum', voucherCount: 3, maxEstimatedSaving: 9 } })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // Find the pillRow View by walking up from the VoucherCountPill text node.
    // The text -> Text -> View (pill background) -> View (pillRow).
    const pillText = getByText('3 vouchers')
    const pillView = pillText.parent
    const pillRow  = pillView?.parent
    const flat = StyleSheet.flatten(pillRow?.props.style)
    expect(flat.flexWrap).toBe('wrap')
  })

  it('card style does NOT include overflow:"hidden" so a wrapped pill row second-row is not clipped', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'Covelum', voucherCount: 3 } })
    const { getByLabelText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const card = getByLabelText(/^Covelum/)
    const flat = StyleSheet.flatten(card.props.style)
    expect(flat.overflow).not.toBe('hidden')
  })

  it('VoucherCountPill text uses 11pt Lato-SemiBold (locked §9.7)', () => {
    const tile = makeBranchTile({ merchant: { voucherCount: 3 } })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const flat = StyleSheet.flatten(getByText('3 vouchers').props.style)
    expect(flat.fontSize).toBe(11)
    expect(flat.fontFamily).toBe('Lato-SemiBold')
  })

  it('SavePill text uses 11pt Lato-SemiBold (locked §9.7)', () => {
    const tile = makeBranchTile({ merchant: { voucherCount: 3, maxEstimatedSaving: 9 } })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const flat = StyleSheet.flatten(getByText('Save up to £9').props.style)
    expect(flat.fontSize).toBe(11)
    expect(flat.fontFamily).toBe('Lato-SemiBold')
  })

  it('StarRating renders rating at 13pt + count at 11pt (Star size=14 pinned in standalone StarRating.test.tsx)', () => {
    const tile = makeBranchTile({
      avgRating:   4.5,
      reviewCount: 12,
      merchant:    { businessName: 'Covelum' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const ratingFlat = StyleSheet.flatten(getByText('4.5').props.style)
    expect(ratingFlat.fontSize).toBe(13)
    const countFlat  = StyleSheet.flatten(getByText('(12)').props.style)
    expect(countFlat.fontSize).toBe(11)
    // Star icon size=14 assertion lives in tests/features/shared/StarRating.test.tsx
    // — uses testID='star-rating-icon' on the Star JSX element. Keeping the
    // size pin in the standalone suite avoids coupling BranchTile's composition
    // tests to lucide-react-native's forwardRef internals.
  })
})
```

Note on reviewer #1 important regarding flexWrap-vs-overflow: this test pin (g) directly asserts `overflow !== 'hidden'` on the card style. Closes the critical gap.

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest tests/features/shared/BranchTile.pillRow.test.tsx --forceExit
```

Expected: 10 failures (chip still mounted, no flexWrap, overflow:hidden still set, pill sizes still 10pt).

- [ ] **Step 4: Update BranchTile pill row + card style**

Open `apps/customer-app/src/features/shared/BranchTile.tsx`.

Remove the `ProximityBandChip` import at line 8:

```tsx
// import { ProximityBandChip } from '@/design-system/components/ProximityBandChip'   // RETIRED Batch 1B
```

Delete the `<ProximityBandChip>` mount inside `pillRow` (lines 198-200):

```tsx
<View style={styles.pillRow}>
  <VoucherCountPill count={branch.merchant.voucherCount} />
  <SavePill amount={branch.merchant.maxEstimatedSaving} />
  {/* ProximityBandChip retired Batch 1B 2026-06-01 — proximity now renders
      as an inline coloured clause inside the info line above; see
      composeInfoLine() helper. */}
</View>
```

Update `styles.card` (line 210-215) to remove `overflow: 'hidden'`:

```tsx
card: {
  backgroundColor: '#FFFFFF',
  borderRadius: radius.lg,
  // overflow: 'hidden' REMOVED Batch 1B — the pill row may wrap to a
  // second row at Dynamic Type Largest; clipping that wrap with overflow
  // would silently hide pills. Banner image is bounded by its own
  // container (styles.banner) so the rounded corners stay clean
  // without card-level clipping.
  ...elevation.sm,
},
```

Update `styles.banner` (line 216) to add its own `overflow: 'hidden'` to preserve banner rounded-corner mask (the banner is at top of the card and needs its own mask now that the card no longer provides one):

```tsx
banner: { height: 80, position: 'relative', overflow: 'hidden', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
```

Update `styles.pillRow` (line 292-297) to add `flexWrap`:

```tsx
pillRow: {
  flexDirection: 'row',
  alignItems:    'center',
  gap:           6,        // No spacing token = 6 (closest are spacing[1]=4 + spacing[2]=8).
  marginTop:     4,
  flexWrap:      'wrap',   // Batch 1B — Dynamic Type Largest wraps to second row instead of clipping.
},
```

- [ ] **Step 5: Run test to verify it passes**

Re-run. Expected: `Tests: 10 passed, 10 total`.

- [ ] **Step 6: Create the meta-pin guarding against future ProximityBandChip remounts**

Create `apps/customer-app/tests/_meta/proximity-chip-no-jsx-consumers.test.ts`:

```ts
/**
 * Batch 1B (2026-06-01) static-source meta-pin (mirrors the
 * useFavourite allowlist pattern at src/features/favourites/__tests__/
 * FavouriteHeart.test.tsx).
 *
 * Locked invariant: <ProximityBandChip> has ZERO JSX mounts across
 * apps/customer-app/src as of Batch 1B. The component file is allowlisted
 * (it imports itself and references itself in its docstring). If a future
 * surface mounts the standalone chip, add that file to ALLOWLIST AND
 * document the surface in ProximityBandChip.tsx's top-of-file JSDoc.
 */

import * as fs from 'fs'
import * as path from 'path'

describe('ProximityBandChip — zero JSX consumers (Batch 1B)', () => {
  it('no <ProximityBandChip element is mounted anywhere in apps/customer-app/src', () => {
    const srcDir = path.resolve(__dirname, '../../src')
    const ALLOWLIST = new Set([
      // The component's own file (self-reference in JSDoc only, not a JSX mount).
      'design-system/components/ProximityBandChip.tsx',
    ])

    function walk(dir: string, acc: string[]): string[] {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name)
        if (ent.isDirectory()) {
          if (ent.name === '__tests__') continue
          walk(full, acc)
        } else if (/\.(ts|tsx)$/.test(ent.name)) {
          acc.push(full)
        }
      }
      return acc
    }

    const violations: string[] = []
    for (const file of walk(srcDir, [])) {
      const rel = path.relative(srcDir, file)
      if (ALLOWLIST.has(rel)) continue
      const content = fs.readFileSync(file, 'utf-8')
      if (/<ProximityBandChip[\s/>]/.test(content)) {
        violations.push(rel)
      }
    }
    expect(violations).toEqual([])
  })
})
```

- [ ] **Step 7: Run the meta-pin**

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest tests/_meta/proximity-chip-no-jsx-consumers.test.ts --forceExit
```

Expected: PASS.

- [ ] **Step 8: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 10: BranchTile info-line rebuild with nested semantic-coloured proximity Text

**Files:**
- Modify: `apps/customer-app/src/features/shared/BranchTile.tsx` (lines 89-94 + info JSX at 192-194)
- Create: `apps/customer-app/tests/features/shared/BranchTile.infoLine.test.tsx`

This task closes reviewer #1 critical on semantic colour AND reviewer #3 critical on §9.7 compliance: the proximity clause renders as a nested `<Text>` child carrying the per-band colour from a `BAND_COLOUR` map (sage / amber / brand-rose per PR #126 v1.8 lock).

- [ ] **Step 1: Write the failing test FIRST**

Create `apps/customer-app/tests/features/shared/BranchTile.infoLine.test.tsx`:

```tsx
import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { color } from '@/design-system'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile info line — Batch 1B 4-segment compose + semantic-coloured proximity', () => {
  it('IN_YOUR_AREA renders all 4 segments with "In your area" as a separate Text node', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // Leading is rendered in the parent Text:
    expect(getByText(/Italian Restaurant · Brightlingsea · 1\.0 miles away/)).toBeTruthy()
    // Proximity clause is rendered as a nested <Text> with semantic colour:
    const proximityNode = getByText('In your area')
    const flat = StyleSheet.flatten(proximityNode.props.style)
    expect(flat.color).toBe(color.success)
  })

  it('A_LITTLE_FURTHER renders "A short trip away" with warning (amber) colour', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Colchester',
      distance:           8045,
      proximityBand:      'A_LITTLE_FURTHER',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const proximityNode = getByText('A short trip away')
    const flat = StyleSheet.flatten(proximityNode.props.style)
    expect(flat.color).toBe(color.warning)
  })

  it('NEAREST_ON_REDEEMO renders "Nearest match on Redeemo" with brandRose colour', () => {
    const tile = makeBranchTile({
      distance:      45000,
      proximityBand: 'NEAREST_ON_REDEEMO',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const proximityNode = getByText('Nearest match on Redeemo')
    const flat = StyleSheet.flatten(proximityNode.props.style)
    expect(flat.color).toBe(color.brandRose)
  })

  it('NEARBY band suppresses the proximity Text node entirely', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           500,
      proximityBand:      'NEARBY',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText(/Italian Restaurant · Brightlingsea · 0\.3 miles away/)).toBeTruthy()
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Nearest match on Redeemo')).toBeNull()
  })

  it('null band suppresses the proximity Text node', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           500,
      proximityBand:      null,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByText(/In your area|short trip|Nearest match/)).toBeNull()
  })

  it('null distance + non-null band: descriptor + locality + proximity, no orphan separator', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           null,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText(/^Italian Restaurant · Brightlingsea/)).toBeTruthy()
    expect(getByText('In your area')).toBeTruthy()
    expect(queryByText(/· ·/)).toBeNull()
  })

  it('all locality fields null + non-null distance + non-null band: descriptor + distance + proximity', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         null,
      distance:           500,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText(/^Italian Restaurant · 0\.3 miles away/)).toBeTruthy()
    expect(getByText('In your area')).toBeTruthy()
    expect(queryByText(/· ·/)).toBeNull()
  })

  it('all null: descriptor-only leading, no proximity clause', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         null,
      distance:           null,
      proximityBand:      null,
      merchant:           { businessName: 'Covelum', descriptor: 'Café' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Café')).toBeTruthy()
    expect(queryByText(/In your area|short trip|Nearest match/)).toBeNull()
  })

  it('accessibility label EXCLUDES distance + proximity (intentional cascade asymmetry, spec §11.3)', () => {
    // Reviewer #1 important: lock the spec-compliant cascade asymmetry
    // against silent regression. Spoken label stays:
    //   "businessName, descriptor, locality"
    // Distance + proximity are visible-only because they would add
    // noise to VoiceOver navigation without changing the user's
    // decision to tap. Owner-confirmed asymmetry — re-evaluate when
    // VoiceOver QA surfaces a clear gap.
    const tile = makeBranchTile({
      id:                 'brn-a11y',
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByLabelText, queryByLabelText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByLabelText('Covelum, Italian Restaurant, Brightlingsea')).toBeTruthy()
    expect(queryByLabelText(/miles away/)).toBeNull()
    expect(queryByLabelText(/In your area/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest tests/features/shared/BranchTile.infoLine.test.tsx --forceExit
```

Expected: 9 failures (current info line is plain 3-segment text, no nested coloured Text).

- [ ] **Step 3: Update BranchTile.tsx info-line composition**

Open `apps/customer-app/src/features/shared/BranchTile.tsx`.

Add the import for `composeInfoLine` near the existing imports:

```tsx
import { composeInfoLine } from './infoLine'
```

Add a `BAND_COLOUR` map near the top of the file (above `formatDistance`):

```tsx
import type { ProximityBand } from '@/lib/api/discovery'

// Batch 1B (2026-06-01) — semantic-coloured proximity clause inside the
// info line. Mapping mirrors the retired ProximityBandChip's BAND_STYLE
// (PR #126 v1.8 owner-locked direction) so the visual signal carries
// across the chip-to-inline-clause flip:
//
//   IN_YOUR_AREA       → reassuring sage / success-green tone
//   A_LITTLE_FURTHER   → warm amber / warning tone
//   NEAREST_ON_REDEEMO → brand-rose tone (existing baseline)
//   NEARBY / null      → not rendered
//
// NOTE — NEAREST_ON_REDEEMO band colour:
// The brand-rose tone on NEAREST_ON_REDEEMO is a preservation of the
// existing PR #126 v1.8 semantic-colour baseline, NOT a fresh Batch 1B
// design decision. Batch 1B intentionally does NOT change band-colour
// semantics — it only flips the carrier from a standalone chip to a
// nested <Text> child. If owner wants lower brand-rose density at the
// "Nearest match on Redeemo" tier in future, the band can be moved to
// color.text.secondary in a separate, explicit design decision; that
// change is out of scope here.
const BAND_COLOUR: Record<ProximityBand, string | null> = {
  NEARBY:             null,
  IN_YOUR_AREA:       color.success,
  A_LITTLE_FURTHER:   color.warning,
  NEAREST_ON_REDEEMO: color.brandRose,
}
```

Replace the existing `infoText` composition (lines 89-90) with a call to the helper:

```tsx
const localityStr = branch.branchLocalityName ?? branch.branchPostTown ?? branch.branchCity ?? ''
const { leading: infoLeading, proximity: proximityClause } = composeInfoLine({
  descriptor: labelText,
  locality:   localityStr,
  distance:   distanceStr,
  band:       branch.proximityBand,
})
const proximityColour = branch.proximityBand ? BAND_COLOUR[branch.proximityBand] : null
```

Update the info-line JSX (around lines 192-194). Replace:

```tsx
<Text variant="label.md" style={styles.info} numberOfLines={1}>
  {infoText}
</Text>
```

with:

```tsx
<Text variant="label.md" style={styles.info} numberOfLines={1}>
  {infoLeading}
  {proximityClause && proximityColour && (
    <Text style={{ color: proximityColour, fontFamily: 'Lato-SemiBold' }}>
      {infoLeading ? ' · ' : ''}{proximityClause}
    </Text>
  )}
</Text>
```

The nested `<Text>` inherits the parent's `fontSize` (13pt) and overrides only `color` + `fontFamily` (SemiBold gives the clause subtle weight against the regular leading without changing size — keeps WCAG contrast intact). The conditional `{infoLeading ? ' · ' : ''}` covers the edge case where descriptor / locality / distance are all empty and proximity alone needs to render without a leading separator.

The accessibility label cascade at line 92-94 stays unchanged (intentional spec §11.3 asymmetry — pinned by the new test).

- [ ] **Step 4: Run test to verify it passes**

Re-run. Expected: `Tests: 9 passed, 9 total`.

- [ ] **Step 5: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 11: BranchTile tap-propagation contract pin

**Files:**
- Create: `apps/customer-app/tests/features/shared/BranchTile.tapPropagation.test.tsx`

Reviewer #4 minor: with the larger 12pt heart hitSlop landing in Task 8, defend the layered-tap contract explicitly so that heart presses do NOT also fire `onPress` on the card wrapper.

- [ ] **Step 1: Write the pin**

Create `apps/customer-app/tests/features/shared/BranchTile.tapPropagation.test.tsx`:

```tsx
import React from 'react'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

const mockLightHaptic     = jest.fn()
const mockSelectionHaptic = jest.fn()
jest.mock('@/design-system/haptics', () => ({
  __esModule: true,
  lightHaptic: () => mockLightHaptic(),
  haptics: { selection: () => mockSelectionHaptic() },
}))

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  mockLightHaptic.mockReset()
  mockSelectionHaptic.mockReset()
})

describe('BranchTile — tap propagation contract (Batch 1B layered-tap defence)', () => {
  it('heart press fires haptic but does NOT call card onPress', () => {
    const onPress = jest.fn()
    const tile = makeBranchTile({
      id:       'brn-tap',
      merchant: { businessName: 'Covelum' },
      isFavourited: false,
    })
    const { getByTestId } = render(<BranchTile branch={tile} onPress={onPress} />)
    fireEvent.press(getByTestId('branch-tile-brn-tap-heart'))
    expect(mockLightHaptic).toHaveBeenCalledTimes(1)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('card press calls onPress and does NOT fire heart haptic', () => {
    const onPress = jest.fn()
    const tile = makeBranchTile({
      id:       'brn-card',
      merchant: { businessName: 'Covelum' },
    })
    const { getByLabelText } = render(<BranchTile branch={tile} onPress={onPress} />)
    fireEvent.press(getByLabelText(/^Covelum/))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(mockLightHaptic).not.toHaveBeenCalled()
    expect(mockSelectionHaptic).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the pin**

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest tests/features/shared/BranchTile.tapPropagation.test.tsx --forceExit
```

Expected test result: `Tests: 2 passed, 2 total`.

- [ ] **Step 3: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 12: Refactor BranchTile.proximity-chip + .distance-format + .locality tests for the new composition

**Files:**
- Modify: `apps/customer-app/tests/features/shared/BranchTile.proximity-chip.test.tsx`
- Modify: `apps/customer-app/tests/features/shared/BranchTile.distance-format.test.tsx`
- Modify: `apps/customer-app/tests/features/shared/BranchTile.locality.test.tsx`

- [ ] **Step 1: Run baseline to see current failures**

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest tests/features/shared/BranchTile.proximity-chip.test.tsx tests/features/shared/BranchTile.distance-format.test.tsx tests/features/shared/BranchTile.locality.test.tsx --forceExit
```

Expected: proximity-chip tests + several locality realistic-payload tests fail because the chip is gone and the info line now has 4 segments.

- [ ] **Step 2: Refactor BranchTile.proximity-chip.test.tsx**

Replace the file with:

```tsx
// Batch 1B refactor (2026-06-01) — the standalone <ProximityBandChip> mount
// in <BranchTile> was retired in favour of an inline semantic-coloured
// proximity clause inside the info line. The three band copy strings
// + the three null/NEARBY/undefined defensive pins survive — they now
// assert against the inline clause instead of a chip element.
//
// (Filename retained to avoid CI grep churn. Rename to
// `BranchTile.proximity-clause.test.tsx` deferred to a Tier 0 hygiene PR.)

import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile — proximity clause wiring (Batch 1B inline-clause replacement)', () => {
  it('renders "In your area" inline when proximityBand is IN_YOUR_AREA', () => {
    const tile = makeBranchTile({
      proximityBand: 'IN_YOUR_AREA',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByTestId } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(getByText('In your area')).toBeTruthy()
    // Defensive: chip element must NOT also render alongside the inline clause.
    expect(queryByTestId('proximity-band-chip')).toBeNull()
  })

  it('renders "A short trip away" inline when proximityBand is A_LITTLE_FURTHER', () => {
    const tile = makeBranchTile({
      proximityBand: 'A_LITTLE_FURTHER',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText, queryByTestId } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(getByText('A short trip away')).toBeTruthy()
    expect(queryByText('A little further')).toBeNull()  // pre-fixup-3 wording
    expect(queryByTestId('proximity-band-chip')).toBeNull()
  })

  it('renders "Nearest match on Redeemo" inline when proximityBand is NEAREST_ON_REDEEMO', () => {
    const tile = makeBranchTile({
      proximityBand: 'NEAREST_ON_REDEEMO',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText, queryByTestId } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(getByText('Nearest match on Redeemo')).toBeTruthy()
    expect(queryByText('Nearest on Redeemo')).toBeNull()        // pre-fixup-2 wording
    expect(queryByText('Closest match on Redeemo')).toBeNull()  // v1.7/v1.8 transitional copy
    expect(queryByTestId('proximity-band-chip')).toBeNull()
  })

  it('renders no proximity copy when proximityBand is NEARBY', () => {
    const tile = makeBranchTile({
      proximityBand: 'NEARBY',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { queryByText, queryByTestId } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Nearest match on Redeemo')).toBeNull()
    expect(queryByTestId('proximity-band-chip')).toBeNull()
  })

  it('renders no proximity copy when proximityBand is null', () => {
    const tile = makeBranchTile({
      proximityBand: null,
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { queryByText } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Nearest match on Redeemo')).toBeNull()
  })

  it('renders no proximity copy when proximityBand is absent (pre-M3 response)', () => {
    const tile = makeBranchTile()  // fixture default has proximityBand:null
    const { queryByText } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Nearest match on Redeemo')).toBeNull()
  })
})
```

- [ ] **Step 3: Extend BranchTile.distance-format.test.tsx**

Add one new pin at the end of the existing `describe` block (the 3 existing pins survive because they have `proximityBand: null` by default — no inline clause renders so the regex matchers still hit `/miles away/` cleanly):

```tsx
it('null distance + non-null proximityBand renders descriptor + proximity without orphan separator', () => {
  const tile = makeBranchTile({
    id:            'brn-no-dist-with-band',
    distance:      null,
    proximityBand: 'IN_YOUR_AREA',
    merchant:      { businessName: 'Just Round The Corner', descriptor: 'Café' },
  })
  const { getByText, queryByText } = render(
    <BranchTile branch={tile} onPress={() => {}} />,
  )
  // Descriptor leading + proximity clause render; no orphan separator.
  expect(getByText(/^Café/)).toBeTruthy()
  expect(getByText('In your area')).toBeTruthy()
  expect(queryByText(/· ·/)).toBeNull()
})
```

- [ ] **Step 4: Update BranchTile.locality.test.tsx**

The existing 7-pin matrix + 2 realistic-payload pins all use `proximityBand: null` (default in `makeBranchTile`) OR don't override it. Inspect each pin:

- Pins 1-7 (lines 39-141): use `makeBranchTile` defaults, which has `proximityBand: null`. The info line stays 3-segment (descriptor + locality + distance). The full-string regex matchers (`/Italian Restaurant · Brightlingsea · 1\.2 miles away/`) survive unchanged.
- Pin 8 §DH-realistic Featured (line 160-227): sets `proximityBand: 'IN_YOUR_AREA'` on the wire payload. The current assertion `expect(getByText(/^Indian Restaurant · Brightlingsea/)).toBeTruthy()` uses a prefix regex, so it survives because the new info line is `"Indian Restaurant · Brightlingsea · 0.0 miles away"` (still prefix-matches `/^Indian Restaurant · Brightlingsea/`).
- Pin 9 §DH-realistic Colchester (line 231-285): same — prefix regex `/^Indian Restaurant · Colchester/` survives.

But add ONE new assertion to each of pins 8 + 9 to lock the inline proximity clause behaviour end-to-end through the parse pipeline (closes the §DH-realistic gap so a future schema change can't silently lose proximity rendering):

After line 226 in pin 8, add:

```tsx
// Batch 1B: proximity clause renders as a separate Text node with
// semantic colour. Pin both the existence and the band-correct copy.
expect(getByText('In your area')).toBeTruthy()
```

After line 284 in pin 9, add:

```tsx
expect(getByText('In your area')).toBeTruthy()
```

Also add ONE new pin near the end of the suite to lock the intentional a11y cascade asymmetry against silent regression (reviewer #1 important):

```tsx
it('Batch 1B: a11y label intentionally OMITS distance + proximity (spec §11.3 cascade asymmetry)', () => {
  const tile = makeBranchTile({
    id:                 'brn-a11y-asymmetry',
    branchLocalityName: 'Brightlingsea',
    distance:           1609,
    proximityBand:      'IN_YOUR_AREA',
    merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
  })
  const { getByLabelText, queryByLabelText } = render(<BranchTile branch={tile} onPress={() => {}} />)
  expect(getByLabelText('Covelum, Italian Restaurant, Brightlingsea')).toBeTruthy()
  // Distance and proximity are visible-only; the spoken label stays minimal.
  expect(queryByLabelText(/miles away/)).toBeNull()
  expect(queryByLabelText(/In your area/)).toBeNull()
})
```

- [ ] **Step 5: Run all three suites**

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest tests/features/shared/BranchTile.proximity-chip.test.tsx tests/features/shared/BranchTile.distance-format.test.tsx tests/features/shared/BranchTile.locality.test.tsx --forceExit
```

Expected: all green. Approximate counts: proximity-chip 6/6, distance-format 4/4, locality 12/12.

- [ ] **Step 6: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 13: Cross-surface render pins — PopularSection + MapBranchTile

**Files:**
- Modify: `apps/customer-app/tests/features/home/components/PopularSection.test.tsx`
- Modify: `apps/customer-app/tests/features/map/MapBranchTile.test.tsx`

- [ ] **Step 1: Update PopularSection.test.tsx**

The existing pin at line 127 (`expect(getByText('In your area')).toBeTruthy()`) currently passes by hitting the chip Text node. With the chip retired, the same string still renders inside the info-line nested `<Text>`. Using `getByText('In your area')` would still pass — BUT reviewer #1 important on substring-matcher fragility warns this allows a future double-render regression.

Stricter assertion: use `getAllByText(/^In your area$/).length === 1` to lock single-render. Replace line 127:

```tsx
// Batch 1B: 'In your area' now renders as the inline proximity clause
// inside the BranchTile info line. The standalone ProximityBandChip is
// retired. Pin assertion: exactly ONE Text node contains the string.
expect(getAllByText('In your area')).toHaveLength(1)
```

Update the destructure on the matching `render(...)` call to include `getAllByText`.

Preserve the null-band negative pin (queryByText('In your area') === null) — that one still works as-is.

- [ ] **Step 2: Update MapBranchTile.test.tsx**

The existing pin at line 225 has a collision risk: the fixture `businessName: 'In Your Area Cafe'` contains the substring "In your area" (case-different though — `'In Your Area'` vs `'In your area'`). Verified at lines 211-224: the test asserts both `getByText('In Your Area Cafe')` AND `getByText('In your area')` separately. `getByText` is case-sensitive AND requires exact match by default, so both currently work.

Post-Batch-1B, the proximity clause renders inline. Replace line 225:

```tsx
// Batch 1B: 'In your area' inline clause inside info-line Text node.
// Case-sensitive exact match still distinguishes from 'In Your Area Cafe'
// (merchant name). Defence-in-depth: assert single render so a future
// regression that double-renders both chip + inline would fail loudly.
expect(getAllByText('In your area')).toHaveLength(1)
```

Update the destructure on the matching `render(...)` call.

- [ ] **Step 3: Run both suites**

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest tests/features/home/components/PopularSection.test.tsx tests/features/map/MapBranchTile.test.tsx --forceExit
```

Expected: all green.

- [ ] **Step 4: (owner-approved commit checkpoint — see Optional commit checkpoints section below)**

---

## Task 14: FavouriteHeart cross-surface cascade audit + regression sweep

**Files:**
- No source edits.
- Verify against grep + run full regression sweep.

The FavouriteHeart change (split haptic / animation + 12pt hitSlop) cascades to every JSX consumer. Grep confirmed in pre-plan audit:

1. `apps/customer-app/src/features/shared/BranchTile.tsx` (Home rails + Map carousel + Category results — Batch 1B primary)
2. `apps/customer-app/src/features/favourites/components/BranchFavCard.tsx` (Favourites Branches tab)
3. `apps/customer-app/src/features/search/components/SearchResultItem.tsx` (Search results)
4. `apps/customer-app/src/features/map/components/MapBranchTile.tsx` (Map carousel — already routed via BranchTile, but the file imports `<FavouriteHeart>` directly? Verified: the import is unused after Phase 3C.1g M2.8 cleanup; the heart only renders inside `<BranchTile>`. No JSX mount in MapBranchTile.tsx itself.)
5. `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` (Voucher Detail — no direct `<FavouriteHeart>` mount; the only voucher-detail heart is owned by `<CouponHeader>` already listed as entry #6. Comment at line 1056 of this file documents the indirection. Listed here so a future grep against this screen file returns a recorded result rather than a silent miss.)
6. `apps/customer-app/src/features/voucher/components/CouponHeader.tsx` (Voucher Detail hero heart, line 253)
7. `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` (Merchant Profile — no direct `<FavouriteHeart>` mount; the hero heart is owned by `<HeroSection>` (entry #10, line 226) and the vouchers-tab hearts are owned by `<VoucherCard>` (entry #8, lines 454 + 466). Comment at line 221 of this file documents the indirection. Listed here so a future grep against this screen file returns a recorded result rather than a silent miss.)
8. `apps/customer-app/src/features/merchant/components/VoucherCard.tsx` (Merchant Profile vouchers tab x2 mounts, lines 454 + 466)
9. `apps/customer-app/src/features/merchant/components/VouchersTab.tsx`
10. `apps/customer-app/src/features/merchant/components/HeroSection.tsx` (Merchant Profile hero, line 226)

- [ ] **Step 1: Run cross-surface regression sweep**

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx jest \
  tests/features/shared/BranchTile.image.test.tsx \
  tests/features/shared/BranchTile.locality.test.tsx \
  tests/features/shared/BranchTile.distance-format.test.tsx \
  tests/features/shared/BranchTile.proximity-chip.test.tsx \
  tests/features/shared/BranchTile.infoLine.test.tsx \
  tests/features/shared/BranchTile.pillRow.test.tsx \
  tests/features/shared/BranchTile.typography.test.tsx \
  tests/features/shared/BranchTile.tapPropagation.test.tsx \
  tests/features/shared/StarRating.test.tsx \
  tests/features/shared/infoLine.test.ts \
  src/features/favourites/__tests__/FavouriteHeart.test.tsx \
  tests/features/home/components/FeaturedCarousel.test.tsx \
  tests/features/home/components/TrendingSection.test.tsx \
  tests/features/home/components/PopularSection.test.tsx \
  tests/features/home/components/NearbyByCategory.test.tsx \
  tests/features/home/home-rail-favourite-invalidation.test.tsx \
  tests/features/map/MapBranchTile.test.tsx \
  tests/features/map/MapListView.test.tsx \
  tests/features/search/CategoryResultsScreen.test.tsx \
  tests/features/search/CategoryResultsScreen.locality.test.tsx \
  tests/features/search/CategoryResultsScreen.loading.test.tsx \
  tests/features/search/SearchResultItem.proximity-chip.test.tsx \
  tests/features/home/HomeScreen.renderOrder.test.tsx \
  tests/features/home/HomeScreen.dedupRules.test.tsx \
  tests/features/home/screens/HomeScreen.test.tsx \
  tests/_meta/phase-2-5-adapter-removed.test.ts \
  tests/_meta/proximity-chip-no-jsx-consumers.test.ts \
  tests/design-system/components/ProximityBandChip.test.tsx \
  tests/hooks/useFavourite.test.tsx \
  --forceExit
```

Expected: zero failures. Note: `tests/lib/api/profile.test.ts` has 1 pre-existing baseline failure documented in CLAUDE.md; it is NOT in this sweep list (out of scope, not introduced by Batch 1B).

If any pin fails, classify:
- (a) intended behavioural change → update assertion in this task with a new commit;
- (b) regression → fix the source file before continuing.

No snapshot updates required (project has zero jest snapshots; verified by grep).

- [ ] **Step 2: Run customer-app TypeScript gate**

```bash
cd <REDEEMO_ROOT>/apps/customer-app && npx tsc --noEmit
```

Expected: zero new errors.

- [ ] **Step 3: Document audit findings + (owner-approved commit checkpoint, only if needed)**

If Step 1 surfaced any failing pins that needed targeted fixup commits, those land here as an owner-approved checkpoint (see § Optional commit checkpoints below). If everything was green first-run, no commit for Task 14.

---

## Task 15: Open PR + scope verification + device QA matrix execution

**Files:**
- No source edits.

Per CLAUDE.md "Creating pull requests" + "PR scope verification rule":

- [ ] **Step 1: Verify commit list matches the plan**

```bash
git log --oneline origin/main..HEAD
```

Expected: a clean stack of commits from Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 (Task 2 is verification-only with no commit, Task 14 may add a fixup commit). Approximately 12 to 13 commits.

- [ ] **Step 2: Check live GitHub compare endpoint**

Per CLAUDE.md "Workflow Hooks v1" `gh pr merge` SHA-binding + the standing pre-merge rule:

```bash
gh api repos/MSC23-bot/Redeemo/compare/main...<feature-branch-name> --jq '.commits | length'
```

Expected: matches commit count from Step 1. If GitHub shows additional commits (e.g. local main is ahead of origin), STOP and resolve before opening the PR.

- [ ] **Step 3: Open the PR (owner-gated — only run when owner explicitly approves)**

This is the final owner-gated checkpoint for the batch. Do NOT run `gh pr create` until the owner has reviewed all approved commit checkpoints and explicitly approved opening the PR.

```bash
gh pr create --title "feat(home): Batch 1B BranchTile card/chip hierarchy + heart polish (§9.7 + §10.3 + §11.1)" --body "$(cat <<'EOF'
## Summary

Batch 1B of the Home visual-system programme (spec §9.7 + §10.3 + §11.1 + §11.3 + §11.5 + §12). Pure-presentation rebuild of the shared `<BranchTile>` + four pill primitives + `<FavouriteHeart>`. Backend wire shape untouched.

### What lands
- **BranchTile typography**: name 16pt Lato-SemiBold, info line 13pt Lato-Regular (per §9.7).
- **Info line composition** (`composeInfoLine` pure helper): descriptor / locality / distance leading + nested `<Text>` proximity clause carrying the per-band semantic colour (sage / amber / brand-rose per PR #126 v1.8).
- **Pill row**: VoucherCountPill neutralised to flat grey + 11pt Lato-SemiBold + null-guard; SavePill bumped to 11pt; StarRating promoted (rating 13pt, count 11pt, star 14pt — star size pinned by new standalone `StarRating.test.tsx` via `testID='star-rating-icon'`; rating + count fontSize pinned by both the standalone suite AND `BranchTile.pillRow.test.tsx` pins (i)+(j)). `flexWrap: 'wrap'` added so Dynamic Type Largest wraps gracefully; card-level `overflow: 'hidden'` removed so the wrapped row is not clipped (banner gets its own corner mask).
- **ProximityBandChip retired from BranchTile mount**: component file stays exported for future surfaces. New meta-pin at `tests/_meta/proximity-chip-no-jsx-consumers.test.ts` guards against future remounts.
- **FavouriteHeart**: `hitSlop` extended to 12-per-side object form (28pt visual + 12pt slop = 52pt effective on each axis, well above the 44pt minimum per §11.1). Add path fires `lightHaptic()` + 1.0 → 1.15 → 1.0 pop. Remove path fires `haptics.selection()` + 1.0 → 0.92 → 1.0 dip. Reduce-motion path stays haptic-on, animation-off on both directions per §10.3.

### Cross-surface cascade
Every shared-component change cascades atomically. Verified via regression sweep (Task 14): Home Featured / Trending / Popular / NearbyByCategory / Map carousel / Map list view / Category results / Voucher Detail / Merchant Profile / Search / Favourites. No surface-specific variants. SearchResultItem renders its OWN proximity helper, NOT the shared chip — confirmed unaffected.

### Device QA matrix
See the plan doc § "Device QA matrix" for the 15-cell sign-off grid.

## Test plan
- [ ] Customer-app full sweep: `cd apps/customer-app && npx jest --forceExit`
- [ ] Customer-app tsc: `cd apps/customer-app && npx tsc --noEmit` returns zero NEW errors (pre-existing baseline failure on `tests/lib/api/profile.test.ts` documented in CLAUDE.md — NOT introduced by this PR)
- [ ] Device QA matrix executed on iPhone SE / 14 / 14 Pro Max across Home rails, Map carousel, Category results, with normal Dynamic Type + Dynamic Type Largest (capped at 1.4× by the design-system `<Text>`) + Reduce Motion variants

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Execute the device QA matrix**

See § "Device QA matrix" below. Capture screenshots and record results in the PR description as you complete each cell. Failing cells require a fixup commit BEFORE merge — not a deferred follow-up entry.

- [ ] **Step 5: Do NOT request merge until**
- All 15 device QA cells green.
- Codex review (if requested) is resolved.
- Live `gh api compare` SHA matches PR head + `REDEEMO_PR_SCOPE_VERIFIED=<head-sha>` set on the merge command per the standing hook rule.

---

## Cross-surface impact

Every change in this batch cascades atomically to consumer surfaces because the components are shared. Verified against source via grep (`apps/customer-app/src` + `apps/customer-app/tests`).

### BranchTile consumers (six surfaces)

| Surface | File | Impact |
|---|---|---|
| Home Featured | `src/features/home/components/FeaturedCarousel.tsx` (260pt tile) | Name 13→16pt + info 10.5→13pt enlarges tile vertical content block by ~5pt; FEATURED badge top-left unchanged; heart top-right gets the larger hitSlop + split haptic; inline proximity clause replaces standalone chip in pill row. `FeaturedCarousel.test.tsx` only asserts on FEATURED badge + distance substring; both survive unchanged. |
| Home Trending | `src/features/home/components/TrendingSection.tsx` (240pt tile) | Same as Featured minus the FEATURED badge. `TrendingSection.test.tsx` is structural (header copy + null guards); survives unchanged. |
| Home Popular | `src/features/home/components/PopularSection.tsx` (240pt tile) | Same as Trending. `PopularSection.test.tsx` chip-presence pin updated to single-render assertion (Task 13). |
| Home NearbyByCategory | `src/features/home/components/NearbyByCategory.tsx` (240pt tile) | Same as Trending. `NearbyByCategory.test.tsx` is structural-only (header label + see-all chip + onCategoryPress); survives unchanged. One-card rail See-all suppression continues to work. |
| Map bottom carousel | `src/features/map/components/MapBranchTile.tsx` (full-width `SCREEN_WIDTH - spacing[4] * 2` tile) | Same as Trending. `MapBranchTile.test.tsx` proximity pin updated to single-render assertion + the merchant-name vs proximity collision is handled by case-sensitive `getByText('In your area')` (merchant fixture is `'In Your Area Cafe'`, different case). |
| Category results | `src/features/search/screens/CategoryResultsScreen.tsx` (full-width list row via FlatList) | `CategoryResultsScreen.test.tsx` is identity / URL-contract only, zero tile-content assertions; survives unchanged. |

### MapBranchTile carousel close-button vs heart — NOT A CONFLICT (reviewer #2 critical)

Verified via source read of `apps/customer-app/src/features/map/components/MapBranchTile.tsx` (lines 71-104): the X close button at the top-right of the Map carousel container (lines 73-80) lives on the OUTER `MapBranchTile` wrapper, NOT inside the inner `<BranchTile>`. `MapBranchTile` does NOT pass `showClose` or `onClose` to the inner BranchTile — the existing `showClose` / `onClose` props on `BranchTile` itself are UNUSED in production (zero callers verified via grep).

There is no z-order conflict. The Batch 1B hitSlop expansion (12pt per side on the heart) does not introduce a new tap-target conflict with the carousel close button because they live on different View hierarchies separated by the `Animated.View` carousel container.

Recommendation deferred to follow-up (Tier 1): if confirmed permanently unused, remove the `showClose` / `onClose` props from `BranchTile.tsx` to simplify the API surface. Not blocking Batch 1B.

### `<FavouriteHeart>` cascades to 9+ surfaces (reviewer #2 critical)

Grep confirms `<FavouriteHeart>` JSX mounts:
- `BranchTile.tsx` (Home rails + Map carousel + Category results — Batch 1B primary path)
- `BranchFavCard.tsx` (Favourites Branches tab)
- `SearchResultItem.tsx` (Search results)
- `CouponHeader.tsx` line 253 (Voucher Detail hero)
- `VoucherCard.tsx` lines 454 + 466 (Merchant Profile voucher cards x2)
- `VouchersTab.tsx` (Merchant Profile vouchers tab orchestrator)
- `HeroSection.tsx` line 226 (Merchant Profile hero)
- `MerchantProfileScreen.tsx` (Merchant Profile orchestrator)
- `VoucherDetailScreen.tsx` (Voucher Detail orchestrator)

The split-haptic + larger hitSlop changes propagate to every one of these surfaces. The functional contract (add → lightHaptic, remove → selection, disabled → no haptic) is identical and the visual treatment is identical. Risk of regression on Voucher Detail / Merchant Profile is low because the heart there has historically used the same `<FavouriteHeart>` shared component; the change is uniform across surfaces by design.

Task 14 regression sweep includes the relevant cross-surface test files. The device QA matrix (cells 14 + 15) explicitly verifies heart-tap behaviour on Voucher Detail + Merchant Profile + Favourites.

### MapListView consumes `<SavePill>` + `<StarRating>` directly

Verified at `apps/customer-app/src/features/map/components/MapListView.tsx` line 69. The Task 5 + Task 4 type-promotes cascade to MapListView's `BranchRow`. `MapListView.test.tsx` asserts only on merchant name + distance copy + thumbnail colour — none of those change. Test survives unchanged; included in Task 14 regression sweep as defence in depth.

### SearchResultItem is NOT affected

`SearchResultItem` is a different component (`apps/customer-app/src/features/search/components/SearchResultItem.tsx`) with its OWN `proximityRowLabel` helper. The `<ProximityBandChip>` is NOT mounted there; the inline 'In your area' string is composed locally. Confirmed via grep. The standalone unit test at `tests/features/search/SearchResultItem.proximity-chip.test.tsx` is unaffected by Batch 1B and included in the Task 14 regression sweep purely as defence in depth.

---

## Device QA matrix

15 cells. Sign-off rule per reviewer #4 important on `<Text>` `maxFontSizeMultiplier=1.4`: Dynamic Type Largest is capped at 1.4× by the design system. Cells 2 / 5 / 9 / 12 verify behaviour AT the cap, which is the worst-case the platform allows in this codebase. Every cell must pass. Failing cells require a fixup commit BEFORE merge.

| # | Surface | Device | A11y | Pass criteria |
|---|---|---|---|---|
| 1 | Home Featured rail | iPhone SE (375pt) | Base Dynamic Type | Name 16pt + info 13pt legible on the 260pt tile; info-line not truncated mid-word for short business names; FEATURED badge top-left unchanged; pill row contains VoucherCountPill + SavePill only (no chip). |
| 2 | Home Featured rail | iPhone 14 (390pt) | Dynamic Type Largest (1.4× cap) | Name truncates with ellipsis on one line if it overflows; info-line native tail-ellipsis cuts whatever overflows from the right without breaking layout (note: native ellipsis does not respect segment boundaries — mid-segment clipping is acceptable for Batch 1B); pill row wraps to a second row if needed (verify via flexWrap) and the second row is VISIBLE (not clipped — overflow:hidden removed); semantic colour of proximity clause stays legible when it survives the cut. |
| 3 | Home Featured rail | iPhone 14 Pro Max (430pt) | Reduce Motion ON | Heart tap colour flips with no pop / dip animation; haptic STILL fires on both add and remove (per the locked rule that haptics are not gated by Reduce Motion); PressableScale card press feedback continues to work as it is transform-only. |
| 4 | Home Popular rail | iPhone SE | Base | Inline proximity clause renders inline in info line with sage / green semantic colour for IN_YOUR_AREA tiles; no standalone chip mounted; pill row contains VoucherCountPill + SavePill only. |
| 5 | Home Popular rail | iPhone 14 | Dynamic Type Largest | Inline proximity clause wraps or truncates within the info-line Text; 13pt info text stays readable; tap target on heart still effective ≥44pt. |
| 6 | Home Trending rail | iPhone 14 Pro Max | Base | Identical tile rendering to Popular; visible distance reads "X.X miles away" identical to pre-batch copy (formatDistance unchanged). |
| 7 | Home NearbyByCategory rail | iPhone SE | Base | One-card rail still suppresses See-all chevron; single-tile typography matches multi-tile rails. |
| 8 | Map bottom carousel | iPhone SE | Base | Full-width tile shows info-line with enough breathing room for 4 segments; outer carousel close button (top-right, on `MapBranchTile` wrapper) and inner heart (top-right, on inner `BranchTile`) live on DIFFERENT view hierarchies and do not conflict. |
| 9 | Map bottom carousel | iPhone 14 | Dynamic Type Largest | Info-line native tail ellipsis behaves predictably on the full-width tile (mid-segment clipping is acceptable for Batch 1B; width-aware segment drop deferred per DSN.6); pill row wraps if needed and is visible (not clipped). |
| 10 | Map bottom carousel | iPhone 14 Pro Max | Reduce Motion ON | Heart tap haptic fires (split add / remove); carousel snap-scroll animation continues (carousel motion is not gated by Reduce Motion per existing Map M2.7 contract). |
| 11 | Category results list | iPhone SE | Base | Full-width list-row tile shows enlarged name (16pt) + info (13pt) without breaking the FlatList row height heuristic; verify list keeps smooth scroll perf. |
| 12 | Category results list | iPhone 14 | Dynamic Type Largest | Info-line native tail ellipsis behaves identically to Home rails (no per-surface variation; width-aware segment drop deferred per DSN.6); pill row stable. |
| 13 | Category results list | iPhone 14 Pro Max | Reduce Motion ON | Heart tap on list row fires split haptic without scroll-position jump. |
| 14 | Voucher Detail hero + Merchant Profile hero + Merchant Profile voucher card + Favourites Branches tab card + Search results | iPhone 14 | Base | Heart hitSlop expansion + split haptic confirmed on each surface; visual heart treatment unchanged on every surface (brand-rose unified colour from Phase 3C.1g R1 Wave 3 §17 preserved). |
| 15 | Home rails | iPhone 14 | VoiceOver enabled | BranchTile accessibilityLabel cascade reads "businessName, descriptor, locality" (intentionally omits distance + proximity per spec §11.3 cascade asymmetry lock); heart label reads "Add to favourites" or "Remove from favourites" depending on state. |

Capture screenshots per cell and record results in the PR description.

---

## Out of scope

These items are deliberately not addressed in Batch 1B. Each has a documented reason. Some are deferred follow-ups (listed at the foot of this doc); some are explicitly closed elsewhere.

- Backend / Prisma / Zod / `lib/api/*.ts` changes. The BranchTile wire shape is identical pre/post-batch; no new wire fields are added.
- `OpenStatusBadge` integration. `isOpen` is on the BranchTile wire contract today as `isOpenNow` (verified at `discovery.ts:141`) but the existing component-level integration was REMOVED in PR-B M4 audit (hardcoded `isOpen={true}` was misleading). Re-enable is deferred.
- FEATURED badge restyle. Locked Batch 1A direction preserved (`LinearGradient brandRose → brandCoral`, FEATURED uppercase 8pt Lato-Bold).
- Logo overlay -17pt redesign. Kept; cream `#FFF6EE` placeholder kept per §CV Phase A.
- Banner aspect ratio change. Kept at 80pt height.
- Card radius change. Kept at `radius.lg` = 16pt (verified Task 2).
- Card elevation change. Kept at `elevation.sm`.
- Voucher-type chip addition. Spec §9.7 mentions "promoted type" from Batch 1A but the wire contract does not expose voucher type per branch; defer to a future Batch 1C if needed.
- SearchResultItem changes. Search uses its own component, not shared `<BranchTile>`.
- BranchFavCard / VoucherFavCard changes. Favourites uses own components.
- MapListView's `BranchRow` internal component. Own component, not shared `<BranchTile>`.
- Merchant Profile voucher card changes (beyond the heart cascade which is FavouriteHeart-driven, not BranchTile-driven).
- Voucher Detail merchant row changes.
- FavouriteHeart visual restyle (colour / icon stays unified brand-rose per Phase 3C.1g R1 Wave 3 §17). Only hitSlop + split haptic + split animation change in Batch 1B.
- ProximityBandChip component file deletion. Component stays exported for future surfaces; only the BranchTile JSX mount is removed; meta-pin guards against accidental remount.
- `formatDistance` copy change. "X.X miles away" locked per PR #112 fixup-6; any change requires explicit owner direction.
- `formatVoucherCount` vocabulary unification ('voucher' vs 'offer'). Pre-existing inconsistency; deferred to a hygiene PR.
- SavePill copy change from rounded to two-decimal. `Math.round` preserved; full `formatGbp` swap deferred.
- Full hardcoded numeric padding to `spacing[N]` migration in BranchTile.tsx `styles.content`. Pre-existing inconsistency; deferred. Task 7 migrates ONE site (`marginRight: spacing[1]`) where the mapping is exact (4pt). Other sites (18 / 12 / 10 / 6) have no clean mapping.
- Snapshot test introduction. Project uses zero jest snapshots (confirmed via grep); will not introduce here.
- Storybook / visual regression infra. None exists in the project.
- Customer-web parallel changes. Different surface, separate polish workstream.
- Profile / Savings / Favourites visual changes. Each has its own polish workstream per spec §12.
- Distance abbreviation "0.4 mi" (vs "0.4 miles away") — reviewer #4 important: owner-locked "miles away" copy per PR #112 fixup-6 stays. Cross-surface consistency wins over per-surface compactness. If device QA flags as too long, opens a future hygiene decision.

---

## Risk notes

### TypeScript impact
Zero. No type signatures change. All changes are inline styles, copy strings, Text variant choices, a new pure-function helper, and a per-direction split inside `handlePress`. `tsc --noEmit` should report zero new errors. The pre-existing baseline failure in `tests/lib/api/profile.test.ts` (documented in CLAUDE.md) is unrelated and will remain.

### Snapshot churn
Zero. Verified via `grep -r 'toMatchSnapshot\|toMatchInlineSnapshot' apps/customer-app` returning no results. All test churn surfaces as targeted `getByText` / `getByTestId` / `getByLabelText` failures in 5 existing files (locality, proximity-chip, distance-format, image, FavouriteHeart) plus 2 cross-surface integration files (PopularSection, MapBranchTile). Each is rewritten or extended within its respective task in this plan.

### Perf considerations
BranchTile is rendered up to ~20× on Home (4 rails × ~5 tiles each), up to ~10× on Map bottom carousel, and via FlatList on Category results. The info-line rebuild adds ONE nested `<Text>` child only when proximity is non-null (zero overhead on NEARBY / null bands). Removing `<ProximityBandChip>` saves one View + one Text per tile. Net effect: small render-cost reduction. FavouriteHeart Reanimated animation now branches on intent but is structurally the same `withSequence` call. Haptic calls are fire-and-forget. No new useState, no new useEffect, no new query.

### Layout perf
The info-line composition is a pure-string helper + the design-system `<Text>` native `numberOfLines={1}` tail ellipsis. There is no measurement pass, no `onLayout`, no `setState` in render — and consequently no width-aware segment-drop cascade in Batch 1B (deferred to DSN.6). The pill-row overflow fix uses `flexWrap: 'wrap'` + removed card-level `overflow: 'hidden'` + banner-level `overflow: 'hidden'` so a wrapping pill row becomes visible without measurement-driven layout. This is the minimal change.

### Overflow handling honesty (reviewer #4 important)
Batch 1B implements composition order + native tail-ellipsis ONLY. There is no "truncation cascade" in the engineering sense — native RN ellipsis cuts whatever overflows from the right and does not respect segment boundaries. The composition-order pin in `tests/features/shared/infoLine.test.ts` verifies the helper returns `descriptor / locality / distance` joined for the leading and proximity as a separate sibling string. Visual mid-segment ellipsis can and will occur at Dynamic Type Largest under tight widths — cells 2 / 5 / 9 / 12 of device QA verify the visual outcome is acceptable. A real width-aware segment-drop (proximity → distance → locality, descriptor last to survive) would require an `onLayout` measurement pass and is explicitly DEFERRED to DSN.6. Earlier framings of this work as a "locked truncation cascade" overclaimed; the honest framing is "composition order with native tail ellipsis; width-aware segment drop deferred".

### `<Text>` `maxFontSizeMultiplier=1.4` cap (reviewer #4 important)
The design-system `<Text>` sets `allowFontScaling` (default true) + `maxFontSizeMultiplier={1.4}` (verified at `src/design-system/Text.tsx:43-44`). This is the platform-permitted worst-case in this codebase. Cells 2 / 5 / 9 / 12 verify behaviour at the cap. This is the deliberate design ceiling.

### Cross-surface cascade risk
Any visual regression on BranchTile cascades atomically to all six BranchTile consumers; any FavouriteHeart change cascades to 9+ surfaces. Mitigation: device QA matrix (15 cells) covers Home rails / Map carousel / Category results across iPhone SE / 14 / 14 Pro Max with normal Dynamic Type + Largest + Reduce Motion + heart tap on Voucher Detail / Merchant Profile / Favourites / Search.

### Hook discipline risk
FavouriteHeart edits do NOT add new `useFavourite()` callers. The static-source allowlist meta-pin at `src/features/favourites/__tests__/FavouriteHeart.test.tsx:238-296` (verified read 2026-06-01) walks every `.ts` / `.tsx` file under `apps/customer-app/src` and asserts only `FavouriteHeart.tsx` + `useFavourite.ts` import the hook. Adding the `lightHaptic` + `haptics` imports does not trip this pin because the pin matches on `from '@/hooks/useFavourite'`, not on file shape.

### Reanimated animation conflict (locked decision)
FavouriteHeart owns its own Reanimated animation. Per spec §10.3, the add path is a 1.0 → 1.15 → 1.0 pop and the remove path is a 1.0 → 0.92 → 1.0 dip. Swapping the outer `Pressable` for `PressableScale` would create a competing scale source (PressableScale press-in 1.0 → 0.97, then the Reanimated animation on release). Decision locked: DO NOT swap. Add the per-direction split haptic + animation paths instead. The `<BranchTile>` itself is wrapped in `PressableScale` (verified at line 97), so the card-level press feedback remains; the heart sits inside the card and receives its own `Pressable` press event without disturbing the card scale.

### British English + no-em-dash compliance
All new code strings and comments use British spelling (favourite, colour, behaviour, organise). Separators in info-line use ` · ` (Unicode middot, U+00B7). No em dashes anywhere. Hook script at `.claude/hooks/pre-bash/01-git-safety.sh` does not enforce these but a final grep verifies before commit:

```bash
grep -rn '—' apps/customer-app/src/features/shared/ apps/customer-app/src/features/favourites/components/FavouriteHeart.tsx
```

Expected: zero hits.

### Test command stability
Per CLAUDE.md "Running Tests": customer-app jest runs from `<REDEEMO_ROOT>/apps/customer-app/` using `npx jest --forceExit` (forceExit avoids open-handle hang from React Query + fake timers). All Task run commands respect this. `<REDEEMO_ROOT>` is the active checkout of the Redeemo repo on `main`; on this machine it resolves to `/Users/shebinchaliyath/Developer/Redeemo` for the main checkout. The plan deliberately does NOT hard-code the `.worktrees/customer-app/` worktree path because that worktree is currently checked out to `chore/fix-auth-followups` (not main). If you choose to run from a worktree instead, substitute its path — they share the same node_modules + babel cache as of 2026-04-26.

### Locked product rule risk (§DI / PR #126 v1.8) — CLOSED
Reviewer #1 critical: ProximityBandChip is the load-bearing "why is this here" explainer. Retiring its standalone mount drops the chip surface area. CLOSED by Task 10's nested-`<Text>` implementation that preserves the same three label strings AND the same semantic-colour mapping (sage / amber / brand-rose). The signal is downgraded from chip-shape to typography-weight but the information density is identical. Spec §9.7 explicitly calls for "semantic-coloured proximity clause" — this is that exact treatment.

### NEAREST_ON_REDEEMO band colour — preservation, not a new design decision
The `BAND_COLOUR` map in Task 10 maps `NEAREST_ON_REDEEMO → color.brandRose`. This is a deliberate preservation of the PR #126 v1.8 semantic-colour baseline (the retired ProximityBandChip used the same brand-rose tone at this tier), not a fresh Batch 1B design call. Batch 1B does NOT silently re-assert or change band-colour semantics — it only flips the carrier from a standalone chip to a nested `<Text>` child inside the info line. If the owner subsequently wants lower brand-rose density at the "Nearest match on Redeemo" tier, the band can be moved to `color.text.secondary` (or another neutral tone) in a separate, explicit design decision; that change is out of scope for Batch 1B and would land as its own follow-up.

### Distance copy lock — preserved
`formatDistance` is owner-locked at "X.X miles away" per PR #112 fixup-6. This batch does NOT change `formatDistance`; the substring stays identical so distance pins survive unchanged.

### Wire field name (reviewer #2 critical) — pinned by fixture reuse
The component reads `branch.distance` (NOT `branch.distanceMetres`). Schema has both. Every new test in this batch uses `makeBranchTile()` from `tests/fixtures/branchTile.ts` which sets `distance: null` as default and supports `distance: <metres>` overrides. No inline fixtures, no `as any` casts.

---

## Spec-coverage self-review (per superpowers:writing-plans)

| Spec section | Requirement | Where addressed |
|---|---|---|
| §9.7 | White card 16pt radius elevation.sm | Task 2 verifies. |
| §9.7 | Banner 80pt with cream placeholder + logo overlay -17pt | Preserved in BranchTile.tsx. Task 9 banner mask migration noted. |
| §9.7 | Heart 28pt visual, 44pt effective tap via hitSlop | Task 8 (12-per-side object form). Pinned. |
| §9.7 | Name Lato Semibold 16pt | Task 7. Pinned. |
| §9.7 | Info line Lato Regular 13pt tertiary | Task 7. Pinned. |
| §9.7 | Semantic-coloured proximity clause | Task 10 (nested `<Text>` with `color.success` / `color.warning` / `color.brandRose`). Pinned per-band. |
| §9.7 | Pills Lato Semibold 11pt | Tasks 3 + 4. Pinned. |
| §10.2 | PressableScale ~0.97 + selectionAsync on card press | Preserved on BranchTile (line 97 wrapper). Tap-propagation pin (Task 11) guards. |
| §10.3 | Heart add: 1.0 → 1.15 → 1.0 spring-equivalent + lightImpact | Task 8 split path. Pinned. |
| §10.3 | Heart remove: 1.0 → 0.92 → 1.0 ease-out + selectionAsync | Task 8 split path. Pinned. |
| §10.3 | Reduced motion: skip animation, haptic still fires | Task 8 reduce-motion pin. |
| §11.1 | Minimum 44×44pt for interactive elements | Task 8 arithmetic pin (28+12+12=52 ≥ 44). |
| §11.3 | BranchTile accessibility label cascade preserved | Tasks 10 + 12 (asymmetry locked: businessName, descriptor, locality; distance + proximity intentionally omitted). |
| §11.5 | Body / content text minimum 13pt at base | Task 7 (16pt name, 13pt info). |
| §11.5 | Compact labels 11-12pt only when in ≥44pt tap target + WCAG AA | Tasks 3 / 4 / 5 (11pt pills + StarRating count inside the card's ≥44pt tappable surface). |
| §11.5 | Dynamic Type Largest verified | Device QA cells 2 / 5 / 9 / 12 (`<Text>` 1.4× cap noted). |
| §12 | Shared BranchTile cascades to Home / Map / Category | Cross-surface impact table + Task 14 regression sweep. |

### Placeholder scan
No "TBD", no "TODO", no "implement appropriate validation", no "similar to Task N", no `<date>` placeholders. Every code block is executable React Native TypeScript or executable shell.

### Type consistency check
- `composeInfoLine` input/output types defined in `infoLine.ts`. `ProximityBand` imported from `@/lib/api/discovery`.
- `BAND_COLOUR` typed as `Record<ProximityBand, string | null>` — matches the existing `BAND_LABEL` shape in ProximityBandChip.tsx.
- FavouriteHeart `handlePress` deps array updated for new `isFavourited` dependency.

### British English check
"favourite", "colour", "behaviour", "organise", "tokenise" used throughout. No US spellings.

### Em-dash check (user-visible copy + commit messages only)
All new component copy strings and commit-message templates produced by this plan use commas, colons, semicolons, periods, parentheses, and the Unicode middot ` · ` (the middot only in user-visible info-line content per spec §9.7 design). Plan documentation prose uses em-dashes per standard editorial style; the British-English + no-em-dash rule applies to user-visible UI copy and commit messages, not to plan-doc narrative.

### Emoji check
Zero emojis.

---

## Deferred follow-ups surfaced during Batch 1B (reviewers' minor items)

These do not block Batch 1B but are recorded inline so they are not lost.

- **DSN.1** — Rename `BranchTile.proximity-chip.test.tsx` to `BranchTile.proximity-clause.test.tsx` for accuracy. Tier 0 hygiene PR. Deferred to avoid CI grep churn during Batch 1B.
- **DSN.2** — Decide whether to mount `<ProximityBandChip>` standalone on any Discovery surface (Search results, Merchant Profile branches tab) that wants a separate chip treatment, or fully retire the component file. Tier 2; awaits owner direction on chip-vs-clause across surfaces beyond BranchTile.
- **DSN.3** — Investigate `formatVoucherCount` vocabulary unification ('voucher' vs 'offer'). Pre-existing inconsistency outside Batch 1B scope.
- **DSN.4** — `BranchTile.tsx` hardcoded padding values in `styles.content` (18 / 12 / 10) have no clean `spacing[N]` token mapping. Either extend the spacing scale OR migrate to closest tokens. Tier 0/1 DESIGN.md alignment pass.
- **DSN.5** — `BranchTile.tsx` `showClose` + `onClose` props are unused in production (verified via grep — MapBranchTile uses its own outer close button). Consider removing the props to simplify the API surface. Tier 1.
- **DSN.6** — Future polish: implement an `onLayout`-driven width-aware drop of the proximity clause when info-line measurement exceeds threshold (currently relies on native tail-ellipsis). Tier 2; pick up if device QA cell 9 / 12 surfaces mid-segment ellipsis as a recurring complaint.
- **DSN.7** — Reconsider distance abbreviation "0.4 mi" vs "0.4 miles away" if device QA surfaces info-line crowding at Dynamic Type Largest. Owner-locked per PR #112 fixup-6 today.
- **DSN.8** — `<FavouriteHeart>` outer wrapper rejected `PressableScale` to avoid scale-source conflict. Document the decision permanently as a comment on the `Pressable` so a future refactor knows to consider both halves of the trade-off. Tier 0.
- **DSN.9** — Voucher-type chip (spec §9.7 mentions "promoted type from Batch 1A") deferred. Would need a backend wire extension (`primaryVoucherType` per branch) before it can render.

---

## Optional commit checkpoints (owner-approved only)

Do NOT run these commands automatically as part of executing the implementation tasks. Each entry is an OWNER-APPROVED checkpoint — only run with explicit owner direction. Tasks 2 and 14 are intentionally absent from the standing stack: Task 2 is verification-only, and Task 14 only adds a fixup commit if Step 1 surfaced failing pins (use the Task 14 entry below only in that case).

Per CLAUDE.md hook rules: every `git add` uses explicit file paths (no `git add .` / `-A` / `--all`). Commit messages follow Conventional Commits and respect the British-English + no-em-dash rules.

### Task 1 — Plan doc kickoff

Covers: this plan document itself.

```bash
git add docs/superpowers/plans/2026-06-01-home-card-chip-hierarchy.md
git commit -m "docs(home): Batch 1B plan doc — BranchTile card/chip hierarchy + heart polish (Tier 2)"
```

### Task 3 — VoucherCountPill neutralisation

Covers: flat grey background + 11pt Lato-SemiBold + null-guard.

```bash
git add apps/customer-app/src/features/shared/VoucherCountPill.tsx
git commit -m "feat(home): VoucherCountPill neutral treatment, 11pt Lato-SemiBold, null-guard"
```

### Task 4 — SavePill type-promote

Covers: 11pt Lato-SemiBold per spec §9.7.

```bash
git add apps/customer-app/src/features/shared/SavePill.tsx
git commit -m "feat(home): SavePill 11pt Lato-SemiBold per spec §9.7"
```

### Task 5 — StarRating type-promote + testID

Covers: 13pt rating + 11pt count + 14pt star + `testID="star-rating-icon"` on the Star JSX element, plus the new standalone `StarRating.test.tsx` suite.

```bash
git add apps/customer-app/src/features/shared/StarRating.tsx \
        apps/customer-app/tests/features/shared/StarRating.test.tsx
git commit -m "feat(home): StarRating type-promote (13pt rating, 11pt count, 14pt star) + testID-pinned standalone suite"
```

### Task 6 — composeInfoLine() pure helper

Covers: new pure-function helper + its unit test suite.

```bash
git add apps/customer-app/src/features/shared/infoLine.ts \
        apps/customer-app/tests/features/shared/infoLine.test.ts
git commit -m "feat(home): composeInfoLine() pure helper for BranchTile info line"
```

### Task 7 — BranchTile typography promotion

Covers: name 16pt Lato-SemiBold + info 13pt Lato-Regular per §9.7.

```bash
git add apps/customer-app/src/features/shared/BranchTile.tsx \
        apps/customer-app/tests/features/shared/BranchTile.typography.test.tsx
git commit -m "feat(home): BranchTile name 16pt + info 13pt per spec §9.7"
```

### Task 8 — FavouriteHeart hitSlop + split haptic/animation

Covers: 12-per-side hitSlop, split add (lightHaptic + 1.15 pop) vs remove (selection + 0.92 dip), reduce-motion path stays haptic-on animation-off.

```bash
git add apps/customer-app/src/features/favourites/components/FavouriteHeart.tsx \
        apps/customer-app/src/features/favourites/__tests__/FavouriteHeart.test.tsx
git commit -m "feat(home): FavouriteHeart 44pt hitSlop + split add/remove haptic + animation per §10.3"
```

### Task 9 — Retire ProximityBandChip mount + flexWrap pill row

Covers: drop the standalone chip mount from BranchTile, add flexWrap to the pill row, remove card-level `overflow: 'hidden'`, add `testID="proximity-band-chip"` + top-of-file JSDoc on ProximityBandChip, plus the meta-pin guarding against future remounts.

```bash
git add apps/customer-app/src/features/shared/BranchTile.tsx \
        apps/customer-app/src/design-system/components/ProximityBandChip.tsx \
        apps/customer-app/tests/features/shared/BranchTile.pillRow.test.tsx \
        apps/customer-app/tests/_meta/proximity-chip-no-jsx-consumers.test.ts
git commit -m "feat(home): retire ProximityBandChip from BranchTile mount + flexWrap pill row + drop card overflow"
```

### Task 10 — BranchTile info-line rebuild with nested semantic-coloured proximity Text

Covers: composeInfoLine() wiring + BAND_COLOUR map + nested `<Text>` proximity clause.

```bash
git add apps/customer-app/src/features/shared/BranchTile.tsx \
        apps/customer-app/tests/features/shared/BranchTile.infoLine.test.tsx
git commit -m "feat(home): BranchTile info line — 4-segment compose + semantic-coloured proximity clause"
```

### Task 11 — BranchTile tap-propagation contract pin

Covers: layered-tap defence (heart press does not bubble to card onPress).

```bash
git add apps/customer-app/tests/features/shared/BranchTile.tapPropagation.test.tsx
git commit -m "test(home): BranchTile tap-propagation contract — heart vs card layered taps"
```

### Task 12 — Refactor BranchTile chip/distance/locality pins for inline-clause composition

Covers: the three test files whose assertions move from the standalone chip to the inline clause.

```bash
git add apps/customer-app/tests/features/shared/BranchTile.proximity-chip.test.tsx \
        apps/customer-app/tests/features/shared/BranchTile.distance-format.test.tsx \
        apps/customer-app/tests/features/shared/BranchTile.locality.test.tsx
git commit -m "test(home): rewrite BranchTile chip/distance/locality pins for Batch 1B inline-clause composition"
```

### Task 13 — Cross-surface render pins (PopularSection + MapBranchTile)

Covers: single-render assertion to defend against double-render regressions.

```bash
git add apps/customer-app/tests/features/home/components/PopularSection.test.tsx \
        apps/customer-app/tests/features/map/MapBranchTile.test.tsx
git commit -m "test(home): PopularSection + MapBranchTile use single-render assertion for proximity clause"
```

### Task 14 — Audit-driven fixup (only if Step 1 surfaced failing pins)

Stage the explicit files affected (varies by audit outcome) and use a message such as:

```bash
git commit -m "fix(home): Batch 1B Task 14 audit fixup — <one-line summary of failing surface>"
```

If Task 14 Step 1 was green first-run, skip this entirely.

---

**End of plan.**
