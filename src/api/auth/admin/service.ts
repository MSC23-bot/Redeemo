import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { verifyPassword } from '../../shared/password'
import { generateRefreshToken, hashRefreshToken, generateSessionId, generateSecureToken } from '../../shared/tokens'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import {
  storeRefreshToken, revokeRefreshToken,
  writeUserSession, validateRefreshToken,
  revokeAllSessionsForEntity, revokeAllUserSessionRecords,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'

const OTP_CHALLENGE_TTL = 600
const ACCESS_TOKEN_TTL  = '15m'

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
  await redis.set(
    RedisKey.otpChallenge('admin', challenge),
    JSON.stringify({ adminId: admin.id, deviceId: data.deviceId, deviceType: data.deviceType }),
    'EX', OTP_CHALLENGE_TTL
  )

  // TODO Phase 3: send OTP via Twilio to admin's phone
  console.info(`[dev] Admin OTP challenge for ${admin.email}: ${challenge}`)

  return { status: 'OTP_REQUIRED', sessionChallenge: challenge }
}

export async function verifyAdminOtp(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { sessionChallenge: string; code: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string; admin: object }> {
  const raw = await redis.get(RedisKey.otpChallenge('admin', data.sessionChallenge))
  if (!raw) throw new AppError('ACTION_TOKEN_INVALID')

  const { adminId, deviceId, deviceType } = JSON.parse(raw) as { adminId: string; deviceId: string; deviceType: string }
  await redis.del(RedisKey.otpChallenge('admin', data.sessionChallenge))

  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  // TODO Phase 3: verify OTP via Twilio — for now accept any 6-digit code in dev
  if (process.env.NODE_ENV !== 'development' && data.code !== '000000') {
    throw new AppError('OTP_INVALID')
  }

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

  const accessToken = app.adminSign(
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

  const accessToken = app.adminSign(
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
  email: string
): Promise<void> {
  const admin = await prisma.adminUser.findUnique({ where: { email } })
  if (!admin) return

  const token = generateSecureToken(32)
  await redis.set(RedisKey.passwordReset('admin', token), admin.id, 'EX', 3600)
  console.info(`[dev] Admin password reset token for ${admin.email}: ${token}`)
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
