import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { useBranchSelection } from '@/features/merchant/hooks/useBranchSelection'

const mockReplace = jest.fn()
let mockParams: Record<string, string | undefined> = {}

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockParams,
}))

describe('useBranchSelection', () => {
  beforeEach(() => { mockReplace.mockClear(); mockParams = {} })

  it('returns null branchId when ?branch= is absent', () => {
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    expect(result.current.branchId).toBeNull()
  })

  it('returns the URL branchId when present', () => {
    mockParams = { branch: 'b1' }
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    expect(result.current.branchId).toBe('b1')
  })

  it('select() router.replace`s the URL with the new branch', () => {
    mockParams = { branch: 'b1' }
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    act(() => { result.current.select('b2') })
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/merchant/[id]',
      params: { id: 'm1', branch: 'b2' },
    })
  })

  it('reconcile() writes the resolved branchId back to the URL when it differs', () => {
    mockParams = { branch: 'b-stale' }
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    act(() => { result.current.reconcile('b-resolved') })
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/merchant/[id]',
      params: { id: 'm1', branch: 'b-resolved' },
    })
  })

  it('reconcile() is a no-op when URL already matches', () => {
    mockParams = { branch: 'b1' }
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    act(() => { result.current.reconcile('b1') })
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
