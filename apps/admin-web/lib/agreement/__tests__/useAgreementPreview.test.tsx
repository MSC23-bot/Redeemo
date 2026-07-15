/**
 * useAgreementPreview: verifies the ceremony preview mutation POSTs the signer
 * name + role through to agreementApi.preview and returns the personalised
 * response shape on success. Mirrors lib/agreement/__tests__/useSignAgreement.test.tsx.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAgreementPreview } from '../useAgreementPreview'
import { agreementApi } from '@/lib/api/agreement'

jest.mock('@/lib/api/agreement', () => ({
  agreementApi: {
    preview: jest.fn(),
  },
}))

const MERCHANT_ID = 'm-1'

const RESPONSE = {
  version: '2.0-draft',
  personalisedText: 'Redeemo Merchant Agreement, personalised for Marta Owner...',
  reviewedContentHash: 'reviewed-hash-1',
  canonicalContentHash: 'canonical-hash-1',
  isDraft: true,
  gated: true,
}

function makeHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return { qc, Wrapper }
}

afterEach(() => jest.clearAllMocks())

describe('useAgreementPreview', () => {
  it('passes merchantId + signer name/role through to agreementApi.preview', async () => {
    ;(agreementApi.preview as jest.Mock).mockResolvedValueOnce(RESPONSE)
    const { Wrapper } = makeHarness()
    const { result } = renderHook(() => useAgreementPreview(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate({ signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(agreementApi.preview).toHaveBeenCalledWith(MERCHANT_ID, {
      signerName: 'Marta Owner',
      signerRoleConfirmation: 'Owner',
    })
  })

  it('returns the personalised response shape on success', async () => {
    ;(agreementApi.preview as jest.Mock).mockResolvedValueOnce(RESPONSE)
    const { Wrapper } = makeHarness()
    const { result } = renderHook(() => useAgreementPreview(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate({ signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(RESPONSE)
  })

  it('surfaces the error on failure (the ceremony renders it via NamedGateBanner)', async () => {
    ;(agreementApi.preview as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { Wrapper } = makeHarness()
    const { result } = renderHook(() => useAgreementPreview(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate({ signerName: 'Marta Owner', signerRoleConfirmation: 'Owner' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
