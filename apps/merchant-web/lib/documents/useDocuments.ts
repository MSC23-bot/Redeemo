'use client'

/**
 * useMerchantDocuments + useUploadDocument (B3 - Merchant Documents MVP).
 *
 * Mirrors admin-web's lib/merchants/useMerchantDocuments.ts (queryKey + invalidate
 * on success AND error), scoped to the caller's own merchant (no merchantId param -
 * the backend resolves it from the session).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentsApi } from '@/lib/api/documents'
import type { DocumentsListResponse, UploadDocumentInput, UploadDocumentResponse } from '@/lib/api/documents'

export const MERCHANT_DOCUMENTS_KEY = ['merchant-documents'] as const

export function useMerchantDocuments(enabled: boolean = true) {
  return useQuery<DocumentsListResponse>({
    queryKey: MERCHANT_DOCUMENTS_KEY,
    queryFn: () => documentsApi.list(),
    enabled,
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: MERCHANT_DOCUMENTS_KEY })
  return useMutation<UploadDocumentResponse, Error, UploadDocumentInput>({
    mutationFn: (input) => documentsApi.upload(input),
    onSuccess: invalidate,
    onError: invalidate,
  })
}
