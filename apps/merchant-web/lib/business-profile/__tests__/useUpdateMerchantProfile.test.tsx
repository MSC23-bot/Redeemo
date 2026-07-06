/**
 * Business Profile M3: the shared PATCH mutation hook. Mocks lib/api/profile's
 * updateMerchantProfile at module level (mirrors lib/branches/useBranches.test.tsx).
 * Pins the write-back contract: a real MerchantProfile result writes + invalidates
 * the ['merchantProfile'] cache; a { requiresConfirmation, message } preview
 * leaves the cache untouched (no profile data to cache).
 */
import * as React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUpdateMerchantProfile, MERCHANT_PROFILE_KEY } from '@/lib/business-profile/useUpdateMerchantProfile'

const updateMerchantProfile = jest.fn()
jest.mock('@/lib/api/profile', () => {
  const actual = jest.requireActual('@/lib/api/profile')
  return {
    ...actual,
    updateMerchantProfile: (...a: unknown[]) => updateMerchantProfile(...a),
  }
})

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

beforeEach(() => {
  updateMerchantProfile.mockReset()
})

describe('useUpdateMerchantProfile', () => {
  it('calls updateMerchantProfile with the given body', async () => {
    updateMerchantProfile.mockResolvedValue({ id: 'm1', businessName: 'Acme' })
    const qc = freshClient()
    const { result } = renderHook(() => useUpdateMerchantProfile(), { wrapper: wrapper(qc) })

    result.current.mutate({ websiteUrl: 'newsite.co.uk' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(updateMerchantProfile).toHaveBeenCalledWith({ websiteUrl: 'newsite.co.uk' })
  })

  it('writes a real profile result into the ["merchantProfile"] cache', async () => {
    const profile = { id: 'm1', businessName: 'Acme', websiteUrl: 'newsite.co.uk' }
    updateMerchantProfile.mockResolvedValue(profile)
    const qc = freshClient()
    const { result } = renderHook(() => useUpdateMerchantProfile(), { wrapper: wrapper(qc) })

    result.current.mutate({ websiteUrl: 'newsite.co.uk' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(qc.getQueryData(MERCHANT_PROFILE_KEY)).toEqual(profile)
  })

  it('does NOT write a { requiresConfirmation } preview into the cache', async () => {
    const qc = freshClient()
    // Seed the cache with a known-good profile first, so we can assert it survives.
    const existing = { id: 'm1', businessName: 'Acme' }
    qc.setQueryData(MERCHANT_PROFILE_KEY, existing)

    updateMerchantProfile.mockResolvedValue({
      requiresConfirmation: true,
      message: 'Changing category will discard your existing RMV drafts.',
    })
    const { result } = renderHook(() => useUpdateMerchantProfile(), { wrapper: wrapper(qc) })

    result.current.mutate({ primaryCategoryId: 'sub-cafe' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // The cache still holds the profile from before the preview response - not the
    // confirmation object, and not cleared.
    expect(qc.getQueryData(MERCHANT_PROFILE_KEY)).toEqual(existing)
  })

  it('MERCHANT_PROFILE_KEY matches the shared ["merchantProfile"] key', () => {
    expect(MERCHANT_PROFILE_KEY).toEqual(['merchantProfile'])
  })
})
