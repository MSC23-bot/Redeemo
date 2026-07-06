import type Redis from 'ioredis'
import type { PrismaClient } from '../../../generated/prisma/client'
import { RedisKey } from './redis-keys'
import { hashRefreshToken } from './tokens'

// Exported (additive, no behaviour change) so the merchant-only logout-durability
// code (src/api/auth/merchant/atomicRotate.ts) can size its rotate TTL and its
// pending-revocation tombstone TTL identically to the refresh-token lifetime,
// without duplicating the constant. Every other role's use of this value is
// unchanged.
export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60 // 90 days

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

/**
 * My Account (§BP-ACC): revoke every OTHER live refresh-token session for an
 * entity, deliberately KEEPING the caller's own current session so an
 * authenticated change-password / logout-all-other-devices action does not
 * self-sign-out the tab that performed it. Same key-scan as
 * `revokeAllSessionsForEntity` (`refresh:<role>:<entityId>:*`), just filtered
 * to exclude `keepSessionId`'s key before the DEL. Returns the count revoked
 * so callers can report it back to the client.
 */
export async function revokeOtherSessionsForEntity(
  redis: Redis,
  params: { role: string; entityId: string; keepSessionId: string }
): Promise<number> {
  const pattern = `refresh:${params.role}:${params.entityId}:*`
  const keys = await redis.keys(pattern)
  const keepKey = RedisKey.refreshToken(params.role, params.entityId, params.keepSessionId)
  const toDelete = keys.filter((key) => key !== keepKey)
  if (toDelete.length > 0) {
    await redis.del(...toDelete)
  }
  return toDelete.length
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
  // My Account (§BP-ACC): `exceptSessionId` is additive/optional so every
  // existing caller (full logout / password reset — revoke ALL sessions) is
  // unaffected. When present, it mirrors `revokeOtherSessionsForEntity`'s
  // keep-current semantics on the DB-side UserSession audit trail: every live
  // row for this entity is marked revoked EXCEPT the caller's own current
  // session.
  params: { entityId: string; entityType: string; reason: string; exceptSessionId?: string }
): Promise<void> {
  await prisma.userSession.updateMany({
    where: {
      entityId: params.entityId,
      entityType: params.entityType,
      revokedAt: null,
      ...(params.exceptSessionId ? { sessionId: { not: params.exceptSessionId } } : {}),
    },
    data:  { revokedAt: new Date(), revokedReason: params.reason },
  })
}

export function validateRefreshToken(stored: string, presented: string): boolean {
  const parsed = JSON.parse(stored) as { tokenHash: string }
  return parsed.tokenHash === hashRefreshToken(presented)
}
