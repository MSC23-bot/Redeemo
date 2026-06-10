// src/api/shared/smsLimiter.ts
//
// SEC-H3 (Gate-PR-7) + §SEC.1 (Phase 0 PR-0.2): SMS/OTP toll-fraud controls.
// Every customer-facing path that bills a Twilio SMS routes through
// consumeSmsSend() — ONE atomic check-and-count — before the actual send.
//
// Controls:
//   - Country allowlist (default UK +44) — the primary anti-toll-fraud control.
//   - Global daily circuit-breaker — hard cost ceiling. Checked first among the
//     counted caps (a platform-wide block reports as SMS_GLOBAL_LIMIT), counted
//     ONLY on allowed attempts: it caps what Twilio can bill, so blocked
//     requests must never consume it (otherwise an attacker could trip the
//     platform-wide breaker with requests that cost nothing).
//   - Per-phone / per-user / per-branch caps — VICTIM keys: checked first,
//     counted only when the attempt is allowed. A blocked attempt can't burn a
//     target's quota or extend their window.
//   - Per-IP hourly + daily caps — ABUSER keys: every attempt counts, allowed
//     or blocked, so a hammering requester trips their own limit.
//   - Per-phone resend cooldown — SET NX inside the same atomic script, after
//     the volume checks (volume errors take precedence) and before the victim
//     counting (a rapid double-tap on "resend" doesn't burn the hourly quota).
//     Also serialises concurrent sends to the same number.
//
// Guardrails:
//   - Raw phone numbers are NEVER used in Redis keys — only hashPhone(phone).
//   - RATE_LIMIT_RELAX loosens the VOLUME caps in dev only. It does NOT relax the
//     country allowlist or the global cost cap (both are env-driven and always on,
//     so production can never accidentally disable them).
//   - Counting happens on the allowed ATTEMPT (before the send), because Twilio
//     bills attempts, not just successes — a send that passes the limiter but
//     fails at Twilio is still counted.
//   - Atomic (§SEC.1): check + count run as one Lua script (shared/atomicLimiter)
//     — a concurrent burst can no longer overshoot any cap.

import crypto from 'node:crypto'
import type Redis from 'ioredis'
import { AppError } from './errors'
import { RedisKey } from './redis-keys'
import { isAssignedCallingCode } from './countryCallingCodes'
import { consume, type LimitSpec } from './atomicLimiter'

// RATE_LIMIT_RELAX only takes effect outside production (mirrors plugins/rate-limit.ts).
const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

// ── Country allowlist — env-driven, default UK. NEVER relaxed by RATE_LIMIT_RELAX. ──
// Each entry MUST be a COMPLETE assigned E.164 country code (e.g. +44, +353, +1).
// The allowlist matches destinations by prefix, so a PARTIAL like "+4" — which is
// not a real country code — would match the entire +40…+49 region; partials,
// bare "+", and garbage are therefore dropped (F4 — see countryCallingCodes.ts).
// If the configured list yields no valid code, fall back to the UK default
// (never allow-all, never block-all on a misconfig).
//
// NOTE: this is a single SHARED allowlist for every SMS path (customer OTP +
// branch PIN). Future route-specific policy — merchant/business SMS staying
// UK-only while customer/traveller OTP allows more countries — can be layered on
// later WITHOUT loosening the merchant surface by reading a per-scope env
// (e.g. SMS_ALLOWED_COUNTRY_CODES_OTP / _BRANCHPIN) keyed off SmsSendContext.scope,
// each falling back to this global value. Not built here (YAGNI until needed).
function parseSmsCountryCodeConfig(): { valid: string[]; dropped: string[] } {
  const entries = (process.env.SMS_ALLOWED_COUNTRY_CODES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const valid: string[] = []
  const dropped: string[] = []
  for (const entry of entries) {
    if (isAssignedCallingCode(entry)) valid.push(entry)
    else dropped.push(entry)
  }
  return { valid, dropped }
}

export function allowedSmsCountryCodes(): string[] {
  const { valid } = parseSmsCountryCodeConfig()
  return valid.length > 0 ? valid : ['+44']
}

// Returns a one-line operator warning naming any dropped (invalid) entries, or
// null when the config is clean. Logged once at boot (see app.ts) so a typo like
// "+4" is visible at startup instead of silently degrading to the UK fallback.
export function smsCountryCodeConfigWarning(): string | null {
  const { valid, dropped } = parseSmsCountryCodeConfig()
  if (dropped.length === 0) return null
  const effective = valid.length > 0 ? valid : ['+44']
  return (
    `Ignored invalid SMS_ALLOWED_COUNTRY_CODES ${dropped.length === 1 ? 'entry' : 'entries'}: ` +
    `${dropped.join(', ')}. Allowing: ${effective.join(', ')}. Each value must be a full E.164 ` +
    `country code (e.g. +44, +353), not a partial prefix.`
  )
}

export function isAllowedSmsDestination(phone: string): boolean {
  return allowedSmsCountryCodes().some((cc) => phone.startsWith(cc))
}

// E.164 format (matches phoneSchema). Non-E.164 destinations are rejected before
// any send: a national-format number (e.g. 07700…) or a malformed "+44abc" would
// fail at Twilio anyway, and we must never silently send to a non-E.164 number.
// Branch phones MUST be stored as E.164 to receive PIN SMS.
export function isE164Format(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone)
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

const toSpec = (key: string, cap: Cap): LimitSpec => ({ key, limit: cap.limit, windowSec: cap.windowSec })

/**
 * Atomically check-and-count one SMS send attempt. Call BEFORE the actual
 * Twilio send — an allowed attempt is already counted (Twilio bills attempts).
 *
 * Throws (with `retryAfter` where useful):
 *   - SMS_DESTINATION_NOT_ALLOWED — non-E.164 or country not allowlisted
 *     (checked in JS before any Redis call).
 *   - SMS_GLOBAL_LIMIT — the platform-wide daily cost cap is exhausted.
 *   - SMS_RATE_LIMITED — a per-phone / per-user / per-IP / per-branch cap.
 *   - OTP_RESEND_COOLDOWN — the per-phone resend cooldown is held.
 *
 * §SEC.1 semantics: per-IP = abuser keys (every attempt counts); global +
 * per-phone/user/branch = victim/cost keys (counted only on allowed attempts);
 * cooldown acquired in-script after the volume checks. On success the cooldown
 * is held, which also serialises concurrent sends to the same number.
 */
export async function consumeSmsSend(redis: Redis, ctx: SmsSendContext): Promise<void> {
  // 0. Must be a valid E.164 number (branch phones MUST be stored as E.164).
  //    Never send silently to a non-E.164 / malformed number.
  if (!isE164Format(ctx.phone)) {
    throw new AppError('SMS_DESTINATION_NOT_ALLOWED')
  }

  // 1. Country allowlist — always enforced.
  if (!isAllowedSmsDestination(ctx.phone)) {
    throw new AppError('SMS_DESTINATION_NOT_ALLOWED')
  }

  const c = caps()
  const ph = hashPhone(ctx.phone)
  const globalKey = RedisKey.rateLimitSmsGlobalDay()

  // Global daily circuit-breaker — a GATE key: checked FIRST (highest
  // precedence, so a platform-wide exhaustion always reports as
  // SMS_GLOBAL_LIMIT, the ops signal) and counted ONLY on an allowed send (a
  // burst of blocked attempts must not be able to drain the platform breaker
  // and deny SMS to every legitimate user — anti-DoS on the cost cap).
  const gateKeys: LimitSpec[] = [
    { key: globalKey, limit: globalDailyCap(), windowSec: GLOBAL_WINDOW_SEC },
  ]

  // Per-IP caps — ABUSER keys (every attempt counts), whenever the IP is known.
  const abuserKeys: LimitSpec[] = []
  if (ctx.ip) {
    abuserKeys.push(toSpec(RedisKey.rateLimitOtpIp(ctx.ip), c.ipHour))
    abuserKeys.push(toSpec(RedisKey.rateLimitOtpIpDay(ctx.ip), c.ipDay))
  }

  // Per-phone / per-user / per-branch — VICTIM keys, counted only on allowed.
  const victimKeys: LimitSpec[] = [
    toSpec(RedisKey.rateLimitOtpSend(ph), c.phoneHour),
    toSpec(RedisKey.rateLimitOtpSendDay(ph), c.phoneDay),
  ]
  if (ctx.scope === 'otp' && ctx.userId) {
    victimKeys.push(toSpec(RedisKey.rateLimitOtpSendUser(ctx.userId), c.userHour))
    victimKeys.push(toSpec(RedisKey.rateLimitOtpSendUserDay(ctx.userId), c.userDay))
  }
  if (ctx.scope === 'branchPin' && ctx.branchId) {
    victimKeys.push(toSpec(RedisKey.rateLimitBranchPinDay(ctx.branchId), c.branchPinDay))
  }

  const result = await consume(redis, {
    gateKeys,
    abuserKeys,
    victimKeys,
    cooldown: { key: RedisKey.rateLimitOtpCooldown(ph), ttlSec: c.cooldownSec },
  })

  if (!result.ok) {
    if (result.scope === 'cooldown') {
      throw new AppError('OTP_RESEND_COOLDOWN', { retryAfter: result.retryAfter })
    }
    if (result.scope === 'gate') {
      throw new AppError('SMS_GLOBAL_LIMIT', { retryAfter: result.retryAfter })
    }
    throw new AppError('SMS_RATE_LIMITED', { retryAfter: result.retryAfter })
  }
}
