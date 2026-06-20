import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema, passwordSchema, deviceSchema, otpCodeSchema } from '../../shared/schemas'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
import { routeRateLimit } from '../../plugins/rate-limit'
import {
  loginMerchant, verifyMerchantOtp, refreshMerchantToken,
  logoutMerchant, forgotPasswordMerchant, resetPasswordMerchant, claimMerchantAccount,
  registerMerchant, verifyMerchantEmail, resendMerchantVerification,
} from './service'
import { getOwnerMembership } from '../../shared/merchantMembership'

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

  app.post(`${prefix}/otp/verify`, {
    config: { rateLimit: routeRateLimit('otpVerify') },
  }, async (req, reply) => {
    const body = z.object({
      sessionChallenge: z.string(),
      code: otpCodeSchema,
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
    await forgotPasswordMerchant(app.prisma, app.redis, email, req.ip)
    return reply.send({ message: 'If that email is registered, a reset link has been sent.' })
  })

  app.post(`${prefix}/reset-password`, async (req, reply) => {
    const body = z.object({ token: z.string(), newPassword: passwordSchema }).parse(req.body)
    await resetPasswordMerchant(app.prisma, app.redis, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Password updated. Please log in again.' })
  })

  // Draft-owner claim — the owner sets their own password via the emailed token.
  // Public: the single-use token is the credential. Per-IP rate-limit; 32-byte
  // token is the primary defence.
  app.post(`${prefix}/claim`, {
    config: { rateLimit: routeRateLimit('claim') },
  }, async (req, reply) => {
    const body = z.object({ token: z.string().min(1), newPassword: passwordSchema }).parse(req.body)
    await claimMerchantAccount(app.prisma, app.redis, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Password set. You can now log in.' })
  })

  // ── M1 Slice R: self-serve merchant registration ─────────────────────────────
  // PUBLIC. Non-enumerating (a duplicate email returns the same shape as a fresh
  // signup). Cloudflare Turnstile + a strict per-IP register rate-limit guard
  // signup floods. Email is dark (Phase 6); dev reads the verify code from the
  // outbox via prisma/_get-merchant-otp.ts.
  app.post(`${prefix}/register`, {
    config: { rateLimit: routeRateLimit('register') },
  }, async (req, reply) => {
    const body = z.object({
      firstName:         z.string().trim().min(1).max(100),
      lastName:          z.string().trim().min(1).max(100),
      email:             emailSchema,
      mobile:            z.string().trim().max(20).optional(),
      mobileCountryCode: z.string().trim().max(6).optional(),
      password:          passwordSchema,
      businessName:      z.string().trim().min(1).max(200),
      termsAccepted:     z.literal(true),   // platform terms (distinct from the later merchant contract)
      turnstileToken:    z.string(),
      ...deviceSchema.shape,
    }).parse(req.body)

    const result = await registerMerchant(app.prisma, app.redis, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Verify the emailed 6-digit code; on success the owner is auto-logged-in.
  app.post(`${prefix}/register/verify`, {
    config: { rateLimit: routeRateLimit('otpVerify') },
  }, async (req, reply) => {
    const body = z.object({
      sessionChallenge: z.string(),
      code: otpCodeSchema,
    }).parse(req.body)

    const result = await verifyMerchantEmail(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Re-issue the verify code for the same challenge. Generic response (anti-enum).
  app.post(`${prefix}/register/resend`, {
    config: { rateLimit: routeRateLimit('forgotPassword') },
  }, async (req, reply) => {
    const { sessionChallenge } = z.object({ sessionChallenge: z.string() }).parse(req.body)
    await resendMerchantVerification(app.prisma, app.redis, { sessionChallenge, ipAddress: req.ip })
    return reply.send({ message: 'If your account still needs verifying, a new code has been sent.' })
  })

  // Soft-deactivate merchant (self-service)
  app.post(`${prefix}/deactivate`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    // M6b (D-1): resolve the merchant via MerchantMembership (not admin.merchantId).
    const membership = await getOwnerMembership(app.prisma, req.user.sub)
    if (!membership?.merchant) throw new AppError('INVALID_CREDENTIALS')

    // H1/G2: an admin-SUSPENDED merchant must NOT be able to self-deactivate
    // (SUSPENDED -> INACTIVE) and then reactivate out of the suspension. Read the
    // live status and refuse. (Defense-in-depth alongside the session-revocation
    // check in authenticateMerchant, which already rejects a suspended owner's
    // revoked token; this also covers the case where that best-effort revoke failed.)
    if (membership.merchant.status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')

    await app.prisma.merchant.update({
      where: { id: membership.merchantId },
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
    // M6b (D-1): resolve the merchant via MerchantMembership (not admin.merchant).
    const membership = await getOwnerMembership(app.prisma, req.user.sub)
    if (!membership?.merchant) throw new AppError('INVALID_CREDENTIALS')

    // H1/G2: an admin-SUSPENDED merchant must NOT self-reactivate out of the
    // suspension. Checked before the "already active" no-op below (which is for a
    // self-deactivated INACTIVE merchant, the legitimate self-service reactivate).
    if (membership.merchant.status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')

    if (membership.merchant.status !== 'INACTIVE') {
      return reply.send({ message: 'Merchant account is already active.' })
    }

    await app.prisma.merchant.update({
      where: { id: membership.merchantId },
      data:  { status: 'ACTIVE' },
    })

    writeAuditLog(app.prisma, {
      entityId: req.user.sub, entityType: 'merchant', event: 'MERCHANT_REACTIVATED',
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Merchant account reactivated.' })
  })
}
