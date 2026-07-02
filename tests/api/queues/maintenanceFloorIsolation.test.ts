import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PrismaClient } from '../../../generated/prisma/client'
import type { MaintenanceConfig } from '../../../src/api/shared/env'
import type { SweepResult } from '../../../src/api/queues/maintenanceSweep'

// Neon CU-burn PR-B: the THREE-SWEEP floor — named isolation pins using the
// REAL sweep specs (buildOutboxSweep / buildPendingHoursSweep /
// buildClaimStaleSweep) under the real scheduler, with runBoundedSweep mocked
// so each sweep's outcome is driven deterministically. Pins the closed-scope
// requirements: disabling one sweep leaves the siblings running (and never
// enables any polling), a failure in one sweep degrades ONLY that sweep, and
// the three sweeps carry distinct advisory-lock identities.

vi.mock('../../../src/api/queues/maintenanceSweep', async (orig) => ({
  ...(await orig<typeof import('../../../src/api/queues/maintenanceSweep')>()),
  runBoundedSweep: vi.fn(),
}))

import { runBoundedSweep } from '../../../src/api/queues/maintenanceSweep'
import {
  startMaintenanceScheduler,
  makeSweepRuntime,
  type MaintenanceScheduler,
  type SweepRuntime,
} from '../../../src/api/queues/maintenanceScheduler'
import { buildOutboxSweep, OUTBOX_SWEEP_LOCK_KEY } from '../../../src/api/queues/processors/outboxReconciler'
import {
  buildPendingHoursSweep,
  PENDING_HOURS_SWEEP_LOCK_KEY,
  PENDING_HOURS_SWEEP_NAME,
} from '../../../src/api/queues/processors/promotePendingHours'
import {
  buildClaimStaleSweep,
  CLAIM_STALE_SWEEP_LOCK_KEY,
  CLAIM_STALE_SWEEP_NAME,
} from '../../../src/api/queues/processors/claimStaleSweep'

const mockRun = vi.mocked(runBoundedSweep)
const prisma = {} as PrismaClient

const CFG: MaintenanceConfig & { mode: 'enabled' } = {
  mode: 'enabled',
  floorIdleMs: 1_800_000,
  floorActiveMs: 5_000,
  phaseBMaxItems: 200,
  phaseBBudgetMs: 10_000,
  statementTimeoutMs: 4_000,
  txTimeoutMs: 8_000,
  sweepOutboxEnabled: true,
  sweepPendingHoursEnabled: true,
  sweepClaimStaleEnabled: true,
}

const OUTBOX = 'outbox-reconcile'
const PENDING = PENDING_HOURS_SWEEP_NAME
const STALE = CLAIM_STALE_SWEEP_NAME

function schedulerCfg() {
  return {
    idleMs: CFG.floorIdleMs,
    activeMs: CFG.floorActiveMs,
    emptyScansToIdle: 2,
    degradedBaseMs: 60_000,
    degradedMaxMs: 3_600_000,
    alertAfterFailures: 3,
    stopDrainMs: 10_000,
    nowMs: () => Date.now(),
    monotonicNowMs: () => Date.now(),
    recordSweepFailure: vi.fn(),
    alertDegraded: vi.fn(),
  }
}

/** The worker.ts wiring, reproduced with the REAL build* specs. */
function threeSweeps(flags: { outbox?: boolean; pending?: boolean; stale?: boolean } = {}): SweepRuntime[] {
  return [
    makeSweepRuntime(buildOutboxSweep(CFG), flags.outbox ?? true),
    makeSweepRuntime(buildPendingHoursSweep(prisma, CFG), flags.pending ?? true),
    makeSweepRuntime(buildClaimStaleSweep(prisma, CFG), flags.stale ?? true),
  ]
}

function route(impls: Record<string, () => Promise<SweepResult>>): void {
  mockRun.mockImplementation(async (_p, spec) => {
    const impl = impls[(spec as { name: string }).name]
    return impl ? impl() : { state: 'SUCCESS', full: false }
  })
}

const ok = (): Promise<SweepResult> => Promise.resolve({ state: 'SUCCESS', full: false })
const fail = (): Promise<SweepResult> =>
  Promise.resolve({ state: 'FAILURE', full: false, error: new Error('db down') })

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

describe('three-sweep floor — distinct identities', () => {
  it('the three sweeps carry DISTINCT advisory-lock keys and names', () => {
    const keys = [OUTBOX_SWEEP_LOCK_KEY, PENDING_HOURS_SWEEP_LOCK_KEY, CLAIM_STALE_SWEEP_LOCK_KEY]
    expect(new Set(keys).size).toBe(3)
    const specs = threeSweeps().map((s) => s.spec)
    expect(new Set(specs.map((s) => s.name)).size).toBe(3)
    expect(new Set(specs.map((s) => s.lockKey)).size).toBe(3)
    // Every spec carries its OWN copy of the validated timeout configuration.
    for (const s of specs) {
      expect(s.statementTimeoutMs).toBe(CFG.statementTimeoutMs)
      expect(s.txTimeoutMs).toBe(CFG.txTimeoutMs)
      expect(s.phaseBMaxItems).toBe(CFG.phaseBMaxItems)
      expect(s.phaseBBudgetMs).toBe(CFG.phaseBBudgetMs)
    }
  })
})

describe('three-sweep floor — per-sweep enable flags are the rollback switches', () => {
  it('disabling PENDING-HOURS leaves outbox + claim-stale running (and enables no polling for the disabled sweep)', async () => {
    route({ [OUTBOX]: ok, [PENDING]: ok, [STALE]: ok })
    scheduler = startMaintenanceScheduler(prisma, schedulerCfg(), threeSweeps({ pending: false }))
    await vi.advanceTimersByTimeAsync(0) // BOOT scan
    expect(callsFor(OUTBOX)).toBe(1)
    expect(callsFor(STALE)).toBe(1)
    expect(callsFor(PENDING)).toBe(0) // never runs — and nothing else polls for it
    await vi.advanceTimersByTimeAsync(10 * CFG.floorIdleMs)
    expect(callsFor(PENDING)).toBe(0)
  })

  it('disabling CLAIM-STALE leaves outbox + pending-hours running', async () => {
    route({ [OUTBOX]: ok, [PENDING]: ok, [STALE]: ok })
    scheduler = startMaintenanceScheduler(prisma, schedulerCfg(), threeSweeps({ stale: false }))
    await vi.advanceTimersByTimeAsync(0)
    expect(callsFor(OUTBOX)).toBe(1)
    expect(callsFor(PENDING)).toBe(1)
    expect(callsFor(STALE)).toBe(0)
  })
})

describe('three-sweep floor — failure isolation (named, real specs)', () => {
  it('a PENDING-HOURS DB failure degrades ONLY the pending-hours sweep; outbox + claim-stale keep their state and cadence', async () => {
    const sweeps = threeSweeps()
    route({ [OUTBOX]: ok, [PENDING]: fail, [STALE]: ok })
    scheduler = startMaintenanceScheduler(prisma, schedulerCfg(), sweeps)
    await vi.advanceTimersByTimeAsync(0)
    const [outbox, pending, stale] = sweeps
    expect(pending.degradedStreak).toBe(1)
    expect(pending.lastFailureAt).toBeDefined()
    expect(outbox.degradedStreak).toBe(0) // siblings untouched
    expect(stale.degradedStreak).toBe(0)
    expect(outbox.lastSuccessAt).toBeDefined()
    expect(stale.lastSuccessAt).toBeDefined()
  })

  it('a CLAIM-STALE failure does not alter sibling scheduler state', async () => {
    const sweeps = threeSweeps()
    route({ [OUTBOX]: ok, [PENDING]: ok, [STALE]: fail })
    scheduler = startMaintenanceScheduler(prisma, schedulerCfg(), sweeps)
    await vi.advanceTimersByTimeAsync(0)
    const [outbox, pending, stale] = sweeps
    expect(stale.degradedStreak).toBe(1)
    expect(outbox.degradedStreak).toBe(0)
    expect(pending.degradedStreak).toBe(0)
    // The degraded sweep diverges onto its OWN backoff — the siblings' next
    // eligibility is NOT dragged onto it.
    expect(stale.nextEligibleAt).toBeGreaterThanOrEqual(Date.now() + 60_000)
  })
})
