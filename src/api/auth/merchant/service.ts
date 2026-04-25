import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { verifyPassword, validatePasswordPolicy, hashPassword } from '../../shared/password'
import { generateRefreshToken, hashRefreshToken, generateSessionId, generateSecureToken } from '../../shared/tokens'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import {
  storeRefreshToken, revokeRefreshToken, revokeAllSessionsForEntity,
  revokeAllUserSessionRecords, writeUserSession, validateRefreshToken,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'

const OTP_CHALLENGE_TTL = 600   // 10 minutes
const PWD_RESET_TTL     = 3600
const ACCESS_TOKEN_TTL  = '15m'

function otpRequired(admin: any, deviceId: string, knownDevices: string[]): boolean {
  if (!admin.otpVerifiedAt) return true                       // first ever login
  if (!knownDevices.includes(deviceId)) return true           // new device
  return false
}

export async function loginMerchant(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { email: string; password: string; deviceId: string; deviceType: string; deviceName?: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken?: string; refreshToken?: string; merchant?: object; status?: string; sessionChallenge?: string }> {
  const admin = await prisma.merchantAdmin.findUnique({
    where:   { email: data.email },
    include: { merchant: true },
  })

  if (!admin || !admin.passwordHash) throw new AppError('INVALID_CREDENTIALS')

  const valid = await verifyPassword(data.password, admin.passwordHash)
  if (!valid) {
    writeAuditLog(prisma, { entityId: admin.id, entityType: 'merchant', event: 'AUTH_LOGIN_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('INVALID_CREDENTIALS')
  }

  // Status checks after password verification
  if ((admin.merchant as any).status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')
  if ((admin.merchant as any).status === 'INACTIVE')  throw new AppError('MERCHANT_DEACTIVATED')
  if (admin.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED')

  // Check known devices (stored as JSON list in Redis)
  const knownRaw = await redis.get(`known-devices:merchant:${admin.id}`)
  const knownDevices: string[] = knownRaw ? JSON.parse(knownRaw) : []

  if (otpRequired(admin, data.deviceId, knownDevices)) {
    const challenge = generateSecureToken(16)
    await redis.set(
      RedisKey.otpChallenge('merchant', challenge),
      JSON.stringify({ adminId: admin.id, deviceId: data.deviceId, deviceType: data.deviceType }),
      'EX', OTP_CHALLENGE_TTL
    )
    // TODO Phase 3: send OTP via Twilio
    console.info(`[dev] OTP challenge created for ${admin.email}: ${challenge}`)
    return { status: 'OTP_REQUIRED', sessionChallenge: challenge }
  }

  return completeMerchantLogin(prisma, redis, app, admin, data, knownDevices)
}

export async function verifyMerchantOtp(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { sessionChallenge: string; code: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string; merchant: object }> {
  const raw = await redis.get(RedisKey.otpChallenge('merchant', data.sessionChallenge))
  if (!raw) throw new AppError('ACTION_TOKEN_INVALID')

  const { adminId, deviceId, deviceType } = JSON.parse(raw) as { adminId: string; deviceId: string; deviceType: string }
  await redis.del(RedisKey.otpChallenge('merchant', data.sessionChallenge))

  const admin = await prisma.merchantAdmin.findUnique({
    where: { id: adminId }, include: { merchant: true },
  })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  // Verify OTP via Twilio
  const { verifyOtp, clearOtpAttempts } = await import('../../shared/otp')
  const phone = (admin as any).phone ?? ''
  const result = await verifyOtp(redis, phone, data.code, admin.id, 'merchant')

  if (result.locked) throw new AppError('OTP_MAX_ATTEMPTS')
  if (!result.success) throw new AppError('OTP_INVALID')

  await clearOtpAttempts(redis, admin.id, 'merchant')

  // Mark OTP verified + add device
  await prisma.merchantAdmin.update({
    where: { id: admin.id },
    data: { otpVerifiedAt: new Date() },
  })

  const knownRaw = await redis.get(`known-devices:merchant:${admin.id}`)
  const knownDevices: string[] = knownRaw ? JSON.parse(knownRaw) : []
  if (!knownDevices.includes(deviceId)) knownDevices.push(deviceId)
  await redis.set(`known-devices:merchant:${admin.id}`, JSON.stringify(knownDevices), 'EX', 7776000)

  return completeMerchantLogin(prisma, redis, app, admin, {
    deviceId, deviceType, ipAddress: data.ipAddress, userAgent: data.userAgent,
  }, knownDevices)
}

async function completeMerchantLogin(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  admin: any,
  data: { deviceId: string; deviceType: string; deviceName?: string; ipAddress: string; userAgent: string },
  _knownDevices: string[]
): Promise<{ accessToken: string; refreshToken: string; merchant: object }> {
  const sessionId  = generateSessionId()
  const rawRefresh = generateRefreshToken()
  const tokenHash  = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'merchant', entityId: admin.id, sessionId,
    tokenHash, deviceId: data.deviceId, deviceType: data.deviceType,
  })

  await writeUserSession(prisma, {
    entityId: admin.id, entityType: 'merchant', sessionId,
    deviceId: data.deviceId, deviceType: data.deviceType,
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })

  await redis.set(
    RedisKey.authMerchant(admin.id),
    JSON.stringify({
      merchantId: admin.merchantId,
      approvalStatus: (admin.merchant as any).status,
      isSuspended: (admin.merchant as any).status === 'SUSPENDED',
    }),
    'EX', 3600
  )

  const accessToken = app.jwt.merchant.sign(
    { sub: admin.id, role: 'merchant', deviceId: data.deviceId, sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  writeAuditLog(prisma, {
    entityId: admin.id, entityType: 'merchant', event: 'AUTH_LOGIN_SUCCESS',
    ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId,
  })

  return {
    accessToken,
    refreshToken: rawRefresh,
    merchant: {
      id: admin.merchantId,
      businessName: (admin.merchant as any).businessName,
      approvalStatus: (admin.merchant as any).status,
    },
  }
}

export async function refreshMerchantToken(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { refreshToken: string; sessionId: string; entityId: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const key    = RedisKey.refreshToken('merchant', data.entityId, data.sessionId)
  const stored = await redis.get(key)

  if (!stored || !validateRefreshToken(stored, data.refreshToken)) {
    writeAuditLog(prisma, { entityId: data.entityId, entityType: 'merchant', event: 'AUTH_REFRESH_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('REFRESH_TOKEN_INVALID')
  }

  const parsed     = JSON.parse(stored)
  await redis.del(key)

  const newRefresh = generateRefreshToken()
  const newHash    = hashRefreshToken(newRefresh)

  await storeRefreshToken(redis, {
    role: 'merchant', entityId: data.entityId, sessionId: data.sessionId,
    tokenHash: newHash, deviceId: parsed.deviceId, deviceType: parsed.deviceType,
  })

  await prisma.userSession.updateMany({
    where: { sessionId: data.sessionId },
    data:  { lastActiveAt: new Date() },
  })

  const accessToken = app.jwt.merchant.sign(
    { sub: data.entityId, role: 'merchant', deviceId: parsed.deviceId, sessionId: data.sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  return { accessToken, refreshToken: newRefresh }
}

export async function logoutMerchant(
  prisma: PrismaClient,
  redis: Redis,
  data: { entityId: string; sessionId: string; ipAddress: string; userAgent: string }
): Promise<void> {
  await revokeRefreshToken(redis, { role: 'merchant', entityId: data.entityId, sessionId: data.sessionId })
  await redis.del(RedisKey.authMerchant(data.entityId))
  writeAuditLog(prisma, { entityId: data.entityId, entityType: 'merchant', event: 'AUTH_LOGOUT', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId })
}

export async function forgotPasswordMerchant(
  prisma: PrismaClient,
  redis: Redis,
  email: string
): Promise<void> {
  const admin = await prisma.merchantAdmin.findUnique({ where: { email } })
  if (!admin) return

  const token = generateSecureToken(32)
  await redis.set(RedisKey.passwordReset('merchant', token), admin.id, 'EX', PWD_RESET_TTL)
  console.info(`[dev] Merchant password reset token for ${admin.email}: ${token}`)
}

export async function resetPasswordMerchant(
  prisma: PrismaClient,
  redis: Redis,
  data: { token: string; newPassword: string; ipAddress: string; userAgent: string }
): Promise<void> {
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const key     = RedisKey.passwordReset('merchant', data.token)
  const adminId = await redis.get(key)
  if (!adminId) throw new AppError('RESET_TOKEN_EXPIRED')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.merchantAdmin.update({ where: { id: adminId }, data: { passwordHash } })
  await redis.del(key)

  await revokeAllSessionsForEntity(redis, { role: 'merchant', entityId: adminId })
  await revokeAllUserSessionRecords(prisma, { entityId: adminId, entityType: 'merchant', reason: 'PASSWORD_RESET' })
  await redis.del(RedisKey.authMerchant(adminId))

  writeAuditLog(prisma, { entityId: adminId, entityType: 'merchant', event: 'AUTH_PASSWORD_RESET', ipAddress: data.ipAddress, userAgent: data.userAgent })
}
