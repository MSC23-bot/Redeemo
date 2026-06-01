# Home Batch 4 — Category illustration grid (Model A: app-built cards + transparent illustration layers)

**Status:** Owner decisions **LOCKED** (2026-06-01, see §13). Plan committable now; **Batch 4 implementation is gated until the Batch 5 code commit (`93ec8c7`) is landed AND the owner explicitly approves** — do not start implementation yet.
**Tier:** 2 (Home surface rebuild + asset wiring). Per locked **D-supply**: if the categories endpoint lacks per-context supply data, Batch 4 ships **enabled-only** rendering for v1 (frontend) + records a supply-endpoint follow-up — it does **NOT** auto-escalate to a backend / Tier-3 change.
**Spec:** `docs/superpowers/specs/2026-06-01-home-visual-system-design.md` — §5 (six Home cards), §6 (illustration system), §7 (View All capsule, Option A), §8 (receiving surface + supply-aware rule), §11 (a11y / Dynamic Type), §15 F2/F3 (illustration briefs).
**Visual target:** `apps/customer-app/assets/Generated image 1.png` (locked reference). The app-rendered cards must match it as closely as possible, but with **Redeemo native brand typography + app-rendered text/icons**.
**Sequence:** Batch 4 of the 5-batch programme. Was blocked on illustrations — now unblocked. Stacks on the local branch after `78e4a89` (Batch 5 plan) / the Batch 5 code commit once it lands. **Not pushed, no PR.**

---

## 0. Model A locked (owner decision 2026-06-01)

**Model A** — the app builds the category cards natively; the designer supplies **transparent 3D object illustration layers only** (no card background, no text, no icon). This is the chosen path over whole-card image buttons.

Rationale (owner): preserve the reference look while keeping text live for **localisation + Dynamic Type + native screen-reader**, colour themeable, and the illustration a swappable layer.

**Dual-export note (owner):** the designer may provide BOTH —
- **(a) a full-card visual *reference* export per category** — used only by the developer to visually match the native build against the reference; NOT shipped.
- **(b) a transparent object-layer export per category** — the actual shipped asset the app composites.
Only (b) is wired into the app; (a) is a dev matching aid.

**What Batch 4 replaces:** the current `CategoryGrid` is the Phase 3C.1b **3-column small-tile** grid. Batch 4 rebuilds the Home grid as the **2-column illustrated 6-card grid + the View-All capsule** (§5/§7), and re-skins the `/(app)/categories` receiving surface (§8).

---

## 1. Asset requirements for the designer

Per category, the shipped asset is a **transparent 3D object cluster** positioned in **card-coordinate space**:

- **Transparent background** (RGBA). No card background, no rounded card shape, no category text, no top-left icon.
- **Only** the 3-4 (Home) / 2-3 (category section) 3D objects **+ their soft shadows**.
- **Original positioning preserved on the full canvas** — compose each illustration where it sits *relative to the card* (right ~55-60% of the card, with at least one object protruding past the card edge). **No tight cropping** — keep the full cluster + shadows + protruding bits intact on the canvas.
- A **card-outline template** (provided to the designer, see §2) marks where the card edge + safe zones are on the canvas, so the app's overlay aligns pixel-for-pixel.
- Per-category palette stays in the card's colour family (§5.1 colours below); consistent light direction + render style across all 17; premium, playful-not-childish; soft shadows.

**Categories (slugs = filenames):**
- **6 Home** (`home/`): `food-drink`, `beauty-wellness`, `health-fitness`, `out-about`, `shopping`, `home-local-services`.
- **11 category section** (`categories/`): the 6 above + `health-medical`, `family-kids`, `travel-hotels`, `pet-services`, `auto-garage`.

**Card colours (app-rendered, for the designer's palette reference):** Food & Drink `#E84A00` · Beauty & Wellness `#A78BE5` · Health & Fitness `#DC4B3F` · Out & About `#5B8BE5` · Shopping `#F2B233` · Home & Local Services `#5DBE52`. (Category-section-only categories use their own `pinColour` / a Batch-4-assigned colour.)

---

## 2. Exact canvas sizes + export format

The illustration canvas = **the card bounding box + a uniform transparent "bleed" margin** for protrusion + shadow, so the app overlays it with `overflow: visible` and nothing clips.

| Context | Canvas | Card region within canvas | Notes |
|---|---|---|---|
| **Home (6)** | **1200 × 750 px** (1.6:1) | central **80%** (≈ 960 × 600), leaving **10% (120px W / 75px H) bleed** all around | illustration in the right ~55-60% of the card region; protrusion + shadows live in the bleed; nothing touches the canvas edge |
| **Category section (11)** | **800 × 800 px** (square) OR match the chosen receiving-surface tile aspect (see item 8 / D-recv) | central **80%** | simpler 2-3 hero objects; same family |

- **Format:** PNG, **32-bit RGBA**, lossless, **sRGB**. Optional **WebP (lossless or q90)** for CDN delivery (smaller; expo-image supports alpha WebP).
- **Resolution:** the above are ≈ @3x of the on-screen card; one master per image, downscaled by the app.
- **Template:** ship the designer a layered template (canvas + card rounded-rect outline at the 80% inset + the right-half illustration zone marked) so positioning is consistent across all 17. **The fixed 80%-card / 10%-bleed ratio is load-bearing** — the app's overlay math assumes it; drift breaks alignment. (Ratio **LOCKED, D-canvas**: 80% card / 10% bleed; the designer exports **aligned to the canvas, not tight-cropped to object bounds**. Optional full-card reference exports allowed for matching, but the app ships the transparent object-layer files.)

---

## 3. Naming conventions

- Filenames = category **slug** + `.png` (e.g. `food-drink.png`), matching the lists in §1. Lower-case, hyphenated.
- Folders: `home/` (6) and `categories/` (11). (The optional full-card reference exports go in a separate `_reference/` folder, never shipped.)
- The slug maps to the backend category; the app resolves each category's image via the category record's **`illustrationUrl`** (already on the wire) — see item 10 for bundled-vs-CDN.

---

## 4. App rendering — native card structure (Model A)

Each Home card is composed in React Native as stacked layers inside a tappable wrapper:

```
<Pressable  (PressableScale ~0.97, selection haptic, role=button, a11y label, onPress→/category/{id})
            style={{ overflow: 'visible' }}>            // allow protrusion (item 5)
  <View style={card}>                                   // rounded + clipped: bg gradient + corners
    <LinearGradient colours per §5.1 />                 //   card colour / gradient
    <Icon />                                            //   top-left Lucide stroke glyph (white)
    <Text variant=Mustica />                            //   category name (live, Dynamic Type)
  </View>
  <Image source={illustrationUrl}                       // transparent overlay, NOT clipped
         style={illustrationOverlay} pointerEvents="none" />
</Pressable>
```

- **Card background / gradient:** app-rendered `LinearGradient` (or solid) per the §5.1 colour; rounded 20pt corners; soft navy-tinted drop shadow (§5.2). `overflow: hidden` on the *card* layer so the gradient respects the corners.
- **Text:** app-rendered **Mustica Pro Semibold** category name (~15pt), white, max ~60% card width, max 2 lines (§5.3). Live text → localisable + Dynamic Type + screen-reader-native.
- **Icon:** top-left ~18pt white Lucide-style stroke glyph (from `@/design-system/icons`), per-category (§5.3). App-rendered.
- **Illustration overlay:** `<expo-image>` of the transparent PNG, absolutely positioned to map the illustration's card-coordinate-space onto the card. Because the asset is the card+bleed canvas at the fixed ratio (§2), the app sizes the image to `cardWidth / 0.8` (≈ ×1.25) and offsets by −10% so the card region aligns and the bleed overflows. `pointerEvents="none"` (the wrapper owns the tap).

The card layer is clipped (rounded corners), but the **illustration overlay is a sibling of the card** inside the `overflow: visible` Pressable — so protruding objects render beyond the card edge (item 5).

---

## 5. Preserving protruding objects via `overflow: visible`

- The **tap-target wrapper** (`Pressable`/tile) sets `overflow: 'visible'`, and the **illustration overlay is a sibling of the card** (not a child of the rounded-clipped card). So objects that extend past the card edge into the bleed render on top of the page / into the grid gap.
- The grid lays out the cards at the **card size** (not the canvas size); the bleed extends into the inter-tile gap. **The grid gap must be ≥ the on-screen bleed** so one card's protrusion doesn't collide with its neighbour (D-gap).
- The card layer keeps `overflow: 'hidden'` (for its rounded gradient); ONLY the illustration sibling overflows.

## 6. Avoiding clipping of shadows / objects

- **Asset side:** every object + its shadow stays fully inside the canvas with the 10% bleed; the designer never lets anything touch the canvas edge (§2).
- **App side:** no `overflow: hidden` on the tile wrapper or any ancestor between it and the illustration overlay (audit the parent chain — the HomeScreen ScrollView, the grid container). The Card-layer clip must not wrap the illustration.
- **Z-order:** illustration overlay renders ABOVE the card (after it in the tree) so protrusion sits on top of neighbouring page, not behind.
- Verify on the smallest device (iPhone SE) that bleed doesn't get cut by the screen edge for edge-column tiles (right-column protrusion toward the screen edge is the risk — D-edge).

---

## 7. Home six-card layout

- **Grid:** 2-column × 3-row, the **preferred six** in §5.1 order (Food / Beauty / Fitness / Out&About / Shopping / Home&Local). Tile aspect ~1.6:1, 20pt radius, soft shadow, internal padding 14v/12h (§5.2).
- **Supply-aware availability (§5.1):** if a preferred category is unavailable (disabled or no supply at the user's context), the grid must NOT render a dead tile. **LOCKED (D-home-fallback): substitute** the next enabled/supplied category — **never leave a visual gap**; preserves the 2×3 shape.
- **Press:** `PressableScale ~0.97` + `selectionAsync()`; routes to `/(app)/category/{id}` (§5.4).
- **Mount:** replaces the current `<CategoryGrid>` in `HomeScreen` between Campaign and Featured. The **View-All capsule (item-7b) sits below the grid** (§7.1).

**7b. View-All capsule (§7, Option A locked):** a single full-width capsule below the grid — 5 overlapping 40pt circular gradient thumbnails (Travel / Medical / Family / Auto / Pet, §7.6) + Mustica "Explore all categories" / Lato "Browse offers by category" + a 36pt brand-rose chevron circle. `surface.tint` cream, 1px brand-rose 18%, 20pt radius, soft shadow (§7.3). Whole capsule taps → `/(app)/categories`. **No hard-coded category counts anywhere** (§7.5 locked invariant).

---

## 8. View All / category-section layout (receiving surface, `/(app)/categories`)

Re-skins the existing `/(app)/categories` screen (Phase 3C.1b shipped it as the old "More" destination).

- **Layout:** illustrated cards in the same family as Home, **3-column** per §8.2 (the bottom-half of the reference), larger illustrations; shows **all enabled+supplied categories** (the 11, minus any filtered out).
- **Supply-aware filter (§8.1) — LOCKED (D-supply), frontend-only:** show a category when **(a) `descriptorState !== 'HIDDEN'`** AND **(b) it has supply for the current city/area** (`merchantCountByCity[userCity] > 0` or equivalent). **M0 verifies** `GET /api/v1/customer/categories` exposes enough (the wire carries `descriptorState` + `merchantCountByCity`). **If the data is insufficient: do NOT escalate to backend / Tier 3 — ship enabled-only (`descriptorState !== 'HIDDEN'`) for v1** and record the supply-endpoint follow-up (§13a).
- **Empty state (§8.3):** if < 4 categories remain after filtering → single message + deep link: *"No categories with offers in your area yet. Explore on Home."*
- **Detailed receiving-surface visual** was deferred by the spec (§8.2) to a sub-spec; this plan covers it at layout level. If device QA shows it needs its own deep visual pass, split a short receiving-surface spec.

---

## 9. Accessibility & Dynamic Type

- **Tap targets:** each card / capsule ≥ 44×44 (§11.1).
- **Labels (§11.3):** card `accessibilityRole="button"`, `accessibilityLabel="{category name} category"`; the illustration `<Image>` is decorative (`accessibilityElementsHidden` / `importantForAccessibility="no"`). View-All capsule label `"Explore all categories"`.
- **Live text wins (Model A benefit):** the category name is real text → respects **Dynamic Type** (scales; 2-line clamp, `maxFontSizeMultiplier` per the Home type rules) and is read natively by VoiceOver — unlike baked-image text.
- **Contrast (§11.2):** white text on the bold category fills passes AA at the locked 15pt Mustica (brand-coral + warm-red are the tightest; both pass).
- **Reduced motion:** grid stagger (Batch 5 §10.1) + press feedback already reduced-motion-safe; the illustration is static (no motion).

---

## 10. Loading / performance (bundled vs CDN)

- **LOCKED (D-delivery): bundled local assets for launch.** `require()` the 17 designer transparent **PNG/WebP** files from `assets/`, mapped by slug (instant, offline, crisp; ~2-4 MB bundle cost; renames need a rebuild). The category record's **`illustrationUrl`** is kept as the **forward-compat path** for a later CDN upgrade (expo-image handles either; only the slug→asset map differs).
- **Perf:** use `expo-image` (already standard here) with `contentFit="contain"`, `recyclingKey`, cached placeholder (cream `#FFF6EE`); pre-size to avoid layout thrash; the 6 Home + visible category-section images decode once. No per-frame work.

---

## 11. Tests

- **CategoryCard (Home):** renders gradient/colour for a category; renders the Mustica name + Lucide icon + the illustration `<Image source>` (slug→url); `onPress` routes to `/(app)/category/{id}`; a11y label = `"{name} category"`; image decorative.
- **Home grid:** renders the 6 preferred categories in order; supply fallback (mock an unavailable category → no dead tile per D-home-fallback); View-All capsule present below the grid, routes to `/(app)/categories`, **no count copy** (negative pin on `/\d+ categories|\+\d/`).
- **View-All capsule:** 5 thumbnails, locked copy, chevron not a separate tap target, whole-capsule press routes.
- **Receiving surface:** renders enabled+supplied categories; supply filter drops `HIDDEN` / zero-supply (per chosen D-supply); empty state < 4 categories shows the locked copy + Home deep link.
- **overflow/protrusion:** structural pin that the tile wrapper has `overflow: 'visible'` and the illustration is a sibling of (not inside) the clipped card.
- **a11y / Dynamic Type:** label pins; (Dynamic-Type clamp is device-QA).
- Full Home + categories sweep green; `tsc --noEmit` exit 0. No BranchTile/SectionBand/backend test changes unless D-supply chooses a backend path.

## 12. Device QA checklist

iPhone SE / 13 / 15 Pro Max × normal + Dynamic Type Largest + reduced-motion:

- [ ] Home grid matches `Generated image 1.png` closely (card colours, illustration positions, protrusion) with native Mustica text/icons.
- [ ] Protruding objects render **beyond** the card edge cleanly; soft shadows not clipped; no collision between adjacent tiles (gap ≥ bleed).
- [ ] **iPhone SE right-column protrusion** isn't cut by the screen edge.
- [ ] View-All capsule reads as a capsule (not a 7th tile); thumbnails + chevron correct; routes to categories.
- [ ] Receiving surface: 3-col illustrated grid; only enabled+supplied categories; empty state copy when sparse.
- [ ] Dynamic Type Largest: card names scale + clamp to 2 lines without breaking layout; illustration unaffected.
- [ ] No category-count copy anywhere (§7.5).
- [ ] Reduced motion: grid stagger instant; cards static.
- [ ] Illustration crispness on @3x (Pro Max); load is instant (bundled) or cached (CDN).

## 13. Locked owner decisions + remaining risks (approved 2026-06-01)

| # | Decision | LOCKED |
|---|---|---|
| **D-canvas** | Illustration canvas + ratio | **Home 1200×750, category-section 800×800; 80% card / 10% bleed.** Designer exports **transparent object layers aligned to the canvas** (NOT tight-cropped object bounds). Optional full-card *reference* exports allowed for visual matching, but the app ships the transparent object-layer files. Provide the designer the aligned template. |
| **D-supply** | Supply-aware filter | **Frontend-only** when the categories endpoint exposes enough: show a category when **(a) not `HIDDEN`** AND **(b) it has supply for the current city/area** (`merchantCountByCity` or equivalent). **If the data is insufficient: do NOT escalate to backend/Tier 3 — ship enabled-only rendering for v1** and record a follow-up (§13a). |
| **D-recv** | Receiving-surface layout | **3-column grid** for now. |
| **D-home-fallback** | Unavailable preferred Home category | **Substitute** the next enabled/supplied category. **Never leave a visual gap.** |
| **D-delivery** | Asset delivery | **Bundled local assets** for launch (designer transparent PNG/WebP in the app bundle). CDN / `illustrationUrl` is a later upgrade. |
| **D-gap / D-edge** | Grid gap ≥ on-screen bleed; SE right-column protrusion vs screen edge | Tune in device QA (still open). |

### 13a. Recorded follow-up — supply-aware category endpoint
If M0 finds the categories endpoint lacks reliable per-context supply data, v1 ships **enabled-only** (D-supply) and this follow-up tracks adding a proper supply-aware categories endpoint (or a sibling / supply probe) so the §8.1 "enabled AND has supply at the user's location" rule is fully honoured. Tier 3, brainstorm-first; pick up post-v1.

### Remaining risks
- Reference-match quality depends on the designer keeping consistent positioning / light / scale across all 17 — mitigated by the aligned template + the optional full-card reference export per category.
- The **80% / 10% canvas ratio is load-bearing** for overlay alignment — confirm the designer exports to it before batch export.

---

## 14. Out of scope / guardrails

- **`<BranchTile>`** internals + Batch 1B width constants; **`<SectionBand>`** + Batch 2 band visuals; **`<HomeChromeCard>`** + Batch 3 surfaces; Batch 5 motion files — untouched (Batch 4 adds the grid + capsule + receiving surface only; reuses the existing reduced-motion-safe stagger).
- **Backend / Prisma / wire / Zod** — none unless D-supply explicitly chooses the backend path (then it's a scoped, owner-approved escalation).
- **`SearchResultItem`**, all non-Home/non-categories surfaces.
- **Illustration creation** (owner/designer-owned per §6.2); **brand-asset legal** (owner-owned).
- **No push, no PR** until owner approves. Batch 4 commits as its own commit.

## 15. Implementation milestones (for when approved — PAUSE at each)

- **M0 — Verify** the categories endpoint for enabled + supply data; lock D-supply, D-canvas, D-delivery; confirm the designer template/exports.
- **M1 — `CategoryCard` primitive** (native card: gradient + Mustica text + Lucide icon + transparent illustration overlay + overflow protrusion) + unit tests.
- **M2 — Home 6-card grid** replacing `CategoryGrid` (order, supply fallback, press/route) + the **View-All capsule** (§7).
- **M3 — Receiving surface** `/(app)/categories` re-skin (3-col illustrated grid, supply filter, empty state).
- **M4 — Asset wiring** (bundled slug→asset map or CDN `illustrationUrl`) + perf pass.
- **M5 — a11y / Dynamic Type / reduced-motion + reference-match + verification.**

---

## 16. Definition of done

- D-decisions answered (M0); M1–M4 implemented; M5 audit done; reference-match approved on device.
- All tests green; full Home + categories sweep green; `tsc --noEmit` exit 0.
- No category-count copy; protrusion + shadows render uncut; Dynamic Type + VoiceOver correct (Model A live text).
- Batch 1B/2/3/5 surfaces unchanged.
- Committed as its own commit. **No push, no PR until owner approves.**
