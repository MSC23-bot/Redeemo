import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { verifyPassword, validatePasswordPolicy, hashPassword } from '../../shared/password'
import { generateRefreshToken, hashRefreshToken, generateSessionId, generateSecureToken } from '../../shared/tokens'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import {
  storeRefreshToken, revokeRefreshToken,
  writeUserSession, revokeUserSessionRecord,
  getActiveMobileSessionId, setActiveMobileSession,
  validateRefreshToken,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'

const ACCESS_TOKEN_TTL = '15m'
const TEMP_TOKEN_TTL   = 1800 // 30 minutes

export async function loginBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { email: string; password: string; deviceId: string; deviceType: string; deviceName?: string; ipAddress: string; userAgent: string }
): Promise<object> {
  const branchUser = await prisma.branchUser.findUnique({
    where:   { email: data.email },
    include: { branch: { include: { merchant: true } } },
  })

  if (!branchUser) throw new AppError('INVALID_CREDENTIALS')

  const valid = await verifyPassword(data.password, branchUser.passwordHash)
  if (!valid) {
    writeAuditLog(prisma, { entityId: branchUser.id, entityType: 'branch', event: 'AUTH_LOGIN_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('INVALID_CREDENTIALS')
  }

  if (branchUser.status === 'INACTIVE') throw new AppError('BRANCH_USER_DEACTIVATED')
  if ((branchUser.branch as any).merchant.status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')

  if ((branchUser as any).mustChangePassword) {
    const tempToken = generateSecureToken(24)
    await redis.set(RedisKey.branchTempToken(tempToken), branchUser.id, 'EX', TEMP_TOKEN_TTL)
    return { status: 'PASSWORD_CHANGE_REQUIRED', tempToken }
  }

  // Single session enforcement
  const prevSessionId = await getActiveMobileSessionId(redis, 'branch', branchUser.id)
  if (prevSessionId) {
    await revokeRefreshToken(redis, { role: 'branch', entityId: branchUser.id, sessionId: prevSessionId })
    await revokeUserSessionRecord(prisma, { sessionId: prevSessionId, reason: 'SUPERSEDED_BY_NEW_LOGIN' })
  }

  const sessionId  = generateSessionId()
  const rawRefresh = generateRefreshToken()
  const tokenHash  = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'branch', entityId: branchUser.id, sessionId,
    tokenHash, deviceId: data.deviceId, deviceType: data.deviceType,
  })
  await setActiveMobileSession(redis, 'branch', branchUser.id, sessionId)
  await writeUserSession(prisma, {
    entityId: branchUser.id, entityType: 'branch', sessionId,
    deviceId: data.deviceId, deviceType: data.deviceType,
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })

  await redis.set(
    RedisKey.authBranch(branchUser.id),
    JSON.stringify({ merchantId: branchUser.branch.merchantId, branchId: branchUser.branchId, isActive: true }),
    'EX', 3600
  )

  const accessToken = app.branchSign(
    { sub: branchUser.id, role: 'branch', deviceId: data.deviceId, sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  writeAuditLog(prisma, { entityId: branchUser.id, entityType: 'branch', event: 'AUTH_LOGIN_SUCCESS', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId })

  return {
    accessToken,
    refreshToken: rawRefresh,
    branch: { id: branchUser.branchId, name: (branchUser.branch as any).name, merchantId: branchUser.branch.merchantId },
  }
}

export async function changePasswordFirstLogin(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { tempToken: string; newPassword: string; deviceId: string; deviceType: string; ipAddress: string; userAgent: string }
): Promise<object> {
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const branchUserId = await redis.get(RedisKey.branchTempToken(data.tempToken))
  if (!branchUserId) throw new AppError('ACTION_TOKEN_INVALID')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.branchUser.update({
    where: { id: branchUserId },
    data:  { passwordHash, mustChangePassword: false },
  })
  await redis.del(RedisKey.branchTempToken(data.tempToken))

  const sessionId  = generateSessionId()
  const rawRefresh = generateRefreshToken()
  const tokenHash  = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'branch', entityId: branchUserId, sessionId,
    tokenHash, deviceId: data.deviceId, deviceType: data.deviceType,
  })

  const branchUser = await prisma.branchUser.findUnique({
    where: { id: branchUserId }, include: { branch: true },
  })

  const accessToken = app.branchSign(
    { sub: branchUserId, role: 'branch', deviceId: data.deviceId, sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  writeAuditLog(prisma, { entityId: branchUserId, entityType: 'branch', event: 'BRANCH_USER_PASSWORD_SET', ipAddress: data.ipAddress, userAgent: data.userAgent })

  return {
    accessToken,
    refreshToken: rawRefresh,
    branch: { id: (branchUser as any).branchId, name: (branchUser as any).branch.name },
  }
}

export async function changePasswordBranchUser(
  prisma: PrismaClient,
  data: { branchUserId: string; currentPassword: string; newPassword: string; sessionId: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const branchUser = await prisma.branchUser.findUnique({ where: { id: data.branchUserId } })
  if (!branchUser) throw new AppError('INVALID_CREDENTIALS')

  const valid = await verifyPassword(data.currentPassword, branchUser.passwordHash)
  if (!valid) throw new AppError('INVALID_CREDENTIALS')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.branchUser.update({ where: { id: data.branchUserId }, data: { passwordHash } })

  writeAuditLog(prisma, { entityId: data.branchUserId, entityType: 'branch', event: 'BRANCH_USER_PASSWORD_CHANGED', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId })

  return { message: 'Password updated.' }
}

export async function refreshBranchToken(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { refreshToken: string; sessionId: string; entityId: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const key    = RedisKey.refreshToken('branch', data.entityId, data.sessionId)
  const stored = await redis.get(key)

  if (!stored || !validateRefreshToken(stored, data.refreshToken)) {
    writeAuditLog(prisma, { entityId: data.entityId, entityType: 'branch', event: 'AUTH_REFRESH_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('REFRESH_TOKEN_INVALID')
  }

  const parsed = JSON.parse(stored)
  await redis.del(key)

  const newRefresh = generateRefreshToken()
  await storeRefreshToken(redis, {
    role: 'branch', entityId: data.entityId, sessionId: data.sessionId,
    tokenHash: hashRefreshToken(newRefresh), deviceId: parsed.deviceId, deviceType: parsed.deviceType,
  })

  await prisma.userSession.updateMany({
    where: { sessionId: data.sessionId },
    data:  { lastActiveAt: new Date() },
  })

  const accessToken = app.branchSign(
    { sub: data.entityId, role: 'branch', deviceId: parsed.deviceId, sessionId: data.sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  return { accessToken, refreshToken: newRefresh }
}

export async function logoutBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  data: { entityId: string; sessionId: string; ipAddress: string; userAgent: string }
): Promise<void> {
  await revokeRefreshToken(redis, { role: 'branch', entityId: data.entityId, sessionId: data.sessionId })
  await redis.del(RedisKey.authBranch(data.entityId))
  writeAuditLog(prisma, { entityId: data.entityId, entityType: 'branch', event: 'AUTH_LOGOUT', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId })
}
