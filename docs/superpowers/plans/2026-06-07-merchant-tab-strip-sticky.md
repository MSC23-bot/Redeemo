# Merchant Profile Tab‑Strip Sticky (§HSH.7(b)) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Merchant Profile `Vouchers / About / Reviews / Branches` tab strip rock‑steady while scrolling — eliminate the up/down wiggle — without changing the collapsed‑header UX, the tab content/branch/reviews logic, or any other surface.

**Architecture:** The tab strip wiggles because it is a **worklet‑positioned "fake sticky"** — an absolute sibling repositioned every frame from `scrollY` (`translateY: Math.max(tabPinPoint, identityZoneEnd - scrollY.value)`), which lags the native scroll by a frame. The fix removes the per‑frame scroll‑tracking transform. Two approaches are evaluated: **(P) native `stickyHeaderIndices`** (a single in‑flow sticky child the OS pins with zero lag — preferred IF the collapsed‑header layering can be reconciled), and **(F) an in‑flow real tab bar + a constant‑position pinned clone** (guaranteed jitter‑free and preserves the existing faded‑overlay collapsed header). Task 1 is a timeboxed spike that picks P or F; the plan implements F in full (the safe default) and documents the P variant.

**Tech Stack:** React Native (Expo SDK 54), react-native-reanimated 4 (`useAnimatedScrollHandler` / `useAnimatedStyle` / `interpolate`), expo-router 6 Tabs, jest-expo + @testing-library/react-native.

---

## Background — root cause (confirmed, read‑only diagnosis on file 2026‑06‑07)

In `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`:
- `scrollY` is a shared value driven by `useAnimatedScrollHandler` (around line 648), `scrollEventThrottle={16}`.
- The `<TabBar>` is mounted as an **absolute sibling** `<Animated.View style={[styles.floatingTabBar, tabBarAnimatedStyle]}>` (around line 1090), where
  `tabBarAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.max(tabPinPoint, identityZoneEnd - scrollY.value) }] }))` (around line 712).
- A `<View style={{ height: tabBarHeight }} testID="tab-bar-spacer" />` (around line 950) reserves the in‑flow space.
- `tabPinPoint = insets.top + COMPACT_BAR_HEIGHT` (`COMPACT_BAR_HEIGHT = 52`, exported from `../components/CollapsedHeader`).
- The merchant **CollapsedHeader** (`../components/CollapsedHeader.tsx`) is a separate **absolute, opacity‑faded** overlay (`zIndex 20`, fade centred on `fadeEndY`), invisible at the top and fading in on scroll. The TabBar pins **below** it at `tabPinPoint`.

During the pre‑pin "moving" phase the absolute bar tracks `identityZoneEnd - scrollY.value` (worklet, one frame behind the native scroll) while the surrounding content moves at the true native rate → the sharp‑edged strip visibly wiggles. The hero (`HeroBackdrop` + `HeroBannerSpacer`, parallax) uses the same class of mechanism but masks its lag (full‑bleed image), so the page "feels fine" and only the tab strip shows it. The M2.1 comment block (around line 679) records that the team **deliberately left native `stickyHeaderIndices`** because the absolute CollapsedHeader covered the natively‑pinned bar — and that switch is what introduced the wiggle.

Native sticky is the obvious jitter‑free answer, but the current design (hero from `y=0` + an **opacity‑faded absolute** collapsed header + the tab bar pinned **below** it) does not map cleanly to native sticky, because native sticky children are in‑flow and always visible at their natural position (they cannot be a scroll‑faded overlay that occupies zero space at rest). Hence the spike + the guaranteed fallback.

---

## Approaches

### (P) Native `stickyHeaderIndices` — preferred IF feasible
Make the `<TabBar>` an in‑flow scroll child and mark its index in the ScrollView's `stickyHeaderIndices`. The OS pins it at the scroll‑viewport top with **zero lag**. The open problem is making it pin at `tabPinPoint` **below** the faded collapsed header without (a) pushing the hero down, (b) breaking the collapsed‑header fade, or (c) double‑showing chrome. Candidate reconciliations to validate on device (Task 1): iOS `contentInset.top`/`contentInsetAdjustmentBehavior` interaction with sticky pinning; a stacked index‑0 sticky that carries the collapsed‑header zone; or accepting the tab bar pins at the safe‑area top with the collapsed header restructured. **Only adopt P if a device prototype shows it pins correctly below the collapsed header, jitter‑free, on iOS AND Android, with no hero gap and no fade regression.**

### (F) In‑flow real bar + constant‑position pinned clone — guaranteed fallback (this plan's default)
- Render the **real `<TabBar>` in‑flow** in the scroll content at its natural position (it replaces the role of `tab-bar-spacer`: it occupies the same height and scrolls naturally with the content → **zero lag** in the moving phase). Wrapper testID **`merchant-tabbar-inline`**.
- Render a **second, absolute `<TabBar>` clone pinned at a CONSTANT `top: tabPinPoint`** (a constant position → **zero lag** in the pinned phase), with its **opacity driven by a worklet** (`scrollY >= pinThresholdY ? 1 : 0`, with a tiny crossfade window), exactly like the existing CollapsedHeader fade. `pinThresholdY = identityZoneEnd - tabPinPoint` (the scrollY at which the in‑flow bar reaches `tabPinPoint`), so at the threshold the in‑flow bar and the clone are co‑located → the crossfade is invisible. Wrapper testID **`merchant-tabbar-pinned`**.
- The CollapsedHeader stays exactly as‑is (absolute, faded). The clone sits at `[tabPinPoint, tabPinPoint+tabBarHeight]` (no overlap with the collapsed header) at `zIndex` above the scroll content and below the CollapsedHeader.
- Remove `tabBarAnimatedStyle`, the absolute `floatingTabBar` mount, and `tab-bar-spacer`.

**Guardrails (amended 2026‑06‑07 — load‑bearing, pinned by tests):**
- **Distinct testIDs** — `merchant-tabbar-inline` (in‑flow) vs `merchant-tabbar-pinned` (clone). Never share a testID across the two instances.
- **Exactly one interactive + one accessible strip at all times.** A single JS flag `tabPinned` (flipped at `pinThresholdY`) gates BOTH wrappers SYMMETRICALLY:
  - in‑flow wrapper: `pointerEvents={tabPinned ? 'none' : 'box-none'}`, `accessibilityElementsHidden={tabPinned}`, `importantForAccessibility={tabPinned ? 'no-hide-descendants' : 'auto'}`.
  - pinned wrapper: `pointerEvents={tabPinned ? 'box-none' : 'none'}`, `accessibilityElementsHidden={!tabPinned}`, `importantForAccessibility={!tabPinned ? 'no-hide-descendants' : 'auto'}`.
  So whichever strip is the visible/active one is the ONLY one that is touchable and the ONLY one VoiceOver/TalkBack can reach. The hidden clone is `pointerEvents:'none'` + a11y‑hidden.
- **No duplicate screen‑reader tab controls during the crossover/crossfade.** The a11y/pointer gate is a BINARY flip on `tabPinned` (not a fade), so the a11y tree never exposes two tab strips even while the visual opacity crossfades for one frame.
- **Perfect state sync.** Both `<TabBar>` instances receive the SAME `tabs`, `activeTab`, `onTabPress` props (and therefore identical labels, counts, the active indicator, and any disabled state — TabBar derives all of these from props). There is no independent per‑instance state.

Why F has no wiggle: neither phase reads `scrollY` to **position** the visible bar. Moving phase = native in‑flow (no transform). Pinned phase = constant `top` (no scroll tracking). Only **opacity** is worklet‑driven, and opacity lag causes no positional jitter.

---

## File Structure

- **Modify** `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` — the only behavioural change. Replace the worklet‑positioned absolute tab bar + spacer with the chosen approach (F by default). Add `pinThresholdY` + a worklet `pinnedTabBarStyle` (opacity). Keep all tab state / branch‑switch / reviews / guard logic untouched.
- **Possibly modify** `apps/customer-app/src/features/merchant/components/CollapsedHeader.tsx` — only if approach P needs the collapsed header restructured (NOT needed for F).
- **Do NOT modify** `apps/customer-app/src/features/merchant/components/TabBar.tsx` — it is self‑contained and reused verbatim for both the in‑flow and pinned instances.
- **Modify** `apps/customer-app/tests/features/merchant/merchant-profile-tab-strip-sticky.test.tsx` — NEW structural test file (assert the wiggle‑prone transform is gone + the sticky structure is in place).
- **Audit/keep green** the existing merchant suite (no edits expected unless a screen‑level test queries `tab-bar-spacer` or counts `tab-active-indicator` at the screen level — check in Task 2).

Run jest from `apps/customer-app/` per CLAUDE.md: `npx jest --forceExit <path>` (use `--runInBand` for screen suites to avoid the load flake).

---

## Task 1: Spike — decide native sticky (P) vs in‑flow clone (F)

**Files:** none committed (throwaway prototype only).

- [ ] **Step 1: Prototype native sticky on a branch‑local scratch copy.** In a scratch edit of `MerchantProfileScreen.tsx`, make the `<TabBar>` an in‑flow scroll child and add `stickyHeaderIndices={[<tabBarChildIndex>]}` to the `<Animated.ScrollView>`. Try to pin it at `tabPinPoint` below the faded CollapsedHeader using, in order: (a) `contentInsetAdjustmentBehavior` + iOS `contentInset={{ top: 0 }}` with the CollapsedHeader unchanged; (b) a stacked index‑0 transparent sticky of height `tabPinPoint`; (c) leaving it pinned at the safe‑area top.

- [ ] **Step 2: Device‑check on iOS AND Android against explicit PASS/FAIL criteria.** Build to a device/simulator. P **PASSES** only if ONE candidate meets ALL of these on BOTH platforms:
  - **(C1) Jitter‑free** — tab strip rock‑steady on continuous fast scroll/fling (the whole point).
  - **(C2) Pins below the collapsed header** — pins at `tabPinPoint`, cream‑on‑cream seam intact, NOT covered by the CollapsedHeader (the original M2.1 cover bug must not return on deep scroll).
  - **(C3) No hero gap** — the hero still fills from `y=0` at rest; no blank/inset band at the top.
  - **(C4) Fade preserved** — the CollapsedHeader still fades in/out correctly; no double chrome.
  - **(C5) No new regressions** — tab tap, content swap, branch switch still work in the prototype.

  P **FAILS** (→ abandon immediately, go to F) if ANY of C1–C5 breaks, OR if making it pass requires restructuring the CollapsedHeader's faded‑overlay UX, OR if it behaves differently across iOS/Android.

- [ ] **Step 3: Timebox — do not fight the design.** Cap the P spike at a short investigation. If the first 2 candidates (contentInset; stacked index‑0 sticky) both fail C1–C5, STOP and adopt F. Native sticky fighting the current faded‑overlay design is an expected outcome, not a reason to keep pushing.

- [ ] **Step 4: Decision (record in the PR description + report to owner before building further).**
  - **Adopt P** only if a candidate passes C1–C5 on BOTH platforms. Then implement the P variant (see "Native‑sticky variant" below) instead of Tasks 3–5, keep Tasks 2 + 6 (with the P‑structure assertions).
  - **Otherwise adopt F** (default, expected). Proceed to Tasks 2–6.

- [ ] **Step 5: Discard the scratch prototype** (`git checkout -- apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` if you edited it). No spike code is committed.

- [ ] **Step 6: PAUSE — report P vs F recommendation to the owner before implementing Tasks 2–6.**

---

## Task 2: Pin the wiggle‑prone structure under test (lock the regression target)

**Files:**
- Create: `apps/customer-app/tests/features/merchant/merchant-profile-tab-strip-sticky.test.tsx`

This test renders `MerchantProfileScreen`, drives it to a loaded state with the existing test harness (copy the mock setup from `merchant-profile-cold-mount-reviews.test.tsx`: `useMerchantProfile`, `useBranchSelection`, `useUserLocation`, `expo-router`, react‑query, safe‑area), and asserts the *new* structure. Because the wiggle itself is native‑scroll/worklet behaviour (jest mocks `useAnimatedStyle`/`useAnimatedScrollHandler` to no‑ops), the meaningful automated guard is **structural**: the in‑flow tab bar exists and the old absolute‑spacer fake‑sticky is gone.

- [ ] **Step 1: Write the failing tests** (structural pins for the chosen F structure + the no‑worklet‑fake‑sticky guard + the single‑accessible‑strip guard)

```tsx
// merchant-profile-tab-strip-sticky.test.tsx
// (mock block copied verbatim from merchant-profile-cold-mount-reviews.test.tsx)
import React from 'react'
import { render } from '@testing-library/react-native'
// ...the copied jest.mock(...) calls + wrapper...
import { MerchantProfileScreen } from '@/features/merchant/screens/MerchantProfileScreen'

describe('Merchant Profile — §HSH.7(b) sticky tab strip', () => {
  it('renders DISTINCT in-flow + pinned tab strips and NO worklet fake-sticky spacer', () => {
    const { queryByTestId } = render(<MerchantProfileScreen id="m1" />, { wrapper })
    // The old worklet "fake sticky" reserved its space with this spacer; it is gone.
    expect(queryByTestId('tab-bar-spacer')).toBeNull()
    // Two strips with DISTINCT testIDs (never a shared one).
    expect(queryByTestId('merchant-tabbar-inline')).toBeTruthy()
    expect(queryByTestId('merchant-tabbar-pinned')).toBeTruthy()
  })

  it('no leftover worklet-positioned translateY fake-sticky tab bar', () => {
    // Guard against a revert: the pinned strip must NOT carry a scroll-driven
    // translateY transform (the wiggle cause). Its style resolves to a CONSTANT
    // top + opacity only. (useAnimatedStyle is mocked to {} in jest, so we assert
    // the *static* style array carries no `transform`.)
    const { getByTestId } = render(<MerchantProfileScreen id="m1" />, { wrapper })
    const pinned = getByTestId('merchant-tabbar-pinned')
    const flat = require('react-native').StyleSheet.flatten(pinned.props.style)
    expect(flat.position).toBe('absolute')
    expect(typeof flat.top).toBe('number')      // constant pin point, not scroll-driven
    expect(flat.transform).toBeUndefined()       // NO translateY fake-sticky
  })

  it('at the top, only the in-flow strip is accessible/interactive (no duplicate SR tab controls)', () => {
    // tabPinned starts false (not scrolled). The pinned clone must be
    // a11y-hidden + non-interactive; the in-flow strip must be live.
    const { getByTestId } = render(<MerchantProfileScreen id="m1" />, { wrapper })
    const inline = getByTestId('merchant-tabbar-inline')
    const pinned = getByTestId('merchant-tabbar-pinned')
    expect(pinned.props.accessibilityElementsHidden).toBe(true)
    expect(pinned.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(pinned.props.pointerEvents).toBe('none')
    expect(inline.props.accessibilityElementsHidden).toBe(false)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx jest --forceExit tests/features/merchant/merchant-profile-tab-strip-sticky.test.tsx`
Expected: FAIL — `tab-bar-spacer` still present; the `merchant-tabbar-inline`/`-pinned` testIDs + gating props don't exist yet.

(Tasks 3–5 make these pass. If Task 1 adopted P instead, REPLACE these with the P‑structure pins: the TabBar is a sticky scroll child / `stickyHeaderIndices` is set on the ScrollView; `tab-bar-spacer` gone; a SINGLE `merchant-tabbar` with no scroll‑driven `translateY`. Keep the "no worklet translateY fake‑sticky" guard either way.)

---

## Task 3: Add the in‑flow tab bar + remove the worklet fake‑sticky

**Files:**
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`

- [ ] **Step 1: Keep `TabBar.tsx` UNTOUCHED.** The distinct testIDs + a11y/pointer gating live on the two WRAPPERS in the screen (so the two instances are distinguishable and independently gated). Do NOT add a testID to the shared `TabBar` component — that would make both instances share an id, defeating the distinct‑testID guardrail. `tab-bar-pulse.test.tsx` (which renders `TabBar` in isolation and queries `tab-active-indicator`) stays green and unedited.

- [ ] **Step 2: Add the `tabPinned` flag** (drives the symmetric interactivity + a11y gate). Near `tabPinPoint` in `MerchantProfileScreen.tsx`:

```tsx
// §HSH.7(b) — scrollY at which the in-flow tab strip reaches tabPinPoint.
const pinThresholdY = Math.max(0, identityZoneEnd - tabPinPoint)
// Binary pinned flag (NOT a fade) so exactly one strip is ever interactive /
// reachable by VoiceOver/TalkBack — no duplicate SR tab controls at the crossover.
const [tabPinned, setTabPinned] = useState(false)
useAnimatedReaction(
  () => scrollY.value >= pinThresholdY,
  (pinned, prev) => { if (pinned !== prev) runOnJS(setTabPinned)(pinned) },
  [pinThresholdY],
)
```
(`useAnimatedReaction` + `runOnJS` are already imported in the screen; if not, add them to the existing `react-native-reanimated` import.)

- [ ] **Step 3: Replace the `tab-bar-spacer` with the real in‑flow `<TabBar>`** (distinct testID + gated). In `MerchantProfileScreen.tsx`, delete `<View style={{ height: tabBarHeight }} testID="tab-bar-spacer" />` (around line 950) and render:

```tsx
{/* §HSH.7(b) — in-flow tab strip. Scrolls naturally with content (zero lag,
    no wiggle). The pinned clone (below) takes over once this reaches tabPinPoint.
    When pinned, this strip is hidden from touch + screen readers so exactly one
    strip is ever live. */}
<View
  testID="merchant-tabbar-inline"
  onLayout={handleTabBarLayout}
  pointerEvents={tabPinned ? 'none' : 'box-none'}
  accessibilityElementsHidden={tabPinned}
  importantForAccessibility={tabPinned ? 'no-hide-descendants' : 'auto'}
>
  <TabBar tabs={tabs} activeTab={activeTab} onTabPress={setActiveTab} />
</View>
```

- [ ] **Step 4: Remove the worklet fake‑sticky.** Delete the absolute `<Animated.View style={[styles.floatingTabBar, tabBarAnimatedStyle]}><TabBar .../></Animated.View>` mount (around line 1090) and the `tabBarAnimatedStyle` definition (around line 712). Keep `tabPinPoint`, `identityZoneEnd`, `tabBarHeight`, `handleTabBarLayout`, `pinThresholdY`, `tabPinned`.

- [ ] **Step 5: Run the existing merchant sweep — expect green** (the in‑flow bar must not break tab switching / reviews / branch logic).

Run: `npx jest --forceExit --runInBand tests/features/merchant`
Expected: PASS for all suites EXCEPT the new Task 2 test (still failing — pinned clone not added yet) and any screen‑level test that referenced `tab-bar-spacer` (fix those by removing the obsolete assertion; there should be none outside this plan's new test).

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx
git commit -m "refactor(merchant): in-flow tab strip + tabPinned gate, drop worklet fake-sticky (§HSH.7b)"
```

---

## Task 4: Add the constant‑position pinned clone (worklet opacity, distinct testID, symmetric gating)

**Files:**
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`

- [ ] **Step 1: Add the worklet opacity style** (`pinThresholdY` + `tabPinned` already exist from Task 3). Near `tabPinPoint`:

```tsx
// §HSH.7(b) — pinned-clone OPACITY only (NO positional tracking → no scroll-lag
// wiggle). The clone's top is the CONSTANT tabPinPoint (set in the JSX below).
// The in-flow bar and the clone are co-located at pinThresholdY, so this
// crossfade is visually invisible.
const pinnedTabBarStyle = useAnimatedStyle(() => {
  'worklet'
  return { opacity: scrollY.value >= pinThresholdY ? 1 : 0 }
})
```

- [ ] **Step 2: Mount the pinned clone** as an absolute sibling (constant `top: tabPinPoint`), AFTER the ScrollView and BEFORE the CollapsedHeader (so the collapsed header z‑stacks above it). DISTINCT testID + SYMMETRIC interactivity/a11y gate (the mirror of the in‑flow strip), so exactly one strip is ever live:

```tsx
{/* §HSH.7(b) — pinned tab-strip clone. CONSTANT top (tabPinPoint) → zero lag,
    rock-steady. Worklet opacity reveals it exactly when the in-flow bar reaches
    this position. When NOT pinned it is invisible AND non-interactive AND hidden
    from screen readers (the in-flow strip is the live one then), and vice-versa —
    so VoiceOver/TalkBack only ever encounter ONE tab strip. Same tabs/activeTab/
    onTabPress props as the in-flow bar → perfectly synced labels/indicator/counts. */}
<Animated.View
  testID="merchant-tabbar-pinned"
  pointerEvents={tabPinned ? 'box-none' : 'none'}
  accessibilityElementsHidden={!tabPinned}
  importantForAccessibility={!tabPinned ? 'no-hide-descendants' : 'auto'}
  style={[styles.pinnedTabBar, { top: tabPinPoint }, pinnedTabBarStyle]}
>
  <TabBar tabs={tabs} activeTab={activeTab} onTabPress={setActiveTab} />
</Animated.View>
```

- [ ] **Step 3: Add the `pinnedTabBar` style** (zIndex above the scroll content, below the CollapsedHeader at 20):

```tsx
pinnedTabBar: {
  position: 'absolute',
  left: 0,
  right: 0,
  zIndex: 15,
},
```

- [ ] **Step 4: Run the Task 2 tests — expect PASS**

Run: `npx jest --forceExit tests/features/merchant/merchant-profile-tab-strip-sticky.test.tsx`
Expected: PASS — `tab-bar-spacer` gone; distinct `merchant-tabbar-inline` + `merchant-tabbar-pinned`; pinned clone has no `transform`, constant `top`, and (at the top) is a11y‑hidden + `pointerEvents:'none'`.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx
git commit -m "feat(merchant): constant-position pinned tab-strip clone, one-live-strip a11y gate (§HSH.7b)"
```

---

## Task 5: Verify single‑live‑strip across the crossover + reduced motion

**Files:**
- Modify (test only): `apps/customer-app/tests/features/merchant/merchant-profile-tab-strip-sticky.test.tsx`

- [ ] **Step 1: Pin the symmetric gate flips with `tabPinned`.** Add a test that drives `tabPinned` true (the `useAnimatedReaction` is a jest no‑op, so flip the underlying state by firing the ScrollView's scroll past `pinThresholdY` if the harness supports it, OR — simpler and deterministic — assert the GATING CONTRACT structurally by rendering at the top and asserting the in‑flow strip is live + the clone hidden, which the Task‑2 test already covers, and add a comment that the pinned‑state mirror is device‑QA‑verified because `useAnimatedReaction` does not run under jest). Keep this honest: do not fake a passing assertion on a state the jest mock can't reach.

```tsx
it('the two strips are mutually exclusive for touch + a11y (mirror gate)', () => {
  // At the top (tabPinned=false): inline live, pinned hidden — asserted in Task 2.
  // The mirrored pinned-state (inline hidden, pinned live) is driven by
  // useAnimatedReaction, which is a no-op under jest, so it is device-QA-verified
  // (see the a11y QA checklist). Here we pin the STATIC contract that the two
  // wrappers read OPPOSITE accessibilityElementsHidden values from one flag.
  const { getByTestId } = render(<MerchantProfileScreen id="m1" />, { wrapper })
  const inline = getByTestId('merchant-tabbar-inline')
  const pinned = getByTestId('merchant-tabbar-pinned')
  expect(inline.props.accessibilityElementsHidden)
    .not.toBe(pinned.props.accessibilityElementsHidden) // opposite by construction
})
```

- [ ] **Step 2: Reduced motion.** No special handling required — the fix uses no entrance/exit motion; the opacity flip is a state/threshold change, not decorative motion. Add a one‑line comment in the screen near `pinnedTabBarStyle` noting this (no `useMotionScale` branch needed).

- [ ] **Step 3: Run the new suite — expect PASS**

Run: `npx jest --forceExit tests/features/merchant/merchant-profile-tab-strip-sticky.test.tsx`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-app/tests/features/merchant/merchant-profile-tab-strip-sticky.test.tsx apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx
git commit -m "test(merchant): pin mutually-exclusive tab-strip a11y/touch gate (§HSH.7b)"
```

---

## Task 6: Verification sweep (no new code)

- [ ] **Step 1: Full merchant suite** — `npx jest --forceExit --runInBand tests/features/merchant` → all PASS (956+ across 56 files; specifically `tab-bar-pulse`, `merchant-profile-tab-reset-on-focus`, `merchant-profile-cold-mount-reviews`, `reviews-tab-auto-open-from-redemption`, `reviews-tab-auto-open-populated`, `reviews-tab-branch-filter`, `merchant-profile-branch-switch-gate`, `merchant-profile-cross-merchant-gate`, `merchant-profile-background-tab-guard`, `collapsed-header`, `hero-overscroll`, `utils/resolveBackNavigation`).
- [ ] **Step 2: Navigation + app sweep** — `npx jest --forceExit --runInBand tests/features/navigation tests/app` → all PASS.
- [ ] **Step 3: Scroll/anchor verification.** Confirm tab interaction is unchanged: tapping a tab calls `setActiveTab` and swaps content exactly as before (the merchant tabs SWAP content, they do not scroll‑to‑section — verify there is no `scrollTo`/anchor‑offset logic tied to the tab bar; if any section‑anchor offset exists, it MUST add `tabPinPoint` (collapsed header + pinned tab strip height) so anchored content lands below the pinned chrome, not under it). Grep the screen for `scrollTo`/`scrollToOffset`/anchor math and confirm none is broken by the in‑flow→pinned change. Pin tab‑tap → `onTabPress` in the new test if not already covered by `tab-bar-pulse`/reset‑on‑focus.
- [ ] **Step 4: tsc** — from `apps/customer-app/`: `npx tsc --noEmit` → clean.
- [ ] **Step 5: Lint touched files** — `npx eslint "src/features/merchant/screens/MerchantProfileScreen.tsx" "tests/features/merchant/merchant-profile-tab-strip-sticky.test.tsx"`. Report any issues; confirm they are baseline‑only by comparing counts against `origin/main` (the merchant screen carries pre‑existing `no-raw-tokens`/`no-explicit-any`). (`TabBar.tsx` is untouched in F.)

---

## Native‑sticky variant (only if Task 1 adopts P)

Replace Tasks 3–4 with: make `<TabBar>` an in‑flow scroll child; add `stickyHeaderIndices={[<index>]}` to the `<Animated.ScrollView>`; apply the validated Task‑1 reconciliation so it pins at `tabPinPoint` below the faded CollapsedHeader; remove `tabBarAnimatedStyle` + the absolute mount + `tab-bar-spacer`. Keep Task 2 (rewrite the structural assertion to: TabBar is a sticky child / `stickyHeaderIndices` is set; `tab-bar-spacer` gone; single `merchant-tabbar`) and Task 6. P needs no pinned clone and no opacity worklet.

---

## Risks & tradeoffs

- **(F) two `<TabBar>` instances** — both fed the SAME `tabs`/`activeTab`/`onTabPress`, so labels/indicator/counts/selected‑state are always in sync by construction. The non‑visible one is gated `pointerEvents:'none'` + `accessibilityElementsHidden` via the single `tabPinned` flag (Tasks 3 + 4), so exactly one is interactive + screen‑reader‑reachable at any time (no duplicate SR controls, even at the crossover — the gate is a binary flip, not a fade). Slight extra render cost (one static TabBar), negligible. Two `tab-active-indicator`s exist at the *screen* level, but `tab-bar-pulse` tests `TabBar` in ISOLATION (one instance) so it's unaffected; the new suite queries the DISTINCT `merchant-tabbar-inline` / `merchant-tabbar-pinned` testIDs (never a shared id).
- **(P) native sticky** — cleaner (single bar) but the collapsed‑header layering may be infeasible cross‑platform; that's the whole reason for the Task‑1 spike. Do not commit P without the device proof.
- **Crossfade seam (F)** — the in‑flow bar and clone are co‑located at `pinThresholdY`, so the opacity flip is invisible; if a 1px hard cutoff shows a flicker on device, widen to a 6–8px `interpolate` window centred on `pinThresholdY` (still positional‑lag‑free).
- **Measurement** — `identityZoneEnd` + `tabBarHeight` are already measured today; reused unchanged. No new cold‑start padding settle (unlike Home/Voucher) because the in‑flow bar is a normal child.
- **Must not regress:** tab switching + 280ms entrance, tab reset on focus, reviews auto‑open (cold mount / from‑redemption / populated), branch switch + toast, cross‑merchant + background‑tab guards, the cream‑on‑cream seam, deep‑scroll showing the tab strip (M2.1 cover bug).

## Required tests (summary)
- NEW `merchant-profile-tab-strip-sticky.test.tsx`, pinning (per amendment #5):
  1. **No worklet fake‑sticky left** — `tab-bar-spacer` gone; the pinned strip's style has NO `transform` (no scroll‑driven `translateY`), a constant numeric `top`, `position:absolute`.
  2. **Chosen structure** — F: distinct `merchant-tabbar-inline` + `merchant-tabbar-pinned` both present. (P variant: `stickyHeaderIndices` set on the ScrollView; single `merchant-tabbar`; spacer gone.)
  3. **No duplicate tab‑strip a11y/test ambiguity** — distinct testIDs (never shared); the two wrappers read OPPOSITE `accessibilityElementsHidden` from the one `tabPinned` flag; at the top, the in‑flow strip is live and the pinned clone is a11y‑hidden + `pointerEvents:'none'`.
- Keep green (no edits expected): `tab-bar-pulse`, `merchant-profile-tab-reset-on-focus`, `merchant-profile-cold-mount-reviews`, `reviews-tab-auto-open-*`, `reviews-tab-branch-filter`, `merchant-profile-branch-switch-gate`, `merchant-profile-cross-merchant-gate`, `merchant-profile-background-tab-guard`, `collapsed-header`, `hero-overscroll`, `utils/resolveBackNavigation`.
- The wiggle itself + the pinned‑state a11y mirror (inline‑hidden/pinned‑live) are device‑QA‑only (worklet/`useAnimatedReaction` are jest no‑ops) — same standing caveat as §HSH.1 / §HSH.7(a). Do not fake a passing assertion on a state jest can't reach.

## Device‑QA checklist

**Wiggle / layering**
- Scroll up/down at varying speeds (incl. fast flings) → tab strip is **rock‑steady**, no wiggle, in both the moving and pinned phases.
- Tab strip pins cleanly **below the collapsed header**; cream‑on‑cream seam invisible.
- **Deep‑scroll still shows the tab strip** (the original M2.1 cover bug must NOT return).
- Hero parallax/stretch on overscroll unchanged.

**Accessibility (amendment #2 — explicit)**
- With VoiceOver (iOS) and TalkBack (Android), swipe through the screen at the top AND deep‑scrolled: the screen reader encounters **exactly ONE tab strip**, never two. No duplicate `Vouchers/About/Reviews/Branches` controls at any scroll position, including right at the crossover point.
- Tab **labels** are announced correctly and the **selected** tab is announced as selected (`accessibilityState.selected`) on whichever strip is live.
- Switching tabs via the screen reader updates the selected state correctly on the live strip.

**Scroll / anchor / interaction (amendment #3 — explicit)**
- Tapping `Vouchers / About / Reviews / Branches` switches content **exactly as before** (same content swap + 280ms entrance), from BOTH the in‑flow (top) and pinned (scrolled) states.
- After switching tabs while pinned, the new tab's content sits correctly **below** the pinned tab strip + collapsed header — no content hidden under the pinned chrome, no jump.
- Active indicator tracks the selected tab on the live strip; counts/labels identical on both strips.
- ReviewsTab auto‑open (cold mount + from redemption), branch switch + toast, cross‑merchant nav all unaffected.

**Misc**
- Reduced motion: behaviour identical (no decorative motion involved).
- SE / notch / Pro‑Max.

## Out of scope (this PR)
Horizontal tab swipe / pager (future **B1**); native/page‑level swipe‑back + Tabs→Stack migration (future **B2**, spans Merchant + Voucher Detail); the gesture‑conflict design (belongs to B1/B2); Voucher Detail; Home; Search; backend/API/Prisma; bottom nav; categories; Savings; the merchant hero/parallax (untouched unless P's reconciliation strictly requires it — flag for owner sign‑off if so); any tab content / branch‑switch / reviews logic change.

---

## Self‑Review (completed by plan author)

- **Spec coverage:** wiggle root cause (Background); native‑sticky‑if‑feasible (Task 1 spike + P variant); reconcile collapsed‑header z‑order (Task 1 candidates + F keeps it untouched); fallback if native sticky infeasible (F, Tasks 2–6); exact files (File Structure); tests (Task 2 + Required tests); risks (Risks); device‑QA (checklist); out‑of‑scope incl. B1/B2 + gesture conflict (Out of scope). **Amendments (2026‑06‑07):** #1 distinct testIDs + symmetric interactivity/a11y gate + state sync (approach F + Tasks 3–4 + Risks); #2 a11y QA (checklist); #3 scroll/anchor QA (checklist + Task 6 Step 3); #4 spike pass/fail + quick‑abandon (Task 1 Steps 2–4); #5 no‑worklet‑translateY pin + chosen‑structure pins + a11y‑ambiguity pin (Task 2 + Required tests). All present.
- **Placeholder scan:** no TBDs; every code step shows concrete code/commands. The spike (Task 1) is intentionally exploratory but has explicit C1–C5 pass/fail criteria + a discard step.
- **Type consistency:** `pinThresholdY: number`, `pinnedTabBarStyle` (opacity worklet), `tabPinned: boolean`; testIDs `merchant-tabbar-inline` / `merchant-tabbar-pinned` (distinct, never shared) + the removed `tab-bar-spacer` used consistently across Tasks 2–5; `tabPinPoint`/`identityZoneEnd`/`tabBarHeight`/`handleTabBarLayout` reused from existing code unchanged. `TabBar.tsx` untouched in F.
