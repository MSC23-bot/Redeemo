import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema, passwordSchema, deviceSchema } from '../../shared/schemas'
import { loginAdmin, verifyAdminOtp, refreshAdminToken, logoutAdmin, forgotPasswordAdmin, resetPasswordAdmin } from './service'
import { routeRateLimit } from '../../plugins/rate-limit'

export async function adminAuthRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/auth'

  app.post(`${prefix}/login`, {
    config: { rateLimit: routeRateLimit('login') },
  }, async (req, reply) => {
    const body = z.object({ email: emailSchema, password: z.string(), ...deviceSchema.shape }).parse(req.body)
    const result = await loginAdmin(app.prisma, app.redis, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/otp/verify`, async (req, reply) => {
    const body = z.object({ sessionChallenge: z.string(), code: z.string().length(6) }).parse(req.body)
    const result = await verifyAdminOtp(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/refresh`, async (req, reply) => {
    const body = z.object({ refreshToken: z.string(), sessionId: z.string(), entityId: z.string() }).parse(req.body)
    const result = await refreshAdminToken(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/logout`, { preHandler: [app.authenticateAdmin] }, async (req: any, reply) => {
    await logoutAdmin(app.prisma, app.redis, {
      entityId: req.user.sub, sessionId: req.user.sessionId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Logged out.' })
  })

  app.post(`${prefix}/forgot-password`, {
    config: { rateLimit: routeRateLimit('forgotPassword') },
  }, async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body)
    await forgotPasswordAdmin(app.prisma, app.redis, email)
    return reply.send({ message: 'If that email is registered, a reset link has been sent.' })
  })

  app.post(`${prefix}/reset-password`, async (req, reply) => {
    const body = z.object({ token: z.string(), newPassword: passwordSchema }).parse(req.body)
    await resetPasswordAdmin(app.prisma, app.redis, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Password updated. Please log in again.' })
  })
}
