import type Redis from 'ioredis'
import type { PrismaClient } from '../../../generated/prisma/client'
import { RedisKey } from './redis-keys'
import { hashRefreshToken } from './tokens'

const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60 // 90 days

export interface StoreRefreshTokenParams {
  role: string
  entityId: string
  sessionId: string
  tokenHash: string
  deviceId: string
  deviceType: string
  deviceName?: string
}

export async function storeRefreshToken(
  redis: Redis,
  params: StoreRefreshTokenParams
): Promise<void> {
  const key = RedisKey.refreshToken(params.role, params.entityId, params.sessionId)
  const value = JSON.stringify({
    tokenHash:  params.tokenHash,
    deviceId:   params.deviceId,
    deviceType: params.deviceType,
    deviceName: params.deviceName,
    createdAt:  new Date().toISOString(),
  })
  await redis.set(key, value, 'EX', REFRESH_TOKEN_TTL_SECONDS)
}

export async function revokeRefreshToken(
  redis: Redis,
  params: { role: string; entityId: string; sessionId: string }
): Promise<void> {
  const key = RedisKey.refreshToken(params.role, params.entityId, params.sessionId)
  await redis.del(key)
}

export async function revokeAllSessionsForEntity(
  redis: Redis,
  params: { role: string; entityId: string }
): Promise<void> {
  const pattern = `refresh:${params.role}:${params.entityId}:*`
  const keys = await redis.keys(pattern)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}

export async function getActiveMobileSessionId(
  redis: Redis,
  role: string,
  entityId: string
): Promise<string | null> {
  return redis.get(RedisKey.activeMobileSession(role, entityId))
}

export async function setActiveMobileSession(
  redis: Redis,
  role: string,
  entityId: string,
  sessionId: string
): Promise<void> {
  await redis.set(
    RedisKey.activeMobileSession(role, entityId),
    sessionId,
    'EX',
    REFRESH_TOKEN_TTL_SECONDS
  )
}

export async function clearActiveMobileSession(
  redis: Redis,
  role: string,
  entityId: string
): Promise<void> {
  await redis.del(RedisKey.activeMobileSession(role, entityId))
}

export async function writeUserSession(
  prisma: PrismaClient,
  params: {
    entityId: string
    entityType: string
    sessionId: string
    deviceId: string
    deviceType: string
    deviceName?: string
    ipAddress: string
    userAgent: string
  }
): Promise<void> {
  await prisma.userSession.create({ data: params })
}

export async function revokeUserSessionRecord(
  prisma: PrismaClient,
  params: { sessionId: string; reason: string }
): Promise<void> {
  await prisma.userSession.updateMany({
    where: { sessionId: params.sessionId, revokedAt: null },
    data:  { revokedAt: new Date(), revokedReason: params.reason },
  })
}

export async function revokeAllUserSessionRecords(
  prisma: PrismaClient,
  params: { entityId: string; entityType: string; reason: string }
): Promise<void> {
  await prisma.userSession.updateMany({
    where: { entityId: params.entityId, entityType: params.entityType, revokedAt: null },
    data:  { revokedAt: new Date(), revokedReason: params.reason },
  })
}

export function validateRefreshToken(stored: string, presented: string): boolean {
  const parsed = JSON.parse(stored) as { tokenHash: string }
  return parsed.tokenHash === hashRefreshToken(presented)
}
