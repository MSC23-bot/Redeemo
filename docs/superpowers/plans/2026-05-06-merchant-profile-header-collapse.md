# Merchant Profile — Header collapse, stretchy hero, safe-area discipline

> **Status: APPROVED — implementation begins on Milestone 1.** All decisions locked by owner 2026-05-06. Final lock: D2=A (back button included in collapsed header). Implementation pauses at the end of each milestone for owner on-device QA review.

**Tier:** 2 (multi-file UI work in one surface; needs a written plan first per CLAUDE.md standing rule).
**Tracks:** §N3 (Dynamic Island / safe-area / collapsed sticky header) + §N7 (header / top-section polish where it directly relates to the collapsed/sticky header system) — bundled per owner direction 2026-05-06.
**Scope boundary:** header / safe-area / overscroll / collapse behaviour only. Voucher card design, Reviews system, Bottom sheets, broader Merchant Profile redesign are EXPLICITLY out of scope.

**Workstream branch:** `feature/merchant-profile-header-collapse`. Plan-only baseline at `89bcf21`. Implementation commits will follow on this branch after sign-off.

---

## 1. Current scroll/header architecture

### 1.1 Component tree

```
SafeAreaProvider                                  (app/_layout.tsx — root)
  ↳ Tabs                                          (app/(app)/_layout.tsx — bottom tab bar; merchant route hides it)
    ↳ merchant/[id].tsx
      ↳ MerchantProfileScreen
          <View container bg #FFF9F5>             ← cream page background
            <Animated.View scrollWrap>            ← screen-wide pulse on branch switch
              <ScrollView stickyHeaderIndices={[3]}>
                [0] <SuspendedBranchBanner>       ← conditional (suspended branch)
                [1] <HeroSection height=224>      ← banner Image absoluteFillObject
                [2] <View identityZone>           ← MerchantHeadline + BranchContextBand + ActionRow
                [3] <TabBar>                      ← STICKY at index 3
                [4] <Animated.View content>       ← active tab body
              </ScrollView>
```

### 1.2 How the banner is laid out

[apps/customer-app/src/features/merchant/components/HeroSection.tsx](apps/customer-app/src/features/merchant/components/HeroSection.tsx):

```tsx
<View style={styles.hero}>                          // height: 224, position: 'relative', overflow: 'visible'
  <Image source={{ uri: bannerUrl }}                // absoluteFillObject — fills HeroSection bounds
         style={StyleSheet.absoluteFillObject}
         contentFit="cover" />
  <LinearGradient ... />                            // dark vignette overlay
  <View style={[styles.navRow, { top: insets.top + 8 }]}>
    {back / share / heart frostedBtn x3}            // currently the only nav affordance on this screen
  </View>
  {(isFeatured || isTrending) && <View style={styles.badgeRow} />}
</View>
```

The banner Image is bound to HeroSection's *own* bounds (224pt). It does **not** extend above the View. As soon as HeroSection translates downward (which is what bounce-scroll does), there is nothing visually present above its top edge — the parent's cream background shows through.

### 1.3 Where stickyHeaderIndices is applied

Single value: `stickyHeaderIndices={[3]}` on the outer ScrollView. Index 3 is the TabBar (after SuspendedBanner [0], HeroSection [1], identityZone [2]). When the user scrolls past the identity zone, the TabBar pins to the top of the ScrollView's viewport.

### 1.4 How safe-area is handled today

- Root `<SafeAreaProvider>` in `app/_layout.tsx`.
- `<StatusBar style="auto" />` at the root — no per-screen status bar override.
- `(app)/_layout.tsx` is `<Tabs headerShown={false}>` — no header chrome from the router.
- HeroSection reads `useSafeAreaInsets()` and offsets its nav row by `top: insets.top + 8` to clear the Dynamic Island / notch / status bar.
- `MerchantProfileScreen` does NOT add any top padding — it relies entirely on HeroSection consuming the inset internally.
- The bottom tab bar is hidden for `merchant/[id]` (`tabBarStyle: { display: 'none' }`), so the bottom of the viewport is fully owned by the screen.
- **Important navigation note:** because the bottom tab bar is hidden AND `merchant/[id]` is a Tabs route (not a stack push), iOS swipe-back gesture is NOT available. The hero's back button is the only on-screen way to exit the merchant profile on iOS. Android hardware back works. This drives the back-button decision in §3 D2 below.

### 1.5 Why blank overscroll appears above the banner

Mechanism (iOS):

1. ScrollView has `bounces={true}` by default on iOS.
2. Pull-down at scrollY=0 translates the ScrollView's content downward by the user's drag distance.
3. HeroSection (the first visible scroll child) translates with the content.
4. The banner Image inside HeroSection is `absoluteFillObject` — bound to HeroSection's bounds (top:0..bottom:224 within HeroSection). It moves as a unit with HeroSection.
5. The space ABOVE HeroSection's now-translated top edge — between scroll-viewport top and HeroSection's translated top — is a void.
6. That void exposes the parent View's `backgroundColor: '#FFF9F5'` (cream container).

Symptom: a cream/off-white blank above the banner that grows with pull distance. Visually reads as "broken" because the user expects the top edge to be filled — that's the ubiquitous iOS pattern.

Android does not bounce by default, so the symptom is iOS-only on this codebase.

### 1.6 Dynamic Island / notch state

Currently *correct* — the back/share/heart row uses `insets.top + 8`. Owner-verified on iPhone Pro devices during PR #35 QA. **This is not a regression to fix — it's a baseline to preserve.** The plan must not break it during the collapse refactor.

---

## 2. Proposed solution — Phase A + Phase B both required

### 2.1 Phasing — locked

Owner direction 2026-05-06: **both phases ship in this workstream as two clear milestones.** If Milestone 2 turns out to be bigger than expected, pause before expanding scope.

- **Milestone 1 (Phase A):** Stretchy hero. No blank overscroll.
- **Milestone 2 (Phase B):** Collapsed safe-area header + connected sticky tab bar.

Implementation rule: M1 must be on-device-verified by owner before M2 begins. M2 builds on M1's banner-as-layer architecture; M1 standing on its own is the natural pause point.

### 2.2 Phase A — Stretchy hero

**Pattern:** standard "stretchy header" used on Apple Music, Spotify, Twitter profile, TestFlight app pages. The banner is mounted as an *absolutely-positioned* layer outside the ScrollView's normal flow, with its `translateY` and `scaleY` driven by the ScrollView's `scrollY` shared value.

**Behaviour by scroll state:**

| `scrollY` | Banner transform | Visual |
|---|---|---|
| `< 0` (overscroll pull-down) | `translateY: scrollY` (moves down with finger) AND `scaleY: 1 + |scrollY|/HERO_HEIGHT` with `transform-origin: top` (expands downward) | Banner stretches to fill the exposed top — no cream void |
| `= 0` (rest) | `translateY: 0`, `scaleY: 1` | As today |
| `> 0` (normal scroll) | `translateY: -scrollY` (moves up with content) | Banner scrolls away as today |

Locked decisions:
- **Stretch curve = linear** (D3).
- **Reduced motion: stretch still works** — gesture-driven, not decorative (D4).
- **Banner sizing = 224pt + runtime scale** (D5).
- **No-banner gradient stretches identically** (D6).
- `scaleY` clamped to a maximum of `2.5` to bound extreme overscroll.

**Implementation outline:**

1. Banner moves out of HeroSection-as-scroll-child into a sibling absolute layer above the ScrollView:
   ```tsx
   <View style={styles.container}>
     <Animated.View style={[styles.bannerLayer, bannerAnimatedStyle]}>
       <Image source={bannerUrl} contentFit="cover" />
       <LinearGradient ... vignette />
       <View navRow style={[..., { top: insets.top + 8 }]}>...</View>   {/* expanded nav row */}
       {badges}
     </Animated.View>
     <Animated.View style={styles.scrollWrap}>
       <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16}
                            stickyHeaderIndices={[2]}>
         <SuspendedBranchBanner />
         <View style={{ height: HERO_HEIGHT }} />     {/* spacer matching banner */}
         <View identityZone>...</View>
         <TabBar />                                    {/* sticky index now 2, was 3 */}
         <Animated.View content>...</Animated.View>
       </Animated.ScrollView>
     </Animated.View>
     <CollapsedHeader scrollY={scrollY} ... />        {/* mounts on top in Milestone 2 */}
   </View>
   ```
2. `scrollY = useSharedValue(0)`; `useAnimatedScrollHandler({ onScroll })`.
3. `bannerAnimatedStyle` derived via `useAnimatedStyle`:
   ```ts
   const ty    = scrollY.value < 0 ? scrollY.value : -scrollY.value
   const scale = scrollY.value < 0
     ? Math.min(1 + (-scrollY.value)/HERO_HEIGHT, 2.5)
     : 1
   return { transform: [{ translateY: ty }, { scaleY: scale }] }
   ```
   Plus `transformOrigin: 'top'` (RN 0.74+ supports `transformOrigin` on Animated styles; if pinned to an older RN, use `translateY` math to compensate).
4. `bannerLayer` style: `position: 'absolute', top: 0, left: 0, right: 0, height: HERO_HEIGHT, zIndex: layer.base`.
5. Spacer in the ScrollView matches `HERO_HEIGHT` so identity zone starts at the same Y position as today.

**What stays the same in Phase A:**
- Identity zone position, gradient, content.
- Sticky TabBar behaviour (index updates from 3 → 2).
- All tab content.
- HeroSection's nav row safe-area handling.
- Screen-wide pulse on branch switch.

**Files touched (Phase A):**
- ✏️ `apps/customer-app/src/features/merchant/components/HeroSection.tsx` — refactor: extract banner into `<HeroBanner>` layer + `<HeroBannerSpacer>` placeholder; ~30 LOC change.
- ✏️ `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` — Animated.ScrollView, scroll handler, mount HeroBanner as sibling, replace inline HeroSection with HeroBannerSpacer, decrement stickyHeaderIndices to 2; ~20 LOC change.
- ✨ `apps/customer-app/tests/features/merchant/hero-overscroll.test.tsx` — new structural test.

### 2.3 Phase B — Collapsed sticky header (REQUIRED)

Locked content from owner 2026-05-06:
- ✅ Merchant logo
- ✅ Merchant name
- ✅ Branch / location name
- ❌ Website / Contact / Directions buttons
- ❌ Rating pill
- ❌ Full status row
- ❌ Full metadata / actions

These remain available in the expanded hero when the user scrolls back up.

#### 2.3.1 Visual states

The header has **three distinct states** keyed off `scrollY` and a measured `identityZoneEnd` value.

| State | Range | Banner | Identity zone | Collapsed header | TabBar |
|---|---|---|---|---|---|
| **Expanded** | `scrollY ≤ FADE_START` | Visible, full height, may be stretched on overscroll | Visible, in flow | Hidden (`opacity: 0`, `pointerEvents: 'none'`) | In flow (not yet sticky) |
| **Transitioning** | `FADE_START < scrollY < FADE_END` | Scrolling out of view (translateY: -scrollY) | Scrolling past, covered progressively by collapsed header | Fading in (opacity 0 → 1, linear interpolate over the range) | Approaches sticky position |
| **Collapsed / sticky** | `scrollY ≥ FADE_END` | Off-screen | Off-screen | Fully opaque, `pointerEvents: 'auto'` | Pinned to top of ScrollView, sits visually beneath collapsed header |

Where:
- `FADE_END = identityZoneEnd` — measured at runtime via `onLayout` on the identity zone wrapper. This is the scrollY at which the TabBar pins (because TabBar's natural Y position equals identityZoneEnd, and `stickyHeaderIndices` pins it once scrollY reaches that value).
- `FADE_START = FADE_END - 60` — a 60pt fade window. Tight enough to feel decisive, wide enough to feel smooth. Tunable on-device.
- `HERO_HEIGHT` is used for stretch math, not for the threshold (the threshold is the TabBar pin point).

The collapsed header overlays whatever is at the top of the ScrollView's viewport during the transitioning state — initially the identity zone is mid-scroll past, but the collapsed header's opaque background covers it. By the time the state is `collapsed`, the identity zone is fully off-screen and the TabBar is pinned right beneath the collapsed header. The seam is clean.

#### 2.3.2 Layout

Compact header is positioned `absolute; top: 0; left: 0; right: 0`. Its height is `insets.top + COMPACT_BAR_HEIGHT` where `COMPACT_BAR_HEIGHT = 52pt`. Total height varies per device (Dynamic Island devices: ~59 + 52 = 111pt; notch: ~47 + 52 = 99pt; SE: ~20 + 52 = 72pt).

**Internal layout — proposed (pending owner D2 confirmation):**

```
┌─────────────────────────────────────────────────────────────┐
│                  STATUS BAR / DYNAMIC ISLAND                 │   ← insets.top spacer (NOT decorated)
├─────────────────────────────────────────────────────────────┤
│  ┌──┐   ┌──┐  Merchant Name                                  │
│  │← │   │◯◯│  Branch · Location                              │   ← 52pt content row
│  └──┘   └──┘                                                 │
└─────────────────────────────────────────────────────────────┘
   12px   16px   merchant + branch text (flex: 1)
   pad    36pt   numberOfLines: 1 each, ellipsize tail
          logo
```

Sizes:
- Back button: 36pt × 36pt frosted circle (matches existing style language). Hit slop +6pt to reach 48pt effective.
- Logo: 36pt circle (smaller than expanded 72pt logo). Image rounded.
- Merchant name: 15pt 700 navy `#010C35`, `numberOfLines: 1`.
- Branch line: 13pt 500 grey `#4B5563`, `numberOfLines: 1`. Built from `branchShortName(sb.name)` (already in codebase, e.g. "Brightlingsea"). Format: `Branch · City` — using middle dot separator. If `sb.city` is null, falls back to just branch name.
- Right padding: 12pt + safe-area right inset (notch landscape consideration).

#### 2.3.3 Back button — proposed yes (open decision §3 D2)

**My recommendation: include a back button in the collapsed header.** Reasoning: this screen is a Tabs route, not a stack push, so iOS swipe-back is unavailable. The bottom tab bar is hidden for the merchant route. Without a back affordance in the collapsed state, an iOS user deep-scrolled into reviews has NO way to exit except scrolling all the way back up. That's a navigation dead-end.

If owner prefers no back button: alternative is to leave it out and rely on the hero back button. User must scroll up to exit. Workable on Android (hardware back), problematic on iOS.

Awaiting D2 confirmation.

#### 2.3.4 Dynamic Island / safe-area guarantees

- The collapsed header reads `useSafeAreaInsets()` and consumes `insets.top` as a top spacer that is part of its background but contains no interactive content.
- All interactive content (back button, logo, text) sits BELOW `insets.top`.
- On a Dynamic Island device (~59pt inset), the content row starts at Y=59 — clear of the island.
- On a notch device (~47pt inset), content starts at Y=47.
- On a non-notch device (~20pt status bar), content starts at Y=20.
- Status bar text colour will need to switch to dark when collapsed header is visible (cream background → dark text). Implementation: `<StatusBar style="dark" />` set via `expo-status-bar` when the screen is mounted; restored on unmount. (Phase A may also adjust this; tracked.)

#### 2.3.5 Tab bar visual connection

The current TabBar background is a vertical gradient `#FFF9F5 → #FBF1E6` ([TabBar.tsx](apps/customer-app/src/features/merchant/components/TabBar.tsx) Round 5 §16). To make the collapsed header feel attached to the TabBar:

- Collapsed header background = solid `#FFF9F5` (matches TabBar's gradient TOP stop).
- Result: collapsed header's bottom edge meets TabBar's top edge with **zero tonal step**.
- The TabBar's existing bottom shadow (Round 5: opacity 0.07, radius 10, offset 0/3) still anchors the entire stuck chrome unit (collapsed header + TabBar) against the body content below.
- TabBar's existing `borderTopWidth: 0` (implied — no top border declared) keeps the seam invisible.
- Collapsed header has its OWN bottom border `borderBottomWidth: 0` — relies entirely on the TabBar's top edge as the visual transition into the navigation row.

**Side note:** if this feels tonally flat on-device (cream-on-cream), a 1px separator line at the bottom of the collapsed header (`borderBottomColor: 'rgba(0,0,0,0.05)'`) is the easy adjustment — matches TabBar's own bottom border. Decide after seeing it on-device.

#### 2.3.6 stickyHeaderIndices change

```diff
- stickyHeaderIndices={[3]}   // TabBar at child index 3 (banner [1] is full HeroSection)
+ stickyHeaderIndices={[2]}   // TabBar at child index 2 (banner is now an external layer; spacer view doesn't exist as child since banner is absolute — wait, see below)
```

Index calculation after Phase A:
- [0] `<SuspendedBranchBanner>`
- [1] `<View style={{ height: HERO_HEIGHT }} />` (spacer)
- [2] `<View identityZone>...</View>`
- [3] `<TabBar>` ← sticky

So actually `stickyHeaderIndices={[3]}` may stay if the spacer counts as an explicit child. **Verification step during M1 implementation:** count the React-rendered children at the ScrollView level and confirm the index. The plan currently states `[2]` based on the assumption that the spacer view is folded into a single child — but if the spacer is its own `<View>`, the index stays `[3]`. Trivial to confirm by grep + console.log during implementation; not a risk.

#### 2.3.7 Reduced-motion behaviour for collapse

Locked: collapsed header opacity transition is `interpolate(scrollY, [FADE_START, FADE_END], [0, 1], 'clamp')` — driven by user scroll, NOT a triggered animation. Same logic as the stretch in Phase A. Reduced motion does not disable it.

If owner wants strict reduced-motion compliance, the alternative is a discrete "snap on" (collapsed header appears instantly at the threshold, no fade). Recordable as a follow-up if needed; default is the fade.

#### 2.3.8 Files touched (Phase B)

- ✨ `apps/customer-app/src/features/merchant/components/CollapsedHeader.tsx` — new component (~80 LOC).
- ✏️ `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` — mount `<CollapsedHeader>`, capture `identityZoneEnd` via `onLayout`, set `<StatusBar style="dark" />` while merchant profile mounted.
- ✨ `apps/customer-app/tests/features/merchant/collapsed-header.test.tsx` — new structural + threshold tests.

### 2.4 Tab content separately — out of scope

Tab content (Vouchers, About, Branches, Reviews) lives inside the same outer ScrollView. Today's pattern. No nested scrolls introduced. Long lists (Reviews) ride the outer ScrollView's scrollY — which now also drives the stretchy header AND the collapsed header. **This is fine and intentional** — outer ScrollView scrollY uniformly controls the header chrome regardless of which tab body is active.

---

## 3. Owner decisions — locked + outstanding

### Locked (owner 2026-05-06)

- **D1 Phasing.** Both Phase A and Phase B as two milestones in this workstream. Pause before scope expansion if M2 grows.
- **D3 Stretch curve.** Linear.
- **D4 Reduced motion.** Stretch + collapse fade still work (gesture-driven).
- **D5 Banner sizing.** 224pt + runtime scale.
- **D6 Gradient fallback.** Gradient stretches identically.
- **§4 Primitive extraction.** No `<StretchyHeader>` or `<CollapsedHeader>` extracted to design-system on this PR. Keep merchant-feature-local. Extract later when a second consumer (Voucher Detail rebaseline) appears.
- **Collapsed header content.** Merchant logo + merchant name + branch/location name. No website / contact / directions / rating / full status / full metadata.

### Locked 2026-05-06

- **D2 Back button.** Option A — include back button only in the collapsed header. Layout in §2.3.2. 36pt frosted circle, hit slop sized so effective target ≥ 44pt. No share, no heart, no rating, no metadata. Reason: iOS swipe-back unavailable on this Tabs route; bottom tab bar hidden; without a collapsed-state back affordance, deep-scrolled users are trapped.

### Locked gesture restraint (owner direction 2026-05-06)

- **No custom edge-swipe gesture in this PR.** Owner concern: a custom back-edge-swipe could conflict with future horizontal tab swiping (Vouchers ↔ About ↔ Branches ↔ Reviews) and with nested scroll / review-toggle gestures.
- **No tab-swipe navigation in this PR.** Stays out of scope.
- **No native-stack-presentation refactor in this PR.** Stays out of scope.
- All gesture arbitration concerns recorded as a separate follow-up workstream — see §11 below.

---

## 4. Reusability

Locked: **no primitive extraction on this PR** (§3 §4 lock above). All new code lives at:
- `apps/customer-app/src/features/merchant/components/HeroSection.tsx` (refactored)
- `apps/customer-app/src/features/merchant/components/CollapsedHeader.tsx` (new)

When the Voucher Detail rebaseline (or any second consumer) needs the same pattern, extract then. The merchant-profile-local code becomes the reference implementation.

---

## 5. Risks

### 5.1 iPhone Dynamic Island / notch overlap (Phase A + B)

**Phase A:** preserve existing `insets.top + 8` offset for the nav row inside the banner layer. Unchanged from PR #35.
**Phase B:** collapsed header reads `useSafeAreaInsets()` and consumes `insets.top` as a non-interactive spacer (§2.3.4). Interactive content sits below. Tested against Dynamic Island, notch, and SE devices in QA matrix.

### 5.2 Android status bar behaviour

Today the customer-app does not declare `<StatusBar>` per-screen — the root is `<StatusBar style="auto" />` only. With banner overlapping the status bar area (Phase A) and a cream collapsed header behind the status bar text (Phase B), Android status bar text colour matters.

**Mitigation:**
- Phase A: `<StatusBar style="light" translucent />` while merchant profile is mounted (banner is dark-vignetted; light text visible).
- Phase B: when collapsed header reaches opacity > 0.5, switch to `<StatusBar style="dark" />`. Two-state status bar driven by the same scrollY threshold. Implementation: `useAnimatedReaction` on scrollY to call `setStatusBarStyle` on threshold cross, debounced.
- Restore root style on unmount.

### 5.3 Sticky tab bar interaction

`stickyHeaderIndices` index update (3 → 2 or stays 3 depending on spacer-as-child semantics, §2.3.6). Verified during M1 implementation, not at risk.

Existing test `tab-bar-pulse.test.tsx` covers the structural contract. Will run + verify.

### 5.4 Collapsed header overlapping identity zone during transition

By design — see §2.3.1. Collapsed header is opaque; covers identity zone during the transition window. User perception: hero gone, compact header here, identity zone scrolls past behind. Not a bug, intentional handoff. QA scenario covers this.

### 5.5 Navigation dead-end if back button absent (D2 = B or C)

Captured under D2. Resolution depends on owner's D2 answer.

### 5.6 Performance of scroll-driven animation

Reanimated's `useAnimatedScrollHandler` runs entirely on the UI thread — no JS-thread bridge. Both stretch + collapse fade run on transform + opacity (GPU-accelerated). Performance budget: well under 1ms per frame on iPhone 11+; not a concern.

### 5.7 Edge case — overscroll past large negative scrollY

iOS bouncing can produce scrollY values down to ~-screen-height. `scaleY` clamped at 2.5 (§2.2). Banner expands smoothly until cap; further pull just translates without further stretch.

### 5.8 Interaction with screen-wide pulse on branch switch

Banner-as-sibling does not participate in the `screenAnimatedStyle` pulse (intentional — banner image doesn't change with the pulse meaning). Toast and modals already sit outside the pulse wrap for the same reason. Banner joins them. Verified visually during M1 QA.

The collapsed header (Phase B) sits OUTSIDE the scrollWrap as a sibling — it MUST also stay outside the pulse so the user always knows which merchant they're viewing during the pulse. This is consistent with existing toast/modal behaviour.

### 5.9 Test pollution (Animated.ScrollView vs ScrollView)

Existing tests query `<ScrollView testID="merchant-profile-scroll">`. After M1 the ScrollView becomes Animated.ScrollView; testID preserved. Risk: jest-expo + Reanimated mock interaction. Run merchant test suite before declaring tests green.

---

## 6. QA plan

### 6.1 Device matrix

| Device | OS | Why |
|---|---|---|
| iPhone 14 / 15 / 16 Pro+ | iOS 17+ | **Dynamic Island clearance — primary target.** Owner's device. |
| iPhone 11 / 12 / 13 | iOS 16+ | Notch device; no Dynamic Island; safe-area inset ≠ 0. |
| iPhone SE 2nd / 3rd | iOS 15+ | No notch, no Dynamic Island; safe-area inset = 20. |
| Android Pixel 6+ | Android 13+ | Status bar translucency; no bouncing scroll (Phase A regression-baseline); collapsed header fade behaviour. |
| iPad mini / iPad Air | iPadOS 16+ | Wider viewport; banner aspect ratio. (Accept iPhone-only QA if iPad isn't feasible.) |

### 6.2 Phase A scenarios (Milestone 1)

1. **Cold-load merchant profile.** Banner renders correctly; no flash of cream above; nav row clears Dynamic Island.
2. **Pull-down overscroll at top.** Banner stretches to fill exposed area; no cream void; nav buttons stay clickable.
3. **Fast pull-down to extreme.** Banner stretches up to scaleY=2.5 then translates only; no NaN, no negative-height layout, no flash.
4. **Fast scroll up.** Sticky tab bar locks at top; tab content scrolls underneath; no banner residue.
5. **Fast scroll back down to top.** Tab bar releases; identity zone reappears; banner returns to rest cleanly.
6. **Reduced motion ON.** Stretch behaviour still works; no other regressions.
7. **Branch switch.** Screen-wide pulse plays; banner doesn't desync.
8. **Reviews tab (long list).** Scroll through reviews; tab bar stays sticky; outer scroll continues to drive stretchy header.
9. **Suspended branch banner shown.** Banner-above-banner layout still works; safe-area still respected.
10. **Without bannerUrl (gradient fallback).** Stretch applies to gradient; no visual difference vs banner case.
11. **Android — no bounce baseline.** Confirm Android shows no overscroll bounce (RN default); no regression.

### 6.3 Phase B — Dynamic Island specific scenarios (Milestone 2)

These are MANDATORY on iPhone 14/15/16 Pro+ devices.

12. **Scroll past hero on iPhone Pro.** Collapsed header fades in. **Verify:** content row (back, logo, merchant name, branch line) sits BELOW Dynamic Island. Zero overlap. Use the iOS UI Debugger or screenshot at a known scroll position to measure.
13. **Tap Dynamic Island while collapsed header visible.** System DI interactions (e.g. play/pause, timer expand) must still work. Collapsed header's content does not extend into the DI's tappable region.
14. **Status bar text colour.** While expanded (banner visible), status bar text is light. While collapsed (cream header visible), status bar text is dark. Transition is at threshold cross — no flicker. Measure on light/dark wallpaper too.
15. **Tap collapsed header's back button (if D2=A).** Returns to previous screen correctly. Hit target ≥48pt (visual 36pt + 6pt hit slop = 48pt — confirm with `react-native-touchables` overlay or measure).
16. **Tap collapsed header's logo / text region.** Should NOT navigate (decision: collapsed header is read-only chrome, no tap-to-scroll-to-top). If owner wants tap-to-scroll-up, that's a separate small follow-up.
17. **Visual continuity to TabBar.** Collapsed header bottom edge meets TabBar top edge with no visible seam. Cream-on-cream — confirm there's no spurious gap or shadow break.
18. **Branch name overflow.** On a long branch name (e.g. "Bishopston, North London Borough"), branch line ellipsises tail; merchant name remains fully visible.
19. **Multi-branch vs single-branch.** Single-branch merchants (no branch identity to surface) — collapsed header shows only merchant name (the branch line is hidden when `branchShortName(sb.name) === merchant.businessName` or some similar redundancy check). **Decide implementation rule during M2 and document.**

### 6.4 Phase B — non-DI scenarios (Milestone 2)

20. **Notch device (iPhone 11–13).** Same content layout, smaller `insets.top`. Verify no cropping or overlap.
21. **SE device (no notch).** Smallest `insets.top`. Collapsed header is correspondingly shorter; nothing breaks.
22. **Android status bar.** Translucent. Cream collapsed header behind, dark status bar text. No status bar background flash on threshold cross.
23. **Slow scroll past threshold.** Fade-in is smooth over the 60pt window; no jank, no double-render.
24. **Fast scroll past threshold.** Fade reaches opacity=1 within the window; no flicker; no skipped state.
25. **Reduced motion ON.** Fade still works (gesture-driven). Confirm.
26. **Reviews tab — long content + collapsed header.** Scroll through 50+ reviews; collapsed header stays put; tab bar pinned beneath; no perf jank.
27. **Branch switch while collapsed.** Pulse plays; collapsed header content updates with new branch name; pulse does NOT include collapsed header (sibling of scrollWrap, see §5.8).
28. **Back button + Android hardware back.** Both exit the screen. Behaviour identical.

### 6.5 Automated test additions

- ✨ `tests/features/merchant/hero-overscroll.test.tsx`: structural — `<HeroBanner>` mounts at correct DOM level, receives `scrollY`, spacer at right scroll-child index. Confirm `scaleY` clamp at 2.5.
- ✨ `tests/features/merchant/collapsed-header.test.tsx`: structural + threshold:
  - Renders content (logo, merchant name, branch line, back button if D2=A).
  - Opacity is 0 at scrollY=0.
  - Opacity is 1 at scrollY=FADE_END (mock `identityZoneEnd`).
  - `pointerEvents` toggles at threshold.
  - Reduced-motion test: same fade applies.
- ✏️ `tests/features/merchant/profile-skeleton.test.tsx`: ensure no regression in render path.
- ✏️ Existing tab-bar-pulse / sticky tests: confirm `stickyHeaderIndices` updated correctly (assert structural contract).

### 6.6 Test commands

```bash
# Customer-app unit + component tests
cd apps/customer-app && npx jest --forceExit

# tsc
cd apps/customer-app && npx tsc --noEmit

# Backend tests not expected to be impacted, but run as smoke check
cd /Users/shebinchaliyath/Developer/Redeemo && npx vitest run
```

Pass criteria:
- All 206+ existing customer-app merchant-suite tests pass.
- New stretchy-hero + collapsed-header tests pass.
- tsc clean.
- Backend 115/115 unchanged.

---

## 7. Implementation milestones (after owner D2 approval)

**Milestone 1: Phase A — Stretchy hero**
- Refactor HeroSection into `<HeroBanner>` (layer) + `<HeroBannerSpacer>` (in-flow placeholder).
- Switch outer ScrollView → Animated.ScrollView with useAnimatedScrollHandler.
- Wire `scrollY` shared value, derive bannerAnimatedStyle.
- Verify `stickyHeaderIndices` value (3 stays or 3→2 — confirm during implementation).
- Add `<StatusBar style="light" translucent />` for the merchant route (Phase A baseline).
- Add hero-overscroll test.
- Run jest + tsc.
- **PAUSE for owner on-device QA review.**

**Milestone 2: Phase B — Collapsed sticky header**
- New `<CollapsedHeader>` component with locked content (logo + name + branch line + optional back).
- Layout per §2.3.2 (assumes D2=A; if D2=B, drop back button + adjust padding).
- Capture `identityZoneEnd` via `onLayout` on the identity zone wrapper.
- Threshold-driven fade.
- Status bar style swap on threshold cross.
- Visual seam to TabBar (§2.3.5).
- Multi-branch vs single-branch rule (decide + document during implementation; note in §6.3 #19).
- Tests.
- Run jest + tsc.
- **PAUSE for owner on-device QA review.** **STOP and report if M2 grows beyond expected.**

**Milestone 3: PR open**
- After owner sign-off on M1 + M2, open PR against main from `feature/merchant-profile-header-collapse`.
- PR description: scope, risk, test deltas, decision answers from §3.
- **PAUSE before merge per Tier 2 rules.**

---

## 8. Files touched (cumulative summary)

**M1:**
- ✏️ `apps/customer-app/src/features/merchant/components/HeroSection.tsx`
- ✏️ `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`
- ✨ `apps/customer-app/tests/features/merchant/hero-overscroll.test.tsx`
- ✏️ `apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx` (only if structural assertions break)

**M2:**
- ✨ `apps/customer-app/src/features/merchant/components/CollapsedHeader.tsx`
- ✏️ `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` (mount + onLayout wiring)
- ✨ `apps/customer-app/tests/features/merchant/collapsed-header.test.tsx`

No backend changes. No other surface changes. No design-system extraction.

---

## 9. Documentation updates required

This change does not alter the customer flow contract (login, register, verification, PC1–PC4, subscription prompt), so `docs/customer-flow-current.md` is **not** affected.

It does affect the Merchant Profile *visual* contract: the locked baseline post-PR-#35 (in `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_merchant_profile_ux_refinement_complete.md`) lists header / banner / safe-area as locked. After this workstream merges, update that memory entry to reflect:
- Stretchy hero is the new baseline.
- Stretch curve (linear) + scale cap (2.5).
- Collapsed sticky header is the new chrome above the tab bar past the threshold.
- Collapsed header content (logo + name + branch line + back if D2=A).
- Sticky TabBar index documented (final value confirmed during M1).

Memory update happens as part of the PR's end-of-workstream tidy.

---

## 10. Outstanding decisions

None. All decisions locked. Implementation begins on Milestone 1.

---

## 11. Future navigation/gesture follow-up (out of scope for this PR)

Recorded for the next navigation/gesture workstream. Not solved here.

- **Native stack presentation for `merchant/[id]`.** Investigate whether the Merchant Profile should be presented in a native stack (instead of a Tabs route) so iOS swipe-back works naturally. Today the route is `<Tabs.Screen name="merchant/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />` (see [`app/(app)/_layout.tsx:120`](apps/customer-app/app/(app)/_layout.tsx#L120)). A native-stack presentation would unlock iOS swipe-back without custom gesture work, and would be a better long-term fit. Refactor scope: small change to the router config + verifying back-stack semantics across cold-open from notification / deep-link / share-link entries.
- **Tab-swipe navigation across merchant-profile sections.** Owner-desired: swipe left/right on the body to switch Vouchers ↔ About ↔ Branches ↔ Reviews. Plus future review-toggle gestures may need their own pan handling.
- **Gesture priority arbitration.** When tab-swipe + native-stack-swipe-back + nested-scroll + review-toggle gestures all live on the same surface, define priorities:
  - Edge swipe should navigate back ONLY from the screen edge AND only if native stack supports it.
  - Horizontal swipes inside tab content should switch tabs.
  - Vertical scroll must remain stable.
  - Review-toggle gestures must not conflict with tab swipes.
- All four bullets above belong to a single navigation/gesture brainstorm workstream (likely Tier 2, possibly Tier 3 if the native-stack refactor turns out to need more careful handling). Pick up after the customer-app rebaseline track is closer to done — gesture arbitration is easier to design when the destination shape is known across all surfaces.
