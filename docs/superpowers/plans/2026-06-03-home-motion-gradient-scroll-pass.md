# Home — Motion System + Brand-Gradient Iconography + Scroll Performance (As-Built)

**Date:** 2026-06-03
**Branch:** `feature/home-batch-1b-card-chip`
**Status:** LOCAL / UNCOMMITTED — no commit / push / PR yet (owner direction). Part of the §HC "Home visual system" workstream (see `project_deferred_followups_index.md` §HC + this doc are the canonical trackers for this pass).
**Tier:** 2 (multi-file customer-app UI/motion work on the Home surface). Owner-driven, iterated heavily on device. No backend / schema / API changes.
**Skills applied:** `impeccable`, `emil-design-eng`, `ui-ux-pro-max`, `interaction-design`.

---

## 0. Scope + intent

A multi-pass effort to make the Home screen feel **premium, branded, and "alive"** without sacrificing performance. Three threads:

1. **Visual polish** — Popular/Trending section band; brand-gradient iconography on every rail glyph; card-consistent gradient chips on the Explore capsule.
2. **Motion** — per-icon "logical" looping animations on the rail-header glyphs; a spinning brand-gradient star; the open/closed status dot pulses; a one-time intro demo on the Explore-all capsule.
3. **Performance** — a confirmed scroll micro-stutter, root-caused to the new continuous animations, fixed by pausing all loops while the feed is actively scrolling.

All copy stays within brand: Mustica Pro SemiBold (display only), Lato (body), navy `#010C35` secondary, brand-rose `#E20C04` + brand-coral `#E84A00` (the brand gradient) rare/load-bearing, warm cream body `#FFF9F5`.

---

## 1. SectionBand — Popular/Trending warm band

`apps/customer-app/src/features/home/components/SectionBand.tsx`

- `warm` variant (Popular/Trending) rebuilt from the **real brand colours** after several owner-rejected iterations (golden peach / coral-salmon / rose-red were all "not brand").
- Final: a **very light warm peach in the coral family** base via `expo-linear-gradient` (`WARM_TOP #FEF6F0` → `WARM_BOTTOM #FBE2D3`, renders immediately, no layout gate), plus an SVG **radiance glow from BOTH the top and bottom edges** (two `RadialGradient`s, coral `#E84A00` at 0.18 / 0.16 alpha fading to centre) for a soft, curved, raised "3D" feel. Border `rgba(232,74,0,0.16)`.
- `cream` variant retained (solid `#F6ECE0`) for forward-compat.
- Test updated (`SectionBand.test.tsx`): base renders immediately (`section-band-base`), glow renders after `onLayout` (`section-band-glow`).

---

## 2. Rail-header icon motion — `RailIconMotion`

**New:** `apps/customer-app/src/design-system/motion/RailIconMotion.tsx` (+ `tests/design-system/motion/RailIconMotion.test.tsx`).

- Each category rail-header glyph + the Featured star plays a **continuous, looping, logical "signature" motion** (owner direction: looping like the flame, not a one-shot). 13 kinds, each fit to the icon's meaning and distinct from the flame's flicker:
  - food = steam breath · beauty = bloom · fitness = heartbeat · medical = calm clinical pulse · outabout = compass wobble · shopping = bag pendulum · homeservices = settled breath · travel = float + bank · family = light bob · auto = gentle rev · pets = paw hop · **featured = a slow full rotation (spinning star)** · default = breath.
- One `phase` shared value oscillates (auto-reverse) or runs a full cycle (the spin, `reverse:false` + linear easing); per-kind character lives entirely in the interpolation table inside the worklet. Transform/opacity only (GPU-safe). `rest` phase (0 or 0.5) keeps reduce-motion / scroll-freeze landing on the natural pose.
- Wired in `RailHeader.tsx` (category glyph + Featured star), keeping the existing testIDs (`rail-category-mark`, `rail-featured-mark`, `rail-trending-mark`).

---

## 3. Brand-gradient iconography — `BrandGradientGlyph`

**New:** `apps/customer-app/src/design-system/components/BrandGradientGlyph.tsx`.

- Owner direction: every Home rail glyph should wear the **same brand red→orange gradient as the Explore-all round arrow button** (`color.brandGradient` `#E20C04`→`#E84A00`, diagonal `cx 70% cy 16% r 82%`-style).
- `BrandGradientPng({ source, width, height })` — paints a white-on-transparent **PNG glyph** with the gradient by using the glyph as an **SVG luminance mask** over a gradient rect (no `@react-native-masked-view` dependency). Used for the category rail glyphs.
- `BrandGradientVector({ path, size })` — a vector path filled with the gradient. Used for the **Featured star** (lucide star path) and the **flame**.
- Per-instance unique gradient ids (`useId()`, colons stripped — colons break SVG `url()` refs + clash across `<Svg>` roots on Android).
- `RailHeader.tsx`: category glyph → `BrandGradientPng`; Featured star → `BrandGradientVector`; flame → `TrendingFlame gradient={color.brandGradient}`.
- `TrendingFlame.tsx` gained an opt-in `gradient` prop (keeps its flicker animation, swaps the paint to a gradient-filled flame path; solid `color` stays the fallback).
- **Device-validated** by owner (gradient + spinning star "look fine on the device").

---

## 4. Open/Closed status motion — `LiveStatusDot`

**New:** `apps/customer-app/src/features/home/components/LiveStatusDot.tsx`.

- "Open" is a LIVE state → the green dot **gently pulses** (reuses `PulsingDot`, the same cue as the redemption LIVE badge, for cross-app consistency). "Closed" → a calm **static** grey dot.
- Tuned MUCH softer than the LIVE badge after owner feedback ("too intense"): `minScale 0.92` (barely shrinks), `minOpacity 0.6` (half-dim), `duration 1200` (slow ~2.4s breath).
- Wired into all three Home cards (`FeaturedHeroCard`, `PopularCard`, `NearbyCard`); the dead `dot` StyleSheet entries removed from each.
- `PulsingDot.tsx` gained optional intensity props (`minScale` / `minOpacity` / `duration`), **defaults preserve the existing LIVE-badge behaviour** everywhere else.

---

## 5. Explore-all capsule — intro demo + gradient chips + copy

`apps/customer-app/src/features/home/components/HomeCategoryGrid.tsx`

- **Tappability affordance → one-time intro demo (owner direction).** On first load — and again on every pull-to-refresh — the overlapping chips **auto-open in sequence** (travel → family → auto → pets → medical), each held ~1s, then settle to a static resting state. Tapping/scrolling cancels it; reduce-motion skips it.
  - Driven by a `demoToken` prop bumped by `HomeScreen` once after the first load completes (`!isLoading`) and again after each pull-to-refresh (in `onRefresh`). The capsule's `useEffect` keys on `demoToken` (replays per token). Earlier a fixed mount timer was used but it raced the loading skeleton, so it was retied to the load signal.
  - A short-lived breathing/"fan" affordance + a `useLoopProgress` hook were built and then **removed** when the owner chose the intro-demo approach instead.
- **Copy on expansion:** while a chip is open the full "Explore all categories / Browse merchants by category" cross-fades to a compact two-line **"Explore all / categories"** (no shrinking), centred vertically and **pushed toward the red CTA** (owner direction).
- **Gradient chips (owner direction):** the 5 extra-category chips were flat fills; now each renders the **same card-style radial gradient** as the six Home category cards (`ChipGradient`, same `cx 70% cy 16% r 82%` recipe), sized to the expanded pill + clipped, so the white icon sits on the deeper area like the cards. Each extra category keeps its hue via an approximate `light`/`deep` pair (travel/family/auto/pets/medical) — APPROXIMATE pending a confirmed allocation.

---

## 6. Branded refresh loader

`apps/customer-app/src/features/home/screens/HomeScreen.tsx` — the pull-to-refresh `RedeemoLoader` bumped `size="sm"` (32) → `size="md"` (48) (owner: "a bit small").

---

## 7. Scroll performance — pause-during-scroll (the headline fix)

Owner reported a **subtle but real micro-stutter** during scroll. Investigation:

- The Home feed is a plain **non-virtualised `ScrollView`** with **no per-frame `onScroll`** (JS thread clean) and no clipping — so the whole feed stays mounted and every continuous animation (≈20-30: the open-dot pulse on every open card across every rail, the rail-icon loops, the spinning star, the flame) runs on the UI thread at once, competing with the scroll for frames.
- **Confirmed cause** by forcing all motion off (`useMotionScale → 0` diagnostic): scroll became perfectly smooth → it is the animations.

**Fix — pause every loop while the feed is actively scrolling, resume when it stops:**

- **New** `apps/customer-app/src/design-system/motion/scrollActivity.ts` — a global `makeMutable(0)` UI-thread flag (1 = scrolling).
- `PulsingDot`, `TrendingFlame`, `RailIconMotion` converted from a `useEffect` that starts the loop once, to a **`useAnimatedReaction`** that watches `scrollActivity` (and `motion`): scrolling → `cancelAnimation` + freeze; stopped + motion-on → restart from rest. UI thread, **zero re-renders**.
- `HomeScreen` scroll handlers set the flag: `onScrollBeginDrag` → 1, with momentum-aware resume (`onMomentumScrollBegin` flag + `onScrollEndDrag` 80ms fallback timer + `onMomentumScrollEnd`) → 0.
- **Resume bug fixed:** the flame + open-dot looked dead after scrolling because they restarted `withRepeat` from the frozen mid-pulse value (range collapsed to ~0 when frozen near the extreme). Fix: **reset to the rest pose first, then loop** (matching `RailIconMotion`). Device-confirmed working + alive-through-scroll.
- Also added `removeClippedSubviews` to the main feed `ScrollView` + the three multi-card rails (`PopularSection`, `TrendingSection`, `NearbyByCategory`) — reduces off-screen compositing (did not fix the stutter alone, but is a harmless win; kept).
- `tests/setup.ts` — added `makeMutable` to the inline reanimated jest mock (it was missing; module-level `scrollActivity` broke 16 suites until added).

---

## 8. Reduce-motion fixes + §RM follow-up

- **Bug fixed:** `PulsingDot` / `TrendingFlame` / `RailIconMotion` previously did `if (motion <= 0) return` with **no `cancelAnimation`**, so a loop started at mount (when `useMotionScale` optimistically returns 1 before the async check) ran forever — reduce-motion only ever worked if it was on at first mount, never when toggled. They now `cancelAnimation` + snap to rest (folded into the §7 `useAnimatedReaction` path). The cancellation/gating half is now correct.
- **Deferred (`§RM`):** on the owner's dev device, `AccessibilityInfo.isReduceMotionEnabled()` (via `useMotionScale`) returns **false even with iOS Reduce Motion ON**, so the app's motion never disables. Code looks correct → most likely environmental (simulator / Expo Go) vs a real RN/Expo-SDK-54 quirk; confirm on a real build with a one-off log. Filed in `project_deferred_followups_index.md` §RM + a code pointer in `useMotionScale.ts`.

---

## 9. Earlier visual polish (same session, pre-this-doc)

- **`NearbyCard`** rebuilt as a landscape, name-on-banner browse card (≈300×250: dark-gradient name lockup, straddling 44pt logo, `BannerTopRight` rating + heart, descriptor + open/closed on the right, locality-first location row, divider, stacked Mustica-green saving). Replaced a cluttered inline-logo version + a broken single-card "spotlight."
- **Card-size consistency** — Featured stays the hero; rail cards consistent.
- **Category rail icons** — a separate **trimmed** `assets/category-icons/rail/` set (padding removed) isolates RailHeader's tight glyphs from the **padded** `all/` set that `HomeCategoryGrid`'s capsule + `AllCategoriesScreen` still need (do NOT trim `all/`). Per-icon aspect ratios + optical `scale` nudges (food 1.18, beauty 1.08); `medical` matcher must precede `health`. Medical icon re-padded via `sharp().extend()` (NOT resize).
- **See-all chip** recoloured to brand coral.
- **`FeaturedHeroCard`** banner + badge/logo/name re-scaled (still the hero, just proportionate to the slightly larger campaign banner).
- **`CampaignCarousel`** tile `minHeight` 140 → 156.

---

## New components / files this pass

| File | Purpose |
|---|---|
| `src/design-system/motion/RailIconMotion.tsx` | Per-icon looping rail-glyph + spinning-star motion |
| `src/design-system/components/BrandGradientGlyph.tsx` | `BrandGradientPng` (SVG-mask) + `BrandGradientVector` (path fill) |
| `src/features/home/components/LiveStatusDot.tsx` | Open = pulse, Closed = static |
| `src/design-system/motion/scrollActivity.ts` | Global scroll-pause flag (`makeMutable`) |
| `tests/design-system/motion/RailIconMotion.test.tsx` | RailIconMotion contract |

Modified: `SectionBand`, `RailHeader`, `TrendingFlame`, `PulsingDot`, `useMotionScale`, `FeaturedHeroCard`, `PopularCard`, `NearbyCard`, `PopularSection`, `TrendingSection`, `NearbyByCategory`, `HomeCategoryGrid`, `HomeScreen`, `CampaignCarousel`, `tests/setup.ts` + the relevant test files.

---

## Locked behaviours / invariants

1. **Loops pause during scroll** via the global `scrollActivity` flag + per-component `useAnimatedReaction`; resume **from rest** (never from the frozen value, or the range collapses). UI-thread, no re-renders.
2. **`PulsingDot` intensity props default to the LIVE-badge values** — other consumers (ShowToStaff etc.) unchanged.
3. **Reduce-motion now cancels** loops (was a no-op `return`). Detection half is the open §RM item.
4. **Brand gradient on all rail glyphs** via SVG mask (PNG) / path fill (vector); the spinning star + gradient flame + category glyphs are one family.
5. **Do NOT trim `category-icons/all/`** — only the separate `rail/` set is trimmed.
6. **Intro demo fires off the load signal** (`demoToken`), not a blind mount timer; replays on pull-to-refresh; cancelled by tap/scroll; skipped under reduce-motion.

---

## Open follow-ups

- **§RM** — reduce-motion DETECTION not firing on the dev device (deferred-index §RM).
- **Collapsing sticky Home header** — designed this session (greeting+location+search-bar-with-filter that collapses to a sticky search bar on scroll), agreed to ship as a **separate PR** (it restructures the scroll path the perf fix just stabilised). Two product decisions still open: search behaviour (tap-through to the Search tab — recommended — vs inline) and collapsed-bar content (search+filter only — recommended — vs + avatar). Needs its own spec/plan when picked up.
- **Bottom navigation bar** redesign — its own subsequent PR.
- **Chip `light`/`deep` colours** — APPROXIMATE; lock against the cards when convenient.
- **Scroll-pause edge case** — navigating away mid-momentum can leave `scrollActivity` at 1 until the next scroll; a focus-reset would close it.

---

## Tests

Verified incrementally throughout: `tsc --noEmit` clean (customer-app); targeted jest suites green at each step (Home sweep 164-172, the design-system motion suites, `RailIconMotion`/`pulsing-dot`/`TrendingFlame`). Pre-existing baseline lint in `HomeScreen.tsx` / `AllCategoriesScreen.tsx` / `tests/setup.ts` (the `as any` routes + raw-padding) is unchanged — no NEW errors introduced. A **full customer-app sweep + the lint cleanup** should run at checkpoint time before the PR.

No separate design **spec** doc is needed for this pass (it is implementation polish on existing surfaces). The future **collapsing header** PR will warrant its own spec.
