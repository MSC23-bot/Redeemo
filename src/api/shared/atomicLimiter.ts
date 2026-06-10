// src/api/shared/atomicLimiter.ts
//
// §SEC.1 (Phase 0 PR-0.2): ONE atomic Redis round-trip for rate-limit counting.
// Replaces the read-then-incr pattern (assert* + record*) that could overshoot
// caps under a concurrent burst — the victim-inbox-bombing vector once real
// emails send (deploy-security-runbook §6 pre-send HARD gate).
//
// Two key classes with deliberately different counting semantics:
//
//   abuserKeys  — identify the REQUESTER (per-IP, …). Every attempt counts,
//                 allowed or blocked: INCR first, then check. An attacker
//                 hammering a blocked target trips their own limits; growth
//                 past the cap is self-harm only.
//
//   victimKeys  — identify the TARGET or a shared cost budget (per-email,
//                 per-phone, per-user, global SMS spend cap). CHECKED first,
//                 incremented ONLY when the attempt is allowed. A blocked
//                 attempt never burns the victim's quota (an attacker cannot
//                 extend a victim's lockout window or exhaust a cost breaker
//                 with requests that were never served).
//
//   cooldown    — optional SET-NX-EX serializer (e.g. the per-phone OTP resend
//                 cooldown). Acquired INSIDE the script, after the volume
//                 checks (volume errors take precedence) and before the victim
//                 increments (a cooldown-blocked rapid double-tap doesn't burn
//                 the victim's hourly quota).
//
// Fixed-window counters: TTL is set on a key's FIRST increment only — the same
// convention the previous limiters used.
//
// The whole check-and-count runs as ONE Lua script: Redis executes scripts
// atomically, so concurrent calls serialize server-side and the counters can
// never overshoot — the property pinned by tests/api/shared/atomic-limiter.test.ts
// against real Redis (50 concurrent attempts at limit 5 ⇒ exactly 5 allowed).
//
// luaConsumeShim is a pure-JS mirror of the script for STATEFUL FAKES in unit
// tests (no real Redis). It must behave exactly like the Lua — pinned by the
// differential suite in atomic-limiter.test.ts. If you change the script,
// change the shim, and the differential tests will hold you to it.

import type Redis from 'ioredis'

export interface LimitSpec {
  key: string
  limit: number
  windowSec: number
}

export interface ConsumeInput {
  /** Requester-identity counters — EVERY attempt counts (incr-then-check). */
  abuserKeys?: LimitSpec[]
  /** Target/cost counters — checked first, counted ONLY on an allowed attempt. */
  victimKeys?: LimitSpec[]
  /** Optional SET-NX-EX serializer, acquired only when every check passes. */
  cooldown?: { key: string; ttlSec: number }
}

export type ConsumeResult =
  | { ok: true }
  | { ok: false; scope: 'abuser' | 'victim' | 'cooldown'; blockedKey: string; retryAfter: number }

// KEYS = [...abuserKeys, ...victimKeys, cooldownKey?]
// ARGV = [nAbuser, nVictim, (limit, windowSec) per abuser, (limit, windowSec) per victim, cooldownTtlSec?]
const CONSUME_LUA = `
local nA = tonumber(ARGV[1])
local nV = tonumber(ARGV[2])
local base = 2
-- 1) Abuser keys: every attempt counts. INCR first, TTL on first incr, then check.
for i = 1, nA do
  local limit = tonumber(ARGV[base + (i - 1) * 2 + 1])
  local window = tonumber(ARGV[base + (i - 1) * 2 + 2])
  local v = redis.call('INCR', KEYS[i])
  if v == 1 then redis.call('EXPIRE', KEYS[i], window) end
  if v > limit then
    return {0, redis.call('TTL', KEYS[i]), 'abuser', KEYS[i]}
  end
end
-- 2) Victim/cost keys: CHECK ONLY — a blocked attempt must not burn these.
local vbase = base + nA * 2
for i = 1, nV do
  local limit = tonumber(ARGV[vbase + (i - 1) * 2 + 1])
  local key = KEYS[nA + i]
  local c = tonumber(redis.call('GET', key) or '0')
  if c >= limit then
    return {0, redis.call('TTL', key), 'victim', key}
  end
end
-- 3) Cooldown (after the volume checks so volume errors take precedence).
local cdIdx = nA + nV + 1
if #KEYS >= cdIdx then
  local ttl = tonumber(ARGV[vbase + nV * 2 + 1])
  local okSet = redis.call('SET', KEYS[cdIdx], '1', 'EX', ttl, 'NX')
  if not okSet then
    return {0, redis.call('TTL', KEYS[cdIdx]), 'cooldown', KEYS[cdIdx]}
  end
end
-- 4) All clear: NOW count the attempt on the victim/cost keys.
for i = 1, nV do
  local window = tonumber(ARGV[vbase + (i - 1) * 2 + 2])
  local key = KEYS[nA + i]
  local v = redis.call('INCR', key)
  if v == 1 then redis.call('EXPIRE', key, window) end
end
return {1}
`

/**
 * Atomically check-and-count one attempt across every counter. Returns
 * `{ ok: false, scope, blockedKey, retryAfter }` when any limit blocks —
 * `retryAfter` is the blocking key's TTL, falling back to its configured
 * window when the key has no TTL.
 */
export async function consume(redis: Redis, input: ConsumeInput): Promise<ConsumeResult> {
  const abusers = input.abuserKeys ?? []
  const victims = input.victimKeys ?? []

  const keys: string[] = [...abusers.map((s) => s.key), ...victims.map((s) => s.key)]
  const argv: Array<string | number> = [abusers.length, victims.length]
  for (const s of abusers) argv.push(s.limit, s.windowSec)
  for (const s of victims) argv.push(s.limit, s.windowSec)
  if (input.cooldown) {
    keys.push(input.cooldown.key)
    argv.push(input.cooldown.ttlSec)
  }

  const raw = (await redis.eval(CONSUME_LUA, keys.length, ...keys, ...argv)) as
    | [number]
    | [number, number, string, string]

  if (raw[0] === 1) return { ok: true }

  const [, ttl, scope, blockedKey] = raw as [number, number, string, string]
  return {
    ok: false,
    scope: scope as 'abuser' | 'victim' | 'cooldown',
    blockedKey,
    retryAfter: ttl > 0 ? ttl : fallbackWindow(input, blockedKey),
  }
}

function fallbackWindow(input: ConsumeInput, blockedKey: string): number {
  for (const s of input.abuserKeys ?? []) if (s.key === blockedKey) return s.windowSec
  for (const s of input.victimKeys ?? []) if (s.key === blockedKey) return s.windowSec
  if (input.cooldown?.key === blockedKey) return input.cooldown.ttlSec
  return 60
}

// ── Test-fake mirror ──────────────────────────────────────────────────────────
//
// Pure-JS re-implementation of CONSUME_LUA over a Map, for stateful fake-Redis
// objects in unit tests (which have no Lua engine). NOT used in production.
// Semantics are pinned ≡ the Lua by the differential suite in
// tests/api/shared/atomic-limiter.test.ts — change both together.

export function luaConsumeShim(
  store: Map<string, string>,
  input: ConsumeInput,
  opts: { ttlOf?: (key: string) => number } = {},
): ConsumeResult {
  const ttlOf = opts.ttlOf ?? (() => -1)
  const retryAfter = (key: string) => {
    const t = ttlOf(key)
    return t > 0 ? t : fallbackWindow(input, key)
  }

  // 1) Abuser keys: always count, then check.
  for (const s of input.abuserKeys ?? []) {
    const v = (parseInt(store.get(s.key) ?? '0', 10) || 0) + 1
    store.set(s.key, String(v))
    if (v > s.limit) return { ok: false, scope: 'abuser', blockedKey: s.key, retryAfter: retryAfter(s.key) }
  }
  // 2) Victim/cost keys: check only.
  for (const s of input.victimKeys ?? []) {
    const c = parseInt(store.get(s.key) ?? '0', 10) || 0
    if (c >= s.limit) return { ok: false, scope: 'victim', blockedKey: s.key, retryAfter: retryAfter(s.key) }
  }
  // 3) Cooldown: SET NX.
  if (input.cooldown) {
    if (store.has(input.cooldown.key)) {
      return { ok: false, scope: 'cooldown', blockedKey: input.cooldown.key, retryAfter: retryAfter(input.cooldown.key) }
    }
    store.set(input.cooldown.key, '1')
  }
  // 4) All clear: count the victims.
  for (const s of input.victimKeys ?? []) {
    store.set(s.key, String((parseInt(store.get(s.key) ?? '0', 10) || 0) + 1))
  }
  return { ok: true }
}
