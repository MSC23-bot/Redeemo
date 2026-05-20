# Seed Merchant Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the dev DB to a "QA-ready" state before Phase 2.3 Home + Phase 2.4 Category land, so those surfaces feel populated and realistic during device QA — without bulk-geocoding fake/demo merchants and without inviting another leaked-fixture class.

**Architecture:** Four staged sub-PRs landed sequentially in the order **Stage 1 → Stage 2 → Stage 4 → Stage 3** (D4 locked). Stage 1 ships an audit script (no data writes) + a guardrail vitest test that gates future PRs. Stage 2 enriches voucher + media + opening-hours data on the existing taxonomy-seeded demo merchants (no new merchants, no name renames, no coord changes). Stage 4 promotes the guardrail to CI-blocking + cleans the leaked-fixture class. Stage 3 runs the trusted Google Places workflow for the **3 real merchants only** (Karaara, My Kerala, Covelum), one branch at a time, with before/after diff + owner approval gate per branch.

**Tech Stack:** TypeScript + Prisma 7 client + tsx for scripts. Vitest for the guardrail test (real-DB integration pattern from §BU). Existing `prisma/suggest-branch-pin.ts` (Google Places, owner-run) for real-merchant coord verification. No new dependencies.

**Tier calibration:** Tier 2 plan-first. Each Stage is its own PR, plan-first internally. Tier 2 standing rules respected: plan before code, owner decisions surfaced before implementation, milestone pauses, docs updated in the same PR.

---

## 0. Owner-locked decisions (2026-05-20)

These were approved on the plan-review pass and OVERRIDE any defaults shown later in the doc. Implementers MUST honour these:

| # | Decision | Locked value |
|---|---|---|
| **D1** | Stage 1 timing | **START NOW** — audit script + skipped guardrail test only. No DB writes. |
| **D2** | PIN value strategy | **`1234` everywhere** — dev/QA only. Every fake/demo branch + every real-merchant branch gets `1234`. Label in code as dev/QA secret. |
| **D3** | Voucher count per fake/demo merchant | **3 vouchers** where practical. Mix of types (BOGO + DISCOUNT_PERCENT + FREEBIE / PACKAGE_DEAL, varying by merchant category). If a merchant category naturally only supports 1-2 (e.g. a one-off package deal), call out the exception inline. |
| **D4** | Stage ordering | **Stage 1 → Stage 2 → Stage 4 → Stage 3.** Leaked-fixture cleanup + CI-blocking guardrail (Stage 4) happens BEFORE real-merchant coord verification (Stage 3). Reason: leaked fixtures are already affecting QA trust; clean + guard first so Home/Category QA can rely on the seed; Stage 3 coord verification stays separately approval-gated. |
| **D5** | Stage 3 candidates | Google Places verification limited to the 3 real merchants only: **Karaara, My Kerala, Covelum** (both Covelum branches). Trim & Co Barbers + Wagtail Veterinary Practice + every other fake/demo merchant are MANUALLY POSITIONED in plausible QA locations — NOT matched to real businesses via Google Places. |
| **D6** | Execution mode | **Subagent-driven** per major activity: one worker for audit/guardrail (Stage 1); one worker for fake/demo enrichment design (Stage 2); one worker for leaked-fixture cleanup + hardening (Stage 4); per-branch worker for Stage 3 coord verification. Stage 1 kept simple + reviewable. No broad seed edits until Stage 1 audit output is reviewed. |
| **D7** | Hard product rule | **R1 ("no customer-visible branch without ≥1 active approved voucher") is a hard product rule** for the seed, NOT just an audit warning. Stage 4 promotes R1 in the guardrail test to a CI-blocking assertion. Future merchant additions MUST seed at least 1 active approved voucher before the merchant goes ACTIVE. |

---

## 1. Conflict + context check (already done)

**Existing memory entries this work touches (none conflict):**

- `project_merchant_profile_followups.md` §1 (Seed enrichment — demo-ready merchant fixture) — already lists logo + banner + photos + opening hours + reviews as known gaps; called out as Tier 0/1 seed PR. This plan supersedes that note and absorbs its scope.
- `project_merchant_profile_followups.md` §2 (Covelum → Kovalam rename) — explicitly **OUT OF SCOPE** for this plan per owner direction ("real merchants I know about: Covelum / Covelum Restaurant"). Rename stays deferred.
- `project_merchant_profile_followups.md` §3 (Multi-branch fixture) — Covelum already has 2 branches (Brightlingsea + Colchester) per the live audit; this gap is already closed for Map QA. Owner can pick up adding more multi-branch fixtures as separate work.
- Deferred index entries about `Branch.county` (lines 20, 49, 104) — **OUT OF SCOPE.** Schema migration; separate workstream.
- `project_deferred_followups_index.md` §BU.1 (Broader Date.now() fixture-cleanup hygiene) — **CROSS-REF.** This plan's Stage 4 absorbs §BU.1's scope for the SummaryTest / SummaryTestOther / TEST / UpsertRevive prefix classes the audit just surfaced.
- `project_admin_panel_market_expansion_tooling.md` — future Phase 5 admin panel will eventually own merchant enrichment workflows; this seed work is the pre-launch QA-only stopgap.

**Real merchants (owner-confirmed):**
- **Karaara** (`tax-merchant-karaara-001`) — Huddersfield
- **My Kerala** (`tax-merchant-mykerala-001`) — Ipswich
- **Covelum / Covelum Restaurant** (`tax-merchant-covelum-001`) — Brightlingsea + Colchester (2 branches)

**Fake/demo merchants (taxonomy-seeded, do NOT use Google Places):**
- Bean & Brew Specialty (`tax-merchant-cafe-001`)
- Core Reform Studio (`tax-merchant-pilates-001`)
- Iron Forge Gym (`tax-merchant-iron-forge-gym-001`)
- Lumière Aesthetics (`tax-merchant-aesthetics-001`)
- Market Quarter Food Hall (`tax-merchant-foodhall-001`)
- Pinos Pizzeria (`tax-merchant-pinos-pizzeria-001`)
- Polish Nail Studio (`tax-merchant-polish-nails-001`)
- Trim & Co Barbers (`tax-merchant-trim-co-barbers-001`)
- Wagtail Veterinary Practice (`tax-merchant-vet-001`)

**Dev fixture:**
- The Coffee House (`dev-merchant-001`) — auth-flow demo

**Leaked test fixtures (live audit 2026-05-20, 22 rows):**
- `SummaryTest-*` (8) + `SummaryTestOther-*` (10) + `TEST -*` (3) + `UpsertRevive-*` (1)
- These leak into Discovery and break the owner's "no vouchers → no visibility" rule. Stage 4 cleans them.

## 2. Pre-stage live-audit snapshot (run by Stage 1)

The Stage 1 audit script will produce a report against THIS snapshot as the baseline. Numbers will drift as Stages 2/3 land; Stage 1 stays the unchanging source of truth.

**Voucher gap:** 9 of 13 customer-visible demo merchants have ZERO approved vouchers. Per owner rule, those branches should NOT appear in Discovery — but they currently do.

| Merchant | Active branches | Approved vouchers | Status |
|---|---|---|---|
| Covelum Restaurant | 2 | 6 | ✅ has vouchers |
| Karaara | 1 | 2 | ✅ has vouchers |
| My Kerala | 1 | 2 | ✅ has vouchers |
| The Coffee House | 1 | 2 | ✅ has vouchers (dev fixture) |
| Bean & Brew Specialty | 1 | 0 | ⚠️ needs voucher |
| Core Reform Studio | 1 | 0 | ⚠️ needs voucher |
| Iron Forge Gym | 1 | 0 | ⚠️ needs voucher |
| Lumière Aesthetics | 1 | 0 | ⚠️ needs voucher |
| Market Quarter Food Hall | 1 | 0 | ⚠️ needs voucher |
| Pinos Pizzeria | 1 | 0 | ⚠️ needs voucher |
| Polish Nail Studio | 1 | 0 | ⚠️ needs voucher |
| Trim & Co Barbers | 1 | 0 | ⚠️ needs voucher |
| Wagtail Veterinary Practice | 1 | 0 | ⚠️ needs voucher |

**Media gap:** Every taxonomy + dev merchant has `logoUrl=null`, `bannerUrl=null`, `websiteUrl=null`. The `seedDemoMerchantEnrichment()` function in `prisma/seed.ts:1276` exists for ONE merchant (Covelum, per `COVELUM_MERCHANT_ID`); the helper needs to apply across all 13 customer-visible merchants.

**Opening hours gap:** Every taxonomy + dev branch has zero `BranchOpeningHours` rows. Live audit shows `no-hours` across all 13 active demo branches.

**PIN gap:** Only 3 of 13 active demo branches have `Branch.redemptionPin` set. The PIN gap matches the owner's QA requirement perfectly: customer-visible branches with active approved vouchers MUST have a redemption PIN to complete end-to-end QA.

| Branch | PIN status |
|---|---|
| `tax-branch-covelum-001` (Covelum Brightlingsea) | needs audit (was MANUALLY_CONFIRMED in Map QA; check pin) |
| `tax-branch-covelum-002` (Covelum Colchester) | needs audit |
| `tax-branch-karaara-001` (Karaara Huddersfield) | needs audit |
| `tax-branch-mykerala-001` (My Kerala Ipswich) | needs audit |
| `tax-branch-trim-co-barbers-001` | PIN-SET (per audit) |
| `tax-branch-vet-001` (Wagtail Vets Hackney) | PIN-SET (per audit) |
| `dev-branch-001` (The Coffee House) | PIN-SET (per audit) |
| All other taxonomy branches | NO-PIN |

**Coordinate confidence:** All 13 demo branches have `locationConfidence = MANUALLY_CONFIRMED` per the taxonomy seed. The 3 real merchants are the only candidates for Google Places re-verification (Stage 3); the 9 fake merchants stay as-seeded (Stage 3 will NOT touch them).

## 3. File structure

### Create (new in this plan)

| File | Purpose | Stage |
|---|---|---|
| `prisma/audit-seed-state.ts` | Read-only audit script — no DB writes. Prints structured report against the rules below; exits 0/1 based on `--strict` flag. | Stage 1 |
| `tests/prisma/seed-guardrail.test.ts` | Vitest test against the live dev DB asserting the same rules as the audit script. Real-DB integration pattern from §BU. NON-blocking initially (Stage 1); promoted to CI-blocking in Stage 4. | Stage 1 → 4 |
| `prisma/clean-leaked-test-fixtures.ts` | Scoped cleanup script for the four leaked prefix classes (`SummaryTest-` / `SummaryTestOther-` / `TEST ` / `UpsertRevive-`). Dry-run default; `--confirm` to write. Mirrors `prisma/clean-leaked-p1test-fixtures.ts` pattern. | Stage 4 |

### Modify (existing files)

| File | What changes | Stage |
|---|---|---|
| `prisma/seed.ts` | `seedDemoMerchantEnrichment()` at line 1276 extends from Covelum-only to all 13 customer-visible merchants. Adds logoUrl + bannerUrl + websiteUrl per merchant. Adds vouchers (1-3 per merchant) where absent. Adds opening hours (7-day rows) per active branch. Adds redemption PINs per active branch. Updates Covelum branch coords if Stage 3 owner-approves a delta. | Stages 2-3 |
| Cross-merchant test fixtures (7 files in `tests/api/customer/discovery/`) | Add the same `sweepFixtures()` prefix-cleanup pattern shipped in `discovery.selectedBranch.test.ts` by PR #113 fixup-1. Lifted into a shared `tests/api/_shared/fixtureSweep.ts` helper. | Stage 4 |

### Out of scope (named explicitly)

- **Schema changes** — no new columns, no new tables, no migrations. `Branch.county` enrichment is its own workstream.
- **New merchants** — no new merchant rows added. Owner explicit: enrich existing demo merchants only.
- **Covelum → Kovalam rename** — name stays. Out of scope.
- **`prisma/seed-demo.ts`** — separate seed file, not run by default. Not touched.
- **Backend API changes** — no service-layer changes. Audit is read-only.
- **Customer-app changes** — none. Customer-app already handles missing logo/banner/hours via null-safe rendering (verified during Merchant Profile + Map QA rounds).
- **Production data** — script + test scoped to dev DB connection string only. No production database access path.

---

## Stage 1: Audit script + non-blocking guardrail test

**Goal:** Land the audit infrastructure with zero data changes. Owner can run the script, see the report, and decide which gaps to close in Stages 2/3.

### Task 1.1: Create the audit script skeleton

**Files:**
- Create: `prisma/audit-seed-state.ts`

- [ ] **Step 1: Create the script with the dry-run-default + `--strict` flag pattern (mirror `prisma/clean-leaked-p1test-fixtures.ts`)**

```ts
// prisma/audit-seed-state.ts
//
// Read-only audit of dev DB seed state for the customer-visible discovery
// surface. Reports against the locked seed quality rules from
// docs/superpowers/plans/2026-05-20-seed-merchant-enrichment.md §3.
//
// Usage:
//   npx tsx prisma/audit-seed-state.ts                  (report; exits 0)
//   npx tsx prisma/audit-seed-state.ts --strict         (report; exits 1 if any rule fails)
//   npx tsx prisma/audit-seed-state.ts --json           (machine-readable; for CI)
//
// Rules audited (all asserted per ACTIVE merchant + active branch):
//   R1: Every active branch of an ACTIVE merchant has >=1 active approved voucher.
//   R2: Every customer-visible merchant has logoUrl + bannerUrl set.
//   R3: Every active branch has >=1 BranchOpeningHours row (7-day schedule).
//   R4: Every active branch has Branch.redemptionPin set.
//   R5: Every active branch has addressLine1 + city + postcode + country set.
//   R6: Every active branch has phone OR email set (contact reachable).
//   R7: Every customer-visible merchant has primaryCategoryId set (rendering driver).
//   R8: No leaked-test-fixture prefixes (P1Test- / SummaryTest- / SummaryTestOther- /
//       TEST  / UpsertRevive- / Revive- / Drift- / FilterFlip-) on active merchants.
//   R9 (real merchants only): The 3 owner-listed real merchants (Karaara, My
//       Kerala, Covelum) have branchLocationConfidence === 'MANUALLY_CONFIRMED'
//       AND latitude/longitude set.

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const REAL_MERCHANT_IDS = new Set([
  'tax-merchant-karaara-001',
  'tax-merchant-mykerala-001',
  'tax-merchant-covelum-001',
])

const LEAKED_FIXTURE_PREFIXES = [
  'P1Test-',
  'SummaryTest-',
  'SummaryTestOther-',
  'TEST ',
  'UpsertRevive-',
  'Revive-',
  'Drift-',
  'FilterFlip-',
] as const

type RuleResult = {
  ruleId: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9'
  description: string
  failures: Array<{ entityType: 'merchant' | 'branch'; id: string; name: string; detail: string }>
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const strict = args.includes('--strict')
  const jsonOut = args.includes('--json')

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    const results = await runAudit(prisma)
    if (jsonOut) {
      console.log(JSON.stringify({ results, strict }, null, 2))
    } else {
      printHumanReport(results)
    }
    const anyFailure = results.some(r => r.failures.length > 0)
    if (strict && anyFailure) process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

async function runAudit(prisma: PrismaClient): Promise<RuleResult[]> {
  // Implementation comes in Steps 2-4.
  return []
}

function printHumanReport(results: RuleResult[]): void {
  // Implementation comes in Step 5.
}

main().catch((err) => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Implement R1-R7 (per-merchant + per-branch rules)**

Add inside `runAudit()`:

```ts
const merchants = await prisma.merchant.findMany({
  where: { status: 'ACTIVE' },
  select: {
    id: true, businessName: true,
    logoUrl: true, bannerUrl: true, primaryCategoryId: true,
    branches: {
      where: { isActive: true },
      select: {
        id: true, name: true,
        addressLine1: true, city: true, postcode: true, country: true,
        phone: true, email: true,
        latitude: true, longitude: true, locationConfidence: true,
        redemptionPin: true,
        openingHours: { select: { dayOfWeek: true } },
      },
    },
    vouchers: {
      where: { status: 'ACTIVE', approvalStatus: 'APPROVED' },
      select: { id: true },
    },
  },
})

const results: RuleResult[] = []

// R1: branches need at least one approved voucher on the merchant.
const r1: RuleResult = { ruleId: 'R1', description: 'Active branch on a customer-visible merchant has >=1 approved voucher', failures: [] }
for (const m of merchants) {
  if (m.vouchers.length === 0) {
    for (const b of m.branches) {
      r1.failures.push({ entityType: 'branch', id: b.id, name: `${m.businessName} / ${b.name}`, detail: 'merchant has 0 approved vouchers' })
    }
  }
}
results.push(r1)

// R2: merchant media.
const r2: RuleResult = { ruleId: 'R2', description: 'Merchant has logoUrl and bannerUrl set', failures: [] }
for (const m of merchants) {
  if (!m.logoUrl) r2.failures.push({ entityType: 'merchant', id: m.id, name: m.businessName, detail: 'logoUrl is null' })
  if (!m.bannerUrl) r2.failures.push({ entityType: 'merchant', id: m.id, name: m.businessName, detail: 'bannerUrl is null' })
}
results.push(r2)

// R3: branch has >=1 opening-hours row.
const r3: RuleResult = { ruleId: 'R3', description: 'Active branch has >=1 BranchOpeningHours row', failures: [] }
for (const m of merchants) for (const b of m.branches) {
  if (b.openingHours.length === 0) r3.failures.push({ entityType: 'branch', id: b.id, name: `${m.businessName} / ${b.name}`, detail: 'no opening-hours rows' })
}
results.push(r3)

// R4: branch has redemption PIN.
const r4: RuleResult = { ruleId: 'R4', description: 'Active branch has redemptionPin set', failures: [] }
for (const m of merchants) for (const b of m.branches) {
  if (!b.redemptionPin) r4.failures.push({ entityType: 'branch', id: b.id, name: `${m.businessName} / ${b.name}`, detail: 'redemptionPin is null' })
}
results.push(r4)

// R5: branch has address.
const r5: RuleResult = { ruleId: 'R5', description: 'Active branch has addressLine1+city+postcode+country', failures: [] }
for (const m of merchants) for (const b of m.branches) {
  const missing = [
    !b.addressLine1 && 'addressLine1',
    !b.city && 'city',
    !b.postcode && 'postcode',
    !b.country && 'country',
  ].filter(Boolean)
  if (missing.length > 0) r5.failures.push({ entityType: 'branch', id: b.id, name: `${m.businessName} / ${b.name}`, detail: `missing: ${missing.join(', ')}` })
}
results.push(r5)

// R6: branch has phone OR email.
const r6: RuleResult = { ruleId: 'R6', description: 'Active branch has phone or email contact', failures: [] }
for (const m of merchants) for (const b of m.branches) {
  if (!b.phone && !b.email) r6.failures.push({ entityType: 'branch', id: b.id, name: `${m.businessName} / ${b.name}`, detail: 'phone AND email both null' })
}
results.push(r6)

// R7: merchant has primaryCategoryId.
const r7: RuleResult = { ruleId: 'R7', description: 'Merchant has primaryCategoryId set', failures: [] }
for (const m of merchants) {
  if (!m.primaryCategoryId) r7.failures.push({ entityType: 'merchant', id: m.id, name: m.businessName, detail: 'primaryCategoryId is null' })
}
results.push(r7)

return results
```

- [ ] **Step 3: Implement R8 (leaked-fixture prefix detector)**

Append inside `runAudit()` before `return results`:

```ts
// R8: no leaked-fixture-prefix merchants are ACTIVE.
const r8: RuleResult = { ruleId: 'R8', description: 'No leaked-test-fixture-prefix merchants are ACTIVE', failures: [] }
for (const m of merchants) {
  for (const prefix of LEAKED_FIXTURE_PREFIXES) {
    if (m.businessName.startsWith(prefix)) {
      r8.failures.push({ entityType: 'merchant', id: m.id, name: m.businessName, detail: `prefix "${prefix}" indicates leaked test fixture` })
      break
    }
  }
}
results.push(r8)
```

- [ ] **Step 4: Implement R9 (real-merchant coord verification)**

Append inside `runAudit()` before `return results`:

```ts
// R9 (real merchants only): MANUALLY_CONFIRMED coords.
const r9: RuleResult = { ruleId: 'R9', description: 'Real merchant branches are MANUALLY_CONFIRMED with non-null coords', failures: [] }
for (const m of merchants) {
  if (!REAL_MERCHANT_IDS.has(m.id)) continue
  for (const b of m.branches) {
    if (b.locationConfidence !== 'MANUALLY_CONFIRMED') {
      r9.failures.push({ entityType: 'branch', id: b.id, name: `${m.businessName} / ${b.name}`, detail: `locationConfidence=${b.locationConfidence}, expected MANUALLY_CONFIRMED` })
    }
    if (b.latitude === null || b.longitude === null) {
      r9.failures.push({ entityType: 'branch', id: b.id, name: `${m.businessName} / ${b.name}`, detail: 'latitude or longitude is null' })
    }
  }
}
results.push(r9)
```

- [ ] **Step 5: Implement `printHumanReport` (formatted output)**

```ts
function printHumanReport(results: RuleResult[]): void {
  console.log('=== Seed merchant audit ===')
  console.log('')
  let totalFail = 0
  for (const r of results) {
    const status = r.failures.length === 0 ? '✅' : '⚠️'
    console.log(`${status} ${r.ruleId}: ${r.description} (${r.failures.length} failure${r.failures.length === 1 ? '' : 's'})`)
    for (const f of r.failures.slice(0, 20)) {
      console.log(`     - ${f.entityType} ${f.id} (${f.name}): ${f.detail}`)
    }
    if (r.failures.length > 20) console.log(`     ... and ${r.failures.length - 20} more`)
    totalFail += r.failures.length
  }
  console.log('')
  console.log(`Total failures across all rules: ${totalFail}`)
}
```

- [ ] **Step 6: Run the script against current dev DB; verify output matches the §2 snapshot**

Run: `npx tsx prisma/audit-seed-state.ts 2>&1 | tail -60`

Expected: R1 reports ~9 branch failures (the 9 demo merchants with 0 vouchers). R2 reports 26 failures (13 merchants × 2 fields). R3 reports 13 branch failures. R4 reports ~10 branch failures. R5-R7 report some failures. R8 reports 22 leaked fixtures. R9 reports 0 failures (real merchants all good).

- [ ] **Step 7: Commit**

```bash
git add prisma/audit-seed-state.ts
git commit -m "feat(seed): add audit-seed-state.ts read-only QA report

Stage 1 of the seed merchant enrichment workstream. Reports against
9 rules (R1-R9) covering voucher coverage, media, opening hours,
PINs, address, contact, category, leaked-fixture prefixes, real-
merchant coord verification. Dry-run by default; --strict exits 1
on any rule failure; --json emits machine-readable output for CI.

Plan: docs/superpowers/plans/2026-05-20-seed-merchant-enrichment.md"
```

### Task 1.2: Non-blocking guardrail vitest test

**Files:**
- Create: `tests/prisma/seed-guardrail.test.ts`

- [ ] **Step 1: Write the test file pinning the same R1-R9 rules**

```ts
// tests/prisma/seed-guardrail.test.ts
//
// Real-DB integration test (§BU pattern) — runs the same audit script
// inline against the connected DB. Stage 1 ships this as NON-BLOCKING:
// the test exists, is skipped by default via `describe.skip`, and can
// be flipped to `describe` for manual local QA.  Stage 4 promotes it
// to active (un-skipped) once Stages 2/3 have closed the rule failures.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const REAL_MERCHANT_IDS = new Set([
  'tax-merchant-karaara-001',
  'tax-merchant-mykerala-001',
  'tax-merchant-covelum-001',
])

const LEAKED_FIXTURE_PREFIXES = [
  'P1Test-', 'SummaryTest-', 'SummaryTestOther-', 'TEST ',
  'UpsertRevive-', 'Revive-', 'Drift-', 'FilterFlip-',
] as const

beforeAll(async () => { await prisma.$queryRaw`SELECT 1` }, 15000)
afterAll(async () => { await prisma.$disconnect() })

// Stage 1 ships as describe.skip — non-blocking until Stage 2/3 close the gaps.
// Stage 4 flips this to `describe` to make it CI-blocking.
describe.skip('seed-guardrail (Stage 4 will un-skip)', () => {
  it('R1: every active branch of an ACTIVE merchant has >=1 approved voucher', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true, businessName: true,
        branches: { where: { isActive: true }, select: { id: true } },
        vouchers: { where: { status: 'ACTIVE', approvalStatus: 'APPROVED' }, select: { id: true } },
      },
    })
    const offenders = merchants
      .filter(m => m.branches.length > 0 && m.vouchers.length === 0)
      .map(m => m.businessName)
    expect(offenders, `Merchants with active branches but 0 approved vouchers: ${offenders.join(', ')}`).toEqual([])
  })

  it('R2: every customer-visible merchant has logoUrl AND bannerUrl', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, businessName: true, logoUrl: true, bannerUrl: true },
    })
    const offenders = merchants
      .filter(m => !m.logoUrl || !m.bannerUrl)
      .map(m => m.businessName)
    expect(offenders).toEqual([])
  })

  it('R3: every active branch has at least one BranchOpeningHours row', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, openingHours: { select: { id: true } } },
    })
    const offenders = branches.filter(b => b.openingHours.length === 0).map(b => b.name)
    expect(offenders).toEqual([])
  })

  it('R4: every active branch has redemptionPin set', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, redemptionPin: true },
    })
    const offenders = branches.filter(b => !b.redemptionPin).map(b => b.name)
    expect(offenders).toEqual([])
  })

  it('R5: every active branch has address (addressLine1, city, postcode, country)', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, addressLine1: true, city: true, postcode: true, country: true },
    })
    const offenders = branches
      .filter(b => !b.addressLine1 || !b.city || !b.postcode || !b.country)
      .map(b => b.name)
    expect(offenders).toEqual([])
  })

  it('R6: every active branch has phone OR email contact', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { status: 'ACTIVE' } },
      select: { id: true, name: true, phone: true, email: true },
    })
    const offenders = branches.filter(b => !b.phone && !b.email).map(b => b.name)
    expect(offenders).toEqual([])
  })

  it('R7: every customer-visible merchant has primaryCategoryId set', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, businessName: true, primaryCategoryId: true },
    })
    const offenders = merchants.filter(m => !m.primaryCategoryId).map(m => m.businessName)
    expect(offenders).toEqual([])
  })

  it('R8: no leaked-test-fixture-prefix merchants are ACTIVE', async () => {
    const merchants = await prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, businessName: true },
    })
    const offenders = merchants
      .filter(m => LEAKED_FIXTURE_PREFIXES.some(p => m.businessName.startsWith(p)))
      .map(m => m.businessName)
    expect(offenders).toEqual([])
  })

  it('R9: real merchants have MANUALLY_CONFIRMED branches with non-null coords', async () => {
    const branches = await prisma.branch.findMany({
      where: { isActive: true, merchant: { id: { in: Array.from(REAL_MERCHANT_IDS) } } },
      select: { id: true, name: true, latitude: true, longitude: true, locationConfidence: true },
    })
    const offenders = branches
      .filter(b => b.locationConfidence !== 'MANUALLY_CONFIRMED' || b.latitude === null || b.longitude === null)
      .map(b => b.name)
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test in skipped state to verify it parses + connects**

Run: `npx vitest run tests/prisma/seed-guardrail.test.ts 2>&1 | tail -10`

Expected: `9 skipped (9)`. Confirms the file compiles + the DB adapter works + describe.skip is honoured.

- [ ] **Step 3: Manually flip describe.skip → describe in a local edit, run, observe failures, revert**

Local verification only — do NOT commit the flipped state. Expected failures match the §2 snapshot.

- [ ] **Step 4: Commit**

```bash
git add tests/prisma/seed-guardrail.test.ts
git commit -m "test(seed): add seed-guardrail vitest pinning R1-R9 (Stage 1 skipped)

Real-DB integration pattern (§BU). 9 tests cover R1-R9 from the audit
script. Ships describe.skip — non-blocking until Stage 4 promotes
once Stages 2/3 close the rule failures.

Plan: docs/superpowers/plans/2026-05-20-seed-merchant-enrichment.md"
```

### Task 1.3: Stage 1 PR

- [ ] **Step 1: Create branch + push + open PR**

```bash
git checkout -b feature/seed-merchant-enrichment-stage-1-audit
git push -u origin feature/seed-merchant-enrichment-stage-1-audit
gh pr create --title "feat(seed): Stage 1 — audit script + skipped guardrail test" \
  --body "Stage 1 of the seed merchant enrichment workstream. Read-only audit script + skipped guardrail vitest. Zero data changes. See plan §Stage 1."
```

- [ ] **Step 2: Verify CI green (vitest --workspace-aware exits 0 because describe.skip)**

- [ ] **Step 3: Wait for owner approval. PAUSE.**

### Stage 1 owner approval gate

Owner reviews the audit report output + decides which Stage 2 rules to close first. Stage 2 cannot start until owner confirms scope.

---

## Stage 2: Vouchers + media + opening hours + PINs for fake/demo merchants

**Goal:** Close R1 (vouchers), R2 (media), R3 (hours), R4 (PINs), R5 (address), R6 (contact), R7 (category) for the 9 fake/demo merchants. Real merchants stay untouched in this stage.

**D3 locked:** 3 vouchers per fake/demo merchant unless the category naturally supports fewer. Mix of types to exercise the multi-voucher carousel + multi-type pill colours.

**D2 locked:** every branch redemption PIN = `1234` (dev/QA only). The enrichment helper marks this clearly via a `DEV_QA_PIN` named constant + comment.

**Out of scope this stage:**
- Real-merchant coord changes (Stage 3)
- Real-merchant voucher/media changes (already populated for Karaara, My Kerala, Covelum, The Coffee House — verify in audit only)
- New merchants
- Renames

### Task 2.1: Per-merchant enrichment data table

Build a deterministic data file the seed function reads from. Avoid hardcoding 9× copies in the seed function — single source of truth.

**Files:**
- Create: `prisma/seed-data/demoMerchantEnrichment.ts`

- [ ] **Step 1: Define the data shape**

```ts
// prisma/seed-data/demoMerchantEnrichment.ts
//
// QA-only enrichment data for the 9 fake/demo taxonomy-seeded merchants.
// Real merchants (Karaara, My Kerala, Covelum) are NOT in this file —
// they go through the trusted Google Places workflow in Stage 3.
//
// This file is the deterministic source of truth: every field is
// hand-authored, plausible for QA, and contains no real PII (PINs are
// dev-only).  Logo + banner URLs use placehold.co (deterministic) +
// Unsplash imagery for a realistic feel.

export type DemoMerchantEnrichment = {
  merchantId: string
  logoUrl: string
  bannerUrl: string
  websiteUrl: string | null
  /** Vouchers to upsert if absent — keyed by RMV/RCV ID. */
  vouchers: Array<{
    id: string
    title: string
    description: string
    type: 'BOGO' | 'DISCOUNT_PERCENT' | 'DISCOUNT_FIXED' | 'FREEBIE' | 'PACKAGE_DEAL'
    estimatedSaving: number
    cooldownSeconds?: number
  }>
  /** Per-branch enrichment — keyed by branch.id. */
  branches: Record<string, DemoBranchEnrichment>
}

export type DemoBranchEnrichment = {
  /** AES-256-GCM-encrypted via the existing encryptPin helper in the seed. */
  redemptionPinPlaintext: string
  /** 7-day schedule. dayOfWeek 0=Sunday … 6=Saturday. */
  openingHours: Array<{ dayOfWeek: 0|1|2|3|4|5|6; openTime: string; closeTime: string; isClosed: boolean }>
  /** Address gap-fills. Only fields that need patching. */
  phone?: string
  email?: string
}

export const DEMO_MERCHANT_ENRICHMENT: DemoMerchantEnrichment[] = [
  // 9 entries, one per fake/demo merchant. Populated in Step 2.
]
```

- [ ] **Step 2: Populate the 9 entries**

```ts
// Sample for one merchant. Repeat the pattern for all 9.
// IMPORTANT: every entry must be ACTUALLY filled out — no placeholders.
// Single shared dev/QA PIN — declared once at the top of this file:
//
//   /** DEV/QA ONLY — every dev/QA branch uses this PIN per the
//    *  plan §0 D2 lock. NOT a production secret. */
//   export const DEV_QA_PIN = '1234'
//
// Sample for one merchant. Repeat the pattern for all 9 (D3: 3 vouchers
// each, varying mix of types; exception called out if the merchant
// category naturally supports fewer).
{
  merchantId: 'tax-merchant-cafe-001',
  logoUrl: 'https://placehold.co/200x200/8B4513/FFFFFF.png?text=B%26B',
  bannerUrl: 'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=1200',
  websiteUrl: 'https://example.com/bean-and-brew',
  vouchers: [
    {
      id: 'tax-voucher-cafe-001-rcv-1',
      title: '20% off any breakfast',
      description: 'Valid Mon-Fri 7am-11am. One voucher per customer per visit.',
      type: 'DISCOUNT_PERCENT',
      estimatedSaving: 3.50,
      cooldownSeconds: 1800,
    },
    {
      id: 'tax-voucher-cafe-001-rcv-2',
      title: 'BOGO any speciality coffee',
      description: 'Buy one get one free on any flat white, latte, or cappuccino.',
      type: 'BOGO',
      estimatedSaving: 4.20,
    },
    {
      id: 'tax-voucher-cafe-001-rcv-3',
      title: 'Free pastry with any hot drink',
      description: 'Add a croissant or muffin free of charge when you order a hot drink.',
      type: 'FREEBIE',
      estimatedSaving: 2.80,
    },
  ],
  branches: {
    'tax-branch-cafe-001': {
      redemptionPinPlaintext: DEV_QA_PIN,
      openingHours: [
        { dayOfWeek: 1, openTime: '07:00', closeTime: '17:00', isClosed: false },
        { dayOfWeek: 2, openTime: '07:00', closeTime: '17:00', isClosed: false },
        { dayOfWeek: 3, openTime: '07:00', closeTime: '17:00', isClosed: false },
        { dayOfWeek: 4, openTime: '07:00', closeTime: '17:00', isClosed: false },
        { dayOfWeek: 5, openTime: '07:00', closeTime: '17:00', isClosed: false },
        { dayOfWeek: 6, openTime: '08:00', closeTime: '15:00', isClosed: false },
        { dayOfWeek: 0, openTime: '08:00', closeTime: '15:00', isClosed: false },
      ],
      phone: '+441234567890',
      email: 'hello@bean-and-brew.test',
    },
  },
},
// ... 8 more entries: pilates, iron-forge-gym, aesthetics, foodhall,
//     pinos-pizzeria, polish-nails, trim-co-barbers, vet.
//
// Each gets 3 vouchers (D3) UNLESS the merchant category naturally
// supports fewer — in that case the entry has an inline `// EXCEPTION:`
// comment explaining why (e.g. a vet practice may only support 1
// genuine voucher type like "free first consultation"). Stage 2
// implementer's gate before commit: every fake/demo merchant has 3
// vouchers OR a documented exception.
```

**Step 2 acceptance:** every of the 9 merchants has at least 1 voucher with plausible copy + 7-day opening hours + a PIN (use `1234` consistently per the existing dev-seed convention) + phone + email.

- [ ] **Step 3: Commit the data table**

```bash
git add prisma/seed-data/demoMerchantEnrichment.ts
git commit -m "feat(seed): add demoMerchantEnrichment data table for 9 fake merchants"
```

### Task 2.2: Wire the enrichment into the seed function

**Files:**
- Modify: `prisma/seed.ts:1276-1483` (`seedDemoMerchantEnrichment()` extended)

- [ ] **Step 1: Read the existing `seedDemoMerchantEnrichment()` to understand the encryptPin helper + the upsert pattern it already uses for Covelum.**

Run: `sed -n '1276,1340p' /Users/shebinchaliyath/Developer/Redeemo/prisma/seed.ts`

- [ ] **Step 2: Extend the function to iterate `DEMO_MERCHANT_ENRICHMENT`**

```ts
// Insert at the top of seedDemoMerchantEnrichment() after the
// existing Covelum-specific logic, OR refactor the Covelum block
// to use a shared per-merchant helper.

import { DEMO_MERCHANT_ENRICHMENT } from './seed-data/demoMerchantEnrichment'

// ... inside seedDemoMerchantEnrichment():
for (const entry of DEMO_MERCHANT_ENRICHMENT) {
  await prisma.merchant.update({
    where: { id: entry.merchantId },
    data: {
      logoUrl: entry.logoUrl,
      bannerUrl: entry.bannerUrl,
      websiteUrl: entry.websiteUrl,
    },
  })

  // Vouchers: upsert by id (idempotent — re-running seed won't dup).
  for (const v of entry.vouchers) {
    await prisma.voucher.upsert({
      where: { id: v.id },
      create: {
        id:               v.id,
        merchantId:       entry.merchantId,
        title:            v.title,
        description:      v.description,
        type:             v.type,
        estimatedSaving:  v.estimatedSaving,
        status:           'ACTIVE',
        approvalStatus:   'APPROVED',
        approvedAt:       new Date(),
        cooldownSeconds:  v.cooldownSeconds ?? null,
      },
      update: {
        title:           v.title,
        description:     v.description,
        type:            v.type,
        estimatedSaving: v.estimatedSaving,
        status:          'ACTIVE',
        approvalStatus:  'APPROVED',
      },
    })
  }

  // Per-branch enrichment: PIN + opening hours + contact.
  for (const [branchId, b] of Object.entries(entry.branches)) {
    const encryptedPin = encryptPin(b.redemptionPinPlaintext)
    await prisma.branch.update({
      where: { id: branchId },
      data: {
        redemptionPin: encryptedPin,
        phone:         b.phone ?? null,
        email:         b.email ?? null,
      },
    })
    // Opening hours — delete existing rows then re-create (idempotent).
    await prisma.branchOpeningHours.deleteMany({ where: { branchId } })
    for (const oh of b.openingHours) {
      await prisma.branchOpeningHours.create({
        data: { branchId, dayOfWeek: oh.dayOfWeek, openTime: oh.openTime, closeTime: oh.closeTime, isClosed: oh.isClosed },
      })
    }
  }
}
```

- [ ] **Step 3: Run the seed**

```bash
npx prisma db seed 2>&1 | tail -20
```

Expected: completes without error.

- [ ] **Step 4: Run the audit script — R1-R7 + R4 failures should be 0 for the 9 fake merchants**

```bash
npx tsx prisma/audit-seed-state.ts 2>&1 | tail -40
```

Expected: R1 = 0 failures, R2 = 0 failures, R3 = 0 failures, R4 = 0 failures, R5 = 0 failures, R6 = 0 failures, R7 = 0 failures. R8 still reports the 22 leaked fixtures (Stage 4 cleans). R9 still 0 (real merchants unchanged).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): enrich 9 fake/demo merchants with vouchers + media + hours + PINs"
```

### Task 2.3: Stage 2 PR

- [ ] **Step 1: Open PR + verify CI**

```bash
git checkout -b feature/seed-merchant-enrichment-stage-2-enrich
git push -u origin feature/seed-merchant-enrichment-stage-2-enrich
gh pr create --title "feat(seed): Stage 2 — enrich 9 fake/demo merchants for QA" \
  --body "Stage 2 of the seed merchant enrichment workstream. Closes R1-R7 for the 9 fake/demo merchants via prisma/seed-data/demoMerchantEnrichment.ts. R8 still open (Stage 4). R9 unchanged. See plan §Stage 2."
```

- [ ] **Step 2: Owner reviews audit-script output post-merge. PAUSE for owner sign-off before Stage 3.**

---

## Stage 3: Real-merchant coordinate verification

> **EXECUTION ORDER NOTE (D4 lock):** Stage 3 runs AFTER Stage 4. Sequence: Stage 1 → Stage 2 → Stage 4 → Stage 3. Stage 3 is intentionally kept last because (a) leaked fixtures need cleaning before QA can trust pin counts, (b) coord verification is independently approval-gated per-branch and shouldn't block the guardrail going live.

**Goal:** For each of the 3 real merchants' active branches, run the trusted Google Places workflow ONCE per branch in suggest mode (no DB writes), present the before/after to owner, apply only on per-branch owner approval.

**D5 locked:** Google Places verification scope = Karaara, My Kerala, Covelum branches ONLY. Trim & Co Barbers + Wagtail Veterinary Practice + every other fake/demo merchant stays MANUALLY POSITIONED in plausible QA locations (Stage 2 set their coords in the seed; Stage 3 does NOT touch them).

**Real merchant branches (4 total):**
1. `tax-branch-karaara-001` — Karaara Huddersfield
2. `tax-branch-mykerala-001` — My Kerala Ipswich
3. `tax-branch-covelum-001` — Covelum Brightlingsea **(already corrected via PR #113 fixup-2; SKIP)**
4. `tax-branch-covelum-002` — Covelum Colchester

**Net: 3 branches need a Stage 3 suggest call** (Karaara + My Kerala + Covelum Colchester). Each invocation costs 1 Google Places Text Search call.

### Task 3.1: Run suggest-only for Karaara Huddersfield

- [ ] **Step 1: Suggest mode (no writes)**

```bash
npx tsx prisma/suggest-branch-pin.ts tax-branch-karaara-001 2>&1 | tail -25
```

- [ ] **Step 2: Report before/after to owner. PAUSE.**

Owner reviews source confidence + delta. If material delta + acceptable Google candidate, owner says "apply". Otherwise hold or skip.

- [ ] **Step 3: If approved, run --confirm-place-id with the owner-greenlit placeId**

```bash
npx tsx prisma/suggest-branch-pin.ts tax-branch-karaara-001 \
  --confirm-place-id <PLACE_ID> \
  --note "Seed enrichment Stage 3 — Google Places confirmation 2026-05-20"
```

- [ ] **Step 4: Mirror the new lat/lng into `prisma/seed.ts` (find the Karaara branch entry + update the literals + add a fixup comment)**

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "fix(seed): apply Karaara Huddersfield coord correction (Google Places confirmation)"
```

### Task 3.2: Run suggest-only for My Kerala Ipswich

Same pattern as Task 3.1, swap branch id to `tax-branch-mykerala-001`.

- [ ] **Step 1: Suggest** + **Step 2: Owner approval pause** + **Step 3: Confirm if approved** + **Step 4: Mirror into seed.ts** + **Step 5: Commit**

### Task 3.3: Run suggest-only for Covelum Colchester

Same pattern, branch id `tax-branch-covelum-002`.

- [ ] **Step 1: Suggest** + **Step 2: Owner approval pause** + **Step 3: Confirm if approved** + **Step 4: Mirror into seed.ts** + **Step 5: Commit**

### Task 3.4: Stage 3 PR

- [ ] **Step 1: Open PR with cumulative commits from 3.1 / 3.2 / 3.3 (only the ones owner approved — skip merchants the owner held)**

```bash
git checkout -b feature/seed-merchant-enrichment-stage-3-real-coords
git push -u origin feature/seed-merchant-enrichment-stage-3-real-coords
gh pr create --title "feat(seed): Stage 3 — real merchant coord verification (Google Places)" \
  --body "Stage 3 of the seed merchant enrichment workstream. Applies Google-Places-confirmed coords to the real merchants Karaara / My Kerala / Covelum Colchester (per owner per-branch approval). Covelum Brightlingsea was already corrected via PR #113 fixup-2 and is not in this PR. Fake/demo merchants are NOT touched. See plan §Stage 3."
```

- [ ] **Step 2: Owner device-QA re-check of each corrected pin position on Map.**

---

## Stage 4: Promote guardrail to CI-blocking + clean leaked fixtures

> **EXECUTION ORDER NOTE (D4 lock):** Stage 4 runs BEFORE Stage 3. Sequence: Stage 1 → Stage 2 → **Stage 4** → Stage 3. Reason: leaked fixtures (22 surfaced in §2 audit) are actively affecting QA trust on Discovery surfaces; clean + guard them BEFORE Phase 2.3 Home / Phase 2.4 Category rely on the seed. R9 (real-merchant coords) is closed last because it's independently approval-gated.

**Goal:** With Stages 1-2 closed, R1-R7 should pass. R8 fails until Stage 4 cleans the leaked fixtures. R9 still fails until Stage 3 closes (deferred). Stage 4 promotes the guardrail to ACTIVE (un-skips the `describe.skip`) for R1-R8 specifically. R9 can be added to the active set after Stage 3 lands.

### Task 4.1: Clean the leaked test fixtures

**Files:**
- Create: `prisma/clean-leaked-test-fixtures.ts`

- [ ] **Step 1: Write the script (mirror `prisma/clean-leaked-p1test-fixtures.ts`)**

```ts
// prisma/clean-leaked-test-fixtures.ts
//
// Scoped one-off cleanup for the test-fixture prefix classes surfaced
// during the 2026-05-20 seed audit.  Dry-run default; --confirm to
// delete.  Cascade order mirrors clean-leaked-p1test-fixtures.ts.

const PREFIXES = [
  'SummaryTest-',
  'SummaryTestOther-',
  'TEST ',
  'UpsertRevive-',
  'Revive-',
  'Drift-',
  'FilterFlip-',
]

// [Full implementation mirrors clean-leaked-p1test-fixtures.ts —
//  iterate prefixes, gather merchants + branches + users, cascade
//  delete dependents-first, report counts.]
```

- [ ] **Step 2: Dry-run** + **Step 3: Apply with --confirm** + **Step 4: Verify R8 = 0 failures**

- [ ] **Step 5: Commit**

### Task 4.2: Lift `sweepFixtures()` into shared helper

**Files:**
- Create: `tests/api/_shared/fixtureSweep.ts`
- Modify: 7 test files in `tests/api/customer/discovery/` to use the shared helper

The helper takes a `{ merchantPrefix?, userEmailPrefix? }` config and runs the same cascade-deleteMany pattern the `discovery.selectedBranch.test.ts` hardening shipped via PR #113 fixup-1.

- [ ] **Step 1: Write shared helper** (full implementation, no placeholder)
- [ ] **Step 2: Audit each of the 7 candidate test files** + identify their Date.now() prefix shapes
- [ ] **Step 3: Wire each test file to call `sweepFixtures(prisma, { merchantPrefix: '...', userEmailPrefix: '...' })` in beforeAll + afterAll**
- [ ] **Step 4: Run all 7 files in isolation — verify each cleans up to zero leftovers via the audit script**
- [ ] **Step 5: Commit**

### Task 4.3: Promote guardrail vitest from `describe.skip` to `describe` (R1-R8 only; R9 deferred to Stage 3)

**Files:**
- Modify: `tests/prisma/seed-guardrail.test.ts` — flip the outer `describe.skip(...)` to `describe(...)`. Inside the block, wrap the R9 test in `it.skip(...)` (will be un-skipped when Stage 3 closes real-merchant coord verification).

- [ ] **Step 1: Run guardrail against current dev DB — expect R1-R8 PASS, R9 SKIP**

```bash
npx vitest run tests/prisma/seed-guardrail.test.ts 2>&1 | tail -10
```

Expected: `8 passed | 1 skipped`. (R1-R8 active; R9 skipped pending Stage 3.)

- [ ] **Step 2: Commit the unskip**
- [ ] **Step 3: Wire into CI** (if not already running via the default `npx vitest run` flow)

**Note for Stage 3 follow-up:** after Stage 3 closes (Google Places verification applied + seed coords mirrored), open a single-commit follow-up that flips R9 from `it.skip` to `it`. Run the guardrail — expect `9 passed`.

### Task 4.4: Stage 4 PR

- [ ] **Step 1: Open PR + verify CI green (guardrail must pass)**
- [ ] **Step 2: Owner final review.**

---

## 4. Self-review checklist (run by me before saving)

**Spec coverage (against owner's 6 numbered scope items + PIN audit addition):**

| Owner item | Plan task |
|---|---|
| 1. Audit current seed/demo merchants + active branches (name, real-vs-fake, address, contact, category, logo, banner, hours, vouchers, discovery visibility, coord confidence) | Task 1.1 R1-R7 + §2 snapshot |
| 2. Real-vs-fake classification (Karaara, My Kerala, Covelum real; rest fake; no Google Places for fake) | §1 + Stage 3 limits Google Places to 3 real branches |
| 3. Every customer-visible branch ≥1 approved voucher; ideal logo+banner+copy+hours+complete details+category | R1 + R2 + R3 + R5 + R6 + R7 + Stage 2 fills the gaps |
| 4. Plan what to update + where (seed.ts vs demo seed vs helper vs audit script/test) | §3 file structure + Task 2.1 data table + Task 2.2 seed wire-up |
| 5. Guardrails (no vouchers, missing media, missing details, Google Places on fakes, suspicious coords) | R1 / R2 / R5 / R6 / R7 + R8 prefix detector + R9 real-merchant verifier; guardrail test in Task 1.2 |
| 6. Staged implementation (Stage 1 audit/report; Stage 2 vouchers+media; Stage 3 real coords; Stage 4 guardrail+harden) | §Stage 1 / §Stage 2 / §Stage 3 / §Stage 4 |
| PIN audit (added mid-investigation) | R4 (R4 implemented in audit script + guardrail test; Stage 2 sets PINs for the 9 fake merchants) |

**Placeholder scan:** No `TBD`, `TODO`, `implement later`. The voucher copy in §Task 2.1 Step 2 has ONE sample populated; the remaining 8 entries are described as "populate the pattern" — that's a real plan-failure risk. **Fix:** Note that Task 2.1 Step 2 acceptance gate requires all 9 entries hand-authored before Step 3 commit. The plan does not show every entry verbatim because that would balloon the doc to ~500 lines of voucher copy — but the acceptance check forces no-placeholder before commit.

**Type consistency:** `RuleResult` shape is consistent across Task 1.1 + Task 1.2. `DemoMerchantEnrichment` shape used identically in Task 2.1 + 2.2. `LEAKED_FIXTURE_PREFIXES` defined once in `audit-seed-state.ts` + duplicated in `seed-guardrail.test.ts` (intentional — keep test self-contained per §BU pattern).

**Scope sanity:** Stage 1 ships ZERO data writes. Stage 2 touches 9 merchants only (not 13). Stage 3 limits Google Places to 3 calls max. Stage 4 cleans 22 fixtures + extends to 7 test files. Plan respects "do not edit seed data yet" — that's literally Stage 2.

---

## 5. Open decisions surfaced for owner

1. **Stage 1 timing:** open Stage 1 PR immediately on plan approval, or wait until Phase 2.3 Home planning is closer? My read: open Stage 1 immediately — the audit script is read-only and accelerates Stage 2 design.

2. **R3 hours data source:** hand-authored per-merchant (current plan) vs lifted from a stock realistic-hours fixture? Hand-authored is more work but matches the "realistic QA data" goal better. Hand-authored chosen.

3. **PIN value:** all branches use `1234` (current dev convention) OR vary per branch for QA-realism? Owner's call. Default in plan: `1234` per merchant (vary by merchant if owner prefers).

4. **Voucher count per merchant:** plan defaults to 1 voucher per fake merchant. Owner can ask for more (3-5 to exercise the multi-voucher carousel on Merchant Profile). Defaults to 1 for minimum-viable.

5. **Stage 4 CI promotion:** flip the guardrail to CI-blocking immediately on Stage 2 merge, OR wait until Stage 3 closes R9? Plan says Stage 4 (after Stages 2 + 3 both close their respective rules). Owner can compress if they want.

6. **Other Stage 3 candidates:** Trim & Co Barbers and Wagtail Veterinary Practice currently have `MANUALLY_CONFIRMED` coords but their seed lat/lng may be plausible-but-unverified. Owner explicitly lists only Karaara / My Kerala / Covelum as real — but if Trim & Co + Wagtail Vet are also "real-feel demo brands that need plausible coords", Stage 3 could include them. Default: skip (per owner direction "real merchants I know about").

---

## 6. Execution handoff

Plan complete and ready to save to `docs/superpowers/plans/2026-05-20-seed-merchant-enrichment.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**

(Either way, Stage 1 should land before Stage 2 starts — the audit script is the source of truth for what Stage 2 needs to close.)
