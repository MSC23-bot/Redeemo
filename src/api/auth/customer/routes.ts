import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema, passwordSchema, phoneSchema, deviceSchema, otpCodeSchema } from '../../shared/schemas'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
import { routeRateLimit } from '../../plugins/rate-limit'
import {
  registerCustomer, verifyEmail, sendPhoneVerification, confirmPhoneVerification,
  loginCustomer, refreshCustomerToken, logoutCustomer,
  forgotPasswordCustomer, resetPasswordCustomer,
} from './service'

export async function customerAuthRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/customer/auth'

  // Register — strict per-IP tier (5/hour prod). Security-audit item
  // 2026-07-06 (§customer-register): without this, only the global
  // backstop applied, allowing ~global-max accounts/min/IP (each an
  // INSERT + token issue + queued verification email once EMAIL_ENABLED).
  // Mirrors the merchant register tier; added alongside the 2026-07-09
  // global-backstop raise (100→300/min) so that raise doesn't widen the
  // registration-flood vector. Turnstile (the audit's second half) is a
  // separate product decision for the app-side flow.
  app.post(`${prefix}/register`, {
    config: { rateLimit: routeRateLimit('register') },
  }, async (req, reply) => {
    const body = z.object({
      email:             emailSchema,
      password:          passwordSchema,
      firstName:         z.string().min(1).max(50),
      lastName:          z.string().min(1).max(50),
      phone:             phoneSchema,
      marketingConsent:  z.boolean().default(false),
      ...deviceSchema.shape,
    }).parse(req.body)

    const result = await registerCustomer(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Verify email
  app.get(`${prefix}/verify-email`, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.query)
    const result = await verifyEmail(app.prisma, app.redis, token)
    return reply.send(result)
  })

  // Send phone OTP (authenticated; server derives userId from session, optional phoneNumber override
  // for the "use a different number" flow)
  app.post(`${prefix}/verify-phone/send`, {
    preHandler: [app.authenticateCustomer],
  }, async (req: any, reply) => {
    const body = z.object({ phoneNumber: phoneSchema.optional() }).parse(req.body ?? {})
    const result = await sendPhoneVerification(app.prisma, app.redis, req.user.sub, body.phoneNumber, req.ip)
    return reply.send(result)
  })

  // Confirm phone OTP (authenticated)
  app.post(`${prefix}/verify-phone/confirm`, {
    preHandler: [app.authenticateCustomer],
  }, async (req: any, reply) => {
    const { code } = z.object({ code: otpCodeSchema }).parse(req.body)
    const result = await confirmPhoneVerification(app.prisma, app.redis, req.user.sub, code)
    return reply.send(result)
  })

  // Login
  app.post(`${prefix}/login`, {
    config: { rateLimit: routeRateLimit('login') },
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

  // Refresh token. Rate-limited at 30/min/IP in prod so brute-force
  // enumeration of refresh-token chains can't run at scale; legitimate
  // sessions refresh ~once per 15 minutes per device, so 30/min/IP is
  // generous enough to never false-positive on real users (including
  // shared-IP / NAT scenarios). Locked 2026-05-08, deferred-followups
  // §AC8 / §AD4.
  app.post(`${prefix}/refresh`, {
    config: { rateLimit: routeRateLimit('refresh') },
  }, async (req, reply) => {
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
    config: { rateLimit: routeRateLimit('forgotPassword') },
  }, async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body)
    await forgotPasswordCustomer(app.prisma, app.redis, email, req.ip)
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
      // TODO Phase 6: deliver the verification link via Resend. The token is never
      // logged (SEC-H1). Dev: use prisma/set-auth-state.ts to mark verified.
    }
    return reply.send({ message: 'If your email is unverified, a new link has been sent.' })
  })

  // Request OTP for sensitive account action
  app.post(`${prefix}/otp/send`, { preHandler: [app.authenticateCustomer] }, async (req: any, reply) => {
    const { action } = z.object({ action: z.enum(['EMAIL_CHANGE', 'PHONE_CHANGE', 'ACCOUNT_DELETION']) }).parse(req.body)
    const user = await app.prisma.user.findUnique({ where: { id: req.user.sub } })
    if (!user?.phone) return reply.status(400).send({ error: { code: 'PHONE_NOT_VERIFIED', message: 'No verified phone on file.', statusCode: 400 } })

    // SEC-H3 (Gate-PR-7) + §SEC.1: full toll-fraud controls (country allowlist +
    // per-phone/user/IP hourly+daily + resend cooldown + global cap) as ONE
    // atomic check-and-count before the send.
    const { consumeSmsSend } = await import('../../shared/smsLimiter')
    const { sendOtp } = await import('../../shared/otp')
    const { RedisKey } = await import('../../shared/redis-keys')
    const smsCtx = { phone: user.phone, userId: req.user.sub, ip: req.ip, scope: 'otp' as const }
    await consumeSmsSend(app.redis, smsCtx)
    await sendOtp(user.phone)
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

    const anonymisedEmail = `deleted_${req.user.sub}@deleted.redeemo.co.uk`
    await app.prisma.user.update({
      where: { id: req.user.sub },
      data: {
        email: anonymisedEmail, phone: null, firstName: '[Deleted]', lastName: '[Deleted]',
        passwordHash: null, deletedAt: new Date(), status: 'DELETED',
      },
    })

    // Invite PII rides account erasure; see spec A2.
    const { scrubInvitesForUser } = await import('../../customer/invites/service')
    await scrubInvitesForUser(app.prisma, req.user.sub)

    const { revokeAllSessionsForEntity, revokeAllUserSessionRecords } = await import('../../shared/session')
    await revokeAllSessionsForEntity(app.redis, { role: 'customer', entityId: req.user.sub })
    await revokeAllUserSessionRecords(app.prisma, { entityId: req.user.sub, entityType: 'customer', reason: 'ACCOUNT_DELETED' })
    await app.redis.del(RedisKey.authCustomer(req.user.sub))

    writeAuditLog(app.prisma, { entityId: req.user.sub, entityType: 'customer', event: 'AUTH_ACCOUNT_DELETED', ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '', sessionId: req.user.sessionId })

    return reply.send({ message: 'Your account has been deleted.' })
  })
}
