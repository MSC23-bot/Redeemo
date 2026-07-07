/**
 * PR-C C1 client tests for lib/api/staff.ts.
 *
 * Mocks apiFetch and asserts each call hits the locked PR-B endpoint with the
 * right method/body and parses the curated (no-passwordHash) shapes. Mirrors
 * lib/api/__tests__/redemptions.test.ts.
 */
import {
  listStaff,
  inviteStaff,
  updateStaff,
  deactivateStaff,
  reactivateStaff,
  removeStaff,
  resendInvite,
  listBranchAppUsers,
  resetAppUserPassword,
  deactivateAppUser,
  reactivateAppUser,
} from '../staff'

const apiFetch = jest.fn()
jest.mock('../client', () => ({
  apiFetch: (path: string, opts: unknown) => apiFetch(path, opts),
}))

const MEMBER = {
  id: 'm1',
  name: 'Sam Owner',
  email: 'sam@shop.test',
  role: 'OWNER',
  status: 'ACTIVE',
  canManageVouchers: false,
  allBranches: true,
  branchIds: [],
  claimed: true,
  lastLoginAt: '2026-06-20T10:00:00.000Z',
}

const APP_USERS = {
  branches: [
    {
      branchId: 'b1',
      branchName: 'High Street',
      appUserCount: 1,
      users: [
        {
          id: 'au1',
          branchId: 'b1',
          firstName: 'Jo',
          lastName: 'Till',
          jobTitle: 'Manager',
          email: 'jo@shop.test',
          status: 'ACTIVE',
          lastLoginAt: null,
        },
      ],
    },
  ],
}

beforeEach(() => {
  apiFetch.mockReset()
})

describe('listStaff', () => {
  it('GETs /merchant/staff and parses the members array (never passwordHash)', async () => {
    apiFetch.mockResolvedValueOnce({ members: [MEMBER] })
    const members = await listStaff()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/staff', { method: 'GET', auth: true })
    expect(members).toHaveLength(1)
    expect(members[0].role).toBe('OWNER')
    expect(members[0]).not.toHaveProperty('passwordHash')
  })

  it('rejects when the member row shape is invalid (zod)', async () => {
    apiFetch.mockResolvedValueOnce({ members: [{ id: 'x' }] })
    await expect(listStaff()).rejects.toBeDefined()
  })

  it('parses a member row jobTitle when present, and tolerates it being absent', async () => {
    apiFetch.mockResolvedValueOnce({ members: [{ ...MEMBER, jobTitle: 'General Manager' }] })
    const withTitle = await listStaff()
    expect(withTitle[0].jobTitle).toBe('General Manager')

    apiFetch.mockResolvedValueOnce({ members: [MEMBER] })
    const withoutTitle = await listStaff()
    expect(withoutTitle[0].jobTitle).toBeUndefined()
  })
})

describe('inviteStaff', () => {
  it('POSTs /merchant/staff with the invite body and parses { memberId, inviteDelivery }', async () => {
    apiFetch.mockResolvedValueOnce({ memberId: 'm9', inviteDelivery: 'EMAIL_DARK' })
    const res = await inviteStaff({
      email: 'new@shop.test',
      firstName: 'New',
      lastName: 'Person',
      jobTitle: 'Floor',
      role: 'STAFF',
      allBranches: true,
    })
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/staff', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({
        email: 'new@shop.test',
        firstName: 'New',
        lastName: 'Person',
        jobTitle: 'Floor',
        role: 'STAFF',
        allBranches: true,
      }),
    })
    expect(res).toEqual({ memberId: 'm9', inviteDelivery: 'EMAIL_DARK' })
  })

  it('parses the QUEUED inviteDelivery value', async () => {
    apiFetch.mockResolvedValueOnce({ memberId: 'm9', inviteDelivery: 'QUEUED' })
    const res = await inviteStaff({
      email: 'new@shop.test',
      firstName: 'New',
      lastName: 'Person',
      role: 'BRANCH_MANAGER',
      allBranches: false,
      branchIds: ['b1'],
      canManageVouchers: true,
    })
    expect(res.inviteDelivery).toBe('QUEUED')
  })

  it('rejects an unexpected inviteDelivery value (zod enum)', async () => {
    apiFetch.mockResolvedValueOnce({ memberId: 'm9', inviteDelivery: 'SENT' })
    await expect(
      inviteStaff({ email: 'a@b.test', firstName: 'A', lastName: 'B', role: 'STAFF', allBranches: true }),
    ).rejects.toBeDefined()
  })
})

describe('updateStaff', () => {
  it('PATCHes /merchant/staff/:id with the access body', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'm1' })
    await updateStaff('m1', { role: 'BRANCH_MANAGER', allBranches: true, canManageVouchers: true })
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/staff/m1', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ role: 'BRANCH_MANAGER', allBranches: true, canManageVouchers: true }),
    })
  })
})

describe('member lifecycle actions', () => {
  it('deactivateStaff POSTs the deactivate sub-route', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'm1' })
    await deactivateStaff('m1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/staff/m1/deactivate', {
      method: 'POST',
      auth: true,
    })
  })

  it('reactivateStaff POSTs the reactivate sub-route', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'm1' })
    await reactivateStaff('m1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/staff/m1/reactivate', {
      method: 'POST',
      auth: true,
    })
  })

  it('removeStaff DELETEs /merchant/staff/:id', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'm1' })
    await removeStaff('m1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/staff/m1', { method: 'DELETE', auth: true })
  })

  it('resendInvite POSTs the resend-invite sub-route and parses inviteDelivery', async () => {
    apiFetch.mockResolvedValueOnce({ memberId: 'm1', inviteDelivery: 'EMAIL_DARK' })
    const res = await resendInvite('m1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/staff/m1/resend-invite', {
      method: 'POST',
      auth: true,
    })
    expect(res.inviteDelivery).toBe('EMAIL_DARK')
  })
})

describe('listBranchAppUsers', () => {
  it('GETs /merchant/staff/app-users and parses the branch-grouped shape with appUserCount', async () => {
    apiFetch.mockResolvedValueOnce(APP_USERS)
    const res = await listBranchAppUsers()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/staff/app-users', {
      method: 'GET',
      auth: true,
    })
    expect(res.branches).toHaveLength(1)
    expect(res.branches[0].appUserCount).toBe(1)
    expect(res.branches[0].users[0].email).toBe('jo@shop.test')
    expect(res.branches[0].users[0]).not.toHaveProperty('passwordHash')
  })

  it('rejects when a branch row is missing appUserCount (zod)', async () => {
    apiFetch.mockResolvedValueOnce({ branches: [{ branchId: 'b1', branchName: 'X', users: [] }] })
    await expect(listBranchAppUsers()).rejects.toBeDefined()
  })
})

describe('app-user actions', () => {
  it('resetAppUserPassword POSTs the branch reset-password route', async () => {
    apiFetch.mockResolvedValueOnce({ message: 'ok', temporaryPassword: 'Temp123A1!' })
    const res = await resetAppUserPassword('b1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/user/reset-password', {
      method: 'POST',
      auth: true,
    })
    expect(res.temporaryPassword).toBe('Temp123A1!')
  })

  it('deactivateAppUser PATCHes the branch deactivate route', async () => {
    apiFetch.mockResolvedValueOnce({ message: 'ok' })
    await deactivateAppUser('b1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/user/deactivate', {
      method: 'PATCH',
      auth: true,
    })
  })

  it('reactivateAppUser PATCHes the branch reactivate route', async () => {
    apiFetch.mockResolvedValueOnce({ message: 'ok' })
    await reactivateAppUser('b1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/user/reactivate', {
      method: 'PATCH',
      auth: true,
    })
  })
})
