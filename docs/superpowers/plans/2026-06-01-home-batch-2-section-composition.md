# Home Batch 2 — Section Composition + Page Paint

**Status:** DRAFT — awaiting owner approval. No implementation until approved.
**Tier:** 2 (multi-file Home UI). Plan-first per CLAUDE.md.
**Spec:** `docs/superpowers/specs/2026-06-01-home-visual-system-design.md` (Composition B), §4, §9.1, §9.2, §9.4, §9.5, §10.1/§10.4, §11.
**Sequence:** Batch 2 of the 5-batch programme (spec §13). Batch 1B landed as local checkpoint commit `a2d00a8` (`feat(home): scale BranchTile card hierarchy`) on `feature/home-batch-1b-card-chip` — **not pushed, no PR**. Batch 2 stacks on top of that commit.

---

## 0. Spec reconciliation note (read first)

The spec was written **before** the Batch 1B Tier 3 device-QA rescale (owner-approved). Where the spec and the committed Batch 1B (`a2d00a8`) disagree, **`a2d00a8` is the current truth and Batch 2 must NOT revert it:**

| Spec says | Committed Batch 1B (`a2d00a8`) — current truth |
|---|---|
| §9.4 Featured tile width **260pt** | **284pt** |
| §9.5 Popular / §9.6 NBC tile width **240pt** | **268pt** |
| §9.7 BranchTile banner **80pt**, name **16pt**, info single line | banner **104pt**, name **18pt**, two-line info (`descriptor·locality` / `distance·proximity`), compact `mi`, logo lifted out of banner |

Batch 2 changes **section chrome around the rails** (paint, bands, header, live dot). It does **not** touch `<BranchTile>` or the rail tile-width constants. The numbers above are noted only so a reviewer does not "correct" Batch 2 back to the stale spec values.

---

## 1. Goal

Make Home read as the "premium sectioned feed" Composition B locks: fix the page paint to white so the section bands can register, give Featured its full-bleed cream identity band and Popular/Trending the brand-warm tint band, modernise the HomeHeader (Mustica greeting, dead Filter button removed, tappable avatar), and correct the Campaign CTA radius. The (already-shipped) Batch 1B tiles then sit inside designed tonal rhythm instead of a flat cream wash.

**Success:** the page is white; Featured sits in a cream band and Popular/Trending in a warm-tint band that are both visible as distinct zones; the greeting is the single Mustica display moment; no dead Filter button; avatar taps through to Profile; campaign CTA uses `radius.md`; all existing Home tests green + new pins for each change; tsc clean.

---

## 2. Scope (in)

1. **Page paint** — `HomeScreen` container background `#FFF9F5` → white (`surface.page`).
2. **HomeHeader** — greeting `heading.md` → Mustica `display.sm`; remove dead Filter button (+ its prop + caller); avatar → tappable (route to Profile **via the app's existing router conventions — verify the real route at impl**), brand-rose→brand-coral gradient, 32→36pt. **Optional / fast-follow:** scroll-driven hairline/shadow under header (Reanimated, reduced-motion = always visible) — see §4 M2 + D5; must not delay core Batch 2 value.
3. **Featured section** — wrap in full-bleed cream identity band (`#FFF9F5 → #FCF0E5` vertical gradient).
4. **Popular / Trending section** — remove off-palette amber wrapper (`#FFF7ED → #FEF3C7`); add full-bleed warm-tint band (`#FFFBF6 → #FFF5E6` + 1px brand-coral-tinted hairline top+bottom); add brand-coral live dot before the rail title (spring pulse, reduced-motion-safe); subtitle copy.
5. **CampaignCarousel** — CTA pill `radius.pill` → `radius.md` (spec §9.2).
6. **Section rhythm/spacing** — tune inter-section spacing so the bands breathe (currently `gap: spacing[5]` on the scroll content).

## 2b. Scope (out — do NOT touch in Batch 2)

- `<BranchTile>` internals and the rail tile-width constants (owned by Batch 1B / `a2d00a8`). Only a **test import or band-wrapper adjustment** may touch a rail file's section chrome — never the tile or its width constant.
- Category grid / View All capsule / receiving surface / illustrations (**Batch 4**, blocked on D3 assets).
- `<HomeChromeCard>` shared primitive + the 5 chrome components (**Batch 3**, blocked on F1).
- Skeletons, branded pull-to-refresh, the full motion system (**Batch 5**) — except the one live-dot motion explicitly in scope here.
- Backend / Prisma / wire / Zod / API. None expected (pure frontend lift per spec §14).
- `SearchResultItem`, Favourites/Map/Voucher/Merchant/Profile/Savings and all non-Home surfaces.
- Notifications bell (stays absent until the notifications system exists — spec §9.1).

---

## 3. Exact files likely touched

**Source (Home only):**
- `apps/customer-app/src/features/home/screens/HomeScreen.tsx` — page paint (`container.backgroundColor`), remove `onFilterPress` caller (line ~245), section-spacing tune, possibly host the Featured/Popular band wrappers if they wrap at screen level rather than inside the section components.
- `apps/customer-app/src/features/home/components/HomeHeader.tsx` — greeting variant, remove Filter `TouchableOpacity` + `onFilterPress` prop + `SlidersHorizontal` import, avatar → tappable gradient + `onAvatarPress`/route, scroll-driven hairline/shadow.
- `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx` — wrap rail in full-bleed cream band. (Stacks on `a2d00a8`'s width-constant change to this file.)
- `apps/customer-app/src/features/home/components/PopularSection.tsx` — replace amber wrapper with warm-tint band; live dot; subtitle. (Stacks on `a2d00a8`.)
- `apps/customer-app/src/features/home/components/TrendingSection.tsx` — same band/live-dot/subtitle treatment; remove the existing `LinearGradient colors={['#FFF7ED','#FEF3C7']}` (line ~43). (Stacks on `a2d00a8`.)
- `apps/customer-app/src/features/home/components/CampaignCarousel.tsx` — CTA `radius.pill` → `radius.md` (line ~194).
- `apps/customer-app/src/features/home/components/RailHeader.tsx` — **decision D3 below**: live-dot slot, and a Mustica title treatment ONLY IF needed. **First verify current `RailHeader` typography** — if it already uses Mustica / the correct display treatment, do NOT churn it. Change RailHeader only if Featured/Popular identity requires it.
- Possibly a small shared band primitive `apps/customer-app/src/features/home/components/SectionBand.tsx` (new) if the cream + warm-tint bands share enough structure to DRY — **decision D4 below**.

**Design-system (reuse, likely no change):**
- `apps/customer-app/src/design-system/motion/PulsingDot.tsx` — existing primitive for the live dot (verify it accepts colour/size props; extend additively only if needed).
- Reduced-motion hook (`useReduceMotion` / design-system equivalent) — verify exact import at impl.
- `color` tokens — confirm `surface.page` (white) exists; today the page cream is the hardcoded literal `#FFF9F5`. Band gradient hexes are literals per spec.

**Tests:** new/updated suites under `apps/customer-app/tests/features/home/` (see §5).

**Route:** avatar tap target → Profile. The implementation **MUST verify the actual Profile route and follow the app's existing router conventions** — Profile is a **tab route** (`app/(app)/profile.tsx`), so do NOT assume a bare `/(app)/profile` push; check how other in-app tab routes are navigated first. HomeScreen passes an `onAvatarPress` that routes, mirroring `onSearchPress`.

---

## 4. Implementation tasks (milestones — PAUSE for review at each per Tier 2)

**M1 — Page paint (smallest, unblocks everything).**
- `HomeScreen.styles.container.backgroundColor` `#FFF9F5` → white via `surface.page` token (verify token; fall back to `#FFFFFF`).
- Verify nothing else relied on the cream page (skeleton rows, safe-area fill). The bands provide the cream now.

**M2 — HomeHeader.**
- Greeting `variant="heading.md"` → Mustica `display.sm` (22/26pt navy, −0.2px tracking per §9.1). Set explicit `lineHeight` to avoid ascender clipping (the §seal-clipping lesson).
- Remove the Filter `TouchableOpacity` (lines ~119–132), the `SlidersHorizontal` import, the `onFilterPress` prop from `Props` + destructure, and the `onFilterPress={() => {}}` caller in HomeScreen (line ~245).
- Avatar: wrap in `PressableScale`/`TouchableOpacity` with `onAvatarPress` routing to Profile **via the app's existing router conventions (verify the real route first — Profile is a tab route, not necessarily a bare `/(app)/profile` push)**; bg navy → brand-rose→brand-coral `LinearGradient`; 32→36pt (image + initial fallback both 36). Keep the existing `avatarUrl` image branch (PR #135 fix) intact.
- **OPTIONAL / fast-follow by default.** Scroll-driven hairline + 1pt shadow under header past 16pt scroll (Reanimated `useAnimatedStyle` on the parent ScrollView's `scrollY`); reduced-motion → hairline always visible. Attempt in M2 ONLY if it stays simple. Do NOT let Reanimated `scrollY` plumbing delay or block the **core Batch 2 value: page paint, section bands, dead Filter removal, avatar tap, and Campaign CTA radius.** If it is not trivial, ship Batch 2 without it and split to a fast-follow.

**M3 — Featured cream identity band.**
- Wrap the Featured section in a full-bleed `LinearGradient` (`#FFF9F5 → #FCF0E5`, vertical). Full-bleed = spans full screen width (sections self-pad horizontally, so a full-width wrapper bleeds edge-to-edge).
- Vertical padding per §9.4 (exact insets = **decision D1**, tune in device QA).
- Keep the rail + RailHeader + tiles unchanged (tile width stays `a2d00a8`'s 284).

**M4 — Popular / Trending warm-tint band + live dot.**
- Remove the amber `LinearGradient` in `TrendingSection` (and any equivalent in `PopularSection`); add the warm-tint band (`#FFFBF6 → #FFF5E6`) with a 1px brand-coral-tinted hairline top + bottom.
- Add the brand-coral live dot before the rail title via `PulsingDot` (spring scale⟷1.15 / opacity⟷0.85, ~1800ms; reduced-motion = static). **Decision D2** governs final behaviour.
- Subtitle copy: `Most-redeemed near you` (Popular) / `Catching on this week` (Trending) — Lato Regular `body.sm` secondary. Copy tunable.
- Both rails get identical band treatment (server-decided swap per D7 — whichever wins the slot).

**M5 — CampaignCarousel CTA radius.**
- CTA pill `radius.pill` → `radius.md` (line ~194). Leave the rest of the carousel (theme overlay, 12s auto-scroll, dot indicator) untouched.

**M6 — Section rhythm + reduced-motion sweep + final verification.**
- Tune inter-section spacing so bands read as paced zones (hierarchy invariant: ≤3 surface treatments per scroll window, spec §4).
- Confirm reduced-motion paths (live dot static, header hairline always-on).
- Full Home sweep + tsc.

---

## 5. Tests

**Unit / component (jest, run from `apps/customer-app`):**
- **HomeHeader**: greeting renders Mustica `display.sm` variant; Filter button + `onFilterPress` are GONE (`queryByLabelText('Filter')` null); avatar is tappable and fires the Profile route (mock router, assert it routes to the verified Profile route per the app's router conventions, not a hardcoded path); avatar 36pt + gradient; `avatarUrl` image branch still renders (regression pin from PR #135).
- **HomeScreen**: container background is white/`surface.page`, NOT `#FFF9F5` (style assertion); no `onFilterPress` prop passed.
- **FeaturedCarousel**: section is wrapped in the cream-band gradient (assert the band testID + gradient colours); rail/tiles still render; tile width unchanged at 284 (light regression pin against accidental revert).
- **PopularSection / TrendingSection**: warm-tint band present; amber `#FFF7ED/#FEF3C7` GONE (negative pin); live dot present (testID); subtitle copy; reduced-motion → static dot (mock reduced-motion).
- **CampaignCarousel**: CTA uses `radius.md` not `radius.pill` (style assertion).
- **Live dot**: reduced-motion static behaviour pinned via the reduced-motion hook mock.

**Cascade / regression:**
- Full `apps/customer-app` jest sweep green (baseline: 277 suites / 2651 tests at `a2d00a8`, the 1 `HomeScreen.dedupRules` timeout is flaky-under-load and passes isolated).
- `tsc --noEmit` exit 0.
- Confirm no `SearchResultItem` / Map / Category test changed (Batch 2 is Home-chrome only; `<BranchTile>` untouched so its cascade suites stay green).

---

## 6. Device QA checklist

Run after implementation, on iPhone SE / 13 / 15 Pro Max × normal + Dynamic Type Largest + reduced-motion:

- [ ] **Page is white**, not cream. Featured cream band + Popular/Trending warm band each read as a distinct zone against white.
- [ ] **Hierarchy invariant**: at most three surface treatments visible per scroll window (white / cream / warm-tint); bands don't visually collide.
- [ ] **Featured band padding** feels right (decision D1) — not cramped, not floating. Full-bleed to both edges, no white slivers.
- [ ] **Popular/Trending band**: brand-coral hairline visible top+bottom; no amber anywhere.
- [ ] **Live dot**: reads as "alive," not restless (decision D2). Static under reduced-motion. Judge keep / dial / remove here.
- [ ] **Greeting** is Mustica, crisp, not clipped at Dynamic Type Largest.
- [ ] **No Filter button**. Search + avatar only on the right.
- [ ] **Avatar taps** through to Profile; gradient + 36pt look intentional; uploaded photo still shows.
- [ ] **Header hairline/shadow** (if shipped — optional / fast-follow) appears on scroll (always-on under reduced motion).
- [ ] **Campaign CTA** is a softer `radius.md` rectangle, not a full pill.
- [ ] Cross-check the **BranchTile** inside the bands still looks correct (Batch 1B unaffected).
- [ ] iPhone SE: bands + header fit; no horizontal overflow from full-bleed wrappers.

---

## 7. Open plan-time decisions

| # | Decision | Default / lean | Blocks |
|---|---|---|---|
| **D1** | **Featured cream-band padding** (exact vertical/horizontal insets; full-bleed confirmed). | Lean: full-bleed horizontal, ~`spacing[5]` vertical; tune in device QA. (Spec D8/F6.) | M3 final |
| **D2** | **Live-dot behaviour** — keep always-on pulse / dial pulse depth / static dot only. | Lean: ship the spring pulse, reduced-motion static; **judge on device** and dial down or replace with static if restless. (Spec D5/F5.) | M4 final |
| **D3** | **Rail-title typography** — does Featured/Popular `RailHeader` need a Mustica / display treatment for band identity? | **First verify current `RailHeader` typography.** If it already uses Mustica / the correct display treatment, do NOT churn it. Change RailHeader ONLY if Featured/Popular identity requires it. Defer NBC titles regardless. | M3/M4 |
| **D4** | **Shared `SectionBand` primitive** vs inline band per section. | Lean: extract a tiny `SectionBand` (cream / warm-tint variants) to DRY and keep the hierarchy rule in one place. | M3/M4 |
| **D5** | **Header scroll-shadow** — Batch 2 or fast-follow? Fiddliest item (Reanimated scrollY plumbing). | **Default: fast-follow.** Attempt in M2 ONLY if trivial. Never let it delay core Batch 2 value (paint, bands, Filter removal, avatar tap, CTA radius). | M2 / fast-follow |
| **D6** | **Subtitle copy** final wording (`Most-redeemed near you` / `Catching on this week`). | Lean: ship suggested copy; tunable. | M4 |

---

## 8. Risk notes — stacking on the local Batch 1B commit (`a2d00a8`)

- **Shared rail files.** `FeaturedCarousel.tsx`, `PopularSection.tsx`, `TrendingSection.tsx` were modified by Batch 1B (`a2d00a8`, committed) and are modified again by Batch 2. Because Batch 1B is **committed**, the Batch 2 diff on these files is a clean delta on top of `a2d00a8` — this is exactly why we checkpointed first. **Do not** revert the Batch 1B width constants (284/268) while adding bands.
- **Two batches co-resident, two PRs.** Working tree will hold the Batch 1B commit + uncommitted Batch 2 changes. When PR time comes, Batch 1B = commit `a2d00a8`; Batch 2 = a second commit. Owner decides whether to open one PR (both) or two stacked PRs. Keep Batch 2 changes in their own commit so the split stays trivial.
- **No push / no PR** until owner approves (standing instruction). Branch `feature/home-batch-1b-card-chip` stays local. (Naming note: the branch name says "batch-1b" but will carry Batch 2 commits too — acceptable for a local stack; rename or branch-off only if the owner wants separate PR branches.)
- **Spec-vs-implementation drift (see §0).** A reviewer reading the spec may flag the wider tiles / taller banner as "wrong" — they are the owner-approved Batch 1B truth. The §0 table is the reconciliation record.
- **Page-paint blast radius.** Changing the container background is low-risk but global to Home; verify the skeleton/loading state and safe-area fill don't depend on the cream (they should read fine on white; the bands carry the warmth).
- **Full-bleed wrappers.** The bands must span full width without introducing horizontal scroll on small screens (SE). Verify no parent imposes horizontal padding that would clip or that a negative-margin full-bleed doesn't overflow.
- **`onFilterPress` removal.** Grep for every caller/consumer of the prop before deleting (HomeScreen passes a no-op today; confirm no test asserts the Filter button exists — update any such test).
- **Live dot reuse.** `PulsingDot` came from the QR/redemption work; confirm it's generic enough (colour/size props) and that adding it to Home doesn't pull unexpected deps. Extend additively only.

---

## 9. Out of scope (explicit, repeated for the reviewer)

Category grid / View All / receiving surface / illustrations (Batch 4); `<HomeChromeCard>` + chrome consolidation (Batch 3); skeletons / pull-to-refresh / broader motion system (Batch 5); `<BranchTile>` internals + tile-width constants (Batch 1B / `a2d00a8`); backend / Prisma / wire / Zod; `SearchResultItem`; all non-Home surfaces; notifications bell.

---

## 10. Definition of done

- M1–M6 implemented; each milestone reviewed.
- All §5 tests written and green; full Home jest sweep green; `tsc --noEmit` exit 0.
- §6 device QA checklist run by owner; D1/D2 (Featured padding, live dot) judged on device.
- Batch 2 committed as its own commit on top of `a2d00a8`. **No push, no PR until owner approves.**
- Docs: if any Home behaviour the customer-flow docs cover changes, update them in the same change (likely none — this is visual chrome).
