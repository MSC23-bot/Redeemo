import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRedeem } from '@/features/voucher/hooks/useRedeem'
import { redemptionApi, type RedeemResponse } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => {
  const actual = jest.requireActual('@/lib/api/redemption')
  return {
    ...actual,
    redemptionApi: { redeem: jest.fn() },
  }
})

function makeRedeemResponse(overrides: Partial<RedeemResponse> = {}): RedeemResponse {
  return {
    id: 'r1', userId: 'u1', voucherId: 'v1', branchId: 'b1',
    redemptionCode: 'A7K2P9X4', estimatedSaving: 4.5,
    isValidated: false, redeemedAt: '2026-05-06T12:00:00Z',
    ...overrides,
  }
}

function withQuery(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('useRedeem — branch-attribution contract', () => {
  beforeEach(() => {
    ;(redemptionApi.redeem as jest.Mock).mockReset()
  })

  it('reads branchId from getBranchId() AT MUTATION TIME (not at hook construction)', async () => {
    let currentBranch = 'b1'
    const getBranchId = () => currentBranch
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(makeRedeemResponse({ branchId: 'b2' }))

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(
      () => useRedeem({ voucherId: 'v1', getBranchId }),
      { wrapper: withQuery(qc) },
    )

    // CRITICAL: change the branch BEFORE firing mutate(). The hook must
    // call getBranchId() inside mutationFn, not bind branchId at
    // construction time.
    currentBranch = 'b2'
    await act(async () => {
      await result.current.mutateAsync({ pin: '1234' })
    })

    expect(redemptionApi.redeem).toHaveBeenCalledWith({
      voucherId: 'v1', branchId: 'b2', pin: '1234',
    })
  })

  it('aborts with NULL_BRANCH error when getBranchId() returns null', async () => {
    const getBranchId = () => null
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(
      () => useRedeem({ voucherId: 'v1', getBranchId }),
      { wrapper: withQuery(qc) },
    )

    await act(async () => {
      try {
        await result.current.mutateAsync({ pin: '1234' })
        throw new Error('expected throw')
      } catch (err: any) {
        expect(err.code).toBe('NULL_BRANCH')
        expect(err.message).toMatch(/branch/i)
      }
    })

    // Defensive: API must NEVER be called when branch is null.
    expect(redemptionApi.redeem).not.toHaveBeenCalled()
  })

  it('invalidates expected query keys on success', async () => {
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(makeRedeemResponse())

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(
      () => useRedeem({ voucherId: 'v1', getBranchId: () => 'b1' }),
      { wrapper: withQuery(qc) },
    )

    await act(async () => {
      await result.current.mutateAsync({ pin: '1234' })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['voucher', 'v1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['savings'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteVouchers'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-redemptions'] })
  })

  it('invalidates merchantProfile on redeem success so the Voucher tab card updates immediately (PR-B T8h fix — without this, the card showed stale "redeem" affordance until staleTime: 60s expired)', async () => {
    // Owner-reported device QA: redeeming a voucher then navigating
    // back to Merchant Profile showed the card in pre-redeem state for
    // ~minutes until pull-to-refresh forced a refetch.  Root cause:
    // useRedeem only invalidated ['voucher', voucherId] / savings /
    // favouriteVouchers / my-redemptions — not ['merchantProfile'].
    // Wide invalidation by intent: at most 1-2 merchant profiles are
    // cached at any time.  This pin guards against a future regression
    // that drops the wide invalidation.
    ;(redemptionApi.redeem as jest.Mock).mockResolvedValue(makeRedeemResponse())

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(
      () => useRedeem({ voucherId: 'v1', getBranchId: () => 'b1' }),
      { wrapper: withQuery(qc) },
    )

    await act(async () => {
      await result.current.mutateAsync({ pin: '1234' })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
  })

  it('does NOT invalidate caches on error', async () => {
    ;(redemptionApi.redeem as jest.Mock).mockRejectedValue({
      code: 'INVALID_PIN', message: 'Wrong', statusCode: 400, remainingAttempts: 4,
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(
      () => useRedeem({ voucherId: 'v1', getBranchId: () => 'b1' }),
      { wrapper: withQuery(qc) },
    )

    await act(async () => {
      try {
        await result.current.mutateAsync({ pin: '0000' })
      } catch {
        /* swallowed for the cache-invalidation assertion */
      }
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('propagates typed RedemptionError unchanged on backend failure', async () => {
    ;(redemptionApi.redeem as jest.Mock).mockRejectedValue({
      code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'Locked', statusCode: 429, retryAfter: 540,
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(
      () => useRedeem({ voucherId: 'v1', getBranchId: () => 'b1' }),
      { wrapper: withQuery(qc) },
    )

    await act(async () => {
      try {
        await result.current.mutateAsync({ pin: '1234' })
        throw new Error('expected throw')
      } catch (err: any) {
        expect(err.code).toBe('PIN_RATE_LIMIT_EXCEEDED')
        expect(err.retryAfter).toBe(540)
      }
    })
  })
})
