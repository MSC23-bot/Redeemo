/**
 * Merchant documents API (B3 - Merchant Documents MVP, Option 1).
 *
 *   GET  /api/v1/merchant/documents  -> list the caller's OWN merchant's documents
 *     with short-lived signed view URLs. View is allowed for OWNER + BRANCH_MANAGER
 *     (the backend denies STAFF with INSUFFICIENT_PERMISSIONS).
 *   POST /api/v1/merchant/documents  -> upload one of the caller's OWN documents,
 *     multipart/form-data. OWNER only on the backend.
 *
 * Direct authed browser->backend call via the shared apiFetch client (in-memory
 * bearer token), the SAME pattern every other merchant-web API module uses
 * (mirrors lib/api/branch.ts's uploadBranchPhoto for the multipart shape). There
 * is no merchant-web BFF proxy for data endpoints; only the auth flows
 * (login/refresh/logout) route through Next API handlers for the httpOnly cookie.
 *
 * The raw storage key is never returned by the backend; `url` is a short-lived
 * signed link (or null when unavailable, e.g. storage dark). Responses are
 * Zod-validated. No delete endpoint in this slice (D3).
 */
import { z } from 'zod'
import { apiFetch } from './client'

// D2: the merchant self-serve allow-list. AGREEMENT is intentionally excluded
// (admin/contract-flow-only) - the backend also enforces this server-side.
export const DOCUMENT_TYPES = ['BUSINESS_VERIFICATION_1', 'BUSINESS_VERIFICATION_2', 'PRICE_LIST'] as const
export type DocumentTypeValue = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeValue, string> = {
  BUSINESS_VERIFICATION_1: 'Business verification (1)',
  BUSINESS_VERIFICATION_2: 'Business verification (2)',
  PRICE_LIST: 'Price list',
}

export function docTypeLabel(documentType: string): string {
  return (DOCUMENT_TYPE_LABELS as Record<string, string>)[documentType] ?? documentType
}

/** Accepted upload types + the client-side size cap (the backend enforces both). */
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png'
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

// `documentType` uses `.or(z.string())` so a future/unknown value surfaces as a
// known string rather than a parse crash (same drift-resilience as the admin client).
export const merchantDocumentSchema = z.object({
  id: z.string(),
  documentType: z.enum(DOCUMENT_TYPES).or(z.string()),
  uploadedAt: z.string(),
  url: z.string().nullable(),
  available: z.boolean(),
})
export type MerchantDocument = z.infer<typeof merchantDocumentSchema>

export const documentsListResponseSchema = z.object({
  documents: z.array(merchantDocumentSchema),
})
export type DocumentsListResponse = z.infer<typeof documentsListResponseSchema>

const uploadDocumentResponseSchema = z.object({
  id: z.string(),
  documentType: z.enum(DOCUMENT_TYPES).or(z.string()),
  uploadedAt: z.string(),
})
export type UploadDocumentResponse = z.infer<typeof uploadDocumentResponseSchema>

export interface UploadDocumentInput {
  documentType: DocumentTypeValue
  file: File
}

export const documentsApi = {
  /** List the caller's own merchant's documents (OWNER + BRANCH_MANAGER). */
  list: async (): Promise<DocumentsListResponse> => {
    const raw = await apiFetch<unknown>('/api/v1/merchant/documents', { method: 'GET', auth: true })
    return documentsListResponseSchema.parse(raw)
  },

  /**
   * Upload one of the caller's own documents (OWNER only on the backend).
   * Sends multipart/form-data: the browser sets the content-type + boundary.
   * Throws ApiError (STORAGE_NOT_ENABLED, FILE_REQUIRED, UNSUPPORTED_FILE_TYPE,
   * FILE_TOO_LARGE, INSUFFICIENT_PERMISSIONS).
   */
  upload: async (input: UploadDocumentInput): Promise<UploadDocumentResponse> => {
    const form = new FormData()
    form.append('documentType', input.documentType)
    form.append('file', input.file)
    const raw = await apiFetch<unknown>('/api/v1/merchant/documents', {
      method: 'POST',
      auth: true,
      body: form,
    })
    return uploadDocumentResponseSchema.parse(raw)
  },
}
