'use client'

/**
 * React Query hook + mutations for the internal per-merchant admin notes
 * surface (Merchant 360 Tab 8, D51). The list read fetches
 * GET /admin/merchants/:id/notes, keyed per merchant. Each mutation (add / edit
 * / retract) invalidates that merchant's note list on success AND on error (a
 * stale-state error such as NOTE_NOT_ACTIVE means the server moved on, so the UI
 * should refetch to show the truth).
 *
 * `enabled` is gated by the caller on `can('merchant:notes')` (the tab
 * fail-closes on it), so a role without the capability never fires the request;
 * the backend `requireAdminCapability` stays the enforcement. In practice
 * `merchant:notes` is UNIVERSAL (every role holds it), so this gate is
 * defence-in-depth rather than a state operators normally see.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { merchantNotesApi } from '@/lib/api/merchantNotes'
import type { MerchantNote, MerchantNotesResponse } from '@/lib/api/merchantNotes'

export const MERCHANT_NOTES_KEY = ['admin-merchant-notes'] as const

export function merchantNotesQueryKey(merchantId: string) {
  return [...MERCHANT_NOTES_KEY, merchantId] as const
}

export type UseMerchantNotesResult = {
  data: MerchantNotesResponse | undefined
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
}

export function useMerchantNotes(
  merchantId: string,
  options?: { enabled?: boolean }
): UseMerchantNotesResult {
  const query = useQuery({
    queryKey: merchantNotesQueryKey(merchantId),
    queryFn: () => merchantNotesApi.list(merchantId),
    enabled: options?.enabled ?? true,
    placeholderData: (prev) => prev,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  }
}

/** Invalidate this merchant's note list (shared by all three mutations). */
function useInvalidateNotes(merchantId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: merchantNotesQueryKey(merchantId) })
  }
}

/** Add a note to this merchant (author = the acting admin). */
export function useAddMerchantNote(merchantId: string) {
  const invalidate = useInvalidateNotes(merchantId)
  return useMutation<MerchantNote, Error, string>({
    mutationFn: (body: string) => merchantNotesApi.add(merchantId, body),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

/** Edit an OWN + ACTIVE note's body (the prior version is kept in history). */
export function useEditMerchantNote(merchantId: string) {
  const invalidate = useInvalidateNotes(merchantId)
  return useMutation<MerchantNote, Error, { noteId: string; body: string }>({
    mutationFn: ({ noteId, body }) => merchantNotesApi.edit(merchantId, noteId, body),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

/** Retract (soft-delete) an OWN + ACTIVE note; a non-empty reason is required. */
export function useRetractMerchantNote(merchantId: string) {
  const invalidate = useInvalidateNotes(merchantId)
  return useMutation<MerchantNote, Error, { noteId: string; reason: string }>({
    mutationFn: ({ noteId, reason }) => merchantNotesApi.retract(merchantId, noteId, reason),
    onSuccess: invalidate,
    onError: invalidate,
  })
}
