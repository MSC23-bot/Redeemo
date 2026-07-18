// src/api/shared/agreementEvidenceLimiter.ts
//
// D65 lane-2 evidence-read limiter (decision doc 2026-07-15-d65-legal-object §11/§17). The
// admin signing-evidence surface has two read routes gated on this ONE limiter:
//   - GET /api/v1/admin/merchants/:id/agreement/evidence      (ordinary-tier detail)
//   - GET /api/v1/admin/merchants/:id/agreement/evidence/pdf  (server-proxied PDF retrieval:
//     an R2 round-trip + a sha256 re-hash, so the more expensive of the two).
// A per-caller cap is a REQUIRED bounded acceptance criterion for the surface (not optional):
// it stops a script from hammering the evidence read (and, for the PDF route, the storage
// round-trip). Sharing ONE limiter across both routes bounds the combined evidence surface;
// a legitimate flow (open detail, then download) issues only a couple of calls.
//
// Mirrors the established atomic-limiter convention (agreementPreviewLimiter.ts): the whole
// check-and-count runs as ONE Lua script (shared/atomicLimiter) so a concurrent burst can
// never overshoot the caps. BOTH tiers are ABUSER keys (every attempt counts, allowed or
// blocked) because they identify the REQUESTER, not a victim:
//   - Per-admin per-minute : the authenticated admin (req.user.sub). The primary bound; an
//     admin reviews evidence a handful of times, so a generous per-minute cap never impedes
//     legitimate review while still bounding an automated caller.
//   - Per-IP per-minute    : defence in depth against one machine cycling admin sessions.
//
// Guardrails:
//   - RATE_LIMIT_RELAX widens the caps in dev/test ONLY (never in production), so the unit
//     suite is not throttled. It never disables the bound in a shared environment.
//   - Chosen defaults: 30 reads / admin / minute, 60 reads / IP / minute (env-overridable).
//     Lower than the ceremony preview (60/120): evidence review is rarer, and the PDF route
//     is heavier, so a tighter bound is the safer default.

import type Redis from 'ioredis'
import { AppError } from './errors'
import { RedisKey } from './redis-keys'
import { consume, type LimitSpec } from './atomicLimiter'

// RATE_LIMIT_RELAX only takes effect outside production (mirrors the preview limiter).
const RELAX = process.env.RATE_LIMIT_RELAX === 'true' && process.env.NODE_ENV !== 'production'

const WINDOW_SEC = 60
const DEV_LIMIT = 100000

/** Per-admin evidence reads per minute (the primary per-caller bound). Default 30. */
export function agreementEvidenceAdminPerMin(): number {
  if (RELAX) return DEV_LIMIT
  const n = Number(process.env.AGREEMENT_EVIDENCE_ADMIN_PER_MIN)
  return Number.isFinite(n) && n > 0 ? n : 30
}

/** Per-IP evidence reads per minute (defence in depth). Default 60. */
export function agreementEvidenceIpPerMin(): number {
  if (RELAX) return DEV_LIMIT
  const n = Number(process.env.AGREEMENT_EVIDENCE_IP_PER_MIN)
  return Number.isFinite(n) && n > 0 ? n : 60
}

export interface AgreementEvidenceContext {
  /** The authenticated admin id (req.user.sub): the primary per-caller abuser tier. */
  adminId: string
  /** Caller IP, when known: defence-in-depth abuser tier. */
  ip?: string | null
}

/**
 * Atomically check-and-count one agreement-evidence read attempt. Call BEFORE the DB read /
 * storage round-trip in the route handler. Throws
 * AppError('AGREEMENT_EVIDENCE_RATE_LIMITED', { retryAfter }) when either cap blocks.
 */
export async function consumeAgreementEvidenceRead(
  redis: Redis,
  ctx: AgreementEvidenceContext,
): Promise<void> {
  const abuserKeys: LimitSpec[] = [
    {
      key: RedisKey.rateLimitAgreementEvidenceAdminMin(ctx.adminId),
      limit: agreementEvidenceAdminPerMin(),
      windowSec: WINDOW_SEC,
    },
  ]
  if (ctx.ip) {
    abuserKeys.push({
      key: RedisKey.rateLimitAgreementEvidenceIpMin(ctx.ip),
      limit: agreementEvidenceIpPerMin(),
      windowSec: WINDOW_SEC,
    })
  }

  const result = await consume(redis, { abuserKeys })
  if (!result.ok) {
    throw new AppError('AGREEMENT_EVIDENCE_RATE_LIMITED', { retryAfter: result.retryAfter })
  }
}
