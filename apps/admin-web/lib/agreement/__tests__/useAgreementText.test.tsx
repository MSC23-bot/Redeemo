/**
 * useAgreementText: verifies the ceremony agreement-text read wires through to
 * agreementApi.getCurrent and exposes { data, isLoading, isError, refetch }.
 * Mirrors lib/agreement/__tests__/useSignAgreement.test.tsx.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAgreementText } from '../useAgreementText'
import { agreementApi } from '@/lib/api/agreement'

jest.mock('@/lib/api/agreement', () => ({
  agreementApi: {
    getCurrent: jest.fn(),
  },
}))

function makeHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return { qc, Wrapper }
}

const RESPONSE = {
  version: '2.0-draft',
  text: 'Redeemo Merchant Agreement v2.0-draft\n\nFull wording...',
  contentHash: 'abc123def456',
  isDraft: true,
  gated: true,
}

afterEach(() => jest.clearAllMocks())

describe('useAgreementText', () => {
  it('reads the current agreement via agreementApi.getCurrent', async () => {
    ;(agreementApi.getCurrent as jest.Mock).mockResolvedValueOnce(RESPONSE)
    const { Wrapper } = makeHarness()
    const { result } = renderHook(() => useAgreementText(true), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(agreementApi.getCurrent).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(RESPONSE)
    expect(result.current.isError).toBe(false)
  })

  it('does NOT fetch when disabled', () => {
    const { Wrapper } = makeHarness()
    renderHook(() => useAgreementText(false), { wrapper: Wrapper })
    expect(agreementApi.getCurrent).not.toHaveBeenCalled()
  })

  it('surfaces a read error via isError', async () => {
    ;(agreementApi.getCurrent as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { Wrapper } = makeHarness()
    const { result } = renderHook(() => useAgreementText(true), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
