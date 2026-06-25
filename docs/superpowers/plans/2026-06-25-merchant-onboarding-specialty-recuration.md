# Merchant Onboarding — Per-Subcategory "What You're Known For" Specialty Mapping (DRAFT for review)
> Status: DRAFT proposal for owner review. Planning only — NO seed/data/code change made yet.
> Fixes the bug where every sub-category under a top category showed the same specialty tags. The screen/API/schema are already sub-category-scoped; only the seed CONTENT needs re-curation (`prisma/seed-data/subcategoryTags.ts` `SPECIALTY_PARENT` is keyed by top category → re-key by sub-category).
> **How to review:** check each sub-category's proposed tags. Edit anything (add/remove/move). Items under "Gaps / proposed NEW tags" are *suggestions only* — they would add brand-new tags to the taxonomy and need your explicit OK before we add any.

---

## Food & Drink

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Restaurant** | Pizza, Burgers, Sushi, Ramen, Dim Sum, Tapas, Steakhouse, Seafood, BBQ, Brunch, Sunday Roast, Vegan, Plant-Based, Vegetarian |
| **Cafe & Coffee** | Specialty Coffee, Matcha, Bubble Tea, Brunch, Afternoon Tea, Vegan, Plant-Based, Vegetarian |
| **Bakery** | Patisserie, Vegan, Vegetarian |
| **Dessert Shop** | Patisserie, Gelato, Matcha, Bubble Tea, Vegan |
| **Takeaway** | Pizza, Burgers, Sushi, Ramen, Dim Sum, BBQ, Vegan, Vegetarian |
| **Bar** | Cocktails, Craft Beer, Wine Bar, Natural Wine, Sports Bar, Karaoke, Tapas |
| **Pub & Gastropub** | Sunday Roast, Craft Beer, Cocktails, Wine Bar, Sports Bar, Burgers, Steakhouse, Seafood, Brunch, Vegetarian, Vegan |
| **Food Hall** | Pizza, Burgers, Sushi, Ramen, Dim Sum, Tapas, BBQ, Seafood, Cocktails, Craft Beer, Specialty Coffee, Vegan, Plant-Based, Vegetarian |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- Bakery has a thin fit in the existing pool — only Patisserie plus dietary tags apply. PROPOSED new tags (owner approval required, do NOT auto-add): 'Sourdough', 'Artisan Bread', 'Cakes & Celebration Cakes', 'Pastries', 'Gluten-Free'.
- Cafe & Coffee could use a few more cafe-native tags. PROPOSED (proposals only): 'Breakfast', 'Toasties & Sandwiches', 'Gluten-Free'.
- Dessert Shop is moderately covered but UK dessert formats are under-represented. PROPOSED (proposals only): 'Waffles & Crepes', 'Cookies & Cookie Dough', 'Ice Cream', 'Doughnuts', 'Milkshakes'.
- Takeaway cuisine coverage is partial against common UK takeaway types. PROPOSED (proposals only): 'Fish & Chips', 'Indian / Curry', 'Chinese', 'Kebab', 'Fried Chicken', 'Thai'.
- Dietary representation is limited to Vegan / Plant-Based / Vegetarian. PROPOSED cross-cutting (proposals only): 'Halal', 'Gluten-Free' — both highly relevant UK known-fors across Restaurant, Takeaway, Bakery, and Cafe.

## Beauty & Wellness

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Hair Salon** | Hair Colour, Balayage, Highlights, Keratin, Blow Dry, Curly Hair Specialist |
| **Barber** | Men's Grooming, Hot Towel Shave |
| **Nail Salon** | Manicure, Pedicure, Gel Nails, Acrylics, BIAB |
| **Beauty Salon** | Lash Extensions, Lash Lift, Brow Lamination, HD Brows, Threading, Waxing, Facial, Manicure, Pedicure, Gel Nails |
| **Day Spa** | Facial, Deep Tissue, Hot Stone, Lymphatic, Reflexology, Sauna, Steam Room, Hammam, Korean Spa, Float Tank |
| **Massage Studio** | Deep Tissue, Sports Massage, Hot Stone, Lymphatic, Reflexology |
| **Aesthetics Clinic** | Botox, Dermal Fillers, Lip Filler, Skin Booster, Microneedling, Facial |
| **Tanning Salon** | _(none that fit the existing pool — see gaps)_ |
| **Wellness Studio** | IV Drip, Float Tank, Sauna, Steam Room, Reflexology, Lymphatic |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- Barber — only Men's Grooming + Hot Towel Shave fit. PROPOSALS (owner approval required, do NOT auto-add): 'Skin Fade', 'Beard Trim', 'Beard Sculpting', 'Kids' Cuts', 'Cut Throat Shave', 'Hair Tattoo / Designs'.
- Tanning Salon — ZERO relevant pool tags. PROPOSALS: 'Spray Tan', 'Sunbeds / UV Tanning', 'Stand-Up Booth', 'Lying Sunbeds', 'Gradual Tan', 'Patch Test'.
- Wellness Studio — thin coverage; recovery facilities fit but mind/body classes do not. PROPOSALS: 'Yoga', 'Pilates', 'Breathwork', 'Meditation / Sound Bath', 'Cryotherapy', 'Infrared Sauna', 'Compression / NormaTec'.
- Hair Salon — well covered, but a couple of staples missing. PROPOSALS (optional): 'Hair Extensions', 'Wedding / Bridal Hair', 'Olaplex / Bond Treatment', 'Afro / Textured Hair'.
- Aesthetics Clinic — injectables/skin covered, but some clinic mainstays missing. PROPOSALS (optional): 'Chemical Peel', 'Laser Hair Removal', 'Anti-Wrinkle Treatment', 'Profhilo', 'Thread Lift'.
- Day Spa / Wellness Studio overlap on thermal facilities is intentional and correct for the UK market — both legitimately advertise sauna/steam/float.

## Health & Fitness

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Gym** | Strength, Functional, HIIT, CrossFit, Spin, Cycling, Bootcamp, F45, Personal Training |
| **Boutique Studio** | Yoga, Hot Yoga, Pilates, Reformer Pilates, Barre, HIIT, Spin, Cycling, Bootcamp, F45, Functional |
| **Boxing & Martial Arts Studio** | Boxing, Kickboxing, Muay Thai, MMA, BJJ, Karate, Judo, Taekwondo, HIIT |
| **Climbing Gym** | Bouldering, Indoor Climbing |
| **Dance Studio** | Ballet, Hip-Hop, Latin, Barre |
| **Swimming Pool** | Swimming |
| **Sports Club** | Swimming, Functional, Personal Training |
| **Personal Trainer** | Personal Training, Strength, Functional, HIIT, Bootcamp, Boxing |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- Sports Club: weakly served by this pool. It is currently a fitness/class-modality pool with no tags for the racquet/team/court sports a UK sports club is actually known for. PROPOSED new tags (owner approval required, do NOT auto-add): 'Tennis', 'Squash', 'Padel', 'Badminton', 'Football', 'Rugby', 'Cricket', 'Netball', 'Bowls', 'Athletics'.
- Swimming Pool: only one tag ('Swimming') applies. PROPOSED new tags: 'Lane Swimming', 'Swimming Lessons', 'Aqua Aerobics / Aquafit', 'Diving', 'Water Polo'.
- Climbing Gym: covered by Bouldering + Indoor Climbing, but missing common UK climbing-centre offers. PROPOSED new tags: 'Lead Climbing / Top Rope', 'Auto Belay', 'Kids Climbing'.
- Dance Studio: missing several core UK dance genres. PROPOSED new tags: 'Contemporary', 'Jazz', 'Tap', 'Street / Commercial', 'Salsa', 'Ballroom', 'Pole Fitness', 'Zumba'.
- Personal Trainer: the pool covers training styles but not PT-specific specialisms. PROPOSED new tags: 'Weight Loss / Fat Loss', 'Bodybuilding / Physique', 'Pre/Postnatal', 'Mobility / Rehab', 'Online Coaching', 'Nutrition Coaching', 'Sports-Specific'.
- Gym: a general gym has no specific tag distinguishing it (e.g. 24/7, ladies-only, weights-focused). PROPOSED new tags: '24/7 Access', 'Free Weights / Powerlifting', 'Ladies Only', 'Group Classes', 'Sauna / Spa'.
- Cross-cutting note: pool has good coverage for boutique studios, combat sports and dance, but pure facility/service subcategories (Sports Club, Swimming Pool) and the PT business model are under-served.

## Out & About

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Cinema** | IMAX, Boutique Cinema |
| **Live Venue** | Stand-Up Comedy, Live Music, Gig, Theatre, Musical |
| **Bowling & Games** | VR Experience |
| **Mini-Golf** | _(none that fit the existing pool — see gaps)_ |
| **Escape Room** | VR Experience, Themed Experience |
| **Immersive Experience** | VR Experience, Themed Experience |
| **Class & Workshop** | Cookery Class, Pottery Class, Life Drawing, Wine Tasting, Cocktail Class, Candle-Making, Floristry Class |
| **Theme & Adventure Park** | Theme Park, Water Park, Adventure Park |
| **Zoo & Wildlife Park** | Wildlife Safari, Aquarium |
| **Museum, Gallery & Historic Site** | _(none that fit the existing pool — see gaps)_ |
| **Tour & Day Trip** | Walking Tour, Boat Trip, Ghost Tour, Food Tour, Helicopter Tour, Hot Air Balloon |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- Mini-Golf — ZERO relevant pool tags. PROPOSALS (owner approval required): 'Crazy Golf', 'Adventure Golf', 'Indoor Mini-Golf', 'Glow Golf'.
- Museum, Gallery & Historic Site — ZERO relevant pool tags. PROPOSALS: 'Art Gallery', 'Natural History', 'Science Museum', 'Historic House', 'Castle', 'Heritage Site', 'Interactive Exhibits'.
- Bowling & Games — only 'VR Experience' fits (thin). PROPOSALS: 'Ten-Pin Bowling', 'Arcade', 'Pool & Snooker', 'Darts', 'Karting', 'Laser Tag', 'Axe Throwing', 'Shuffleboard', 'Crazy Golf'.
- Escape Room — partially covered by 'Themed Experience'/'VR Experience' but lacks a dedicated tag. PROPOSAL: 'Escape Game' / 'Live Escape Room'.
- Zoo & Wildlife Park — covered only by 'Wildlife Safari' and 'Aquarium'; a generic option is missing. PROPOSALS: 'Petting Farm', 'Birds of Prey', 'Reptile House', 'Sea Life Centre', 'Animal Encounters'.
- Immersive Experience — covered by 'VR Experience'/'Themed Experience' but could use 'Digital Art Experience' / 'Light Show' as more specific PROPOSALS.
- Live Venue — well covered, but UK pool could add PROPOSALS 'Open Mic', 'Club Night / DJ', 'Spoken Word', 'Cabaret' for completeness.

## Shopping

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Fashion Boutique** | Womenswear, Menswear, Kidswear, Streetwear, Designer, Vintage, Sustainable, Independent |
| **Homeware & Lifestyle** | Homeware, Crafts, Sustainable, Independent |
| **Gift Shop** | Crafts, Books, Board Games, Independent, Sustainable |
| **Jewellery Store** | Designer, Vintage, Sustainable, Independent |
| **Florist** | Sustainable, Independent |
| **Bookshop** | Books, Comics, Vintage, Independent |
| **Independent Grocer & Deli** | Independent, Sustainable |
| **Vintage & Pre-Loved** | Vintage, Womenswear, Menswear, Designer, Sustainable, Independent, Records, Books |
| **Specialist Retailer** | Records, Board Games, Comics, Art Supplies, Crafts, Models & Hobbies, Music Instruments, Books, Independent |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- Florist — only Sustainable/Independent fit from the pool; no floristry-specific tag exists. PROPOSAL (owner approval required): 'Bouquets & Arrangements', 'Wedding & Events', 'Plants & Houseplants', 'Same-Day Delivery', 'Dried & Preserved'.
- Independent Grocer & Deli — only Independent/Sustainable fit; pool is fashion/hobby-skewed with no food vocabulary. PROPOSAL (owner approval required): 'Fresh Produce', 'Cheese & Charcuterie', 'World Foods', 'Bakery', 'Wine & Spirits', 'Local & Artisan Food', 'Organic'.
- Jewellery Store — no jewellery-specific tag; relies on generic Designer/Vintage/Sustainable/Independent. PROPOSAL (owner approval required): 'Fine Jewellery', 'Bridal & Engagement', 'Watches', 'Bespoke & Repairs', 'Costume & Fashion Jewellery'.
- Gift Shop — covered acceptably via Crafts/Books/Board Games but is thin; a dedicated tag would help. PROPOSAL (owner approval required): 'Greeting Cards & Stationery', 'Personalised Gifts', 'Candles & Fragrance'.
- Homeware & Lifestyle — reasonably covered by Homeware/Crafts but lacks granularity. PROPOSAL (owner approval required): 'Kitchen & Dining', 'Furniture', 'Soft Furnishings', 'Candles & Fragrance', 'Plants & Houseplants'.

## Home & Local Services

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Cleaner** | End of Tenancy, Deep Clean, Carpet Cleaning, Office Cleaning |
| **Gardener** | _(none that fit the existing pool — see gaps)_ |
| **Decorator & Handyman** | _(none that fit the existing pool — see gaps)_ |
| **Locksmith** | _(none that fit the existing pool — see gaps)_ |
| **Removals** | _(none that fit the existing pool — see gaps)_ |
| **Tailor & Alterations** | Wedding Alterations, Bridal, Suit Tailoring |
| **Laundry & Dry Cleaning** | _(none that fit the existing pool — see gaps)_ |
| **Shoe Repair & Key Cutting** | _(none that fit the existing pool — see gaps)_ |
| **Tech Repair** | Phone Repair, Laptop Repair, Tablet Repair, Console Repair |
| **Bike Repair** | _(none that fit the existing pool — see gaps)_ |
| **Print, Copy & Photo** | _(none that fit the existing pool — see gaps)_ |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- Gardener — ZERO relevant pool tags. PROPOSED new tags (owner approval required, not auto-added): 'Lawn Care', 'Hedge Trimming', 'Garden Clearance', 'Landscaping', 'Tree Surgery'.
- Decorator & Handyman — ZERO relevant pool tags. PROPOSED: 'Painting & Decorating', 'Wallpapering', 'Flat-Pack Assembly', 'Tiling', 'General Repairs'.
- Locksmith — ZERO relevant pool tags. PROPOSED: 'Emergency Lockout', 'Lock Changes', 'uPVC Door Locks', 'Security Upgrades', '24/7 Callout'.
- Removals — ZERO relevant pool tags. PROPOSED: 'House Removals', 'Man & Van', 'Packing Service', 'Storage', 'Office Removals'.
- Laundry & Dry Cleaning — ZERO relevant pool tags. PROPOSED: 'Dry Cleaning', 'Service Wash', 'Ironing Service', 'Wedding Dress Cleaning', 'Curtain & Duvet Cleaning'.
- Shoe Repair & Key Cutting — ZERO relevant pool tags. PROPOSED: 'Shoe Repair', 'Key Cutting', 'Heel Bar', 'Watch Battery & Repair', 'Engraving'.
- Bike Repair — ZERO relevant pool tags. PROPOSED: 'Bike Servicing', 'Puncture Repair', 'Wheel Truing', 'E-Bike Repair', 'Brake & Gear Tuning'.
- Print, Copy & Photo — ZERO relevant pool tags. PROPOSED: 'Photo Printing', 'Document Printing', 'Passport Photos', 'Large Format / Banners', 'Business Cards'.
- Note: 8 of 11 subcategories have no fit from the existing pool — the pool only covers Cleaner, Tailor & Alterations, and Tech Repair. The pure-service subcategories need their own specialty tag families before re-scoping delivers full value.

## Travel & Hotels

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Hotel** | Spa, Resort, Romantic, Country House |
| **Boutique Hotel** | Boutique, Romantic, Adults-Only, Spa |
| **Spa Hotel** | Spa, Romantic, Adults-Only, Resort, Country House |
| **B&B & Inn** | Romantic, Country House, Adults-Only, Boutique |
| **Self-Catering** | Country House, Romantic |
| **Holiday Park** | Resort |
| **Glamping & Camping** | Romantic, Adults-Only |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- Self-Catering: only weakly served by the current pool (Country House, Romantic). Genuinely needs accommodation-feature tags. PROPOSED new tags (NOT to auto-add, owner approval required): Pet-Friendly, Family-Friendly, Coastal/Seaside, Large Groups, Hot Tub, Cottage.
- Holiday Park: only Resort fits. PROPOSED new tags (proposals only): Family-Friendly, Dog-Friendly, Lodges/Caravans, On-Site Entertainment, Coastal/Seaside.
- Glamping & Camping: only Romantic and Adults-Only fit, and weakly. PROPOSED new tags (proposals only): Pet-Friendly, Family-Friendly, Eco/Sustainable, Hot Tub, Off-Grid, Coastal/Seaside.
- B&B & Inn: reasonably covered, but a PROPOSED Pet-Friendly tag (proposal only) would reflect common UK inn positioning.
- Cross-category note: the pool is hotel-centric (Boutique, Spa, Resort, Country House, Adults-Only, Romantic) and lacks self-catering/outdoor-stay descriptors. PROPOSED additions that would serve multiple subcategories: Pet-Friendly, Family-Friendly, Coastal/Seaside (all proposals only).

## Health & Medical

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Dental Clinic** | Cosmetic Dentistry, Invisalign, Orthodontics |
| **Optician** | Eye Test, Contact Lenses, Designer Frames |
| **Private GP** | _(none that fit the existing pool — see gaps)_ |
| **Physio & Chiropractic Clinic** | Sports Physio, Pre/Post-Natal |
| **Aesthetics Clinic** | _(none that fit the existing pool — see gaps)_ |
| **Hearing Centre** | _(none that fit the existing pool — see gaps)_ |
| **IV & Wellness Clinic** | _(none that fit the existing pool — see gaps)_ |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- Private GP: ZERO relevant existing tags. PROPOSALS (not to be auto-added): 'Same-Day Appointments', 'Health Screening', 'Blood Tests', 'Travel Vaccinations', 'GP Video Consultations'.
- Aesthetics Clinic: ZERO relevant existing tags — this is a significant content gap for a high-demand UK subcategory. PROPOSALS (not to be auto-added): 'Anti-Wrinkle Injections', 'Dermal Fillers', 'Skin Boosters', 'Laser Hair Removal', 'Lip Fillers', 'Chemical Peels', 'Microneedling'.
- Hearing Centre: ZERO relevant existing tags. PROPOSALS (not to be auto-added): 'Hearing Tests', 'Hearing Aids', 'Ear Wax Removal', 'Tinnitus Care'.
- IV & Wellness Clinic: ZERO relevant existing tags. PROPOSALS (not to be auto-added): 'IV Drips', 'Vitamin Injections', 'B12 Injections', 'Wellness Bloods', 'NAD+ Therapy'.
- Physio & Chiropractic Clinic: only 2 tags fit and Chiropractic itself is uncovered. PROPOSALS (not to be auto-added): 'Chiropractic Care', 'Sports Massage', 'Sports Injury Rehab', 'Back Pain Treatment', 'Acupuncture'.
- Dental Clinic and Optician are well-served by the existing pool; the remaining five subcategories (especially Private GP, Aesthetics Clinic, Hearing Centre, IV & Wellness Clinic) are service-led and currently have no genuinely relevant specialties in the pool.

## Family & Kids

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Soft Play** | Toddler, All-Ages, Adventure, Birthday Party |
| **Kids' Class & Activity** | Toddler, All-Ages, Gymnastics, Swimming Lessons, Football, Drama, Music Lessons, Art, Coding |
| **Party Venue** | All-Ages, Birthday Party, Themed Party, Laser Tag, Adventure |
| **Children's Hairdresser** | Toddler, All-Ages |
| **Tutoring** | All-Ages, Coding |
| **Toy & Kids' Boutique** | Toddler, All-Ages |
| **Family Photo Studio** | _(none that fit the existing pool — see gaps)_ |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- Family Photo Studio — ZERO relevant tags in the pool. PROPOSED new tags (owner approval required): 'Newborn', 'Maternity', 'Family Portraits', 'Cake Smash', 'School Photos'.
- Toy & Kids' Boutique — only generic age-band tags fit; no retail/product specialisms exist. PROPOSED new tags (owner approval required): 'Educational Toys', 'Wooden Toys', 'Kids' Clothing', 'Gifts', 'Nursery & Baby'.
- Tutoring — almost no academic subject coverage; only Coding/All-Ages fit. PROPOSED new tags (owner approval required): 'Maths', 'English', '11-Plus', 'GCSE', 'A-Level', 'SEN Support', 'Languages'.
- Children's Hairdresser — pure service with only age-band tags fitting. PROPOSED new tags (owner approval required): 'First Haircut', 'Special Needs Friendly'.
- Soft Play — fits age/adventure/party tags but lacks a soft-play-specific descriptor. PROPOSED new tags (owner approval required): 'Under 5s Area', 'Toddler Zone', 'Cafe On-Site'.

## Auto & Garage

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Garage & MOT** | Mercedes Specialist, BMW Specialist, Classic Car, Performance, EV Specialist |
| **Tyre Centre** | Performance, EV Specialist |
| **Body Shop** | Mercedes Specialist, BMW Specialist, Classic Car, Performance |
| **Mobile Mechanic** | Mercedes Specialist, BMW Specialist, EV Specialist |
| **Car Wash & Detailing** | Classic Car, Performance |
| **EV Charging** | EV Specialist |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- EV Charging: only 'EV Specialist' applies, and even that is a stretch for a pure charge-point operator rather than a servicing business. The whole pool is service/marque-oriented and barely fits an infrastructure subcategory. PROPOSAL (not to auto-add): 'Rapid/Ultra-Rapid Charging', 'On-Site/Destination Charging', 'Home Charger Installation' (OZEV-approved).
- Tyre Centre: thin fit (only 'Performance' + emerging 'EV Specialist'). PROPOSAL: 'Run-Flat Tyres', 'Wheel Alignment', '4x4/SUV Tyres', 'Puncture Repair', 'Budget Tyres'.
- Car Wash & Detailing: only 'Classic Car' + 'Performance' fit indirectly. PROPOSAL: 'Ceramic Coating', 'Paint Correction', 'Valeting', 'Hand Car Wash', 'Fleet/Commercial Cleaning'.
- Mobile Mechanic: workshop-bound specialisms (Classic Car, Performance) excluded. PROPOSAL: 'Diagnostics', 'Pre-Purchase Inspection', 'Roadside/Breakdown'.
- General pool gap: the pool is heavily German-marque + niche (Mercedes/BMW/Classic/Performance/EV) and lacks broad UK garage descriptors. PROPOSAL across Garage & MOT / Body Shop / Mobile Mechanic: 'Audi/VW Specialist', 'Japanese Marques', 'Diesel/DPF', 'Diagnostics', 'Hybrid Servicing', 'Air Conditioning'.

## Pet Services

| Sub-category | Proposed "known for" tags (existing) |
|---|---|
| **Pet Groomer** | Cat Grooming, Mobile Grooming, Hand-Stripping |
| **Dog Walker** | _(none that fit the existing pool — see gaps)_ |
| **Pet Boarding & Daycare** | _(none that fit the existing pool — see gaps)_ |
| **Vet** | _(none that fit the existing pool — see gaps)_ |
| **Pet Training** | Puppy Training, Behavioural |
| **Pet Boutique** | _(none that fit the existing pool — see gaps)_ |

**Gaps / proposed NEW tags (suggestions only — need your approval to add):**
- Dog Walker: ZERO relevant existing tags. PROPOSALS (owner approval required): 'Solo Walks', 'Group Walks', 'Puppy Visits', 'Pet Taxi', 'GPS-Tracked Walks', 'DBS-Checked & Insured'.
- Pet Boarding & Daycare: ZERO relevant existing tags. PROPOSALS (owner approval required): 'Home Boarding', 'Cattery', 'Doggy Daycare', 'Overnight Care', 'Licensed (Animal Welfare)', 'Small-Dog Friendly'.
- Vet: ZERO relevant existing tags. PROPOSALS (owner approval required): 'Small Animals', 'Exotics', 'Dentistry', 'Surgery', 'Vaccinations & Microchipping', 'Out-of-Hours / Emergency', 'RCVS Accredited'.
- Pet Boutique: ZERO relevant existing tags. PROPOSALS (owner approval required): 'Natural & Grain-Free Food', 'Raw Diet', 'Accessories & Apparel', 'Toys & Enrichment', 'Local / Artisan Products', 'Made in the UK'.
- Pet Groomer: well-covered by the existing pool (Cat Grooming, Mobile Grooming, Hand-Stripping). OPTIONAL PROPOSALS to broaden coverage: 'De-Shedding', 'Hypoallergenic / Sensitive Skin', 'Show Grooming', 'Nervous Dogs'.
- Pet Training: covered (Puppy Training, Behavioural). OPTIONAL PROPOSALS: 'Obedience', '1-2-1 Training', 'Gun Dog / Working', 'Reactive Dogs'.
- OVERALL: The current pool is heavily skewed toward Grooming + Training and leaves 4 of 6 subcategories (Dog Walker, Boarding & Daycare, Vet, Pet Boutique) with NO relevant tags. The pool needs expansion before those subcategories can show meaningful 'what you're known for' options.

---

## Implementation plan (after you approve the mapping)
1. Rewrite `prisma/seed-data/subcategoryTags.ts`: replace the top-category-keyed `SPECIALTY_PARENT` with a **sub-category-keyed** map matching the approved table above; update the fan-out in `prisma/seed-data/referencePhases.ts` `seedSubcategoryTags` so each specialty links only to its assigned sub-categories.
2. (Optional, only if you approve specific ones) add approved NEW tags to `prisma/seed-data/tags.ts` + map them.
3. Re-seed the staging taxonomy (sub-category-tag links) so onboarding reflects the new mapping; you re-check on the merchant portal.
4. No schema change, no app-code change. Same change carries to production when that env is built.

**Decisions for you:** (a) review/adjust the per-sub-category tags; (b) which (if any) proposed NEW tags to add now vs leave for later; (c) whether sub-categories with zero relevant tags should simply show no "known for" step (the screen already hides the section when empty).

---

## As shipped (Phase 1) — 2026-06-25

Implemented in PR #323 (`feat/onboarding-specialty-recuration`). Existing tags only; no new tags, no schema, no merchant-web app-code change.

- `prisma/seed-data/subcategoryTags.ts`: `SPECIALTY_PARENT` → `SPECIALTY_BY_SUBCATEGORY` (parent → subcategory → labels). **69 sub-categories mapped; 20 omitted** (the form hides the step when empty).
- `prisma/seed-data/referencePhases.ts`: specialty wiring iterates the new map; cuisine + highlight/detail wiring unchanged; `isPrimaryEligible` semantics preserved.
- `prisma/reseed-subcategory-tags.ts`: staging-safe targeted re-seed (rewires only `SubcategoryTag`).
- Tests: `tests/prisma/subcategory-specialty-mapping.test.ts` (CI unit) + integration assertions in `tests/prisma/taxonomy-seed.integration.test.ts`.
- Local re-seed dropped **1,248 spurious specialty links (6104 → 4856)**.
- Independent adversarial review: no blocker/major; map matches this doc exactly; 0 specialties dropped from the taxonomy overall.

### Production migration note (when this reaches a POPULATED environment)
Tag eligibility is validated **live** against current `SubcategoryTag` rows at identity-edit time (`TAG_NOT_ELIGIBLE`, `src/api/merchant/profile/service.ts`). A merchant who, under the old fan-out, had selected a specialty that this re-curation removes from their sub-category keeps the stored `MerchantTag`/`MerchantHighlight` row, but will hit `TAG_NOT_ELIGIBLE` on their **next** identity edit. Irrelevant on staging (no real merchants); on the radar for production — the re-seed script's "prod caveat" only covers the delete window, not stale merchant selections. A populated-env rollout should either (a) leave stale selections to clear naturally on next edit, or (b) run a one-off reconciliation of `MerchantTag`/`MerchantHighlight` against the new eligibility before launch.

### Three legitimately-identical sibling pairs (existing-labels-only ties)
Under the existing pool these pairs share the same set (Phase 2 new tags would differentiate them); allow-listed in the unit test so a NEW identical pair trips the guard:
Out & About: Escape Room == Immersive Experience · Shopping: Florist == Independent Grocer & Deli · Family & Kids: Children's Hairdresser == Toy & Kids' Boutique.
