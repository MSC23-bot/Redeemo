/**
 * useMerchantNotes: verifies the cache-invalidation contract. Each mutation
 * (add / edit / retract) invalidates this merchant's note list
 * (merchantNotesQueryKey(merchantId)) on BOTH success and error (a stale-state
 * error such as NOTE_NOT_ACTIVE means the server moved on, so the UI should
 * refetch to show the truth).
 *
 * The underlying API calls are mocked; we assert on invalidateQueries spies.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useAddMerchantNote,
  useEditMerchantNote,
  useRetractMerchantNote,
  merchantNotesQueryKey,
} from '../useMerchantNotes'
import { merchantNotesApi } from '@/lib/api/merchantNotes'

jest.mock('@/lib/api/merchantNotes', () => ({
  merchantNotesApi: {
    list: jest.fn(),
    add: jest.fn(),
    edit: jest.fn(),
    retract: jest.fn(),
  },
}))

const MERCHANT_ID = 'm-1'

const NOTE = {
  id: 'note-1',
  merchantId: MERCHANT_ID,
  authorAdminId: 'admin-me',
  body: 'Called the owner about the renewal.',
  status: 'ACTIVE',
  editedAt: null,
  retractedById: null,
  retractedAt: null,
  retractedReason: null,
  createdAt: '2026-07-14T09:00:00.000Z',
  updatedAt: '2026-07-14T09:00:00.000Z',
  events: [],
}

function makeHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return { qc, invalidateSpy, Wrapper }
}

afterEach(() => jest.clearAllMocks())

describe('useAddMerchantNote', () => {
  it('invalidates this merchant note list on success', async () => {
    ;(merchantNotesApi.add as jest.Mock).mockResolvedValueOnce(NOTE)
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useAddMerchantNote(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate('New note body')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantNotesQueryKey(MERCHANT_ID) })
  })

  it('invalidates this merchant note list on ERROR (stale state moved on)', async () => {
    ;(merchantNotesApi.add as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useAddMerchantNote(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate('New note body')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantNotesQueryKey(MERCHANT_ID) })
  })
})

describe('useEditMerchantNote', () => {
  it('invalidates this merchant note list on success', async () => {
    ;(merchantNotesApi.edit as jest.Mock).mockResolvedValueOnce(NOTE)
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useEditMerchantNote(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate({ noteId: 'note-1', body: 'Edited body' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantNotesQueryKey(MERCHANT_ID) })
  })

  it('invalidates this merchant note list on ERROR (stale state moved on)', async () => {
    ;(merchantNotesApi.edit as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useEditMerchantNote(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate({ noteId: 'note-1', body: 'Edited body' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantNotesQueryKey(MERCHANT_ID) })
  })
})

describe('useRetractMerchantNote', () => {
  it('invalidates this merchant note list on success', async () => {
    ;(merchantNotesApi.retract as jest.Mock).mockResolvedValueOnce({ ...NOTE, status: 'RETRACTED' })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useRetractMerchantNote(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate({ noteId: 'note-1', reason: 'Recorded on the wrong merchant.' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantNotesQueryKey(MERCHANT_ID) })
  })

  it('invalidates this merchant note list on ERROR (stale state moved on)', async () => {
    ;(merchantNotesApi.retract as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useRetractMerchantNote(MERCHANT_ID), { wrapper: Wrapper })

    result.current.mutate({ noteId: 'note-1', reason: 'Recorded on the wrong merchant.' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantNotesQueryKey(MERCHANT_ID) })
  })
})
