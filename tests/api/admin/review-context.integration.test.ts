import 'dotenv/config'

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getReviewContext } from '../../../src/api/admin/approvals/service'
import * as storage from '../../../src/api/shared/storage'

// M4 integration tests (real DB, serial). The `.integration.test.ts` suffix
// is required for the CI project split (vitest.config.ts integration project).

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// Track IDs for afterAll cleanup.
let merchantId = ''
let approvalId = ''
let mainBranchId = ''
let secondBranchId = ''
let deletedBranchId = ''
let rmv1Id = ''
let rmv2Id = ''
let docId = ''
let adminUserId = ''
let merchantAdminId = ''
let nonOnboardingApprovalId = ''
const DOC_FILE_URL = 'document/merchant-m4rc-test/abc1234567890def.pdf'

beforeAll(async () => {
  // Seed AdminUser (for AuditLog actor resolution)
  const admin = await prisma.adminUser.create({
    data: {
      email: `m4-review-admin-${Date.now()}@example.com`,
      passwordHash: 'hash',
      firstName: 'Ada',
      lastName: 'Admin',
      role: 'OPERATIONS',
    },
  })
  adminUserId = admin.id

  // Seed Merchant with a primary category
  const category = await prisma.category.findFirst({ where: { parentId: null, isActive: true } })

  const merchant = await prisma.merchant.create({
    data: {
      businessName: 'M4 Review Context Co',
      tradingName: 'Review Co',
      description: 'A great merchant for review context tests',
      websiteUrl: 'https://reviewco.example.com',
      companyNumber: 'RC123456',
      vatNumber: null,
      status: 'PENDING_APPROVAL',
      verificationStatus: 'PENDING',
      contractStatus: 'SIGNED',
      onboardingStep: 'SUBMITTED',
      isTestData: true,
      primaryCategoryId: category?.id ?? null,
    },
  })
  merchantId = merchant.id

  // Seed owner (MerchantAdmin + MerchantMembership)
  const ownerAdmin = await prisma.merchantAdmin.create({
    data: {
      email: `m4-owner-${Date.now()}@example.com`,
      firstName: 'Owen',
      lastName: 'Owner',
      phone: '+441234567890',
    },
  })
  merchantAdminId = ownerAdmin.id

  await prisma.merchantMembership.create({
    data: { merchantId, merchantAdminId: ownerAdmin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })

  // Seed main branch (with a redemptionPin set to verify it's NEVER returned)
  const mainBranch = await prisma.branch.create({
    data: {
      merchantId,
      name: 'Review Co Main',
      isMainBranch: true,
      addressLine1: '1 Review Street',
      city: 'London',
      postcode: 'EC1A 1BB',
      isActive: true,
      locationConfidence: 'ADDRESS_GEOCODED',
      localityName: 'City of London',
      redemptionPin: 'ENCRYPTED_PIN_VALUE_SHOULD_NEVER_APPEAR_IN_OUTPUT',
    },
  })
  mainBranchId = mainBranch.id

  // Seed second branch (also with a redemptionPin)
  const secondBranch = await prisma.branch.create({
    data: {
      merchantId,
      name: 'Review Co East',
      isMainBranch: false,
      addressLine1: '2 Review Road',
      city: 'London',
      postcode: 'E1 1AA',
      isActive: true,
      locationConfidence: 'POSTCODE_CENTROID',
      redemptionPin: 'ANOTHER_PIN_MUST_NOT_APPEAR',
    },
  })
  secondBranchId = secondBranch.id

  // Seed a soft-deleted branch (deletedAt set) — MUST be excluded from the
  // review-context branches (§BRANCHDEL: the deletedAt: null filter).
  const deletedBranch = await prisma.branch.create({
    data: {
      merchantId,
      name: 'Review Co Closed',
      isMainBranch: false,
      addressLine1: '3 Review Lane',
      city: 'London',
      postcode: 'N1 1AA',
      isActive: false,
      locationConfidence: 'POSTCODE_CENTROID',
      deletedAt: new Date(),
      redemptionPin: 'DELETED_BRANCH_PIN_MUST_NOT_APPEAR',
    },
  })
  deletedBranchId = deletedBranch.id

  // Seed 2 RMV vouchers
  const rmv1 = await prisma.voucher.create({
    data: {
      merchantId,
      code: `RMV-001-M4RC-${Date.now()}`,
      type: 'BOGO',
      title: 'Buy One Get One Free',
      estimatedSaving: '10.00',
      isRmv: true,
      status: 'PENDING_APPROVAL',
      approvalStatus: 'PENDING',
      isTestData: true,
    },
  })
  rmv1Id = rmv1.id

  const rmv2 = await prisma.voucher.create({
    data: {
      merchantId,
      code: `RMV-002-M4RC-${Date.now()}`,
      type: 'DISCOUNT_PERCENT',
      title: '20% Off',
      estimatedSaving: '5.50',
      isRmv: true,
      status: 'PENDING_APPROVAL',
      approvalStatus: 'PENDING',
      isTestData: true,
    },
  })
  rmv2Id = rmv2.id

  // Seed a MerchantDocument (fileUrl = the key that must NEVER appear in output)
  const doc = await prisma.merchantDocument.create({
    data: {
      merchantId,
      documentType: 'BUSINESS_VERIFICATION_1',
      fileUrl: DOC_FILE_URL,
    },
  })
  docId = doc.id

  // Seed AuditLog rows
  await prisma.auditLog.create({
    data: {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_DRAFT_CREATED',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      actorId: adminUserId,
      actorType: 'ADMIN',
    },
  })
  await prisma.auditLog.create({
    data: {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_APPROVAL_CLAIMED',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      actorId: adminUserId,
      actorType: 'ADMIN',
    },
  })
  // Seed a non-ADMIN actor row (SYSTEM): the code only resolves names for
  // actorType === 'ADMIN', so this row MUST surface with actor: null.
  await prisma.auditLog.create({
    data: {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_GO_LIVE',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      actorId: null,
      actorType: 'SYSTEM',
    },
  })

  // Seed the primary onboarding approval
  const approval = await prisma.adminApproval.create({
    data: {
      type: 'MERCHANT_ONBOARDING',
      status: 'PENDING',
      referenceId: merchantId,
      referenceType: 'merchant',
      claimedById: adminUserId,
      claimedAt: new Date(),
    },
  })
  approvalId = approval.id

  // Seed a non-MERCHANT_ONBOARDING approval for the graceful-degrade test
  const nonOnboarding = await prisma.adminApproval.create({
    data: {
      type: 'VOUCHER',
      status: 'PENDING',
      referenceId: rmv1Id,
      referenceType: 'voucher',
    },
  })
  nonOnboardingApprovalId = nonOnboarding.id
})

afterAll(async () => {
  // Cleanup in FK-safe order
  await prisma.adminApproval.deleteMany({ where: { id: { in: [approvalId, nonOnboardingApprovalId] } } })
  await prisma.merchantDocument.deleteMany({ where: { id: docId } })
  await prisma.auditLog.deleteMany({ where: { entityId: merchantId } })
  await prisma.voucher.deleteMany({ where: { id: { in: [rmv1Id, rmv2Id] } } })
  await prisma.branch.deleteMany({ where: { id: { in: [mainBranchId, secondBranchId, deletedBranchId] } } })
  const adminIds = (
    await prisma.merchantMembership.findMany({ where: { merchantId }, select: { merchantAdminId: true } })
  ).map((r: { merchantAdminId: string }) => r.merchantAdminId)
  await prisma.merchantMembership.deleteMany({ where: { merchantId } })
  await prisma.merchantAdmin.deleteMany({ where: { id: { in: adminIds } } })
  await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {})
  await prisma.adminUser.delete({ where: { id: adminUserId } }).catch(() => {})
  await prisma.$disconnect()
})

// ─── Assertion 1: merchant profile + category + owner ──────────────────────

describe('M4 review context — merchant profile + owner (real DB)', () => {
  it('returns merchant profile with category name and owner contact', async () => {
    const result = await getReviewContext(prisma, approvalId)

    // Approval block
    expect(result.approval.id).toBe(approvalId)
    expect(result.approval.type).toBe('MERCHANT_ONBOARDING')
    expect(result.approval.claimedBy).toBeTruthy()
    expect(result.approval.claimedBy!.id).toBe(adminUserId)
    expect(typeof result.approval.claimedBy!.name).toBe('string')
    expect(result.approval.claimedBy!.name).toContain('Ada')

    // Merchant profile
    expect(result.merchant).not.toBeNull()
    expect(result.merchant!.businessName).toBe('M4 Review Context Co')
    expect(result.merchant!.tradingName).toBe('Review Co')
    expect(result.merchant!.companyNumber).toBe('RC123456')
    expect(result.merchant!.vatNumber).toBeNull()
    // Category name (or null if no primary category was found — depends on seed state)
    expect(result.merchant!.category === null || typeof result.merchant!.category === 'string').toBe(true)

    // Owner
    expect(result.owner).not.toBeNull()
    expect(result.owner!.name).toBe('Owen Owner')
    expect(result.owner!.email).toMatch(/m4-owner-/)
    // phone is optional — may or may not be present
    expect(['string', 'undefined'].includes(typeof result.owner!.phone)).toBe(true)

    // Checklist present (contract signed; no branch counted via computeOnboardingChecklist — but
    // the 2 branches ARE seeded, so branch_created should be true; rmv_configured: 2 rmvs)
    expect(result.checklist).not.toBeNull()
    expect(result.checklist!.contract_signed).toBe(true)
  })
})

// ─── Assertion 2: branches — redemptionPin NEVER present ───────────────────

describe('M4 review context — branch safety (no redemptionPin)', () => {
  it('returns 2 branches and redemptionPin is NEVER present on any returned branch', async () => {
    const result = await getReviewContext(prisma, approvalId)

    // Only the 2 non-deleted branches are returned (a 3rd soft-deleted branch is seeded).
    expect(Array.isArray(result.branches)).toBe(true)
    expect(result.branches.length).toBe(2)

    for (const branch of result.branches) {
      expect(branch).not.toHaveProperty('redemptionPin')
      expect(branch).toHaveProperty('id')
      expect(branch).toHaveProperty('name')
      expect(branch).toHaveProperty('isMainBranch')
      expect(branch).toHaveProperty('locationConfidence')
    }

    const mainBranch = result.branches.find((b: any) => b.isMainBranch)
    expect(mainBranch).toBeTruthy()
    expect((mainBranch as any).name).toBe('Review Co Main')

    // §BRANCHDEL: the soft-deleted (deletedAt) branch MUST be excluded.
    const returnedIds = result.branches.map((b: any) => b.id)
    expect(returnedIds).not.toContain(deletedBranchId)
  })
})

// ─── Assertion 3: vouchers with estimatedSaving as number ──────────────────

describe('M4 review context — vouchers with coerced estimatedSaving', () => {
  it('returns vouchers with estimatedSaving as a number (not string), RMV flagged', async () => {
    const result = await getReviewContext(prisma, approvalId)

    expect(Array.isArray(result.vouchers)).toBe(true)
    expect(result.vouchers.length).toBe(2)

    for (const v of result.vouchers) {
      expect(typeof (v as any).estimatedSaving).toBe('number')
      expect((v as any).isRmv).toBe(true)
    }

    const bogo = result.vouchers.find((v: any) => v.type === 'BOGO')
    expect(bogo).toBeTruthy()
    expect((bogo as any).estimatedSaving).toBe(10.0)

    const discount = result.vouchers.find((v: any) => v.type === 'DISCOUNT_PERCENT')
    expect(discount).toBeTruthy()
    expect((discount as any).estimatedSaving).toBe(5.5)
  })
})

// ─── Assertion 4: documents — storage disabled → available:false, no fileUrl ─

describe('M4 review context — documents (storage disabled path)', () => {
  it('when STORAGE_ENABLED is unset, documents have available:false, url:null, and fileUrl never appears in the JSON', async () => {
    // Ensure storage is not enabled in test env
    delete process.env.STORAGE_ENABLED

    const result = await getReviewContext(prisma, approvalId)

    expect(Array.isArray(result.documents)).toBe(true)
    expect(result.documents.length).toBe(1)

    const doc = result.documents[0] as any
    expect(doc.id).toBe(docId)
    expect(doc.documentType).toBe('BUSINESS_VERIFICATION_1')
    expect(doc.available).toBe(false)
    expect(doc.url).toBeNull()
    // SAFETY: raw R2 storage key must NEVER appear as a standalone `fileUrl` field.
    expect(doc).not.toHaveProperty('fileUrl')
    // Belt-and-braces: "fileUrl" as a JSON key must not appear anywhere in the serialised output.
    const serialised = JSON.stringify(result)
    expect(serialised).not.toContain('"fileUrl"')
  })
})

// ─── Assertion 5: documents — presign mock path ──────────────────────────

describe('M4 review context — documents (presign mock path)', () => {
  it('when presignGet is mocked to succeed, documents have available:true, correct url, no fileUrl', async () => {
    const SIGNED_URL = 'https://cdn.r2.example.com/document/merchant-m4rc-test/abc1234567890def.pdf?sig=xyz'
    const presignSpy = vi.spyOn(storage, 'presignGet').mockResolvedValueOnce({
      url: SIGNED_URL,
      expiresIn: 300,
    })

    const result = await getReviewContext(prisma, approvalId)

    expect(presignSpy).toHaveBeenCalledWith(DOC_FILE_URL)
    presignSpy.mockRestore()

    expect(result.documents.length).toBe(1)
    const doc = result.documents[0] as any
    expect(doc.available).toBe(true)
    expect(doc.url).toBe(SIGNED_URL)
    // SAFETY: raw R2 storage key must NEVER appear as a standalone `fileUrl` field.
    // The signed URL may embed the same path components — that is expected and fine.
    expect(doc).not.toHaveProperty('fileUrl')
    // Belt-and-braces: "fileUrl" as a JSON key must not appear anywhere in the output.
    const serialised = JSON.stringify(result)
    expect(serialised).not.toContain('"fileUrl"')
  })
})

// ─── Assertion 6: thinAreas ──────────────────────────────────────────────

describe('M4 review context — thinAreas flags', () => {
  it('returns correct thinAreas: documentsUploaded true (1 doc), companyTypeCaptured false, companyNumberProvided true, vatNumberProvided false', async () => {
    const result = await getReviewContext(prisma, approvalId)

    expect(result.thinAreas).not.toBeNull()
    expect(result.thinAreas!.documentsUploaded).toBe(true)
    expect(result.thinAreas!.companyTypeCaptured).toBe(false)
    expect(result.thinAreas!.registeredOfficeCaptured).toBe(false)
    expect(result.thinAreas!.sectorEvidenceCaptured).toBe(false)
    expect(result.thinAreas!.companyNumberProvided).toBe(true)  // merchant.companyNumber = 'RC123456'
    expect(result.thinAreas!.vatNumberProvided).toBe(false)     // merchant.vatNumber = null
    expect(result.thinAreas!.documentsGated).toBe(false)
  })
})

// ─── Assertion 8: non-MERCHANT_ONBOARDING graceful degrade ──────────────────

describe('M4 review context — non-MERCHANT_ONBOARDING graceful degrade', () => {
  it('returns approval block populated and merchant/owner/checklist/thinAreas null, branches/vouchers/documents []', async () => {
    const result = await getReviewContext(prisma, nonOnboardingApprovalId)

    expect(result.approval.type).toBe('VOUCHER')
    expect(result.approval.id).toBe(nonOnboardingApprovalId)
    expect(result.merchant).toBeNull()
    expect(result.owner).toBeNull()
    expect(result.checklist).toBeNull()
    expect(result.thinAreas).toBeNull()
    expect(result.branches).toEqual([])
    expect(result.vouchers).toEqual([])
    expect(result.documents).toEqual([])
  })
})

// ─── Assertion 9: APPROVAL_NOT_FOUND ──────────────────────────────────────

describe('M4 review context — APPROVAL_NOT_FOUND', () => {
  it('throws APPROVAL_NOT_FOUND for a bogus id', async () => {
    await expect(getReviewContext(prisma, 'no-such-approval-id')).rejects.toThrow('APPROVAL_NOT_FOUND')
  })
})
