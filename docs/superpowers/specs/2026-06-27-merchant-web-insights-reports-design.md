# Merchant Portal - Insights & Reports: Umbrella Design Specification

**Status:** Tier-3 umbrella specification (design only). NOT an implementation plan, NOT implementation-authorised.
**Date:** 2026-06-27 (v1.0)
**Owner:** Redeemo
**Tier:** 3 (new merchant-facing surface + new backend aggregation contracts + likely additive index/migration + a privacy/legal programme).
**Governing inputs (all reconciled in this document):**
- The completed and patched **Owner Decision 1-15 record** + the **logged-primary dual-layer counting-model replacement** (this session, 2026-06-27).
- The **Insights & Reports discovery + legal/privacy audit** (this session): source cross-check, prototype cross-check, privacy-policy reconciliation, Codex re-reviews.
- The **prototype** (`Redeemo for Business - Merchant Portal`, Claude Design project `09a77423-…`), the full `Redeemo for Business.dc.html` source, the live `Demo: Live, established` drive (Owner / Branch manager / Staff), and the ten stable screenshots in `docs/superpowers/prototype-references/merchant-web-insights-reports/`.
- The **merchant-portal product blueprint** `docs/design/merchant-portal/upload-bundle/2026-06-16-merchant-portal-product-blueprint.md` §4-5.6/§8/§13.
- **Current live code on `main` @ `bc065db5`** (re-verified for this spec).

**This specification preserves the full programme** (governance, legal, backend, frontend, gated demographics, Phase-4) so Insights does not become a partially-completed module. It is deliberately not a thin PR-A-only document.

**Hard scope rules for the spec PR itself:** docs-only. No schema, migration, app/backend code, legal-policy text, fixtures, data, staging, provider, or production changes. No implementation plan. No merge. The ten existing screenshot PNGs are added unmodified in the same docs PR so they are no longer at risk of loss.

**Status legend used throughout:** **[LOCKED]** owner product decision · **[ENG]** engineering recommendation (refinable in the plan) · **[LEGAL-GATE]** qualified privacy/legal review output (the spec does not decide it) · **[DEFER]** deferred work with a trigger.

---

## 0. How to read this document

Insights & Reports is the merchant's deep-reporting surface (analytics surface #4 of four - Home glance, per-voucher, Redemptions operational, and this). It is sequenced as **M5** in the merchant-web build. The substance is governed by the 15 locked decisions in §1; everything else (evidence, code, data model, API, tests, programme) supports implementing them faithfully and safely.

Two framings dominate and must never be violated:
1. **Logged-primary dual-layer counting** (§1, §4): the headline is **"Redemption activity"** (eligible *logged* redemptions); **Confirmed** (validated) is a subset; **Awaiting confirmation** is the remainder; validation is deferred and non-blocking. Logged activity is never called honoured/completed/delivered/purchased or treated as proof of physical presence.
2. **The demographic legal gate** (§13, §14): age/gender/location analytics are product-approved but cannot be built into reachable behaviour or processed against real data until governance, qualified legal review, approved legal artefacts, policy implementation, suppression testing, and privacy gates all clear. **Release 1 ships non-demographic Insights only.**

---

## 1. Resolved decisions (Decisions 1-15 + counting model, verbatim in substance)

### 1.0 Standing baseline (locked earlier, not reopened) - [LOCKED]
- **Staff are excluded from Insights** (nav-level; no Insights route reachable as Staff).
- **Branch-Manager analytics are server-side branch-scoped** (`resolveMerchantContext` / `allowedBranchIds`; the frontend never grants authorization).
- **`redeemedAt`** governs visit / trend / busy-time membership; **`validatedAt`** is used only for validation timing.
- The earlier **"validated-only headline"** assumption is **SUPERSEDED** by the counting-model replacement below.

### 1.1 Counting-model replacement - Logged-primary dual-layer - [LOCKED, pivotal]
- Headline metric renamed **"Redemption activity."** **Logged activity** = an eligible customer created a redemption after passing the branch-PIN and all redemption guards - strong PIN-gated activity, but **not** proof of physical presence, a purchase, completion, or that the merchant honoured the offer (tooltip explains).
- **Three separated figures everywhere:** **Logged activity** · **Confirmed** (validated) · **Awaiting confirmation** (logged, not yet validated). **Confirmed + Awaiting = Logged** for every cut.
- **Validation is deferred and non-blocking:** forgetting to validate never removes activity from headline analytics; never blocks customer use, merchant access, reports, or Insights; the completion rate is **informational, not punitive**.
- **Dataset mapping:** Redemption activity, Distinct customers, Repeat-customer rate, New-vs-returning, voucher/branch activity, trends, busy-times → **eligible logged rows**; savings → §1.12 (Decision 11); reports/exports show logged + confirmed + awaiting distinctly; test/QA and `DELETED` excluded; branch-scoped; no revenue/ROI.

### 1.2 Decision 1 - Sequencing - [LOCKED]
Ship **non-demographic Insights first**; hold demographics behind the full privacy/legal gate. New-and-returning is **behavioural** (ships in release 1 after the bounded review); gated demographic scope = **age groups, gender, location/catchment only**; if a Customers tab appears in release 1 it shows only the approved New-and-returning section; **no age/gender/location placeholders** implying imminent launch.

### 1.3 Decision 2 - Headline metric: Repeat-customer rate - [LOCKED]
Repeat-customer rate is the third headline KPI. **Copy (patched):** "% of distinct customers in the period who **already had eligible logged redemption activity** with this merchant before the period began." Never revenue/ROI/spend/profit. £ estimated savings demoted to a secondary stat (§1.12). New customers reached lives in the New-and-returning section. New/sub-threshold cohort → **"Building your repeat-customer picture"** (not a misleading 0%). Comparison + branch/voucher filters apply consistently; Branch Managers see only allowed-branch customers (server-enforced); carries the bounded behavioural review. **Amendment:** repeat-rate uses **eligible logged** history (returning = prior eligible logged redemption activity), per §1.1.

### 1.3a Cross-cutting UX requirement (recorded) - [LOCKED]
Every potentially-unclear card / stat / comparison chip / chart label / state has a **short plain-English explanation**, reachable by **desktop hover + keyboard focus + click/tap on touch**, with **accessible dismissal/focus and no hover-only reliance**; covering meaning, what is counted/excluded, that the headline uses logged activity (validated = a confirmed subset), how the date/branch/voucher filters affect it, scope, estimate caveats, and any privacy/suppression limitation. Uses the merchant-web design system + accessible popover semantics. Full requirement in §12.

### 1.4 Decision 3 - Period comparison: completed-month-only - [LOCKED]
"This month" shows live month-to-date figures labelled **"so far this month"** with **no up/down chip** (may appear as an in-progress bar); "Last month" compares with the completed month before; Last 3/6 months and completed custom ranges compare with the immediately-preceding equal completed period; **half-open Europe/London** boundaries; neutral language for decreases; tooltip explains why no comparison on an incomplete month and which completed periods are compared. **Custom-range patch (Decision 3 addendum):** a custom range **may include the current incomplete month** - it is **allowed**, shows live data, is **visibly marked in progress**, and is never silently rejected/truncated/removed; while the selected range contains an incomplete month, **no up/down comparison chip** is shown; fully-completed custom ranges may compare with the immediately-preceding equal completed range.

### 1.5 Decision 4 - New vs returning: by history / status at period start - [LOCKED]
Over **eligible logged activity**: **"Already a customer"** = ≥1 eligible logged redemption before the period; **"New to you"** = first eligible logged redemption inside the period (first+second both in-period → still "New to you"); mutually exclusive; sum exactly to Distinct customers; no "came back again" wording; identical to the logged-history repeat-rate KPI. **History scoping:** current cohort uses the active filters; historical status uses the **same effective branch scope** (Owner all-branches → merchant-wide; Owner selected branch → that branch; Branch Manager → only authorised scope, never sibling history); **voucher-type selects the current cohort, but the prior-history check spans all voucher types** within the effective branch scope (so "New to you" = new to the merchant/branch, not new to a voucher type). **Reconciliation:** the Repeat-customer-rate KPI denominator is the **same voucher-type-filtered distinct-customer cohort** as this split, so **Already-a-customer + New-to-you = the repeat-rate denominator = Distinct customers** for the active filters; only the *status* lookback (whether they were a prior customer) spans all voucher types within the effective branch scope.

### 1.6 Decision 5 - Reports/exports - [LOCKED]
Ship a **"Redemption activity CSV excluding direct customer identifiers"** + a **printable HTML performance summary**. CSV: active filters + server branch scope; operational fields (date/time, voucher, branch, type, estimated value, logged/confirmed/awaiting status, validation method); **excludes direct identifiers** (name, email, phone, userId, exact address, postcode, per-customer demographics); wording is the truthful narrower **"No direct customer identifiers are included"** (never "no personal data ever"), and it **retains the warning** that event-level date/time + branch + voucher + method combinations may still constitute personal/identifiable information; formula-injection protection + an explicit row cap. Printable summary: same filters + scope; separates Logged/Confirmed/Awaiting; accessible labels + print stylesheet; a "Print or save report" action (browser Save-as-PDF); states date range, branch scope, voucher filter, generation date. **Deferred:** no server-side PDF infra and no "email me" promise in v1.

### 1.7 Decision 6 - Busy times: six London-local dayparts - [LOCKED]
Owner-facing labels and exact half-open Europe/London implementation intervals: **Overnight `[00:00, 07:00)` · Morning `[07:00, 12:00)` · Lunch `[12:00, 15:00)` · Afternoon `[15:00, 18:00)` · Evening `[18:00, 22:00)` · Late `[22:00, 24:00)`**. No gaps/overlaps; no activity dropped/folded; after-midnight belongs to its **actual London calendar day** (not the previous evening); described as "when activity was **logged**"; active filters + server scope; six-column layout responsive without removing buckets; sparse-cell treatment (exact / intensity-only / insufficient-data) reserved for the bounded privacy review; tooltip explains hours, timezone, logged meaning, after-midnight behaviour, and privacy. A **"Busiest: <day> <daypart>" badge** + highlighted peak cell is **kept** (computed from logged activity); if the peak cell is below the sparse-cell threshold it is **omitted** rather than naming a near-empty peak.

### 1.8 Decision 7 - Validation-method breakdown: adaptive - [LOCKED]
Hidden when only one method has non-zero data; auto-displays when ≥2 methods have data; no empty/0% legend entries; the rest of the Validation tab (Logged / Confirmed / Awaiting / completion) always shows. **`ValidationMethod` = PIN / QR_SCAN / MANUAL** - render every recognised method with data (labels "PIN" / "QR scan" / "Manual entry"); unknown future values fail safe (never mislabelled); never imply QR is available until the mobile app emits `QR_SCAN`. Applies filters + server scope; tooltip explains methods and why the chart may be absent.

### 1.9 Decision 8 - Branch-Manager presentation: scope-aware - [LOCKED]
Filter = only server-authorised branches; one branch → static **"Viewing: <Branch>"** (no dropdown); multiple → default **"All my branches"**, selectable only from authorised branches; **never** the merchant-wide "All branches"; the Branches tab compares only authorised branches and **never reveals sibling names/counts/rankings/empty-state clues**; reports/exports inherit the same scope; **every backend request re-resolves live membership/permissions** (frontend never grants authz); crafted/stale/removed branch IDs must not widen access or leak whether another branch exists; permission changes take effect without a stale frontend list; accessible scope tooltip explains what "All my branches" includes. **Branch-scope semantics (shipped model):** the effective scope is **all of the merchant's branches** when `allBranches=true` (legitimate for a `BRANCH_MANAGER` too - an owner may grant an all-branches manager, normally with `allowedBranchIds=[]`) and **only `allowedBranchIds`** when `allBranches=false` (an empty specific set **fails closed**, never widened). "All my branches" is the manager's label (distinct from the owner's "All branches") and, for an all-branches manager, covers every branch of that merchant; the merchant tenant boundary is always applied so no role crosses tenants (§7). An existing all-branches manager is **not** demoted to empty scope.

### 1.10 Decision 9 - "All time": all available history, disclosed - [LOCKED]
Includes all retained eligible activity for the merchant + the viewer's authorised scope; **never** a silent product/performance cap under the "All time" label; shows the actual earliest included date ("Showing available activity since <month/year>"); a future retention limit must disclose its boundary; if retained history is shorter than account lifetime, prefer the label **"All available history"**; **no comparison chip**. Engineering: query/index/cache/rollup must support the range safely, validated with representative query plans + realistic volume; **stop-and-report rather than silently truncate**; CSV row caps stay explicit and separate from dashboard aggregates. The lawful retention/deletion model remains a [LEGAL-GATE].

### 1.11 Decision 10 - Customers tab in release 1: New-and-returning only - [LOCKED]
Tab carries repeat-customer-rate context, the "Already a customer / New to you" split, New customers reached, the logged-activity/filter/scope explanations, insufficient-history + insufficient-cohort states, and accessible tooltips for every cohort/percentage. Demographic sections **entirely absent** - **no** disabled cards, skeletons, "coming soon" copy, or placeholders; when demographics clear all gates, the existing tab **expands** (the behavioural section is not moved or redesigned). The five-tab structure stays stable; filters + server scope; the bounded behavioural review is preserved; the tab is useful and visually complete without demographics.

### 1.12 Decision 11 - Savings figure: show both, no "delivered" - [LOCKED]
**"Estimated customer savings"** = sum of `estimatedSaving` across eligible **logged** activity; **"Estimated savings on confirmed redemptions"** = the confirmed subset (shown clearly as a subset of the logged figure); the gap = **"Estimated savings awaiting confirmation"** (not undelivered/rejected). The word **"Delivered" is dropped entirely** (`estimatedSaving` stays an estimate even after validation). Never revenue/spend/profit/ROI/exact-till; validation context is informational and **non-punitive**; active filters + server scope; tooltip explains the estimate's source, why it may differ from the actual till saving, logged vs confirmed, and why awaiting ≠ not-honoured; identical terminology across cards, charts, printable reports, and CSV.

### 1.13 Decision 12 - Early-life state: live immediately, per-section - [LOCKED]
Pre-live stays lifecycle-locked; once live, the module is accessible immediately; never hide activity behind a whole-module threshold; **no eligible logged activity at all → the "Your insights are warming up" empty state**; as soon as eligible activity exists, real figures show. Each section independently shows one of: a **real value** · a **truthful 0** (when zero is the measured result) · **"Building your picture / Not enough data yet"** (reliability/privacy thresholds unmet) · **"Not available"** (data source absent or not meaningful) · a **distinct loading** state · a **distinct friendly error** with retry. Never use "not enough data" to mask an actual zero; never show 0 when the metric cannot yet be calculated; no punitive/decline-shaming language; a **forgotten validation must not trigger a module-wide warming-up state when logged activity exists**; filters + authorised branch scope stay available where meaningful; accessible explanations for every unavailable/insufficient state; demographic sections remain absent behind their gate.

### 1.14 Decision 13 - Trend chart: logged total + confirmed subset overlay - [LOCKED]
Logged activity is the total primary series; confirmed is a **subset** of logged (never an additive second total); **confirmed + awaiting reconcile exactly to logged** each month; no stacking that double-counts; each bar = total logged with the confirmed portion shown within/over it and the remainder = awaiting; clear legend + accessible text/table equivalent; awaiting uses **neutral, non-punitive** colour/copy; an optional series toggle is allowed but the default communicates the logged total clearly. **Deferred validation:** later validation may **increase a historical month's confirmed portion**, while that row's logged total and its `redeemedAt` month stay unchanged (tooltip explains). **Bucketing (MUST):** both logged and confirmed are bucketed by **`redeemedAt`** London-month; `confirmed` for a month = `COUNT` of that month's `redeemedAt` rows with `isValidated=true` (it is **not** bucketed by `validatedAt`), so confirmed is always a subset of that same month's logged and can never exceed it. (Note the asymmetry: deferred *validation* leaves the logged total unchanged, but a `DELETED`-exclusion/erasure can still lower a historical **logged** total - §4.4 - so completed-month logged totals are not strictly immutable.) Applies active filters + server scope + completed-month-only comparison + an in-progress current-month bar + Decision-12 states.

### 1.15 Decision 14 - Vouchers/Branches rankings - [LOCKED]
Rank by total **eligible logged** activity; confirmed shown as a smaller secondary subset per row; confirmed + awaiting reconcile to logged; **never rank by confirmed-only** (forgotten validation must not make a genuinely active voucher/branch look unsuccessful); no unqualified "delivered". Vouchers: top vouchers by logged; **voucher-type share % uses the logged denominator**; confirmed + Decision-11 estimated-savings shown as secondary; tooltip explains REUSABLE produces multiple activity rows from one customer (activity ≠ distinct customers). Branches: rank by logged; server scope; **Branch Managers see only authorised branches and never sibling names/counts/rankings/empty-state clues**. A **deterministic, documented secondary sort for ties**; neutral non-punitive confirmation info; Decision-12 states; accessible tooltips.

### 1.16 Decision 15 - "By voucher type": seven merchant-facing types - [LOCKED]
Labels: **Buy one, get one free · Spend & save · Discount · Freebie · Package deal · Time limited · Reusable**. `DISCOUNT_FIXED` + `DISCOUNT_PERCENT` = **Discount** (the two technical enums are not separate top-level merchant-facing categories; the fixed/percent distinction may be a tooltip or future drill-down). The voucher-type share % uses the **logged denominator**; confirmed as secondary; labels/colours consistent with the customer app + merchant voucher picker; omit types with no activity (no misleading %); a single active voucher-type filter must **not** show an unexplained 100% share - show a clear selected-type state or other useful lower-level context; tooltip explains grouping, denominator, filters, and the fixed/percent merge.

### 1.17 Reserved for qualified review (NOT decided in this spec) - [LEGAL-GATE]
Article 6 lawful basis (+ LIA if legitimate interests); the **effective-anonymisation / identifiability** determination; the merchant **controller / processor / joint-controller / recipient** role per purpose; **final suppression thresholds** + anti-inference policy; the lawful **retention + Article-17 erasure** model; **notification / effective-date / re-consent** approach; and resolving the documented **privacy-policy / FAQ / consent / merchant-terms contradictions**. The bounded behavioural review (repeat/new-customer profiling) is the lighter check gating release 1; the full DPIA gates the demographic release.

---

## 2. Evidence & prototype cross-check

**Evidence basis:** the full `Redeemo for Business.dc.html` source (1.48 MB, including the Insights compute logic), the live `Demo: Live, established` drive across Owner / Branch manager / Staff (this session), and the ten stable screenshots. Screenshots and listed features are **anchors, not the full surface** - the spec governs intent.

### 2.1 Demo states → implementation
| Prototype state | Implementation mapping (§11) |
|---|---|
| Live, established (populated) | The normal live module: KPI cards, trend, five tabs, two reports |
| Live, just started ("Your insights are warming up", screenshot 01) | Live-with-no-eligible-activity empty state (Decision 12) |
| Setting up / Submitted / In review / Changes needed (pre-live) | Lifecycle-**locked** "unlocks when you go live" |
| Suspended | Established dashboard, **read-only**, banner |

### 2.2 Roles → behaviour (verified live)
| Role | Insights behaviour |
|---|---|
| Owner | Full authorised merchant-wide scope; "All branches" option |
| Branch Manager | **Server-scoped to authorised branches** (Decision 8). *Prototype divergence:* the prototype showed a manager the full owner view ("All branches", £609, 41) - a **prototype simplification corrected here** (intentional divergence, §2.4). |
| Staff | **No Insights access** (nav excludes it) |

### 2.3 Screenshot → spec coverage
| # | Screenshot | Spec section(s) |
|---|---|---|
| 01 | empty / live-just-started | §11 (warming-up) |
| 02 | overview / live-established | §5 KPIs (with metric-fork + dual-layer changes), §6 filters, §8 tabs, §9 trend |
| 03 | period-filter-menu | §6 (six presets + custom) |
| 04 | custom-range filters + trend | §6 (custom month range incl. current month, §1.4 patch) |
| 05 | vouchers breakdown + reports | §9 rankings, §10 reports |
| 06 | branches performance + reports | §9 branch ranking, §7 BM scope (corrects "always all locations"), §10 reports |
| 07 | customers new/returning/age/gender | §8 Customers (release-1 = New-and-returning only; age/gender **gated**, §14) |
| 08 | customers demographics/location | §14 (gated; absent in release 1) |
| 09 | busy-times heatmap | §1.7 / §9 (six dayparts replace the prototype's four) |
| 10 | validation breakdown | §1.8 / §9 (adaptive; dual-layer validated/awaiting) |

### 2.4 Recorded prototype divergences (with reason + status)
| Prototype | Divergence | Reason | Status |
|---|---|---|---|
| Headline "Redemptions" (synthetic from `CANON_REDS=318`) | Renamed **"Redemption activity"**, logged-primary dual-layer, real aggregation | Validation is deferred/non-blocking; validated-only would hide genuine activity | [LOCKED] intentional |
| KPI #3 "Value delivered to customers (£)" | Replaced as headline by **Repeat-customer rate**; £ demoted to "Estimated customer savings" (logged) + confirmed subset; "Delivered" dropped | £ saved is an estimate, frames give-away not gain; no till spend exists | [LOCKED] intentional |
| "This month" vs full prior month | **Completed-month-only**; no chip on incomplete months/ranges | Prototype comparison was partial-vs-full, misleading | [LOCKED] intentional |
| New vs returning (faked 61/39) | Real status-at-period-start definition over logged history | Prototype had no real definition | [LOCKED] intentional |
| Busy-times: 4 daytime dayparts, undefined hours, synthetic | **Six** half-open London dayparts covering 24h, from real `redeemedAt` | Four buckets dropped off-hours activity; hours undefined | [LOCKED] intentional |
| QR-vs-manual split (faked 58/42) | **Adaptive** method chart; today degenerate (all MANUAL) so hidden | `QR_SCAN` only from the unbuilt Phase-4 app | [LOCKED] intentional + [DEFER] QR |
| Branch manager = owner view | **Server-scoped** presentation | Tenant isolation; §2.2 | [LOCKED] intentional |
| "Monthly performance report" = `.txt`; "email you" | Printable HTML summary; no server PDF; no email promise | No PDF infra; email is a provider/legal decision | [LOCKED] v1 + [DEFER] |
| Customers tab shows demographics | Release 1 = New-and-returning only; demographics absent | Legal gate | [LOCKED] + gated (§14) |
| "no customer personal data is ever included" (CSV) | "No **direct customer identifiers** are included" + identifiability caveat | Even event-level combinations may be identifying | [LOCKED] corrected |
| `MIN_SLICE=4` / `<8` suppression | Recommendation pending DPIA; server-side; anti-inference | Thresholds are a [LEGAL-GATE] output | gated (§14) |
| Page sub-headline "Every figure counts **validated** redemptions only … visits you actually **honoured**" | REPLACED with logged-primary copy (no "validated … only", no "honoured") per §1.1 | Both are banned framings | [LOCKED] intentional |
| Trend subtitle "**Validated** redemptions per month" (validated-only single series) | REPLACED: logged-total primary + confirmed-subset overlay (§1.14); subtitle reworded to logged activity | Validated-only single series | [LOCKED] intentional |
| New-and-returning labels "Returning customers" / "39% **came back to redeem again**" | REPLACED: "Already a customer" / "New to you" (no "came back again") (§1.5) | Banned wording | [LOCKED] intentional |
| Validation card "Validated redemptions are **honoured**" | REPLACED: "Confirmed = validated by staff; Awaiting = logged, not yet confirmed" (no "honoured") (§4.2) | Banned framing on an always-rendered card | [LOCKED] intentional |
| "Busiest: <day> <daypart>" badge + highlighted peak cell | KEPT (logged-based); omitted if the peak cell is below the sparse-cell threshold (§1.7) | Prototype feature, recorded | [LOCKED] kept |
| Report card "the same summary **we can email you**" | DROPPED in v1; printable HTML summary only (§10) | Email is a provider/legal decision | [LOCKED] v1 + [DEFER] |
| Report card "**No customer personal data** is ever included" | REPLACED: "No direct customer identifiers are included" + identifiability caveat (§10.1) | Event-level combinations may be identifying | [LOCKED] corrected |

---

## 3. Current-code cross-check (re-verified on `main` @ `bc065db5`)

### 3.1 What exists / reusable / greenfield
- **Reusable authz spine:** `resolveMerchantContext(prisma, adminId)` → `{ adminId, merchantId, role(OWNER|BRANCH_MANAGER|STAFF), allBranches, allowedBranchIds, canManageVouchers }` (`src/api/merchant/shared.ts:124-142` - type + function), with live SEC-M2 suspended-merchant block; `assertBranchAllowed` (`shared.ts:150-152`); the `scopeBranchIds(ctx)` pattern (`src/api/merchant/redemptions/routes.ts:11-13`, returns `null`=all or `allowedBranchIds`, intersected server-side). **Insights reuses `resolveMerchantContext` + the `scopeBranchIds(ctx)` semantics**, which are **correct for the shipped model** (verified: `schema.prisma:230` `allBranches @default(true)`; `shared.ts:151` `assertBranchAllowed` and `:163` `assertCanManageBranch` both honour `BRANCH_MANAGER + allBranches=true`; `merchant/staff/service.ts` invite/update schemas permit `BRANCH_MANAGER + allBranches=true`, with a branch list required only when `allBranches=false`): `allBranches=true` authorises **all of the merchant's branches** for OWNER **and** BRANCH_MANAGER (an all-branches manager normally has `allowedBranchIds=[]`); `allBranches=false` restricts to `allowedBranchIds`. The **merchant tenant boundary** `branch.merchantId = ctx.merchantId` is **always** applied, so a `null` branch-scope means "all of THIS merchant's branches", never cross-tenant. The only Insights additions are a **server-side Staff deny** and an **empty-specific-scope fail-closed** check (§7.2).
- **Reusable export precedent:** `GET /api/v1/merchant/redemptions` + `/lookup` + `/export.csv` (`redemptions/routes.ts`); `filterSchema` = branchId / status(awaiting|validated) / from / to / voucherType(8) / voucherId / code / limit / offset; `EXPORT_CAP=50000` (`redemptions/service.ts:101`); formula-injection `csvCell` (`:114`); `customerName` first+last-initial (`src/api/shared/customerName.ts`). **The Insights CSV is a SEPARATE, stricter artefact (no Customer column, §10).**
- **Reusable cleanliness:** `isTestData` columns on VoucherRedemption/Voucher/Branch/Merchant; `QA_ACCOUNT_EMAILS` + `isQaAccountEmail` (`src/api/customer/discovery/qaAccountFilter.ts`).
- **Reusable aggregation shape (pattern only):** `prisma.voucherRedemption.aggregate({ _sum:{ estimatedSaving } })` + `Number()` coercion (`src/api/customer/savings/service.ts`) - but per-USER, **no** `isValidated`/`isTestData` filter, and **UTC** month windows (the timezone trap).
- **Greenfield:** no `src/api/merchant/insights|analytics|reports` module; no groupBy-by-day/type/branch/hour; no period-over-period delta; **no London date-range helper** (`londonClock.ts` returns only `{dayOfWeek, minutes}`); **no charting library** + no chart tokens in merchant-web; **no period-preset picker** (only raw `<input type=date>` in `RedemptionFilters.tsx`); **no PDF**; **no general Redis cache convention**; **no k-anonymity/suppression utility**; **no Gender enum**; **no admin-analytics precedent**. merchant-web nav has an **Insights & reports stub `href:'#'`** (`apps/merchant-web/components/shell/navItems.ts:16`).

### 3.2 Route / model / field / index / test inventory
- **Models/fields (analytics-relevant):** `VoucherRedemption`{userId, voucherId, branchId, validatedById?→BranchUser, validationMethod?, isValidated(default false), validatedAt?, estimatedSaving Decimal(10,2), redeemedAt(default now), windowStartsAt?, isTestData} - **no merchantId**; `Voucher`{merchantId, type, title, estimatedSaving, isRmv, status - no categoryId/discountKind}; `Branch`{merchantId, name, city, postcode, localityId?, localityName, postTown, ladDistrict, region, latitude/longitude, isActive, lifecycleStatus, isMainBranch, isTestData}; `Merchant`{status, primaryCategoryId?, businessName, isTestData}; `User`{dateOfBirth?, gender String?, postcode?, localityId?, city?, latitude/longitude?, createdAt, status(UserStatus incl **DELETED**)}; `MerchantMembership`{role, allBranches, canManageVouchers, status} + `MerchantMembershipBranch`; `Locality`{name, postTown?, ladDistrict, region?}; `Review`{redemptionId? @unique}.
- **Enums:** `VoucherType`(8), `ValidationMethod`(**PIN/QR_SCAN/MANUAL**), `UserStatus`(ACTIVE/INACTIVE/SUSPENDED/**DELETED**), `MerchantRole`(OWNER/BRANCH_MANAGER/STAFF); **no Gender enum; no RedemptionStatus** (state = `isValidated` bool + `validatedAt`).
- **Indexes on `VoucherRedemption`:** userId, voucherId, branchId, redeemedAt, [userId,voucherId], redemptionCode, isTestData, unique[userId,voucherId,windowStartsAt]. **Gap:** no `[branchId,(isValidated,)redeemedAt]`; `isValidated`/`validatedAt` unindexed (see §16).
- **Routes (precedent):** `merchant/redemptions/{routes,service,format}.ts`; helpers `shared/customerName.ts`, `discovery/qaAccountFilter.ts`. **merchant-web:** `components/shell/navItems.ts`, `components/redemptions/*`, `lib/redemptions/display.ts` (uses `Intl en-GB` **without** `timeZone:'Europe/London'` → browser-local; must NOT be mirrored).
- **Tests (patterns to mirror):** `tests/api/merchant/redemptions/*`, `tests/api/redemption/*`. No analytics tests exist. **No realistic validated-redemption fixture** (seed: all `isTestData:true`; one validated row; seed users lack DOB/gender).
- **Legal mechanics:** `apps/customer-web/lib/legal.ts` (`LEGAL_VERSION='1.0'`, `LEGAL_EFFECTIVE_DATE`) ↔ `src/api/shared/legal.ts` (`TERMS_VERSION='1.0'`), guard-test-enforced parity; `User.tcConsentVersion` recorded at signup; static legal pages `apps/customer-web/app/{privacy,terms,cookies}` (CmsContent is unwired/placeholder).

---

## 4. Canonical analytics dataset

### 4.1 "Eligible logged redemption activity" (the canonical base) - [LOCKED + ENG]
A `VoucherRedemption` row counts as **eligible logged activity** for a merchant iff:
- it belongs to the merchant via `branch.merchantId = <merchant>` (the join path; there is **no `merchantId` column** - see §16);
- **`isTestData = false`**;
- the customer is **not** a QA account (`isQaAccountEmail(user.email)` is false - the seed customer redeeming via the live API produces `isTestData=false` rows, so this filter is required to match the Popular/Trending cleanliness definition);
- **`user.status != 'DELETED'`** (added per the deleted-customer rule, §4.4).

This is the **single canonical production rule**, reused by **every** Insights query and export (§5.6, §15). It is enforced **server-side** and is **not toggleable** in production (§17). **Mechanism notes:** `isTestData=false` and `branch.merchantId` are relational WHERE predicates; the **QA-account exclusion is not a column filter** - it resolves to a parameterised SQL predicate over `user.email` (§15.3); `Confirmed` is discriminated strictly by **`isValidated=true`** (not `validatedAt IS NOT NULL` - §4.3). Because the rule excludes `DELETED` users (§4.4), **completed-period logged totals are not strictly immutable** - a later deletion/erasure can lower a historical figure (§1.14, §4.4).

### 4.2 The dual layers - [LOCKED]
- **Logged activity** = eligible rows (per §4.1). The primary/headline layer.
- **Confirmed** = eligible rows with `isValidated = true`.
- **Awaiting confirmation** = eligible rows with `isValidated = false`.
- **Validation completion rate** = Confirmed ÷ Logged (informational; 0-safe; non-punitive).
- **Invariant:** for any identical filter/scope, **Confirmed + Awaiting = Logged**.
- **Language ban:** logged activity is **never** described as honoured, completed, delivered, purchased, or proof of physical presence (tooltip wording per §12).

### 4.3 Timestamps - [LOCKED]
- **`redeemedAt`** (set at creation): visit/trend/busy-time membership; the basis for "which period an activity belongs to". This is the **logged** time.
- **`validatedAt`** (set at validation, nullable, may lag `redeemedAt` by days/weeks): used **only** for validation timing/latency, never for period membership of the activity.
- Application-enforced convention (current code, **not** a DB constraint): `isValidated=true` is written together with `validatedAt`. **Confirmed counts MUST use `isValidated=true`** as the discriminator (not `validatedAt IS NOT NULL`). A row may be logged in one month and confirmed in a later month - that row's logged month (`redeemedAt`) never moves (§1.14 deferred-validation rule); separately, a later DELETED-exclusion/erasure can remove the row from a historical figure entirely (§4.4, §1.14).

### 4.4 Deleted-customer exclusion - [LOCKED] + [LEGAL-GATE residual]
Exclude `User.status = 'DELETED'` from **behavioural analytics, customer cohorts, trends, rankings, reports, and exports** (it is part of §4.1). **Recorded:** this is a **necessary processing guard**, but it **does not** resolve the underlying retention, erasure, historic-export, cache, backup, or future-rollup issues - those are reserved for qualified review (§13). (Source fact: customer deletion is soft-anonymisation that scrubs name/email/phone/password but **leaves `dateOfBirth/gender/postcode/localityId` and all redemption rows intact** - `src/api/auth/customer/routes.ts:209-214`.) DELETED users are removed from **both** the current cohort and the historical lookback (§1.5). **Accepted artefact:** because the exclusion is applied at query time, a deletion **retroactively lowers** previously-shown logged totals/cohorts for past periods - intentional (privacy-preserving), so historical figures are not frozen; recorded for the bounded review (§13.1).

### 4.5 Voucher-type behaviour in the dataset - [LOCKED]
- **Standard (cycle) vouchers:** one per user per cycle (atomic `UserVoucherCycleState` claim) - no within-cycle duplicates.
- **REUSABLE:** multiple eligible rows per user per cooldown → "Redemption activity" (`COUNT`) diverges from "Distinct customers" (`COUNT DISTINCT userId`); both are surfaced and the divergence is explained (§5, §9).
- **TIME_LIMITED:** one eligible row per window-occurrence (`windowStartsAt`).
- Distinct customers, repeat-rate, and new-vs-returning use `COUNT DISTINCT userId` over eligible rows; redemption-activity counts use `COUNT(*)`.

---

## 5. Metrics & reconciliation

All metrics derive from the §4 canonical dataset, are branch-scoped (§7), apply the active filters (§6), and use Decimal coercion (`Number()`).

| Metric | Definition (eligible logged unless stated) | Layer |
|---|---|---|
| **Redemption activity** (headline) | `COUNT(*)` of eligible rows in the period | Logged (with Confirmed/Awaiting subtotals) |
| **Distinct customers** | `COUNT(DISTINCT userId)` | Logged |
| **Repeat-customer rate** | "Already a customer" ÷ Distinct customers (§1.5) | Logged history |
| **New to you / Already a customer** | status at period start (§1.5); mutually exclusive; sum to Distinct customers | Logged history |
| **Estimated customer savings** | `SUM(estimatedSaving)` over eligible logged rows; labelled estimate/potential, never delivered | Logged |
| **Estimated savings on confirmed redemptions** | `SUM(estimatedSaving)` over confirmed subset (a subset of the above) | Confirmed |
| **Estimated savings awaiting confirmation** | logged-estimate minus confirmed-estimate | Awaiting |
| **Confirmed / Awaiting / completion rate** | per §4.2 | Both |
| **Voucher rankings / by-type share** | rank by logged `COUNT(*)`; type share uses the logged denominator; 7 merchant-facing types (§1.16) | Logged + confirmed secondary |
| **Branch rankings** | rank by logged `COUNT(*)`, scoped (§7) | Logged + confirmed secondary |
| **Busy-times heatmap** | logged `COUNT(*)` by (London day-of-week × six dayparts) on `redeemedAt` | Logged |

### 5.6 One shared aggregation - [LOCKED, ENG]
Overview KPIs, every tab, the reports, and the **later Home dashboard** must reconcile to **one shared backend aggregation** so figures never drift (Home total = sum across vouchers = redemption log). The aggregation is the single source of the dual-layer figures and is the only place the §4.1 cleanliness rule lives.

---

## 6. Filter & period semantics

### 6.1 Global filters - [LOCKED]
**Period preset** (six) + **branch** (scoped, §7) + **voucher type** (7 merchant-facing, §1.16). All bucketing and boundaries are **half-open `[start, end)` in Europe/London**, converted to UTC instants for querying; DST days (23h/25h) are handled by computing boundaries in Europe/London first so there are no gaps/overlaps. **Do NOT mirror** the redemptions precedent's filter, which uses a **closed, UTC** `redeemedAt >= from && <= to` on raw datetimes; Insights computes **London-local `[start, end)`** boundaries and queries `redeemedAt >= startUtc AND redeemedAt < endUtc`.

### 6.2 Period presets & comparison - [LOCKED]
| Preset | Window | Comparison |
|---|---|---|
| This month | `[1st 00:00 London, now)` - live MTD, labelled **"so far this month"**, may render as an in-progress bar | **None** (no chip on an incomplete month) |
| Last month | the completed previous month | the completed month before it |
| Last 3 months | the three completed months | the preceding three completed months |
| Last 6 months | the six completed months | the preceding six completed months |
| All time / All available history | `[earliest retained, now)`; label is **"All time"** by default and **"All available history"** when retained history is shorter than account lifetime; shows the earliest included date (§1.10) | **None** |
| Custom month range | `[From-month-first, To-month-next-first)`; **may include the current incomplete month** (§1.4 patch) - shown live + marked in progress, never rejected/truncated | If the range contains an incomplete month → **none**; a fully-completed range compares with the immediately-preceding equal completed range |

Comparison deltas use neutral, factual language for decreases (no decline-shaming). A tooltip explains why no chip appears for an incomplete month/range and which completed periods are compared (§12).

### 6.3 New-vs-returning cohort vs lookback - [LOCKED]
Current cohort uses the active date/branch/voucher-type filters. Historical status uses the **same effective branch scope** but **spans all voucher types** within that scope (§1.5). DELETED users excluded from both cohorts (§4.4).

### 6.4 Branch & voucher-type filter behaviour - [LOCKED]
Branch options are server-authorised (§7). A single active voucher-type filter must not render an unexplained 100% type-share chart (§1.16).

---

## 7. Authorization & tenant isolation

### 7.1 Role matrix - [LOCKED]
| Capability | Owner | Branch Manager (scoped) | Staff |
|---|---|---|---|
| Access Insights | ✅ all merchant branches (`allBranches`) | ✅ **all merchant branches if `allBranches=true`, else only `allowedBranchIds`** (empty specific set → no data) | ❌ (server-side deny; nav excludes) |
| Branch filter | "All branches" + any branch | **"All my branches"** (= all merchant branches if `allBranches`, else the authorised set); 1 authorised branch → static "Viewing: <Branch>"; never the owner's "All branches" label | - |
| Branches tab | all branches | **only authorised; never sibling names/counts/rankings/empty-state clues** | - |
| Reports/exports | authorised scope | same scoped + suppressed | - |

### 7.2 Isolation invariants (MUST) - [LOCKED]
- **Staff denied server-side:** every `/insights/*` endpoint asserts `ctx.role !== 'STAFF'` (→ `INSUFFICIENT_PERMISSIONS`) after `resolveMerchantContext`, **independent of the nav** (nav exclusion is UX only).
- **Branch scope (shipped model):** the effective branch scope is **`null` = all of the merchant's branches** when `ctx.allBranches` is true (legitimate for OWNER **and** BRANCH_MANAGER - matches `scopeBranchIds(ctx)`, `assertBranchAllowed`, `assertCanManageBranch`), and **`allowedBranchIds`** when `allBranches=false`. The **merchant tenant boundary** `branch.merchantId = ctx.merchantId` is **always** applied, so `null` is bounded to the merchant and never cross-tenant.
- **Fail-closed specific scope:** `allBranches=false` with an **empty** `allowedBranchIds` → **no data** (never widened to all). An existing all-branches manager is **not** silently demoted to empty scope; if eliminating all-branches managers were ever required, that is a data/access migration → **stop-and-report**, not a query-time patch.
- **Every** query and export **re-resolves live authorization** via `resolveMerchantContext` + branch-scope intersection at the WHERE level (never post-filtered in app code); the frontend indicator never grants authorization.
- A **crafted, stale, or removed branch ID** must not widen access or leak whether another branch exists (intersect with `allowedBranchIds`; out-of-scope → empty result, not an existence oracle).
- Permission changes take effect immediately (no reliance on a stale frontend branch list).
- The owner's "All branches" **control/label** is never shown to a Branch Manager (their equivalent is "All my branches") - this is a UI-label distinction, **not** a data-scope restriction (an all-branches manager still legitimately sees all the merchant's branches).
- SEC-M2 suspended-merchant block is inherited from `resolveMerchantContext`.

### 7.3 Required role / scope test matrix - [LOCKED]
| Case | Expected |
|---|---|
| OWNER, `allBranches=true` | all merchant branches |
| BRANCH_MANAGER, `allBranches=true`, `allowedBranchIds=[]` | **all merchant branches** (legitimate all-branches manager) |
| BRANCH_MANAGER, `allBranches=false`, one allowed branch | that branch only; "Viewing: <Branch>" |
| BRANCH_MANAGER, `allBranches=false`, several allowed branches | those branches only; "All my branches" = the authorised set |
| BRANCH_MANAGER, `allBranches=false`, `allowedBranchIds=[]` | **no data** (fail-closed); never widened |
| STAFF (any) | **denied** server-side (`INSUFFICIENT_PERMISSIONS`) |
| Any role, crafted sibling / cross-tenant `branchId` (other merchant, or out-of-scope) | **denied / empty** - never widens access, never an existence oracle |

Every case is exercised on each `/insights/*` endpoint **and** each export, with live re-resolution.

---

## 8. Tabs & UI behaviour

### 8.1 Structure - [LOCKED]
Keep the prototype's **five-tab** structure: **Vouchers · Branches · Customers · Busy times · Validation**, above which sit the global filters, the three KPI cards (Redemption activity, Distinct customers, Repeat-customer rate), and the redemption-activity-over-time trend chart; below the tabs sit the two report cards (§10).

### 8.2 Tab content
- **Overview/KPIs + trend:** §5 KPIs (dual-layer), §9 trend.
- **Vouchers:** top vouchers (rank by logged) + "by voucher type" share (7 types) - §9, §1.16.
- **Branches:** branch performance (rank by logged), **scoped** (§7).
- **Customers (release 1 = behavioural only):** repeat-rate context, "Already a customer / New to you" split, New customers reached. **Age, gender, and location/catchment are entirely absent - no placeholders, skeletons, or "coming soon"** (§1.11, §14). The tab is useful and visually complete without them and **expands** when demographics clear the gate. The prototype's customer-facing anonymity/suppression banner (asserting "anonymous … town/district … small groups hidden") is a **[LEGAL-GATE]** item tied to the demographic processing + its identifiability assessment - **it does not appear in release 1** (the behavioural-only tab makes no demographic-anonymity claim); any such banner copy is authored with the gated demographic release under qualified review (§13, §14).
- **Busy times:** six-daypart heatmap (§1.7).
- **Validation:** Logged/Confirmed/Awaiting + completion rate (always) + the adaptive method chart (§1.8).

### 8.3 Responsive/mobile - [LOCKED, ENG]
Desktop-first; on mobile the filter row stacks, tables/rankings become stacked cards, the trend chart and heatmap become horizontally scrollable or stacked (the six daypart columns stay present - not removed), and tab content reflows. Touch targets ≥ 44pt. Tooltips work on tap (§12).

---

## 9. Trend, ranking & visualisation semantics

- **Trend (Decision 13):** monthly bars; logged total primary; confirmed a subset shown within/over the total; remainder = awaiting; confirmed + awaiting = logged each month; no double-count; neutral awaiting colour; optional toggle but the default reads the logged total; retroactive confirmation can raise a past month's confirmed portion while the logged total/month stays fixed; in-progress current-month bar; completed-month-only comparison.
- **Rankings (Decision 14):** rank by logged; confirmed secondary per row; never confirmed-only; deterministic documented tie-break; REUSABLE caveat in tooltip; branch rankings scoped (§7).
- **Voucher types (Decision 15):** seven merchant-facing types (Discounts merged); logged denominator; single-type filter avoids unexplained 100%. The share % is by redemption activity (`COUNT(*)`), so a REUSABLE-heavy type's share can exceed its distinct-customer share - noted in the tooltip.
- **Busy-times (Decision 6):** six half-open London dayparts `[00:00,07:00) [07:00,12:00) [12:00,15:00) [15:00,18:00) [18:00,22:00) [22:00,24:00)`; after-midnight → actual London day.
- **Validation method (Decision 7):** adaptive; render every recognised method (PIN / QR scan / Manual entry) with data; hidden when only one method has non-zero data; unknown values fail safe.
- **Visualisation rules (MUST):** functional (non-brand-rose) chart palette + tokens (greenfield, §3.1); clear legends; **tabular / screen-reader equivalents** for every chart; **no colour-only meaning** (always a label/icon); awaiting/confirmation framing neutral.

---

## 10. Reports & exports - [LOCKED]

### 10.1 Redemption activity CSV (excluding direct customer identifiers)
- Honours the active date/branch/voucher-type filters and the server-authorised branch scope (§7).
- **Included fields:** redeemed date/time (London-rendered), voucher title, branch, voucher type (7-type label), estimated value, **status (Logged/Confirmed/Awaiting)**, validation method where available.
- **Excluded (explicit):** customer name, email, phone, userId, exact address, postcode, and per-customer demographic fields. **No Customer column** (unlike the operational `redemptions/export.csv`).
- **Wording:** "No direct customer identifiers are included" (never "no personal data ever"), **plus the caveat** that event-level date/time + branch + voucher + method combinations may still constitute personal/identifiable information.
- Retains formula-injection protection (`csvCell`-style) and an **explicit row cap** (the export's own cap, separate from dashboard aggregates).
- **Gated (MUST):** the event-level CSV is **inside the bounded privacy/legal review** (§13.6) and behind the **fail-closed runtime gate** (§13.5) - it is **not** available to real users until qualified review clears it; until then, ship an **approved aggregate-only export** or none. Removing direct identifiers does **not** make it anonymous or legally cleared.

### 10.2 Printable HTML performance summary
- Same filters + scope; **separates Logged / Confirmed / Awaiting** and uses the Decision-11 savings terminology (no "delivered"); accessible labels + a dedicated print stylesheet; a clear **"Print or save report"** action (browser Save-as-PDF); the printed output states the date range, branch scope, voucher filter, and generation date. If the summary contains any event-level/row-level detail (rather than purely aggregate figures), it carries the same "No direct customer identifiers; some combinations may still be identifiable" caveat as the CSV (§10.1).

### 10.3 Deferred - [DEFER]
No server-side PDF generation infra in v1; no "email me this report" promise in v1 (both need later provider/legal/security/rate-limit decisions). **Terminology is identical across UI, print, and CSV.**

---

## 11. States & lifecycle - [LOCKED]

- **Pre-live:** lifecycle-locked "unlocks when you go live".
- **Live, no eligible activity:** the "Your insights are warming up" empty state.
- **Live, activity exists:** the module displays immediately; **no whole-module activity threshold**; a forgotten validation never hides the module while logged activity exists.
- **Suspended:** read-only, banner.
- **Per-section states:** real value · truthful 0 (when zero is the measured result) · "Building your picture / Not enough data yet" (reliability/privacy thresholds unmet) · "Not available" (data source absent/not meaningful) · distinct loading · distinct friendly error with retry. **Never** use "not enough data" to mask an actual zero; **never** show 0 when the metric cannot be calculated; no punitive/decline-shaming language; accessible explanation for every unavailable/insufficient state (§12). Demographic sections remain absent behind their gate.

---

## 12. Accessible metric explanations - [LOCKED]

- **Coverage:** every potentially-unclear statistic, chart, comparison chip, filter, state, and privacy/suppression limitation has a short plain-English explanation. Anchors (non-exhaustive): Redemption activity, Distinct customers, Repeat-customer rate, New to you / Already a customer, Estimated customer savings + confirmed subset, Confirmed/Awaiting/completion, comparison chips (and why absent on incomplete periods), busy-time dayparts, validation methods, "All my branches", "All available history" earliest date.
- **Interaction:** desktop **hover** + keyboard **focus** + **click/tap** on touch; accessible **dismissal and focus management**; **no hover-only** behaviour.
- **Content guidance:** each explanation covers the counting rule, what is counted/excluded (test/QA/DELETED), that the headline is **logged activity** (validated = a confirmed subset; awaiting ≠ not-honoured), how the active date/branch/voucher filters affect it, the effective scope, estimate caveats (estimatedSaving is an estimate even after validation), and any limitation/privacy treatment.
- **Implementation:** merchant-web design system + accessible tooltip/popover semantics; exact copy + placement anchors are captured per surface in the implementation plan and re-checked against the prototype.

---

## 13. Privacy & legal programme gates

### 13.1 Two distinct gates - [LEGAL-GATE]
- **Bounded behavioural review (gates release 1):** the non-demographic behavioural analytics - especially **repeat-customer and new-customer profiling over `userId`** - is **not automatically legally cleared**. It needs a **bounded** privacy/lawful-basis/transparency review confirming it fits existing disclosures (or what to change) before processing/releasing real behavioural analytics. The bounded review must also confirm (or flag for resolution): the **merchant's data-protection role** for the behavioural-insight purpose; whether profiling over `userId` is lawful/fair given the **soft-anonymisation/erasure defect** (§4.4) and whether the DELETED-exclusion guard is sufficient; and whether the existing "merchants see only anonymised redemption counts" disclosure (§13.2) already covers repeat/new-customer counts or must change. The bounded review **also covers the event-level Redemption activity CSV + any printable event-level rows** (§13.6), not only the behavioural endpoints; and a **fail-closed runtime gate** (§13.5) enforces default-off for all gated processing in production.
- **Full demographic gate (gates the demographic release, §14):** the DPIA + qualified privacy/legal review + approved legal artefacts + policy implementation + suppression testing.

### 13.2 Legal-content contradictions (recorded; not edited here)
The audit found the demographic feature **cannot be launched consistently with current customer-facing promises until the documented legal/privacy contradictions and gates are resolved** (this is a product/repository observation, **not a definitive legal ruling**). Affected surfaces (file:line, verbatim wording confirmed):
- `apps/customer-web/app/privacy/page.tsx:96` - "Merchants … see only anonymised redemption counts and offer performance data. They do not receive your name, email, or any personally identifying information."
- `privacy/page.tsx:56-59` (offer-performance-only purpose), `:71-87` (purposes + legal basis omit merchant-facing demographic insight), `:42-46` (DOB/gender/postcode purposes), `:102-123` (rights/retention).
- `apps/customer-web/app/faq/page.tsx:143` ("anonymised redemption counts only").
- `apps/customer-app/src/features/profile-completion/screens/PC1AboutScreen.tsx:461-462` ("never shared"), `PC2AddressScreen.tsx:421-435` (postcode "only … find nearby deals"), `src/lib/location/PrePermissionExplainer.tsx:38`, `apps/customer-web/components/auth/RegisterForm.tsx:679`.
- `apps/customer-app/src/features/auth/screens/RegisterScreen.tsx:362-366` (Terms/Privacy links are stubs at the consent point).
- Merchant agreement `src/api/merchant/onboarding/service.ts:11-18` (silent on customer-data insights; points to non-existent `/merchant-terms`); `ContractAgreementForm.tsx` DRAFT; `StaircaseHub.tsx:122-125` ("all anonymous" insights teaser).
- Terminology: customer copy uses the word "anonymised"; **whether the merchant-facing output is effectively anonymised, pseudonymised, or aggregated personal data is exactly the identifiability-assessment question** (§1.17), which the spec does **not** pre-decide.
- Erasure/retention: deletion is soft-anonymisation leaving demographics intact (§4.4); no retention-enforcement job exists.
- Version mechanic: any policy change bumps `LEGAL_VERSION`+`TERMS_VERSION` in lock-step; a version bump is **not** proof of lawful consent.

### 13.3 External-artefact owner checks (before creating duplicates) - owner action
Existing DPIA(s); ROPA / Article-30 record; LIA(s); data-flow/data-map docs; retention schedule; lawful-basis register; counsel/legal advice records; processor/sub-processor DPAs (Neon, Resend, Twilio, Stripe, R2/S3, Vercel, Railway); ICO registration/fee; DPO/representative appointment; the final signed binding Merchant Agreement + any merchant DPA; prior privacy assessments/project notes; any GRC/compliance-system records; cookie-consent records. "No repository evidence found" ≠ "does not exist externally."

### 13.4 Sequencing of legal work - [LEGAL-GATE]
**PR-0a governance/qualified review → approved legal artefacts (counsel/owner authored) → PR-0b signed legal-copy/link/version implementation.** No legal copy is implemented before qualified review approves it. The spec does **not** choose the Article 6 basis, merchant legal role, suppression thresholds, retention model, re-consent treatment, or effective-anonymisation result; these are qualified-review outputs. **This spec does not claim Redeemo is legally compliant and does not edit any legal copy.**

### 13.5 Fail-closed runtime gate for behavioural analytics + the event-level export - [LOCKED invariant]
Because code merged to `main` **auto-deploys**, hiding the PR-B UI is **insufficient** - registered backend endpoints could still query real customer history. A **non-bypassable, server-side, default-off** gate MUST be checked **before any real-data behavioural query or the event-level export executes**.

**Gated processing:** the repeat-customer-rate, new-vs-returning, and any customer-history-derived query; **and** the event-level Redemption activity CSV (§10.1) + any printable-report event-level rows (§13.6). **Not gated:** the operational aggregates that are non-identifying counts of the merchant's own redemption events (redemption activity count, estimated savings, voucher/branch rankings, by-type share, busy-times, validation totals).

**Invariants (MUST):**
- **No client flag can enable it** - the gate is a server-owned signal only.
- **Default is off**; **production fails closed** (gate absent/unset → gated features return "not available", never real data).
- **Test/demo access is separately environment- and merchant-allowlisted** (§17) and cannot open the production gate.
- **Operational aggregates must not accidentally invoke behavioural profiling** while the gate is closed (separation enforced and tested).
- **Enabling real-data behaviour requires the recorded qualified-review output (the bounded review, §13.1) AND explicit owner approval** - not a deploy default.
- **Tests prove:** default-off; client non-bypassability; production fail-closed; and separation from operational analytics.

The implementation plan may realise the gate as route gating, a server-owned capability, or physically-separated behavioural queries - but **this deployment invariant is explicit and non-negotiable**.

### 13.6 Event-level export is inside the bounded review - [LEGAL-GATE]
The **event-level Redemption activity CSV** (§10.1) and **any printable-report content containing event-level rows** (§10.2) are explicitly **inside the bounded privacy/legal review** - not only the behavioural endpoints. Removing direct identifiers does **not** automatically make an event-level export anonymous or legally cleared (event-level date/time + branch + voucher + method may still be personal/identifiable). The bounded review must cover, for this export: **purpose + lawful basis; the merchant's data-protection role; minimisation + acceptable granularity; retention; authorization + branch scope; export cap + audit/rate controls; and identifiability wording.** **Until qualified review clears it,** the event-level export is either (a) **unavailable to real users** (gated off, §13.5) **or** (b) replaced with an **approved aggregate-only export**.

---

## 14. Gated demographics programme (future slice; NOT release-1 implementation)

- **Scope:** age groups, gender, and location/catchment **only**. **Customer interests remain out of scope** (not requested; not in the prototype Insights surface).
- **Gender chart:** requires an **approved aggregation data dictionary** (preserving source `User.gender` values; explicit "Not stated/Unknown"; unrecognised free-form values surfaced as ungrouped, never silently mapped) - **or is deferred** if a safe, agreed grouping cannot be defined from the current free-form field.
- **Suppression / anti-inference:** **server-side**; raw sub-threshold counts never reach the browser or any export; complementary suppression (≥2 hidden cells); coverage disclosure (do not silently renormalise over visible cells); percentage rounding; minimum useful query granularity; rate-limiting where appropriate. The **k-thresholds and the policy are a [LEGAL-GATE] output** (not a proven anti-reconstruction design - see §18); **adversarial differencing tests + privacy review are required before any demographic release**.
- **Location/catchment:** the **customer's saved locality** (coarse town/region/ladDistrict), never exact address/postcode.
- **Build gating:** a demographic UI may be **designed/built only after PR-0a governance + the approved legal artefacts are in place**, and even then only **behind a non-bypassable disabled gate**; it must **never process real demographic data or be reachable in staging/production** until governance, legal artefacts, policy implementation, suppression testing, and privacy gates all clear. ("A later approved spec" alone is **not** sufficient permission - the legal gates are.) The release-1 Customers tab expands in place when this clears (§1.11).
- **Data reality (informs feasibility, not approval):** all demographic fields are nullable; not captured at registration (only an app-onboarding hard-block); the seed customer has no DOB/gender - so demographics will have large "unknown" cohorts and need richer fixtures (§17).

---

## 15. Backend / API architecture (bounded contracts) - [LOCKED intent, ENG detail]

### 15.1 One shared aggregation service
A new `src/api/merchant/insights` module exposes a small set of read endpoints under `/api/v1/merchant/insights`, all driven by **one shared aggregation service** that owns the §4.1 cleanliness rule, the dual-layer split, London bucketing, branch-scope intersection, Decimal coercion, and suppression hooks. No metric is computed anywhere else (Home/Vouchers/Redemptions later consume the same service for reconciliation, §5.6).

### 15.2 Endpoint sketch (bounded; final shapes in the plan)
- `GET …/insights/overview` → **redemption activity** as `{ logged, confirmed, awaiting }`; **distinct customers** as a single logged figure; **repeat-customer rate** as a percentage over logged history (with its own insufficient-history flag); + comparison (null on incomplete periods) + savings block (estimated logged / estimated confirmed / awaiting) + `meta` (effective scope, earliest date for All-time, filters echoed).
- `GET …/insights/trend` → monthly series `[{ monthStartLondon, logged, confirmed }]` (awaiting derived); **both `logged` and `confirmed` bucket by `redeemedAt` London-month** (confirmed = that month's `redeemedAt` rows with `isValidated=true`; never bucketed by `validatedAt`).
- `GET …/insights/vouchers` → top vouchers + by-type share (7 types) with logged/confirmed per row.
- `GET …/insights/branches` → branch ranking (scoped) with logged/confirmed per row.
- `GET …/insights/customers` → new-vs-returning split + repeat-rate + new-customers (behavioural; **no demographics in release 1**).
- `GET …/insights/busy-times` → 7×6 daypart matrix of logged counts.
- `GET …/insights/validation` → logged/confirmed/awaiting + completion rate + adaptive method breakdown.
- `GET …/insights/export.csv` → the §10.1 CSV.
- `GET …/insights/report` (HTML) **or** a client-rendered print view fed by the above → §10.2. If server-rendered, it is a §15.3-governed endpoint (live authz re-resolution + Staff deny + branch scope §7.2 + §4.1 cleanliness + HTML-injection-safe escaping).

### 15.3 Contract rules - [LOCKED]
- All endpoints: `resolveMerchantContext` + **server-side Staff deny** (`role!=='STAFF'`) + **branch scope** (§7.2: `null`=all of the merchant's branches when `allBranches` for OWNER **and** BRANCH_MANAGER, else `allowedBranchIds`; always within `branch.merchantId=ctx.merchantId`; empty specific scope fails closed) intersected at the WHERE level; live re-resolution per request; filters parsed/validated server-side; **suppression server-side**; Decimal → `Number()`; London bucketing via **parameterised** SQL `DATE_TRUNC(... AT TIME ZONE 'Europe/London')`. Use Prisma's tagged-template **`$queryRaw`** (true parameterisation) for client-influenced values (date range, branch IDs), **not** `$queryRawUnsafe`; the concrete precedent for the VoucherRedemption→Branch→User raw GROUP BY is `src/api/customer/discovery/homeRailBuilders.ts:computePopularityScores`. The **QA-account exclusion** is `isQaAccountEmail` (a code helper, **not** a relational column), so it is resolved to a parameterised SQL predicate over `user.email` (e.g. `email NOT IN (:qaEmails)` + domain `NOT ILIKE` built from compile-time constants) - see §4.1.
- **No client-calculated authorization or privacy decisions.**
- Error semantics: friendly, typed errors (reuse the `NamedGateBanner`-style vocabulary on the client); out-of-scope branch → empty result (not an existence oracle); never leak sibling existence.
- **Stop-and-report trigger:** any **customer-facing or cross-product contract impact** (e.g., a change to a customer schema, the discovery contract, or anything consumed by customer-app/customer-web) - surface before building.

---

## 16. Schema / index / performance - [ENG + stop-and-report]

- **Index:** the core scan is `branch.merchantId IN (scope) AND redeemedAt ∈ window AND isValidated ∈ {…}` filtered to non-test/non-QA/non-DELETED. A composite such as `@@index([branchId, isValidated, redeemedAt])` is a **candidate, provisional until representative query plans are inspected** against realistic volume. A **partial** index (`CREATE INDEX … WHERE "isTestData" = false`) is also a candidate but is **raw-migration-only** - Prisma 7's `@@index` cannot express a WHERE/filtered index, so it has no schema mirror and Prisma may report drift (the composite is declarable; the partial is hand-written SQL). Evaluate partial vs composite vs covering against the actual query shapes (raw-SQL precedent: `homeRailBuilders.ts:computePopularityScores`). Any index is an **additive migration → stop-and-report exact SQL + rollback** before building.
- **Bucketing:** `prisma.groupBy` cannot bucket a time expression; month/daypart bucketing uses **parameterised** raw SQL (`$queryRaw` tagged-template, not `$queryRawUnsafe`) with `AT TIME ZONE 'Europe/London'` (§15.3). Both logged and confirmed bucket by `redeemedAt` (confirmed = `isValidated=true` rows in that `redeemedAt`-month/daypart).
- **Decimal:** `estimatedSaving` serialises as a string; coerce every sum.
- **Performance expectations:** define and measure for **All available history** and long custom ranges across many branches; **no hidden truncation** (stop-and-report if a range cannot be served safely, §1.10); the CSV cap is explicit and separate from dashboard aggregates.
- **Cache/rollup:** live SQL is the default; a short-TTL Redis cache or materialised rollups are introduced **only if evidence (query plans/volume) requires** - not speculatively.
- **Migration/rollback + production-volume stop-and-report triggers** are mandatory for any index/rollup.

---

## 17. Demo & test-data strategy - [LOCKED, ENG]

- **Production analytics always excludes test/QA data and DELETED users** (the §4.1 rule is unconditional in production; not toggleable by any frontend/demo configuration).
- **No non-test fixture masquerading as real activity** (no `isTestData=false` seed of fake redemptions - it would pollute discovery/Popular/Trending and production analytics).
- **Dev/staging demo:** a realistic validated-redemption fixture (across branches/types/dates) is `isTestData=true` on a **dedicated demo merchant**, invisible to discovery and to production analytics. Insights QA observes the "established" experience via a **fail-closed**, environment- and merchant-**allowlisted** staging path (or a separate demo-data path) with **startup + runtime guards** and **regression tests** - it must be impossible to surface test data in production. **Never weaken the production cleanliness rule.** **[ENG] note:** no startup/env-guard precedent exists in the codebase, so this path is greenfield - design a **startup assertion** (refuse to enable any include-test/demo path unless an explicit staging flag + `NODE_ENV` are set) plus the runtime env+merchant allowlist; the production cleanliness rule (§4.1) must still hold even if every demo guard is misconfigured.

---

## 18. Testing & adversarial review - [LOCKED intent]

- **Coverage:** unit + integration + route + **authorization/IDOR** (cross-tenant denial per endpoint) + the **§7.3 role/scope matrix** (OWNER all-branches; BM all-branches; BM one branch; BM several; empty-specific-scope fail-closed; Staff denied; crafted sibling/cross-tenant denied) + the **§13.5 runtime-gate** tests (default-off; client non-bypassability; production fail-closed; behavioural/event-level separation from operational aggregates) + **timezone/BST** (boundary + DST) + Decimal + comparison (completed-month-only; no chip on incomplete) + reconciliation (Confirmed+Awaiting=Logged; one-shared-aggregation parity) + filter + export (fields/omissions/cap) + **formula-injection** + accessibility (keyboard/focus/screen-reader/tabular equivalents) + responsive + loading/error/empty/insufficient/truthful-zero + privacy (no direct customer identifiers in payload/export; identifiability caveat present) + fixture-safety (production never sees test data).
- **Mutation/adversarial tests** for branch scope and cleanliness (e.g., neuter a scope guard → a test must fail; neuter the DELETED/QA/test filter → a test must fail).
- **Differencing/privacy tests** are **reserved for the demographic gate** (§14) and required before any demographic release.
- **Query-plan verification** for the index/bucketing/All-time paths.
- **Prototype screenshot + Playwright visual cross-check** against `Demo: Live, established` and the ten references.
- **Acceptance criteria are defined per release slice** (§19) in the implementation plan.

---

## 19. Programme slicing (preserve the whole programme) - [LOCKED ordering, owner-gated PRs]

| Slice | Content | Gating |
|---|---|---|
| **PR-0a Governance / qualified review** (no code, no copy) | Article 6 basis (+LIA if LI); DPIA + identifiability assessment; merchant-role determination; retention/erasure model; suppression threshold + anti-inference policy + adversarial-test plan; the bounded behavioural review | **Hard gate** for the demographic release; the bounded review gates real behavioural-analytics release. Runs in parallel; does not block PR-A/PR-B build, but the **bounded review must clear before PR-B processes/releases real behavioural analytics** |
| **Approved legal artefacts** (counsel/owner authored) | Revised privacy/FAQ/consent/merchant-terms copy, signed off; the missing `/merchant-terms` content | Gates PR-0b |
| **PR-0b Legal-copy/link/version implementation** (code) | Implement signed copy; wire app consent links to real docs; create `/merchant-terms`; bump `LEGAL_VERSION`/`TERMS_VERSION`; apply approved notification/re-consent flow | After approved artefacts only |
| **PR-A Backend non-demographic aggregation** | The shared aggregation service + endpoints (§15); cleanliness rule incl. DELETED; London bucketing; period-pair; provisional index (query-plan validated); fixture | May proceed in parallel with PR-0a; **no demographics** |
| **PR-B merchant-web non-demographic Insights** | Route + nav wire; filters; KPI cards; trend; Vouchers/Branches/Busy-times/Validation tabs + the release-1 Customers tab (behavioural only); the two reports; states; BM scope UX | Consumes PR-A; **behavioural release gated by the bounded review** |
| **PR-C Gated demographics** (Customers tab expansion) | Age/gender/location; server-side suppression/anti-inference; gender data-dictionary-or-defer | **Gated** on PR-0a + PR-0b + approved artefacts + passing adversarial suppression tests + the identifiability assessment; never reachable/processing real data before all gates clear |
| **Phase-4 (separate)** | Reversal schema (makes "reversed-excluded" real); QR-vs-manual once the mobile app emits `QR_SCAN`; optional report email/PDF; retention-enforcement job if adopted; campaign/featured ROI (greenfield) | Out of this programme's release scope |

**Behavioural-release boundary:** PR-A may be **built and tested against the §17 `isTestData` demo fixture**, but its **behavioural endpoints** (repeat-rate, new-vs-returning, customers) must **NOT process or release real customer behavioural data** until the **bounded behavioural review** (§13.1) clears. PR-0a has **two separable outputs** - the *bounded behavioural review* (gates the PR-B real-data behavioural release) and the *full DPIA / identifiability / threshold work* (gates PR-C). The **event-level Redemption activity CSV** is gated the same way (§13.6), and the **fail-closed runtime gate** (§13.5) keeps behavioural + event-level processing **default-off in production regardless of any deployed UI** - so PR-A's gated endpoints ship dark and open only on the bounded-review output + explicit owner approval.

**Acceptance intent per slice** (full criteria in the implementation plan): **PR-A** = shared-aggregation reconciliation invariant (Confirmed+Awaiting=Logged) + cross-tenant/IDOR denial + Staff-deny + the §7.3 role/scope matrix + §13.5 runtime-gate (default-off/fail-closed) + timezone/BST boundary + Decimal + cleanliness-mutation tests green; **PR-B** = prototype/visual fidelity (five tabs, dual-layer copy, no banned wording) + scope-aware BM UX + all states + accessibility; **PR-C** = server-side suppression + adversarial differencing + no-raw-cell-to-browser + gated-unreachable tests green.

**PR-0a is not silently optional for a real-data release.** The owner gates each PR; the spec recommends this ordering.

---

## 20. Deferrals & stop-and-report triggers

**Deferred [DEFER]:** demographics until all gates clear (§14); reversal schema + "reversed-excluded" wiring (Phase-4); QR-vs-manual usefulness until the mobile app emits `QR_SCAN`; server-side PDF + email report delivery; retention-enforcement job (if adopted); rollups/caching unless evidence requires; any inferred sensitive/special-category analytics; customer-interests analytics; the event-level Redemption activity export to real users until the bounded review clears (§13.6).

**Stop-and-report triggers (hard):** any schema/migration (analytics index, future reversal columns, a possible Gender enum); any **customer-facing or cross-product contract change**; any **legal-copy/policy** change (handled only in the PR-0a→artefacts→PR-0b flow); any provider/email enablement; any production-infrastructure or rollup change; any query that cannot be served safely at production volume (no silent truncation); any inferred special-category analytics; **opening the fail-closed behavioural/event-level runtime gate** (§13.5) requires the bounded-review output + explicit owner approval (never a deploy default).

---

## 21. Traceability

### 21.1 Decision → section
| Decision | Section(s) |
|---|---|
| Counting model | §1.1, §4, §5, §9, §10, §11 |
| 1 Sequencing | §1.2, §13, §14, §19 |
| 2 Headline metric | §1.3, §5 |
| 2a Cross-cutting UX | §1.3a, §12 |
| 3 Comparison | §1.4, §6.2 |
| 4 New-vs-returning | §1.5, §5, §6.3 |
| 5 Reports/exports | §1.6, §10 |
| 6 Busy-times | §1.7, §9 |
| 7 Validation method | §1.8, §9 |
| 8 BM presentation | §1.9, §7 |
| 9 All time | §1.10, §6.2, §16 |
| 10 Customers tab | §1.11, §8.2, §14 |
| 11 Savings | §1.12, §5 |
| 12 Early-life state | §1.13, §11 |
| 13 Trend | §1.14, §9 |
| 14 Rankings | §1.15, §9 |
| 15 Voucher types | §1.16, §9 |

### 21.2 Prototype → spec
See §2.3 (screenshot→section) and §2.4 (divergences with reason/status).

### 21.3 Source-claim cross-check (key, re-verified `@bc065db5`)
| Claim | Evidence |
|---|---|
| No `merchantId` on VoucherRedemption; join via `branch.merchantId` | `prisma/schema.prisma` VoucherRedemption model + indexes |
| `ValidationMethod` = PIN/QR_SCAN/MANUAL | `schema.prisma` enum |
| `UserStatus` includes DELETED; deletion is soft-anonymise leaving demographics | enum; `auth/customer/routes.ts:209-214` |
| Authz spine: `resolveMerchantContext` {role, allBranches, allowedBranchIds} | `merchant/shared.ts:124-152` |
| Export precedent + `EXPORT_CAP=50000` + Customer column + `csvCell` | `merchant/redemptions/{routes,service}.ts` |
| Cleanliness: `isTestData` + `QA_ACCOUNT_EMAILS` | `discovery/qaAccountFilter.ts` |
| No London date-range helper; savings buckets UTC | `londonClock.ts`; `customer/savings/service.ts` |
| Insights nav is a `href:'#'` stub; no charting lib | `merchant-web/components/shell/navItems.ts:16` |
| Legal: `LEGAL_VERSION`↔`TERMS_VERSION` parity; privacy `:96` contradiction | `lib/legal.ts`, `shared/legal.ts`, `privacy/page.tsx:96` |

### 21.4 Security / privacy invariants
| Invariant | Where |
|---|---|
| Server-side authz + branch-scope intersection at WHERE; live re-resolution; no client authz | §7, §15.3 |
| No sibling leakage / no existence oracle for crafted/stale IDs | §7.2 |
| Logged never called honoured/delivered/purchased/presence | §4.2, §12 |
| No direct customer identifiers in CSV/exports + identifiability caveat | §10.1 |
| Demographics: server-side suppression, no raw cells to browser, gated build | §14 |
| Production always excludes test/QA/DELETED; fail-closed demo | §4.1, §17 |
| No legal copy edited; legal decisions reserved | §13 |
| Branch scope = all-merchant-branches when `allBranches` (OWNER + BRANCH_MANAGER), else `allowedBranchIds`; empty specific scope fails closed; always within merchant tenant boundary | §7.2, §7.3 |
| Behavioural + event-level processing default-off, server-side, fail-closed in production | §13.5 |
| Event-level export inside the bounded review; not anonymous merely by removing identifiers | §13.6, §10.1 |

### 21.5 Deferred-item ownership & trigger
| Item | Owner | Trigger |
|---|---|---|
| Demographics (§14) | Owner + qualified legal + eng | All gates clear (PR-0a/artefacts/PR-0b/suppression tests) |
| Reversal "reversed-excluded" | Owner + eng | Phase-4 reversal schema ships |
| QR-vs-manual usefulness | Eng | Mobile app emits `QR_SCAN` |
| Server PDF / email reports | Owner + provider/legal | Provider + legal + rate-limit decisions |
| Retention enforcement | Owner + legal + eng | Lawful retention model adopted |
| Rollups/caching | Eng | Query-plan evidence requires |

### 21.6 Assumptions still requiring verification
1. The exact composite/partial index must be chosen against **representative query plans** at realistic volume (§16) - not pre-locked here.
2. The bounded behavioural review (repeat/new-customer) outcome may constrain what ships in release 1 (§13.1).
3. Whether the printable HTML summary is server-rendered or client-rendered is an implementation-plan choice (§15.2) - no server PDF either way.
4. The merchant-web charting approach (library vs hand-rolled SVG) + functional palette/tokens are greenfield engineering choices to confirm in the plan (§9).
5. Demographic data completeness (large "unknown" cohorts) and the gender data-dictionary feasibility are to be assessed within PR-C (§14).
6. Confirm at the data level that `isValidated=true` is the sound single discriminator for Confirmed vs Awaiting (no rows with `validatedAt`/`validatedById` set while `isValidated=false`, and none the reverse), so Confirmed+Awaiting=Logged holds exactly (§4.2, §4.3).

---

## 22. Self-review record

A seven-lens fresh adversarial review was run against this spec (each lens cross-checked actual source @ `bc065db5`, the §1 locked decisions, and the prototype). Outcomes and integrations:

### 22.1 Lens verdicts
| Lens | Verdict | Action |
|---|---|---|
| Source / architecture accuracy | Exceptionally well-grounded; no must/should structural errors; 1 should-fix + 3 nits | All integrated |
| Decision fidelity | Very nearly clean; 2 should-fix + 1 nit | All integrated |
| Prototype / visual fidelity | Not clean: 3 must-fix + 3 should-fix + 2 nits | All integrated |
| Authorization / security / tenant isolation | Not clean: 2 must-fix + 1 should-fix + 1 nit | All integrated |
| Privacy / legal-gate discipline | Strong discipline; 2 should-fix + 3 nits | All integrated |
| Data-semantics / timezone / reconciliation | Not clean: 3 must-fix + 3 should-fix + 1 nit | All integrated |
| Completeness / background-implementability | Strong; 5 should-fix + 2 nits | All integrated |

### 22.2 Must-fix integrations (8)
1. **(Security) Branch scope aligned to the shipped model** - a first review draft over-restricted a `BRANCH_MANAGER` to `allowedBranchIds` even with `allBranches=true`, which would have **denied a legitimate all-branches manager** (caught in Codex re-review). Corrected (§1.9, §3.1, §7.1-§7.3, §15.3) to the shipped model: `allBranches=true` authorises all of the merchant's branches for OWNER **and** BRANCH_MANAGER; `allBranches=false` → `allowedBranchIds`; always within the merchant tenant boundary; empty specific scope fails closed; Staff denied server-side; existing all-branches managers are not demoted. Test matrix in §7.3.
2. **(Security) Server-side Staff deny** - Staff exclusion was frontend-only. Fixed: §7.2 + §15.3 - every `/insights/*` endpoint asserts `role!=='STAFF'` server-side.
3. **(Prototype) Sub-headline divergence** - the prototype's "validated redemptions only … honoured" sub-headline now recorded as a §2.4 divergence (replaced with logged-primary copy).
4. **(Prototype) New-and-returning label divergence** - "Returning / came back to redeem again" → "Already a customer / New to you" recorded in §2.4.
5. **(Prototype) Validation card 'honoured' divergence** - recorded in §2.4 (confirmed/awaiting framing, no "honoured").
6. **(Data) Retroactive logged totals** - the "logged total stays unchanged" claim was false under DELETED-exclusion/erasure; scoped in §1.14/§4.1/§4.4: deferred *validation* leaves logged unchanged, but a deletion/erasure can lower a historical logged total.
7. **(Data) QA-exclusion mechanism** - `isQaAccountEmail` is a code helper, not a column; §4.1/§15.3/§16 now specify a parameterised SQL predicate over `user.email`.
8. **(Data) New-vs-returning ↔ repeat-rate equivalence under a voucher-type filter** - §1.5 now pins the repeat-rate denominator to the same voucher-type-filtered distinct cohort; the *status* lookback alone spans all types.

### 22.3 Should-fix / nit integrations (clearly correct)
Partial-index is raw-migration-only, Prisma `@@index` cannot express it (§16); `$queryRaw` tagged-template precedent `computePopularityScores` (§15.3/§16); trend bucketing pinned to `redeemedAt` for both layers (§9/§15.2); `isValidated=true` (not `validatedAt IS NOT NULL`) is the Confirmed discriminator + downgraded "verified invariant" → "application-enforced convention" (§4.3, §21.6 item 6); do-NOT-mirror the closed-UTC redemptions filter (§6.1); "All time / All available history" label (§6.2); KPI triple scoped to redemption activity only (§15.2); §18 "no PII" → "no direct customer identifiers + caveat"; printable-summary identifiability caveat (§10.2); demographic build-gate tightened to depend on the legal gates not "a later approved spec" (§14); bounded-review must address merchant role + the soft-anonymisation/erasure defect + the existing disclosure (§13.1); "anonymised vs pseudonymised" softened to the identifiability-assessment question (§13.2); Customers-tab anonymity banner is a gated [LEGAL-GATE] item, absent in release 1 (§8.2); "Busiest" badge kept/suppression-aware (§1.7); report-card "email you"/"no customer personal data" divergences (§2.4); §2.3 row 06 + §10; behavioural-release boundary + per-slice acceptance intent (§19); greenfield fail-closed demo startup-assertion note (§17); REUSABLE share-% caveat (§9); citation line numbers tightened (`shared.ts:124-152`, `PC1AboutScreen.tsx:461-462`, `faq:143`).

### 22.4 Final consistency sweep
Grep sweep confirms **no surviving stale wording**: every "validated-only" is in the superseded §1.0 baseline or a prototype-divergence row describing what is replaced; every "delivered" is a "never/dropped" rule, the language ban, or the prototype's own "Value delivered" label being replaced; "no personal data ever / personally identifying" appears only as the rule forbidding it and the verbatim quote of the existing privacy policy (§13.2); every demographic "placeholder/coming soon" mention is the rule forbidding them; every "merchant-wide" + Branch-Manager mention reflects the **shipped-model** rule (Amendment 1): a BM with `allBranches=true` legitimately sees all the merchant's branches, `allBranches=false` → `allowedBranchIds`, empty specific scope fails closed, always within the merchant tenant boundary, with the owner-only "All branches" **label** as the UI distinction. No must-fix or clearly-correct should-fix remains open.

### 22.5 Codex re-review amendments (post-PR-open; head re-issued)
Three blocking amendments from Codex's full review of PR #329 were integrated:
1. **Branch-Manager `allBranches` authorization (Amendment 1)** - corrected the earlier over-restriction to the **shipped model**: an all-branches BM (`allBranches=true`, normally `allowedBranchIds=[]`) legitimately sees **all the merchant's branches**; `allBranches=false` → `allowedBranchIds`; empty specific scope **fails closed**; always within the merchant tenant boundary; Staff denied server-side; existing all-branches managers are **not** demoted. §1.9, §3.1, §7.1-§7.3, §15.3, §18, §21.4, §22.2. Verified first-hand: `schema.prisma:230` (`allBranches @default(true)`), `shared.ts:151` (`assertBranchAllowed`) + `:163` (`assertCanManageBranch`) honour BM+all-branches, `merchant/staff/service.ts` invite/update permit it.
2. **Fail-closed runtime gate for behavioural analytics + event-level export (Amendment 2)** - because `main` auto-deploys, a non-bypassable, server-side, **default-off, production-fail-closed** gate is required before any real behavioural query or event-level export runs; no client flag enables it; demo/test access is separately allowlisted; opening it needs the bounded-review output + explicit owner approval; tests prove default-off / non-bypassability / fail-closed / operational separation. New §13.5; refs §10.1, §15.3, §18, §19, §20, §21.4.
3. **Event-level CSV inside the bounded review (Amendment 3)** - the event-level Redemption activity CSV + any printable event-level rows are explicitly inside the bounded review (purpose/basis/role/minimisation/granularity/retention/authz/cap/audit/identifiability); until cleared, unavailable to real users or replaced with an approved aggregate-only export; removing identifiers does not make it anonymous. New §13.6; refs §10.1, §13.1, §19, §20, §21.4. A consistency sweep across §§1, 3, 7, 10, 13, 15, 18, 19, 21, 22 confirms no contradiction with the amendments.
