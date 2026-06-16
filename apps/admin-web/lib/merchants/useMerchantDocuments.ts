'use client'

/**
 * useMerchantDocuments + upload/delete mutations (Option B B4).
 *
 * The query lists a merchant's documents (each with a short-lived signed view
 * URL or available:false). The mutations invalidate the documents query on
 * success AND error (a stale-state error means the server moved on, so a refetch
 * is still useful). Documents are NOT in getMerchantDetail (D4), so only the
 * documents query is invalidated.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { documentsApi } from '@/lib/api/documents'
import type {
  DocumentsListResponse,
  UploadDocumentInput,
  UploadDocumentResponse,
} from '@/lib/api/documents'

export function merchantDocumentsQueryKey(merchantId: string) {
  return ['admin-merchant-documents', merchantId] as const
}

export function useMerchantDocuments(merchantId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: merchantDocumentsQueryKey(merchantId),
    queryFn: () => documentsApi.list(merchantId),
    enabled,
  })
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  } as {
    data: DocumentsListResponse | undefined
    isLoading: boolean
    isError: boolean
    refetch: () => void
  }
}

function useInvalidateDocuments(merchantId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: merchantDocumentsQueryKey(merchantId) })
  }
}

export function useUploadDocument(merchantId: string) {
  const invalidate = useInvalidateDocuments(merchantId)
  return useMutation<UploadDocumentResponse, Error, UploadDocumentInput>({
    mutationFn: (input) => documentsApi.upload(merchantId, input),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export function useDeleteDocument(merchantId: string) {
  const invalidate = useInvalidateDocuments(merchantId)
  return useMutation<{ ok: boolean }, Error, { documentId: string; reason: string }>({
    mutationFn: ({ documentId, reason }) => documentsApi.remove(merchantId, documentId, reason),
    onSuccess: invalidate,
    onError: invalidate,
  })
}
