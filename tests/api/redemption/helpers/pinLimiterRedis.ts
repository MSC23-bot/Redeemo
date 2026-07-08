import { vi } from 'vitest'
import { shimEval } from '../../../../src/api/shared/atomicLimiter'

// Shared Redis fake for createRedemption unit tests.
//
// The redemption PIN rate-limit gate now routes through the shared atomic
// consume() limiter (H2 fix, 2026-07-06 security audit), which calls
// redis.eval(). This fake backs eval() with the SAME in-memory Map used for
// get/incr/decr/del, so consume()'s INCR-and-check is faithful — and, because
// JS is single-threaded, concurrent awaited eval() calls serialise exactly like
// the real Lua does (the property that closes the concurrent-burst bypass).
//
// `counts` pre-seeds the counter (e.g. to simulate an already-at-limit user);
// `ttl` is what a blocked consume() reports as retryAfter (use -1/-2 to exercise
// the no-TTL fallback-to-window path).
export function makeRedemptionRedis(opts: { counts?: Record<string, string>; ttl?: number } = {}) {
  const store = new Map<string, string>(Object.entries(opts.counts ?? {}))
  const ttl = opts.ttl ?? 900
  const fake = {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string | number) => {
      store.set(k, String(v))
      return 'OK'
    }),
    del: vi.fn(async (...ks: string[]) => {
      let n = 0
      for (const k of ks) if (store.delete(k)) n++
      return n
    }),
    incr: vi.fn(async (k: string) => {
      const v = (parseInt(store.get(k) ?? '0', 10) || 0) + 1
      store.set(k, String(v))
      return v
    }),
    decr: vi.fn(async (k: string) => {
      const v = (parseInt(store.get(k) ?? '0', 10) || 0) - 1
      store.set(k, String(v))
      return v
    }),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async (k: string) => (store.has(k) ? ttl : -2)),
    eval: vi.fn(async (_lua: string, numKeys: number, ...rest: Array<string | number>) =>
      shimEval(store, rest.slice(0, numKeys) as string[], rest.slice(numKeys), { ttlOf: () => ttl }),
    ),
    __store: store,
  }
  return fake as any
}
