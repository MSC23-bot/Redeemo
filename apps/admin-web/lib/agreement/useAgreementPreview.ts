'use client'

/**
 * useAgreementPreview: React Query mutation for the D65 ceremony's PERSONALISED agreement
 * preview (POST /api/v1/admin/merchants/:id/agreement/preview). It is a mutation (not a
 * query) because the reviewed body is produced from inputs entered DURING the ceremony (the
 * signer name + role), which travel in the POST body, never a URL/query. The returned
 * reviewedContentHash is server-authoritative; the ceremony echoes it into the sign call.
 *
 * The route gates merchant:sign-agreement server-side (the UI gate is defence-in-depth UX);
 * a bounded per-caller rate limit runs before the render. Errors surface via NamedGateBanner.
 */
import { useMutation } from '@tanstack/react-query'
import { agreementApi } from '@/lib/api/agreement'
import type { AgreementPreviewInput, AgreementPreviewResponse } from '@/lib/api/agreement'

export function useAgreementPreview(merchantId: string) {
  return useMutation<AgreementPreviewResponse, Error, AgreementPreviewInput>({
    mutationFn: (input) => agreementApi.preview(merchantId, input),
  })
}
