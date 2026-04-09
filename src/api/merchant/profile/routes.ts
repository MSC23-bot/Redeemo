import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import {
  getMerchantProfile, updateMerchantProfile,
  createMerchantEditRequest, listMerchantEditRequests, withdrawMerchantEditRequest,
} from './service'

export async function profileRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/profile'

  app.get(prefix, async (req: FastifyRequest, reply) => {
    const profile = await getMerchantProfile(app.prisma, req.user.sub)
    return reply.send(profile)
  })

  app.patch(prefix, async (req: FastifyRequest, reply) => {
    // Accept any object — service validates which fields are permitted and throws NO_SENSITIVE_FIELDS
    // if sensitive fields are included. Only DIRECT_FIELDS are written to the DB.
    const body = z.record(z.string(), z.unknown()).parse(req.body)
    const result = await updateMerchantProfile(app.prisma, req.user.sub, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/edit-request`, async (req: FastifyRequest, reply) => {
    // Accept any object — service validates sensitive fields and throws NO_SENSITIVE_FIELDS
    const body = z.record(z.string(), z.unknown()).parse(req.body)
    const result = await createMerchantEditRequest(app.prisma, req.user.sub, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(result)
  })

  app.get(`${prefix}/edit-requests`, async (req: FastifyRequest, reply) => {
    const list = await listMerchantEditRequests(app.prisma, req.user.sub)
    return reply.send(list)
  })

  app.delete(`${prefix}/edit-requests/:id`, async (req: FastifyRequest, reply) => {
    // Use z.string() (not uuid) — internal IDs may use non-UUID formats in test mocks; DB enforces format
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const result = await withdrawMerchantEditRequest(app.prisma, req.user.sub, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
