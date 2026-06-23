/**
 * PR-1 F1 tests for lib/branches/useBranchCapability.ts.
 *
 * Mirrors the Staff & Access pattern (§1.5): isOwner is derived from whether the
 * owner-gated GET /staff query succeeds. A 403 with code INSUFFICIENT_PERMISSIONS
 * means the caller is NOT the owner. `ready` is true once the query has settled
 * either way (success OR the forbidden error).
 */
import * as React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/client'
import { useBranchCapability } from '../useBranchCapability'

const listStaff = jest.fn()
jest.mock('@/lib/api/staff', () => ({
  listStaff: (...a: unknown[]) => listStaff(...a),
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
  listStaff.mockReset()
})

describe('useBranchCapability', () => {
  it('isOwner=true + ready=true when the staff query succeeds', async () => {
    listStaff.mockResolvedValue([{ id: 'm1' }])
    const qc = freshClient()
    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.isOwner).toBe(true)
  })

  it('isOwner=false + ready=true when the staff query 403s with INSUFFICIENT_PERMISSIONS', async () => {
    listStaff.mockRejectedValue(new ApiError(403, { error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'no' } }))
    const qc = freshClient()
    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.isOwner).toBe(false)
  })

  it('not ready while the query is in flight (no premature owner flash)', () => {
    listStaff.mockReturnValue(new Promise(() => {})) // never resolves
    const qc = freshClient()
    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    expect(result.current.ready).toBe(false)
    expect(result.current.isOwner).toBe(false)
  })

  it('does not fetch when disabled (and is not ready/owner)', () => {
    const qc = freshClient()
    const { result } = renderHook(() => useBranchCapability(false), { wrapper: wrapper(qc) })
    expect(listStaff).not.toHaveBeenCalled()
    expect(result.current.ready).toBe(false)
    expect(result.current.isOwner).toBe(false)
  })
})
