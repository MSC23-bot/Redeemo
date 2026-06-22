import { describe, it, expect, vi } from 'vitest'
import { claimApproval, releaseApproval } from '../../../src/api/admin/approvals/service'

// Day-2 Vouchers B1 (item 1): claim/release audit correctness for VOUCHER
// approval rows.
//
// claimApproval / releaseApproval are NOT type-gated. The pre-B1 audit
// defaulted a VOUCHER approval to entityId = approval.referenceId (the VOUCHER
// id) under entityType:'merchant', recording a voucher id mislabeled as a
// merchant. B1 resolves the REAL merchantId from the Voucher row and audits
// that instead, matching the voucherApprover DECISION audits
// (entityId: voucher.merchantId, entityType:'merchant').
//
// These run against a hand-built tx mock (no DB) so they pin the audit shape at
// the service boundary.

const ctx = { ipAddress: '127.0.0.1', userAgent: 'b1-item1-test' }

/** Build a prisma stub whose $transaction runs the callback against `tx`. */
function buildPrisma(tx: Record<string, unknown>) {
  return {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as never
}

describe('B1 item 1: claimApproval audit for VOUCHER rows', () => {
  it('VOUCHER claim audits the voucher merchantId (not the voucher id)', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined)
    const tx = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appr-v1',
          type: 'VOUCHER',
          referenceId: 'voucher-123',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      merchantPendingEdit: { findUnique: vi.fn() },
      branchPendingEdit: { findUnique: vi.fn() },
      voucher: {
        findUnique: vi.fn().mockResolvedValue({ merchantId: 'merchant-42' }),
      },
      merchant: { update: vi.fn() },
      auditLog: { create: auditCreate },
    }

    await claimApproval(buildPrisma(tx), 'appr-v1', 'admin-1', ctx)

    // No onboarding side effect; no pending-edit lookups for a voucher row.
    expect(tx.merchant.update).not.toHaveBeenCalled()
    expect(tx.merchantPendingEdit.findUnique).not.toHaveBeenCalled()
    expect(tx.branchPendingEdit.findUnique).not.toHaveBeenCalled()
    // The voucher must be resolved to its merchantId.
    expect(tx.voucher.findUnique).toHaveBeenCalledWith({
      where: { id: 'voucher-123' },
      select: { merchantId: true },
    })

    const auditArg = auditCreate.mock.calls[0][0]
    expect(auditArg.data.entityType).toBe('merchant')
    expect(auditArg.data.entityId).toBe('merchant-42')
    expect(auditArg.data.entityId).not.toBe('voucher-123')
    expect(auditArg.data.event).toBe('MERCHANT_APPROVAL_CLAIMED')
    expect(auditArg.data.actorId).toBe('admin-1')
    expect(auditArg.data.actorType).toBe('ADMIN')
  })
})

describe('B1 item 1: releaseApproval audit for VOUCHER rows', () => {
  it('VOUCHER release audits the voucher merchantId (not the voucher id)', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined)
    const tx = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appr-v2',
          type: 'VOUCHER',
          referenceId: 'voucher-777',
          claimedById: 'admin-1',
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      voucher: {
        findUnique: vi.fn().mockResolvedValue({ merchantId: 'merchant-99' }),
      },
      merchant: { update: vi.fn() },
      auditLog: { create: auditCreate },
    }

    await releaseApproval(buildPrisma(tx), 'appr-v2', 'admin-1', 'OPERATIONS', ctx)

    // No onboarding side effect.
    expect(tx.merchant.update).not.toHaveBeenCalled()
    expect(tx.voucher.findUnique).toHaveBeenCalledWith({
      where: { id: 'voucher-777' },
      select: { merchantId: true },
    })

    const auditArg = auditCreate.mock.calls[0][0]
    expect(auditArg.data.entityType).toBe('merchant')
    expect(auditArg.data.entityId).toBe('merchant-99')
    expect(auditArg.data.entityId).not.toBe('voucher-777')
    expect(auditArg.data.event).toBe('MERCHANT_APPROVAL_RELEASED')
    expect(auditArg.data.actorId).toBe('admin-1')
    expect(auditArg.data.actorType).toBe('ADMIN')
  })

  it('MERCHANT_ONBOARDING release is unchanged: merchant → SUBMITTED, audit on referenceId', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined)
    const merchantUpdate = vi.fn().mockResolvedValue(undefined)
    const tx = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appr-o1',
          type: 'MERCHANT_ONBOARDING',
          referenceId: 'merchant-onboarding-1',
          claimedById: 'admin-1',
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      voucher: { findUnique: vi.fn() },
      merchant: { update: merchantUpdate },
      auditLog: { create: auditCreate },
    }

    await releaseApproval(buildPrisma(tx), 'appr-o1', 'admin-1', 'OPERATIONS', ctx)

    expect(merchantUpdate).toHaveBeenCalledWith({
      where: { id: 'merchant-onboarding-1' },
      data: { onboardingStep: 'SUBMITTED' },
    })
    // No voucher lookup on the onboarding path.
    expect(tx.voucher.findUnique).not.toHaveBeenCalled()

    const auditArg = auditCreate.mock.calls[0][0]
    expect(auditArg.data.entityType).toBe('merchant')
    expect(auditArg.data.entityId).toBe('merchant-onboarding-1')
  })
})
