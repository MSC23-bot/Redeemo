// src/api/queues/index.ts
//
// Phase 0 PR-0.1: the BullMQ queue factory + enqueue helper. FOUNDATION ONLY —
// it stands up the queues and the enqueue surface; the email + moderation
// PROCESSORS (workers) land in PR-0.4 (notify/email) and PR-0.6 (moderation).
//
// Producers (the API enqueuing jobs) share ONE memoised ioredis connection —
// that's safe because producers only issue non-blocking commands. Workers, when
// they arrive, each get their OWN connection (makeQueueConnection per worker)
// for their blocking reads.

import { Queue, type JobsOptions, type Job, type ConnectionOptions } from 'bullmq'
import { makeQueueConnection } from './connection'
import type IORedis from 'ioredis'

/**
 * Key prefix for every BullMQ key on the shared Redis instance, so queue keys
 * never collide with session / rate-limit keys. Override via BULLMQ_PREFIX;
 * defaults to a safe project-scoped value.
 */
export const BULLMQ_PREFIX = process.env.BULLMQ_PREFIX || 'redeemo'

// Queue name constants. The PROCESSORS that consume these land in later PRs:
//   EMAIL_QUEUE        → PR-0.4 (notify dispatcher + email delivery worker)
//   MAINTENANCE_QUEUE  → PR-0.4 (repeatable outbox-reconciler sweep)
//   MODERATION_QUEUE   → PR-0.6 (photo moderation scan worker)
export const EMAIL_QUEUE = 'email'
export const MAINTENANCE_QUEUE = 'maintenance'
export const MODERATION_QUEUE = 'moderation'

// Default job options: bounded exponential retries + completed/failed retention
// caps so a stuck job can't grow Redis unbounded. removeOnFail is generous so a
// failed job is inspectable; removeOnComplete keeps the most recent successes.
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
}

// One shared producer connection, created lazily on first use.
let sharedConnection: IORedis | null = null
function producerConnection(): IORedis {
  if (!sharedConnection) sharedConnection = makeQueueConnection()
  return sharedConnection
}

// Memoised Queue per name (a Queue is a long-lived producer handle).
const queues = new Map<string, Queue>()

/** Get (or lazily create) the memoised Queue for `name`, namespaced + configured. */
export function makeQueue(name: string): Queue {
  let q = queues.get(name)
  if (!q) {
    q = new Queue(name, {
      // BullMQ types `connection` against its OWN bundled ioredis (5.10.1);
      // we pass an instance of the app's top-level ioredis (5.11.1). The two
      // are the same library at runtime (BullMQ `.duplicate()`s this instance
      // for its connections — proven in queue.test.ts), but TS sees two
      // distinct `Redis` types, so we bridge the duplicate-package type gap here.
      connection: producerConnection() as unknown as ConnectionOptions,
      prefix: BULLMQ_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
    queues.set(name, q)
  }
  return q
}

/**
 * Enqueue one job onto `name`. Pass a deterministic `jobId` for idempotency:
 * BullMQ dedups by jobId, so re-enqueuing the same id while the job exists is a
 * no-op (the §4.1 outbox-reconciler precondition). Returns the job.
 */
export function enqueue(name: string, data: unknown, opts?: JobsOptions): Promise<Job> {
  return makeQueue(name).add(name, data, opts)
}

/** Close every memoised queue + the shared producer connection (graceful shutdown). */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()))
  queues.clear()
  if (sharedConnection) {
    await sharedConnection.quit()
    sharedConnection = null
  }
}

export { makeQueueConnection } from './connection'
