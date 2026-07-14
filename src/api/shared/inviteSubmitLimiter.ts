// src/api/shared/inviteSubmitLimiter.ts
//
// Customer merchant-invite programme M1 (Codex correction round 2026-07-14):
// the per-IP + global atomic limiter for POST /api/v1/customer/invites (the
// submit route). Mirrors inviteLocationLimiter.ts exactly in shape (same
// atomic `consume()` primitive, same GATE/ABUSER key classes) — sized for
// the submit WRITE rather than the Places search READ.
//
// This is a LAYERED defence, not a replacement for the existing per-account
// controls:
//   - The per-customer `inviteSubmit` rate-limit tier
//     (src/api/plugins/rate-limit.ts) and the in-transaction OPEN_INVITE_CAP
//     (service.ts) already bound what a SINGLE account can do.
//   - This module is the per-IP abuser layer against multi-account
//     submission farming: the per-user tier + in-tx cap bound one account;
//     this bounds one MACHINE running many accounts.
//
// Controls:
//   - Global daily ceiling — GATE key: a platform-wide breaker on total
//     invite submissions per day (env INVITE_SUBMIT_GLOBAL_DAILY_CAP,
//     default 500/day). Checked first, counted only on an allowed
//     submission (a burst of blocked attempts must not be able to trip the
//     breaker and deny the write to every legitimate customer).
//   - Per-IP hourly — ABUSER key: every attempt counts (env
//     INVITE_SUBMIT_IP_HOURLY_CAP, default 20/hour) — a hammering IP trips
//     its own limit regardless of how many distinct accounts it drives
//     through it.
//
// Guardrails:
//   - RATE_LIMIT_RELAX loosens the per-IP ABUSER (volume) cap in dev/test
//     ONLY (never in production). It does NOT relax the env-driven global
//     cost/abuse ceiling.
//   - Atomic (§SEC.1): check + count run as one Lua script
//     (shared/atomicLimiter) — a concurrent burst can never overshoot any cap.
//   - THRESHOLDS HERE ARE DEVELOPMENT DEFAULTS. PRODUCTION SIZING IS
//     OWNER-GATED before INVITES_ENABLED flips.

import type Redis from 'ioredis'
import { AppError } from './errors'
import { RedisKey } from './redis-keys'
import { consume, type LimitSpec } from './atomicLimiter'

// RATE_LIMIT_RELAX only takes effect outside production (mirrors inviteLocationLimiter).
const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

// ── Global daily cost/abuse ceiling — env-driven, NEVER relaxed, hard block. ──
const GLOBAL_WINDOW_SEC = 86400
export function inviteSubmitGlobalDailyCap(): number {
  const n = Number(process.env.INVITE_SUBMIT_GLOBAL_DAILY_CAP)
  return Number.isFinite(n) && n > 0 ? n : 500
}

// ── Per-IP hourly abuser cap — env-driven in prod; widened (never disabled)
// under RATE_LIMIT_RELAX for dev/test so the unit suite isn't forced to vary
// source IPs across a large fixture set. ──
const IP_HOUR_WINDOW_SEC = 3600
const DEV_IP_HOUR_LIMIT = 100000
export function inviteSubmitIpHourlyCap(): number {
  if (RELAX) return DEV_IP_HOUR_LIMIT
  const n = Number(process.env.INVITE_SUBMIT_IP_HOURLY_CAP)
  return Number.isFinite(n) && n > 0 ? n : 20
}

export interface InviteSubmitContext {
  /** Caller IP, when known (per-IP abuser tier). */
  ip?: string | null
}

/**
 * Atomically check-and-count one invite-submit attempt. Call BEFORE any
 * Redis/DB work in the submit route handler — an allowed attempt is
 * counted immediately (§SEC.1 semantics: per-IP = abuser key, every attempt
 * counts; global = gate/cost key, counted only on allowed attempts).
 *
 * Throws AppError('INVITE_SUBMIT_RATE_LIMITED', { retryAfter }) when either
 * cap blocks — a DEDICATED code, distinct from LOCATION_SEARCH_RATE_LIMITED
 * (the place-search read's limiter): a submit throttle must not masquerade
 * as a location-search throttle.
 */
export async function consumeInviteSubmit(
  redis: Redis,
  ctx: InviteSubmitContext,
): Promise<void> {
  // Global daily cost/abuse ceiling — GATE key: checked FIRST, counted only on allowed.
  const gateKeys: LimitSpec[] = [
    {
      key: RedisKey.rateLimitInviteSubmitGlobalDay(),
      limit: inviteSubmitGlobalDailyCap(),
      windowSec: GLOBAL_WINDOW_SEC,
    },
  ]

  // Per-IP cap — ABUSER key (every attempt counts), whenever the IP is known.
  const abuserKeys: LimitSpec[] = []
  if (ctx.ip) {
    abuserKeys.push({
      key: RedisKey.rateLimitInviteSubmitIpHour(ctx.ip),
      limit: inviteSubmitIpHourlyCap(),
      windowSec: IP_HOUR_WINDOW_SEC,
    })
  }

  const result = await consume(redis, { gateKeys, abuserKeys })

  if (!result.ok) {
    throw new AppError('INVITE_SUBMIT_RATE_LIMITED', { retryAfter: result.retryAfter })
  }
}
