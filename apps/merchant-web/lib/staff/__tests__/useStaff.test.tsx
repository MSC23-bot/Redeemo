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

describe('member mutations invalidate [staff]', () => {
  it.each([
    ['useInviteStaff', () => useInviteStaff(), (m: any) => m.mutateAsync({ email: 'a@b.test' }), 'inviteStaff'],
    ['useUpdateStaff', () => useUpdateStaff(), (m: any) => m.mutateAsync({ memberId: 'm1', body: {} }), 'updateStaff'],
    ['useDeactivateStaff', () => useDeactivateStaff(), (m: any) => m.mutateAsync('m1'), 'deactivateStaff'],
    ['useReactivateStaff', () => useReactivateStaff(), (m: any) => m.mutateAsync('m1'), 'reactivateStaff'],
    ['useRemoveStaff', () => useRemoveStaff(), (m: any) => m.mutateAsync('m1'), 'removeStaff'],
    ['useResendInvite', () => useResendInvite(), (m: any) => m.mutateAsync('m1'), 'resendInvite'],
  ])('%s invalidates [staff] on success', async (_name, useHook, run, apiKey) => {
    ;(api as any)[apiKey].mockResolvedValue({ ok: true })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useHook(), { wrapper: wrapper(qc) })
    await act(async () => {
      await run(result.current)
    })
    expect((api as any)[apiKey]).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['staff'] })
  })
})

describe('app-user mutations invalidate [branchAppUsers]', () => {
  it.each([
    ['useResetAppUserPassword', () => useResetAppUserPassword(), 'resetAppUserPassword'],
    ['useDeactivateAppUser', () => useDeactivateAppUser(), 'deactivateAppUser'],
    ['useReactivateAppUser', () => useReactivateAppUser(), 'reactivateAppUser'],
  ])('%s invalidates [branchAppUsers] on success', async (_name, useHook, apiKey) => {
    ;(api as any)[apiKey].mockResolvedValue({ message: 'ok', temporaryPassword: 'x' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useHook(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync('b1')
    })
    expect((api as any)[apiKey]).toHaveBeenCalledWith('b1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branchAppUsers'] })
  })
})
