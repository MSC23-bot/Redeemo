import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Neon CU-burn PR-A Task A5: the FINITE producer lifecycle (spec §4.2).
// Simulated Redis + BullMQ (vi.mock) so every lifecycle branch is driven
// deterministically: finite options, connect-before-Queue, memoised in-flight
// creation, cold-start failure + recovery, error-driven eviction +
// force-disconnect, and the bounded closeQueues force-close. The REAL-socket
// behaviours (idempotent jobId dedup, prefix, options carry-through) stay
// pinned against live loopback Redis in queue.test.ts.

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('ioredis', () => {
  type Handler = (...args: unknown[]) => void
  class FakeRedis {
    static instances: FakeRedis[] = []
    static connectBehavior: (self: FakeRedis) => Promise<void> = async (self) => {
      self.status = 'ready'
    }
    static reset(): void {
      FakeRedis.instances = []
      FakeRedis.connectBehavior = async (self) => {
        self.status = 'ready'
      }
    }
    url: unknown
    options: Record<string, unknown>
    status = 'wait'
    handlers = new Map<string, Handler[]>()
    connect = vi.fn(() => FakeRedis.connectBehavior(this))
    quit = vi.fn(async () => 'OK')
    disconnect = vi.fn()
    removeAllListeners = vi.fn(() => {
      this.handlers.clear()
      return this
    })
    constructor(url: unknown, options: Record<string, unknown>) {
      this.url = url
      this.options = options
      FakeRedis.instances.push(this)
    }
    on(event: string, cb: Handler): this {
      const list = this.handlers.get(event) ?? []
      list.push(cb)
      this.handlers.set(event, list)
      return this
    }
    emit(event: string, ...args: unknown[]): void {
      for (const cb of [...(this.handlers.get(event) ?? [])]) cb(...args)
    }
  }
  return { default: FakeRedis }
})

vi.mock('bullmq', () => {
  class FakeQueue {
    static instances: FakeQueue[] = []
    static addBehavior: (name: string, data: unknown, opts: unknown) => Promise<unknown> = async (
      _n,
      _d,
      opts,
    ) => ({ id: (opts as { jobId?: string })?.jobId })
    static closeBehavior: () => Promise<void> = async () => {}
    static reset(): void {
      FakeQueue.instances = []
      FakeQueue.addBehavior = async (_n, _d, opts) => ({ id: (opts as { jobId?: string })?.jobId })
      FakeQueue.closeBehavior = async () => {}
    }
    name: string
    opts: Record<string, unknown>
    add = vi.fn((n: string, d: unknown, o: unknown) => FakeQueue.addBehavior(n, d, o))
    close = vi.fn(() => FakeQueue.closeBehavior())
    constructor(name: string, opts: Record<string, unknown>) {
      this.name = name
      this.opts = opts
      FakeQueue.instances.push(this)
    }
  }
  return { Queue: FakeQueue }
})

type QueuesModule = typeof import('../../../src/api/queues/index')

async function fakes() {
  const FakeRedis = (await import('ioredis')).default as any
  const { Queue: FakeQueue } = (await import('bullmq')) as any
  return { FakeRedis, FakeQueue }
}

/** Fresh module state per test — the producer lifecycle is module-level. */
async function freshQueues(): Promise<QueuesModule> {
  vi.resetModules()
  return import('../../../src/api/queues/index')
}

beforeEach(async () => {
  const { FakeRedis, FakeQueue } = await fakes()
  FakeRedis.reset()
  FakeQueue.reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('A5 — finite producer connection options (mechanism locked; numbers candidate/gated)', () => {
  it('the producer connection is lazy, offline-rejecting, and finite in every phase', async () => {
    const { FakeRedis } = await fakes()
    vi.resetModules()
    const { makeProducerConnection, PRODUCER_RETRY_ATTEMPTS } = await import(
      '../../../src/api/queues/connection'
    )
    makeProducerConnection()
    const o = FakeRedis.instances[0].options as Record<string, unknown>
    expect(o.lazyConnect).toBe(true)
    expect(o.enableOfflineQueue).toBe(false)
    expect(typeof o.connectTimeout).toBe('number')
    expect(o.connectTimeout as number).toBeGreaterThan(0)
    expect(typeof o.commandTimeout).toBe('number')
    expect(o.commandTimeout as number).toBeGreaterThan(0)
    expect(typeof o.maxRetriesPerRequest).toBe('number') // FINITE — not the workers' null
    const retry = o.retryStrategy as (times: number) => number | null
    expect(typeof retry(1)).toBe('number') // retries a bounded number of times…
    expect(retry(PRODUCER_RETRY_ATTEMPTS + 1)).toBeNull() // …then TERMINATES (never loops)
  })

  it('the blocking WORKER connection is UNCHANGED (maxRetriesPerRequest: null)', async () => {
    const { FakeRedis } = await fakes()
    vi.resetModules()
    const { makeQueueConnection } = await import('../../../src/api/queues/connection')
    makeQueueConnection()
    expect(FakeRedis.instances[0].options.maxRetriesPerRequest).toBeNull()
  })
})

describe('A5 — locked connect-before-Queue creation sequence', () => {
  it('the Queue is constructed only AFTER connect() resolved and the client is ready; skipWaitingForReady is then safe', async () => {
    const { FakeRedis, FakeQueue } = await fakes()
    const q = await (await freshQueues()).makeQueue('m')
    const conn = FakeRedis.instances[0]
    expect(conn.connect).toHaveBeenCalledTimes(1)
    expect(conn.status).toBe('ready')
    expect(FakeQueue.instances).toHaveLength(1)
    expect((q as any).opts.skipWaitingForReady).toBe(true)
    expect((q as any).opts.connection).toBe(conn) // the Queue rides the verified-ready producer
  })

  it('a connection that never reaches ready fails creation (no Queue built on a non-ready client)', async () => {
    const { FakeRedis, FakeQueue } = await fakes()
    FakeRedis.connectBehavior = async (self: any) => {
      self.status = 'connecting' // connect() resolves but ready was never reached
    }
    const queues = await freshQueues()
    await expect(queues.makeQueue('m')).rejects.toThrow(/did not reach ready/)
    expect(FakeQueue.instances).toHaveLength(0)
    expect(FakeRedis.instances[0].disconnect).toHaveBeenCalled() // failed creation force-closed
  })

  it('concurrent callers memoise the IN-FLIGHT creation promise — one connection, one Queue', async () => {
    const { FakeRedis, FakeQueue } = await fakes()
    let release!: () => void
    FakeRedis.connectBehavior = (self: any) =>
      new Promise<void>((res) => {
        release = () => {
          self.status = 'ready'
          res()
        }
      })
    const queues = await freshQueues()
    const p1 = queues.makeQueue('m')
    const p2 = queues.makeQueue('m')
    expect(p1).toBe(p2) // the in-flight creation promise itself is shared
    release()
    expect(await p1).toBe(await p2)
    expect(FakeRedis.instances).toHaveLength(1)
    expect(FakeQueue.instances).toHaveLength(1)
  })

  it('two queue names share ONE dedicated producer connection', async () => {
    const { FakeRedis, FakeQueue } = await fakes()
    const queues = await freshQueues()
    await queues.makeQueue('a')
    await queues.makeQueue('b')
    expect(FakeRedis.instances).toHaveLength(1)
    expect(FakeQueue.instances).toHaveLength(2)
  })
})

describe('A5 — cold-start failure, eviction, recovery', () => {
  it('Redis down BEFORE first use: enqueue rejects within the readiness policy, the failed creation is evicted, and recovery builds a FRESH producer', async () => {
    const { FakeRedis, FakeQueue } = await fakes()
    FakeRedis.connectBehavior = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), { code: 'ECONNREFUSED' })
    }
    const queues = await freshQueues()
    await expect(queues.enqueue('m', { x: 1 }, { jobId: 'job-1' })).rejects.toThrow(/ECONNREFUSED/)
    expect(FakeRedis.instances[0].disconnect).toHaveBeenCalled() // no leaked socket
    expect(FakeRedis.instances[0].removeAllListeners).toHaveBeenCalled() // no leaked listeners

    // Redis recovers: the SAME jobId replays on a fresh healthy producer (BullMQ dedup no-op if it landed)
    FakeRedis.reset()
    const job = await queues.enqueue('m', { x: 1 }, { jobId: 'job-1' })
    expect((job as any).id).toBe('job-1')
    expect(FakeRedis.instances).toHaveLength(1) // a NEW connection was created
    expect(FakeQueue.instances[FakeQueue.instances.length - 1].add).toHaveBeenCalledWith(
      'm',
      { x: 1 },
      { jobId: 'job-1' },
    )
  })

  it('an INVALIDATING add error (command timeout) evicts + force-disconnects the producer; the next enqueue recreates it', async () => {
    const { FakeRedis, FakeQueue } = await fakes()
    const queues = await freshQueues()
    FakeQueue.addBehavior = async () => {
      throw new Error('Command timed out')
    }
    await expect(queues.enqueue('m', { x: 1 }, { jobId: 'j1' })).rejects.toThrow(/timed out/)
    const firstConn = FakeRedis.instances[0]
    expect(firstConn.disconnect).toHaveBeenCalled() // REAL force-close of the poisoned producer
    expect(firstConn.removeAllListeners).toHaveBeenCalled()

    FakeQueue.addBehavior = async (_n: string, _d: unknown, opts: unknown) => ({
      id: (opts as { jobId: string }).jobId,
    })
    const job = await queues.enqueue('m', { x: 1 }, { jobId: 'j1' }) // same jobId — replay-safe
    expect((job as any).id).toBe('j1')
    expect(FakeRedis.instances).toHaveLength(2) // fresh producer after recovery
    expect(FakeQueue.instances).toHaveLength(2) // fresh Queue bound to it
  })

  it('a NON-invalidating add error surfaces to the caller WITHOUT tearing the producer down', async () => {
    const { FakeRedis, FakeQueue } = await fakes()
    const queues = await freshQueues()
    FakeQueue.addBehavior = async () => {
      throw new Error('Missing lock for job repeat')
    }
    await expect(queues.enqueue('m', { x: 1 }, { jobId: 'j1' })).rejects.toThrow(/Missing lock/)
    expect(FakeRedis.instances[0].disconnect).not.toHaveBeenCalled()
    expect(FakeRedis.instances).toHaveLength(1) // still the same live producer
  })

  it("the connection's 'end' event (finite retryStrategy exhausted) invalidates the producer for recreation", async () => {
    const { FakeRedis } = await fakes()
    const queues = await freshQueues()
    await queues.makeQueue('m')
    const conn = FakeRedis.instances[0]
    conn.emit('end') // reconnection terminated — the producer is dead
    expect(conn.disconnect).toHaveBeenCalled()
    await queues.makeQueue('m')
    expect(FakeRedis.instances).toHaveLength(2) // recreated on next use
  })

  it('isProducerInvalidatingError recognises the locked invalidating set and nothing else', async () => {
    const { isProducerInvalidatingError } = await freshQueues()
    expect(isProducerInvalidatingError(new Error('Command timed out'))).toBe(true)
    expect(
      isProducerInvalidatingError(new Error("Stream isn't writeable and enableOfflineQueue options is false")),
    ).toBe(true)
    expect(isProducerInvalidatingError(new Error('Connection is closed.'))).toBe(true)
    expect(isProducerInvalidatingError(new Error('connect ECONNREFUSED'))).toBe(true)
    expect(isProducerInvalidatingError(new Error('Custom Id cannot contain :'))).toBe(false)
    expect(isProducerInvalidatingError(new Error('Missing lock for job'))).toBe(false)
  })
})

describe('A5/A6 — bounded closeQueues (graceful, then REAL force-close)', () => {
  it('graceful path: queues close, the producer quits, no force-disconnect', async () => {
    const { FakeRedis, FakeQueue } = await fakes()
    const queues = await freshQueues()
    await queues.makeQueue('m')
    await queues.closeQueues()
    expect(FakeQueue.instances[0].close).toHaveBeenCalled()
    expect(FakeRedis.instances[0].quit).toHaveBeenCalled()
    expect(FakeRedis.instances[0].disconnect).not.toHaveBeenCalled()
  })

  it('force path: a hung graceful close expires the bound and the producer socket is DESTROYED (no lingering handle)', async () => {
    const { FakeRedis, FakeQueue } = await fakes()
    const queues = await freshQueues()
    await queues.makeQueue('m')
    FakeQueue.closeBehavior = () => new Promise<never>(() => {}) // Queue.close hangs (Redis half-open)
    vi.useFakeTimers()
    const closing = queues.closeQueues()
    await vi.advanceTimersByTimeAsync(queues.QUEUE_CLOSE_TIMEOUT_MS)
    await closing // resolves at the bound — shutdown never waits indefinitely
    expect(FakeRedis.instances[0].disconnect).toHaveBeenCalled() // REAL force-close
    expect(FakeRedis.instances[0].removeAllListeners).toHaveBeenCalled()
  })

  it('closeQueues during a pending initial connect stays bounded AND force-destroys the in-flight connection (spec §4.6 step 3)', async () => {
    const { FakeRedis } = await fakes()
    let release!: () => void
    FakeRedis.connectBehavior = (self: any) =>
      new Promise<void>((res) => {
        release = () => {
          self.status = 'ready'
          res()
        }
      })
    const queues = await freshQueues()
    const pending = queues.makeQueue('m') // connect in flight (Redis slow at cold start)
    vi.useFakeTimers()
    const closing = queues.closeQueues()
    await vi.advanceTimersByTimeAsync(queues.QUEUE_CLOSE_TIMEOUT_MS)
    await closing // the close bound expires without hanging on the pending creation
    // The still-connecting producer never reached liveProducer — it MUST still be
    // force-closed, or its socket + retry timer would outlive shutdown (masked
    // in production only by the process.exit fallback).
    expect(FakeRedis.instances[0].disconnect).toHaveBeenCalled()
    expect(FakeRedis.instances[0].removeAllListeners).toHaveBeenCalled()
    release()
    await pending.catch(() => undefined)
  })
})
