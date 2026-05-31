/**
 * Phase 3C.1g Device-QA R1 Wave 6.4-B (2026-05-30) — `useBranchSelection`
 * `from` / `tab` URL-param preservation pins.
 *
 * Owner-reported Scenario B: Favourites > Merchants > Merchant Profile
 * > switch branch > Back → Home (NOT Favourites).
 *
 * Root cause: `select(nextBranchId)` and `reconcile(resolvedBranchId)`
 * rebuilt the URL with just `{ id, branch }`, silently dropping
 * `?from=favourites` (and any other params).  Without the `from`
 * token, `resolveBackNavigation(undefined)` returned null and the
 * HeroSection's onBack fell through to the Tabs default (Home).
 *
 * Fix: both helpers now spread `from` + `tab` from the current URL
 * if present.
 *
 * Pins:
 *   §W6.4-B-1: select() preserves `?from=favourites` on the rebuilt URL.
 *   §W6.4-B-2: select() preserves `?tab=…` so the active MP tab doesn't reset.
 *   §W6.4-B-3: reconcile() preserves `?from=favourites` on the rebuilt URL.
 *   §W6.4-B-4: reconcile() no-ops when URL branch already matches resolved (regression guard — no router.replace call).
 *   §W6.4-B-5: select/reconcile don't emit `from`/`tab` keys when they're not in the URL (defensive — no undefined leaking into typed-route params).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { renderHook, act } from '@testing-library/react-native'

let mockSearchParams: Record<string, string | undefined> = {}
const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockSearchParams,
}))

import { useBranchSelection } from '@/features/merchant/hooks/useBranchSelection'

beforeEach(() => {
  mockReplace.mockClear()
  mockSearchParams = {}
})

describe('useBranchSelection — §W6.4-B from/tab preservation', () => {
  it('§W6.4-B-1: select() preserves ?from=favourites on the rebuilt URL', () => {
    mockSearchParams = { branch: 'b1', from: 'favourites' }
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    act(() => { result.current.select('b2') })
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/merchant/[id]',
      params:   { id: 'm1', branch: 'b2', from: 'favourites' },
    })
  })

  it('§W6.4-B-2: select() preserves ?tab so the active MP tab survives a branch switch', () => {
    mockSearchParams = { branch: 'b1', from: 'favourites', tab: 'about' }
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    act(() => { result.current.select('b2') })
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/merchant/[id]',
      params:   { id: 'm1', branch: 'b2', from: 'favourites', tab: 'about' },
    })
  })

  it('§W6.4-B-3: reconcile() preserves ?from=favourites when URL has no branch and server resolved one', () => {
    // Simulates handleMerchantTap from Voucher Detail: pushes
    // /(app)/merchant/m1?from=favourites (no branch).  Merchant
    // fetch resolves selectedBranch=b1.  reconcile fires.
    mockSearchParams = { from: 'favourites' }
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    act(() => { result.current.reconcile('b1') })
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/merchant/[id]',
      params:   { id: 'm1', branch: 'b1', from: 'favourites' },
    })
  })

  it('§W6.4-B-4: reconcile() no-ops when URL branch already matches resolved (no router.replace)', () => {
    mockSearchParams = { branch: 'b1', from: 'favourites' }
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    act(() => { result.current.reconcile('b1') })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('§W6.4-B-5: select() does NOT emit from/tab keys when neither is on the URL (defensive)', () => {
    mockSearchParams = { branch: 'b1' }
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    act(() => { result.current.select('b2') })
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/merchant/[id]',
      params:   { id: 'm1', branch: 'b2' },
    })
  })

  it('§W6.4-B-5: reconcile() does NOT emit from/tab keys when neither is on the URL', () => {
    mockSearchParams = {}
    const { result } = renderHook(() => useBranchSelection({ merchantId: 'm1' }))
    act(() => { result.current.reconcile('b1') })
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/merchant/[id]',
      params:   { id: 'm1', branch: 'b1' },
    })
  })
})
