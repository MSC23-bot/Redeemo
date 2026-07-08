import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { AppError } from '../../shared/errors'
import { isStorageEnabled, kindPolicy } from '../../shared/storage'
import { resolveMerchantContext, assertOwner } from '../shared'
import { listMerchantDocuments, createMerchantOwnDocument } from './service'

// B3: Merchant Documents MVP (Option 1) - merchant self-serve upload + view of
// their OWN documents. Mirrors the admin Option B B4 route conventions
// (src/api/admin/merchants/routes.ts) but scoped ALWAYS to the caller's own
// merchant (resolved via resolveMerchantContext from the JWT, never a body/query
// id) and with the D1-D4 owner decisions baked in:
//   D1 roles: view = OWNER + BRANCH_MANAGER (STAFF denied); upload = OWNER only.
//   D2 types: BUSINESS_VERIFICATION_1, BUSINESS_VERIFICATION_2, PRICE_LIST only
//     (AGREEMENT stays admin/contract-flow-only - rejected here).
//   D3: no self-delete in this slice.
//   D4: surfaced in the Business Profile Compliance card (frontend concern only).
const DOCUMENT_TYPES = ['BUSINESS_VERIFICATION_1', 'BUSINESS_VERIFICATION_2', 'PRICE_LIST'] as const

/**
 * D1 view guard: STAFF is denied with INSUFFICIENT_PERMISSIONS independent of the
 * nav (mirrors src/api/merchant/insights/scope.ts's assertInsightsAccess). OWNER
 * and BRANCH_MANAGER pass.
 */
function assertCanViewDocuments(ctx: { role: string }): void {
  if (ctx.role === 'STAFF') throw new AppError('INSUFFICIENT_PERMISSIONS')
}

export async function merchantDocumentRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/documents'

  // Read: list the caller's OWN merchant's documents with short-lived presigned
  // GET URLs. D1: OWNER + BRANCH_MANAGER can view; STAFF denied. The raw R2 key
  // (`fileUrl`) is NEVER returned; `available:false`/`url:null` when storage is
  // dark or a presign fails (mirrors the admin read - list still works dark).
  app.get(prefix, async (req: FastifyRequest, reply) => {
    const ctx = await resolveMerchantContext(app.prisma, req.user.sub)
    assertCanViewDocuments(ctx)
    const result = await listMerchantDocuments(app.prisma, ctx.merchantId)
    return reply.send(result)
  })

  // Upload: server-proxied multipart upload of one of the caller's OWN documents.
  // D1: OWNER only. Fails closed with STORAGE_NOT_ENABLED BEFORE reading any bytes
  // when storage is dark. The API holds the bytes, so content-type + size are
  // HARD-validated server-side (the multipart layer also caps fileSize).
  // `documentType` is restricted to the D2 allow-list (BUSINESS_VERIFICATION_1/2,
  // PRICE_LIST) - AGREEMENT and any unknown value are rejected.
  app.post(prefix, async (req: FastifyRequest, reply) => {
    if (!isStorageEnabled()) throw new AppError('STORAGE_NOT_ENABLED')

    const ctx = await resolveMerchantContext(app.prisma, req.user.sub)
    assertOwner(ctx)

    if (!req.isMultipart()) throw new AppError('FILE_REQUIRED')

    let documentType: string | undefined
    let fileBuffer: Buffer | undefined
    let mimetype: string | undefined
    try {
      for await (const part of (req as any).parts()) {
        if (part.type === 'file') {
          mimetype = part.mimetype
          fileBuffer = await part.toBuffer() // throws if the part exceeds limits.fileSize
        } else if (part.fieldname === 'documentType') {
          documentType = String(part.value)
        }
      }
    } catch (err: any) {
      const code = typeof err?.code === 'string' ? err.code : ''
      if (code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError('FILE_TOO_LARGE')
      // Any OTHER @fastify/multipart parser error (too many files / fields / parts,
      // malformed body) is a client error, not a 500. Multipart error codes are
      // `FST_*` but NOT the Fastify-core `FST_ERR_*` namespace, so this stays scoped
      // to multipart parsing failures and won't swallow an unrelated core error.
      if (code.startsWith('FST_') && !code.startsWith('FST_ERR_')) throw new AppError('INVALID_UPLOAD')
      throw err
    }

    const meta = z.object({ documentType: z.enum(DOCUMENT_TYPES) }).parse({ documentType })

    if (!fileBuffer || fileBuffer.length === 0) throw new AppError('FILE_REQUIRED')
    const policy = kindPolicy('document')
    // Object.hasOwn (not `in`) — `in` walks the prototype chain, so a part
    // with `Content-Type: constructor` (or `__proto__`, `toString`, …) would
    // otherwise pass this check via an inherited Object.prototype key.
    if (!mimetype || !Object.hasOwn(policy.contentTypes, mimetype)) throw new AppError('UNSUPPORTED_FILE_TYPE')
    if (fileBuffer.length > policy.maxBytes) throw new AppError('FILE_TOO_LARGE')

    const result = await createMerchantOwnDocument(
      app.prisma,
      {
        merchantId: ctx.merchantId,
        adminId: ctx.adminId,
        documentType: meta.documentType,
        contentType: mimetype,
        body: fileBuffer,
      },
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' },
    )
    return reply.send(result)
  })
}
