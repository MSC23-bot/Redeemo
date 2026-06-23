import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { AppError } from '../../shared/errors'
import { isStorageEnabled } from '../../shared/storage'
import {
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  createBranchEditRequest,
  createBranchPhotoEditRequest,
  uploadBranchPhotoAsset,
  removeBranchPhoto,
  listBranchEditRequests,
  withdrawBranchEditRequest,
  setOpeningHours,
  setAmenities,
  softDeleteBranch,
  getBranchPin,
  setBranchPin,
  sendBranchPin,
} from './service'

const idParam = z.object({ id: z.string() })
const editIdParam = z.object({ id: z.string(), editId: z.string() })
const photoIdParam = z.object({ id: z.string(), photoId: z.string() })

const createBranchBody = z.object({
  name:         z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().optional(),
  city:         z.string(),
  postcode:     z.string(),
  country:      z.string().optional(),
  latitude:     z.number().optional(),
  longitude:    z.number().optional(),
  phone:        z.string().optional(),
  email:        z.string().optional(),
  websiteUrl:   z.string().optional(),
  logoUrl:      z.string().optional(),
  bannerUrl:    z.string().optional(),
  about:        z.string().optional(),
})

const updateBranchBody = z.object({
  phone:        z.string().optional(),
  email:        z.string().optional(),
  websiteUrl:   z.string().optional(),
  isActive:     z.boolean().optional(),
  isMainBranch: z.boolean().optional(),
}).passthrough() // allow extra keys — service ignores them

const openingHoursBody = z.object({
  hours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime:  z.string().optional(),
    closeTime: z.string().optional(),
    isClosed:  z.boolean(),
  })),
})

const amenitiesBody = z.object({
  amenityIds: z.array(z.string()),
})

const photoEditRequestBody = z.object({
  add:    z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
})

export async function branchRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/branches'

  // GET /api/v1/merchant/branches — list branches
  app.get(prefix, async (req: FastifyRequest, reply) => {
    const branches = await listBranches(app.prisma, req.user.sub)
    return reply.send(branches)
  })

  // POST /api/v1/merchant/branches — create branch
  app.post(prefix, async (req: FastifyRequest, reply) => {
    const body = createBranchBody.parse(req.body)
    const branch = await createBranch(app.prisma, req.user.sub, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(branch)
  })

  // GET /api/v1/merchant/branches/:id — get single branch
  app.get(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const branch = await getBranch(app.prisma, req.user.sub, id)
    return reply.send(branch)
  })

  // PATCH /api/v1/merchant/branches/:id — update non-sensitive fields
  app.patch(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const body = updateBranchBody.parse(req.body)
    const branch = await updateBranch(app.prisma, req.user.sub, id, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(branch)
  })

  // POST /api/v1/merchant/branches/:id/edit-request — create sensitive edit request
  app.post(`${prefix}/:id/edit-request`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const body = z.record(z.string(), z.unknown()).parse(req.body)
    const pendingEdit = await createBranchEditRequest(
      app.prisma, req.user.sub, id, body, false, {
        ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
      }
    )
    return reply.status(201).send(pendingEdit)
  })

  // GET /api/v1/merchant/branches/:id/edit-requests — list edit requests
  app.get(`${prefix}/:id/edit-requests`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const list = await listBranchEditRequests(app.prisma, req.user.sub, id)
    return reply.send(list)
  })

  // DELETE /api/v1/merchant/branches/:id/edit-requests/:editId — withdraw edit request
  app.delete(`${prefix}/:id/edit-requests/:editId`, async (req: FastifyRequest, reply) => {
    const { id, editId } = editIdParam.parse(req.params)
    const result = await withdrawBranchEditRequest(app.prisma, req.user.sub, id, editId, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // POST /api/v1/merchant/branches/:id/hours — set opening hours
  app.post(`${prefix}/:id/hours`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const { hours } = openingHoursBody.parse(req.body)
    const result = await setOpeningHours(app.prisma, req.user.sub, id, hours)
    return reply.send(result)
  })

  // POST /api/v1/merchant/branches/:id/amenities — set amenities (full replace)
  app.post(`${prefix}/:id/amenities`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const { amenityIds } = amenitiesBody.parse(req.body)
    const result = await setAmenities(app.prisma, req.user.sub, id, amenityIds)
    return reply.send(result)
  })

  // POST /api/v1/merchant/branches/:id/photos/edit-request — create photo edit request
  app.post(`${prefix}/:id/photos/edit-request`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const body = photoEditRequestBody.parse(req.body)
    const pendingEdit = await createBranchPhotoEditRequest(
      app.prisma, req.user.sub, id, body, {
        ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
      }
    )
    return reply.status(201).send(pendingEdit)
  })

  // POST /api/v1/merchant/branches/:id/photos/upload — branch-scoped photo-asset
  // upload (Branches PR-3 §6c). Server-proxied multipart, mirroring the merchant
  // /uploads/:kind handler, but gated by BRANCH ASSIGNMENT (resolveMerchantContext
  // + assertBranchAllowed inside uploadBranchPhotoAsset) instead of the voucher
  // assertCanManageVouchers gate. The voucher /uploads/photo path is left UNCHANGED.
  // Returns { url }; the URL then feeds the photo edit-request lane (admin-reviewed).
  app.post(`${prefix}/:id/photos/upload`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)

    // Fail closed BEFORE reading any bytes when storage is dark.
    if (!isStorageEnabled()) throw new AppError('STORAGE_NOT_ENABLED')
    if (!req.isMultipart()) throw new AppError('FILE_REQUIRED')

    let fileBuffer: Buffer | undefined
    let mimetype: string | undefined
    try {
      for await (const part of (req as any).parts()) {
        if (part.type === 'file') {
          mimetype = part.mimetype
          fileBuffer = await part.toBuffer() // throws if the part exceeds limits.fileSize
        }
        // Any non-file fields are ignored: the branch id is in the path.
      }
    } catch (err: any) {
      const code = typeof err?.code === 'string' ? err.code : ''
      if (code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError('IMAGE_TOO_LARGE')
      // Any OTHER @fastify/multipart parser error (too many files / fields / parts,
      // malformed body) is a client error, not a 500. Scoped to multipart codes
      // (FST_* but NOT the Fastify-core FST_ERR_* namespace).
      if (code.startsWith('FST_') && !code.startsWith('FST_ERR_')) throw new AppError('INVALID_UPLOAD')
      throw err
    }

    if (!fileBuffer || fileBuffer.length === 0 || !mimetype) throw new AppError('FILE_REQUIRED')

    const result = await uploadBranchPhotoAsset(app.prisma, req.user.sub, id, {
      contentType: mimetype, body: fileBuffer,
    })
    return reply.send(result)
  })

  // DELETE /api/v1/merchant/branches/:id/photos/:photoId — instant removal of a
  // LIVE (APPROVED) branch photo (Branches PR-3 §6b). OWNER-ONLY in v1 (the service
  // resolves via resolveAdminMerchant). Remove-by-ID, branch-scoped, APPROVED-only.
  app.delete(`${prefix}/:id/photos/:photoId`, async (req: FastifyRequest, reply) => {
    const { id, photoId } = photoIdParam.parse(req.params)
    const result = await removeBranchPhoto(app.prisma, req.user.sub, id, photoId, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // DELETE /api/v1/merchant/branches/:id — soft delete branch
  app.delete(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await softDeleteBranch(app.prisma, req.user.sub, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // GET /api/v1/merchant/branches/:id/pin — get branch redemption PIN (decrypted)
  app.get(`${prefix}/:id/pin`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await getBranchPin(app.prisma, req.user.sub, id)
    return reply.send(result)
  })

  // PUT /api/v1/merchant/branches/:id/pin — set / update branch redemption PIN
  app.put(`${prefix}/:id/pin`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const { pin } = z.object({ pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 numeric digits') }).parse(req.body)
    const result = await setBranchPin(app.prisma, req.user.sub, id, pin, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // POST /api/v1/merchant/branches/:id/pin/send — send PIN to branch staff via SMS / email
  app.post(`${prefix}/:id/pin/send`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await sendBranchPin(app.prisma, app.redis, req.user.sub, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
