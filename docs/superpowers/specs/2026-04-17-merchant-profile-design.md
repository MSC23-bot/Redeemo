# Customer App — Merchant Profile Screen Design Spec

---

## Overview

This spec defines the visual design, interaction patterns, and screen states for the Merchant Profile screen of the Redeemo customer app (React Native / Expo). This is the primary merchant detail surface — where users view merchant info, browse vouchers, read reviews, find branches, and initiate redemption.

This spec covers **mobile app only**. The customer website has its own merchant profile implementation (Phase 3D, complete).

**Mockups:** Visual companion files in `.superpowers/brainstorm/86928-1776428972/content/`
- `merchant-profile-v6.html` — Final approved design (v6 base + v7 polish fixes)

---

## Section 1: Design System (extends Home & Discovery spec)

All tokens, colours, typography, and motion from `2026-04-17-customer-app-home-discovery-map-design.md` Section 1 apply. This section documents additions specific to the Merchant Profile screen.

### 1.1 Spacing Scale (CSS custom properties / design tokens)

All spacing uses an 8dp-based scale:

| Token | Value | Usage |
|-------|-------|-------|
| sp-4 | 4px | Micro gaps (dot-to-label, icon-to-text) |
| sp-8 | 8px | Pill gaps, tight element spacing |
| sp-12 | 12px | Card internal gaps, branch card spacing |
| sp-16 | 16px | Voucher list gap, tab padding-top, content padding between cards |
| sp-20 | 20px | Content area padding, card internal padding, action button margin-top |
| sp-24 | 24px | Sheet side padding, meta bottom padding |
| sp-32 | 32px | Reserved for larger separators |
| sp-40 | 40px | Sheet bottom padding, gate card top padding |
| sp-48 | 48px | Meta section top padding (logo overlap accommodation) |

### 1.2 Voucher Type Colour Palette

Each voucher type has a distinct pastel background gradient and accent colour:

| Voucher Type | Background Gradient | Accent / Stripe | Badge Text |
|-------------|-------------------|-----------------|------------|
| BOGO | `#F5F3FF` → `#EDE9FE` (lavender) | `#7C3AED` (purple) | `#6D28D9` |
| DISCOUNT | `#FEF2F2` → `#FEE2E2` (rose) | `#E20C04` (brandRose) | `#B91C1C` |
| FREEBIE | `#F0FDF4` → `#DCFCE7` (mint) | `#16A34A` (green) | `#15803D` |
| PACKAGE | `#EFF6FF` → `#DBEAFE` (sky) | `#2563EB` (blue) | `#1D4ED8` |
| TIME_LIMITED | `#FFFBEB` → `#FEF3C7` (amber) | `#D97706` (amber) | `#B45309` |
| REUSABLE | `#F0FDFA` → `#CCFBF1` (teal) | `#0D9488` (teal) | `#0F766E` |
| SPEND_SAVE | `#FFF7ED` → `#FFEDD5` (peach) | `#EA580C` (orange) | `#C2410C` |
| Redeemed | `#F3F4F6` → `#E5E7EB` (grey) | `#9CA3AF` | `#9CA3AF` |

### 1.3 Elevation / Shadow Scale

| Element | Shadow | Purpose |
|---------|--------|---------|
| Voucher card | `0 6px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)` | High prominence — primary interactive element |
| Branch card | `0 4px 20px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)` | Medium-high prominence — location cards |
| About card | `0 1px 4px rgba(0,0,0,0.03)` | Low prominence — info cards on white bg |
| Review summary | `0 1px 4px rgba(0,0,0,0.03)` | Low prominence |
| Logo box | `0 4px 20px rgba(0,0,0,0.12)` | Overlaps hero — needs depth |
| Gate modal | `0 24px 80px rgba(0,0,0,0.35)` | Maximum prominence — overlay modal |

---

## Section 2: Screen Structure

### 2.1 Layout Architecture

The Merchant Profile is a single scrollable screen with:
1. **Hero** — Full-bleed banner image (230px height)
2. **Meta** — Merchant name, category, rating, status, action buttons (cream background)
3. **Tab bar** — Sticky at top on scroll (Vouchers | About | Branches | Reviews)
4. **Content area** — Tab-specific content (white background)

### 2.2 Hero Section

| Element | Spec |
|---------|------|
| Height | 230px |
| Background | Gradient placeholder, merchant banner image when available |
| Overlay | Bottom gradient fade for legibility |
| Back button | 40px circle, top-left, frosted glass (`rgba(0,0,0,0.3)` + `backdrop-filter: blur(16px)`) |
| Action buttons | Share + Favourite, top-right, same frosted style, 8px gap |
| Badges | Bottom-right corner of banner. Featured (amber) and/or Trending (rose). Frosted glass background with border. |
| Logo | 66px square, 16px border-radius, white border, overlaps hero by 30px into meta. Positioned left-aligned at 20px. |

### 2.3 Meta Section

| Element | Spec |
|---------|------|
| Background | cream (`#FFF9F5`) |
| Top padding | 48px (accommodates logo overlap) |
| Bottom padding | 24px |
| Merchant name | 24px, weight 800, navy, letter-spacing -0.5px |
| Category | 13px, weight 500, text-secondary (`#4B5563`) |
| Rating pill | White background, shadow, star icon + score + count. Positioned top-right of name row. |
| Info row | Location pin + branch name + distance, separator dots, open/closed status with animated dot, hours text. 12px margin-top. |
| Open status | Green dot (7px, pulsing animation), "Open" text in green (#16A34A) |
| Closed status | Red dot (7px, no animation), "Closed" text in red (#B91C1C) |
| Action buttons | 3-button row: Website (brand gradient), Contact (outline), Directions (outline). 20px margin-top. 14px border-radius, 12px padding. |

### 2.4 Tab Bar

| Element | Spec |
|---------|------|
| Position | Sticky at top when scrolled past |
| Background | White |
| Tab labels | 13px, weight 600, muted colour. Active: navy, weight 700 |
| Active indicator | 3px height, brand gradient, rounded top corners, positioned at bottom of active tab |
| Count badges | Inline pill next to tab label. Active tab: brand tint background. Inactive: muted background. |
| Tabs | Vouchers (count), About, Branches (count), Reviews (count) |

### 2.5 Multi-Branch vs Single-Branch Behaviour

| Scenario | Branches tab | Meta section |
|----------|-------------|-------------|
| Multi-branch (2+) | Shown with branch count | Shows nearest branch name + distance in info row |
| Single-branch | Hidden entirely | Full address displayed naturally in info row, no "Branches" tab |

---

## Section 3: Vouchers Tab

### 3.1 Voucher Card Design (Coupon Style)

Each voucher card uses a coupon metaphor with:

| Element | Spec |
|---------|------|
| Border-radius | 16px |
| Shadow | `0 6px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)` |
| Left stripe | 4px wide, voucher accent colour, full height |
| Background | Voucher-type pastel gradient (see Section 1.2) |
| Favourite heart | Top-right, 34px circle, frosted glass. Filled red when favourited. |
| Type badge | Top-left in body. Dashed border, type-colour text, uppercase, 10px. SVG icon + label. |
| Title | 16px, weight 800, navy. 12px below type badge. |
| Description | 12px, text-secondary, 8px below title. |
| Save amount | Pill with voucher accent background, white text, 12px weight 800. Tag SVG icon. Uses `£` (GBP). 12px below description. |
| Redeem CTA | "Redeem now" in rose, arrow icon, 11px weight 700. |
| Stub divider | 2px dashed border with circular cutouts (16px) at left and right edges — coupon perforation effect. |
| Stub content | Info pills (expiry, terms, time-window status). Left-aligned. |

### 3.2 Voucher Card States

| State | Visual Treatment |
|-------|-----------------|
| Available | Full colour, "Redeem now" CTA visible |
| Favourited | Heart icon filled red, red tint background |
| Redeemed (this cycle) | 50% opacity, greyscale filter. Grey background. "Redeemed" stamp badge (top-right). "View code" pill in stub. |
| TIME_LIMITED — Active | Green pulsing badge in stub: "Active now · ends [time]". Green border + glow animation. |
| TIME_LIMITED — Ending soon | Red pulsing badge in stub: "Ending soon · [X] min left". Red border + glow animation. Faster pulse (1.5s vs 2s). |
| TIME_LIMITED — Outside window | 85% opacity. Muted badge: "Next window: [day] [time]". No animation. "Available [days], [times]" replaces redeem CTA. |

### 3.3 Voucher List

- Vertical stack, 16px gap between cards
- Sorted: available first, then redeemed at bottom
- Content area padding: 20px all sides

---

## Section 4: About Tab

### 4.1 Card-Based Layout

The About tab uses stacked info cards on a white background. Each card:
- White background, 16px border-radius, 20px padding
- 16px gap between cards
- Subtle border: `1px solid rgba(0,0,0,0.03)`
- Low shadow: `0 1px 4px rgba(0,0,0,0.03)`

### 4.2 Cards

#### About [Merchant Name]
- Title: "About [Merchant Name]" with a home/store SVG icon in rose
- Body: 13px, text-secondary, line-height 1.7
- Truncated with "Read more" link in rose after ~3 lines
- Tapping expands to full text

#### Photos
- Title: "Photos" with image SVG icon
- Horizontal scroll row of photo thumbnails
- 110x82px, 12px border-radius, 8px gap
- Placeholder gradient backgrounds

#### Amenities
- Title: "Amenities" with checkmark SVG icon
- 2-column grid, 12px gap
- Each item: compact card with 32px icon box (rose-tinted background), 11px label
- Padding: 8px vertical, 12px horizontal
- Border-radius: 10px

#### Opening Hours
- Title: "Opening Hours" with clock SVG icon
- Title row includes open/closed status indicator (right-aligned): green pulsing dot + "Open now" text (or red dot + "Closed")
- 7-row table: day name | hours (right-aligned)
- Today's row: rose-coloured day name, "TODAY" badge, rose-coloured time
- 8px vertical padding per row, bottom border separator

---

## Section 5: Branches Tab

### 5.1 Branch Card Design

| Element | Spec |
|---------|------|
| Background | White |
| Border-radius | 16px |
| Padding | 20px |
| Shadow | `0 4px 20px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)` |
| Border | `1px solid rgba(0,0,0,0.04)` |
| Gap between cards | 12px |
| Tap behaviour | Navigate to branch detail or expand |
| Chevron | Right-aligned, muted colour |

### 5.2 Branch Card Content

- **Nearest branch**: Red label "YOUR NEAREST BRANCH" with location pin icon. Rose border highlight + rose-tinted shadow.
- **Branch name**: 15px, weight 800, navy
- **Address**: 12px, text-secondary, 4px below name
- **Meta row**: Distance · Open/Closed status (with animated dot) · Hours · Rating (star + score + count). 8px margin-top.
- **Action buttons** (nearest only): Call, Directions, Hours — 3 outline buttons in a row, 16px margin-top.

### 5.3 Single Branch Behaviour

When merchant has only one branch:
- Branches tab is hidden entirely
- Branch info (address, distance, open status, hours) appears naturally in the meta section
- No "Branches" count shown anywhere

---

## Section 6: Reviews Tab

### 6.1 Review Summary Card

| Element | Spec |
|---------|------|
| Layout | Large score (46px, weight 800) + 5-star row + total count on left. Star distribution bars on right. |
| Star bars | 5→1 rows, horizontal track with amber fill proportional to count. |
| Write Review CTA | Full-width brand gradient button, 13px weight 700. Below summary. 20px margin-top. |

### 6.2 Review Cards

| Element | Spec |
|---------|------|
| Avatar | 40px circle, brand gradient or navy background, initials |
| Name + Verified | Name in navy 13px weight 800. "Verified" badge in green with checkmark icon. |
| Date + Branch | 11px, muted. "2 days ago · High Street Branch" |
| Stars | Mini star row, 12px icons |
| Review text | 13px, text-secondary, line-height 1.6 |
| Helpful | Thumbs-up icon + "Helpful (N)" link, 11px muted. 12px margin-top. |

### 6.3 Own Review

- Highlighted with thicker border (`1.5px solid border-colour`)
- "YOUR REVIEW" label in rose, uppercase, above content
- Edit + Delete icon buttons in top-right corner
- Delete button icon in red

### 6.4 Sort Control

- Positioned between summary and review list
- Left: "[N] reviews" count label
- Right: Dropdown selector — "Most recent" default. Options: Most recent, Highest rated, Lowest rated, Most helpful.

---

## Section 7: Bottom Sheets

### 7.1 Common Sheet Style

| Element | Spec |
|---------|------|
| Overlay | `rgba(1,12,53,0.5)` with `backdrop-filter: blur(6px)` |
| Sheet | White/cream, 24px top border-radius, 24px side padding, 40px bottom padding |
| Drag handle | 36px wide, 4px height, centred, grey. 20px margin-bottom. |
| Title | 20px, weight 800, navy, -0.3px letter-spacing. 20px margin-bottom. |

### 7.2 Contact Sheet

- Triggered by "Contact" button in meta
- Shows branch name subtitle (12px, muted)
- Three contact items: Phone, Email, Website
- Each item: 48px icon circle + label + value + chevron arrow
- **Icon colours use brand palette:**
  - Phone: brand gradient (rose → coral)
  - Email: navy gradient
  - Website: coral → orange gradient
- Items separated by border, 16px vertical padding

### 7.3 Directions Sheet

- Triggered by "Directions" button in meta
- Map preview: 160px height, border-radius 16px, placeholder with map pin icon. "Tap to open map" overlay pill.
- Address: 16px, weight 800, navy
- Distance: 13px, text-secondary, with location pin icon. Includes walk time estimate.
- Get Directions CTA: Full-width brand gradient button, 15px weight 800. Box shadow. Opens native maps app.

---

## Section 8: Free User Gate (Subscribe Modal)

### 8.1 Trigger

When a user without an active subscription taps any voucher card, the gate modal slides up instead of navigating to voucher detail.

### 8.2 Modal Design

| Element | Spec |
|---------|------|
| Animation | Slide up from bottom + scale (0.95 → 1), 0.5s spring easing |
| Background | White, 28px border-radius, 40px top padding, 24px side padding, 32px bottom padding |
| Top accent | 4px gradient bar across top |
| Icon | 72px square, 20px border-radius, brand gradient, lock icon. Pulsing glow shadow animation (2.5s). Sparkle dots (6px, white) animate in/out around icon. |
| Title | "Unlock Voucher Redemption", 22px weight 800, navy, -0.4px letter-spacing |
| Subtitle | 14px, text-secondary, line-height 1.6. Mentions merchant name in bold. |
| Voucher count | Rose text, 12px weight 700. Tag icon + "[N] vouchers waiting to be redeemed" |
| Monthly CTA | Full-width brand gradient button. "Subscribe — £6.99/mo", 16px weight 800. Gradient shadow. |
| Divider | "or" text with horizontal lines |
| Annual CTA | Outline button. "£69.99/year" + "SAVE 2 MONTHS" green badge. |
| Dismiss | "Maybe later" text link, muted, 13px weight 600. 20px margin-top. |

---

## Section 9: Backend Dependencies

### 9.1 Required API Endpoints (existing)

| Endpoint | Plugin | Purpose |
|----------|--------|---------|
| `GET /api/v1/customer/discovery/merchants/:id` | customer-discovery | Merchant profile data |
| `GET /api/v1/customer/discovery/merchants/:id/branches` | customer-discovery | Branch list |
| `GET /api/v1/customer/discovery/merchants/:id/vouchers` | customer-discovery | Voucher list |
| `GET /api/v1/customer/discovery/vouchers/:id` | customer-discovery | Voucher detail |
| `GET /api/v1/customer/merchants/:id/reviews` | customer-reviews (open) | Review list with pagination, sort |
| `GET /api/v1/customer/branches/:branchId/reviews` | customer-reviews (open) | Branch-specific reviews |
| `POST /api/v1/customer/branches/:branchId/reviews` | customer-reviews (auth) | Create/update own review |
| `DELETE /api/v1/customer/branches/:branchId/reviews/:reviewId` | customer-reviews (auth) | Delete own review |
| `POST /api/v1/customer/favourites/merchants` | customer-profile | Add merchant favourite |
| `DELETE /api/v1/customer/favourites/merchants/:id` | customer-profile | Remove merchant favourite |
| `POST /api/v1/customer/favourites/vouchers` | customer-profile | Add voucher favourite |
| `DELETE /api/v1/customer/favourites/vouchers/:id` | customer-profile | Remove voucher favourite |

### 9.2 Data Requirements

- Merchant: name, category, subcategory, description, bannerImageUrl, logoUrl, websiteUrl, rating (average + count), amenities, featured/trending flags
- Branch: name, address, postcode, latitude, longitude, phone, email, openingHours (JSON), isOpen (computed or client-side from hours)
- Voucher: all fields including type, title, description, terms, savingsAmount, currency, expiryDate, timeWindowStart/End, timeWindowDays, status, userRedemptionState (redeemed/available/outside-window)
- Review: userId, userName, rating, text, createdAt, branchName, isVerified, helpfulCount, isOwnReview

### 9.3 New API Needed

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/customer/merchants/:id/reviews/summary` | Review summary: average rating, star distribution counts (for the histogram) |
| `POST /api/v1/customer/reviews/:reviewId/helpful` | Toggle helpful vote on a review |

---

## Section 10: Accessibility

| Rule | Implementation |
|------|---------------|
| Contrast | All text meets WCAG 2.1 AA (4.5:1 normal, 3:1 large) |
| Touch targets | Minimum 44x44pt for all interactive elements |
| Touch spacing | Minimum 8px gap between adjacent targets |
| Focus states | Visible focus rings on all interactive elements (not removed) |
| Screen readers | All icons have accessibilityLabel. Voucher cards announce type, title, save amount, status. |
| Reduced motion | Respect `prefers-reduced-motion` — disable pulsing dots, gate sparkles, slide animations |
| Semantic labels | Open/closed status announced. Redeemed state announced. TIME_LIMITED window state announced. |
| Favourite toggle | Announces "Added to favourites" / "Removed from favourites" |

---

## Section 11: Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| No vouchers | Empty state: illustration + "No vouchers available yet" message |
| No reviews | Empty state: "Be the first to review" CTA |
| No photos | Photos card hidden entirely in About tab |
| No amenities | Amenities card hidden entirely |
| Merchant suspended | Screen not reachable — API returns 404 |
| All vouchers redeemed | All cards shown in redeemed state, sorted to bottom |
| Guest user taps voucher | Same gate modal as free user — but CTA includes "Create account" flow |
| Deep link to merchant | Load full profile, default to Vouchers tab |
| Offline | Show cached data if available, otherwise error state with retry |
