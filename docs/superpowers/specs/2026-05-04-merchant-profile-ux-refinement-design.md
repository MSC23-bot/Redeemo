# Merchant Profile — UX Refinement Design Spec

| Field | Value |
|---|---|
| Status | Draft — awaiting owner review |
| Date | 2026-05-04 |
| Tier | 2 (UX refinement on shipped surface) |
| Owner | @MSC23-bot |
| Builds on | `docs/superpowers/specs/2026-05-02-branch-aware-merchant-profile-design.md` (P1 + P2 implementation shipped via PR #32 + PR #33) |
| Linked memory | `project_branch_first_class_platform_rules.md`, `project_favourites_scope_branch_level.md`, `project_deferred_followups_index.md` §M / §A / §C / §H |

---

## 1. Goal

Close the gap between the data model (branch is the primary unit of experience, vouchers are the core product) and the user's perception on the customer-app Merchant Profile screen. PR #33 made the screen technically branch-aware; this refinement makes it visibly branch-aware AND keeps vouchers as the dominant focal surface so users can never:

- mistake which branch they're viewing
- miss that the branch changed
- struggle to find the switcher
- confuse the Branches tab role with the chip role
- be distracted from voucher content by branch chrome

## 2. Guiding principles

These principles are load-bearing — every section below is a concrete application of one or more.

1. **Vouchers are the primary product.** This page exists for users to discover and redeem vouchers. The header, identity, and branch chrome must support that primary action — not compete with it. No element above the fold should distract from the voucher list. Other tabs (Reviews, Other Locations, About) support decision-making but never override it.
2. **Branch is the primary unit of experience** (locked 2026-05-03). The merchant is a grouping layer for vouchers + brand identity. When merchant-level and branch-level behaviour conflict, branch-level drives the UX.
3. **Reduce ceremony, maximise clarity.** Prefer structural changes over chrome-level toasts/animations when the structure itself can carry the signal.
4. **No new persistent UI without justification.** Sticky elements, banners, badges, and animations must each justify the screen real estate they occupy.
5. **Surface-job-first ordering.** When the same data signals appear in multiple surfaces (meta row, picker rows, Other Locations cards), the *ordering* of those signals reflects each surface's job — not arbitrary consistency. Visual treatment (colours, weights, wording) stays consistent; ordering can differ.

## 3. Scope

This spec covers two passes within one refinement, intended to ship as a single Tier 2 PR:

- **Pass 1 — Core experience** (sections 6.1–6.4): branch identity, switcher chip, Other Locations tab, overall page composition. Tightly interdependent — splitting them would create awkward intermediate states.
- **Pass 2 — Completion** (sections 7.1–7.4): meta row redesign, branch surfaces hierarchy, Reviews tab restructure, Hours CTA resolution. Smaller follow-on items in the same PR.
- **Motion & Transition** (section 8): cross-cutting design rules for every animated element, scoped tightly to subtle / fast / purposeful.
- **Defensive rules** (section 9): missing-data and edge-case copy that the implementation must honour.

## 4. Out of scope (explicit)

The following are deliberately excluded from this refinement and will be picked up in their own dedicated brainstorms. They are tracked in `project_deferred_followups_index.md`:

- **Vouchers tab redesign** — core product surface; needs its own Tier 3 brainstorm. §C
- **About tab — image gallery interaction** — taps currently do nothing; needs a small Tier 2 spec. §H
- **Tags / merchant attributes** (Halal, vegan-friendly, family-friendly, etc.) — header surfacing rule + data model. §M
- **Badges (New / Featured / Trending)** — branch-aware modelling and UI. §M
- **Discovery rebaseline** — search result shape; tile branch-context. §M
- **Favourites scope** — branch-level favourite model and schema rework. `project_favourites_scope_branch_level.md`
- **`Branch.county` schema migration** — Pass 2 uses city-only fallback in the headline. §A / §H
- **`Branch.shortName` schema migration** — Pass 1 uses a frontend strip-prefix rule. §A
- **`BranchOpeningHours` split-hours migration** — Pass 2 ships single-interval frontend stopgap. §A
- **Backend `selectedBranch.statusText` + `isClosingSoon`** — Pass 2 derives these client-side from existing `isOpenNow` + `openingHours`. §A
- **Embedded map preview in `DirectionsSheet`** — sheet stays as "Tap to open map" placeholder. §H
- **`Branch.isMainBranch` removal/repurposing** — backend-only fallback for now. §M
- **Pill text contrast verification** — track as polish; current colours pass eye-test, formal WCAG verification deferred. §H
- **Merchant Portal Phase 4 work** and **analytics events layer** — out of any current customer-app phase.

---

## 5. Quick reference — the locked decisions in one glance

| Decision | Locked value |
|---|---|
| Branch identity placement | Two-line headline: merchant name (display) + branch line (label, brand-red) directly beneath |
| Branch line content | `<city>, <county>` when both available; `<city>` alone when county is null (Pass 1 fallback); empty when neither |
| Switch feedback strategy | Structural change carries it: branch line value changes + parallel motion (see §8) + screen-reader announcement |
| Switcher chip text | "Switch branch ▾" (pure verb, no branch name in chip) |
| Chip placement | Directly under branch line, before descriptor |
| Branches tab name | "Other Locations" — current branch excluded from the list |
| Other Locations card | Mid density, no photo banner, name-first hierarchy, 4 actions (Call · Directions · Hours · Switch →) |
| Tap on Other Locations card body | No-op. Only the explicit "Switch →" button switches. |
| "Hours" button on Other Locations card | Opens `HoursPreviewSheet` (NEW). No page switch. No CTAs in sheet. |
| Suspended branches in Other Locations | Hidden entirely from this tab |
| Page composition (top → bottom) | SuspendedBanner · Hero · Headline · BranchLine · Chip · Descriptor · MetaRow · ActionRow · TabBar (sticky) · TabContent |
| Tab order | Vouchers · About · Other Locations · Reviews |
| Tab bar sticky | Yes; the only sticky element |
| Meta row layout | Single line, status-first (left) + rating block right-anchored |
| Meta row content | Pill + smart status text + de-emphasised distance · ⭐ rating + count |
| Picker row layout | Two lines, name-first; current row pinned at top |
| Reviews tab order | Toggle (top, with per-branch counts) → scope label → ReviewSummary → sort → review cards |
| Time format | am/pm (e.g. "10:30pm") |

---

## 6. Pass 1 — Core experience

### 6.1 Branch identity in the headline

The branch name moves into the page headline as a brand-red second line directly under the merchant name. Replaces the small chip-as-identity-carrier today.

**Layout:**
```
Covelum Restaurant            ← merchant name (display.lg)
Brightlingsea, Essex          ← branch line (label.lg, brand red, weight 700)
[ Switch branch ▾ ]           ← switcher chip (§6.2)
Indian Restaurant             ← descriptor (existing, unchanged)
```

**Branch line content:**
- `<city>, <county>` when `Branch.county` is set (deferred — see §10)
- `<city>` alone when county is null (Pass 1 fallback)
- Empty when both city and county are null (uncommon; defensive)

**Single-branch merchants:**
- Branch line and switcher chip are both hidden when `merchant.branches.length === 1`.
- Page reads as a clean merchant page with no branch chrome.

**Long-name truncation:**
- Each line truncates independently with single-line ellipsis at the container width.
- No tooltip / tap-to-expand affordance.

**Brand-red pairing:**
- Light mode: `#E20C04` on white. Visually verified ~5.07:1 contrast (passes AA).
- Dark mode (when shipped): use the existing `color.brandRoseDark` token (or equivalent) — formal verification deferred to the dark-mode pass.

### 6.2 Switcher chip

**Visual:**
- Text: `Switch branch ▾` — verb + caret only. No branch name. No pin icon.
- Style: tinted background `rgba(226,12,4,0.07)`, 1px border `rgba(226,12,4,0.20)`, 8px radius, ~7×11px padding. Brand red text, weight 600.
- Touch target: ≥48×48pt extended via `hitSlop` if the visual bounds are smaller.

**Placement:**
- Directly under the branch line, before the descriptor.
- Not sticky on scroll. Tab bar stays the only sticky element.

**First-visit caret hint animation:**
- Trigger: first time per session that the user lands on a multi-branch merchant.
- Target: the caret (▾) only — not the chip body.
- Effect: subtle bounce (translateY 0 → -2px → 0) over ~500–600ms.
- Frequency: once per merchant per screen mount (React state; no AsyncStorage).
- Reduced-motion: skipped entirely.

**Single-branch merchants:** chip is not rendered. No regression vs PR #33 fix-up #3.

**Sheet behaviour:** tap → opens `BranchPickerSheet` (existing PR #33 component; row layout updated per §7.2).

### 6.3 "Other Locations" tab

The "Branches" tab is renamed to **Other Locations** and re-scoped: the list excludes the currently-viewed branch. The tab's job is comparison and decision-making about alternatives, not branch switching as a primary path. The chip is the primary switcher; this tab is the secondary surface.

**Visibility:**
- Hidden when the merchant has only one active branch (no others to show).
- Hidden when there are zero *other active* branches (all but current are suspended).
- Shows count badge when visible: `Other Locations (2)`.

**Tab label overflow rule:** when the tab bar can't fit "Other Locations (n)" on a narrow phone, the count is dropped first; the label "Other Locations" stays.

**Card density (locked: Mid):**
- No photo banner per card.
- Name-first hierarchy (see §7.2 for the cross-surface pattern).
- Card actions: Call · Directions · Hours · Switch → (4 buttons, last one filled brand-red, slightly wider).

**Card body tap = no-op.** Only the explicit "Switch →" button switches the page. Action buttons fire their respective actions without switching.

**Card actions:**
1. **📞 Call** — fires phone link for that branch's `phone`. No branch switch.
2. **↗ Directions** — opens `DirectionsSheet` for that branch's address + coords. No branch switch.
3. **🕐 Hours** — opens `HoursPreviewSheet` for that branch's hours. No branch switch.
4. **Switch →** — calls `useBranchSelection.select(branchId)` → URL updates → page re-fetches and re-scopes. Filled brand-red, visually distinct.

**`HoursPreviewSheet` (new component):**
- Bottom sheet (matches existing sheet pattern from PR #33).
- Header: branch name + smart-status pill (right-aligned).
- Body: same week-schedule layout as `OpeningHoursCard`.
- No CTAs inside the sheet — purely informational.
- Empty state: when `openingHours` is empty, render "Hours not available" placeholder text instead of an empty schedule.
- Dismiss: tap outside, swipe down, or close button.

**Sort order:**
- Nearest-first when ALL active branches have lat/lng (GPS available).
- Alphabetical fallback when GPS not available OR any branch is missing lat/lng.
- No "open-first" sort layered on top — too many dimensions confuses scanning.

**Suspended branches:** hidden entirely from this tab. The chip picker may still grey them per the existing branch-aware spec; the Other Locations tab does not.

**Empty state (defensive):** if the tab is shown with zero rendered cards (shouldn't happen with the visibility rule, but defensive), render: "No other locations" + small explainer.

**Stay-on-tab after switch:** when the user taps "Switch →" on a card, the page re-scopes to that branch but the tab stays on Other Locations — which now shows a different set of branches (the just-switched-to one is gone). Same behaviour as today's PR #33 tab-state preservation. Justification: user is in compare-mode; switching is the action; the new "Other Locations" list (now without the just-switched-to branch) is the correct content.

### 6.4 Page composition

The full top-to-bottom layout, locked:

| Order | Element | Sticky? | Notes |
|---|---|---|---|
| 1 | `SuspendedBranchBanner` | no | Conditional (fallback reason = candidate-inactive). Shipped in PR #33. |
| 2 | `HeroSection` | no | Banner + logo + favourite + share. Shipped in PR #33. |
| 3 | Headline (merchant name) | no | display.lg. |
| 4 | Branch line (§6.1) | no | Brand-red label. Hidden for single-branch. Animates on switch (§8). |
| 5 | Switcher chip (§6.2) | no | "Switch branch ▾". Hidden for single-branch. |
| 6 | Descriptor | no | "Indian Restaurant" — unchanged. |
| 7 | Meta row (§7.1) | no | Single line, status-first + rating right. Animates on switch (§8). |
| 8 | Action row | no | Call · Directions · Website. Branch-scoped. Unchanged from PR #33. |
| 9 | TabBar | **yes** | `Vouchers · About · Other Locations · Reviews`. Sticky on scroll. |
| 10 | Tab content | no | Per-tab body. Vouchers active by default. |

**Sticky behaviour: tab bar only.** No additional sticky strip. Users scroll back to top to switch branches — acceptable since branch changes are infrequent compared to scrolling content.

**Tab order:** `Vouchers · About · Other Locations · Reviews` — funnel order. Vouchers first (action target). About second (this branch's info). Other Locations third (alternatives). Reviews fourth (social proof).

**Above-the-fold check:** on a 375×667pt phone with the locked structure, items 1–9 occupy approximately 250–280px of vertical space. The first vouchers in the active Vouchers tab are visible immediately below the sticky tab bar — satisfying the vouchers-as-primary-product principle.

**Sheet inventory:**
- `BranchPickerSheet` — opened by chip
- `ContactSheet` — opened by Call meta-row button
- `DirectionsSheet` — opened by Directions meta-row button
- `HoursPreviewSheet` (NEW) — opened by Hours from Other Locations card
- `WriteReviewSheet` — opened from Reviews tab
- `FreeUserGateModal` — opened on voucher tap by free user

### 6.5 Voucher-context reinforcement (inside the Vouchers tab)

Because voucher cards don't change visually on branch switch (vouchers are merchant-level data; redemption is branch-attributed), a quiet branch-context label sits at the top of the Vouchers tab content. Reinforces the link between branch identity and the offers shown — without competing with the voucher cards themselves.

**Layout:**
```
[ TabBar (sticky) ]
↓
Showing offers for Brightlingsea          ← new label (label.md, color secondary)
[voucher card 1]
[voucher card 2]
...
```

**Rules:**
- Multi-branch merchants only — hidden on single-branch (branch identity is implicit there).
- Quiet single line, small font, color secondary (not brand-red — the headline already carries the brand-red branch line).
- Branch name uses the same prefix-stripped form as the headline branch line (Pass 1 frontend strip-prefix; eventually `Branch.shortName` when migration ships).
- No interaction. Pure status text.
- Hidden when there are 0 vouchers (the empty-vouchers state has its own copy).
- Reinforces the locked principle: redemption is always branch-attributed even though voucher catalogue is merchant-wide. The label answers "where will this voucher redeem?" without the user having to scroll back up.

**Why here and not in the page chrome:** scoping this to the Vouchers tab content keeps the page header lean (per the no-new-persistent-UI principle) and only surfaces the reinforcement when it's relevant — when the user is looking at vouchers.

---

## 7. Pass 2 — Completion

### 7.1 Meta row — single-line balanced layout

**Layout shape:**
```
[ Pill ]  Status text · Distance              ⭐ 4.5 (7)
└── flow left ────────┘                      └─ anchor right
```

`justify-content: space-between` with the left group flowing and the rating block anchoring right. Single line; row padding `12×14px`; inner gap `10–12px`. Values are starting points — tune during visual QA for breathing room (owner direction: err slightly toward more breathing room rather than less).

**Visual hierarchy (four levels):**

| # | Element | Weight | Colour | Role |
|---|---|---|---|---|
| ① | Status pill | strongest (700) | tinted bg + brand-toned text | "Can I act now?" answer |
| ② | Status text | primary (500) | `#222` | Specific time / countdown |
| ④ | Distance | secondary (regular) | `#9CA3AF` (separator `#D1D5DB`) | "How far?" — de-emphasised |
| ③ | Rating block | strong (800) | `#FFF8E1` bg + dark text | Trust signal |

**Status pill set (consistent across all surfaces):**
- Open: green pill, dot indicator, text "Open" — bg `rgba(22,163,74,0.10)`, text `#16A34A`
- Closing soon: amber pill, dot indicator, text "Closing soon" — bg `rgba(245,158,11,0.12)`, text `#B45309`
- Closed: red pill, dot indicator, text "Closed" — bg `rgba(185,28,28,0.08)`, text `#B91C1C`

Pill text contrast formal verification deferred to a polish pass (§4 out of scope; tracked in §H). Eye-test passes; tighten if QA finds issues.

**Status text wording (am/pm, friendly):**

| State | Trigger | Status text |
|---|---|---|
| Open | `isOpenNow=true` and >60 min until close | `Closes at 10:30pm` |
| Closing soon | `isOpenNow=true` and ≤60 min until close | `Closes in 30 min` (countdown) |
| Closed (later today) | `isOpenNow=false`, branch opens later same day | `Opens at 5:00pm` |
| Closed (tomorrow) | `isOpenNow=false`, branch closed for the rest of today | `Opens tomorrow at 9:00am` |
| Closed (split-hours mid-day gap) | `isOpenNow=false` between two same-day intervals | `Opens at 5:00pm` (same shape as later-today) |

**Pluralisation:** singular minute uses "1 min" — `Closes in 1 min`.

**Time format:** am/pm always (e.g. "10:30pm", "5:00pm", "9:00am"). No 24-hour anywhere.

**Distance:**
- Format follows existing PR #28 / #33 rules: metres < 1km, miles 1–100km, hidden ≥100km.
- Hidden when GPS not available.
- Hidden first when the row overflows on narrow phones (graceful overflow rule).

**Rating block:**
- `⭐ 4.5 (7)` — star icon + 800-weight number + smaller (count).
- `#FFF8E1` background, 8px radius.
- Hidden / quiet placeholder when `selectedBranch.reviewCount === 0`. Owner-locked: render quiet "No reviews yet" placeholder text in the rating block's slot.

**Graceful overflow rules (priority order on tight screens):**
1. Drop distance first (de-emphasised; the chip and headline already reinforce location).
2. Truncate status text with single-line ellipsis if still cramped.
3. Pill and rating block always render full — they're the load-bearing signals.

**No-GPS behaviour:** distance disappears; remaining content fills the freed space.

**No-reviews behaviour:** rating block becomes quiet `No reviews yet` placeholder text (`color: #aaa`). Maintains right-side balance.

### 7.2 Branch surfaces hierarchy — name-first for picker rows + Other Locations cards

The same data signals (status pill, smart status text, distance, rating) appear in three surfaces with **different orderings** based on each surface's job. Visual treatment stays consistent; ordering differs.

**Meta row** (status-first, single line) — covered in §7.1. Job: "Can I act on the branch I'm already viewing?"

**Picker rows** (name-first, two lines) — Job: "Which branch is this, and is it any good?"

```
Brightlingsea  [Currently viewing tag]            ⭐ 4.5 (7)
[Open]  Closes at 10:30pm  ·  1.2 mi
```

- Row 1: branch name (left) + rating block (right)
- Row 2: status pill + smart status text + distance
- Currently-viewing row: subtle red tint background `rgba(226,12,4,0.03)` + small inline tag
- **Currently-viewing row pinned at the top of the picker** — sort: current first, then nearest-active, then alphabetical fallback for active branches without GPS, then suspended (greyed, non-tappable) at the bottom (existing PR #33 behaviour preserved).

**Picker tap behaviour:** tap a non-current row → switches branch + dismisses sheet (existing PR #33 behaviour preserved). Tap on the current row → no-op + dismisses sheet.

**Other Locations cards** (name-first, two lines + actions) — Job: "Is this somewhere I want to go?"

```
Covelum — Colchester                              ⭐ 4.0 (1)
[Closing soon]  Closes in 30 min  ·  5.4 mi
[📞 Call]  [↗ Directions]  [🕐 Hours]  [Switch →]
```

- Row 1: branch name + rating block
- Row 2: status pill + smart status text + distance
- Row 3: action buttons (Call · Directions · Hours · Switch →)
- Card body tap = no-op. Only Switch → switches the page.

**Tap-behaviour note (intentional inconsistency):**
Picker rows tap-to-switch (commit-mode) while Other Locations card body is no-op (compare-mode). This is intentional — the picker is opened explicitly to switch; Other Locations is browsed for comparison and accidental taps must not commit. Different surface jobs justify different behaviours.

### 7.3 Reviews tab restructure

**Reorder:** toggle moves to the top. Scope label is added between toggle and breakdown so the user knows what the displayed rating represents before reading it.

**New layout (top → bottom):**
```
[ Brightlingsea (7) ] [ All branches (8) ]   ← toggle
Reviews of Brightlingsea                      ← scope label
4.5 ★★★★★                                     ← average + stars
█████ 5★ (4)
███▒▒ 4★ (2)
▒▒▒▒▒ 3★ (1)
[Most recent ▾]                              ← sort
[review cards]
```

**Toggle text (per-branch counts):**
- `<currentBranchName> (n)` left, `All branches (n)` right
- Counts hidden (no `(n)` suffix) until the backend ships per-branch `BranchTile.reviewCount` (deferred — see §10)
- Hide `(0)` trailing zeros — render branch name alone when zero

**Scope label:**
- Quiet single line, between toggle and ReviewSummary
- Wording: `Reviews of <currentBranchName>` or `All branches`
- Truncates with single-line ellipsis if branch name is long
- Hidden on single-branch merchants (no scope to disambiguate)

**Single-branch merchants:**
- Toggle hidden (PR #33 fix-up #3 already ships this)
- Scope label hidden
- Empty state copy still applies as currently shipped

**Other rules (unchanged from PR #33):**
- Filter persists across chip-driven branch switches
- Sort resets on toggle flip
- "All branches" empty + 0 anywhere → "No reviews yet" + write-review CTA
- Branch-scoped empty + other branches have reviews → "Be the first to review {branch}" + cross-link to flip toggle

### 7.4 Hours CTA — resolved by Pass 1

The original Pass 2 item ("Hours CTA → scroll to Opening Hours section") is fully resolved by Pass 1's `HoursPreviewSheet` decision. Hours information now lives in three surfaces:

| Surface | When | Detail |
|---|---|---|
| Meta row inline | Always (above the fold) | Smart status text — "Closes at 10:30pm" / "Closes in 30 min" / "Opens at 5:00pm" / "Opens tomorrow at 9:00am" |
| About tab — `OpeningHoursCard` | About tab active | Full 7-day schedule for the current branch (existing component from PR #33) |
| `HoursPreviewSheet` | Tap Hours on Other Locations card | Full schedule for that OTHER branch — no page switch |

**No additional Hours CTA is added** to the meta row or anywhere else. The three surfaces above cover quick read (meta row), full-schedule for current (About), and peek-at-other (HoursPreviewSheet).

---

## 8. Motion & Transition

Branch switch is a real state change, but most page content (voucher cards, action row, tab bar) doesn't change on switch. Motion gives the change a felt, physical quality without resorting to heavy or disorienting patterns.

### 8.1 Cross-cutting principles

| Principle | Implication |
|---|---|
| **Subtle by default** | All durations 150–300ms · opacity dips never go to 0 (0.7 → 1.0 ceiling) · scale pulses never exceed 1.04 |
| **Parallel, not sequenced** | Every element animating on the same trigger fires at once — perceived as "the page refreshed" rather than a chain of events. No staggers. |
| **Transform / opacity only** | Honours `transform-performance` rule — never animate width / height / top / left. Reanimated UI-thread driven. |
| **Reduced-motion native** | Every animation has an explicit reduced-motion fallback (almost always: instant value swap, no animation). Honours `prefers-reduced-motion` / `useReducedMotion()`. |
| **No scroll affects** | Nothing changes container heights or scroll offset. Mid-scroll users stay where they are. |
| **Single trigger per event** | One `useEffect` watching `selectedBranch.id` change → fires all switch animations from one place. No drift between elements. |
| **Skip on initial mount** | Switch animations use a `useRef` to detect first paint; first run applies values instantly with no animation. Subsequent changes animate. |
| **Cancel on rapid switching** | If a new branch switch fires before the previous one finishes, the in-progress animation cancels and snaps to its final state, then the new animation runs from there. No stacking, no jitter. |

### 8.2 Animations by event

#### Event: branch switch

Coordinated header-area animations fire in parallel on the same `selectedBranch.id` change:

| # | Element | Effect | Duration | Reduced-motion |
|---|---|---|---|---|
| 1 | Branch line (§6.1) | Background flash `rgba(226,12,4,0.12)` → transparent + scale 1.0 → 1.04 → 1.0 | ~300ms · ease-out | Instant value swap, no flash |
| 2 | Meta row — status text (only) | Brief opacity dip 0.7 → 1.0 as new value applies | ~180ms · ease-out | Instant swap |
| 3 | Meta row — distance (only) | Same opacity dip 0.7 → 1.0 (or hides cleanly if GPS dropped) | ~180ms · ease-out | Instant swap |
| 4 | Chip caret (▾) | Brief 0° → -8° → 0° tilt (acknowledgement nod). **Owner direction: this is the FIRST candidate for removal if the cumulative switch motion feels busy in QA.** Pulling this entry alone leaves the rest of the switch motion intact and is safe to drop without ripple. | ~200ms · spring | Instant — no tilt |

**Deliberately NOT animated on switch:**
- **Status pill** — colour change is its own visual signal; stacking opacity dip on it is over-animation.
- **Rating block** — value changes (rating + count); opacity dip is unnecessary noise on the right anchor.
- **Action row, tab bar, voucher list** — content unchanged or out of focus area.

Net effect: header content area has a coordinated ~300ms re-glaze. Branch line is the loudest signal; meta-row text + distance dip-and-restore reinforces "this whole strip refreshed." Pill and rating change crisply because they're load-bearing identity signals.

#### Event: mid-scroll switch (user is below the fold when switching)

When `ScrollView`'s sticky tab bar is in its sticky position (i.e. user has scrolled past the meta row), the tab bar animates a small confirmation:

| # | Element | Effect | Duration | Reduced-motion |
|---|---|---|---|---|
| 5 | Active tab indicator | One-time thickness pulse: indicator height 2px → 3px → 2px | ~250ms · ease-out | No pulse — value stays at 2px |

Lightweight; behind the meta row when the user is at the top (so not visible there); visible peripherally when sticky-engaged.

#### Event: picker row tap → sheet dismiss → branch switch

Spatial continuity from "tap row" to "page reflects new branch":

| # | Element | Effect | Duration | Reduced-motion |
|---|---|---|---|---|
| 6 | Tapped row in picker | Background tint flash `rgba(226,12,4,0.10)` → transparent (acknowledgement) | ~150ms · ease-out | Instant swap to selected state |
| 7 | Sheet dismiss | Existing system slide-down + backdrop fade (already in design system) | ~250ms · existing curve | Existing reduced-motion behaviour |
| 8 | Switch event animations (1–5 above) | Fire as the sheet starts dismissing — overlap, don't sequence | (per row above) | (per row above) |

Overlap is intentional: by the time the sheet has fully closed, the page behind it has already settled into the new branch.

#### Event: switch from Other Locations card — OPTIONAL reinforcement

When the user taps "Switch →" on an Other Locations card, the page re-scopes (already covered) AND optionally surfaces a brief confirmation toast — distinct from chip-driven switches because the user has navigated away from the chip surface to the Other Locations tab; the chip + branch-line motion may not be visible.

| # | Element | Effect | Duration | Reduced-motion |
|---|---|---|---|---|
| 11 | Confirmation toast | Brief inline banner near the tab bar: `Now viewing {branchName}`. Slide-in from top + fade, auto-dismisses. | enter ~200ms · dwell ~1.8s · exit ~140ms | Static text, longer dwell (~3s), no slide |

**Marked OPTIONAL.** Implementation choice — ship without if the chip-driven switch motion is sufficient in QA. The toast adds chrome the spec generally avoids; the trade-off is "explicit confirmation when the user is in compare-mode and switching from a different surface than the chip." If shipped, the toast NEVER fires for chip-driven switches — only Other Locations Switch → button.

#### Event: tab switch (Vouchers ↔ About ↔ Other Locations ↔ Reviews) — OPTIONAL POLISH

| # | Element | Effect | Duration | Reduced-motion |
|---|---|---|---|---|
| 9 | Tab content area | Cross-fade incoming content from opacity 0 → 1; outgoing fades 1 → 0 | ~150ms · ease-in-out | Instant swap |
| 10 | Tab indicator | Sliding underline that moves between active tabs | ~200ms · ease-out | Instant indicator move |

Marked **optional polish** — not required for core UX. If implementation cost is non-trivial, defer.

#### Event: sheet open / close (Contact, Directions, HoursPreview, BranchPicker)

Reuse existing design-system bottom-sheet motion (already in PR #33). No changes; just affirm consistency. Existing curve respects `exit-faster-than-enter` rule.

#### Event: chip first-visit hint (already locked in §6.2)

Caret bounce ~500–600ms, once per merchant per screen mount, multi-branch only, skipped under reduced-motion.

### 8.3 Performance notes

- All animations use Reanimated `useSharedValue` + `withTiming` / `withSpring`; UI-thread driven, doesn't touch JS thread per frame.
- Switch event: 4 animations share a single timeline (`Animated.parallel()` equivalent in Reanimated). One trigger, one cancellation point.
- Frame budget: 4 transform/opacity updates per frame is well within 60fps. No reflow risk.

---

## 9. Defensive rules — missing-data and edge cases

The smart status logic is bounded by data quality. Until the backend ships split-hours support and `selectedBranch.statusText` (deferred), the following rules apply:

| Scenario | Behaviour |
|---|---|
| `closeTime: null` for today's interval (open day, time missing) | Pill: `Open` (from `isOpenNow`). Status text: `Hours unavailable`. |
| `openTime: null` for tomorrow's interval (closed today, time missing) | Pill: `Closed`. Status text: `Opens tomorrow` (no time). |
| `openingHours: []` (empty array) | Pill: matches `isOpenNow`. Status text: `Hours unavailable`. |
| Branch closed for multiple consecutive days (Mon + Tue both `isClosed: true`, today is Mon) | Frontend stopgap displays `Opens tomorrow at 9:00am` even though branch actually opens Wednesday — known limitation. Backend `statusText` will fix when shipped. Owner-accepted (§10 stopgap). |
| Split-hours venue (12–3 + 5–10 stored as single 12–22:30 interval today) | Status text incorrectly says branch is open during the 3–5pm gap. Known limitation; bounded by the `BranchOpeningHours` schema (deferred). Owner-accepted (§10 stopgap). |
| Currently open + currently within 60 min of close | Pill: `Closing soon` (amber). Status text: `Closes in N min` where N is integer minutes remaining. Singular: `Closes in 1 min`. |
| `reviewCount === 0` on the meta row | Rating block renders quiet `No reviews yet` placeholder text instead of the rating chip. |
| `reviewCount === 0` in picker row right side | Quiet `No reviews yet` placeholder text instead of rating chip. |
| Backend `BranchTile.reviewCount` not yet shipped | Picker rows hide the rating chip; toggle hides the `(n)` count suffix on `<branchName>` and `All branches`. Frontend gracefully degrades to names-only. |
| GPS not available | Distance hidden from meta row, picker rows, Other Locations cards. Sort order falls back to alphabetical for Other Locations. |
| All branches suspended | `AllBranchesUnavailable` early return (existing PR #33 behaviour). No header chrome rendered. |
| Long merchant name AND long branch line both truncate | Each line ellipsis-truncates independently. No tooltip / expand affordance in v1. |
| Long branch name on Other Locations card | Single-line truncation with ellipsis on Row 1. |
| `Other Locations (n)` tab label overflow on narrow phones | Drop the `(n)` count first; keep `Other Locations` label. |

---

## 10. Backend dependencies

This refinement requires **one additive backend change**, the rest is frontend-only:

**Required for full Pass 2 fidelity:**
- **Per-branch `reviewCount` + `avgRating` on `BranchTile`** (§7.2 picker rows, §7.3 toggle counts). Currently only `selectedBranch` carries these. Tracked in §M.
  - Frontend ships with graceful degradation: hide rating chip in picker rows; hide `(n)` count on toggle.

**Frontend stopgaps in this refinement (deferred backend cleanups):**
- `Branch.county` migration — Pass 1 ships with city-only headline fallback. Tracked §A / §H.
- `Branch.shortName` migration — Pass 1 uses frontend strip-prefix (regex `/^.*?[—-]\s*/`). Tracked §A.
- `BranchOpeningHours` split-hours migration — Pass 2 derives smart status from single-interval data; split-hours states are wrong until migration. Tracked §A.
- Backend `selectedBranch.statusText` + `isClosingSoon` — Pass 2 derives client-side from existing `isOpenNow` + `openingHours[today]`. Tracked §A.

---

## 11. Acceptance criteria

A working implementation must demonstrate:

**Pass 1 — Identity:**
- [ ] Multi-branch: headline shows merchant name + brand-red branch line directly beneath.
- [ ] Branch line renders `<city>, <county>` when both available; `<city>` alone when county null; empty when neither.
- [ ] Single-branch: branch line hidden, chip hidden, page renders cleanly.
- [ ] Long merchant + branch names truncate with ellipsis; no horizontal scroll.

**Pass 1 — Switch feedback (motion):**
- [ ] Multi-branch switch: branch line flashes (background pulse + scale 1.04) over ~300ms.
- [ ] Meta row status text + distance opacity-dip 0.7→1.0 over ~180ms in parallel.
- [ ] Chip caret tilts -8° and back over ~200ms.
- [ ] Status pill colour changes crisply (NOT animated — colour is its own signal).
- [ ] Rating block updates crisply (NOT animated).
- [ ] Mid-scroll switch: sticky tab bar's active indicator pulses 2→3→2px over ~250ms.
- [ ] All animations skipped under `prefers-reduced-motion`; values still update instantly.
- [ ] Initial mount: NO animation; values applied instantly.
- [ ] Rapid switching: in-progress animation cancels and snaps to final state before new one starts.
- [ ] Screen reader announces "Now viewing {branch name}" on switch.

**Pass 1 — Chip:**
- [ ] Multi-branch: chip reads "Switch branch ▾".
- [ ] First-visit per session on multi-branch: caret bounces ~500–600ms then stops.
- [ ] Subsequent visits in same session: no caret animation.
- [ ] Single-branch: chip not rendered.
- [ ] Touch target ≥48×48pt.

**Pass 1 — Other Locations tab:**
- [ ] Tab renamed from "Branches" to "Other Locations".
- [ ] Current branch excluded from the list.
- [ ] Tab hidden when 0 other active branches exist.
- [ ] Tab label drops count first when narrow; keeps "Other Locations".
- [ ] Card uses name-first hierarchy (Row 1 = name + rating; Row 2 = pill + status text + distance; Row 3 = actions).
- [ ] Tap on card body = no-op.
- [ ] Tap "Switch →" = page switches; tab stays on Other Locations.
- [ ] Tap "Hours" = HoursPreviewSheet opens with that branch's hours; no page switch.
- [ ] HoursPreviewSheet header shows branch name + smart-status pill.
- [ ] HoursPreviewSheet body shows full week schedule; empty `openingHours` shows "Hours not available".
- [ ] Suspended branches not rendered.
- [ ] Sort: nearest-first when GPS available + all branches have lat/lng; alphabetical fallback otherwise.

**Pass 1 — Page composition:**
- [ ] Vertical order matches the table in §6.4.
- [ ] Tab bar is the only sticky element.
- [ ] Tab order: Vouchers · About · Other Locations · Reviews.
- [ ] Vouchers tab is the default active tab.
- [ ] On a 375px phone, the first voucher card is visible immediately below the sticky tab bar.

**Pass 1 — Voucher-context reinforcement (§6.5):**
- [ ] Multi-branch: "Showing offers for {branchName}" label renders at the top of the Vouchers tab content.
- [ ] Single-branch: label not rendered.
- [ ] Branch name uses the same prefix-stripped form as the headline branch line.
- [ ] Label is single line, color secondary, non-interactive.
- [ ] Hidden when the merchant has 0 vouchers (empty-state copy applies instead).

**Pass 2 — Meta row:**
- [ ] Single line: pill + status text + distance flow left, rating block anchors right.
- [ ] Pill colours: green Open, amber Closing soon, red Closed.
- [ ] Status text uses am/pm with friendly wording per §7.1 table.
- [ ] When `isOpenNow=true` and ≤60 min until close: pill text is `Closing soon` (amber); inline status text is `Closes in N min` (countdown). Singular at 1 min: `Closes in 1 min`.
- [ ] Distance uses `#9CA3AF` colour, separator `#D1D5DB`.
- [ ] Distance hidden when no GPS.
- [ ] Distance dropped first on tight screens.
- [ ] Pill and rating block always render; status text truncates last.
- [ ] No reviews → quiet "No reviews yet" placeholder in rating block slot.

**Pass 2 — Branch surfaces:**
- [ ] Picker rows render name-first two-line layout.
- [ ] Currently-viewing row pinned at top with subtle red tint + inline tag.
- [ ] Picker row tap on non-current → switches branch + dismisses sheet.
- [ ] Other Locations cards render name-first layout with 3-row content (name+rating, pill+text+distance, actions).
- [ ] All three surfaces use the same status pill set, same wording, same distance treatment, same rating block style.

**Pass 2 — Reviews tab:**
- [ ] Toggle rendered above ReviewSummary.
- [ ] Multi-branch: toggle shows `<currentBranchName> (n)` and `All branches (n)`.
- [ ] Scope label rendered between toggle and breakdown: "Reviews of {branch}" or "All branches".
- [ ] Single-branch: toggle and scope label hidden.
- [ ] Filter persists across chip-driven branch switches (existing PR #33 behaviour).
- [ ] Empty states (branch-scoped vs all-branches) match PR #33 behaviour.

**Pass 2 — Hours CTA:**
- [ ] No "View full hours" link added to meta row.
- [ ] Three surfaces (meta row inline · About tab `OpeningHoursCard` · `HoursPreviewSheet`) are the only places hours render.

**Defensive rules (§9):**
- [ ] All scenarios in §9 table render correctly with the specified copy and behaviour.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Voucher cards visually unchanged on branch switch — mid-scroll users may miss the change | Coordinated motion (§8.2 events 1–5) including sticky-tab-bar pulse for mid-scroll. Owner-accepted as a known limitation; auto-scroll to top deliberately rejected. |
| Split-hours venues display incorrect status text | Documented in §9; bounded by `BranchOpeningHours` schema (deferred). Owner-accepted. Seed-data sweep: confirm no seeded merchant has split-hours data that would surface the bug visibly during QA. |
| `BranchTile.reviewCount` not shipped before this refinement | Frontend graceful degradation defined in §10. Picker hides rating chip; toggle hides `(n)` count. Functional without backend; visually richer once it ships. |
| Long branch names cause double truncation in headline | Each line ellipsis-truncates independently. No expand affordance in v1. Acceptable. |
| Pill text contrast formal verification deferred | Eye-test passes in current colour values. Tracked in §H as future polish. If WCAG AA verification fails for green pill, darken text colour (e.g. `#0F8A3D`) — minor change. |
| Rapid branch switching causes animation jitter | Cancel + snap-to-final rule in §8.1. No stacking. |
| Picker bottom-sheet height with many branches | Existing 70%-max-height with internal scroll. "Currently viewing" pinned at top so it's always visible regardless of scroll. |
| Tap-behaviour difference between picker (tap-switch) and Other Locations (tap-no-op) confuses users | Documented in §7.2 with surface-job rationale. Picker = commit-mode (sheet opened explicitly to switch); Other Locations = compare-mode (no accidental switches). |

---

## 13. Implementation note (for the writing-plans skill)

This spec maps to **one Tier 2 PR**, similar shape to PR #33's fix-up rounds. Suggested decomposition for the implementation plan:

1. **Backend** — per-branch `reviewCount` + `avgRating` on `BranchTile` (§10 dependency).
2. **Frontend** — headline restructure: branch line + frontend strip-prefix rule + tests.
3. **Frontend** — switcher chip text + first-visit caret hint animation.
4. **Frontend** — Motion & Transition layer: switch-event animations (branch line flash + meta row dips + chip caret nod), mid-scroll tab-bar pulse, picker row tap acknowledgement. Cancel + skip-on-mount handling.
5. **Frontend** — meta row redesign (single-line balanced, smart status text, am/pm formatter, defensive rules).
6. **Frontend** — picker rows two-line layout; pin "Currently viewing" at top.
7. **Frontend** — tab rename "Other Locations" + restructure (mid density, name-first cards, 4 actions, no card-tap, sort rules).
8. **Frontend** — `HoursPreviewSheet` new component + integration with Other Locations Hours button.
9. **Frontend** — Reviews tab restructure (toggle on top, scope label, per-branch counts with graceful degradation).
10. **Tests** — at each step (component-level + integration via `profile-skeleton.test.tsx` extensions).
11. **On-device QA** — voucher visibility above the fold + switch motion feel + reduced-motion behaviour + defensive empty states.

Detailed planning happens in the writing-plans skill after this spec is approved.

---

## 14. Future polish — track only, do not block

Items intentionally tracked here as "we know about it, we accept it for v1":

- **Chip caret nod (§8.2 entry 4) — first removal candidate.** If the cumulative switch motion feels busy during QA, drop this entry first. Owner direction. Implementation should keep the nod isolated enough that pulling it is a one-line change.
- **Other Locations switch confirmation toast (§8.2 entry 11) — optional.** Ship without if chip-driven switch motion is sufficient; revisit if QA reveals real confusion when switching from the Other Locations tab.
- Tab content cross-fade animation (§8.2 entries 9–10) — optional polish, not required.
- Pill text formal WCAG AA contrast verification (§4 / §H).
- Meta row exact spacing values (§7.1) — owner direction "err toward more breathing room"; tune during visual QA, starting points are `12×14px` padding + `10–12px` gap.
- HoursPreviewSheet vs OpeningHoursCard visual unification — same data, two slightly different containers.
- AsyncStorage-backed first-visit hint persistence — currently per-screen-mount React state; revisit if QA finds the hint annoying.
- Auto-scroll to top on switch — owner-rejected; revisit only if real user confusion is reported.
- Tooltip / expand for double-truncated headline lines — accept truncation in v1.
