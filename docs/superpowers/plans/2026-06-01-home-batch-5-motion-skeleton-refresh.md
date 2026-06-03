# Home Batch 5 — Motion + skeleton + branded pull-to-refresh

**Status:** Owner decisions **LOCKED** (2026-06-01, see §10) — F4 = **F4-c**. Implementation still gated: do NOT start until the owner approves after this plan-doc commit.
**Tier:** 2 (multi-file Home motion). Plan-first per CLAUDE.md.
**Spec:** `docs/superpowers/specs/2026-06-01-home-visual-system-design.md` (Composition B), §10 (motion grammar), §11.1/§11.4 (touch targets / reduced motion), §15 F4 (pull-to-refresh — the open decision this plan resolves).
**Sequence:** Batch 5 of the 5-batch programme (spec §13). Stacks on the local branch `feature/home-batch-1b-card-chip` after `fd74c4e` (Batch 3). **Not pushed, no PR.** (Batch 4 — category grid / illustrations — stays blocked on 3D assets and is NOT this batch.)

---

## 0. Context — what already animates, what folds in here

Batch 5 cascade-applies the §10 motion grammar. A lot is already in place; the motion **toolkit largely exists** in `src/design-system/motion/` and is reduced-motion-safe via `useMotionScale()`.

**Already done (no work):**
- **§10.2 Press feedback** — `PressableScale` (~0.97 + selection haptic) on BranchTile + cards.
- **§10.3 Heart toggle** — `FavouriteHeart` add/remove scale + haptics (Batch 1B).
- **§10.4 Live dot** — `TrendingFlame` (Batch 2).
- **§10.1 Category-grid stagger** — `CategoryGrid` already uses `FadeInDown.delay(i*40).springify()` (reanimated entering). *(Reduced-motion correctness to confirm — see M5.)*

**Existing primitives to WIRE (built, reduced-motion-safe):**
- `SkeletonToContent` (180ms crossfade, instant under reduce-motion) → §10.6.
- `FadeIn` / `FadeInDown` (opacity + translateY, duration 0 under reduce-motion) → §10.1 campaign fade-in.
- `StaggerList` (maps children through `FadeInDown` with a per-item delay) → §10.1 rail stagger.
- `RedeemoLoader` (branded R-logo SVG + orbiting dots) → reusable **R glyph asset** for §10.5.

**To BUILD (genuinely new):**
- **§10.5 Branded pull-to-refresh** (F4-c, LOCKED) — keep the system `RefreshControl`; add a branded `RedeemoLoader` while refreshing (a light wiring task, not a custom build).
- **§10.8 Header scroll-shadow** — deferred from Batch 2 (D5); not built.
- **§10.7 Chrome banner entry motion** — deferred from Batch 3 (D5); `HomeChromeCard` is static (the honesty hint has its exit only).

---

## 1. Goal

Apply the §10 motion grammar to Home so the feed feels alive and branded on load + refresh, while staying calm, purposeful, and fully reduced-motion-safe (spec §10.9: animate only transform/opacity; every animation has a reduced-motion path; decorative motion banned). Headline: a **branded pull-to-refresh** (the Redeemo R), a **skeleton→content crossfade**, **page-load fade/stagger**, a **scroll-driven header shadow**, and **chrome card entry motion** — reusing the existing reduced-motion-safe primitives wherever possible.

**Success:** pull-to-refresh shows the branded R (not the system spinner) under normal motion; skeletons crossfade to content; campaign + rails fade/stagger in on first load; the header gains a hairline+shadow past 16pt scroll; chrome banners animate in; **every** new animation disables cleanly under reduce-motion; no re-stagger jank on refetch; existing Home tests stay green + new motion pins; `tsc` clean.

---

## 2. Current motion audit (per §10)

| § | Spec | Current state | Batch 5 action |
|---|---|---|---|
| 10.1 | Campaign fade-in (200ms) | none | **wire** `FadeIn` around CampaignCarousel |
| 10.1 | Category grid stagger (40ms/tile, max 6) | done (`FadeInDown.springify`) | leave; **confirm reduced-motion** (M5) |
| 10.1 | Rail stagger fade-in L→R (50ms/tile, max 4) | none | **wire** `StaggerList` into the 4 rails, first-mount only |
| 10.2 | Press feedback | done (PressableScale) | none |
| 10.3 | Heart toggle | done (FavouriteHeart) | none |
| 10.4 | Live dot | done (TrendingFlame) | none |
| 10.5 | **Branded pull-to-refresh (R glyph)** | system RefreshControl (rose tint) | **F4-c** — keep RefreshControl + branded `RedeemoLoader` while refreshing |
| 10.6 | Skeleton → content crossfade | plain `isLoading ? skel : content` | **wire** `SkeletonToContent` |
| 10.7 | Chrome banner entry/exit | hint exit only; rest static | **build** entry on `HomeChromeCard` |
| 10.8 | Header scroll-shadow (past 16pt) | none | **build** (deferred Batch 2) |
| 10.9 | Universal rules | mostly upheld | **audit** (M5) |

---

## 3. Approach per piece

- **Skeleton → content (§10.6):** wrap the HomeScreen loading regions in `SkeletonToContent loading={isLoading} skeleton={<SkeletonRow/>}>{realContent}`. Replaces the two `isLoading ? <SkeletonTile/> : …` ternaries. Zero new motion code — the primitive already crossfades 180ms / instant under reduce-motion.
- **Campaign fade-in (§10.1):** wrap `<CampaignCarousel>` in `<FadeIn duration={200}>`. Fires once on mount.
- **Rail stagger (§10.1):** wrap each rail's mapped tiles in `<StaggerList step={50}>` (cap the staggered set at the first **4** tiles; tiles 5+ render immediately to avoid a long cascade). **Must fire first-mount only** — gate so a background refetch doesn't re-stagger the rail (jank). Touches the 4 rail components (FeaturedCarousel / PopularSection / TrendingSection / NearbyByCategory).
- **Header scroll-shadow (§10.8):** drive a Reanimated `useAnimatedScrollHandler` off the HomeScreen ScrollView's `contentOffset.y`; past 16pt, animate a hairline + 1pt shadow under `<HomeHeader>`. Reduced-motion: hairline always visible. Touches HomeScreen (scroll handler + shares the animated value) + HomeHeader (renders the hairline/shadow). Use the Reanimated scroll handler (UI thread), **not** a JS `onScroll`, for perf.
- **Chrome entry motion (§10.7):** add an opt-in entry (`<FadeIn y={12} duration={220}>` ≈ translateY -12→0 + opacity 0→1) to `HomeChromeCard` for `banner`/`empty`/`note`. The `hint` keeps its §DF exit-only contract (no entry). Entry must fire once on mount (not on every conditional re-render).
- **Branded pull-to-refresh (§10.5 / F4):** see §4.

---

## 4. Branded pull-to-refresh — F4 LOCKED = F4-c

Spec §10.5: *"Branded Redeemo R glyph; `mediumImpact()` on threshold; reduced motion → default system spinner."*

**LOCKED (F4-c):** keep the native `RefreshControl` for the pull gesture + trigger + cross-platform reliability, and add a **branded `RedeemoLoader` / R moment while refreshing** (the brand beat). Do NOT build custom overscroll (F4-a) or a gesture-handler pull (F4-b) in this batch — the gesture-driven "R rotates with pull distance" stays a **future upgrade** to revisit after device QA. This makes M4 a low-risk wiring task, not the batch's risk centre.

Concretely:
- Keep `<RefreshControl onRefresh={onRefresh} refreshing={refreshing}>` (rose tint) — it owns the pull + trigger.
- While `refreshing === true`, surface the branded **`RedeemoLoader`** (the R-orbit) as the refresh indicator at the top of the feed (the brand moment). The R glyph asset is `RedeemoLoader` itself — reuse, do not redraw. Device QA decides exact placement / whether to de-emphasise the system spinner so the two don't compete (see §9).
- `mediumImpact()` haptic on the refresh trigger (`onRefresh`).
- **Reduced motion:** the system `RefreshControl` spinner only; `RedeemoLoader` renders in its static (non-animated) reduced-motion state.

Future upgrade (NOT this batch): F4-a/b gesture-driven R rotation, gated behind device-QA appetite.

---

## 5. Reduced-motion / accessibility rules (§10.9 / §11.4)

- Every new animation has a reduced-motion path: skeleton→content instant; FadeIn/Stagger duration 0 (the primitives already do this via `useMotionScale`); header hairline always-visible (no shadow animation); chrome entry instant; pull-to-refresh → system spinner.
- **Confirm** the CategoryGrid raw `FadeInDown.springify()` honours reduce-motion (reanimated layout-entering animations don't always respect the OS flag without `ReducedMotionConfig`). If not, switch it to the `useMotionScale`-gated `StaggerList`/`FadeIn` primitives (M5).
- Animate only `transform` + `opacity` (§10.9). No layout-property animation.
- The live dot (TrendingFlame) remains the only continuous loop on Home; nothing Batch 5 adds loops continuously except the pull-to-refresh **while actively refreshing**.
- Touch targets unaffected (motion is non-interactive overlay/feedback). Pull-to-refresh must not block scrolling or VoiceOver.
- No decorative motion — each animation expresses load / refresh / scroll state.

---

## 6. Exact files likely touched

**New:**
- (Possibly) a small `RefreshingIndicator` wrapper around `RedeemoLoader` in `src/features/home/components/` if the refreshing overlay needs its own gating — otherwise just inline `RedeemoLoader` in HomeScreen. **No custom pull / overscroll / gesture-handler component** (F4-c).

**Modified:**
- `src/features/home/screens/HomeScreen.tsx` — `SkeletonToContent`, campaign `FadeIn`, Reanimated scroll handler (header shadow), keep `RefreshControl` + render the branded `RedeemoLoader` while `refreshing` + `mediumImpact()` on trigger.
- `src/features/home/components/HomeHeader.tsx` — scroll-shadow hairline/shadow (receives the animated scroll value / shadow flag).
- `src/features/home/components/FeaturedCarousel.tsx`, `PopularSection.tsx`, `TrendingSection.tsx`, `NearbyByCategory.tsx` — rail stagger (first-mount only).
- `src/features/home/components/HomeChromeCard.tsx` — entry motion (banner/empty/note).
- `src/features/home/components/CategoryGrid.tsx` — only if M5 needs a reduced-motion fix.
- Reuse (no change expected): `SkeletonToContent`, `FadeIn`, `StaggerList`, `RedeemoLoader`.

**Tests:** new pins per piece + the new pull-to-refresh component; existing Home tests stay green.

---

## 7. Implementation milestones (PAUSE for review at each)

**M1 — Page-load motion (lowest risk, existing primitives).** Skeleton→content (§10.6), campaign fade-in + rail stagger first-mount-only (§10.1). Wiring only.

**M2 — Header scroll-shadow (§10.8).** Reanimated scroll handler → HomeHeader hairline+shadow past 16pt; reduced-motion always-visible. (Closes the deferred Batch 2 item.)

**M3 — Chrome entry motion (§10.7).** `HomeChromeCard` banner/empty/note entry (220ms, translateY -12→0 + opacity); hint stays exit-only. (Closes the deferred Batch 3 item.)

**M4 — Branded pull-to-refresh (§10.5, F4-c).** Keep the native `RefreshControl`; surface the branded `RedeemoLoader` while `refreshing`; `mediumImpact()` on trigger; reduced-motion → system spinner + static loader. Low-risk wiring (no custom overscroll / gesture-handler). Device QA tunes placement so the brand loader + system spinner don't compete.

**M5 — §10.9 universal audit + verification.** Confirm every new animation's reduced-motion path; align CategoryGrid if needed; confirm transform/opacity-only; no re-stagger on refetch; full Home sweep + `tsc`.

---

## 8. Tests

- **Skeleton→content:** loading shows skeleton, loaded shows content (the crossfade itself is hard to assert; pin the conditional render via the primitive's `loading` prop).
- **Campaign fade-in / rail stagger:** render once; assert content present; assert **no re-stagger on refetch** (re-render with new data does not re-mount the stagger wrapper — pin the first-mount gate).
- **Header scroll-shadow:** simulate scroll offset > 16 → shadow/hairline flag on; reduced-motion → always visible (mock `useMotionScale`/reduced-motion).
- **Chrome entry:** `HomeChromeCard` mounts with the entry wrapper for banner/empty/note; hint has NO entry (exit-only preserved). Reduced-motion → instant.
- **Pull-to-refresh:** triggering refresh calls `refetch`/`onRefresh`; `mediumImpact` fires on threshold (mock haptics); reduced-motion path renders the system `RefreshControl`. (Gesture simulation is limited in jest — pin the callback wiring + the reduced-motion branch; the feel is device-QA.)
- **Reduced-motion sweep:** with motion disabled, the new animations are inert (durations 0 / static).
- Full `apps/customer-app/tests/features/home` green; `tsc --noEmit` exit 0. No BranchTile/SearchResultItem/backend test changes.

---

## 9. Device QA checklist

iPhone SE / 13 / 15 Pro Max × normal + reduced-motion:

- [ ] First load: skeletons crossfade to content; campaign fades in; rails stagger L→R (first 4 tiles), calm not janky.
- [ ] **No re-stagger** when pulling to refresh or on background refetch.
- [ ] Pull-to-refresh: native pull works; the branded `RedeemoLoader` R shows while refreshing (and does not visually compete with the system spinner — tune placement); `mediumImpact` on trigger; returns cleanly.
- [ ] Header gains a hairline + subtle shadow past ~16pt scroll; disappears at top.
- [ ] Chrome banners ease in (translateY + opacity); honesty hint still only animates its exit.
- [ ] **Reduced-motion ON:** no stagger, no fade, instant skeleton swap, header hairline always visible, system spinner on refresh, static chrome. Nothing moves except essential state changes.
- [ ] Scrolling stays 60fps (scroll-shadow on the UI thread); pull-to-refresh doesn't fight the scroll.
- [ ] Batch 1B/2/3 visuals unchanged.

---

## 10. Locked owner decisions (approved 2026-06-01)

| # | Decision | LOCKED |
|---|---|---|
| **F4** | Pull-to-refresh | **F4-c** — keep native `RefreshControl`; add a branded `RedeemoLoader` / R moment while refreshing. No custom overscroll / gesture-handler this batch (future upgrade). Reduced-motion → system spinner + static loader. |
| **D-stagger** | Rail stagger scope | First **4** tiles only, **first-mount only** — no re-stagger on refetch. |
| **D-cat** | CategoryGrid | Touch ONLY if the M5 reduced-motion audit proves its current `springify` stagger ignores reduce-motion; otherwise leave unchanged. |
| **D-scope** | Surfaces | Approved — Batch 5 may touch **HomeHeader** (scroll-shadow), the **4 rails** (stagger), and **HomeChromeCard** (entry), motion-additive only. |
| **D-chrome-entry** | Chrome entry variants | `banner` / `empty` / `note` get entry motion; `SavedAreaHonestyHint` stays **exit-only**. |

---

## 11. Out of scope (guardrails)

- **`<BranchTile>`** internals + Batch 1B width constants — untouched (rail stagger wraps the tile, doesn't change it).
- **Category grid / View All / receiving surface / 3D illustrations** (Batch 4, blocked) — Batch 5 touches CategoryGrid ONLY for a possible reduced-motion fix, nothing visual.
- **`<SectionBand>`** + the Batch 2 band visuals — bands don't animate; untouched.
- **HomeChromeCard surfaces / Batch 3 visuals** — Batch 5 adds entry motion only; no surface/typography change.
- Backend / Prisma / wire / Zod / API, `SearchResultItem`, all non-Home surfaces.
- No new continuous loops except pull-to-refresh-while-refreshing (§10.9 — the live dot stays the only idle loop).
- **No push, no PR** until owner approves. Batch 5 commits as its own commit on top of `fd74c4e`.

---

## 12. Definition of done

- F4 + D-decisions answered; M1–M4 implemented, M5 audit done.
- All new motion has a verified reduced-motion path; existing Home tests green + new pins; full Home sweep green; `tsc --noEmit` exit 0.
- Device QA (§9) run by owner; F4 feel judged on device.
- No re-stagger on refetch; transform/opacity-only; Batch 1B/2/3 visuals unchanged.
- Committed as its own commit on top of `fd74c4e`. **No push, no PR until owner approves.**
