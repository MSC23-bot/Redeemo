import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { TestContext } from 'vitest'
import IORedis from 'ioredis'
import {
  makeQueueConnection,
  makeQueue,
  enqueue,
  closeQueues,
  BULLMQ_PREFIX,
  EMAIL_QUEUE,
  MODERATION_QUEUE,
} from '../../../src/api/queues'

// Phase 0 PR-0.1: the BullMQ job-runner FOUNDATION. Pins the load-bearing wiring:
//   - the dedicated BullMQ connection sets `maxRetriesPerRequest: null` (BullMQ requires it);
//   - queues are namespaced under BULLMQ_PREFIX (no collision with session/limiter keys);
//   - enqueue() is idempotent by `jobId` (same id ⇒ one job — the §4.1 outbox precondition);
//   - the EMAIL_QUEUE / MODERATION_QUEUE names exist (processors land in PR-0.4 / PR-0.6).
//
// Real Redis on an isolated db (14). MUST stay SEPARATE from
// atomic-limiter.test.ts (db 15): both files flushdb(), and vitest runs test
// FILES in parallel against the one Redis, so sharing a db lets one file's
// flushdb() wipe the other's keys mid-assertion (a flaky cross-file collision).
// REDIS_URL is redirected to db 14 in beforeAll so makeQueueConnection() (which
// reads REDIS_URL at call time) connects there; vitest isolates env per test
// FILE, and it's restored in afterAll. Skips cleanly when no Redis is reachable.

const BASE_URL = (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '')
const TEST_URL = `${BASE_URL}/14`

let probe: IORedis | null = null
let available = false
let origUrl: string | undefined
let seq = 0

beforeAll(async () => {
  origUrl = process.env.REDIS_URL
  process.env.REDIS_URL = TEST_URL // makeQueueConnection() → db 14
  const c = new IORedis(TEST_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1000 })
  c.on('error', () => {})
  try {
    await c.connect()
    await c.ping()
    await c.flushdb()
    probe = c
    available = true
  } catch {
    c.disconnect()
    probe = null
    available = false
  }
})

afterAll(async () => {
  await closeQueues().catch(() => {})
  if (probe) {
    try { await probe.flushdb() } finally { probe.disconnect() }
  }
  if (origUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = origUrl
})

beforeEach(async () => {
  seq++
  if (available && probe) await probe.flushdb()
})

function requireRedis(ctx: TestContext): void {
  if (!available) ctx.skip()
}

const qname = () => `test-queue-${seq}`

describe('queues — BullMQ foundation', () => {
  it('makeQueueConnection() sets maxRetriesPerRequest: null (BullMQ requirement)', () => {
    const c = makeQueueConnection()
    c.on('error', () => {}) // tolerate a missing Redis — we only inspect options
    expect(c.options.maxRetriesPerRequest).toBe(null)
    c.disconnect()
  })

  it('exposes the EMAIL_QUEUE and MODERATION_QUEUE names + a default prefix', () => {
    expect(typeof EMAIL_QUEUE).toBe('string')
    expect(typeof MODERATION_QUEUE).toBe('string')
    expect(EMAIL_QUEUE).not.toBe(MODERATION_QUEUE)
    expect(BULLMQ_PREFIX).toBeTruthy() // default 'redeemo' when BULLMQ_PREFIX unset
  })

  it('makeQueue() namespaces the queue under BULLMQ_PREFIX', async (ctx) => {
    requireRedis(ctx)
    const q = makeQueue(qname())
    expect(q.opts.prefix).toBe(BULLMQ_PREFIX)
  })

  it('makeQueue() is memoised (same name ⇒ same Queue instance)', async (ctx) => {
    requireRedis(ctx)
    const name = qname()
    expect(makeQueue(name)).toBe(makeQueue(name))
  })

  it('enqueue() is idempotent by jobId — the same jobId ⇒ exactly one job', async (ctx) => {
    requireRedis(ctx)
    const name = qname()
    const j1 = await enqueue(name, { foo: 1 }, { jobId: 'fixed-id' })
    const j2 = await enqueue(name, { foo: 2 }, { jobId: 'fixed-id' })
    expect(j1.id).toBe('fixed-id')
    expect(j2.id).toBe('fixed-id')
    // getJobCounts() with no args returns EVERY state (waiting/active/delayed/
    // completed/failed/prioritized/paused/waiting-children) so the "exactly one
    // job" invariant is total — it can't false-pass if a default job option
    // (e.g. priority/delay) later routes the job to an uncounted state.
    const counts = await makeQueue(name).getJobCounts()
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(1) // the second add deduped on jobId — no duplicate
  })

  it('enqueue() carries the default job options (bounded retries + cleanup)', async (ctx) => {
    requireRedis(ctx)
    const name = qname()
    const job = await enqueue(name, { x: 1 }, { jobId: 'opts-job' })
    expect(job.opts.attempts).toBe(3)
    expect(job.opts.backoff).toMatchObject({ type: 'exponential', delay: 2000 })
  })
})
