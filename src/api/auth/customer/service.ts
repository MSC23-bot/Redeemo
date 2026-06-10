import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../../shared/password'
import { generateRefreshToken, hashRefreshToken, generateSessionId, generateSecureToken } from '../../shared/tokens'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import { consumePwdResetAttempt } from '../../shared/pwdResetLimiter'
import { TERMS_VERSION } from '../../shared/legal'
import {
  storeRefreshToken,
  revokeAllSessionsForEntity,
  revokeAllUserSessionRecords,
  writeUserSession,
  getActiveMobileSessionId,
  setActiveMobileSession,
  revokeRefreshToken,
  revokeUserSessionRecord,
  validateRefreshToken,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'

const EMAIL_VERIFY_TTL = 86400       // 24 hours
const PWD_RESET_TTL = 3600           // 1 hour
const ACCESS_TOKEN_TTL = '15m'

export interface LoginContext {
  ipAddress: string
  userAgent: string
  deviceId: string
  deviceType: string
  deviceName?: string
}

type AuthedUserSummary = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  emailVerified: boolean
  phoneVerified: boolean
}

async function issueCustomerTokens(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  user: AuthedUserSummary,
  ctx: LoginContext
): Promise<{ accessToken: string; refreshToken: string; user: AuthedUserSummary; sessionId: string }> {
  // Enforce single mobile session (same rule as login)
  if (ctx.deviceType === 'ios' || ctx.deviceType === 'android') {
    const prevSessionId = await getActiveMobileSessionId(redis, 'customer', user.id)
    if (prevSessionId) {
      await revokeRefreshToken(redis, { role: 'customer', entityId: user.id, sessionId: prevSessionId })
      await revokeUserSessionRecord(prisma, { sessionId: prevSessionId, reason: 'SUPERSEDED_BY_NEW_LOGIN' })
    }
  }

  const sessionId  = generateSessionId()
  const rawRefresh = generateRefreshToken()
  const tokenHash  = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'customer', entityId: user.id, sessionId,
    tokenHash, deviceId: ctx.deviceId, deviceType: ctx.deviceType, deviceName: ctx.deviceName,
  })

  if (ctx.deviceType === 'ios' || ctx.deviceType === 'android') {
    await setActiveMobileSession(redis, 'customer', user.id, sessionId)
  }

  await writeUserSession(prisma, {
    entityId: user.id, entityType: 'customer', sessionId,
    deviceId: ctx.deviceId, deviceType: ctx.deviceType, deviceName: ctx.deviceName,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  })

  await redis.set(
    RedisKey.authCustomer(user.id),
    JSON.stringify({ subscriptionStatus: null, isActive: true }),
    'EX', 3600
  )

  const accessToken = app.jwt.customer.sign(
    {
      sub:        user.id,
      role:       'customer',
      deviceId:   ctx.deviceId,
      deviceType: ctx.deviceType,
      sessionId,
    },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  return { accessToken, refreshToken: rawRefresh, user, sessionId }
}

export async function registerCustomer(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: {
    email: string
    password: string
    firstName: string
    lastName: string
    phone: string
    marketingConsent: boolean
  } & LoginContext
): Promise<{ accessToken: string; refreshToken: string; user: AuthedUserSummary; sessionId: string }> {
  if (!validatePasswordPolicy(data.password)) {
    throw new AppError('PASSWORD_POLICY_VIOLATION')
  }

  const [emailExisting, phoneExisting] = await Promise.all([
    prisma.user.findUnique({ where: { email: data.email } }),
    prisma.user.findUnique({ where: { phone: data.phone } }),
  ])

  // Reject collisions outright. Users with abandoned unverified registrations
  // must continue from their existing record (resend verification email, then
  // sign in) rather than have their row silently destroyed by a colliding
  // registration — that path is a takeover primitive once a verified phone
  // number is leaked.
  if (emailExisting) throw new AppError('EMAIL_ALREADY_EXISTS')
  if (phoneExisting) throw new AppError('PHONE_ALREADY_EXISTS')

  const passwordHash = await hashPassword(data.password)
  const user = await prisma.user.create({
    data: {
      email:              data.email,
      passwordHash,
      firstName:          data.firstName,
      lastName:           data.lastName,
      phone:              data.phone,
      newsletterConsent:  data.marketingConsent,
      marketingConsentAt: data.marketingConsent ? new Date() : null,
      emailVerified:      false,
      phoneVerified:      false,
      status:             'ACTIVE',
      tcConsentVersion:   TERMS_VERSION,
      tcConsentAt:        new Date(),
    },
  })

  const token = generateSecureToken(32)
  await redis.set(RedisKey.emailVerify(token), user.id, 'EX', EMAIL_VERIFY_TTL)
  // TODO Phase 6: deliver the verification link via Resend. The token is never
  // logged (SEC-H1). Dev: use prisma/set-auth-state.ts to mark an account verified.

  const issued = await issueCustomerTokens(prisma, redis, app, {
    id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
    phone: user.phone, emailVerified: user.emailVerified, phoneVerified: user.phoneVerified,
  }, {
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    deviceId: data.deviceId, deviceType: data.deviceType, deviceName: data.deviceName,
  })

  // `sessionId` is REQUIRED on the customer-app's `authResponseSchema`
  // (PR #50, deferred-followups §Y) — the refresh client posts
  // `{ refreshToken, sessionId, entityId }` and reads sessionId from
  // the auth response. Stripping it here would 500 the schema parse
  // on a successful register and break fresh sign-up. Pinned by the
  // backend contract test in `customer.test.ts`.
  return {
    accessToken:  issued.accessToken,
    refreshToken: issued.refreshToken,
    user:         issued.user,
    sessionId:    issued.sessionId,
  }
}

export async function verifyEmail(
  prisma: PrismaClient,
  redis: Redis,
  token: string
): Promise<{ message: string }> {
  const userId = await redis.get(RedisKey.emailVerify(token))
  if (!userId) throw new AppError('VERIFICATION_TOKEN_INVALID')

  await prisma.user.update({
    where: { id: userId },
    data:  { emailVerified: true },
  })
  await redis.del(RedisKey.emailVerify(token))

  return { message: 'Email verified. Please add and verify your phone number.' }
}

export async function sendPhoneVerification(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  phoneOverride?: string,
  ip?: string | null
): Promise<{ message: string; phone: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new AppError('INVALID_CREDENTIALS')

  // Block the pre-verification flow once the user has already verified their phone.
  // Future number-change flows must go through a separate, hardened endpoint (e.g. OTP-gated
  // PHONE_CHANGE action under /otp/send + /otp/verify) — not this one.
  if (user.phoneVerified) throw new AppError('ALREADY_VERIFIED')

  const phone = phoneOverride ?? user.phone
  if (!phone) throw new AppError('PHONE_NOT_VERIFIED')

  // If caller provided an override, make sure no other user owns it
  if (phoneOverride) {
    const existing = await prisma.user.findUnique({ where: { phone: phoneOverride } })
    if (existing && existing.id !== userId) throw new AppError('PHONE_ALREADY_EXISTS')
  }

  // SEC-H3 (Gate-PR-7) + §SEC.1: toll-fraud controls — country allowlist +
  // per-phone/user/IP hourly+daily caps + resend cooldown + global circuit-
  // breaker, as ONE atomic check-and-count before the send (Twilio bills attempts).
  const { consumeSmsSend } = await import('../../shared/smsLimiter')
  const { sendOtp } = await import('../../shared/otp')

  const smsCtx = { phone, userId, ip: ip ?? null, scope: 'otp' as const }
  await consumeSmsSend(redis, smsCtx)
  await sendOtp(phone)

  // Pending-phone Redis key commits the destination; confirm flips user.phone to this value on success
  await redis.set(RedisKey.phoneVerifyPending(userId), phone, 'EX', 600)

  return { message: 'A verification code has been sent to your phone.', phone }
}

export async function confirmPhoneVerification(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  code: string
): Promise<{ message: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new AppError('INVALID_CREDENTIALS')
  if (user.phoneVerified) throw new AppError('ALREADY_VERIFIED')

  const { verifyOtp } = await import('../../shared/otp')

  const pendingPhone = await redis.get(RedisKey.phoneVerifyPending(userId))
  if (!pendingPhone) throw new AppError('OTP_EXPIRED')

  const result = await verifyOtp(redis, pendingPhone, code, userId, 'customer')
  if (result.locked) throw new AppError('OTP_MAX_ATTEMPTS')
  if (!result.success) throw new AppError('OTP_INVALID')

  await prisma.user.update({
    where: { id: userId },
    data:  { phone: pendingPhone, phoneVerified: true },
  })
  await redis.del(RedisKey.phoneVerifyPending(userId))

  return { message: 'Phone verified. Your account is now active.' }
}

export async function loginCustomer(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { email: string; password: string } & LoginContext
): Promise<{ accessToken: string; refreshToken: string; user: AuthedUserSummary; sessionId: string }> {
  const user = await prisma.user.findUnique({ where: { email: data.email } })

  if (!user || !user.passwordHash) {
    throw new AppError('INVALID_CREDENTIALS')
  }

  // Email and phone verification are no longer login-time gates. The app enforces
  // them via onboarding redirects (resolveRedirect). Website only uses soft banners.
  if (user.status === 'INACTIVE')  throw new AppError('ACCOUNT_INACTIVE')
  if (user.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED')
  if (user.status === 'DELETED')   throw new AppError('INVALID_CREDENTIALS')

  const valid = await verifyPassword(data.password, user.passwordHash)
  if (!valid) {
    writeAuditLog(prisma, {
      entityId: user.id, entityType: 'customer', event: 'AUTH_LOGIN_FAILED',
      ipAddress: data.ipAddress, userAgent: data.userAgent,
    })
    throw new AppError('INVALID_CREDENTIALS')
  }

  const issued = await issueCustomerTokens(prisma, redis, app, {
    id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
    phone: user.phone, emailVerified: user.emailVerified, phoneVerified: user.phoneVerified,
  }, {
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    deviceId: data.deviceId, deviceType: data.deviceType, deviceName: data.deviceName,
  })

  writeAuditLog(prisma, {
    entityId: user.id, entityType: 'customer', event: 'AUTH_LOGIN_SUCCESS',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    deviceId: data.deviceId, sessionId: issued.sessionId,
  })

  // `sessionId` is REQUIRED on the customer-app's `authResponseSchema`
  // (PR #50, deferred-followups §Y) — the refresh client posts
  // `{ refreshToken, sessionId, entityId }` and reads sessionId from
  // the auth response. Stripping it here would 500 the schema parse
  // on a successful login and break fresh sign-in. Pinned by the
  // backend contract test in `customer.test.ts`.
  return {
    accessToken:  issued.accessToken,
    refreshToken: issued.refreshToken,
    user:         issued.user,
    sessionId:    issued.sessionId,
  }
}

export async function refreshCustomerToken(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { refreshToken: string; sessionId: string; entityId: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const key = RedisKey.refreshToken('customer', data.entityId, data.sessionId)
  const stored = await redis.get(key)

  if (!stored || !validateRefreshToken(stored, data.refreshToken)) {
    // Distinguish supersession (Device B logged in → A's row was
    // deliberately revoked) from generic invalidation (TTL expiry,
    // logout, security revoke). The UserSession row carries the
    // reason via `revokedReason` so the customer app can show the
    // right copy ("signed in on another device" vs generic "session
    // expired"). Locked product rule: one mobile device per account.
    const session = await prisma.userSession.findFirst({
      where:  { sessionId: data.sessionId, entityId: data.entityId, entityType: 'customer' },
      select: { revokedReason: true },
    })
    const supersededByLogin = session?.revokedReason === 'SUPERSEDED_BY_NEW_LOGIN'

    writeAuditLog(prisma, {
      entityId: data.entityId, entityType: 'customer',
      event: supersededByLogin ? 'AUTH_SESSION_REPLACED' : 'AUTH_REFRESH_FAILED',
      ipAddress: data.ipAddress, userAgent: data.userAgent,
    })
    throw new AppError(supersededByLogin ? 'SESSION_REPLACED' : 'REFRESH_TOKEN_INVALID')
  }

  const parsed = JSON.parse(stored)
  await redis.del(key)

  const newRefresh  = generateRefreshToken()
  const newHash     = hashRefreshToken(newRefresh)

  await storeRefreshToken(redis, {
    role: 'customer', entityId: data.entityId, sessionId: data.sessionId,
    tokenHash: newHash, deviceId: parsed.deviceId, deviceType: parsed.deviceType,
  })

  // Update lastActiveAt
  await prisma.userSession.updateMany({
    where: { sessionId: data.sessionId },
    data:  { lastActiveAt: new Date() },
  })

  // Mint a fresh access token. `deviceType` is now part of the JWT
  // claims (added 2026-05-08 alongside SESSION_REPLACED) so the
  // `authenticateCustomer` preHandler can enforce the active-mobile-
  // session check on ios/android sessions only without an extra DB
  // lookup. Legacy JWTs minted before this PR don't carry deviceType
  // and pre-handler treats their absence as "skip the mobile check"
  // — those tokens age out at the 15-minute access-token TTL.
  const accessToken = app.jwt.customer.sign(
    {
      sub:        data.entityId,
      role:       'customer',
      deviceId:   parsed.deviceId,
      deviceType: parsed.deviceType,
      sessionId:  data.sessionId,
    },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  return { accessToken, refreshToken: newRefresh }
}

export async function logoutCustomer(
  prisma: PrismaClient,
  redis: Redis,
  data: { entityId: string; sessionId: string; ipAddress: string; userAgent: string }
): Promise<void> {
  await revokeRefreshToken(redis, { role: 'customer', entityId: data.entityId, sessionId: data.sessionId })
  await revokeUserSessionRecord(prisma, { sessionId: data.sessionId, reason: 'USER_LOGOUT' })
  await redis.del(RedisKey.authCustomer(data.entityId))

  writeAuditLog(prisma, {
    entityId: data.entityId, entityType: 'customer', event: 'AUTH_LOGOUT',
    ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId,
  })
}

export async function forgotPasswordCustomer(
  prisma: PrismaClient,
  redis: Redis,
  email: string,
  ip?: string | null
): Promise<void> {
  // SEC-H4 + §SEC.1: rate-limit BEFORE the lookup and for EVERY request, so
  // existing and non-existing emails are treated identically (no enumeration).
  // One ATOMIC check-and-count (victim = per-email caps, abuser = per-IP cap).
  await consumePwdResetAttempt(redis, { email, ip })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return // no enumeration — silently return

  const token = generateSecureToken(32)
  await redis.set(RedisKey.passwordReset('customer', token), user.id, 'EX', PWD_RESET_TTL)

  // TODO Phase 6: deliver the reset link via Resend. The token is never logged
  // (SEC-H1). Dev: use prisma/issue-reset-token.ts to obtain a token.
}

export async function resetPasswordCustomer(
  prisma: PrismaClient,
  redis: Redis,
  data: { token: string; newPassword: string; ipAddress: string; userAgent: string }
): Promise<void> {
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const key    = RedisKey.passwordReset('customer', data.token)
  const userId = await redis.get(key)
  if (!userId) throw new AppError('RESET_TOKEN_EXPIRED')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
  await redis.del(key)

  await revokeAllSessionsForEntity(redis, { role: 'customer', entityId: userId })
  await revokeAllUserSessionRecords(prisma, { entityId: userId, entityType: 'customer', reason: 'PASSWORD_RESET' })
  await redis.del(RedisKey.authCustomer(userId))

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer', event: 'AUTH_PASSWORD_RESET',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })
}
