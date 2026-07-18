'use client'

/**
 * useSignAgreement: React Query mutation for the D65 in-person signing ceremony
 * (witness the owner's signature on the rep's device). On success it invalidates
 * the merchant's detail read so the contract gate + Overview evidence block
 * re-read; the route gates merchant:sign-agreement server-side (the UI gate is
 * defence-in-depth UX). Errors (AGREEMENT_LEGAL_REVIEW_REQUIRED on a production
 * binding write, CONTRACT_ALREADY_SIGNED, etc.) surface via NamedGateBanner.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { agreementApi } from '@/lib/api/agreement'
import type { SignAgreementInput, SignAgreementResponse } from '@/lib/api/agreement'
import { merchantDetailQueryKey } from '@/lib/merchants/useMerchantDetail'

export function useSignAgreement(merchantId: string) {
  const qc = useQueryClient()
  return useMutation<SignAgreementResponse, Error, SignAgreementInput>({
    mutationFn: (input) => agreementApi.sign(merchantId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: merchantDetailQueryKey(merchantId) })
    },
  })
}
