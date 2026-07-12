// Unit tests for the MerchantLead 6-month anonymisation sweep (packet
// 2026-07-12, OD1), mirroring the claim-stale sweep's atomic Phase-B structure.
// Proves: the Phase-A ELIGIBLE scan is a parameterized raw query carrying every
// predicate (anonymisedAt/convertedMerchantId null + LOST-or-stale) IN SQL with
// deterministic ordering + LIMIT 200, the DB-clock 6-month cutoff BOUND (never
// interpolated), and the FULL snapshot selected for the CAS; and the Phase-B
// ATOMIC row: one bounded transaction per row whose conditional CAS (exact
// snapshot: id + anonymisedAt null + convertedMerchantId null + lastActivityAt
// unchanged + stage unchanged) nulls the three contact fields, stamps
// anonymisedAt, then writes a PII-FREE LEAD_ANONYMISED audit row on the SAME tx.
// A CAS loss (a touched lead re-armed its clock, or a converted lead became
// exempt) is a safe skip (no write, not a failure); LOST vs STALE trigger is
// classified for the audit metadata.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PhaseBBudget } from '../../../src/api/queues/maintenanceSweep'

vi.mock('../../../src/api/shared/audit', () => ({
  writeAuditLogTx: vi.fn().mockResolvedValue(undefined),
}))

import {
  leadAnonymiseDbPhase,
  makeLeadAnonymiseSideEffects,
  leadStaleCutoff,
  leadAnonymiseTrigger,
  LEAD_ANONYMISE_STALE_MONTHS,
  LEAD_ANONYMISE_BATCH,
  LEAD_ANONYMISE_SWEEP_LOCK_KEY,
  type AnonymiseLeadRow,
  type LeadAnonymiseTxBounds,
} from '../../../src/api/queues/processors/leadAnonymiseSweep'
import * as leadModule from '../../../src/api/queues/processors/leadAnonymiseSweep'
import { writeAuditLogTx } from '../../../src/api/shared/audit'

const NOW = new Date('2026-06-15T12:00:00.000Z')
const OLD = new Date('2025-01-01T00:00:00.000Z') // clearly older than 6 months
const BOUNDS: LeadAnonymiseTxBounds = { statementTimeoutMs: 4000, txTimeoutMs: 8000 }

/** Fake prisma: Phase A serves `$queryRaw`; Phase B serves `$transaction`, whose
 *  callback receives a per-tx fake exposing the set_config `$queryRaw` and the
 *  CAS `merchantLead.updateMany`. */
function makePrisma(eligibleRows: AnonymiseLeadRow[], casCounts: number[] = []) {
  const txs: Array<{ tx: any; casCalls: any[]; setConfigCalls: any[] }> = []
  const txOptions: any[] = []
  let casIdx = 0
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue(eligibleRows), // Phase A only
    $transaction: vi.fn(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, opts?: unknown) => {
      const record = { casCalls: [] as any[], setConfigCalls: [] as any[], tx: null as any }
      const tx = {
        $queryRaw: vi.fn(async (...args: unknown[]) => {
          record.setConfigCalls.push(args)
          return []
        }),
        merchantLead: {
          updateMany: vi.fn(async (args: unknown) => {
            record.casCalls.push(args)
            const count = casCounts[casIdx] ?? 1
            casIdx++
            return { count }
          }),
        },
      }
      record.tx = tx
      txs.push(record)
      txOptions.push(opts)
      return fn(tx as unknown as Prisma.TransactionClient)
    }),
  }
  return { prisma: prisma as unknown as PrismaClient, raw: prisma, txs, txOptions }
}

function eligible(overrides: Partial<AnonymiseLeadRow> = {}): AnonymiseLeadRow {
  return { id: 'l1', stage: 'LOST', lastActivityAt: OLD, convertedMerchantId: null, anonymisedAt: null, ...overrides }
}

function budget(overrides: Partial<PhaseBBudget> = {}): PhaseBBudget {
  return { maxItems: 500, budgetMs: 60_000, monotonicNowMs: () => 0, isStopping: () => false, ...overrides }
}

async function runFloorSweep(fake: ReturnType<typeof makePrisma>, dbNow: Date, b: PhaseBBudget = budget()) {
  const phaseA = await leadAnonymiseDbPhase(fake.raw as unknown as Prisma.TransactionClient, dbNow)
  const outcome = await makeLeadAnonymiseSideEffects(fake.prisma, BOUNDS)(phaseA.sideEffects, b)
  return { ...phaseA, outcome }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(writeAuditLogTx as any).mockResolvedValue(undefined)
})

describe('leadStaleCutoff + trigger classification (pure)', () => {
  it('cutoff is exactly 6 calendar months before dbNow', () => {
    expect(LEAD_ANONYMISE_STALE_MONTHS).toBe(6)
    expect(leadStaleCutoff(NOW)).toEqual(new Date('2025-12-15T12:00:00.000Z'))
  })

  it('trigger: a LOST lead is LOST (stage wins even when also stale); anything else is STALE', () => {
    expect(leadAnonymiseTrigger({ stage: 'LOST' })).toBe('LOST')
    expect(leadAnonymiseTrigger({ stage: 'CONTACTED' })).toBe('STALE')
    expect(leadAnonymiseTrigger({ stage: 'VISIT_BOOKED' })).toBe('STALE')
  })
})

describe('leadAnonymiseDbPhase: DB-level eligible scan (Phase A, locked, DB clock)', () => {
  it('carries EVERY predicate in parameterized SQL + selects the FULL snapshot for the CAS', async () => {
    const fake = makePrisma([])
    await leadAnonymiseDbPhase(fake.raw as unknown as Prisma.TransactionClient, NOW)
    const [strings, ...values] = fake.raw.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]]
    const sql = strings.join('¶')
    expect(sql).toContain('"anonymisedAt" IS NULL')
    expect(sql).toContain('"convertedMerchantId" IS NULL')
    expect(sql).toContain(`("stage" = 'LOST' OR "lastActivityAt" <`) // window cutoff (bound param)
    expect(sql).toContain('ORDER BY "lastActivityAt" ASC, "id" ASC') // deterministic: oldest eligible first
    expect(sql).toContain('LIMIT')
    // PARAMETERIZED: the cutoff Date + the batch cap are bound; the SQL text has neither.
    expect(values).toEqual([leadStaleCutoff(NOW), LEAD_ANONYMISE_BATCH])
    expect(sql).not.toContain('2025-') // no interpolated timestamp
    expect(sql).not.toContain('interval') // cutoff is a bound Date, not a SQL interval literal
    expect(sql).not.toMatch(/LIMIT\s+\d/) // no interpolated limit
    expect(LEAD_ANONYMISE_BATCH).toBe(200)
    // The CAS snapshot columns MUST be selected.
    expect(sql).toContain('SELECT "id", "stage", "lastActivityAt", "convertedMerchantId", "anonymisedAt"')
  })

  it('threads dbNow into the side-effects payload alongside the eligible rows', async () => {
    const fake = makePrisma([eligible()])
    const res = await leadAnonymiseDbPhase(fake.raw as unknown as Prisma.TransactionClient, NOW)
    expect(res.sideEffects.rows.map((r) => r.id)).toEqual(['l1'])
    expect(res.sideEffects.dbNow).toEqual(NOW)
    expect(res.full).toBe(false)
  })

  it('full derives from the ELIGIBLE count: 199 ⇒ false, 200 ⇒ true', async () => {
    const many = (n: number): AnonymiseLeadRow[] => Array.from({ length: n }, (_, i) => eligible({ id: `l${i}` }))
    expect((await leadAnonymiseDbPhase(makePrisma(many(LEAD_ANONYMISE_BATCH - 1)).raw as any, NOW)).full).toBe(false)
    expect((await leadAnonymiseDbPhase(makePrisma(many(LEAD_ANONYMISE_BATCH)).raw as any, NOW)).full).toBe(true)
  })

  it('the sweep lock key is DISTINCT from the sibling sweep keys (731_004)', () => {
    expect(LEAD_ANONYMISE_SWEEP_LOCK_KEY).toBe(731_004n)
  })
})

describe('lead-anonymise Phase B: ONE atomic CAS + audit transaction per row', () => {
  it('CAS WINNER: nulls the three contact fields + stamps anonymisedAt, then writes a PII-FREE audit row on the SAME tx', async () => {
    const fake = makePrisma([eligible({ id: 'l1', stage: 'LOST' })], [1])
    const res = await runFloorSweep(fake, NOW)

    expect(fake.raw.$transaction).toHaveBeenCalledTimes(1)
    expect(fake.txOptions[0]).toEqual({ timeout: BOUNDS.txTimeoutMs, maxWait: BOUNDS.txTimeoutMs })

    // Parameterized statement_timeout as the first tx statement.
    const [cfgStrings, cfgValue] = fake.txs[0].setConfigCalls[0] as [TemplateStringsArray, string]
    expect(cfgStrings.join('¶')).toContain("set_config('statement_timeout'")
    expect(cfgValue).toBe(String(BOUNDS.statementTimeoutMs))

    // The CAS carries the EXACT snapshot (all five conditions) and nulls PII + stamps.
    expect(fake.txs[0].casCalls[0]).toEqual({
      where: {
        id: 'l1',
        anonymisedAt: null,
        convertedMerchantId: null,
        lastActivityAt: OLD,
        stage: 'LOST',
      },
      data: { contactName: null, contactEmail: null, contactPhone: null, anonymisedAt: NOW },
    })

    // The audit row is written by the winner, ON THE TRANSACTION CLIENT, PII-free.
    expect(writeAuditLogTx).toHaveBeenCalledTimes(1)
    const [txArg, ctxArg] = (writeAuditLogTx as any).mock.calls[0]
    expect(txArg).toBe(fake.txs[0].tx)
    expect(ctxArg).toMatchObject({
      entityId: 'l1',
      entityType: 'lead',
      event: 'LEAD_ANONYMISED',
      actorId: 'system',
      actorType: 'SYSTEM',
      metadata: { trigger: 'LOST' },
    })
    // No contact VALUE anywhere in the audit context.
    const serialized = JSON.stringify(ctxArg)
    expect(serialized).not.toContain('contactName')
    expect(serialized).not.toContain('contactEmail')
    expect(serialized).not.toContain('contactPhone')
    expect(res.outcome).toEqual({ full: false, failedRows: 0, startedRows: 1 })
  })

  it('classifies a STALE (non-LOST) eligible lead as trigger STALE', async () => {
    const fake = makePrisma([eligible({ id: 'l1', stage: 'CONTACTED', lastActivityAt: OLD })], [1])
    await runFloorSweep(fake, NOW)
    expect((writeAuditLogTx as any).mock.calls[0][1].metadata).toEqual({ trigger: 'STALE' })
  })

  it('CAS LOSER (touched lead re-armed / converted became exempt): NO audit, NOT a failure, later rows continue', async () => {
    const fake = makePrisma(
      [eligible({ id: 'l1' }), eligible({ id: 'l2', stage: 'CONTACTED' })],
      [0, 1], // l1 lost the CAS (touched/converted meanwhile); l2 wins
    )
    const res = await runFloorSweep(fake, NOW)
    // l1: CAS returned 0 → no audit for it; only l2 audited.
    expect(writeAuditLogTx).toHaveBeenCalledTimes(1)
    expect((writeAuditLogTx as any).mock.calls[0][1].entityId).toBe('l2')
    // A safe skip is not a failure and does not fake backlog.
    expect(res.outcome).toEqual({ full: false, failedRows: 0, startedRows: 2 })
  })

  it('audit-write failure REJECTS the transaction (stamp rolls back) → failedRows; later rows still run', async () => {
    const fake = makePrisma([eligible({ id: 'l1' }), eligible({ id: 'l2', stage: 'CONTACTED' })], [1, 1])
    ;(writeAuditLogTx as any).mockRejectedValueOnce(new Error('db blip')).mockResolvedValueOnce(undefined)
    const res = await runFloorSweep(fake, NOW)
    expect(writeAuditLogTx).toHaveBeenCalledTimes(2) // l2 still ran after l1's tx failed
    expect(res.outcome.failedRows).toBe(1)
    expect(res.outcome.full).toBe(false)
  })

  it('BEFORE-ROW cooperative stop: once stop lands, no further row transaction starts (remaining rows stay durable)', async () => {
    let stopping = false
    const fake = makePrisma([eligible({ id: 'l1' }), eligible({ id: 'l2', stage: 'CONTACTED' })], [1, 1])
    ;(writeAuditLogTx as any).mockImplementation(async () => { stopping = true })
    const res = await runFloorSweep(fake, NOW, budget({ isStopping: () => stopping }))
    // l1 ran to completion as one atomic op; l2 never started.
    expect(fake.raw.$transaction).toHaveBeenCalledTimes(1)
    expect(writeAuditLogTx).toHaveBeenCalledTimes(1)
    expect(res.outcome.full).toBe(true) // rows remaining: re-selected next scan
    expect(res.outcome.startedRows).toBe(1)
  })
})

describe('lead-anonymise: no polling scheduler survives', () => {
  it('the module exports no schedule* function (process-local scheduler is the only mechanism)', () => {
    const mod = leadModule as Record<string, unknown>
    expect(Object.keys(mod).filter((k) => /^schedule/i.test(k))).toEqual([])
  })
})
