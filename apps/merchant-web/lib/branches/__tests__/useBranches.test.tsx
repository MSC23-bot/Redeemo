/**
 * PR-1 F1 tests for lib/branches/useBranches.ts.
 *
 * Mocks the lib/api/branch client at module level and a QueryClientProvider with
 * retry:false. Asserts the query hooks fetch + key correctly and every mutation
 * hook invalidates BOTH the BRANCHES_KEY and the ['branch', id] caches on success.
 * Mirrors lib/staff/useStaff.test.tsx.
 */
import * as React from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  BRANCHES_KEY,
  useBranches,
  useBranch,
  useUpdateBranchContact,
  useSetAmenities,
  useSetMainBranch,
  useSetBranchPin,
  useCreateBranchEditRequest,
  useWithdrawBranchEditRequest,
  useSendBranchPin,
} from '../useBranches'

const api = {
  listBranches: jest.fn(),
  getBranch: jest.fn(),
  updateBranch: jest.fn(),
  setBranchAmenities: jest.fn(),
  setBranchPin: jest.fn(),
  createBranchEditRequest: jest.fn(),
  withdrawBranchEditRequest: jest.fn(),
  sendBranchPin: jest.fn(),
}
jest.mock('@/lib/api/branch', () => ({
  listBranches: (...a: unknown[]) => api.listBranches(...a),
  getBranch: (...a: unknown[]) => api.getBranch(...a),
  updateBranch: (...a: unknown[]) => api.updateBranch(...a),
  setBranchAmenities: (...a: unknown[]) => api.setBranchAmenities(...a),
  setBranchPin: (...a: unknown[]) => api.setBranchPin(...a),
  createBranchEditRequest: (...a: unknown[]) => api.createBranchEditRequest(...a),
  withdrawBranchEditRequest: (...a: unknown[]) => api.withdrawBranchEditRequest(...a),
  sendBranchPin: (...a: unknown[]) => api.sendBranchPin(...a),
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

describe('useBranches / useBranch', () => {
  it('useBranches fetches under the [branches] key', async () => {
    api.listBranches.mockResolvedValue([{ id: 'b1' }])
    const qc = freshClient()
    const { result } = renderHook(() => useBranches(), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.listBranches).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual([{ id: 'b1' }])
    expect(BRANCHES_KEY).toEqual(['branches'])
  })

  it('useBranch(id) fetches under the [branch, id] key and calls getBranch(id)', async () => {
    api.getBranch.mockResolvedValue({ id: 'b1' })
    const qc = freshClient()
    const { result } = renderHook(() => useBranch('b1'), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getBranch).toHaveBeenCalledWith('b1')
  })

  it('useBranch is disabled (does not fetch) when id is empty', () => {
    const qc = freshClient()
    renderHook(() => useBranch(''), { wrapper: wrapper(qc) })
    expect(api.getBranch).not.toHaveBeenCalled()
  })
})

// Every mutation invalidates BOTH ['branches'] and ['branch', id] on success.
function expectBothInvalidations(invalidate: jest.SpyInstance, id: string) {
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branches'] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['branch', id] })
}

describe('branch mutations invalidate [branches] + [branch, id]', () => {
  it('useUpdateBranchContact PATCHes and invalidates', async () => {
    api.updateBranch.mockResolvedValue({ id: 'b1' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateBranchContact(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync({ id: 'b1', body: { phone: '+44' } })
    })
    expect(api.updateBranch).toHaveBeenCalledWith('b1', { phone: '+44' })
    expectBothInvalidations(invalidate, 'b1')
  })

  it('useSetAmenities POSTs and invalidates', async () => {
    api.setBranchAmenities.mockResolvedValue({ ok: true })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useSetAmenities(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync({ id: 'b1', amenityIds: ['a1', 'a2'] })
    })
    expect(api.setBranchAmenities).toHaveBeenCalledWith('b1', ['a1', 'a2'])
    expectBothInvalidations(invalidate, 'b1')
  })

  it('useSetMainBranch PATCHes isMainBranch:true and invalidates', async () => {
    api.updateBranch.mockResolvedValue({ id: 'b1', isMainBranch: true })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useSetMainBranch(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync('b1')
    })
    expect(api.updateBranch).toHaveBeenCalledWith('b1', { isMainBranch: true })
    expectBothInvalidations(invalidate, 'b1')
  })

  it('useSetBranchPin PUTs and invalidates', async () => {
    api.setBranchPin.mockResolvedValue({})
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useSetBranchPin(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync({ id: 'b1', pin: '4821' })
    })
    expect(api.setBranchPin).toHaveBeenCalledWith('b1', '4821')
    expectBothInvalidations(invalidate, 'b1')
  })

  it('useCreateBranchEditRequest POSTs and invalidates', async () => {
    api.createBranchEditRequest.mockResolvedValue({ id: 'pe1', status: 'PENDING' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateBranchEditRequest(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync({ id: 'b1', changes: { name: 'New' } })
    })
    expect(api.createBranchEditRequest).toHaveBeenCalledWith('b1', { name: 'New' })
    expectBothInvalidations(invalidate, 'b1')
  })

  it('useWithdrawBranchEditRequest DELETEs and invalidates', async () => {
    api.withdrawBranchEditRequest.mockResolvedValue({ id: 'pe1', status: 'WITHDRAWN' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useWithdrawBranchEditRequest(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync({ id: 'b1', editId: 'pe1' })
    })
    expect(api.withdrawBranchEditRequest).toHaveBeenCalledWith('b1', 'pe1')
    expectBothInvalidations(invalidate, 'b1')
  })

  it('useSendBranchPin POSTs and invalidates', async () => {
    api.sendBranchPin.mockResolvedValue({ message: 'sent' })
    const qc = freshClient()
    const invalidate = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useSendBranchPin(), { wrapper: wrapper(qc) })
    await act(async () => {
      await result.current.mutateAsync('b1')
    })
    expect(api.sendBranchPin).toHaveBeenCalledWith('b1')
    expectBothInvalidations(invalidate, 'b1')
  })
})
