# Savings Tab — Design Spec

**Date:** 2026-04-18  
**Surface:** Customer App (React Native / Expo)  
**Route:** `/(app)/savings`

---

## Overview

The Savings tab is a personal financial dashboard and a subscription conversion surface. It serves three distinct user states: free users (subscribe CTA), subscribed users with no redemptions yet (motivation to redeem), and active subscribers with redemption history (full dashboard).

---

## Screen Structure

**Layout:** `FlatList` with `ListHeaderComponent`.  
- Everything above the redemption history (hero header, insight cards, ROI callout) is the `ListHeaderComponent`.
- Redemption history rows are the list items.
- The entire screen scrolls as one unit — no nested scroll conflicts.
- Pagination via `onEndReached`.

---

## State 1 — Free User

**Trigger:** `subscription === null` or `subscription.status === 'FREE'`

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

**Trigger:** `subscription.status === 'ACTIVE' | 'TRIALLING'` AND redemption history is empty

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

**Trigger:** `subscription.status === 'ACTIVE' | 'TRIALLING'` AND at least one redemption exists

### Hero header
- Same gradient + depth overlays
- App bar: "Savings" title + settings icon action (top-right)
- **Eyebrow:** "Total saved" — `Lato` 10px, uppercase, 2px letter-spacing, `rgba(255,255,255,0.65)`
- **Lifetime total:** `MusticaPro-SemiBold` 48px white — animates count-up from 0 on mount (900ms ease-out cubic)
- **Two stat chips** (frosted glass, `rgba(255,255,255,0.12)`, `backdrop-filter: blur(12px)`, 1px white border):
  - "This month" — `MusticaPro-SemiBold` 22px white — count-up 650ms
  - "Redemptions" — `MusticaPro-SemiBold` 22px white — count-up 500ms

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
- Bar chart: 6 bars (Nov–Apr), each bar column is tappable (44pt touch target minimum)
- Default state: current month bar full red + dot indicator above; all other bars `rgba(226,12,4,0.18)`
- Bars animate `scaleY(0→1)` from bottom on mount with spring easing
- Footer: min month label (left, muted) + max month label (right, `savings-green`)

### Card 2 — Top Places
- Two merchant rows per month: logo placeholder, merchant name (`Lato` 14px bold), meta (`Lato` 11px muted), saving amount (`MusticaPro-SemiBold` 18px `#16A34A`)
- Entrance: `fadeRight` staggered 85ms/92ms

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

### Backend requirement
New endpoint: `GET /api/v1/customer/savings/monthly-detail?month=YYYY-MM`  
Returns: `{ totalSaving, redemptionCount, byMerchant[], byCategory[] }` for that specific month.  
The hero card's lifetime/current-month stats always come from the existing `GET /api/v1/customer/savings` summary endpoint.

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

Full all-time list, paginated via `onEndReached` (page size: 20).

### Row anatomy
- Logo placeholder: 46×46pt, `border-radius: 14px`, coloured by voucher type
- Merchant name: `Lato` 14px bold, `#010C35`
- Meta: voucher type + relative time — `Lato` 11px `#9CA3AF`
- Saving amount: `MusticaPro-SemiBold` 16px `#16A34A`, tabular nums, prefix `+`
- Badge (right-aligned, below amount):

| Condition | Badge |
|---|---|
| `isValidated = false` AND ≤24h since redemption | Amber pill: "Show to staff" — `bg: #FEF3C7`, `color: #B45309` |
| `isValidated = true` AND ≤24h since validation | Green pill: "Validated ✓" — `bg: #DCFCE7`, `color: #16A34A` |
| Everything else (>24h or older) | Plain text: "Redeemed" — `#9CA3AF`, no pill |

**Tap action:** All rows navigate to `VoucherDetailScreen` in its redeemed state. The "Show to staff" badge is informational — tapping the row opens the detail screen where the customer can access the code again.

**Press feedback:** `scale(0.98)` on press, restored on release — `transition: transform 100ms ease`.

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
