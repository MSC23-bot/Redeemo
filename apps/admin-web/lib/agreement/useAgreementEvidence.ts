'use client'

/**
 * useAgreementEvidence: React Query read for the D65 lane-2 ORDINARY-tier signing evidence
 * (GET /api/v1/admin/merchants/:id/agreement/evidence). Loaded ON EXPLICIT ADMIN ACTION only:
 * the Merchant 360 evidence card passes `enabled: false` until the admin clicks "View signing
 * evidence", so opening M360 never auto-fetches the evidence (or fires the audited read).
 *
 * The backend requireAdminCapability('contract:view-evidence') is the enforcement; this hook is
 * only wired behind the UI capability gate. `staleTime: 0` so a manual refetch always re-reads.
 */
import { useQuery } from '@tanstack/react-query'
import { agreementApi } from '@/lib/api/agreement'
import type { AgreementEvidenceResponse } from '@/lib/api/agreement'
import { isEvidenceUiEnabled } from '@/lib/flags'

export function agreementEvidenceQueryKey(merchantId: string) {
  return ['admin-agreement-evidence', merchantId] as const
}

export type UseAgreementEvidenceResult = {
  data: AgreementEvidenceResponse | undefined
  isFetching: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

export function useAgreementEvidence(
  merchantId: string,
  enabled: boolean,
): UseAgreementEvidenceResult {
  const query = useQuery({
    queryKey: agreementEvidenceQueryKey(merchantId),
    queryFn: () => agreementApi.getEvidence(merchantId),
    // Defense in depth on the request path: even if a caller mounted this with enabled=true, the
    // dormant release gate (isEvidenceUiEnabled) keeps the query disabled, so a default/OFF build
    // issues ZERO evidence requests regardless of how the hook is wired. Fail closed.
    enabled: enabled && merchantId.length > 0 && isEvidenceUiEnabled(),
    staleTime: 0,
  })
  return {
    data: query.data,
    // isFetching (not isLoading): an enabled-on-demand query is `pending` before its first fetch,
    // so isLoading would read true even while disabled; isFetching is true only during an actual
    // in-flight request, which is what the card's spinner should track.
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
