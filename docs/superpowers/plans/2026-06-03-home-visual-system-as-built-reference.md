# Home Visual System — Complete As-Built Reference (1–3 June 2026)

**Purpose:** the single consolidated, rebuildable record of the entire Home-screen visual redesign done 1–3 June 2026, patch-by-patch, much of it without a per-change spec. If anything is lost, Home can be rebuilt from this doc + the source. This consolidates the 5 batch plans + the June-3 pass + the actual current code into one reference.

**Branch:** `feature/home-batch-1b-card-chip` — NOT pushed, NO PR.
**Status:** Batches 1B/2/3/5 are committed; **Batch 4's implementation + the entire June-3 motion/gradient/scroll pass are UNCOMMITTED (working-tree only)**, including all 46 category assets. Committing is the strongest protection (this repo has lost uncommitted work before).

> Canonical trackers for this workstream: (1) this reference, (2) deferred-index **§HC** (+ §HC.7 for the June-3 pass), (3) the per-batch plans (rationale/history). The `2026-06-01-home-visual-system-workflow-checklist.md` is a **tombstone** — non-canonical, do not use.

---

## 1. Programme map (batches → commits → docs)

| Batch | Scope (one line) | Commit | Plan doc |
|---|---|---|---|
| spec | "Composition B" Home visual system spec | `30a6f2b` | `docs/superpowers/specs/2026-06-01-home-visual-system-design.md` |
| **1B** | Scale the `<BranchTile>` card hierarchy (name/info typography, inline proximity, pills, 44pt heart) | `a2d00a8` | `2026-06-01-home-card-chip-hierarchy.md` |
| **2** | Section composition: page paint, `<SectionBand>`s, Mustica greeting, remove dead Filter, tappable avatar, live dot | `514bc24` | `2026-06-01-home-batch-2-section-composition.md` |
| **3** | Unify 5 ad-hoc cream chrome cards → one `<HomeChromeCard>` | `fd74c4e` | `2026-06-01-home-batch-3-chrome-cards.md` |
| **5** | Motion grammar: branded pull-to-refresh (`RedeemoLoader` + system control), skeleton→content, page-load fade/stagger | `93ec8c7` | `2026-06-01-home-batch-5-motion-skeleton-refresh.md` |
| **4** | Illustrated 2-col category grid + Explore capsule + All-Categories re-skin | **plan only `ce67529`; impl UNCOMMITTED** | `2026-06-01-home-batch-4-category-illustrations.md` (§17 As-shipped is current truth) |
| **June-3** | Per-icon rail motions + spinning gradient star, brand-gradient iconography, gradient chips, open-pulse, intro demo, **scroll-pause perf fix**, reduce-motion cancel fix | **UNCOMMITTED** | `2026-06-03-home-motion-gradient-scroll-pass.md` + **this doc** |

(Batches were built/numbered out of order; 4 landed last as code-on-top-of-HEAD.)

---

## 2. Foundations (design tokens — `src/design-system/tokens.ts`)

- **Brand:** `brandRose #E20C04`, `brandCoral #E84A00`, `brandGradient ['#E20C04','#E84A00']` (diagonal red→orange — the load-bearing gradient: Explore arrow CTA + every rail glyph fill). `navy #010C35` (= `text.primary`, secondary brand tone).
- **Text:** `text.secondary #4B5563`, `text.tertiary #9CA3AF`. Card savings amount uses a hardcoded **`#15803D`** (deeper than `savingsGreen #16A34A` / `success #0F7A3E`).
- **Surface:** `surface.body #FFF9F5` (Home page bg — warm near-white), banner placeholder `#FFF6EE`, warm card hairline `#EDE4D7` / `#EAE0D2`.
- **Spacing** (index-based): `[0,4,8,12,16,20,24,32,40,48,64]` → `spacing[3]=12, [4]=16, [5]=20, [7]=32`.
- **Radius:** `{xs:4, sm:8, md:12, lg:16, xl:22, pill:9999}`.
- **Fonts:** `MusticaPro-Semibold` (display + savings amount + rail titles ONLY), `Lato-{Bold,SemiBold,Medium,Regular}` (everything else).
- **Formatters** (`utils/formatters.ts`): `formatGbpCompact` (drops `.00` on whole £), `formatDistanceCompact` (always `"X.X mi"`).
- **Data — `BranchTile`** (`lib/api/discovery.ts`): one tile **per branch** (branch-first cardinality). Reads: `id`, `isOpenNow`, `distance`(m), `isFavourited`, `avgRating`, `reviewCount` (all branch-level), `branchLocalityName/branchPostTown/branchCity` (fallthrough order), `merchant.{businessName, logoUrl, bannerUrl, descriptor, primaryCategory.name, voucherCount, totalEstimatedSaving, maxEstimatedSaving}`.
- **Saving semantics (owner-locked):** cards show `merchant.totalEstimatedSaving` (SUM of all the merchant's vouchers), NOT `maxEstimatedSaving`. Rendered only when `> 0`.

---

## 3. Page structure (`HomeScreen.tsx`)

Single non-virtualised `<ScrollView>` in a `<View>` (bg `surface.body`). Content `paddingTop:60, gap: spacing[5], paddingBottom: insets.bottom + 80 (tab bar) + 24`.

**Composition order:** branded refresh `RedeemoLoader` (while `refreshing`) → `HomeHeader` → `HomeNoLocationBanner?` → `SavedAreaHonestyHint?` → Campaign (skeleton while loading, else `<FadeIn 200><CampaignCarousel></FadeIn>`) → `HomeCategoryGrid` → `FeaturedCarousel?` → **`TrendingSection` XOR `PopularSection`** (server-mutually-exclusive) → `NearbyContextBanner?` → `NearbyByCategory?` → `NearbySectionEmpty?` / `HomeExploreMore?`.

**Scroll handling (June-3 perf fix):**
- `removeClippedSubviews` on the main ScrollView (and on the 3 horizontal rails).
- **Scroll-pause via `scrollActivity`** (global shared value): `onScrollBeginDrag` → `exploreCollapse.value+=1` + `scrollActivity.value=1` (+ clear end-timer, `momentumRef=false`); `onMomentumScrollBegin` → `momentumRef=true`; `onScrollEndDrag` → 80ms timer sets `scrollActivity=0` only if no momentum; `onMomentumScrollEnd` → `scrollActivity=0`.
- **`demoToken`** (`useState(0)`) drives the Explore intro demo: bumped once on first-load-complete (`useEffect` on `!isLoading`, `playedInitialDemo` ref) AND on every `onRefresh` (after refetch). Replays the demo on each refresh.
- **Refresh:** native `RefreshControl tintColor={brandRose}` owns the pull; while `refreshing` an extra `<RedeemoLoader size="md">` renders at the top; `onRefresh` fires medium haptic.
- `useFocusEffect` honours `?scrollTop=1`; a second invalidates `['discovery']` + refetches on focus (stale-heart belt-and-braces).

---

## 4. `HomeHeader.tsx` (current — pre-collapsing-header)

- **Left:** greeting `Good {morning/afternoon/evening}, {firstName ?? 'there'}` in `display.sm` (Mustica 22/26, `-0.2` tracking) — the one Mustica moment. Below, at `marginTop: spacing[1]` (4pt): either the GPS row (`<MapPin 12 brandRose>` + `area, city` in `body.sm` secondary) when `area||city`, OR `<LocationStatusLabel variant="strip" flush>` when GPS area/city absent + `locationContext` present (owner-locked to sit at the GPS-row rhythm, not a detached strip).
- **Right** (`gap: spacing[2]`): 36pt search-icon button (`Search 20 navy` on `surface.neutral` → `onSearchPress`), optional bell (absent), 36pt tappable avatar (`expo-image` when `avatarUrl`, else `brandRose→brandCoral` gradient + initial; → `onAvatarPress` = Profile).
- Container `paddingHorizontal:18, paddingVertical: spacing[3]`. Router-free (parent owns routing).
- **Deferred (separate PR):** the scroll-collapsing sticky header (greeting+location+inline search-bar-with-filter → collapses to a sticky search bar). Not in current code; 2 open decisions (search tap-through vs inline; collapsed-bar content).

---

## 5. `CampaignCarousel.tsx`

- `BANNER_WIDTH = screenW − 36`, `BANNER_GAP=12`, `minHeight:156`, `borderRadius:16`, `padding:20`, content bottom-anchored. Auto-scroll 12s (cancel on drag, restart on momentum-end). `DEFAULT_GRADIENTS = [['#667EEA','#764BA2'],['#E20C04','#E84A00'],['#11998E','#38EF7D']]`.
- Image tile: `expo-image` cover + a **per-banner 2-stop theme overlay** (`withAlpha(gradientStart,0.65)`→`withAlpha(gradientEnd,0.80)`, asymmetric for legibility); `onError` → flips to gradient-only. Body: `heading.md` white title + `body.sm` 0.85-white desc + white CTA pill (`radius.md`, navy `Lato-Bold` 12, text `ctaText ?? 'Learn More'`). `<DotIndicator>` when >1.

---

## 6. Category system

### 6.1 Six Home cards (`HomeCategoryGrid.tsx`, "Model A")
App draws the surface; designer supplies transparent 3D PNGs overlaid on top.

- **Grid:** `H_PAD=18, GAP=14, ASPECT=2.1` (short 2.1:1 cards), 2 cols × 3 rows. `tileW=(width−36−14)/2`, `tileH=tileW/2.1`. Grid + tile wrap are `overflow:'visible'` (elements bleed past edges). Order: Food → Beauty → Health → Out&About → Shopping → Home&Local.
- **Card base:** `borderRadius:20, padding:12, justifyContent:'flex-end'` (icon top-left, label bottom-left), shadow `opacity:0.22 radius:18 offset{0,10} elev:6` with per-card deep shadow colour (food `#7A1E00`, beauty `#3D2A6B`, health `#6B1E14`, out `#1E3A6B`, shop `#7A5410`, home `#1E5418`).
- **`CardGradient`** (radial, one recipe): `<RadialGradient cx="70%" cy="16%" r="82%"><Stop 0 {light}><Stop 1 {deep}>`. Per card light/deep:
  food `#FF9159/#D03E09` · beauty `#BFA9ED/#8C6DCB` · health `#EB7364/#C0392D` · out `#81A7ED/#4C74C8` · shop `#F8C965/#D89724` · home `#82D176/#4CA442`.
- **Icon:** a `category-icons/home/<slug>-icon.png` (1845² padded), absolute top-left, ~49–56px (food 54/-5,-5 · beauty 52/-3,-3 · health 56/-5,-6 · out 55/-3,-5 · shop 49/-2,-3 · home 50/-3,-3).
- **Label** (`cardName`): `MusticaPro-Semibold 14/16, #FFFFFF, -0.1 tracking, maxWidth 62%`, hardcoded `\n` line breaks ("Food &\nDrink", "Shopping" one line, "Home & Local\nServices", etc.).
- **Press:** `PressableScale` → `onCategoryPress(name)`.

**`ElementCluster` — the 3D placement system (the rebuild secret):** each illustration PNG is a **1254² transparent square**; the object inside fills only part of it. Six knobs:
- *Measured from the sharp trim:* `ihf` (object height ÷ square), `icx`/`icy` (object centre fractions, ≈0.5).
- *Design knobs:* `th` (object on-card height ÷ card height), `px`/`py` (where to put the object's CENTRE, fraction of card w/h; may exceed 1 / go negative for a bleed).
- Math: `square = (th*h)/ihf` (render size of the whole PNG so the object hits `th`); `left = px*w − square*icx`; `top = py*h − square*icy`. Render `<Image absolute left top width=square height=square contentFit:'contain'>`. **Array order = paint order (back→front).** ⚠️ Metro needs STATIC `require` literals — no dynamic path templates.

**Per-card element arrays** (asset = `category-illustrations/<slug>/<name>.png`; back→front):
- **food** (3): pizza-slice `ihf.713 icx.512 icy.498 th.46 px.71 py.31` · coffee-cup `.760/.499/.480/.52/.91/.36` · plated-dish `.558/.500/.543/.48/.74/.85`.
- **beauty** (4): vanity-mirror `.716/.504/.474/.78/.90/.34` · makeup-brush `.699/.496/.495/.70/.70/.30` · candle `.624/.500/.511/.50/.69/.62` · lipstick `.789/.504/.496/.54/.82/.66`.
- **health** (3): water-bottle `.720/.520/.490/.70/.93/.38` · dumbbells `.612/.500/.493/.55/.64/.42` · yoga-mat `.521/.507/.500/.58/.83/.79`.
- **out** (3): binoculars `.630/.513/.495/.50/.88/.30` · compass `.713/.494/.483/.58/.62/.42` · picnic-basket `.596/.506/.478/.52/.82/.78`.
- **shopping** (3): shopping-bags `.669/.502/.491/.50/.88/.29` · shopping-cart `.721/.486/.503/.74/.64/.50` · gift-box `.658/.498/.492/.46/.89/.79`.
- **home** (4): mop `.842/.506/.480/.54/.74/.16` · cleaning-bucket `.650/.504/.504/.50/.90/.34` · wrench `.666/.477/.481/.52/.70/.72` · garden-trowel `.647/.533/.478/.50/.90/.80`.
- (Dropped-to-declutter PNGs present-but-unused: food/sushi-roll, beauty/spa-stones, home/folded-cloth, out/tree, shopping/cardboard-parcel.)

### 6.2 Explore-all capsule (`ExploreCategoriesCard`)
One-row capsule below the cards (`EXPLORE_H=74, borderRadius:22, bg #FFF7F1`, hairline `rgba(1,12,53,0.06)`, soft navy shadow) + an SVG radial accent (`explore-accent cx92% cy0% r95%`, `#FBE3DB→#FFF7F1`). Row = `[chips][flexible text col][CTA]`.
- **5 extra-category chips** (`EXPLORE_CHIPS`, icons from `category-icons/all/`): travel `#E6BC78/#9C7330` · family `#F2928C/#CB4B4B` · auto `#6E9AD8/#2F5790` · pets `#77C98D/#3A8552` · medical `#5FC6BE/#208079`. **APPROXIMATE light/deep — lock later.**
- **Chip dims:** `CHIP_CIRCLE=34, CHIP_PILL=96, CHIP_OVERLAP=18, CHIP_SPREAD=6`. Chip: `borderRadius:17, overflow:hidden, 2px white border`. Each chip background = `ChipGradient` (same `cx70% cy16% r82%` card recipe, sized to the pill, pinned top-left, clipped).
- **Expand anim** (`active` shared value = open index or −1): width `withTiming(PILL/CIRCLE,260)`, marginLeft `spread?CHIP_SPREAD:-CHIP_OVERLAP` (spread when `active===i||active===i-1`), zIndex active=99 else `len-i`, label opacity `withTiming(open?1:0,160)`.
- **Copy cross-fade** (180ms on `active>=0`): idle = "Explore all categories" (Mustica 15/18 navy) + "Browse merchants by category" (12/15 `#4B5563`); open = compact 2-line **"Explore all\ncategories"** (Mustica 14/17, `textAlign:center`) overlaid, `alignItems:flex-end, paddingRight:8` (pushed toward the CTA).
- **`ExploreCta`:** 44px SVG, `Circle r22` filled `explore-cta` gradient (`#E20C04→#E84A00`) + white chevron polyline.
- **Intro demo** (`DEMO_START=1000, DEMO_HOLD=1000`): on `demoToken` change, after 1s each chip auto-opens in turn (travel→family→auto→pets→medical, 1s each), then settles. Reduce-motion skips; tap/scroll cancels (per-run local `cancelled` flag for React-18 strict-mode safety); `demoActive` shared value keeps the scroll-collapse reaction off the demo. Driven by `demoToken` (NOT a mount timer — that raced the skeleton).

### 6.3 All Categories (`AllCategoriesScreen.tsx`)
**Image-card-base** model (NOT Model A): designer full-card PNGs rendered as-is, app overlays only icon + name.
- `CARD_BASES` (11) → `category-card-bases/view-all/<slug>-card-base.png` (1200×414, ~2.9:1, transparent L/R shadow margin). `CAT_ICONS` (11) → `category-icons/all/<slug>-icon.png`. `toSlug(name)` lowercases + `" & "`→space + spaces→`-`.
- Data: `useCategories()` filtered `parentId===null` (top-level). `cardW=screenW−16, cardH=cardW/2.8986, overlayLeft=cardW*(26/1200)+16`. FlatList, first `STAGGER_VISIBLE=6` rows `FadeInDown delay=i*45`, rest instant.
- Row = `PressableScale` → `/category/<id>`: card-base `<Image contentFit:contain>` (no clip — preserves shadow/bleed) + absolute overlay (`left:overlayLeft, maxWidth:cardW*0.56`) with 80px glyph (overflowing a 60px wrap) + `<Text variant="display.sm" 18/21 white -0.3 numberOfLines2>`. Fallback (no base) = coloured view (`pinColour ?? brandRose`) + label.
- Header: back button (36 circle, `ArrowLeft navy`) + "All Categories" (`heading.md` navy), `paddingTop:60`.

---

## 7. Rails

### 7.1 Featured (`FeaturedHeroCard.tsx` + `FeaturedCarousel.tsx`)
Paid placement → an **editorial hero archetype** on the **plain body** (no SectionBand).
- **Card:** `BANNER_H=164`, white, `radius:20`, border `#EDE4D7`, shadow `0.12/20/{0,10}/elev6`.
- **Banner:** `expo-image` cover (placeholder `#FFF6EE`, fallback `#667EEA→#764BA2`) + **bottom scrim** `['rgba(1,12,53,0)','…0.10','…0.86']@[0,.42,1]`. FEATURED badge top-left (`brandRose→brandCoral` gradient, `radius:6`, white 9pt Lato-SemiBold `+1.2` upper). Heart top-right (32 circle `rgba(1,12,53,0.32)`, `FavouriteHeart tone="on-gradient" 20`). **Lockup over the photo** (`left16 right16 bottom14`): 48 logo (`radius12`, 2.5 white border) + name row (white 18/23 Lato-Bold `-0.3` + **rating on banner**: `Star 14 #FBBF24` + value white 14 Bold + `(N)`) + descriptor (0.88-white 13/17 Lato-Medium).
- **White strip** (`pH18 pT12 pB16 gap12`): meta row (MapPin? locality · distance · `LiveStatusDot` + Open/Closed) → hairline `#EAE0D2` → **deal row**: saving (label "Save up to" 13/17 Lato-Medium → **amount 24/28 Mustica `#15803D` -0.2** + context "across N vouchers") + "View offers" + `ChevronRight 16 navy` CTA.
- **Carousel:** `TILE_WIDTH = screenW−18−12−28` (28pt peek), `TILE_GAP=12`, auto-scroll 10s, snap, first 4 `FadeInDown delay=i*50`, dots when >1. `allBranchesInLocality` memo drives "Featured in/near {City}" header honesty.

### 7.2 Popular / Trending (`PopularCard.tsx` shared + `PopularSection.tsx` + `TrendingSection.tsx`)
Both render the **same `PopularCard`** + **same `<SectionBand variant="warm">`**; differ ONLY in fixed header copy.
- **`PopularCard`** (`RAIL_TILE_WIDTH=264` exported, `BANNER_H=118, LOGO=48`): white `radius:18`, border `#EDE4D7`, shadow `0.09/13/{0,6}/elev4`. Banner + top scrim `['rgba(0,0,0,0.28)','…0)']@48h` + `BannerTopRight` (prefix `popular-card`). Logo straddles seam (`top:92 left:14`, 48, 3px white border, own shadow). White content (`pH14 pT30 pB14 minHeight:168`): open/closed **absolute top-right** (`statusAbs top8 right14`) → name (17/22 Lato-Bold `-0.2`) → descriptor (14/18 Lato-Medium secondary) → where row (MapPin · locality · distance, 13pt tertiary) → hairline `#EDE4D7` → saving (label → **amount 20/24 Mustica `#15803D`** + context).
- **`PopularSection`:** `<SectionBand variant="warm" testID="popular-band">`, header `fixedCopy="Popular on Redeemo" trendingMark subtitle="Most-redeemed near you"` (platform claim, never locality), `removeClippedSubviews`, first-4 stagger.
- **`TrendingSection`:** identical chrome (testID `trending-band`), header `fixedCopy="Trending near you" trendingMark subtitle="Catching on this week"` (literal, locked). Trending↔Popular mutually exclusive (server-enforced).

### 7.3 Categorized Nearby (`NearbyByCategory.tsx` + `NearbyCard.tsx`)
A **bespoke landscape browse card** (wider-than-tall, name-on-banner).
- **`NearbyCard`** (`NEARBY_CARD_WIDTH=300` exported, `BANNER_H=116, LOGO=44`): white `radius:18`, border `#EDE4D7`, shadow `0.09/13/{0,6}/elev4`. Banner + **bottom scrim** `['rgba(0,0,0,0)','…0.45','…0.9']@[0,.5,1] height92` + `BannerTopRight` (prefix `nearby-card`). **Name ON the banner** in the scrim beside the logo (`top:89 left:68`, white 17/22 Lato-Bold `-0.2` + textShadow). Logo straddles (`top:83 left:14`, 44, 3px white border). White strip (`pH14 pT16 pB12`): top row (descriptor `flex1` + open/closed right) → location row (MapPin · **locality-first** · distance) → hairline → saving (amount 20/24 Mustica `#15803D` + context).
- **`NearbyByCategory`:** `TILE_WIDTH=300, TILE_GAP=12`, consumes `rails[]`, filters `meta!==null && branches.length>0`. Outer `paddingBottom:100, gap: spacing[7]` (32 between rails). Per rail: tappable header (`RailHeader railKind="nearbyByCategory" categoryName`) + **See-all chip only when `branches.length>=2`** (brand-coral "See all" + `ChevronRight 18 brandCoral`); horizontal ScrollView (`removeClippedSubviews`); first-4 stagger.

### 7.4 `RailHeader.tsx` (shared)
- **Title:** Mustica `23/28 navy -0.5` (the "navy spine"). **Subtitle:** Lato `14/19 #6B7280 mt3`. Mark sits left of a title+subtitle column.
- **Three marks** (each `marginRight:8`, vertically centred via `TITLE_CENTER=14`, `MARK_SIZE=24`):
  1. flame → `<TrendingFlame color={brandCoral} gradient={brandGradient} size=24 testID="rail-trending-mark">` (Popular/Trending).
  2. star → `<RailIconMotion kind="featured"><BrandGradientVector path={STAR_PATH} size=24></` testID `rail-featured-mark` (Featured).
  3. category glyph → `<RailIconMotion kind={catVisual.motion}><BrandGradientPng source={catVisual.icon} width={catW} height={catH}></` testID `rail-category-mark`.
- **`CATEGORY_ICONS`** (rail/ trimmed icons; `CATEGORY_ICON_HEIGHT=22`, width=`22*ar`): entries `{match, icon, ar, scale?, motion}`. `medical` MUST precede `health`. ar/scale/motion: food `.7614/1.18/food` · beauty `1.0128/1.08/beauty` · medical `1.0/–/medical` · health `1.0995/–/fitness` · out `1.1189/–/outabout` · shop `1.0906/–/shopping` · home `0.9987/–/homeservices` · travel `1.0516/–/travel` · family `1.1457/–/family` · auto `1.1688/–/auto` · pet `1.0490/–/pets` · fallback `1.1457/–/default`.
- **Title copy:** `fixedCopy` wins; featured → "Featured {in/near} {City}" / "Featured on Redeemo" (scopeExpanded) / "Featured near you"; nbc → `homeCategoryRailLabel(name)` = title-case + " picks". The trailing " picks" renders de-emphasised (`text.tertiary`).

---

## 8. `SectionBand.tsx`
- `band`: `pT16 pB20`, top+bottom hairlines.
- **`warm`** (Popular/Trending): base `LinearGradient [WARM_TOP #FEF6F0 → WARM_BOTTOM #FBE2D3]` vertical (renders immediately; testID `section-band-base`) + an **SVG dual-edge glow** after `onLayout` (testID `section-band-glow`): `glowTop cx.5 cy0 r.6 #E84A00 0.18→0` + `glowBottom cx.5 cy1 r.6 #E84A00 0.16→0` — radiance from top AND bottom for a curved/raised 3D feel. Border `rgba(232,74,0,0.16)`. `overflow:hidden`.
- **`cream`** (forward-compat, unused): flat `#F6ECE0`, border `rgba(226,12,4,0.10)`.

---

## 9. Shared card patterns (rebuild checklist)
All 4 archetypes: white body, `#EDE4D7` warm hairline border, banner placeholder `#FFF6EE`, fallback banner `#667EEA→#764BA2`, white-bordered logo `radius12`, locality-flexes / distance-pinned location row (MapPin 13), hairline above saving, **stacked Mustica `#15803D` saving** ("Save up to" → amount → "across N vouchers"). Radius: Featured 20, rest 18. Banner H: Featured 164, Popular/Trending 118, Nearby 116. Saving amount: Featured 24, rest 20. Widths: Featured `screenW−58` (28 peek), Popular/Trending 264, Nearby 300; rails `gap12 pH18`.
**`BannerTopRight.tsx`** (shared rating chip + heart): `GLASS rgba(0,0,0,0.58)` + `RIM rgba(255,255,255,0.22)`; chip (`Star 12 #F8B739` + value + `(N)`) + 30px heart circle (`FavouriteHeart tone="on-gradient" 18`). **`DotIndicator`**: active 20×6 `brandRose`, inactive 6×6 `#D1D5DB`.

---

## 10. Motion system (`src/design-system/motion/` + `components/`)

- **`scrollActivity.ts`** (NEW): module-level `makeMutable<number>(0)` UI-thread flag. 1 = feed scrolling. Read by every looping animation to PAUSE during scroll.
- **`RailIconMotion.tsx`** (NEW): per-icon continuous loop on the rail glyphs + Featured star. 13 `RailIconKind`s; one `phase` shared value, per-kind interpolation switch (transform/opacity only). LOOP table (duration ms / rest / reverse / gesture): food 1100/0/↺ steam · beauty 1300/0/↺ bloom · fitness 780/0/↺ heartbeat(scale1.14) · medical 1300/0/↺ pulse · outabout 1500/0.5/↺ compass wobble · shopping 1400/0.5/↺ pendulum · homeservices 1300/0/↺ breath · travel 1200/0/↺ float+bank · family 1000/0/↺ bob · auto 900/0/↺ rev · pets 850/0/↺ hop · **featured 5000/0/→ full 360° spin + twinkle** · default 1200/0/↺. Easing inOut(ease) for oscillations, **linear** for the spin. **Scroll-pause `useAnimatedReaction`** on `scrollActivity`: cancel → if `motion>0 && scrolling===0` reset `phase=rest` THEN restart withRepeat (else snap rest). **Reset-to-rest-first is load-bearing** (restarting from a frozen value collapses the range). Reduce-motion safe.
- **`TrendingFlame.tsx`** (MOD): opt-in `gradient` prop → fills the lucide flame path via `BrandGradientVector` (else solid `<Flame>`). Same scroll-pause reaction (flicker scale→1.12@600 + rotate→4°@560, auto-reverse). Reset-to-rest-first.
- **`PulsingDot.tsx`** (MOD): NEW intensity props `minScale(0.6)/minOpacity(0.3)/duration(700)` — **defaults preserve the LIVE-badge** everywhere else. Same scroll-pause reaction + reset-to-rest-first.
- **`LiveStatusDot.tsx`** (NEW): open → `<PulsingDot color={savingsGreen} minScale0.92 minOpacity0.6 duration1200>` (soft ~2.4s breath; tuned down from "too intense"); closed → static grey dot. Used by Featured/Popular/Nearby cards.
- **`BrandGradientGlyph.tsx`** (NEW): `BrandGradientPng({source,width,height})` paints a white PNG via SVG luminance `<Mask>` over a gradient `<Rect>`; `BrandGradientVector({path,size})` fills a path. Both use `brandGradient`, collision-proof ids via `useId().replace(/:/g,'')`. NO `@react-native-masked-view`.
- **`useMotionScale.ts`** (MOD): the reduce-motion `0|1` source. **§RM note:** on the dev device `isReduceMotionEnabled()` returns false even with iOS RM on (detection half — open follow-up). The cancellation half is fixed.
- Unchanged-but-relevant: `PressableScale` (0.97 press + haptic, reduce-motion-safe), `FadeIn`/`FadeInDown` (Batch-5: zero duration AND stagger under reduce-motion), `RedeemoLoader` (Dot-Orbit, sm32/md48/lg80).

**The scroll-stutter fix (headline):** root cause = ~20-30 continuous animations (open-dot pulse per card + rail loops + star + flame) competing with the scroll on a non-virtualised feed. Confirmed by forcing `useMotionScale→0` (scroll became smooth). Fix = pause all loops during active scroll via `scrollActivity` + per-component `useAnimatedReaction` (UI thread, zero re-renders), resume-from-rest. `tests/setup.ts` needed `makeMutable` added to its inline reanimated mock (16 suites broke without it).

---

## 11. Asset contract (`apps/customer-app/assets/`)
Four families, three geometries — **do not mix them up:**
| Family | Dims | Trim | Used by |
|---|---|---|---|
| `category-icons/home/` (6) | 1845² | **padded** | the 6 Home cards |
| `category-icons/all/` (12, incl. `unmapped-screenshot-icon`) | 1845² | **padded** | All-Categories + Explore chips |
| `category-icons/rail/` (12) | trimmed, per-AR | **TRIMMED** | RailHeader glyphs (gradient-filled, 22px high) |
| `category-illustrations/<slug>/` (25 present, 20 used) | 1254² | transparent | Home-card `ElementCluster` overlays |
| `category-card-bases/view-all/` (11) | 1200×414 | transparent L/R shadow | All-Categories rows |

**Rule (load-bearing):** `rail/` is a TRIMMED copy for the rail header only. `home/` + `all/` stay **PADDED** because the card grid + capsule + all-categories are laid out around that padding — **do NOT trim `all/`**. All `require()` paths must be static literals (Metro). `category-illustrations/` ≈16 MB on disk → LFS/CDN is an open follow-up. Scrap present: `category-trial/`, `category-reference-crops-v2/`, stray `Generated image 1.png`.

---

## 12. Tests
Verified incrementally throughout (tsc clean; targeted jest green). New test files: `RailIconMotion.test`, `{FeaturedHeroCard,HomeCategoryGrid,NearbyCard,PopularCard}.test`, `BranchTile.premium.test`. Modified: `RailHeader.test`, `{NearbyByCategory,PopularSection,SectionBand}.test`, `homeCategoryRailLabel.test`, `AllCategoriesScreen.test`, several `BranchTile.*.test`, and **`tests/setup.ts`** (`makeMutable` mock). **Pre-commit:** run the FULL customer-app sweep + clean the pre-existing baseline lint in `HomeScreen.tsx` / `AllCategoriesScreen.tsx` / `tests/setup.ts`.

---

## 13. Open follow-ups + commit map
- **Uncommitted (must checkpoint):** Batch-4 impl (`HomeCategoryGrid` + 46 assets) + the entire June-3 pass (`RailIconMotion`, `scrollActivity`, `BrandGradientGlyph`, `LiveStatusDot`, `FeaturedHeroCard`, `PopularCard`, `NearbyCard`, `BannerTopRight`, the PulsingDot/TrendingFlame/SectionBand/RailHeader/HomeScreen/etc. edits, the deleted `CategoryGrid`).
- **§RM** — reduce-motion DETECTION not firing on the dev device (deferred-index §RM).
- **Collapsing sticky Home header** — designed, deferred to its own PR (needs a spec; 2 open decisions).
- **Bottom nav redesign** — its own PR.
- **Chip `light`/`deep` colours** + **Health & Medical icon** (was a `+` placeholder, now wired to `all/health-medical-icon.png`) — lock.
- **Scroll-pause edge case** — navigate-away-mid-momentum can leave `scrollActivity=1` until next scroll (a focus-reset closes it).
- **Asset size** — `category-illustrations/` ~16 MB; LFS/CDN decision.
- **Doc hygiene (§DOCS.1)** — CLAUDE.md/MEMORY.md over soft caps.
