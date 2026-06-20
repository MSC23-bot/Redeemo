# Merchant Portal M2 (Onboarding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to execute this
> plan slice-by-slice with a fresh implementer per slice and a fresh review agent per checkpoint. Steps use
> checkbox (`- [ ]`) syntax for tracking. Do NOT begin implementation until the owner explicitly approves.

**Goal:** Build the M2 merchant onboarding journey in `apps/merchant-web` (authenticated entry -> ready-to-
submit-for-approval) on the already-shipped backend, plus a small set of no-schema backend enablers and an RMV
seed/config reframe.

**Architecture:** A guided 6-step onboarding wizard (react-hook-form + zod) on the M1 BFF-lite session, calling
existing merchant endpoints plus the M2.0 enablers; the voucher builder is the largest surface (merchant
chooses an eligible flagship type, guided fields/suggestions/curated-terms/scoring/preview). No schema
migration (verified in the spec section 8; the no-schema watch stays active here).

**Tech stack:** Next 15 App Router, Tailwind 4, React Query, zod, shadcn, react-hook-form (+ @hookform/resolvers,
new), the M1 httpOnly BFF session; backend Node 24 + Fastify + Prisma 7 + Neon; R2 via `src/api/shared/storage.ts`.

**Source of truth:** the M2 design spec `docs/superpowers/specs/2026-06-20-merchant-web-m2-onboarding-design.md`
(commit 7d54b06). The checkpoint `...-m2-onboarding-checkpoint.md` is historical context. The Claude Design
prototype (local export `docs/design/merchant-portal/prototype-handoff/Redeemo-for-Business-Merchant-Portal-handoff.zip`,
served over localhost; `file://` blocked) is a first-class source of truth alongside live code/schema.

---

## Execution model (subagent-driven development)

**Per-slice loop:**
1. The controller dispatches a FRESH implementer subagent with: the slice's full text from this plan, the
   relevant spec sections, and the exact files. The implementer follows TDD (write the failing test, run it,
   implement minimal code, pass, commit) and does NOT self-certify.
2. After the implementer reports DONE, the controller dispatches a FRESH review agent (the implementer never
   reviews its own work). The review agent compares the slice's diff against: the final M2 spec; this plan; the
   historical checkpoint where relevant; the Claude Design prototype/export; live code/schema; the closed-scope
   exclusions; and the deferred-items list. The review is read-only and adversarial.
3. The implementer fixes review findings; re-review until clean. Only then mark the slice complete.

**Stop-and-report triggers (the implementer or reviewer MUST halt and report, never work around):**
- Any schema/migration need (report exact proposed SQL + rollback; do NOT create/run it).
- Any backend API contract drift (a route/shape change beyond the slice's stated enabler).
- Any prototype mismatch (behaviour/fields/copy/scoring that the spec did not anticipate).
- Any security concern (auth/scope/leak/CSRF/upload-abuse).
- Any scope expansion beyond the slice (incl. touching closed-scope or deferred areas).

**Scope guard (every PR):** server-verify `gh api compare` before merge. Frontend slices are confined to
`apps/merchant-web/**`. Backend slices are confined to `src/api/**` + `prisma/seed*` / `prisma/seed-data/**` +
`tests/**` (no schema files). No change outside the slice's stated files without a reported reason.

**CI expectations (every PR):** the `merchant-web` CI job (typecheck / lint / build / jest) gates frontend
slices; the `backend` CI job (`tsc --noEmit` + `npm run test:unit`) gates backend slices. Both must be green;
server-verify the live run before merge; SHA-bind the merge (`REDEEMO_PR_SCOPE_VERIFIED=<head-sha>`).

**Closed scope (do NOT build in any M2 slice):** M3 fields (businessType / charity / UTR / address / head-office
contact / title / position / values), merchant document upload, custom (RCV) voucher CRUD, the TermsClause rules
engine, admin template CRUD, admin-panel scoring UI, platform-wide auth/session changes, admin-web/customer-web,
customer-app, unrelated cleanup.

**No-schema watch (active throughout):** the spec section 8 verified no schema. If any slice (especially B2/B3)
discovers a schema need, STOP and report exact SQL + rollback before proceeding.

---

## Slice sequencing

| Slice | Type | Depends on | PR |
|---|---|---|---|
| S0 | Prototype verbatim extraction (no code; produces a config-data doc) | spec | docs-only PR |
| B1 | D1 draft-window sensitive-field bypass (profile + branch) | - | backend PR |
| B2 | Taxonomy READ + category/identity WRITE + parent-walk | - | backend PR |
| B3 | RMV-creation redesign + RMV seed reframe (the larger item; no-schema watch) | B2, S0 | backend PR |
| B4 | Opening-hours validation + saving sanity + changes-reason read | - | backend PR |
| B5 | Server-proxied image upload (logo/banner/voucher photo) | - | backend PR |
| F0 | Frontend deps + local primitives (stepper, file-upload, toast) | B5 | frontend PR |
| F1 | Onboarding shell / staircase hub + lifecycle homes | F0, B4 | frontend PR |
| F2 | Category + identity step | F1, B2, S0 | frontend PR |
| F3 | Business profile step (Tier-1) | F1, B1, B5 | frontend PR |
| F4 | Branch step | F1, B1, B4, B5 | frontend PR |
| F5 | Flagship voucher builder (largest; may sub-split 5a/5b) | F1, B3, S0 | frontend PR(s) |
| F6 | Contract + submit + lifecycle wiring | F1, B4 | frontend PR |

Backend slices land first (each its own plan-first PR off updated main). Frontend slices consume them. S0 is a
hard prerequisite for B3 (seed) and F5 (builder).

---

## Slice S0: Prototype verbatim extraction (no code)

**Files:**
- Create: `docs/superpowers/specs/2026-06-20-merchant-web-m2-voucher-builder-extraction.md` (the config-data artifact)
- Source: the prototype export `Redeemo for Business.dc.html` (Playwright over localhost + grep the bundled config)

- [ ] **Step 1: Extract, verbatim, into the artifact doc:**
  - per-category suggestion chip lists (buy item / free item / discount-target / spend-save / package), per type
  - the universal CORE terms + the category-conditional terms, each with its Fair / Caution / Restrictive tag
  - per-type field labels + help copy for the 5 eligible types (BOGO, Spend & save, Discount, Freebie, Package)
  - exact scoring thresholds (absolute GBP floors per type, relative % per type, the term-stacking thresholds,
    the title / description / photo rules, the Too-weak / Good / Great tier rules)
  - the category / subcategory / type dependencies (which suggestions/terms apply where)
  - the title + description auto-compose rules per type (how "You decide" fields compose the customer copy)
- [ ] **Step 2: Cross-check the extracted values against the spec sections 5.2-5.5 + checkpoint 1B;** flag any
  delta. If extraction reveals a dependency requiring schema or a backend contract not in the spec, STOP and report.
- [ ] **Step 3: Commit the artifact** (docs-only). This doc is consumed verbatim by B3 (seed floors/defaults) and
  F5 (the frontend suggestion/terms/scoring config map).

**Verification:** the artifact contains every bullet above with verbatim values; reviewer confirms against the
live prototype via Playwright. **Gate:** S0 must be committed before B3 and F5 start.

---

## Backend slice B1: D1 draft-window sensitive-field bypass

**Files:**
- Modify: `src/api/merchant/profile/service.ts` (the `updateMerchantProfile` sensitive-field gate)
- Modify: `src/api/merchant/branch/service.ts` (the branch sensitive-edit path + postcode re-resolution)
- Test: `tests/api/merchant/profile.*.test.ts`, `tests/api/merchant/branch/*.test.ts`

- [ ] **Step 1: Failing tests.** Draft window (status REGISTERED, or onboardingStep NEEDS_CHANGES) -> direct
  write of `businessName`/`tradingName`/`logoUrl`/`bannerUrl`/`description` succeeds (no edit-request row). Live
  (ACTIVE) -> the same fields still route to the edit-request lane. Branch: a sensitive branch edit in the draft
  window writes directly AND re-resolves location when `postcode` changes; when live, it still routes to
  `BranchPendingEdit`.
- [ ] **Step 2: Run tests, confirm they fail.**
- [ ] **Step 3: Implement** a single lifecycle predicate `isDraftWindow(merchant)` (REGISTERED or NEEDS_CHANGES)
  in profile + branch services; in the draft window, write sensitive fields directly (branch: reuse
  `resolveBranchLocationFields` on postcode change); otherwise keep the current edit-request behaviour. Shape the
  predicate cleanly so the day-2 `description`-instant refinement is easy later (do NOT build day-2 tiering).
- [ ] **Step 4: Run tests, confirm pass.**
- [ ] **Step 5: Commit.**

**Verification:** `npx vitest run tests/api/merchant && npx tsc --noEmit`. **Scope guard:** profile + branch
services + tests only. **Rollback:** revert the predicate (restore unconditional sensitive rejection).
**Stop-and-report:** if the predicate cannot be derived without schema. **Review checkpoint** after the slice.

---

## Backend slice B2: Taxonomy READ + category/identity WRITE + parent-walk

**Files:**
- Modify/Create: `src/api/merchant/onboarding/{routes,service}.ts` (new `GET /api/v1/merchant/onboarding/taxonomy`)
- Modify: `src/api/merchant/profile/service.ts` (`setMerchantCategoryCore` -> identity write + parent-walk)
- Models (read/write, all existing): `Category`, `Tag`, `SubcategoryTag`, `Merchant.primaryCategoryId` +
  `primaryDescriptorTagId`, `MerchantCategory`, `MerchantTag`
- Test: `tests/api/merchant/*` (taxonomy + profile)

- [ ] **Step 1: Failing tests.** Taxonomy read returns active top-level categories (+ an RMV-eligible flag from
  the per-(category,type) templates) + their FULL subcategory list (NOT supply-filtered) + per-subcategory
  cuisine/specialty tags from `SubcategoryTag`. Identity write sets `primaryCategoryId` = the SUBCATEGORY +
  `primaryDescriptorTagId` (cuisine) + `MerchantTag` (specialties) + `MerchantCategory(isPrimary)`. A
  parent-walk helper resolves a subcategory -> its top-level parent for template/eligibility lookup.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the taxonomy read (reads existing tables; explicitly NOT the supply-filtered customer
  `listActiveCategories`) + the identity write (transactional) + the parent-walk helper. Coordinate the
  `setMerchantCategoryCore` change with B3 (B3 removes the auto-provisioning from this path).
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit.**

**Verification:** `npx vitest run tests/api/merchant && npx tsc --noEmit`. **Scope guard:** merchant onboarding +
profile services/routes + tests. **Rollback:** revert the new endpoint + identity-write additions.
**Stop-and-report:** if storing the identity needs a schema change (it should not; models exist). **Review.**

---

## Backend slice B3: RMV-creation redesign + RMV seed reframe (NO-SCHEMA WATCH)

**Files:**
- Modify: `src/api/merchant/voucher/service.ts` (replace `provisionRmvVouchers` auto-2 with a
  create-flagship-of-chosen-eligible-type that links the RMV to the per-(category,type) template; adjust
  `handleCategoryChange` to discard DRAFT flagships + let the merchant re-pick, keeping `CATEGORY_CHANGE_BLOCKED`)
- Modify: `src/api/merchant/profile/service.ts` (`setMerchantCategoryCore` no longer auto-provisions on category-set)
- Modify: `src/api/merchant/voucher/routes.ts` (a create-flagship route taking the chosen eligible type)
- Modify: `prisma/seed-data/referencePhases.ts` (`seedRmvTemplates` -> a `RmvTemplate` per (category, eligible
  flagship type) for ALL 11 categories; expanded `allowedFields`; DROP `expiryDate`; per-(category,type)
  `minimumSaving` floors from S0). DATA only, no schema.
- Models (all existing): `Voucher` (`type`, `isRmv`, `isMandatory`, `rmvTemplateId`, `merchantFields`, composed
  columns), `RmvTemplate`
- Test: `tests/api/merchant/voucher/*`, regression over `tests/api/admin/*` (actioner) + the B5.1 RMV-edit tests

- [ ] **Step 1: RE-CONFIRM no schema** (spec section 8): `Voucher.type` settable, `rmvTemplateId` nullable,
  `merchantFields` Json, no constraint requires a template; `updateRmvVoucherCore` needs a LINKED template for
  `allowedFields` (so the create MUST link to the chosen-type template); the admin actioner + checklist are
  generic over `isRmv`. If anything here is not as the spec states, STOP and report exact SQL + rollback.
- [ ] **Step 2: Failing tests.** Create-flagship: a chosen eligible type creates one RMV linked to the
  category's per-(category,type) template (`rmvTemplateId` set, defaults from the template); an ineligible type
  (Time limited / Reusable) is rejected; `updateRmvVoucher` `allowedFields` still work on the created RMV;
  `submitRmvVoucher` flips DRAFT -> PENDING_APPROVAL; the onboarding checklist counts 2; category-set no longer
  auto-provisions; `handleCategoryChange` discards DRAFT flagships + lets re-pick + still blocks when a flagship
  is submitted. Regression: the admin `approveApproval` activates the merchant-authored RMVs; `getReviewContext`
  reads them; B5.1 `updateRmvVoucherCore`/`submitRmvVoucherCore` unchanged. Seed test: every category yields >=2
  active eligible-type templates.
- [ ] **Step 3: Run, confirm fail.**
- [ ] **Step 4: Implement** the create-flagship path (link to the chosen-type template), the
  `setMerchantCategoryCore` no-auto-provision, the `handleCategoryChange` rework, and the seed reframe (S0 floors).
- [ ] **Step 5: Run the FULL backend unit suite** (`npm run test:unit`) to catch actioner / B5.1 regressions;
  confirm green.
- [ ] **Step 6: Commit.**

**Verification:** `npx prisma generate && npx tsc --noEmit && npm run test:unit`; a seed dry-run asserting 11
categories x >=2 eligible-type templates. **Scope guard:** merchant voucher/profile services+routes + the seed
data + tests (NO schema files). **Rollback:** revert to `provisionRmvVouchers` auto-2 + the prior seed.
**Stop-and-report:** any schema need surfaced by the create-flagship or the seed reframe. **Review** (the
heaviest checkpoint: explicitly diff the actioner + B5.1 behaviour).

---

## Backend slice B4: hours validation + saving sanity + changes-reason read

**Files:**
- Modify: `src/api/merchant/branch/service.ts` (`setOpeningHours` validation)
- Modify: `src/api/merchant/voucher/service.ts` (light present/positive saving sanity on save; NO hard floor)
- Modify/Create: `src/api/merchant/onboarding/{routes,service}.ts` (a merchant read of the OWN onboarding
  `AdminApproval.comment` + status)
- Test: `tests/api/merchant/branch/*`, `tests/api/merchant/voucher/*`, `tests/api/merchant/onboarding*`

- [ ] **Step 1: Failing tests.** Hours: overlapping periods / unordered / bad `24:00` / close-before-open /
  closed-day-with-periods are rejected; well-formed hours (incl. Open 24h + an overnight close) pass. Saving
  sanity: zero/negative saving rejected; a below-ideal-floor-but-positive saving is ACCEPTED (advisory only, not
  a gate). Changes-reason: a merchant reads the reason/items + status for THEIR OWN onboarding approval; cannot
  read another merchant's.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** (hours validator client+server-shareable shape; the saving sanity; the scoped
  changes-reason read).
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit.**

**Verification:** `npx vitest run tests/api/merchant && npx tsc --noEmit`. **Scope guard:** the three services +
tests. **Rollback:** revert each independently. **Stop-and-report:** if the changes-reason needs more than
reading the existing `AdminApproval.comment`. **Review.**

---

## Backend slice B5: server-proxied image upload

**Files:**
- Create: a merchant image-upload route + service (mirror `src/api/admin/merchants/documents.ts` `putObject`
  pattern) for logo / banner / voucher photo
- Modify (if needed): `src/api/shared/storage.ts` (`KIND_POLICIES` public-image kind, code/config only)
- Test: `tests/api/merchant/*` upload tests

- [ ] **Step 1: Failing tests.** Server-proxied upload validates content-type (PNG/JPG) + size + dimensions
  (logo square >=512 <=2MB; banner landscape >=1600x600 <=5MB; voucher photo landscape >=1200x600 <=5MB);
  rejects oversized / wrong-type / wrong-dimension; honours `STORAGE_ENABLED`; returns a public URL; merchant
  DOCUMENT upload is NOT added.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the server-proxied upload (reuse `storage.ts` `putObject`; add a public-image kind if
  needed). Do NOT switch to presigned client upload unless live code proves server-proxied is not viable (then
  stop/report).
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit.**

**Verification:** `npx vitest run tests/api/merchant && npx tsc --noEmit`. **Scope guard:** the upload route +
service + storage const + tests. **Rollback:** revert the route + the kind const. **Stop-and-report:** any
schema need (none expected). **Review.**

---

## Frontend slice F0: deps + local primitives

**Files:**
- Modify: `apps/merchant-web/package.json` (add `react-hook-form`, `@hookform/resolvers`); root `package-lock.json`
- Create: `apps/merchant-web/components/ui/{stepper,file-upload,toast}.tsx` (local primitives) + their tests
- Test: `apps/merchant-web/components/ui/__tests__/*`

- [ ] **Step 1: Failing tests** for the stepper (states/active), file-upload (selects + posts to the B5 route,
  client-side type/size pre-check), and toast (shows/auto-dismiss).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the deps + the three primitives (the file-upload calls the B5 server-proxied route).
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit.**

**Verification:** `cd apps/merchant-web && npx tsc --noEmit && npm run lint && npx jest --forceExit && npm run build`.
**Scope guard:** `apps/merchant-web/**` + the root lockfile. **CI:** the merchant-web job. **Review.**

---

## Frontend slice F1: onboarding shell / staircase hub + lifecycle homes

**Files:**
- Modify: `apps/merchant-web/app/(app)/page.tsx` (replace the M1 placeholder home with the staircase hub)
- Create: `apps/merchant-web/components/onboarding/{StepList,StaircaseHub,LifecycleHome}.tsx` + lib
- Create: `apps/merchant-web/lib/api/onboarding.ts` (checklist + the B4 changes-reason read) + step-state derivation
- Test: the home + step-state + lifecycle-home suites

- [ ] **Step 1: Failing tests.** The hub renders the 6 steps with not-started / in-progress / done derived
  client-side from checklist + profile + category + branch count + RMV count + contractStatus; downstream steps
  lock until prerequisites are done; Submit is disabled until `all_complete`; the lifecycle homes render for
  SUBMITTED / UNDER_REVIEW / NEEDS_CHANGES (with the reason) / REJECTED / SUSPENDED.
- [ ] **Step 2-4: Fail -> implement -> pass.**
- [ ] **Step 5: Commit.**

**Verification:** merchant-web tsc + lint + jest + build. **Scope guard:** `apps/merchant-web/**`. **Review.**

---

## Frontend slice F2: category + identity step

**Files:**
- Create: `apps/merchant-web/app/(app)/onboarding/category/page.tsx` + `components/onboarding/category/*`
- Create: `apps/merchant-web/lib/api/taxonomy.ts` (consumes B2 read + identity write)
- Test: the category-step suite

- [ ] **Step 1: Failing tests.** Primary tiles -> subcategory (single) -> cuisine (multi, food-serving only) ->
  known-for (multi) -> a live generated label mirroring `buildDescriptor`; "Add your own" is absent (deferred);
  save writes the identity (subcategory `primaryCategoryId` + descriptor + tags) via B2; the step gates the
  vouchers step (hard dependency).
- [ ] **Step 2-4: Fail -> implement -> pass.** [ ] **Step 5: Commit.**

**Verification:** merchant-web gate. **Scope guard:** `apps/merchant-web/**`. **Review** (compare the chip/label
behaviour to the prototype). **Depends on S0 + B2.**

---

## Frontend slice F3: business profile step (Tier-1)

**Files:**
- Create: `apps/merchant-web/app/(app)/onboarding/profile/page.tsx` + `components/onboarding/profile/*`
- Modify: `apps/merchant-web/lib/api/profile.ts` (PATCH direct fields + the B1 draft-window sensitive writes; B5 upload)
- Test: the profile-step suite

- [ ] **Step 1: Failing tests.** rhf+zod form for logo + banner (B5 upload) + description + website + registered/
  trading name + company number + VAT Y/N + number; true partial save ("Save and finish later"); Tier-3 fields
  (businessType / address / etc.) are ABSENT (closed scope); sensitive fields save directly in the draft window.
- [ ] **Step 2-4 -> Step 5: Commit.**

**Verification:** merchant-web gate. **Scope guard:** `apps/merchant-web/**`. **Review.** **Depends on B1 + B5.**

---

## Frontend slice F4: branch step

**Files:**
- Create: `apps/merchant-web/app/(app)/onboarding/branch/page.tsx` + `components/onboarding/branch/*`
- Create: `apps/merchant-web/lib/api/branch.ts` (create + hours + amenities + PIN; B1 edit bypass; B5 photos)
- Test: the branch-step suite

- [ ] **Step 1: Failing tests.** Create main branch (full fields); opening-hours field array with client+server
  validation (B4); amenities; PIN view/set; "Save and finish later" persists only once the create-minimum exists;
  no staff/multi-user UI (closed scope); branch photos via B5.
- [ ] **Step 2-4 -> Step 5: Commit.**

**Verification:** merchant-web gate. **Scope guard:** `apps/merchant-web/**`. **Review.** **Depends on B1 + B4 + B5.**

---

## Frontend slice F5: flagship voucher builder (largest; sub-split 5a/5b at implementation)

**Files:**
- Create: `apps/merchant-web/app/(app)/onboarding/vouchers/*` + `components/onboarding/voucher-builder/*`
- Create: `apps/merchant-web/lib/api/voucher.ts` (consumes B3 create-flagship + update + submit)
- Create: `apps/merchant-web/lib/onboarding/voucher-config.ts` (the suggestion/terms/scoring config map, authored
  VERBATIM from the S0 extraction artifact)
- Test: the builder suites (type picker, per-type fields, suggestions, terms, scoring, auto-compose, preview)

- [ ] **5a Step 1: Failing tests.** Type picker shows all 7; the 5 eligible are selectable (BOGO recommended);
  Time limited + Reusable are disabled cards with the helper copy; choosing an eligible type + Continue creates a
  flagship (B3) linked to its template; per-type "You decide" structured fields render; category-driven
  suggestion chips populate from the config map.
- [ ] **5a Steps 2-4 -> commit.**
- [ ] **5b Step 1: Failing tests.** Title/description auto-compose from the structured fields; the curated terms
  picker (universal core + category-conditional, Fair/Caution/Restrictive badges) + add-your-own; the
  Too-weak/Good/Great scoring computed client-side from the S0 thresholds (generosity never punished; terms
  cleanliness; title/description/photo; the tier rules); the live customer-app preview (Path A); the "Ask the
  Redeemo team to help" toggle (flag only); "Save as draft"; submit each flagship; the score is advisory (a
  too-weak offer can still submit; admin backstop).
- [ ] **5b Steps 2-4 -> commit.**

**Verification:** merchant-web gate; the scoring tests assert the exact S0 thresholds. **Scope guard:**
`apps/merchant-web/**`. **Review** (the critical checkpoint: compare the builder behaviour, scoring, suggestions,
terms, and copy against the prototype via Playwright). **Depends on S0 + B3.**

---

## Frontend slice F6: contract + submit + lifecycle wiring

**Files:**
- Create: `apps/merchant-web/app/(app)/onboarding/contract/page.tsx` + the ready-to-submit review
- Modify: `apps/merchant-web/lib/api/onboarding.ts` (contract read/accept + submit + the B4 changes-reason)
- Test: the contract + submit + NEEDS_CHANGES suites

- [ ] **Step 1: Failing tests.** Contract read -> click-to-agree -> accept (signed state + date + version);
  re-accept on version drift; ready-to-submit review reflects the 3-gate checklist; Submit calls
  `/onboarding/submit` and transitions to the submitted home; NEEDS_CHANGES shows the admin reason (B4); resubmit
  works. Contract step framed "owner only" (owner-by-absence; no code gate added).
- [ ] **Step 2-4 -> Step 5: Commit.**

**Verification:** merchant-web gate. **Scope guard:** `apps/merchant-web/**`. **Review.** **Depends on B4.**

---

## Deferred items (NOT in any M2 slice; tracked for M3+)

businessType / charity / UTR / address / head-office phone+email / title / position; "Your values" highlights;
merchant document upload ("Verify your business sooner"); "Add your own" cuisine/specialty/value (admin approval);
custom (RCV) voucher builder (M4); the TermsClause rules engine (M4); admin-managed RMV template/suggestion CRUD;
admin-panel voucher-scoring alignment; the personalised/comprehensive contract + real binding legal text (M3 +
launch gate); the OWNER role-gate on the contract routes (required M3 security follow-up when multi-user lands);
day-2 edit tiering. See spec section 12.

## Rollback notes

Each slice is an independent PR and reverts cleanly: B1 (restore unconditional sensitive rejection), B2 (drop the
endpoint + identity write), B3 (restore `provisionRmvVouchers` auto-2 + the prior seed; the largest revert -
keep it a single coherent commit set), B4 (revert each of the three), B5 (drop the route + kind const), F0-F6
(frontend reverts; no data). No migrations, so no DB rollback. The RMV seed reframe is idempotent (re-runnable);
note the seed is re-applied on `prisma db seed`.

## CI expectations

Backend slices: `npx tsc --noEmit` + `npm run test:unit` (the `backend` CI job); B3 additionally runs the full
unit suite for actioner/B5.1 regressions. Frontend slices: the `merchant-web` CI job (typecheck / lint / build /
jest). Every PR: server-verify the live `gh api compare` for scope; SHA-bound merge. The first push not
triggering CI is a known GitHub miss-trigger -> close/reopen the PR to retrigger (do not treat the cancelled run
as a failure).

## Adversarial review checkpoints

A fresh review agent after EACH slice (the implementer never self-certifies), comparing the diff against: the M2
spec; this plan; the checkpoint (historical); the prototype/export (Playwright); live code/schema; the
closed-scope exclusions; the deferred-items list. Heaviest reviews: B3 (actioner + B5.1 regression + the
no-schema watch) and F5 (builder behaviour/scoring/terms/copy vs the prototype). Any schema need / contract drift
/ prototype mismatch / security concern / scope expansion stops and reports.

---

## Self-review (plan vs spec)

- Spec section 4 steps -> F1 (hub + lifecycle), F2 (category), F3 (profile), F4 (branch), F5 (vouchers), F6
  (contract + submit). Covered.
- Spec section 5 builder -> F5 (+ S0 extraction + B3 backend + the config map). Covered.
- Spec section 6 M2.0 enablers -> B1 (items 1-2), B2 (items 3-5), B3 (item 11 + seed item 10), B4 (items 7-9),
  B5 (item 6). Covered.
- Spec section 7 data/config -> S0 (extraction) + B3 (seed) + F5 (frontend config map). Covered.
- Spec section 8 no-schema watch -> the active watch + B3 Step 1 re-confirmation + the stop-and-report gates.
  Covered.
- Spec section 9 verbatim-extraction task -> S0. Covered.
- Spec sections 12/13 deferred + closed-scope -> the closed-scope guard + the deferred-items section + per-slice
  reviewer checks. Covered.
- Spec section 15 test/verification -> the per-slice TDD + verification commands + CI. Covered.
- No placeholders; no schema; all slices have files / TDD / verification / scope guard / rollback / review.
