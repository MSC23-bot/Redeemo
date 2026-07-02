// src/workerShutdown.ts
//
// Neon CU-burn PR-A Task A6 (Codex round-2 Finding 2): the worker's ordered
// shutdown as a TESTABLE coordinator. The contract (spec §4.6) is that shutdown
// NEVER waits indefinitely — every phase is bounded, every late rejection is
// observed, and the caller's `finally { process.exit() }` stays reachable no
// matter which phase hangs.
//
// Locked ordering (PR-C adds the AlertSink phase): scheduler cooperative stop
// (bounded drain) → AlertSink stop (terminal: no new alert launch; bounded
// drain of in-flight Notification writes) → BullMQ workers close + owned
// connection quit (bounded; force-disconnect on timeout) → producer
// closeQueues (internally bounded + real force-close) → Prisma disconnect
// (bounded) → scheduler forceJoin (bounded post-force join) → [caller]
// process.exit fallback. No new DB/Redis/alert operation begins after the
// terminal stop signal (enforced inside the scheduler AND the AlertSink).

import type { MaintenanceScheduler } from './api/queues/maintenanceScheduler'

/** Defensive coordinator bound around AlertSink.stop() — the sink's own drain
 *  is internally bounded (ALERT_SINK_STOP_DRAIN_MS = 5s), so this only fires
 *  if the sink violates its never-hangs contract. */
const ALERT_SINK_PHASE_TIMEOUT_MS = 6_000

export interface WorkerShutdownDeps {
  /** null when MAINTENANCE_MODE=disabled — the maintenance phases are skipped. */
  scheduler: MaintenanceScheduler | null
  /** PR-C: the maintenance AlertSink; null/omitted when maintenance is disabled. */
  alertSink?: { stop(): Promise<unknown> } | null
  workers: ReadonlyArray<{ close(): Promise<unknown> }>
  /** The OWNED per-worker Redis connections — force-disconnected on timeout. */
  workerConnections: ReadonlyArray<{ quit(): Promise<unknown>; disconnect(): void }>
  closeQueues: () => Promise<void>
  disconnectPrisma: () => Promise<void>
  workerCloseTimeoutMs: number
  prismaDisconnectTimeoutMs: number
  forceJoinTimeoutMs: number
  log?: (message: string) => void
}

export interface WorkerShutdownSummary {
  /** true: the active maintenance tick settled inside the drain bound. */
  drained: boolean
  /** PR-C: present when an AlertSink was provided; 'timeout' only if the sink
   *  violated its own bounded-drain contract. */
  alertSinkPhase?: 'ok' | 'timeout'
  workerClosePhase: 'ok' | 'timeout'
  prismaPhase: 'ok' | 'timeout'
  /** true: the (possibly force-closed) tick was joined; false → process.exit terminates it. */
  joined: boolean
}

/**
 * Await `work` for at most `ms`. The work promise is OBSERVED both ways
 * (fulfil/reject), so a late settlement after the timeout can never become an
 * unhandled rejection; phase-specific errors are handled inside each phase.
 */
async function boundedPhase(work: Promise<unknown>, ms: number): Promise<'ok' | 'timeout'> {
  let timer: NodeJS.Timeout | undefined
  const observed = work.then(
    () => 'ok' as const,
    () => 'ok' as const, // settled-by-rejection still ENDS the phase; never unhandled
  )
  const outcome = await Promise.race([
    observed,
    new Promise<'timeout'>((res) => {
      timer = setTimeout(() => res('timeout'), ms)
    }),
  ])
  if (timer) clearTimeout(timer)
  return outcome
}

/**
 * Run the full ordered shutdown. NEVER throws and NEVER hangs: each phase is
 * bounded, so the caller's `finally { process.exit(exitCode) }` is always
 * reached. Returns a summary for the shutdown log.
 */
export async function runWorkerShutdown(deps: WorkerShutdownDeps): Promise<WorkerShutdownSummary> {
  const log = deps.log ?? ((m: string) => console.warn(m))

  // (1) Terminal cooperative stop + bounded active-tick drain FIRST — no new
  //     sweep/row/alert starts from here on. stop() never rejects by contract,
  //     but the coordinator must not TRUST that: a rejection (or a synchronous
  //     throw) here is normalized to the conservative drained:false so every
  //     later cleanup phase still runs.
  let drained = true
  if (deps.scheduler) {
    try {
      drained = (await deps.scheduler.stop()).drained
    } catch {
      drained = false // conservative: treat an errored drain as not-drained
    }
    if (!drained) log('[worker] maintenance stop/drain did not complete cleanly — proceeding to force-close')
  }

  // (1b — PR-C) AlertSink terminal stop AFTER the scheduler stop (so no seam
  //     can launch a new alert into a stopping sink) and BEFORE the resource
  //     force-closes below (so in-flight Notification writes get their bounded
  //     drain while the DB connection still lives). stop() never throws or
  //     hangs by contract; the coordinator bounds it anyway and normalizes a
  //     contract-violating rejection/hang to 'timeout' — later phases always run.
  let alertSinkPhase: 'ok' | 'timeout' | undefined
  if (deps.alertSink) {
    const sink = deps.alertSink
    alertSinkPhase = await boundedPhase(
      Promise.resolve().then(() => sink.stop()),
      ALERT_SINK_PHASE_TIMEOUT_MS,
    )
    if (alertSinkPhase === 'timeout') {
      log('[worker] alert-sink stop did not settle within bound — proceeding (late writes stay observed)')
    }
  }

  // (2) BullMQ workers close + owned connection quit — BOUNDED. A stuck
  //     in-flight job can no longer stall SIGTERM; on timeout the owned
  //     sockets are force-destroyed so no blocking read outlives shutdown.
  //     `workerPhaseTimedOut` gates the chained quit: if a hung close settles
  //     LATE (after the timeout + force-disconnect), no NEW quit op may start —
  //     the no-new-operation-after-stop boundary holds even for late settlers.
  let workerPhaseTimedOut = false
  const workerClosePhase = await boundedPhase(
    // Promise.resolve().then(...) converts a SYNCHRONOUS throw from close()/
    // quit() into an observed rejection — otherwise it would escape before
    // boundedPhase ever received a promise and skip the later cleanup phases.
    Promise.all(
      deps.workers.map((w) =>
        Promise.resolve()
          .then(() => w.close())
          .catch(() => undefined),
      ),
    ).then(() => {
      if (workerPhaseTimedOut) return undefined // late settlement: sockets already force-closed
      return Promise.all(
        deps.workerConnections.map((c) =>
          Promise.resolve()
            .then(() => c.quit())
            .then(
              () => undefined,
              () => undefined,
            ),
        ),
      )
    }),
    deps.workerCloseTimeoutMs,
  )
  if (workerClosePhase === 'timeout') {
    workerPhaseTimedOut = true
    log('[worker] BullMQ worker close/quit timed out — force-disconnecting owned connections')
    for (const c of deps.workerConnections) {
      try {
        c.disconnect() // REAL force-close of the blocking-read sockets
      } catch {
        /* the force path never throws */
      }
    }
  }

  // (3) Producer queues: internally bounded graceful close + real force-close.
  try {
    await deps.closeQueues()
  } catch {
    /* closeQueues never throws by contract; defensive */
  }

  // (4) Prisma disconnect — BOUNDED, so a hanging pool teardown cannot prevent
  //     the forceJoin below or the caller's process.exit.
  const prismaPhase = await boundedPhase(
    Promise.resolve().then(() => deps.disconnectPrisma()),
    deps.prismaDisconnectTimeoutMs,
  )
  if (prismaPhase === 'timeout') {
    log('[worker] prisma.$disconnect did not settle within bound — proceeding (process exit destroys the pool)')
  }

  // (5) Bounded post-force join: the now-unwinding tick (its in-flight op
  //     rejects on the destroyed connections) is awaited, rejections swallowed.
  //     A rejection FROM forceJoin itself (contract-violating) is normalized to
  //     joined:false — the coordinator still returns its summary so the
  //     caller's process.exit fallback terminates whatever is left.
  let joined = true
  if (deps.scheduler) {
    try {
      joined = (await deps.scheduler.forceJoin(deps.forceJoinTimeoutMs)).joined
    } catch {
      joined = false
    }
    if (!joined) log('[worker] maintenance tick still unsettled after force-close — process exit terminates it')
  }

  return {
    drained,
    ...(alertSinkPhase !== undefined ? { alertSinkPhase } : {}),
    workerClosePhase,
    prismaPhase,
    joined,
  }
}
