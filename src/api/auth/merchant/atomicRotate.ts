// Merchant-only logout durability primitives.
//
// Spec: docs/superpowers/specs/2026-07-06-merchant-logout-durability-backend-design.md
// (branch docs/merchant-web-session-cache-isolation). Sections 3.1 (atomic
// compare-and-rotate), 3.2 (tombstone), 3.3 (signed-JWT authoritative revoke +
// possession fallback), 3.4 (bounded failure).
//
// SCOPE (deliberate, load-bearing): this file is MERCHANT-ONLY. The shared
// refresh-token helpers in src/api/shared/session.ts
// (storeRefreshToken/validateRefreshToken/revokeRefreshToken) are used
// identically by customer/admin/branch and are left BYTE-UNCHANGED — this
// module does not touch them. A cross-role convergence (promoting this atomic
// rotate + signed-revoke pattern to all four roles) is a deliberate FOLLOW-UP
// (design §6 R2), not done here, so the blast radius of this change is
// contained to the merchant auth surface only.
import crypto from 'crypto'
import type Redis from 'ioredis'
import { RedisKey } from '../../shared/redis-keys'
import { hashRefreshToken } from '../../shared/tokens'
import { REFRESH_TOKEN_TTL_SECONDS } from '../../shared/session'

// ── §3.1 + §3.2: single-key atomic compare-and-rotate, with a tombstone check ──
//
// KEYS[1] = refresh-token key, KEYS[2] = session-revoked tombstone key.
// ARGV[1] = expectedHash (the presented token's hash, re-verified at rotation
//           time so a concurrent mutation between the app's pre-check GET and
//           this EVAL is caught), ARGV[2] = replacementValue (the COMPLETE
//           pre-serialized JSON the app wants to store), ARGV[3] = ttlSeconds.
//
// Step 0 (tombstone) MUST run before the compare-and-rotate: a pending
// revocation from a prior bounded-failure logout (§3.4) must refuse AND
// self-clean, not merely refuse, so tombstone growth stays bounded to one
// enforcement per failed logout.
const ROTATE_LUA = `
if redis.call('GET', KEYS[2]) then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
  return {'refused', 'revoked'}
end
local cur = redis.call('GET', KEYS[1])
if cur == false then
  return {'refused', 'missing'}
end
local ok, parsed = pcall(cjson.decode, cur)
if not ok then
  return {'refused', 'corrupt'}
end
if parsed.tokenHash ~= ARGV[1] then
  return {'refused', 'mismatch'}
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return {'ok'}
`

export type RotateRefusalReason = 'missing' | 'mismatch' | 'corrupt' | 'revoked'

export type RotateResult =
  | { ok: true }
  | { ok: false; reason: RotateRefusalReason }

export interface RotateParams {
  entityId: string
  sessionId: string
  /** hashRefreshToken(presentedRefreshToken) — recomputed by the caller so the
   *  Lua re-verifies the token still matches at rotation time (closes the
   *  resurrection race between the app's pre-check GET and this EVAL). */
  expectedHash: string
  /** The COMPLETE serialized replacement value (tokenHash/deviceId/deviceType/
   *  deviceName/createdAt) — the app builds the whole JSON so the Lua never
   *  constructs it. */
  replacementValue: string
  ttlSeconds: number
}

export async function rotateMerchantRefreshTokenAtomic(
  redis: Redis,
  params: RotateParams
): Promise<RotateResult> {
  const tokenKey = RedisKey.refreshToken('merchant', params.entityId, params.sessionId)
  const tombstoneKey = RedisKey.sessionRevoked('merchant', params.entityId, params.sessionId)

  const raw = (await redis.eval(
    ROTATE_LUA,
    2,
    tokenKey,
    tombstoneKey,
    params.expectedHash,
    params.replacementValue,
    String(params.ttlSeconds)
  )) as [string] | [string, RotateRefusalReason]

  if (raw[0] === 'ok') return { ok: true }
  return { ok: false, reason: raw[1] as RotateRefusalReason }
}

// ── §3.3 + §3.4: signed-JWT authoritative revoke (unconditional DEL) ──────────

const REVOKE_MAX_ATTEMPTS = 3
const REVOKE_RETRY_DELAY_MS = 100

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type RevokeOutcome = 'confirmed' | 'pending' | 'unavailable'

/**
 * Unconditional DEL of the merchant refresh-token key for a PROVEN
 * (entityId, sessionId) — the identity must already be established via a
 * signature-verified access-token JWT (never the raw/unsigned body). Wins the
 * concurrent-refresh race in every interleaving because it does not depend on
 * the CURRENT token value (design §3.5): refresh-first → this DEL removes
 * whatever it rotated to; logout-first → the refresh Lua's own GET returns nil
 * (or the tombstone is present) and is refused.
 *
 * Bounded in-request retry rides out transient Redis blips (§3.4 point 3). If
 * the DEL still cannot be confirmed after MAX attempts, a pending-revocation
 * tombstone is written so the refresh Lua's step-0 check enforces the
 * revocation lazily on the session's NEXT refresh attempt (§3.4 point 4) — no
 * new worker/infra. If even the tombstone write fails (Redis fully
 * unreachable), the outcome is the honestly-degraded 'unavailable' (§3.4
 * point 7): NOTHING re-attempts automatically; the session may remain valid
 * until natural expiry, a later successful logout, or an operator action.
 */
export async function revokeMerchantSessionUnconditional(
  redis: Redis,
  params: { entityId: string; sessionId: string }
): Promise<RevokeOutcome> {
  const tokenKey = RedisKey.refreshToken('merchant', params.entityId, params.sessionId)
  const tombstoneKey = RedisKey.sessionRevoked('merchant', params.entityId, params.sessionId)

  for (let attempt = 1; attempt <= REVOKE_MAX_ATTEMPTS; attempt++) {
    try {
      await redis.del(tokenKey)
      return 'confirmed'
    } catch {
      if (attempt < REVOKE_MAX_ATTEMPTS) await sleep(REVOKE_RETRY_DELAY_MS)
    }
  }

  try {
    await redis.set(tombstoneKey, '1', 'EX', REFRESH_TOKEN_TTL_SECONDS)
    return 'pending'
  } catch {
    return 'unavailable'
  }
}

// ── §3.3: rare no-access-token fallback — refresh-token possession ───────────

export type PossessionOutcome = 'confirmed' | 'stale' | 'unavailable'

/**
 * Reachable ONLY when no access token is presented at all (a cold/corner-case
 * client state). Validates the presented refresh token's hash against the
 * CURRENTLY stored value and DELs on match. Disclosed residual (design §3.5):
 * if a concurrent refresh rotates FIRST, the presented (now stale) token
 * mismatches the freshly-rotated hash and this returns 'stale' with NO
 * mutation — the session survives that interleaving until natural expiry or a
 * later successful logout. This is acceptable because the fallback is only
 * reachable when no signed proof exists, which is not the normal authenticated
 * path (the client always captures an access token when one exists).
 */
export async function revokeMerchantSessionByPossession(
  redis: Redis,
  params: { entityId: string; sessionId: string; presentedRefreshToken: string }
): Promise<PossessionOutcome> {
  const tokenKey = RedisKey.refreshToken('merchant', params.entityId, params.sessionId)

  let stored: string | null
  try {
    stored = await redis.get(tokenKey)
  } catch {
    return 'unavailable'
  }

  // Already absent — uniform response (no session-existence oracle): treat
  // exactly like a successful revoke of a now-dead session.
  if (stored === null) return 'confirmed'

  let parsed: { tokenHash?: string }
  try {
    parsed = JSON.parse(stored)
  } catch {
    return 'stale'
  }

  const storedHash = parsed.tokenHash ?? ''
  const presentedHash = hashRefreshToken(params.presentedRefreshToken)
  const match =
    presentedHash.length === storedHash.length &&
    crypto.timingSafeEqual(Buffer.from(presentedHash, 'hex'), Buffer.from(storedHash, 'hex'))

  if (!match) return 'stale'

  try {
    await redis.del(tokenKey)
    return 'confirmed'
  } catch {
    return 'unavailable'
  }
}
