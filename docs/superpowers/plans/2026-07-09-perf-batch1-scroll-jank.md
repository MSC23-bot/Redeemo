# Perf Batch 1: scroll-jank cheap fixes (Home / Merchant Profile / Voucher Detail)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remove the three code-verified scroll-jank contributors that are cheap and behaviour-preserving: mid-scroll full-tree re-renders on threshold flips, un-gated carousel auto-advance timers, and always-on animation loops during scroll on Merchant Profile / Voucher Detail. NO virtualization work (explicitly deferred by owner). NO visual changes.

**Architecture:** Memoize the heavy card/section components with stable callback props so the `headerCollapsed` / `tabPinned` / `collapsedActive` boolean flips re-render only the header chrome, not the feed. Gate the two Home carousel `setInterval`s on focus + pause during scroll. Reuse the existing `useScrollActivity` + `scrollActivity` mechanism (built for Home) on Merchant Profile and Voucher Detail so `PulsingDot` / pill `PulseDot` loops freeze while scrolling, exactly as they already do on Home.

**Diagnosis evidence (2026-07-09, owner-accepted):** memory `project_scroll_perf_and_map_followups.md` §2026-07-09; key sites listed per task below.

**Tech stack:** React Native (Expo SDK 54), reanimated, jest (Node 20.19.4 via `fnm use`; `npx jest --forceExit`).

**Branch:** `feat/perf-batch1-scroll-jank` off `main`. Commit per task. These are LOCKED, test-pinned surfaces: run each surface's full test subset after touching it; a pinned-test failure means STOP and reassess, never delete a pin.

---

### Task 1: Memoize Home rail/card components + stabilise HomeScreen callbacks

**Files:**
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx`
- Modify (wrap export in `React.memo`): `apps/customer-app/src/features/home/components/{NearbyCard,PopularCard,FeaturedHeroCard,NearbyByCategory,FeaturedCarousel,TrendingSection,PopularSection,CampaignCarousel,HomeCategoryGrid}.tsx`
- Tests: `apps/customer-app/tests/features/home/` (existing suites must stay green)

- [ ] **Step 1:** Wrap each listed component's export in `React.memo` (keep the named function for display names: `export const NearbyCard = React.memo(function NearbyCard(...) {...})` pattern, adapted per file). Do NOT change props shapes.
- [ ] **Step 2:** In HomeScreen, convert every inline-arrow prop feeding those components to `useCallback` with correct deps: `onCampaignPress`, the three `onBranchPress` wrappers (via a stable `routeToBranch` `useCallback` + per-rail `useCallback`s reading `feed` from a ref or depending on the specific rail array), `onCategoryPress` handlers, `onNearbyBranchPress` (already partially stable). Verify with `react-devtools`-free reasoning: after this, a `headerCollapsed` flip must not re-render `NearbyByCategory` (its props are all referentially stable across that flip).
- [ ] **Step 3:** Add a regression test in `tests/features/home/` following the house pattern: render HomeScreen with a populated feed fixture, count renders of a probe card (e.g. via a jest.fn wrapped in the card's render or a testID-render counter using the existing test utilities), trigger the collapse-threshold state flip (fire the exported reaction or scroll mock the suites already use), assert the card did not re-render. If the existing test harness can't observe the reaction, test at component level: re-render `<NearbyByCategory>` twice with identical props and assert one render of a child (memo effectiveness test).
- [ ] **Step 4:** Run the home subsets: `cd apps/customer-app && fnm use && npx jest tests/features/home --forceExit`. All green.
- [ ] **Step 5:** Commit.

### Task 2: Focus-gate + scroll-pause the Home carousel auto-advance timers

**Files:**
- Modify: `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx` (10s `setInterval`, ~lines 39-58)
- Modify: `apps/customer-app/src/features/home/components/CampaignCarousel.tsx` (12s `setInterval`, ~lines 66-85)
- Tests: existing carousel suites + new cases

- [ ] **Step 1:** In both carousels: gate the interval on focus with `useFocusEffect` (expo-router) so it starts on focus and fully clears on blur (today it only clears on unmount, and expo-router Tabs keep screens mounted: the timers run forever in the background).
- [ ] **Step 2:** Pause auto-advance during vertical feed scroll: read the module-level `scrollActivity` shared value (`src/design-system/motion/scrollActivity`) inside the tick: if `scrollActivity.value === 1`, skip this tick (do not advance mid-fling). Reading `.value` from JS inside an interval callback is fine (no per-frame work).
- [ ] **Step 3:** Add tests: (a) blur clears the interval (advance no longer fires after blur; use jest fake timers + the navigation-mock pattern the home suites already use); (b) a tick during `scrollActivity.value = 1` does not call `scrollTo`.
- [ ] **Step 4:** Run the home subset. Green.
- [ ] **Step 5:** Commit.

### Task 3: Wire scrollActivity into Merchant Profile + Voucher Detail; make the pill PulseDot scroll-aware

**Files:**
- Modify: `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` (Animated.ScrollView at ~line 891: add the four `useScrollActivity` handlers, composing with the existing `onScroll` worklet: the worklet stays; the JS begin/end props are separate)
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx` (AnimatedScrollView at ~line 1526: same wiring)
- Modify: `apps/customer-app/src/features/merchant/components/VoucherCardStatePill.tsx` (`PulseDot`, ~lines 336-364: replace the `useEffect`-driven `withRepeat` with the `useAnimatedReaction`-on-`scrollActivity` pattern used by `src/design-system/motion/PulsingDot.tsx`, preserving the reduced-motion behaviour and the same amplitudes/durations)
- Note: `useScrollActivity` lives at `apps/customer-app/src/features/home/hooks/useScrollActivity.ts`; MOVE it to `src/design-system/motion/useScrollActivity.ts` (it is no longer Home-specific) and update the Home import; keep a re-export if any test imports the old path.
- Tests: merchant + voucher subsets; add a test that `VoucherCardStatePill`'s dot freezes when `scrollActivity.value = 1` (mirror the PulsingDot test if one exists; otherwise pin via the reaction's presence like other motion tests do)

- [ ] **Step 1:** Move + rewire `useScrollActivity`; run home subset to confirm no breakage.
- [ ] **Step 2:** Spread the handlers onto the two screens' scroll views (`onScrollBeginDrag` composes with any existing JS handler; check each screen for existing begin/end props first and compose rather than replace).
- [ ] **Step 3:** Convert `PulseDot` to the scrollActivity-reactive pattern.
- [ ] **Step 4:** Run merchant + voucher + home subsets: `npx jest tests/features/merchant tests/features/voucher tests/features/home --forceExit`. All green (these are heavily pinned surfaces; investigate ANY failure, never delete a pin).
- [ ] **Step 5:** Commit.

### Task 4: Full verification + push

- [ ] Full app suite: `cd apps/customer-app && fnm use && npx jest --forceExit` (expect parallel-load flakes in unrelated suites: re-run failures in isolation before judging).
- [ ] `npx tsc --noEmit` in `apps/customer-app` is NOT part of this repo's lanes (known baseUrl config error on main): skip; rely on jest + the app's babel/metro pipeline.
- [ ] Push `feat/perf-batch1-scroll-jank`. Do NOT create a PR, do NOT merge.

## Explicitly out of scope (owner-deferred)
Virtualization of the Home feed (FlashList), image right-sizing, `removeClippedSubviews`, client chattiness reduction (invalidation fan-outs), any visual change.
