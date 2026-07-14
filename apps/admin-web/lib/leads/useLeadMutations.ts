'use client'

/**
 * useLeadMutations : React Query mutations for the Prospect pipeline board
 * (create / update / convert). Mirrors useMerchantActions: each mutation
 * invalidates on success AND on error (a stale-state error : LEAD_ALREADY_CONVERTED,
 * LEAD_ANONYMISED : means the server state moved on, so the UI should refetch).
 *
 *   useCreateLead   : capture a prospect. Invalidates the live pipeline (a new
 *                     LEAD lane card) + terminal (harmless; keeps counts honest).
 *   useUpdateLead   : field edit and/or stage move (lane move or LOST). A LOST
 *                     move leaves the live lanes for the terminal section, so BOTH
 *                     reads are invalidated.
 *   useConvertLead  : convert to a merchant draft. Invalidates BOTH lead reads
 *                     (the lead leaves the live lanes for the Converted section)
 *                     AND the merchants directory (a new draft appears there).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { leadsApi } from '@/lib/api/leads'
import type { CreateLeadInput, UpdateLeadInput, ConvertLeadInput, CreateLeadResponse, ConvertLeadResponse, Lead } from '@/lib/api/leads'
import { LEADS_PIPELINE_KEY, LEADS_TERMINAL_KEY } from '@/lib/leads/useLeadsPipeline'
import { MERCHANTS_LIST_KEY } from '@/lib/merchants/useMerchantsList'

/** Invalidate both lead reads (the board + the terminal sections). */
function useInvalidateLeads() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: LEADS_PIPELINE_KEY })
    void qc.invalidateQueries({ queryKey: LEADS_TERMINAL_KEY })
  }
}

export function useCreateLead() {
  const invalidate = useInvalidateLeads()
  return useMutation<CreateLeadResponse, Error, CreateLeadInput>({
    mutationFn: (input) => leadsApi.create(input),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useUpdateLead() {
  const invalidate = useInvalidateLeads()
  return useMutation<Lead, Error, { leadId: string; input: UpdateLeadInput }>({
    mutationFn: ({ leadId, input }) => leadsApi.update(leadId, input),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useConvertLead() {
  const invalidate = useInvalidateLeads()
  const qc = useQueryClient()
  return useMutation<ConvertLeadResponse, Error, { leadId: string; input: ConvertLeadInput }>({
    mutationFn: ({ leadId, input }) => leadsApi.convert(leadId, input),
    onSuccess: () => {
      invalidate()
      // A convert mints a merchant draft, so the directory changes too.
      void qc.invalidateQueries({ queryKey: MERCHANTS_LIST_KEY })
    },
    onError: invalidate,
  })
}
