# Bottom Nav — Calm Branded Shelf (Option B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans once approved. Tier 2, frontend-only, customer-app. PAUSE at each milestone.

**Goal:** Replace the current full-width red gradient tab bar with a calm, premium **warm‑white shelf** where brand expression lives **only on the active tab** — a non‑floating, no‑glass nav that balances the red Home header instead of competing with it.

**Architecture:** Keep the **default Expo Router / React Navigation `<Tabs>`** and the **exact existing footprint** (full‑width, `position:absolute`, `bottom:0`, `height:80`). Change only the presentation via `screenOptions`: swap the red `tabBarBackground` gradient for a light shelf, render the icon via a small `BrandedTabIcon` (outline ink ↔ gradient‑glyph active + a small active indicator), let react‑navigation own the **label** slot (active brand‑red / inactive warm‑ink), and add an optional thin press‑feedback button. **No floating, no margins, no rounded pill, no BlurView.** Because the footprint is unchanged, **no screen clearance changes are needed.**

**Tech Stack:** expo‑router 6 `<Tabs>`, `expo-linear-gradient`, `react-native-svg` (`BrandGradientVector` for the active glyph), `@/design-system` tokens, `@/design-system/haptics` (`lightHaptic`), `useMotionScale`.

**This is a fresh start.** Built on branch `feature/bottom-nav-branded-shelf` (off `origin/main`). The abandoned floating work is archived at tag `archive/floating-nav-explored` (do not use).

---

## Locked direction (owner, 2026-06-06)

Non‑floating bottom nav · no glass/BlurView/liquid pill · keep the existing tab footprint + safe‑area behaviour stable · warm off‑white / light premium shelf · brand only on the active tab (red→orange gradient glyph or strong brand‑red icon + small active indicator + brand‑red label) · inactive = readable warm‑ink icons + labels · keep labels · fix the current label/icon inconsistency · subtle press feedback + haptics if low‑risk · calm + premium, not heavy · balance the red Home header.

## Baseline (what's there now, to evolve)

Current `app/(app)/_layout.tsx`: default `<Tabs>`, `tabBarStyle` absolute `height:80`, a `tabBarBackground` `LinearGradient` of `color.navGradient` (red→coral). Icons: 22px `color.onBrand` (white) at `opacity: focused?1:0.55` + a 4pt white `activeDot` above. Labels: shown via `title`, white active tint, **inactive label tint unset → react‑navigation default grey** — this is the **inconsistency** (icons dimmed by opacity, labels by a different mechanism). 5 visible tabs + `href:null` hidden routes + 4 detail routes that hide the bar via `tabBarStyle:{display:'none'}`.

## 1. Files likely touched

**Modify**
- `app/(app)/_layout.tsx` — `screenOptions`: light `tabBarBackground`, `tabBarActiveTintColor: brandRose`, `tabBarInactiveTintColor: warm‑ink`, `tabBarLabelStyle`, `tabBarIcon → BrandedTabIcon`, optional `tabBarButton → BrandedTabButton`. **Keep `height:80`, `bottom:0`, the 5 `<Tabs.Screen>` names/order, the `href:null` routes, and the 4 detail‑route `display:'none'` entries byte‑for‑byte.** Replace the 5 inline icon components + the `activeDot` style.

**Create**
- `src/features/navigation/BrandedTabShelf.tsx` — the shelf surface (`tabBarBackground`): warm off‑white fill + a top hairline + a soft upward lift (so it reads as an elevated shelf above the warm body). No gradient body, no blur.
- `src/features/navigation/BrandedTabIcon.tsx` — the icon: lucide **outline warm‑ink** when inactive; **brand red→orange gradient‑filled glyph** (`BrandGradientVector`) when active; a **small active indicator** (a short brand‑gradient pill) above the icon. Crossfades on focus; reduced‑motion instant.
- `src/features/navigation/tabGlyphs.ts` — the 5 filled glyph paths for the active gradient glyph (home / map‑pin / heart / wallet / person). *(Owner disliked the piggy → use a **Wallet** glyph for Savings; confirm at review.)*
- `src/features/navigation/navTokens.ts` — local nav constants (shelf colour, ink colour, indicator size, label size) so values aren't raw literals in the `screens`‑linted `_layout.tsx`.
- *(optional, low‑risk)* `src/features/navigation/BrandedTabButton.tsx` — a thin `tabBarButton` that adds a press `scale 0.96` + `lightHaptic` and **forwards `onPress`** (routing unchanged). It only wraps react‑navigation's children for press feedback — it does **not** take over icon/label layout (that was the floating attempt's mistake), so it carries none of that risk.

**Do NOT touch:** any screen (footprint unchanged → no clearance fix needed), the Home header, Search, backend, routes.

## 2. Exact visual treatment (the shelf)

- **Surface:** `BrandedTabShelf` fills `tabBarBackground` (full width, the 80px bar). Fill = a clean warm off‑white (a hair brighter than the `#FFF9F5` body so it reads as a distinct surface, e.g. `surface.page` `#FFFFFF` or a `#FFFCFA` warm‑white). 
- **Edge + lift:** a 1px top hairline (`border.subtle`/warm tint) + a soft **upward** shadow (iOS `shadowOffset:{0,-3}`, low opacity, warm‑tinted; Android: a thin top gradient‑lift View `rgba(0,0,0,0.05)→transparent` above the shelf, since Android elevation casts downward) so the shelf gently lifts off the body.
- **Calm, not heavy:** no brand fill on the surface; the only brand colour on the bar is the active tab. This balances (not competes with) the red header — red top, light bottom.

## 3. Tab item / icon / label treatment

- **Inactive:** lucide **outline** icon in warm‑ink (`text.secondary` `#4B5563`) + label in the **same** warm‑ink (via `tabBarInactiveTintColor`). Consistent icon↔label treatment — **fixes the inconsistency**.
- **Active:** **gradient‑filled glyph** (`BrandGradientVector`, brand `#E20C04→#E84A00`) + a **small active indicator** (a ~16×3 brand‑gradient rounded pill above the icon, replacing the old white dot) + label in **brand‑red** (`tabBarActiveTintColor`).
- **Labels kept** for all 5; `tabBarShowLabel:true` (react‑navigation's own full‑width label slot → no cropping, proper sizing). `tabBarLabelStyle`: `Lato‑Medium`, ~11px, tight tracking.
- **Savings icon:** **Wallet** (owner disliked the piggy). Confirm at review.
- *(Alternative if you prefer simpler:* active icon = a **strong brand‑red** outline (heavier stroke) instead of the gradient‑filled glyph — lower effort, no glyph paths. The plan defaults to the gradient glyph; say the word to switch.)*

## 4. Haptics / press feedback

`BrandedTabButton` (optional): on press, `scale 0.96` (≈120ms) + `lightHaptic()` (respects the global haptics‑enabled flag), then forwards react‑navigation's `onPress`. It wraps the children for feedback only — **no layout responsibility** — so routing/centering are unaffected. If device‑QA dislikes it, it can be dropped without touching anything else.

## 5. Reduced‑motion behaviour

`useMotionScale() === 0` → the active‑state change (glyph crossfade + indicator) is **instant/static**, and the press scale is disabled. No idle/looping animation. (Same gate the app uses elsewhere.)

## 6. Tests

- `BrandedTabIcon`: focused → gradient glyph + active indicator present, outline absent; inactive → outline ink, no indicator; reduced‑motion → instant.
- `BrandedTabShelf`: renders the shelf surface (warm fill + top hairline); no gradient/blur.
- `BrandedTabButton` (if included): press fires `lightHaptic` + forwards `onPress`; reduced‑motion → no scale.
- `tests/app/app-layout` config pin: 5 visible tabs + order, `href:null` hidden routes, detail routes keep `display:'none'`, **`height:80` footprint preserved**, labels shown.

## 7. Device‑QA checklist

- iOS + Android: shelf reads as a premium light surface lifting off the warm body; top hairline + lift visible on both (Android upward‑shadow workaround verified); active gradient glyph + indicator + brand‑red label; inactive warm‑ink **contrast ≥ WCAG 4.5:1** on the shelf; all 5 tabs switch; press scale + haptic; reduced‑motion instant; **footprint unchanged → no content overlap** on Home/Map/Savings/Favourites/Profile (the regression that killed the floating version); Dynamic Type / large‑text labels don't crop; tap targets ≥44px; balances the red Home header.

## 8. Risks / follow-ups

- **Light‑shelf‑on‑light‑body separation** — needs a well‑tuned hairline + upward lift; Android upward shadow differs from iOS (the gradient‑lift workaround). QA both.
- **Inactive ink contrast** must pass WCAG on the chosen warm‑white.
- **Gradient glyph fidelity** at ~22px (esp. the Wallet glyph) — device‑QA; brand‑red‑outline fallback is available.
- **Wallet vs PiggyBank** for Savings — owner confirm at review.
- **`BrandedTabButton`** is optional; drop if QA dislikes — zero blast radius.
- **Follow‑ups (deferred):** Favourites count badge (v2); `§RM` reduce‑motion detection (shared); `layout.tabBarHeight` token cleanup (the token is `64` vs the real `80` — out of scope here).

## Milestones (PAUSE for review at each)

- **M1 — Shelf surface.** `navTokens` + `BrandedTabShelf` wired as `tabBarBackground` (light shelf replaces the red gradient); icons/labels temporarily recoloured to ink so they're visible. Verify the shelf look + footprint unchanged.
- **M2 — Branded active tab.** `BrandedTabIcon` (outline ink ↔ gradient glyph + active indicator) + `tabGlyphs` + Wallet; `tabBarShowLabel`/tints/`tabBarLabelStyle` for the consistent label treatment. Verify active/inactive + the inconsistency fix.
- **M3 — Press feedback + motion.** `BrandedTabButton` (scale + haptic) + the glyph/indicator crossfade + reduced‑motion gating.
- **M4 — Config pin + sweep.** app‑layout config pin + full customer‑app `tsc`/tests/lint + device‑QA matrix.

Each milestone: `tsc` clean + touched tests + relevant sweep before proceeding.

## Guardrails (hard)

- No custom navigator (default Tabs). No route/order/hidden/detail‑hide changes (config‑pinned). **Keep the 80px footprint + safe‑area** (no floating, no margins). No backend/API/Prisma. No Search behaviour changes. Don't alter the shipped Home header. No screen redesigns (no clearance fix needed — footprint unchanged). **No glass/BlurView.**
- **No code, commit, push, or PR until the owner approves this plan.**
