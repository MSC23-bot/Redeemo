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

  return results
}

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

main().catch((err) => { console.error(err); process.exit(1) })
