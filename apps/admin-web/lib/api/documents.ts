/**
 * Admin merchant documents API (Option B B4).
 *
 *   GET  /api/v1/admin/merchants/:id/documents
 *     -> list documents with short-lived signed view URLs (merchant:read).
 *   POST /api/v1/admin/merchants/:id/documents
 *     -> upload a document on the merchant's behalf, multipart/form-data
 *        (merchant:manage-documents). Reason is mandatory.
 *   POST /api/v1/admin/merchants/:id/documents/:documentId/delete
 *     -> delete a document on the merchant's behalf (merchant:manage-documents).
 *
 * The raw storage key is never returned by the backend; `url` is a short-lived
 * signed link (or null when unavailable). Responses are Zod-validated.
 */
import { z } from 'zod'
import { apiFetch } from './client'

// The current document categories (mirror of the backend DocumentType enum).
// None is required; AGREEMENT is a category, not a signature flow.
export const DOCUMENT_TYPES = [
  'BUSINESS_VERIFICATION_1',
  'BUSINESS_VERIFICATION_2',
  'PRICE_LIST',
  'AGREEMENT',
] as const
export type DocumentTypeValue = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeValue, string> = {
  BUSINESS_VERIFICATION_1: 'Business verification (1)',
  BUSINESS_VERIFICATION_2: 'Business verification (2)',
  PRICE_LIST: 'Price list',
  AGREEMENT: 'Agreement',
}

export function docTypeLabel(documentType: string): string {
  return (DOCUMENT_TYPE_LABELS as Record<string, string>)[documentType] ?? documentType
}

/** Accepted upload types + the client-side size cap (the backend enforces both). */
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png'
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

// `documentType` uses `.or(z.string())` so a future enum value surfaces as a
// known string rather than a parse crash (same drift-resilience as elsewhere).
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
  reason: string
  file: File
}

export const documentsApi = {
  /** List a merchant's documents (merchant:read). */
  list: async (merchantId: string): Promise<DocumentsListResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${merchantId}/documents`, { auth: true })
    return documentsListResponseSchema.parse(raw)
  },

  /**
   * Upload a document on the merchant's behalf (merchant:manage-documents).
   * Sends multipart/form-data: the browser sets the content-type + boundary.
   * Throws ApiError (STORAGE_NOT_ENABLED, FILE_REQUIRED, UNSUPPORTED_FILE_TYPE,
   * FILE_TOO_LARGE, MERCHANT_NOT_FOUND).
   */
  upload: async (merchantId: string, input: UploadDocumentInput): Promise<UploadDocumentResponse> => {
    const form = new FormData()
    form.append('documentType', input.documentType)
    form.append('reason', input.reason)
    form.append('file', input.file)
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${merchantId}/documents`, {
      method: 'POST',
      auth: true,
      body: form,
    })
    return uploadDocumentResponseSchema.parse(raw)
  },

  /**
   * Delete a document on the merchant's behalf (merchant:manage-documents).
   * Reason is mandatory. Throws ApiError (DOCUMENT_NOT_FOUND, MERCHANT_NOT_FOUND).
   */
  remove: async (merchantId: string, documentId: string, reason: string): Promise<{ ok: boolean }> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/merchants/${merchantId}/documents/${documentId}/delete`,
      { method: 'POST', auth: true, body: JSON.stringify({ reason }) },
    )
    return z.object({ ok: z.boolean() }).parse(raw)
  },
}
