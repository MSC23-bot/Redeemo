// src/api/shared/pwdResetLimiter.ts
//
// SEC-H4 (Gate-PR-8): password-reset request abuse controls. Every
// forgot-password request (customer / merchant / admin) routes through
// assertPwdResetAllowed() (checks) then recordPwdResetRequest() (counts the
// attempt), BEFORE the user lookup — so the limits apply identically whether or
// not the email belongs to a real account. That ordering is what keeps the
// limiter from leaking account existence (no user enumeration).
//
// Controls (app-level, in ADDITION to the per-IP hourly @fastify/rate-limit edge
// tier already on the route — see plugins/rate-limit.ts 'forgotPassword', 3/hr/IP):
//   - Per-email (account) hourly + daily caps.
//   - Per-IP daily ceiling — complements the edge tier's hourly burst guard by
//     closing the "pace under 3/hr from one IP → ~72/day" gap.
//
// Guardrails:
//   - Raw emails are NEVER used in Redis keys — only hashEmail(normalizeEmail()).
//   - RATE_LIMIT_RELAX loosens the caps in dev/test ONLY (never in production).
//   - Counting happens BEFORE the user lookup and for EVERY request, so a probe
//     for a non-existent account is rate-limited exactly like a real request.
//
// FOLLOW-UP (before Resend / email delivery goes live): assertPwdResetAllowed
// (a read) and recordPwdResetRequest (an incr) are NOT atomic, so a burst of
// concurrent requests for the same email/IP can overshoot the cap by up to the
// concurrency count. This is harmless TODAY because forgot-password only writes
// a Redis reset token — no email is actually sent yet (see the "TODO Phase 6:
// deliver the reset link via Resend" notes in the forgotPassword* services).
// Before reset emails are actually delivered, make counting atomic (incr-first:
// `const n = await redis.incr(key); if (n === 1) await expire(...); if (n > limit)
// throw`, or a small Lua script) so a concurrent burst can't bomb a victim's
// inbox. Tracked as a Security Stabilisation Gate follow-up.

import crypto from 'node:crypto'
import type Redis from 'ioredis'
import { AppError } from './errors'
import { RedisKey } from './redis-keys'

// RATE_LIMIT_RELAX only takes effect outside production (mirrors plugins/rate-limit.ts + smsLimiter.ts).
const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

// ── Email normalization + hashing — keep raw emails out of Redis keys / logs. ──
// Normalize so case / surrounding whitespace can't bypass the per-email cap.
// (emailSchema already .toLowerCase().trim()s at the route boundary; this is
// belt-and-braces and also covers any direct / non-route caller.)
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 32)
}

// ── Caps — relaxed in dev via RATE_LIMIT_RELAX. ──
interface Cap {
  limit: number
  windowSec: number
}
const PROD = {
  emailHour: { limit: 3, windowSec: 3600 },
  emailDay: { limit: 5, windowSec: 86400 },
  ipDay: { limit: 10, windowSec: 86400 },
}
const DEV = {
  emailHour: { limit: 1000, windowSec: 3600 },
  emailDay: { limit: 1000, windowSec: 86400 },
  ipDay: { limit: 1000, windowSec: 86400 },
}
function caps() {
  return RELAX ? DEV : PROD
}

export interface PwdResetContext {
  /** Raw submitted email — normalized + hashed before use as a Redis key. */
  email: string
  ip?: string | null
}

function volumeKeys(ctx: PwdResetContext): Array<{ key: string; cap: Cap }> {
  const c = caps()
  const out: Array<{ key: string; cap: Cap }> = []

  // Per-email (account) caps — the control the rl:pwd-reset key was defined for.
  const eh = hashEmail(ctx.email)
  out.push({ key: RedisKey.rateLimitPwdReset(eh), cap: c.emailHour })
  out.push({ key: RedisKey.rateLimitPwdResetDay(eh), cap: c.emailDay })

  // Per-IP daily ceiling — only when the caller IP is known.
  if (ctx.ip) {
    out.push({ key: RedisKey.rateLimitPwdResetIpDay(ctx.ip), cap: c.ipDay })
  }

  return out
}

async function ttlOr(redis: Redis, key: string, fallback: number): Promise<number> {
  const t = await redis.ttl(key)
  return t > 0 ? t : fallback
}

/**
 * Throws AppError('PWD_RESET_RATE_LIMITED', { retryAfter }) if any per-email or
 * per-IP cap is already met. MUST be called BEFORE the user lookup so the limit
 * applies identically for existing and non-existing emails.
 */
export async function assertPwdResetAllowed(redis: Redis, ctx: PwdResetContext): Promise<void> {
  for (const { key, cap } of volumeKeys(ctx)) {
    const count = await redis.get(key)
    if (count !== null && parseInt(count, 10) >= cap.limit) {
      throw new AppError('PWD_RESET_RATE_LIMITED', { retryAfter: await ttlOr(redis, key, cap.windowSec) })
    }
  }
}

/**
 * Record one password-reset request attempt against every applicable counter.
 * Call AFTER assertPwdResetAllowed and BEFORE branching on whether the user
 * exists, so a probe for a non-existent account is counted exactly like a real
 * request (this is what keeps the limiter from leaking account existence).
 */
export async function recordPwdResetRequest(redis: Redis, ctx: PwdResetContext): Promise<void> {
  for (const { key, cap } of volumeKeys(ctx)) {
    const n = await redis.incr(key)
    if (n === 1) await redis.expire(key, cap.windowSec) // fixed window — set TTL on first incr only
  }
}
