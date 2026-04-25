import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema, passwordSchema, deviceSchema } from '../../shared/schemas'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
import { routeRateLimit } from '../../plugins/rate-limit'
import {
  loginMerchant, verifyMerchantOtp, refreshMerchantToken,
  logoutMerchant, forgotPasswordMerchant, resetPasswordMerchant,
} from './service'

export async function merchantAuthRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/auth'

  app.post(`${prefix}/login`, {
    config: { rateLimit: routeRateLimit('login') },
  }, async (req, reply) => {
    const body = z.object({
      email:    emailSchema,
      password: z.string(),
      ...deviceSchema.shape,
    }).parse(req.body)

    const result = await loginMerchant(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/otp/verify`, async (req, reply) => {
    const body = z.object({
      sessionChallenge: z.string(),
      code: z.string().length(6),
    }).parse(req.body)

    const result = await verifyMerchantOtp(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/refresh`, async (req, reply) => {
    const body = z.object({ refreshToken: z.string(), sessionId: z.string(), entityId: z.string() }).parse(req.body)
    const result = await refreshMerchantToken(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/logout`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    await logoutMerchant(app.prisma, app.redis, {
      entityId: req.user.sub, sessionId: req.user.sessionId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Logged out.' })
  })

  app.post(`${prefix}/forgot-password`, {
    config: { rateLimit: routeRateLimit('forgotPassword') },
  }, async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body)
    await forgotPasswordMerchant(app.prisma, app.redis, email)
    return reply.send({ message: 'If that email is registered, a reset link has been sent.' })
  })

  app.post(`${prefix}/reset-password`, async (req, reply) => {
    const body = z.object({ token: z.string(), newPassword: passwordSchema }).parse(req.body)
    await resetPasswordMerchant(app.prisma, app.redis, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Password updated. Please log in again.' })
  })

  // Soft-deactivate merchant (self-service)
  app.post(`${prefix}/deactivate`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const admin = await app.prisma.merchantAdmin.findUnique({ where: { id: req.user.sub } })
    if (!admin) throw new AppError('INVALID_CREDENTIALS')

    await app.prisma.merchant.update({
      where: { id: (admin as any).merchantId },
      data:  { status: 'INACTIVE' },
    })

    writeAuditLog(app.prisma, {
      entityId: req.user.sub, entityType: 'merchant', event: 'MERCHANT_DEACTIVATED',
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Merchant account deactivated.' })
  })

  // Reactivate merchant (self-service)
  app.post(`${prefix}/reactivate`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const admin = await app.prisma.merchantAdmin.findUnique({
      where: { id: req.user.sub }, include: { merchant: true },
    })
    if (!admin) throw new AppError('INVALID_CREDENTIALS')

    const merchant = (admin as any).merchant
    if (merchant.status !== 'INACTIVE') {
      return reply.send({ message: 'Merchant account is already active.' })
    }

    await app.prisma.merchant.update({
      where: { id: (admin as any).merchantId },
      data:  { status: 'ACTIVE' },
    })

    writeAuditLog(app.prisma, {
      entityId: req.user.sub, entityType: 'merchant', event: 'MERCHANT_REACTIVATED',
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Merchant account reactivated.' })
  })
}
