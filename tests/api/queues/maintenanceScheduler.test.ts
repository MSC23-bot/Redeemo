import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PrismaClient } from '../../../generated/prisma/client'
import type { BoundedSweepSpec, SweepResult } from '../../../src/api/queues/maintenanceSweep'

// Neon CU-burn PR-A Task A2: the process-local maintenance scheduler.
// Pins the plan's test anchors 1-16: per-sweep isolation, rejection handling,
// backoff, aligned cadence, ACTIVE-on-needsRescan, arm-once, and the full
// cooperative-stop / bounded-drain / forceJoin shutdown lifecycle.

vi.mock('../../../src/api/queues/maintenanceSweep', () => ({
  runBoundedSweep: vi.fn(),
}))

import { runBoundedSweep } from '../../../src/api/queues/maintenanceSweep'
import {
  startMaintenanceScheduler,
  type MaintenanceScheduler,
  type SchedulerConfig,
  type SweepRuntime,
} from '../../../src/api/queues/maintenanceScheduler'

const mockRun = vi.mocked(runBoundedSweep)
const prisma = {} as PrismaClient

const IDLE = 1_800_000 // 30 min
const ACTIVE = 5_000
const DEGRADED_BASE = 60_000
const DRAIN = 10_000

function cfg(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    idleMs: IDLE,
    activeMs: ACTIVE,
    emptyScansToIdle: 2,
    degradedBaseMs: DEGRADED_BASE,
    degradedMaxMs: 3_600_000,
    alertAfterFailures: 3,
    stopDrainMs: DRAIN,
    nowMs: () => Date.now(),
    monotonicNowMs: () => Date.now(),
    recordSweepFailure: vi.fn(),
    alertDegraded: vi.fn(),
    sweepRecovered: vi.fn(),
    onSweepRun: vi.fn(),
    ...overrides,
  }
}

function sweep(name: string, enabled = true): SweepRuntime {
  return {
    spec: { name } as unknown as BoundedSweepSpec<unknown>,
    enabled,
    nextEligibleAt: 0,
    degradedStreak: 0,
  }
}

/** Route the mocked runBoundedSweep by sweep name. */
function route(impls: Record<string, () => Promise<SweepResult>>): void {
  mockRun.mockImplementation(async (_p, spec) => {
    const impl = impls[(spec as { name: string }).name]
    if (!impl) return { state: 'SUCCESS', full: false }
    return impl()
  })
}

const ok = (): Promise<SweepResult> => Promise.resolve({ state: 'SUCCESS', full: false })
const full = (): Promise<SweepResult> => Promise.resolve({ state: 'SUCCESS', full: true })
const fail = (): Promise<SweepResult> => Promise.resolve({ state: 'FAILURE', full: false, error: new Error('db down') })

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function callsFor(name: string): number {
  return mockRun.mock.calls.filter((c) => (c[1] as { name: string }).name === name).length
}

let scheduler: MaintenanceScheduler | null = null

beforeEach(() => {
  vi.useFakeTimers()
  mockRun.mockReset()
})

afterEach(async () => {
  if (scheduler) {
    const p = scheduler.stop()
    await vi.runAllTimersAsync()
    await p
    scheduler = null
  }
  vi.useRealTimers()
})

async function bootTick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0) // BOOT: every sweep is immediately eligible
}

describe('maintenanceScheduler — per-sweep isolation + cadence', () => {
  it('1. a FAILURE in sweep B degrades ONLY B; siblings A and C keep their own state', async () => {
    const a = sweep('a')
    const b = sweep('b')
    const c = sweep('c')
    route({ a: ok, b: fail, c: ok })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a, b, c])
    await bootTick()
    expect(a.degradedStreak).toBe(0)
    expect(b.degradedStreak).toBe(1)
    expect(c.degradedStreak).toBe(0)
    expect(b.lastFailureAt).toBeDefined()
    expect(a.lastSuccessAt).toBeDefined()
  })

  it('2. an UNEXPECTED rejection from runBoundedSweep is classified FAILURE for that sweep; the sibling still runs in the same tick', async () => {
    const b = sweep('b')
    const c = sweep('c')
    route({
      b: () => Promise.reject(new Error('totally unexpected')),
      c: ok,
    })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [b, c])
    await bootTick()
    expect(b.degradedStreak).toBe(1)
    expect(callsFor('c')).toBe(1) // sibling not head-of-line blocked by the rejection
    expect(b.nextEligibleAt).toBeGreaterThanOrEqual(Date.now() + DEGRADED_BASE)
  })

  it('3. after a failure the sweep retries no sooner than degradedBaseMs (nextEligibleAt never left in the past)', async () => {
    const b = sweep('b')
    route({ b: fail })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [b])
    await bootTick()
    expect(b.nextEligibleAt).toBeGreaterThanOrEqual(Date.now() + DEGRADED_BASE)
    // capped exponential: a second failure doubles the backoff
    await vi.advanceTimersByTimeAsync(DEGRADED_BASE)
    expect(callsFor('b')).toBe(2)
    expect(b.nextEligibleAt).toBeGreaterThanOrEqual(Date.now() + 2 * DEGRADED_BASE)
  })

  it('4. aligned cadence: a degraded sweep diverges onto its own backoff; the timer wakes at min(nextEligibleAt) and runs ONLY the eligible sweep', async () => {
    const a = sweep('a')
    const b = sweep('b')
    route({ a: ok, b: fail })
    scheduler = startMaintenanceScheduler(prisma, cfg({ emptyScansToIdle: 1 }), [a, b])
    await bootTick() // a → empty ⇒ idle (30 min); b → failed ⇒ backoff (60 s)
    expect(callsFor('a')).toBe(1)
    expect(callsFor('b')).toBe(1)
    await vi.advanceTimersByTimeAsync(DEGRADED_BASE) // 60 s: only b is eligible
    expect(callsFor('b')).toBe(2)
    expect(callsFor('a')).toBe(1) // a stays on its idle cadence
  })

  it('5. ACTIVE on needsRescan: full=true keeps THAT sweep at F_active without dragging the idle sibling along', async () => {
    const a = sweep('a')
    const c = sweep('c')
    route({ a: full, c: ok })
    scheduler = startMaintenanceScheduler(prisma, cfg({ emptyScansToIdle: 1 }), [a, c])
    await bootTick() // a: full ⇒ active(5s); c: empty ⇒ idle(30min)
    await vi.advanceTimersByTimeAsync(ACTIVE)
    expect(callsFor('a')).toBe(2)
    expect(callsFor('c')).toBe(1) // idle sibling did NOT run at the active wake
  })

  it('F1 pin: a FAILURE result (e.g. Phase-B side-effect failures, full=true) goes to DEGRADED BACKOFF — never the active cadence (Redis-down hot-loop prevention)', async () => {
    const a = sweep('a')
    const conf = cfg()
    route({
      a: () =>
        Promise.resolve({ state: 'FAILURE', full: true, error: new Error('phase-b: 1 side-effect row(s) failed') }),
    })
    scheduler = startMaintenanceScheduler(prisma, conf, [a])
    await bootTick()
    expect(a.degradedStreak).toBe(1) // degraded, not reset
    expect(a.nextEligibleAt).toBeGreaterThanOrEqual(Date.now() + DEGRADED_BASE) // full=true must NOT buy activeMs
    await vi.advanceTimersByTimeAsync(ACTIVE * 4) // well past the 5s active cadence…
    expect(callsFor('a')).toBe(1) // …and the sweep did NOT re-query the DB (no CU-burn loop)
    await vi.advanceTimersByTimeAsync(DEGRADED_BASE)
    expect(callsFor('a')).toBe(2) // exponential backoff advances
    // Anchor on the sweep's OWN failure timestamp (the wall clock also advanced
    // through the active-cadence probe above): streak 2 ⇒ backoff ≥ 2×base.
    expect(a.degradedStreak).toBe(2)
    expect(a.nextEligibleAt - a.lastFailureAt!).toBeGreaterThanOrEqual(2 * DEGRADED_BASE)
  })

  it('F1 pin: Redis recovery — a SUCCESS(full) run after failures resets the streak and resumes ACTIVE backlog draining', async () => {
    const a = sweep('a')
    route({ a: () => Promise.resolve({ state: 'FAILURE', full: true, error: new Error('down') }) })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a])
    await bootTick()
    expect(a.degradedStreak).toBe(1)
    route({ a: full }) // Redis recovered; backlog remains
    await vi.advanceTimersByTimeAsync(DEGRADED_BASE)
    expect(a.degradedStreak).toBe(0) // recovered
    expect(callsFor('a')).toBe(2)
    await vi.advanceTimersByTimeAsync(ACTIVE)
    expect(callsFor('a')).toBe(3) // normal backlog draining on the active cadence again
  })

  it('SUCCESS resets the degraded streak; LOCK_SKIPPED reschedules at idle without degrading', async () => {
    const a = sweep('a')
    a.degradedStreak = 4
    route({ a: () => Promise.resolve({ state: 'LOCK_SKIPPED', full: false }) })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a])
    await bootTick()
    expect(a.degradedStreak).toBe(4) // LOCK_SKIPPED neither degrades nor resets
    expect(a.nextEligibleAt).toBeGreaterThanOrEqual(Date.now() + IDLE)

    route({ a: ok })
    await vi.advanceTimersByTimeAsync(IDLE)
    expect(a.degradedStreak).toBe(0) // SUCCESS resets
  })

  it('6. arm-once: the timer is re-armed exactly once AFTER the tick completes, never from inside it', async () => {
    const a = sweep('a')
    const gate = deferred<SweepResult>()
    route({ a: () => gate.promise })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a])
    await vi.advanceTimersByTimeAsync(0) // boot timer fires; tick now in flight on the gate
    expect(callsFor('a')).toBe(1)
    expect(vi.getTimerCount()).toBe(0) // no re-arm while the tick is in flight
    gate.resolve({ state: 'SUCCESS', full: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1) // exactly one timer armed after completion
  })

  it('a disabled sweep never runs', async () => {
    const a = sweep('a', false)
    const b = sweep('b')
    route({ a: ok, b: ok })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a, b])
    await bootTick()
    expect(callsFor('a')).toBe(0)
    expect(callsFor('b')).toBe(1)
  })
})

describe('maintenanceScheduler — cooperative stop + bounded drain (shutdown contract)', () => {
  it('8. stop() with no active tick resolves { drained:true } immediately, clears the timer, never re-arms', async () => {
    const a = sweep('a')
    route({ a: ok })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a])
    await bootTick()
    expect(vi.getTimerCount()).toBe(1) // idle wake armed
    const res = await scheduler.stop()
    expect(res).toEqual({ drained: true })
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10 * IDLE)
    expect(callsFor('a')).toBe(1) // nothing after stop
    scheduler = null
  })

  it('9. stop() during an in-flight tick awaits the ACTIVE TICK promise and drains', async () => {
    const a = sweep('a')
    const gate = deferred<SweepResult>()
    route({ a: () => gate.promise })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a])
    await vi.advanceTimersByTimeAsync(0) // tick in flight
    const stopP = scheduler.stop()
    let settled = false
    void stopP.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toBe(false) // still draining — the tick has not settled
    gate.resolve({ state: 'SUCCESS', full: false })
    await expect(stopP).resolves.toEqual({ drained: true })
    scheduler = null
  })

  it('10./13. cooperative stop mid-tick: stop during sweep 1 of three ⇒ later sweeps NEVER start; no re-arm', async () => {
    const a = sweep('a')
    const b = sweep('b')
    const c = sweep('c')
    const gate = deferred<SweepResult>()
    route({ a: () => gate.promise, b: ok, c: ok })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a, b, c])
    await vi.advanceTimersByTimeAsync(0) // tick starts; sweep a is in flight
    const stopP = scheduler.stop() // stop requested WHILE a is awaited
    gate.resolve({ state: 'SUCCESS', full: false })
    await expect(stopP).resolves.toEqual({ drained: true })
    expect(callsFor('a')).toBe(1)
    expect(callsFor('b')).toBe(0) // never started: post-await `stopped` check broke the loop
    expect(callsFor('c')).toBe(0)
    expect(vi.getTimerCount()).toBe(0) // no re-arm after stop
    await vi.advanceTimersByTimeAsync(10 * IDLE)
    expect(mockRun).toHaveBeenCalledTimes(1)
    scheduler = null
  })

  it('11. concurrent stop() calls share ONE drain promise', async () => {
    const a = sweep('a')
    route({ a: ok })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a])
    await bootTick()
    const p1 = scheduler.stop()
    const p2 = scheduler.stop()
    expect(p1).toBe(p2)
    await expect(p1).resolves.toEqual({ drained: true })
    scheduler = null
  })

  it('12. drain timeout: a tick outlasting stopDrainMs resolves { drained:false } WITHOUT cancelling the tick and without an unhandled rejection', async () => {
    const a = sweep('a')
    const gate = deferred<SweepResult>()
    route({ a: () => gate.promise })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a])
    await vi.advanceTimersByTimeAsync(0) // tick in flight, hung
    const stopP = scheduler.stop()
    await vi.advanceTimersByTimeAsync(DRAIN)
    await expect(stopP).resolves.toEqual({ drained: false })
    // the tick was NOT cancelled — it settles later, harmlessly
    gate.resolve({ state: 'SUCCESS', full: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0) // settling after stop never re-arms
    scheduler = null
  })

  it('14. the scheduler threads its terminal isStopping predicate into runBoundedSweep (Phase-B cooperative stop)', async () => {
    const a = sweep('a')
    let seenPredicate: (() => boolean) | null = null
    const gate = deferred<SweepResult>()
    mockRun.mockImplementation(async (_p, _spec, _mono, isStopping) => {
      seenPredicate = isStopping
      return gate.promise
    })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a])
    await vi.advanceTimersByTimeAsync(0)
    expect(seenPredicate).not.toBeNull()
    expect(seenPredicate!()).toBe(false)
    const stopP = scheduler.stop()
    expect(seenPredicate!()).toBe(true) // terminal signal visible INSIDE the in-flight sweep
    gate.resolve({ state: 'SUCCESS', full: false })
    await stopP
    scheduler = null
  })

  it('15. forceJoin: after a drain timeout the unwinding tick is joined with every rejection swallowed; a still-hung tick yields joined:false', async () => {
    const a = sweep('a')
    const gate = deferred<SweepResult>()
    route({ a: () => gate.promise })
    scheduler = startMaintenanceScheduler(prisma, cfg(), [a])
    await vi.advanceTimersByTimeAsync(0)
    const stopP = scheduler.stop()
    await vi.advanceTimersByTimeAsync(DRAIN)
    await expect(stopP).resolves.toEqual({ drained: false })

    // (b) still hung: forceJoin times out
    const joinHung = scheduler.forceJoin(1000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(joinHung).resolves.toEqual({ joined: false })

    // (a) resources force-closed: the in-flight op REJECTS; forceJoin swallows it and joins
    const joinP = scheduler.forceJoin(1000)
    gate.reject(new Error('connection destroyed by force-close'))
    await expect(joinP).resolves.toEqual({ joined: true })
    scheduler = null
  })

  it('16. alert launch is TERMINAL under stop: a sweep failing while stopping still logs + backs off but NEVER launches alertDegraded (and is not reclassified SUCCESS)', async () => {
    const a = sweep('a')
    const conf = cfg({ alertAfterFailures: 1 })
    const gate = deferred<SweepResult>()
    route({ a: () => gate.promise })
    scheduler = startMaintenanceScheduler(prisma, conf, [a])
    await vi.advanceTimersByTimeAsync(0) // sweep a in flight
    const stopP = scheduler.stop() // stop BEFORE the failing sweep settles
    gate.resolve({ state: 'FAILURE', full: false, error: new Error('late failure') })
    await stopP
    expect(conf.recordSweepFailure).toHaveBeenCalledTimes(1) // sync redacted log still happens
    expect(a.degradedStreak).toBe(1) // backoff state still updates
    expect(a.lastSuccessAt).toBeUndefined() // never reclassified SUCCESS
    expect(conf.alertDegraded).not.toHaveBeenCalled() // NO alert after stop
    scheduler = null
  })

  it('positive control for 16: the same failure WITHOUT stop launches alertDegraded once the streak crosses the threshold', async () => {
    const a = sweep('a')
    const conf = cfg({ alertAfterFailures: 1 })
    route({ a: fail })
    scheduler = startMaintenanceScheduler(prisma, conf, [a])
    await bootTick()
    expect(conf.alertDegraded).toHaveBeenCalledWith('a', 1)
  })
})

describe('maintenanceScheduler — PR-C recovery + run-observation seams', () => {
  it('17. sweepRecovered fires EXACTLY ONCE on the degraded→SUCCESS transition, not on later routine successes', async () => {
    const a = sweep('a')
    const conf = cfg()
    let calls = 0
    route({
      a: () => {
        calls++
        return calls === 1 ? fail() : ok()
      },
    })
    scheduler = startMaintenanceScheduler(prisma, conf, [a])
    await bootTick() // run 1: FAILURE → streak 1
    expect(conf.sweepRecovered).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(DEGRADED_BASE) // run 2: SUCCESS while degraded → transition
    expect(conf.sweepRecovered).toHaveBeenCalledTimes(1)
    expect(conf.sweepRecovered).toHaveBeenCalledWith('a')
    expect(a.degradedStreak).toBe(0) // the streak still resets after the seam fires
    await vi.advanceTimersByTimeAsync(ACTIVE) // run 3: routine SUCCESS
    expect(conf.sweepRecovered).toHaveBeenCalledTimes(1) // no second recovery notice
  })

  it('18. sweepRecovered NEVER fires on a routine success (streak was already 0)', async () => {
    const a = sweep('a')
    const conf = cfg()
    route({ a: ok })
    scheduler = startMaintenanceScheduler(prisma, conf, [a])
    await bootTick()
    await vi.advanceTimersByTimeAsync(ACTIVE)
    expect(conf.sweepRecovered).not.toHaveBeenCalled()
  })

  it('19. recovery launch is TERMINAL under stop: a degraded sweep whose SUCCESS settles after stop() does NOT fire sweepRecovered', async () => {
    const a = sweep('a')
    a.degradedStreak = 2 // sweep already degraded when the run starts
    const conf = cfg()
    const gate = deferred<SweepResult>()
    route({ a: () => gate.promise })
    scheduler = startMaintenanceScheduler(prisma, conf, [a])
    await vi.advanceTimersByTimeAsync(0) // sweep a in flight
    const stopP = scheduler.stop() // stop BEFORE the recovering sweep settles
    gate.resolve({ state: 'SUCCESS', full: false })
    await stopP
    expect(conf.sweepRecovered).not.toHaveBeenCalled() // NO alert launch after stop
    expect(a.degradedStreak).toBe(0) // …but state still updates honestly
    scheduler = null
  })

  it('20. onSweepRun observes every run with honest state/full/phaseB threading (SUCCESS with counts, then FAILURE without)', async () => {
    const a = sweep('a')
    const conf = cfg()
    let calls = 0
    route({
      a: () => {
        calls++
        return calls === 1
          ? Promise.resolve<SweepResult>({
              state: 'SUCCESS',
              full: true,
              phaseB: { full: true, failedRows: 0, startedRows: 7 },
            })
          : fail()
      },
    })
    scheduler = startMaintenanceScheduler(prisma, conf, [a])
    await bootTick()
    await vi.advanceTimersByTimeAsync(ACTIVE)
    const seen = vi.mocked(conf.onSweepRun!).mock.calls.map((c) => c[0])
    expect(seen).toHaveLength(2)
    expect(seen[0]).toMatchObject({
      name: 'a',
      state: 'SUCCESS',
      full: true,
      phaseB: { full: true, failedRows: 0, startedRows: 7 },
    })
    expect(typeof seen[0].durationMs).toBe('number')
    expect(seen[1]).toMatchObject({ name: 'a', state: 'FAILURE', full: false })
    expect(seen[1].phaseB).toBeUndefined() // no invented counts on a run whose Phase B never ran
  })
})
