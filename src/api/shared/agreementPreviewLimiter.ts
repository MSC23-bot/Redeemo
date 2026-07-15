// src/api/shared/agreementPreviewLimiter.ts
//
// D65 personalised-agreement admin PREVIEW limiter (decision doc 2026-07-15-d65-legal-object
// §4b). The preview route (POST /api/v1/admin/merchants/:id/agreement/preview) renders the
// merchant-personalised agreement body server-side each time the ceremony's signer inputs
// settle. That render is cheap but must be BOUNDED (a hard acceptance criterion, not
// optional): a per-caller cap stops a script from hammering the render endpoint.
//
// Mirrors the established atomic-limiter convention (inviteSubmitLimiter.ts): the whole
// check-and-count runs as ONE Lua script (shared/atomicLimiter) so a concurrent burst can
// never overshoot the caps. BOTH tiers are ABUSER keys (every attempt counts, allowed or
// blocked) because they identify the REQUESTER, not a victim:
//   - Per-admin per-minute  : the authenticated ceremony operator (req.user.sub). This is
//     the primary bound; a human ceremony re-previews only when the name/role settles, so a
//     generous per-minute cap never impedes a real signing.
//   - Per-IP per-minute     : defence in depth against one machine cycling admin sessions.
//
// Guardrails:
//   - RATE_LIMIT_RELAX widens the caps in dev/test ONLY (never in production), so the unit
//     suite is not throttled. It never disables the bound in a shared environment.
//   - Chosen defaults: 60 previews / admin / minute, 120 previews / IP / minute
//     (env-overridable). A signing ceremony issues a handful of previews; 60/min per admin
//     is generous headroom for a human while still bounding an automated caller.

import type Redis from 'ioredis'
import { AppError } from './errors'
import { RedisKey } from './redis-keys'
import { consume, type LimitSpec } from './atomicLimiter'

// RATE_LIMIT_RELAX only takes effect outside production (mirrors the invite limiters).
const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

const WINDOW_SEC = 60
const DEV_LIMIT = 100000

/** Per-admin previews per minute (the primary per-caller bound). Default 60. */
export function agreementPreviewAdminPerMin(): number {
  if (RELAX) return DEV_LIMIT
  const n = Number(process.env.AGREEMENT_PREVIEW_ADMIN_PER_MIN)
  return Number.isFinite(n) && n > 0 ? n : 60
}

/** Per-IP previews per minute (defence in depth). Default 120. */
export function agreementPreviewIpPerMin(): number {
  if (RELAX) return DEV_LIMIT
  const n = Number(process.env.AGREEMENT_PREVIEW_IP_PER_MIN)
  return Number.isFinite(n) && n > 0 ? n : 120
}

export interface AgreementPreviewContext {
  /** The authenticated admin id (req.user.sub): the primary per-caller abuser tier. */
  adminId: string
  /** Caller IP, when known: defence-in-depth abuser tier. */
  ip?: string | null
}

/**
 * Atomically check-and-count one agreement-preview attempt. Call BEFORE the render in the
 * route handler. Throws AppError('AGREEMENT_PREVIEW_RATE_LIMITED', { retryAfter }) when
 * either cap blocks.
 */
export async function consumeAgreementPreview(
  redis: Redis,
  ctx: AgreementPreviewContext,
): Promise<void> {
  const abuserKeys: LimitSpec[] = [
    {
      key: RedisKey.rateLimitAgreementPreviewAdminMin(ctx.adminId),
      limit: agreementPreviewAdminPerMin(),
      windowSec: WINDOW_SEC,
    },
  ]
  if (ctx.ip) {
    abuserKeys.push({
      key: RedisKey.rateLimitAgreementPreviewIpMin(ctx.ip),
      limit: agreementPreviewIpPerMin(),
      windowSec: WINDOW_SEC,
    })
  }

  const result = await consume(redis, { abuserKeys })
  if (!result.ok) {
    throw new AppError('AGREEMENT_PREVIEW_RATE_LIMITED', { retryAfter: result.retryAfter })
  }
}

// ── D65 self-serve (merchant) preview limiter (FIX 2) ─────────────────────────
//
// The merchant-authenticated own-merchant preview route
// (POST /api/v1/merchant/onboarding/agreement/preview) shares the SAME render/normalize/hash
// module the ceremony uses, so it carries the SAME bounded-render acceptance criterion
// (decision doc §4b). Same atomic-limiter convention; both tiers are ABUSER keys:
//   - Per-merchant per-minute : the resolved OWN merchant (one merchant cannot hammer the
//     render). Chosen default 30/min - a self-serve owner re-previews only when the typed name
//     or role settles, so 30/min is generous human headroom while bounding an automated caller.
//   - Per-IP per-minute       : defence in depth against one machine cycling merchant sessions.
//     Chosen default 60/min. Both env-overridable; RATE_LIMIT_RELAX widens them in dev/test only.

/** Per-merchant previews per minute (the primary per-caller bound). Default 30. */
export function merchantAgreementPreviewMerchantPerMin(): number {
  if (RELAX) return DEV_LIMIT
  const n = Number(process.env.MERCHANT_AGREEMENT_PREVIEW_MERCHANT_PER_MIN)
  return Number.isFinite(n) && n > 0 ? n : 30
}

/** Per-IP previews per minute (defence in depth). Default 60. */
export function merchantAgreementPreviewIpPerMin(): number {
  if (RELAX) return DEV_LIMIT
  const n = Number(process.env.MERCHANT_AGREEMENT_PREVIEW_IP_PER_MIN)
  return Number.isFinite(n) && n > 0 ? n : 60
}

export interface MerchantAgreementPreviewContext {
  /** The resolved OWN merchant id: the primary per-caller abuser tier. */
  merchantId: string
  /** Caller IP, when known: defence-in-depth abuser tier. */
  ip?: string | null
}

/**
 * Atomically check-and-count one self-serve agreement-preview attempt. Call BEFORE the render
 * in the route handler (after resolving the own merchant). Throws
 * AppError('AGREEMENT_PREVIEW_RATE_LIMITED', { retryAfter }) when either cap blocks.
 */
export async function consumeMerchantAgreementPreview(
  redis: Redis,
  ctx: MerchantAgreementPreviewContext,
): Promise<void> {
  const abuserKeys: LimitSpec[] = [
    {
      key: RedisKey.rateLimitMerchantAgreementPreviewMerchantMin(ctx.merchantId),
      limit: merchantAgreementPreviewMerchantPerMin(),
      windowSec: WINDOW_SEC,
    },
  ]
  if (ctx.ip) {
    abuserKeys.push({
      key: RedisKey.rateLimitMerchantAgreementPreviewIpMin(ctx.ip),
      limit: merchantAgreementPreviewIpPerMin(),
      windowSec: WINDOW_SEC,
    })
  }

  const result = await consume(redis, { abuserKeys })
  if (!result.ok) {
    throw new AppError('AGREEMENT_PREVIEW_RATE_LIMITED', { retryAfter: result.retryAfter })
  }
}
