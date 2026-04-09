import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import {
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  createBranchEditRequest,
  createBranchPhotoEditRequest,
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
    const result = await sendBranchPin(app.prisma, req.user.sub, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
