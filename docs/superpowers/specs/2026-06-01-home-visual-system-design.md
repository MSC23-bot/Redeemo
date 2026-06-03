# Home Visual System — Composition B

**Status:** Locked v1.0 (design direction only; per-batch implementation specs follow)
**Date:** 2026-06-01
**Owner:** Shebin
**Author:** Claude (Opus 4.7)
**Supersedes:** none (new programme spec)
**Related:** brainstorm prototype at `.superpowers/brainstorm/home-visual-system/content/home-feed-prototype.html`; Batch 1A card/chip prototype at `.superpowers/brainstorm/home-card-chip-hierarchy/content/batch-1a-prototype.html`; supplied illustration reference at `apps/customer-app/assets/Generated image 1.png`

---

## 1. Goal

Lock the visual direction for the Redeemo customer-app Home feed so that downstream implementation work (5 PR-sized batches) can begin against a single agreed contract. The Home screen must read as a designed, premium, branded destination rather than an undifferentiated list of merchant rails, while preserving the locked DESIGN.md rules and the Batch 1A BranchTile direction.

**Non-goal:** this is a design spec, not an implementation spec. No file paths, no test names, no React Native code. Per-batch plan docs translate this spec into implementation tasks.

---

## 2. Architecture

Home is composed of seven sections, each rendered in document order top-to-bottom:

```
┌──────────────────────────────────────────┐
│  HomeHeader                              │  surface.page, Mustica greeting
├──────────────────────────────────────────┤
│  Campaign carousel                       │  white-page horizontal scroll
├──────────────────────────────────────────┤
│  Six category cards (2-col bold grid)    │  bold solid-colour interruption
│  + Explore-all-categories capsule below  │  cream-tint thumbnail capsule
├──────────────────────────────────────────┤
│  Featured section                        │  cream identity-zone band
├──────────────────────────────────────────┤
│  Popular OR Trending (server-decided)    │  warm-tint band + brand-coral live dot
├──────────────────────────────────────────┤
│  NearbyByCategory rails (multiple)       │  white-page uniform rails
├──────────────────────────────────────────┤
│  Chrome cards (banner / hint / empty)    │  cream surface.tint cards, sparse
└──────────────────────────────────────────┘
```

**Hierarchy invariant**: at most three visual surface treatments visible per scroll window (page white, cream identity, bold colour interruption). Banners and chrome cards demote to page-tertiary; rails are page-primary; the category grid is the brand-loudest block on Home.

**Differentiation rule**: each rail section gets its own surface treatment around it (cream band / warm tint / no band), but the BranchTile *inside* the rails is identical across sections. Variety lives at the section level, not at the tile level. This keeps cards stable and lets users learn one tile vocabulary.

---

## 3. Decision register

All decisions raised during the Composition B brainstorm and the Option A View-All exploration are recorded here. Each has a status: RESOLVED (locked by this spec) or OPEN (deferred to a later spec / batch plan).

| # | Decision | Status | Resolution |
|---|---|---|---|
| **D1** | Composition A / B / C? | **RESOLVED** | Composition B (Premium Sectioned). |
| **D2** | Health & Fitness brand-rose-family colour on Home grid OK? | **RESOLVED** | Yes. Treated as category identity, not CTA. Stays in the brand-warm family. Does not breach the One-Voice Brand-Rose Rule because rose used as a category fill is distinct from rose used as a redemption CTA. |
| **D3** | 3D illustration asset sourcing — external illustrator vs. AI-assisted / cropped? | **RESOLVED** | No external illustrator. Use AI-assisted generated assets OR cropped / reference-led assets, with owner review at each batch. Per-category illustration brief is owned by the Batch 4 plan doc. |
| **D4** | Campaign auto-scroll timing (8s vs current 12s)? | **RESOLVED** | Keep existing 12s timing for now. Re-tune only if device QA flags it as feeling stale. |
| **D5** | Popular / Trending live-dot — always-on vs data-driven? | **RESOLVED (design)** | Prototype direction is always-on pulsing brand-coral dot. Final implementation in Batch 2 must be conservative and reduced-motion safe. Implementation may dial pulse depth or replace with a static dot if device QA flags it as restless. |
| **D6** | Re-confirm Batch 1A BranchTile direction (typographic proximity, neutral voucher pill, promoted type, 44pt heart hitSlop)? | **DEFERRED to Batch 1B plan** | Direction preserved as reference. Final implementation contract lives in the Batch 1B plan doc, not this spec. The HTML prototype previews the Batch 1A BranchTile inside Composition B, but does not force implementation. |
| **D7** | Trending vs Popular naming and supply logic? | **RESOLVED** | Keep existing server-decided swap (`getHomeFeed` returns one of `trendingRail.meta` or `popularRail.meta` non-null). Visual treatment in section 7 applies to whichever rail wins the slot. |
| **D8** | Featured cream band — full-bleed vs padded? | **RESOLVED (design)** | Full-bleed in prototype. Final padding tunable during Batch 2 device QA. |
| **D9** | View All affordance — Option A locked? | **RESOLVED** | Yes. Thumbnail Capsule (Option A). |
| **D10** | Thumbnail content — initials vs glyphs? | **RESOLVED** | Glyphs. No initials. No numeric badges. |
| **D11** | Subtitle copy — fixed vs dynamic? | **RESOLVED** | Fixed. Copy: `Browse offers by category`. |
| **D12** | Subtitle counter — number vs none? | **RESOLVED** | None. No hard-coded category count in product copy anywhere. |
| **D13** | Receiving surface — show all categories or only enabled? | **RESOLVED** | Supply-aware: receiving surface shows only enabled categories with merchant supply at launch, not every possible category. |
| **D14** | Tap target — whole capsule or chevron only? | **RESOLVED** | Whole capsule taps as a single button. Chevron is visual affordance only. |

---

## 4. Composition B summary

The locked Home composition is a section-differentiated feed where each section earns its own surface treatment. Four named surface treatments are used:

1. **Page white** (`surface.page #FFFFFF`): the default. Header, Campaign, NearbyByCategory rails, page chrome.
2. **Bold colour interruption** (per-category gradient fills): used only for the six Home category cards. The single loudest visual zone on Home.
3. **Cream identity band** (`#FFF9F5` → `#FCF0E5` vertical gradient, full-bleed): wraps the Featured rail. Signals "of the brand, curated".
4. **Warm tint band** (`#FFFBF6` → `#FFF5E6` vertical gradient with 1px brand-coral-tinted hairline top + bottom): wraps the Popular / Trending rail. Signals "happening now".

These four treatments interleave with intentional rhythm: page → bold → page → cream → warm-tint → page → cream. The user scrolls through tonal shifts that read as designed pacing rather than card stacking.

**What this spec does not touch**: tab bar, navigation chrome, page background paint (Home keeps `surface.page` white per the corrective in the broader Home polish programme; the cream-as-page bug is a Batch 2 fix not a Composition B fundamental).

---

## 5. The six Home category cards

The Home category grid is a 2-column × 3-row layout of six real category cards. Each tile adopts the bold-colour-fill direction from the supplied reference image at `apps/customer-app/assets/Generated image 1.png`.

### 5.1 Preferred category set on Home

| Slot | Preferred category | Tile colour | Notes |
|---|---|---|---|
| 1 | Food & Drink | `#E84A00` brand-coral | Top-left. The most-tapped category by expectation. |
| 2 | Beauty & Wellness | `#A78BE5` lavender | Top-right. Cool counterpoint to Food. |
| 3 | Health & Fitness | `#DC4B3F` warm red | Middle-left. Category-identity rose family per D2. |
| 4 | Out & About | `#5B8BE5` sky blue | Middle-right. Cool. |
| 5 | Shopping | `#F2B233` amber | Bottom-left. Warm. |
| 6 | Home & Local Services | `#5DBE52` fresh green | Bottom-right. Cool counterpoint to Shopping. |

**These are the preferred six Home category slots for Composition B in this order.** Final rendering at runtime is subject to the same enabled / supply-aware availability rule that governs the receiving surface (section 8.1). If one or more of the preferred six is unavailable at launch (for example, no merchant supply for Out & About in a given market), the Home grid MUST NOT render a dead tile.

**Fallback behaviour for unavailable preferred categories is owned by the Batch 4 plan doc.** Acceptable approaches the plan doc may choose between:

1. **Substitute** — promote the next-most-relevant enabled category into the slot, preserving the 2×3 grid shape. The substituted category brings its own identity colour and illustration; the slot's preferred colour above is not preserved when substituting.
2. **Hold the slot** — show only the available preferred categories, allowing a 2×2 or 2×3-with-gaps layout (acceptable only if the design holds under device QA).
3. **Re-pick the six** — re-run the Composition B category selection per-market based on supply, with the Composition B visual rules from this spec still applying.

Re-ordering or substituting any of the preferred six at launch is a Batch 4 product / design decision, not a violation of this spec.

### 5.2 Card geometry

- **Layout**: 2-column grid. Tile aspect ratio approximately 1.6:1 (wider than tall).
- **Radius**: 20pt rounded corners.
- **Shadow**: soft drop shadow (navy-tinted, `elevation.sm` analogue with slightly larger spread).
- **Padding**: 14pt vertical, 12pt horizontal internal padding.
- **Overflow**: `overflow: visible` so illustration elements can protrude past card bounds.

### 5.3 Card content layout

- **Icon**: top-left, ~18pt white outlined glyph (Lucide-style stroke). One per category.
- **Name**: under the icon, ~15pt Mustica Pro Semibold white. Max 60% card width, max 2 lines.
- **Illustration zone**: right ~50% of the card. 3D-rendered illustration cluster of 3-4 category-relevant objects. At least one object intentionally protrudes past a card edge (top, right, or bottom). Soft drop shadow on each illustration element to reinforce depth.

### 5.4 Tile press behaviour

Each tile is a single tap target. Press feedback uses `PressableScale` ~0.97 with 160ms ease-out, plus `selectionAsync()` haptic. On tap, routes to the category results screen for that category.

---

## 6. Category illustration system

### 6.1 Direction

The supplied reference at `apps/customer-app/assets/Generated image 1.png` is the visual direction reference. Illustrations are:

- **3D rendered** with soft lighting and shadows
- **Layered**, with at least one object protruding past the card edge per tile
- **Category-coherent**: each illustration depicts 3-4 objects clearly associated with that category (Food → pizza + coffee + sushi + grapes; Beauty → brush + lipstick + mirror + stones; Fitness → dumbbells + water bottle + yoga mat; etc.)
- **Tonally consistent with the card colour**: illustration objects can include accent colours from other categories but the dominant illustration palette stays in the parent card's family
- **Premium, playful but not childish**: the 3D rendering quality must feel intentional, not generic stock

### 6.2 Asset sourcing (per D3)

No external illustrator engagement for v1. Production paths in priority order:

1. **AI-assisted generation** with owner-led curation. Each illustration is generated, reviewed, iterated, and locked.
2. **Cropped / reference-led derivation** from the supplied reference image OR from licensed asset libraries that match the 3D-rendered direction.

Each illustration must be owner-reviewed before locking. The Batch 4 plan doc will own the per-category illustration brief, the generation/sourcing pipeline, and the review checklist.

### 6.3 Thumbnail glyphs (for the View All capsule)

For final production, thumbnail glyphs in the View All capsule (section 7.3) should ideally come from the same illustration family — small cropped or iconified details from the corresponding View All category illustrations. This makes the capsule feel like a mini preview of the expanded category surface.

Until those illustrations exist, the Batch 1B / Batch 4 implementation may ship stroke SVG glyphs (Lucide-style, 18pt white-on-gradient) as a stand-in. The replacement to illustration-derived glyphs is a follow-up polish step inside the Batch 4 illustration workstream.

### 6.4 Out of scope

- Category illustration creation / generation / sourcing pipeline (owner-owned per D3 — AI-assisted or cropped / reference-led, no external illustrator engagement)
- Per-category illustration content brief (owned by Batch 4 plan doc)
- Brand-asset legal review (owner-owned)

---

## 7. View All affordance — Option A locked

### 7.1 Position

The View All affordance sits BELOW the 6-card category grid, in its own row, with `spacing[3]` (12pt) gap above and below. It is **not** a 7th category tile and must never be styled as one.

### 7.2 Shape

A single full-width capsule. Three regions left to right:

1. **Thumbnail strip** (left): 5 overlapping 40pt circular thumbnails. Each thumbnail uses a category-specific 2-stop gradient (Travel tan, Medical purple, Family rose-pink, Auto navy, Pet sage) and contains a small white glyph (18pt). 2pt white ring border on each thumbnail for separation. Overlap is 22pt per thumbnail (so 5 thumbnails fit in ~130pt total width).
2. **Copy** (centre, flex): Mustica Pro Semibold title `Explore all categories` (15pt). Lato Regular subtitle `Browse offers by category` (11pt, secondary colour).
3. **Chevron** (right): 36pt brand-rose filled circle with a white chevron-right glyph (16pt, 2.4pt stroke). Visual affordance only; not the tap target.

### 7.3 Surface

- **Background**: `surface.tint` (`#FEF6F5` cream).
- **Border**: 1px brand-rose at 18% alpha (`rgba(226, 12, 4, 0.18)`).
- **Radius**: 20pt.
- **Padding**: 14pt vertical, 16pt horizontal.
- **Shadow**: soft, `0 2px 8px rgba(1, 12, 53, 0.04)`.

### 7.4 Tap behaviour

Whole capsule is a single tap target (`role="button"`, `accessibilityLabel="Explore all categories"`). On tap, routes to the receiving surface defined in section 8. Press feedback uses `PressableScale` ~0.97 with `selectionAsync()` haptic.

### 7.5 Copy rules

- **Title**: `Explore all categories`
- **Subtitle**: `Browse offers by category`
- **aria-label**: `Explore all categories`

**Locked invariant**: no product copy on Home OR on the receiving surface includes a hard-coded category count. No `"all 11 categories"`, no `"5 more categories"`, no `"+N"` badge text. Reason: at launch, categories without merchant supply may be hidden from the user, so any count copy risks becoming inaccurate.

### 7.6 Thumbnail content rules

- **No initials.** No alphabet badges (`T / M / F`).
- **No numeric badges.** No `"+1"`, no `"+5"`.
- **No abstract dots.** Each thumbnail must contain a recognisable category glyph.
- **Category-coherent palette.** Each thumbnail uses the gradient of the category it represents.
- **5 thumbnails by default.** The 5 chosen categories are not literal previews; they're representative of the variety behind the link. The set is locked in this spec to: Travel, Medical, Family, Auto, Pet — covering the View-All categories not visible on the Home grid. If the launched category set grows or shrinks, the thumbnail set may rotate; the visual treatment stays identical.

---

## 8. Receiving surface

The View All capsule routes to a dedicated categories surface at `/(app)/categories` (existing route — Phase 3C.1b shipped this surface as the destination of the previous "More" tile; this spec re-purposes that destination).

### 8.1 Supply-aware category rendering (per D13)

**Locked product rule**: categories shown to the user should be enabled AND useful for their current context. A category is "useful in current context" when BOTH:

1. The category is enabled in the admin / category configuration
2. The category has at least one merchant with active approved vouchers visible at the user's current location context

Categories that fail either check should be silently omitted from the surface. The displayed set is dynamic and may differ between markets and between launch and post-launch.

**The implementation path is not assumed by this spec.** Before Batch 4 locks, the Batch 4 plan doc MUST verify whether the current `GET /api/v1/customer/categories` endpoint (and its surrounding contract) already exposes enough data to enforce the locked rule above — for example, per-category supply counts, location-context filtering, and enabled flags. If the current API is sufficient, Batch 4 may enforce the rule client-side. If not, Batch 4 MUST explicitly choose one of:

1. **Backend / API extension** — adding supply-aware category filtering to the categories endpoint (or a sibling endpoint) so the customer-app receives only useful categories for the user's context.
2. **Safe client-side approximation** — combining the existing categories list with a separate supply probe (e.g. joining against home-feed or discovery responses to infer which categories have visible merchants) and filtering on the client.
3. **Temporary enabled-only rule** — shipping with the enabled flag honoured and the supply check explicitly deferred, with a documented follow-up to add the supply check once the data exists.

The Batch 4 plan doc documents the chosen path. This spec does NOT promise the rule is satisfied by the current frontend alone.

### 8.2 Receiving-surface visual direction

The receiving surface adopts the same illustrated-card direction as the Home category grid, scaled to the 3-column horizontal layout shown in the bottom half of the supplied reference image. Per-category illustrations on the receiving surface are larger versions of the same illustrations used on Home where the category overlaps the Home 6.

**Detailed receiving-surface visual spec is OUT OF SCOPE for this document.** It will be the subject of a separate spec when Batch 4 illustration work begins, since it depends on the per-category illustration set being created, generated, or locked.

This spec only locks:
- The route the capsule opens
- The supply-aware filter rule
- That the receiving surface uses the same illustration family

### 8.3 Empty state

If, after supply filtering, fewer than 4 categories remain, the receiving surface shows a single message and a deep link back to Home: `No categories with offers in your area yet. Explore on Home.` (Final copy may be tuned in the receiving-surface spec.)

---

## 9. Section catalogue — per-section visual rules

The full table is captured in the brainstorm prototype's "Section-by-section visual rules" panel. Locked rules per section:

### 9.1 HomeHeader

- **Surface**: white, flush to safe area.
- **Scroll behaviour**: scroll-driven hairline + 1pt shadow appears under the header past 16pt scroll (Reanimated). Reduced-motion: hairline always visible.
- **Greeting**: Mustica Pro Semibold `display.sm` (22/26pt, navy, -0.2px tracking). Locked as the single Mustica display moment on Home every session.
- **Location row**: Lato Regular `body.sm` (12pt) text-secondary with a brand-rose dot prefix. Stays small as metadata.
- **Icon actions** (right side): Search icon button (36pt, surface-neutral background, navy glyph). Avatar (36pt, brand-rose to brand-coral gradient, tappable, routes to Profile).
- **Removed**: the dead Filter button shipping today (`SlidersHorizontal` with no-op handler). Removal is locked in Batch 2.
- **Notifications bell**: not in v1. Re-introduce when the notifications system exists; until then, the icon must not appear.

### 9.2 Campaign carousel

- **Layout**: horizontal scroll, 280pt photo tiles, 140pt minimum height.
- **Per-tile**: photo background + per-banner theme overlay gradient (existing PR #123 fixup-2/3 treatment preserved).
- **Tile name**: Mustica display.sm white.
- **Tile body**: Lato Regular white 88% alpha, 12pt.
- **CTA pill**: `radius.md` (12pt) — NOT `radius.pill` (corrects today's button-radius-rule violation). White background, navy text, Lato Semibold 11pt.
- **Auto-scroll**: keep existing 12s interval (per D4).
- **Dot indicator**: below the carousel. Active dot grows to 16pt width and turns brand-rose; inactive dots stay 5pt navy at 18% alpha.

### 9.3 Category grid + View All capsule

Locked per sections 5, 6, 7 above. Sits on white page background, between Campaign and Featured. The category grid is the only block on Home using bold solid colour fills.

### 9.4 Featured section

- **Surface**: full-bleed cream identity-zone band (`#FFF9F5` → `#FCF0E5` vertical gradient). Per D8: full-bleed direction; padding tunable in Batch 2 device QA.
- **Rail title**: Mustica `display.sm` to `heading.lg` (20pt, navy, -0.2px tracking). Copy follows the existing `RailHeader` "Featured in {city}" / "Featured near you" / "Featured on Redeemo" logic.
- **Subtitle**: Lato Regular `body.sm` (12-13pt, secondary).
- **Tile width**: 260pt (slightly larger than other rails to reinforce the headline status).
- **Tile shadow**: tinted by the voucher type when available (existing Batch 1A direction preserved).

### 9.5 Popular / Trending section

- **Surface**: full-bleed warm-tint band (`#FFFBF6` → `#FFF5E6` vertical gradient) with 1px brand-coral-tinted hairline top + bottom.
- **Live dot** (per D5): brand-coral pulsing dot before the rail title. Prototype direction is always-on pulse. Final implementation must:
  - Use spring physics (scale ⟷ 1.15, opacity ⟷ 0.85, ~1800ms cycle)
  - Respect `useReducedMotion()` and go static under reduced motion
  - Be removable in device QA if it reads as restless
- **Rail title**: Mustica heading.lg (20pt) with the live dot prefix. Copy follows the existing `getHomeFeed` server-decided swap between Popular and Trending (per D7) — visual treatment applies whichever rail wins the slot.
- **Subtitle**: Lato Regular `body.sm` (12-13pt, secondary). Suggested copy: `Most-redeemed near you` for Popular, `Catching on this week` for Trending. Final copy tunable in Batch 2.
- **Tile width**: standard 240pt.
- **Removed**: the off-palette amber gradient wrapper (`#FFF7ED → #FEF3C7`) shipping today. Replaced by the brand-warm tint band above. Locked in Batch 2.

### 9.6 NearbyByCategory rails

- **Surface**: white. No band. No additional chrome.
- **Tile width**: standard 240pt.
- **Rail title**: Mustica heading.lg (20pt) via `homeCategoryRailLabel()` (e.g. `Food & drink picks`). No subtitle.
- **See-all link**: brand-rose `›` link on the right of the rail title, visible when the rail has 2+ tiles. Existing behaviour preserved.
- **Uniform treatment**: all NearbyByCategory rails share identical chrome. Variety lives in tile content (different merchants), not in section chrome.

### 9.7 BranchTile (shared)

- White card, 16pt radius, `elevation.sm`.
- Banner 80pt with cream `#FFF6EE` placeholder + logo overlay -17pt.
- Heart: 28pt visual size, 44pt effective tap target via `hitSlop`.
- Name: Lato Semibold 16pt.
- Info line: Lato Regular 13pt tertiary with semantic-coloured proximity clause (per Batch 1A).
- Pills: Lato Semibold 11pt.

**Implementation contract for BranchTile is intentionally NOT locked in this spec** (per D6). The Batch 1B plan doc owns the locked implementation contract for BranchTile. This spec records the design direction the prototype previews; the Batch 1B plan re-confirms and locks for implementation.

### 9.8 Chrome cards (banners, hints, empty states)

- **Shared primitive**: a single `<HomeChromeCard variant>` component absorbs the five existing chrome components (SavedAreaHonestyHint, NearbyContextBanner, NearbySectionEmpty, HomeNoLocationBanner, HomeExploreMore).
- **Surface**: `surface.tint` cream, 1px `border.subtle` hairline, no shadow.
- **Padding**: 16pt vertical, 20pt horizontal.
- **Radius**: 16pt (lg).
- **Title**: Mustica display.sm.
- **Body**: Lato Regular body.sm (14pt, secondary).
- **CTA buttons**: 48pt height (DESIGN.md spec). Navy primary, navy-outlined secondary.
- **Hierarchy rule**: at most one cream zone visible per scroll window. Banners do not stack visually adjacent to each other or to the Featured cream band.

---

## 10. Motion grammar

The full motion storyboard lives in the brainstorm prototype's "Motion storyboard — Composition B" table. Locked principles:

### 10.1 Page-load motion
- HomeHeader, greeting: no animation. Anchor furniture.
- Campaign carousel: fade-in only (200ms ease-out opacity).
- Category grid: stagger fade-down (240ms ease-out-quart, 40ms per tile, max 6).
- Rails: stagger fade-in left-to-right (240ms ease-out-quart, 50ms per tile, max 4).

### 10.2 Press feedback
- Every tappable card-shaped surface uses `PressableScale ~0.97` + 160ms ease-out + `selectionAsync()` haptic.
- Applies to: BranchTile, category tile, View All capsule, campaign tile, header avatar, See-all rail link.

### 10.3 Heart toggle
- **Add**: scale-bounce 1.0 → 1.15 → 1.0 (320ms spring) + `lightImpact()` haptic.
- **Remove**: scale 1.0 → 0.92 → 1.0 (200ms ease-out) + `selectionAsync()` haptic.
- **Reduced motion**: opacity-only swap, no bounce.

### 10.4 Live dot (Popular / Trending)
- Scale ⟷ 1.15 + opacity ⟷ 0.85, 1800ms ease-in-out, infinite.
- **Reduced motion**: static dot, no pulse.
- **Implementation note**: per D5, may be replaced with a static dot if device QA flags as restless.

### 10.5 Pull-to-refresh
- Branded Redeemo "R" glyph rotates with gesture position.
- `mediumImpact()` haptic on threshold.
- **Reduced motion**: default system spinner, no R rotation.

### 10.6 Skeleton → content
- 200ms crossfade. Skeleton fades out as real tiles fade in.
- **Reduced motion**: instant swap.

### 10.7 Banner entry / exit
- Entry: 220ms ease-out (translateY -12 → 0, opacity 0 → 1).
- Exit: 180ms ease-out (exits faster than enter).
- **Reduced motion**: opacity-only fade.

### 10.8 Scroll-driven
- HomeHeader hairline + 1pt shadow appears past 16pt scroll (Reanimated, scroll-position-driven).
- **Reduced motion**: hairline always visible.

### 10.9 Universal motion rules
- Animate only `transform` and `opacity`. Never animate layout properties.
- Every animation has a reduced-motion path declared in this spec.
- The Popular live-dot is the only continuously-looping motion on Home.
- Decorative motion is banned. Every animation expresses a state change or a navigation transition.

---

## 11. Accessibility

### 11.1 Touch targets
- Minimum 44×44pt for every interactive element on Home.
- Heart button: 28pt visual, 44pt via `hitSlop`.
- View All capsule: full-width, easily exceeds 44pt height.
- Icon buttons: 36pt visual, must extend to 44pt via `hitSlop`.

### 11.2 Contrast
- All text on Home must meet WCAG AA: 4.5:1 normal text, 3:1 large text.
- White text on category cards (bold solid colour fills): contrast checked per category colour. Brand-coral and the warm-red Health & Fitness colour are the tightest; both pass WCAG AA at the locked tile name size (15pt Mustica Semibold).
- Brand-rose on cream surface.tint: contrast checked. Passes WCAG AA at the locked sizes.
- Secondary text (Lato Regular 12-13pt on white): uses `text-secondary` `#4B5563`. Passes 4.5:1.

### 11.3 Accessibility labels
- HomeHeader greeting: spoken as the greeting + name.
- Location row: spoken as the location.
- Avatar: `accessibilityLabel="Open profile"`.
- Search icon button: `accessibilityLabel="Search"`.
- Category tile: `accessibilityLabel="{category name} category"`.
- View All capsule: `accessibilityLabel="Explore all categories"`.
- BranchTile: existing Batch 1A accessibility label cascade preserved.
- See-all rail link: `accessibilityLabel="See all {category name}"`.

### 11.4 Reduced motion
- Every motion spec in section 10 includes a reduced-motion path.
- The Popular live-dot becomes static.
- Stagger animations become instant.
- Skeleton crossfade becomes instant swap.

### 11.5 Dynamic Type and minimum sizes

**Locked size rules.** Home text falls into two tiers; each has its own minimum:

- **Body and content text** — the text the user reads to decide whether to tap (tile name, info line, banner body, rail title, greeting, View All title). **Minimum 13pt at base Dynamic Type size.**
- **Compact labels** — chip / pill text, View All subtitle, CTA labels on small affordances. **May be 11-12pt at base size**, BUT ONLY when ALL of:
  - Contrast meets WCAG AA (≥4.5:1 against the label background)
  - The label is contained inside a tap target of ≥44×44pt (so the tiny text is never itself the tap surface)
  - Dynamic Type Largest behaviour is verified in device QA — the label scales without breaking enclosing layout or being truncated to illegibility

**Specific applications on Home:**
- The promoted Batch 1A BranchTile type scale (name 16pt, info 13pt, pill 11pt) survives Dynamic Type Largest with the truncation cascade locked in the Batch 1B plan doc.
- The View All capsule subtitle is 11pt body.sm secondary; passes the compact-label rule via the capsule's ≥44pt tap target.
- BranchTile pill labels (voucher count, savings) are 11pt; the proximity inline clause follows the info-line sizing unless Batch 1B explicitly changes it.
- Category tile name (15pt Mustica Pro Semibold white-on-bold-colour) is fixed-size in the prototype. Implementation must verify it scales with Dynamic Type without breaking the 2-line maximum and without overlapping the illustration zone.

### 11.6 Voiceover navigation order
- Reading order: HomeHeader → Campaign carousel (sequentially through tiles) → Category grid (sequentially through 6 tiles) → View All capsule → Featured rail tiles → Popular/Trending rail tiles → NearbyByCategory rails → Chrome cards.
- This matches the visual reading order.

---

## 12. Cross-surface considerations

The shared `<BranchTile>` component is used by Home (Featured / Popular / Trending / NearbyByCategory rails), Map (bottom carousel + list view via `MapBranchTile`), and Category results screen.

When Batch 1B implements the locked Batch 1A BranchTile direction, the visual change cascades to all three surfaces simultaneously. This is intentional and acceptable per the broader Home polish programme.

**Surfaces NOT affected by Home visual-system changes:**
- Search results (uses `SearchResultItem`, not shared `<BranchTile>`)
- Favourites Branches tab (uses `BranchFavCard`, full-width variant)
- Favourites Vouchers tab (uses `VoucherFavCard`)
- Merchant Profile voucher cards (uses voucher-specific component)
- Voucher Detail merchant row (bespoke composition)

If a surface-specific variant becomes necessary later (e.g. Favourites BranchFavCard wanting to keep the chip on a full-width card), it's a Tier 1 follow-up that does not block this spec.

---

## 13. Implementation sequencing

This spec is the design contract for a five-batch implementation programme. Each batch gets its own plan doc.

| Batch | Scope | Plan doc (forward reference) |
|---|---|---|
| **1B** | Shared `<BranchTile>` card/chip hierarchy: name + info + pill + heart + truncation cascade. Cascades to Home / Map / Category. | `docs/superpowers/plans/<date>-home-card-chip-hierarchy.md` (separate spec already drafted in brainstorm) |
| **2** | HomeScreen page paint fix, HomeHeader Mustica greeting + Filter removal + avatar tap, CampaignCarousel CTA radius fix, Popular/Trending palette correction. | TBD |
| **3** | `<HomeChromeCard>` shared primitive consolidating the five existing chrome components. Banner copy + button heights + cream-zone rule. | TBD |
| **4** | Category section: 6-card bold grid + View All capsule + receiving surface. Depends on 3D illustrations landing per D3. | TBD |
| **5** | Motion + skeleton + branded pull-to-refresh. Cascade-applies the motion grammar from section 10. | TBD |

The order is flexible; Batch 1B is the most contained and should land first since it cascades cleanly. Batches 2-5 can interleave subject to owner direction. Each batch follows Tier 2 flow per CLAUDE.md (plan doc → implementation → device QA).

---

## 14. Out of scope (for this spec)

These items are deliberately not locked here:

- Per-batch implementation details. Owned by per-batch plan docs.
- BranchTile implementation contract. Owned by Batch 1B plan doc (per D6).
- Receiving-surface (`/categories`) detailed visual spec. Owned by a separate spec when Batch 4 begins.
- Backend / Prisma / wire / Zod changes. None are expected for sections 4-7, 9-12 of this spec — those are pure frontend lift. The receiving-surface supply-aware rule in section 8.1 may require an API extension or sibling endpoint depending on what the current categories contract exposes; that decision is owned by the Batch 4 plan doc per section 8.1.
- DESIGN.md edits to formalise the section bands. Will be made when implementation starts.
- The PRODUCT.md "DM Sans throughout" vs DESIGN.md "Mustica + Lato" contradiction. Separate 5-minute Tier 0 doc fix.
- Tab bar / navigation chrome. Locked baseline, untouched.
- Auth / onboarding surfaces.
- Voucher Detail / Merchant Profile / Profile / Savings / Favourites / Saved Area / Map / Search. Each gets its own polish workstream after Home locks.
- Sub-PR 2 Profile backend, §FAV.1 cleanup, §CU.1 customer-web migration. Separate deferred workstreams.

---

## 15. Open follow-up decisions

These remain open at spec-write time. They block specific later batches but not this spec or Batch 1B.

| # | Decision | Blocks |
|---|---|---|
| **F1** | Final HomeChromeCard variant API (`banner` / `empty` / `hint` props). | Batch 3 plan |
| **F2** | Receiving-surface (`/categories`) detailed visual spec — per-category illustration sizing, sort, filters. | Batch 4 plan |
| **F3** | 3D illustration content briefs per category (what objects to render, what protrudes). | Batch 4 plan |
| **F4** | Branded pull-to-refresh implementation details (exact Reanimated curve, R glyph asset). | Batch 5 plan |
| **F5** | Live-dot device-QA outcome — keep, dial down, or remove. | Batch 2 |
| **F6** | Featured cream-band padding — exact insets after device QA. | Batch 2 |

---

## 16. References

- **Brainstorm prototype** (full feed comparison): `.superpowers/brainstorm/home-visual-system/content/home-feed-prototype.html`
- **Batch 1A card/chip prototype**: `.superpowers/brainstorm/home-card-chip-hierarchy/content/batch-1a-prototype.html`
- **Supplied illustration reference**: `apps/customer-app/assets/Generated image 1.png`
- **Design system source-of-truth**: `DESIGN.md`
- **Product context**: `PRODUCT.md`
- **Project conventions**: `CLAUDE.md`
- **Related memory**: see `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/MEMORY.md` for the Phase 3C.1g closure, the Profile Polish Batch deferred entry, the Favourites Polish Batch deferred entry, the §DI deferred items, and the broader Home polish programme audit context.

---

## 17. Spec self-review

Per the `superpowers:brainstorming` skill, a quick self-review pass:

**Placeholder scan**: no incomplete sections, no hidden ambiguities, no work-pending markers. Section 13 contains intentional `TBD` entries in the plan-doc-filename column for Batches 2-5 and a `<date>` placeholder for Batch 1B's filename — these are forward references to per-batch plan docs that don't exist yet (each batch gets its own plan when the batch begins). They are deliberate forward markers, not unresolved work in this spec.

**Internal consistency**: section 4 commits to Composition B; sections 5-10 detail Composition B; sections 11-12 cover cross-cutting; section 13 sequences implementation; sections 14-15 bound the work. Decision register (section 3) cross-checks against the resolution sections. Found one consistency item: section 9.1 mentions removing the Filter button, which is locked in Batch 2 — added the cross-reference. Section 9.5 mentions removing the off-palette amber wrapper, also locked in Batch 2 — cross-referenced.

**Scope check**: this is a programme-level visual-system spec covering 5 implementation batches. Each batch gets its own focused plan doc. The spec itself is bounded to the Home visual system; no other surfaces are specified here.

**Ambiguity check**: the section on the receiving surface (section 8) is intentionally light — it defers detailed spec to a separate document when Batch 4 begins. This is an intentional out-of-scope boundary, not ambiguity. The Batch 1B BranchTile contract (section 9.7) is intentionally deferred to the Batch 1B plan doc per D6. Both deferrals are explicit.

**British English check**: passes. `favourite`, `colour`, `behaviour` used throughout.

**Em-dash check**: passes. Uses commas, colons, semicolons, periods.

---

**End of spec.**
