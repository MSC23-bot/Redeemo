'use client'

/**
 * useAgreementText: React Query read for the D65 ceremony's CURRENT agreement text
 * (GET /api/v1/admin/agreement/current). The ceremony presents this FULL text, gates
 * review over it, and echoes the returned `version` into the sign call so the displayed
 * agreement is bound to the recorded evidence.
 *
 * `staleTime: 0` so a re-fetch after an AGREEMENT_VERSION_MISMATCH always hits the
 * network for the current version (never a stale cache). The backend
 * requireAdminCapability('merchant:sign-agreement') is the enforcement; the UI only
 * fetches when the ceremony is shown. Pass `enabled: false` to suppress the request.
 */
import { useQuery } from '@tanstack/react-query'
import { agreementApi } from '@/lib/api/agreement'
import type { AgreementTextResponse } from '@/lib/api/agreement'

export function agreementTextQueryKey() {
  return ['admin-agreement-current'] as const
}

export type UseAgreementTextResult = {
  data: AgreementTextResponse | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useAgreementText(enabled = true): UseAgreementTextResult {
  const query = useQuery({
    queryKey: agreementTextQueryKey(),
    queryFn: () => agreementApi.getCurrent(),
    enabled,
    staleTime: 0,
  })
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
