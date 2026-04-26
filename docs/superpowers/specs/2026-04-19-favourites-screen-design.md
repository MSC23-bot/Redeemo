# Favourites Screen — Design Spec

**Surface:** Customer App (React Native / Expo)
**Phase:** 3C — Favourites
**Date:** 2026-04-19

---

## Overview

A dedicated screen for managing favourite merchants and vouchers. Accessed via the bottom tab bar (heart icon). Two tabs — Merchants and Vouchers — with swipe-to-remove, undo toast, and smart sorting. Supports four states: populated, empty (subscriber), free user with nudge banner, and cards with unavailable merchants/vouchers.

---

## 1. Structure & Navigation

### Screen location
Bottom tab bar, "Favourite" tab (heart icon). Active indicator: white filled dot above the icon.

### Header
- Brand 5-stop gradient background: `#B80E08 → #D10A03 → #E20C04 → #CC3500 → #C83200`, locations `[0, 0.28, 0.52, 0.78, 1]`
- Vignette overlay: top 15% black at 0.15 opacity fading to transparent, bottom 18% black at 0.18 opacity
- 44px top safe area for Dynamic Island / notch
- Title: "Favourites", 20px, bold, white, letter-spacing -0.3px, positioned 8px below safe area
- Tab switcher at bottom of header (see Section 1.1)

### 1.1 Tab Switcher
Matches the merchant profile `TabBar.tsx` pattern, adapted for white-on-red header:

- **Layout:** Two equal-width tabs, separated by `border-bottom: 1px solid rgba(255,255,255,0.12)`
- **Label:** 12px, letter-spacing -0.1px
- **Count badge:** min-width 16px, height 15px, border-radius 8px, padding 0 4px, font-size 9px, weight 800
- **Active tab:** label white, weight 700. Badge background `rgba(255,255,255,0.2)`, text white
- **Inactive tab:** label `rgba(255,255,255,0.45)`, weight 600. Badge background `rgba(255,255,255,0.08)`, text `rgba(255,255,255,0.4)`
- **Indicator bar:** white, 3px height, border-top-radius 3px, positioned absolute bottom -1px, left 22% right 22%

### 1.2 Data Sources
- Merchants: `GET /api/v1/customer/favourites/merchants` (paginated, page size 20)
- Vouchers: `GET /api/v1/customer/favourites/vouchers` (paginated, page size 20)
- Both tabs pre-fetched on screen mount. Tab switch does not trigger refetch.

### 1.3 Tab Persistence
Selected tab stored in local component state. Defaults to Merchants on each screen visit (not persisted across sessions).

---

## 2. Merchant Cards

Reuses the `MerchantTile` component pattern.

### 2.1 Card Structure
- **Container:** white background, 14px border-radius, shadow `0 3px 12px rgba(1,12,53,0.10), 0 1px 3px rgba(1,12,53,0.05)`
- **Banner:** 64px height, merchant banner image or gradient fallback
- **Logo:** 28x28px, border-radius 8px, 2px white border, positioned `bottom: -14px, left: 12px`, z-index 2. Half overlaps banner, half in content area.
- **Heart:** 26x26px circle, `rgba(255,255,255,0.9)` background, top 8px right 8px of banner. Always red filled (`#E20C04`) — items are already favourited. Shadow `0 1px 4px rgba(0,0,0,0.10)`.
- **Content area:** padding 18px top (clears logo), 12px horizontal, 12px bottom

### 2.2 Card Content
- **Name row:** merchant name (13px, Lato-Bold, `#010C35`) + star rating on right (10px star `#F59E0B`, 10.5px rating bold, 9.5px count `#9CA3AF`)
- **Info line:** single line, 10px, `#9CA3AF`, dot separators (`#D1D5DB`). Format: `Category · Branch location · Distance`. If location permission denied: omit distance segment. Branch shown: nearest branch if location available, otherwise main branch.
- **Pills row:** 8px margin-top, 5px gap, flex-wrap. Pills at 9px, weight 700, pill border-radius 100px, padding 3px 8px:
  - Voucher count: `rgba(226,12,4,0.07)` background, `#E20C04` text
  - Save pill: gradient `#ECFDF5 → #D1FAE5`, text `#047857`
  - Open status: `rgba(16,185,129,0.07)` background, `#047857` text, 5px green dot (`#10B981`, pulsing animation)
  - Closed status: `rgba(239,68,68,0.05)` background, `#DC2626` text, 5px red dot (`#EF4444`)

### 2.3 Sorting
1. Open merchants first, closed second
2. Within each group: most recently favourited first (by `favouritedAt` desc)
3. Deactivated/suspended merchants sorted to bottom

### 2.4 Deactivated/Suspended Merchants
- Entire card dimmed to 0.45 opacity
- Banner uses grey gradient fallback (`#94A3B8 → #CBD5E1`)
- Info line shows "Unavailable" in italic instead of distance
- Voucher count pill: "0 vouchers" at reduced opacity (0.5)
- Heart stays red
- Tapping the card still navigates to merchant profile (which shows its own unavailable state)

### 2.5 Card Spacing
- 12px gap between cards
- 14px padding top and 12px horizontal padding on the list container
- 3rd card peeks at the bottom edge to signal scrollability

### 2.6 Truncation
- Merchant name: single line, ellipsis (`numberOfLines={1}`)

---

## 3. Voucher Cards

### 3.1 Card Structure
- **Background:** pastel gradient by voucher type (see table below)
- **Border-radius:** 14px
- **Shadow:** same as merchant cards
- **Left stripe:** 4px wide, solid colour by voucher type

### 3.2 Pastel Gradients by Type

| Type | Gradient | Stripe | Badge border / pill bg |
|------|----------|--------|------------------------|
| BOGO | `#F5F3FF → #EDE9FE` | `#7C3AED` | `#7C3AED` |
| Discount | `#FEF2F2 → #FEE2E2` | `#E20C04` | `#E20C04` |
| Freebie | `#F0FDF4 → #DCFCE7` | `#16A34A` | `#16A34A` |
| Spend & Save | `#FFF7ED → #FFEDD5` | `#E84A00` | `#E84A00` |
| Package Deal | `#EFF6FF → #DBEAFE` | `#2563EB` | `#2563EB` |
| Time-Limited | `#FFFBEB → #FEF3C7` | `#D97706` | `#D97706` |
| Reusable | `#F0FDFA → #CCFBF1` | `#0D9488` | `#0D9488` |

### 3.3 Card Content
- **Merchant row:** 18x18px logo (border-radius 5px) + merchant name (10px, weight 600, `#6B7280`) + flex spacer + heart (24x24px circle, tinted background matching voucher type at 0.06–0.08 opacity, red filled)
- **Title:** 13px, Lato-Bold (weight 700), `#010C35`, letter-spacing -0.2px, line-height 1.3. Single line, ellipsis.
- **Description:** 10px, `#9CA3AF`, line-height 1.4. Single line, ellipsis.
- **Footer row:** left side: type badge + save pill. Right side: CTA or status.
  - **Type badge:** 8px, weight 800, uppercase, letter-spacing 0.3px, dashed border in type colour, border-radius 4px, padding 2px 6px
  - **Save pill:** 9px, weight 800, white text on type colour background, border-radius 6px, padding 3px 8px
  - **"Redeem >" CTA:** 10px, weight 700, `#E20C04`, with 10px chevron-right icon
  - **"Redeemed" label** (if redeemed this cycle): 10px, weight 600, `#9CA3AF`. Replaces "Redeem >". Card not dimmed — user may want it for next cycle.
  - **Expiry date** (time-limited vouchers): "Exp 30 Apr", 9px, weight 600, `#D97706`. Shown alongside "Redeem >" if expiry is within 30 days. If expiry is further out, only "Redeem >" is shown.

### 3.4 Sorting
1. Available vouchers first, unavailable second
2. Within each group: most recently favourited first (`favouritedAt` desc)

### 3.5 Unavailable Voucher Cards (Merchant Suspended / Voucher Inactive)
Softer treatment — no opacity dim, text stays fully readable:
- Left stripe: grey `#D1D5DB` (replaces type colour)
- Background: neutral gradient `#F9FAFB → #F3F4F6` (replaces pastel)
- Type badge: grey dashed border `#D1D5DB`, grey text `#9CA3AF`
- Save pill: hidden
- "Unavailable" label replaces "Redeem >" (12px, italic, `#9CA3AF`)
- Heart stays red (still a favourite)
- Title, description, merchant row remain fully readable

### 3.6 Card Spacing
Same as merchant cards — 12px gap, 3rd card peeks for scroll affordance.

### 3.7 Truncation
- Voucher title: single line, ellipsis (`numberOfLines={1}`)
- Description: single line, ellipsis (`numberOfLines={1}`)

---

## 4. Edge States

### 4.1 Empty State (Subscriber, No Favourites)
- Both tab counts show 0
- Centred content with generous whitespace (min-height 300px):
  - Heart icon: 56x56px circle, `rgba(226,12,4,0.06)` background, brand rose stroke heart (1.5px), gentle float animation (translateY -5px, 3s ease-in-out infinite)
  - Title: "No favourites yet" (15px, bold, `#010C35`)
  - Body: "Tap the heart on any merchant or voucher to save it here for quick access." (12px, `#9CA3AF`, line-height 1.5, max-width 220px)
  - CTA: "Discover merchants" button — gradient background (`#E20C04 → #E84A00`), pill radius, 12px bold white text, glow shadow `0 4px 14px rgba(226,12,4,0.25)`. Navigates to Home tab.
- Same empty state shown on both tabs

### 4.2 Free User (Has Favourites, No Subscription)
- Cards render normally — browsing favourites is allowed on free tier
- **Subscribe nudge banner** at top of list, above the first card:
  - Background: `rgba(226,12,4,0.06) → rgba(232,74,0,0.04)` gradient, 1px border `rgba(226,12,4,0.10)`, border-radius 12px, padding 10px 12px, margin 10px 12px 0
  - Crown icon: 30x30px circle, gradient background (`#E20C04 → #E84A00`), white crown SVG
  - Text: "**Subscribe to redeem** — Unlock all your favourite vouchers from £6.99/mo" (10.5px, `#4B5563`, strong text `#010C35`)
  - Dismiss X: 20px, `#9CA3AF` at 0.4 opacity
  - Tap anywhere on banner (except X) navigates to subscribe-prompt screen
  - Dismissible per session (in-memory state, reappears next app open)
- Voucher "Redeem >" CTA still visible — tapping routes to subscribe-prompt (existing behaviour)

### 4.3 Loading State
- Header renders immediately (static content)
- 3 skeleton shimmer cards matching card dimensions (banner + content area)
- Skeleton uses standard shimmer animation from `SavingsSkeleton` pattern

### 4.4 Error State
- Uses existing `ErrorState` component
- Title: "Couldn't load your favourites"
- Description: "Something went wrong. Please try again."
- Retry button triggers refetch
- Pull-to-refresh also available

### 4.5 Offline / Stale Data
- React Query shows cached data if available
- Refreshes in background on network reconnect
- No special offline indicator (standard React Query behaviour)

---

## 5. Interactions & Motion

### 5.1 Entrance Animations
- Cards stagger in with `FadeInDown` — 40ms delay between each card (matching savings tab pattern)
- Header renders instantly, cards animate in after

### 5.2 Swipe-to-Remove
1. Swipe left reveals red delete zone (`#EF4444`) from right edge, border-radius 0 12px 12px 0, trash icon (white, 14px)
2. Complete swipe or tap trash → card animates out (slide left + fade, ~200ms)
3. **Optimistic removal:** card removed from UI immediately, API call fires immediately (`DELETE /api/v1/customer/favourites/merchants/:id` or `vouchers/:id`)
4. Tab count badge decrements immediately
5. **Undo toast:** "Removed from favourites — Undo" shown for 4 seconds. Auto-dismisses.
6. If user taps Undo: reverse the mutation (re-add via `POST` API call), card animates back in, count badge re-increments
7. On API failure (and no undo tapped): card reappears with brief shake animation, toast "Couldn't remove — try again"
8. **First card swipe hint:** first merchant card plays a subtle swipe-hint animation after 2s delay (translateX -36px and back, 3.5s duration, plays once). Text hint "Swipe left to remove" shown below the list (9px, `#C4C4C4`). Shown once per session.

### 5.3 Heart Toggle (Unfavourite)
- Tapping the red heart triggers the same removal flow as swipe (optimistic removal + undo toast)
- Heart briefly scales down (0.8) as exit animation before card slides out

### 5.4 Pull-to-Refresh
- Standard `RefreshControl` with brand rose tint colour (`#E20C04`)
- Refetches the active tab's data

### 5.5 Tab Switching
- Indicator bar slides to active tab (spring animation, ~250ms)
- Card list cross-fades (fade out old, fade in new, ~150ms)
- No data refetch on switch — both tabs pre-fetched on mount

### 5.6 Card Tap Navigation
- Merchant card → `/(app)/merchant/:id` (merchant profile screen)
- Voucher card → `/(app)/voucher/:id` (voucher detail screen)

### 5.7 Haptic Feedback
- Light haptic on: heart tap, tab switch, swipe-to-remove completion

### 5.8 Infinite Scroll
- Page size: 20 items
- `onEndReachedThreshold: 0.3`
- Footer spinner (`ActivityIndicator`, brand rose) while fetching next page
- "You're all caught up" end label (matching savings tab pattern)

---

## 6. Accessibility

### 6.1 VoiceOver / TalkBack
- Tab switcher: `accessibilityRole="tab"`, `accessibilityState={{ selected: true/false }}`, label "Merchants, 3 items" / "Vouchers, 5 items"
- Heart button: `accessibilityLabel="Remove [name] from favourites"`, `accessibilityRole="button"`
- Merchant card: `accessibilityLabel="[name], [category], [branch], [distance], [rating] stars, [open/closed]"`
- Voucher card: `accessibilityLabel="[title] at [merchant], [type], save [amount]"`
- Swipe-to-remove hint text: hidden from screen readers (`accessibilityElementsHidden`)

### 6.2 Alternative to Swipe Gesture
- Long-press context menu on any card: "Remove from favourites" option
- Ensures users who cannot swipe can still remove items
- Same optimistic removal + undo toast flow

### 6.3 Contrast
- All text meets WCAG 2.1 AA (4.5:1 minimum)
- Unavailable voucher text remains fully readable (no opacity reduction)

---

## 7. Backend API Dependency — Favourites Enrichment

**Status: REQUIRED before frontend implementation.**

The current `listFavouriteMerchants` and `listFavouriteVouchers` endpoints return minimal data. They must be enriched to support the card designs.

### 7.1 Merchant Favourites — Missing Fields

Current response: `id, businessName, tradingName, logoUrl, status, primaryCategory, vouchers (first 2), favouritedAt`

Required additions:
| Field | Purpose |
|-------|---------|
| `bannerUrl` | Card banner image |
| `branches` (nearest or main, with `name`, `addressLine1`, `latitude`, `longitude`) | Branch location in info line + distance calculation |
| `averageRating`, `reviewCount` | Star rating on card |
| `voucherCount` (active + approved) | Voucher count pill |
| `maxEstimatedSaving` (across all active vouchers) | "Save up to £X" pill |

### 7.2 Voucher Favourites — Missing Fields

Current response: `id, title, type, estimatedSaving, imageUrl, status, approvalStatus, merchant (id, businessName, logoUrl, status), favouritedAt`

Required additions:
| Field | Purpose |
|-------|---------|
| `description` or `terms` (first line) | Card description text |
| `expiresAt` | Expiry date for time-limited vouchers |
| `isRedeemedInCurrentCycle` | Show "Redeemed" vs "Redeem >" |

### 7.3 Include Unavailable Favourites

**Product decision:** Unavailable favourites must be returned by the backend with their status, not silently filtered out.

Current behaviour: both endpoints filter on `MerchantStatus.ACTIVE` and `VoucherStatus.ACTIVE`. This silently removes suspended merchants and inactive vouchers from the response.

Required change:
- Remove the `ACTIVE` filter from the `where` clause
- Include `status` in the response so the frontend can apply unavailable treatment
- For voucher favourites: also include `merchant.status` (already included) so the frontend can detect merchant suspension
- Sort order: available items first, unavailable items last (backend-side or client-side)

### 7.4 Pagination

Both endpoints must support pagination:
- Query params: `page` (default 1), `limit` (default 20)
- Response: `{ items: [...], total: number, page: number, limit: number }`

### 7.5 Open/Closed Status

Merchant open/closed status requires branch operating hours. Two approaches:
- **Option A (recommended):** Backend computes `isOpen` boolean based on nearest/main branch hours and returns it in the response
- **Option B:** Return branch `operatingHours` and compute client-side

Recommend Option A to keep the frontend simple.

---

## 8. Component Architecture

```
FavouritesScreen
├── Header (gradient + title + TabSwitcher)
├── TabSwitcher (Merchants | Vouchers)
├── FlatList (active tab)
│   ├── NudgeBanner (free users only, dismissible)
│   ├── MerchantFavCard (reuses MerchantTile pattern)
│   │   └── SwipeToRemove wrapper
│   ├── VoucherFavCard
│   │   └── SwipeToRemove wrapper
│   ├── SkeletonCards (loading)
│   ├── EmptyState (no items)
│   └── FooterSpinner / EndLabel
├── UndoToast (shown on removal)
└── ErrorState (on fetch failure)
```

### Hooks
- `useFavouriteMerchants()` — React Query infinite query
- `useFavouriteVouchers()` — React Query infinite query
- `useRemoveFavourite(type)` — mutation with optimistic update + undo support
- `useSubscription()` — existing hook, for free user nudge detection

---

## 9. Design Token Reference

All values from `tokens.ts`:

| Element | Token / Value |
|---------|---------------|
| Header gradient | `color.brandGradient` 5-stop |
| Tab bar gradient | `['#E20C04','#D10A03','#E84A00']` |
| Card shadow | elevation.sm extended |
| Card radius | `radius.lg` (16px) or 14px custom |
| Card gap | `spacing[3]` (12px) |
| List padding | `spacing[3]` horizontal, `spacing[3]` + 2px top |
| Brand rose | `color.brandRose` (`#E20C04`) |
| Navy | `#010C35` |
| Muted text | `#9CA3AF` |
| Separator dots | `#D1D5DB` |
| Motion stagger | 40ms per card |
| Tab bar height | `layout.tabBarHeight` |
