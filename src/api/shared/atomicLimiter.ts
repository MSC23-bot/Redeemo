// src/api/shared/atomicLimiter.ts
//
// §SEC.1 (Phase 0 PR-0.2): ONE atomic Redis round-trip for rate-limit counting.
// Replaces the read-then-incr pattern (assert* + record*) that could overshoot
// caps under a concurrent burst — the victim-inbox-bombing vector once real
// emails send (deploy-security-runbook §6 pre-send HARD gate).
//
// THREE key classes with deliberately different semantics + precedence:
//
//   gateKeys    — platform-wide COST/CAPACITY breakers (e.g. the global daily
//                 SMS spend cap). CHECKED FIRST (highest precedence — its block
//                 wins the error code over everything else) and counted ONLY on
//                 an allowed attempt. Count-on-allowed is deliberate anti-DoS: a
//                 burst of blocked attempts must NOT be able to trip the
//                 platform breaker and deny the service to every legitimate user.
//
//   abuserKeys  — identify the REQUESTER (per-IP, …). Every attempt counts,
//                 allowed or blocked: INCR first, then check. An attacker
//                 hammering a blocked target trips their own limits; growth
//                 past the cap is self-harm only.
//
//   victimKeys  — identify the TARGET (per-email, per-phone, per-user, …).
//                 CHECKED, incremented ONLY when the attempt is allowed. A
//                 blocked attempt never burns a victim's quota (an attacker
//                 cannot extend a victim's lockout window with requests that
//                 were never served).
//
//   cooldown    — optional SET-NX-EX serializer (e.g. the per-phone OTP resend
//                 cooldown). Acquired INSIDE the script, AFTER the volume checks
//                 (volume errors take precedence) and BEFORE the gate/victim
//                 increments (a cooldown-blocked rapid double-tap doesn't burn
//                 the hourly quota or the cost cap).
//
// Precedence (error reported): gate → abuser → victim → cooldown.
// Fixed-window counters: TTL is set on a key's FIRST increment only.
//
// The whole check-and-count runs as ONE Lua script: Redis executes scripts
// atomically, so concurrent calls serialize server-side and the counters can
// never overshoot — pinned by tests/api/shared/atomic-limiter.test.ts against
// real Redis (50 concurrent attempts at limit 5 ⇒ exactly 5 allowed).
//
// luaConsumeShim / shimEval are a pure-JS mirror of the script for STATEFUL
// FAKES in unit tests (no real Redis). They must behave exactly like the Lua —
// pinned by the differential suite in atomic-limiter.test.ts.

import type Redis from 'ioredis'

export interface LimitSpec {
  key: string
  limit: number
  windowSec: number
}

export interface ConsumeInput {
  /** Cost/capacity breakers — checked FIRST, counted only on an allowed attempt. */
  gateKeys?: LimitSpec[]
  /** Requester-identity counters — EVERY attempt counts (incr-then-check). */
  abuserKeys?: LimitSpec[]
  /** Target counters — checked, counted ONLY on an allowed attempt. */
  victimKeys?: LimitSpec[]
  /** Optional SET-NX-EX serializer, acquired only when every check passes. */
  cooldown?: { key: string; ttlSec: number }
}

export type ConsumeScope = 'gate' | 'abuser' | 'victim' | 'cooldown'

export type ConsumeResult =
  | { ok: true }
  | { ok: false; scope: ConsumeScope; blockedKey: string; retryAfter: number }

// KEYS = [...gateKeys, ...abuserKeys, ...victimKeys, cooldownKey?]
// ARGV = [nGate, nAbuser, nVictim,
//         (limit, windowSec) per gate, per abuser, per victim,
//         cooldownTtlSec?]
const CONSUME_LUA = `
local nG = tonumber(ARGV[1])
local nA = tonumber(ARGV[2])
local nV = tonumber(ARGV[3])
local gbase = 3
-- 1) Gate keys: highest-precedence cost/capacity breakers. CHECK ONLY here.
for i = 1, nG do
  local limit = tonumber(ARGV[gbase + (i - 1) * 2 + 1])
  local key = KEYS[i]
  local c = tonumber(redis.call('GET', key) or '0')
  if c >= limit then
    return {0, redis.call('TTL', key), 'gate', key}
  end
end
-- 2) Abuser keys: every attempt counts. INCR, TTL on first incr, then check.
local abase = gbase + nG * 2
for i = 1, nA do
  local limit = tonumber(ARGV[abase + (i - 1) * 2 + 1])
  local window = tonumber(ARGV[abase + (i - 1) * 2 + 2])
  local key = KEYS[nG + i]
  local v = redis.call('INCR', key)
  if v == 1 then redis.call('EXPIRE', key, window) end
  if v > limit then
    return {0, redis.call('TTL', key), 'abuser', key}
  end
end
-- 3) Victim keys: CHECK ONLY — a blocked attempt must not burn these.
local vbase = abase + nA * 2
for i = 1, nV do
  local limit = tonumber(ARGV[vbase + (i - 1) * 2 + 1])
  local key = KEYS[nG + nA + i]
  local c = tonumber(redis.call('GET', key) or '0')
  if c >= limit then
    return {0, redis.call('TTL', key), 'victim', key}
  end
end
-- 4) Cooldown (after the volume checks so volume errors take precedence).
local cdIdx = nG + nA + nV + 1
if #KEYS >= cdIdx then
  local ttl = tonumber(ARGV[vbase + nV * 2 + 1])
  local okSet = redis.call('SET', KEYS[cdIdx], '1', 'EX', ttl, 'NX')
  if not okSet then
    return {0, redis.call('TTL', KEYS[cdIdx]), 'cooldown', KEYS[cdIdx]}
  end
end
-- 5) All clear: NOW count the attempt on the gate + victim keys (cost + quota).
for i = 1, nG do
  local window = tonumber(ARGV[gbase + (i - 1) * 2 + 2])
  local key = KEYS[i]
  local v = redis.call('INCR', key)
  if v == 1 then redis.call('EXPIRE', key, window) end
end
for i = 1, nV do
  local window = tonumber(ARGV[vbase + (i - 1) * 2 + 2])
  local key = KEYS[nG + nA + i]
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
  const gates = input.gateKeys ?? []
  const abusers = input.abuserKeys ?? []
  const victims = input.victimKeys ?? []

  const keys: string[] = [
    ...gates.map((s) => s.key),
    ...abusers.map((s) => s.key),
    ...victims.map((s) => s.key),
  ]
  const argv: Array<string | number> = [gates.length, abusers.length, victims.length]
  for (const s of gates) argv.push(s.limit, s.windowSec)
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
    scope: scope as ConsumeScope,
    blockedKey,
    retryAfter: ttl > 0 ? ttl : fallbackWindow(input, blockedKey),
  }
}

function fallbackWindow(input: ConsumeInput, blockedKey: string): number {
  for (const s of input.gateKeys ?? []) if (s.key === blockedKey) return s.windowSec
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
  const blocked = (scope: ConsumeScope, key: string): ConsumeResult => {
    const t = ttlOf(key)
    return { ok: false, scope, blockedKey: key, retryAfter: t > 0 ? t : fallbackWindow(input, key) }
  }

  // 1) Gate keys: check only.
  for (const s of input.gateKeys ?? []) {
    const c = parseInt(store.get(s.key) ?? '0', 10) || 0
    if (c >= s.limit) return blocked('gate', s.key)
  }
  // 2) Abuser keys: always count, then check.
  for (const s of input.abuserKeys ?? []) {
    const v = (parseInt(store.get(s.key) ?? '0', 10) || 0) + 1
    store.set(s.key, String(v))
    if (v > s.limit) return blocked('abuser', s.key)
  }
  // 3) Victim keys: check only.
  for (const s of input.victimKeys ?? []) {
    const c = parseInt(store.get(s.key) ?? '0', 10) || 0
    if (c >= s.limit) return blocked('victim', s.key)
  }
  // 4) Cooldown: SET NX.
  if (input.cooldown) {
    if (store.has(input.cooldown.key)) return blocked('cooldown', input.cooldown.key)
    store.set(input.cooldown.key, '1')
  }
  // 5) All clear: count the gate + victim keys.
  for (const s of input.gateKeys ?? []) {
    store.set(s.key, String((parseInt(store.get(s.key) ?? '0', 10) || 0) + 1))
  }
  for (const s of input.victimKeys ?? []) {
    store.set(s.key, String((parseInt(store.get(s.key) ?? '0', 10) || 0) + 1))
  }
  return { ok: true }
}

/**
 * Wire-level adapter for stateful fake-Redis objects in tests: implements the
 * `eval` call surface (KEYS/ARGV exactly as consume() packs them) on top of
 * luaConsumeShim, returning the same tuple shape the Lua returns. Lets a fake
 * expose `eval: (lua, n, ...rest) => shimEval(store, rest.slice(0,n), rest.slice(n))`
 * so service-level tests exercise the REAL consume() packing + mapping code.
 */
export function shimEval(
  store: Map<string, string>,
  keys: string[],
  argv: Array<string | number>,
  opts: { ttlOf?: (key: string) => number } = {},
): [number] | [number, number, string, string] {
  const nG = Number(argv[0])
  const nA = Number(argv[1])
  const nV = Number(argv[2])
  let i = 3
  const take = (count: number, keyOffset: number): LimitSpec[] => {
    const out: LimitSpec[] = []
    for (let j = 0; j < count; j++, i += 2) {
      out.push({ key: keys[keyOffset + j], limit: Number(argv[i]), windowSec: Number(argv[i + 1]) })
    }
    return out
  }
  const gateKeys = take(nG, 0)
  const abuserKeys = take(nA, nG)
  const victimKeys = take(nV, nG + nA)
  const cooldown = keys.length > nG + nA + nV ? { key: keys[nG + nA + nV], ttlSec: Number(argv[i]) } : undefined

  const r = luaConsumeShim(store, { gateKeys, abuserKeys, victimKeys, cooldown }, opts)
  // retryAfter is already fallback-resolved (>0), so consume()'s ttl>0 path passes it through.
  return r.ok ? [1] : [0, r.retryAfter, r.scope, r.blockedKey]
}
