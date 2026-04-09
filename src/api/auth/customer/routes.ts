import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema, passwordSchema, phoneSchema, deviceSchema, otpCodeSchema } from '../../shared/schemas'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
import {
  registerCustomer, verifyEmail, sendPhoneVerification, confirmPhoneVerification,
  loginCustomer, refreshCustomerToken, logoutCustomer,
  forgotPasswordCustomer, resetPasswordCustomer,
} from './service'

export async function customerAuthRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/customer/auth'

  // Register
  app.post(`${prefix}/register`, async (req, reply) => {
    const body = z.object({
      email:             emailSchema,
      password:          passwordSchema,
      firstName:         z.string().min(1).max(50),
      lastName:          z.string().min(1).max(50),
      marketingConsent:  z.boolean().default(false),
    }).parse(req.body)

    const result = await registerCustomer(app.prisma, app.redis, body)
    return reply.send(result)
  })

  // Verify email
  app.get(`${prefix}/verify-email`, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.query)
    const result = await verifyEmail(app.prisma, app.redis, token)
    return reply.send(result)
  })

  // Send phone OTP
  app.post(`${prefix}/verify-phone/send`, async (req, reply) => {
    const body = z.object({ phoneNumber: phoneSchema, userId: z.string() }).parse(req.body)
    const result = await sendPhoneVerification(app.prisma, app.redis, body.userId, body.phoneNumber)
    return reply.send(result)
  })

  // Confirm phone OTP
  app.post(`${prefix}/verify-phone/confirm`, async (req, reply) => {
    const body = z.object({ userId: z.string(), code: otpCodeSchema }).parse(req.body)
    const result = await confirmPhoneVerification(app.prisma, app.redis, body.userId, body.code)
    return reply.send(result)
  })

  // Login
  app.post(`${prefix}/login`, {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = z.object({
      email:    emailSchema,
      password: z.string(),
      ...deviceSchema.shape,
    }).parse(req.body)

    const result = await loginCustomer(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Refresh token
  app.post(`${prefix}/refresh`, async (req, reply) => {
    const body = z.object({
      refreshToken: z.string(),
      sessionId:    z.string(),
      entityId:     z.string(),
    }).parse(req.body)

    const result = await refreshCustomerToken(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Logout
  app.post(`${prefix}/logout`, {
    preHandler: [app.authenticateCustomer],
  }, async (req: any, reply) => {
    await logoutCustomer(app.prisma, app.redis, {
      entityId:  req.user.sub,
      sessionId: req.user.sessionId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Logged out.' })
  })

  // Forgot password
  app.post(`${prefix}/forgot-password`, {
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body)
    await forgotPasswordCustomer(app.prisma, app.redis, email)
    return reply.send({ message: 'If that email is registered, a reset link has been sent.' })
  })

  // Reset password
  app.post(`${prefix}/reset-password`, async (req, reply) => {
    const body = z.object({ token: z.string(), newPassword: passwordSchema }).parse(req.body)
    await resetPasswordCustomer(app.prisma, app.redis, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Password updated. Please log in again.' })
  })

  // SSO — Google (stub)
  app.post(`${prefix}/sso/google`, async (_req, reply) => {
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Google SSO coming in Phase 3.', statusCode: 501 } })
  })

  // SSO — Apple (stub)
  app.post(`${prefix}/sso/apple`, async (_req, reply) => {
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Apple SSO coming in Phase 3.', statusCode: 501 } })
  })

  // Resend verification email
  app.post(`${prefix}/resend-verification-email`, async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body)
    const user = await app.prisma.user.findUnique({ where: { email } })
    if (user && !user.emailVerified) {
      const { generateSecureToken } = await import('../../shared/tokens')
      const { RedisKey } = await import('../../shared/redis-keys')
      const token = generateSecureToken(32)
      await app.redis.set(RedisKey.emailVerify(token), user.id, 'EX', 86400)
      console.info(`[dev] Resend email verify token for ${user.email}: ${token}`)
    }
    return reply.send({ message: 'If your email is unverified, a new link has been sent.' })
  })

  // Request OTP for sensitive account action
  app.post(`${prefix}/otp/send`, { preHandler: [app.authenticateCustomer] }, async (req: any, reply) => {
    const { action } = z.object({ action: z.enum(['EMAIL_CHANGE', 'PHONE_CHANGE', 'ACCOUNT_DELETION']) }).parse(req.body)
    const user = await app.prisma.user.findUnique({ where: { id: req.user.sub } })
    if (!user?.phone) return reply.status(400).send({ error: { code: 'PHONE_NOT_VERIFIED', message: 'No verified phone on file.', statusCode: 400 } })

    const { sendOtp, checkOtpRateLimit, recordOtpSend } = await import('../../shared/otp')
    const { RedisKey } = await import('../../shared/redis-keys')
    const allowed = await checkOtpRateLimit(app.redis, user.phone)
    if (!allowed) throw new AppError('OTP_MAX_ATTEMPTS')
    await sendOtp(user.phone)
    await recordOtpSend(app.redis, user.phone)
    await app.redis.set(RedisKey.otp('customer', req.user.sub), action, 'EX', 600)
    return reply.send({ message: 'Code sent to your verified phone number.' })
  })

  // Verify OTP for sensitive account action — returns actionToken
  app.post(`${prefix}/otp/verify`, { preHandler: [app.authenticateCustomer] }, async (req: any, reply) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body)
    const { verifyOtp } = await import('../../shared/otp')
    const { RedisKey } = await import('../../shared/redis-keys')
    const { generateSecureToken } = await import('../../shared/tokens')
    const user = await app.prisma.user.findUnique({ where: { id: req.user.sub } })
    if (!user?.phone) throw new AppError('PHONE_NOT_VERIFIED')

    const action = await app.redis.get(RedisKey.otp('customer', req.user.sub))
    const result = await verifyOtp(app.redis, user.phone, code, req.user.sub, 'customer')
    if (result.locked) throw new AppError('OTP_MAX_ATTEMPTS')
    if (!result.success) throw new AppError('OTP_INVALID')

    const actionToken = generateSecureToken(16)
    await app.redis.set(RedisKey.otpAction(req.user.sub, action ?? 'unknown'), actionToken, 'EX', 300)
    await app.redis.del(RedisKey.otp('customer', req.user.sub))

    return reply.send({ verified: true, actionToken, action })
  })

  // Account deletion
  app.post(`${prefix}/delete-account`, { preHandler: [app.authenticateCustomer] }, async (req: any, reply) => {
    const { actionToken } = z.object({ actionToken: z.string() }).parse(req.body)
    const { RedisKey } = await import('../../shared/redis-keys')
    const storedToken = await app.redis.get(RedisKey.otpAction(req.user.sub, 'ACCOUNT_DELETION'))
    if (!storedToken || storedToken !== actionToken) throw new AppError('ACTION_TOKEN_INVALID')
    await app.redis.del(RedisKey.otpAction(req.user.sub, 'ACCOUNT_DELETION'))

    const anonymisedEmail = `deleted_${req.user.sub}@deleted.redeemo.com`
    await app.prisma.user.update({
      where: { id: req.user.sub },
      data: {
        email: anonymisedEmail, phone: null, firstName: '[Deleted]', lastName: '[Deleted]',
        passwordHash: null, deletedAt: new Date(), status: 'DELETED',
      },
    })

    const { revokeAllSessionsForEntity, revokeAllUserSessionRecords } = await import('../../shared/session')
    await revokeAllSessionsForEntity(app.redis, { role: 'customer', entityId: req.user.sub })
    await revokeAllUserSessionRecords(app.prisma, { entityId: req.user.sub, entityType: 'customer', reason: 'ACCOUNT_DELETED' })
    await app.redis.del(RedisKey.authCustomer(req.user.sub))

    writeAuditLog(app.prisma, { entityId: req.user.sub, entityType: 'customer', event: 'AUTH_ACCOUNT_DELETED', ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '', sessionId: req.user.sessionId })

    return reply.send({ message: 'Your account has been deleted.' })
  })
}
