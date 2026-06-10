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
