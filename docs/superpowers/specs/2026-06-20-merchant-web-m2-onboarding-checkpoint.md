# Merchant Portal M2 (Onboarding) - Locked Decisions + Prototype Extraction Checkpoint

> Status: ACTIVE BRAINSTORM CHECKPOINT (pre-spec). Date: 2026-06-20.
> Purpose: a durable anti-drift source of truth for the M2 onboarding decisions, so the long
> brainstorm thread cannot be lost to context compression. The eventual M2 design spec MUST
> carry this section ("M2 Locked Decisions + Prototype Extraction Checkpoint") prominently and
> keep it in sync. Owner-driven; brainstorming/planning only (no code, no PR, no migration yet).

## 0. Source-of-truth hierarchy (READ FIRST)

1. **The Claude Design prototype is a FIRST-CLASS source of truth, not visual inspiration.** It
   evolved after the blueprint and carries fields, copy, states, dependencies, and logic that the
   earlier blueprint/spec do not all capture. Prototype project: "Redeemo for Business - Merchant
   Portal" (id `09a77423-ca03-4360-badb-1dca1687c5ab`); on-disk export:
   `docs/design/merchant-portal/prototype-handoff/Redeemo-for-Business-Merchant-Portal-handoff.zip`
   (single `Redeemo for Business.dc.html` React-in-HTML demo). Doc-level extraction lives in
   `docs/superpowers/specs/2026-06-17-merchant-portal-prototype-findings.md` (esp. the onboarding/
   journey section, §2B category-sourced suggestions, §2T/§2U business profile).
2. **Live code + schema** (`prisma/schema.prisma`, `src/api/merchant/**`, `src/api/admin/**`) is the
   reality check. Where the prototype and code disagree, the gap is recorded below, not silently
   resolved.
3. Blueprint (`2026-06-16-merchant-portal-product-blueprint.md`) + handover
   (`2026-06-19-merchant-portal-build-handover.md`) are guides, now superseded in precision by the
   prototype + live-code inspection for M2 onboarding.

**Tooling/process (owner-granted 2026-06-20):** Playwright MCP may be used whenever useful to inspect the
Merchant Portal prototype or verify behaviour (fields, logic, copy, interactions, scoring, state
transitions). Drive it against the local export served over localhost (`file://` is blocked) or the
available prototype source. If Playwright access fails, report it and ask for screenshots/export rather
than guessing. The prototype is a first-class source of truth for all Merchant Portal work.

M2 = the merchant journey from authenticated entry (M1 shipped) to ready-to-submit-for-approval.
The backend onboarding spine (checklist, contract, profile/category, branch, voucher/RMV, submit ->
admin queue) is already shipped and battle-tested; **M2 is overwhelmingly a guided frontend wizard
plus a small set of no-schema backend enablers and a seed-data task.**

## 1. Locked decisions (D1-D6)

### D1 - LOCKED: lifecycle-conditioned bypass for sensitive-field writes during onboarding
- **Profile:** while the application is a DRAFT (`status REGISTERED`, plus the `NEEDS_CHANGES`
  resubmit window) all profile fields write directly; once live/approved, sensitive identity fields
  route through the existing governed edit-request lane. Today `updateMerchantProfile` rejects
  sensitive fields unconditionally ([profile/service.ts:156-157](../../../src/api/merchant/profile/service.ts)),
  which breaks the prototype's "full draft edit".
- **Branch:** apply the same draft-window bypass to **branch sensitive edits**. Branch *create*
  already sets all fields directly; the gap is *editing* a sensitive branch field pre-submit. The
  branch bypass MUST re-resolve location when `postcode` changes (re-run `resolveBranchLocationFields`,
  as `createBranchCore` does), not just write the raw postcode.
- **Predicate shaping:** keep the bypass a clean draft-window check so the day-2 refinement
  (`description` -> instant when live, per blueprint §3.4) drops in easily. Do NOT solve day-2 edit
  tiering in M2.
- **No schema.** Small M2.0 backend enabler (profile + branch services).

### D2 - LOCKED (REVISED 2026-06-20 after the live prototype browse): mandatory flagship-voucher setup, merchant CHOOSES the type from an eligible set
- M2 builds **mandatory flagship voucher setup only**. **No custom voucher (RCV) CRUD in M2. No
  `TermsClause`/offer-engine schema in M2.**
- **Merchant CHOOSES the flagship voucher type** (prototype model), then authors the voucher via the
  guided builder; NOT two backend-preselected fixed types. BOGO may be recommended.
- **Flagship type eligibility (5 of 7):** ELIGIBLE = Buy one get one, Spend & save, Discount, Freebie,
  Package deal. INELIGIBLE = Time limited, Reusable, shown in the picker as washed-out/disabled cards
  with helper copy (refine wording, preserve intent): "These voucher types are not available for your
  two flagship vouchers. Once your flagship vouchers are set up, you can create these as custom vouchers
  later." Rationale: one size does not fit all (the merchant picks the fitting type), but mandatory
  go-live offers stay constrained to strong, evergreen flagship types. Time-limited + Reusable live only
  in custom-voucher creation (M4).
- **Admin review is the quality backstop (builder is guided, not a free-for-all):** the merchant
  chooses from the eligible types and authors freely above the floor, but the builder must make clear
  that weak offers can be sent back at review. Builder copy (refine wording, preserve intent): "Very
  weak offers may be sent back by the Redeemo team before your business can go live." Principle:
  merchants choose eligible types; Redeemo guides while they build; the Too-weak/Good/Great score helps
  them improve; admin review (approve / request changes / reject) is the final quality gate; weak offers
  can be sent back for changes.
- The RMV builder must NOT be a bare form. It must be **guided, category-aware, scored/quality-aware
  where feasible, suggestion-driven, and preview-based**: weak/good/great scoring against the
  template `minimumSaving` floor; helper text + "what makes it strong / stronger"; field-connected
  guidance; a live customer-app-style preview (Path A - compose `title`/`description`/
  `estimatedSaving`/`terms`; no customer-app change); category/subcategory-aware suggestion + terms
  maps as a **frontend config map** (prototype §2B: explicitly "builder configuration, not voucher
  columns, no schema change").
- **Mandatory RMVs must NOT expose a normal merchant-entered expiry date** unless legal/product later
  requires it. They persist while the merchant is active/on-contract (matches the contract text).
- **The current seed `RmvTemplate.allowedFields = ['terms', 'expiryDate']` is too thin** (it would
  give a terms-only form, and it wrongly exposes expiry) and MUST be corrected for M2: drop
  `expiryDate`; the merchant composes the offer; the template/config provides per-(category,type)
  DEFAULTS + the `minimumSaving` floor as guardrails. The type is merchant-CHOSEN from the eligible set
  (NOT fixed). `allowedFields` / `merchantFields` / `type` / nullable `rmvTemplateId` are all existing
  columns -> no schema.
- **Admin-managed RMV template/suggestion tooling is FUTURE work, not M2** (the M2 suggestion content
  is a frontend config map; the real admin-editable source = a config schema + admin-panel CRUD,
  Phase-3 fast-follow).
- **Custom vouchers are DEFERRED, not cancelled** -> M4 ("Vouchers builder + management + Redemptions"
  per the baseline M-series), alongside the full offer engine.

### D3 - LOCKED: seed all categories (no Food/Beauty beta) + the level reconciliation
- Seed **all 11 top-level categories** with >=2 RMV templates each. Verified seed baseline
  (`prisma/seed-data/referencePhases.ts` ~444-527): **2 authored** (Food & Drink, Beauty & Wellness)
  + **4 GENERIC brand-contradicting placeholders** (Health & Fitness, Shopping, Out & About, Home &
  Local Services) + **5 with NONE** (Travel & Hotels, Health & Medical, Family & Kids, Auto & Garage,
  Pet Services). The 5 empty throw `NO_RMV_TEMPLATE` today; the 4 generic still need real authoring.
  So D3 = author proper templates across all 11 (keep/refine 2, replace 4 generic, create 5). Data/
  seed + frontend config; no schema. First-pass draft at
  `docs/superpowers/specs/2026-06-10-rmv-templates-9-categories.md`.
- **REVISED seed/config model (2026-06-20, after the type-choice decision):** no longer "2 fixed
  templates per category". Define, per category: the ELIGIBLE flagship types (a subset of the 5
  allowed), a recommended/default type, and a per-(category,type) `minimumSaving` floor + guidance +
  suggestion + curated-term config. Globally INELIGIBLE flagship types (Time limited, Reusable) + the
  disabled-card copy are config. `RmvTemplate` is reframed from "a fixed RMV to provision" into
  "per-(category,type) defaults + floor" (multiple rows per category; `@@unique([categoryId,title])`
  permits it) -> more seed rows, no schema. Suggestions + curated terms ride the frontend config map
  (prototype section 2B).
- **Backend provisioning reconciliation (no schema, M2.0):** replace auto-provision-2-fixed-RMVs with
  merchant-driven flagship creation. The merchant picks an eligible type -> the backend creates an RMV
  (`isRmv`/`isMandatory`, chosen `type`, optional `rmvTemplateId`) -> guided update (`merchantFields` +
  composed columns + terms) -> submit. Verified no-schema: `Voucher.type` settable, `rmvTemplateId`
  nullable, `merchantFields` Json, NO constraint requires a template (rmvTemplateId is only ever set,
  never required). `handleCategoryChange` must re-handle DRAFT flagships on a category change (eligible
  types differ per category). The submit checklist (2 `isRmv` in PENDING_APPROVAL/ACTIVE) is unchanged.
- **Reconciliation (no schema):** store the merchant's category identity at the **subcategory** level
  (`primaryCategoryId` = subcategory, so the customer descriptor "Indian Restaurant" composes
  correctly), but **resolve the top-level parent for RMV template lookup** (provisioning currently
  queries templates on the exact id with no parent-walk; templates live at top-level). This fixes a
  real live inconsistency: seed sets `primaryCategoryId` = subcategory + creates RMVs directly, while
  provisioning + the admin picker assume top-level.
- Per-category `minimumSaving` floors are a **commercial decision** - exact values flagged for
  owner/commercial review before final lock.

### D4 - LOCKED: Lean M2 business profile boundary
- **Tier 1 in M2 (no schema; relies on the D1 bypass + a small upload/presign enabler):** logo, cover/
  banner, business description, public website, registered-name/trading-name mapping
  (`businessName`=registered, `tradingName`=trading), company registration number, VAT registered
  Y/N + VAT number, plus the prototype helper copy + visual structure.
- **Tier 3 deferred to an M3 schema batch:** `businessType` (Sole trader/Ltd/Partnership/LLP/PLC/CIC/
  Charity), `charityNumber`, `UTR`, registered/head-office address (line1/2/town/county), distinct
  head-office phone/email, title (Mr/Mrs).
- **Tier 2:** position/jobTitle deferred to M3 (confirmed NOT needed for the M2 contract - D9 uses the
  minimal placeholder contract, no signatory personalisation). Values/highlights deferred to M3
  (small, identity-not-gated; the `MerchantTag`/`MerchantHighlight` write path that D5 would build
  makes a later add cheap). Cuisine/specialty/category identity -> resolved in D5.
- **Documents ("Verify your business sooner") OUT of M2** - a later merchant-documents milestone
  (model exists; merchant-side route is missing; admin-only B4 today).

### D5 - LOCKED: full category-identity capture (primary -> subcategory -> cuisine -> known-for -> label)
- M2 captures the full prototype chain. Storage on existing schema (no migration): `primaryCategoryId` =
  the selected SUBCATEGORY; cuisine via `primaryDescriptorTagId`; specialties via `MerchantTag`; maintain
  `MerchantCategory` (isPrimary). RMV provisioning resolves the subcategory to its TOP-LEVEL parent for
  template lookup (the D3 parent-walk reconciliation).
- New no-schema backend enablers: `GET /api/v1/merchant/onboarding/taxonomy` for the picker (NOT the
  customer categories endpoint, which supply-filters and is unsuitable) returning top-level categories
  (+ RMV-eligible flag) + full subcategories (NOT supply-filtered) + per-subcategory cuisine/specialty
  tags from `SubcategoryTag`; plus a merchant category/identity WRITE endpoint that saves the full chain
  and provisions RMVs via the parent-walk.
- Frontend mirrors the prototype: primary tiles, subcategory chips, cuisine chips (where relevant),
  known-for chips, generated label ("Indian Restaurant" / "Body Shop") via `buildDescriptor`.
- "Add your own" cuisine/specialty is DEFERRED (needs admin approval/tooling); M2 uses seeded tags only.

### D6 - LOCKED: guided staircase (the 6-step prototype setup model)
- M2 follows the prototype's 6-step guided setup: account / category / business profile / main branch /
  flagship vouchers / merchant agreement. The pre-live home is the "Get your business live" checklist
  hub with not-started / in-progress / done states, ordered progression, downstream locking where
  dependencies require, a gated "Submit for review", the "Nothing is public yet" reassurance, locked
  dashboard/insights teasers, and the documents card retained as a deferred/later surface (not M2).
- **Step state is CLIENT-DERIVED from saved data. No persisted onboarding-progress model, no schema.**
- **Hard dependency:** category must happen before flagship voucher setup (category + the eligible-type
  set + RMV creation depend on it).
- **Save nuance (per backend reality):** profile supports a TRUE partial save (`PATCH /profile`); the
  branch step CANNOT persist a half-branch until the minimum create fields exist (postcode etc.); each
  step defines what "Save and finish later" means against its backend constraints.

## 1A. Live prototype browse verification (2026-06-20, Playwright over the local export)

Drove the interactive prototype. Confirmed and corrected:
- **Pre-live home = the 6-step guided staircase** ("Get your business live", 5 of 6): account / category
  (Modern British Restaurant) / business profile / main branch / **vouchers (the incomplete step)** /
  merchant agreement, with a gated "Submit for review", "Nothing is public yet", locked dashboard +
  insights teasers, and the documents card. Confirms D6.
- **Flagship voucher builder** ("Set up vouchers" -> "Voucher 1 of 2, Step 1 of 2"): a TYPE PICKER
  (all 7 types, BOGO "Recommended") + a "How Redeemo vouchers work" primer (once-a-month rule; "you
  write the offer, we help keep it strong"; "our team can help, you approve before it goes live"); then
  Step 2 = the guided builder.

**CORRECTION / DIVERGENCE (flag; may reopen D2/D3 - owner to decide):** the prototype lets the merchant
**CHOOSE the flagship voucher type** ("Change voucher type" is present) and author 2 flagship vouchers of
chosen types. The current backend **pre-provisions 2 FIXED-type RMVs** from the category's RmvTemplates
(merchant edits `allowedFields` only; no type choice). My earlier framing ("merchant does not pick the
type") was WRONG against the prototype. Reconciliation (no schema, but a backend provisioning redesign):
make RMV creation type-flexible (merchant picks from an eligible-type set per category; the floor +
guidance come from a per-(category,type) config / template), or keep the fixed-type backend model and
reframe the picker. This also enlarges D3 seed work (a floor/guidance per eligible type per category).

**DIVERGENCE + CHOSEN DIRECTION (owner-decided 2026-06-20):** Prototype = the merchant chooses the
voucher type. Backend today = category templates pre-provision fixed-type RMVs. CHOSEN = follow the
prototype (merchant chooses from the 5 ELIGIBLE flagship types: BOGO, Spend & save, Discount, Freebie,
Package deal; Time limited + Reusable shown disabled-with-copy) and redesign the M2 provisioning flow
accordingly. Verified achievable WITHOUT schema (see D2/D3 revised + the M2.0 ledger). No migration.

**Builder details (all no-schema / Path A / frontend-config per prototype section 2B):**
- Structured per-type fields (buy item + full price; free item + value) -> `merchantFields` (Json) +
  compose the customer-visible `title`/`description`/`estimatedSaving`/`terms`.
- Category-driven suggestion chips + a demo-only "Preview suggestions as" category switcher.
- Curated TERMS picker: universal core + category-conditional + Caution/Restrictive badges + "Add your
  own term" -> a FRONTEND config map (section 2B: "suggestion AND term content is builder config, no
  schema"); chosen terms collapse into the `terms` column. The heavier `TermsClause` rules engine
  (conflicts / value-erosion / type-bans) stays M4.
- "Strong for you, fair for customers" guidance panel + a Too-weak / Good / Great score with "what is
  strong / what could make it better" -> a CLIENT-SIDE heuristic (saving %, title clarity, terms
  count/severity, description customised, photo present) + the `minimumSaving` floor. The "compares to
  similar businesses on Redeemo" framing is aspirational (no data dependency taken for M2).
- Photo upload on the voucher card (1200x600) -> presign (D7-adjacent).
- "Ask the Redeemo team to help with this offer" concierge co-build toggle ("you always approve before
  it goes live") -> the B5.1 admin co-build path; for M2 capture as a flag/request only, the admin
  co-build UI is gated (Phase-3, confirmation primitive).
- "Save as draft" + build 2 flagship vouchers; they submit together with the business for review.

## 2. Pending decisions (D7-D10)
- **D7:** logo/banner image upload (merchant presign endpoint + upload component) vs defer.
- **D8:** small backend quality enablers - server-side opening-hours validation; `minimumSaving` floor
  enforcement; merchant-facing changes-requested reason read.
- **D9:** contract - minimal placeholder clickwrap for M2 (real binding legal text + personalisation =
  launch gate / M3 schema) vs build personalised now. **Verified nuance:** the contract is NOT
  OWNER-role-gated in code today - `GET /onboarding/contract` + `POST /onboarding/contract/accept` are
  open to any authenticated merchant admin (the blueprint's "OWNER-only clickwrap" is aspirational, not
  enforced). In M2 the merchant has only the owner account (staff/multi-user is M3), so it is
  owner-in-practice; an explicit OWNER role-gate becomes meaningful when multi-user lands (M3). D9
  should state whether to add the gate now or defer.
- **D10:** frontend form/wizard architecture (react-hook-form + zod + stepper + select/combobox + toast
  + file-upload component) vs alternatives.

## 3. Prototype-vs-code cross-check table

Schema/Route legend: Y = supported now, N = not supported, P = partial.

### 3.1 Choose your category (Setup Step 2)
| Prototype field/control | Schema | Route | Decision | Impl type | Owner decision / status |
|---|---|---|---|---|---|
| Primary category (11 tiles) | Y | P | M2 | frontend + backend enabler + seed | D5; triggers RMV provisioning |
| Subcategory "best fits" | Y | N | M2 | frontend + backend enabler | becomes `primaryCategoryId` (subcategory) |
| Cuisine (multi, Food) | Y | N | M2 | backend enabler (no schema) | drives descriptor |
| "What you are known for" specialties | Y | N | M2 | backend enabler (no schema) | `SubcategoryTag`-scoped |
| "Add your own" cuisine/specialty | P (`Tag.createdBy`) | N | later | backend enabler + admin-tooling future | admin-approval-dependent |
| Generated customer-facing label | Y (`buildDescriptor`) | Y read-side | M2 | frontend | mirror for live preview |

### 3.2 Complete your business profile (Setup Step 3)
| Prototype field/control | Schema | Route | Decision | Impl type | Owner decision / status |
|---|---|---|---|---|---|
| Logo upload | Y (`logoUrl`) | P (sensitive; no presign) | M2 | backend enabler (D1+presign) + frontend | D4 Tier 1 |
| Cover/banner upload | Y (`bannerUrl`) | P (sensitive) | M2 | backend enabler + frontend | D4 Tier 1 |
| Business description | Y (`description`) | P (sensitive) | M2 | backend enabler (D1) + frontend | D4 Tier 1 |
| Head-office phone | N | N | M3 (or M2 read-only owner) | schema or map-to-owner | reuse owner recommended |
| Head-office email | N | N | M3 (or M2 read-only owner) | schema or map-to-owner | reuse owner recommended |
| Public website | Y (`websiteUrl`) | Y (DIRECT) | M2 | frontend | D4 Tier 1 |
| Branch phone/email per-branch note | n/a | n/a | M2 | frontend copy | - |
| Title (Mr/Mrs) | N | N | M3 (or omit) | schema or omit | Tier 3 |
| First name / Surname | Y (`MerchantAdmin`) | P (set at register; logged-in edit missing) | M2 read / M3 edit | frontend + backend enabler (edit=M3) | prefill |
| Position in business | Y (`MerchantAdmin.jobTitle?`) | N | M3 | backend enabler (small) | deferred (not needed for M2 contract) |
| Business type (7 UK) | N | N | M3 | schema migration | Tier 3 |
| Registered business name | Y (`businessName`) | P (sensitive -> D1) | M2 | frontend (label mapping) | D4 Tier 1 |
| Company registration number | Y (`companyNumber`) | Y (DIRECT) | M2 | frontend | conditional-required needs businessType (M3) |
| VAT registered Y/N + number | Y (`vatNumber`) | Y (DIRECT) | M2 | frontend | D4 Tier 1 |
| Registered/head-office address | N | N | M3 | schema migration | main branch address substitutes for M2 |
| Verify-your-business document upload | Y (`MerchantDocument`) | N merchant-side (admin-only B4) | OUT of M2 -> later | backend enabler (mirror B4) + frontend | closed scope; optional, not gated |
| Your values (Independent/Family-Run/...) | P (`MerchantHighlight`; 2 tags need seed) | N | M3 (deferred) | backend enabler (no schema) + seed | D4: deferred unless tiny |
| "Add your own" value | P (`Tag.createdBy`) | N | later | backend enabler + admin-tooling future | admin-approval-dependent |

### 3.3 Vouchers / RMV (Setup step)
| Prototype element | Schema | Route | Decision | Impl type | Status |
|---|---|---|---|---|---|
| 2 mandatory RMV configure + submit | Y (`Voucher` isRmv; `updateRmvVoucher`/`submitRmvVoucher`) | Y | M2 | frontend (guided builder) + seed (allowedFields) | D2 |
| RMV expiry date input | Y (`expiryDate`; in `allowedFields`) | Y | REMOVE for M2 | seed (`allowedFields`) + frontend | D2 mismatch fix |
| Category-aware suggestion chips/terms | n/a (config) | n/a | M2 | frontend config map | D2/§2B, no schema |
| weak/good/great scoring | Y (`RmvTemplate.minimumSaving`) | Y | M2 (basic) | frontend + (D8) floor enforce | rich margin model = Phase 3 |
| Curated `TermsClause` library | N | N | M4/Phase-3 | schema migration | offer engine, deferred |
| Custom voucher (RCV) builder | Y (`createVoucher`) | Y | M4 | deferred | not in M2 |

### 3.4 Contract + submit
| Prototype element | Schema | Route | Decision | Impl type | Status |
|---|---|---|---|---|---|
| Contract read + clickwrap accept | Y (`MerchantContract`, v1.0) | Y (`/onboarding/contract[/accept]`) | M2 | frontend | D9 (placeholder text) |
| Personalised/comprehensive agreement | N (needs businessType/address/signatory) | N | M3+/legal | schema + legal sign-off | launch gate |
| Submit for approval | Y | Y (`/onboarding/submit`) | M2 | frontend | 3-gate; resubmit handled |
| Changes-requested reason to merchant | Y (`AdminApproval.comment`) | N merchant-side | M2 (D8) | backend enabler (read) | small |

## 4. M2.0 backend-enabler ledger (no schema; report-first; mostly small, item 12 is a provisioning redesign)
1. D1 profile sensitive-field draft-window bypass.
2. D1 branch sensitive-edit draft-window bypass (+ postcode re-resolution).
3. RMV parent-walk reconciliation (resolve subcategory -> top-level for template/eligibility lookup;
   drives the eligible-type set + the per-(category,type) floor for the chosen flagship type).
4. Merchant taxonomy READ endpoint for the onboarding picker (hierarchy + `SubcategoryTag` tags, NOT
   supply-filtered) - pending D5. Why a NEW endpoint and not the customer `GET /categories`: that one
   supply-filters subcategories to >=1 ACTIVE merchant UK-wide (`listActiveCategories`), so it hides
   categories/subcategories with no merchants yet - wrong for onboarding, where the merchant is often
   the first in their category. The picker must show the FULL taxonomy regardless of supply.
5. Merchant category/identity WRITE (primaryCategoryId=subcategory + primaryDescriptorTag + MerchantTag
   + MerchantCategory) - pending D5.
6. Logo/banner presign upload endpoint - pending D7.
7. Server-side opening-hours validation - pending D8.
8. `minimumSaving` floor enforcement (keys on the chosen-(category,type) floor) - pending D8.
9. Merchant-facing changes-requested reason read - pending D8.
10. REVISED RMV seed/config (data, not schema): per category, the eligible flagship types +
    recommended/default + per-(category,type) `minimumSaving` floor + guidance + suggestions +
    curated-terms config; the global ineligible list (Time limited, Reusable) + disabled-card copy;
    drop `expiryDate` from `allowedFields`. `RmvTemplate` reframed to per-(category,type) defaults+floor
    (multiple rows per category).
11. Seed adds: `Family-Run`, `Locally Sourced` value tags (only if values land in M2; currently M3).
12. **RMV-creation redesign (no schema; the one larger item):** replace auto-provision-2-fixed with
    merchant-choose-eligible-type -> create RMV (`isRmv`/`isMandatory`, chosen `type`, optional
    `rmvTemplateId`) -> guided update (`merchantFields` + composed columns + terms) -> submit.
    Supersedes the current `provisionRmvVouchers` / `setMerchantCategoryCore` auto-provisioning.
13. `handleCategoryChange` re-handle DRAFT flagships on a category change (eligible types differ per
    category) - no schema.

## 5. Deferred prototype items (with reason)
| Item | Reason | Target |
|---|---|---|
| businessType + charityNumber + UTR + conditional validation | schema | M3 batch |
| Registered/head-office address fields | schema (no `Merchant` address) | M3 batch |
| Distinct head-office phone/email | schema (only owner contact exists) | M3 (or reuse owner in M2) |
| Title (Mr/Mrs) | schema (not on `MerchantAdmin`) | M3 / omit |
| Position/jobTitle | backend route missing; not needed for M2 contract | M3 |
| Your values / highlights | backend route missing (no schema) + 2 seed tags | M3 (cheap if D5 builds tag-write) |
| Document upload ("Verify sooner") | merchant-side route missing (admin-only B4); closed scope | later merchant-documents milestone |
| "Add your own" cuisine/specialty/value | needs admin approval flow (admin panel) | later admin-dependent milestone |
| Custom voucher (RCV) builder | scope; bonus tier, not submit-gated | M4 |
| Curated `TermsClause` clause library + rules engine + calibration margin model | schema + heavyweight | M4 / Phase-3 offer engine |
| Admin-managed RMV template/suggestion CRUD | needs config schema + admin UI | Phase-3 fast-follow |
| Admin-panel voucher-scoring alignment (actioner sees Too-weak/Good/Great when approving / requesting changes / rejecting) | future enhancement; M2 builds the merchant-side score, admin reuse not required for M2 unless already cheap | admin-panel / later |
| Day-2 edit tiering (live-state sensitive edits) | live-state concern, not onboarding | M3 |
| Personalised/comprehensive contract + real binding legal text | schema + legal sign-off | launch gate |

## 6. M-series placement (for reference)
M0 scaffold (done) · M1 auth+entry (done) · **M2 onboarding (this)** · M3 day-2 Business profile +
Branches + Staff + the schema batch (businessType/identifiers, address, capabilities, account caps,
three-tier attribute move) · M4 Vouchers builder + management (custom RCV + offer engine) + Redemptions.
