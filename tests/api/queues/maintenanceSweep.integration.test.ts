import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  runBoundedSweep,
  type BoundedSweepSpec,
  type SweepResult,
} from '../../../src/api/queues/maintenanceSweep'

// Neon CU-burn PR-A Task A1 (integration half): the REAL lock/timeout/rollback
// semantics that mocks cannot prove (plan Task A1 T1-T5), against the strict
// loopback Postgres enforced by tests/integration.setup.ts:
//   T1 lock-held-for-whole-tx: a second holder of the SAME key is LOCK_SKIPPED
//      while the first is mid-Phase-A.
//   T2 per-sweep keys are independent.
//   T3/T4 the DB-enforced bounds actually CANCEL + ROLL BACK + RELEASE: a
//      statement exceeding statement_timeout is cancelled server-side (57014),
//      the transaction rolls back (no partial write persists), and the lock is
//      free for a fresh acquire.
//   T5 dbNow is the DATABASE clock read inside the transaction.
//
// Raw SQL + one scratch table only — no Prisma-model/schema dependency.

const adapterA = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prismaA = new PrismaClient({ adapter: adapterA })
// A SECOND client = a genuinely separate connection pool, so lock contention is real.
const adapterB = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prismaB = new PrismaClient({ adapter: adapterB })

// Test-only advisory keys — distinct from the production sweep keys.
const KEY_1 = 990_001n
const KEY_2 = 990_002n

const NEVER = () => false
const MONO = () => performance.now()

function spec(overrides: Partial<BoundedSweepSpec<null>> & { lockKey: bigint }): BoundedSweepSpec<null> {
  return {
    name: 'itest-sweep',
    statementTimeoutMs: 4_000,
    txTimeoutMs: 8_000,
    phaseBMaxItems: 10,
    phaseBBudgetMs: 5_000,
    dbPhase: async () => ({ full: false, sideEffects: null }),
    runSideEffects: async () => ({ full: false, failedRows: 0 }),
    ...overrides,
  }
}

beforeAll(async () => {
  await prismaA.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS _pr_a_sweep_probe (id text PRIMARY KEY)')
  await prismaA.$executeRawUnsafe('TRUNCATE _pr_a_sweep_probe')
})

afterAll(async () => {
  await prismaA.$executeRawUnsafe('DROP TABLE IF EXISTS _pr_a_sweep_probe')
  await prismaA.$disconnect()
  await prismaB.$disconnect()
})

describe('runBoundedSweep — real advisory-lock + timeout semantics (loopback Postgres)', () => {
  it('T1: while holder A is mid-Phase-A, a second sweep on the SAME key is LOCK_SKIPPED', async () => {
    let enteredPhaseA!: () => void
    const entered = new Promise<void>((res) => {
      enteredPhaseA = res
    })
    const holder = runBoundedSweep(
      prismaA,
      spec({
        lockKey: KEY_1,
        dbPhase: async (tx) => {
          enteredPhaseA() // the lock is held from before dbPhase runs
          await tx.$queryRaw`SELECT pg_sleep(0.8)` // stay inside the LOCKED transaction
          return { full: false, sideEffects: null }
        },
      }),
      MONO,
      NEVER,
    )
    await entered
    const contender = await runBoundedSweep(prismaB, spec({ lockKey: KEY_1 }), MONO, NEVER)
    expect(contender.state).toBe('LOCK_SKIPPED') // pg_try_advisory_xact_lock returned false
    await expect(holder).resolves.toMatchObject({ state: 'SUCCESS' })
  }, 20_000)

  it('T2: distinct sweep keys never block each other', async () => {
    let entered!: () => void
    const inPhase = new Promise<void>((res) => {
      entered = res
    })
    const holder = runBoundedSweep(
      prismaA,
      spec({
        lockKey: KEY_1,
        dbPhase: async (tx) => {
          entered()
          await tx.$queryRaw`SELECT pg_sleep(0.8)`
          return { full: false, sideEffects: null }
        },
      }),
      MONO,
      NEVER,
    )
    await inPhase
    const other = await runBoundedSweep(prismaB, spec({ lockKey: KEY_2 }), MONO, NEVER)
    expect(other.state).toBe('SUCCESS') // KEY_2 unaffected by the KEY_1 holder
    await expect(holder).resolves.toMatchObject({ state: 'SUCCESS' })
  }, 20_000)

  it('T3/T4: statement_timeout CANCELS server-side (57014) → TIMEOUT, the tx ROLLS BACK (no partial write), and the lock is RELEASED', async () => {
    const res = await runBoundedSweep(
      prismaA,
      spec({
        lockKey: KEY_1,
        statementTimeoutMs: 300,
        txTimeoutMs: 8_000, // the STATEMENT bound fires first — the server cancels
        dbPhase: async (tx) => {
          await tx.$executeRaw`INSERT INTO _pr_a_sweep_probe (id) VALUES ('t3-partial')`
          await tx.$queryRaw`SELECT pg_sleep(2)` // exceeds statement_timeout ⇒ 57014
          return { full: false, sideEffects: null }
        },
      }),
      MONO,
      NEVER,
    )
    expect(res.state).toBe('TIMEOUT') // classified as the bound working, not FAILURE

    // Rollback proven: the pre-timeout INSERT did NOT persist.
    const rows = await prismaB.$queryRaw<
      { id: string }[]
    >`SELECT id FROM _pr_a_sweep_probe WHERE id = 't3-partial'`
    expect(rows).toHaveLength(0)

    // Lock released by the rollback: a fresh acquire on the SAME key succeeds.
    const reacquire = await runBoundedSweep(prismaB, spec({ lockKey: KEY_1 }), MONO, NEVER)
    expect(reacquire.state).toBe('SUCCESS')
  }, 20_000)

  it("T3b: Prisma's interactive-tx timeout also yields TIMEOUT and releases the lock", async () => {
    const res = await runBoundedSweep(
      prismaA,
      spec({
        lockKey: KEY_2,
        statementTimeoutMs: 5_000,
        txTimeoutMs: 400, // the TX bound fires first (P2028)
        dbPhase: async (tx) => {
          await tx.$queryRaw`SELECT pg_sleep(0.3)`
          await tx.$queryRaw`SELECT pg_sleep(0.3)` // crosses the 400ms tx budget between statements
          return { full: false, sideEffects: null }
        },
      }),
      MONO,
      NEVER,
    )
    expect(res.state).toBe('TIMEOUT')

    // The aborted tx released the lock — poll a fresh acquire (the server may
    // need a beat to finish aborting the connection's work).
    let reacquired: SweepResult | null = null
    for (let attempt = 0; attempt < 10; attempt++) {
      reacquired = await runBoundedSweep(prismaB, spec({ lockKey: KEY_2 }), MONO, NEVER)
      if (reacquired.state === 'SUCCESS') break
      await new Promise((r) => setTimeout(r, 300))
    }
    expect(reacquired?.state).toBe('SUCCESS')
  }, 20_000)

  it('T5: dbNow is the DATABASE clock, read inside the locked transaction', async () => {
    let sawDbNow: Date | null = null
    const res = await runBoundedSweep(
      prismaA,
      spec({
        lockKey: KEY_1,
        dbPhase: async (_tx, dbNow) => {
          sawDbNow = dbNow
          return { full: false, sideEffects: null }
        },
      }),
      MONO,
      NEVER,
    )
    expect(res.state).toBe('SUCCESS')
    expect(sawDbNow).toBeInstanceOf(Date)
    const [{ now }] = await prismaB.$queryRaw<{ now: Date }[]>`SELECT now() AS now`
    // Same clock source: the two DB reads sit within seconds of each other.
    expect(Math.abs(now.getTime() - sawDbNow!.getTime())).toBeLessThan(10_000)
  }, 20_000)
})
