// tests/api/customer/discovery/approved-waiting-invisible.integration.test.ts
//
// Day-2 Vouchers B1 (item 5): REAL customer-discovery regression pin for the
// Model 1 "approved-waiting" invariant.
//
// Model 1 (approve-early / activate-delayed): a custom voucher can be APPROVED
// by admin but still waiting to activate (approvalStatus:'APPROVED' +
// status:'PENDING_APPROVAL'. It must NOT be customer-visible until it is
// activated (status:'ACTIVE'). The customer-facing queries gate on
// status:ACTIVE + approvalStatus:APPROVED + isTestData:false, so an
// approved-waiting voucher is correctly excluded.
//
// The existing voucher-approved-waiting-invariants.test.ts (merchant side) pins
// the customer side only with a LOCAL predicate restatement. This pin exercises
// the REAL service functions against a seeded approved-waiting voucher:
//   - getCustomerVoucher (detail)  -> VOUCHER_NOT_FOUND (excluded)
//   - getCustomerMerchant.vouchers -> does NOT include the approved-waiting row
// A fully ACTIVE control voucher on the same merchant is included in both, so
// the test proves the exclusion is the approved-waiting state (not the fixture).

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getCustomerMerchant, getCustomerVoucher } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'b1-item5-approved-waiting-'
const MERCHANT_ID = `${FIXTURE_PREFIX}merchant`
const BRANCH_ID = `${FIXTURE_PREFIX}branch`
const VOUCHER_APPROVED_WAITING_ID = `${FIXTURE_PREFIX}voucher-aw`
const VOUCHER_ACTIVE_ID = `${FIXTURE_PREFIX}voucher-active`

beforeAll(async () => {
  // §BU pattern: warm the connection before fresh-per-test fixtures.
  await prisma.$queryRaw`SELECT 1`

  await prisma.merchant.upsert({
    where: { id: MERCHANT_ID },
    create: {
      id: MERCHANT_ID,
      businessName: 'B1 Item5 Approved Waiting Merchant',
      tradingName: 'B1 Item5',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus: 'SIGNED',
    },
    update: { status: 'ACTIVE' },
  })

  await prisma.branch.upsert({
    where: { id: BRANCH_ID },
    create: {
      id: BRANCH_ID,
      merchantId: MERCHANT_ID,
      name: 'B1 Item5 Main Branch',
      isMainBranch: true,
      addressLine1: '1 Test St',
      city: 'Huddersfield',
      postcode: 'HD1 2PY',
      country: 'GB',
      isActive: true,
      locationConfidence: 'MANUALLY_CONFIRMED',
    },
    update: { isActive: true },
  })

  // The approved-waiting voucher: APPROVED but NOT yet activated.
  await prisma.voucher.upsert({
    where: { id: VOUCHER_APPROVED_WAITING_ID },
    create: {
      id: VOUCHER_APPROVED_WAITING_ID,
      merchantId: MERCHANT_ID,
      code: `${FIXTURE_PREFIX}RCV-AW`,
      type: 'DISCOUNT_FIXED',
      title: 'Approved waiting deal',
      estimatedSaving: 8.0,
      status: 'PENDING_APPROVAL', // <- the Model 1 approved-waiting combination
      approvalStatus: 'APPROVED',
      isRmv: false,
      isTestData: false,
    },
    update: { status: 'PENDING_APPROVAL', approvalStatus: 'APPROVED', isTestData: false },
  })

  // The fully ACTIVE control voucher on the same merchant.
  await prisma.voucher.upsert({
    where: { id: VOUCHER_ACTIVE_ID },
    create: {
      id: VOUCHER_ACTIVE_ID,
      merchantId: MERCHANT_ID,
      code: `${FIXTURE_PREFIX}RCV-ACTIVE`,
      type: 'DISCOUNT_FIXED',
      title: 'Active control deal',
      estimatedSaving: 5.0,
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      isRmv: false,
      isTestData: false,
    },
    update: { status: 'ACTIVE', approvalStatus: 'APPROVED', isTestData: false },
  })
}, 60_000)

afterAll(async () => {
  // FK-safe cleanup: vouchers + branch before the merchant.
  await prisma.voucher.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } })
  await prisma.branch.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } })
  await prisma.merchant.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } })
  await prisma.$disconnect()
})

describe('B1 item 5: approved-waiting voucher is invisible to the real customer queries', () => {
  it('getCustomerVoucher (detail) throws VOUCHER_NOT_FOUND for an approved-waiting voucher', async () => {
    await expect(
      getCustomerVoucher(prisma as never, VOUCHER_APPROVED_WAITING_ID, null),
    ).rejects.toThrow('VOUCHER_NOT_FOUND')
  })

  it('getCustomerVoucher (detail) returns the fully ACTIVE control voucher (proves the exclusion is the state, not the fixture)', async () => {
    const v = await getCustomerVoucher(prisma as never, VOUCHER_ACTIVE_ID, null)
    expect(v.id).toBe(VOUCHER_ACTIVE_ID)
  })

  it('getCustomerMerchant.vouchers excludes the approved-waiting voucher but includes the ACTIVE control', async () => {
    const merchant = await getCustomerMerchant(prisma as never, MERCHANT_ID, null)
    const voucherIds = merchant.vouchers.map((v: { id: string }) => v.id)
    expect(voucherIds).not.toContain(VOUCHER_APPROVED_WAITING_ID)
    expect(voucherIds).toContain(VOUCHER_ACTIVE_ID)
  })
})
