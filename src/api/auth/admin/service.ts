import crypto from 'crypto'
import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { verifyPassword } from '../../shared/password'
import { generateRefreshToken, hashRefreshToken, generateSessionId, generateSecureToken } from '../../shared/tokens'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import { consumePwdResetAttempt } from '../../shared/pwdResetLimiter'
import {
  storeRefreshToken, revokeRefreshToken,
  writeUserSession, validateRefreshToken,
  revokeAllSessionsForEntity, revokeAllUserSessionRecords,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'

const OTP_CHALLENGE_TTL = 600
const ACCESS_TOKEN_TTL  = '15m'

// SEC F1: the admin OTP dev bypass is allowed ONLY in these explicit dev-like
// envs. An allowlist (not `NODE_ENV !== 'production'`) so that an unset / typo'd /
// `staging` NODE_ENV fails CLOSED — appropriate for an auth path. Real Twilio
// Verify is not wired yet (Phase 3); until then production has NO valid code.
const ADMIN_OTP_DEV_BYPASS_ENVS = new Set(['development', 'test'])
const ADMIN_DEV_OTP_BYPASS_CODE = '000000'

// M0: per-challenge wrong-code ceiling. On the Nth wrong attempt the challenge is
// destroyed (the admin must restart login → a fresh code), bounding brute force
// to N guesses per live challenge regardless of the edge rate-limit.
const ADMIN_OTP_MAX_ATTEMPTS = 5

export async function loginAdmin(
  prisma: PrismaClient,
  redis: Redis,
  data: { email: string; password: string; deviceId: string; deviceType: string; ipAddress: string; userAgent: string }
): Promise<{ status: string; sessionChallenge: string }> {
  const admin = await prisma.adminUser.findUnique({ where: { email: data.email } })

  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  const valid = await verifyPassword(data.password, admin.passwordHash)
  if (!valid) {
    writeAuditLog(prisma, { entityId: admin.id, entityType: 'admin', event: 'AUTH_LOGIN_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('INVALID_CREDENTIALS')
  }

  if (!admin.isActive) throw new AppError('ACCOUNT_SUSPENDED')

  const challenge = generateSecureToken(16)

  // M0: generate a real 6-digit code, store only its challenge-bound HMAC (never
  // the code itself, even in Redis), and email it via the outbox. The HMAC is
  // keyed by ENCRYPTION_KEY and bound to THIS challenge so a code is meaningless
  // against any other challenge. `attempts` caps brute force in verifyAdminOtp.
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  const codeHmac = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY as string)
    .update(challenge + ':' + code)
    .digest('hex')

  await redis.set(
    RedisKey.otpChallenge('admin', challenge),
    JSON.stringify({ adminId: admin.id, deviceId: data.deviceId, deviceType: data.deviceType, codeHmac, attempts: 0 }),
    'EX', OTP_CHALLENGE_TTL
  )

  // Deliver the code through the outbox (dark by default). Best-effort: a delivery
  // failure must never change the response (no enumeration). The code is NEVER
  // logged or returned — only the session challenge goes back to the client.
  try {
    const { notify } = await import('../../shared/notify')
    const { adminOtpEmail } = await import('../../shared/emailTemplates')
    await notify(prisma, redis, {
      to: admin.email,
      recipientType: 'ADMIN',
      recipientId: admin.id,
      userId: null,
      type: 'admin_otp',
      email: adminOtpEmail(code),
      ip: data.ipAddress ?? null,
    })
  } catch {
    // swallow — never reveal a delivery failure
  }

  return { status: 'OTP_REQUIRED', sessionChallenge: challenge }
}

export async function verifyAdminOtp(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { sessionChallenge: string; code: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string; admin: object }> {
  const key = RedisKey.otpChallenge('admin', data.sessionChallenge)
  const raw = await redis.get(key)
  if (!raw) throw new AppError('ACTION_TOKEN_INVALID')

  const { adminId, deviceId, deviceType, codeHmac, attempts } = JSON.parse(raw) as {
    adminId: string; deviceId: string; deviceType: string; codeHmac?: string; attempts?: number
  }

  // M0: verify the submitted code against the challenge-bound HMAC stored at
  // login. We must NOT delete the challenge on a wrong code — instead increment
  // `attempts` (with KEEPTTL so the 10-minute window is unchanged) and only
  // delete once the per-challenge attempt cap is reached, so an attacker gets a
  // hard ceiling, not unlimited guesses against one live challenge.
  //
  // The `000000` dev bypass still works in dev/test ONLY (allowlist, not
  // `!== production`), so an unset / staging NODE_ENV fails CLOSED.
  const devBypass =
    ADMIN_OTP_DEV_BYPASS_ENVS.has(process.env.NODE_ENV ?? '') &&
    data.code === ADMIN_DEV_OTP_BYPASS_CODE

  let match = devBypass
  if (!match && codeHmac) {
    const submittedHmac = crypto
      .createHmac('sha256', process.env.ENCRYPTION_KEY as string)
      .update(data.sessionChallenge + ':' + data.code)
      .digest('hex')
    match =
      submittedHmac.length === codeHmac.length &&
      crypto.timingSafeEqual(Buffer.from(submittedHmac, 'hex'), Buffer.from(codeHmac, 'hex'))
  }

  if (!match) {
    const next = (attempts ?? 0) + 1
    if (next >= ADMIN_OTP_MAX_ATTEMPTS) {
      await redis.del(key)
    } else {
      await redis.set(
        key,
        JSON.stringify({ adminId, deviceId, deviceType, codeHmac, attempts: next }),
        'KEEPTTL'
      )
    }
    throw new AppError('OTP_INVALID')
  }

  // Match: single-use — consume the challenge before issuing tokens.
  await redis.del(key)

  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  const sessionId  = generateSessionId()
  const rawRefresh = generateRefreshToken()
  const tokenHash  = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'admin', entityId: admin.id, sessionId,
    tokenHash, deviceId, deviceType,
  })

  await writeUserSession(prisma, {
    entityId: admin.id, entityType: 'admin', sessionId,
    deviceId, deviceType, ipAddress: data.ipAddress, userAgent: data.userAgent,
  })

  await redis.set(
    RedisKey.authAdmin(admin.id),
    JSON.stringify({ adminRole: admin.role }),
    'EX', 3600
  )

  const accessToken = app.jwt.admin.sign(
    { sub: admin.id, role: 'admin', adminRole: admin.role, sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  writeAuditLog(prisma, { entityId: admin.id, entityType: 'admin', event: 'AUTH_LOGIN_SUCCESS', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId })

  return {
    accessToken,
    refreshToken: rawRefresh,
    admin: { id: admin.id, email: admin.email, adminRole: admin.role },
  }
}

export async function refreshAdminToken(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { refreshToken: string; sessionId: string; entityId: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const key    = RedisKey.refreshToken('admin', data.entityId, data.sessionId)
  const stored = await redis.get(key)

  if (!stored || !validateRefreshToken(stored, data.refreshToken)) {
    writeAuditLog(prisma, { entityId: data.entityId, entityType: 'admin', event: 'AUTH_REFRESH_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('REFRESH_TOKEN_INVALID')
  }

  const parsed = JSON.parse(stored)
  await redis.del(key)
  const newRefresh = generateRefreshToken()

  await storeRefreshToken(redis, {
    role: 'admin', entityId: data.entityId, sessionId: data.sessionId,
    tokenHash: hashRefreshToken(newRefresh), deviceId: parsed.deviceId, deviceType: parsed.deviceType,
  })

  await prisma.userSession.updateMany({
    where: { sessionId: data.sessionId }, data: { lastActiveAt: new Date() },
  })

  const admin = await prisma.adminUser.findUnique({ where: { id: data.entityId } })

  const accessToken = app.jwt.admin.sign(
    { sub: data.entityId, role: 'admin', adminRole: admin?.role, sessionId: data.sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  return { accessToken, refreshToken: newRefresh }
}

export async function logoutAdmin(
  prisma: PrismaClient,
  redis: Redis,
  data: { entityId: string; sessionId: string; ipAddress: string; userAgent: string }
): Promise<void> {
  await revokeRefreshToken(redis, { role: 'admin', entityId: data.entityId, sessionId: data.sessionId })
  await redis.del(RedisKey.authAdmin(data.entityId))
  writeAuditLog(prisma, { entityId: data.entityId, entityType: 'admin', event: 'AUTH_LOGOUT', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId })
}

export async function forgotPasswordAdmin(
  prisma: PrismaClient,
  redis: Redis,
  email: string,
  ip?: string | null
): Promise<void> {
  // SEC-H4 + §SEC.1: rate-limit BEFORE the lookup and for EVERY request, so
  // existing and non-existing emails are treated identically (no enumeration).
  // One ATOMIC check-and-count (victim = per-email caps, abuser = per-IP cap).
  await consumePwdResetAttempt(redis, { email, ip })

  const admin = await prisma.adminUser.findUnique({ where: { email } })
  if (!admin) return

  const token = generateSecureToken(32)
  await redis.set(RedisKey.passwordReset('admin', token), admin.id, 'EX', 3600)

  // PR-0.4: deliver the reset link through the outbox (dark by default). Token
  // never logged (SEC-H1). recipientType 'ADMIN' / userId null — an AdminUser is
  // not a User. Best-effort so a delivery failure can't change the return.
  try {
    const { notify } = await import('../../shared/notify')
    const { passwordResetEmail, buildPasswordResetLink } = await import('../../shared/emailTemplates')
    await notify(prisma, redis, {
      to: email,
      recipientType: 'ADMIN',
      recipientId: admin.id,
      userId: null,
      type: 'password_reset',
      email: passwordResetEmail(buildPasswordResetLink('admin', token)),
      ip: ip ?? null,
    })
  } catch {
    // swallow — never reveal a delivery failure (no enumeration)
  }
}

export async function resetPasswordAdmin(
  prisma: PrismaClient,
  redis: Redis,
  data: { token: string; newPassword: string; ipAddress: string; userAgent: string }
): Promise<void> {
  const { validatePasswordPolicy, hashPassword } = await import('../../shared/password')
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const key     = RedisKey.passwordReset('admin', data.token)
  const adminId = await redis.get(key)
  if (!adminId) throw new AppError('RESET_TOKEN_EXPIRED')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.adminUser.update({ where: { id: adminId }, data: { passwordHash } })
  await redis.del(key)

  await revokeAllSessionsForEntity(redis, { role: 'admin', entityId: adminId })
  await revokeAllUserSessionRecords(prisma, { entityId: adminId, entityType: 'admin', reason: 'PASSWORD_RESET' })
  await redis.del(RedisKey.authAdmin(adminId))

  writeAuditLog(prisma, { entityId: adminId, entityType: 'admin', event: 'AUTH_PASSWORD_RESET', ipAddress: data.ipAddress, userAgent: data.userAgent })
}
