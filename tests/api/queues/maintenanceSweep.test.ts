import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '../../../generated/prisma/client'
import {
  runBoundedSweep,
  runBudgetedRows,
  isTimeout,
  PHASE_B_FAILURE_NAME,
  type BoundedSweepSpec,
  type PhaseBBudget,
} from '../../../src/api/queues/maintenanceSweep'

// Neon CU-burn PR-A Task A1 (unit half): the bounded advisory-locked sweep wrapper.
// The loopback-Postgres half (real lock/timeout/rollback semantics) lives in
// maintenanceSweep.integration.test.ts; THIS file pins the state classification,
// the Phase-B cooperative budget, and the timeout-error recognition — the parts
// that must hold regardless of the database.

const NEVER_STOPPING = () => false
const MONO = () => 0

function budget(overrides: Partial<PhaseBBudget> = {}): PhaseBBudget {
  return { maxItems: 100, budgetMs: 60_000, monotonicNowMs: MONO, isStopping: NEVER_STOPPING, ...overrides }
}

// A controllable mock of the SLICE of PrismaClient runBoundedSweep touches:
// $transaction(fn, opts) running fn against a mock tx whose $queryRaw is routed
// by SQL text (set_config / advisory lock / now()).
function mockPrisma(opts: { locked?: boolean; now?: Date; txError?: unknown } = {}) {
  const { locked = true, now = new Date('2026-07-02T10:00:00Z'), txError } = opts
  const rawCalls: { sql: string; values: unknown[] }[] = []
  const tx = {
    $queryRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?')
      rawCalls.push({ sql, values })
      if (sql.includes('set_config')) return Promise.resolve([{ set_config: String(values[0]) }])
      if (sql.includes('pg_try_advisory_xact_lock')) return Promise.resolve([{ locked }])
      if (sql.includes('now()')) return Promise.resolve([{ now }])
      return Promise.resolve([])
    }),
  }
  const txOpts: { timeout?: number; maxWait?: number }[] = []
  const prisma = {
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>, o?: { timeout?: number; maxWait?: number }) => {
      if (o) txOpts.push(o)
      if (txError) throw txError
      return fn(tx)
    }),
  } as unknown as PrismaClient
  return { prisma, tx, rawCalls, txOpts, now }
}

function spec<TSide>(overrides: Partial<BoundedSweepSpec<TSide>> = {}): BoundedSweepSpec<TSide> {
  return {
    name: 'test-sweep',
    lockKey: 730001n,
    sideEffectDomain: 'REDIS',
    statementTimeoutMs: 4000,
    txTimeoutMs: 8000,
    phaseBMaxItems: 50,
    phaseBBudgetMs: 10_000,
    dbPhase: vi.fn(async () => ({ full: false, sideEffects: [] as unknown as TSide })),
    runSideEffects: vi.fn(async () => ({ full: false, failedRows: 0, startedRows: 0 })),
    ...overrides,
  }
}

describe('isTimeout — recognises the two DB-enforced cancellation shapes', () => {
  it('Prisma interactive-tx timeout (P2028) is a timeout', () => {
    expect(isTimeout({ code: 'P2028', message: 'Transaction API error' })).toBe(true)
  })
  it('Postgres statement_timeout (57014) via meta.code is a timeout', () => {
    expect(isTimeout({ code: 'P2010', meta: { code: '57014' }, message: 'raw query failed' })).toBe(true)
  })
  it('Postgres 57014 surfaced only in the message is a timeout', () => {
    expect(isTimeout(new Error('canceling statement due to statement timeout'))).toBe(true)
    expect(isTimeout(new Error('ERROR: 57014'))).toBe(true)
  })
  it('an unrelated error is NOT a timeout', () => {
    expect(isTimeout(new Error('connection refused'))).toBe(false)
    expect(isTimeout(null)).toBe(false)
    expect(isTimeout({ code: 'P2002' })).toBe(false)
  })
})

describe('runBudgetedRows — cooperative Phase-B budget (between rows, per-row isolated)', () => {
  it('processes every row and reports { full:false, failedRows:0 } when nothing binds', async () => {
    const seen: number[] = []
    const res = await runBudgetedRows([1, 2, 3], budget(), async (n) => void seen.push(n))
    expect(seen).toEqual([1, 2, 3])
    expect(res).toEqual({ full: false, failedRows: 0, startedRows: 3 })
  })

  it('item cap: stops STARTING rows at maxItems and reports full=true (rows remaining)', async () => {
    const seen: number[] = []
    const res = await runBudgetedRows([1, 2, 3, 4], budget({ maxItems: 2 }), async (n) => void seen.push(n))
    expect(seen).toEqual([1, 2])
    expect(res).toEqual({ full: true, failedRows: 0, startedRows: 2 })
  })

  it('time budget: checked BETWEEN rows on the monotonic clock; rows remaining ⇒ full=true', async () => {
    let mono = 0
    const seen: number[] = []
    const res = await runBudgetedRows(
      [1, 2, 3],
      budget({ budgetMs: 100, monotonicNowMs: () => mono }),
      async (n) => {
        seen.push(n)
        mono += 90 // second row crosses the 100ms budget boundary
      },
    )
    expect(seen).toEqual([1, 2]) // row 3 never STARTED
    expect(res.full).toBe(true)
  })

  it('cooperative stop: isStopping()=true before row k ⇒ rows k..n never start, full=true', async () => {
    let stopping = false
    const rowFn = vi.fn(async (n: number) => {
      if (n === 2) stopping = true // stop requested WHILE row 2 is in flight
    })
    const res = await runBudgetedRows([1, 2, 3, 4], budget({ isStopping: () => stopping }), rowFn)
    expect(rowFn.mock.calls.map((c) => c[0])).toEqual([1, 2]) // 3 and 4 never started
    expect(res.full).toBe(true)
  })

  it('per-row isolation: a failing row does NOT stop later rows, and is reported as failedRows — NOT folded into the backlog signal', async () => {
    const seen: number[] = []
    const res = await runBudgetedRows([1, 2, 3], budget(), async (n) => {
      if (n === 2) throw new Error('row 2 exploded')
      seen.push(n)
    })
    expect(seen).toEqual([1, 3]) // later rows still ran
    expect(res.failedRows).toBe(1) // the failure is DISTINGUISHED from backlog…
    expect(res.full).toBe(false) // …so it cannot masquerade as benign needsRescan
  })
})

describe('runBoundedSweep — explicit state contract', () => {
  it('lock not acquired ⇒ LOCK_SKIPPED; dbPhase and Phase B never run', async () => {
    const { prisma } = mockPrisma({ locked: false })
    const s = spec()
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res).toEqual({ state: 'LOCK_SKIPPED', full: false })
    expect(s.dbPhase).not.toHaveBeenCalled()
    expect(s.runSideEffects).not.toHaveBeenCalled()
  })

  it('happy path ⇒ SUCCESS; statement_timeout is the FIRST statement, parameterized; tx opts carry txTimeoutMs; dbNow is the DB clock', async () => {
    const { prisma, rawCalls, txOpts, now } = mockPrisma()
    let sawDbNow: Date | null = null
    const s = spec({
      dbPhase: vi.fn(async (_tx, dbNow: Date) => {
        sawDbNow = dbNow
        return { full: false, sideEffects: ['a'] }
      }),
    })
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res.state).toBe('SUCCESS')
    expect(rawCalls[0].sql).toContain('set_config')
    expect(rawCalls[0].values).toContain('4000') // parameterized value, not interpolated SQL
    expect(rawCalls[1].sql).toContain('pg_try_advisory_xact_lock')
    expect(txOpts[0]).toMatchObject({ timeout: 8000, maxWait: 8000 })
    expect(sawDbNow).toEqual(now)
  })

  it('Phase B receives the budget (maxItems/budgetMs/monotonic/isStopping) and its BACKLOG full=true propagates as SUCCESS', async () => {
    const { prisma } = mockPrisma()
    let sawBudget: PhaseBBudget | null = null
    const s = spec({
      dbPhase: vi.fn(async () => ({ full: false, sideEffects: ['x'] })),
      runSideEffects: vi.fn(async (_side, b: PhaseBBudget) => {
        sawBudget = b
        return { full: true, failedRows: 0, startedRows: 1 } // benign backlog — budget hit with rows remaining
      }),
    })
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res).toMatchObject({ state: 'SUCCESS', full: true })
    expect(sawBudget).toMatchObject({ maxItems: 50, budgetMs: 10_000 })
    expect(typeof sawBudget!.isStopping).toBe('function')
  })

  it('Phase-B side-effect FAILURES classify the sweep FAILURE (never SUCCESS/active) with a count-only redacted error', async () => {
    const { prisma } = mockPrisma()
    const s = spec({
      dbPhase: vi.fn(async () => ({ full: false, sideEffects: ['x', 'y'] })),
      runSideEffects: vi.fn(async () => ({ full: false, failedRows: 2, startedRows: 2 })),
    })
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res.state).toBe('FAILURE') // NOT SUCCESS — the scheduler applies degraded backoff
    expect(res.full).toBe(true) // the durable rows still need a rescan after recovery
    expect((res.error as Error).message).toMatch(/phase-b: 2 side-effect row\(s\) failed/)
    expect((res.error as Error).message).not.toMatch(/redis|postgres|:\/\//i) // count-only, no provider detail
  })

  it('a full Phase-A batch propagates full=true even when Phase B is clean', async () => {
    const { prisma } = mockPrisma()
    const s = spec({ dbPhase: vi.fn(async () => ({ full: true, sideEffects: [] })) })
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res).toMatchObject({ state: 'SUCCESS', full: true })
  })

  it('tx rejection with a timeout shape ⇒ TIMEOUT; Phase B never runs', async () => {
    const { prisma } = mockPrisma({ txError: { code: 'P2028', message: 'tx timeout' } })
    const s = spec()
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res.state).toBe('TIMEOUT')
    expect(res.full).toBe(false)
    expect(s.runSideEffects).not.toHaveBeenCalled()
  })

  it('tx rejection with a non-timeout shape ⇒ FAILURE with the error attached', async () => {
    const boom = new Error('connection reset')
    const { prisma } = mockPrisma({ txError: boom })
    const res = await runBoundedSweep(prisma, spec(), MONO, NEVER_STOPPING)
    expect(res.state).toBe('FAILURE')
    expect(res.error).toBe(boom)
  })

  it('Phase B rejection ⇒ FAILURE (Phase A already committed; durable rows rescanned later)', async () => {
    const { prisma } = mockPrisma()
    const s = spec({
      dbPhase: vi.fn(async () => ({ full: false, sideEffects: ['x'] })),
      runSideEffects: vi.fn(async () => {
        throw new Error('redis exploded')
      }),
    })
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res.state).toBe('FAILURE')
  })

  it('cooperative stop AFTER Phase A ⇒ Phase B skipped entirely, SUCCESS full=true (needsRescan)', async () => {
    const { prisma } = mockPrisma()
    const s = spec({ dbPhase: vi.fn(async () => ({ full: false, sideEffects: ['x'] })) })
    const res = await runBoundedSweep(prisma, s, MONO, () => true)
    expect(res).toEqual({ state: 'SUCCESS', full: true })
    expect(s.runSideEffects).not.toHaveBeenCalled()
    expect(res.phaseB).toBeUndefined() // PR-C: no invented counts — Phase B never ran
  })

  // PR-C metrics seam: the Phase-B outcome rides on the SweepResult so the
  // AlertSink/metrics layer can log HONEST per-run counts — attached only when
  // Phase B actually ran, never fabricated for skipped/errored paths.
  it('PR-C: SweepResult.phaseB carries the real Phase-B outcome on SUCCESS', async () => {
    const { prisma } = mockPrisma()
    const s = spec({
      dbPhase: vi.fn(async () => ({ full: false, sideEffects: ['x', 'y'] })),
      runSideEffects: vi.fn(async () => ({ full: false, failedRows: 0, startedRows: 2 })),
    })
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res.state).toBe('SUCCESS')
    expect(res.phaseB).toEqual({ full: false, failedRows: 0, startedRows: 2 })
  })

  it('PR-C: SweepResult.phaseB carries the outcome on a phase-b FAILURE (failed-row accounting survives classification)', async () => {
    const { prisma } = mockPrisma()
    const s = spec({
      dbPhase: vi.fn(async () => ({ full: false, sideEffects: ['x', 'y', 'z'] })),
      runSideEffects: vi.fn(async () => ({ full: false, failedRows: 2, startedRows: 3 })),
    })
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res.state).toBe('FAILURE')
    expect(res.phaseB).toEqual({ full: false, failedRows: 2, startedRows: 3 })
  })

  it('PR-C: phaseB is absent on LOCK_SKIPPED and on tx-level TIMEOUT/FAILURE (Phase B never started)', async () => {
    const skipped = await runBoundedSweep(mockPrisma({ locked: false }).prisma, spec(), MONO, NEVER_STOPPING)
    expect(skipped.phaseB).toBeUndefined()
    const timedOut = await runBoundedSweep(
      mockPrisma({ txError: { code: 'P2028', message: 'tx timeout' } }).prisma,
      spec(),
      MONO,
      NEVER_STOPPING,
    )
    expect(timedOut.phaseB).toBeUndefined()
  })

  // PR-C correction round: the count-only phase-b failure error carries the
  // sweep's DECLARED side-effect domain in its NAME (letters-only, so it flows
  // through classifySweepError's ERR_ allow-list) — the safe explicit channel
  // that lets the alert layer distinguish a DATABASE-domain Phase-B failure
  // (log-only) from a REDIS-domain one (alerts normally). Chained to the sink
  // via the exported PHASE_B_FAILURE_NAME map.
  it('PR-C: a DATABASE-domain sweep names its phase-b failure PhaseBDatabaseFailure (count-only message preserved)', async () => {
    const { prisma } = mockPrisma()
    const s = spec({
      sideEffectDomain: 'DATABASE',
      dbPhase: vi.fn(async () => ({ full: false, sideEffects: ['x'] })),
      runSideEffects: vi.fn(async () => ({ full: false, failedRows: 3, startedRows: 3 })),
    })
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res.state).toBe('FAILURE')
    expect((res.error as Error).name).toBe(PHASE_B_FAILURE_NAME.DATABASE)
    expect((res.error as Error).name).toBe('PhaseBDatabaseFailure')
    expect((res.error as Error).message).toBe('phase-b: 3 side-effect row(s) failed') // still count-only
  })

  it('PR-C: a REDIS-domain sweep names its phase-b failure PhaseBRedisFailure', async () => {
    const { prisma } = mockPrisma()
    const s = spec({
      sideEffectDomain: 'REDIS',
      dbPhase: vi.fn(async () => ({ full: false, sideEffects: ['x'] })),
      runSideEffects: vi.fn(async () => ({ full: false, failedRows: 1, startedRows: 1 })),
    })
    const res = await runBoundedSweep(prisma, s, MONO, NEVER_STOPPING)
    expect(res.state).toBe('FAILURE')
    expect((res.error as Error).name).toBe(PHASE_B_FAILURE_NAME.REDIS)
    expect((res.error as Error).name).toBe('PhaseBRedisFailure')
  })

  it('PR-C: runBudgetedRows counts startedRows honestly under the item cap and per-row failures', async () => {
    const res = await runBudgetedRows([1, 2, 3, 4, 5], budget({ maxItems: 3 }), async (n) => {
      if (n === 2) throw new Error('row 2 exploded')
    })
    expect(res).toEqual({ full: true, failedRows: 1, startedRows: 3 }) // successes = started − failed = 2
  })
})
