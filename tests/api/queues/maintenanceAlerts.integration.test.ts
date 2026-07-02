import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { runBoundedSweep } from '../../../src/api/queues/maintenanceSweep'
import {
  outboxDbPhase,
  buildOutboxSweep,
  RECONCILE_MAX_AGE_MS,
  OUTBOX_SWEEP_NAME,
} from '../../../src/api/queues/processors/outboxReconciler'
import {
  createAlertSink,
  MAINTENANCE_ALERT_REFERENCE_TYPE,
  type ExpiredCommunicationsInfo,
} from '../../../src/api/queues/maintenanceMetrics'
import type { MaintenanceConfig } from '../../../src/api/shared/env'

// Neon CU-burn PR-C (integration half): the real-Postgres semantics mocks
// cannot prove, against the strict loopback DB enforced by
// tests/integration.setup.ts (Neon is never touched — the guard fail-closes):
//   E1 exact-row expiry: the UPDATE … RETURNING CTE transitions EXACTLY the
//      too-old QUEUED rows (FAILED + payload NULL) and the returned breakdown
//      is aggregated from those SAME rows — fresh/terminal rows untouched.
//   E2 rollback ⇒ no alert: a tx that fails AFTER the expiry statement rolls
//      the expiry back AND never reaches Phase B, so nothing is emitted.
//   E3 end-to-end fan-out: the committed sweep writes ONE in-app
//      ADMIN_DELIVERY_FAILED Notification per alertable admin (ADMIN /
//      userId null / IN_APP / maintenance-sweep reference) and creates NO
//      CommunicationLog row.
//   E4 DB-backed dedup: a second committed expiry inside the fixed 15-minute
//      window is suppressed by the sentAt lookup even through a FRESH sink
//      (a process restart) — the dedup is best-effort-durable via the rows.
//   E5 migration proof: the two new enum values round-trip through real
//      Postgres (the additive migration applied to this disposable DB).

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const MARK = 'prc-alerts-itest'
const OLD = () => new Date(Date.now() - RECONCILE_MAX_AGE_MS - 60 * 60 * 1000) // 25h ago
const FRESH = () => new Date(Date.now() - 60_000)

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

let opsAdminId = ''
let superAdminId = ''
let supportAdminId = ''
let inactiveAdminId = ''

async function seedComm(type: string, status: 'QUEUED' | 'SENT', sentAt: Date, withPayload = true) {
  return prisma.communicationLog.create({
    data: {
      recipientType: 'USER',
      recipientId: `${MARK}-recipient`,
      channel: 'EMAIL',
      type: `${MARK}-${type}`,
      status,
      sentAt,
      payload: withPayload ? { to: 'someone@example.test', secret: 'sensitive-link' } : undefined,
    },
  })
}

async function cleanup() {
  await prisma.notification.deleteMany({
    where: { referenceType: MAINTENANCE_ALERT_REFERENCE_TYPE },
  })
  await prisma.communicationLog.deleteMany({ where: { type: { startsWith: MARK } } })
}

beforeAll(async () => {
  await cleanup()
  await prisma.adminUser.deleteMany({ where: { email: { contains: MARK } } })
  const mk = (n: string, role: 'OPERATIONS' | 'SUPER_ADMIN' | 'SUPPORT', isActive = true) =>
    prisma.adminUser.create({
      data: {
        email: `${n}.${MARK}@redeemo.test`,
        passwordHash: 'x',
        firstName: 'It',
        lastName: 'Est',
        role,
        isActive,
      },
      select: { id: true },
    })
  opsAdminId = (await mk('ops', 'OPERATIONS')).id
  superAdminId = (await mk('super', 'SUPER_ADMIN')).id
  supportAdminId = (await mk('support', 'SUPPORT')).id
  inactiveAdminId = (await mk('inactive-ops', 'OPERATIONS', false)).id
})

afterAll(async () => {
  await cleanup()
  await prisma.adminUser.deleteMany({ where: { email: { contains: MARK } } })
  await prisma.$disconnect()
})

beforeEach(async () => {
  await cleanup()
})

function ourNotifications() {
  return prisma.notification.findMany({
    where: {
      referenceType: MAINTENANCE_ALERT_REFERENCE_TYPE,
      recipientId: { in: [opsAdminId, superAdminId, supportAdminId, inactiveAdminId] },
    },
    orderBy: { recipientId: 'asc' },
  })
}

describe('PR-C exact-row expiry (real Postgres)', () => {
  it('E1: the atomic CTE transitions EXACTLY the too-old QUEUED rows and returns their per-type breakdown', async () => {
    const oldOtp1 = await seedComm('login-otp', 'QUEUED', OLD())
    const oldOtp2 = await seedComm('login-otp', 'QUEUED', OLD())
    const oldClaim = await seedComm('merchant-claim', 'QUEUED', OLD())
    const freshOtp = await seedComm('login-otp', 'QUEUED', FRESH())
    const oldSent = await seedComm('login-otp', 'SENT', OLD())

    const res = await prisma.$transaction((tx) => outboxDbPhase(tx, new Date()))

    // filter to THIS suite's marker types — the sweep is global, so any
    // unrelated leftover row must not make this pin flaky
    const sorted = res.sideEffects.expired
      .filter((t) => t.type.startsWith(MARK))
      .sort((a, b) => a.type.localeCompare(b.type))
    expect(sorted).toEqual([
      { type: `${MARK}-login-otp`, count: 2 },
      { type: `${MARK}-merchant-claim`, count: 1 },
    ])

    // the transitioned rows: FAILED + payload cleared
    for (const id of [oldOtp1.id, oldOtp2.id, oldClaim.id]) {
      const row = await prisma.communicationLog.findUniqueOrThrow({ where: { id } })
      expect(row.status).toBe('FAILED')
      expect(row.payload).toBeNull()
    }
    // the untouched rows: fresh QUEUED keeps its payload; terminal SENT unchanged
    const fresh = await prisma.communicationLog.findUniqueOrThrow({ where: { id: freshOtp.id } })
    expect(fresh.status).toBe('QUEUED')
    expect(fresh.payload).not.toBeNull()
    const sent = await prisma.communicationLog.findUniqueOrThrow({ where: { id: oldSent.id } })
    expect(sent.status).toBe('SENT')
  })

  it('E2: a transaction failure AFTER the expiry statement rolls the expiry back and emits NO alert', async () => {
    const oldOtp = await seedComm('login-otp', 'QUEUED', OLD())
    const emitted: ExpiredCommunicationsInfo[] = []
    const sink = {
      expiredCommunications: (info: ExpiredCommunicationsInfo) => void emitted.push(info),
    }
    const spec = buildOutboxSweep(CFG, sink)
    const res = await runBoundedSweep(
      prisma,
      {
        ...spec,
        dbPhase: async (tx, dbNow) => {
          await outboxDbPhase(tx, dbNow) // the REAL expiry runs…
          throw new Error('forced post-expiry tx failure') // …then the tx dies
        },
      },
      () => performance.now(),
      () => false,
    )
    expect(res.state).toBe('FAILURE')
    expect(emitted).toHaveLength(0) // Phase B never ran ⇒ no alert
    const row = await prisma.communicationLog.findUniqueOrThrow({ where: { id: oldOtp.id } })
    expect(row.status).toBe('QUEUED') // the expiry ROLLED BACK with the tx
    expect(row.payload).not.toBeNull()
  })
})

describe('PR-C expired-outbox alert fan-out (real Postgres, real AlertSink)', () => {
  it('E3: one committed sweep ⇒ one ADMIN_DELIVERY_FAILED in-app Notification per alertable admin; NO CommunicationLog from the alert path', async () => {
    await seedComm('login-otp', 'QUEUED', OLD())
    await seedComm('login-otp', 'QUEUED', OLD())
    const commCountBefore = await prisma.communicationLog.count()

    const sink = createAlertSink(prisma)
    const res = await runBoundedSweep(
      prisma,
      buildOutboxSweep(CFG, sink),
      () => performance.now(),
      () => false,
    )
    expect(res.state).toBe('SUCCESS')
    await sink.stop() // drain the fire-and-forget fan-out

    const ours = await ourNotifications()
    const byRecipient = new Map(ours.map((n) => [n.recipientId, n]))
    expect(byRecipient.has(opsAdminId)).toBe(true) // active OPERATIONS alerted
    expect(byRecipient.has(superAdminId)).toBe(true) // active SUPER_ADMIN alerted
    expect(byRecipient.has(supportAdminId)).toBe(false) // SUPPORT is not alertable
    expect(byRecipient.has(inactiveAdminId)).toBe(false) // inactive admins excluded
    for (const id of [opsAdminId, superAdminId]) {
      const n = byRecipient.get(id)!
      expect(n.type).toBe('ADMIN_DELIVERY_FAILED')
      expect(n.recipientType).toBe('ADMIN')
      expect(n.userId).toBeNull()
      expect(n.channel).toBe('IN_APP')
      expect(n.referenceType).toBe(MAINTENANCE_ALERT_REFERENCE_TYPE)
      expect(n.referenceId).toBe(OUTBOX_SWEEP_NAME)
      expect(n.body).toMatch(/\d+ queued communication\(s\)/)
      expect(n.body).toContain(`${MARK}-login-otp x2`)
      expect(n.body).not.toContain('someone@example.test') // never recipient data
      expect(n.body).not.toContain('sensitive-link') // never payload data
    }
    expect(await prisma.communicationLog.count()).toBe(commCountBefore) // alert path wrote NO outbox row
  })

  it('E4: a second committed expiry inside the 15-minute window is suppressed by the DB-backed sentAt dedup, even through a FRESH sink (restart)', async () => {
    await seedComm('login-otp', 'QUEUED', OLD())
    const sink1 = createAlertSink(prisma)
    await runBoundedSweep(prisma, buildOutboxSweep(CFG, sink1), () => performance.now(), () => false)
    await sink1.stop()
    const afterFirst = (await ourNotifications()).length
    expect(afterFirst).toBeGreaterThan(0)

    await seedComm('login-otp', 'QUEUED', OLD()) // a NEW batch expires…
    const sink2 = createAlertSink(prisma) // …after a process restart
    await runBoundedSweep(prisma, buildOutboxSweep(CFG, sink2), () => performance.now(), () => false)
    await sink2.stop()
    expect((await ourNotifications()).length).toBe(afterFirst) // suppressed per recipient
  })
})

describe('PR-C migration proof (disposable loopback DB only)', () => {
  it('E5: the two additive NotificationType values round-trip through real Postgres', async () => {
    for (const type of ['ADMIN_MAINTENANCE_DEGRADED', 'ADMIN_MAINTENANCE_RECOVERED'] as const) {
      const row = await prisma.notification.create({
        data: {
          recipientType: 'ADMIN',
          recipientId: opsAdminId,
          userId: null,
          channel: 'IN_APP',
          type,
          title: 'migration probe',
          body: 'migration probe',
          referenceId: 'probe-sweep',
          referenceType: MAINTENANCE_ALERT_REFERENCE_TYPE,
        },
      })
      expect(row.type).toBe(type)
    }
  })
})
