// src/api/queues/index.ts
//
// The BullMQ queue factory + enqueue helper.
//
// Neon CU-burn PR-A Task A5 reworked the PRODUCER side onto the locked FINITE
// lifecycle (spec §4.2): a dedicated non-blocking connection created LAZILY
// with an explicit connect-before-Queue sequence, finite connection
// establishment (connectTimeout + a retryStrategy that TERMINATES), an
// immediately-rejecting offline queue, a bounded command await, error-driven
// eviction + force-disconnect + recreation, and a MANDATORY deterministic
// jobId on every enqueue. Workers keep their OWN blocking connections
// (makeQueueConnection, `maxRetriesPerRequest: null`) — unchanged.
//
// Locked creation sequence (spec §4.2 "connect-before-Queue"):
//   (1) memoise ONE in-flight creation promise (concurrent callers share it);
//   (2) instantiate the dedicated lazy producer;
//   (3) explicitly `await redis.connect()` — bounded by connectTimeout + the
//       finite retryStrategy (NOT commandTimeout, which starts only after a
//       command is issued);
//   (4) verify the client reached 'ready';
//   (5) only THEN construct + memoise the BullMQ Queue (skipWaitingForReady is
//       safe here because readiness was just proven);
//   (6) on any failure: force-disconnect, remove listeners, atomically evict
//       the creation entry so a later call recreates.
//
// Semantics honesty: a timed-out/failed `Queue.add` outcome is UNKNOWN (it may
// not have run / may have run / may run later). The deterministic jobId makes
// the caller's later replay a BullMQ no-op if the first attempt landed — which
// is why enqueue() REQUIRES the jobId at the type level and asserts it at
// runtime.

import { Queue, type JobsOptions, type Job, type ConnectionOptions } from 'bullmq'
import { makeProducerConnection } from './connection'
import type IORedis from 'ioredis'

/**
 * Key prefix for every BullMQ key on the shared Redis instance, so queue keys
 * never collide with session / rate-limit keys. Override via BULLMQ_PREFIX;
 * defaults to a safe project-scoped value.
 */
export const BULLMQ_PREFIX = process.env.BULLMQ_PREFIX || 'redeemo'

// Queue name constants.
export const EMAIL_QUEUE = 'email'
export const MAINTENANCE_QUEUE = 'maintenance'
export const MODERATION_QUEUE = 'moderation'

/** Bounds the graceful Queue.close()/quit() path at shutdown; on expiry the
 *  producer socket is force-destroyed (Task A6 real force-close). Candidate
 *  value — numerics are benchmark/owner-gated (spec §15). */
export const QUEUE_CLOSE_TIMEOUT_MS = 5_000

// Default job options: bounded exponential retries + completed/failed retention
// caps so a stuck job can't grow Redis unbounded.
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
}

// ---------------------------------------------------------------------------
// Producer connection lifecycle (memoised in-flight creation + eviction)
// ---------------------------------------------------------------------------

let producerCreation: Promise<IORedis> | null = null
let liveProducer: IORedis | null = null
/** The connection whose initial connect/readiness is STILL IN FLIGHT — tracked
 *  from creation time so closeQueues can force-close it too (spec §4.6 step 3
 *  covers "shutdown while the producer is still in initial connect/readiness"). */
let pendingProducer: IORedis | null = null
/** Bumped by invalidation AND closeQueues: a creation that resumes after either
 *  event sees a newer epoch and self-destructs instead of becoming live — a
 *  cancelled in-flight producer can never outlive shutdown (structural, not
 *  dependent on ioredis disconnect semantics). */
let producerEpoch = 0
const queueCreations = new Map<string, Promise<Queue>>()

/**
 * Errors that INVALIDATE the memoised producer (spec §4.2 recovery contract):
 * the finite retry policy exhausting ('end' handled by listener), a bounded
 * command await expiring, the offline queue's immediate reject, and
 * closed/refused connections. On such an error the producer + its Queues are
 * evicted and force-disconnected so the NEXT enqueue builds a fresh producer.
 */
export function isProducerInvalidatingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return /command timed out|timed out|offline queue|stream isn't writeable|connection is closed|econnrefused|connection.*(?:ended|closed)/i.test(
    msg,
  )
}

function invalidateProducer(conn: IORedis): void {
  if (liveProducer !== conn) return // a stale error from an already-replaced producer
  producerEpoch++
  liveProducer = null
  producerCreation = null
  queueCreations.clear() // the Queues are bound to the dead connection — recreate them
  conn.removeAllListeners()
  conn.disconnect() // force: socket destroyed, no leaked handle
}

function getProducerConnection(): Promise<IORedis> {
  if (producerCreation) return producerCreation
  const creation = (async () => {
    const epoch = producerEpoch
    const conn = makeProducerConnection()
    pendingProducer = conn // reachable by closeQueues WHILE connect is in flight
    conn.on('error', () => {
      /* observed; invalidation is driven by 'end' + command failures */
    })
    conn.on('end', () => invalidateProducer(conn)) // finite retryStrategy exhausted → recreate later
    try {
      await conn.connect() // bounded: connectTimeout + finite retryStrategy
      if (conn.status !== 'ready') {
        throw new Error(`producer connection did not reach ready (status: ${conn.status})`)
      }
      if (epoch !== producerEpoch) {
        // closeQueues/invalidation ran while connect was in flight — a cancelled
        // creation must NEVER become the live producer post-shutdown.
        throw new Error('producer creation superseded by shutdown/invalidation')
      }
    } catch (err) {
      conn.removeAllListeners()
      conn.disconnect()
      throw err
    } finally {
      if (pendingProducer === conn) pendingProducer = null // no longer in flight
    }
    liveProducer = conn
    return conn
  })()
  producerCreation = creation
  creation.catch(() => {
    // atomic eviction of the FAILED creation so the next caller recreates
    if (producerCreation === creation) producerCreation = null
  })
  return creation
}

/**
 * Get (or lazily create) the memoised Queue for `name`. Async because creation
 * follows the locked connect-before-Queue sequence: the Queue is constructed
 * only AFTER the dedicated producer connection explicitly reached 'ready'.
 * Concurrent callers memoise the IN-FLIGHT creation promise, so a burst during
 * (re)creation yields exactly one Queue.
 */
export function makeQueue(name: string): Promise<Queue> {
  let p = queueCreations.get(name)
  if (!p) {
    const creation = (async () => {
      const conn = await getProducerConnection()
      return new Queue(name, {
        // BullMQ types `connection` against its OWN bundled ioredis; we pass an
        // instance of the app's top-level ioredis. Same library at runtime —
        // bridge the duplicate-package type gap here.
        connection: conn as unknown as ConnectionOptions,
        prefix: BULLMQ_PREFIX,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
        // Safe ONLY because readiness was explicitly verified above (locked
        // sequence step 5) — Queue construction must not block on 'ready'.
        skipWaitingForReady: true,
      })
    })()
    queueCreations.set(name, creation)
    creation.catch(() => {
      if (queueCreations.get(name) === creation) queueCreations.delete(name) // evict a failed creation
    })
    p = creation
  }
  return p
}

/** enqueue() REQUIRES a deterministic jobId — the idempotent-replay contract. */
export type EnqueueOptions = JobsOptions & { jobId: string }

/**
 * Enqueue one job onto `name`. The deterministic `jobId` is MANDATORY (type +
 * runtime): BullMQ dedups by jobId, so a replay after an UNKNOWN-outcome
 * timeout is a no-op if the first attempt actually landed. An invalidating
 * error evicts + force-disconnects the producer so the next call recreates it.
 */
export async function enqueue(name: string, data: unknown, opts: EnqueueOptions): Promise<Job> {
  const jobId = opts?.jobId
  if (typeof jobId !== 'string' || jobId.trim() === '') {
    throw new Error(
      `enqueue: a deterministic jobId is REQUIRED (idempotent-replay contract, spec §4.2) — queue "${name}"`,
    )
  }
  // BullMQ rejects a custom jobId containing ':' ("Custom Id cannot contain :")
  // deep inside add(). Guard here so a bad jobId fails loudly at the call site.
  // Tests that mock enqueue never hit BullMQ's own validation, so this guard is
  // the safety net that survives the mocks.
  if (jobId.includes(':')) {
    throw new Error(`enqueue: jobId must not contain ':' (BullMQ forbids it): "${jobId}"`)
  }
  const q = await makeQueue(name)
  try {
    return await q.add(name, data, opts)
  } catch (err) {
    // Invalidate ONLY the producer this Queue actually rides: if the producer
    // was already replaced between the failing add and this catch, tearing down
    // the healthy successor would be a stale invalidation.
    const failedConn = (q as unknown as { opts?: { connection?: unknown } }).opts?.connection
    if (liveProducer && failedConn === liveProducer && isProducerInvalidatingError(err)) {
      invalidateProducer(liveProducer)
    }
    throw err // outcome UNKNOWN — the caller's durable row stays QUEUED/PENDING for replay
  }
}

/**
 * Close every memoised queue + the producer connection (graceful shutdown,
 * Task A6): bounded graceful close first; on expiry a REAL force-close — the
 * producer socket is destroyed so no stuck command or lingering handle can
 * outlive shutdown. Never throws; never waits indefinitely.
 */
export async function closeQueues(): Promise<void> {
  producerEpoch++ // any creation still in flight is now superseded — it self-destructs
  const creations = [...queueCreations.values()]
  queueCreations.clear()
  const conn = liveProducer
  liveProducer = null
  producerCreation = null

  const graceful = (async () => {
    const settled = await Promise.allSettled(creations)
    const queues = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    await Promise.all(queues.map((q) => q.close().catch(() => undefined)))
    if (conn) await conn.quit().catch(() => undefined)
  })()

  let bound: NodeJS.Timeout | undefined
  const expired = await Promise.race([
    graceful.then(() => false),
    new Promise<boolean>((res) => {
      bound = setTimeout(() => res(true), QUEUE_CLOSE_TIMEOUT_MS)
    }),
  ])
  if (bound) clearTimeout(bound)
  if (expired) {
    // REAL force-close: destroy the socket (not a cosmetic race that leaves it running)
    if (conn) {
      conn.removeAllListeners()
      conn.disconnect()
    }
    // Cover "shutdown while the producer is still in initial connect/readiness"
    // (spec §4.6 step 3): the in-flight connection never reached liveProducer,
    // so force-destroy it too — no pending socket or retry timer may outlive us.
    const stillPending = pendingProducer
    if (stillPending) {
      pendingProducer = null
      stillPending.removeAllListeners()
      stillPending.disconnect()
    }
  }
}

export { makeQueueConnection } from './connection'
