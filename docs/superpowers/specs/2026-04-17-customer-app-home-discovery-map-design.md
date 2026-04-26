# Customer App — Home, Discovery & Map Tab Design Spec

---

## Overview

This spec defines the visual design, interaction patterns, and screen states for the Home & Discovery screens and Map Tab of the Redeemo customer app (React Native / Expo). These screens are the primary discovery surface — where users find merchants, browse vouchers, search, filter, and explore by location.

This spec covers **mobile app only**. The customer website has its own implementation (Phase 3D, complete).

**Mockups:** Visual companion files in `.superpowers/brainstorm/62129-1776350922/content/`
- `home-discovery-v1.html` — Home & Discovery (v7, approved)
- `map-tab-v1.html` — Map Tab (v2, approved)

---

## Section 1: Design System

### 1.1 Brand Colours

| Token | Hex | Usage |
|-------|-----|-------|
| navy | `#010C35` | Primary text, nav backgrounds, dark UI |
| brandRose | `#E20C04` | Primary accent, CTAs, active states |
| brandCoral | `#E84A00` | Gradient endpoint, secondary accent |
| cream | `#FFF9F5` | Page background |
| white | `#FFFFFF` | Cards, inputs |

### 1.2 Gradient Definitions

| Name | CSS | Usage |
|------|-----|-------|
| Nav bar | `linear-gradient(135deg, #E20C04 0%, #D10A03 40%, #E84A00 100%)` | Bottom tab bar — top-left to bottom-right with more red tone |
| CTA button | `linear-gradient(135deg, #E20C04, #E84A00)` | Primary action buttons |
| Save pill | `linear-gradient(135deg, #ECFDF5, #D1FAE5)` | Savings amount indicator |
| Featured border glow | `linear-gradient(135deg, rgba(226,12,4,0.25), rgba(232,74,0,0.15), transparent, rgba(226,12,4,0.1))` | Animated border on featured cards |

### 1.3 Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display / headings | Mustica Pro | SemiBold (600) | 17–24px |
| Body / labels | Lato | Regular–Bold (400–700) | 10–14px |
| Badges / pills | Lato | ExtraBold (800) | 8–10px |

### 1.4 Spacing & Sizing

- Base spacing unit: 4px (8dp grid)
- Screen horizontal padding: 18px
- Card border-radius: 16px
- Pill border-radius: 50px (fully rounded)
- Touch targets: minimum 44×44pt
- Touch spacing: minimum 8px gap

### 1.5 Motion

| Pattern | Duration | Easing |
|---------|----------|--------|
| Micro-interaction | 150–300ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring) |
| Carousel auto-slide | 10–12s cycle | `ease-in-out` |
| Pin drop | 500ms | spring easing |
| Sheet slide up | 400ms | spring easing |
| Card slide up | 350ms | spring easing |
| Stagger per item | 60–80ms delay | spring easing |
| Skeleton shimmer | 1.5s loop | `ease-in-out` |

### 1.6 Iconography

- SVG icons only — no emoji (per UI/UX Pro Max rule `no-emoji-icons`)
- Icon libraries: Heroicons or Lucide style (2px stroke, round caps)
- Category icons: filled style with category-specific colour background
- Map pin icons: white on category colour, 14–16px

---

## Section 2: Navigation

### 2.1 Bottom Tab Bar

5 tabs: **Home** | **Map** | **Favourite** | **Savings** | **Profile**

| Property | Value |
|----------|-------|
| Background | Nav gradient (135deg, rose → red → coral) |
| Padding | 8px top, 28px bottom (safe area) |
| Shadow | `0 -4px 20px rgba(226,12,4,0.18)` |
| Active icon | White, full opacity |
| Inactive icon | White, 55% opacity |
| Active indicator | 4px white dot above icon |
| Label size | 9.5px, weight 600 |

### 2.2 Tab Behaviour

- Home and Map tabs are always enabled
- Favourite, Savings, Profile: disabled for unauthenticated users (no onPress, `accessibilityState.disabled`)
- Active tab shows white dot indicator above icon

---

## Section 3: Home Screen (D1)

### 3.1 Header

- Greeting: "Good morning, {firstName}" (time-based: morning/afternoon/evening)
- Below greeting: GPS location label (e.g. "Shoreditch, London") with pin icon
- Right side: search icon, filter icon, notification bell, user avatar (32px circle)

### 3.2 Campaign Banner Carousel

- Full-width sliding carousel with 3 campaign banners
- Each banner: unique gradient background, campaign title, subtitle, CTA button
- Animation: `slideCarousel3` — horizontal translateX sliding (0% → -100% → -200%), 12s cycle
- Dot indicators below: synced width + colour animation (active dot = wider + branded colour)
- Content from `GET /api/v1/customer/campaigns`

### 3.3 Category Grid

- 2 rows × 3 columns = 5 categories + 1 "More" tile
- Each tile: 56×56px coloured icon circle + category name below
- "More" tile: navy background, grid icon, opens All Categories page
- Tile press: scale(0.95) feedback, navigates to category results
- Content from `GET /api/v1/customer/categories`

### 3.4 Featured Merchants Carousel

- Section header: star icon + "Featured" label + "See all" link
- Sliding carousel matching campaign animation (translateX, 10s cycle)
- Synced dot indicators below

#### Featured Merchant Tile (canonical layout)

This tile layout is reused across Home and Map tab:

| Element | Position | Style |
|---------|----------|-------|
| Banner image | Top, 76–80px height | Gradient placeholder + shimmer animation |
| FEATURED badge | Top-left, absolute | Rose→coral gradient, 8px uppercase bold white |
| Favourite heart | Top-right, absolute | 28px circle, glass blur background |
| Merchant logo | Bottom-left of banner, overlapping | 34px rounded square, white border + shadow |
| Merchant name | Below banner, 18px top padding | 13px bold, navy |
| Star rating | Inline right of name | Gold star + score + grey count |
| Info row | Below name | 10.5px grey — "{category} · {area}, {distance}" |
| Pill row | Below info | voucher count (red pill) + save amount (green pill) + open/closed status |

- Card: white background, 16px border-radius, featured glow border animation
- Content from `GET /api/v1/customer/home` → `featured` array

### 3.5 Scrolled View (below fold)

- **Trending section:** warm gradient background, "Trending near you" header with flame icon, horizontal scroll of merchant tiles
- **Nearby by Category:** per-category horizontal carousels (e.g. "Food & Drink near you"), each with merchant tiles
- Sticky search bar appears on scroll (elevated with shadow)

### 3.6 Empty / No Merchants State

When a category has 0 merchants in the user's area:
- Floating pin illustration (subtle float animation)
- Title: "No {category} merchants nearby"
- Subtitle: "We don't have any {category} merchants in {area} yet, but we're growing fast!"
- Two CTAs: "Expand search area" (primary gradient) + "Browse other categories" (outlined)
- Nearest suggestion card: "{count} merchants in {nearby area}" with distance

---

## Section 4: Search

### 4.1 Search Entry

- Tapping search icon or search bar opens focused search view
- Search input: white card, red accent border when focused, blinking cursor
- Cancel link to dismiss

### 4.2 Trending Searches

Shown below search bar before user types:
- Header: lightning bolt icon + "Trending" label (uppercase, 11px)
- Pill-shaped tags: Pizza, Brunch, Nail salon, Barber, Gym, Coffee
- Tapping a tag fills search input and triggers search

### 4.3 Typeahead Results

As user types (after 1–2 characters):
- Results appear instantly below search bar
- Each result: merchant logo (42px rounded), name with matched text highlighted in `#E20C04`, category + distance
- Right side: save amount pill + open/closed status
- Skeleton loading states (shimmer) shown for pending results
- Loading indicator: small red dot + "Loading" text

### 4.4 Search API

- `GET /api/v1/customer/search` with `q` parameter
- Debounce: 300ms after last keystroke
- Minimum query length: 1 character for typeahead

---

## Section 5: All Categories

Triggered by tapping "More" tile in the category grid.

### 5.1 Layout

- Back button + "All Categories" title
- Search bar for filtering category list
- Vertical list of category items

### 5.2 Category List Item

- Coloured icon circle (category colour) with category-specific SVG icon
- Category name (14px bold, navy)
- Merchant count nearby (12px grey)
- Chevron right
- Staggered `fadeInUp` animation (0.4s spring, 80ms per-item delay)

---

## Section 6: Filter Bottom Sheet

Accessible from filter icon on search bar (home and map). Slides up as bottom sheet.

### 6.1 Filter Sections (in order)

1. **Category** — Horizontal pill row. Pre-selected when opened from a category page. Active state: red background + white text + X dismiss button. Tapping a category reveals subcategories.
2. **Subcategory** — Shown conditionally when a category is selected. Horizontal pill row (All / specific subcategories). Navy active state.
3. **Sort by** — Pill row: Relevance (default), Nearest, Top Rated, Highest Saving
4. **Voucher type** — Multi-select chips: BOGO, Discount, Freebie, Spend & Save, Package Deal. Active state: red background.
5. **Distance** — Slider, 0–10 miles, shows current value label (e.g. "2 mi")
6. **Min. Savings** — Slider with green gradient track, shows "£{value}+" label
7. **Amenities** — Multi-select chips with icons: Wi-Fi, Parking, Wheelchair Access, Family Friendly, Outdoor Seating, Pet Friendly. Active state: navy background + white.
8. **Open now** — Toggle switch (green when on)

### 6.2 Apply Button

- Full-width at bottom: "Show {count} results" with result count
- Gradient background (rose → coral)

### 6.3 Filter API Mapping

| Filter | API Parameter |
|--------|--------------|
| Category | `categoryId` |
| Subcategory | `subcategoryId` |
| Sort by | `sortBy` (relevance/nearest/top_rated/highest_saving) |
| Voucher type | `voucherTypes` (comma-separated) |
| Distance | `maxDistanceMiles` |
| Min. Savings | `minSaving` |
| Amenities | `amenityIds` (comma-separated) |
| Open now | `openNow` (true/false) |

---

## Section 7: Map Tab (D2)

### 7.1 Default View

- Full-screen map (react-native-maps or mapbox)
- Search bar at top (same style as home, with filter button)
- Category pill row below search bar (horizontally scrollable)
- User location: blue dot (16px) with pulsing blue ring
- Re-centre button: always visible, bottom-right corner, white circle, z-index 18
- List toggle button: bottom-left, navy pill "List", z-index 18

### 7.2 Map Pins

- Teardrop shape (34×42px), rotated 45deg
- Colour: category `pinColour` from database
  - Food & Drink: `#E65100`
  - Beauty & Wellness: `#E91E8C`
  - Fitness & Sport: `#4CAF50`
  - Shopping: `#7C4DFF`
- Icon inside: white category SVG icon (14px)
- Drop animation: `pinDrop` 500ms spring, staggered per pin
- Selected pin: larger (42×50px), red pulse ring animation

### 7.3 Cluster Pins

When zoomed out with overlapping pins:
- Navy circle (42px) with white border (3px)
- White number showing merchant count
- Tapping expands to individual pins (zoom in)

### 7.4 Merchant Tile (on pin select)

When a pin is tapped, a **featured-style merchant tile** slides up from the bottom, floating above the nav bar:
- Uses the **exact same layout** as the Featured Merchant Tile (Section 3.4)
- Additional elements:
  - **Close button (X)**: top-right of banner, 28px glass circle
  - **Swipe indicator dots**: below the tile content, showing position in nearby merchant sequence
- Tile is an independent floating card, not attached to a sheet
- Slide-up animation: 350ms spring easing

### 7.5 Swipeable Merchant Tiles

- User can swipe the merchant tile left/right to browse nearby merchants
- Scroll-snap: one tile per swipe position
- On swipe: the corresponding pin auto-highlights on the map (pulse animation)
- Dot indicators update to reflect current position
- Map camera pans smoothly to keep the highlighted pin centred in view

### 7.6 Closing the Tile

- Tap the X button on the banner
- Swipe the tile down (gesture dismiss)
- Pin deselects, pulse stops

### 7.7 Location Search (Remote Browsing)

Users can search for a different city/area to browse merchants there:

#### Search Flow
1. User taps the search bar and types a city name (e.g. "Manchester")
2. Typeahead shows location results:
   - First result: "Use current location" with blue location icon + "Current" badge
   - City results: pin icon + city name (matched text highlighted in red) + region subtitle
3. User taps a city → map re-centres to that location, pins reload for that area

#### Remote Location Indicator
- Navy pill badge below search bar: pin icon + "{City name}" + X dismiss button
- Category pills shift down below the badge
- No user location dot shown (user is not physically there)
- Tapping X or "Use current location" returns to local view

#### API
- Map viewport changes trigger `GET /api/v1/customer/search` with bounding box params (`minLat`, `maxLat`, `minLng`, `maxLng`)
- City geocoding: use device geocoder or a geocoding API to convert city name to lat/lng

### 7.8 List View

Toggled via the "List" button:
- Draggable half-sheet slides up over the map (380px height)
- Handle bar at top for drag gesture
- Header: "Nearby Merchants" + count + sort selector (red text)
- Scrollable list of merchant rows:
  - Category-coloured icon thumbnail (52px)
  - Merchant name, category, star rating, distance
  - Save amount pill (right-aligned)
- Staggered fadeInUp animation per row
- Map dims behind the sheet

### 7.9 Category Filtering

- Horizontal pill row below search bar
- "All" pill (active by default, red)
- Category pills: coloured dot + name
- Tapping a category: filters pins on map to that category only, active pill turns red

### 7.10 Location Permission

First-time users without location permission:
- Full overlay on map area (95% opacity cream)
- Floating pin icon with gentle bounce animation
- Title: "Find merchants near you"
- Description: "Enable location access to discover the best deals nearby. We only use your location while using the app."
- Primary CTA: "Enable Location" (gradient button)
- Skip link: "Browse without location" (underlined grey text)

### 7.11 Empty Area

When user pans to an area with no merchants:
- Floating card at bottom: pin icon + "No merchants in this area"
- Subtitle: "Try zooming out or moving the map to discover more deals nearby"
- Two CTAs: "Re-centre" (primary) + "Clear Filters" (secondary)
- Re-centre button remains visible independently

---

## Section 8: Backend API Dependencies

All APIs exist and are implemented (Phase 3B). No new backend work required.

| Screen | API Endpoint | Key Response Fields |
|--------|-------------|-------------------|
| Home feed | `GET /api/v1/customer/home` | `featured`, `trending`, `campaigns`, `nearbyByCategory`, `locationContext` |
| Merchant detail | `GET /api/v1/customer/merchants/:id` | Full merchant profile with branches, vouchers, photos |
| Branch list | `GET /api/v1/customer/merchants/:id/branches` | Branches with lat/lng, opening hours |
| Voucher detail | `GET /api/v1/customer/vouchers/:id` | Voucher with `isRedeemedThisCycle` |
| Search | `GET /api/v1/customer/search` | Enriched merchant tiles with distance, rating, saving |
| Categories | `GET /api/v1/customer/categories` | Active categories with merchant counts |
| Campaigns | `GET /api/v1/customer/campaigns` | Active campaigns with banners |
| Campaign merchants | `GET /api/v1/customer/campaigns/:id/merchants` | Paginated merchants in campaign |

### Enriched Merchant Tile Response Shape

```typescript
{
  id: string
  businessName: string
  tradingName: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryCategory: { id: string; name: string } | null
  voucherCount: number
  maxEstimatedSaving: number | null
  distance: number | null          // metres from user
  nearestBranchId: string | null
  avgRating: number | null
  reviewCount: number
  isFavourited: boolean
}
```

---

## Section 9: State Definitions

### 9.1 Loading States

- Skeleton shimmer placeholders for all content areas
- Shimmer: `linear-gradient(90deg, #E5E7EB 25%, #F3F4F6 50%, #E5E7EB 75%)` animating horizontally
- Used for: merchant tiles, search results, category list, campaign banners

### 9.2 Error States

- Network error: toast notification with retry action
- API error: inline message with retry button
- Location permission denied: show "Browse without location" fallback, use profile city if available

### 9.3 Empty States

| Context | Message | CTAs |
|---------|---------|------|
| Category with 0 merchants | "No {category} merchants nearby" | "Expand search area" + "Browse other categories" + nearest suggestion card |
| Map empty area | "No merchants in this area" | "Re-centre" + "Clear Filters" |
| Search no results | "No merchants found for '{query}'" | "Try a different search" + "Browse categories" |

---

## Section 10: Accessibility

- All touch targets: minimum 44×44pt with 8px spacing
- Colour contrast: WCAG 2.1 AA (4.5:1 minimum for text)
- All icons have `accessibilityLabel`
- Map pins have `accessibilityLabel`: "{merchant name}, {category}"
- Focus order matches visual order
- Respect `prefers-reduced-motion`: disable auto-carousels, skeleton shimmer, pin drop animations
- VoiceOver: carousel tiles announce position ("1 of 3")
- Screen reader: filter state announced on change

---

## Section 11: Performance Considerations

- Map pins: virtualised rendering, cluster pins at zoom levels with >10 overlapping pins
- Search typeahead: 300ms debounce
- Map viewport search: debounce 500ms after pan/zoom stops, use bounding box query
- Image lazy loading for merchant banners and logos
- Category/campaign data: cache for session duration (changes infrequently)
- Merchant tile images: use `srcSet` / responsive images where possible
