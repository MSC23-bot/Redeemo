# Mandatory-Voucher (RMV) Templates — the 9 remaining categories

**Status:** Content / product draft (first pass for owner review). NOT seeded yet.
**Date:** 2026-06-10
**Feeds:** `prisma/seed-data/referencePhases.ts::seedRmvTemplates` (and the offer-engine UI). Companion to `2026-06-10-merchant-portal-admin-onboarding-design.md` §7.

## What the existing schema actually supports (inspected)

`RmvTemplate` rows in `seedRmvTemplates` use **only**: `voucherType`, `title`, `description`, `allowedFields` (string[]), `minimumSaving` (Decimal), `categoryId`, `isActive`. Merchants edit **only `terms` + `expiryDate`** (`allowedFields: ['terms', 'expiryDate']`); the type/title/description/floor are fixed by the template.

**Current real coverage (correcting "2 of 11"):**
- **Tailored:** Food & Drink (BOGO; 25% off) · Beauty & Wellness (20% off first visit; free treatment).
- **Generic placeholders — `20% Off` + `Spend £30 Save £10` (should be REPLACED):** Health & Fitness · Shopping · Out & About · Home & Local Services. The `20% Off` flagship **contradicts** the offer-engine positioning (% is the weakest flagship, de-emphasised) — replace, don't keep.
- **No templates at all:** Travel & Hotels · Health & Medical · Family & Kids · Auto & Garage · Pet Services.
- Existing `minimumSaving` is a flat `5.00`/`10.00` everywhere — too low + uniform; this draft proposes **sector-calibrated floors** (starting points for owner validation).

## Field mapping (your requested fields → reality)

**(1) Maps to the schema/seed NOW:** `voucherType` · `title` · `description` · `allowedFields` · `minimumSaving` · (`categoryId`, `isActive`).

**(2) Guidance / spec fields for FUTURE UI (not columns — live in this doc / the guided-builder config):** internal key · detailed merchant guidance · suggested default terms · estimated-saving example · banner/image direction · sector rationale · margin/sustainability notes · customer-appeal notes · constraints/warnings · fallback alternative · the "recommended" marker.

**(3) Would require SCHEMA CHANGES to support directly:** a `guidanceTip` column · an `imageGuidance` column · an `isRecommended` flag · a default/editable `estimatedSaving` · richer `allowedFields` so the merchant can set the **qualifying item**, the **actual value**, and a **day/time window** (today they can only edit terms+expiry, which is too restrictive for the guided builder). Recommend a small additive `RmvTemplate` migration in the offer-engine phase: `+ guidanceTip, imageGuidance, isRecommended, defaultEstimatedSaving`; and widen `allowedFields` options.

> Each template below gives the **schema-now block** (seed-ready) + **guidance** (future-UI). `RECOMMENDED` = the sector default. Floors are starting points. **Fixed-£ titles use a concrete amount = the floor** (the schema fixes the title and merchants edit only terms/expiry); these are the prime candidates for the **future guided-builder**, where the merchant sets the amount (richer `allowedFields`).

> **Terms of use — superseded by design-spec §20 (curated clause system).** The per-template `terms:` lines below are **illustrative only**. Real terms come from the **admin-managed curated clause library** (merchants SELECT pre-approved clauses, NOT free-text), with **real-time guardrails at voucher creation** that block conflicting / banned / over-restrictive combinations. The illustrative terms **exclude** platform-given rules ("one per cycle" — automatic) and unenforceable ones ("new customers" — can't verify); treat any such phrases below as removed. Per template, the default clauses are noted by intent (e.g. dine-in/takeaway, show-before-ordering); the live clause set comes from §20.

---

## 3. Health & Fitness
*Covers gyms, studios, yoga/pilates, PT, climbing, martial arts. **Avoid:** BOGO (no clean 2-for-1 on a membership) and % off a membership (erodes recurring revenue). Lead with value-add.*

**T1 · RECOMMENDED · `hf-free-intro` · FREEBIE**
- **Title:** Free Intro Class or Day Pass · **Description:** New customers get their first class or a full day pass, free. · **minimumSaving:** 12.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving ~£15 · terms: "New customers only. One per member per cycle. Subject to availability/booking." · banner: bright class-in-action / studio shot, energetic + welcoming · rationale: the proven gym hook — gets a new member through the door, most convert at full price · margin: near-zero on an off-peak slot; protects membership revenue · appeal: low-commitment, high perceived value · constraints: don't apply to 1:1 PT (high labour); off-peak only · fallback: T3 (waived join fee) for pure weights gyms.

**T2 · `hf-starter-pack` · PACKAGE_DEAL**
- **Title:** 3-Class Starter Pack · **Description:** Three classes for one low price — try before you commit. · **minimumSaving:** 15.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving ~£18 · terms: "New customers. Valid 30 days from first class." · banner: a small grid of class types · rationale: a pack builds a habit → higher conversion than a single class · margin: controlled (you set the pack price) · appeal: "try the range" · constraints: cap classes per pack · fallback: T1.

**T3 · `hf-no-joining-fee` · DISCOUNT_FIXED (waived fee)**
- **Title:** Join With No Sign-Up Fee · **Description:** Start a new membership with the joining fee waived. · **minimumSaving:** 20.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving ~£25 · terms: "On a new monthly/annual membership. New members only." · rationale: removes the #1 barrier to signing up · margin: a one-off fee waiver, not recurring · constraints: new members only · fallback: T1.

## 4. Out & About
*Covers attractions, bowling, escape rooms, mini-golf, museums, cinemas, soft-adventure. **BOGO is ideal here** (the Entertainer's core) — fills off-peak capacity with pairs/groups.*

**T1 · RECOMMENDED · `oa-2for1-entry` · BOGO**
- **Title:** 2-for-1 Entry · **Description:** Buy one entry/ticket/game and get a second free. · **minimumSaving:** 8.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving ~£10 · terms: "One per member per cycle. Off-peak / subject to availability. Cannot combine with other offers." · banner: the venue full + lively (people enjoying it) · rationale: 2-for-1 entry brings a pair/group and fills quiet sessions · margin: a free second entry on under-used capacity is near-zero cost · appeal: "bring a friend free" · constraints: off-peak; exclude peak weekends/holidays if needed · fallback: T2 if entry prices vary a lot.

**T2 · `oa-amount-off-two` · DISCOUNT_FIXED**
- **Title:** £6 Off Entry for Two · **Description:** Save £6 when two people visit together. · **minimumSaving:** 6.00 · **allowedFields:** terms, expiryDate
- *Guidance:* terms: "Two people, one transaction. One per member per cycle." · rationale: reads clean when ticket prices vary · fallback: T1.

**T3 · `oa-free-extra` · FREEBIE**
- **Title:** Free Extra Game/Round with Entry · **Description:** A free extra activity on top of paid entry. · **minimumSaving:** 5.00 · **allowedFields:** terms, expiryDate
- *Guidance:* rationale: adds value without discounting the gate · margin: a free add-on on spare capacity · fallback: T1.

## 5. Shopping *(REPLACE the generic `20% Off` placeholder)*
*Covers retail, boutiques, gift shops, homeware. **Avoid straight % off** (margin erosion on small baskets) — lift the basket or add a gift instead.*

**T1 · RECOMMENDED · `sh-spend-save` · SPEND_AND_SAVE**
- **Title:** Spend £30, Save £8 · **Description:** Save £8 when you spend £30 or more in-store. · **minimumSaving:** 8.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving £8 · terms: "Minimum spend before discount. In-store. One per member per cycle." · banner: an attractive product flat-lay / shelf shot · rationale: lifts average basket rather than cutting margin on a small buy; self-funding above your average sale · margin: protected — only triggers above a threshold you set · appeal: "reward for a proper shop" · constraints: set the threshold above your average transaction · fallback: T2.

**T2 · `sh-gift-with-purchase` · FREEBIE**
- **Title:** Free Gift When You Spend £30 · **Description:** A complimentary gift with any £30+ purchase. · **minimumSaving:** 8.00 · **allowedFields:** terms, expiryDate
- *Guidance:* rationale: a free gift anchors value + protects your quality feel better than % off · margin: a low-cost, high-perceived-value item · constraints: choose a gift that costs you little but reads as valuable · fallback: T1.

**T3 · `sh-bogo-line` · BOGO** *(only where stockable + high-margin)*
- **Title:** Buy One, Get One Half Price · **Description:** On selected lines — the cheaper item is half price. · **minimumSaving:** 8.00 · **allowedFields:** terms, expiryDate
- *Guidance:* warning: only on **high-margin / stockable** lines; "half price on the cheaper item" protects margin · fallback: T1.

## 6. Home & Local Services *(REPLACE the generic placeholder)*
*Covers tradespeople, cleaners, gardeners, decorators, removals, locksmiths. **Avoid BOGO** (services aren't 2-for-1). High-ticket → fixed-£ beats %. **Note:** many trades already give free quotes, so a "free quote" is only a real member benefit where the assessment is normally charged.*

**T1 · RECOMMENDED · `hl-amount-off-first` · DISCOUNT_FIXED**
- **Title:** £20 Off Your First Booking · **Description:** £20 off your first job over £100. · **minimumSaving:** 20.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving £20 · terms: "New customers. On bookings over £100. One per member per cycle." · banner: a clean before/after or a tradesperson at work · rationale: a **real, concrete saving** that converts a new customer who then returns at full price · margin: a fixed amount off a high-ticket job · appeal: removes the "what will it cost?" barrier with a tangible discount · constraints: set the qualifying job value · fallback: T3.

**T2 · CONDITIONAL · `hl-free-assessment` · FREEBIE** *(only where the assessment is normally CHARGED)*
- **Title:** Free Assessment / Consultation · **Description:** A free assessment, survey, or consultation for new customers. · **minimumSaving:** 20.00 · **allowedFields:** terms, expiryDate
- *Guidance:* **⚠ use ONLY where the merchant normally CHARGES for the assessment/diagnostic/survey/consultation** (e.g. a surveyor, a diagnostic call-out). If quotes are already free this is **not a real saving** and weakens the value standard — use T1 instead. terms: "New customers. Where assessment is normally chargeable. One per member per cycle." · rationale: a genuine saving only when the assessment has a real price · fallback: T1.

**T3 · `hl-spend-save` · SPEND_AND_SAVE**
- **Title:** Spend £150, Save £25 · **Description:** Save £25 on larger jobs. · **minimumSaving:** 25.00 · **allowedFields:** terms, expiryDate
- *Guidance:* rationale: rewards the bigger booking; protects margin via threshold · fallback: T1.

## 7. Travel & Hotels *(no templates today)*
*Covers hotels, B&Bs, guesthouses, spa stays. **BOGO room-nights** = the Entertainer model; fills mid-week/off-peak rooms. Higher floors.*

**T1 · RECOMMENDED · `th-2for1-night` · BOGO**
- **Title:** 2-for-1 Room Night (Off-Peak) · **Description:** Buy one night, get the second free, Sunday–Thursday. · **minimumSaving:** 60.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving ~£80 · terms: "Off-peak (Sun–Thu) only. Subject to availability. Advance booking. One per member per cycle. Blackout dates may apply." · banner: a styled room / the property exterior at dusk · rationale: fills mid-week rooms that would otherwise sit empty · margin: marginal cost of an empty room is low (housekeeping only) · appeal: a genuine "weekend away for less" · constraints: off-peak + blackout dates; advance booking · fallback: T2 (package) if 2-for-1 nights aren't viable.

**T2 · `th-stay-breakfast` · PACKAGE_DEAL**
- **Title:** Stay + Breakfast Package · **Description:** A night's stay with breakfast included. · **minimumSaving:** 50.00 · **allowedFields:** terms, expiryDate
- *Guidance:* rationale: bundles add value while protecting the room rate · margin: breakfast cost is low vs perceived value · fallback: T3.

**T3 · `th-amount-off-stay` · DISCOUNT_FIXED**
- **Title:** £50 Off a 2-Night Stay · **Description:** £50 off when you stay two nights or more. · **minimumSaving:** 50.00 · **allowedFields:** terms, expiryDate
- *Guidance:* rationale: drives longer off-peak bookings · fallback: T2.

## 8. Health & Medical *(no templates today — SENSITIVE / regulated)*
*Covers dentists, opticians, physio, private GP, chiropractic, clinics. **⚠ AVOID BOGO and % off clinical treatment.** Healthcare-advertising rules (GDC / GMC / GOC) restrict incentivising treatment; offers must not encourage clinically unnecessary care. Lead with a free check/consultation or a fixed amount off an elective/non-clinical service. **Owner: get a healthcare-advertising compliance sanity-check before going live.***

**T1 · RECOMMENDED · `hm-free-check` · FREEBIE**
- **Title:** Free Check-Up / Consultation · **Description:** A complimentary check-up, consultation, or eye test for new patients. · **minimumSaving:** 25.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving ~£30 · terms: "New patients. One per member per cycle. Clinically appropriate only. Not a substitute for medical advice." · banner: a calm, clean, professional clinic shot (no clinical/graphic imagery) · rationale: the compliant, low-cost hook — brings a new patient in without incentivising unnecessary treatment · margin: practitioner time only · appeal: removes the cost barrier to a first visit · constraints: **no incentivising clinical treatment**; comply with the relevant regulator's advertising rules · fallback: T2.

**T2 · `hm-amount-off-elective` · DISCOUNT_FIXED**
- **Title:** £20 Off Your First Hygiene Visit · **Description:** £20 off a first elective/non-urgent service (e.g. hygiene, whitening). · **minimumSaving:** 20.00 · **allowedFields:** terms, expiryDate
- *Guidance:* terms: "New patients. On elective/non-urgent services only." · warning: **elective/cosmetic only — never urgent or clinically-indicated treatment** · constraints: compliance review required · fallback: T1.

## 9. Family & Kids *(no templates today)*
*Covers soft play, kids' activities/classes, party venues, trampoline parks. **2-for-1 entry** works well (siblings/friends come together, fills off-peak). Keep copy family-appropriate.*

**T1 · RECOMMENDED · `fk-2for1-entry` · BOGO**
- **Title:** 2-for-1 Child Entry · **Description:** Buy one child's entry/session and get a second free. · **minimumSaving:** 6.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving ~£8 · terms: "One per member per cycle. Off-peak / subject to availability." · banner: kids happily playing (consent-cleared imagery) · rationale: a family-friendly hook — siblings/friends come together, filling quiet sessions · margin: near-zero on spare session capacity · appeal: "bring a friend free" for parents · constraints: off-peak; supervision/age rules in terms · fallback: T2.

**T2 · `fk-free-extra` · FREEBIE**
- **Title:** Free Activity with a Session · **Description:** A free extra (a turn on a ride, a snack, a craft) with any session. · **minimumSaving:** 5.00 · **allowedFields:** terms, expiryDate
- *Guidance:* rationale: adds value without discounting entry · fallback: T1.

**T3 · `fk-amount-off-party` · DISCOUNT_FIXED**
- **Title:** £15 Off a Party Package · **Description:** £15 off a party package or a block of classes. · **minimumSaving:** 15.00 · **allowedFields:** terms, expiryDate
- *Guidance:* rationale: drives the higher-value booking (party / class block) · fallback: T1.

## 10. Auto & Garage *(no templates today)*
*Covers garages, MOT, servicing, tyres, valeting, bodywork. **⚠ NO BOGO** (you can't "buy one MOT, get one free"). Lead with a free check, a bundle, or a fixed amount off.*

**T1 · RECOMMENDED · `ag-free-healthcheck` · FREEBIE**
- **Title:** Free Vehicle Health Check · **Description:** A free multi-point health/safety check with any service or MOT (or standalone). · **minimumSaving:** 25.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving ~£30 · terms: "One per member per cycle. By appointment. With a paid service/MOT or standalone." · banner: a clean workshop / car on a ramp · rationale: costs you minutes but is valued at ~£30 — gets the car on your ramp and surfaces work · margin: technician time only · appeal: peace of mind, no commitment · constraints: by appointment · fallback: T2.

**T2 · `ag-service-mot-bundle` · PACKAGE_DEAL**
- **Title:** Service + MOT Bundle · **Description:** A full service and MOT together at a bundled price. · **minimumSaving:** 25.00 · **allowedFields:** terms, expiryDate
- *Guidance:* rationale: the classic garage value play — protects margin via volume · margin: controlled (you set the bundle price) · fallback: T3.

**T3 · `ag-amount-off-service` · DISCOUNT_FIXED**
- **Title:** £20 Off Your Next Service · **Description:** £20 off a service, MOT, or set of tyres. · **minimumSaving:** 20.00 · **allowedFields:** terms, expiryDate
- *Guidance:* rationale: a fixed £ off a high-ticket job reads cleaner than a % · fallback: T1.

## 11. Pet Services *(no templates today)*
*Covers grooming, dog daycare/walking, pet shops, **vets**. **⚠ Vets:** treat like Health & Medical — free check/consultation, **not** discounting clinical treatment. Grooming/daycare/retail are flexible.*

**T1 · RECOMMENDED · `ps-free-addon` · FREEBIE**
- **Title:** Free Add-On with Any Groom · **Description:** A complimentary nail trim, teeth check, or add-on with any grooming session. · **minimumSaving:** 8.00 · **allowedFields:** terms, expiryDate
- *Guidance:* est. saving ~£12 · terms: "One per member per cycle. With any full-price groom." · banner: a happy, well-groomed pet · rationale: low-cost add-on that drives rebooking · margin: a few minutes of groomer time · appeal: a little extra care for their pet · constraints: grooming only (not clinical) · fallback: T2.

**T2 · `ps-amount-off-first` · DISCOUNT_FIXED**
- **Title:** £8 Off Your First Groom or Daycare Day · **Description:** £8 off a first grooming session or daycare day. · **minimumSaving:** 8.00 · **allowedFields:** terms, expiryDate
- *Guidance:* terms: "New customers. One per member per cycle." · rationale: converts a new regular · fallback: T1.

**T3 · `ps-daycare-pack` · PACKAGE_DEAL**
- **Title:** 5-Day Daycare Pack · **Description:** Five daycare days at a pack price. · **minimumSaving:** 10.00 · **allowedFields:** terms, expiryDate
- *Guidance:* rationale: a pack builds routine → higher retention · warning (vets): for veterinary services use a **free consultation/check**, never a discount on clinical treatment — compliance-sensitive · fallback: T1.

---

## Cross-check

| Dimension | Result |
|---|---|
| **Existing template fields found** | `voucherType`, `title`, `description`, `allowedFields` (`['terms','expiryDate']`), `minimumSaving`, `categoryId`, `isActive`. Merchants edit only terms + expiry. |
| **Requested fields covered** | All 16 covered in the drafts — split into schema-now (type/title/description/allowedFields/minimumSaving) vs future-UI guidance (key/guidance/terms-suggestion/est-saving/banner/rationale/margin/appeal/constraints/fallback/recommended-marker). |
| **Fields that DON'T map to current schema** | guidanceTip · imageGuidance · isRecommended · default/editable estimatedSaving · richer allowedFields (qualifying-item / value / day-time window). → small additive `RmvTemplate` migration in the offer-engine phase. |
| **Category-specific risks** | **Health & Medical + Vets:** healthcare-advertising compliance (GDC/GMC/GOC) — no BOGO/% on clinical treatment; **owner needs a compliance sanity-check.** **Auto & Garage:** no BOGO. **Shopping / Home & Local Services:** the existing generic `20% Off` placeholders contradict the brand — **replace.** **Travel & Hotels:** higher floors + blackout/off-peak terms. |
| **Recommended MVP templates** | Seed **T1 (RECOMMENDED) for all 9** + replace the 4 generic placeholders; add T2/T3 where they help. Use the schema-now fields; keep `allowedFields: ['terms','expiryDate']` until the richer-fields migration lands. |
| **Fast-follow** | The `guidanceTip`/`imageGuidance`/`isRecommended`/`estimatedSaving` columns + richer `allowedFields` + the guided-builder UI that surfaces the guidance fields; per-subcategory overrides (e.g. fine-dining vs café); the conversational "help me build" builder. Floors to be validated with real merchant economics. |

*(First-pass content draft. Floors + copy are starting points for owner review. Health & Medical / Vets templates must not go live without a healthcare-advertising compliance check.)*
