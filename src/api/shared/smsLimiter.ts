// src/api/shared/smsLimiter.ts
//
// SEC-H3 (Gate-PR-7): SMS/OTP toll-fraud controls. Every customer-facing path
// that bills a Twilio SMS routes through assertSmsSendAllowed() (checks) then
// recordSmsSend() (counts the attempt), before the actual send.
//
// Controls:
//   - Country allowlist (default UK +44) — the primary anti-toll-fraud control.
//   - Global daily circuit-breaker — hard cost ceiling.
//   - Per-phone / per-user / per-IP hourly + daily caps.
//   - Per-phone resend cooldown (atomic SET NX; also serialises concurrent sends).
//   - Per-branch daily cap for branch-PIN SMS.
//
// Guardrails:
//   - Raw phone numbers are NEVER used in Redis keys — only hashPhone(phone).
//   - RATE_LIMIT_RELAX loosens the VOLUME caps in dev only. It does NOT relax the
//     country allowlist or the global cost cap (both are env-driven and always on,
//     so production can never accidentally disable them).
//   - Counting happens on the ATTEMPT (recordSmsSend before the send), because
//     Twilio bills attempts, not just successes.

import crypto from 'node:crypto'
import type Redis from 'ioredis'
import { AppError } from './errors'
import { RedisKey } from './redis-keys'

// RATE_LIMIT_RELAX only takes effect outside production (mirrors plugins/rate-limit.ts).
const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

// ── Country allowlist — env-driven, default UK. NEVER relaxed by RATE_LIMIT_RELAX. ──
export function allowedSmsCountryCodes(): string[] {
  const raw = process.env.SMS_ALLOWED_COUNTRY_CODES?.trim()
  const list = raw && raw.length > 0 ? raw.split(',') : ['+44']
  return list.map((s) => s.trim()).filter((s) => s.startsWith('+'))
}

export function isAllowedSmsDestination(phone: string): boolean {
  return allowedSmsCountryCodes().some((cc) => phone.startsWith(cc))
}

// ── Phone hashing — keep raw phone numbers out of Redis keys / logs. ──
export function hashPhone(phone: string): string {
  return crypto.createHash('sha256').update(phone).digest('hex').slice(0, 32)
}

// ── Volume caps — relaxed in dev via RATE_LIMIT_RELAX. ──
interface Cap {
  limit: number
  windowSec: number
}
const PROD = {
  phoneHour: { limit: 3, windowSec: 3600 },
  phoneDay: { limit: 6, windowSec: 86400 },
  userHour: { limit: 5, windowSec: 3600 },
  userDay: { limit: 8, windowSec: 86400 },
  ipHour: { limit: 10, windowSec: 3600 },
  ipDay: { limit: 20, windowSec: 86400 },
  branchPinDay: { limit: 10, windowSec: 86400 },
  cooldownSec: 45,
}
const DEV = {
  phoneHour: { limit: 1000, windowSec: 3600 },
  phoneDay: { limit: 1000, windowSec: 86400 },
  userHour: { limit: 1000, windowSec: 3600 },
  userDay: { limit: 1000, windowSec: 86400 },
  ipHour: { limit: 1000, windowSec: 3600 },
  ipDay: { limit: 1000, windowSec: 86400 },
  branchPinDay: { limit: 1000, windowSec: 86400 },
  cooldownSec: 1,
}
function caps() {
  return RELAX ? DEV : PROD
}

// ── Global daily circuit-breaker — env-driven, NEVER relaxed, hard block. ──
const GLOBAL_WINDOW_SEC = 86400
export function globalDailyCap(): number {
  const n = Number(process.env.SMS_GLOBAL_DAILY_CAP)
  return Number.isFinite(n) && n > 0 ? n : 500
}

export type SmsScope = 'otp' | 'branchPin'
export interface SmsSendContext {
  /** Normalized E.164 destination. */
  phone: string
  userId?: string | null
  ip?: string | null
  scope: SmsScope
  branchId?: string | null
}

function volumeKeys(ctx: SmsSendContext): Array<{ key: string; cap: Cap }> {
  const c = caps()
  const out: Array<{ key: string; cap: Cap }> = []
  if (ctx.scope === 'otp') {
    const ph = hashPhone(ctx.phone)
    out.push({ key: RedisKey.rateLimitOtpSend(ph), cap: c.phoneHour })
    out.push({ key: RedisKey.rateLimitOtpSendDay(ph), cap: c.phoneDay })
    if (ctx.userId) {
      out.push({ key: RedisKey.rateLimitOtpSendUser(ctx.userId), cap: c.userHour })
      out.push({ key: RedisKey.rateLimitOtpSendUserDay(ctx.userId), cap: c.userDay })
    }
    if (ctx.ip) {
      out.push({ key: RedisKey.rateLimitOtpIp(ctx.ip), cap: c.ipHour })
      out.push({ key: RedisKey.rateLimitOtpIpDay(ctx.ip), cap: c.ipDay })
    }
  } else if (ctx.branchId) {
    out.push({ key: RedisKey.rateLimitBranchPinDay(ctx.branchId), cap: c.branchPinDay })
  }
  return out
}

async function ttlOr(redis: Redis, key: string, fallback: number): Promise<number> {
  const t = await redis.ttl(key)
  return t > 0 ? t : fallback
}

/**
 * Throws an AppError (with `retryAfter` where useful) if the send must be
 * blocked. On success it has consumed the per-phone resend cooldown (SET NX),
 * which also serialises concurrent sends to the same number. Call recordSmsSend
 * next, then perform the actual send.
 */
export async function assertSmsSendAllowed(redis: Redis, ctx: SmsSendContext): Promise<void> {
  // 1. Country allowlist — always enforced.
  if (!isAllowedSmsDestination(ctx.phone)) {
    throw new AppError('SMS_DESTINATION_NOT_ALLOWED')
  }

  // 2. Global circuit-breaker — always enforced, hard block (cost protection).
  const globalKey = RedisKey.rateLimitSmsGlobalDay()
  const globalCount = await redis.get(globalKey)
  if (globalCount !== null && parseInt(globalCount, 10) >= globalDailyCap()) {
    throw new AppError('SMS_GLOBAL_LIMIT', { retryAfter: await ttlOr(redis, globalKey, GLOBAL_WINDOW_SEC) })
  }

  // 3. Volume caps (per-phone / per-user / per-IP hourly+daily, or per-branch).
  for (const { key, cap } of volumeKeys(ctx)) {
    const count = await redis.get(key)
    if (count !== null && parseInt(count, 10) >= cap.limit) {
      throw new AppError('SMS_RATE_LIMITED', { retryAfter: await ttlOr(redis, key, cap.windowSec) })
    }
  }

  // 4. Resend cooldown (per-phone) — atomic SET NX; blocks rapid/concurrent resends.
  const cdKey = RedisKey.rateLimitOtpCooldown(hashPhone(ctx.phone))
  const cooldownSec = caps().cooldownSec
  const acquired = await redis.set(cdKey, '1', 'EX', cooldownSec, 'NX')
  if (acquired === null) {
    throw new AppError('OTP_RESEND_COOLDOWN', { retryAfter: await ttlOr(redis, cdKey, cooldownSec) })
  }
}

/**
 * Record one send ATTEMPT against the global cap and every applicable volume
 * counter. Call AFTER assertSmsSendAllowed and BEFORE the actual send, so an
 * attempt that fails at Twilio is still counted (Twilio bills attempts).
 */
export async function recordSmsSend(redis: Redis, ctx: SmsSendContext): Promise<void> {
  const ops: Array<{ key: string; windowSec: number }> = [
    { key: RedisKey.rateLimitSmsGlobalDay(), windowSec: GLOBAL_WINDOW_SEC },
    ...volumeKeys(ctx).map(({ key, cap }) => ({ key, windowSec: cap.windowSec })),
  ]
  for (const { key, windowSec } of ops) {
    const n = await redis.incr(key)
    if (n === 1) await redis.expire(key, windowSec) // fixed window — set TTL on first incr only
  }
}
