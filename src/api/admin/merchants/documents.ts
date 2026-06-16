// Option B B4 - admin merchant document support (upload / view / delete on behalf).
//
// Mirrors the M4 read/redaction model exactly: the raw `fileUrl` (the R2 object
// key) is read ONLY to presign and is NEVER returned to the client; each document
// resolves to `{ id, documentType, uploadedAt, url, available }`, with
// `available:false`/`url:null` when storage is dark or a presign fails. Documents
// are merchant-scoped, so no branch PIN is ever in scope.
//
// Upload is server-proxied (the API holds the bytes), so `putObject` HARD-enforces
// content-type + size before the object is written and the row created. If the
// object write succeeds but the row create fails, the object is best-effort cleaned
// up so a successful upload never orphans an unreferenced object.

import { PrismaClient } from '../../../../generated/prisma/client'
import type { DocumentType } from '../../../../generated/prisma/enums'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { presignGet, putObject, deleteObject } from '../../shared/storage'

type AuditCtx = { ipAddress: string; userAgent: string }

/**
 * List a merchant's documents with short-lived presigned GET URLs. The raw key
 * (`fileUrl`) is fetched only to presign and NEVER returned. Mirrors
 * `getReviewContext`'s document resolution (try/catch per doc).
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
        // Storage dark / presign failed: surface the row without a link. The raw
        // fileUrl is never included, even on failure.
        return { id, documentType, uploadedAt, url: null, available: false as const }
      }
    }),
  )

  return { documents }
}

export interface CreateMerchantDocumentInput {
  merchantId: string
  adminId: string
  documentType: DocumentType
  contentType: string
  body: Buffer
  reason: string
}

/**
 * Upload a document on the merchant's behalf. Server-proxied: `putObject`
 * validates content-type + the real buffer size and writes to R2, then the row +
 * an actor-attributed audit are committed atomically. If the row create fails
 * AFTER the object was written, the object is best-effort deleted so an upload
 * never leaves an orphan. Returns the REDACTED created row (no key, no url).
 */
export async function createMerchantDocument(
  prisma: PrismaClient,
  input: CreateMerchantDocumentInput,
  ctx: AuditCtx,
) {
  // Write the object first so we have a key for the row. putObject HARD-validates
  // content-type + size against the actual bytes (and asserts storage is enabled).
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
        actorType: 'ADMIN',
        reason: input.reason,
        // documentId + documentType only - the raw R2 key is NOT recorded.
        after: { documentId: created.id, documentType: created.documentType },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return created
    })
  } catch (err) {
    // The object was written but the row failed: best-effort cleanup so we don't
    // leave an orphan. A cleanup failure must not mask the original error.
    await deleteObject(key).catch((cleanupErr) => {
      console.warn(
        `[b4-documents] orphan cleanup failed for key after a failed row create (merchant ${input.merchantId}):`,
        cleanupErr,
      )
    })
    throw err
  }
}

export interface DeleteMerchantDocumentInput {
  merchantId: string
  documentId: string
  adminId: string
  reason: string
}

/**
 * Delete a merchant document on the merchant's behalf. The row delete + an
 * actor-attributed audit commit atomically; AFTER the commit the R2 object is
 * best-effort deleted (D5: an object-delete failure is logged and swallowed and
 * must NOT fail the already-committed row delete). The document is scoped to the
 * merchant (a wrong-merchant id is a 404, not a cross-merchant delete).
 */
export async function deleteMerchantDocument(
  prisma: PrismaClient,
  input: DeleteMerchantDocumentInput,
  ctx: AuditCtx,
): Promise<{ ok: true }> {
  const doc = await prisma.merchantDocument.findFirst({
    where: { id: input.documentId, merchantId: input.merchantId },
    select: { id: true, documentType: true, fileUrl: true },
  })
  if (!doc) throw new AppError('DOCUMENT_NOT_FOUND')

  await prisma.$transaction(async (tx) => {
    await tx.merchantDocument.delete({ where: { id: doc.id } })
    await writeAuditLogTx(tx, {
      entityId: input.merchantId,
      entityType: 'merchant',
      event: 'DOCUMENT_DELETED',
      actorId: input.adminId,
      actorType: 'ADMIN',
      reason: input.reason,
      before: { documentId: doc.id, documentType: doc.documentType },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  })

  // Best-effort object delete after the row commit (D5).
  await deleteObject(doc.fileUrl).catch((err) => {
    console.warn(
      `[b4-documents] best-effort object delete failed for document ${doc.id} (row already deleted):`,
      err,
    )
  })

  return { ok: true }
}
