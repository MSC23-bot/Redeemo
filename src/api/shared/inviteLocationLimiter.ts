// src/api/shared/inviteLocationLimiter.ts
//
// Customer merchant-invite programme M1: the customer-facing Google
// Places-search abuse + cost limiter for POST
// /api/v1/customer/invites/place-search. Mirrors merchantLocationLimiter.ts
// (Branches PR-6 §4e) exactly in shape — same atomic `consume()` primitive,
// same GATE/VICTIM/ABUSER key classes — sized for a customer-invite flow
// (no merchant identity to key on; lower caps: this is a "invite a business"
// nicety, not a core merchant workflow).
//
// Controls (mirrors merchantLocationLimiter / smsLimiter / pwdResetLimiter):
//   - Global daily ceiling — GATE key: a platform-wide cost breaker. Checked
//     first (a platform-wide exhaustion always reports as the gate) and
//     counted ONLY on an allowed search (a burst of blocked attempts must not
//     be able to trip the breaker and deny the lookup to every customer).
//   - Per-user daily — VICTIM key: checked, counted only when the attempt is
//     allowed.
//   - Per-IP hourly — ABUSER key: every attempt counts, allowed or blocked,
//     so a hammering requester trips its own limit.
//
// Guardrails:
//   - RATE_LIMIT_RELAX loosens the VOLUME caps in dev/test ONLY (never in
//     production). It does NOT relax the env-driven global cost ceiling.
//   - Atomic (§SEC.1): check + count run as one Lua script (shared/atomicLimiter)
//     — a concurrent burst can never overshoot any cap.

import type Redis from 'ioredis'
import { AppError } from './errors'
import { RedisKey } from './redis-keys'
import { consume, type LimitSpec } from './atomicLimiter'

// RATE_LIMIT_RELAX only takes effect outside production (mirrors merchantLocationLimiter).
const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

interface Cap {
  limit: number
  windowSec: number
}
const PROD = {
  userDay: { limit: 15, windowSec: 86400 },
  ipHour:  { limit: 30, windowSec: 3600 },
}
const DEV = {
  userDay: { limit: 100000, windowSec: 86400 },
  ipHour:  { limit: 100000, windowSec: 3600 },
}
function caps() {
  return RELAX ? DEV : PROD
}

// ── Global daily cost ceiling — env-driven, NEVER relaxed, hard block. ──
// A platform-wide breaker on what the invite-search flow can spend on Google
// Places in one day, regardless of how many customers hit it. Env-overridable
// so ops can dial it down without a deploy.
const GLOBAL_WINDOW_SEC = 86400
export function inviteLocationGlobalDailyCap(): number {
  const n = Number(process.env.INVITE_PLACES_GLOBAL_DAILY_CAP)
  return Number.isFinite(n) && n > 0 ? n : 200
}

export interface InviteLocationSearchContext {
  /** The acting customer's User id (req.user.sub). */
  userId: string
  /** Caller IP, when known (per-IP abuser tier). */
  ip?: string | null
}

const toSpec = (key: string, cap: Cap): LimitSpec => ({ key, limit: cap.limit, windowSec: cap.windowSec })

/**
 * Atomically check-and-count one invite location-search attempt. Call BEFORE
 * the billable Google searchPlaces() call — an allowed attempt is already
 * counted (Google bills attempts).
 *
 * Throws AppError('LOCATION_SEARCH_RATE_LIMITED', { retryAfter }) when ANY cap
 * blocks — reuses the SAME client-safe code the merchant location flow uses
 * (the provider/limiter internals are never leaked, and there is no
 * customer-facing reason for the two flows to speak different error codes).
 * §SEC.1 semantics: per-IP = abuser key (every attempt counts); global +
 * per-user = cost/victim keys (counted only on allowed attempts).
 */
export async function consumeInviteLocationSearch(
  redis: Redis,
  ctx: InviteLocationSearchContext,
): Promise<void> {
  const c = caps()

  // Global daily cost ceiling — GATE key: checked FIRST, counted only on allowed.
  const gateKeys: LimitSpec[] = [
    {
      key: RedisKey.rateLimitInviteLocSearchGlobalDay(),
      limit: inviteLocationGlobalDailyCap(),
      windowSec: GLOBAL_WINDOW_SEC,
    },
  ]

  // Per-IP cap — ABUSER key (every attempt counts), whenever the IP is known.
  const abuserKeys: LimitSpec[] = []
  if (ctx.ip) {
    abuserKeys.push(toSpec(RedisKey.rateLimitInviteLocSearchIpHour(ctx.ip), c.ipHour))
  }

  // Per-user — VICTIM/cost key, counted only on allowed.
  const victimKeys: LimitSpec[] = [
    toSpec(RedisKey.rateLimitInviteLocSearchUserDay(ctx.userId), c.userDay),
  ]

  const result = await consume(redis, { gateKeys, abuserKeys, victimKeys })

  if (!result.ok) {
    throw new AppError('LOCATION_SEARCH_RATE_LIMITED', { retryAfter: result.retryAfter })
  }
}
