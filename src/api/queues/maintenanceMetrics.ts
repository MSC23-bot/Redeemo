// src/api/queues/maintenanceMetrics.ts
//
// Neon CU-burn PR-C: the maintenance AlertSink + in-process metrics boundary.
// Governing docs: docs/superpowers/specs/2026-07-01-neon-cu-burn-maintenance-scheduler-design.md §PR-C
// + the owner-approved PR-C decisions (D1-D6).
//
// The metrics boundary is deliberately narrow (owner section 8): console
// structured logs + in-process counters + in-app admin bell Notification rows
// (+ the FAILED CommunicationLog rows the outbox sweep itself writes). NO new
// provider, APM, telemetry schema table, or network destination. Every logged
// error goes through the PR-A allow-listed `classifySweepError` — never raw
// driver/provider text (it can embed credentials, hostnames, or SQL).
//
// Alerting model (owner Decisions 1-3, frozen v1):
//   - Types: ADMIN_MAINTENANCE_DEGRADED / ADMIN_MAINTENANCE_RECOVERED for sweep
//     health; ADMIN_DELIVERY_FAILED for expired-outbox alerts. The enum value
//     encodes the phase; referenceType='maintenance-sweep' + referenceId=<sweep
//     name> is the honest entity reference (the admin bell falls back to
//     mark-read-only for non-merchant references, so nothing breaks).
//   - Dedup: process-local single-flight per alert identity, PLUS a
//     Notification.sentAt lookup (same type + reference identity, within the
//     fixed 15-minute window) before EACH recipient create. Best-effort across
//     restart; explicitly one-replica. No durable incident table.
//   - In-app ONLY via adminNotify(): one Notification row per alertable admin,
//     recipientType ADMIN, userId null, channel IN_APP. NO CommunicationLog row
//     and NO email — emitMerchantSubmittedAlert is deliberately NOT reused
//     because it carries an optional email half.
//   - DB-outage suppression: when a sweep's failures classify as
//     database-unavailable (TIMEOUT / PRISMA_* / PG_*), writing a DEGRADED
//     Notification would itself hit the down database, so the degraded alert
//     stays LOG-ONLY and a process-local recoveryPending marker is set; the
//     RECOVERED alert (a DISTINCT type, so it can never be suppressed by a
//     recent degraded alert's window) fires on the recovery signal, when the
//     DB is provably reachable again. A Redis-only Phase-B failure is NOT a
//     database outage: the DEGRADED alert writes normally.
//   - recoveryPending is process-local and lost on restart (documented,
//     tested): after a restart the operator learns of recovery from the sweep
//     resuming; the missing notice is an accepted v1 best-effort edge.
//   - Terminal stop: stop() flips the terminal flag (no NEW alert launch may
//     start), then drains in-flight alert writes within a fixed bound; a hung
//     write is abandoned (its settlement stays observed via the .catch already
//     attached) and stop() never throws or hangs.

import type { PrismaClient } from '../../../generated/prisma/client'
import type { NotificationType } from '../../../generated/prisma/enums'
import { adminNotify, getAlertableAdmins } from '../shared/adminNotify'
import { classifySweepError, type SweepRunInfo } from './maintenanceScheduler'
import type { SweepState } from './maintenanceSweep'
import { shouldLog } from './logThrottle'

/** [GATED] Owner Decision 2: FIXED 15-minute dedup window. No env var in PR-C. */
export const ALERT_DEDUP_WINDOW_MS = 15 * 60 * 1000

/** Bounded stop-drain for in-flight alert writes (candidate; sits inside the
 *  worker-shutdown phase budget so a hung Notification write cannot stall
 *  shutdown past its own bound). */
export const ALERT_SINK_STOP_DRAIN_MS = 5_000

/** The reference identity every maintenance alert carries (owner Decision 1). */
export const MAINTENANCE_ALERT_REFERENCE_TYPE = 'maintenance-sweep'

export interface ExpiredCommunicationsInfo {
  /** The sweep that performed the expiry (referenceId on the alert). */
  sweep: string
  /** Total rows the committed expiry UPDATE actually transitioned. */
  total: number
  /** Per-CommunicationLog-type breakdown of the SAME transitioned rows —
   *  internal type labels + counts only, never recipient/payload data. */
  byType: { type: string; count: number }[]
}

export interface AlertSink {
  /** Per-run observation (scheduler onSweepRun seam). Sync, never throws. */
  sweepRun(info: SweepRunInfo): void
  /** Failure log + DB-degradation classification (recordSweepFailure seam).
   *  Sync, never throws, runs even while stopping (it is a log, not an alert). */
  sweepFailure(name: string, state: SweepState, error: unknown): void
  /** Degraded-threshold alert launch (alertDegraded seam). Sync entry;
   *  fire-and-forget internally; no-op once stopping. */
  sweepDegraded(name: string, degradedStreak: number): void
  /** Recovery alert launch (sweepRecovered seam). Sync entry; fire-and-forget
   *  internally; no-op once stopping. */
  sweepRecovered(name: string): void
  /** Expired-outbox alert launch (called by the outbox sweep AFTER commit).
   *  Sync entry; fire-and-forget internally; log-only once stopping. */
  expiredCommunications(info: ExpiredCommunicationsInfo): void
  /** Terminal: no new alert launches; bounded drain of in-flight writes.
   *  Never throws, never hangs past ALERT_SINK_STOP_DRAIN_MS. */
  stop(): Promise<{ drained: boolean }>
  /** In-process counters snapshot (the PR-C metrics boundary). */
  getCounters(): Record<string, number>
}

/** DB-unavailable classification: the bounded, source-compatible classes that
 *  mean the DATABASE itself failed. A TIMEOUT state is the DB bounds firing;
 *  PRISMA_ and PG_ prefixed classes are driver/Postgres errors;
 *  ERR_PhaseBDatabaseFailure is the count-only Phase-B failure from a sweep
 *  whose declared side-effect domain is DATABASE (pending-hours promotion,
 *  stale-claim — their Phase-B row work IS database work, so N failed rows
 *  most plausibly means the DB is down). ERR_PhaseBRedisFailure (the outbox
 *  re-enqueue domain), NET_*, other ERR_*, and UNCLASSIFIED are NOT database
 *  outages: on those paths Phase A committed, so the database is reachable. */
export function isDbUnavailableFailure(state: SweepState, errorClass: string): boolean {
  if (state === 'TIMEOUT') return true
  if (errorClass === 'ERR_PhaseBDatabaseFailure') return true
  return errorClass.startsWith('PRISMA_') || errorClass.startsWith('PG_')
}

export function createAlertSink(
  prisma: PrismaClient,
  opts: { nowMs?: () => number } = {},
): AlertSink {
  const nowMs = opts.nowMs ?? (() => Date.now())

  let stopped = false // TERMINAL — no NEW alert launch once set
  const inFlight = new Set<string>() // single-flight per alert identity key
  const pending = new Set<Promise<void>>() // for the bounded stop drain
  /** Sweeps whose LATEST failure classified as database-unavailable. */
  const dbDegraded = new Set<string>()
  /** Sweeps with an open degraded EPISODE (alert launched OR suppressed as
   *  recoveryPending) — the only sweeps a RECOVERED alert may fire for. */
  const degradedEpisode = new Set<string>()
  const counters = new Map<string, number>()

  function bump(key: string, by = 1): void {
    counters.set(key, (counters.get(key) ?? 0) + by)
  }

  /**
   * Launch ONE alert (per-recipient fan-out) as a tracked fire-and-forget task.
   * Single-flight on `key`; every recipient create is preceded by the sentAt
   * dedup lookup; every rejection is observed (redacted) — a failed alert can
   * never affect the sweep cadence or escape as an unhandled rejection.
   */
  function launchAlert(
    key: string,
    alert: { type: NotificationType; referenceId: string; title: string; body: string },
  ): void {
    if (stopped) return
    if (inFlight.has(key)) return // single-flight: one launch per identity at a time
    inFlight.add(key)
    const task = (async () => {
      const admins = await getAlertableAdmins(prisma)
      const since = new Date(nowMs() - ALERT_DEDUP_WINDOW_MS)
      for (const admin of admins) {
        try {
          const recent = await prisma.notification.findFirst({
            where: {
              recipientType: 'ADMIN',
              recipientId: admin.id,
              type: alert.type,
              referenceType: MAINTENANCE_ALERT_REFERENCE_TYPE,
              referenceId: alert.referenceId,
              sentAt: { gte: since },
            },
            select: { id: true },
          })
          if (recent) {
            bump(`alerts.deduped.${alert.type}`)
            continue // within the fixed window: suppressed for THIS recipient
          }
          await adminNotify(prisma, {
            adminUserId: admin.id,
            type: alert.type,
            title: alert.title,
            body: alert.body,
            referenceId: alert.referenceId,
            referenceType: MAINTENANCE_ALERT_REFERENCE_TYPE,
          })
          bump(`alerts.sent.${alert.type}`)
        } catch (err) {
          // Per-recipient isolation: one failed write never stops the rest.
          bump(`alerts.failed.${alert.type}`)
          console.error('[maintenance] alert write failed', {
            alert: key,
            errorClass: classifySweepError(err),
          })
        }
      }
    })()
      .catch((err) => {
        // The fan-out setup itself failed (e.g. getAlertableAdmins) — observed,
        // redacted, swallowed. Never re-thrown into the scheduler.
        bump('alerts.launchFailed')
        console.error('[maintenance] alert launch failed', {
          alert: key,
          errorClass: classifySweepError(err),
        })
      })
      .finally(() => {
        inFlight.delete(key)
        pending.delete(task)
      })
    pending.add(task)
  }

  return {
    sweepRun(info: SweepRunInfo): void {
      try {
        bump(`sweep.${info.name}.runs`)
        bump(`sweep.${info.name}.state.${info.state}`)
        if (info.phaseB) {
          bump(`sweep.${info.name}.rowsStarted`, info.phaseB.startedRows)
          bump(`sweep.${info.name}.rowsFailed`, info.phaseB.failedRows)
        }
        // Structured per-run log: unthrottled on non-SUCCESS (rare, actionable);
        // throttled on SUCCESS so an active backlog drain cannot spam.
        if (info.state !== 'SUCCESS' || shouldLog(`maintenance-run:${info.name}`)) {
          console.log('[maintenance] sweep run', {
            sweep: info.name,
            state: info.state,
            durationMs: Math.round(info.durationMs),
            full: info.full,
            startedRows: info.phaseB?.startedRows,
            failedRows: info.phaseB?.failedRows,
          })
        }
      } catch {
        // never throws into the scheduler
      }
    },

    sweepFailure(name: string, state: SweepState, error: unknown): void {
      try {
        const errorClass = classifySweepError(error)
        bump(`sweep.${name}.failures`)
        // Same redacted shape as the PR-A default: sweep + state + allow-listed
        // class only. Never raw error text.
        console.error('[maintenance] sweep failure', { sweep: name, state, errorClass })
        // LATEST classification wins: a Redis-only Phase-B failure after a DB
        // timeout means Phase A committed — the database is reachable again.
        if (isDbUnavailableFailure(state, errorClass)) dbDegraded.add(name)
        else dbDegraded.delete(name)
      } catch {
        // never throws into the scheduler
      }
    },

    sweepDegraded(name: string, degradedStreak: number): void {
      try {
        if (stopped) return // terminal: no new alert
        bump(`sweep.${name}.degraded`)
        degradedEpisode.add(name) // open episode either way — RECOVERED may fire later
        if (dbDegraded.has(name)) {
          // Writing the Notification would hit the down database. Log-only;
          // the RECOVERED alert carries the news once the DB is back.
          bump(`sweep.${name}.degradedSuppressedDbDown`)
          console.error('[maintenance] degraded alert suppressed (database unavailable)', {
            sweep: name,
            degradedStreak,
            recoveryPending: true,
          })
          return
        }
        launchAlert(`degraded:${name}`, {
          type: 'ADMIN_MAINTENANCE_DEGRADED',
          referenceId: name,
          title: 'Maintenance sweep degraded',
          body: `The "${name}" maintenance sweep has failed ${degradedStreak} consecutive runs and is on degraded backoff. It retries automatically; the worker log carries the redacted failure class.`,
        })
      } catch {
        // never throws into the scheduler
      }
    },

    sweepRecovered(name: string): void {
      try {
        if (stopped) return // terminal: no new alert
        bump(`sweep.${name}.recovered`)
        dbDegraded.delete(name) // the recovery signal proves the DB round-trip
        if (!degradedEpisode.has(name)) return // no open episode: nothing to close
        degradedEpisode.delete(name)
        launchAlert(`recovered:${name}`, {
          type: 'ADMIN_MAINTENANCE_RECOVERED',
          referenceId: name,
          title: 'Maintenance sweep recovered',
          body: `The "${name}" maintenance sweep has recovered and returned to its normal cadence.`,
        })
      } catch {
        // never throws into the scheduler
      }
    },

    expiredCommunications(info: ExpiredCommunicationsInfo): void {
      try {
        bump(`sweep.${info.sweep}.expiredCommunications`, info.total)
        const breakdown = info.byType.map((t) => `${t.type} x${t.count}`).join(', ')
        // The count + type labels are internal identifiers from the SAME rows
        // the committed UPDATE transitioned — never recipient or payload data.
        console.warn('[maintenance] expired queued communications', {
          sweep: info.sweep,
          total: info.total,
          byType: breakdown,
        })
        if (stopped) return // terminal: the log above still happened
        if (info.total <= 0) return
        launchAlert(`expiry:${info.sweep}`, {
          type: 'ADMIN_DELIVERY_FAILED',
          referenceId: info.sweep,
          title: 'Queued communications expired',
          body: `The "${info.sweep}" sweep expired ${info.total} queued communication(s) older than the 24 hour outbox limit (${breakdown}). The rows are marked FAILED with their payloads cleared.`,
        })
      } catch {
        // never throws into the sweep
      }
    },

    async stop(): Promise<{ drained: boolean }> {
      stopped = true // (1) terminal FIRST: no new launch may start
      const snapshot = [...pending]
      if (snapshot.length === 0) return { drained: true }
      let bound: NodeJS.Timeout | undefined
      const deadline = new Promise<'timeout'>((res) => {
        bound = setTimeout(() => res('timeout'), ALERT_SINK_STOP_DRAIN_MS)
      })
      try {
        // (2) bounded drain. The timeout does NOT cancel a hung write — its
        // eventual settlement stays observed via the .catch/.finally attached
        // at launch, so no late rejection can escape shutdown.
        const outcome = await Promise.race([
          Promise.allSettled(snapshot).then(() => 'drained' as const),
          deadline,
        ])
        return { drained: outcome === 'drained' }
      } catch {
        return { drained: false } // defensive: stop() never throws
      } finally {
        if (bound) clearTimeout(bound)
      }
    },

    getCounters(): Record<string, number> {
      return Object.fromEntries(counters)
    },
  }
}
