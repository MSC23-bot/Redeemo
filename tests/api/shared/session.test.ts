import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Redis from 'ioredis'
import {
  storeRefreshToken,
  revokeRefreshToken,
  revokeAllSessionsForEntity,
} from '../../../src/api/shared/session'

function makeRedis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
  } as unknown as Redis
}

describe('session helpers', () => {
  let redis: Redis

  beforeEach(() => {
    redis = makeRedis()
  })

  it('stores a refresh token in Redis with TTL', async () => {
    await storeRefreshToken(redis, {
      role: 'customer',
      entityId: 'user-1',
      sessionId: 'sess-1',
      tokenHash: 'abc123',
      deviceId: 'dev-1',
      deviceType: 'ios',
    })
    expect(redis.set).toHaveBeenCalledWith(
      'refresh:customer:user-1:sess-1',
      expect.any(String),
      'EX',
      expect.any(Number)
    )
  })

  it('revokes a single refresh token', async () => {
    await revokeRefreshToken(redis, { role: 'customer', entityId: 'user-1', sessionId: 'sess-1' })
    expect(redis.del).toHaveBeenCalledWith('refresh:customer:user-1:sess-1')
  })

  it('revokes all sessions for an entity', async () => {
    const mockRedis = makeRedis()
    ;(mockRedis.keys as ReturnType<typeof vi.fn>).mockResolvedValue([
      'refresh:customer:user-1:sess-1',
      'refresh:customer:user-1:sess-2',
    ])
    await revokeAllSessionsForEntity(mockRedis, { role: 'customer', entityId: 'user-1' })
    expect(mockRedis.del).toHaveBeenCalledWith(
      'refresh:customer:user-1:sess-1',
      'refresh:customer:user-1:sess-2'
    )
  })
})
