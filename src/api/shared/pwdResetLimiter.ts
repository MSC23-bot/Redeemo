// src/api/shared/pwdResetLimiter.ts
//
// SEC-H4 (Gate-PR-8) + §SEC.1 (Phase 0 PR-0.2): password-reset request abuse
// controls. Every forgot-password request (customer / merchant / admin) routes
// through consumePwdResetAttempt() — ONE atomic check-and-count — BEFORE the
// user lookup, so the limits apply identically whether or not the email belongs
// to a real account. That ordering is what keeps the limiter from leaking
// account existence (no user enumeration).
//
// Controls (app-level, in ADDITION to the per-IP hourly @fastify/rate-limit edge
// tier already on the route — see plugins/rate-limit.ts 'forgotPassword', 3/hr/IP):
//   - Per-email (account) hourly + daily caps — VICTIM keys: checked first,
//     counted only when the attempt is allowed. An attacker hammering a target
//     email cannot extend the target's window or burn their quota with blocked
//     requests; once the window lapses the legitimate owner can reset again.
//   - Per-IP daily ceiling — ABUSER key: every attempt counts, allowed or
//     blocked, so the attacker trips their own limit instead. Complements the
//     edge tier's hourly burst guard by closing the "pace under 3/hr from one
//     IP → ~72/day" gap.
//
// Guardrails:
//   - Raw emails are NEVER used in Redis keys — only hashEmail(normalizeEmail()).
//   - RATE_LIMIT_RELAX loosens the caps in dev/test ONLY (never in production).
//   - Counting happens BEFORE the user lookup and for EVERY allowed request, so
//     a probe for a non-existent account is rate-limited exactly like a real
//     request.
//   - Atomic (§SEC.1): check + count run as one Lua script (shared/atomicLimiter)
//     — a concurrent burst can no longer overshoot the caps, which mattered the
//     moment real reset emails send (victim-inbox-bombing vector).

import crypto from 'node:crypto'
import type Redis from 'ioredis'
import { AppError } from './errors'
import { RedisKey } from './redis-keys'
import { consume, type LimitSpec } from './atomicLimiter'

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

const toSpec = (key: string, cap: Cap): LimitSpec => ({ key, limit: cap.limit, windowSec: cap.windowSec })

/**
 * Atomically check-and-count one password-reset request. Throws
 * AppError('PWD_RESET_RATE_LIMITED', { retryAfter }) when any cap blocks.
 *
 * MUST be called BEFORE the user lookup so the limit applies identically for
 * existing and non-existing emails (no enumeration). Victim/abuser semantics
 * per §SEC.1: the per-email keys count only allowed attempts; the per-IP key
 * counts every attempt.
 */
export async function consumePwdResetAttempt(redis: Redis, ctx: PwdResetContext): Promise<void> {
  const c = caps()
  const eh = hashEmail(ctx.email)

  const result = await consume(redis, {
    // Per-IP daily ceiling — only when the caller IP is known.
    abuserKeys: ctx.ip ? [toSpec(RedisKey.rateLimitPwdResetIpDay(ctx.ip), c.ipDay)] : [],
    // Per-email (account) caps — the control the rl:pwd-reset key was defined for.
    victimKeys: [
      toSpec(RedisKey.rateLimitPwdReset(eh), c.emailHour),
      toSpec(RedisKey.rateLimitPwdResetDay(eh), c.emailDay),
    ],
  })

  if (!result.ok) {
    throw new AppError('PWD_RESET_RATE_LIMITED', { retryAfter: result.retryAfter })
  }
}
