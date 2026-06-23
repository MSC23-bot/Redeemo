import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { AppError } from '../../shared/errors'
import { isStorageEnabled } from '../../shared/storage'
import { resolveMerchantContext, assertCanManageVouchers, assertOwner } from '../shared'
import { uploadMerchantImage, isImageUploadKind } from './service'

// M2 B5: merchant-facing server-proxied image upload (logo / banner / voucher
// photo). Registered inside the authenticated merchant-management scope, so the
// caller is an authenticated merchant; the merchant is resolved from the JWT
// (`req.user.sub` = merchantAdminId -> membership -> merchantId) and NEVER from
// the request body, so an upload can only ever be scoped to the caller's own
// merchant. Server-proxied (mirrors admin B4): the API holds the bytes; content-
// type + size + dimensions are validated server-side before any object write.
export async function uploadRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/uploads'

  app.post(`${prefix}/:kind`, async (req: FastifyRequest, reply) => {
    const { kind } = z.object({ kind: z.string() }).parse(req.params)
    // Reject an unknown/disallowed image kind early (a bad path, not a server error).
    if (!isImageUploadKind(kind)) throw new AppError('INVALID_UPLOAD')

    // Fail closed BEFORE reading any bytes when storage is dark.
    if (!isStorageEnabled()) throw new AppError('STORAGE_NOT_ENABLED')

    if (!req.isMultipart()) throw new AppError('FILE_REQUIRED')

    // Resolve the caller's merchant from the JWT (never trust a body-supplied id).
    // Staff & Access B5 (§4.3): role-aware resolver + a per-kind guard, BEFORE any
    // bytes are read. A voucher photo needs voucher-management power (OWNER ||
    // canManageVouchers); logo/banner feed OWNER-only business-identity writes, so
    // they require OWNER. The kind is validated by isImageUploadKind above
    // (logo/banner/photo).
    const ctx = await resolveMerchantContext(app.prisma, req.user.sub)
    if (kind === 'photo') {
      assertCanManageVouchers(ctx)
    } else {
      // kind === 'logo' || kind === 'banner'
      assertOwner(ctx)
    }
    const { merchantId } = ctx

    let fileBuffer: Buffer | undefined
    let mimetype: string | undefined
    try {
      for await (const part of (req as any).parts()) {
        if (part.type === 'file') {
          mimetype = part.mimetype
          fileBuffer = await part.toBuffer() // throws if the part exceeds limits.fileSize
        }
        // Any non-file fields are ignored: B5 takes only the file; the kind is in the path.
      }
    } catch (err: any) {
      const code = typeof err?.code === 'string' ? err.code : ''
      if (code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError('IMAGE_TOO_LARGE')
      // Any OTHER @fastify/multipart parser error (too many files / fields / parts,
      // malformed body) is a client error, not a 500. Multipart error codes are
      // `FST_*` but NOT the Fastify-core `FST_ERR_*` namespace, so this stays scoped
      // to multipart parsing failures and won't swallow an unrelated core error.
      if (code.startsWith('FST_') && !code.startsWith('FST_ERR_')) throw new AppError('INVALID_UPLOAD')
      throw err
    }

    if (!fileBuffer || fileBuffer.length === 0 || !mimetype) throw new AppError('FILE_REQUIRED')

    const result = await uploadMerchantImage({
      merchantId,
      kind,
      contentType: mimetype,
      body: fileBuffer,
    })
    return reply.send(result)
  })
}
