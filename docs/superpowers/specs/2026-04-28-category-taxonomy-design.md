# Redeemo Category Taxonomy — Design Spec

**Date:** 2026-04-28
**Status:** Locked (pending final user review)
**Supersedes:** Partial taxonomy in `prisma/seed.ts` (top-level categories + 5 sample subcategories) and the v7 Home/Discovery brainstorm taxonomy.

---

## 0. Purpose, Scope, and Non-Goals

### 0.1 Purpose

This spec defines the locked source-of-truth category taxonomy for Redeemo: the top-level Categories shown to customers, the format-based Subcategories under each, the four-type Tag system, the Primary Descriptor model, and the supply-aware visibility rules that govern how the taxonomy surfaces in the customer app.

### 0.2 Scope

This spec is the source of truth for:

- Customer-app home tiles, subcategory chips, filter sheet, merchant tile content
- Customer-website navigation
- Merchant onboarding category, subcategory, and tag pickers
- Admin classification and moderation
- API contracts for category and search responses (the `meta` envelope)

### 0.3 Non-goals

This spec does NOT define:

- The migration plan for existing `Category` rows in `prisma/seed.ts` (handled by the implementation plan)
- Customer-app UI implementation (home tile component, filter sheet UX) — covered by existing home/discovery and search specs
- Merchant onboarding UI screens — separate spec to follow
- Admin moderation flow — separate spec to follow
- Search ranking algorithm — separate spec
- Featured / Trending merchant logic — already specified elsewhere

These are implementation work that consumes this spec.

### 0.4 Audience filter

The taxonomy is optimised for the locked primary persona, "Maya" (UK urban/suburban professional 30–38, quality-first, identifies as smart spender not bargain-hunter), with the secondary suburban-parent persona accommodated where it doesn't compromise the primary. UK-only launch market.

---

## 1. Top-level Categories

11 top-level Categories. Closed list at launch. Adding a new top-level requires explicit owner sign-off and a documented rationale; it never happens as a side effect of merchant onboarding.

### 1.1 Home tiles (6, in display order)

| # | Name | Why it earns a tile |
|---|---|---|
| 1 | **Food & Drink** | Highest engagement; multiple touches per week. Universal across UK rewards platforms. |
| 2 | **Beauty & Wellness** | Maya's cohort has the highest UK salon-visit frequency. "Wellness" register matches the curated brand voice. |
| 3 | **Health & Fitness** | 2–4x weekly for the gym/studio segment. Separate from Beauty by cadence and intent. |
| 4 | **Out & About** | Weekend and evening engagement engine. Merges what would otherwise split into "Things To Do" and "Days Out"; UK-native idiom. |
| 5 | **Shopping** | Local boutique / lifestyle / gifting. High browse frequency even when purchase is occasional. |
| 6 | **Home & Local Services** | Expanded scope including everyday local services (tailoring, dry cleaning, key cutting, phone repair, etc.) makes this a monthly-touch category, not the annual cleaner-only category it might otherwise be. |

### 1.2 Under "More" (5, in display order)

| # | Name | Rationale |
|---|---|---|
| 7 | **Travel & Hotels** | High £-value, low cadence (3–6x/year). Wrong fit for a daily tile. |
| 8 | **Health & Medical** | Quarterly intent. Aesthetics clinics straddle this and Beauty & Wellness — see §3.7. |
| 9 | **Family & Kids** | Higher cadence for the secondary parent persona than the primary; correct in More while Maya is locked as primary. |
| 10 | **Auto & Garage** | Annual MOT / service. Low cadence; here for completeness, not for daily engagement. |
| 11 | **Pet Services** | Niche; tag-like footprint but justifies a top-level for findability. |

### 1.3 Naming choices (decisions, not preferences)

| Chosen | Considered | Why |
|---|---|---|
| Food & Drink | Eating Out / Restaurants | Most recognisable UK umbrella; covers cafes, takeaway, coffee, bars in one rail without exclusion. |
| Beauty & Wellness | Health & Beauty / Beauty & Personal Care | Editorial register; Health & Beauty reads Boots-aisle. |
| Health & Fitness | Fitness / Sport & Fitness | Most recognisable UK phrasing. Fitness alone reads narrow; Sport & Fitness pulls in irrelevant verticals. |
| Out & About | Things To Do / Days Out / Entertainment / Leisure | Warm UK idiom; covers tonight + Saturday equally; differentiates voice from Groupon/Wowcher. |
| Shopping | Retail | Nobody in the UK calls it Retail. |
| Home & Local Services | Home Services / Services / Professional Services | Scope explicitly covers home + everyday local services. Home Services alone implied cleaner/gardener only. |
| Travel & Hotels | Travel / Stays / Getaways | Unambiguous; Stays is Airbnb-coded; Getaways is Wowcher voice. |
| Health & Medical | Healthcare / Medical | Healthcare is American; Medical alone is clinical. |
| Family & Kids | Kids / Family | Signals it's for parents seeking kid-relevant offers, not a kids-only tab. |
| Auto & Garage | Cars / Automotive | Cars is too narrow; Automotive is industry-y. |
| Pet Services | Pets | Services suffix matches the actual scope. |

---

## 2. Subcategories (format-only)

89 subcategories total. Format-only: subcategory describes the *type of business*, never cuisine, specialty, or attribute. Closed list at launch; admin can add new subcategories via owner-approved curation, never via merchant self-onboarding.

Each merchant has exactly one *primary* subcategory plus optional secondaries (`MerchantSubcategory.isPrimary`). The primary subcategory feeds the Primary Descriptor (§3.6).

### 2.1 Food & Drink (8)

Restaurant · Cafe & Coffee · Bakery · Dessert Shop · Takeaway · Bar · Pub & Gastropub · Food Hall

*Consolidations:* Coffee Shop merged into Cafe & Coffee. All bar variants (cocktail, wine, sports, karaoke) collapse to Bar with specialty tags. Ice Cream Parlour absorbed into Dessert Shop. Juice & Smoothie absorbed into Cafe & Coffee.

### 2.2 Beauty & Wellness (9)

Hair Salon · Barber · Nail Salon · Beauty Salon · Day Spa · Massage Studio · Aesthetics Clinic · Tanning Salon · Wellness Studio

*Consolidations:* Lash & Brow Bar and Waxing & Threading Studio removed — these are services, not formats, and live under specialty tags. Beauty Salon is the catch-all for venues offering mixed services.

### 2.3 Health & Fitness (8)

Gym · Boutique Studio · Boxing & Martial Arts Studio · Climbing Gym · Dance Studio · Swimming Pool · Sports Club · Personal Trainer

*Consolidations:* Yoga / Pilates / Barre / Spin / HIIT studios collapse to Boutique Studio with specialty tags. Martial Arts merged with Boxing.

### 2.4 Out & About (11)

Cinema · Live Venue · Bowling & Games · Mini-Golf · Escape Room · Immersive Experience · Class & Workshop · Theme & Adventure Park · Zoo & Wildlife Park · Museum, Gallery & Historic Site · Tour & Day Trip

*Consolidations:* Theatre + Comedy Club + Live Music Venue merged to Live Venue. Bowling Alley + Arcade merged to Bowling & Games. Karaoke moves to Bar with specialty tag. Museums + Galleries + Historic Sites + Gardens consolidated.

### 2.5 Shopping (9)

Fashion Boutique · Homeware & Lifestyle · Gift Shop · Jewellery Store · Florist · Bookshop · Independent Grocer & Deli · Vintage & Pre-Loved · Specialist Retailer

Specialist Retailer is the catch-all for music shops, art supplies, board games, comics, craft, model shops.

### 2.6 Home & Local Services (11)

Cleaner · Gardener · Decorator & Handyman · Locksmith · Removals · Tailor & Alterations · Laundry & Dry Cleaning · Shoe Repair & Key Cutting · Tech Repair · Bike Repair · Print, Copy & Photo

*Consolidations:* Decorator + Handyman merged. Phone & Laptop Repair → Tech Repair (covers phone, laptop, tablet, console). Cobbler + Key Cutting merged. Pest Control and Watch & Jewellery Repair dropped at launch as too niche; can be added later if demand surfaces.

### 2.7 Travel & Hotels (7)

Hotel · Boutique Hotel · Spa Hotel · B&B & Inn · Self-Catering · Holiday Park · Glamping & Camping

Below the 8–12 target by design — UK consumers genuinely browse Hotel / Boutique / Spa as distinct products and we don't pad with spurious formats.

### 2.8 Health & Medical (7)

Dental Clinic · Optician · Private GP · Physio & Chiropractic Clinic · Aesthetics Clinic · Hearing Centre · IV & Wellness Clinic

Aesthetics Clinic intentionally appears in both Beauty & Wellness and Health & Medical. Same merchant, two findability surfaces; `MerchantCategory.isPrimary` controls the default tab.

### 2.9 Family & Kids (7)

Soft Play · Kids' Class & Activity · Party Venue · Children's Hairdresser · Tutoring · Toy & Kids' Boutique · Family Photo Studio

Family-friendly attributes on Food & Drink and Out & About merchants are tags, not separate formats here.

### 2.10 Auto & Garage (6)

Garage & MOT · Tyre Centre · Body Shop · Mobile Mechanic · Car Wash & Detailing · EV Charging

*Consolidations:* MOT + Service + general repairs into Garage & MOT. Car Wash + Valet + Detailing merged. Below the target by design — Maya's engagement here is annual.

### 2.11 Pet Services (6)

Pet Groomer · Dog Walker · Pet Boarding & Daycare · Vet · Pet Training · Pet Boutique

### 2.12 Naming conventions (applied uniformly)

- Singular form: *Hair Salon*, not *Hair Salons*
- Ampersand `&` for compound formats: *Cafe & Coffee*
- Title case both sides of `&`
- Consumer-recognisable language; no industry jargon ("Competitive Socialising"); no trade names

---

## 3. Tag Taxonomy & Primary Descriptor

### 3.1 The four tag types

| Type | Purpose | Surfaces | Descriptor-eligible? | Cap per merchant |
|---|---|---|---|---|
| **Cuisine** | Culinary tradition / identity | Tile (via descriptor), filters, search | All eligible | Multiple allowed |
| **Specialty** | What the venue is known for | Tile (via descriptor), filters, search | Curated per-tag, universal across categories | Multiple allowed |
| **Highlights** | High-signal facts that change "where shall we go?" | Tile (max 2–3 visible) + filters + detail page | Never | Hard cap: 3 per merchant |
| **Details** | Operational facts that confirm "this fits tonight" | Detail page only + filters | Never | No cap |

The hard 3-cap on Highlights is the discipline that prevents tile clutter.

**Note on "primary" for Cuisine and Specialty.** "Multiple allowed" does NOT imply a primary flag on the merchant-tag join. The notion of "primary" is resolved at the application level via `Merchant.primaryDescriptorTagId` (see §3.6) — a single nullable FK to one Tag. The merchant-tag join (`MerchantTag`) carries no `isPrimary` field. A merchant with multiple cuisines or specialties has one selected as the primary descriptor; all others are filter and search inputs only. This keeps a single source of truth for "primary" and avoids dual-state ambiguity between `MerchantTag.isPrimary` and `Merchant.primaryDescriptorTagId`.

### 3.2 Cuisine tags (Food & Drink only — 32 tags, all descriptor-eligible)

**British & European:** British · Modern British · Modern European · Italian · French · Spanish · Portuguese · Greek · Turkish · Lebanese · Mediterranean

**South Asian:** Indian · Pakistani · Nepalese · Bangladeshi · Sri Lankan · Persian

**East & South-East Asian:** Chinese · Cantonese · Sichuan · Japanese · Korean · Thai · Vietnamese · Malaysian · Pan-Asian

**Americas & Africa:** Mexican · American · Caribbean · Brazilian · African · Ethiopian

**Other:** Middle Eastern · Fusion

### 3.3 Specialty tags (~165 across all categories)

Descriptor-eligible marked with `*`.

**Food & Drink** (layered onto cuisine): Pizza\* · Burgers\* · Sushi\* · Ramen\* · Dim Sum\* · Tapas\* · Steakhouse\* · Seafood\* · BBQ\* · Brunch\* · Sunday Roast · Afternoon Tea\* · Specialty Coffee\* · Matcha\* · Bubble Tea\* · Cocktails\* · Craft Beer\* · Wine Bar\* · Natural Wine · Sports Bar\* · Karaoke\* · Patisserie\* · Gelato\* · Vegan\* · Plant-Based · Vegetarian

**Beauty & Wellness** (mostly services, mostly not descriptor-eligible): Manicure · Pedicure · Gel Nails · Acrylics · BIAB · Lash Extensions · Lash Lift · Brow Lamination · HD Brows · Threading · Waxing · Hair Colour · Balayage · Highlights · Keratin · Blow Dry · Curly Hair Specialist · Men's Grooming · Hot Towel Shave · Facial · Deep Tissue · Sports Massage · Hot Stone · Lymphatic · Reflexology · Botox · Dermal Fillers · Lip Filler · Skin Booster · Microneedling · Sauna · Steam Room · Float Tank · IV Drip · Hammam\* · Korean Spa\*

**Health & Fitness** (specialty IS the studio's identity): Yoga\* · Hot Yoga\* · Pilates\* · Reformer Pilates\* · Barre\* · HIIT\* · Spin\* · Cycling\* · Strength · CrossFit\* · F45\* · Functional · Bootcamp\* · Boxing\* · Kickboxing\* · Muay Thai\* · MMA\* · BJJ\* · Karate\* · Judo\* · Taekwondo\* · Bouldering\* · Indoor Climbing\* · Swimming · Personal Training · Ballet\* · Hip-Hop\* · Latin\*

**Out & About**: IMAX · Boutique Cinema\* · Stand-Up Comedy · Live Music · Gig · Theatre · Musical · Cookery Class\* · Pottery Class\* · Life Drawing\* · Wine Tasting\* · Cocktail Class\* · Candle-Making\* · Floristry Class\* · Walking Tour\* · Boat Trip\* · Ghost Tour\* · Food Tour\* · Helicopter Tour\* · Hot Air Balloon\* · Theme Park\* · Water Park\* · Adventure Park\* · Wildlife Safari\* · Aquarium\* · VR Experience\* · Themed Experience\*

**Shopping**: Womenswear\* · Menswear\* · Kidswear\* · Streetwear\* · Designer · Vintage · Sustainable · Independent · Homeware · Books · Records\* · Board Games\* · Comics\* · Art Supplies\* · Crafts\* · Models & Hobbies\* · Music Instruments\*

**Home & Local Services**: End of Tenancy · Deep Clean · Carpet Cleaning · Office Cleaning · Phone Repair · Laptop Repair · Tablet Repair · Console Repair · Wedding Alterations · Bridal · Suit Tailoring (no descriptor-eligible — format names already do the work)

**Travel & Hotels**: Boutique\* · Spa\* · Resort\* · Country House\* · Adults-Only\* · Romantic\*

**Health & Medical**: Cosmetic Dentistry\* · Invisalign · Orthodontics · Eye Test · Contact Lenses · Designer Frames\* · Sports Physio\* · Pre/Post-Natal\*

**Family & Kids**: Toddler · All-Ages · Adventure (under Soft Play) · Gymnastics\* · Swimming Lessons\* · Football\* · Drama\* · Music Lessons\* · Art\* · Coding\* · Birthday Party · Themed Party · Laser Tag\*

**Auto & Garage**: Mercedes Specialist\* · BMW Specialist\* · Classic Car\* · Performance\* · EV Specialist\*

**Pet Services**: Cat Grooming · Mobile Grooming\* · Hand-Stripping · Puppy Training\* · Behavioural\*

### 3.4 Highlights (18 tags, hard-capped at 3 visible per merchant, tile-visible)

Closed list at launch. Each tag is a fact whose presence on a small tile materially changes Maya's "should I go here?" decision.

| Group | Tags |
|---|---|
| Dietary identity | Halal · Kosher · Vegan-Friendly · Vegetarian-Friendly |
| Space identity | Outdoor Seating · Beer Garden · Rooftop · Waterside |
| Audience identity | Family-Friendly · Pet-Friendly · Wheelchair Accessible |
| Vibe / occasion | Date Night · Open Late |
| Values | Independent · Women-Owned · Black-Owned · LGBTQ+ Friendly · Eco-Conscious |

### 3.5 Details (~35 tags, detail-page and filter only — never on tiles)

| Group | Tags |
|---|---|
| Dietary granularity | Gluten-Free Options · Dairy-Free Options · Nut-Free Options |
| Space granularity | Private Dining · Quiet · Live Sport · Baby-Changing · High Chairs · Group-Friendly |
| Access granularity | Step-Free Access · Accessible Toilet · Hearing Loop |
| Amenities | Free Wi-Fi · Parking · EV Charging · Air Conditioning |
| Booking & service | Bookable Online · Walk-Ins Welcome · Reservation-Only · Same-Day Booking · Takeaway Available · Delivery Available · Click & Collect |
| Hours | Open Sundays · Open Bank Holidays · Open 24h |
| Payment | Card-Only · Cash Accepted · Apple Pay · Contactless |

### 3.6 Primary Descriptor — model

**Storage:** `Merchant.primaryDescriptorTagId` (nullable FK to Tag) is the single source of truth for which tag a merchant treats as primary. Never stored as a fixed string. Never duplicated as a flag on join tables — `MerchantTag` carries no `isPrimary` field. The "primary" concept for Cuisine and Specialty is resolved at the application level by reading this FK; the other tags a merchant carries are filter and search inputs only. Label is constructed dynamically at render time.

**Construction pattern:** `{tag.label} {subcategory.descriptorSuffix}`

**De-duplication rule:** if `subcategory.descriptorSuffix` (lowercased) contains `tag.label` (lowercased), or vice versa, render the longer of the two alone. Prevents "Boutique Boutique Hotel", "Cookery Class Class & Workshop".

**Subcategory state** (`recommended` / `optional` / `hidden`):
- Onboarding behaviour only — does the picker prompt, offer, or skip the descriptor question?
- Does NOT control display.

**Display rule** (single, deterministic, no clarity heuristics in the UI):

```
if (merchant.primaryDescriptorTagId) {
  render constructed label  // descriptor present
} else {
  render subcategory.name   // descriptor absent
}
```

The clarity filter lives at the data layer: a Hidden subcategory simply never produces a non-null `primaryDescriptorTagId`, so display naturally collapses.

**Eligibility:** universal across categories — based on whether a tag defines venue identity, not on which top-level it belongs to. Marked per-tag with `descriptorEligible: bool` (the asterisks in §3.3).

### 3.7 Worked descriptor examples

| Merchant | Subcategory | Descriptor tag | Rendered descriptor | Highlights (max 3) |
|---|---|---|---|---|
| Franco Manca | Restaurant | Italian | "Italian Restaurant" | Vegan-Friendly · Outdoor Seating · Independent |
| Pizza Pilgrims | Restaurant | Pizza | "Pizza Restaurant" | Vegan-Friendly · Open Late · Independent |
| Bubbleology | Cafe & Coffee | Bubble Tea | "Bubble Tea Cafe" | (none meaningful) |
| Knoops | Cafe & Coffee | (none) | "Cafe & Coffee" | Independent · Outdoor Seating |
| 1Rebel Spin | Boutique Studio | Spin | "Spin Studio" | Open Late · Independent |
| Reformer LDN | Boutique Studio | Reformer Pilates | "Reformer Pilates Studio" | Independent · Women-Owned |
| Dishoom | Restaurant | Indian | "Indian Restaurant" | Halal · Vegetarian-Friendly · Date Night |
| Roxy Ball Room | Bowling & Games | (none) | "Bowling & Games" | Open Late |
| Generic local barber | Barber | (none — Hidden state) | "Barber" | Independent |
| Champneys | Hotel | Spa | "Spa Hotel" | Pet-Friendly · Eco-Conscious |
| Cookery School London | Class & Workshop | Cookery Class | "Cookery Class" *(suffix dropped — de-dup)* | Independent |
| Suburban vet | Vet | (none — Hidden state) | "Vet" | Independent · Wheelchair Accessible · Open Late |

### 3.8 Tag-to-subcategory join (which tags are pickable where)

`SubcategoryTag(subcategoryId, tagId, isPrimaryEligible: bool)` controls onboarding pick lists.

- **Cuisine** tags joined only to Food & Drink subcategories. `isPrimaryEligible = true` for Restaurant, Pub & Gastropub, Takeaway. `false` for Cafe & Coffee, Bakery, Dessert Shop, Bar, Food Hall — these subcategories use Food & Drink specialties for descriptors instead.
- **Specialty** tags joined to subcategories within their parent category (a yoga tag attaches to Boutique Studio, not to Restaurant).
- **Highlights and Details** are joinable to every subcategory; the onboarding flow filters by relevance per context.

### 3.9 Highlights redundancy filter

A highlight must add information beyond what the category, subcategory, or descriptor already implies. Stored as a curated rule table:

```
RedundantHighlight(subcategoryId, highlightTagId, reason: string?)
```

Onboarding picker filters out redundant highlights for the merchant's chosen subcategory. Tile-render layer also hides them as a second line of defence (in case admin imports or taxonomy changes leave a stale assignment in place).

Initial rule set (locked at launch):

| Subcategory(s) | Hidden highlight(s) | Reason |
|---|---|---|
| Vet · Pet Boutique · Pet Groomer · Pet Boarding & Daycare · Dog Walker · Pet Training | Pet-Friendly · Dog-Friendly | Implicit |
| Soft Play · Kids' Class & Activity · Party Venue · Children's Hairdresser · Family Photo Studio · Toy & Kids' Boutique · Tutoring | Family-Friendly · Kid-Friendly | Implicit |
| Aesthetics Clinic · Day Spa | Wheelchair Accessible | Detail-level facet for these formats; promote to Detail tag |
| Bar · Pub & Gastropub · Cocktail Bar | Open Late | Bars are expected to be open late as the baseline. Show only when the merchant closes meaningfully later than typical for that merchant type — admin verifies during moderation. No hardcoded threshold; the principle is "meaningfully later than normal". |

The list grows by exception, not by default. Adding a redundancy rule requires owner sign-off.

### 3.10 Tag governance

- All four tag types curated at launch. Cuisine (32) and Highlights (18) are most disciplined and closed.
- Specialties (~165) and Details (~35) can be expanded post-launch through a moderated admin process. Proposed tag → "pending" state → owner review → approved tags available.
- Soft-deprecation only. Retired tags marked inactive, hidden from new selection, preserved on historical merchants.
- Merchants never create tags. Onboarding only shows curated, in-scope options.
- No free-text tags anywhere. Critical for brand voice and search hygiene — descriptors like "London's Best Italian!" are blocked at the data layer, not by content moderation.

---

## 4. Supply-aware visibility & Fallback ladder

The taxonomy in §1–§3 is the complete inventory at the data layer. This section governs *what the customer app shows from that inventory at any moment.* Three layers, three different rules, plus a single fallback ladder for empty results.

### 4.1 Visibility tiers

| Layer | Visibility rule | Reason |
|---|---|---|
| **Top-level Categories (the 6 home tiles + 5 in More)** | Always visible. Fixed navigation. | Brand identity and product structure. The tiles are part of how Maya understands what Redeemo is — hiding them at launch makes the app feel half-built. Empty taps land on a fallback state, never on nothing. |
| **Subcategories** | Supply-aware. Render only those with at least one merchant in current geographic scope. Order by merchant count desc, then by `sortOrder`. | A "Climbing Gym" filter chip with zero results behind it erodes trust. |
| **Tags & filters (Cuisine, Specialty, Highlights, Details)** | Result-aware. A tag/filter only appears in the filter sheet if at least one merchant in the *current result set* carries that tag. | Filters are for narrowing real results, not browsing the schema. |

### 4.2 Two behavioural modes (the principle)

The fallback ladder moves through four scope tiers:

| Tier | Definition |
|---|---|
| 1. Nearby | Around user's current location (default 2 mi, user-adjustable) |
| 2. City | User's resolved city (from GPS or profile postcode) |
| 3. Wider region | Surrounding metro / county (~25 mi) |
| 4. Platform-wide | Anywhere in the UK |

How the app moves through it depends on whether the surface is user-initiated or passive content:

| Mode | Surfaces | Behaviour |
|---|---|---|
| **User-initiated** | Category tap, subcategory page, search results | Never silently widens scope. Always starts at Nearby. Shows whatever exists at Nearby, even 1–2 results. If zero, renders an empty state with explicit user CTAs to expand. |
| **Passive content** | Home feed rails (Featured, Trending, Nearby) | Can fall back to wider scope automatically, but the rail's section header always shows the scope honestly. Scope change is communicated, not hidden. |

### 4.3 User-initiated mode — full rule

- Resolve query at Tier 1 with the user's set radius.
- Render all results at Tier 1, regardless of count. 1 result is fine. 2 is fine.
- No automatic promotion based on result count. Sparse results stay sparse.
- If Tier 1 returns 0 results, render the empty state with three CTAs in this order:
  1. *Expand search area* → manual promotion to Tier 2
  2. *See across the UK* → manual jump to Tier 4 (skips intermediate tiers when the user has zero locally)
  3. *Browse other categories* → returns to home tiles
- Below sparse Tier 1 results (1–5 results), a soft-prompt row may appear: *"Looking for more? See {category} across {city}"* as a tappable link. Does not auto-fire.
- After manual expansion, the header shows the new scope and a *"Back to nearby"* link to undo.

### 4.4 Passive content mode — home feed rails

Each rail (Featured, Trending, Nearby, "Best brunch this week", and similar editorial rails) may widen its scope to fill itself, with the rule:

- The rail's section header is always scope-labelled.
- Scope is shown alongside the title, not in a tooltip.

| Local supply | Rail header reads |
|---|---|
| Tier 1 satisfied | "Featured near you" / "Trending near you" / "Nearby" |
| Fell back to Tier 2 | "Featured across {city}" / "Trending across {city}" |
| Fell back to Tier 3 | "Featured across {region}" |
| Fell back to Tier 4 | "Featured across the UK" |

If even Tier 4 has nothing for that rail's logic (e.g. zero platform-wide trending merchants in week 1 of launch), the rail is suppressed — the row is not rendered. The home page never shows blank rails.

### 4.5 Subcategory chip density rule

Subcategory chips on a category landing page render only when at least 3 subcategories with merchants exist in the current scope.

| Scope yields | UI |
|---|---|
| 3+ subcategories with merchants | Show chip row (All / Subcat A / Subcat B / Subcat C / …), ordered by merchant count desc |
| 1–2 subcategories with merchants | Hide the chip row. Show the merchant list directly. |
| 0 subcategories with merchants | Empty state per §4.3 |

Per-category override available via `Category.minSubcategoryCountForChips` (default 3) for future tuning.

### 4.6 Edge cases

- **Location permission denied.** Skip Tier 1. Start at Tier 2 using the user's profile postcode (already in the data model). Header reads *"Across {city}"*. Not a silent promotion — Tier 1 was never accessible because the user denied location.
- **No location and no profile postcode.** Start at Tier 4 with a non-blocking nudge to share location for relevance.
- **Genuine empty platform-wide** (Tier 4 = 0). Edge case at very early launch in a new vertical. Render: *"We're adding {category} every week. Want to suggest somewhere?"* + suggest-merchant CTA. No CTAs to widen further.
- **Subcategory page** (e.g. user taps "Pilates Studio" chip). Same user-initiated rule. Start at Nearby. Manual CTA to expand if zero.
- **Filtered search produces zero.** Filters are result-aware (§4.1), so the most common path to zero is a freshly typed search query that no merchant matches. Falls through to the existing search-empty state from the home/discovery spec.

### 4.7 API meta envelope

`/search` and `/category/{id}` responses return a `meta` block:

```jsonc
{
  "meta": {
    "scope": "nearby" | "city" | "region" | "platform",
    "resolvedArea": "Shoreditch" | "London" | "South East" | "United Kingdom",
    "scopeExpanded": false,   // true only if the user expanded from a tighter tier
    "chipsHidden": false      // true if §4.5 hid the subcategory chip row
  },
  "results": [ ... ]
}
```

The field is named `scopeExpanded` (not `promoted`) to make explicit that the change came from user intent — never from silent server-side widening on user-initiated views. Passive home-feed rails fetch each scope tier separately and label themselves, so they don't use this meta block.

### 4.8 Worked examples

**Maya in Shoreditch taps Health & Fitness.** Tier 1 has 25 merchants spanning 5 subcategories.

- Header: *"Near you in Shoreditch · Health & Fitness · 25 places"*
- Subcategory chips visible: Gym (12), Boutique Studio (8), Boxing & Martial Arts Studio (3), Climbing Gym (1), Personal Trainer (1)
- Filters in sheet: only tags carried by results
- Tiles render with descriptor + up to 3 highlights

**Maya in Shoreditch taps Pet Services.** Tier 1 has 0.

- Empty state with three CTAs (Expand search area / See across the UK / Browse other categories)
- No silent promote
- If she taps *Expand search area*: header becomes *"Across London · Pet Services · 14 places"* with a *"Back to nearby"* link
- Subcategory chips: Pet Groomer · Vet · Pet Boutique (3 subcategories meets the chip threshold)
- API meta: `{ scope: "city", scopeExpanded: true, ... }`

**Maya opens the home feed in Shoreditch.** Tier 1 has 80 merchants overall but only 4 are Featured locally.

- *Featured near you* rail: 4 cards
- *Trending near you*: 6 cards
- *Nearby*: 12 cards
- Below: a *"Featured across London"* rail also rendered to fill the feed honestly — different header so Maya knows the scope changed
- No silent promotions; every rail labels what scope it's drawn from

**A vet onboards under Vet subcategory** with 5 highlight intents.

- Onboarding picker hides Pet-Friendly and Dog-Friendly (per §3.9 — implicit for Vet)
- Merchant picks: Independent · Wheelchair Accessible · Open Late
- Tile reads: *Vet* / *Independent · Wheelchair Accessible · Open Late*

**Suburban parent (secondary persona) opens Soft Play in Reading, finds 1 result.**

- Header: *"Near you in Reading · Soft Play · 1 place"*
- Subcategory chips hidden (only 1 subcategory in scope, below threshold)
- Soft-prompt below the single result: *"Looking for more? See Family & Kids across Reading"*
- The tile hides Family-Friendly and Kid-Friendly highlights (redundant per §3.9), shows other highlights instead

### 4.9 Launch-phase behaviour (early-stage supply)

The taxonomy in §1–§3 is complete from day one at the data layer. The customer app's UI must still feel populated, intentional, and trustworthy when local supply is thin. The rules below sit on top of §4.1–§4.8 and govern the early-stage period — loosely defined as: when local merchant counts are still sparse enough that strict "Nearby only" surfaces would commonly produce empty rails or 1–2 result lists.

#### Principles

- **Data layer = complete from day one.** All Categories, Subcategories, and Tags exist in the database, available to onboarding, admin tooling, and search.
- **UI layer = progressively revealed.** The customer app exposes only what the current supply can fill convincingly.
- **Trustworthy at any stage.** A user opening the app on launch day, in week 1, or in year 1 should never see a surface that feels broken, half-built, or empty — only surfaces of varying breadth.

#### Behaviour by surface

**Passive surfaces (home feed rails, editorial collections):**
- Default to widening scope earlier and more aggressively to keep rails populated.
- Preference order during early supply: Tier 1 → Tier 2 → Tier 4 (Tier 3 may be skipped if Tier 2 yields fewer than ~6 cards, going straight to platform-wide).
- Always label scope honestly per §4.4. *"Featured across the UK"* is correct and trustworthy; a silently widened "Featured near you" with London results is not.
- A rail that cannot be filled to a minimum threshold (~3 cards) even at Tier 4 is suppressed entirely. The home page never shows blank rails or rails with one item.

**User-initiated surfaces (category tap, subcategory page, search):**
- No change. §4.3 strict rules still apply: no silent widening, manual CTAs only.
- Sparse Tier 1 results (1–2 merchants) are still shown as-is; the soft-prompt to widen still appears below them.
- Empty Tier 1 → empty state with three CTAs as defined.

**Subcategory chips:**
- §4.5 chip density rule (≥3 with merchants) still applies. At early launch this means most categories will show no chips at all, and the merchant list renders directly.
- This is intentional. A chip row with one chip looks like incomplete UI; a list of merchants without chips looks complete.

**Tag filters:**
- §4.1 result-awareness still applies. Filters appear only when the result set actually carries them.
- Early-stage merchant lists will have leaner filter sheets. This is correct and trustworthy.

**Empty top-level Categories:**
- A home tile with zero merchants in scope still renders. Tap → §4.3 empty state. The home tile itself never disappears.

#### "Hidden depth" principle

Avoid exposing taxonomy depth that supply cannot justify. Specifically:

- Don't show subcategory chips when 1–2 subcategories have merchants (§4.5).
- Don't show filter chips for tags no current merchant carries (§4.1).
- Don't show an editorial rail that won't have ~3 cards even at platform scope.
- Don't surface deep Specialty or Detail filters when the result set is too small for them to narrow anything meaningfully.

The user should never see the breadth of the taxonomy until enough merchants exist to back it up.

#### Exit criteria — there is no "post-launch" mode

The launch-phase rules above are not a separate mode of the system — they are the same rules as §4.1–§4.8, applied to a smaller dataset. What changes over time is the *frequency* with which fallback paths trigger, not whether they exist:

- Tier 1 satisfies more rails over time → fewer "across {city}" labels
- More subcategories cross the chip threshold → chips appear on more category pages
- Filter sheets become richer → more tags surface
- Editorial rails fill at Tier 1 instead of falling back

There is no flag, no admin toggle, no "we are now post-launch" event. The system simply expresses richer surfaces as supply increases. Trust is preserved at every stage because nothing was ever hidden under false pretences — every label was honest about its scope, every empty state was honest about its state, every CTA was tappable and actionable.

---

## 5. Schema implications (consolidated)

The existing `Category` model already supports the parent/child tree, `pinColour`, `pinIcon`, and `MerchantCategory` join. Below are the additive changes needed to support this spec.

### 5.1 New / extended fields on existing models

```
Category.descriptorState        : enum('recommended','optional','hidden') -- subcategories only
Category.descriptorSuffix       : string?                                  -- override; defaults to category name
Category.minSubcategoryCountForChips : int default 3                       -- §4.5 override
Category.merchantCountByCity    : JSON                                     -- { cityId: count }, refreshed nightly

Merchant.primaryDescriptorTagId : string? FK Tag                           -- §3.6
```

### 5.2 New models

```
Tag {
  id                  : string @id
  label               : string
  type                : enum('cuisine','specialty','highlight','detail')
  descriptorEligible  : bool default false
  isActive            : bool default true
  createdBy           : enum('system','admin')
  createdAt           : DateTime
  merchantCountByCity : JSON  // same denormalisation as Category
}

SubcategoryTag {
  subcategoryId      : string FK Category
  tagId              : string FK Tag
  isPrimaryEligible  : bool default false   -- can this tag be a primary?
  @@unique([subcategoryId, tagId])
}

MerchantTag {
  merchantId : string FK Merchant
  tagId      : string FK Tag
  @@unique([merchantId, tagId])
}
-- Holds cuisine, specialty, detail tags. The "primary" tag concept is captured
-- by Merchant.primaryDescriptorTagId only; this join carries no primary flag.
-- Highlights are a separate table for the 3-cap.

MerchantHighlight {
  merchantId      : string FK Merchant
  highlightTagId  : string FK Tag
  sortOrder       : int default 0
  @@unique([merchantId, highlightTagId])
  -- DB CHECK: count(*) where merchantId = X must be ≤ 3
}

RedundantHighlight {
  subcategoryId  : string FK Category
  highlightTagId : string FK Tag
  reason         : string?
  @@unique([subcategoryId, highlightTagId])
}
```

### 5.3 API response envelope (additive, non-breaking)

```
GET /search                       → adds `meta` block per §4.7
GET /category/{id}/merchants      → adds `meta` block per §4.7
GET /category                     → returns full top-level list (no scope), unchanged
```

Cached merchant counts by city are invalidated on merchant create / suspend / category change — same hooks already wired for Featured/Trending counters.

---

## 6. Governance

### 6.1 Closed-list inventory

| Inventory | Closed at launch? | Expansion path |
|---|---|---|
| Top-level Categories | Yes | Owner sign-off only — never via merchant onboarding |
| Subcategories | Yes | Admin proposal → owner review → approval |
| Cuisine tags | Yes | Admin proposal → owner review → approval |
| Highlights | Yes | Owner sign-off only — discipline matters |
| Specialty tags | Yes (initial), expandable | Admin proposal → moderated review |
| Details | Yes (initial), expandable | Admin proposal → moderated review |
| Redundancy rules | Yes (initial), expandable | Owner sign-off only |

### 6.2 Soft deprecation only

No hard deletes on Categories, Subcategories, or Tags. Removed items are flagged inactive: hidden from new selection, preserved on historical merchants, retained for analytics integrity.

### 6.3 No merchant free-text tags

Critical for brand voice. Merchants pick from curated lists; descriptors and tags are never editable as free-text strings. Prevents "London's Best Italian Trattoria!" descriptors and downstream search hygiene problems.

### 6.4 Override mechanisms

Two override surfaces, both rare and audit-logged:

- `Category.descriptorState` per-merchant override (the "exotic-pet vet" case from §3 examples). Logged.
- `RedundantHighlight` exemption for a specific merchant (a 24h-bar that genuinely closes at 3am earning Open Late). Logged.

The system must work correctly by default for the overwhelming majority of merchants without admin touching these.

---

## 7. Open questions and explicitly deferred decisions

### 7.1 Deferred to implementation plan

- Migration mapping from current seed data (6 top-levels, 5 subcategories) to this spec's 11 + 89.
- Onboarding UI: how the descriptor prompt, highlight picker (with redundancy filter), and tag selection screens look and flow.
- Admin moderation UI: tag-proposal review queue, redundancy-rule editor.
- Backfill / fixture strategy for Doha test data.

### 7.2 Future taxonomy work (not in this spec)

- Promotion of secondary parent persona to primary (would shuffle Family & Kids to a home tile) — not on the roadmap; flagged for completeness.
- Adding new top-level Categories (Education, Subscriptions, Professional Services) — explicitly out of scope; if needed later, gated by owner sign-off and a documented rationale.
- Per-city tag relevance overrides (e.g. "Halal" boosted in some areas) — out of scope; current model is global with city-level supply counts.
- Multi-city or multi-region support — UK-only at launch.

### 7.3 Known monitoring needs (not blocking)

- A way to detect which subcategories or tags are NEVER used in a city after some time threshold, to inform whether to invest in those verticals or quietly retire the rule rows.
- A way to detect descriptor mismatches at scale (a Restaurant with descriptor "Pizza" but no pizza specialty tag) — onboarding constraints should make this rare; admin tooling not required at launch.

---

## 8. Acceptance summary

This spec is locked when:

1. ✅ 11 top-level Categories defined, named, ordered, and rationalised
2. ✅ 6 home tiles vs 5 More tiles ordered
3. ✅ 89 format-only subcategories defined across all 11 categories
4. ✅ Four tag types defined with purpose, surfaces, eligibility, caps
5. ✅ Cuisine (32), Highlights (18), and initial Specialty (~165) and Details (~35) lists provided
6. ✅ Primary Descriptor model defined with storage rule, construction pattern, de-duplication rule, and 3-state subcategory metadata
7. ✅ Highlights redundancy filter defined with initial rule set
8. ✅ Supply-aware visibility rules defined for Categories (always visible), Subcategories (supply-aware), Tags (result-aware)
9. ✅ Four-tier fallback ladder defined with user-initiated vs passive content modes
10. ✅ API meta envelope defined with `scope`, `resolvedArea`, `scopeExpanded`, `chipsHidden`
11. ✅ Schema additions consolidated and consistent with existing `Category` and `Merchant` models
12. ✅ Launch-phase behaviour (§4.9) defined — preserves UI trustworthiness across all stages of supply growth without a separate "post-launch" mode
13. ✅ Governance, deferred decisions, and out-of-scope items documented

The implementation plan that consumes this spec will cover migration, seed update, schema migration, onboarding UI changes, admin-tooling additions, and discovery API updates.
