# Home Wave-Break Pull-to-Refresh (§HSH.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default-feeling pull-to-refresh indicator on Home with a branded Redeemo "R" loader that reveals from the bottom of the header wave seam (iOS), while preserving the exact refetch behaviour and keeping a branded native indicator on Android.

**Architecture:** Keep the native `RefreshControl` for the gesture, trigger threshold, refetch, and content-hold-during-refresh (data behaviour unchanged). Hide its visible spinner on iOS (`tintColor="transparent"`); keep a branded Material circle on Android (`colors={[brandRose]}`). Remove the old above-header `refreshBrand` loader. Add a new absolute-overlay `HomeRefreshLoader` (owned by `HomeScreen`, like `HomeCollapsedHeader`) positioned at the wave seam, driven on iOS by the existing overscroll signal (`scrollY` < 0, the same signal the header anchor already uses) for a progressive reveal, and held during `refreshing`. Android + reduced-motion fall back to a simple show/hide tied to `refreshing`. `HomeScreen` learns the seam Y from a new `onHeightChange` callback on `HomeHeader`.

**Tech Stack:** React Native (Expo SDK 54), react-native-reanimated (`useAnimatedStyle` / `useAnimatedReaction` / `runOnJS`, mocked in jest), the existing `RedeemoLoader` motion primitive, `useMotionScale` reduced-motion gate, jest-expo + @testing-library/react-native.

**Locked owner decisions (2026-06-06):**
- **(1A) Android scope:** iOS gets the full wave-break seam refresh; Android keeps `RefreshControl` with a branded native circle and shows the Redeemo R loader during `refreshing`. Full custom Android pull-parity is DEFERRED (tracked as a follow-up, not in this plan).
- **(2A) Pull reveal:** iOS progressively reveals the R loader from the wave seam as the user pulls, then holds it during refetch. Reduced-motion and Android fall back to a simple show/hide tied to `refreshing`.
- **(3A) Seam-Y mechanism:** lift `HomeHeader`'s measured height to `HomeScreen` via `onHeightChange`; `HomeScreen` owns the absolute seam-loader overlay.

**Plan amendments (2026-06-06, owner review — incorporated throughout):**
1. **Refresh test proves enter AND exit.** The `HomeScreen` refresh test must NOT assert `refreshing` on a STALE captured `RefreshControl` element (it would falsely pass — initial props stay `false`). It asserts the seam loader APPEARS while `refetch` is pending and DISAPPEARS after it resolves (or re-queries the element after each state change). See Task 3.
2. **Seam-height guard.** `HomeRefreshLoader` renders nothing until `seamY > 0` (header measured) — prevents a first-frame flash at `top:0` if a refresh fires before layout. See Task 2.
3. **Android branded native circle.** Keep `colors={[color.brandRose]}` AND add `progressBackgroundColor={color.surface.body}` (warm light surface) so the Android circle reads intentional, not default white. See Task 3.
4. **Duplicate-loader test uses a real count.** No fake historical testID — assert exactly ONE `RedeemoLoader` (the seam) while refreshing via `UNSAFE_getAllByType`. See Task 3.

**Hard scope guardrails (do NOT touch):** Search, backend/API/Prisma, bottom nav, categories, merchant cards, or any unrelated Home section. **Preserve `onRefresh` exactly:** `haptics.touch.medium()` → `setRefreshing(true)` → `await refetch()` → `setRefreshing(false)` → `setDemoToken(+1)`. **Remove** the old above-header `refreshBrand` loader so there is never a duplicated indicator. Keep the existing `expandedHeaderStyle` header anchor unchanged (it is the wave-break mechanism this builds on).

**Key facts the implementer must know (verified in the current code):**
- `HomeScreen` uses `Animated.ScrollView` with `scrollY = useScrollViewOffset(scrollViewRef)`. On **iOS**, overscroll (pull-down) drives `scrollY.value` **negative** — this is exactly why the existing header anchor `expandedHeaderStyle = { transform: [{ translateY: Math.min(scrollY.value, 0) }] }` pins the header + wave while the body pulls away. On **Android**, `ScrollView` overscroll is a stretch/glow and `scrollY` stays `>= 0`, so the pull-reveal naturally no-ops there (which is the desired Android fallback).
- `HomeHeaderWave` exports `WAVE_HEIGHT = 44`. The wave is the bottom edge of `HomeHeader`; the seam is the bottom ~44px of the header.
- `HomeHeader` already measures its height in `handleLayout` (`setHeaderH`) but does not expose it — Task 1 adds the callback.
- `RedeemoLoader` (`@/design-system/motion/RedeemoLoader`) is already reduced-motion-safe (static dots when `useMotionScale() === 0`); `size="md"` = 48px.
- The old branded beat to remove is `HomeScreen.tsx` lines ~322-332 (`{refreshing ? (<View style={styles.refreshBrand}><RedeemoLoader size="md" /></View>) : null}`) plus the `refreshBrand` style in the `StyleSheet`.
- The native control is `HomeScreen.tsx:311`: `refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brandRose} />}`.

---

## File Structure

- **Modify** `apps/customer-app/src/features/home/components/HomeHeader.tsx` — add optional `onHeightChange?: (h: number) => void` prop, call it from the existing `handleLayout`. One responsibility added: report measured height.
- **Create** `apps/customer-app/src/features/home/components/HomeRefreshLoader.tsx` — the seam-loader overlay. Self-contained: takes `scrollY`, `refreshing`, `seamY`; owns the pull-reveal + reduce-motion logic; renders `RedeemoLoader`.
- **Modify** `apps/customer-app/src/features/home/screens/HomeScreen.tsx` — RefreshControl props (transparent iOS tint + Android branded colors), remove the old `refreshBrand` loader + style, add `headerHeight` state + `onHeightChange` wiring + `seamY`, mount `<HomeRefreshLoader>` as a sibling of the ScrollView. `onRefresh` body unchanged.
- **Create** `apps/customer-app/tests/features/home/components/HomeRefreshLoader.test.tsx`.
- **Modify** `apps/customer-app/tests/features/home/components/HomeHeader.test.tsx` — add the `onHeightChange` pin.
- **Create** `apps/customer-app/tests/features/home/HomeScreen.refresh.test.tsx`.

Constants (define at top of `HomeRefreshLoader.tsx`): `PULL_START_PX = 6` (overscroll px before the loader mounts on iOS), `PULL_REVEAL_PX = 64` (overscroll px for full opacity). Seam offset constant (in `HomeScreen.tsx`): `REFRESH_SEAM_OFFSET = WAVE_HEIGHT` (the loader overlay top = `headerHeight - REFRESH_SEAM_OFFSET`; a device-QA tuning knob).

Run all jest commands from `apps/customer-app/` (or the worktree app dir) per CLAUDE.md. Use `npx jest --forceExit <path>`.

---

## Task 1: HomeHeader reports its measured height

**Files:**
- Modify: `apps/customer-app/src/features/home/components/HomeHeader.tsx`
- Test: `apps/customer-app/tests/features/home/components/HomeHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `tests/features/home/components/HomeHeader.test.tsx` (reuse the file's existing render harness / mocks):

```tsx
it('reports its measured height via onHeightChange on layout', () => {
  const onHeightChange = jest.fn()
  const { getByTestId } = renderHomeHeader({ onHeightChange }) // existing helper; pass the prop through
  fireEvent(getByTestId('home-header'), 'layout', {
    nativeEvent: { layout: { height: 320, width: 390, x: 0, y: 0 } },
  })
  expect(onHeightChange).toHaveBeenCalledWith(320)
})
```

If the file has no `renderHomeHeader` helper, render `<HomeHeader ...minimalProps onHeightChange={onHeightChange} />` directly with the same props the existing tests use.

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx jest --forceExit tests/features/home/components/HomeHeader.test.tsx -t "onHeightChange"`
Expected: FAIL (prop not wired; `onHeightChange` not called).

- [ ] **Step 3: Implement**

In `HomeHeader.tsx`, add to `Props`:
```tsx
  // Reports the header's measured height to the parent (HomeScreen) so it can
  // position the wave-seam refresh loader. Fires on every layout change.
  onHeightChange?: (height: number) => void
```
Add `onHeightChange` to the destructured props, and update `handleLayout`:
```tsx
  const handleLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    setHeaderH(h)
    onHeightChange?.(h)
  }
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx jest --forceExit tests/features/home/components/HomeHeader.test.tsx`
Expected: PASS (all existing HomeHeader pins + the new one).

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/home/components/HomeHeader.tsx apps/customer-app/tests/features/home/components/HomeHeader.test.tsx
git commit -m "feat(home): HomeHeader reports measured height via onHeightChange (§HSH.1)"
```

---

## Task 2: HomeRefreshLoader — the branded wave-seam overlay

**Files:**
- Create: `apps/customer-app/src/features/home/components/HomeRefreshLoader.tsx`
- Test: `apps/customer-app/tests/features/home/components/HomeRefreshLoader.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/features/home/components/HomeRefreshLoader.test.tsx`:
```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { useSharedValue } from 'react-native-reanimated'
import { HomeRefreshLoader } from '@/features/home/components/HomeRefreshLoader'

// Drive useMotionScale per test (matches the project convention).
let mockMotionScale: 0 | 1 = 1
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => mockMotionScale }))

function Harness({ refreshing }: { refreshing: boolean }) {
  const scrollY = useSharedValue(0)
  return <HomeRefreshLoader scrollY={scrollY} refreshing={refreshing} seamY={300} />
}

beforeEach(() => { mockMotionScale = 1 })

describe('HomeRefreshLoader', () => {
  it('mounts the branded loader while refreshing', () => {
    const { getByTestId } = render(<Harness refreshing />)
    expect(getByTestId('home-refresh-loader')).toBeTruthy()
  })

  it('is absent when not refreshing and not pulling', () => {
    const { queryByTestId } = render(<Harness refreshing={false} />)
    expect(queryByTestId('home-refresh-loader')).toBeNull()
  })

  it('reduced motion: still mounts while refreshing (static loader)', () => {
    mockMotionScale = 0
    const { getByTestId } = render(<Harness refreshing />)
    expect(getByTestId('home-refresh-loader')).toBeTruthy()
  })

  it('seam-height guard: absent even while refreshing until seamY is measured (> 0)', () => {
    function Unmeasured() {
      const scrollY = useSharedValue(0)
      return <HomeRefreshLoader scrollY={scrollY} refreshing seamY={0} />
    }
    const { queryByTestId } = render(<Unmeasured />)
    expect(queryByTestId('home-refresh-loader')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx jest --forceExit tests/features/home/components/HomeRefreshLoader.test.tsx`
Expected: FAIL ("Cannot find module ... HomeRefreshLoader").

- [ ] **Step 3: Implement**

`apps/customer-app/src/features/home/components/HomeRefreshLoader.tsx`:
```tsx
import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { useMotionScale } from '@/design-system/useMotionScale'

// Overscroll px before the loader mounts on iOS (scrollY goes negative on pull).
const PULL_START_PX = 6
// Overscroll px at which the loader reaches full opacity/scale.
const PULL_REVEAL_PX = 64

type Props = {
  /** UI-thread scroll offset (negative on iOS overscroll; ~0 on Android). */
  scrollY: SharedValue<number>
  /** True while the refetch is in flight (native RefreshControl owns the trigger). */
  refreshing: boolean
  /** Absolute screen Y of the wave seam (HomeScreen passes headerHeight - WAVE_HEIGHT).
   *  0 until the header is measured — the component renders NOTHING until seamY > 0
   *  (seam-height guard, prevents a first-frame flash at top:0 if a refresh fires
   *  before layout). */
  seamY: number
}

/**
 * Branded wave-seam refresh loader (§HSH.1). An absolute overlay owned by
 * HomeScreen (sibling of the ScrollView, like HomeCollapsedHeader). The header +
 * wave stay anchored on pull (HomeScreen's expandedHeaderStyle); this reveals the
 * Redeemo R in the gap that opens below the wave.
 *
 * iOS (motion on): mounts as soon as the user pulls past PULL_START_PX and the
 *   opacity/scale track the pull depth, then hold at full while `refreshing`.
 * Android (scrollY stays >= 0) + reduced motion: simple show/hide tied to
 *   `refreshing` only — RedeemoLoader is already static under reduced motion.
 *
 * pointerEvents="none" so it never blocks touches.
 */
export function HomeRefreshLoader({ scrollY, refreshing, seamY }: Props) {
  const reduce = useMotionScale() === 0
  const [pulling, setPulling] = useState(false)

  // Flip a JS `pulling` flag when the user overscrolls past the start threshold.
  // On Android scrollY never goes below 0, so this stays false there by nature.
  useAnimatedReaction(
    () => scrollY.value < -PULL_START_PX,
    (active, prev) => {
      if (active !== prev) runOnJS(setPulling)(active)
    },
  )

  const animatedStyle = useAnimatedStyle(() => {
    if (reduce) return { opacity: refreshing ? 1 : 0 }
    const p = Math.min(Math.max(-scrollY.value / PULL_REVEAL_PX, 0), 1)
    const o = refreshing ? 1 : p
    return { opacity: o, transform: [{ scale: 0.8 + 0.2 * o }] }
  })

  // Seam-height guard (`seamY > 0`): never render at top:0 before HomeHeader has
  // been measured — prevents a first-frame flash at the top of the screen if a
  // refresh fires before layout. Combined with: mount only when there's
  // something to show — during refetch, or (iOS, motion on) while actively
  // pulling. Reduced motion ignores the pull (show/hide only).
  const show = seamY > 0 && (refreshing || (pulling && !reduce))
  if (!show) return null

  return (
    <Animated.View
      testID="home-refresh-loader"
      pointerEvents="none"
      style={[styles.overlay, { top: seamY }, animatedStyle]}
    >
      <RedeemoLoader size="md" accessibilityLabel="Refreshing" />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
})
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx jest --forceExit tests/features/home/components/HomeRefreshLoader.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/home/components/HomeRefreshLoader.tsx apps/customer-app/tests/features/home/components/HomeRefreshLoader.test.tsx
git commit -m "feat(home): HomeRefreshLoader branded wave-seam loader (§HSH.1)"
```

---

## Task 3: Wire HomeScreen — RefreshControl props, remove refreshBrand, mount seam overlay

**Files:**
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx`
- Test: `apps/customer-app/tests/features/home/HomeScreen.refresh.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/home/HomeScreen.refresh.test.tsx`. **Reuse the HomeScreen mock harness** from `tests/features/home/HomeScreen.renderOrder.test.tsx` (copy its `jest.mock` block for `@/hooks/useHomeFeed`, `@/hooks/useMe`, `@/hooks/useCategories`, `@/hooks/useLocation`, `expo-router`, `react-native-safe-area-context`, `@tanstack/react-query`, `@/design-system/haptics`, etc.). Have `useHomeFeed` expose a `refetch` mock. Then:

```tsx
import { RefreshControl } from 'react-native'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
// ...mocks copied from HomeScreen.renderOrder.test.tsx, with:
//   const mockRefetch = jest.fn().mockResolvedValue(undefined)
//   useHomeFeed: () => ({ data: FEED, isLoading: false, refetch: mockRefetch })
//   const mockMediumHaptic = jest.fn(); haptics: { touch: { medium: () => mockMediumHaptic() } }
//   IMPORTANT: do NOT mock out RedeemoLoader in this test — the duplicate-loader
//   assertion counts RedeemoLoader instances via UNSAFE_getAllByType.

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { HomeScreen } from '@/features/home/screens/HomeScreen'

// onLayout does NOT fire in jest — fire it manually so HomeScreen measures
// headerHeight → seamY > 0 (the seam loader is guarded off until measured).
function measureHeader(getByTestId: (id: string) => unknown) {
  fireEvent(getByTestId('home-header') as never, 'layout', {
    nativeEvent: { layout: { height: 320, width: 390, x: 0, y: 0 } },
  })
}

beforeEach(() => {
  mockRefetch.mockReset().mockResolvedValue(undefined)
  mockMediumHaptic.mockReset()
})

describe('HomeScreen — §HSH.1 refresh', () => {
  it('RefreshControl: iOS spinner hidden (transparent); Android branded (colors + warm progress bg)', () => {
    const { UNSAFE_getByType } = render(<HomeScreen />)
    const rc = UNSAFE_getByType(RefreshControl)
    expect(rc.props.tintColor).toBe('transparent')
    expect(rc.props.colors).toEqual([expect.any(String)])          // [color.brandRose]
    expect(typeof rc.props.progressBackgroundColor).toBe('string') // warm surface (color.surface.body)
    expect(typeof rc.props.onRefresh).toBe('function')
  })

  // AMENDMENT 1 — prove the refreshing state actually ENTERS and EXITS via the
  // observable seam loader, NOT by reading `refreshing` off a STALE RefreshControl
  // element captured before the state changed (that would falsely pass).
  it('refresh ENTERS and EXITS: seam loader appears while refetch is pending, disappears after it resolves (+ haptic + refetch)', async () => {
    let resolveRefetch!: () => void
    mockRefetch.mockImplementationOnce(() => new Promise<void>((r) => { resolveRefetch = () => r() }))

    const { UNSAFE_getByType, getByTestId, queryByTestId } = render(<HomeScreen />)
    measureHeader(getByTestId)                               // seamY > 0 so the loader may mount
    expect(queryByTestId('home-refresh-loader')).toBeNull()  // not refreshing yet

    UNSAFE_getByType(RefreshControl).props.onRefresh()        // do NOT await — keep refetch pending
    expect(mockMediumHaptic).toHaveBeenCalledTimes(1)         // haptic fires synchronously, before the await
    expect(mockRefetch).toHaveBeenCalledTimes(1)

    // ENTER: loader visible while the refetch promise is pending.
    await waitFor(() => expect(getByTestId('home-refresh-loader')).toBeTruthy())

    // EXIT: resolve the refetch → refreshing clears → loader gone.
    resolveRefetch()
    await waitFor(() => expect(queryByTestId('home-refresh-loader')).toBeNull())
  })

  // AMENDMENT 4 — no fake historical testID. Assert exactly ONE RedeemoLoader
  // (the seam overlay) while refreshing; the removed above-header refreshBrand
  // loader being gone is what makes the count 1, not 2.
  it('no duplicate indicator: exactly ONE RedeemoLoader (the seam) while refreshing', async () => {
    let resolveRefetch!: () => void
    mockRefetch.mockImplementationOnce(() => new Promise<void>((r) => { resolveRefetch = () => r() }))

    const { UNSAFE_getByType, UNSAFE_getAllByType, getByTestId } = render(<HomeScreen />)
    measureHeader(getByTestId)
    UNSAFE_getByType(RefreshControl).props.onRefresh()

    await waitFor(() => expect(getByTestId('home-refresh-loader')).toBeTruthy())
    expect(UNSAFE_getAllByType(RedeemoLoader)).toHaveLength(1) // seam loader only; no above-header one

    resolveRefetch()
  })
})
```

Notes for the implementer: (a) the ENTER/EXIT test is the source of truth that `refreshing` cycles — do NOT re-add a `rc.props.refreshing` assertion on a captured element (stale props). If you prefer a direct RC assertion, re-query `UNSAFE_getByType(RefreshControl)` AFTER each state change and read the fresh element. (b) Keep RedeemoLoader unmocked here so the duplicate-count assertion is meaningful.

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx jest --forceExit tests/features/home/HomeScreen.refresh.test.tsx`
Expected: FAIL (tintColor is currently `color.brandRose`, no `colors`, seam loader not mounted).

- [ ] **Step 3: Implement**

In `HomeScreen.tsx`:

(a) Add imports:
```tsx
import { HomeRefreshLoader } from '../components/HomeRefreshLoader'
import { WAVE_HEIGHT } from '../components/HomeHeaderWave'
```

(b) Add state + seam Y near the other hooks:
```tsx
  const [headerHeight, setHeaderHeight] = useState(0)
  // Wave-seam Y for the branded refresh loader. The expanded header sits at the
  // top of the screen when scrollY <= 0 (the only time refresh shows), so its
  // on-screen bottom ≈ headerHeight; subtract the wave band to land in the seam.
  const REFRESH_SEAM_OFFSET = WAVE_HEIGHT
  const seamY = Math.max(0, headerHeight - REFRESH_SEAM_OFFSET)
```

(c) Swap the RefreshControl props:
```tsx
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            // iOS reads tintColor (transparent → native spinner hidden; the
            // branded HomeRefreshLoader is the indicator). Android ignores
            // tintColor and reads colors + progressBackgroundColor → a branded
            // Material circle: brand-rose arc on a WARM light surface (not the
            // default white), so it reads intentional alongside the seam R loader.
            tintColor="transparent"
            colors={[color.brandRose]}
            progressBackgroundColor={color.surface.body}
          />
        }
```

(d) **Remove** the old above-header loader block (the `{refreshing ? (<View style={styles.refreshBrand}>...</View>) : null}`) and the `refreshBrand` style entry.

(e) Pass `onHeightChange` to `HomeHeader`:
```tsx
          <HomeHeader
            firstName={me?.firstName ?? null}
            ...
            scrollY={scrollY}
            onHeightChange={setHeaderHeight}
          />
```

(f) Mount the overlay as a sibling of the ScrollView (place it AFTER `</Animated.ScrollView>` and BEFORE `<HomeCollapsedHeader>` so the collapsed bar stays on top):
```tsx
      </Animated.ScrollView>

      {/* §HSH.1 — branded wave-seam refresh loader. Absolute overlay; reveals
          the Redeemo R in the gap that opens below the wave on pull (iOS) and
          holds during refetch. Show/hide only on Android + reduced motion. */}
      <HomeRefreshLoader scrollY={scrollY} refreshing={refreshing} seamY={seamY} />

      <HomeCollapsedHeader ... />
```

Do NOT modify `onRefresh`, `expandedHeaderStyle`, or any feed section.

- [ ] **Step 4: Run it — expect PASS**

Run: `npx jest --forceExit tests/features/home/HomeScreen.refresh.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/home/screens/HomeScreen.tsx apps/customer-app/tests/features/home/HomeScreen.refresh.test.tsx
git commit -m "feat(home): wire wave-seam refresh loader + hide iOS native spinner (§HSH.1)"
```

---

## Task 4: Regression + reduced-motion sweep (no new code)

**Files:** none changed — verification only.

- [ ] **Step 1: Existing Home render-order / collapse tests still pass** (the overlay is a new sibling and must not shift the feed or break the collapse gate).

Run: `npx jest --forceExit tests/features/home tests/features/navigation tests/app`
Expected: all PASS (including `HomeScreen.renderOrder`, `HomeScreen.scrollReset`, `HomeScreen.focusRefetch`, `app-layout-tabs`).

- [ ] **Step 2: tsc**

Run (from `apps/customer-app/`): `npx tsc --noEmit`
Expected: clean (0 errors).

- [ ] **Step 3: Lint the touched files**

Run: `npx eslint "src/features/home/components/HomeHeader.tsx" "src/features/home/components/HomeRefreshLoader.tsx" "src/features/home/screens/HomeScreen.tsx" "tests/features/home/components/HomeRefreshLoader.test.tsx" "tests/features/home/HomeScreen.refresh.test.tsx"`
Expected: 0 new errors. Note: `HomeScreen.tsx` has pre-existing baseline `no-raw-tokens` violations at unrelated lines (documented in the 2026-06-06 audit) — confirm any reported errors are NOT on lines this plan touched.

- [ ] **Step 4: Broader sweep (feasibility-gated)**

Run: `npx jest --forceExit` (full customer-app). Expected: green apart from the known flaky merchant suite (`voucher-press-branch-race` / `reviews-tab-auto-open`) which passes in isolation. Confirm no NEW failures.

---

## Device-QA checklist

**iOS (primary):**
- Pull down on Home → header + wave stay anchored; body content pulls away below the wave; the Redeemo R **reveals progressively in the gap at the seam** as you pull; on release it holds and spins during refetch; fades/unmounts on completion.
- **No native iOS spinner** visible at any point.
- Calm feel: no bounce, no overshoot; the reveal tracks the finger.
- Release BEFORE the trigger threshold (pull-cancel): loader reveals then retracts cleanly, no refetch, no stuck loader.
- Seam placement across SE / 13 / 15 Pro Max (notch + non-notch): loader stays centred at the wave seam as header height varies (verifies the `onHeightChange` → `seamY` path).
- Trigger a refresh immediately on app open / before any scroll: NO loader flash at the very top of the screen before the header measures (seam-height guard, `seamY > 0`).

**Android:**
- Pull down → branded red Material circle (native RefreshControl); the Redeemo R appears at the seam during `refreshing`; no jarring double-indicator; content behaviour acceptable.
- The native Material circle uses the WARM surface background (`progressBackgroundColor`), reading as branded chrome rather than default white.
- Confirm the pull-reveal correctly no-ops (Android `scrollY` stays ≥ 0) and only the show/hide path runs.

**Reduced motion (iOS + Android):**
- Enable OS Reduce Motion → the R loader is static (no orbit); the reveal is a plain show/hide tied to `refreshing` (no scale/opacity-track flourish); refetch still works.
- (Note the §RM detection caveat: confirm on a real build, not Expo Go/sim.)

**Behaviour / data:**
- Data actually refreshes; the Explore-capsule intro demo replays after refresh (`demoToken`); haptic fires on trigger and respects the haptics-enabled setting; `refreshing` always clears (including when `refetch` rejects — verify the error path doesn't strand the loader).
- Collapse interplay: refresh only at the top (expanded header); no conflict with collapse-on-scroll; fast repeated pulls leave no stuck state.

---

## Out of scope / deferred (record, do not build here)

- **Full Android pull-parity** (custom `PanGestureHandler` pull so Android gets the same finger-tracked wave-break as iOS). Deferred per decision 1A. If picked up later, file it under §HSH follow-ups.
- **Exit-fade polish** when the loader unmounts (currently instant on `show` → false). Optional device-QA follow-up if the unmount reads abrupt.
- No changes to `RedeemoLoader` itself, the header anchor, or any feed section.

---

## Self-Review (completed by plan author)

- **Spec coverage:** decision 1A (Tasks 3 RefreshControl props + Task 2 Android show/hide path), 2A (Task 2 pull-reveal worklet + reduce/Android fallback), 3A (Task 1 `onHeightChange` + Task 3 `seamY`). Preserve-onRefresh (Task 3 explicitly leaves `onRefresh` untouched + Task 3 test pins haptic/refetch/clear/demoToken). Remove-refreshBrand (Task 3 step (d) + test). Hide-iOS-spinner/keep-Android (Task 3 (c) + test). Tests required (Tasks 1-4 cover RefreshControl props, seam loader mount/absence, header height callback, refresh data behaviour, reduce-motion, render-order/collapse regression). Device-QA + iOS/Android/reduce-motion checklist included.
- **Placeholder scan:** no TBDs; all steps show concrete code/commands. The duplicate-loader check uses a real `UNSAFE_getAllByType(RedeemoLoader)` count (no fake testID).
- **Type consistency:** `onHeightChange: (h: number) => void` matches `setHeaderHeight` (`Dispatch<SetStateAction<number>>` accepts a number); `seamY: number`, `scrollY: SharedValue<number>`, `refreshing: boolean` consistent across `HomeRefreshLoader` props and the `HomeScreen` call site; `WAVE_HEIGHT` imported from `HomeHeaderWave`; `color.surface.body` used for `progressBackgroundColor`.
- **Owner amendments (2026-06-06):** all four incorporated and cross-checked against the Task 2/3 code + tests — (1) refresh test proves enter+exit via the seam loader (no stale-RC assertion); (2) `seamY > 0` guard in `HomeRefreshLoader`; (3) Android `progressBackgroundColor`; (4) duplicate check via real instance count. The refresh test fires the `home-header` layout event so `seamY > 0` (onLayout doesn't fire in jest).
