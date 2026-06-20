# Merchant Portal M2: Voucher Builder Verbatim Extraction (Slice S0)

> Status: EXTRACTION ARTIFACT (no code). Date: 2026-06-20. Tier-3 (S0 of the M2 onboarding plan).
> Purpose: a VERBATIM record of the Claude Design prototype's voucher-builder config, scoring logic,
> category maps, per-type fields, and auto-compose rules, so downstream slices (B3 RMV seed/floors;
> F5 frontend suggestion/terms/scoring config map) consume EXACT values, not paraphrases.
>
> Source of truth: the prototype export `Redeemo for Business.dc.html`
> (`docs/design/merchant-portal/prototype-handoff/Redeemo-for-Business-Merchant-Portal-handoff.zip`).
> The bundle is a single React-in-HTML demo. The component logic + config live in the embedded
> `data-dc-script` block (decoded: 6524 lines of readable JS); the visible field labels + help copy
> live in the HTML body template (the `{{ binding }}` markup before the script). Values below were
> read DIRECTLY from the decoded source (not minified). Where a value is rendered text it is quoted
> exactly; where it is a JS literal it is quoted exactly.
>
> NOT minified: the bundle decoded cleanly with readable identifiers. There are NO `UNVERIFIED
> (minified)` items in this artifact.

---

## 0. Reading guide + key dependencies

The builder is one React `Component`. The single config source is `CATEGORY_DATA` (a per-category
map of suggestion chips + term flags) plus several per-type suggestion maps (`FREE_QUAL_SUGGEST`,
`PKG_ITEM_SUGGEST`, `PKG_ITEM_PLACEHOLDERS`). All scoring + auto-compose + terms are derived
client-side. The `effType` (effective type) is the chosen mechanic; Time-limited + Reusable are
"wrappers" that wrap one of the other five mechanics.

Internal category KEYS (used as the `CATEGORY_DATA` map keys + the demo "Preview suggestions as"
switcher) and their customer-facing labels (`DEMO_CAT_OPTIONS`):

| Internal key | Label (DEMO_CAT_OPTIONS) |
|---|---|
| `food_drink` | Food & Drink |
| `beauty_wellness` | Beauty & Wellness |
| `health_fitness` | Health & Fitness |
| `out_about` | Out & About |
| `shopping` | Shopping |
| `home_local` | Home & Local Services |
| `travel_hotels` | Travel & Hotels |
| `health_medical` | Health & Medical |
| `family_kids` | Family & Kids |
| `auto_garage` | Auto & Garage |
| `pet_services` | Pet Services |

NOTE on granularity: the config is keyed at TOP-LEVEL category granularity only (11 keys). There is
NO subcategory-level keying anywhere in the prototype config. The "Pet Services" label is the 11th;
the spec lists the same 11 categories. The `CATEGORY_FALLBACK` (a 12th implicit "neutral" set) covers
any unknown category. The demo default category is `food_drink` (`merchantCategory = S.bDemoCategory
|| 'food_drink'`).

Internal voucher-type IDs (`TYPES` array, in picker order):
`bogo` (Buy one, get one free), `spend` (Spend & save), `discount` (Discount), `freebie` (Freebie),
`package` (Package deal), `time` (Time limited), `reusable` (Reusable).

`money(n)` helper: rounds to 2dp, drops trailing `.00` (so GBP 5 not GBP 5.00; GBP 7.50 stays).

---

## 1. Per-category suggestion chip lists (verbatim, per type)

### 1.1 The `CATEGORY_DATA` map (the primary source)

Each category key holds: `bogoBuy` (3 chips), `freebie` (3 chips), `spendAmt` (3 GBP amounts),
`spendSave` (3 GBP amounts), and `terms` (the conditional-term flags, see section 2). Verbatim:

| Category key | bogoBuy (BOGO "what they buy") | freebie (free-item chips) | spendAmt (GBP) | spendSave (GBP) |
|---|---|---|---|---|
| `food_drink` | `A main`, `A hot drink`, `A starter` | `A side`, `A dessert`, `A hot drink` | `15, 25, 40` | `5, 8, 10` |
| `beauty_wellness` | `A treatment`, `A manicure`, `A blow dry` | `An add on treatment`, `A consultation`, `A product sample` | `30, 50, 80` | `5, 10, 15` |
| `health_fitness` | `A class`, `A session`, `A day pass` | `A guest pass`, `An intro session`, `A class` | `20, 40, 60` | `5, 10, 15` |
| `shopping` | `A full price item`, `An accessory`, `A second item` | `A gift with purchase`, `An accessory`, `A sample` | `25, 50, 100` | `5, 10, 20` |
| `home_local` | `A service`, `A visit`, `A standard job` | `A free callout`, `A quote`, `An add on` | `50, 100, 150` | `10, 20, 30` |
| `travel_hotels` | `A night's stay`, `A room`, `An experience` | `A room upgrade`, `Breakfast`, `Late checkout` | `50, 100, 200` | `10, 20, 40` |
| `out_about` | `A ticket`, `An entry`, `An activity` | `An entry`, `An activity`, `An add on` | `20, 40, 60` | `5, 10, 15` |
| `auto_garage` | `A service`, `A wash`, `A standard check` | `A wash`, `A check`, `A top up` | `50, 100, 150` | `10, 20, 30` |
| `pet_services` | `A groom`, `A session`, `A walk` | `A nail trim`, `A treat`, `An add on` | `20, 40, 60` | `5, 10, 15` |
| `family_kids` | `A session`, `An entry`, `A class` | `An entry`, `An activity`, `An add on` | `15, 30, 50` | `5, 10, 15` |
| `health_medical` | `A consultation`, `A check`, `A treatment` | `A consultation`, `A check`, `An add on` | `40, 80, 120` | `10, 20, 30` |
| `CATEGORY_FALLBACK` (neutral) | `A full price item`, `An item`, `A service` | `A free item`, `An add on`, `A sample` | `20, 40, 60` | `5, 10, 15` |

### 1.2 How each chip set is consumed per type

- **BOGO "what they buy" chips:** `buySuggest = ['Any full price item', ...catData.bogoBuy].slice(0,4)`.
  So the buy-item chip list is the literal first chip `Any full price item` PLUS the category's 3
  `bogoBuy` chips, capped at 4. (e.g. food: `Any full price item`, `A main`, `A hot drink`, `A starter`.)
- **BOGO "what they get free" chips:** NOT category-driven. Fixed list `freeBogo = ['A second of
  equal or lower value', 'Another of the same item', 'A second item']`, sliced to 3. (By design: the
  BOGO free item is always a second of the same kind.)
- **Freebie free-item chips:** `catData.freebie.slice(0,4)` (only 3 exist per category, so all 3 show).
- **Freebie "what do they need to buy" chips (qualifying purchase):** a SEPARATE map `FREE_QUAL_SUGGEST`,
  per category, sliced to 3 (verbatim):

  | Category key | FREE_QUAL_SUGGEST |
  |---|---|
  | `food_drink` | `Any main`, `Any meal`, `A spend of £15 or more` |
  | `health_fitness` | `Any class`, `Any day pass`, `A spend of £20 or more` |
  | `beauty_wellness` | `Any treatment`, `Any appointment`, `A spend of £30 or more` |
  | `shopping` | `Any full price item`, `Two or more items`, `A spend of £25 or more` |
  | `travel_hotels` | `Any overnight stay`, `Any booking`, `A spend of £50 or more` |
  | `home_local` | `Any service`, `Any appointment`, `A spend of £40 or more` |
  | `out_about` | `Any ticket`, `Any entry`, `A spend of £20 or more` |
  | `auto_garage` | `Any service`, `Any standard job`, `A spend of £50 or more` |
  | `pet_services` | `Any groom`, `Any session`, `A spend of £20 or more` |
  | `family_kids` | `Any entry`, `Any session`, `A spend of £15 or more` |
  | `health_medical` | `Any consultation`, `Any appointment`, `A spend of £40 or more` |
  | fallback (no map entry) | `Any full price item`, `Any purchase`, `A spend of £25 or more` |
- **Freebie "what is it worth" chips:** NOT category-driven. Fixed GBP amounts `[4, 6, 8]`.
- **Spend & save "spend" chips:** `catData.spendAmt` (the 3 GBP amounts above).
- **Spend & save "save" chips:** `catData.spendSave` (the 3 GBP amounts above).
- **Discount "what is it on" chips:** there are NO category-driven discount-target chips. Discount uses
  fixed numeric chips only (NOT category-keyed): amount-off `[5, 10, 15]`; percentage-off `[10, 15, 20]`;
  typical-order `[20, 30, 50]`; minimum-spend `[15, 25, 40]`. The "what is it on" concept is handled by
  fixed terms (`Valid on your total bill` / `Valid on your total order`, see section 2.3), NOT a chip set.
- **Package "what is in the package" chips:** a SEPARATE map `PKG_ITEM_SUGGEST`, per category, sliced to 3
  (verbatim):

  | Category key | PKG_ITEM_SUGGEST |
  |---|---|
  | `food_drink` | `A starter, main and dessert`, `Two mains and a side`, `A sharing platter for two` |
  | `beauty_wellness` | `A facial and a massage`, `A cut and blow dry`, `A mani and a pedi` |
  | `health_fitness` | `Five classes`, `A month of sessions`, `An induction and three sessions` |
  | `shopping` | `Three items together`, `A gift set`, `A bundle of essentials` |
  | `home_local` | `A service and a follow up`, `Two rooms done`, `A set of jobs` |
  | `travel_hotels` | `A night plus breakfast`, `A room and dinner`, `A two night break` |
  | `out_about` | `Entry for two`, `A tour and a drink`, `A day pass for the group` |
  | `auto_garage` | `A service and MOT`, `A wash and full valet`, `Tyres and alignment` |
  | `pet_services` | `A groom and nail trim`, `Three walks`, `A wash and tidy` |
  | `family_kids` | `Entry for four`, `A party package`, `Two sessions and a snack` |
  | `health_medical` | `A consultation and a follow up`, `A check and a report` (only 2) |
  | `PKG_ITEM_SUGGEST_FALLBACK` | `A bundle of items`, `Two things together`, `A set` |
- **Package "price" chips:** fixed GBP `[25, 40, 60]` (NOT category-keyed).
- **Package "normal total" chips:** fixed GBP `[35, 55, 80]` (NOT category-keyed).
- **Package "list the items" placeholders** (per-row input placeholders when in list mode), a SEPARATE
  map `PKG_ITEM_PLACEHOLDERS`, per category (verbatim):

  | Category key | PKG_ITEM_PLACEHOLDERS |
  |---|---|
  | `food_drink` | `e.g. a starter`, `e.g. a main`, `e.g. a drink`, `e.g. a side`, `e.g. a dessert` |
  | `beauty_wellness` | `e.g. a treatment`, `e.g. a finishing touch`, `e.g. a product`, `e.g. a consultation` |
  | `health_fitness` | `e.g. a class`, `e.g. a session`, `e.g. a guest pass`, `e.g. an assessment` |
  | `shopping` | `e.g. an item`, `e.g. a matching piece`, `e.g. an accessory`, `e.g. a gift` |
  | `home_local` | `e.g. a service`, `e.g. a follow up`, `e.g. a visit`, `e.g. a job` |
  | `travel_hotels` | `e.g. a night stay`, `e.g. breakfast`, `e.g. a welcome drink`, `e.g. a late checkout` |
  | `out_about` | `e.g. an entry`, `e.g. an activity`, `e.g. a ticket`, `e.g. a drink` |
  | `auto_garage` | `e.g. a service`, `e.g. a wash`, `e.g. a check`, `e.g. a valet` |
  | `pet_services` | `e.g. a groom`, `e.g. a nail trim`, `e.g. a walk`, `e.g. a wash` |
  | `family_kids` | `e.g. an entry`, `e.g. an activity`, `e.g. a session`, `e.g. a snack` |
  | `health_medical` | `e.g. a consultation`, `e.g. a check`, `e.g. a follow up`, `e.g. a report` |
  | fallback | `e.g. an item` |
- **Time-limited "save" chips:** fixed GBP `[4, 6, 8]` (the wrapper's own saving chips; not category-keyed).

### 1.3 Per-category customer-facing example lines (the "EXAMPLE_BY_CAT" map)

Used on the type picker as a concrete example per type per category (NOT a builder field, but
category x type-driven copy worth recording for F2/F5). Verbatim (`EXAMPLE_BY_CAT`):

| Category key | discount | bogo | freebie | spend | package | time | reusable |
|---|---|---|---|---|---|---|---|
| `food_drink` | `20% off your bill` | `Buy one main, get one free` | `A free coffee with any breakfast` | `Spend £30, save £8` | `Three courses for £25` | `Half price mains, Monday to Thursday 5pm to 7pm` | `A free coffee, available again every day` |
| `beauty_wellness` | `20% off your treatment` | `Buy one treatment, get one free` | `A free add on with any treatment` | `Spend £50, save £10` | `A cut and blow dry for £35` | `20% off treatments, Monday to Wednesday` | `A free brow tidy, available again every month` |
| `health_fitness` | `20% off your membership` | `Buy one class, get one free` | `A free guest pass with any class` | `Spend £40, save £10` | `Five classes for £40` | `Half price classes, weekday mornings` | `A free day pass, available again every week` |
| `shopping` | `20% off your order` | `Buy one item, get one free` | `A free gift with any purchase` | `Spend £50, save £10` | `Three items for £25` | `20% off, this weekend only` | `A free sample, available again every visit` |
| `home_local` | `20% off your first job` | `Buy one service, get one free` | `A free callout with any booking` | `Spend £100, save £20` | `A full service for £80` | `15% off, midweek bookings` | `A free check, available again every season` |
| `travel_hotels` | `20% off your stay` | `Buy one night, get one free` | `A free room upgrade with any stay` | `Spend £150, save £30` | `Two nights and breakfast for £180` | `20% off midweek stays` | `A free late checkout, available again every stay` |
| `out_about` | `20% off your ticket` | `Buy one ticket, get one free` | `A free entry with any activity` | `Spend £40, save £10` | `Entry and an activity for £25` | `Half price entry, weekday afternoons` | `A free entry, available again every week` |
| `auto_garage` | `20% off your service` | `Buy one wash, get one free` | `A free check with any service` | `Spend £100, save £20` | `A service and wash for £80` | `15% off services, midweek` | `A free wash, available again every month` |
| `pet_services` | `20% off your groom` | `Buy one groom, get one free` | `A free nail trim with any groom` | `Spend £40, save £10` | `A groom and nail trim for £35` | `15% off grooms, weekday mornings` | `A free nail trim, available again every month` |
| `family_kids` | `20% off your entry` | `Buy one entry, get one free` | `A free activity with any entry` | `Spend £30, save £8` | `Entry and a class for £20` | `Half price entry, weekday mornings` | `A free entry, available again every week` |
| `health_medical` | `20% off your consultation` | `Buy one check, get one free` | `A free consultation with any check` | `Spend £80, save £20` | `A consultation and check for £60` | `15% off consultations, midweek` | `A free check, available again every visit` |
| `EXAMPLE_FALLBACK` | `A clear saving on your most popular item` | `Buy one, get one free` | `A free item with any purchase` | `Spend a little more, save a set amount` | `A few of your items bundled for one price` | `A saving on your quieter days` | `A free item, available again` |

---

## 2. Terms: universal CORE + category-conditional, with Fair/Caution/Restrictive tags

### 2.1 Tag rendering + the restrictive-word classifier

- `tierBadge = { fair: '', caution: 'Caution', restrictive: 'Restrictive' }`. Fair terms show NO badge;
  Caution and Restrictive show their badge text.
- Restrictive-word regex (used to auto-tag a CUSTOM "add your own" term):
  `RESTRICTIVE_WORDS = /minimum|only|excludes?|not valid|after \d|before \d|weekday|weekend|peak|restrict|members? only/i`.
  `tierOf(text)` returns `'restrictive'` if it matches, else `'caution'`. (Custom terms are NEVER auto-tagged
  `fair`; they are either restrictive-by-words or caution.)

### 2.2 Universal CORE terms (the `baseFair` pool, shown across all non-wrapper mechanics)

All tier `fair`:

| id | label | tier |
|---|---|---|
| `tell_staff` | `Tell the staff you are using a Redeemo voucher before you order or pay` | Fair |
| `no_combine` | `Not valid with any other voucher` | Fair |
| `per_visit` | `One voucher per customer each visit` | Fair |

NOTE: the spec section 5.3 / checkpoint 1B describe a 4-item universal core including "one redemption
per customer each time". The prototype `baseFair` has only THREE items. The "one redemption per customer
each time" wording appears only in the Time-limited wrapper term (`time_once_window`, see 2.5), NOT in the
universal core. See cross-check delta CC-2.

### 2.3 Per-type FAIR terms (mechanic-specific, always-Fair)

| id | label (verbatim) | tier | Applies to type |
|---|---|---|---|
| `same_transaction` | `Both items must be in the same transaction` | Fair | BOGO (`bogoFair`) |
| `spend_single` | `Spend £{spendAmt} or more in a single visit` (amount = the live spend field, defaults 30 if blank) | Fair | Spend & save (`spendFairSingle`) |
| `before_service` | `Worked out before any service charge` | Fair | Spend & save (`spendFairService`) |
| `one_free_item` | `One free item per visit` | Fair | Freebie (`freeFairOne`) |
| `with_qualifying` | `With any qualifying purchase` | Fair | Freebie, only when "needs a purchase" = yes (`freeFairQualify`) |
| `pkg_one_visit` | food_drink: `The package is for one table or visit`; else: `The package is for one visit` | Fair | Package (`pkgFairOneVisit`) |
| `pkg_together` | `All items in the package are taken together` | Fair | Package (`pkgFairTogether`) |
| `pkg_before_service` | `Worked out before any service charge` | Fair | Package, ONLY for `food_drink` or `travel_hotels` (`pkgFairService`) |
| `disc_total_bill` | food_drink: `Valid on your total bill`; else: `Valid on your total order` | Fair | Discount (`discTotalBill`) |
| `disc_one_visit` | `One discount per visit` | Fair | Discount (`discOnePerVisit`) |

### 2.4 Category-conditional CAUTION terms (the `catCaution` pool)

Driven by the per-category `terms` flags in `CATEGORY_DATA` (section 2.6). Each pushed only when its flag
is true. All tier `caution`:

| id | label (verbatim) | tier | Flag that enables it |
|---|---|---|---|
| `booking_rec` | `Booking recommended` | Caution | `booking` |
| `booking_req` | `Advance booking required` | Caution | `booking` (pushed together with `booking_rec`) |
| `full_price` | `Valid on full price items only` | Caution | `fullPrice` |
| `dine_in` | `Dine in only` | Caution | `dineIn` |
| `while_stocks` | `While stocks last` | Caution | `whileStocks` OR the mechanic is Freebie (`isFree` always adds it) |
| `subject_avail` | `Subject to availability` | Caution | `subjectAvail` |
| `one_treatment` | `One treatment per visit` | Caution | `oneTreatment` |

### 2.5 RESTRICTIVE built-in terms + wrapper-only Fair terms

| id | label (verbatim) | tier | Where |
|---|---|---|---|
| `disc_min_spend` | `Minimum spend of £{discMin} applies` (only present when Discount is percent-kind AND a minimum-spend is set) | Restrictive | Discount |
| `min_spend` | `Minimum spend applies` | Restrictive | the default/else mechanic branch (generic fallback when no type matched) |
| `time_avail` | `Available only during the times shown` | Fair | Time-limited wrapper (`timedTerms`) |
| `time_once_window` | `One redemption per customer each time the voucher runs` | Fair | Time-limited wrapper (`timedTerms`) |
| `reuse_active` | `Available again after the time shown, while your subscription stays active` | Fair | Reusable wrapper (`reuseTerms`) |

Wrapper (Time-limited / Reusable) term composition: `[...wrapperTerms, ...baseFair, ...(booking-cat ?
[booking_rec, booking_req] : [])]`. So wrappers show only their own terms + the universal core + (booking
terms if the category is booking-led). They do NOT pull the other catCaution terms.

### 2.6 Per-category conditional-term FLAGS (the `terms` object in `CATEGORY_DATA`)

This is THE dependency that selects which catCaution terms appear. Verbatim (true / false):

| Category key | booking | fullPrice | dineIn | whileStocks | subjectAvail | oneTreatment |
|---|---|---|---|---|---|---|
| `food_drink` | true | true | true | false | false | false |
| `beauty_wellness` | true | false | false | false | false | true |
| `health_fitness` | true | false | false | false | true | false |
| `shopping` | false | true | false | true | false | false |
| `home_local` | false | false | false | false | false | false |
| `travel_hotels` | true | false | false | false | true | false |
| `out_about` | false | false | false | false | false | false |
| `auto_garage` | false | false | false | false | false | false |
| `pet_services` | true | false | false | false | false | false |
| `family_kids` | false | false | false | false | false | false |
| `health_medical` | true | false | false | false | false | true |
| `CATEGORY_FALLBACK` | false | false | false | false | false | false |

### 2.7 Per-type built-in clause ASSEMBLY (the `clauseRaw` order)

The full term list offered for each type, in order (after the wrapper cases above):

- **BOGO:** `[...baseFair, bogoFair, ...baseCaution]`
- **Spend & save:** `[spendFairSingle, ...baseFair, spendFairService, ...baseCaution]`
- **Freebie:** if needs-purchase = yes: `[freeFairOne, freeFairQualify, ...baseFair, ...baseCaution]`;
  else: `[freeFairOne, ...baseFair, ...baseCaution]`
- **Package:** `[...pkgTerms, ...baseFair, ...baseCaution]` (where `pkgTerms` = `[pkgFairOneVisit,
  pkgFairTogether, pkgFairService]` for food_drink/travel_hotels, else `[pkgFairOneVisit, pkgFairTogether]`)
- **Discount:** `[...discTerms, ...baseFair, ...baseCaution]` (where `discTerms` = `[discTotalBill,
  discOnePerVisit, discMinTerm]` when a percent minimum-spend is set, else `[discTotalBill, discOnePerVisit]`)
- **default/else:** `[...baseFair, ...baseCaution, { id:'min_spend', label:'Minimum spend applies',
  tier:'restrictive' }]`

### 2.8 Per-type DEFAULT-selected clauses (set on entering the build step, `gotoBuild`)

These are pre-ticked when the merchant lands on Step 2:

| Type | Default-selected clause ids |
|---|---|
| BOGO | (none pre-selected; routes straight to build) |
| Spend & save | `spend_single`, `tell_staff`, `per_visit` |
| Freebie | `one_free_item`, `tell_staff`, `per_visit` |
| Package | `pkg_one_visit`, `pkg_together`, `tell_staff` |
| Discount | `disc_total_bill`, `disc_one_visit`, `tell_staff` |
| Time limited | `time_avail`, `time_once_window`, `tell_staff` |
| Reusable | `reuse_active`, `tell_staff` |

### 2.9 Add-your-own (custom) term

- Char limit: 80 (`customCharLimit = 80`).
- Add/edit help copy: `Keep it simple and fair. {{ customCharsLeft }} characters left of {{ customCharLimit }}.`
- Custom-term draft restrictive note (when the draft matches `RESTRICTIVE_WORDS`):
  `This reads as restrictive. Try to simplify before adding.`
- Custom badge label: `Custom`. Custom terms also show a `Restrictive` badge when `tierOf` flags them.
- Button label: `Add term` (or `Update term` when editing).

---

## 3. Per-type structured field labels + help/placeholder copy (5 eligible types)

All verbatim from the HTML body template. Field structure: a bold field HEADING, a grey helper line, the
input (with `£` prefix where money), suggestion chips, and sometimes a sub-helper. The standard chip
helper line is `Tap a suggestion to start, or type your own.` / `Tap a suggestion to start, or write
your own.` (both variants appear; see below).

### 3.1 BOGO (Buy one, get one free)

- Heading: `What does the customer buy?`
  - Helper: `The item they pay full price for. Describe it in your own words.`
  - Input label inside: `Item`
  - Second field: `Full price` (money, `£`), sub-helper `What this item normally costs without the voucher.`
  - Chip helper: `Tap a suggestion to start, or write your own.`
- Heading: `What do they get free?`
  - Helper: `A second of the same or a similar item. This is what the customer gets as their discount.`
  - Input label: `Item`
  - Second field: `Value of the free item` (money, `£`), sub-helper `What the free item normally sells for.
    This is the saving the customer gets.`
- Type-mismatch hint (shown when the free-item text reads like a Freebie/Package): `That sounds more like
  a Freebie or Package deal, where you give a different item. For Buy one, get one free the free item
  should be a second of the same or a similar item.`

### 3.2 Spend & save

- Heading: `How much does a customer need to spend?`
  - Helper: `The amount a customer spends in one visit to unlock the saving.`
  - Money input (`£`), sub-helper `The total a customer spends in one visit before the saving applies.`
  - Chip helper: `Tap a suggestion to start, or type your own.`
- Heading: `How much do they save?`
  - Helper: `What they get off when they reach that spend.`
  - Money input (`£`), sub-helper `This is the saving the customer gets. It also shows as the estimated saving.`

### 3.3 Discount (fixed + percent)

- Heading: `What kind of discount?`
  - Helper: `A straight discount off the price. Choose a fixed amount or a percentage.`
  - Toggle options: `A percentage off` / `A fixed amount off`. (Default kind is `percent`.)
- Fixed branch:
  - Heading: `How much off?`
  - Helper: `The amount taken off the price. This is the estimated saving.`
  - Money input (`£`).
  - Discount-type note (shown when fixed AND a minimum spend is set): `A fixed amount off is a straight
    discount, like £10 off. If you want it to apply over a spend target, for example £10 off when you
    spend £40, that is the Spend and save type. Pick Spend and save from the voucher types instead.`
- Percent branch:
  - Heading: `What percentage off?`
  - Helper: `The share taken off the price.`
  - Percent input (`%`).
  - (When no minimum spend) Heading: `What is a typical order value?`
    - Helper: `A normal order for your business, so we can estimate the saving.`
    - Money input (`£`), sub-helper `We use this only to estimate the saving. It is not shown to customers.`
- Minimum-spend (optional, both branches):
  - Heading: `Is there a minimum spend?`
  - Helper: `Optional. Apply the discount only when the customer spends at least this much. A percentage
    over a minimum, for example 20% off when you spend £25, is genuinely different from Spend and save.`
  - Money input (`£`).

### 3.4 Freebie

- Heading: `What does the customer get free?`
  - Helper: `The item the customer receives at no cost. A different item from anything they buy. Describe
    it in your own words.`
  - Input sub-helper: `Keep it broad. This is what the customer gets for free.`
  - Chip helper: `Tap a suggestion to start, or write your own.`
- Heading: `What is it worth?`
  - Helper: `What the free item normally costs. This is the saving the customer gets.`
  - Money input (`£`), sub-helper `The free item's normal price. It also shows as the estimated saving.`
- Heading: `Do they need to buy something to get it?`
  - Helper: `Choose whether the free item comes with a purchase or on its own.`
  - Options: `Yes, with a purchase` / `No, it is free on its own.`
- (When "Yes, with a purchase") Heading: `What do they need to buy?`
  - Helper: `The qualifying purchase that unlocks the free item.`

### 3.5 Package deal

- Heading: `What is in the package?`
  - Helper: `The items you bundle together and sell at one price. Describe the bundle in a line, or list
    the items one by one.`
  - Mode toggle: `Describe it` / `List the items`.
  - (Describe mode) sub-helper: `Keep it broad. This is the bundle customers receive together.`
    + chip helper `Tap a suggestion to start, or write your own.`
  - (List mode) per-row numbered inputs (placeholders per category, section 1.2), button `Add another
    item`, sub-helper `Customers see these items listed on the voucher.`
- Heading: `What does the customer pay?`
  - Helper: `The one set price for the whole package.`
  - Money input (`£`).
- Heading: `What would these normally cost?`
  - Helper: `The total if a customer bought the items separately. We use this to work out the saving.`
  - Money input (`£`), sub-helper `This should be higher than the package price, so customers see a saving.`
  - Package warning (when normal total <= package price): `The normal total should be higher than the
    package price, so customers see a real saving.`

### 3.6 Shared "What customers will see" block (all types)

- Section heading: `What customers will see`, sub: `You write everything on the voucher. We suggest a
  start; you have the final say.`
- **Photo:** label `Photo`; states `Photo added` / `Replace` / `Remove` / `Add a photo`; constraint copy
  `JPG or PNG, landscape, at least 1200 by 600 pixels, up to 5 MB.`; helper `It fills the top of your
  voucher card. A photo of the item or your space works well.`
- **Title:** label `Title`; reset link `Use our suggestion`; hint driven by `titleHint` (see section 6).
- **Description:** label `Description`; reset link `Use our suggestion`; hint driven by `descHint`.
- **Estimated saving:** label `Estimated saving`; reset link `Reset to suggested`; money input (`£`); hint
  driven by `savingHint`; mismatch note `savingMismatchNote`; below-minimum block heading `Below Redeemo's
  minimum saving`, body `Offers need to save a customer at least £5 to be worth their trip. Raise the
  saving, or make the free item more generous.`, button `Set saving to £5`. For Spend & save, Freebie,
  Package the saving is READ-ONLY (computed; `savingReadOnly = isSpend || isFree || isPackage`).
- **Your terms:** heading `Your terms`, helper `Pick from this set so customers always know what to
  expect. The fewer you pick, the more people will redeem. Caution terms may put some customers off;
  Restrictive terms can stop people redeeming altogether.`
- **Concierge toggle:** `Ask the Redeemo team to help with this offer`, helper `Turn this on if you would
  like our team to help build or improve this voucher with you. You always approve it before it goes
  live.`, on-state chip `Flagged for the Redeemo team`.

### 3.7 Per-type saving HINT copy (the `savingHint` strings, verbatim)

- **Spend & save:** with values: `Customers save £{save} when they spend £{spend}. This is also their
  estimated saving.`; empty: `This is what the customer saves once they reach the spend.`
- **Freebie:** with value: `The free item is worth £{worth}. That is the saving the customer gets.`;
  empty: `Add what the free item is worth so we can show the saving.`
- **Package:** with values: `Customers save £{save}, the £{normal} normal total minus the £{price}
  package price.`; empty: `Add the package price and the normal total so we can work out the saving.`
- **Discount (percent, with min spend):** `{pct}% of the £{min} minimum spend is £{save}. Customers save
  at least this, and more when they spend more.`; empty: `Add a percentage and a minimum spend so we can
  show the saving.`
- **Discount (percent, no min spend):** `{pct}% of a £{order} order is about £{save}. This is the
  estimated saving customers see.`; empty: `Add a percentage and a typical order value so we can show the
  saving.`
- **Discount (fixed):** with value: `Customers get £{amount} off. This is the estimated saving.`; empty:
  `Add an amount off so we can show the saving.`
- **BOGO (saving auto from free price, editable):** edited: `What customers see as their saving. Please
  check this matches what they really save.`; not edited (auto): `Set automatically from the free item's
  full price (£{auto}). Edit if the real saving is different.`; no price yet: `Add the free item's full
  price above so we can suggest a saving.`; mismatch note: `This no longer matches the free item's full
  price of £{auto}.`

---

## 4. Scoring: "How this voucher stacks up" (verbatim thresholds + tier rules)

Panel heading: `How this voucher stacks up`. Empty state (no mechanic chosen): heading `Pick what runs
first`, body `Choose the voucher in Step 1, then your score and live customer preview appear here.`

### 4.1 The three tiers (`CAL` map) and the meter

Meter order is fixed: `['weak', 'good', 'great']`.

| key | label | desc (verbatim) |
|---|---|---|
| `weak` | `Too weak` | if tooRestrictive: `Your offer is too restrictive to score well. Drop a term or two so customers can actually redeem.` ; elif belowMinSaving: `Below Redeemo's £5 minimum saving. Make it more generous so it is worth a customer's trip.` ; else: `This offer needs work before it is ready. Clear the points below to lift it out of Too weak.` |
| `good` | `Good` | with improvements left: `A solid offer. Address the points below to reach Great.` ; none left: `A solid offer.` |
| `great` | `Great` | `Great offer. Customers will love this.` |

### 4.2 The tier decision rules (verbatim logic)

- `belowMinSaving = savingValue < 5 && !freeStandalone` (the absolute GBP 5 minimum; a standalone freebie
  is exempt).
- `improveCount = materialImprovements.length` (the count of open improvement points).
- `calWeak = belowMinSaving || tooRestrictive || improveCount >= 4` (Too weak if ANY).
- `calGreat = !calWeak && improveCount === 0 && isGenerous && !restrictiveOn && totalTermsCount <= 3`
  (Great only when: not weak AND zero improvements left AND generous AND no restrictive-on flag AND <= 3 terms).
- `calKey = calWeak ? 'weak' : calGreat ? 'great' : 'good'` (Good is everything in between).

### 4.3 Saving-generosity inputs (verbatim)

- `generousAbsolute`: `(isSpend || isPackage) ? false : isFree ? savingValue >= 10 : isTimed ?
  savingValue >= 6 : savingValue >= 15`. So absolute generosity floors per type: Freebie `>= 10`,
  Time-limited `>= 6`, BOGO + Discount `>= 15`; Spend & save + Package are NEVER generous-absolute (they
  rely on the relative share).
- `generousRelative`: `isFree ? false : (isSpend || isPackage || isDiscount) ? savingPercent >= 20 :
  savingPercent >= 40`. So relative-share floors: Spend & save / Package / Discount `>= 20%`; BOGO `>=
  40%`; Freebie has no relative test.
- `isGenerous = (freeStandalone && savingValue > 0) || (reuseFrequent && savingValue >= 5) ||
  (savingValue >= 5 && (generousAbsolute || generousRelative))`. So: a standalone freebie with any
  positive value is generous; a frequent reusable with `>= 5` is generous; otherwise must be `>= 5` AND
  meet an absolute OR relative threshold.
- `savingPercent`: per type, the saving as a share of the relevant full price (BOGO: free/total; Spend:
  save/spend; Package: (normal-price)/normal; Discount: save/ref where ref is the min-spend or the typical
  order), capped at 100.

### 4.4 Other score inputs (verbatim)

- `titleClear = previewTitle.length >= 8 || /\d+%\s*off|£\d+\s*off/i.test(previewTitle)` (>= 8 chars OR
  contains "X% off" / "£X off").
- `descHelpful = previewDesc.length >= 30 && !descUntouched` (>= 30 chars AND the merchant edited it; the
  auto-suggested text alone does NOT count, because `descUntouched = !S.bDescEdited`).
- `hasPhoto = !!S.bPhoto` (a real uploaded image; the default branded banner does not count).
- `freeStandalone = isFree && !freeNeedsPurchase` (a freebie with no qualifying purchase).
- `reuseFrequent = isReusable && mechanicChosen && reuseInterval <= 1440` (once a day or more often;
  interval in minutes, 1440 = 1 day).

### 4.5 Terms-stacking thresholds (verbatim)

- `cautionCount` / `restrictiveCount` counted across built-in selected clauses + custom terms (custom
  tagged via `tierOf`). `totalTermsCount = selectedClauses + customTerms`.
- `becomingRestrictive = restrictiveCount >= 1 || totalTermsCount >= 5 || cautionCount >= 2`.
- `tooRestrictive = restrictiveCount >= 2 || totalTermsCount >= 7 || cautionCount >= 4`.
- `restrictiveOn = becomingRestrictive` (the "restrictive-on" flag used in Great gating + the strengths/
  improvements lists).
- `tooManyTerms = totalTermsCount >= 5`.
- Becoming-restrictive note: `Your voucher is becoming restrictive. Easing off can help more customers
  redeem it, and a clean, simple voucher always scores better.`
- Too-restrictive note: `Your voucher is too restrictive. Drop a term or two, especially the strictest,
  so customers can actually redeem.`

### 4.6 Type-specific scoring factors (Time-limited + Reusable: flagship-INELIGIBLE)

These matter only for later custom vouchers (M4); recorded here verbatim:
- Time-limited window: `winDurationHours`; `windowNarrow = windowsValid && maxWinHours > 0 && maxWinHours
  < 2` (penalises a window under 2 hours); `windowsOk = windowsValid && !windowNarrow`. `REUSE_MIN = 30`
  minutes hard floor for reusable. Reusable rewards `reuseFrequent` (interval `<= 1440` minutes).

### 4.7 Platform framing + submit gate

- Platform framing line (MOTIVATIONAL only, no real data): `The score compares this offer to similar
  businesses on Redeemo, so yours stands out where it counts.`
- Submit gate: `canSubmit = !calWeak && hasPrices && (...type-specific completeness...)`. So a Too-weak
  voucher CANNOT be submitted in the prototype (`!calWeak` is required). See cross-check delta CC-1 (the
  spec says the score is ADVISORY and a too-weak offer CAN still submit, with admin as the backstop).
- Submit button label: flagship voucher 1: `Save voucher 1 of 2`; voucher 2: `Save voucher 2 of 2`;
  custom: `Submit for review`. Also `Save as draft`.

---

## 5. Category / subcategory / type dependencies (what selects what)

- **Source category:** `merchantCategory = S.bDemoCategory || 'food_drink'`. In the real product this is
  the merchant's registered category; the demo "Preview suggestions as" switcher (`DEMO_CAT_OPTIONS`)
  overrides it. The switcher is DEMO-ONLY.
- **Granularity:** ALL category config is keyed at TOP-LEVEL category granularity (11 keys + 1 fallback).
  There is NO subcategory-level config in the prototype. (The spec's "subcategory -> top-level parent-walk"
  is a backend storage concern; the builder config does not consume subcategory.)
- **What the category selects:**
  - the suggestion chip sets (`bogoBuy`, `freebie`, `spendAmt`, `spendSave`, `FREE_QUAL_SUGGEST`,
    `PKG_ITEM_SUGGEST`, `PKG_ITEM_PLACEHOLDERS`) (section 1).
  - the conditional-term flags (`booking` / `fullPrice` / `dineIn` / `whileStocks` / `subjectAvail` /
    `oneTreatment`) which gate the catCaution terms (section 2.4 + 2.6).
  - two food/travel-specific term variants: `pkgFairService` (Worked out before any service charge) is
    added to Package terms ONLY for food_drink/travel_hotels; `pkg_one_visit` and `disc_total_bill` swap
    "table or visit" / "bill" vs "visit" / "order" for food_drink.
  - the per-category example lines (`EXAMPLE_BY_CAT`, section 1.3) shown on the picker.
- **What the TYPE selects:**
  - which structured fields render (section 3).
  - which suggestion chip set applies (BOGO -> bogoBuy + fixed free chips; Freebie -> freebie + FREE_QUAL;
    Spend -> spendAmt/spendSave; Package -> PKG_ITEM; Discount -> fixed numeric chips).
  - the `clauseRaw` term-list assembly + the default-selected clauses (section 2.7 + 2.8).
  - the estimatedSaving derivation + the auto-compose title/description (section 6).
  - the per-type default banner gradient when no photo (`TYPE_BANNER`).
- **Wrapper dependency:** Time-limited / Reusable are wrappers; the merchant first picks an inner mechanic
  (`TIMED_MECH_IDS = ['discount','bogo','freebie','spend','package']`), then `effType` = that mechanic and
  all the mechanic's fields/suggestions/terms apply, plus the wrapper's own terms + window/interval fields.

---

## 6. Title + Description auto-compose rules (verbatim, per type)

Char limits: `titleCharLimit = 60`, `descCharLimit = 300`. The suggested values are computed and shown;
once the merchant edits (`bTitleEdited` / `bDescEdited`), their text is used verbatim (sliced to the limit).
Helpers: `lc()` lower-cases first char; `cap()` upper-cases first char; `noun()` strips a leading
`a/an/any/the`.

### 6.1 Discount

- Percent kind: title (`pc` = percent, default 20): with min spend `{pc}% off when you spend £{min}`; else
  `{pc}% off`. Desc: `Get {pc}% off your order with this voucher.{ if min: " Valid when you spend £{min}
  or more."} A simple saving when you visit.`
- Fixed kind: title (`am` = amount, default 10): with min spend `£{am} off when you spend £{min}`; else
  `£{am} off`. Desc: `Get £{am} off your order with this voucher.{ if min: " Valid when you spend £{min}
  or more."} A simple saving when you visit.`

### 6.2 Spend & save

- Title (`sa` spend default 30, `sv` save default 8): `Spend £{sa}, Save £{sv}`.
- Desc: `Spend £{sa} or more in a single visit and save £{sv}. A little extra for treating yourself.`

### 6.3 Freebie

- `itemN` = noun(freeItem) or `item`; `qualPhrase` = lc(freeQualify) or `any purchase`.
- Title: needs-purchase `Free {itemN} with {qualPhrase}`; standalone `Free {itemN}`.
- Desc: needs-purchase `Get a free {itemN} when you buy {qualPhrase}. A little treat on us when you
  visit.`; standalone `Enjoy a free {itemN} on us. Just show this voucher when you visit.`

### 6.4 Package

- `pr` = package price (default 40); `items` = the bundle phrase; `sv` = max(0, normal - price).
- Title: with items `{cap(items)} for £{pr}`; else `A bundle for £{pr}`.
- Desc: `Get {lc(items)} together for £{pr}` (or `Get the whole bundle together for £{pr}`) + if
  normal > price: `, normally £{normal}. That is £{sv} saved when you take them as a set.`; else `.
  Everything in one simple price.`

### 6.5 BOGO

- `buyNoun` / `freeNoun` from noun(); `freeIsSame` if the free text reads as same-kind.
- Title: no entries `Buy one, get one free`; same-kind `Buy one {buyNoun or 'item'}, get one free`;
  different `Buy a {buyNoun or 'item'}, get a {freeNoun or 'second'} free`.
- Desc: `When you buy {buyPhrase}, we will give you {freePhrase} free at {merchantBusinessName}. If the
  two items are different prices, the cheaper one is free.` (`buyPhrase` = lc(buyText) or `an item`;
  `freePhrase` = `a second one` if same-kind, else lc(freeTextVal) or `an extra`.)

### 6.6 Wrapper append rules (Time-limited / Reusable; flagship-ineligible, for M4)

- Time-limited: appends the first window's schedule to the inner mechanic's title (`{title}, {daysTitle}
  {from} to {to}`) and desc (`{desc} Available {availabilitySummary}.`).
- Reusable: appends the cadence (`every day` or `every {interval}`) to title (`{title}, available again
  {cadence}`) and desc (`{desc} Available again {cadence}, so you can come back and use it more than once.`).

### 6.7 Title / description HINT copy (verbatim)

- Title hint: edited `Your wording. Customers see this exactly. {N} left of 60.`; not edited `Suggested
  from what you entered. Edit it any way you like. 60 character limit.`
- Desc hint: edited `Your wording. {N} left of 300.`; not edited `Suggested. Make it your own to sell the
  offer in your voice. 300 character limit.`

### 6.8 estimatedSaving derivation per type (verbatim)

- BOGO: `freePriceNum` (auto from the free item's full price; editable; mismatch warns).
- Spend & save: `spendSaveNum` (the save field; read-only saving).
- Freebie: `freeWorthNum` (the worth field; read-only saving; `savingPercent = 100`).
- Package: `max(0, pkgNormalNum - pkgPriceNum)` (read-only saving).
- Discount fixed: `discAmountNum`. Discount percent: `round((pct/100) * ref)` where `ref` = the min-spend
  if set, else the typical-order value.

---

## 7. "What is strong" / "What could make it better" feedback strings + GENERIC confirmation

CONFIRMED GENERIC (type/category-agnostic in their TRIGGER): the strengths + improvements lists are driven
by WHICH facts are weak/strong (saving / title / description / photo / terms / window / interval), NOT by
category. The strings interpolate live numbers (saving, percent, term count) but the SET of feedback lines
is a single shared set. Only the suggestion chips + the terms SET are category-specific. There is one note
of type-shaping: a few saving-strength strings vary their wording by mechanic (Spend vs Package vs Freebie
vs other), but the trigger (generous / below-floor / low-share) is generic. Verbatim:

### 7.1 Strengths ("What is strong about your voucher") - heading verbatim

- Saving (generous): one of (by type):
  - Spend: `A generous £{save} back on a £{total} spend, about {pct}%`
  - Package: `A generous £{save} off the £{total} normal total, about {pct}%`
  - Freebie standalone: `A free item on its own, worth £{save}. That is a generous, easy yes for customers`
  - Freebie (with purchase): `A generous free item worth £{save}`
  - Other (BOGO/Discount/etc.): `A generous £{save} saving{ if total>0: " (about {pct}% off £{total})"}`
- Saving (above floor but not generous): Freebie `A free item worth £{save}, above our £5 minimum`;
  else `A £{save} saving, above our £5 minimum`.
- Title: `A clear, easy title`.
- Description: `A helpful description in your own voice`.
- Photo: `A real photo, not a placeholder`.
- Time-limited (windows OK): `Clear, usable times customers can plan around: {availabilitySummary}`.
- Reusable: `Customers can come back and use it again every {interval}, which keeps them returning`.
- Terms (clean): `Few, fair terms` (when not restrictive-on AND <= 3 terms).
- (Strengths list is capped at 4 items.)

### 7.2 Improvements ("What could make it better") - heading verbatim

- Saving below floor: `Raise the saving to at least £5`.
- Low share (when above floor but low %): by type:
  - Spend: `Improve the saving. £{save} back on a £{total} spend is {pct}%; a bigger share reads as Great.`
  - Package: `Improve the saving. £{save} off a £{total} normal total is {pct}%; a bigger share reads as Great.`
  - Other: `Lift the saving a little. {pct}% off £{total} is fine, but a more generous cut reads as Great.`
- Title: `Write a clearer title`.
- Description: auto-text untouched `Make the description your own. Add a line about why customers will
  love it, or a detail only you would know.`; empty `Add a short description that sells the offer`.
- Photo: `Add a photo so your offer stands out to customers`.
- Time-limited: narrow window `Widen the times a little. A window under two hours is hard for customers to
  catch, so a slightly longer window reads better.`; no window `Add at least one availability window so
  customers know when the offer runs`.
- Terms (restrictive-on): `Drop or ease the restrictive term`.
- Terms (too many): `Trim the terms. You have {N}; three or fewer reads cleaner.`
- (Improvements list is capped at 4 items; `improveCount` = the FULL count before the cap, used by `calWeak`.)

### 7.3 The single-fact-set guarantee

The meter (`calKey`), the strengths list, and the improvements list are all computed from ONE fact set
(`savingValue`, `titleClear`, `descHelpful`, `hasPhoto`, `restrictiveOn`, `totalTermsCount`,
`isGenerous`), so they can never disagree (matches the checkpoint 1B "ONE fact set" requirement).

---

## 8. Educational / primer copy (verbatim, for F5 picker + builder framing)

- Type-picker header (flagship): `Choose your flagship voucher`. Sub: `This is the voucher that brings
  new customers through your door. Most businesses start with Buy one get one: it is the easiest for
  customers to understand and the strongest at bringing people in.` Recommended badge on BOGO: `Recommended`.
- Primer heading: `How Redeemo vouchers work`, sub `A quick primer before you build, so it all makes
  sense.` Most-important-rule heading: `The most important rule`.
- `cycleHeadline` (non-timed): `Each customer can use a voucher once a month, during their redemption
  cycle.` `cycleBody` (non-timed): `Once they use it, it is inactive for them until the next month. That
  protects your margin, your regulars keep paying full price, and Redeemo brings you new faces rather than
  constant giveaways.`
- `cycleHeadline` (timed): `Customers can redeem this each time the offer runs, not just once a month.`
- `howRedeemoWorks` (3 points): `Customers find your voucher on the Redeemo app and website, and redeem it
  in person at your branch.` / `You write the offer. We help keep it strong enough to bring people in and
  fair enough not to let anyone down.` / `Want a hand? Our team can help you build your offer, and you
  always approve it before it goes live.`
- `fairPoints` panel heading: `Strong for you, fair for customers`.
- **PROTOTYPE-DEMO disclaimer (NOT product copy):** `In this prototype you can build Buy one, get one
  free, Spend & save, and Freebie. The other types are coming soon.` See section 9 + cross-check delta CC-3.
- Confirm-voucher copy: `Confirm this is your voucher` (or `Confirm your second flagship voucher`);
  second-voucher screen: `Voucher 1 of 2 saved` / `Now build voucher 2 of 2`; both-ready:
  `Both flagship vouchers are ready`.

---

## 9. Prototype eligibility note (load-bearing for F5; reconcile against spec D2)

The prototype's type picker does NOT enforce flagship-eligibility. ALL 7 types are selectable:
- `canContinue = S.bType === 'bogo' || ... || S.bType === 'time' || S.bType === 'reusable'` returns true
  for all 7, INCLUDING `time` and `reusable`.
- `gotoBuild` has a full branch for all 7 types (including Time-limited and Reusable), routing each to the
  build step with sensible default clauses.
- The only "limitation" is the demo disclaimer in section 8 ("In this prototype you can build BOGO, Spend
  & save, and Freebie. The other types are coming soon."), which is a DEMO note about which builders are
  wired in the demo, NOT a product eligibility rule, and NOT a code gate (the code can build all 7).

The spec D2 (owner-locked) restricts the FLAGSHIP picker to 5 ELIGIBLE types (BOGO, Spend & save,
Discount, Freebie, Package deal) and shows Time-limited + Reusable as disabled-with-copy. The prototype
does not implement that restriction; the spec acknowledges this divergence (spec section 1A / 10 / 11:
"the prototype lets the merchant choose ... eligibility is the new restriction" - owner-decided). This is
a known, owner-decided divergence, NOT a stop-and-report. F5 must add the eligibility restriction (and the
disabled-card helper copy) that the prototype lacks. The full Discount + Package builder config extracted
above IS present in the prototype code, so the 5-eligible set is fully buildable from this artifact.

---

## 10. Cross-check vs spec 5.2-5.5 + checkpoint 1B (DELTAS flagged; spec NOT changed)

The following are deltas between the verbatim prototype extraction and the spec / checkpoint. None require
a schema change or reveal an unanticipated backend contract; all are config / copy / threshold nuances for
B3 + F5 to honour. Spec/checkpoint NOT changed (per S0 scope) - flagged only.

- **CC-1 (scoring as a gate, not advisory):** The prototype's `canSubmit` requires `!calWeak`, so a
  Too-weak voucher CANNOT be submitted in the prototype. The spec section 5.4 + D8b + D2 say the score is
  ADVISORY (the GBP 5 floor is a scoring input, NOT a hard server gate) and a weak offer CAN still submit,
  with admin review as the backstop. RESOLUTION (already owner-decided in the spec): follow the SPEC -
  advisory, not a hard client gate. F5 must NOT block submit on Too-weak. The backend B4 does basic
  present/positive sanity only.

- **CC-2 (universal core term count 3 vs 4):** The spec section 5.3 + checkpoint 1B describe a 4-item
  universal core ("tell staff ...; one redemption per customer each time; not valid with any other offer;
  one voucher per customer each visit"). The prototype `baseFair` has only THREE items (`tell_staff`,
  `no_combine`, `per_visit`). The "one redemption per customer each time" wording exists only in the
  Time-limited wrapper term `time_once_window` (`One redemption per customer each time the voucher runs`),
  NOT in the universal core. F5 should use the prototype's 3-item core verbatim; if the 4th line is wanted
  as a true universal, that is an owner copy decision (flagged, not resolved here).

- **CC-3 (eligibility not implemented in prototype):** See section 9. The spec D2's 5-eligible flagship
  restriction + the disabled-card copy for Time-limited/Reusable are NOT in the prototype (all 7 are
  selectable; the only limit is a demo disclaimer). Owner-decided divergence; F5 adds the restriction.

- **CC-4 (no category-driven Discount target chips):** The spec section 5.2/5.3 imply a Discount "what is
  it on" chip set ("discount target"). The prototype has NO category-keyed discount-target chips; Discount
  uses fixed numeric chips (`[5,10,15]` / `[10,15,20]` / `[20,30,50]` / `[15,25,40]`) and fixed terms
  (`Valid on your total bill` / `Valid on your total order`). F5 should follow the prototype (no
  discount-target chip map).

- **CC-5 (Discount fixed-kind eligibleScope / "what is it on"):** The spec 5.2 lists Discount fields as
  "fixed (amount + eligibleScope) OR percent (percentage + eligibleScope)". The prototype does NOT capture
  a free-text `eligibleScope` for fixed; "what it applies to" is handled by the `disc_total_bill` term, not
  a structured field. The percent branch captures a "typical order value" (estimate-only, not shown to
  customers) + an optional minimum spend; the fixed branch captures only the amount + optional minimum
  spend. F5 should follow the prototype field set; `merchantFields` will not contain an `eligibleScope`
  string for Discount.

- **CC-6 (BOGO free-item chips not category-driven):** Checkpoint 1B implies category-driven suggestion
  chips for BOGO. The prototype's BOGO free-item chips are a FIXED 3-item list (`A second of equal or lower
  value`, `Another of the same item`, `A second item`), not category-keyed (only the BOGO BUY chips are
  category-driven, plus the literal `Any full price item`). Minor; F5 should follow the prototype.

- **CC-7 (per-type absolute generosity floors are MORE specific than the spec):** The spec section 5.4
  says "absolute ~GBP 15+ most types, GBP 10+ freebie, GBP 6+ time-limited". The prototype is exact and
  adds that Spend & save + Package are NEVER generous-absolute (they require the relative share >= 20%):
  `generousAbsolute = (isSpend || isPackage) ? false : isFree ? >=10 : isTimed ? >=6 : >=15`. The "~"
  approximations in the spec round to the exact prototype values (15 / 10 / 6) EXCEPT the spec does not
  state the Spend/Package "never absolute" rule. B3/F5 must use the exact prototype rule. No conflict, just
  precision.

- **CC-8 (relative share floors exact):** The spec says "~20%+ Discount/Spend&save/Package, 40%+ BOGO".
  The prototype is exact: `generousRelative = isFree ? false : (isSpend||isPackage||isDiscount) ?
  savingPercent >= 20 : savingPercent >= 40`. Matches; Freebie explicitly has no relative test. The
  low-share improvement triggers at `< 20` / `< 40` respectively.

- **CC-9 (term-stacking thresholds exact and confirmed):** Spec 5.4: "becoming restrictive = 1+
  restrictive OR 5+ terms OR 2+ caution; too restrictive = 2+ restrictive OR 7+ terms OR 4+ caution."
  Prototype matches EXACTLY (`becomingRestrictive = restrictiveCount >= 1 || totalTermsCount >= 5 ||
  cautionCount >= 2`; `tooRestrictive = restrictiveCount >= 2 || totalTermsCount >= 7 || cautionCount >=
  4`). No delta.

- **CC-10 (Great tier rule "<=3 terms" confirmed; "4+ improvements -> Too weak" confirmed):** Spec 5.4
  matches the prototype: Great needs `improveCount === 0 && isGenerous && !restrictiveOn && totalTermsCount
  <= 3`; Too weak if `belowMinSaving || tooRestrictive || improveCount >= 4`. No delta.

- **CC-11 (estimatedSaving for Package = packageValue - packagePrice):** Spec 5.2 says "packageValue -
  packagePrice". Prototype matches: `max(0, pkgNormalNum - pkgPriceNum)`. No delta. (Note: the prototype
  labels are "package price" + "normal total", not "packagePrice" + "packageValue"; same semantics.)

- **CC-12 (char limits confirmed):** Spec section 5.5 says 60 title / 300 description. Prototype matches
  (`titleCharLimit = 60`, `descCharLimit = 300`). Custom term limit 80. No delta.

- **CC-13 (RMV expiry NOT a builder field, confirmed):** The flagship builder has NO merchant-entered
  expiry. (Time-limited + Reusable have an optional voucher end-date, but those are flagship-ineligible.)
  Matches D2 + the seed reframe (drop `expiryDate` from RMV `allowedFields`). No delta; confirms the seed
  task.

- **CC-14 (concierge "Ask the Redeemo team" is a flag only):** Prototype toggle (`askHelp`) + on-state
  chip `Flagged for the Redeemo team`. Matches spec 5.6 (M2 captures it as a flag/request only; the admin
  co-build UI stays gated). No delta.

- **CC-15 (no subcategory-level config):** The spec/checkpoint mention "per-(category, subcategory, type)"
  config. The prototype config is TOP-LEVEL-category-only (11 keys + fallback); there is NO
  subcategory-level keying. F5's config map should be category x type (not subcategory). No backend
  contract change; flagged so F5 does not over-build subcategory keys.

---

## 11. Stop-and-report findings

NONE. The extraction did NOT reveal: (a) a dependency requiring a schema change; (b) a backend contract
the spec did not anticipate; (c) a prototype behaviour that contradicts a LOCKED decision (D1-D10) in a
way the spec did not already record (CC-1 / CC-3 are owner-decided divergences the spec explicitly
documents in sections 1A/10/11, not contradictions of a locked decision); or (d) a value that could not be
extracted verbatim. The bundle was not minified; every value above was read directly from the decoded
source. CC-2 (3-item vs 4-item core) and CC-4/CC-5 (Discount fields) are config/copy nuances for the owner
to note when F5 authors the config map, not stop-and-report items.
