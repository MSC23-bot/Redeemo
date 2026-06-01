# Home Batch 3 — HomeChromeCard / chrome-card consistency

**Status:** Owner decisions D1–D7 **LOCKED** (2026-06-01, see §11). Implementation still gated — do NOT start until the owner approves after this plan-doc commit.
**Tier:** 2 (multi-file Home UI). Plan-first per CLAUDE.md.
**Spec:** `docs/superpowers/specs/2026-06-01-home-visual-system-design.md` (Composition B), §9.8 (chrome cards), §10.7 (banner motion), §11 (a11y / Dynamic Type), §15 F1 (variant API — the open decision this plan resolves).
**Sequence:** Batch 3 of the 5-batch programme (spec §13). Stacks on the local branch `feature/home-batch-1b-card-chip` after `a2d00a8` (Batch 1B), `148fe02` (Batch 2 plan), `514bc24` (Batch 2). **Not pushed, no PR.**

---

## 0. Context after Batch 2 (read first)

Batch 2 made the Home **page white** and introduced two **full-bleed identity bands** (`<SectionBand>`): Featured = cream (`#FFF9F5 → #FCF0E5`), Popular/Trending = warm-tint (`#FFFBF6 → #FFF5E6`). That changes the chrome-card problem in two ways:

1. **Cream-on-cream risk.** The five chrome cards all paint `color.surface.tint` (`#FEF6F5`, a *rose*-leaning cream) — a third, different cream. The **honesty hint mounts directly ABOVE Featured**, so a rose-cream card sits flush against a warm-cream band: two near-identical-but-not-quite cream blocks. Spec §9.8's "at most one cream zone per scroll window; banners do not stack adjacent to the Featured cream band" now has teeth. This is the core thing Batch 3 must solve ("reduce repeated cream-card blur").
2. **Section bands are the loud zones now.** Chrome cards should read as *quiet, intentional* page furniture against white — not compete with the bands.

Batch 3 is a **visual refactor**: consolidate 5 ad-hoc cream cards into one `<HomeChromeCard>` primitive, harmonise their surface/rhythm, and make empty/sparse states feel designed. It does **not** change any HomeScreen mount/dedup logic, copy semantics, or routes.

---

## 1. Goal

Replace five independently-styled Home chrome cards with one consistent `<HomeChromeCard>` primitive so banners, hints, empty and sparse states share a single visual language (surface, radius, border, padding scale, typography, button height, icon slot, motion). Outcomes:

- One cream/card vocabulary — no more drift across radius (md vs lg), border colour (rose vs grey), title font (Lato 16 vs Mustica 18 vs Mustica 20 vs none), body size (13 vs 14), CTA height (all ~32pt today, none at the spec's 48pt), alignment, padding.
- Resolve the cream-on-cream blur against the Batch 2 bands.
- Empty/sparse states feel **intentionally designed** (a tasteful icon anchor + proper hierarchy), not placeholder-y.
- Batch 1B BranchTile and Batch 2 section composition stay **untouched**.

**Success:** all 5 chrome surfaces render through `<HomeChromeCard>`; their existing behaviour (copy, testIDs, routes, dedup, the honesty-hint motion + accent) is preserved; CTA buttons are a consistent 48pt; the cream-blur decision (§11 D2) is implemented; all existing chrome tests stay green + new primitive pins; `tsc` clean.

---

## 2. Current component audit

All five live in `apps/customer-app/src/features/home/components/`. All paint `color.surface.tint` + a 1px border + no shadow, but diverge on everything else:

| Component | Role | Radius | Border | Title | Body | CTAs | Align | Icon | Motion | testID |
|---|---|---|---|---|---|---|---|---|---|---|
| **SavedAreaHonestyHint** (223L) | "location off" honesty hint, ABOVE Featured | `md` | **brand-rose** | "Your location is off" — Lato-SemiBold 16/22 navy (NOT Mustica) | 14/20 secondary, inline city emphasis | whole-row tap + "Update ›" (no button) | left, icon+copy+affordance row | MapPin + ChevronRight (brand-rose) | **slide-up + fade exit** on `source` flip; reduced-motion instant (`useReducedMotion`) | `saved-area-honesty-hint` |
| **HomeNoLocationBanner** (114L) | no-location nudge, top of Home | `lg` | subtle grey | "Set your area…" — Mustica 20 navy | 14/20 secondary | 2 pills (navy / navy-outline), ~32pt, `md` | left | none | none | `home-no-location-banner` |
| **NearbySectionEmpty** (121L) | friendly empty, after NBC | `lg` | subtle grey | "We're still growing near you" — Mustica 18 navy | 14/20 secondary | 2 pills (same), ~32pt | left | none | none | `home-nearby-section-empty` |
| **HomeExploreMore** (77L) | low-weight sparse nudge, page bottom | `lg` | subtle grey | (none) | 14/20 secondary, centred | 1 pill (navy), ~32pt, centred | centre | none | none | `home-explore-more` |
| **NearbyContextBanner** (62L) | minimal "still growing" note, above NBC | `md` | subtle grey | (none) | 13/18 secondary | (none) | left | none | none | `home-nearby-context-banner` |

**Inconsistencies to kill:** radius md↔lg; border rose↔grey; title none/Lato-16/Mustica-18/Mustica-20; body 13↔14; CTA height ~32pt everywhere (spec wants 48pt); padding `spacing[3]`↔`[4]`↔`[5]`↔`[6]`; left↔centre; rose-cream surface vs the Batch 2 warm-cream bands.

**Two are nearly identical** (`HomeNoLocationBanner` ≈ `NearbySectionEmpty`: title + body + 2 CTAs, differing only in padding + title size) — strongest unification candidates.

**HomeScreen mount points (must NOT change):** `HomeNoLocationBanner` above Campaign; `SavedAreaHonestyHint` below it (above Featured); `NearbyContextBanner` above NBC; `NearbySectionEmpty` / `HomeExploreMore` after NBC. Their mutual-exclusion/dedup invariants are enforced in `HomeScreen.tsx` and are **out of scope** — Batch 3 only swaps each card's internals.

---

## 3. Proposed `<HomeChromeCard>` primitive API

A single compositional component with a `variant` that sets sensible defaults, plus slots so the body-only and single-action cards don't each need a bespoke variant.

```tsx
type ChromeAction = {
  label: string
  onPress: () => void
  kind?: 'primary' | 'secondary'   // primary = navy fill; secondary = navy outline
  accessibilityLabel?: string
}

type HomeChromeCardProps = {
  variant: 'hint' | 'banner' | 'empty' | 'note'   // see §4 (F1 decision)
  body: string | React.ReactNode                  // required (the one universal element)
  title?: string                                  // Mustica title (banner/empty); omitted for note
  icon?: React.ReactNode                           // tasteful lucide icon anchor (NOT a 3D illustration — Batch 4)
  actions?: ChromeAction[]                         // 0–2; rendered as 48pt buttons
  inlineAffordance?: { label: string; onPress: () => void }  // hint's whole-card-tap "Update ›"
  tone?: 'neutral' | 'accent'                     // accent = brand-rose hairline (hint default)
  // Surface is NOT a prop — it is set by `variant` per the §11 D2 map:
  // white (surface.page) for hint/banner/note; warm cream for empty.
  align?: 'start' | 'center'                       // ExploreMore = center
  testID?: string
  // Motion is owned by the consumer wrapper (see §6 + D5) — the primitive is
  // presentational. The hint keeps its §DF-locked slide-up exit.
}
```

**Why compositional + variant (not pure variants):** `NearbyContextBanner` (body only) and `HomeExploreMore` (centred single action) are thin specialisations; forcing each into its own rigid variant duplicates layout logic. The slots (`title?`, `icon?`, `actions?`, `inlineAffordance?`, `align?`) express them as a `note`/`empty` with the right slots filled, while `variant` carries the density + tone + title-treatment defaults. This is the F1 resolution proposed below.

**Per-component mapping:**

| Component | variant | surface (D2) | slots used |
|---|---|---|---|
| SavedAreaHonestyHint | `hint` | white + brand-rose hairline | icon (MapPin), title, body (inline emphasis), inlineAffordance ("Update ›"), tone="accent" |
| HomeNoLocationBanner | `banner` | white + neutral hairline | icon (e.g. MapPinOff), title, body, actions: [Allow location (primary), Set my area (secondary)] |
| NearbySectionEmpty | `empty` | warm cream + hairline | icon (e.g. Compass/Sparkles), title, body, actions: [Browse all categories (primary), Open search (secondary)] |
| HomeExploreMore | `note` | white + neutral hairline | body, actions: [Explore more on Redeemo (primary)], align="center" |
| NearbyContextBanner | `note` | white + neutral hairline | body only |

---

## 4. Variants needed (resolves spec §15 F1)

Spec F1 left the variant API open (`banner` / `empty` / `hint`). **LOCKED (D1): four variants** (`hint` / `banner` / `empty` / `note`) — the body-only context note and the centred single-action nudge are real, distinct densities. Surfaces per the §11 D2 map:

- **`hint`** — compact, tappable, low height. **White surface + brand-rose hairline** (`tone="accent"`). Icon + status title (Lato-SemiBold, NOT Mustica — preserves the §DF honesty-hint identity) + body + a whole-card tap with an inline "Update ›" affordance. Owns the §DF slide-up exit motion. *(SavedAreaHonestyHint.)*
- **`banner`** — prominent page-level nudge. **White surface + neutral hairline.** Icon + Mustica `heading.lg` title + body + up to 2 action buttons. Highest padding (≈20/20). *(HomeNoLocationBanner.)*
- **`empty`** — friendly section empty state. **Warm-cream surface + hairline** (the one place cream is reserved — bottom-of-page, not adjacent to a band). Icon + Mustica `heading.lg` title + body + up to 2 action buttons. *(NearbySectionEmpty.)*
- **`note`** — minimal, quiet. **White surface + neutral hairline.** Body only, optionally one centred action. No title. Lowest weight. *(NearbyContextBanner; HomeExploreMore as `note` + one centred action.)*

`banner` and `empty` share one internal layout (title + body + actions) and differ by surface (white vs warm cream) + density — one code path, two presets. Both names kept for call-site clarity (D1).

---

## 5. Typography, spacing, button-height, icon rules

Locked targets (spec §9.8 + §11.5), harmonised across all variants:

- **Surface (LOCKED, D2):** rose-cream `#FEF6F5` is retired as the chrome default. Surface is per-variant — `hint`/`banner`/`note` = **white** (`surface.page`); `empty` = **warm cream** (band family, e.g. `#FFF9F5`). See the §11 D2 surface map. This keeps chrome from blurring into the Batch 2 cream/warm bands, especially the honesty hint directly above Featured.
- **Radius (LOCKED, D3):** `hint` = `radius.md` (12); `banner`/`empty`/`note` = `radius.lg` (16).
- **Border:** 1px hairline, no shadow. Hairline tone: `accent` = `color.brandRose` (hint only); `neutral` = `color.border.subtle` (banner/empty/note).
- **Padding (LOCKED, D7):** `banner`/`empty` ≈ 20/20 (`spacing[5]`); `hint`/`note` ≈ 12/16 (`spacing[3]`/`[4]`). Tunable on device.
- **Title (LOCKED, D4):** `banner`/`empty` titles use Mustica **`heading.lg` (~20pt)** — matching the rail titles and keeping the greeting as the single strongest Mustica display moment (deliberate, owner-approved refinement away from spec §9.8's `display.sm`). `hint` keeps its Lato-SemiBold 16 identity (§DF-locked). `note` has no title.
- **Body:** Lato Regular **14/20**, `color.text.secondary` (unify `NearbyContextBanner`'s 13 → 14). Minimum 13pt per §11.5.
- **Button height:** **48pt** (spec §9.8; today all ~32pt). Primary = navy fill, white Lato-SemiBold 14; secondary = transparent + 1px navy border, navy label. `radius.md`. Two buttons wrap on narrow width (keep `flexWrap`). This is the most visible single change.
- **Icon slot (LOCKED, D6):** a tasteful **Lucide icon** (from `@/design-system/icons`) as a quiet anchor for `banner`/`empty` so they read designed, not placeholder. ~20–24pt, `color.text.tertiary` (or brand-rose for `hint`). **NOT a 3D illustration** — that's Batch 4 (out of scope). The slot is forward-compatible with a future illustration swap.
- **CTA labels:** 14pt Lato-SemiBold (content-tier per §11.5).

---

## 6. Reduced-motion / accessibility rules

- **Motion is presentational-out.** `<HomeChromeCard>` itself renders no looping/decorative motion (spec §10.9: decorative motion banned; the Popular flame is the only continuous loop on Home). Entry/exit motion stays owned by the *consumer* that has the state-transition context.
- **Honesty-hint motion (§DF-locked, preserve exactly):** no mount animation; slide-up + fade **exit** (300ms ease-out) on `source` `'profile' → 'coordinates'`; reduced-motion = instant hide. The `SavedAreaHonestyHint` keeps its `Animated.View` + `useReducedMotion` wrapper and renders `<HomeChromeCard variant="hint">` *inside* it. Do NOT genericise this into the primitive.
- **Entry motion (LOCKED, D5):** NO new banner/empty entry motion in Batch 3 — deferred to Batch 5 (motion system). Chrome cards render **static**. The ONLY motion Batch 3 keeps is the existing `SavedAreaHonestyHint` slide-up exit (§DF-locked). Spec §10.7's 220ms-in/180ms-out banner motion is the future Batch 5 pattern, not Batch 3.
- **Reduced-motion hook:** the codebase has two — `useReducedMotion` (reanimated, used by the hint) and `useMotionScale` (design-system, used by `PulsingDot`/`TrendingFlame`). Batch 3 introduces no new motion, so no new hook usage. (Standardising the two is a separate Tier 1 cleanup, noted out-of-scope.)
- **Touch targets (§11.1):** every action button ≥ 44×44 (the 48pt height satisfies this); the hint's whole-card tap is large. Icon-only affordances get `hitSlop` to 44.
- **A11y labels:** preserve each card's existing `accessibilityRole="button"` + `accessibilityLabel` (hint's composed label, each CTA's label). The primitive forwards `accessibilityLabel` per action and for the hint's whole-card tap.
- **Dynamic Type (§11.5):** body/title are content-tier (≥13pt); CTA labels 14pt. No fixed card heights — cards grow with text. Verify two-button wrap at Largest.
- **Contrast (§11.2):** navy-on-cream, secondary-text-on-cream, brand-rose-on-cream all already pass AA at these sizes (spec §11.2). Re-confirm after the D2 surface decision.

---

## 7. Exact likely files touched

**New:**
- `apps/customer-app/src/features/home/components/HomeChromeCard.tsx` — the primitive.
- `apps/customer-app/tests/features/home/components/HomeChromeCard.test.tsx` — primitive unit tests.

**Modified (refactor internals to render `<HomeChromeCard>`; preserve public API + testIDs + copy + routes):**
- `src/features/home/components/SavedAreaHonestyHint.tsx` (keep its `Animated.View` + motion wrapper; inner card → primitive).
- `src/features/home/components/HomeNoLocationBanner.tsx`
- `src/features/home/components/NearbySectionEmpty.tsx`
- `src/features/home/components/HomeExploreMore.tsx`
- `src/features/home/components/NearbyContextBanner.tsx`

**Tests (update structural assertions only; keep behavioural pins — copy, testIDs, routes):**
- `tests/features/home/SavedAreaHonestyHint.test.tsx`
- `tests/features/home/HomeNoLocationBanner.test.tsx`
- `tests/features/home/NearbySectionEmpty.test.tsx`
- `tests/features/home/HomeExploreMore.test.tsx`
- `tests/features/home/NearbyContextBanner.test.tsx`

**Probably NOT touched:** `HomeScreen.tsx` (mount/dedup logic unchanged; the 5 components keep their signatures). Only touched if the D2 surface/rhythm decision needs a spacing tweak at the mount site — flagged, not assumed. **Design-system:** none expected (reuse existing tokens + `@/design-system/icons`).

---

## 8. Implementation milestones (PAUSE for review at each per Tier 2)

**M1 — Build `<HomeChromeCard>` primitive + unit tests.** All four variants, slots, tokens, 48pt buttons, accent tone, icon slot, align. No consumer migrated yet. Lock the API against D1–D5 owner answers first.

**M2 — Migrate the two low-risk cards: `NearbyContextBanner` (note) + `HomeExploreMore` (note + centred action).** Smallest blast radius; proves the primitive. Keep testIDs + copy + the `/(app)/search` route.

**M3 — Migrate the banner/empty pair: `HomeNoLocationBanner` (banner) + `NearbySectionEmpty` (empty).** Standardise CTAs to 48pt; add the icon anchor; preserve both CTAs' copy + routes (`requestPermission`, `/(auth)/profile-completion/address`, `/(app)/categories`, `/(app)/search`) + testIDs.

**M4 — Migrate `SavedAreaHonestyHint` (hint).** Keep the `Animated.View` + `useReducedMotion` exit wrapper and the §DF-locked contract; move only the inner visual to `<HomeChromeCard variant="hint" tone="accent">`. Preserve `saved-area-honesty-hint` + `-title` + `-body` testIDs, the composed a11y label, the inline-emphasis city, and the `/saved-area` tap.

**M5 — Hierarchy / cream-blur / rhythm + a11y + verification.** Implement the D2 surface decision; ensure no cream-on-cream against the Featured band (the hint sits directly above it); inter-card spacing; reduced-motion + Dynamic-Type + contrast sweep; full Home jest sweep + `tsc`.

---

## 9. Tests

**Primitive (`HomeChromeCard.test.tsx`):**
- Each variant renders body; `title`/`icon`/`actions`/`inlineAffordance` slots render when provided, absent when not.
- `actions` render as **48pt** buttons; primary = navy fill, secondary = navy outline; `onPress` fires; `accessibilityLabel` forwarded.
- `tone="accent"` → brand-rose border; `neutral` → `border.subtle`.
- `align="center"` centres body + action.
- `inlineAffordance` → whole-card press fires its `onPress` + renders the "›" affordance.
- No shadow; `surface` matches the D2 decision.

**Per-component (keep existing behavioural pins green, update structural ones):**
- Copy strings unchanged (all the §8.2 phrase-library locked copy + the §DF "profile location" wording + the honesty-hint title/body split).
- testIDs unchanged (`home-no-location-banner`, `home-nearby-section-empty`, `home-explore-more`, `home-nearby-context-banner`, `saved-area-honesty-hint` + `-title`/`-body`).
- Routes/handlers unchanged (each CTA still pushes the same path / calls `requestPermission`).
- SavedAreaHonestyHint: render gates (source `profile` + areaName present), the exit-on-flip + reduced-motion-instant behaviour, the inline city emphasis, the whole-row `/saved-area` tap — all still pinned.
- NEW: each card now exposes a 48pt CTA (was ~32pt) — pin the new height where a card has actions.

**Sweep:** full `apps/customer-app/tests/features/home` green (run from the app dir); `tsc --noEmit` exit 0. No `SearchResultItem`/Map/Category/BranchTile suite changes.

---

## 10. Device QA checklist

iPhone SE / 13 / 15 Pro Max × normal + Dynamic Type Largest + reduced-motion:

- [ ] All 5 chrome cards share one visual language (radius, border, padding, title, body, button height) — no drift.
- [ ] **No cream-on-cream blur**: the honesty hint above the Featured cream band reads as a distinct element (D2 working).
- [ ] Empty/sparse states feel **designed** (icon anchor + hierarchy), not placeholder-y.
- [ ] CTA buttons are a comfortable 48pt; two-button rows wrap cleanly at Dynamic Type Largest.
- [ ] Honesty hint: still slides up + fades on GPS-grant; instant under reduced motion; "Update ›" tap → Your Location.
- [ ] No-location banner CTAs still: Allow location (permission prompt) + Set my area (address screen).
- [ ] Empty-state CTAs still: Browse all categories + Open search.
- [ ] Explore-more nudge reads lower-weight than the empty state.
- [ ] Batch 2 section bands + Batch 1B tiles visually unchanged.
- [ ] Contrast holds (navy / secondary / brand-rose on the chosen surface).

---

## 11. Locked owner decisions (approved 2026-06-01)

| # | Decision | LOCKED |
|---|---|---|
| **D1** | Variant set | **4 variants: `hint` / `banner` / `empty` / `note`.** |
| **D2** | Cream-blur strategy — deterministic surface-per-variant | Rose-cream `#FEF6F5` is **retired** as the chrome default. Surface is set by variant per the map below. |
| **D3** | Radius | `hint` = `radius.md` (12); `banner` / `empty` / `note` = `radius.lg` (16). |
| **D4** | Title font | `banner` / `empty` titles = Mustica `heading.lg` (~20pt). NOT `display.sm` — the greeting stays the single strongest display moment. `hint` keeps Lato-SemiBold 16. |
| **D5** | Motion | NO new banner/empty entry motion in Batch 3 (deferred to Batch 5). Static, EXCEPT the existing `SavedAreaHonestyHint` slide-up exit is preserved. |
| **D6** | Icons | Tasteful Lucide icon anchors for `banner` / `empty`. No 3D illustrations (Batch 4). |
| **D7** | Padding | `banner` / `empty` ≈ 20/20; `hint` / `note` ≈ 12/16. Tunable on device. |

### D2 surface map (LOCKED, deterministic)

Rose-cream `#FEF6F5` is no longer the default chrome surface. Surface is **determined by variant** so chrome never competes with — or blurs into — the Batch 2 Featured (cream) / Popular-Trending (warm) bands:

| Variant | Surface | Hairline | Why |
|---|---|---|---|
| **hint** | **white** (`surface.page` `#FFFFFF`) | **brand-rose** (accent) | Mounts directly ABOVE the Featured cream band — a white surface prevents cream-on-cream blur, while the brand-rose hairline keeps the §DF honesty-hint identity. |
| **banner** | **white** (`surface.page`) | `border.subtle` (neutral) | Top-of-page nudge; stays quiet against the bands. |
| **note** | **white** (`surface.page`) | `border.subtle` (neutral) | Low-weight context / sparse nudge; recedes. |
| **empty** | **warm cream** (band family, e.g. `#FFF9F5`) | `border.subtle` (or a warm hairline) | The ONE place warm cream is reserved: a true section-level empty state at the BOTTOM of Home (after the white NBC zone), NOT adjacent to any band — cream here makes the state feel designed, not placeholder. |

Device QA may tune the exact warm-cream value + paddings, but the **implementation default is the map above**: white for `hint`/`banner`/`note`; warm cream only for `empty`. The honesty hint directly above Featured therefore renders on white and cannot blur into the Featured cream band.

---

## 12. Out of scope (guardrails — do NOT touch in Batch 3)

- **`<BranchTile>`** internals + Batch 1B width constants (`a2d00a8`).
- **Category grid / View All capsule / receiving surface / 3D illustrations** (Batch 4). Batch 3 uses simple lucide icons only, never illustrations.
- **HomeHeader / `<SectionBand>` / the Batch 2 section composition** — except unavoidable **test/import fallout**. (Note: the HomeHeader avatar a11y label is "Profile" vs spec §11.3 "Open profile" — a pre-existing Tier 0 nit, NOT Batch 3.)
- **Skeletons / pull-to-refresh / the broader motion system / banner entry motion** (Batch 5). The only motion Batch 3 keeps is the honesty hint's existing §DF-locked exit.
- **HomeScreen mount/dedup/mutual-exclusion logic** — unchanged; Batch 3 swaps card internals only.
- **Backend / Prisma / wire / Zod / API**, **`SearchResultItem`**, all **non-Home surfaces**.
- The two reduced-motion hooks (`useReducedMotion` vs `useMotionScale`) standardisation — separate Tier 1 cleanup.
- **No push, no PR** until owner approves. Batch 3 commits as its own commit on top of `514bc24`.

---

## 13. Definition of done

- D1–D7 answered; `<HomeChromeCard>` built (M1) and all 5 cards migrated (M2–M4) with the cream-blur/rhythm pass (M5).
- All existing chrome tests green + new primitive pins; full Home jest sweep green; `tsc --noEmit` exit 0.
- Device QA (§10) run by owner; D2 (cream blur) + D4 (title font) judged on device.
- Behaviour preserved: every card's copy, testIDs, routes, dedup, a11y labels, and the honesty-hint motion/accent.
- Committed as its own commit on top of `514bc24`. **No push, no PR until owner approves.**
