// Real-DB tests for the pending-hours transactional-claim promotion (Neon
// CU-burn PR-B, Codex correction 2). Runs against the strict-loopback
// integration database (tests/integration.setup.ts fail-closes on any
// non-loopback target). Proves what unit fakes cannot:
//   - CONCURRENT promotion ownership: the floor sweep and the delayed nudge
//     racing the SAME pending row → exactly one wins, exactly one final weekly
//     set, no duplicate live rows, row ends PROMOTED, replay is a clean no-op;
//   - ROLLBACK: a failure AFTER the transactional claim rolls the claim back —
//     the row is never left falsely PROMOTED and stays eligible for replay.

import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  promoteOnePendingHours,
  type PromoteTxBounds,
} from '../../../../src/api/queues/processors/promotePendingHours'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const NOW = new Date('2026-06-24T12:00:00.000Z')
const DUE = new Date(NOW.getTime() - 60_000)
const PREFIX = `promote-it-${Date.now()}`
const BOUNDS: PromoteTxBounds = { statementTimeoutMs: 4000, txTimeoutMs: 8000 }

const goodWeek = [
  { dayOfWeek: 0, isClosed: true, openTime: null, closeTime: null },
  { dayOfWeek: 1, openTime: '10:00', closeTime: '20:00', isClosed: false },
  { dayOfWeek: 2, openTime: '10:00', closeTime: '20:00', isClosed: false },
  { dayOfWeek: 3, openTime: '10:00', closeTime: '20:00', isClosed: false },
  { dayOfWeek: 4, openTime: '10:00', closeTime: '20:00', isClosed: false },
  { dayOfWeek: 5, openTime: '10:00', closeTime: '20:00', isClosed: false },
  { dayOfWeek: 6, isClosed: true, openTime: null, closeTime: null },
]

const createdMerchantIds: string[] = []

async function seedPending(opts: { proposedHours?: unknown } = {}): Promise<{ branchId: string; pendingId: string }> {
  const merchant = await prisma.merchant.create({
    data: { businessName: `${PREFIX} merchant ${createdMerchantIds.length}`, status: 'ACTIVE' },
    select: { id: true },
  })
  createdMerchantIds.push(merchant.id)
  const branch = await prisma.branch.create({
    data: {
      merchantId: merchant.id,
      name: `${PREFIX} branch`,
      addressLine1: '1 Test Street',
      city: 'London',
      postcode: 'EC1A 1AA',
      isActive: true,
    },
    select: { id: true },
  })
  const pending = await prisma.branchOpeningHoursPending.create({
    data: {
      branchId: branch.id,
      merchantId: merchant.id,
      proposedHours: (opts.proposedHours ?? goodWeek) as never,
      effectiveAt: DUE,
      status: 'PENDING',
      createdBy: `${PREFIX}-admin`,
    },
    select: { id: true },
  })
  return { branchId: branch.id, pendingId: pending.id }
}

afterAll(async () => {
  // Branch → Merchant has NO cascade (default RESTRICT), so delete branches
  // FIRST — Branch deletion cascades the pending rows + live hours — then the
  // merchants.
  await prisma.branch.deleteMany({ where: { merchantId: { in: createdMerchantIds } } })
  await prisma.merchant.deleteMany({ where: { id: { in: createdMerchantIds } } })
  await prisma.$disconnect()
})

describe('promoteOnePendingHours — transactional claim (real DB)', () => {
  it('CONCURRENT floor + nudge on the SAME row: exactly one winner, one weekly set, no duplicate live rows, PROMOTED, replay no-op', async () => {
    const { branchId, pendingId } = await seedPending()

    // The two real production callers, racing in genuinely separate transactions
    // on separate pooled connections: the FLOOR path (bounded) + the NUDGE path.
    const [floor, nudge] = await Promise.all([
      promoteOnePendingHours(prisma, pendingId, NOW, BOUNDS),
      promoteOnePendingHours(prisma, pendingId, NOW),
    ])

    // Exactly ONE call wins the claim.
    expect([floor, nudge].filter(Boolean)).toHaveLength(1)

    // Exactly one final weekly set — NO duplicated live rows from interleaved
    // delete/create pairs (the pre-claim defect this correction removes).
    const live = await prisma.branchOpeningHours.findMany({ where: { branchId } })
    expect(live).toHaveLength(goodWeek.length)
    expect(new Set(live.map((l) => `${l.dayOfWeek}:${l.openTime ?? ''}`)).size).toBe(goodWeek.length)

    // The pending row ends PROMOTED with the claim's timestamp.
    const row = await prisma.branchOpeningHoursPending.findUnique({ where: { id: pendingId } })
    expect(row?.status).toBe('PROMOTED')
    expect(row?.promotedAt).toEqual(NOW)

    // REPLAY (either path) is a clean no-op: no new writes, live set unchanged.
    expect(await promoteOnePendingHours(prisma, pendingId, NOW, BOUNDS)).toBe(false)
    expect(await promoteOnePendingHours(prisma, pendingId, NOW)).toBe(false)
    expect(await prisma.branchOpeningHours.count({ where: { branchId } })).toBe(goodWeek.length)
  }, 30_000)

  it('ROLLBACK: a failure AFTER the claim rolls the claim back — the row is never left falsely PROMOTED', async () => {
    // proposedHours carrying a NOT-NULL-violating entry: the claim succeeds,
    // then the live createMany fails INSIDE the same transaction.
    const poisoned = [{ dayOfWeek: null, openTime: '10:00', closeTime: '20:00', isClosed: false }]
    const { branchId, pendingId } = await seedPending({ proposedHours: poisoned })

    await expect(promoteOnePendingHours(prisma, pendingId, NOW, BOUNDS)).rejects.toThrow()

    // The transactional claim rolled back with the failed live write: the row is
    // STILL PENDING (never falsely PROMOTED) and remains eligible for replay.
    const row = await prisma.branchOpeningHoursPending.findUnique({ where: { id: pendingId } })
    expect(row?.status).toBe('PENDING')
    expect(row?.promotedAt).toBeNull()
    expect(await prisma.branchOpeningHours.count({ where: { branchId } })).toBe(0) // live untouched
  }, 30_000)
})
