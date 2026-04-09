import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema, passwordSchema, pinSchema } from '../../shared/schemas'
import {
  createBranchUser, resetBranchUserPassword, deactivateBranchUser,
  reactivateBranchUser, setBranchPin,
} from './branch-user.service'

export async function branchUserMgmtRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/branches/:branchId'

  app.post(`${prefix}/user`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const body = z.object({
      contactName:    z.string().min(1).max(100),
      jobTitle:       z.string().max(100).optional(),
      contactNumber:  z.string().optional(),
      email:          emailSchema,
      password:       passwordSchema,
    }).parse(req.body)

    const result = await createBranchUser(app.prisma, app.redis, {
      merchantAdminId: req.user.sub,
      branchId,
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/user/reset-password`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const result = await resetBranchUserPassword(app.prisma, app.redis, {
      merchantAdminId: req.user.sub, branchId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.patch(`${prefix}/user/deactivate`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const result = await deactivateBranchUser(app.prisma, app.redis, {
      merchantAdminId: req.user.sub, branchId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.patch(`${prefix}/user/reactivate`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const result = await reactivateBranchUser(app.prisma, app.redis, {
      merchantAdminId: req.user.sub, branchId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.patch(`${prefix}/pin`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const { pin } = z.object({ pin: pinSchema }).parse(req.body)
    const result = await setBranchPin(app.prisma, {
      merchantAdminId: req.user.sub, branchId, pin,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
