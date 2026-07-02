import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runWorkerShutdown, type WorkerShutdownDeps } from '../src/workerShutdown'
import type { MaintenanceScheduler } from '../src/api/queues/maintenanceScheduler'

// Neon CU-burn PR-A Task A6 (Codex round-2 Finding 2): the plan-required
// ordered-shutdown suite. Pins that shutdown NEVER waits indefinitely — every
// phase bounded, hung phases force-closed and skipped past, ordering preserved
// (stop → workers/connections → producer queues → prisma → forceJoin), and the
// caller's process.exit fallback always reachable.

const WORKER_MS = 10_000
const PRISMA_MS = 5_000
const JOIN_MS = 5_000

function never(): Promise<never> {
  return new Promise<never>(() => {})
}

function harness(overrides: Partial<WorkerShutdownDeps> = {}) {
  const order: string[] = []
  const scheduler = {
    stop: vi.fn(async () => {
      order.push('scheduler.stop')
      return { drained: true }
    }),
    forceJoin: vi.fn(async () => {
      order.push('forceJoin')
      return { joined: true }
    }),
  } as unknown as MaintenanceScheduler
  const worker = {
    close: vi.fn(async () => {
      order.push('worker.close')
    }),
  }
  const conn = {
    quit: vi.fn(async () => {
      order.push('conn.quit')
      return 'OK'
    }),
    disconnect: vi.fn(() => {
      order.push('conn.disconnect')
    }),
  }
  const deps: WorkerShutdownDeps = {
    scheduler,
    workers: [worker],
    workerConnections: [conn],
    closeQueues: vi.fn(async () => {
      order.push('closeQueues')
    }),
    disconnectPrisma: vi.fn(async () => {
      order.push('prisma.$disconnect')
    }),
    workerCloseTimeoutMs: WORKER_MS,
    prismaDisconnectTimeoutMs: PRISMA_MS,
    forceJoinTimeoutMs: JOIN_MS,
    log: vi.fn(),
    ...overrides,
  }
  return { deps, order, scheduler, worker, conn }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('runWorkerShutdown — ordered, end-to-end bounded', () => {
  it('normal drain: every phase ok, in the LOCKED order stop → workers/conns → closeQueues → prisma → forceJoin', async () => {
    const { deps, order } = harness()
    const summary = await runWorkerShutdown(deps)
    expect(summary).toEqual({ drained: true, workerClosePhase: 'ok', prismaPhase: 'ok', joined: true })
    expect(order).toEqual([
      'scheduler.stop',
      'worker.close',
      'conn.quit',
      'closeQueues',
      'prisma.$disconnect',
      'forceJoin',
    ])
  })

  it('hung BullMQ worker close: the phase times out, owned connections are FORCE-DISCONNECTED, and shutdown proceeds to the end', async () => {
    const { deps, order, conn } = harness()
    ;(deps.workers[0].close as ReturnType<typeof vi.fn>).mockImplementation(() => never())
    const run = runWorkerShutdown(deps)
    await vi.advanceTimersByTimeAsync(WORKER_MS)
    const summary = await run
    expect(summary.workerClosePhase).toBe('timeout')
    expect(conn.disconnect).toHaveBeenCalled() // blocking-read sockets destroyed
    expect(order).toContain('closeQueues') // later phases still ran
    expect(order).toContain('prisma.$disconnect')
    expect(order).toContain('forceJoin')
  })

  it('hung prisma.$disconnect: bounded — forceJoin still runs and the summary returns (process.exit stays reachable)', async () => {
    const { deps, order, scheduler } = harness({ disconnectPrisma: vi.fn(() => never()) })
    const run = runWorkerShutdown(deps)
    await vi.advanceTimersByTimeAsync(PRISMA_MS)
    const summary = await run
    expect(summary.prismaPhase).toBe('timeout')
    expect(scheduler.forceJoin).toHaveBeenCalledWith(JOIN_MS) // a hanging pool cannot prevent the join
    expect(order[order.length - 1]).toBe('forceJoin')
  })

  it('drain timeout propagates: drained=false is reported and the force path (closeQueues → forceJoin) still runs', async () => {
    const { deps, scheduler, order } = harness()
    ;(scheduler.stop as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('scheduler.stop')
      return { drained: false }
    })
    ;(scheduler.forceJoin as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('forceJoin')
      return { joined: false }
    })
    const summary = await runWorkerShutdown(deps)
    expect(summary.drained).toBe(false)
    expect(summary.joined).toBe(false) // → the caller's process.exit is the terminator
    expect(order).toContain('closeQueues') // real force-close ran between drain and join
  })

  it('a LATE rejection from a timed-out phase is observed — no unhandled rejection escapes shutdown', async () => {
    let rejectClose!: (e: unknown) => void
    const { deps } = harness()
    ;(deps.workers[0].close as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((_res, rej) => {
          rejectClose = rej
        }),
    )
    const run = runWorkerShutdown(deps)
    await vi.advanceTimersByTimeAsync(WORKER_MS)
    const summary = await run
    expect(summary.workerClosePhase).toBe('timeout')
    rejectClose(new Error('late rejection after force-disconnect')) // settles AFTER the phase ended
    await vi.advanceTimersByTimeAsync(0)
    // vitest fails the suite on any unhandled rejection — reaching here proves observation.
  })

  it('a hung close that settles LATE (fulfilled) starts NO quit after the force-disconnect — no new op after stop', async () => {
    let resolveClose!: () => void
    const { deps, conn } = harness()
    ;(deps.workers[0].close as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<void>((res) => {
          resolveClose = res
        }),
    )
    const run = runWorkerShutdown(deps)
    await vi.advanceTimersByTimeAsync(WORKER_MS)
    const summary = await run
    expect(summary.workerClosePhase).toBe('timeout')
    expect(conn.disconnect).toHaveBeenCalled()
    resolveClose() // the hung close settles AFTER shutdown force-closed the sockets
    await vi.advanceTimersByTimeAsync(0)
    expect(conn.quit).not.toHaveBeenCalled() // the late settler may not start a NEW Redis op
  })

  it('quit rejections are tolerated (already-dead connection) without failing the phase', async () => {
    const { deps } = harness()
    ;(deps.workerConnections[0].quit as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Connection is closed.'),
    )
    const summary = await runWorkerShutdown(deps)
    expect(summary.workerClosePhase).toBe('ok')
  })

  it('a REJECTED scheduler.stop() is normalized to drained:false and does NOT prevent worker/queue/prisma/force-join cleanup', async () => {
    const { deps, order, scheduler } = harness()
    ;(scheduler.stop as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('stop exploded'))
    const summary = await runWorkerShutdown(deps) // resolves — the coordinator never rejects
    expect(summary.drained).toBe(false) // conservative normalization
    expect(order).toEqual(['worker.close', 'conn.quit', 'closeQueues', 'prisma.$disconnect', 'forceJoin']) // EVERY later phase ran, in order
  })

  it('a REJECTED scheduler.forceJoin() is normalized to joined:false and the coordinator still returns its summary', async () => {
    const { deps, order, scheduler } = harness()
    ;(scheduler.forceJoin as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('join exploded'))
    const summary = await runWorkerShutdown(deps) // resolves — process.exit stays reachable
    expect(summary.joined).toBe(false)
    expect(order).toContain('prisma.$disconnect') // every prior phase completed first
  })

  it('a SYNCHRONOUSLY throwing worker.close() is tolerated — converted to an observed rejection; quits and all later phases still run', async () => {
    const { deps, order, conn } = harness()
    ;(deps.workers[0].close as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('sync throw from close()') // NOT a rejected promise — a plain throw
    })
    const summary = await runWorkerShutdown(deps)
    expect(summary.workerClosePhase).toBe('ok') // the throw settled the phase, observed
    expect(conn.quit).toHaveBeenCalled() // a broken close does not skip the quit chain
    expect(order).toContain('closeQueues')
    expect(order).toContain('prisma.$disconnect')
    expect(order[order.length - 1]).toBe('forceJoin')
  })

  it('a SYNCHRONOUSLY throwing quit() is likewise tolerated without failing the phase', async () => {
    const { deps } = harness()
    ;(deps.workerConnections[0].quit as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('sync throw from quit()')
    })
    const summary = await runWorkerShutdown(deps)
    expect(summary.workerClosePhase).toBe('ok')
  })

  it('scheduler=null (MAINTENANCE_MODE=disabled): maintenance phases are skipped, resources still close in order', async () => {
    const { deps, order } = harness({ scheduler: null })
    const summary = await runWorkerShutdown(deps)
    expect(summary).toEqual({ drained: true, workerClosePhase: 'ok', prismaPhase: 'ok', joined: true })
    expect(order).toEqual(['worker.close', 'conn.quit', 'closeQueues', 'prisma.$disconnect'])
  })
})

describe('runWorkerShutdown — PR-C AlertSink phase', () => {
  function sinkHarness(stopImpl?: () => Promise<unknown>) {
    const base = harness()
    const stop = vi.fn(async (): Promise<unknown> => {
      base.order.push('alertSink.stop')
      return { drained: true }
    })
    if (stopImpl) stop.mockImplementation(stopImpl)
    base.deps.alertSink = { stop }
    return { ...base, sinkStop: stop }
  }

  it('the sink stops AFTER scheduler.stop and BEFORE workers close (locked PR-C ordering)', async () => {
    const { deps, order } = sinkHarness()
    const summary = await runWorkerShutdown(deps)
    expect(summary).toEqual({
      drained: true,
      alertSinkPhase: 'ok',
      workerClosePhase: 'ok',
      prismaPhase: 'ok',
      joined: true,
    })
    expect(order).toEqual([
      'scheduler.stop',
      'alertSink.stop', // terminal + drained while the DB connection still lives
      'worker.close',
      'conn.quit',
      'closeQueues',
      'prisma.$disconnect',
      'forceJoin',
    ])
  })

  it('a HUNG sink stop (contract violation) is bounded to alertSinkPhase:timeout — every later phase still runs', async () => {
    const { deps, order } = sinkHarness(() => never())
    const run = runWorkerShutdown(deps)
    await vi.advanceTimersByTimeAsync(6_000) // ALERT_SINK_PHASE_TIMEOUT_MS
    const summary = await run
    expect(summary.alertSinkPhase).toBe('timeout')
    expect(order).toContain('worker.close')
    expect(order).toContain('closeQueues')
    expect(order).toContain('prisma.$disconnect')
    expect(order[order.length - 1]).toBe('forceJoin')
  })

  it('PR-C correction: a REJECTED sink stop is observed, reported as a VISIBLY non-OK phase, and never masked as ok — the coordinator neither rejects nor hangs and every later phase runs in the locked order', async () => {
    const { deps, order } = sinkHarness(async () => {
      throw new Error('sink stop exploded')
    })
    const summary = await runWorkerShutdown(deps) // resolves — the coordinator never rejects
    expect(summary.alertSinkPhase).toBe('error') // rejection is VISIBLE, not normalized to ok
    expect(summary).toMatchObject({ drained: true, workerClosePhase: 'ok', prismaPhase: 'ok', joined: true })
    expect(order).toEqual([
      'scheduler.stop',
      'worker.close', // the rejected sink stop pushed no order entry, cleanup continues…
      'conn.quit',
      'closeQueues',
      'prisma.$disconnect',
      'forceJoin', // …through to the end, in the locked order
    ])
  })

  it('PR-C correction: a SYNCHRONOUSLY throwing sink stop is likewise surfaced as error without skipping later phases', async () => {
    const { deps, order } = sinkHarness(() => {
      throw new Error('sync throw from sink.stop()')
    })
    const summary = await runWorkerShutdown(deps)
    expect(summary.alertSinkPhase).toBe('error')
    expect(order[order.length - 1]).toBe('forceJoin')
  })

  it('alertSink omitted (disabled mode): no sink phase in the summary, legacy ordering intact', async () => {
    const { deps } = harness()
    const summary = await runWorkerShutdown(deps)
    expect('alertSinkPhase' in summary).toBe(false)
  })
})
