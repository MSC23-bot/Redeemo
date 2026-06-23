/**
 * PR-C C2 tests for lib/staff/useStaff.ts.
 *
 * Mocks the lib/api/staff client at module level and a QueryClientProvider with
 * retry:false. Asserts the query hooks fetch + key correctly and the mutation
 * hooks invalidate the right caches on success. Mirrors the existing React Query
 * usage in the portal (queryKey arrays + invalidateQueries on success).
 */
import * as React from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useStaff,
  useBranchAppUsers,
  useInviteStaff,
  useUpdateStaff,
  useDeactivateStaff,
  useReactivateStaff,
  useRemoveStaff,
  useResendInvite,
  useResetAppUserPassword,
  useDeactivateAppUser,
  useReactivateAppUser,
} from '../useStaff'

const api = {
  listStaff: jest.fn(),
  inviteStaff: jest.fn(),
  updateStaff: jest.fn(),
  deactivateStaff: jest.fn(),
  reactivateStaff: jest.fn(),
  removeStaff: jest.fn(),
  resendInvite: jest.fn(),
  listBranchAppUsers: jest.fn(),
  resetAppUserPassword: jest.fn(),
  deactivateAppUser: jest.fn(),
  reactivateAppUser: jest.fn(),
}
jest.mock('@/lib/api/staff', () => ({
  listStaff: (...a: unknown[]) => api.listStaff(...a),
  inviteStaff: (...a: unknown[]) => api.inviteStaff(...a),
  updateStaff: (...a: unknown[]) => api.updateStaff(...a),
  deactivateStaff: (...a: unknown[]) => api.deactivateStaff(...a),
  reactivateStaff: (...a: unknown[]) => api.reactivateStaff(...a),
  removeStaff: (...a: unknown[]) => api.removeStaff(...a),
  resendInvite: (...a: unknown[]) => api.resendInvite(...a),
  listBranchAppUsers: (...a: unknown[]) => api.listBranchAppUsers(...a),
  resetAppUserPassword: (...a: unknown[]) => api.resetAppUserPassword(...a),
  deactivateAppUser: (...a: unknown[]) => api.deactivateAppUser(...a),
  reactivateAppUser: (...a: unknown[]) => api.reactivateAppUser(...a),
}))

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())
})

describe('useStaff', () => {
  it('fetches members under the [staff] key when enabled', async () => {
    api.listStaff.mockResolvedValue([{ id: 'm1' }])
    const qc = freshClient()
    const { result } = renderHook(() => useStaff(true), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.listStaff).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual([{ id: 'm1' }])
  })

  it('does not fetch when disabled', () => {
    const qc = freshClient()
    renderHook(() => useStaff(false), { wrapper: wrapper(qc) })
    expect(api.listStaff).not.toHaveBeenCalled()
  })
})

describe('useBranchAppUsers', () => {
  it('fetches app users under the [branchAppUsers] key when enabled', async () => {
    api.listBranchAppUsers.mockResolvedValue({ branches: [] })
    const qc = freshClient()
    const { result } = renderHook(() => useBranchAppUsers(true), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.listBranchAppUsers).toHaveBeenCalledTimes(1)
  })
})

// Plain per-hook tests (no it.each helper that would trip rules-of-hooks): each
// renderHook call sites a real custom hook, and each mutation is invoked with its
// own concrete variables. Every member mutation invalidates ['staff']; every
// app-user mutation invalidates ['branchAppUsers']; the success path asserts both.
function expectStaffInvalidation(invalidate: jest.SpyInstance) {
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['staff'] })
}
function expectAppUsersInvalidation(invalidate: jest.SpyInstance) {
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branchAppUsers'] })
}

describe('member mutations invalidate [staff]', () => {
  it('useInviteStaff invalidates [staff] on success', async () => {
    api.inviteStaff.mockResolvedValue({ memberId: 'm9', inviteDelivery: 'QUEUED' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useInviteStaff(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync({
        email: 'a@b.test',
        firstName: 'A',
        lastName: 'B',
        role: 'STAFF',
        allBranches: true,
      })
    })
    expect(api.inviteStaff).toHaveBeenCalledTimes(1)
    expectStaffInvalidation(invalidate)
  })

  it('useUpdateStaff invalidates [staff] on success', async () => {
    api.updateStaff.mockResolvedValue({ id: 'm1' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateStaff(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync({ memberId: 'm1', body: { role: 'STAFF', allBranches: true } })
    })
    expect(api.updateStaff).toHaveBeenCalledWith('m1', { role: 'STAFF', allBranches: true })
    expectStaffInvalidation(invalidate)
  })

  it('useDeactivateStaff invalidates [staff] on success', async () => {
    api.deactivateStaff.mockResolvedValue({ id: 'm1' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeactivateStaff(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync('m1')
    })
    expect(api.deactivateStaff).toHaveBeenCalledWith('m1')
    expectStaffInvalidation(invalidate)
  })

  it('useReactivateStaff invalidates [staff] on success', async () => {
    api.reactivateStaff.mockResolvedValue({ id: 'm1' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useReactivateStaff(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync('m1')
    })
    expect(api.reactivateStaff).toHaveBeenCalledWith('m1')
    expectStaffInvalidation(invalidate)
  })

  it('useRemoveStaff invalidates [staff] on success', async () => {
    api.removeStaff.mockResolvedValue({ id: 'm1' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveStaff(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync('m1')
    })
    expect(api.removeStaff).toHaveBeenCalledWith('m1')
    expectStaffInvalidation(invalidate)
  })

  it('useResendInvite invalidates [staff] on success', async () => {
    api.resendInvite.mockResolvedValue({ memberId: 'm1', inviteDelivery: 'EMAIL_DARK' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useResendInvite(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync('m1')
    })
    expect(api.resendInvite).toHaveBeenCalledWith('m1')
    expectStaffInvalidation(invalidate)
  })
})

describe('app-user mutations invalidate [branchAppUsers]', () => {
  it('useResetAppUserPassword invalidates [branchAppUsers] on success', async () => {
    api.resetAppUserPassword.mockResolvedValue({ message: 'ok', temporaryPassword: 'x' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useResetAppUserPassword(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync('b1')
    })
    expect(api.resetAppUserPassword).toHaveBeenCalledWith('b1')
    expectAppUsersInvalidation(invalidate)
  })

  it('useDeactivateAppUser invalidates [branchAppUsers] on success', async () => {
    api.deactivateAppUser.mockResolvedValue({ message: 'ok' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeactivateAppUser(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync('b1')
    })
    expect(api.deactivateAppUser).toHaveBeenCalledWith('b1')
    expectAppUsersInvalidation(invalidate)
  })

  it('useReactivateAppUser invalidates [branchAppUsers] on success', async () => {
    api.reactivateAppUser.mockResolvedValue({ message: 'ok' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useReactivateAppUser(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync('b1')
    })
    expect(api.reactivateAppUser).toHaveBeenCalledWith('b1')
    expectAppUsersInvalidation(invalidate)
  })
})
