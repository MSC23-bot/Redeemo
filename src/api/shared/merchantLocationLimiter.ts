// src/api/shared/merchantLocationLimiter.ts
//
// Branches PR-6 (§4e) + blueprint §11.3 (LOCKED pre-live gate): the merchant
// Google location-search abuse + cost limiter. Every call to the merchant-facing
// search route (POST /api/v1/merchant/location/search) routes through
// consumeMerchantLocationSearch() — ONE atomic check-and-count — BEFORE the
// billable Google searchPlaces() call.
//
// WHY this exists separately from the wrapper's file counter
// (.cache/google-places-usage.json): that counter is single-process — it resets
// on deploy and is per-instance, so it is unsafe as the production cost ceiling
// for a customer/merchant-reachable flow. The file counter STAYS for the admin
// CLI / dev; the merchant flow uses this multi-instance-safe Redis limiter. The
// global 100/min/IP edge tier is too coarse and the wrapper's 500/day is shared
// with the CLI, so a per-merchant tier is required (blueprint §11.3).
//
// Controls (mirrors smsLimiter / pwdResetLimiter):
//   - Global daily ceiling — GATE key: a platform-wide cost breaker. Checked
//     first (so a platform-wide exhaustion always reports as the gate) and
//     counted ONLY on an allowed search (a burst of blocked attempts must not be
//     able to trip the breaker and deny the lookup to every merchant).
//   - Per-user daily + per-merchant daily — VICTIM keys: checked, counted only
//     when the attempt is allowed.
//   - Per-IP hourly + daily — ABUSER keys: every attempt counts, allowed or
//     blocked, so a hammering requester trips its own limit.
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

// RATE_LIMIT_RELAX only takes effect outside production (mirrors smsLimiter / pwdResetLimiter).
const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

interface Cap {
  limit: number
  windowSec: number
}
const PROD = {
  userDay:     { limit: 60, windowSec: 86400 },
  merchantDay: { limit: 120, windowSec: 86400 },
  ipHour:      { limit: 40, windowSec: 3600 },
  ipDay:       { limit: 120, windowSec: 86400 },
}
const DEV = {
  userDay:     { limit: 100000, windowSec: 86400 },
  merchantDay: { limit: 100000, windowSec: 86400 },
  ipHour:      { limit: 100000, windowSec: 3600 },
  ipDay:       { limit: 100000, windowSec: 86400 },
}
function caps() {
  return RELAX ? DEV : PROD
}

// ── Global daily cost ceiling — env-driven, NEVER relaxed, hard block. ──
// Sits below the wrapper's shared monthly free-tier budget; a daily breaker that
// caps what the merchant flow can spend in one day regardless of how many
// merchants/users hit it. Env-overridable so ops can dial it down without a deploy.
const GLOBAL_WINDOW_SEC = 86400
export function merchantLocationGlobalDailyCap(): number {
  const n = Number(process.env.MERCHANT_LOCATION_GLOBAL_DAILY_CAP)
  return Number.isFinite(n) && n > 0 ? n : 400
}

export interface MerchantLocationSearchContext {
  /** The acting MerchantAdmin id (req.user.sub). */
  userId: string
  /** The resolved merchant id (per-merchant cost/abuse tier). */
  merchantId: string
  /** Caller IP, when known (per-IP abuser tier). */
  ip?: string | null
}

const toSpec = (key: string, cap: Cap): LimitSpec => ({ key, limit: cap.limit, windowSec: cap.windowSec })

/**
 * Atomically check-and-count one merchant location-search attempt. Call BEFORE
 * the billable Google searchPlaces() call — an allowed attempt is already counted
 * (Google bills attempts).
 *
 * Throws AppError('LOCATION_SEARCH_RATE_LIMITED', { retryAfter }) when ANY cap
 * blocks (the route maps every limiter scope to this single client-safe code; the
 * provider/limiter internals are never leaked). §SEC.1 semantics: per-IP = abuser
 * keys (every attempt counts); global + per-user/per-merchant = cost/victim keys
 * (counted only on allowed attempts).
 */
export async function consumeMerchantLocationSearch(
  redis: Redis,
  ctx: MerchantLocationSearchContext,
): Promise<void> {
  const c = caps()

  // Global daily cost ceiling — GATE key: checked FIRST, counted only on allowed.
  const gateKeys: LimitSpec[] = [
    {
      key: RedisKey.rateLimitMerchantLocSearchGlobalDay(),
      limit: merchantLocationGlobalDailyCap(),
      windowSec: GLOBAL_WINDOW_SEC,
    },
  ]

  // Per-IP caps — ABUSER keys (every attempt counts), whenever the IP is known.
  const abuserKeys: LimitSpec[] = []
  if (ctx.ip) {
    abuserKeys.push(toSpec(RedisKey.rateLimitMerchantLocSearchIpHour(ctx.ip), c.ipHour))
    abuserKeys.push(toSpec(RedisKey.rateLimitMerchantLocSearchIpDay(ctx.ip), c.ipDay))
  }

  // Per-user / per-merchant — VICTIM/cost keys, counted only on allowed.
  const victimKeys: LimitSpec[] = [
    toSpec(RedisKey.rateLimitMerchantLocSearchUserDay(ctx.userId), c.userDay),
    toSpec(RedisKey.rateLimitMerchantLocSearchMerchantDay(ctx.merchantId), c.merchantDay),
  ]

  const result = await consume(redis, { gateKeys, abuserKeys, victimKeys })

  if (!result.ok) {
    throw new AppError('LOCATION_SEARCH_RATE_LIMITED', { retryAfter: result.retryAfter })
  }
}
