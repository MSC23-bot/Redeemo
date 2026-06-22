import { describe, it, expect, vi } from 'vitest'
import { getActiveMembership } from '../../../src/api/shared/merchantMembership'

const ctx = (rows: any[]) => ({ merchantMembership: { findMany: vi.fn().mockResolvedValue(rows) } }) as any

describe('getActiveMembership', () => {
  it('returns the single ACTIVE membership with role/allBranches/canManageVouchers/branchIds', async () => {
    const m = await getActiveMembership(ctx([
      { id: 'mm1', merchantId: 'm1', merchantAdminId: 'a1', role: 'BRANCH_MANAGER', allBranches: false, canManageVouchers: true,
        merchant: { status: 'ACTIVE', businessName: 'X' }, branches: [{ branchId: 'b1' }] },
    ]), 'a1')
    expect(m).toMatchObject({ merchantId: 'm1', role: 'BRANCH_MANAGER', allBranches: false, canManageVouchers: true, allowedBranchIds: ['b1'] })
  })
  it('returns null when there is no active membership', async () => {
    expect(await getActiveMembership(ctx([]), 'a1')).toBeNull()
  })
  it('throws MULTI_MEMBERSHIP_UNSUPPORTED when >1 active membership', async () => {
    await expect(getActiveMembership(ctx([{ id: 'mm1' }, { id: 'mm2' }]), 'a1'))
      .rejects.toThrow('MULTI_MEMBERSHIP_UNSUPPORTED')
  })
})
