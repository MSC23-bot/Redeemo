import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PrismaClient } from '../../../generated/prisma/client'
import {
  createAlertSink,
  isDbUnavailableFailure,
  ALERT_DEDUP_WINDOW_MS,
  ALERT_SINK_STOP_DRAIN_MS,
  MAINTENANCE_ALERT_REFERENCE_TYPE,
} from '../../../src/api/queues/maintenanceMetrics'
import { PHASE_B_FAILURE_NAME } from '../../../src/api/queues/maintenanceSweep'

// Neon CU-burn PR-C: the AlertSink. Pins the owner-approved alerting model —
// per-recipient in-app fan-out via adminNotify (NO CommunicationLog, NO email),
// the FIXED 15-minute sentAt dedup + process-local single-flight (frozen v1),
// distinct DEGRADED/RECOVERED types with transition semantics, DB-outage
// suppression (log-only until the recovery signal) with the Redis-vs-DB
// classification boundary, restart-loses-recoveryPending as documented
// best-effort, terminal stop with a bounded drain, and redaction everywhere.

const ADMINS = [
  { id: 'admin-1', email: 'ops1@redeemo.test', firstName: 'Opa', lastName: 'One' },
  { id: 'admin-2', email: 'ops2@redeemo.test', firstName: 'Opb', lastName: 'Two' },
]

type CreatedRow = {
  recipientType: string
  recipientId: string
  userId: string | null
  channel: string
  type: string
  title: string
  body: string
  referenceId: string | null
  referenceType: string | null
  sentAt: Date
}

function fakePrisma(nowMs: () => number) {
  const created: CreatedRow[] = []
  const findFirst = vi.fn(
    async (args: {
      where: {
        recipientType: string
        recipientId: string
        type: string
        referenceType: string
        referenceId: string
        sentAt: { gte: Date }
      }
    }) => {
      const w = args.where
      return (
        created.find(
          (r) =>
            r.recipientType === w.recipientType &&
            r.recipientId === w.recipientId &&
            r.type === w.type &&
            r.referenceType === w.referenceType &&
            r.referenceId === w.referenceId &&
            r.sentAt.getTime() >= w.sentAt.gte.getTime(),
        ) ?? null
      )
    },
  )
  const create = vi.fn(async (args: { data: Omit<CreatedRow, 'sentAt'> }) => {
    const row = { ...args.data, sentAt: new Date(nowMs()) }
    created.push(row)
    return row
  })
  const findMany = vi.fn(async () => ADMINS)
  const prisma = {
    notification: { findFirst, create },
    adminUser: { findMany },
  } as unknown as PrismaClient
  return { prisma, created, findFirst, create, findMany }
}

async function flush(): Promise<void> {
  // settle the fire-and-forget launch chain (getAlertableAdmins → dedup → create per admin)
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

let logSpy: ReturnType<typeof vi.spyOn>
let errSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('isDbUnavailableFailure — the Redis-vs-DB classification boundary', () => {
  it('TIMEOUT and PRISMA_/PG_ classes are database outages', () => {
    expect(isDbUnavailableFailure('TIMEOUT', 'UNCLASSIFIED')).toBe(true)
    expect(isDbUnavailableFailure('FAILURE', 'PRISMA_P2028')).toBe(true)
    expect(isDbUnavailableFailure('FAILURE', 'PG_57014')).toBe(true)
  })
  it('PR-C correction: a DATABASE-domain Phase-B failure class IS a database outage; the REDIS-domain class is NOT', () => {
    expect(isDbUnavailableFailure('FAILURE', 'ERR_PhaseBDatabaseFailure')).toBe(true)
    expect(isDbUnavailableFailure('FAILURE', 'ERR_PhaseBRedisFailure')).toBe(false)
  })
  it('a Redis/network failure (NET_* or an UNCLASSIFIED error) is NOT a database outage', () => {
    expect(isDbUnavailableFailure('FAILURE', 'NET_ECONNREFUSED')).toBe(false)
    expect(isDbUnavailableFailure('FAILURE', 'UNCLASSIFIED')).toBe(false)
    expect(isDbUnavailableFailure('FAILURE', 'ERR_TypeError')).toBe(false)
  })
})

/** Build the count-only phase-b failure exactly as runBoundedSweep does — the
 *  name comes from the SAME exported PHASE_B_FAILURE_NAME map runBoundedSweep
 *  uses (pinned there), so mutating either side breaks a pin. */
function phaseBError(domain: 'DATABASE' | 'REDIS', failedRows: number, message?: string): Error {
  const err = new Error(message ?? `phase-b: ${failedRows} side-effect row(s) failed`)
  err.name = PHASE_B_FAILURE_NAME[domain]
  return err
}

describe('AlertSink — PR-C correction: Phase-B failure domains', () => {
  it('pending-hours Phase-B DATABASE failure: ZERO admin lookup / Notification write; degraded is log-only with recovery pending', async () => {
    let now = 1_000_000
    const { prisma, created, findMany, findFirst, create } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepFailure('pending-hours-promote', 'FAILURE', phaseBError('DATABASE', 5))
    sink.sweepDegraded('pending-hours-promote', 3)
    await flush()
    expect(findMany).not.toHaveBeenCalled() // getAlertableAdmins never called
    expect(findFirst).not.toHaveBeenCalled() // no dedup lookup against the down DB
    expect(create).not.toHaveBeenCalled() // adminNotify never called
    expect(created).toHaveLength(0)
    const logged = JSON.stringify(errSpy.mock.calls)
    expect(logged).toContain('suppressed')
    expect(logged).toContain('recoveryPending')
    expect(logged).toContain('ERR_PhaseBDatabaseFailure') // the redacted failure class is the whole story
  })

  it('stale-claim Phase-B DATABASE failure: same log-only suppression, zero admin lookup/notification', async () => {
    let now = 1_000_000
    const { prisma, created, findMany, create } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepFailure('claim-stale', 'FAILURE', phaseBError('DATABASE', 2))
    sink.sweepDegraded('claim-stale', 4)
    await flush()
    expect(findMany).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(created).toHaveLength(0)
  })

  it('later success after a DATABASE-domain suppression: the RECOVERED notification is emitted', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepFailure('pending-hours-promote', 'FAILURE', phaseBError('DATABASE', 5))
    sink.sweepDegraded('pending-hours-promote', 3) // suppressed, recoveryPending
    await flush()
    expect(created).toHaveLength(0)
    sink.sweepRecovered('pending-hours-promote') // the scheduler's SUCCESS-transition seam
    await flush()
    expect(created).toHaveLength(2) // one per alertable admin
    expect(created.every((r) => r.type === 'ADMIN_MAINTENANCE_RECOVERED')).toBe(true)
    expect(created.every((r) => r.referenceId === 'pending-hours-promote')).toBe(true)
  })

  it('outbox Phase-B REDIS failure: the degraded notification is STILL emitted immediately (subject to dedup)', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepFailure('outbox-reconcile', 'FAILURE', phaseBError('REDIS', 3))
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    expect(created).toHaveLength(2)
    expect(created.every((r) => r.type === 'ADMIN_MAINTENANCE_DEGRADED')).toBe(true)
    // dedup policy still applies to the domain path
    sink.sweepDegraded('outbox-reconcile', 4)
    await flush()
    expect(created).toHaveLength(2)
  })

  it('planted secret-bearing text on a domain-named error NEVER escapes to logs or alert bodies', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    const hostile = phaseBError(
      'REDIS',
      1,
      'redis://:hunter2SECRET@redis-host:6379 failed while enqueueing payload {"to":"victim@example.test"}',
    )
    sink.sweepFailure('outbox-reconcile', 'FAILURE', hostile)
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    const logged = JSON.stringify(errSpy.mock.calls)
    expect(logged).not.toContain('hunter2SECRET')
    expect(logged).not.toContain('redis://')
    expect(logged).not.toContain('victim@example.test')
    expect(logged).toContain('ERR_PhaseBRedisFailure') // only the allow-listed class
    for (const row of created) {
      expect(row.body).not.toContain('hunter2SECRET') // alert bodies carry the fixed copy only
      expect(row.body).not.toContain('victim@example.test')
    }
  })
})

describe('AlertSink — degraded alert fan-out (in-app only)', () => {
  it('writes ONE Notification per alertable admin: recipientType ADMIN, userId null, channel IN_APP, referenceType maintenance-sweep, referenceId = sweep name', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    expect(created).toHaveLength(2)
    for (const row of created) {
      expect(row.recipientType).toBe('ADMIN')
      expect(row.userId).toBeNull()
      expect(row.channel).toBe('IN_APP')
      expect(row.type).toBe('ADMIN_MAINTENANCE_DEGRADED')
      expect(row.referenceType).toBe(MAINTENANCE_ALERT_REFERENCE_TYPE)
      expect(row.referenceId).toBe('outbox-reconcile')
      expect(row.body).toContain('outbox-reconcile')
      expect(row.body).toContain('3 consecutive')
    }
    expect(created.map((r) => r.recipientId).sort()).toEqual(['admin-1', 'admin-2'])
  })

  it('NEVER touches CommunicationLog or any email path (the prisma fake exposes only notification + adminUser)', async () => {
    // Structural pin: the fake has NO communicationLog delegate — any email/outbox
    // write would throw inside the launch chain and surface as alerts.launchFailed.
    let now = 1_000_000
    const { prisma } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    expect(sink.getCounters()['alerts.launchFailed']).toBeUndefined()
    expect(sink.getCounters()['alerts.sent.ADMIN_MAINTENANCE_DEGRADED']).toBe(2)
  })

  it('suppresses a duplicate within the FIXED 15-minute window (per recipient, via the sentAt lookup)', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    now += ALERT_DEDUP_WINDOW_MS - 1_000 // still inside the window
    sink.sweepDegraded('outbox-reconcile', 4)
    await flush()
    expect(created).toHaveLength(2) // no new rows
    expect(sink.getCounters()['alerts.deduped.ADMIN_MAINTENANCE_DEGRADED']).toBe(2)
  })

  it('re-alerts once the window has passed', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    now += ALERT_DEDUP_WINDOW_MS + 1_000 // outside the window
    sink.sweepDegraded('outbox-reconcile', 9)
    await flush()
    expect(created).toHaveLength(4) // both admins re-alerted
  })

  it('different sweeps have INDEPENDENT alert identities (both alert inside the same window)', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    sink.sweepDegraded('pending-hours-promote', 3)
    await flush()
    expect(created).toHaveLength(4)
    expect(new Set(created.map((r) => r.referenceId))).toEqual(
      new Set(['outbox-reconcile', 'pending-hours-promote']),
    )
  })

  it('single-flight: a second launch for the SAME identity while one is in flight does not double-write', async () => {
    let now = 1_000_000
    const { prisma, created, findMany } = fakePrisma(() => now)
    let release!: () => void
    findMany.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = () => res(ADMINS)
        }) as never,
    )
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepDegraded('outbox-reconcile', 3) // launch 1 hangs on getAlertableAdmins
    sink.sweepDegraded('outbox-reconcile', 4) // launch 2 must be single-flighted away
    release()
    await flush()
    expect(created).toHaveLength(2) // one fan-out, not two
  })
})

describe('AlertSink — degraded/recovered transition semantics', () => {
  it('degraded then recovered emits BOTH alerts with DISTINCT types (recovery never suppressed by the degraded window)', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    now += 30_000 // WELL inside the degraded 15-min window
    sink.sweepRecovered('outbox-reconcile')
    await flush()
    const types = created.map((r) => r.type)
    expect(types.filter((t) => t === 'ADMIN_MAINTENANCE_DEGRADED')).toHaveLength(2)
    expect(types.filter((t) => t === 'ADMIN_MAINTENANCE_RECOVERED')).toHaveLength(2)
  })

  it('a duplicate RECOVERED signal without a new degraded episode emits nothing', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    sink.sweepRecovered('outbox-reconcile')
    await flush()
    const afterFirst = created.length
    now += ALERT_DEDUP_WINDOW_MS + 60_000 // even outside the dedup window…
    sink.sweepRecovered('outbox-reconcile') // …no open episode ⇒ no alert
    await flush()
    expect(created).toHaveLength(afterFirst)
  })

  it('a recovery signal with NO prior degraded episode emits nothing (routine health is silent)', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepRecovered('outbox-reconcile')
    await flush()
    expect(created).toHaveLength(0)
  })
})

describe('AlertSink — DB-outage suppression + recoveryPending', () => {
  it('a database-unavailable failure makes the DEGRADED alert LOG-ONLY (no Notification write attempted)', async () => {
    let now = 1_000_000
    const { prisma, created, findMany } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepFailure('outbox-reconcile', 'TIMEOUT', { code: 'P2028', message: 'tx timeout' })
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    expect(created).toHaveLength(0)
    expect(findMany).not.toHaveBeenCalled() // not even the fan-out query hits the down DB
    const logged = JSON.stringify(errSpy.mock.calls)
    expect(logged).toContain('suppressed')
    expect(logged).toContain('recoveryPending')
  })

  it('recoveryPending: the RECOVERED alert fires on the recovery signal after a DB-suppressed degraded episode', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepFailure('outbox-reconcile', 'FAILURE', { code: 'P2010', meta: { code: '57014' }, message: 'x' })
    sink.sweepDegraded('outbox-reconcile', 3) // suppressed (DB down)
    await flush()
    expect(created).toHaveLength(0)
    sink.sweepRecovered('outbox-reconcile') // DB provably back ⇒ pending notice fires
    await flush()
    expect(created).toHaveLength(2)
    expect(created.every((r) => r.type === 'ADMIN_MAINTENANCE_RECOVERED')).toBe(true)
  })

  it('an UNCLASSIFIED failure (plain Error) does NOT suppress the DEGRADED alert — only explicit DB signals suppress', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepFailure('outbox-reconcile', 'FAILURE', new Error('some unrecognised failure'))
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    expect(created).toHaveLength(2)
    expect(created.every((r) => r.type === 'ADMIN_MAINTENANCE_DEGRADED')).toBe(true)
  })

  it('LATEST classification wins: a DB failure followed by a Redis-only failure clears the DB-down marking', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepFailure('outbox-reconcile', 'TIMEOUT', { code: 'P2028', message: 'x' })
    sink.sweepFailure(
      'outbox-reconcile',
      'FAILURE',
      Object.assign(new Error('redis down'), { code: 'ECONNREFUSED' }),
    )
    sink.sweepDegraded('outbox-reconcile', 4)
    await flush()
    expect(created).toHaveLength(2) // Phase A committed ⇒ DB reachable ⇒ alert writes
  })

  it('restart loses recoveryPending (documented v1 best-effort): a FRESH sink emits no recovery notice', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink1 = createAlertSink(prisma, { nowMs: () => now })
    sink1.sweepFailure('outbox-reconcile', 'TIMEOUT', { code: 'P2028', message: 'x' })
    sink1.sweepDegraded('outbox-reconcile', 3) // suppressed, pending in sink1 ONLY
    await flush()
    const sink2 = createAlertSink(prisma, { nowMs: () => now }) // process restart
    sink2.sweepRecovered('outbox-reconcile')
    await flush()
    expect(created).toHaveLength(0) // the pending notice did not survive the restart
  })
})

describe('AlertSink — expired-communications alert', () => {
  it('carries the aggregate count + type breakdown (never recipient/payload data) with type ADMIN_DELIVERY_FAILED', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.expiredCommunications({
      sweep: 'outbox-reconcile',
      total: 5,
      byType: [
        { type: 'login_otp', count: 3 },
        { type: 'merchant_claim', count: 2 },
      ],
    })
    await flush()
    expect(created).toHaveLength(2)
    for (const row of created) {
      expect(row.type).toBe('ADMIN_DELIVERY_FAILED')
      expect(row.referenceType).toBe(MAINTENANCE_ALERT_REFERENCE_TYPE)
      expect(row.referenceId).toBe('outbox-reconcile')
      expect(row.body).toContain('5 queued communication(s)')
      expect(row.body).toContain('login_otp x3')
      expect(row.body).toContain('merchant_claim x2')
      expect(row.body).not.toMatch(/@|http|\{/) // no email address, URL, or serialized payload data
    }
  })

  it('a zero-total report emits no alert (nothing expired)', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.expiredCommunications({ sweep: 'outbox-reconcile', total: 0, byType: [] })
    await flush()
    expect(created).toHaveLength(0)
  })
})

describe('AlertSink — terminal stop + failure isolation', () => {
  it('no alert launches after stop() — degraded, recovered, and expiry all become no-ops/log-only', async () => {
    let now = 1_000_000
    const { prisma, created } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    await sink.stop()
    sink.sweepDegraded('outbox-reconcile', 3)
    sink.sweepRecovered('outbox-reconcile')
    sink.expiredCommunications({ sweep: 'outbox-reconcile', total: 4, byType: [{ type: 'login_otp', count: 4 }] })
    await flush()
    expect(created).toHaveLength(0)
    // the expiry LOG still happened (observability survives the terminal stop)
    expect(JSON.stringify(warnSpy.mock.calls)).toContain('expired queued communications')
  })

  it('stop() drains an in-flight alert write within the bound and reports drained:true', async () => {
    let now = 1_000_000
    const { prisma, created, findMany } = fakePrisma(() => now)
    let release!: () => void
    findMany.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = () => res(ADMINS)
        }) as never,
    )
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepDegraded('outbox-reconcile', 3) // in flight, hung on the fan-out query
    const stopP = sink.stop()
    release() // settles inside the bound
    await expect(stopP).resolves.toEqual({ drained: true })
    await flush()
    expect(created).toHaveLength(2) // the already-launched write completed
  })

  it('stop() never hangs on a HUNG write: resolves drained:false at the bound; the late settlement stays observed', async () => {
    vi.useFakeTimers()
    try {
      let now = 1_000_000
      const { prisma, findMany } = fakePrisma(() => now)
      let rejectLate!: (e: unknown) => void
      findMany.mockImplementationOnce(
        () =>
          new Promise((_res, rej) => {
            rejectLate = rej
          }) as never,
      )
      const sink = createAlertSink(prisma, { nowMs: () => now })
      sink.sweepDegraded('outbox-reconcile', 3) // hung forever
      const stopP = sink.stop()
      await vi.advanceTimersByTimeAsync(ALERT_SINK_STOP_DRAIN_MS)
      await expect(stopP).resolves.toEqual({ drained: false })
      rejectLate(new Error('late rejection after shutdown')) // must be OBSERVED
      await vi.advanceTimersByTimeAsync(0)
      // vitest fails the suite on any unhandled rejection — reaching here proves observation.
    } finally {
      vi.useRealTimers()
    }
  })

  it('an adminNotify rejection is caught per recipient: later recipients still alerted, counter bumped, redacted log only', async () => {
    let now = 1_000_000
    const { prisma, created, create } = fakePrisma(() => now)
    create.mockRejectedValueOnce(
      Object.assign(
        new Error('connect to postgresql://redeemo:hunter2SECRET@ep-x.neon.tech/db failed'),
        { code: 'ECONNREFUSED' },
      ),
    )
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepDegraded('outbox-reconcile', 3)
    await flush()
    expect(created).toHaveLength(1) // admin-2 still alerted after admin-1's write failed
    expect(sink.getCounters()['alerts.failed.ADMIN_MAINTENANCE_DEGRADED']).toBe(1)
    const logged = JSON.stringify(errSpy.mock.calls)
    expect(logged).not.toContain('hunter2SECRET')
    expect(logged).not.toContain('postgresql://')
    expect(logged).not.toContain('neon.tech')
    expect(logged).toContain('NET_ECONNREFUSED')
  })

  it('planted secrets NEVER reach logs or alert bodies: a hostile driver error through sweepFailure logs only the allow-listed class', async () => {
    let now = 1_000_000
    const { prisma } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepFailure(
      'outbox-reconcile',
      'FAILURE',
      Object.assign(
        new Error(
          'postgresql://redeemo:hunter2SECRET@ep-x.neon.tech/db?password=hunter2SECRET while running SELECT "payload" FROM "CommunicationLog"',
        ),
        { code: 'ECONNREFUSED' },
      ),
    )
    const logged = JSON.stringify(errSpy.mock.calls)
    expect(logged).not.toContain('hunter2SECRET')
    expect(logged).not.toContain('postgresql://')
    expect(logged).not.toContain('SELECT')
    expect(logged).toContain('NET_ECONNREFUSED')
    expect(logged).toContain('outbox-reconcile')
  })

  it('sweepRun records honest counters (runs, per-state, started/failed rows) and never throws', () => {
    let now = 1_000_000
    const { prisma } = fakePrisma(() => now)
    const sink = createAlertSink(prisma, { nowMs: () => now })
    sink.sweepRun({
      name: 'outbox-reconcile',
      state: 'SUCCESS',
      durationMs: 12.4,
      full: false,
      phaseB: { full: false, failedRows: 1, startedRows: 4 },
    })
    sink.sweepRun({ name: 'outbox-reconcile', state: 'LOCK_SKIPPED', durationMs: 1, full: false })
    const c = sink.getCounters()
    expect(c['sweep.outbox-reconcile.runs']).toBe(2)
    expect(c['sweep.outbox-reconcile.state.SUCCESS']).toBe(1)
    expect(c['sweep.outbox-reconcile.state.LOCK_SKIPPED']).toBe(1)
    expect(c['sweep.outbox-reconcile.rowsStarted']).toBe(4)
    expect(c['sweep.outbox-reconcile.rowsFailed']).toBe(1)
  })
})
