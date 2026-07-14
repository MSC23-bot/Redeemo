/**
 * useSignAgreement: verifies the cache-invalidation contract on success: the
 * merchant detail read is invalidated so the contract gate + Overview evidence
 * block re-read. Mirrors lib/merchants/__tests__/useMerchantActions.test.tsx.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSignAgreement } from '../useSignAgreement'
import { agreementApi } from '@/lib/api/agreement'
import { merchantDetailQueryKey } from '@/lib/merchants/useMerchantDetail'

jest.mock('@/lib/api/agreement', () => ({
  agreementApi: {
    sign: jest.fn(),
  },
}))

const MERCHANT_ID = 'm-1'

function makeHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return { qc, invalidateSpy, Wrapper }
}

afterEach(() => jest.clearAllMocks())

describe('useSignAgreement', () => {
  it('passes merchantId + input through to agreementApi.sign', async () => {
    ;(agreementApi.sign as jest.Mock).mockResolvedValueOnce({
      recordId: 'rec-1',
      agreementVersion: '2.0-draft',
      contentHash: 'abc123',
      signedAt: '2026-07-13T13:32:00.000Z',
      contractStatus: 'SIGNED',
      gated: true,
    })
    const { Wrapper } = makeHarness()
    const { result } = renderHook(() => useSignAgreement(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate({ signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(agreementApi.sign).toHaveBeenCalledWith(MERCHANT_ID, {
      signerName: 'Marta Owner',
      signerRoleConfirmation: 'Owner',
    })
  })

  it('invalidates the merchant detail query on success', async () => {
    ;(agreementApi.sign as jest.Mock).mockResolvedValueOnce({
      recordId: 'rec-1',
      agreementVersion: '2.0-draft',
      contentHash: 'abc123',
      signedAt: '2026-07-13T13:32:00.000Z',
      contractStatus: 'SIGNED',
      gated: false,
    })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useSignAgreement(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate({ signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantDetailQueryKey(MERCHANT_ID) })
  })

  it('does NOT invalidate on error (the mutation surfaces the error via NamedGateBanner instead)', async () => {
    ;(agreementApi.sign as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useSignAgreement(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate({ signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})
