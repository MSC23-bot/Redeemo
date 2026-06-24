// Branches PR-5 (D5) — real-DB coverage for the admin branch-lifecycle REVIEW
// reader (getBranchLifecycleReviewContext). Mirrors the branchLifecycleApplier
// integration patterns/factories + the voucher/edit review-context tests.
//
// Pins: returns the target branch + its merchant + closeReason for a
// BRANCH_CREATE and a BRANCH_CLOSE approval; `kind` derives correctly from the
// type; redemptionPin is NEVER present anywhere in the payload (load-bearing
// secret exclusion); a non-branch-lifecycle approval type -> APPROVAL_NOT_ACTIONABLE;
// an unknown approval id -> APPROVAL_NOT_FOUND; a missing target branch is handled
// (BRANCH_NOT_FOUND).

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

import { getBranchLifecycleReviewContext } from '../../../src/api/admin/approvals/branchLifecycleApplier'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = 'pr5-lifecycle-review'
let seq = 0

/** A merchant (no membership needed — the review reader resolves via the branch relation only). */
async function makeMerchant(businessName: string) {
  const m = await prisma.merchant.create({
    data: { businessName: `${PREFIX} ${businessName}`, status: 'ACTIVE', isTestData: true },
  })
  return m.id
}

/** A branch with a real (encrypted-looking) redemptionPin so we can assert it is NEVER returned. */
async function makeBranch(
  merchantId: string,
  name: string,
  opts: {
    lifecycleStatus?: 'PENDING_CREATE' | 'LIVE' | 'PENDING_CLOSE' | 'CLOSED'
    isMainBranch?: boolean
    isActive?: boolean
    locationConfidence?: 'POSTCODE_CENTROID' | 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'NEEDS_REVIEW'
    closeReason?: string | null
  } = {},
) {
  const b = await prisma.branch.create({
    data: {
      merchantId,
      name: `${PREFIX} ${name}`,
      isMainBranch: opts.isMainBranch ?? false,
      addressLine1: '1 Old Street',
      addressLine2: 'Unit 4',
      city: 'London',
      postcode: 'EC1A 1BB',
      phone: '+447700900000',
      email: `${PREFIX}-branch-${seq}@example.com`,
      websiteUrl: 'https://example.test/branch',
      latitude: '51.51750000',
      longitude: '-0.10220000',
      isActive: opts.isActive ?? true,
      isTestData: true,
      lifecycleStatus: opts.lifecycleStatus ?? 'LIVE',
      locationConfidence: opts.locationConfidence ?? 'POSTCODE_CENTROID',
      localityName: 'City of London',
      redemptionPin: 'ENCRYPTED-SECRET-PIN-DO-NOT-LEAK',
      ...(opts.closeReason !== undefined ? { closeReason: opts.closeReason } : {}),
    },
  })
  return b.id
}

async function makeApproval(type: 'BRANCH_CREATE' | 'BRANCH_CLOSE', branchId: string) {
  const a = await prisma.adminApproval.create({
    data: { type, status: 'PENDING', referenceId: branchId, referenceType: 'branch', comment: `${PREFIX} ${type}` },
  })
  return a.id
}

beforeAll(() => {
  seq = 0
})

afterAll(async () => {
  // BULK prefix-scoped cleanup (self-healing). FK order: approvals + branch
  // children before branches + merchants.
  const merchantIds = (
    await prisma.merchant.findMany({ where: { businessName: { startsWith: PREFIX } }, select: { id: true } })
  ).map((m) => m.id)
  if (merchantIds.length) {
    const branchIds = (
      await prisma.branch.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })
    ).map((b) => b.id)
    if (branchIds.length) {
      await prisma.adminApproval.deleteMany({ where: { referenceId: { in: branchIds }, referenceType: 'branch' } })
    }
    await prisma.branch.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } })
  }
  await prisma.$disconnect()
}, 60000)

describe('PR-5 review reader: getBranchLifecycleReviewContext (real DB)', () => {
  it('BRANCH_CREATE: returns the branch + merchant + kind="create"; no redemptionPin; lat/lng coerced to Number', async () => {
    const merchantId = await makeMerchant('Create Review Co')
    const branchId = await makeBranch(merchantId, 'Pending Create', {
      lifecycleStatus: 'PENDING_CREATE', isActive: false, locationConfidence: 'POSTCODE_CENTROID',
    })
    const approvalId = await makeApproval('BRANCH_CREATE', branchId)

    const ctx = await getBranchLifecycleReviewContext(prisma, approvalId)

    expect(ctx.kind).toBe('create')
    expect(ctx.merchant).toEqual({ id: merchantId, businessName: `${PREFIX} Create Review Co` })
    expect(ctx.branch.id).toBe(branchId)
    expect(ctx.branch.name).toBe(`${PREFIX} Pending Create`)
    expect(ctx.branch.addressLine1).toBe('1 Old Street')
    expect(ctx.branch.addressLine2).toBe('Unit 4')
    expect(ctx.branch.city).toBe('London')
    expect(ctx.branch.postcode).toBe('EC1A 1BB')
    expect(ctx.branch.localityName).toBe('City of London')
    expect(ctx.branch.phone).toBe('+447700900000')
    expect(ctx.branch.email).toContain('@example.com')
    expect(ctx.branch.websiteUrl).toBe('https://example.test/branch')
    expect(ctx.branch.isMainBranch).toBe(false)
    expect(ctx.branch.isActive).toBe(false)
    expect(ctx.branch.lifecycleStatus).toBe('PENDING_CREATE')
    expect(ctx.branch.locationConfidence).toBe('POSTCODE_CENTROID')
    // lat/lng coerced from Prisma Decimal -> Number.
    expect(typeof ctx.branch.latitude).toBe('number')
    expect(ctx.branch.latitude).toBeCloseTo(51.5175, 4)
    expect(typeof ctx.branch.longitude).toBe('number')
    expect(ctx.branch.longitude).toBeCloseTo(-0.1022, 4)
    expect(ctx.closeReason).toBeNull()

    // SECRET EXCLUSION: redemptionPin (or its value) must NOT appear anywhere.
    const serialised = JSON.stringify(ctx)
    expect(serialised).not.toContain('redemptionPin')
    expect(serialised).not.toContain('ENCRYPTED-SECRET-PIN-DO-NOT-LEAK')
    expect((ctx.branch as Record<string, unknown>).redemptionPin).toBeUndefined()
  })

  it('BRANCH_CLOSE: returns the branch + merchant + kind="close" + closeReason; no redemptionPin', async () => {
    const merchantId = await makeMerchant('Close Review Co')
    const branchId = await makeBranch(merchantId, 'Pending Close', {
      lifecycleStatus: 'PENDING_CLOSE', isActive: true, closeReason: 'Lease ended',
    })
    const approvalId = await makeApproval('BRANCH_CLOSE', branchId)

    const ctx = await getBranchLifecycleReviewContext(prisma, approvalId)

    expect(ctx.kind).toBe('close')
    expect(ctx.merchant.id).toBe(merchantId)
    expect(ctx.branch.id).toBe(branchId)
    expect(ctx.branch.lifecycleStatus).toBe('PENDING_CLOSE')
    expect(ctx.branch.isActive).toBe(true)
    expect(ctx.closeReason).toBe('Lease ended')

    const serialised = JSON.stringify(ctx)
    expect(serialised).not.toContain('redemptionPin')
    expect(serialised).not.toContain('ENCRYPTED-SECRET-PIN-DO-NOT-LEAK')
  })

  it('a non-branch-lifecycle approval type -> APPROVAL_NOT_ACTIONABLE', async () => {
    const merchantId = await makeMerchant('Wrong Type Co')
    const approval = await prisma.adminApproval.create({
      data: { type: 'MERCHANT_ONBOARDING', status: 'PENDING', referenceId: merchantId, referenceType: 'merchant' },
    })
    await expect(getBranchLifecycleReviewContext(prisma, approval.id)).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')
  })

  it('an unknown approval id -> APPROVAL_NOT_FOUND', async () => {
    await expect(
      getBranchLifecycleReviewContext(prisma, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow('APPROVAL_NOT_FOUND')
  })

  it('a branch-lifecycle approval whose target branch is missing -> BRANCH_NOT_FOUND', async () => {
    // referenceId points at a non-existent branch id.
    const approval = await prisma.adminApproval.create({
      data: {
        type: 'BRANCH_CREATE',
        status: 'PENDING',
        referenceId: '11111111-1111-1111-1111-111111111111',
        referenceType: 'branch',
        comment: `${PREFIX} orphan`,
      },
    })
    await expect(getBranchLifecycleReviewContext(prisma, approval.id)).rejects.toThrow('BRANCH_NOT_FOUND')
    // Cleanup this stray approval (not prefix-merchant-scoped).
    await prisma.adminApproval.delete({ where: { id: approval.id } })
  })
})
