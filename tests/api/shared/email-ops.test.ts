import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { TestContext } from 'vitest'
import Redis from 'ioredis'
import {
  isSendPaused,
  setSendPausedAuto,
  clearSendPaused,
  recordGlobalGateTrip,
  recordEmailBounce,
  recordEmailSendCounters,
  getEmailOpsSnapshot,
  utcDateStamp,
} from '../../../src/api/shared/emailOps'
import { RedisKey } from '../../../src/api/shared/redis-keys'
import {
  adminHasEffectiveCapability,
  resolveEffectiveCapabilities,
  isGrantableCapability,
  requireAdminCapability,
} from '../../../src/api/admin/capability'

// §SEC.1 GAP-6 + GAP-7 (plan 2026-07-10 §1.6/§1.7): the auto send-pause breaker
// and the send-volume counters + SUPER_ADMIN ops view.
//   Part A: the emailOps helpers against REAL Redis (own db 9; other suites claim
//     10/11/12/13/14/15). Pins the pause flag lifecycle + audit, the two auto-pause
//     triggers, the counters, and the snapshot shape. Skips honestly without Redis.
//   Part B: the email:ops capability is SUPER_ADMIN-only + non-grantable, and the
//     route gate fails closed (no Redis needed).

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
let redis: Redis | null = null
let available = false

// Fake prisma: captures audit writes + serves the snapshot's groupBy.
function fakePrisma(groupRows: Array<{ type: string; status: string; _count: { _all: number } }> = []) {
  const auditCreate = vi.fn(async (_args: { data: Record<string, unknown> }) => ({}))
  const groupBy = vi.fn(async (_args: { by: string[]; _count: unknown; where?: unknown }) => groupRows)
  const prisma = {
    auditLog: { create: auditCreate },
    communicationLog: { groupBy },
  }
  return { prisma: prisma as any, auditCreate, groupBy }
}

beforeAll(async () => {
  const client = new Redis(REDIS_URL, { db: 9, lazyConnect: true, connectTimeout: 1000, maxRetriesPerRequest: 1 })
  try {
    await client.connect()
    await client.ping()
    redis = client
    available = true
  } catch {
    client.disconnect()
    redis = null
    available = false
  }
})

afterAll(async () => {
  if (redis) {
    try { await redis.flushdb() } finally { redis.disconnect() }
  }
})

function requireRedis(ctx: TestContext): void {
  if (!available) ctx.skip()
}

describe('GAP-6 send-pause flag: real Redis (db 9)', () => {
  beforeEach(async () => {
    if (available && redis) await redis.flushdb()
  })
  afterEach(() => {
    delete process.env.EMAIL_GATE_TRIP_PAUSE_THRESHOLD
    delete process.env.EMAIL_BOUNCE_PAUSE_MIN_VOLUME
    delete process.env.EMAIL_BOUNCE_PAUSE_RATIO
  })

  it('setSendPausedAuto sets the flag + audits ONCE (SYSTEM); a re-trigger while paused is a no-op', async (ctx) => {
    requireRedis(ctx)
    const { prisma, auditCreate } = fakePrisma()
    const first = await setSendPausedAuto(prisma, redis!, { reason: 'bounce-ratio', detail: { sent: 100, bounced: 20 } })
    expect(first).toBe(true)
    expect(await isSendPaused(redis!)).toBe(true)
    // SYSTEM-actor transition audit row.
    expect(auditCreate).toHaveBeenCalledTimes(1)
    const data = (auditCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ event: 'EMAIL_SEND_PAUSED', entityType: 'platform', actorType: 'SYSTEM', actorId: 'system' })

    // Already paused: idempotent, no new flag write / no second audit.
    const second = await setSendPausedAuto(prisma, redis!, { reason: 'gate-trips' })
    expect(second).toBe(false)
    expect(auditCreate).toHaveBeenCalledTimes(1)
  })

  it('clearSendPaused clears + audits (ADMIN); a clear when not paused reports wasPaused:false with no audit', async (ctx) => {
    requireRedis(ctx)
    const { prisma, auditCreate } = fakePrisma()
    await setSendPausedAuto(prisma, redis!, { reason: 'gate-trips' })
    auditCreate.mockClear()

    const cleared = await clearSendPaused(prisma, redis!, { adminId: 'super-1', ipAddress: '9.9.9.9', userAgent: 'ops' })
    expect(cleared.wasPaused).toBe(true)
    expect(await isSendPaused(redis!)).toBe(false)
    expect(auditCreate).toHaveBeenCalledTimes(1)
    const data = (auditCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ event: 'EMAIL_SEND_RESUMED', entityType: 'platform', actorType: 'ADMIN', actorId: 'super-1' })

    // Clearing an already-running platform: no-op, no audit.
    const noop = await clearSendPaused(prisma, redis!, { adminId: 'super-1', ipAddress: '9.9.9.9', userAgent: 'ops' })
    expect(noop.wasPaused).toBe(false)
    expect(auditCreate).toHaveBeenCalledTimes(1)
  })

  it('recordGlobalGateTrip auto-pauses only once the day-trips cross the threshold (gate-trips trigger)', async (ctx) => {
    requireRedis(ctx)
    process.env.EMAIL_GATE_TRIP_PAUSE_THRESHOLD = '3'
    const { prisma, auditCreate } = fakePrisma()
    await recordGlobalGateTrip(prisma, redis!)
    await recordGlobalGateTrip(prisma, redis!)
    expect(await isSendPaused(redis!)).toBe(false) // 2 < 3
    await recordGlobalGateTrip(prisma, redis!)
    expect(await isSendPaused(redis!)).toBe(true) // 3 >= 3
    const data = (auditCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ event: 'EMAIL_SEND_PAUSED', actorType: 'SYSTEM' })
    expect((data.metadata as Record<string, unknown>).reason).toBe('gate-trips')
  })

  it('recordEmailBounce auto-pauses only when volume >= min AND ratio >= threshold (bounce-ratio trigger)', async (ctx) => {
    requireRedis(ctx)
    process.env.EMAIL_BOUNCE_PAUSE_MIN_VOLUME = '4'
    process.env.EMAIL_BOUNCE_PAUSE_RATIO = '0.5'
    const { prisma } = fakePrisma()
    const day = utcDateStamp()
    // Below the minimum daily volume: one bounce cannot trip it.
    await redis!.set(RedisKey.emailSentCountAll(day), '2')
    await recordEmailBounce(prisma, redis!)
    expect(await isSendPaused(redis!)).toBe(false)

    // Now enough volume; drive the ratio to 0.5 (2 bounced / 4 sent) -> pause.
    await redis!.set(RedisKey.emailSentCountAll(day), '4')
    await recordEmailBounce(prisma, redis!) // bounced now 2
    expect(await isSendPaused(redis!)).toBe(true)
  })
})

describe('GAP-7 send-volume counters + snapshot: real Redis (db 9)', () => {
  beforeEach(async () => {
    if (available && redis) await redis.flushdb()
  })

  it('recordEmailSendCounters increments the per-type AND total daily counters', async (ctx) => {
    requireRedis(ctx)
    const day = utcDateStamp()
    await recordEmailSendCounters(redis!, 'admin_otp')
    await recordEmailSendCounters(redis!, 'admin_otp')
    await recordEmailSendCounters(redis!, 'branch_pin')
    expect(await redis!.get(RedisKey.emailSentCountType('admin_otp', day))).toBe('2')
    expect(await redis!.get(RedisKey.emailSentCountType('branch_pin', day))).toBe('1')
    expect(await redis!.get(RedisKey.emailSentCountAll(day))).toBe('3')
  })

  it('getEmailOpsSnapshot folds the 24h CommunicationLog groupBy by type+status, reads counters + pause, and NEVER selects payload', async (ctx) => {
    requireRedis(ctx)
    const day = utcDateStamp()
    await redis!.set(RedisKey.emailSentCountAll(day), '7')
    await redis!.set(RedisKey.emailBouncedCount(day), '1')
    await redis!.set(RedisKey.emailGateTripDay(day), '2')
    const { prisma, groupBy } = fakePrisma([
      { type: 'admin_otp', status: 'SENT', _count: { _all: 5 } },
      { type: 'admin_otp', status: 'FAILED', _count: { _all: 1 } },
      { type: 'password_reset', status: 'BOUNCED', _count: { _all: 2 } },
    ])
    const snap = await getEmailOpsSnapshot(prisma, redis!)

    // groupBy is by type+status only (no payload anywhere in the query).
    const gbArg = groupBy.mock.calls[0][0] as { by: string[]; _count: unknown; where?: unknown }
    expect(gbArg.by).toEqual(['type', 'status'])
    expect(JSON.stringify(gbArg)).not.toContain('payload')

    const adminOtp = snap.communicationLog.byType.find((t) => t.type === 'admin_otp')!
    expect(adminOtp).toMatchObject({ sent: 5, failed: 1, total: 6 })
    expect(snap.communicationLog.totals).toMatchObject({ sent: 5, failed: 1, bounced: 2, total: 8 })
    expect(snap.redisCounters).toMatchObject({ sentAll: 7, bounced: 1, gateTrips: 2 })
    expect(snap.pause.paused).toBe(false)
  })
})

// ── Part B: email:ops capability is SUPER_ADMIN-only + non-grantable; route gate
// fails closed (no Redis) ──────────────────────────────────────────────────────

describe('GAP-7 email:ops capability + route gate (fail-closed)', () => {
  it('SUPER_ADMIN holds email:ops via the short-circuit; no other baseline does', () => {
    expect(adminHasEffectiveCapability('SUPER_ADMIN', undefined, 'email:ops')).toBe(true)
    // OPERATIONS carries its full baseline caps but NOT email:ops.
    expect(adminHasEffectiveCapability('OPERATIONS', ['merchant:read', 'approval:action'], 'email:ops')).toBe(false)
    expect(adminHasEffectiveCapability('SUPPORT', [], 'email:ops')).toBe(false)
  })

  it('email:ops is NOT grantable and a stray grant is filtered out of effective caps', () => {
    expect(isGrantableCapability('email:ops')).toBe(false)
    expect(resolveEffectiveCapabilities('OPERATIONS', ['email:ops'])).not.toContain('email:ops')
  })

  it('requireAdminCapability(email:ops) 403s a non-SUPER_ADMIN and passes a SUPER_ADMIN', async () => {
    const gate = requireAdminCapability('email:ops')

    const denyReply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    await gate({ user: { adminRole: 'SUPPORT', caps: [] } } as any, denyReply as any)
    expect(denyReply.status).toHaveBeenCalledWith(403)

    const allowReply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    await gate({ user: { adminRole: 'SUPER_ADMIN', caps: undefined } } as any, allowReply as any)
    expect(allowReply.status).not.toHaveBeenCalled()
  })
})
