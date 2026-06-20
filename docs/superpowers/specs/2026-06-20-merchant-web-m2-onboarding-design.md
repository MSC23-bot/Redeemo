# Merchant Portal M2 (Onboarding) Design Spec

> Status: DESIGN SPEC (final). Date: 2026-06-20. Tier-3.
> Supersedes + absorbs the decision checkpoint
> `docs/superpowers/specs/2026-06-20-merchant-web-m2-onboarding-checkpoint.md` (the grill-me D1-D10 record;
> retained as the historical decision log). This spec is the single source of truth for M2 onboarding.
> Output of brainstorming only: NO implementation plan, NO code, NO migration, NO PR until owner approval.

## 0. Source-of-truth hierarchy + anti-drift

1. **The Claude Design prototype is a FIRST-CLASS source of truth** (project `09a77423-ca03-4360-badb-1dca1687c5ab`;
   local export `docs/design/merchant-portal/prototype-handoff/Redeemo-for-Business-Merchant-Portal-handoff.zip`,
   single `Redeemo for Business.dc.html`). Playwright MCP may be used to inspect/verify it (serve the local
   export over localhost; `file://` is blocked). If Playwright fails, ask for screenshots/export, do not guess.
2. **Live code + schema** (`prisma/schema.prisma`, `src/api/**`, `apps/merchant-web/**`) is the reality check.
3. **Conflict rule:** where the older blueprint (`2026-06-16-merchant-portal-product-blueprint.md`) / findings
   (`2026-06-17-merchant-portal-prototype-findings.md`) conflict with the checkpoint + prototype extraction,
   the **checkpoint/prototype wins unless live code proves otherwise**. Resolved conflicts are in section 11.

M2 = the merchant journey from authenticated entry (M1 shipped) to ready-to-submit-for-approval. The backend
onboarding spine is already shipped and battle-tested (admin actioner M0-M8 + Option B B1-B5 consume it). **M2
is overwhelmingly a guided frontend wizard on the existing backend, plus a small set of no-schema backend
enablers and a seed/config task. No schema migration (verified, section 8).**

## 1. M2 Locked Decisions + Prototype Extraction Checkpoint (absorbed from the checkpoint)

- **D1** Draft-window sensitive-field bypass: while the application is a DRAFT (`status REGISTERED`, plus the
  `NEEDS_CHANGES` resubmit window) profile + branch sensitive fields write directly; the governed edit-request
  lane resumes once live. Branch bypass re-resolves location on `postcode` change. No schema.
- **D2** Mandatory flagship-voucher setup only; the merchant CHOOSES the flagship type from 5 ELIGIBLE types
  (BOGO, Spend & save, Discount, Freebie, Package deal); Time limited + Reusable shown disabled-with-copy
  (custom-only, M4). Guided builder (primer, suggestions, curated terms + add-your-own, Too-weak/Good/Great
  scoring, live preview, concierge toggle). Admin review is the quality backstop; weak offers can be sent back.
  No custom CRUD, no offer-engine schema. Mandatory RMVs do NOT expose a merchant-entered expiry date.
- **D3** Seed all 11 categories; per-(category, eligible-type) template (floor + defaults) + frontend
  suggestion/terms config; subcategory-level `primaryCategoryId` + top-level parent-walk for template lookup;
  backend provisioning REDESIGN (merchant-choose-type create, not auto-provision-2-fixed). No schema.
- **D4** Lean Tier-1 business profile (logo, cover, description, website, registered/trading-name mapping,
  company number, VAT Y/N + number). Tier-3 (businessType, charity/UTR, address, head-office contact, title)
  deferred to an M3 schema batch. Documents out of M2.
- **D5** Full category-identity capture (primary -> subcategory -> cuisine -> known-for -> generated label) on
  existing schema; new no-schema taxonomy READ endpoint + identity WRITE; "Add your own" deferred.
- **D6** The 6-step guided staircase on the "Get your business live" hub; client-derived step state (no
  persisted progress model); category-before-vouchers hard dependency; per-step save semantics per backend.
- **D7** Server-proxied merchant image upload (mirror admin B4) for logo + banner + voucher photo; server-side
  type/size/dimension validation; public-image storage kind in config; `STORAGE_ENABLED` deploy-gated; no
  merchant document upload in M2. No schema.
- **D8** D8a server-side opening-hours validation + D8c merchant-facing changes-requested-reason read;
  D8b minimumSaving floor reframed to an advisory client-side scoring input (not a hard server gate). No schema.
- **D9** Existing minimal click-to-agree contract for M2 (placeholder text; real legal text = launch gate;
  personalisation deferred to M3); OWNER role-gate NOT added in M2 (owner-by-absence) with a required M3
  follow-up to OWNER-gate the routes when multi-user lands. No schema.
- **D10** react-hook-form + zod for M2 onboarding forms (add `react-hook-form` + `@hookform/resolvers`; zod
  present); M1 auth screens stay on useState (no migration); build local stepper + file-upload + toast; no
  select/combobox for M2. Frontend-only.

## 2. M2 scope (what ships)

A guided 6-step onboarding wizard in `apps/merchant-web` that takes an authenticated merchant from the pre-live
home to a submitted-for-review application, plus the small M2.0 backend enablers and the RMV seed/config it
needs. Surfaces:
1. **Pre-live home / staircase hub** (section 4.1).
2. **Choose your category + identity** (section 4.2).
3. **Complete your business profile** (Tier-1, section 4.3).
4. **Add your main branch** (section 4.4).
5. **Set up your 2 flagship vouchers** (the guided builder, sections 4.5 + 5).
6. **Sign the merchant agreement** (section 4.6).
7. **Submit for review** + the submitted / in-review / changes / rejected / suspended lifecycle homes (section 4.7).

## 3. Architecture overview

- **Frontend:** `apps/merchant-web` (Next 15 App Router, Tailwind 4, React Query, zod, shadcn, the BFF-lite
  httpOnly session from M1). M2 adds `react-hook-form` + `@hookform/resolvers` (D10) for the onboarding forms;
  M1 auth screens stay on their useState pattern. New local primitives: stepper/wizard, file-upload, toast.
- **Backend it consumes (already shipped):** `GET /merchant/onboarding/checklist`, `GET/POST
  /merchant/onboarding/contract[/accept]`, `POST /merchant/onboarding/submit`; `GET/PATCH /merchant/profile`
  + the edit-request lane; branch CRUD + hours + amenities + PIN; voucher/RMV CRUD + `updateRmvVoucher` +
  `submitRmvVoucher`; the admin actioner consumes the submitted `AdminApproval(MERCHANT_ONBOARDING)`.
- **M2.0 backend enablers (no schema; section 6).**
- **No schema migration (section 8).**

## 4. Onboarding steps

### 4.1 Pre-live home / staircase hub (D6)
The "Get your business live" checklist hub. 6 steps with not-started / in-progress / done states, ordered
progression, downstream locking where a dependency requires it, a gated "Submit for review", the "Nothing is
public yet" reassurance, locked Activity-dashboard + Performance-insights teasers, and the "Verify your business
sooner" documents card shown as a deferred/later surface (the upload itself is out of M2, section 13).

**Step state is CLIENT-DERIVED** from saved data (the checklist endpoint gates + profile fields + category set
+ branch count + RMV count + contractStatus). No persisted onboarding-progress model. The granular
`OnboardingStep` enum values (`BRANCH_ADDED` etc.) are never written by the backend; do not rely on them.

**Hard dependency:** category must precede the flagship-voucher step (category determines the eligible-type set
+ which templates the flagship RMVs instantiate). Other ordering is guided-but-soft.

**Lifecycle projection (merchant-facing), from `Merchant.status` + `onboardingStep`:**

| Projection | Backend state | Home shown |
|---|---|---|
| Setting up | REGISTERED | the checklist hub |
| Submitted | PENDING_APPROVAL / SUBMITTED | "Submitted. We are reviewing." (read-only) |
| In review | PENDING_APPROVAL / UNDER_REVIEW | "An admin is reviewing." (read-only) |
| Changes needed | PENDING_APPROVAL / NEEDS_CHANGES | banner with the admin's reason/items (D8c) + edit the flagged areas, resubmit |
| Live | ACTIVE / LIVE | (M3+ live home; out of M2 beyond a placeholder) |
| Suspended | SUSPENDED | read-only + suspension note |
| Rejected | INACTIVE / REJECTED | read-only + reason |

### 4.2 Choose your category + identity (D5)
Full prototype chain: primary category (11 tiles) -> subcategory "best fits" (single) -> cuisine (multi, where
the subcategory is food-serving) -> "what you are known for" specialties (multi) -> a live generated
customer-facing label ("Indian Restaurant" / "Body Shop"). "Add your own" is DEFERRED (needs the admin-approval
flow); M2 offers seeded tags only.

Storage on existing schema (no migration): `primaryCategoryId` = the selected SUBCATEGORY (so `buildDescriptor`
composes the label correctly); cuisine -> `primaryDescriptorTagId`; specialties -> `MerchantTag`; maintain
`MerchantCategory(isPrimary)`. Setting the category makes the eligible flagship types available; it does NOT
auto-provision RMVs (the redesign, section 5/6). A category CHANGE discards DRAFT flagships and is blocked once
any flagship is submitted (`CATEGORY_CHANGE_BLOCKED`).

Needs the M2.0 taxonomy READ endpoint (the customer `GET /categories` supply-filters and is unsuitable, section
6) + the identity WRITE endpoint.

### 4.3 Complete your business profile (Tier-1; D4)
Fields in M2: logo upload, cover/banner upload, business description, public website, registered-name /
trading-name mapping (`businessName` = registered, `tradingName` = trading), company registration number, VAT
registered Y/N + VAT number, plus the prototype helper copy + visual structure. All write directly during the
draft window via the D1 bypass (logo / banner / description / trading name are otherwise sensitive). Logo +
banner use the D7 upload. True partial save (`PATCH /profile`) supports "Save and finish later".

Deferred to M3 (Tier-3 schema batch): business type + conditional charity number / UTR / VAT logic,
registered/head-office address, distinct head-office phone/email, title, position/jobTitle. The main branch
address is the location source of truth for M2 (no merchant-level address field exists).

### 4.4 Add your main branch (D1 + D8a + D7)
Create the main branch with full fields (create sets all fields directly; first branch auto-marks
`isMainBranch`); opening hours (multiple periods, Open 24h) with **server-side validation (D8a)**; amenities;
redemption PIN view/set. Branch sensitive-field EDITS pre-submit use the D1 draft-window bypass (with postcode
re-resolution). Branch photos use the D7 upload. "Save and finish later" persists only once the create-minimum
(postcode etc.) exists (the branch cannot persist a half-record). Customer-facing branch phone/email are
captured here (branch-level), distinct from any business contact. Branch-user/staff setup is NOT forced (the
owner is the default branch user; staff is M3). Location lands `POSTCODE_CENTROID`; admin confirms at approve
time (not an M2 submit gate).

### 4.5 Set up your 2 flagship vouchers (D2 / D3; full detail in section 5)
The merchant builds 2 mandatory flagship vouchers, each of a chosen eligible type, via the guided builder. Each
flagship is created linked to its chosen type's per-(category,type) template (so `allowedFields` + defaults +
the floor apply), configured, and submitted (DRAFT -> PENDING_APPROVAL). The submit checklist counts 2 `isRmv`
vouchers in PENDING_APPROVAL/ACTIVE. "Save as draft" + the two vouchers submit together with the business.

### 4.6 Sign the merchant agreement (D9)
The existing minimal click-to-agree contract: `GET /onboarding/contract` -> read -> click-to-agree -> `POST
/onboarding/contract/accept` (creates `MerchantContract`, sets `contractStatus=SIGNED` + `contractStartDate`;
idempotent `CONTRACT_ALREADY_SIGNED`). Show the signed state + signed date + version; re-accept on version
drift. Current inline `CONTRACT_TEXT` (v1.0) is placeholder/MVP; the real binding legal text is a launch/legal
sign-off gate. Personalised agreement deferred to M3. In M2 the step is "owner only" by absence (single owner
account); the explicit OWNER role-gate is a required M3 follow-up when multi-user lands.

### 4.7 Submit for review + lifecycle
The frontend pre-flight-validates the 3-gate checklist (branch >=1 non-deleted, contract SIGNED, RMV >=2 in
PENDING_APPROVAL/ACTIVE) and disables Submit until `all_complete`; the backend `POST /onboarding/submit` is the
authority (throws `ONBOARDING_GATES_INCOMPLETE`, payload-free, if not). Submit flips the merchant to
PENDING_APPROVAL / SUBMITTED, creates or reopens the `AdminApproval(MERCHANT_ONBOARDING)` row (resubmit reopens
the SAME row), and the admin actioner takes it from there. On NEEDS_CHANGES the merchant edits the flagged areas
(draft-window bypass active) and resubmits; the changes reason is read via D8c.

## 5. Voucher builder (the largest M2 surface; D2/D3, prototype + section 1B of the checkpoint)

### 5.1 Type picker
All 7 types are shown so merchants see the full Redeemo range. **Eligible (selectable) for a flagship:** BOGO
(recommended), Spend & save, Discount, Freebie, Package deal. **Ineligible (washed-out / disabled cards with
helper copy):** Time limited, Reusable, with copy to the effect of: "These voucher types are not available for
your two flagship vouchers. Once your flagship vouchers are set up, you can create these as custom vouchers
later." (refine wording, preserve intent). A "How Redeemo vouchers work" primer accompanies the picker
(once-a-month redemption rule; "you write the offer, we help keep it strong"; "our team can help, you approve
before it goes live").

### 5.2 Per-type structured fields ("You decide")
Per the 5 eligible types (blueprint section 6.9, validated against the live BOGO build); the merchant's entries
feed `merchantFields` (Json) AND compose the customer-visible columns (Path A):

| Type | Structured fields | estimatedSaving |
|---|---|---|
| BOGO | buy/qualifying item + full price; free item + value-of-free-item (+ cheaper-item-applies rule) | free item value |
| Spend & save | threshold (spend) + saveAmount | saveAmount |
| Discount | fixed (amount + eligibleScope) OR percent (percentage + eligibleScope) | amount (fixed) / derived (percent) |
| Freebie | free item (+ optional triggerPurchase) | free item value |
| Package deal | includedItems[] + packageValue + packagePrice | packageValue - packagePrice |

The exact per-type field labels + the per-category suggestion chips are a verbatim-extraction task from the
prototype config at plan time (section 9).

### 5.3 Suggestions + terms (category-driven config; prototype section 2B)
- **Suggestion chips** (buy/free item, discount target, etc.) are category-driven; the merchant's category
  selects the set, with a neutral fallback. Frontend config map (no schema). The prototype's "Preview
  suggestions as" switcher is demo-only.
- **Terms** = a universal CORE shown everywhere (tell staff before you order/pay; one redemption per customer
  each time; not valid with any other offer; one voucher per customer each visit) PLUS category-conditional
  terms (booking terms for booking-led categories; "Dine in only" for Food; "While stocks last" for
  Shopping/Freebie; "One treatment per visit" for Beauty/Medical; "Valid on full price only" for Shopping/Food;
  "Subject to availability" for Travel/fitness). Each term carries a **Fair / Caution / Restrictive** tag
  (Caution/Restrictive badged). Plus "Add your own term". The chosen terms collapse into the `terms` column
  (config, no schema). The heavier `TermsClause` rules engine (server-validated conflict/ban/value-erosion) is
  deferred to M4.

### 5.4 Scoring: "How this voucher stacks up" (client-side, advisory)
Three tiers only: **Too weak / Good / Great**; generosity is never punished; the only floor is a minimum. The
meter + the two lists ("What is strong" / "What could make it better") are computed from ONE fact set so they
never disagree. The **feedback copy is GENERIC** (type- and merchant-agnostic), driven by which facts are
weak/strong, NOT by category; only the suggestions + terms set are category-specific.
- **Too weak** if ANY: saving below the GBP 5 minimum (absolute); OR terms too restrictive; OR 4+ material
  improvements still open.
- **Great** only when: zero material improvements left AND the saving is genuinely generous AND no restrictive
  terms AND clean terms (<=3).
- **Good** = in between.
- **Inputs:** saving generosity (absolute ~GBP 15+ most types, GBP 10+ freebie, GBP 6+ time-limited; OR relative
  ~20%+ Discount/Spend&save/Package, 40%+ BOGO; below GBP 5 absolute fails except a standalone freebie); clear
  title; helpful description (~30+ chars, edited into the merchant's own words - the auto-suggested text alone
  does not count); photo (a real image beats the default banner); terms cleanliness (becoming restrictive = 1+
  restrictive OR 5+ terms OR 2+ caution; too restrictive forcing Too weak = 2+ restrictive OR 7+ terms OR 4+
  caution); type-specific factors (TL window, Reusable interval) apply only to custom vouchers (M4), since
  TL/Reusable are flagship-ineligible.
- **Framing:** "compares to similar businesses on Redeemo" is MOTIVATIONAL framing ONLY; it shows NO real
  competitor data. The score is advisory: the GBP 5 floor is a scoring input, NOT a hard server gate (D8b), and
  weak offers can be SENT BACK at admin review (the quality backstop).

### 5.5 Title/description auto-compose + the low-friction principle
Title + Description auto-compose from the "You decide" structured fields so a merchant gets a sensible,
natural-reading voucher from simple clicks; the builder then ENCOURAGES personalising them, and un-personalised
auto-text is exactly what "What could make it better" flags. Design intent: the easiest possible guided /
assisted / encouraging builder that still yields valuable, not-undervalued offers (value enforced by the floor
in the score + the admin-review backstop).

### 5.6 Live preview + concierge + the builder backend
Live customer-app-style voucher-card preview, updating as fields change (Path A; no customer-app change). An
"Ask the Redeemo team to help with this offer" concierge toggle: for M2, capture it as a flag/request only; the
admin co-build UI (Option B B5.1) stays gated (Phase-3, the confirmation primitive). Backend per flagship:
create the RMV linked to the chosen type's template (`isRmv`/`isMandatory`, `type`, `rmvTemplateId`, defaults
from the template), guided update via `updateRmvVoucher` (allowedFields from the template; section 8), submit
via `submitRmvVoucher`.

## 6. Backend enablers (M2.0; no schema; report-first; one larger item)

1. D1 profile sensitive-field draft-window bypass.
2. D1 branch sensitive-edit draft-window bypass (+ postcode re-resolution via `resolveBranchLocationFields`).
3. RMV parent-walk reconciliation (resolve subcategory -> top-level for template/eligibility lookup).
4. Merchant taxonomy READ endpoint for the onboarding picker (top-level categories + RMV-eligible flag + full
   subcategories NOT supply-filtered + per-subcategory cuisine/specialty tags from `SubcategoryTag`). The
   customer `GET /categories` supply-filters to >=1 active merchant UK-wide and is unsuitable.
5. Merchant category/identity WRITE (set `primaryCategoryId`=subcategory + `primaryDescriptorTagId` +
   `MerchantTag` + `MerchantCategory`).
6. Merchant SERVER-PROXIED image upload (logo + banner + voucher photo), mirroring admin B4 `putObject`;
   server-side content-type + size + dimension validation; public-image storage kind in `storage.ts`
   `KIND_POLICIES` if needed (code/config); `STORAGE_ENABLED` deploy-gated; NO merchant document upload.
7. Server-side opening-hours validation (overlaps / ordering / 24:00 sentinel / close-after-open /
   closed-days-no-periods) on `setOpeningHours`.
8. minimumSaving floor = advisory client-side scoring input (NOT a hard server gate); server does basic
   present/positive sanity only.
9. Merchant-facing changes-requested reason read (`AdminApproval.comment`, the merchant's own onboarding
   approval).
10. RMV seed/config (data, not schema): per category, the eligible flagship types + a per-(category, eligible-
    type) `RmvTemplate` (defaults + expanded `allowedFields`, `expiryDate` dropped + the `minimumSaving` floor);
    the global ineligible list (Time limited, Reusable) + disabled-card copy; the per-(category, subcategory,
    type) suggestion + curated-term (with Fair/Caution/Restrictive tags) FRONTEND config map + the neutral
    fallback.
11. **RMV-creation redesign (the one larger item; no schema):** replace `provisionRmvVouchers` auto-create-2-
    fixed with merchant-choose-eligible-type -> create ONE RMV linked to that type's template -> guided update
    -> submit (x2). `setMerchantCategoryCore` stops auto-provisioning on category-set. `handleCategoryChange`
    discards DRAFT flagships + lets the merchant re-pick (drop the auto-reprovision); keep the
    `CATEGORY_CHANGE_BLOCKED` guard for submitted RMVs.

## 7. Data / config needs

- **Seed (no schema):** author all 11 categories' RMV templates (currently 2 authored + 4 generic placeholders
  + 5 missing), reframed as a `RmvTemplate` per (category, eligible flagship type) with the floor + defaults +
  expanded `allowedFields` (no `expiryDate`). First-pass draft: `docs/superpowers/specs/2026-06-10-rmv-templates-9-categories.md`.
  Per-category `minimumSaving` floors are a COMMERCIAL decision (flagged for owner/commercial review before lock).
- **Frontend config (no schema):** the per-(category, subcategory, type) suggestion + curated-term config map
  (with Fair/Caution/Restrictive tags) + the universal-core terms + the neutral fallback + the generic
  score-feedback copy. Exact verbatim content extracted from the prototype config at plan time (section 9).

## 8. No-schema analysis (stop-and-report watch DISCHARGED)

**Verdict: M2 needs NO schema change and NO migration.** Verified against live code:
- The `Voucher` model already has `type` (settable), `isRmv`, `isMandatory`, `rmvTemplateId` (nullable),
  `merchantFields` (Json), and the composed columns (`title`/`description`/`estimatedSaving`/`terms`). No
  constraint ties `isRmv` to a required template.
- **Required watch (the RMV-creation redesign + `handleCategoryChange` rework):** `updateRmvVoucherCore` (the
  B5.1 RMV-edit core) reads `allowedFields` from the LINKED `rmvTemplate` and rejects all fields if there is no
  link. So the redesign keeps each merchant-chosen-type RMV **linked to its per-(category,type) template**
  (`rmvTemplateId` set), which keeps `updateRmvVoucherCore`, `listRmvVouchers`, and the B5.1 admin-edit working
  unchanged. The admin actioner is generic: `getReviewContext` selects RMVs by `isRmv` with no fixed-2 / fixed-
  type assumption, and `approveApproval` re-validates the 3-gate checklist and activates RMVs via
  `updateMany({ isRmv, status in PENDING/ACTIVE })` with no per-type/per-template branch. `handleCategoryChange`
  already discards DRAFT RMVs + guards submitted ones; the rework drops only the auto-reprovision step (the
  merchant re-picks). **No schema; the coupling is satisfied by linking RMVs to templates and growing the seed.**
- All other enablers (D1 bypass, hours validation, changes-reason read, image upload, taxonomy read, identity
  write) use existing columns/helpers.

**If implementation discovers schema is required after all, STOP and report exact proposed SQL + rollback before
proceeding** (per the standing instruction). Tier-3 deferred schema items (businessType/charity/UTR/address,
three-tier attributes, TermsClause, admin-managed template CRUD, the OWNER contract gate) are explicitly out of
M2.

## 9. Prototype-source mapping

| Prototype surface | M2 surface | Notes |
|---|---|---|
| "Get your business live" 6-step home | 4.1 staircase hub | client-derived state |
| "Choose your category" (primary/subcat/cuisine/known-for/label) | 4.2 category + identity | new taxonomy read + identity write |
| "Complete your business profile" (public profile + about-you + business&legal + values + verify-sooner) | 4.3 (Tier-1 subset) | about-you/business-type/address/values + documents = M3/out |
| Flagship voucher type picker + guided builder | 5.1-5.6 | merchant chooses type (5 eligible); builder is the largest surface |
| "How this voucher stacks up" scoring | 5.4 | client-side advisory; generic feedback copy |
| Category-driven suggestions + terms | 5.3 | frontend config map; verbatim extraction at plan time |
| "Sign the merchant agreement" | 4.6 | existing minimal click-to-agree |
| "Submit for review" + lifecycle states | 4.7 | 3-gate; resubmit reopens the same approval |

**Verbatim-extraction task for the plan:** pull the exact per-category suggestion chip lists, the per-term
Fair/Caution/Restrictive tags, the per-type field labels/help copy, and the exact scoring thresholds from the
prototype config (`Redeemo for Business.dc.html`) via Playwright + source.

## 10. Cross-check tables (checkpoint expectation -> prototype reality -> live code/schema -> M2 decision)

| Area | Checkpoint expectation | Prototype reality | Live code / schema reality | M2 spec decision |
|---|---|---|---|---|
| Profile draft edit | D1 draft-window direct writes | "full draft edit" pre-live | `updateMerchantProfile` rejects sensitive fields unconditionally | D1 bypass enabler (no schema) |
| Flagship type | D2 merchant chooses from 5 eligible | type picker, all 7 (BOGO recommended), "Change voucher type" | backend pre-provisions 2 fixed-type RMVs; `updateRmvVoucherCore` needs a template link | redesign: merchant chooses eligible type, RMV links to that type's template (no schema) |
| Eligibility | BOGO/Spend/Discount/Freebie/Package eligible; TL+Reusable not | all 7 shown; eligibility is the new restriction | `VoucherType` has all 8; no eligibility concept in code | eligibility enforced in config + the create endpoint; TL/Reusable disabled-with-copy |
| RMV expiry | drop `expiryDate` | builder has no flagship expiry | seed `allowedFields=['terms','expiryDate']` (exposes expiry) | drop `expiryDate` from RMV `allowedFields` (seed) |
| Terms | curated config + Fair/Caution/Restrictive | universal core + category-conditional + badges + add-your-own | no `TermsClause` model | frontend config map; chosen terms -> `terms` column; rules engine = M4 |
| Scoring | advisory client-side, not a gate | Too-weak/Good/Great + generic feedback | `minimumSaving` only seeds default, not enforced | client-side advisory; no hard server floor (D8b) |
| Category identity | full chain, subcategory-level id | primary/subcat/cuisine/known-for/label | schema supports it; merchant write only sets `primaryCategoryId` | new taxonomy read + identity write (no schema) |
| Category picker source | non-supply-filtered | full taxonomy | customer `GET /categories` supply-filters | new merchant taxonomy endpoint |
| Hours | server-side validation | multi-period + Open 24h | `setOpeningHours` does no validation | add D8a validation |
| Changes reason | merchant sees it | "Changes needed" shows reason/items | reason on `AdminApproval.comment`, no merchant read | add D8c read |
| Image upload | server-proxied logo/banner/photo | uploads with size/dimension rules | `storage.ts` exists; no merchant route; URL columns | add D7 server-proxied upload |
| Contract | minimal click-to-agree | personalised draft (representative) | inline v1.0, not OWNER-gated, no personalisation fields | use existing minimal contract; personalisation + OWNER gate = M3 |
| Forms | react-hook-form + zod | large multi-step forms | M1 = useState; rhf not installed | add rhf + zod for M2 forms; M1 untouched |
| Business type / address | Tier-3, M3 | business&legal section (7 UK types + address) | not on `Merchant` | deferred to M3 schema batch |
| Documents | out of M2 | "Verify your business sooner" card | admin-only B4, no merchant route | deferred (later merchant-documents milestone) |
| Staff | not forced | not forced (owner is default branch user) | no BranchUser CRUD routes | out of M2 |

## 11. Conflict resolution (older blueprint/spec vs checkpoint/prototype)

- **Flagship type:** the blueprint implied 2 fixed template-provisioned RMVs; the prototype lets the merchant
  choose. RESOLVED toward the prototype (merchant chooses from 5 eligible), constrained by eligibility. Live
  code allows it with no schema (RMVs link to per-type templates).
- **RMV expiry:** the seed exposed `expiryDate` on RMVs; the prototype + product intent exclude flagship expiry.
  RESOLVED: drop `expiryDate` from RMV `allowedFields`.
- **Contract "OWNER-only":** the blueprint/prototype frame it OWNER-only; live code does not enforce it.
  RESOLVED: owner-by-absence in M2; explicit gate is a required M3 follow-up.
- **Business contact:** the blueprint imagined a distinct business HQ phone/email; live code has only
  `websiteUrl` on `Merchant` (contact = the owner account). RESOLVED: M2 = website only (Tier-1); head-office
  phone/email = M3 schema or reuse-owner.
- **Category supply-filter:** the customer categories endpoint supply-filters; onboarding needs the full
  taxonomy. RESOLVED: a new non-supply-filtered merchant taxonomy endpoint.

## 12. Deferred to M3+ (with reason)

| Item | Reason | Target |
|---|---|---|
| businessType + charity/UTR + conditional validation | schema | M3 batch |
| registered/head-office address fields | schema | M3 batch |
| distinct head-office phone/email | schema (only owner contact exists) | M3 (or reuse owner) |
| title (Mr/Mrs) | schema | M3 / omit |
| position/jobTitle | route missing; not needed for the M2 contract | M3 |
| Your values / highlights | route missing (no schema) + 2 seed tags | M3 (cheap if M2 builds the tag-write) |
| Document upload ("Verify sooner") | merchant route missing (admin-only B4); closed scope | later merchant-documents milestone |
| "Add your own" cuisine/specialty/value | needs admin approval flow | later admin-dependent milestone |
| Custom voucher (RCV) builder | scope; bonus tier, not submit-gated | M4 |
| TermsClause rules engine + calibration margin model | schema + heavyweight | M4 / Phase-3 |
| Admin-managed RMV template/suggestion CRUD | config schema + admin UI | Phase-3 fast-follow |
| Admin-panel voucher-scoring alignment (actioner sees Too-weak/Good/Great) | future enhancement | admin-panel / later |
| Personalised/comprehensive contract + real binding legal text | schema + legal sign-off | M3 + launch gate |
| OWNER role-gate on the contract routes | only meaningful with multi-user | required M3 security follow-up |
| Day-2 edit tiering (live-state sensitive edits) | live-state concern, not onboarding | M3 |

## 13. Closed-scope exclusions for M2

Documents upload/verification; analytics / live-home dashboard (beyond placeholder); redemptions/validation;
Settings / My-account (logged-in change-password, notification prefs); Help/support; Staff & access (BranchUser
CRUD); merchant notification bell (M6); the full offer engine (TermsClause rules engine, calibration); business
type + conditional identifiers + address + head-office contact + title (M3 schema); personalised contract + real
legal text; day-2 edit tiering; custom (RCV) voucher builder (M4); platform-wide auth migration;
admin-web/customer-web auth; admin captcha; any customer-app/customer-web work; unrelated cleanup.

## 14. Risks / warnings / baselines / stop-and-report

- **Stop-and-report (discharged for M2):** the RMV-creation redesign + `handleCategoryChange` rework are
  no-schema (section 8). If implementation finds otherwise, STOP and report exact SQL + rollback.
- **Seed is the gating data task:** 5 of 11 categories have no templates today (Auto & Garage included) and 4
  are generic placeholders; M2 cannot onboard those categories until the per-(category, eligible-type) templates
  are authored. Per-category `minimumSaving` floors need owner/commercial sign-off.
- **`STORAGE_ENABLED` is a deploy gate:** image upload builds + unit-tests in M2; live uploads need prod R2 config.
- **Branch soft-delete:** filter `deletedAt` in any list UI; the checklist already counts non-deleted branches.
- **Branch-user is one-per-branch MVP:** do not build multi-staff UI (M3).
- **Email is dark:** submit/contract/approval emails queue, not send (Phase-6 gates).
- **`isTestData` merchants** are hard-blocked from going live; test approval with real merchants.
- **`REUSABLE` cooldown is clamped at redemption** (not at save) - relevant only to custom vouchers (M4).
- **Verbatim prototype config extraction** is owed at plan time (section 9); the spec captures the model, the
  plan captures the exact chip lists / tags / thresholds.

## 15. Test / verification expectations

- **Frontend (merchant-web jest + RTL):** the staircase + step-state derivation; checklist-gating (Submit
  disabled until `all_complete`); each step form (category/identity, profile, branch, voucher builder, contract);
  the voucher builder (type eligibility incl. TL/Reusable disabled; per-type fields; suggestions + terms config;
  the Too-weak/Good/Great scoring heuristic; auto-compose; live preview); the lifecycle homes incl. NEEDS_CHANGES
  reason. tsc + lint + `next build`; the merchant-web CI job gates each PR.
- **Backend (vitest):** each M2.0 enabler - the D1 bypass lifecycle gate (draft direct vs live edit-request); the
  branch bypass + postcode re-resolution; the RMV-creation redesign (create-flagship-of-chosen-eligible-type +
  the parent-walk + `setMerchantCategoryCore` no-auto-provision + `handleCategoryChange` rework) with the admin
  actioner + B5.1 still green; hours validation; changes-reason read scoping; the image-upload validation; the
  taxonomy read (non-supply-filtered) + the identity write; a seed test asserting every category yields >=2
  eligible-type templates.
- **Per-PR:** scope guard (frontend PRs confined to `apps/merchant-web/**`; M2.0 backend confined to `src/api` +
  `prisma` seed/config + tests), server-verified `gh api compare`, adversarial review, browser/Playwright QA
  against the prototype. Plan-first per the Tier-3 cycle.
