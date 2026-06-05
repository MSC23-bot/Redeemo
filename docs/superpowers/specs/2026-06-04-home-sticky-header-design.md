# Home Sticky / Collapsing Header — Design Spec (PR A)

- **Date:** 2026-06-04
- **Status:** Draft — brainstorm-locked; pending Tier 2 plan + owner approval
- **Tier:** 2 (frontend-only, single surface)
- **Surface:** Customer App — Home (`apps/customer-app/src/features/home/`)
- **Predecessor:** Home Visual System Redesign (PR #140, merge `18d3fb1`, 2026-06-03)
- **Follow-on:** PR B — Search filter/sort/recent/trending (deferred, brainstorm-first)

---

## 1. Problem & goal

Today `HomeHeader` is the first scrolling child of Home's `ScrollView` and scrolls away
entirely ([HomeScreen.tsx:293-301](../../../apps/customer-app/src/features/home/screens/HomeScreen.tsx#L293-L301)).
Search is a 36pt icon in the top-right that disappears with it; once the user is in the
rails there is no persistent search affordance and no persistent location/identity, so they
must scroll back to the top to search.

**Goal:** a **sticky, collapsing** Home header. At the top it presents an expanded header with
a prominent full-width search bar; as the user scrolls it morphs into a compact bar pinned to
the top (location + search icon + avatar), keeping search and identity one tap away throughout
the feed.

Frontend-only. No backend, no API, no Search-behaviour change.

---

## 2. Scope

**In scope (PR A):**

- Expanded `HomeHeader` redesign to the **Option A** layout (adds a full-width tap-through search bar; the current top-right search *icon* is replaced by the bar).
- A new **pinned collapsed header** (location + search icon + avatar) mirroring the shipped `merchant/CollapsedHeader` interpolation pattern.
- Scroll-offset plumbing on Home's `ScrollView` to drive the collapse.
- Respect safe-area, Dynamic Type, reduced motion, the absolute bottom tab bar, and the existing `scrollActivity` scroll-pause system.

**Out of scope (explicit):**

- No change to Search behaviour, ranking, query parsing, `useSearch`, `SearchScreen`, `SearchBar`, or `FilterSheet` (§7 guardrail).
- No filter / recent-search / trending wiring (PR B).
- No bottom-nav redesign (separate PR).
- No shared-element transition into `/search`; no modal; no inline Home search; no `/search` mount-animation change.
- No change to the rest of the Home feed (rails, banners, category grid, honesty hint).

---

## 3. Locked decisions

| # | Decision | Locked value |
|---|----------|--------------|
| 1 | Expanded layout | **Option A** — top row: greeting (Mustica `display.sm`, left) + avatar (36pt, right); location row below the greeting; full-width tap-through **search bar** at the bottom. |
| 2 | Collapsed layout | single pinned row — location (left) · search **icon** · avatar (right). |
| 3 | Collapse behaviour | **continuous morph** — opacity/translate interpolated frame-by-frame from scroll offset on the UI thread. Reduced motion → binary switch at the threshold. |
| 4 | Filter affordance | **none** in the Home header. Filtering lives in `/search` (PR B). |
| 5 | `/search` interaction | **plain tap-through** — expanded bar and collapsed icon both call the existing `onSearchPress` → `router.push('/search')`. No shared element, no modal, no inline, no mount-animation change. Returning from `/search` preserves Home's scroll (Home stays mounted) → header stays collapsed. |
| 6 | Search-untouched proof | §7. |

---

## 4. Expanded layout (scrollY = 0)

```
╭─────────────────────────────────────────────────╮
│                                                   │
│   Good evening, Shebin                    ( S )   │  greeting display.sm + avatar 36pt
│   📍 Huddersfield                                 │  location row / LocationStatusLabel
│                                                   │
│   ╭───────────────────────────────────────────╮  │
│   │ 🔍  Search merchants, vouchers…           │  │  full-width pill, TAP-THROUGH → /search
│   ╰───────────────────────────────────────────╯  │
│                                                   │
╰─────────────────────────────────────────────────╯
        ↓↓↓  Featured · Nearby · Categories scroll up  ↓↓↓
```

- **Top row:** greeting left, avatar right. Avatar logic unchanged — `avatarUrl` Image, else brand-rose→coral gradient initial.
- **Location row:** unchanged logic — `area/city` MapPin row when GPS-on; `LocationStatusLabel` strip otherwise; neither while loading (`HomeHeader.tsx:54-64`).
- **Search bar:** a **Home-owned presentational pill** (cream-rose, search glyph, placeholder "Search merchants, vouchers…"), `accessibilityRole="button"`, `accessibilityLabel="Search"`, calls `onSearchPress`. It visually echoes `features/search/SearchBar` but **does not import it** (guardrail §7).

---

## 5. Collapsed layout (pinned, after threshold)

```
╭─────────────────────────────────────────────────╮
│   📍 Huddersfield                    🔍    ( S ) │  location · search ICON · avatar (one row)
╰─────────────────────────────────────────────────╯
   ▔▔▔▔▔▔▔  hairline + soft shadow  ▔▔▔▔▔▔▔
        content scrolls UNDER the sticky bar ↑
```

- Absolutely-positioned **sibling of the `ScrollView`**, `top:0`, own warm opaque background + safe-area top spacer (`paddingTop: insets.top`, `height: insets.top + COMPACT_BAR_HEIGHT`), `zIndex` above feed content.
- **Left:** location line — same resolution as the expanded location row (extract a shared `HomeHeaderLocation` sub-component to avoid duplication).
- **Right:** search **icon** button (`onSearchPress`) + avatar button (`onAvatarPress`) — the same handlers as expanded.
- **Hairline** (`color.border.subtle`, 1px bottom) + **soft shadow** fade in with the collapse so the bar lifts off the content only once collapsed.

---

## 6. Collapse behaviour (Decision #3)

- `scrollY: SharedValue<number>` from `useScrollViewOffset(useAnimatedRef<Animated.ScrollView>())` — UI-thread offset, no JS-bridge per frame, **no new `onScroll` JS handler**, so the existing `scrollActivity` begin/end handlers are untouched.
- `fadeEndY` captured at runtime via `onLayout` on the expanded header (**not hardcoded**), mirroring `merchant/CollapsedHeader`. `FADE_WINDOW ≈ 60pt`. Collapsed-bar opacity interpolates `0 → 1` over `[fadeEndY − FADE_WINDOW, fadeEndY]`, `Extrapolation.CLAMP`.
- Hairline + shadow interpolate on the same range.
- **Invariant:** the collapse signal is scroll-offset-driven, **not** a `withRepeat` loop, so it is **not** gated by `scrollActivity`; it tracks the finger continuously while rail loops pause.
- **pointerEvents:** collapsed container is `box-none`, matching the shipped `merchant/CollapsedHeader` — the container passes taps through; only the search-icon and avatar children receive them. The collapsed avatar overlaps the expanded avatar (same `onAvatarPress`); the collapsed search icon's invisible footprint over the greeting at the top is the same minor tradeoff the merchant header already accepts. If device QA flags the phantom tap, an `isCollapsed` gate (`useAnimatedReaction` + `runOnJS` → `pointerEvents={isCollapsed ? 'box-none' : 'none'}`) is the follow-up.
- **Reduced motion** (`useMotionScale() === 0`): the worklet returns a binary `opacity` (`scrollY ≥ fadeEndY ? 1 : 0`) instead of the interpolated fade — the Option-B static switch, honouring locked Decision #3. (Per the `merchant/CollapsedHeader` rationale the gesture-driven fade is already RM-safe because it tracks direct input, not a triggered animation; the binary branch is for when `useMotionScale` detection is reliable — see §RM.) Hairline + shadow are static styles on the same opacity-animated container, so they fade in with the collapse in both paths.

---

## 7. Search-untouched guardrail (Decision #6)

1. **Diff-scope gate** — PR A's diff touches ONLY `apps/customer-app/src/features/home/**` (+ its tests). ZERO files under `features/search/`, `lib/api/`, `lib/search`, or backend.
2. **No protected imports** — no Home file imports `useSearch`, `SearchScreen`, `SearchBar`, `FilterSheet`, ranking, or query parsing.
3. **Navigation contract unchanged** — still `router.push('/search')`.
4. **Existing Search test suites run green, unmodified.**

---

## 8. Technical approach & risks

- **Pattern:** mirror `merchant/CollapsedHeader` (absolute pinned overlay + `scrollY` opacity interpolation + `onLayout` `fadeEndY` + safe-area spacer + `box-none`).
- **Scroll plumbing:** `useAnimatedRef` + `useScrollViewOffset`. **Risk:** the existing imperative `scrollViewRef.current?.scrollTo({y:0})` (the `scrollTop` focus effect, `HomeScreen.tsx:79`) must still work on the animated ref. Mitigation: verify; documented fallback = `Animated.ScrollView` + `useAnimatedScrollHandler({onScroll})` writing `scrollY.value`, keeping a normal ref for `scrollTo`. Either way the existing four begin/end `scrollActivity` handlers stay as plain pass-through props.
- **Reuse vs fork:** extract a shared `HomeHeaderLocation` presentational sub-component (the location row) used by both expanded and collapsed headers — no duplicated resolution logic.
- **Expanded header** gains `onLayout` to report its height → `fadeEndY`.
- **`Animated.ScrollView` conversion:** confirm `RefreshControl`, `contentContainerStyle`, and the four `scrollActivity` handlers all pass through unchanged.

---

## 9. Constraints checklist

- **Safe-area:** collapsed bar consumes `insets.top`; expanded header keeps its shipped top spacing.
- **Dynamic Type:** greeting / location / placeholder scale; collapsed bar height tolerant.
- **Reduced motion:** §6 fallback.
- **Tab bar:** bottom, unaffected.
- **scrollActivity:** header tracks scroll; rail loops still pause (§6 invariant).

---

## 10. Testing

- Expanded renders at top (greeting + location + full-width search bar + avatar).
- Collapsed bar hidden at top, visible after scroll (drive `scrollY` in test).
- Both affordances → `onSearchPress` → `router.push('/search')` (nav-contract pin).
- Reduced-motion path → binary switch.
- Guardrail assertions (§7): diff-scope + no-protected-imports check; existing Search suites unchanged + green.

---

## 11. Out-of-scope follow-ups

- Shared-element transition into `/search` (optional polish; logged this brainstorm).
- PR B: Search `FilterSheet` / sort, recent searches, trending polish, data-driven trending. Search matching / ranking / location semantics remain **protected behaviour** in PR B too.
