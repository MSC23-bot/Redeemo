// src/api/queues/maintenanceScheduler.ts
//
// Neon CU-burn PR-A Task A2: the process-local maintenance scheduler — the
// durable-floor replacement for the always-on BullMQ maintenance repeatables.
// Governing docs: docs/superpowers/specs/2026-07-01-neon-cu-burn-maintenance-scheduler-design.md §4.1/§4.4/§4.6
// + docs/superpowers/plans/2026-07-01-neon-cu-burn-maintenance-scheduler.md Task A2.
//
// Invariants (do not weaken):
//   - PER-SWEEP ISOLATION: every sweep owns its nextEligibleAt / degradedStreak /
//     lastSuccessAt / lastFailureAt. No shared error state; one sweep failing or
//     backing off never changes a sibling.
//   - SEQUENTIAL WITHIN A TICK, each sweep bounded by its own lock/tx/budget
//     (runBoundedSweep). runOne NEVER rejects and ALWAYS advances nextEligibleAt,
//     so a rejection can never tight-loop the scheduler.
//   - ALIGNED WAKE: healthy sweeps share the cadence; only a degraded sweep
//     diverges onto its own capped exponential backoff. The timer wakes at
//     min(nextEligibleAt) and is re-armed EXACTLY ONCE after each tick completes
//     (never from inside an in-flight tick); `tickInFlight` is the single-flight
//     guard.
//   - TERMINAL COOPERATIVE STOP: `stop()` sets `stopped` BEFORE draining; the
//     tick loop checks it before every sweep AND after each awaited sweep, the
//     same predicate is threaded into Phase B (checked before every row and
//     every separately-awaited in-row op), and the degraded-alert launch is
//     guarded by !isStopping() immediately adjacent to the seam — so once stop
//     is requested NO new sweep, row, in-row op, or alert starts. It does NOT
//     cancel an already-running operation; the A6 force-close makes that op
//     reject, and forceJoin() then joins the unwinding tick.
//   - The timer is Redis-independent but NOT durable: the DB rows + the boot
//     scan are the durable guarantee (spec §3).

import type { PrismaClient } from '../../../generated/prisma/client'
import { runBoundedSweep, type BoundedSweepSpec, type SweepState } from './maintenanceSweep'

export interface SweepRuntime {
  spec: BoundedSweepSpec<unknown>
  enabled: boolean
  /** epoch ms — this sweep is eligible to run at/after this instant. */
  nextEligibleAt: number
  degradedStreak: number
  lastSuccessAt?: number
  lastFailureAt?: number
}

export interface SchedulerConfig {
  /** Healthy idle cadence. MUST be > 300_000 (Neon 5-min scale-to-zero window; validated in env, A4). */
  idleMs: number
  /** Backlog-drain cadence while a sweep reports full batches (needsRescan). */
  activeMs: number
  /** Consecutive empty scans before a sweep drops from active to idle. */
  emptyScansToIdle: number
  degradedBaseMs: number
  degradedMaxMs: number
  /** Launch the degraded alert once a sweep's streak reaches this. */
  alertAfterFailures: number
  /** Bounded shutdown-drain window for the active tick (A6). */
  stopDrainMs: number
  nowMs: () => number
  monotonicNowMs: () => number
  /** PR-C seam — SYNC structured log; PR-A default is a log stub. Runs even while stopping. */
  recordSweepFailure?: (name: string, state: SweepState, error: unknown) => void
  /** PR-C seam — SYNC void, fire-and-forget internally; PR-A default is a log stub. NEVER launched once stopping. */
  alertDegraded?: (name: string, degradedStreak: number) => void
}

export interface StopResult {
  /** true: the active tick settled inside stopDrainMs; false: drain timed out — A6 force-closes. */
  drained: boolean
}

export interface MaintenanceScheduler {
  /** Async, idempotent, terminal. Concurrent callers share ONE drain promise. */
  stop(): Promise<StopResult>
  /**
   * Bounded post-force join (A6): called AFTER resources are force-closed so the
   * unwinding tick (whose in-flight op now rejects) is awaited with every
   * rejection swallowed. joined:false → the process-termination fallback applies.
   */
  forceJoin(boundMs: number): Promise<{ joined: boolean }>
}

/**
 * Wrap a typed sweep spec as a SweepRuntime. TSide is erased here — the ONE
 * sanctioned cast site: the scheduler never touches sideEffects itself (it only
 * threads them from dbPhase into the same spec's runSideEffects inside
 * runBoundedSweep, where the pairing is type-safe).
 */
export function makeSweepRuntime<TSide>(spec: BoundedSweepSpec<TSide>, enabled = true): SweepRuntime {
  return {
    spec: spec as unknown as BoundedSweepSpec<unknown>,
    enabled,
    nextEligibleAt: 0,
    degradedStreak: 0,
  }
}

const defaultRecordSweepFailure = (name: string, state: SweepState, error: unknown): void => {
  // Redacted structured log — counts/labels only, never payload/PII.
  console.error('[maintenance] sweep failure', {
    sweep: name,
    state,
    reason: error instanceof Error ? error.message : String(error),
  })
}

const defaultAlertDegraded = (name: string, degradedStreak: number): void => {
  // PR-A log stub; PR-C replaces this with the AlertSink (getAlertableAdmins + adminNotify).
  console.error('[maintenance] sweep degraded', { sweep: name, degradedStreak })
}

export function startMaintenanceScheduler(
  prisma: PrismaClient,
  cfg: SchedulerConfig,
  sweeps: SweepRuntime[],
): MaintenanceScheduler {
  const recordSweepFailure = cfg.recordSweepFailure ?? defaultRecordSweepFailure
  const alertDegraded = cfg.alertDegraded ?? defaultAlertDegraded

  let stopped = false // TERMINAL — set before draining, never reset
  let tickInFlight = false // process-local single-flight guard
  let timer: NodeJS.Timeout | null = null
  let activeTick: Promise<void> | null = null // the in-flight tick promise — enables the shutdown DRAIN
  let stopping: Promise<StopResult> | null = null // idempotent stop: concurrent callers share ONE drain
  const isStopping = (): boolean => stopped // threaded into the tick loop AND Phase B
  const emptyRun = new Map<string, number>()

  function setNext(s: SweepRuntime, delay: number): void {
    s.nextEligibleAt = cfg.nowMs() + delay // never arms the timer — arm() runs once per tick
  }
  function backoff(s: SweepRuntime): number {
    return Math.min(cfg.degradedBaseMs * 2 ** (s.degradedStreak - 1), cfg.degradedMaxMs)
  }

  async function runOne(s: SweepRuntime): Promise<void> {
    try {
      let res
      try {
        res = await runBoundedSweep(prisma, s.spec, cfg.monotonicNowMs, isStopping)
      } catch (err) {
        // UNEXPECTED rejection → FAILURE for THIS sweep only; siblings unaffected
        res = { state: 'FAILURE' as const, full: false, error: err }
      }
      switch (res.state) {
        case 'SUCCESS': {
          s.degradedStreak = 0
          s.lastSuccessAt = cfg.nowMs()
          const empties = res.full ? 0 : (emptyRun.get(s.spec.name) ?? 0) + 1
          emptyRun.set(s.spec.name, empties)
          return setNext(s, res.full || empties < cfg.emptyScansToIdle ? cfg.activeMs : cfg.idleMs)
        }
        case 'LOCK_SKIPPED':
          return setNext(s, cfg.idleMs) // another holder ran it — no degrade, no tight retry
        case 'TIMEOUT':
        case 'FAILURE': {
          // Per-sweep state ALWAYS updates — a failed sweep is NEVER reclassified
          // SUCCESS when stopping, and the sync redacted log ALWAYS runs.
          s.degradedStreak++
          s.lastFailureAt = cfg.nowMs()
          recordSweepFailure(s.spec.name, res.state, res.error)
          // ALERT LAUNCH IS TERMINAL under stop: the !isStopping() guard sits
          // IMMEDIATELY adjacent to the launch seam — no new alert after stop.
          if (!isStopping() && s.degradedStreak >= cfg.alertAfterFailures) {
            alertDegraded(s.spec.name, s.degradedStreak)
          }
          return setNext(s, backoff(s)) // OWN backoff — always ADVANCES nextEligibleAt
        }
      }
    } catch {
      // last resort: runOne NEVER rejects and ALWAYS advances (no tight loop)
      s.degradedStreak++
      s.lastFailureAt = cfg.nowMs()
      setNext(s, backoff(s))
    }
  }

  function tick(): void {
    if (stopped || tickInFlight) return // single-flight + NO new tick once stopped
    tickInFlight = true
    activeTick = (async () => {
      try {
        const now = cfg.nowMs()
        for (const s of sweeps) {
          if (stopped) break // BEFORE each sweep: no new sweep starts after stop
          if (s.enabled && s.nextEligibleAt <= now) await runOne(s) // SEQUENTIAL; never rejects
          if (stopped) break // AFTER the await: a settling op never falls through into a sibling
        }
      } finally {
        tickInFlight = false
        activeTick = null
        if (!stopped) arm() // arm ONCE, after the tick completes — never while stopping
      }
    })()
  }

  function arm(): void {
    if (stopped || tickInFlight) return
    const due = sweeps.filter((s) => s.enabled)
    if (!due.length) return
    const next = Math.max(0, Math.min(...due.map((s) => s.nextEligibleAt)) - cfg.nowMs())
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void tick()
    }, next)
  }

  for (const s of sweeps) s.nextEligibleAt = cfg.nowMs() // BOOT: immediate scan IS the recovery
  arm()

  return {
    stop(): Promise<StopResult> {
      if (stopping) return stopping // idempotent: concurrent callers share ONE drain
      stopped = true // (1) terminal signal FIRST — no new tick, sweep, row, or alert
      if (timer) {
        clearTimeout(timer) // (2) clear the armed timer
        timer = null
      }
      stopping = (async () => {
        const inFlight = activeTick // (3) track the ACTIVE TICK promise, not just tickInFlight
        if (!inFlight) return { drained: true }
        let bound: NodeJS.Timeout | undefined
        const deadline = new Promise<'timeout'>((res) => {
          bound = setTimeout(() => res('timeout'), cfg.stopDrainMs)
        })
        try {
          // (4) await the tick within stopDrainMs; the timeout does NOT cancel it —
          // a drained:false result tells A6 to proceed to the real force-close.
          const outcome = await Promise.race([inFlight.then(() => 'drained' as const), deadline])
          return { drained: outcome === 'drained' }
        } catch {
          return { drained: false } // (5) every rejection caught (defensive; the tick never rejects)
        } finally {
          if (bound) clearTimeout(bound) // never leak the drain timer
        }
      })()
      return stopping
    },

    async forceJoin(boundMs: number): Promise<{ joined: boolean }> {
      const inFlight = activeTick
      if (!inFlight) return { joined: true } // tick already settled during the drain
      let bound: NodeJS.Timeout | undefined
      const deadline = new Promise<'timeout'>((res) => {
        bound = setTimeout(() => res('timeout'), boundMs)
      })
      try {
        const outcome = await Promise.race([
          inFlight.then(
            () => 'joined' as const,
            () => 'joined' as const, // rejections swallowed — none may escape shutdown
          ),
          deadline,
        ])
        return { joined: outcome === 'joined' }
      } finally {
        if (bound) clearTimeout(bound)
      }
    },
  }
}
