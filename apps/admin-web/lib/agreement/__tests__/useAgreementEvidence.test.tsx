/**
 * useAgreementEvidence: proves the request-layer half of the D65 lane-2 dormant release gate. Even
 * when a caller passes enabled=true, the hook issues ZERO evidence requests unless the release gate
 * (isEvidenceUiEnabled) is ON. This is defense in depth behind the page/card render gates.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAgreementEvidence } from '../useAgreementEvidence'
import { agreementApi } from '@/lib/api/agreement'
import { isEvidenceUiEnabled } from '@/lib/flags'

jest.mock('@/lib/api/agreement', () => ({
  agreementApi: { getEvidence: jest.fn() },
}))
jest.mock('@/lib/flags', () => ({ isEvidenceUiEnabled: jest.fn() }))

const mockGetEvidence = agreementApi.getEvidence as jest.Mock
const mockFlag = isEvidenceUiEnabled as jest.Mock
const MERCHANT_ID = 'm-1'

function makeHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return { Wrapper }
}

afterEach(() => jest.clearAllMocks())

describe('useAgreementEvidence release gate', () => {
  it('OFF: issues ZERO requests even when enabled=true', async () => {
    mockFlag.mockReturnValue(false)
    const { Wrapper } = makeHarness()
    renderHook(() => useAgreementEvidence(MERCHANT_ID, true), { wrapper: Wrapper })
    // Give react-query a tick; the disabled query must never call the fetcher.
    await new Promise((r) => setTimeout(r, 0))
    expect(mockGetEvidence).not.toHaveBeenCalled()
  })

  it('ON + enabled + merchantId: fetches the evidence', async () => {
    mockFlag.mockReturnValue(true)
    mockGetEvidence.mockResolvedValueOnce({ agreementVersion: '2.1-draft' })
    const { Wrapper } = makeHarness()
    renderHook(() => useAgreementEvidence(MERCHANT_ID, true), { wrapper: Wrapper })
    await waitFor(() => expect(mockGetEvidence).toHaveBeenCalledWith(MERCHANT_ID))
  })

  it('ON but not yet requested (enabled=false): still no request', async () => {
    mockFlag.mockReturnValue(true)
    const { Wrapper } = makeHarness()
    renderHook(() => useAgreementEvidence(MERCHANT_ID, false), { wrapper: Wrapper })
    await new Promise((r) => setTimeout(r, 0))
    expect(mockGetEvidence).not.toHaveBeenCalled()
  })
})
