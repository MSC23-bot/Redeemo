// src/api/shared/emailLimiter.ts
//
// §SEC.1 closure (plan 2026-07-10-transactional-email-enablement §1.3, GAP-1..GAP-4):
// transactional-email send abuse controls. Every email send routes through
// notify() (the single choke point), which calls consumeEmailSend(): ONE atomic
// check-and-count over shared/atomicLimiter.consume() BEFORE committing the
// outbox row. No calling route can bypass it. This mirrors smsLimiter.ts (the
// closest analogue: a cost-bearing external send) over the same primitive.
//
// Tiers (gate -> abuser -> victim precedence, per atomicLimiter):
//   - GLOBAL daily GATE (GAP-1): rl:email:global:day; env EMAIL_GLOBAL_DAILY_CAP.
//     A GATE key: checked FIRST (a platform-wide anomaly wins the block, the ops
//     signal) and counted ONLY on an allowed send, so a burst of BLOCKED attempts
//     can never drain the platform breaker and deny mail to every legitimate user
//     (anti-DoS on the cost cap, exactly as smsLimiter.globalDailyCap()). This is
//     the hard cost stop: without it one endpoint bug can bill/burn unbounded
//     Resend volume. NEVER relaxed by RATE_LIMIT_RELAX.
//   - Per-IP hourly + daily ABUSER keys (GAP-4 adds the hourly alongside the
//     pre-existing daily): rl:email:ip:hour:<ip> + rl:email:ip:day:<ip>. Every
//     attempt counts, allowed or blocked, so a hammering requester trips its own
//     limit; a burst is caught within the hour, not only across a day.
//   - Per-(type,address) VICTIM key (PRE-EXISTING, PRESERVED):
//     rl:email:<type>:<emailHash> at 5/hr; one recipient should not get more
//     than a handful of the SAME transactional email per hour.
//   - AGGREGATE per-address VICTIM keys (GAP-2): rl:email:addr:hour:<emailHash> +
//     rl:email:addr:day:<emailHash>; bound total mail to one INBOX across ALL
//     types, so an attacker cannot cycle `type` (admin_otp, password_reset,
//     merchant_claim, ...) to multiply the per-type 5/hr into 5xN/hr. This is the
//     victim-inbox-bombing vector §SEC.1 was opened for; the per-(type,address)
//     key alone does not close it.
//   - Per-ACCOUNT VICTIM key (GAP-3): rl:email:acct:day:<recipientType>:<recipientId>;
//     bounds total transactional volume to one recipient IDENTITY per day,
//     regardless of address or type churn.
//
// Guardrails (mirror smsLimiter / pwdResetLimiter):
//   - Raw email addresses are NEVER used in Redis keys; only hashEmail(...).
//     notify() hashes once (hashEmail lives in pwdResetLimiter.ts) and passes the
//     hash in ctx; this helper never sees a raw address.
//   - RATE_LIMIT_RELAX loosens the VOLUME caps in non-prod ONLY. It does NOT relax
//     the global cost gate (env-driven, always on), so production can never
//     accidentally disable it.
//   - Counting happens on the allowed ATTEMPT (before the send): Resend bills the
//     send, and a send that passes the limiter but fails at Resend is still an
//     attempt against the cost cap and the victim's window.
//   - Atomic (§SEC.1): check + count run as one Lua script (shared/atomicLimiter);
//     a concurrent burst can no longer overshoot any cap.
//
// Return contract: unlike smsLimiter (which THROWS for its throwing callers), this
// helper RETURNS the atomicLimiter ConsumeResult unchanged, because its sole
// caller notify() maps a block to { queued: false, reason: 'rate-limited' } and
// must not throw (the plan's unchanged notify contract). NO cooldown tier here:
// the per-recipient email-OTP resend cooldown is GAP-5, a separate follow-up.

import type Redis from 'ioredis'
import { RedisKey } from './redis-keys'
import { consume, type ConsumeResult, type LimitSpec } from './atomicLimiter'

// RATE_LIMIT_RELAX only takes effect outside production (mirrors plugins/rate-limit.ts + smsLimiter.ts).
const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

// ── Volume caps: relaxed in dev via RATE_LIMIT_RELAX. ──
interface Cap {
  limit: number
  windowSec: number
}
const PROD = {
  // Per-(type,address): PRE-EXISTING control (was inline in notify.ts). A single
  // recipient should not receive more than a handful of the SAME email per hour.
  typeHour: { limit: 5, windowSec: 3600 },
  // Aggregate per-address (GAP-2): across ALL types. Deliberately below N x typeHour
  // so cycling `type` cannot multiply the per-type cap against one inbox, yet still
  // above a single type's 5/hr so a legitimate burst of one type is unaffected.
  addrHour: { limit: 10, windowSec: 3600 },
  addrDay: { limit: 20, windowSec: 86400 },
  // Per-account (GAP-3): one recipient identity per day, across address/type churn.
  acctDay: { limit: 20, windowSec: 86400 },
  // Per-IP hourly (GAP-4) + daily (PRE-EXISTING, 200/day preserved) abuser ceilings.
  ipHour: { limit: 50, windowSec: 3600 },
  ipDay: { limit: 200, windowSec: 86400 },
}
const DEV = {
  typeHour: { limit: 1_000_000, windowSec: 3600 },
  addrHour: { limit: 1_000_000, windowSec: 3600 },
  addrDay: { limit: 1_000_000, windowSec: 86400 },
  acctDay: { limit: 1_000_000, windowSec: 86400 },
  ipHour: { limit: 1_000_000, windowSec: 3600 },
  ipDay: { limit: 1_000_000, windowSec: 86400 },
}
function caps() {
  return RELAX ? DEV : PROD
}

// ── Global daily circuit-breaker: env-driven, NEVER relaxed, hard block. ──
// Absent/invalid EMAIL_GLOBAL_DAILY_CAP falls back to a safe default (2000), so
// a deploy without the var never breaks (same posture as SMS_GLOBAL_DAILY_CAP).
const GLOBAL_WINDOW_SEC = 86400
export function emailGlobalDailyCap(): number {
  const n = Number(process.env.EMAIL_GLOBAL_DAILY_CAP)
  return Number.isFinite(n) && n > 0 ? n : 2000
}

export interface EmailSendContext {
  /** Hashed recipient address (notify passes hashEmail(to); raw address never reaches here). */
  emailHash: string
  /** CommunicationLog.type: the per-(type,address) VICTIM key discriminator. */
  type: string
  /** Recipient identity, for the per-account VICTIM key. */
  recipientType: string
  recipientId: string
  /** Requester IP for the per-IP hourly + daily ABUSER ceilings. */
  ip?: string | null
}

const toSpec = (key: string, cap: Cap): LimitSpec => ({ key, limit: cap.limit, windowSec: cap.windowSec })

/**
 * Atomically check-and-count one transactional-email send attempt. Call from
 * notify() BEFORE committing the outbox row; an allowed attempt is already
 * counted (Resend bills the send).
 *
 * Returns the atomicLimiter ConsumeResult:
 *   - { ok: true } when the send is allowed.
 *   - { ok: false, scope, blockedKey, retryAfter } when any tier blocks
 *     (scope 'gate' = the global cap; 'abuser' = per-IP; 'victim' = per-type /
 *     aggregate-address / per-account). notify() maps any block to
 *     { queued: false, reason: 'rate-limited' }.
 *
 * §SEC.1 semantics: global = GATE (checked first, counted only on allowed);
 * per-IP = ABUSER (every attempt counts); per-type/address/account = VICTIM
 * (counted only on allowed).
 */
export async function consumeEmailSend(redis: Redis, ctx: EmailSendContext): Promise<ConsumeResult> {
  const c = caps()

  // GLOBAL daily send cap: a GATE key, checked FIRST, counted ONLY on an allowed
  // send (a burst of blocked attempts must not drain the platform breaker).
  const gateKeys: LimitSpec[] = [
    { key: RedisKey.rateLimitEmailGlobalDay(), limit: emailGlobalDailyCap(), windowSec: GLOBAL_WINDOW_SEC },
  ]

  // Per-IP hourly (GAP-4) + daily (pre-existing): ABUSER keys (every attempt
  // counts), whenever the requester IP is known.
  const abuserKeys: LimitSpec[] = []
  if (ctx.ip) {
    abuserKeys.push(toSpec(RedisKey.rateLimitEmailIpHour(ctx.ip), c.ipHour))
    abuserKeys.push(toSpec(RedisKey.rateLimitEmailIpDay(ctx.ip), c.ipDay))
  }

  // VICTIM keys: checked, counted only on allowed. Declaration order = block
  // precedence, but every block maps to the same notify reason ('rate-limited').
  const victimKeys: LimitSpec[] = [
    // Per-(type,address): the PRE-EXISTING 5/hr control, preserved verbatim.
    toSpec(RedisKey.rateLimitEmailSend(ctx.type, ctx.emailHash), c.typeHour),
    // Aggregate per-address (GAP-2): kills type-cycling around the per-type cap.
    toSpec(RedisKey.rateLimitEmailAddrHour(ctx.emailHash), c.addrHour),
    toSpec(RedisKey.rateLimitEmailAddrDay(ctx.emailHash), c.addrDay),
    // Per-account (GAP-3): bound per recipient identity per day.
    toSpec(RedisKey.rateLimitEmailAcctDay(ctx.recipientType, ctx.recipientId), c.acctDay),
  ]

  return consume(redis, { gateKeys, abuserKeys, victimKeys })
}

// ── GAP-5: email-OTP resend cooldown + failed-round escalation ─────────────────
//
// §SEC.1 GAP-5 (plan 2026-07-10 §1.4, severity MODERATE). The per-(type,address)
// + aggregate-address tiers above blunt inbox-bombing; GAP-5 closes the code-
// FARMING / annoyance vector on the two EMAIL-OTP send paths (admin_otp +
// merchant_login_otp) and gives a clean ops signal. It gates the REQUEST of a
// fresh OTP email, NOT verification (verification keeps its own per-challenge
// ADMIN/MERCHANT_OTP_MAX_ATTEMPTS ceiling).
//
// Two controls, keyed on the recipient IDENTITY (both send paths reach the OTP
// step only AFTER a correct password, so the identity is already proven and no
// enumeration oracle is created by a cooldown error):
//   1. Resend cooldown: SET-NX-EX (the atomicLimiter `cooldown` scope, exactly as
//      smsLimiter does for a phone). A rapid re-login within the window is blocked
//      so the inbox is not flooded with fresh codes.
//   2. Failed-round escalation: a per-recipient counter of CONSECUTIVE destroyed
//      challenges (each Nth-wrong-code that burns a whole challenge). Once it
//      crosses K, the cooldown TTL escalates to a much longer value, so an
//      attacker who keeps farming-and-failing is throttled hard. A successful
//      verification clears the counter (clearEmailOtpFailedRound).
//
// The failed-round READ then cooldown SET is deliberately two steps (not one Lua
// script): this is an annoyance control, not a cost gate, so a rare race that
// picks the shorter TTL is harmless. Volume/cost caps stay atomic in consume().
const OTP_RESEND_COOLDOWN_SEC = 45
const OTP_RESEND_COOLDOWN_ESCALATED_SEC = 15 * 60 // 15 min after K failed rounds
const OTP_FAILED_ROUND_THRESHOLD = 3 // consecutive destroyed challenges before escalation
const OTP_FAILED_ROUND_WINDOW_SEC = 3600 // the failed-round counter's own expiry

// Dev loosening mirrors the volume caps: never touches production. A 1s cooldown
// keeps automated dev/test login loops usable without disabling the control.
const OTP_RESEND_COOLDOWN_DEV_SEC = 1

export interface EmailOtpResendContext {
  /** Recipient identity: 'ADMIN' | 'MERCHANT_ADMIN' etc. + the recipient id. */
  recipientType: string
  recipientId: string
}

export type EmailOtpResendResult = { ok: true } | { ok: false; retryAfter: number }

/**
 * Gate a fresh email-OTP send for one recipient. Call in the OTP send path BEFORE
 * generating the code + notify(): the first request acquires the cooldown and
 * proceeds; a request while the cooldown is held is refused with the remaining
 * seconds so the caller can surface OTP_RESEND_COOLDOWN. The cooldown TTL is the
 * escalated value once this recipient has crossed OTP_FAILED_ROUND_THRESHOLD
 * consecutive destroyed challenges.
 */
export async function consumeEmailOtpResend(
  redis: Redis,
  ctx: EmailOtpResendContext,
): Promise<EmailOtpResendResult> {
  const failed = Number(await redis.get(RedisKey.rateLimitEmailOtpFailedRound(ctx.recipientType, ctx.recipientId))) || 0
  const baseTtl = RELAX ? OTP_RESEND_COOLDOWN_DEV_SEC : OTP_RESEND_COOLDOWN_SEC
  const ttlSec = failed >= OTP_FAILED_ROUND_THRESHOLD ? OTP_RESEND_COOLDOWN_ESCALATED_SEC : baseTtl

  const result = await consume(redis, {
    cooldown: { key: RedisKey.rateLimitEmailOtpCooldown(ctx.recipientType, ctx.recipientId), ttlSec },
  })
  if (!result.ok) return { ok: false, retryAfter: result.retryAfter }
  return { ok: true }
}

/**
 * Record one DESTROYED OTP challenge (the Nth wrong code burned a whole round)
 * for a recipient: INCR the failed-round counter (TTL set on first increment).
 * Best-effort: a counter blip must never break the verify path.
 */
export async function recordEmailOtpFailedRound(redis: Redis, ctx: EmailOtpResendContext): Promise<void> {
  const key = RedisKey.rateLimitEmailOtpFailedRound(ctx.recipientType, ctx.recipientId)
  const v = await redis.incr(key)
  if (v === 1) await redis.expire(key, OTP_FAILED_ROUND_WINDOW_SEC)
}

/**
 * Clear a recipient's failed-round counter after a SUCCESSFUL verification, so a
 * legitimate user who eventually gets the code in is not left under escalation.
 */
export async function clearEmailOtpFailedRound(redis: Redis, ctx: EmailOtpResendContext): Promise<void> {
  await redis.del(RedisKey.rateLimitEmailOtpFailedRound(ctx.recipientType, ctx.recipientId))
}
