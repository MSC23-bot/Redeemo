# Merchant Profile — Header collapse, stretchy hero, safe-area discipline

> **Status: AWAITING OWNER APPROVAL.** Do not begin implementation until the owner has signed off on this plan and answered the decision questions in §3.

**Tier:** 2 (multi-file UI work in one surface; needs a written plan first per CLAUDE.md standing rule).
**Tracks:** §N3 (Dynamic Island / safe-area / collapsed sticky header) + §N7 (header / top-section polish where it directly relates to the collapsed/sticky header system) — bundled per owner direction 2026-05-06.
**Scope boundary:** header / safe-area / overscroll / collapse behaviour only. Voucher card design, Reviews system, Bottom sheets, broader Merchant Profile redesign are EXPLICITLY out of scope.

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
    {back / share / heart frostedBtn x3}
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

## 2. Proposed solution

### 2.1 Phasing recommendation

**Phase A — Stretchy hero only (THIS workstream's PR 1).**
**Phase B — Collapsed header (separate PR or second milestone within this workstream — see §3 D1).**

Phasing reasoning: the stretchy-hero fix solves the user-reported "looks broken" symptom on its own without introducing collapse logic. Collapse is a polish improvement that benefits from being its own decision (which content survives, where the threshold lives, how it animates). Bundling them into one PR doubles the surface area for QA and increases the risk of one regressing the other.

### 2.2 Phase A — Stretchy hero

**Pattern:** standard "stretchy header" used on Apple Music, Spotify, Twitter profile, TestFlight app pages. The banner is mounted as an *absolutely-positioned* layer outside the ScrollView's normal flow, with its `translateY` and `scaleY` driven by the ScrollView's `scrollY` shared value.

**Behaviour by scroll state:**

| `scrollY` | Banner transform | Visual |
|---|---|---|
| `< 0` (overscroll pull-down) | `translateY: scrollY` (moves down with finger) AND `scaleY: 1 + |scrollY|/H` with `transform-origin: top` (expands downward) | Banner stretches to fill the exposed top — no cream void |
| `= 0` (rest) | `translateY: 0`, `scaleY: 1` | As today |
| `> 0` (normal scroll) | `translateY: -scrollY` (moves up with content) | Banner scrolls away as today |

**Key insight:** when overscrolling, both translate AND scale are applied. The translate makes the banner follow the finger; the scale-from-top expands the banner to fill the void. Without scale, the banner would just translate down and there'd still be a void above it. Without translate, the banner would expand but not visually feel "pulled."

**Implementation outline:**

1. Banner moves out of HeroSection-as-scroll-child into a sibling absolute layer above the ScrollView:
   ```tsx
   <View style={styles.container}>
     <Animated.View style={[styles.bannerLayer, bannerAnimatedStyle]}>
       <Image source={bannerUrl} contentFit="cover" />
       <LinearGradient ... vignette />
       <View navRow style={[..., { top: insets.top + 8 }]}>...</View>
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
   </View>
   ```
2. `scrollY = useSharedValue(0)`; `useAnimatedScrollHandler({ onScroll })`.
3. `bannerAnimatedStyle` derived via `useAnimatedStyle`:
   ```ts
   const ty    = scrollY.value < 0 ? scrollY.value : -scrollY.value
   const scale = scrollY.value < 0 ? 1 + (-scrollY.value)/HERO_HEIGHT : 1
   return { transform: [{ translateY: ty }, { scaleY: scale }] }
   ```
   Plus `transformOrigin: 'top'` (RN 0.74+ supports `transformOrigin` on Animated styles; if pinned to an older RN, use `translateY` math to compensate).
4. `bannerLayer` style: `position: 'absolute', top: 0, left: 0, right: 0, height: HERO_HEIGHT, zIndex: layer.base`.
5. Spacer in the ScrollView matches `HERO_HEIGHT` so identity zone starts at the same Y position as today.

**What stays the same:**
- Identity zone position, gradient, content.
- Sticky TabBar behaviour (index updates from 3 → 2 because HeroSection-as-scroll-child becomes a spacer; still sticky).
- All tab content.
- HeroSection's nav row safe-area handling (still uses `insets.top + 8`).
- Reduced-motion path: `scrollY` shared value still updates; transforms still apply (the stretch is direct response to user input, not a discrete animation, so reduced-motion doesn't disable it). However if owner prefers, we can clamp `scaleY` to 1 under reduced-motion to avoid the elastic feel.

**Files touched (Phase A):**
- `apps/customer-app/src/features/merchant/components/HeroSection.tsx` — refactor: extract banner content as a layer that can be absolute-positioned, accept `scrollY` shared value as prop OR split into `<HeroBanner>` (the layer) + `<HeroBannerSpacer>` (the in-flow spacer). I lean toward splitting into two components for clarity; ~30 LOC change.
- `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` — switch ScrollView to `Animated.ScrollView`, add `useAnimatedScrollHandler`, mount `<HeroBanner>` as sibling, replace inline `<HeroSection>` with `<HeroBannerSpacer>`, decrement stickyHeaderIndices from 3 to 2; ~20 LOC change.
- `apps/customer-app/tests/features/merchant/hero-overscroll.test.tsx` — new: structural test asserting the scroll handler is wired and banner reads `scrollY`.

### 2.3 Phase B — Collapsed sticky header (optional second milestone)

Only viable AFTER Phase A is in (because collapse needs the banner-as-layer). Scope:

**Behaviour:** as user scrolls past a threshold, a compact header fades in pinned to the top — merchant name + back button (always) + optional share/heart (decision in §3 D2). Sticky tab bar continues to pin BELOW the compact header.

**Sketch:**

```
  ┌──────────────────────────────┐
  │ ←  Merchant Name        ♡ ⤴ │  ← compact header, fades in past threshold
  ├──────────────────────────────┤
  │ Vouchers  About  Branches  │  ← sticky TabBar, pinned below compact header
  ├──────────────────────────────┤
  │ ... tab body ...            │
```

**Threshold:** ~`HERO_HEIGHT - 60` (i.e. when the hero is 60pt from being fully off-screen) — gives a smooth handoff.

**Files touched (Phase B):**
- `apps/customer-app/src/features/merchant/components/CollapsedHeader.tsx` — new component.
- `MerchantProfileScreen.tsx` — mount + pass `scrollY` + merchant name + actions.
- New tests for threshold + reduced-motion.

### 2.4 Pulling tab content separately

**Out of scope.** Today the outer ScrollView holds all tab content as direct children inside `<Animated.View key={activeTab}>`. With sufficiently long Reviews lists this could mean a long scroll on the outer ScrollView, but that's the existing pattern and works fine. Introducing nested scrolls (one per tab) is a Reviews-system-rebaseline concern, not a header-collapse concern. Explicitly leaving the existing single-ScrollView pattern intact.

---

## 3. UX decisions needed (please answer before implementation)

Each decision has my recommended pick + alternatives + reasoning.

### D1. Phase scoping — Phase A only, or Phase A + Phase B in one workstream?

- **(A) Recommended: Phase A only in this PR.** Solves the user-reported "looks broken" symptom. Phase B becomes a separate decision after Phase A is on-device and validated.
- (B) Both phases in one workstream, two milestones, two commits, owner reviews after each milestone before the second starts.
- (C) Both phases in one PR / one milestone — not recommended (combined QA surface).

**Recommendation:** A. Reasoning: Phase A is the bug fix; Phase B is polish. Don't bundle.

### D2. Collapsed header content (only relevant if D1 = B or C)

What appears in the compact header after the threshold is crossed?

- **(A) Recommended: merchant name + back + nothing else.** Cleanest. Matches Apple Music, Spotify.
- (B) merchant name + back + share + heart (mirror current expanded nav row).
- (C) merchant name + branch name + back. Surfaces branch identity in the compact view.

**Recommendation:** A. Reasoning: keep collapsed header minimal; the heart/share are already accessible by scrolling back up (and on Reviews list, less critical). Branch identity is in the identity zone which is just below the screen edge anyway — adding it to the compact header creates visual noise.

### D3. Stretch curve

How aggressively does the banner expand on pull-down?

- **(A) Recommended: linear `scaleY = 1 + |scrollY|/HERO_HEIGHT`.** Banner doubles in height at full hero pull (224pt of overscroll). Feels grounded.
- (B) Square-root: `scaleY = 1 + sqrt(|scrollY|)/k`. Initial response stronger, taper as you pull. More "elastic."
- (C) Capped: linear up to scale=1.5, then asymptotic. Prevents extreme stretching on long pulls.

**Recommendation:** A unless on-device feels too rigid. C is a fallback if A produces uncomfortable extremes.

### D4. Reduced-motion behaviour for stretch

iOS / Android system "Reduce Motion" setting is on. What happens?

- **(A) Recommended: stretch still works.** Stretch is direct response to user input, not a triggered animation. Reduce Motion typically targets parallax / autoplay, not user-driven transforms. Apple Music's stretch still works under Reduce Motion.
- (B) Disable stretch (clamp scaleY to 1) under reduced-motion. Banner just translates with overscroll; void still appears (regression).
- (C) Disable scale, keep translate, but ALSO clamp negative-translate to 0 — no visual change at all on overscroll.

**Recommendation:** A. (B) reintroduces the void. (C) is the most conservative if the owner wants strict reduced-motion compliance, but it means the bug stays for those users.

### D5. Banner overscroll-only headroom

Should the banner layer be sized exactly to `HERO_HEIGHT` (224pt) and stretched at runtime, OR pre-sized larger (e.g. 224 + 200pt headroom) so the stretch is just translate, no scale?

- **(A) Recommended: 224pt + scale-up.** Simpler. Banner image always renders at native aspect ratio. Scale-y at top-origin gives the elasticity.
- (B) 224 + 200 headroom + translate-only. Avoids `scaleY` (which can produce minor pixel-grid inconsistencies on Android during the transform). But forces the banner image to always render extra pixels above the visible area, wasting a bit of texture memory and producing image cropping at the top that has to be hidden.

**Recommendation:** A. Android scale rendering is fine for static images; the perf delta is invisible.

### D6. Test fixture for non-banner merchants

What if `bannerUrl` is null and the banner falls back to the dark gradient (current behaviour)? The stretch has to apply to the gradient too.

- **(A) Recommended: gradient stretches identically.** No code-path divergence.
- (B) Disable stretch when no banner. Behaviourally inconsistent.

**Recommendation:** A. Trivial because the gradient is also `absoluteFillObject` on the same banner layer.

---

## 4. Reusability

### 4.1 Should this become a primitive?

Six surfaces are queued for rebaseline (per CLAUDE.md "Next planned work"): Discovery / Voucher Detail / Favourites / Savings / Profile / QR. Of these:

- **Voucher Detail** — already has a hero-shaped banner area; will benefit directly from a stretchy-hero pattern.
- **Profile** (the customer's own profile, not merchant profile) — likely has a header avatar / cover area; could benefit.
- **Discovery / Favourites / Savings / QR** — different scroll patterns; less direct fit.

**Recommendation: extract a thin reusable primitive.**

Proposed shape:
```ts
// apps/customer-app/src/design-system/motion/StretchyHeader.tsx (new)
type Props = {
  scrollY: SharedValue<number>
  height: number
  children: React.ReactNode      // hero content (banner image + overlays)
}
export function StretchyHeader({ scrollY, height, children }: Props) { ... }
```

Then:
```ts
// MerchantProfileScreen.tsx
<StretchyHeader scrollY={scrollY} height={224}>
  <HeroBanner bannerUrl={...} ... />
</StretchyHeader>
```

Voucher Detail can reuse `<StretchyHeader>` with its own banner content. The collapsed-header component (Phase B) can also be extracted as a separate primitive:
```ts
<CollapsedHeader scrollY={scrollY} title={merchantName} threshold={164}>
  <BackButton />
</CollapsedHeader>
```

**Decision needed: do we extract on PR 1 (this workstream) or wait until PR 2 (Voucher Detail rebaseline)?**

- **(A) Recommended: extract on PR 2.** Build the merchant-profile-specific code first, THEN extract when the second consumer (Voucher Detail) appears. Avoids designing the API speculatively.
- (B) Extract on PR 1. Predesign the API now. Risk: API gets revised when Voucher Detail's needs surface differently than expected.

**Recommendation:** A. YAGNI — don't generalise speculatively.

### 4.2 What if Phase B happens on the merchant profile but not other surfaces?

Phase B's `<CollapsedHeader>` is fine to live in the merchant feature folder (`apps/customer-app/src/features/merchant/components/`) until a second consumer appears. Same lazy-extraction rule.

---

## 5. Risks

### 5.1 iPhone Dynamic Island / notch overlap

**Mitigation:** preserve the existing `insets.top + 8` offset for the nav row inside the banner layer. The banner layer's content is structured identically to today's HeroSection — only the *outer mounting position* changes. The Dynamic Island clearance is unchanged from PR #35.

### 5.2 Android status bar behaviour

Today the customer-app does not declare `<StatusBar>` per-screen — the root is `<StatusBar style="auto" />` only. On Android, status bar style adapts to the system theme. The banner overlaying the status bar area on Android should produce a translucent status bar with the banner image showing through, consistent with iOS. Risk: depending on the Android device's status-bar translucency setting, the banner top might be obscured. If we see issues during QA, the fix is `<StatusBar translucent />` for the merchant route.

**Mitigation:** add `<StatusBar style="light" translucent />` inside `MerchantProfileScreen` while it's mounted. Restore on unmount.

### 5.3 Sticky tab bar interaction

The TabBar is currently sticky at index 3. With the banner removed as a scroll child, indices shift by 1 (TabBar becomes index 2). This is a one-line constant change. The sticky behaviour itself is unaffected — sticky is a function of the index relative to ScrollView's children.

**Mitigation:** existing test `tab-bar-pulse.test.tsx` (referenced in TabBar.tsx Round 5 §5 comment) covers the structural contract. Will run + verify.

### 5.4 Nested scroll / tab content interaction

Tab content (Vouchers, About, Branches, Reviews) lives inside the same outer ScrollView. None of the tab content currently uses nested scroll. No change planned. Long lists (Reviews) ride the outer ScrollView's scrollY — which now also drives the stretchy header. **This is fine and intentional** — outer ScrollView scrollY controls header collapse for all tabs uniformly.

**Mitigation:** verify on Reviews tab (longest content) during QA.

### 5.5 Performance of scroll-driven animation

Reanimated's `useAnimatedScrollHandler` runs entirely on the UI thread — no JS-thread bridge for scroll events. Transform updates use the `transform` shared style (GPU-accelerated). Performance budget: well under 1ms per frame on iPhone 11+; not a concern.

**Mitigation:** verify with React DevTools profiler if any frame drops appear during fast scroll.

### 5.6 Edge case — overscroll past large negative scrollY

iOS bouncing can produce negative scrollY values up to ~screen height. A scaleY value of `1 + 800/224 ≈ 4.5` is unreasonable.

**Mitigation:** clamp `scaleY` to a max (e.g. 2.5) via `Math.min` or a `withClamp` reanimated helper. Banner expands smoothly until the cap; further pull just translates without further stretch.

### 5.7 Interaction with the existing screen-wide pulse on branch switch

The `screenAnimatedStyle` opacity pulse on branch switch wraps the ScrollView. Banner-as-sibling means the banner does NOT participate in the pulse. **This is actually the right behaviour** — the banner image doesn't change on branch switch (it's branch-aware, but the image change happens via re-render, not via the pulse). Same as how the toast and modals already sit outside the pulse wrap to stay at full opacity.

**Mitigation:** verify visually that the banner doesn't visibly desync from the rest of the screen during a branch-switch pulse.

### 5.8 Preserving screen-pulse animation

`screenAnimatedStyle` is applied to `<Animated.View style={[styles.scrollWrap, screenAnimatedStyle]}>` wrapping the ScrollView. Phase A change: this wrapper now wraps Animated.ScrollView (renamed) but the pulse still works. Banner sits at the same DOM level as the wrap (sibling), inheriting the page background. No regression.

### 5.9 Test pollution (Animated.ScrollView vs ScrollView)

Existing tests that mock or query `<ScrollView testID="merchant-profile-scroll">` may fail if the ref is replaced by Animated.ScrollView. The testID itself is preserved; query patterns should still work, but jest-expo's interaction with Reanimated mocks deserves a smoke run before claiming green.

**Mitigation:** run the merchant test suite before declaring tests green.

---

## 6. QA plan

### 6.1 Device matrix

| Device | OS | Why |
|---|---|---|
| iPhone 14 Pro+ | iOS 17+ | Dynamic Island clearance; primary owner device |
| iPhone 11 / 12 / 13 | iOS 16+ | Notch device; no Dynamic Island; safe-area inset ≠ 0 |
| iPhone SE 2nd / 3rd | iOS 15+ | No notch, no Dynamic Island; safe-area inset = 20 |
| Android Pixel 6+ | Android 13+ | Status bar translucency; no bouncing scroll (regression-baseline) |
| iPad mini / iPad Air | iPadOS 16+ | Wider viewport; banner aspect ratio |

If iPad test isn't feasible right now, accept iPhone-only QA and flag iPad as a known gap.

### 6.2 Scenarios

1. **Cold-load merchant profile.** Banner renders correctly; no flash of cream; nav row clears Dynamic Island.
2. **Pull-down overscroll at top.** Banner stretches to fill the exposed area; no cream void; nav buttons stay clickable.
3. **Fast scroll up past hero.** Sticky tab bar locks at top; tab content scrolls underneath; no banner residue.
4. **Fast scroll back down.** Tab bar releases; identity zone reappears; banner returns to rest.
5. **Slow scroll past threshold (Phase B).** Compact header fades in smoothly; no flicker.
6. **Reduced motion ON.** Stretch behaviour per D4 decision; no other regressions.
7. **Branch switch.** Screen-wide pulse plays; banner doesn't desync.
8. **Reviews tab (long list).** Scroll through reviews; tab bar stays sticky; outer scroll continues to drive header collapse uniformly.
9. **Suspended branch banner shown.** Banner-above-banner layout still works; safe-area still respected.
10. **Without bannerUrl (gradient fallback).** Stretch applies to gradient; no visual difference.

### 6.3 Automated test additions

- `apps/customer-app/tests/features/merchant/hero-overscroll.test.tsx` (new): structural — assert `<HeroBanner>` mounts at the correct DOM level, receives `scrollY`, and that `<HeroBannerSpacer>` sits at the right scroll-child index.
- `apps/customer-app/tests/features/merchant/sticky-tab-bar.test.tsx` (existing or new): pin sticky-header index to 2 (was 3). If the existing test doesn't cover this, add it.
- `apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx` (existing): ensure no regression in render path.
- Phase B only: `collapsed-header.test.tsx` — threshold test, reduced-motion test, content test.

### 6.4 Test commands

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
- New stretchy-hero test(s) pass.
- tsc clean.
- Backend 115/115 unchanged.

---

## 7. Implementation milestones (after owner approval)

**Milestone 1: Phase A — Stretchy hero**
- Refactor HeroSection into `<HeroBanner>` (layer) + `<HeroBannerSpacer>` (in-flow placeholder).
- Switch outer ScrollView → Animated.ScrollView with useAnimatedScrollHandler.
- Wire scrollY shared value, derive bannerAnimatedStyle.
- Decrement stickyHeaderIndices from 3 → 2.
- Add `<StatusBar style="light" translucent />` (if Android QA requires).
- Add hero-overscroll test.
- Run jest + tsc.
- **PAUSE for owner on-device QA review.**

**Milestone 2 (only if D1 chosen as B): Phase B — Collapsed sticky header**
- New `<CollapsedHeader>` component.
- Threshold-driven fade.
- Reduced-motion handling.
- Tests.
- Run jest + tsc.
- **PAUSE for owner on-device QA review.**

**Milestone 3: PR open**
- After owner sign-off on milestones in scope, open PR against main.
- PR description: scope, risk, test deltas, decision answers from §3.
- **PAUSE before merge per Tier 2 rules.**

---

## 8. Files touched (cumulative summary)

Phase A:
- ✏️ `apps/customer-app/src/features/merchant/components/HeroSection.tsx` (refactor to two components)
- ✏️ `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` (Animated.ScrollView, scrollY wiring, sticky index)
- ✨ `apps/customer-app/tests/features/merchant/hero-overscroll.test.tsx` (new)
- ✏️ `apps/customer-app/tests/features/merchant/profile-skeleton.test.tsx` (only if structural assertions break)

Phase B (if approved):
- ✨ `apps/customer-app/src/features/merchant/components/CollapsedHeader.tsx` (new)
- ✏️ `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx`
- ✨ `apps/customer-app/tests/features/merchant/collapsed-header.test.tsx` (new)

No backend changes. No other surface changes.

---

## 9. Documentation updates required

This change does not alter the customer flow contract (login, register, verification, PC1–PC4, subscription prompt), so `docs/customer-flow-current.md` is **not** affected.

It does affect the Merchant Profile *visual* contract: the locked baseline post-PR-#35 (in `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_merchant_profile_ux_refinement_complete.md`) lists header / banner / safe-area as locked. After this workstream merges, that memory entry must be updated to reflect:
- Stretchy hero is the new baseline.
- Stretch curve / scale cap.
- (Phase B if shipped) Collapsed header content + threshold.
- Sticky tab bar index changed from 3 → 2.

I'll handle the memory update as part of the PR's end-of-workstream tidy.

---

## 10. Open questions for owner

Please answer before I begin implementation:

1. **D1 — Phase scoping.** A (Phase A only this PR) / B (both phases two milestones one PR) / C (both phases one milestone)?
2. **D2 — Collapsed header content.** Only relevant if D1 ≠ A. A (name + back only) / B (name + back + share + heart) / C (name + branch + back)?
3. **D3 — Stretch curve.** A (linear) / B (sqrt elastic) / C (capped linear)?
4. **D4 — Reduced motion.** A (stretch still works) / B (disable scale, keep translate — void returns) / C (disable both — no visual change at all)?
5. **D5 — Banner sizing strategy.** A (224pt + runtime scale) / B (224 + 200 headroom + translate only)?
6. **D6 — Gradient fallback.** A (gradient stretches identically) / B (disable stretch when no banner)?
7. **§4 — Primitive extraction.** A (extract on PR 2 when Voucher Detail rebaseline appears) / B (extract on this PR speculatively)?
8. **Anything I haven't asked** — corrections, additions, scope tightening?

Awaiting your answers. No code change until then.
