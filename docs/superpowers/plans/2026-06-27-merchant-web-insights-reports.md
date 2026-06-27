# Merchant Portal Insights & Reports - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Each PR slice is owner-gated and SHA-bound; do not start a slice without explicit owner approval, and do not merge without the live pre-merge gate (section "SHA-bound PR gates").**

**Goal:** Build the Merchant Portal "Insights & Reports" module (M5) - a logged-primary dual-layer analytics surface (KPIs, trend, five tabs, two reports, global filters) - faithfully to the approved umbrella spec, with the demographic slice held non-executable behind the legal/governance gate.

**Architecture:** One new backend module `src/api/merchant/insights/**` exposing read-only aggregation endpoints driven by a single shared aggregation service (owns cleanliness, dual-layer split, London bucketing, branch-scope, suppression hooks); one new merchant-web surface `apps/merchant-web/app/(app)/insights/**` + `components/insights/**` + `lib/api/insights.ts` consuming it. Behavioural analytics + the event-level export sit behind a non-bypassable, server-side, default-off runtime gate. Demographics are a separate, gated, non-executable future slice.

**Tech Stack:** Node 24 + Fastify 5 + Prisma 7 (Neon Postgres 16) backend; Next 15 + React + Tailwind 4 (CSS tokens in `globals.css`) merchant-web; vitest (backend) + jest (merchant-web). No charting library exists yet (greenfield decision in PR-B). No PDF/csv-stringify (CSV hand-rolled; report is printable HTML).

**Spec (source of truth):** `docs/superpowers/specs/2026-06-27-merchant-web-insights-reports-design.md` (on `main` @ `15ff9fef`). This plan does not re-decide anything locked there (Decisions 1-15 + the counting model); it sequences the build.

---

## 0. Programme shape, PR stacking, and merge order

Seven owner-gated slices. **Build order and gating:**

| Slice | Builds | Depends on | May start | Real-data release gated by |
|---|---|---|---|---|
| **PR-0a** Governance & qualified review (NO code) | DPIA, lawful-basis record, identifiability assessment, merchant-role determination, retention/erasure model, suppression-threshold + anti-inference policy, the **bounded behavioural review** | spec merged | now | n/a (produces gate decisions) |
| **Approved legal artefacts** (counsel/owner authored, NOT this plan) | revised privacy/FAQ/consent/merchant-terms copy + `/merchant-terms` content, signed off | PR-0a | after PR-0a | n/a |
| **PR-0b** Legal-copy/link/version implementation (code) | implement signed copy; wire app consent links; create `/merchant-terms`; bump `LEGAL_VERSION`/`TERMS_VERSION`; re-consent flow | Approved artefacts | after artefacts approved | n/a |
| **PR-A** Backend non-demographic aggregation | `src/api/merchant/insights/**` + shared aggregation + endpoints + index candidate + the runtime gate + cleanliness + demo fixture | spec merged | now (parallel to PR-0a) | behavioural endpoints + event-level export **default-off** until the bounded review clears + owner approval |
| **PR-B** merchant-web non-demographic Insights | `app/(app)/insights/**` + `components/insights/**` + `lib/api/insights.ts` + nav wire | PR-A | after PR-A merged | behavioural sections render real data only when the gate is open |
| **PR-C** Gated demographic expansion | age/gender/location + server-side suppression/anti-inference | PR-0a + artefacts + PR-0b + adversarial suppression tests | **only after every gate clears** | non-executable until then (no demographic code reachable/processing) |
| **Phase-4** | reversal schema; QR-vs-manual when mobile emits `QR_SCAN`; server PDF/email; retention job; campaign ROI | each its own trigger | per trigger | n/a |

**Stacking:** PR-A and PR-0a run in parallel. PR-B branches off `main` after PR-A merges. PR-0b branches off `main` after the legal artefacts are approved. PR-C branches off `main` after PR-0a/0b + suppression tests. Each slice is a separate branch + PR off updated `main` (no long-lived stacked branches). **Do not silently make PR-0a optional for a real-data behavioural release.**

---

## 1. Source cross-check (re-verified on `main` @ `15ff9fef`)

| Concern | Current state (file) | Reuse / Greenfield |
|---|---|---|
| Authz spine | `resolveMerchantContext` (`src/api/merchant/shared.ts:124-142`) → `{merchantId, role, allBranches, allowedBranchIds, canManageVouchers}` + SEC-M2; `assertBranchAllowed` (`:150-152`); `assertCanManageBranch` (`:163`) | **Reuse** (honours BM+allBranches per shipped model) |
| Branch-scope helper | `scopeBranchIds(ctx)` (`src/api/merchant/redemptions/routes.ts:11-13`) = `allBranches ? null : allowedBranchIds` | **Reuse** (correct for shipped model; merchant filter always applied) |
| Module registration | `src/api/merchant/plugin.ts:16-27` (scoped plugin, `authenticateMerchant` preHandler, `scoped.register(<module>Routes)`) | **Reuse** - add `insights/routes` |
| List+export precedent | `src/api/merchant/redemptions/{routes,service,format}.ts`; `EXPORT_CAP=50000`; `csvCell` formula-injection; `ROW_SELECT` curated (no PII beyond first/last); `formatCustomerName` first+last-initial | **Reuse pattern**; Insights CSV is a **separate, stricter** artefact (no Customer column) |
| Cleanliness | `isTestData` columns; `QA_ACCOUNT_EMAILS`/`isQaAccountEmail` (`src/api/customer/discovery/qaAccountFilter.ts`) | **Reuse** |
| Aggregation pattern | `src/api/customer/savings/service.ts` (`prisma.voucherRedemption.aggregate({_sum})` + `Number()`), **UTC** windows, per-user, no isValidated/isTestData | **Pattern only** - fix scope/filters/TZ |
| Raw-SQL GROUP BY precedent | `src/api/customer/discovery/homeRailBuilders.ts:computePopularityScores` (`$queryRawUnsafe` with **audited compile-time-constant interpolation** + positional `$N` params for the QA list) | **Shape pattern only**; Insights MUST use Prisma's tagged-template `$queryRaw` (true parameterisation) for **client-influenced** values (date range, branchId list, voucherType), never `$queryRawUnsafe` interpolation |
| Partial-index precedent | `prisma/schema.prisma` `BranchOpeningHoursPending` partial index (indexed an **empty** table) | **Cite**; the Insights partial index would target a **large hot** table (different risk - see Task A9) |
| `merchant.isTestData` / `branch.isTestData` | columns exist on Merchant + Branch | **Reuse** in the eligible WHERE (§2.1) |
| London helper | `src/api/.../londonClock.ts` returns only `{dayOfWeek, minutes}` | **Greenfield** - London date-range/bucket helper |
| Schema | `VoucherRedemption` no merchantId; indexes lack `[branchId,(isValidated,)redeemedAt]`; `ValidationMethod`=PIN/QR_SCAN/MANUAL; `UserStatus` incl DELETED; `MerchantMembership.allBranches @default(true)` | **Greenfield index candidate** (additive, stop-and-report) |
| merchant-web data fetch | `lib/api/client.ts` `apiFetch` (prefixes `NEXT_PUBLIC_API_URL`, typed `ApiError`); zod + `z.coerce.number()` for Decimal (`lib/api/redemptions.ts`) | **Reuse** - add `lib/api/insights.ts` |
| merchant-web nav | `components/shell/navItems.ts:16` Insights stub `href:'#'` | **Modify** → `/insights` (PR-B) |
| merchant-web routes/components | `app/(app)/<module>/page.tsx`; `components/<module>/**`; tests `__tests__/*.test.tsx`; `jest.config.mjs` | **Reuse pattern** - add `insights/` |
| Charting | NONE in merchant-web | **Greenfield** (decide in PR-B; default: lightweight SVG + functional palette tokens) |
| Report/PDF/email | no PDF, no csv-stringify (only `csv-parse`); Resend wired but dark | **Greenfield** printable HTML; **no** server PDF/email v1 |
| Legal mechanics | `apps/customer-web/lib/legal.ts` `LEGAL_VERSION` ↔ `src/api/shared/legal.ts` `TERMS_VERSION` (guard-test parity); static pages `app/{privacy,terms,cookies}`; `User.tcConsentVersion` | **PR-0b** scope |

**Corrections to watch (from spec amendments + plan review):** an all-branches BM is legitimate (do not restrict to `allowedBranchIds`); merchant-web `lib/redemptions/display.ts` renders browser-local time (`Intl en-GB` without `timeZone:'Europe/London'`) - **do not mirror**; bucket on `redeemedAt`, confirmed = `isValidated=true` (not `validatedAt IS NOT NULL`); the raw-SQL precedent `computePopularityScores` uses `$queryRawUnsafe` - Insights MUST use tagged-template `$queryRaw` for client-influenced values; `getLondonClock` returns `0=Sun..6=Sat` - the busy-times grid uses `Mon=0..Sun=6` so **remap, do not reuse raw**; the eligible rule must include `branch.isTestData`/`merchant.isTestData` (not only `redemption.isTestData`); the aggregation/scope/cleanliness/gate tests run against a **real DB** (`.integration.test.ts`), NOT mocked-Prisma where-object assertions (the redemptions `where`-shape tests do not apply to raw SQL).

---

## 2. Cross-cutting contracts (shared by PR-A and PR-B)

### 2.1 Canonical eligible dataset (every query + export)
A `VoucherRedemption` row is **eligible** iff: `branch.merchantId = ctx.merchantId` AND `redemption.isTestData = false` AND **`branch.isTestData = false`** AND **`merchant.isTestData = false`** AND `NOT isQaAccountEmail(user.email)` AND `user.status != 'DELETED'` - so it genuinely matches the Popular/Trending cleanliness definition (spec §4.1). Enforced server-side; not toggleable in production. QA-email exclusion is a parameterised SQL predicate over **`LOWER(user.email)`** vs the lowercased `QA_ACCOUNT_EMAILS` list, plus a domain `LOWER(email) NOT ILIKE` over `QA_ACCOUNT_EMAIL_DOMAINS`, with an **empty-list `TRUE` identity guard** (mirror `isQaAccountEmail` / `computePopularityScores`; case-fold both sides).

### 2.2 Dual layers + reconciliation
`logged` = COUNT(eligible); `confirmed` = COUNT(eligible WHERE isValidated=true); `awaiting` = logged - confirmed. **Invariant `confirmed + awaiting = logged` for every cut.** `redeemedAt` is the period/bucket timestamp for ALL of logged+confirmed (confirmed is NOT bucketed by `validatedAt`). `estimatedSaving` summed over eligible (estimated) and over confirmed subset; `Number()`-coerced.

### 2.3 London-local boundaries
All windows half-open `[start, end)` computed in `Europe/London`, converted to UTC instants; query `redeemedAt >= startUtc AND redeemedAt < endUtc`. Month buckets + the six dayparts (`[00:00,07:00) [07:00,12:00) [12:00,15:00) [15:00,18:00) [18:00,22:00) [22:00,24:00)`) via `DATE_TRUNC`/`EXTRACT(... AT TIME ZONE 'Europe/London')` in `$queryRaw`. After-midnight → its actual London calendar day.

### 2.4 Authorization matrix (both BM modes)
| Role / membership | Effective scope |
|---|---|
| OWNER, `allBranches=true` | all merchant branches (`scope=null` + merchant filter) |
| BRANCH_MANAGER, `allBranches=true`, `allowedBranchIds=[]` | **all merchant branches** (legitimate all-branches manager) |
| BRANCH_MANAGER, `allBranches=false`, allowed set | only `allowedBranchIds` (one → "Viewing: <Branch>"; several → "All my branches") |
| BRANCH_MANAGER, `allBranches=false`, `allowedBranchIds=[]` | **no data** (fail-closed; never widened) |
| STAFF | **denied** server-side (`role==='STAFF'` → `INSUFFICIENT_PERMISSIONS`) |
| any, crafted/cross-tenant `branchId` | denied/empty (intersect with scope; never an existence oracle) |

Helper to implement (PR-A Task A2): `insightsScope(ctx): string[] | null` = `ctx.allBranches ? null : ctx.allowedBranchIds`; plus a route guard `assertInsightsAccess(ctx)` that throws on `role==='STAFF'`. The merchant filter `branch.merchantId = ctx.merchantId` is ALWAYS in the WHERE. An empty `allowedBranchIds` with `allBranches=false` yields `branchId IN ()` → no rows.

**Active-merchant gate (SEC-M2 preserved - lifecycle decision A):** in addition to `resolveMerchantContext` (which hard-throws `MERCHANT_SUSPENDED`, `shared.ts:136`), every Insights route calls **`assertMerchantActive(prisma, ctx.merchantId)`** - a select of `merchant.status` that throws a single typed **`MERCHANT_NOT_ACTIVE`** (forbidden / not-available) unless `status === 'ACTIVE'` - so REGISTERED / PENDING_APPROVAL / INACTIVE / DELETED are **server-blocked, not just UI-hidden**. Suspended → the existing suspension screen, no data; **no bypassing read-only resolver is created** (spec §7.2, §11). Frontend hiding is never the boundary.

### 2.5 Runtime gate (default-off, fail-closed)
A server-owned `behaviouralGateOpen(): boolean` (backed by a config the deploy does not set by default; the open value MUST be the recorded PR-0a D5 gate-open artefact, never a bare deploy default). **Gates (behavioural / cross-period customer history):** repeat-customer-rate **(its value AND its comparison)**, new-vs-returning, AND the event-level CSV + event-level printable rows. **NOT gated (operational, within-period counts of the merchant's own events):** redemption-activity count, **distinct-customers (within-period `COUNT(DISTINCT userId)`)**, **the operational period comparison deltas (redemption-activity / distinct-customers / savings; repeat-rate's comparison is gated together with its value, §2.7)**, estimated savings, voucher/branch rankings, by-type share, busy-times, validation totals. (Distinct-customers and the operational comparisons are within-period counts, not cross-customer history; only repeat-rate and new-vs-returning - and repeat-rate's own comparison - read prior-period customer history, so only those are behavioural - this line is binding across §2.7, A6, A7.) When closed → only the gated features return a typed `not-available` (never real data); operational aggregates run normally. No client flag/header/body can open it; demo/test access is separate (§2.6). Opening requires the bounded-review output + explicit owner approval.

### 2.6 Demo-fixture isolation
Demo data is `isTestData=true` on a dedicated demo merchant, invisible to production analytics (section 2.1) and customer discovery. Insights QA sees it only via a staging-only, env+merchant-allowlisted path with a **call-time assertion** (refuse to enable unless a staging flag + non-production `NODE_ENV`; the include-path is server-owned - no client header/body/query can enable it - and throws at call time in production). Production cleanliness holds even if every demo guard is misconfigured.

### 2.7 Endpoint contracts (PR-A; consumed by PR-B)
All under `/api/v1/merchant/insights`, GET, `authenticateMerchant` + `assertMerchantActive` (`Merchant.status==='ACTIVE'`, §2.4) + `assertInsightsAccess` + scope. Query params (zod, server-validated): `period` (`this_month|last_month|last_3m|last_6m|all|custom`), `from`/`to` (YYYY-MM for custom), `branchId?`, `voucherType?` (7 merchant-facing values; `DISCOUNT` maps to `{DISCOUNT_FIXED,DISCOUNT_PERCENT}`). Responses (Decimal as number):
- `/overview` → `{ redemptionActivity:{logged,confirmed,awaiting, comparison:{cur,prev,pct,label,kind}|null}, distinctCustomers:{logged, comparison:{...}|null}, repeatRate:({ value|null, insufficient:boolean, comparison:{...}|null }|{available:false}), savings:{estimatedLogged, estimatedConfirmed, awaiting, comparison:{...}|null}, meta:{ scopeLabel, earliestDate|null, filtersEcho } }`. **Each KPI carries its OWN comparison** (own cur/prev/pct/label/availability); an **incomplete period → every comparison is `null`** (locked rule). **`repeatRate` AND its comparison are gated** - both become `{available:false}` when the behavioural gate is closed; `redemptionActivity` / `distinctCustomers` / `savings` and their comparisons are **operational** and return regardless of gate state (§2.5). Any savings comparison is **explicitly** defined here or **explicitly `null`** (never implied from a shared object).
- `/trend` → `{ months:[{ monthStartLondon, logged, confirmed }] }` (awaiting derived; both bucketed by `redeemedAt` London-month).
- `/vouchers` → `{ top:[{voucherId,title,type7,logged,confirmed,estimatedLogged,estimatedConfirmed}], byType:[{type7,logged,sharePct}] }` (share denominator = logged).
- `/branches` → `{ rows:[{branchId,name,logged,confirmed,estimatedLogged,estimatedConfirmed}] }` (scoped; never sibling-only-leak).
- `/customers` (**gated**) → `{ newVsReturning:{ newCount, returningCount, total }|{available:false}, repeatRate:{...}|{available:false} }`.
- `/busy-times` → `{ grid:[{day(Mon=0..Sun=6), daypart(0-5), logged}], busiest:{day,daypart}|null }`. NOTE: `day` is **Mon=0..Sun=6** (prototype visual row order) - DELIBERATELY DIFFERENT from `getLondonClock`'s `0=Sun..6=Sat`; do **not** reuse that helper's output without remapping (pinned in Task A4).
- `/validation` → `{ logged, confirmed, awaiting, completionRate, methods:[{method,count}] }`. `methods` counts only rows with `isValidated=true AND validationMethod IS NOT NULL` (the confirmed subset; awaiting rows always have `validationMethod=null`); the array is omitted/empty when ≤1 method has non-zero data (adaptive).
- `/export.csv` (**event-level, gated**) → `text/csv` (no direct identifiers) OR `not-available` when gated/closed.
- `/report` → **client-rendered print view** fed by the aggregate endpoints (chosen over a server-rendered HTML endpoint to avoid a new HTML-escaping/authz attack surface); **aggregate-only by default**; any event-level rows are inside the bounded review + gated (§13.6, §2.5). (If a server-rendered `/report` is later chosen, it becomes a §2.4-guarded route with fresh authz + cleanliness + the gate.)

---

## 3. PR-0a - Governance & qualified-review deliverables (NO code)

This slice produces **decisions and evidence**, authored by the owner + qualified privacy/legal review. This plan **describes the required deliverables; it does not manufacture legal conclusions.** Output is a governance pack (location owner's choice; e.g. `docs/superpowers/governance/2026-..-insights-dpia/`), referenced by PR-A/PR-B/PR-C gates.

- [ ] **D1 - Bounded behavioural review** (gates PR-B real-data behavioural release + the event-level export): a written determination of (a) the Article 6 lawful basis (+ LIA if legitimate interests) for repeat/new-customer behavioural analytics and the event-level export; (b) the merchant's data-protection role for each purpose; (c) whether the existing "merchants see only anonymised redemption counts" disclosure (`privacy/page.tsx:96`, `faq:143`) covers them or must change; (d) lawfulness/fairness of profiling given the soft-anonymisation/erasure defect (spec §4.4) and whether DELETED-exclusion suffices; (e) for the event-level export: purpose, minimisation, acceptable granularity, retention, authorization, export cap, audit/rate controls, identifiability wording (spec §13.6).
- [ ] **D2 - Full DPIA + identifiability/effective-anonymisation assessment + suppression thresholds + anti-inference policy + adversarial-differencing test plan** (gates PR-C). Special-category caution for gender/age handled by qualified review (the spec does not assert Article 9 status either way).
- [ ] **D3 - Lawful retention + Article-17 erasure model** across source fields / redemption history / exports / caches / logs / backups / future rollups / recipient notification (spec §4.4, §13.1).
- [ ] **D4 - External-artefact owner checks** (spec §13.3): confirm/obtain existing DPIA/ROPA/LIA/data-flow/retention-schedule/DPAs/ICO records before creating duplicates.
- [ ] **D5 - Record the gate-open decision** as an explicit, owner-approved artefact PR-A's runtime gate reads against (never a deploy default).
- [ ] **D6 - Busy-times sparse-cell + peak policy** (gates the release-1 busy-times exact-count behaviour, spec §1.7): whether exact sparse counts may be shown; the minimum cohort/cell threshold; intensity-only vs hidden treatment; the **"Busiest" badge threshold**; anti-inference across filters. Until D6 exists, busy-times uses the documented **safe fallback** (server-side intensity-only, no exact sparse counts; raw counts/peak never reach the browser) or is unavailable (Task A4, where the route/payload anti-bypass test lives).

**Stop-and-report:** if any deliverable concludes the behavioural/event-level processing cannot proceed, PR-B's behavioural sections and the event-level export remain gated-off and ship aggregate-only.

---

## 4. Approved legal artefacts (authored by counsel/owner; NOT this plan)

Revised customer **privacy policy** merchant-sharing bullet + purposes + legal-basis; **FAQ**; onboarding **consent-screen** copy (PC1/PC2/PrePermission/RegisterForm/RegisterScreen links); the binding **Merchant Terms** + the missing `/merchant-terms` content; the merchant onboarding teaser. **Signed off before any PR-0b implementation.** This plan does not write legal copy.

---

## 5. PR-0b - Legal-copy / link / version implementation (code)

Branch `legal/insights-disclosure-impl` off `main`, only after section 4 artefacts are approved. Each task is the mechanical implementation of approved copy; **no legal wording is invented here**.

### Task 0b.1: Implement the approved privacy/FAQ copy
**Files:** Modify `apps/customer-web/app/privacy/page.tsx`, `apps/customer-web/app/faq/page.tsx` (paste approved copy verbatim). Test: the **legal-content parity guard** (`tests/api/legal/legal-content.guard.test.ts`) + the customer-web build stay green (`canonical-url.guard.test.ts` is a different guard - do not rely on it for copy).
- [ ] Paste approved copy; run the legal-content guard + the customer-web build; commit.

### Task 0b.2: Wire app consent links + create `/merchant-terms`
**Files:** Modify `apps/customer-app/src/features/auth/screens/RegisterScreen.tsx:362-366` (open real `LINKS.terms`/`LINKS.privacy`); Create `apps/customer-web/app/merchant-terms/page.tsx` (approved content) + the merchant agreement reference (`src/api/merchant/onboarding/service.ts:17`).
- [ ] Replace the stub Alert with real doc links; create the route; commit.

### Task 0b.3: Version bump + re-consent flow (lock-step)
**Files:** Modify `apps/customer-web/lib/legal.ts` (`LEGAL_VERSION`, `LEGAL_EFFECTIVE_DATE`) AND `src/api/shared/legal.ts` (`TERMS_VERSION`) together; implement the approved notification/re-consent approach. Test: the existing version-parity guard test must pass.
- [ ] Bump both constants in lock-step; run the guard test; implement re-consent per approved decision; commit.

**Stop-and-report:** any legal-copy change beyond the approved artefacts; any change to the consent data model (schema).

---

## 6. PR-A - Backend non-demographic aggregation

Branch `feat/insights-backend-aggregation` off `main`. Module `src/api/merchant/insights/` mirroring `redemptions/`. Backend tests vitest under `tests/api/merchant/insights/` mirroring `tests/api/merchant/redemptions/`. **No demographic queries in this PR.**

**Test harness (PR-A):** pure helpers (london/scope/eligibility/format) use plain vitest unit tests. **Aggregation, reconciliation, London-bucketing/DST, branch-scope, cross-tenant, cleanliness, and gate-not-queried tests MUST be real-DB integration tests** (`*.integration.test.ts` against the integration test project) seeding two merchants + sibling branches + a DELETED user + a QA-email user + cross-month/cross-daypart rows - because the service uses raw `$queryRaw` SQL, so the redemptions precedent's mocked-Prisma `where`-object assertions do NOT apply. Boot mirrors `tests/api/merchant/redemptions/list.test.ts` (buildApp + a merchant JWT/ctx). The `Confirmed+Awaiting=Logged` invariant is asserted on seeded data; the production-data audit (Task A11, spec §21.6 item 6) is a separate stop-and-report.

### Task A1: London date helper (greenfield)
**Files:** Create `src/api/merchant/insights/london.ts`; Test: `tests/api/merchant/insights/london.test.ts`.

- [ ] **Step 1 - failing test** (`london.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { londonMonthWindow, londonRangeUtc, periodWindow } from '../../../../src/api/merchant/insights/london'

describe('london windows', () => {
  it('this_month is [1st 00:00 London, now) in UTC', () => {
    const now = new Date('2026-03-15T12:00:00Z')
    const w = periodWindow('this_month', now)
    // 1 March 2026 00:00 London = 2026-03-01T00:00:00Z (GMT in March before BST switch on 29 Mar)
    expect(w.startUtc.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(w.endUtc.toISOString()).toBe('2026-03-15T12:00:00.000Z')
    expect(w.comparison).toBeNull() // incomplete month → no comparison (spec §6.2)
  })
  it('BST boundary: 1 July 2026 00:00 London = 2026-06-30T23:00:00Z', () => {
    const w = londonMonthWindow(2026, 7)
    expect(w.startUtc.toISOString()).toBe('2026-06-30T23:00:00.000Z')
  })
  it('completed last_month compares to the month before (equal completed windows)', () => {
    const w = periodWindow('last_month', new Date('2026-03-15T12:00:00Z'))
    expect(w.startUtc.toISOString()).toBe('2026-02-01T00:00:00.000Z')
    expect(w.comparison?.startUtc.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
  it('custom range containing the current incomplete month yields no comparison', () => {
    const w = periodWindow('custom', new Date('2026-03-15T12:00:00Z'), { from: '2026-01', to: '2026-03' })
    expect(w.comparison).toBeNull()
  })
  it('last_3m excludes the current month; compares the preceding 3 (contiguous, equal length) - BST-robust', () => {
    const w = periodWindow('last_3m', new Date('2026-04-15T12:00:00Z'))
    expect(w.endUtc.toISOString()).toBe(londonMonthWindow(2026, 4).startUtc.toISOString())    // April (current) EXCLUDED
    expect(w.startUtc.toISOString()).toBe(londonMonthWindow(2026, 1).startUtc.toISOString())   // Jan..Mar
    expect(w.comparison?.endUtc.toISOString()).toBe(w.startUtc.toISOString())                  // contiguous
    expect(w.comparison?.startUtc.toISOString()).toBe(londonMonthWindow(2025, 10).startUtc.toISOString()) // Oct..Dec 2025
  })
  it('last_6m excludes the current month; compares the preceding 6', () => {
    const w = periodWindow('last_6m', new Date('2026-07-15T12:00:00Z'))
    expect(w.endUtc.toISOString()).toBe(londonMonthWindow(2026, 7).startUtc.toISOString())    // July (current) EXCLUDED
    expect(w.startUtc.toISOString()).toBe(londonMonthWindow(2026, 1).startUtc.toISOString())   // Jan..Jun
    expect(w.comparison?.startUtc.toISOString()).toBe(londonMonthWindow(2025, 7).startUtc.toISOString())  // Jul..Dec 2025
  })
})
```
- [ ] **Step 2 - run, expect FAIL** (`npx vitest run tests/api/merchant/insights/london.test.ts`): module not found.
- [ ] **Step 3 - implement** `london.ts`: use `Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',...})` `formatToParts` to derive the UTC instant of a London wall-clock time (no external dep). Export `londonMonthWindow(year,month)`, `londonRangeUtc(londonWall)`, `periodWindow(period, now, custom?)` returning `{startUtc, endUtc, comparison: {startUtc,endUtc}|null, label}`. Completed-month-only comparison; incomplete current month / custom-with-current-month → `comparison:null`.
- [ ] **Step 4 - run, expect PASS.**
- [ ] **Step 5 - commit** `feat(insights): London-local period/month windows + DST-safe boundaries`.

### Task A2: Scope + access guards
**Files:** Create `src/api/merchant/insights/scope.ts`; Test: `tests/api/merchant/insights/scope.test.ts`.
- [ ] **Step 1 - failing test** asserting the section 2.4 matrix table for `insightsScope(ctx)` and `assertInsightsAccess(ctx)`:
```ts
import { insightsScope, assertInsightsAccess } from '../../../../src/api/merchant/insights/scope'
const ctx = (o: any) => ({ merchantId:'m', role:'BRANCH_MANAGER', allBranches:false, allowedBranchIds:[], ...o })
it('owner all-branches → null (all merchant branches)', () => expect(insightsScope(ctx({role:'OWNER',allBranches:true}))).toBeNull())
it('BM all-branches → null (legitimate)', () => expect(insightsScope(ctx({allBranches:true}))).toBeNull())
it('BM specific → allowedBranchIds', () => expect(insightsScope(ctx({allowedBranchIds:['b1']}))).toEqual(['b1']))
it('BM empty specific → [] (fail closed)', () => expect(insightsScope(ctx())).toEqual([]))
it('staff denied', () => expect(() => assertInsightsAccess(ctx({role:'STAFF'}))).toThrow('INSUFFICIENT_PERMISSIONS'))
```
- [ ] Steps 2-5: run-fail → implement (`insightsScope = ctx.allBranches ? null : ctx.allowedBranchIds`; `assertInsightsAccess` throws `AppError('INSUFFICIENT_PERMISSIONS')` when `role==='STAFF'`; **`assertMerchantActive(prisma, merchantId)`** selects `merchant.status` and throws a single typed **`MERCHANT_NOT_ACTIVE`** (forbidden / not-available) unless `status === 'ACTIVE'` - SEC-M2 preserved; pre-live/INACTIVE/DELETED server-blocked; SUSPENDED already blocked by `resolveMerchantContext`) → run-pass → commit. (The 6-status server tests live in A7, real DB.)

### Task A3: Cleanliness predicate (test/QA/DELETED)
**Files:** Create `src/api/merchant/insights/eligibility.ts` (builds the Prisma/SQL WHERE fragment + the parameterised QA-email predicate); Test: `tests/api/merchant/insights/eligibility.test.ts`.
- [ ] Failing test: the eligible WHERE includes `branch.merchantId`, `isTestData:false`, `user.status != DELETED`, and a QA-email exclusion derived from `QA_ACCOUNT_EMAILS`; a mutation removing any clause fails a fixture-count assertion. Implement; commit.

### Task A4: Shared aggregation service
**Files:** Create `src/api/merchant/insights/service.ts`; Test: `tests/api/merchant/insights/{reconciliation,aggregation,busy-times}.integration.test.ts` (**real-DB integration** - raw SQL; see the PR-A test-harness note).
- [ ] **Reconciliation test (critical, real DB):** for any filter, `confirmed + awaiting === logged`; trend months sum to overview logged; both logged+confirmed bucket by `redeemedAt`; confirmed uses `isValidated=true`. Savings: estimatedLogged ≥ estimatedConfirmed; awaiting = estimatedLogged - estimatedConfirmed.
- [ ] Implement `getOverview/getTrend/getVouchers/getBranches/getBusyTimes/getValidation(ctx, filters)` over the eligible dataset (§2.1), London buckets via Prisma tagged-template **`$queryRaw`** (client-influenced params parameterised, never `$queryRawUnsafe`), scope-intersected WHERE, Decimal→`Number()`. Map `DISCOUNT_FIXED/PERCENT`→`DISCOUNT` for the 7-type share. `getValidation` methods count only `isValidated=true AND validationMethod IS NOT NULL` and omit when ≤1 method. Commit per function with its test.
- [ ] **Busy-times pin (real DB):** assert the grid `day` index is `Mon=0..Sun=6` (seed a redemption on a known London Monday → row `day===0`; Sunday → `day===6`); every logged row lands in exactly one of the six dayparts (no gap/overlap); after-midnight → its actual London calendar day. Do NOT reuse `getLondonClock`'s `0=Sun..6=Sat` without remapping.
- [ ] **Per-KPI comparison (real DB):** each headline KPI (redemption activity, distinct customers, repeat-rate, savings) computes its **own** comparison over the §2.2 comparison window; comparison is `null` for an incomplete period; **repeat-rate's value AND comparison are gated** (A6); operational KPIs' comparisons are ungated. Test: an incomplete period → all comparisons null; a gate-closed overview omits **only** repeat-rate + its comparison.
- [ ] **Busy-times sparse-cell (safe fallback until PR-0a D6, real DB):** suppression is **server-side**; the fallback is **intensity-only for every cell** (relative bands, **never exact counts**) until D6 lands - **no exact per-cell count and no peak/raw-count value reaches the browser**; the "Busiest" badge is **omitted whenever its peak cell could be a near-empty cell** (conservative omission), with the actual badge/cell threshold **deferred to PR-0a D6** (not decided here; spec §1.7). A route/payload test proves a merchant cannot recover a suppressed cell by narrowing filters (date/branch/voucher-type).

### Task A5: Behavioural service (gated) - repeat-rate + new-vs-returning
**Files:** add to `service.ts` (or `service.behavioural.ts`); Test: `tests/api/merchant/insights/behavioural.test.ts`.
- [ ] Failing tests: `Already-a-customer + New-to-you === distinctCustomers` for the active filter; "returning" = prior eligible logged redemption before `startUtc` within the **same effective branch scope** but **across all voucher types**; first+second-in-period → New; DELETED excluded from cohort + lookback; repeat-rate denominator == the voucher-type-filtered distinct cohort.
- [ ] Implement; commit.

### Task A6: Runtime gate (default-off, fail-closed)
**Files:** Create `src/api/merchant/insights/gate.ts`; Test: `tests/api/merchant/insights/gate.test.ts`.
- [ ] **Tests (critical, real DB):** `behaviouralGateOpen()` defaults **false** with no config set, and the open value must be the recorded **PR-0a D5** artefact (not a bare deploy default); cannot be opened by any request header/body/query field (server-owned only); when closed, the behavioural service functions + the event export return a typed `not-available` and **never execute a real query** - the integration test spies on BOTH `prisma.$queryRaw` AND `prisma.$queryRawUnsafe` and asserts neither runs for the gated paths; operational aggregates query normally while closed (separation).
- [ ] Implement reading a server-owned config (e.g. `INSIGHTS_BEHAVIOURAL_GATE`) with a **production-fail-closed** rule: in production, unset/false → closed. Commit.

### Task A7: Routes + plugin registration
**Files:** Create `src/api/merchant/insights/routes.ts` + `format.ts`; Modify `src/api/merchant/plugin.ts` (import + `scoped.register(merchantInsightsRoutes)`); Test: `tests/api/merchant/insights/{routes,cross-tenant,branch-scope}.integration.test.ts` (real DB; two merchants + sibling branches).
- [ ] **cross-tenant test (critical, mutation-checked, real DB):** merchant A cannot read merchant B's data (branch.merchantId boundary); a crafted out-of-scope / cross-tenant `branchId` yields empty, not an existence oracle; **`/branches` never serialises sibling branch ids/names** (a scoped BM with zero in-scope branches gets an empty `rows`); **mutation:** neuter the merchant/scope WHERE in the raw SQL → a test FAILS.
- [ ] **branch-scope test:** the full §2.4 matrix (both BM modes incl. all-branches BM = all merchant branches, and empty-specific = no data) on each endpoint + the export.
- [ ] **Fresh authz per request:** every `/insights/*` route (incl. `/export.csv`) calls `resolveMerchantContext(prisma, req.user.sub)` **fresh** (no cross-request caching) → **`assertMerchantActive`** → `assertInsightsAccess` → `insightsScope`; a test asserts a membership/status change between two requests takes effect immediately.
- [ ] **Lifecycle / status test (critical, real DB):** for each of the six `MerchantStatus` values assert `ACTIVE` → data and REGISTERED / PENDING_APPROVAL / INACTIVE / SUSPENDED / DELETED → **no Insights data** (SUSPENDED via `MERCHANT_SUSPENDED` from the resolver; REGISTERED / PENDING_APPROVAL / INACTIVE / DELETED via `assertMerchantActive`'s typed **`MERCHANT_NOT_ACTIVE`**); assert the exact typed code/shape, not merely the absence of data; the server denies directly (frontend hiding is not the boundary).
- [ ] Implement each route: parse zod filters, the fresh-authz chain, call service, return the §2.7 contract. **Gated paths:** `repeatRate` (overview), `/customers`, `/export.csv` check `behaviouralGateOpen()`; `comparison`, `distinctCustomers`, and all operational endpoints are **NOT** gated (§2.5). Commit.

### Task A8: Event-level CSV export (gated)
**Files:** add `getInsightsExport` + `insightsRowsToCsv` to `service.ts`/`format.ts`; Test: `tests/api/merchant/insights/export.test.ts`.
- [ ] Tests (real DB): columns = redeemed date/time (London), voucher title, branch, 7-type label, estimated value, **status (`Confirmed`/`Awaiting` - every exported row is by definition logged, so the column carries the two exclusive states)**, method (where confirmed); **no** name/email/phone/userId/postcode/demographics; `csvCell` formula-injection escaping; **explicit row cap `EXPORT_CAP=50000`** (mirror redemptions) with the over-cap behaviour pinned (append a truncation-notice row + report - **no silent truncation**, spec §1.10); **gate-closed → `not-available`** (never event rows). Implement; commit.

### Task A9: Index candidate (additive migration) - STOP-AND-REPORT
**Files:** `prisma/schema.prisma` (candidate `@@index([branchId, isValidated, redeemedAt])`) + migration. **Do not run blind.**
- [ ] **STOP-AND-REPORT** to owner with: the exact SQL; `EXPLAIN (ANALYZE, BUFFERS)` plans on **eligible (isTestData=false) representative volume** (§10); the **lock/availability analysis** - plain `CREATE INDEX` takes a write-blocking `SHARE` lock (every prior repo migration uses plain DDL), so on a large `VoucherRedemption` it must be sized/timed (low-traffic window, or an accepted brief write-lock) OR use Postgres `CREATE INDEX CONCURRENTLY` (raw migration, **cannot run inside the migration transaction** - a distinct operational step); plus the `DROP INDEX` rollback. A **partial** index (`WHERE "isTestData"=false`) is raw-migration-only (no Prisma `@@index`); the `BranchOpeningHoursPending` partial-index precedent indexed an **empty** table, so its zero-lock-risk does **not** transfer here. Only after approval: apply + report plan deltas.

### Task A10: Demo fixture (isolated)
**Files:** Create `prisma/insights-demo-fixture.ts` (dev/staging only); Test: `tests/api/merchant/insights/fixture-safety.test.ts`.
- [ ] Tests: every fixture row is `isTestData=true` on the **dedicated demo merchant only** (merchant allowlist); production cleanliness (§2.1) excludes them; the demo include-path is a **single server-owned exported function that throws at call time** unless `NODE_ENV!=='production'` AND a staging demo flag is set (it cannot be enabled by any request header/body/query field), keeps the full `resolveMerchantContext`+scope authz, and surfaces `isTestData=true` rows ONLY for the allowlisted demo merchant; the production cleanliness rule holds even if every demo guard is misconfigured. Implement the seed script (validated+awaiting redemptions across branches/types/dates/dayparts). Commit.

### Task A11: PR-A no-behaviour-change + full suite + gate verify + data audit
- [ ] **Data-level audit (spec §21.6 item 6, stop-and-report):** query staging/production for any `VoucherRedemption` with `validatedAt`/`validatedById` set while `isValidated=false` (or the reverse). If any exist → **stop-and-report**: the `isValidated` discriminator + the `Confirmed+Awaiting=Logged` invariant depend on their absence.
- [ ] Run `npx vitest run tests/api/merchant/insights` (incl. the `.integration.test.ts` suite, all green) + the full backend suite + `tsc --noEmit`. Confirm operational endpoints work with the gate **closed** (default), and the gated behavioural/export paths return `not-available`. Commit. Open PR-A (SHA-bound gate).

---

## 7. PR-B - merchant-web non-demographic Insights

Branch `feat/insights-merchant-web` off `main` after PR-A merges. New `app/(app)/insights/page.tsx` + `components/insights/**` + `lib/api/insights.ts`. jest tests under `__tests__/`. **No demographic UI; no placeholders/coming-soon for age/gender/location.**

### Task B1: API client + zod schemas
**Files:** Create `apps/merchant-web/lib/api/insights.ts`; Test: `apps/merchant-web/lib/api/__tests__/insights.test.ts`.
- [ ] Failing test: schemas parse the section 2.7 responses incl. Decimal via `z.coerce.number()`, the **per-KPI `comparison` objects** (each nullable), and the `{available:false}` gated repeat-rate variant. Implement `apiFetch`-based `getInsightsOverview/Trend/Vouchers/Branches/BusyTimes/Validation/Customers` + `insightsExportUrl()`/`insightsReportUrl()`. Commit.

### Task B2: Charting decision + functional palette tokens (greenfield)
**Files:** Modify `apps/merchant-web/app/globals.css` (functional, non-brand-rose chart tokens); Create `components/insights/charts/{BarSeries,Heatmap,ShareBar}.tsx` (lightweight hand-rolled SVG - no new dep unless owner approves one). Test: chart components render + expose a tabular/screen-reader equivalent.
- [ ] Implement accessible SVG primitives with `<table>` fallback + aria; commit. **Stop-and-report** if adding a charting dependency (package/lockfile change).

### Task B3: Filters (period presets + custom month range + branch + voucher type)
**Files:** Create `components/insights/InsightsFilters.tsx` + `lib/insights/filters.ts`; Test: `components/insights/__tests__/InsightsFilters.test.tsx`.
- [ ] Failing tests: six presets; custom shows From/To **month** pickers and **allows the current incomplete month** (marked in progress, no comparison chip); branch filter shows only authorised branches (one → "Viewing: <Branch>"; several → "All my branches"; never the owner "All branches" for a BM); 7 voucher types. Implement; commit.

### Task B4: KPI cards (dual-layer + repeat-rate headline + savings)
**Files:** Create `components/insights/KpiCards.tsx`; Test: `__tests__/KpiCards.test.tsx`.
- [ ] Tests: Redemption activity (logged headline + confirmed/awaiting); Distinct customers; **Repeat-customer rate** headline with "Building your repeat-customer picture" insufficient-state and the `{available:false}` gated state; secondary "Estimated customer savings" + "Estimated savings on confirmed redemptions" (no "Delivered"); each KPI's **own** completed-month-only comparison chip (absent on incomplete; repeat-rate's chip gated with the metric). **Visual-fidelity guard (negative):** the third KPI card is **Repeat-customer rate**, NOT the prototype's "Value delivered to customers" card (spec §2.4, screenshots 02/04); the page renders no "Value delivered" headline. Tooltips per section B9. Implement; commit.

### Task B5: Trend chart
**Files:** Create `components/insights/TrendChart.tsx`; Test: `__tests__/TrendChart.test.tsx`.
- [ ] Tests: logged total bars + confirmed subset overlay (never additive); in-progress current-month bar; legend + tabular equivalent; neutral awaiting colour; tooltip explains retroactive confirmation. **Negative:** the trend subtitle uses logged-primary copy; the prototype's "Validated redemptions per month" subtitle is banned (spec §2.4). Implement; commit.

### Task B6: Tabs (Vouchers / Branches / Customers / Busy times / Validation)
**Files:** Create `components/insights/tabs/{VouchersTab,BranchesTab,CustomersTab,BusyTimesTab,ValidationTab}.tsx`; Tests under `__tests__/`.
- [ ] Tests per tab: **Vouchers** (rank by logged + confirmed subset; "By voucher type" renders a single stacked `ShareBar` + per-type legend, logged denominator; single-type-filter avoids an unexplained 100%); **Branches** (scoped; no sibling ids/names; BM sees only authorised; **negative:** do NOT reproduce the prototype's "Branch performance always compares all your locations" caption, screenshot 06 - it contradicts the scoped-BM rule §7.2); **CustomersTab = New-and-returning only**, demographic sections **entirely absent** (no placeholders), gated `{available:false}` state, **and the prototype's anonymity/suppression banner (screenshot 07) MUST NOT render in release 1** (it is a [LEGAL-GATE] demographic item, spec §8.2); **BusyTimes** = the six locked owner-facing labels **Overnight/Morning/Lunch/Afternoon/Evening/Late** (do NOT mirror the prototype's four columns or its "Late morning/Lunch/Afternoon/Evening" labels, screenshot 09), "Busiest" badge suppressed when the peak cell is below threshold; **Validation** (logged/confirmed/awaiting + completion + adaptive method chart hidden when ≤1 method; **negative:** no "honoured" wording, spec §2.4). Implement; commit.

### Task B7: Reports (CSV + printable HTML summary)
**Files:** Create `components/insights/ReportsCard.tsx` + `app/(app)/insights/report/page.tsx` (printable); Test: `__tests__/ReportsCard.test.tsx`.
- [ ] Tests: "Redemption activity CSV excluding direct customer identifiers" download (filters + scope echoed; gated/`not-available` when closed); **client-rendered printable summary, aggregate-only** (Logged/Confirmed/Awaiting; no "delivered"; print stylesheet; states range/scope/filter/generation date; "Print or save report"); identifiability caveat wording. **Negative:** no "we can email you"/"email you" promise and no "No customer personal data is ever included" (use "No direct customer identifiers are included" + the caveat), spec §2.4. Any event-level rows in the printable are gated identically to the CSV (§13.6). Implement; commit.

### Task B8: Page + states + nav wire
**Files:** Create `app/(app)/insights/page.tsx`; Modify `components/shell/navItems.ts:16` (`href:'/insights'`); Test: `app/(app)/insights/__tests__/page.test.tsx`.
- [ ] Tests: pre-live locked; **live-no-activity warming-up surface matching screenshot 01** (heading "Your insights are warming up" + supporting copy + a "Manage your vouchers" CTA); live shows real figures; per-section truthful-zero vs "Not enough data yet" vs "Not available" vs loading vs friendly-error; suspended → the existing **suspension screen** (no Insights data; **not** a read-only dashboard); pre-live + all non-ACTIVE statuses are **server-blocked** (the UI lock is not the boundary); Staff never reaches the route (server denies; nav hidden). **Negative:** the page sub-headline uses logged-primary copy; the prototype's "counts validated redemptions only ... visits you actually honoured" sub-headline is banned (spec §2.4). Implement; commit.

### Task B9: Accessible tooltips/popovers
**Files:** Create `components/insights/MetricInfo.tsx`; Test: `__tests__/MetricInfo.test.tsx`.
- [ ] Tests: hover + keyboard focus + click/tap; accessible dismissal + focus; no hover-only; content explains counting/exclusions/logged-vs-confirmed/filters/scope/estimate caveats. Wire into every KPI/chart/chip/state. Commit.

### Task B10: PR-B full suite + visual fidelity
- [ ] `cd apps/merchant-web && npx jest` (all green) + `tsc --noEmit`; cross-check against the ten screenshots + `Demo: Live, established` (five tabs, dual-layer copy, no banned wording, scope-aware BM UX). Commit. Open PR-B (SHA-bound).

---

## 8. PR-C - Gated demographic expansion (NON-EXECUTABLE; do not start without all gates)

**Hard rule:** do not create demographic code, process real demographic data, or make demographics reachable in staging/production until PR-0a (DPIA/identifiability/thresholds), the approved artefacts, PR-0b, and passing adversarial differencing/suppression tests all clear. This section is the **shape only**.

- Customers tab **expands in place** (behavioural section unchanged): Age groups, Gender, Location/catchment.
- Server-side suppression + anti-inference (thresholds from PR-0a D2): section-level + per-cell + complementary suppression; no raw sub-threshold cells/percentages to the browser or exports; coverage disclosure; no silent renormalisation.
- Gender: per the **PR-0a D2** approved aggregation data dictionary (preserve source values; "Not stated/Unknown"; ungrouped surfaced) **or defer** the gender chart.
- Location = customer saved locality (coarse town/region per **PR-0a D2**), never exact address/postcode.
- Behind the section-2.5 runtime gate, opened only on PR-0a output + owner approval.
- Tests reserved for this slice: differencing/reconstruction, no-raw-cell, gated-unreachable, default-off.

---

## 9. Phase-4 deferrals & triggers
Reversal schema (makes "reversed-excluded" real); QR-vs-manual when the Phase-4 mobile app emits `QR_SCAN`; server-side PDF + report email (provider/legal/rate-limit decisions); retention-enforcement job (if D3 adopts one); campaign/featured ROI (greenfield). Each its own brainstorm/spec/plan.

---

## 10. Performance / query-plan gates
Before merging PR-A's index (Task A9): run `EXPLAIN (ANALYZE, BUFFERS)` on the overview/trend/busy-times/branches queries against a representative **eligible (isTestData=false)** dataset **in an ISOLATED environment** - one of: an isolated **ephemeral/local** performance DB, an isolated **temporary Neon branch/schema**, or an explicitly approved **sanitised production-like snapshot**. **Never add fake `isTestData=false` redemptions to shared staging** (it would pollute discovery/rankings/analytics, §2.1). Require: isolation proof; before/after row counts; cleanup verification; **no secrets or connection strings in docs or logs**; and **stop-and-report before any environment creation or platform change**. Measure: a single-branch month; all-branches all-time; a long custom range across many branches. Record plan + timing; the composite index must improve the dominant scan. **No silent truncation** - if All-time/long-range cannot be served within target, stop-and-report (cap with disclosure, or rollup - decided with evidence, not speculatively). CSV cap stays explicit and separate from dashboard aggregates.

## 11. Rollback / deployment strategy
Each PR is independently revertable (additive). PR-A endpoints ship with the behavioural/event gate **closed by default**, so deploying PR-A/PR-B is safe before the bounded review clears (operational analytics only). Opening the gate is an owner-approved config change, not a code deploy. **Code vs schema rollback are separate:** reverting PR-A code leaves the index in place (harmless); the index is removed by a distinct manual `DROP INDEX` (or `DROP INDEX CONCURRENTLY`) against the DB, not by the code revert. **PR-0b legal rollback is a qualified-approved roll-forward, NOT a silent decrement:** once a legal release has taken effect (users may have seen/accepted the newer version), **roll-forward is the default**; **no legal-version decrement or copy rollback occurs without explicit owner/qualified-review approval**, and the **accepted-version + re-consent data impact is assessed first** (it follows the approved legal artefacts). The version-parity guard still holds for any approved change.

## 12. Adversarial-review requirements (per build PR, before merge)
PR-A and PR-B each require a fresh multi-lens review (source/data-semantics; authz/security/tenant-isolation; reconciliation/timezone; gate/cleanliness/fixture-safety; prototype/visual for PR-B; completeness). Integrate must-fix + clearly-correct findings; record in the PR. Mutation tests (neuter scope/merchant/cleanliness/gate → a test fails) are mandatory acceptance gates.

## 13. Stop-and-report triggers (hard)
Any schema/migration (the index; future reversal/Gender enum); any customer-facing or cross-product contract change; any legal-copy/policy change outside the PR-0a→artefacts→PR-0b flow; adding a charting/PDF/csv dependency (package/lockfile); enabling email/provider; opening the behavioural/event runtime gate (needs bounded-review output + owner approval); any query unservable at production volume (no silent truncation); any demographic code/processing before all PR-C gates clear.

## 14. SHA-bound PR gates (every slice)
Each slice opens its own docs-or-code PR off updated `main`. Before merge, rerun the live gate: OPEN/not-draft; head SHA matches; MERGEABLE/CLEAN; CI green; live `gh api compare` file list matches the slice scope exactly (no unrelated/code/schema/legal/package files unless that slice's scope); `git diff --check` clean; style/dash scan clean. Merge via `REDEEMO_PR_SCOPE_VERIFIED=<head-sha> gh pr merge <n> --squash --delete-branch`. Sync main; delete branch; report merge SHA + final main SHA + files + checks + scope. **Owner SHA-bound approval required per merge.**

---

## 15. Self-review (writing-plans inline check)

**Spec coverage:** Decisions 1-15 + counting model → section 2 + PR-A/PR-B tasks; counting model/dual-layer → 2.2, A4; D2 repeat-rate → B4/A5; D3 comparison (completed-month-only; custom-range-may-include-current-incomplete-month §1.4 patch) → A1 (window + comparison:null) + B3 (custom month picker allows current month, no chip); D4 new-vs-returning → A5/B6; D5 reports → A8/B7; D6 busy-times → A4/B6; D7 validation adaptive → A4/B6; D8 BM presentation → 2.4/A2/B3; D9 All-time → A1/10; D10 Customers tab behavioural-only → B6/8; D11 savings → A4/B4; D12 states → B8; D13 trend → A4/B5; D14 rankings → A4/B6; D15 voucher-types → A4/B6. Authz matrix (both BM modes) → 2.4/A2/A7. Runtime gate (gates ONLY repeat-rate + new-vs-returning + event-export; comparison + distinct-customers are operational) → 2.5/A6/A7. Operational/behavioural separation → 2.5/A6/A7. Event-level export legal gate → 2.7/A8/3-D1/13. Cleanliness test/QA/DELETED → 2.1/A3. Prototype + 10-screenshot fidelity → B6/B10. Accessible tooltips → B9. CSV + printable report → A8/B7. Demo-fixture isolation → 2.6/A10. Performance/query-plan → 10/A9. Rollback/deploy → 11. Adversarial review → 12. Stop-and-report → 13. SHA-bound gates → 14. Legal gates not decided → 3/4 (deliverables only). PR-C non-executable → 8. Lifecycle authz (ACTIVE-only; SEC-M2; suspended=suspension screen) → 2.4/A2/A7/B8 + spec §7.2/§11. Per-KPI comparison (repeat-rate gated) → 2.7/A4/B1/B4. Busy-times sparse-cell safe fallback (PR-0a D6) → §3 D6/A4 + spec §1.7. Performance-data isolation → §10. PR-0b legal roll-forward → §11. **No gap found.**

**Placeholder scan:** no "TBD/TODO"; critical tasks carry concrete test code; remaining tasks carry exact files + the specific assertions to write (not "write tests" - the behaviour to pin is named). Greenfield charting/index are explicit stop-and-report decisions, not placeholders.

**Type consistency:** `insightsScope`/`assertInsightsAccess` (A2) used in A7/B3; `behaviouralGateOpen` (A6) used in A6/A7/A8; endpoint contract (2.7) shapes match B1 schemas; `redeemedAt`-bucketing + `isValidated=true` confirmed-discriminator consistent across A4/A5/2.2.

---

## 16. Plan-review record (7-lens, post-authoring)

A fresh seven-lens adversarial review ran against this plan (decision/spec fidelity; source/data semantics; authz/security; privacy/legal-gate; prototype/visual; performance/migration/rollback; background implementability). All must-fix + clearly-correct should-fix integrated:
- **Gate scope corrected (must-fix):** `comparison` and `distinct-customers` are OPERATIONAL (within-period counts), not behavioural - removed from the gate; only repeat-rate + new-vs-returning + the event-level export are gated (§2.5, §2.7, A6, A7, §15).
- **Raw-SQL tests are integration (must-fix):** aggregation/reconciliation/London-DST/scope/cross-tenant/cleanliness/gate-not-queried tests run against a real DB (`.integration.test.ts`), not mocked-Prisma `where`-object asserts; a test-harness note was added (§1, A1-A11).
- **`$queryRawUnsafe` precedent corrected (must-fix):** `computePopularityScores` uses `$queryRawUnsafe`; Insights uses tagged-template `$queryRaw` for client-influenced values (§1, A4, A8).
- **Index CREATE-lock risk (must-fix):** plain `CREATE INDEX` write-locks a large table; the `CONCURRENTLY` option + sizing/timing + the `BranchOpeningHoursPending` partial-index caveat + eligible-volume query plans (A9, §10, §11).
- **`/report` guarded + client-rendered (must-fix):** chosen client-rendered, aggregate-only, event-rows gated; fresh authz on every route incl. export (§2.7, A7).
- **Cleanliness completeness (should-fix):** the eligible rule now includes `branch.isTestData`/`merchant.isTestData`; QA-email predicate case-folded + empty-list guard (§2.1, A3).
- **Prototype visual negatives (should-fix):** banned sub-headline / trend subtitle / validation "honoured" / "Value delivered" card / "always all locations" caption / anonymity banner; six daypart labels (not the prototype's four); warming-up surface; by-type stacked ShareBar (B4-B8).
- **Demo isolation hardened (should-fix):** non-bypassable, merchant-allowlisted, isTestData-only, call-time throw in production; gate-open justified by PR-0a D5 (§2.6, A6, A10).
- **Misc:** `/validation` method = `isValidated AND validationMethod NOT NULL`; CSV per-row status Confirmed/Awaiting + cap/no-silent-truncation; `resolveMerchantContext` fresh per request; `/branches` no sibling enumeration; §21.6 item-6 data audit (A11); legal-content guard in 0b.1; PR-C bullets tagged to PR-0a D2; busy-times day `Mon=0` pin; `last_3m`/`last_6m` boundary assertions.

Final dash/style sweep clean; no decision reopened; no qualified legal output manufactured; PR-C remains non-executable.

### 16.1 Codex re-review amendments (post-PR-open; head re-issued)
Five Codex amendments + one owner lifecycle decision integrated (closed scope; spec + plan only):
1. **Lifecycle (owner decision A - preserve SEC-M2):** Insights requires `Merchant.status==='ACTIVE'` server-side before any query (`assertMerchantActive`, throwing a single typed `MERCHANT_NOT_ACTIVE`); SUSPENDED keeps its suspension screen (no data; no bypass resolver); pre-live/INACTIVE/DELETED server-blocked; six-status server tests asserting the typed code; frontend hiding is not the boundary. Plan §2.4/A2/A7/B8 + spec §2.1/§7.2/§7.3/§11.
2. **Per-KPI comparison:** each KPI carries its own comparison (cur/prev/pct/label/availability); incomplete period → all null; repeat-rate's value AND comparison are gated; operational comparisons ungated. §2.5/§2.7/A4/B1/B4.
3. **Busy-times sparse-cell:** added PR-0a D6 (exact-vs-intensity-vs-hidden + thresholds + anti-inference); until then a server-side safe fallback (intensity-only, no exact sparse counts, raw counts/peak never reach the browser); route/payload anti-bypass test (in A4). §3 D6/A4 + spec §1.7.
4. **Performance-data isolation:** removed the shared-staging fake-`isTestData=false` bulk load; require an isolated ephemeral/local DB, a temporary Neon branch/schema, or an approved sanitised snapshot; isolation proof + row counts + cleanup + no secrets in docs/logs + stop-and-report before any environment creation. §10.
5. **PR-0b legal rollback:** roll-forward is the default after an effective legal release; no version decrement/copy rollback without owner/qualified-review approval; accepted-version + re-consent impact assessed first. §11.
The umbrella spec was correspondingly amended (lifecycle + busy-times sparse-cell) in the same docs PR.

### 16.2 Third self-review - amendment-consistency fixes integrated
A fresh six-lens adversarial self-review of the amended plan + spec (lifecycle-authz; per-KPI comparison; busy-times sparse-cell; performance-data isolation; legal roll-forward; cross-doc consistency) returned 1 must-fix + 6 should-fix + 3 nits; perf-isolation and legal-roll-forward came back clean. All were integrated (closed scope; consistency-strengthening only):
- **Busy-times safe-fallback wording (must-fix):** A4 said "no exact sparse counts **below a conservative default threshold**", which (a) implied exact counts ARE shown above a threshold and (b) pre-empted the PR-0a D6 threshold decision. Rewritten to the spec's pure-intensity fallback: **intensity-only for every cell, never exact counts**, badge conservatively omitted, the badge/cell threshold **deferred to D6** (§A4, matches spec §1.7).
- **Active-merchant gate added to the chain-enumeration sites (should-fix):** spec §15.3 `[LOCKED]` contract-rules first bullet, spec §15.2 server-rendered `/report` guard list, and plan §2.7 endpoint-contracts header all now list `assertMerchantActive` / `Merchant.status==='ACTIVE'` so an implementer building strictly to those lists cannot leave the gate as a UI-only block.
- **Per-KPI comparison consistency (should-fix):** spec §15.2 `/overview` sketch no longer carries a single trailing "+ comparison"; it now states **each KPI (and savings) carries its OWN nullable comparison**, repeat-rate's value AND comparison gated, final shape in plan §2.7. Plan §2.5's NOT-gated line qualified to **operational** comparison deltas (repeat-rate's comparison gated with its value).
- **Traceability (should-fix):** the busy-times sparse-cell anti-bypass test lives only in A4; dropped the inaccurate "/A7" from the three citations (§3 D6, §15, §16.1).
- **Typed lifecycle error code (nit):** `assertMerchantActive` throws a single typed **`MERCHANT_NOT_ACTIVE`**; the A7 six-status test asserts the exact code/shape, not just absence of data.
- **Style (nit):** spec §7.1 role-matrix glyphs replaced with text (`Yes`/`No`) per the no-emoji rule.

Final dash/style sweep clean; no decision reopened; no qualified legal output manufactured; PR-C remains non-executable.
