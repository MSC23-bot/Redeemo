# Savings Tab — Design Spec

**Date:** 2026-04-18 (Revision 1) / 2026-05-17 (Revision 2 — rebaseline amendment)
**Surface:** Customer App (React Native / Expo)
**Route:** `/(app)/savings`

---

## Revision 2 — 2026-05-17 (Rebaseline amendment)

This spec was originally locked 2026-04-18. The amendments below were locked 2026-05-17 after device QA and product-direction shifts: branch-as-PRIMARY-unit (2026-05-03), §AE5 Voucher Detail 2-hour presentation-window (2026-05-08), §BD-3 structural skeleton design language (2026-05-17), and the post-spec voucher types **TIME_LIMITED** (M4, 2026-05-11) + **REUSABLE** (M5, 2026-05-12). All amendments are applied in-line throughout the spec below; this header is the index of what changed.

| Section | Change |
|---|---|
| State 1 trigger | Dropped `subscription.status === 'FREE'` — free user has no subscription record |
| State 2 / State 3 triggers | Added `'PAST_DUE'` alongside `'ACTIVE' \| 'TRIALLING'` — routes by redemption count; no dedicated rebill CTA in this rebaseline |
| Insight Card 2 | Renamed "Top Places" → "Top branches"; aggregation switched merchant-level → branch-level |
| Backend requirement | Response shape: `byBranch[]` replaces `byMerchant[]` on BOTH `/summary` and `/monthly-detail`; endpoints themselves already shipped 2026-04-18 |
| Redemption history row meta | Branch name added to meta line (e.g. "BOGO · Brightlingsea · 2 hours ago") |
| Badge logic | "Show to staff" pill window: 24h → **2h** to match §AE5 |
| Loading states | SavingsSkeleton: **structural** skeleton (mirrors §BD-3 `MerchantProfileSkeleton`), not generic shimmer |
| NEW — Voucher type handling | See new section "Voucher type handling" near end of doc — TIME_LIMITED + REUSABLE handling rules |

---

## Overview

The Savings tab is a personal financial dashboard and a subscription conversion surface. It serves three distinct user states: free users (subscribe CTA), subscribed users with no redemptions yet (motivation to redeem), and active subscribers with redemption history (full dashboard).

---

## Screen Structure

**Layout:** `FlatList` with `ListHeaderComponent`.  
- Everything above the redemption history (hero header, insight cards, ROI callout) is the `ListHeaderComponent`.
- Redemption history rows are the list items.
- The entire screen scrolls as one unit — no nested scroll conflicts.
- Pagination via `onEndReached` (page size: 20).
- Pull-to-refresh via `refreshControl` (brand red spinner). Re-fetches savings summary, redemption history, and the currently selected insight month if one is active. Selected month is preserved after refresh.

---

## State 1 — Free User

**Trigger:** `subscription === null` (no active subscription record). [Revision 2: dropped `subscription.status === 'FREE'` — backend `SubscriptionStatus` enum doesn't have a `'FREE'` value; free users have no Subscription row at all, and `useSubscription()` returns `subscription: null` for them.]

### Hero header
- Brand gradient background: `linear-gradient(145deg, #B80E08 0%, #D10A03 28%, #E20C04 52%, #CC3500 78%, #C83200 100%)`
- Depth overlays (matching VoucherDetailScreen header technique):
  - Dark vignette: `linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 40%, rgba(0,0,0,0.2) 100%)`
  - Radial scatter: two elliptical radial gradients for depth
- App bar: "Savings" title in `MusticaPro-SemiBold` 26px, white, sitting at y=54px from top (clear of status bar)
- Animated ring icon: lock SVG icon in a frosted ring, gentle float animation (2.4s loop, ±7px translateY, ±2° rotate)
- Title: **"Unlock your savings"** — `MusticaPro-SemiBold` 24px white
- Body: "Subscribe to start redeeming vouchers at local businesses and tracking every penny saved."
- CTA button: **"Subscribe — from £6.99/mo"** — white pill, `#E20C04` text, navigates to **Subscribe screen** (`/(app)/subscribe-prompt`)

### Benefit cards (below hero, fade-up on load)
Four cards, each with icon + title + description:

| Icon colour | Title | Body |
|---|---|---|
| Red `#FEE2E2` | Restaurants, cafés, gyms & more | Local businesses near you — new vouchers added every week |
| Green `#DCFCE7` | Show your code, save instantly | Tap Redeem and show the screen at the till — it's that simple |
| Amber `#FEF3C7` | Your subscription pays for itself | Redeem just once a month and you've already covered your £6.99 |
| Purple `#EDE9FE` | Cancel anytime, no commitment | Monthly from £6.99 or save with an annual plan |

---

## State 2 — Subscribed, No Redemptions Yet

**Trigger:** `subscription.status === 'ACTIVE' | 'TRIALLING' | 'PAST_DUE'` AND redemption history is empty. [Revision 2: PAST_DUE users with zero redemptions route here. The rebill / retry CTA for PAST_DUE billing recovery is OUT OF SCOPE for this rebaseline — separate future workstream. Browse-vouchers CTA still works; downstream redemption is gated by the existing PAST_DUE → subscribe-prompt flow if they attempt to redeem.]

### Hero header
- Same gradient and depth overlays as State 1
- App bar: same "Savings" title treatment
- Animated ring icon: piggy bank SVG (same float animation)
- Title: **"Start saving today"** — `MusticaPro-SemiBold` 24px white
- Body: "You're all set. Redeem a voucher at any local business and your savings will appear here."
- CTA button: **"Browse vouchers"** — white pill, `#E20C04` text, navigates to **Home tab** (`/(app)/index`) — the main discovery surface

### Benefit cards (below hero)
Three cards:

| Icon colour | Title | Body |
|---|---|---|
| Red `#FEE2E2` | Restaurants, cafés, gyms & more | Local businesses near you — new vouchers added every week |
| Green `#DCFCE7` | Show your code, save instantly | Tap Redeem and show the screen at the till — it's that simple |
| Amber `#FEF3C7` | Your subscription pays for itself | Redeem just once a month and you've already covered your £6.99 |

---

## State 3 — Populated Dashboard

**Trigger:** `subscription.status === 'ACTIVE' | 'TRIALLING' | 'PAST_DUE'` AND at least one redemption exists. [Revision 2: PAST_DUE users with redemptions see the populated dashboard — their historical savings still belong to them; they just can't currently redeem new vouchers until billing is restored.]

### Hero header
- Same gradient + depth overlays
- App bar: "Savings" title only — no action icons
- **Eyebrow:** "Total saved" — `Lato` 10px, uppercase, 2px letter-spacing, `rgba(255,255,255,0.65)`
- **Lifetime total:** `MusticaPro-SemiBold` 48px white — animates count-up from 0 on mount (900ms ease-out cubic)
- **Two stat chips** (frosted glass, `rgba(255,255,255,0.12)`, `backdrop-filter: blur(12px)`, 1px white border):
  - "This month" — `MusticaPro-SemiBold` 22px white — count-up 650ms
  - "Redemptions" — `MusticaPro-SemiBold` 22px white — count-up 500ms

**Count-up policy:** Runs on initial screen mount only. Does not replay on tab focus or navigation return. Re-animates from the previous value to the new value if data changes after a pull-to-refresh.

### Entrance animations (all use `transform/opacity` only — no layout thrash)
- Hero header: `fadeUp` 0.55s `ease-enter` 0.05s
- Section label: `fadeUp` 0.35s 0.5s
- Insight card 1: `fadeUp` spring `cubic-bezier(0.34,1.2,0.64,1)` 0.55s
- Insight card 2: same, 0.65s
- Insight card 3: same, 0.75s
- ROI callout: `fadeUp` 0.35s 1.1s
- History header: `fadeUp` 0.28s 1.15s
- History rows: `fadeUp` 0.32s staggered from 1.2s (40ms per row)
- Bar chart bars: `scaleY(0→1)` spring, 0.5s, 75ms stagger per bar, starting at 650ms
- Category fills: `width(0→%)` spring `cubic-bezier(0.34,1.1,0.64,1)` 0.65s, 65ms stagger, starting at 900ms

---

## Insight Section (State 3 only)

Three cards in the `ListHeaderComponent`, each a white rounded card with `border-radius: 20px`, subtle shadow.

### Card 1 — 6-Month Trend
- Bar chart: always 6 bars (trailing 6 months including current), each bar column is tappable (44pt touch target minimum)
- Months with zero savings render as a minimal-height stub bar (3px), visually consistent with active bars but slightly subdued (`rgba(226,12,4,0.10)`). All bars — including stubs — are tappable and trigger the £0 month state.
- Default state: current month bar full red + dot indicator above; all other bars `rgba(226,12,4,0.18)`
- Bars animate `scaleY(0→1)` from bottom on mount with spring easing
- Footer: min month label (left, muted) + max month label (right, `savings-green`)

### Card 2 — Top branches  [Revision 2 — renamed from "Top Places"]
- Up to two **branch** rows per month. Row anatomy: logo placeholder + branch name (primary line, `Lato` 14px bold, `#010C35`) + merchant name (secondary line, `Lato` 11px muted, `#9CA3AF`) + saving amount (`MusticaPro-SemiBold` 18px `#16A34A`).
- Example row: **Brightlingsea** (primary) over *Covelum* (secondary muted). Distinguishes multi-branch merchants — a user who redeemed at Covelum Brightlingsea (£15) and Covelum Colchester (£10) sees TWO rows, not one merged "Covelum: £25" row.
- If only one branch exists for the selected month, render one row — no placeholder for the second. If no branches, hide Card 2 entirely.
- Entrance: `fadeRight` staggered 85ms/92ms.
- **Aggregation switched merchant-level → branch-level** per the locked branch-as-PRIMARY-unit product rule (memory `project_branch_first_class_platform_rules.md`, 2026-05-03). Backend `byBranch[]` shape provides `branchId / branchName / merchantId / merchantName / merchantLogoUrl / saving / count` — see Backend requirement section below.

### Card 3 — By Category
- Horizontal progress bars per category
- Fill animates `width: 0 → %` on mount using brand gradient `#C01010 → #E20C04 → #CC3500`
- Category name (`Lato` 13px medium) + value (`Lato` 13px bold `#16A34A`)

---

## Month Drill-Down (tap a bar)

Tapping any past month bar on Card 1 updates Cards 2 and 3 to show that month's data.

### 4 states

| State | Bar chart | Viewing chip | Insight cards | ROI callout |
|---|---|---|---|---|
| Default (current month) | Current bar full + dot; others dim | Hidden | "This month" data | Visible |
| Loading (past tapped) | Tapped bar full + dot; others dim | Appears immediately (optimistic) | Skeleton shimmer | Hidden |
| Past month loaded | Tapped bar full + dot; others dim | "Viewing: [Month Year]" + ✕ | Past month data | Hidden |
| £0 month tapped | Stub bar (3px) + dot; others dim | "Viewing: [Month Year]" + ✕ | Empty state card | Hidden |

### Viewing chip
- Amber pill: `background: #FEF3C7`, `border: 1px solid #FDE68A`
- Springs in: `scale(0.8, opacity:0) → scale(1, opacity:1)` using `cubic-bezier(0.34,1.56,0.64,1)`
- Tapping ✕ or tapping the current month bar both reset to default state
- Content crossfades: outgoing content fades to opacity:0 (200ms), new content fades in

### History list
The redemption history list is **never filtered by selected month** — it always shows the full all-time history regardless of which bar is selected. Month drill-down only affects the insight cards.

### Backend requirement  [Revision 2 — endpoint already shipped 2026-04-18; only the response shape changed]

Both `GET /api/v1/customer/savings/summary` and `GET /api/v1/customer/savings/monthly-detail?month=YYYY-MM` return `byBranch[]` (Revision 2) instead of `byMerchant[]` (Revision 1). Per-entry shape:

```
{
  branchId:        string,
  branchName:      string,
  merchantId:      string,
  merchantName:    string,
  merchantLogoUrl: string | null,
  saving:          number,
  count:           number,
}
```

Ordering: descending by `saving`. Both endpoints continue to return `byCategory[]` (merchant-level — categories are assigned to merchants, not branches) and the other top-level summary fields unchanged.

The hero card's lifetime / current-month stats come from the existing `GET /api/v1/customer/savings/summary` endpoint, also unchanged in this revision.

**PR-A (the backend prerequisite for this rebaseline track)** ships only the `byMerchant → byBranch` swap. No new endpoints, no Prisma schema changes, no other contract shifts.

---

## ROI Callout (State 3, current month only)

Warm gradient card: `linear-gradient(135deg, #FFF1EE, #FEF3C7)`, `border: 1px solid rgba(226,12,4,0.15)`, `border-radius: 20px`.  
After 1.8s delay, a shimmer sweep runs every 2.8s (`transform: translateX(-120% → 200%)`).

### Four variants

| Condition | Copy |
|---|---|
| Below breakeven, no promo (`0 < thisMonthSaving < plan_monthly_cost`) | "You're on your way — **£X** saved this month" — no multiplier |
| Monthly plan, at or above breakeven (`thisMonthSaving ≥ £6.99`) | "Saved **£X** on your £6.99/mo plan — that's **4.6×** your money back" |
| Annual plan, at or above breakeven (`thisMonthSaving ≥ £5.83`) | "Saved **£X** on your plan — that's **5.5×** your money back" |
| Promo code applied (`subscription.promoCodeId != null`, any amount > 0) | "You saved **£X** this month. Keep it up!" — **no multiplier shown** |

**Breakeven thresholds:** Monthly = £6.99 / Annual = £69.99 ÷ 12 = £5.83

**Hidden when:** `thisMonthSaving === 0` or a past month is selected.

**Multiplier calculation** (only shown when at or above breakeven, no promo):
- Monthly: `thisMonthSaving / 6.99`, rounded to 1dp
- Annual: `thisMonthSaving / (69.99 / 12)` = `thisMonthSaving / 5.83`, rounded to 1dp

---

## Redemption History

Full all-time list, paginated via `onEndReached` (page size: 20). When all items are loaded, a subtle centred label renders at the bottom of the list: **"You're all caught up"** — `Lato` 13px, `#9CA3AF`, no additional UI.

### Row anatomy
- Logo placeholder: 46×46pt, `border-radius: 14px`, coloured by voucher type
- Merchant name: `Lato` 14px bold, `#010C35`
- Meta: voucher type + **branch name** + relative time — `Lato` 11px `#9CA3AF`. Example: "BOGO · Brightlingsea · 2 hours ago". [Revision 2: branch name added between voucher type and relative time — multi-branch merchants must be distinguishable on the row. Use `branchShortName()` helper from `apps/customer-app/src/features/merchant/utils/branchShortName.ts` for the display, matching the Merchant Profile convention.]
- Saving amount: `MusticaPro-SemiBold` 16px `#16A34A`, tabular nums, prefix `+`
- Badge (right-aligned, below amount):

| Condition | Badge |
|---|---|
| `isValidated = false` AND **≤2h** since redemption [Revision 2] | Amber pill: "Show to staff" — `bg: #FEF3C7`, `color: #B45309`. **Window matches §AE5 Voucher Detail presentation-window** locked 2026-05-08 — the Show-to-Staff CTA inside Voucher Detail is hidden after 2h, so the Savings badge must not promise an action the destination won't honour. |
| `isValidated = true` AND ≤24h since validation | Green pill: "Validated ✓" — `bg: #DCFCE7`, `color: #16A34A`. Unchanged — celebration of a completed action, not an in-progress affordance. |
| Everything else (`isValidated = false` AND >2h; OR `isValidated = true` AND >24h since validation) | Plain text: "Redeemed" — `#9CA3AF`, no pill. |

**Tap action:** All rows navigate to `VoucherDetailScreen` in its redeemed state. The "Show to staff" badge is informational — tapping the row opens the detail screen where the customer can access the code again.

**Press feedback:** `scale(0.98)` on press, restored on release — `transition: transform 100ms ease`.

---

## Loading States

### Initial screen load  [Revision 2 — structural skeleton replaces generic shimmer]
On first navigation to the Savings tab, always show a skeleton regardless of known subscription status. Do not pre-render empty states from cached auth data.

- **Skeleton layout (Revision 2 — structural):** cream canvas (`#FFF9F5`) matching the populated screen background; hero block with muted-navy gradient placeholder (`#D8DDE8 → #D0D6E2 → #C9D0DE`, mirrors `MerchantProfileSkeleton`'s palette locked 2026-05-17); 3 insight card shells (trend / top branches / by category) with cool-grey `#E5E7EB` placeholder rows; ROI callout placeholder; 3-4 RedemptionRow placeholders. Reuse the existing shimmer primitive from `SkeletonTile`.
- Once the savings API resolves, render the correct state (State 1, 2, or 3) with entrance animations.
- Cross-ref: §BD-3 / `MerchantProfileSkeleton.tsx` is the canonical structural-skeleton example for the customer-app. Maintain visual consistency across surfaces.

### Month drill-down fetch
Skeleton shimmer inside insight Cards 2 and 3 while fetching. Card 1 bar chart remains interactive. Viewing chip appears immediately (optimistic).

---

## Error States

### Initial load failure — no cached data
Replace the hero and content area with an inline error card:
- Icon + message: "Couldn't load your savings"
- Retry button — re-triggers the savings API call
- Screen background (`#F8F9FA`) visible around the card

### Initial load failure — cached data exists
Keep cached content visible. Show a subtle non-blocking error message (small muted banner below the app bar): "Couldn't refresh — showing last saved data". Auto-dismisses after 4s or on next successful load.

### Month drill-down failure
Keep the selected month active — do not auto-revert to current month. Show an inline error state within Cards 2 and 3:
- Message: "Couldn't load [Month Year]"
- Retry tap re-triggers `GET /api/v1/customer/savings/monthly-detail?month=YYYY-MM`

---

## Typography

All values use the app's design token system (`src/design-system/tokens.ts`):

| Element | Token | Font | Size |
|---|---|---|---|
| Screen title "Savings" | `display.md` | MusticaPro-SemiBold | 26px |
| Hero lifetime total | `display.xl` | MusticaPro-SemiBold | 48px |
| Hero stat values | `display.sm` | MusticaPro-SemiBold | 22px |
| Empty state title | `display.sm` | MusticaPro-SemiBold | 24px |
| Merchant saving amounts | `heading.md` | MusticaPro-SemiBold | 18px |
| History amounts | `heading.sm` | Lato-SemiBold | 16px |
| Card titles / section labels | `label.eyebrow` | Lato-SemiBold | 11px uppercase |
| Body / meta / descriptions | `body.sm` | Lato-Regular | 14px |
| Badge text | `label.md` | Lato-SemiBold | 9–11px |

All monetary values: `font-variant-numeric: tabular-nums` (prevents layout shift as digits change).

---

## Colour Tokens

All from `src/design-system/tokens.ts`:

| Role | Token | Value |
|---|---|---|
| Hero gradient | `color.navGradient` | `#B80E08 → #D10A03 → #E20C04 → #CC3500 → #C83200` |
| Savings amount | `color.savingsGreen` | `#16A34A` |
| Brand primary | `color.brandRose` | `#E20C04` |
| Screen background | `color.surface.neutral` | `#F8F9FA` |
| Card background | `color.surface.page` | `#FFFFFF` |
| Text primary | `color.text.primary` | `#010C35` |
| Text muted | `color.text.tertiary` | `#9CA3AF` |
| Badge pending bg | — | `#FEF3C7` |
| Badge validated bg | — | `#DCFCE7` |

---

## Accessibility

- All touch targets ≥ 44pt (`layout.minTouchTarget`)
- Contrast ≥ 4.5:1 on all text (white on brand red ✓, dark navy on white ✓)
- Bar chart bars have `accessibilityRole="button"` and `accessibilityLabel="[Month], £[amount] saved"`
- History rows have `accessibilityLabel="[Merchant], [type], [amount] saved, [date]"`
- Viewing chip has `accessibilityLabel="Viewing [Month]. Tap to return to current month"`
- `reduceMotion` respected: all animations disabled when `useReducedMotion()` returns true; data still readable immediately
- Skeleton loaders during month fetch — never a blank card or spinner

---

## Navigation

| Element | Destination |
|---|---|
| Free user CTA "Subscribe — from £6.99/mo" | `/(app)/subscribe-prompt` |
| Subscriber empty CTA "Browse vouchers" | Home tab — `/(app)/index` |
| Any history row tap | `VoucherDetailScreen` in redeemed state |
| Viewing chip ✕ or tapping current month bar | Resets to current month (no navigation) |

---

## Voucher type handling  [Revision 2 — 2026-05-17 addition]

All Savings aggregations (lifetime total, this-month, top branches, by-category, redemption count, RedemptionRow listings) are **redemption-based** — every successful `VoucherRedemption` row contributes regardless of voucher type. The relevant voucher types as of this revision: BOGO, Discount Fixed / Discount Percent, Spend & Save, Freebie, Package Deal, **Time-Limited** (M4, shipped 2026-05-11), **Reusable** (M5, shipped 2026-05-12).

### Counting rules

- **REUSABLE vouchers** count once per successful redemption. A REUSABLE voucher used 5 times across cooldown cycles produces 5 rows in the redemption history and contributes 5× the per-redemption saving to every aggregate (lifetime / monthly / by-branch / by-category / count). There is no per-voucher de-duplication.
- **TIME_LIMITED vouchers** count normally on redemption. The time-limited availability window gates when a redemption can happen, not how it's counted afterward.
- All other voucher types (BOGO, Discount, Spend & Save, Freebie, Package Deal) count once per redemption as before.

### Backend formula

No change. The existing service queries `VoucherRedemption` directly without filtering by `voucher.voucherType`, so all types are included by default. PR-A backend tests pin this — a `voucherType` filter regression in the future would be caught by the "TIME_LIMITED + REUSABLE redemptions count toward all aggregates" pin.

### RedemptionRow type label

Display a human-readable voucher / offer type label for every current voucher type, using the canonical `voucherTypeLabel(type)` helper from [`apps/customer-app/src/features/voucher/utils/voucherTheme.ts`](../../apps/customer-app/src/features/voucher/utils/voucherTheme.ts). Labels in use (verified 2026-05-17):

| Voucher type | Label |
|---|---|
| `BOGO` | BOGO |
| `DISCOUNT_FIXED` / `DISCOUNT_PERCENT` | Discount |
| `SPEND_AND_SAVE` | Spend & Save |
| `FREEBIE` | Freebie |
| `PACKAGE_DEAL` | Package Deal |
| `TIME_LIMITED` | Time limited |
| `REUSABLE` | Reusable |

Matches Voucher Detail / SuccessPopup / ShowToStaff / RedemptionDetailsCard / CouponHeader copy conventions across the app. If a new voucher type ships later, add it to `voucherTypeLabel` first; Savings will pick up the new label automatically.

### Not in scope

- **No separate voucher-type breakdown card** in this rebaseline. Category breakdown stays merchant-category-based (Food & Drink / Beauty / etc.), not voucher-type-based. A future voucher-type breakdown could be added but is out of scope for the Savings rebaseline track.
- **No special UX for REUSABLE cooldown state** on RedemptionRow (e.g. "On cooldown until …"). REUSABLE rows look the same as other rows; cooldown state is a Voucher Detail concern, not a Savings concern.
