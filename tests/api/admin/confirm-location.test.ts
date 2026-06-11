import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { confirmBranchLocation } from '../../../src/api/admin/branches/service'

// Phase 2 Slice 1 M4 — admin location pin-drop (real DB).
//
// Validates against the dev DB (Neon test branch) so it catches real
// schema/serialization drift the unit mocks would miss. AuditLog.actorId is a
// bare indexed nullable string (no FK), so a synthetic admin id is fine.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const ADMIN_ID = 'm4-confirm-loc-admin'
const MERCHANT_ID = 'm4-confirm-loc-merchant'
const BRANCH_ID = 'm4-confirm-loc-branch'

beforeAll(async () => {
  await prisma.merchant.upsert({
    where: { id: MERCHANT_ID },
    create: {
      id: MERCHANT_ID,
      businessName: 'M4 Confirm-Location Co',
      status: 'PENDING_APPROVAL',
      isTestData: true,
    },
    update: { status: 'PENDING_APPROVAL' },
  })
  // Branch starts at POSTCODE_CENTROID with approximate coords — the exact
  // state the admin pin-drop fallback exists to fix.
  await prisma.branch.upsert({
    where: { id: BRANCH_ID },
    create: {
      id: BRANCH_ID,
      merchantId: MERCHANT_ID,
      name: 'M4 Confirm-Location Branch',
      isMainBranch: true,
      addressLine1: '1 Test St',
      city: 'Huddersfield',
      postcode: 'HD1 2PY',
      country: 'GB',
      latitude: 53.6400,
      longitude: -1.7800,
      isActive: true,
      locationConfidence: 'POSTCODE_CENTROID',
    },
    update: {
      latitude: 53.6400,
      longitude: -1.7800,
      locationConfidence: 'POSTCODE_CENTROID',
      isActive: true,
    },
  })
}, 60_000)

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: BRANCH_ID } })
  await prisma.branch.deleteMany({ where: { id: BRANCH_ID } })
  await prisma.merchant.deleteMany({ where: { id: MERCHANT_ID } })
  await prisma.$disconnect()
})

describe('M4 — confirmBranchLocation (admin pin-drop)', () => {
  it('flips POSTCODE_CENTROID → MANUALLY_CONFIRMED and sets the new coordinates', async () => {
    const result = await confirmBranchLocation(
      prisma,
      ADMIN_ID,
      BRANCH_ID,
      { latitude: 53.6463, longitude: -1.7809 },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    )
    expect(result).toMatchObject({
      branchId: BRANCH_ID,
      latitude: 53.6463,
      longitude: -1.7809,
      locationConfidence: 'MANUALLY_CONFIRMED',
    })

    const row = await prisma.branch.findUnique({
      where: { id: BRANCH_ID },
      select: { latitude: true, longitude: true, locationConfidence: true },
    })
    expect(Number(row!.latitude)).toBe(53.6463)
    expect(Number(row!.longitude)).toBe(-1.7809)
    expect(row!.locationConfidence).toBe('MANUALLY_CONFIRMED')
  })

  it('writes a BRANCH_LOCATION_CONFIRMED audit row with actor + before/after', async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: BRANCH_ID, event: 'BRANCH_LOCATION_CONFIRMED' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit).toBeTruthy()
    expect(audit!.entityType).toBe('branch')
    expect(audit!.actorId).toBe(ADMIN_ID)
    expect(audit!.actorType).toBe('ADMIN')
    // before = the original POSTCODE_CENTROID state; after = the pin-drop.
    expect(audit!.before).toMatchObject({ locationConfidence: 'POSTCODE_CENTROID' })
    expect(audit!.after).toMatchObject({
      locationConfidence: 'MANUALLY_CONFIRMED',
      latitude: 53.6463,
      longitude: -1.7809,
    })
  })

  it('is idempotent — re-confirming overwrites coordinates and stays MANUALLY_CONFIRMED', async () => {
    const result = await confirmBranchLocation(
      prisma,
      ADMIN_ID,
      BRANCH_ID,
      { latitude: 53.6500, longitude: -1.7830 },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    )
    expect(result.locationConfidence).toBe('MANUALLY_CONFIRMED')
    expect(result.latitude).toBe(53.6500)
    expect(result.longitude).toBe(-1.7830)

    // The second confirm records its own audit row (before now MANUALLY_CONFIRMED).
    const count = await prisma.auditLog.count({
      where: { entityId: BRANCH_ID, event: 'BRANCH_LOCATION_CONFIRMED' },
    })
    expect(count).toBe(2)
  })

  it('throws BRANCH_NOT_FOUND for an unknown branch id', async () => {
    await expect(
      confirmBranchLocation(
        prisma,
        ADMIN_ID,
        'no-such-branch-id',
        { latitude: 53.6, longitude: -1.78 },
        { ipAddress: '127.0.0.1', userAgent: 'vitest' },
      ),
    ).rejects.toThrow('BRANCH_NOT_FOUND')
  })
})
