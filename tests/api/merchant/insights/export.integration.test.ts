import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import {
  newFixtureIds,
  seedMerchant,
  seedBranch,
  seedUser,
  seedVoucher,
  seedRedemption,
  cleanup,
  type FixtureIds,
} from './_helpers/testDb'
import { makeTestPrisma } from './_helpers/testDb'
import type { PrismaClient } from '../../../../generated/prisma/client'
import type { MerchantContext } from '../../../../src/api/merchant/shared'
import {
  getInsightsExport,
  type InsightsFilters,
} from '../../../../src/api/merchant/insights/service'
import { insightsRowsToCsv } from '../../../../src/api/merchant/insights/format'
import { periodWindow } from '../../../../src/api/merchant/insights/london'

// Insights PR-A Task A8 EXPORT (real local DB).
//
// The event-level Redemption-activity CSV is GATED (spec 10.1 / 13.5 / 13.6): it
// sits inside the bounded privacy/legal review. This suite pins:
//   - GATE CLOSED -> getInsightsExport returns { available:false } and runs NO query.
//   - GATE OPEN   -> event-level eligible rows, scoped, London-rendered date/time,
//                    voucher title, branch name, 7-type label, estimated value,
//                    status (Confirmed/Awaiting), validation method (where Confirmed).
//   - NO direct identifiers anywhere (header + body): no name/email/phone/userId/postcode.
//   - csvCell formula-injection escaping (a '=' title neutralised).
//   - explicit cap + a SINGLE truncation-notice row (no silent truncation).
//
// `now` is INJECTED into filters for deterministic windows (no Date.now()).

const NOW = new Date()
const LAST_MONTH = periodWindow('last_month', NOW)

function midWindow(w: { startUtc: Date | null; endUtc: Date }): Date {
  const start = w.startUtc!.getTime()
  const end = w.endUtc.getTime()
  return new Date(start + Math.min(10 * 24 * 60 * 60 * 1000, (end - start) / 2))
}

const IN_LAST_MONTH = midWindow(LAST_MONTH)
const IN_LAST_MONTH_2 = new Date(IN_LAST_MONTH.getTime() + 2 * 24 * 60 * 60 * 1000)

// An OWNER, all-branches context (null scope = all of this merchant's branches).
function ownerCtx(merchantId: string): MerchantContext {
  return {
    merchantId,
    role: 'OWNER',
    allBranches: true,
    allowedBranchIds: [],
  } as unknown as MerchantContext
}

const lastMonthFilters: InsightsFilters = { period: 'last_month', now: NOW }

describe('Insights export (getInsightsExport + insightsRowsToCsv) : real local DB', () => {
  let prisma: PrismaClient
  let ids: FixtureIds

  let merchantId: string
  let branch1: string
  let branch2: string
  let voucherBogo: string
  let voucherDiscFixed: string
  let voucherFormula: string

  beforeAll(async () => {
    prisma = makeTestPrisma()
    ids = newFixtureIds()

    merchantId = await seedMerchant(prisma, ids, { businessName: 'Export Co' })
    branch1 = await seedBranch(prisma, ids, merchantId, { name: 'Export Branch One' })
    branch2 = await seedBranch(prisma, ids, merchantId, { name: 'Export Branch Two' })

    voucherBogo = await seedVoucher(prisma, ids, merchantId, { type: 'BOGO', title: 'Two for one', estimatedSaving: 10 })
    voucherDiscFixed = await seedVoucher(prisma, ids, merchantId, { type: 'DISCOUNT_FIXED', title: 'Five off', estimatedSaving: 4 })
    // A formula-injection title: the CSV must neutralise a leading '='.
    voucherFormula = await seedVoucher(prisma, ids, merchantId, { type: 'FREEBIE', title: '=SUM(A1:A2)', estimatedSaving: 0 })

    // Two distinct customers with PII-shaped emails (must NEVER appear in the CSV).
    const u1 = await seedUser(prisma, ids, { email: 'alice.exportpii@example.com' })
    const u2 = await seedUser(prisma, ids, { email: 'bob.exportpii@example.com' })

    // Last-month eligible rows: one confirmed (PIN), one awaiting, one confirmed
    // (QR_SCAN) on the formula-title voucher.
    await seedRedemption(prisma, ids, {
      userId: u1, voucherId: voucherBogo, branchId: branch1,
      redeemedAt: IN_LAST_MONTH, isValidated: true, validatedAt: IN_LAST_MONTH, validationMethod: 'PIN', estimatedSaving: 10,
    })
    await seedRedemption(prisma, ids, {
      userId: u2, voucherId: voucherDiscFixed, branchId: branch2,
      redeemedAt: IN_LAST_MONTH_2, isValidated: false, estimatedSaving: 4,
    })
    await seedRedemption(prisma, ids, {
      userId: u1, voucherId: voucherFormula, branchId: branch1,
      redeemedAt: IN_LAST_MONTH_2, isValidated: true, validatedAt: IN_LAST_MONTH_2, validationMethod: 'QR_SCAN', estimatedSaving: 0,
    })
  })

  afterEach(() => {
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await cleanup(prisma, ids)
    await prisma.$disconnect()
  })

  // ── GATE CLOSED ────────────────────────────────────────────────────────────

  it('returns { available:false } and runs NO query when the gate is CLOSED', async () => {
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    const raw = vi.spyOn(prisma, '$queryRaw')
    const rawUnsafe = vi.spyOn(prisma, '$queryRawUnsafe')

    const result = await getInsightsExport(prisma, ownerCtx(merchantId), lastMonthFilters)

    expect(result).toEqual({ available: false })
    // The gate is checked BEFORE any DB access: neither raw path runs.
    expect(raw).not.toHaveBeenCalled()
    expect(rawUnsafe).not.toHaveBeenCalled()
  })

  // ── GATE OPEN: columns + content ─────────────────────────────────────────────

  it('returns event-level eligible rows (scoped, London-rendered) when the gate is OPEN', async () => {
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '1'
    const result = await getInsightsExport(prisma, ownerCtx(merchantId), lastMonthFilters)
    expect('available' in result).toBe(false)
    if ('available' in result) throw new Error('expected open result')

    expect(result.truncated).toBe(false)
    expect(result.rows.length).toBe(3)

    // Find the BOGO confirmed row.
    const bogo = result.rows.find((r) => r.voucherTitle === 'Two for one')
    expect(bogo).toBeTruthy()
    expect(bogo!.branchName).toBe('Export Branch One')
    expect(bogo!.type7).toBe('BOGO')
    expect(bogo!.status).toBe('Confirmed')
    expect(bogo!.validationMethod).toBe('PIN')
    expect(bogo!.estimatedSaving).toBe(10)
    // London-rendered date (YYYY-MM-DD) + time (HH:MM:SS).
    expect(bogo!.redeemedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(bogo!.redeemedTime).toMatch(/^\d{2}:\d{2}:\d{2}$/)

    // Awaiting row: no validation method.
    const awaiting = result.rows.find((r) => r.voucherTitle === 'Five off')
    expect(awaiting!.status).toBe('Awaiting')
    expect(awaiting!.validationMethod).toBeNull()

    // DISCOUNT_FIXED collapses to the 7-type label DISCOUNT.
    expect(awaiting!.type7).toBe('DISCOUNT')
  })

  // ── PII EXCLUSION ────────────────────────────────────────────────────────────

  it('the CSV header + body contain NO direct customer identifiers', async () => {
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '1'
    const result = await getInsightsExport(prisma, ownerCtx(merchantId), lastMonthFilters)
    if ('available' in result) throw new Error('expected open result')
    const csv = insightsRowsToCsv(result.rows, result.truncated)

    const lower = csv.toLowerCase()
    // No Customer column header (unlike the operational redemptions export).
    expect(lower).not.toContain('customer')
    expect(lower).not.toContain('email')
    expect(lower).not.toContain('phone')
    expect(lower).not.toContain('userid')
    expect(lower).not.toContain('postcode')
    // No seeded PII values leak.
    expect(lower).not.toContain('alice.exportpii')
    expect(lower).not.toContain('bob.exportpii')
    expect(lower).not.toContain('@example.com')

    // The expected header columns ARE present.
    const headerLine = csv.split('\r\n')[0]
    expect(headerLine).toContain('Redeemed date')
    expect(headerLine).toContain('Redeemed time')
    expect(headerLine).toContain('Voucher')
    expect(headerLine).toContain('Branch')
    expect(headerLine).toContain('Type')
    expect(headerLine).toContain('Estimated value')
    expect(headerLine).toContain('Status')
    expect(headerLine).toContain('Method')
  })

  // ── FORMULA-INJECTION ESCAPING ───────────────────────────────────────────────

  it('neutralises a formula-injection voucher title with a leading apostrophe', async () => {
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '1'
    const result = await getInsightsExport(prisma, ownerCtx(merchantId), lastMonthFilters)
    if ('available' in result) throw new Error('expected open result')
    const csv = insightsRowsToCsv(result.rows, result.truncated)

    // The raw "=SUM(A1:A2)" must be neutralised to "'=SUM(A1:A2)" (apostrophe-prefixed),
    // and must NOT appear as a bare leading '=' inside a quoted cell.
    expect(csv).toContain('"\'=SUM(A1:A2)"')
    expect(csv).not.toContain('"=SUM(A1:A2)"')
  })

  // ── CAP + TRUNCATION NOTICE ──────────────────────────────────────────────────

  it('appends a SINGLE truncation-notice row when over the cap (no silent truncation)', async () => {
    // The 3 seeded eligible rows + a tiny injected cap of 2 forces CAP+1 detection
    // without seeding 50k rows. The notice row is appended exactly once.
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '1'
    const result = await getInsightsExport(prisma, ownerCtx(merchantId), lastMonthFilters, { cap: 2 })
    if ('available' in result) throw new Error('expected open result')

    expect(result.truncated).toBe(true)
    expect(result.rows.length).toBe(2) // capped to exactly `cap`

    const csv = insightsRowsToCsv(result.rows, result.truncated)
    const lines = csv.split('\r\n')
    const noticeLines = lines.filter((l) => l.toLowerCase().includes('truncated'))
    expect(noticeLines.length).toBe(1)
  })

  it('does NOT append a truncation notice when under the cap', async () => {
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '1'
    const result = await getInsightsExport(prisma, ownerCtx(merchantId), lastMonthFilters)
    if ('available' in result) throw new Error('expected open result')
    const csv = insightsRowsToCsv(result.rows, result.truncated)
    expect(csv.toLowerCase()).not.toContain('truncated')
  })
})
