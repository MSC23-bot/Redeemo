import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { listMerchants } from '../../../src/api/admin/merchants/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// Unique fixture prefix so the assertions never collide with seed/dev data that
// may already exist in the shared Neon dev DB.
const TAG = `WP2LIST-${Date.now()}`
const createdMerchantIds: string[] = []

async function makeMerchant(data: {
  businessName: string
  tradingName?: string
  status?: 'REGISTERED' | 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'DELETED'
}) {
  const m = await prisma.merchant.create({
    data: {
      businessName: data.businessName,
      tradingName: data.tradingName,
      status: data.status ?? 'REGISTERED',
    },
    select: { id: true },
  })
  createdMerchantIds.push(m.id)
  return m.id
}

let activeId: string
let suspendedId: string
let pendingId: string
let tradingMatchId: string

beforeAll(async () => {
  // Two distinctly-named businesses + one whose TRADING name (not business name)
  // carries the search token, to prove the OR matches both columns.
  activeId = await makeMerchant({ businessName: `${TAG} Alpha Diner`, status: 'ACTIVE' })
  suspendedId = await makeMerchant({ businessName: `${TAG} Beta Cafe`, status: 'SUSPENDED' })
  pendingId = await makeMerchant({ businessName: `${TAG} Gamma Bistro`, status: 'PENDING_APPROVAL' })
  tradingMatchId = await makeMerchant({
    businessName: `${TAG} Zeta Holdings`,
    tradingName: `${TAG} Alpha Trading`,
    status: 'ACTIVE',
  })
})

afterAll(async () => {
  await prisma.merchant.deleteMany({ where: { id: { in: createdMerchantIds } } })
  await prisma.$disconnect()
})

describe('WP2 — listMerchants (service, real DB)', () => {
  it('returns a paginated envelope { page, pageSize, total, merchants } for the fixture set', async () => {
    const res = await listMerchants(prisma, { q: TAG, pageSize: 100 })
    expect(res.page).toBe(1)
    expect(res.pageSize).toBe(100)
    expect(res.total).toBe(4)
    expect(res.merchants.length).toBe(4)
    // Newest-first ordering: the last fixture created sorts before the first.
    const ids = res.merchants.map((m) => m.id)
    expect(ids.indexOf(tradingMatchId)).toBeLessThan(ids.indexOf(activeId))
  })

  it('filters by status', async () => {
    const res = await listMerchants(prisma, { q: TAG, status: 'SUSPENDED', pageSize: 100 })
    expect(res.total).toBe(1)
    expect(res.merchants[0].id).toBe(suspendedId)
    expect(res.merchants[0].status).toBe('SUSPENDED')
  })

  it('search matches businessName case-insensitively', async () => {
    const res = await listMerchants(prisma, { q: `${TAG} beta`.toLowerCase(), pageSize: 100 })
    expect(res.total).toBe(1)
    expect(res.merchants[0].id).toBe(suspendedId)
  })

  it('search matches the tradingName column too (OR across both name fields)', async () => {
    // "Alpha Trading" exists only as a tradingName (its businessName is "Zeta
    // Holdings"), and "Alpha Diner" exists as a businessName, so the token
    // "Alpha" must surface BOTH rows.
    const res = await listMerchants(prisma, { q: `${TAG} Alpha`, pageSize: 100 })
    const ids = res.merchants.map((m) => m.id).sort()
    expect(ids).toEqual([activeId, tradingMatchId].sort())
  })

  it('paginates (page 2 with pageSize 2 returns the remaining rows)', async () => {
    const p1 = await listMerchants(prisma, { q: TAG, page: 1, pageSize: 2 })
    const p2 = await listMerchants(prisma, { q: TAG, page: 2, pageSize: 2 })
    expect(p1.total).toBe(4)
    expect(p2.total).toBe(4)
    expect(p1.merchants.length).toBe(2)
    expect(p2.merchants.length).toBe(2)
    const p1ids = new Set(p1.merchants.map((m) => m.id))
    // No overlap between pages.
    expect(p2.merchants.every((m) => !p1ids.has(m.id))).toBe(true)
  })

  it('exposes the flattened category + branchCount, and REDACTS all secrets', async () => {
    const res = await listMerchants(prisma, { q: TAG, status: 'ACTIVE', pageSize: 100 })
    const row = res.merchants.find((m) => m.id === activeId)!
    // Expected fields present.
    expect(row).toMatchObject({
      id: activeId,
      businessName: `${TAG} Alpha Diner`,
      status: 'ACTIVE',
    })
    expect(row).toHaveProperty('category') // null for fixtures without a category
    expect(row).toHaveProperty('branchCount', 0)
    expect(row).toHaveProperty('verificationStatus')
    expect(row).toHaveProperty('onboardingStep')
    expect(row).toHaveProperty('logoUrl')
    expect(row).toHaveProperty('createdAt')
    // Redaction: the relation object + any secret must NEVER appear on the wire.
    expect(row).not.toHaveProperty('primaryCategory')
    expect(row).not.toHaveProperty('_count')
    const serialized = JSON.stringify(res.merchants).toLowerCase()
    expect(serialized).not.toContain('redemptionpin')
    expect(serialized).not.toContain('passwordhash')
  })
})
