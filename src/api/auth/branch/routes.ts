import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { passwordSchema, deviceSchema } from '../../shared/schemas'
import {
  loginBranchUser, changePasswordFirstLogin, changePasswordBranchUser,
  refreshBranchToken, logoutBranchUser,
} from './service'

export async function branchAuthRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/branch/auth'

  app.post(`${prefix}/login`, {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = z.object({
      email:    z.string().email(),
      password: z.string(),
      ...deviceSchema.shape,
    }).parse(req.body)

    const result = await loginBranchUser(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/change-password-first-login`, async (req, reply) => {
    const body = z.object({
      tempToken:   z.string(),
      newPassword: passwordSchema,
      ...deviceSchema.shape,
    }).parse(req.body)

    const result = await changePasswordFirstLogin(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/change-password`, { preHandler: [app.authenticateBranch] }, async (req: any, reply) => {
    const body = z.object({ currentPassword: z.string(), newPassword: passwordSchema }).parse(req.body)
    const result = await changePasswordBranchUser(app.prisma, {
      branchUserId: req.user.sub, ...body,
      sessionId: req.user.sessionId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/refresh`, async (req, reply) => {
    const body = z.object({ refreshToken: z.string(), sessionId: z.string(), entityId: z.string() }).parse(req.body)
    const result = await refreshBranchToken(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/logout`, { preHandler: [app.authenticateBranch] }, async (req: any, reply) => {
    await logoutBranchUser(app.prisma, app.redis, {
      entityId: req.user.sub, sessionId: req.user.sessionId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Logged out.' })
  })
}
