// src/api/shared/emailOps.ts
//
// §SEC.1 GAP-6 + GAP-7 (plan 2026-07-10-transactional-email-enablement §1.6/§1.7):
// operational controls layered on top of the send limiter (emailLimiter.ts) and
// the outbox dispatcher (notify.ts). Two concerns, kept in one cohesive module
// because they share the same daily Redis counters:
//
//   GAP-6 auto send-pause (defence in depth on top of the GAP-1 global cost gate):
//     a single global Redis flag `email:send:paused` that notify() checks BEFORE
//     consuming limiter budget. When present, EVERY transactional send is declined
//     (notify returns { queued:false, reason:'send-paused' } and writes NO row),
//     so a bounce storm or a repeated-gate-trip anomaly stops outbound mail without
//     an env redeploy. It is set AUTOMATICALLY by two triggers and cleared ONLY by
//     a SUPER_ADMIN action (no TTL: it must persist until an operator resumes):
//       - bounce-ratio: the Resend webhook, on a bounce/complaint, evaluates the
//         day's bounced/sent ratio and pauses once it crosses EMAIL_BOUNCE_PAUSE_RATIO
//         (guarded by a minimum daily volume so one bounce out of two never trips it).
//       - gate-trips: notify(), when the global daily cost gate blocks, counts the
//         trip and pauses once the day's trips cross EMAIL_GATE_TRIP_PAUSE_THRESHOLD
//         (the "global gate trips repeatedly" trigger).
//     Both auto-sets and the manual clear are AUDITED (SYSTEM actor for the auto-set,
//     ADMIN actor for the clear), mirroring the LEAD_ANONYMISED SYSTEM-actor precedent.
//
//   GAP-7 send-volume counters + anomaly log + SUPER_ADMIN view:
//     per-type/day + total/day Redis counters incremented beside the limiter
//     consumption (one INCR per ALLOWED send, keyed by a UTC date stamp); a
//     structured anomaly log line when the gate or a per-address cap blocks; and a
//     read-only snapshot (getEmailOpsSnapshot) surfacing the last-24h CommunicationLog
//     aggregates (by type + status) PLUS the Redis counters PLUS the pause state, for
//     the SUPER_ADMIN ops route. CommunicationLog.payload is NEVER selected here (the
//     groupBy touches only type/status/_count), preserving the M7 payload rule.
//
// NOTE (fail-closed nuance vs the plan): the plan §1.6 sketched the pause as
// "QUEUED-not-sent, same as dark mode". This module implements the sharper,
// truly-fail-closed contract the executing brief specifies: notify() declines at
// the single choke point with a DISTINCT reason ('send-paused') and writes no
// outbox row, so a paused platform cannot leak sends through the worker (which
// does not read this flag). Recorded as a resolved plan refinement.

import type Redis from 'ioredis'
import type { PrismaClient } from '../../../generated/prisma/client'
import { RedisKey } from './redis-keys'
import { writeAuditLogTx } from './audit'

// Daily counters carry a UTC date stamp in the key, so a short TTL only cleans up
// stale days (2 days is comfortably beyond any 24h read window + clock skew).
const COUNTER_TTL_SEC = 2 * 24 * 60 * 60

/** UTC YYYYMMDD stamp for the daily counter keys (date-only, timezone-stable). */
export function utcDateStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '')
}

// ── Auto-pause thresholds (env-tunable, sane prod defaults). Mirrors the
// env-driven EMAIL_GLOBAL_DAILY_CAP posture: absent/invalid falls back safely. ──

/** Day's bounced/sent ratio that trips the auto-pause (default 10%). */
export function bouncePauseRatio(): number {
  const n = Number(process.env.EMAIL_BOUNCE_PAUSE_RATIO)
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.1
}
/** Minimum sends today before the bounce ratio can trip (avoids tiny-sample trips). */
export function bouncePauseMinVolume(): number {
  const n = Number(process.env.EMAIL_BOUNCE_PAUSE_MIN_VOLUME)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50
}
/** Global-gate trips in a day before the auto-pause fires (default 5). */
export function gateTripPauseThreshold(): number {
  const n = Number(process.env.EMAIL_GATE_TRIP_PAUSE_THRESHOLD)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5
}

// ── GAP-6: the send-pause flag ────────────────────────────────────────────────

export type EmailPauseReason = 'bounce-ratio' | 'gate-trips'

export interface EmailPauseState {
  reason: string
  at: string
  actor: string
  detail?: Record<string, unknown>
}

/** True iff the global send-pause flag is set. Uses GET (not EXISTS) so a fake
 *  Redis that overloads EXISTS for suppression cannot be confused for a pause. */
export async function isSendPaused(redis: Redis): Promise<boolean> {
  return (await redis.get(RedisKey.emailSendPaused())) !== null
}

function parsePauseState(raw: string | null): EmailPauseState | null {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as EmailPauseState
  } catch {
    // A legacy / hand-set flag value: still paused, just without structured detail.
    return { reason: 'unknown', at: '', actor: 'unknown' }
  }
}

/**
 * Auto-pause sending (SYSTEM actor). Idempotent: SET-NX means only the FIRST
 * trip writes the flag + the transition audit row; a re-trigger while already
 * paused is a no-op. Best-effort audit (the safety pause is the priority; a
 * failed audit must not throw the trigger caller). Returns true iff THIS call
 * transitioned running -> paused.
 */
export async function setSendPausedAuto(
  prisma: PrismaClient,
  redis: Redis,
  args: { reason: EmailPauseReason; detail?: Record<string, unknown> },
): Promise<boolean> {
  const state: EmailPauseState = {
    reason: args.reason,
    at: new Date().toISOString(),
    actor: 'SYSTEM',
    ...(args.detail ? { detail: args.detail } : {}),
  }
  const set = await redis.set(RedisKey.emailSendPaused(), JSON.stringify(state), 'NX')
  if (set !== 'OK') return false
  try {
    await writeAuditLogTx(prisma, {
      entityId: 'email',
      entityType: 'platform',
      event: 'EMAIL_SEND_PAUSED',
      actorId: 'system',
      actorType: 'SYSTEM',
      metadata: { reason: args.reason, ...(args.detail ?? {}) },
      ipAddress: '',
      userAgent: '',
    })
  } catch (err) {
    console.error('[email] EMAIL_SEND_PAUSED audit write failed (pause still applied): ' + errMsg(err))
  }
  return true
}

/**
 * Manually clear the send-pause (SUPER_ADMIN action). Deletes the flag and, when
 * it was actually set, writes the ADMIN-actor EMAIL_SEND_RESUMED audit row
 * carrying the cleared state. Returns whether a pause was in effect.
 */
export async function clearSendPaused(
  prisma: PrismaClient,
  redis: Redis,
  args: { adminId: string; ipAddress: string; userAgent: string },
): Promise<{ wasPaused: boolean; clearedState: EmailPauseState | null }> {
  const prev = parsePauseState(await redis.get(RedisKey.emailSendPaused()))
  const removed = await redis.del(RedisKey.emailSendPaused())
  const wasPaused = removed > 0
  if (wasPaused) {
    try {
      await writeAuditLogTx(prisma, {
        entityId: 'email',
        entityType: 'platform',
        event: 'EMAIL_SEND_RESUMED',
        actorId: args.adminId,
        actorType: 'ADMIN',
        metadata: { clearedState: prev as unknown as Record<string, unknown> | null },
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
      })
    } catch (err) {
      console.error('[email] EMAIL_SEND_RESUMED audit write failed (resume still applied): ' + errMsg(err))
    }
  }
  return { wasPaused, clearedState: prev }
}

// ── GAP-6 triggers ─────────────────────────────────────────────────────────────

/**
 * Count one global-gate block for today and auto-pause once the day's trips cross
 * the threshold ("global gate trips repeatedly"). Call from notify() when the
 * limiter blocks with scope 'gate'.
 */
export async function recordGlobalGateTrip(
  prisma: PrismaClient,
  redis: Redis,
  now: Date = new Date(),
): Promise<void> {
  const key = RedisKey.emailGateTripDay(utcDateStamp(now))
  const trips = await redis.incr(key)
  if (trips === 1) await redis.expire(key, COUNTER_TTL_SEC)
  if (trips >= gateTripPauseThreshold()) {
    await setSendPausedAuto(prisma, redis, {
      reason: 'gate-trips',
      detail: { trips, threshold: gateTripPauseThreshold() },
    })
  }
}

/**
 * Record one provider bounce/complaint (from the Resend webhook) and auto-pause
 * once today's bounced/sent ratio crosses the threshold, guarded by a minimum
 * daily send volume so a tiny sample never trips it.
 */
export async function recordEmailBounce(
  prisma: PrismaClient,
  redis: Redis,
  now: Date = new Date(),
): Promise<void> {
  const day = utcDateStamp(now)
  const bKey = RedisKey.emailBouncedCount(day)
  const bounced = await redis.incr(bKey)
  if (bounced === 1) await redis.expire(bKey, COUNTER_TTL_SEC)

  const sent = Number(await redis.get(RedisKey.emailSentCountAll(day))) || 0
  if (sent >= bouncePauseMinVolume() && bounced / sent >= bouncePauseRatio()) {
    await setSendPausedAuto(prisma, redis, {
      reason: 'bounce-ratio',
      detail: { sent, bounced, ratio: Number((bounced / sent).toFixed(4)) },
    })
  }
}

// ── GAP-7: send-volume counters + anomaly log ──────────────────────────────────

/**
 * Increment the per-type/day + total/day send counters for one ALLOWED send.
 * Call from notify() right after the limiter passes (Resend bills the attempt).
 * Best-effort: a counter blip must never break the outbox commit.
 */
export async function recordEmailSendCounters(redis: Redis, type: string, now: Date = new Date()): Promise<void> {
  const day = utcDateStamp(now)
  try {
    const perType = await redis.incr(RedisKey.emailSentCountType(type, day))
    if (perType === 1) await redis.expire(RedisKey.emailSentCountType(type, day), COUNTER_TTL_SEC)
    const all = await redis.incr(RedisKey.emailSentCountAll(day))
    if (all === 1) await redis.expire(RedisKey.emailSentCountAll(day), COUNTER_TTL_SEC)
  } catch (err) {
    console.warn('[email] send-counter increment failed (non-fatal): ' + errMsg(err))
  }
}

/**
 * Structured anomaly log line when the send limiter blocks on the global gate or
 * a per-address cap. The blocked key carries only static tiers or a hashEmail
 * (never a raw address), so it is safe to log.
 */
export function logEmailSendAnomaly(info: { scope: string; blockedKey: string; type: string }): void {
  console.warn(`[email] anomaly send-blocked scope=${info.scope} type=${info.type} key=${info.blockedKey}`)
}

// ── GAP-7: read-only ops snapshot (SUPER_ADMIN view) ───────────────────────────

export interface EmailTypeAggregate {
  type: string
  queued: number
  sent: number
  failed: number
  bounced: number
  total: number
}

export interface EmailOpsSnapshot {
  generatedAt: string
  windowHours: number
  /** Last-24h CommunicationLog aggregates by type + status (payload NEVER read). */
  communicationLog: {
    byType: EmailTypeAggregate[]
    totals: { queued: number; sent: number; failed: number; bounced: number; total: number }
  }
  /** Today's Redis counters (UTC day). */
  redisCounters: { dateUtc: string; sentAll: number; bounced: number; gateTrips: number }
  pause: { paused: boolean; state: EmailPauseState | null }
}

type StatusKey = 'queued' | 'sent' | 'failed' | 'bounced'
const STATUS_TO_KEY: Record<string, StatusKey> = {
  QUEUED: 'queued',
  SENT: 'sent',
  FAILED: 'failed',
  BOUNCED: 'bounced',
}

/**
 * Assemble the SUPER_ADMIN email-ops snapshot: 24h CommunicationLog aggregates
 * (grouped by type + status; payload is never selected) + today's Redis counters
 * + the pause flag state. Pure read: no side effects.
 */
export async function getEmailOpsSnapshot(
  prisma: PrismaClient,
  redis: Redis,
  now: Date = new Date(),
): Promise<EmailOpsSnapshot> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const grouped = await prisma.communicationLog.groupBy({
    by: ['type', 'status'],
    where: { channel: 'EMAIL', sentAt: { gte: since } },
    _count: { _all: true },
  })

  const byTypeMap = new Map<string, EmailTypeAggregate>()
  const totals = { queued: 0, sent: 0, failed: 0, bounced: 0, total: 0 }
  for (const row of grouped as Array<{ type: string; status: string; _count: { _all: number } }>) {
    const key = STATUS_TO_KEY[row.status]
    if (!key) continue
    const n = row._count._all
    let agg = byTypeMap.get(row.type)
    if (!agg) {
      agg = { type: row.type, queued: 0, sent: 0, failed: 0, bounced: 0, total: 0 }
      byTypeMap.set(row.type, agg)
    }
    agg[key] += n
    agg.total += n
    totals[key] += n
    totals.total += n
  }
  const byType = Array.from(byTypeMap.values()).sort((a, b) => b.total - a.total)

  const day = utcDateStamp(now)
  const [sentAll, bounced, gateTrips, pauseRaw] = await Promise.all([
    redis.get(RedisKey.emailSentCountAll(day)),
    redis.get(RedisKey.emailBouncedCount(day)),
    redis.get(RedisKey.emailGateTripDay(day)),
    redis.get(RedisKey.emailSendPaused()),
  ])

  return {
    generatedAt: now.toISOString(),
    windowHours: 24,
    communicationLog: { byType, totals },
    redisCounters: {
      dateUtc: day,
      sentAll: Number(sentAll) || 0,
      bounced: Number(bounced) || 0,
      gateTrips: Number(gateTrips) || 0,
    },
    pause: { paused: pauseRaw !== null, state: parsePauseState(pauseRaw) },
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
