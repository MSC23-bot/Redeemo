// src/api/queues/connection.ts
//
// Phase 0 PR-0.1: the dedicated BullMQ Redis connection.
//
// Redis topology (plan §5): BullMQ SHARES the existing Redis INSTANCE for MVP
// (low job volume — email / notification / moderation only; one instance to
// run). It uses its OWN ioredis connection — distinct from the app's
// `app.redis` (which keeps `maxRetriesPerRequest: 3`) — because BullMQ REQUIRES
// `maxRetriesPerRequest: null` on the connection it drives (its blocking
// commands must not give up after N retries). Queue keys are namespaced under
// BULLMQ_PREFIX (see ./index) so they never collide with session / rate-limit
// keys on the shared instance.
//
// OPERATIONAL REQUIREMENT: the shared Redis instance MUST be configured
// `maxmemory-policy noeviction`. BullMQ cannot tolerate key eviction — a dropped
// job key is a lost job. Sessions + TTL'd rate-limit keys are unaffected by
// `noeviction` (they expire, they are never evicted).
//
// Split trigger (when to give BullMQ its OWN Redis instance later): sustained
// queue depth / throughput, memory pressure from job payloads, or wanting to
// scale workers / apply different persistence independently of the session store.

import IORedis from 'ioredis'

/**
 * Create a fresh ioredis connection configured for BullMQ. Each call returns a
 * NEW connection: producers (queues) can share one, but every BullMQ Worker
 * needs its OWN connection for its blocking reads — so worker code (PR-0.4+)
 * calls this per worker. `maxRetriesPerRequest: null` is mandatory for BullMQ.
 */
export function makeQueueConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })
}

// ---------------------------------------------------------------------------
// Neon CU-burn PR-A Task A5: the FINITE producer lifecycle (spec §4.2).
//
// The producer (Queue) side must be bounded end-to-end — creation, initial
// connect/readiness, command await, error recovery, shutdown — so a Redis
// outage can never hang a maintenance sweep or graceful shutdown. The blocking
// WORKER connections above are UNCHANGED (`maxRetriesPerRequest: null` is a
// BullMQ requirement for blocking reads); only the non-blocking producer path
// gets the finite policy.
//
// Candidate numeric values — the MECHANISM is locked by the spec; the NUMBERS
// remain benchmark/owner-gated (spec §15 / plan Task A5 [GATED]). Revisit at
// the staging-activation gate.
// ---------------------------------------------------------------------------

/** Bounds the TCP connection-establishment attempt. */
export const PRODUCER_CONNECT_TIMEOUT_MS = 5_000
/** After this many reconnect attempts the retryStrategy returns null — reconnection TERMINATES. */
export const PRODUCER_RETRY_ATTEMPTS = 2
export const PRODUCER_RETRY_DELAY_MS = 200
/** Bounds the AWAIT of an issued command. Outcome on expiry is UNKNOWN — the
 *  deterministic jobId makes the later replay a BullMQ no-op if it landed. */
export const PRODUCER_COMMAND_TIMEOUT_MS = 5_000
export const PRODUCER_MAX_RETRIES_PER_REQUEST = 1

/**
 * Create the dedicated NON-BLOCKING producer connection, lazily connectable and
 * finite in every phase:
 *   - `lazyConnect`: creation does not touch the network; the explicit
 *     connect-before-Queue sequence in queues/index.ts drives readiness;
 *   - `connectTimeout` + a finite `retryStrategy` (null after a bounded number
 *     of attempts): connection establishment TERMINATES instead of looping;
 *   - `enableOfflineQueue: false`: commands reject immediately when
 *     disconnected instead of queueing invisibly;
 *   - finite `commandTimeout` + `maxRetriesPerRequest`: the command await is
 *     bounded (`commandTimeout` alone is NOT the complete bound — it starts
 *     only after a command is issued, which is why readiness is bounded too).
 */
export function makeProducerConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL!, {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: PRODUCER_CONNECT_TIMEOUT_MS,
    commandTimeout: PRODUCER_COMMAND_TIMEOUT_MS,
    maxRetriesPerRequest: PRODUCER_MAX_RETRIES_PER_REQUEST,
    retryStrategy: (times) =>
      times > PRODUCER_RETRY_ATTEMPTS ? null : Math.min(times * PRODUCER_RETRY_DELAY_MS, 1_000),
  })
}
