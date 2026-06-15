import { describe, it, expect, vi } from 'vitest'
import { claimApproval } from '../../../src/api/admin/approvals/service'

// Option B B1 T2: claim-audit correctness for edit-type approval rows.
//
// claimApproval is NOT type-gated (it claims any PENDING row). The pre-B1 audit
// wrote entityId = approval.referenceId, which is the PendingEdit id for an edit
// row (WRONG). B1 resolves the REAL merchant/branch id from the PendingEdit and
// audits that instead. Disambiguation is by approval.type, never referenceType.
//
// These run against a hand-built tx mock (no DB) so they pin the audit shape at
// the service boundary.

const ctx = { ipAddress: '127.0.0.1', userAgent: 'b1-t2-test' }

/** Build a prisma stub whose $transaction runs the callback against `tx`. */
function buildPrisma(tx: Record<string, unknown>) {
  return {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as never
}

describe('B1 T2: claimApproval audit for edit rows', () => {
  it('MERCHANT_IDENTITY_EDIT claim audits the merchant id (not the PendingEdit id)', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined)
    const tx = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appr-1',
          type: 'MERCHANT_IDENTITY_EDIT',
          referenceId: 'pending-edit-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      merchantPendingEdit: {
        findUnique: vi.fn().mockResolvedValue({ id: 'pending-edit-1', merchantId: 'merchant-9' }),
      },
      branchPendingEdit: { findUnique: vi.fn() },
      merchant: { update: vi.fn() },
      auditLog: { create: auditCreate },
    }

    await claimApproval(buildPrisma(tx), 'appr-1', 'admin-1', ctx)

    // No onboarding side effect.
    expect(tx.merchant.update).not.toHaveBeenCalled()
    // The branch table must NOT be consulted for a merchant edit.
    expect(tx.branchPendingEdit.findUnique).not.toHaveBeenCalled()

    const auditArg = auditCreate.mock.calls[0][0]
    expect(auditArg.data.entityType).toBe('merchant')
    expect(auditArg.data.entityId).toBe('merchant-9')
    expect(auditArg.data.event).toBe('MERCHANT_APPROVAL_CLAIMED')
    expect(auditArg.data.actorId).toBe('admin-1')
    expect(auditArg.data.actorType).toBe('ADMIN')
  })

  it('BRANCH_IDENTITY_EDIT claim audits the branch id (entityType branch)', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined)
    const tx = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appr-2',
          type: 'BRANCH_IDENTITY_EDIT',
          referenceId: 'branch-pending-edit-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      merchantPendingEdit: { findUnique: vi.fn() },
      branchPendingEdit: {
        findUnique: vi.fn().mockResolvedValue({ id: 'branch-pending-edit-1', branchId: 'branch-7', merchantId: 'merchant-9' }),
      },
      merchant: { update: vi.fn() },
      auditLog: { create: auditCreate },
    }

    await claimApproval(buildPrisma(tx), 'appr-2', 'admin-1', ctx)

    expect(tx.merchantPendingEdit.findUnique).not.toHaveBeenCalled()
    const auditArg = auditCreate.mock.calls[0][0]
    expect(auditArg.data.entityType).toBe('branch')
    expect(auditArg.data.entityId).toBe('branch-7')
    expect(auditArg.data.event).toBe('MERCHANT_APPROVAL_CLAIMED')
  })

  it('MERCHANT_ONBOARDING claim is unchanged: merchant onboardingStep → UNDER_REVIEW, audit on referenceId', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined)
    const merchantUpdate = vi.fn().mockResolvedValue(undefined)
    const tx = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'appr-3',
          type: 'MERCHANT_ONBOARDING',
          referenceId: 'merchant-onboarding-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      merchantPendingEdit: { findUnique: vi.fn() },
      branchPendingEdit: { findUnique: vi.fn() },
      merchant: { update: merchantUpdate },
      auditLog: { create: auditCreate },
    }

    await claimApproval(buildPrisma(tx), 'appr-3', 'admin-1', ctx)

    // Onboarding path still moves the merchant to UNDER_REVIEW.
    expect(merchantUpdate).toHaveBeenCalledWith({
      where: { id: 'merchant-onboarding-1' },
      data: { onboardingStep: 'UNDER_REVIEW' },
    })
    // No pending-edit lookups on the onboarding path.
    expect(tx.merchantPendingEdit.findUnique).not.toHaveBeenCalled()
    expect(tx.branchPendingEdit.findUnique).not.toHaveBeenCalled()

    const auditArg = auditCreate.mock.calls[0][0]
    expect(auditArg.data.entityType).toBe('merchant')
    expect(auditArg.data.entityId).toBe('merchant-onboarding-1')
  })
})
