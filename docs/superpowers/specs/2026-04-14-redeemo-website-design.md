# Redeemo Customer Website — Design Specification

**Date:** 2026-04-14  
**Status:** Approved — ready for implementation planning  
**Scope:** Customer-facing website (`apps/customer-web/`) — visual design, page layouts, UX patterns, and design system

---

## 1. Purpose and Scope

The Redeemo customer website is a fully functional Next.js 15 (App Router) site. It serves consumers who want to browse merchants, manage their subscription and account, and read editorial content. It is **not** a redemption surface — redemption is mobile-app only. The website is the primary subscription purchase and merchant discovery channel on desktop and mobile web.

### In scope
- All public marketing pages (home, how it works, pricing, for businesses, insider, FAQ, about)
- Discovery pages (discover, map, merchant profile)
- Auth flows (register, login/OTP, forgot/reset password)
- Subscription purchase flow
- Full account section (profile, subscription management, savings, favourites)

### Out of scope
- Redemption (mobile app only, by product design)
- Admin or merchant portal surfaces
- Native mobile app

---

## 2. Design System

### 2.1 Brand Gradient

The primary brand expression. Two stops only — no warm orange.

```
linear-gradient(135deg, #E20C04 0%, #E84A00 100%)
```

| Stop | Name | Hex |
|---|---|---|
| 0% | Rose Red | `#E20C04` |
| 100% | Coral Red | `#E84A00` |

**Use on:** primary CTA buttons, the R logo icon, gradient text in hero headlines, active nav indicators, step number circles, selected pill fills.  
**Do not use on:** page backgrounds, secondary buttons, error/destructive actions.

### 2.2 Colour Tokens

```css
:root {
  /* Brand */
  --brand-rose:     #E20C04;
  --brand-coral:    #E84A00;
  --brand-gradient: linear-gradient(135deg, #E20C04 0%, #E84A00 100%);
  --on-brand:       #FFFFFF;

  /* Navy — text AND dark section backgrounds */
  --navy:            #010C35;
  --navy-on:         #FFFFFF;
  --navy-on-muted:   rgba(255,255,255,0.60);
  --navy-border:     rgba(1,12,53,0.12);

  /* Page surfaces */
  --bg-page:       #FFFFFF;
  --bg-surface:    #FFFFFF;
  --bg-tint:       #FEF6F5;   /* warm tint — alternating section backgrounds */
  --bg-tint-deep:  #FEF0EE;   /* voucher panels, input fields */
  --bg-neutral:    #F8F9FA;   /* neutral cool-light for step/FAQ sections */

  /* Text */
  --text-primary:   #010C35;  /* navy — all headings, body copy, wordmark */
  --text-secondary: #4B5563;
  --text-muted:     #9CA3AF;
  --text-inverse:   #FFFFFF;

  /* UI chrome */
  --border:        #EDE8E8;   /* warm-tinted card borders */
  --border-subtle: #F5F0F0;
  --ring:          #E20C04;   /* keyboard focus outline */

  /* Functional */
  --savings:        #16A34A;   --savings-bg:     #F0FDF4;
  --featured:       #D97706;   --featured-bg:    #FFFBEB;
  --trending:       #DB2777;   --trending-bg:    #FCE7F3;
  --verified:       #2563EB;   --verified-bg:    #DBEAFE;
  --success:        #16A34A;   --success-bg:     #F0FDF4;
  --destructive:    #B91C1C;   --destructive-bg: #FEF2F2;
}
```

**Voucher type accent colours** (badge backgrounds and borders follow the same warm-tinted pattern):

| Type | Background | Text |
|---|---|---|
| BOGO | `#FFF7ED` | `#9A3412` |
| 50% Off | `#FEF3C7` | `#92400E` |
| Freebie | `#D1FAE5` | `#065F46` |
| Spend & Save | `#DBEAFE` | `#1E40AF` |
| Package Deal | `#FCE7F3` | `#9D174D` |
| Time-Limited | `#EDE9FE` | `#4C1D95` |
| Reusable | `#ECFDF5` | `#064E3B` |
| Fixed £ Off | `#FEF6F5` (dashed border) | `#9A3412` |

### 2.3 Navy Usage Rules

Navy serves two roles: **primary text colour** and **dark section background**.

| Role | Use |
|---|---|
| All primary text | Headings, body copy, wordmark — replaces pure black throughout |
| Section eyebrow labels | Uppercase tracking labels above section headings |
| Border-left accents | 3px navy left-border on stat blocks and callout cards |
| Footer background | The one full-section navy background on every page |

**Do not use navy** as a full section background above the footer on consumer-facing pages (hero, CTA strips). The home-page hero uses a warm-light gradient background. CTA strips use the brand gradient. The footer is the sole navy section.

**Exception — /for-businesses:** The merchant-facing hero uses a full-width navy background. This is intentional: Marcus (the merchant persona) responds to a more authoritative, less warm tone. The For Businesses page is the only non-footer page with a full-width navy section.

### 2.4 Section Background System

Pages alternate through three light surfaces:

| Surface | Hex | Used for |
|---|---|---|
| White | `#FFFFFF` | Default — cards, main content, forms |
| Warm Tint | `#FEF6F5` | Alternating sections, merchant grid backgrounds, voucher panel sections |
| Neutral Light | `#F8F9FA` | Steps, FAQ, how-it-works, neutral content sections |

**Card thumbnail image areas** use neutral gray `#EFEFEF` — never the same warm tint as the section background, to maintain depth hierarchy: warm tint section → white card → gray thumbnail.

### 2.5 Typography

Self-hosted from the Redeemo branding package. No Google Fonts dependency in production.

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Hero / Display | Mustica Pro SemiBold | 44px | SemiBold | −1px letter-spacing |
| H1 — Page title | Mustica Pro SemiBold | 28px | SemiBold | −0.3px letter-spacing |
| H2 — Section heading | Mustica Pro SemiBold | 20px | SemiBold | |
| H3 — Card heading | Lato | 16px | Bold | |
| Body standard | Lato | 15px | Regular | 1.65 line height |
| Body small | Lato | 13px | Regular | 1.55 line height |
| UI label | Lato | 11px | Bold | 1.5px letter-spacing, uppercase |
| Micro / badge text | Lato | 10px | Bold | 1px letter-spacing, uppercase |

### 2.6 Spacing

4px base unit. All spacing is a multiple of 4.

Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96px

### 2.7 Border Radius

| Value | Used for |
|---|---|
| 3px | Badges, small chips |
| 6px | Input fields |
| 8px | Buttons |
| 12px | Cards |
| 16px | Modals, sheets |
| 100px | Category pills, filter tags |
| 50% | Avatars |

### 2.8 Iconography

Lucide Icons throughout. 20×20px standard size, 1.5px stroke width. 32–40px for feature/section icons (placed on gradient-filled containers). Never emoji as structural icons.

### 2.9 Imagery

Real photography only — warm, local, slightly moody. No generic stock, no posed people on white backgrounds, no food renders. Category style rules:

- **Restaurants/cafés:** ambient lighting, food on table with people in soft background, texture and character (brick, wood, hanging lights)
- **Gyms/fitness:** clean, energetic, motion blur, natural light, real spaces
- **Spas/wellness:** serene, natural materials (stone, linen, greenery), soft diffused light
- **Beauty/salons:** focused craft, hands at work, warm but deliberate
- **Local context:** UK streets, real neighbourhoods, specific sense of place

Image specifications:

| Use | Dimensions | Ratio | Format |
|---|---|---|---|
| Merchant hero (profile page) | 1200×400px | 3:1 | WebP |
| Merchant card thumbnail | 600×400px | 3:2 | WebP |
| Insider post cover | 1200×630px | OG | WebP/JPEG |
| Homepage hero | 1920×1080px | 16:9 | WebP |
| Avatar / merchant logo | 200×200px | 1:1 | WebP/PNG |

---

## 3. Logo Usage

Two variants from the official brand package (`Branding/Redeemo Branding Package/Logo Files/`):

| Context | Variant |
|---|---|
| White and light backgrounds | Gradient R icon + Navy wordmark |
| Brand gradient sections | Frosted white icon + White wordmark |
| Navy footer | White icon + White wordmark |

---

## 4. Navigation

### 4.1 Navbar

- **At top of page:** white background, subtle bottom border, navy wordmark, gradient R icon
- **On scroll (past ~80px):** transitions to navy background, white wordmark and links
- **Height:** 60px
- **Max-width:** consistent with page container (max-w-7xl)
- **Left:** R icon + "Redeemo" wordmark
- **Centre:** Discover · How it works · Pricing · For businesses
- **Right (logged out):** Log in (ghost button) + Join free (gradient primary button)
- **Right (logged in):** Discover link visible, account avatar/menu
- **Mobile:** hamburger menu, full-screen nav overlay

Active nav link: gradient underline indicator, rose text colour.

### 4.2 Footer

Full-width navy (`#010C35`) background on every page.

- **Top row:** Logo (white variant) + tagline | Column links (Company, Support)
- **Bottom row:** copyright left | social icons + gradient CTA button right
- **Link columns:** About, How it works, For businesses, Pricing, Insider | FAQ, Privacy policy, Terms, Contact

---

## 5. Page Inventory

### 5.1 Home (`/`)

**Layout:** Warm-light hero → white features → warm tint merchant preview → gradient CTA → gray how-it-works → navy footer

**Hero section:**
- Background: `linear-gradient(160deg, #FFF8F7 0%, #FFFFFF 60%)` — warm-light, not dark
- Location chip (city indicator, white card with subtle shadow)
- H1 headline: "The membership that" + gradient text "rewards you locally." (Mustica Pro, 44px)
- Subheadline (15px, secondary text, max 440px wide)
- Primary CTA: gradient button "Get started — £6.99/mo"
- Secondary CTA: ghost button "See how it works"
- Stats card: 500+ merchants · £6.99/mo · 1× per merchant/cycle (white card, bordered, gradient numbers)

**Content sections:**
1. Feature grid (3 columns, white bg): Curated merchants / Monthly renewal / Local-first discovery — each with gradient icon container + description
2. Category grid (warm tint): horizontal scroll of category pills leading to full merchant grid
3. Featured merchants strip (white): horizontal scroll, merchant cards with featured badge
4. Trending merchants strip (warm tint): same card format, trending badge
5. How it works (neutral gray): 3-step numbered flow with gradient step circles
6. Subscription CTA (gradient section): "Less than one coffee a week" + white-on-gradient button + plan comparison
7. App download CTA: app store badges, phone mockup illustration
8. Footer (navy)

### 5.2 Discover (`/discover`)

**Layout:** Sticky filter bar at top → full-width content below

**Filter / category bar (sticky):**
- Top row: Category pills — All · Food & Drink · Health & Fitness · Beauty · Wellness · Leisure · Retail · Services
- When category selected: sub-category pills appear below (e.g. Food & Drink → Indian · Italian · Chinese · Japanese · Café · Pizza · Burgers · etc.)
- Filter/sort row: "Filters" button (opens panel) + active filter pills (dismissible) + Sort dropdown (Nearest / Trending / Top Rated / Newest)

**Campaign banner:** Full-width, location-targeted, admin-controlled. Rendered when active campaigns exist for the user's area.

**Featured merchants strip:** Horizontal scroll strip, gold "Featured" badge, distinct from main grid.

**Trending merchants strip:** Horizontal scroll strip, pink "Trending" badge.

**Merchant grid:** Responsive card grid (3 cols desktop, 2 cols tablet, 1 col mobile). Each merchant card:
- Thumbnail: real photo (neutral gray placeholder until loaded), 3:2 ratio
- Featured / Trending / New badges (top-left overlay)
- Save / heart button (top-right overlay, white circle)
- Merchant name (H3, navy)
- Category · Distance (muted text)
- Star rating + open/closed status + key amenity chips
- Voucher panel (warm tint, dashed border): voucher type label + title

**Filter panel (slide-in):** Sort (radio), Distance slider, Voucher type (checkboxes), Minimum rating (star select), Open now (toggle), Amenities (grid: parking, wheelchair, outdoor seating, child-friendly, WiFi, dogs welcome, takeaway, reservations, showers)

**Empty state:** Illustrated icon + "No merchants found" + suggestion to widen filters.

### 5.3 Map (`/map`)

**Layout:** Full-height split — map fills viewport, filter bar pinned top, click-to-preview sidebar slides in from left

**Map:** Mapbox. Pin types:
- Gold pin: featured merchants
- Pink pin: trending merchants  
- Red pin: standard active merchants
- Numbered clusters for dense areas

**Sidebar preview (on pin click):** Merchant card (compact), voucher type indicator, distance, rating, "View merchant" CTA button, close button.

**Filter bar:** Same category pills and filter/sort row as /discover, pinned above the map.

### 5.4 Merchant Profile (`/merchants/[slug]`)

**Hero:** Full-width 3:1 photo (1200×400px). Overlaid: merchant name, category, verified badge, featured/trending badges. Save + Share + Directions action row.

**Below hero:**
- **Info block:** Phone, website, address with "Get directions" link. 7-day opening hours with today highlighted.
- **Amenities grid:** Positive amenities (green check) + unavailable (gray cross). Categories: parking, wheelchair, outdoor seating, child-friendly, WiFi, dogs welcome, takeaway, reservations.
- **Vouchers section:** Standard vouchers (labelled "Redeemo Standard Offer") shown first, then custom merchant vouchers. Each voucher card shows type badge, title, full terms, validity notes. Redeemed vouchers shown greyed with "Redeemed this cycle" state. Non-subscribers see CTA to subscribe.
- **Branches:** Branch selector if merchant has multiple locations.
- **Reviews:** Star rating summary + individual reviews. Each review shows: star rating, voucher used, date, review text, verified member badge. Sorted newest first.
- **App download CTA:** "Redeem this offer in the Redeemo app" — app store badges.

### 5.5 Subscribe (`/subscribe`)

**Flow:** Plan selection → Payment (Stripe) → Success

**Plan selector:** Three cards — Free (£0), Monthly (£6.99), Annual (£69.99). "Most popular" badge on Monthly. "2 months free" badge on Annual. Feature comparison list per plan.

**Promo code field:** Inline text field, validates on submit.

**Payment:** Stripe SetupIntent. Card element embedded. No card details stored server-side — Stripe handles everything.

**Success state:** Animated confirmation, membership details (plan, next renewal date), CTA to start discovering.

### 5.6 How It Works (`/how-it-works`)

**Structure:** Two-phase layout

**Phase 1 — Getting started:**
1. Download the app and create a free account
2. Choose a subscription plan
3. Browse merchants near you and save your favourites

**Phase 2 — Redeeming a voucher:**
4. Open the merchant page in the app
5. Enter the branch PIN shown in-venue to verify your presence
6. The app generates a unique code — show it to the member of staff to validate

Each step: numbered gradient circle + heading + description + step note (e.g. "The branch PIN is not a secret — it's displayed in-venue. Contact Redeemo support if you have a problem, not the merchant directly.")

**Free plan feature list:** 5 unlocked features (discover merchants, view all offers, merchant info, ratings, no card required) + 1 locked feature (redeem offers — requires paid plan).

**Common questions:** 5 inline accordion questions directly on the page (not linking to FAQ).

**App download CTA:** Bottom of page.

### 5.7 Pricing (`/pricing`)

**Three plan cards:** Free · Monthly · Annual

Each card: plan name, price, billing cadence, feature list with check/cross indicators, CTA button.

- Free: "Start for free" ghost button
- Monthly: gradient primary button "Get monthly", "Most popular" badge
- Annual: gradient primary button "Get annual", "2 months free" badge, "Priority customer support" differentiator

**Anchor copy:** "Less than one coffee a week." positioned above cards.

**Pricing FAQ accordion:** 5 questions covering: what happens on cancellation, free trial availability, family/sharing, switching plans, refunds.

**Dual CTA below FAQ:** Primary gradient + secondary ghost.

### 5.8 For Businesses (`/for-businesses`)

**Audience:** Marcus (independent local business owner, Groupon-scarred, margin-aware).

**Page structure:**

1. **Hero (navy background):** Bold headline addressing the Tastecard/Groupon comparison directly. "No commission. No performance fees. No margin cuts." Gradient CTA "Get listed free".

2. **Three commercial facts (white):** Full-width cards — (1) No double margin hit, (2) One redemption per cycle converts new customers, not subsidises regulars, (3) Digital verification and full reconciliation data.

3. **How it works for merchants (warm tint):** 4 numbered steps — Apply online · Submit your two standard vouchers · Get approved · Start receiving members.

4. **What you get (white):** Merchant portal features, merchant app features, redemption tracking, anonymised analytics.

5. **Comparison table (neutral gray):** Redeemo vs Tastecard on: commission, offer control, redemption limit, verification, reconciliation data, fraud protection, merchant quality control.

6. **Testimonials / social proof placeholder** (warm tint).

7. **Apply CTA (gradient section):** "Apply for free. Takes under 10 minutes."

### 5.9 Insider (`/insider`)

Editorial content hub. Member-submitted and staff-written posts.

**Listing page:**
- Category filter pills: All · Food & Drink · Health & Fitness · Beauty · Wellness · Local Guides · Members' Picks
- Featured post: horizontal card layout (image left, content right), full-width
- Post grid: 3 columns desktop, badge per card ("Staff pick" / "Member post")
- Submit a post banner at bottom

**Single post (`/insider/[slug]`):**
- Full article layout: hero image, headline, author + date + category, body text (paragraphs, pull quotes, embedded merchant cards where relevant)
- Comments section: visible to all, posting restricted to members (subscription gate)
- Related posts: 3 cards at bottom

### 5.10 FAQ (`/faq`)

**Sidebar navigation:** Fixed on desktop, collapsible on mobile. Sections: Getting started · Subscription & billing · Vouchers & redemption · Merchants · Account · Technical

**Hero:** Search bar. Search queries filter accordion in real time.

**Accordion sections:** Questions grouped by sidebar section. Each question expands inline.

**Support CTA:** Bottom of page — "Still have questions?" with email/chat link.

### 5.11 About (`/about`)

**Stat bar:** UK · £0 commission · Free to list · One price, one subscription

**Story:** 2–3 paragraphs on Redeemo's founding rationale (local-first, merchant-fair, consumer-honest). No em dashes.

**Four value cards:** For members · For merchants · For local communities · Our commitment.

**Press placeholder:** Media logos / coverage placeholder (to be populated).

**Contact and social:** Links to support, social channels.

### 5.12 Account — Overview (`/account`)

**Sidebar navigation (desktop):** Overview · Profile · Subscription · Savings · Favourites  
Delete account is **not** in the sidebar — it is accessible from the Profile page only.

**Overview cards:**
- Active subscription plan + renewal date
- Savings headline (total saved this cycle + lifetime)
- Redemption count this cycle
- Favourite merchants count
- Quick links to sub-sections

### 5.13 Account — Profile (`/account/profile`)

**Editable fields:** First name, last name, date of birth, gender, address, postcode, profile image URL, newsletter consent.

**Interests section:** Category tag toggles for personalised recommendations.

**Change password link:** Opens inline form (current password + new password + confirm).

**Danger zone (at bottom of page, visually separated):** Subtle card with a plain text "Delete my account" link. No button, no emphasis. Requires deliberate scroll to reach.

### 5.14 Account — Delete Account (`/account/delete`)

- Breadcrumb: "← Profile" (Profile stays active in sidebar)
- Explains consequences: all data deleted, subscription cancelled, cannot be undone
- Reason selection (required before proceeding)
- OTP verification sent to registered email/phone
- OTP entry field
- Final "Delete my account" button (destructive red, not gradient)

### 5.15 Account — Subscription (`/account/subscription`)

**Active state:** Plan name, price, renewal date, payment method (last 4 digits), "Change plan" link, "Cancel subscription" link.

**Cancel subscription flow (3-step inline, no separate page):**

- **Step 1 — Reason:** Required selection from 7 options: Too expensive · Not enough merchants near me · Not using it enough · Found a better alternative · Cancelling temporarily · Privacy concerns · Other (free text). Cannot proceed without selection.
- **Step 2 — Retention offer (conditional):** Shown only if user has saved (favourited) merchants with vouchers not yet redeemed this cycle, OR has already saved more than £6.99 this cycle. If neither condition met, skip directly to Step 3.
- **Step 3 — Confirm:** States exact access-end date (not "end of period" — the literal date). Two buttons: "Keep my membership" (primary) and "Confirm cancellation" (ghost/muted).

**Cancelled state:** Shows access-end date, "Reactivate" CTA.

### 5.16 Account — Savings (`/account/savings`)

**ROI headline card:** "You've saved £X this cycle" with 5.1× return calculation (paid £Y · saved £Z).

**Cycle comparison grid:** This cycle vs last cycle, with progress bars and delta indicators.

**6-month bar chart:** Monthly savings by month.

**Savings by category donut chart:** With legend (Restaurants · Cafés · Wellness · Gyms · Other). Each segment uses the voucher/category accent colour system.

**Top merchants by savings:** Ranked list — merchant name, visit count, proportional bar, £ amount saved.

**Voucher type breakdown:** 4 cards — BOGO / 50% Off / Freebie / Spend & Save — with count and total saved per type.

**Redemption history table:** Paginated. Columns: Merchant, Voucher, Date, Amount saved, Validated. Filter by month.

### 5.17 Account — Favourites (`/account/favourites`)

Two tabs: Merchants | Vouchers

**Merchants tab:** Grid of saved merchant cards (same card format as /discover). Remove from favourites via heart toggle.

**Vouchers tab:** List of saved vouchers with merchant name, voucher type, quick "View merchant" link.

Empty states: illustrated icon + friendly message + link to /discover.

### 5.18 Auth Pages

**Register (`/register`):** Email, password, confirm password, name. Agreement to terms on submit. Post-registration: OTP sent to email for verification.

**Login (`/login`):** Email + password. "Forgot password?" link. On success: redirect to `?next=` param or account overview.

**OTP verification (`/verify`):** 6-digit OTP input. Resend link (rate-limited). Used for login second-factor and delete account confirmation.

**Forgot password (`/forgot-password`):** Email field. Submit sends reset link.

**Reset password (`/reset-password`):** Token from email. New password + confirm. On success: redirect to login.

All auth pages: centered card layout, white background, gradient submit button, navy text.

---

## 6. Key UX Decisions

| Decision | Detail |
|---|---|
| Redemption is mobile-only | Website shows "Redeem in the app" CTA on voucher detail. No redemption UI on web by product design. |
| Delete account hidden | Not in sidebar. Plain text link inside a Danger zone card at the bottom of /account/profile. |
| Cancel flow is 3-step inline | No separate cancellation page. Reason collection → conditional retention offer → confirmation with exact access-end date. |
| Navy as primary text colour | Replaces near-black across all headings and body copy. Creates coherent brand identity between text and dark sections. |
| Gradient on CTAs only | Never on secondary buttons, never on error/destructive actions. Gradient = primary action only. |
| Card thumbnails are neutral gray | Not the same warm tint as section backgrounds. 3-level hierarchy: warm tint section → white card → neutral gray thumbnail. |
| Hero is warm-light, not navy | Hero background is a very soft warm gradient (`#FFF8F7` → `#FFFFFF`). Brand identity carried through gradient headline text and stats card. |
| Subscription CTA uses brand gradient | Not navy. Gradient section is warmer and more energetic for conversion moments. |
| Rose tint is `#FEF6F5` | Clearly distinct from white without borders. Used for alternating sections, voucher panels. |
| Warm border tint | `--border: #EDE8E8` — warm-tinted, not cold gray. Connects card system to brand without being loud. |
| Account pages are client components | `getAccessToken()` is localStorage-only. 401s redirect to `/login?next=<page>`. |
| OTP gate on delete account | Deleting an account requires OTP verification as a second factor before the action proceeds. |

---

## 7. Copy Rules

These apply to all customer-facing copy produced for the website:

- No em dashes (—). Use full stops, commas, or colons depending on grammatical context.
- No emojis in copy or UI.
- Never describe Redeemo members as deal-seekers or bargain-hunters.
- Lead with discovery and quality, follow with value.
- Savings as a side effect, not the headline.
- No AI-generic language (avoid: "seamlessly", "robust", "leverage", "revolutionise").
- For merchant-facing pages: state commercial facts plainly. Address the Groupon/Tastecard comparison before making benefit claims.

---

## 8. WCAG Compliance

All text/background combinations meet AA minimum (4.5:1). Key checks confirmed:

| Combination | Ratio | Result |
|---|---|---|
| White on brand gradient | ~5.4:1 | PASS AA |
| Navy on white | ~19.4:1 | PASS AAA |
| Navy on warm tint (#FEF6F5) | ~18.9:1 | PASS AAA |
| Gray 600 on white | 5.7:1 | PASS AA |
| White on navy | 19.4:1 | PASS AAA |

---

## 9. Breakpoints

| Name | Width |
|---|---|
| Mobile | 375px |
| Tablet | 768px |
| Desktop | 1024px |
| Wide | 1440px |

Mobile-first. Navigation collapses to hamburger at < 768px. Account sidebar collapses to tab bar on mobile. Merchant grid: 1 col mobile, 2 cols tablet, 3 cols desktop.
