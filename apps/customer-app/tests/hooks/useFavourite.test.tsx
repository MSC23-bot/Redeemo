import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useFavourite } from '@/hooks/useFavourite'

// Covers plan §12's "favourite-toggle" requirement.
//
// Implementation note: useFavourite is **pessimistic-with-onSuccess** — state
// only advances after the API resolves successfully. On failure, state never
// advances at all (so there's nothing to roll back, the prior value is just
// retained). The plan's "optimistic + rollback" wording predated the salvaged
// hook; the tests below assert the *actual* observable behaviour:
//   - success path: state transitions on resolve
//   - failure path: state stays at the prior value (mutation throws, state
//     never advanced — equivalent to a rollback from the consumer's view)
// Switching to a truly optimistic implementation (advance immediately, revert
// on error) is a deliberate behaviour change and is left as a follow-up.

jest.spyOn(api, 'post')
jest.spyOn(api, 'del')

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useFavourite', () => {
  beforeEach(() => {
    ;(api.post as jest.Mock).mockReset()
    ;(api.del  as jest.Mock).mockReset()
  })

  it('flips to favourited after a successful add', async () => {
    ;(api.post as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', isFavourited: false }),
      { wrapper: wrap },
    )
    expect(result.current.isFavourited).toBe(false)
    await act(async () => { await result.current.toggle() })
    expect(api.post).toHaveBeenCalledWith('/api/v1/customer/favourites/merchants/m1', undefined)
    expect(result.current.isFavourited).toBe(true)
  })

  it('flips to NOT favourited after a successful remove', async () => {
    ;(api.del as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', isFavourited: true }),
      { wrapper: wrap },
    )
    expect(result.current.isFavourited).toBe(true)
    await act(async () => { await result.current.toggle() })
    expect(api.del).toHaveBeenCalledWith('/api/v1/customer/favourites/merchants/m1')
    expect(result.current.isFavourited).toBe(false)
  })

  it('failure: if the add API rejects, isFavourited stays false (state never advances)', async () => {
    ;(api.post as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', isFavourited: false }),
      { wrapper: wrap },
    )
    await act(async () => {
      await expect(result.current.toggle()).rejects.toThrow('boom')
    })
    expect(result.current.isFavourited).toBe(false)
  })

  it('failure: if the remove API rejects, isFavourited stays true (state never advances)', async () => {
    ;(api.del as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', isFavourited: true }),
      { wrapper: wrap },
    )
    await act(async () => {
      await expect(result.current.toggle()).rejects.toThrow('boom')
    })
    expect(result.current.isFavourited).toBe(true)
  })

  it('uses the voucher endpoint when type is voucher', async () => {
    ;(api.post as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'voucher', id: 'v1', isFavourited: false }),
      { wrapper: wrap },
    )
    await act(async () => { await result.current.toggle() })
    expect(api.post).toHaveBeenCalledWith('/api/v1/customer/favourites/vouchers/v1', undefined)
  })

  it('re-syncs when the parent prop changes', async () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: boolean }) =>
        useFavourite({ type: 'merchant', id: 'm1', isFavourited: initial }),
      { wrapper: wrap, initialProps: { initial: false } },
    )
    expect(result.current.isFavourited).toBe(false)
    rerender({ initial: true })
    await waitFor(() => expect(result.current.isFavourited).toBe(true))
  })
})
