// B3: Merchant Documents MVP (Option 1) - merchant self-serve upload/view of their
// OWN documents. Mirrors the Option B B4 admin implementation
// (src/api/admin/merchants/documents.ts) exactly for the storage-dark-safe
// presign/redaction/atomic-write/orphan-cleanup conventions; the differences are:
//   - merchantId is ALWAYS the caller's own (resolved via resolveMerchantContext in
//     the route, never a body/query param) - there is no cross-merchant read here.
//   - the actor is the merchant user (`MERCHANT_ADMIN`), not an admin, and there is
//     no mandatory `reason` field (self-service, not "on behalf of").
//   - `documentType` is restricted to the D2 allow-list (BUSINESS_VERIFICATION_1/2,
//     PRICE_LIST); AGREEMENT stays admin/contract-flow-only and is never accepted
//     here (enforced by the route's zod schema, not re-checked here).
//   - there is NO delete endpoint in this slice (D3).
import { PrismaClient } from '../../../../generated/prisma/client'
import type { DocumentType } from '../../../../generated/prisma/enums'
import { presignGet, putObject, deleteObject } from '../../shared/storage'
import { writeAuditLogTx } from '../../shared/audit'

type AuditCtx = { ipAddress: string; userAgent: string }

/**
 * List the caller's OWN merchant's documents with short-lived presigned GET URLs.
 * The raw key (`fileUrl`) is fetched only to presign and NEVER returned. Storage
 * dark / a presign failure degrades the row to `available:false, url:null` rather
 * than failing the whole list (mirrors the admin read).
 */
export async function listMerchantDocuments(prisma: PrismaClient, merchantId: string) {
  const docs = await prisma.merchantDocument.findMany({
    where: { merchantId },
    select: { id: true, documentType: true, uploadedAt: true, fileUrl: true },
    orderBy: { uploadedAt: 'desc' },
  })

  const documents = await Promise.all(
    docs.map(async ({ id, documentType, uploadedAt, fileUrl }) => {
      try {
        const { url } = await presignGet(fileUrl)
        return { id, documentType, uploadedAt, url, available: true as const }
      } catch {
        return { id, documentType, uploadedAt, url: null, available: false as const }
      }
    }),
  )

  return { documents }
}

export interface CreateMerchantOwnDocumentInput {
  merchantId: string
  adminId: string
  documentType: DocumentType
  contentType: string
  body: Buffer
}

/**
 * Merchant self-serve upload of one of their OWN documents. Server-proxied:
 * `putObject` HARD-validates content-type + the real buffer size and writes to R2,
 * then the row + an actor-attributed audit commit atomically. If the row create
 * fails AFTER the object was written, the object is best-effort deleted so an
 * upload never leaves an orphan. Returns the REDACTED created row (no key, no url).
 */
export async function createMerchantOwnDocument(
  prisma: PrismaClient,
  input: CreateMerchantOwnDocumentInput,
  ctx: AuditCtx,
) {
  const { key } = await putObject({
    kind: 'document',
    ownerId: input.merchantId,
    contentType: input.contentType,
    body: input.body,
  })

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.merchantDocument.create({
        data: { merchantId: input.merchantId, documentType: input.documentType, fileUrl: key },
        select: { id: true, documentType: true, uploadedAt: true },
      })
      await writeAuditLogTx(tx, {
        entityId: input.merchantId,
        entityType: 'merchant',
        event: 'DOCUMENT_UPLOADED',
        actorId: input.adminId,
        actorType: 'MERCHANT_ADMIN',
        // documentId + documentType only - the raw R2 key is NOT recorded.
        after: { documentId: created.id, documentType: created.documentType },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return created
    })
  } catch (err) {
    await deleteObject(key).catch((cleanupErr) => {
      console.warn(
        `[b3-merchant-documents] orphan cleanup failed for key after a failed row create (merchant ${input.merchantId}):`,
        cleanupErr,
      )
    })
    throw err
  }
}
