'use client'

/**
 * useLeadsPipeline / useTerminalLeads : React Query reads backing the Prospect
 * pipeline board (Leads & Onboarding hub SECTION 3, spec §A2).
 *
 * Two fetches (plan decision, take-500 scale):
 *   - useLeadsPipeline  : the DEFAULT list (no params), i.e. the live lanes
 *     (LEAD / CONTACTED / VISIT_BOOKED). Drives the 3-column board.
 *   - useTerminalLeads  : includeTerminal=true, filtered client-side to
 *     CONVERTED / LOST for the two terminal sections below the board.
 *
 * Both are `{ enabled }`-gated by the caller on `ready && can('lead:manage')`
 * (the section gate): a role without the capability never fires either request
 * (two-layer-gating convention). The backend `requireAdminCapability('lead:manage')`
 * is the real enforcement.
 */
import { useQuery } from '@tanstack/react-query'
import { leadsApi } from '@/lib/api/leads'
import type { Lead } from '@/lib/api/leads'

export const LEADS_PIPELINE_KEY = ['admin-leads-pipeline'] as const
export const LEADS_TERMINAL_KEY = ['admin-leads-terminal'] as const

export type UseLeadsResult = {
  leads: Lead[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

/** The live pipeline (LEAD / CONTACTED / VISIT_BOOKED). */
export function useLeadsPipeline(options?: { enabled?: boolean }): UseLeadsResult {
  const query = useQuery({
    queryKey: LEADS_PIPELINE_KEY,
    queryFn: () => leadsApi.list(),
    enabled: options?.enabled ?? true,
  })
  return {
    leads: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

/**
 * The terminal leads (CONVERTED / LOST). Fetches includeTerminal=true and filters
 * to the two terminal states client-side (the live lanes are already shown by the
 * board above, so they are dropped here to avoid a double render).
 */
export function useTerminalLeads(options?: { enabled?: boolean }): UseLeadsResult {
  const query = useQuery({
    queryKey: LEADS_TERMINAL_KEY,
    queryFn: async () => {
      const all = await leadsApi.list({ includeTerminal: true })
      return all.filter((lead) => lead.stage === 'CONVERTED' || lead.stage === 'LOST')
    },
    enabled: options?.enabled ?? true,
  })
  return {
    leads: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
