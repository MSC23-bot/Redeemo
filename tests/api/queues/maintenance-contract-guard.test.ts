import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { PrismaClient } from '../../../generated/prisma/client'
import type { AlertSink } from '../../../src/api/queues/maintenanceMetrics'
import {
  resolveMaintenanceConfig,
  MAINTENANCE_IDLE_FLOOR_MIN_MS,
  type MaintenanceConfig,
} from '../../../src/api/shared/env'
import { buildMaintenanceRegistration } from '../../../src/worker'
import { enqueue } from '../../../src/api/queues'
import * as outboxModule from '../../../src/api/queues/processors/outboxReconciler'
import * as pendingHoursModule from '../../../src/api/queues/processors/promotePendingHours'
import * as claimStaleModule from '../../../src/api/queues/processors/claimStaleSweep'

// Neon CU-burn PR-D: the maintenance CONTRACT GUARD (plan PR-D / Codex #7).
// Three layers, in priority order:
//
//   A. PRIMARY — real registration/configuration contract: the REAL
//      resolveMaintenanceConfig validation boundaries (the LOCKED safety
//      floors — NOT the benchmark/owner-gated operating values) and the REAL
//      buildMaintenanceRegistration wiring (the same pure factory main()
//      consumes; no duplicated test-only wiring path).
//
//   B. Deterministic-jobId producer guard (Task A5 / Codex #2): every
//      production BullMQ producer must route through the shared enqueue()
//      helper (type-level required jobId + runtime asserts). The static scan
//      enforces the honest MECHANICAL contract — no direct Queue access, no
//      addBulk, no repeatable/scheduler API — it does NOT claim to prove
//      semantic determinism of each jobId (that is recorded per site below
//      and reviewed when sites change).
//
//   C. SECONDARY — backend timer scan. Explicitly secondary to layer A: it
//      cannot detect variable-derived cadences or every possible scheduler
//      library; it guarantees only that no UNCLASSIFIED setInterval/setTimeout
//      (or BullMQ repeatable token) appears in backend src/. Every existing
//      timer is allow-listed by stable file + semantic-context identity (never
//      line numbers) with an expected occurrence count.
//
// The scans are pure functions proven against violating fixtures below, so a
// scan that silently stopped detecting violations fails its own proof.

// ─────────────────────────────────────────────────────────────────────────────
// Shared: source collection (backend src/ only — tests + frontend apps/ are
// out of the scan boundary; apps/ timers are frontend UI timers by inventory).
// ─────────────────────────────────────────────────────────────────────────────

const SRC_ROOT = resolve(process.cwd(), 'src')

function collectSourceFiles(dir: string = SRC_ROOT): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectSourceFiles(full))
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

function rel(file: string): string {
  return relative(process.cwd(), file).replace(/\\/g, '/')
}

// ─────────────────────────────────────────────────────────────────────────────
// A. PRIMARY — registration/configuration contract
// ─────────────────────────────────────────────────────────────────────────────

/** A fully valid enabled-mode env. The NUMBERS here are test fixtures chosen
 *  to satisfy the LOCKED validation floors — they are NOT approved deployment
 *  cadences (those remain benchmark/owner-gated, provided at deploy time). */
function validEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    MAINTENANCE_FLOOR_IDLE_MS: '1800000',
    MAINTENANCE_FLOOR_ACTIVE_MS: '5000',
    MAINTENANCE_PHASE_B_MAX_ITEMS: '200',
    MAINTENANCE_PHASE_B_BUDGET_MS: '10000',
    MAINTENANCE_STATEMENT_TIMEOUT_MS: '4000',
    MAINTENANCE_TX_TIMEOUT_MS: '8000',
    MAINTENANCE_SWEEP_OUTBOX_ENABLED: 'true',
    MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED: 'true',
    MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED: 'true',
    ...overrides,
  } as NodeJS.ProcessEnv
}

function enabledConfig(overrides: Record<string, string> = {}): MaintenanceConfig & { mode: 'enabled' } {
  const cfg = resolveMaintenanceConfig(validEnv(overrides))
  if (cfg.mode !== 'enabled') throw new Error('fixture must resolve enabled')
  return cfg
}

function stubSink() {
  return {
    sweepRun: vi.fn(),
    sweepFailure: vi.fn(),
    sweepDegraded: vi.fn(),
    sweepRecovered: vi.fn(),
    expiredCommunications: vi.fn(),
    stop: vi.fn(async () => ({ drained: true })),
    getCounters: vi.fn(() => ({})),
  } satisfies AlertSink
}

// PURITY: the factory must create no Prisma/Redis/queue/provider connection.
// The builders may only CAPTURE the client reference inside spec closures, so
// a stub whose every property access throws proves nothing is touched at
// construction time.
function untouchablePrisma(): PrismaClient {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        throw new Error(`buildMaintenanceRegistration touched prisma.${String(prop)} at construction time`)
      },
    },
  ) as PrismaClient
}

describe('PR-D primary — real configuration validation (LOCKED safety floors only)', () => {
  it('rejects F_idle exactly at the 300000ms floor (must EXCEED the Neon scale-to-zero window)', () => {
    expect(MAINTENANCE_IDLE_FLOOR_MIN_MS).toBe(300_000) // the locked constant itself
    expect(() => resolveMaintenanceConfig(validEnv({ MAINTENANCE_FLOOR_IDLE_MS: '300000' }))).toThrow(
      /MAINTENANCE_FLOOR_IDLE_MS/,
    )
  })

  it('accepts F_idle at 300001ms (the floor is exclusive; the guard approves NO operating value)', () => {
    const cfg = resolveMaintenanceConfig(validEnv({ MAINTENANCE_FLOOR_IDLE_MS: '300001' }))
    expect(cfg.mode).toBe('enabled')
    if (cfg.mode === 'enabled') expect(cfg.floorIdleMs).toBe(300_001)
  })

  it('rejects F_idle below the floor', () => {
    expect(() => resolveMaintenanceConfig(validEnv({ MAINTENANCE_FLOOR_IDLE_MS: '60000' }))).toThrow(
      /MAINTENANCE_FLOOR_IDLE_MS/,
    )
  })

  it('rejects statementTimeoutMs EQUAL to txTimeoutMs', () => {
    expect(() =>
      resolveMaintenanceConfig(
        validEnv({ MAINTENANCE_STATEMENT_TIMEOUT_MS: '8000', MAINTENANCE_TX_TIMEOUT_MS: '8000' }),
      ),
    ).toThrow(/must be </)
  })

  it('rejects statementTimeoutMs GREATER than txTimeoutMs', () => {
    expect(() =>
      resolveMaintenanceConfig(
        validEnv({ MAINTENANCE_STATEMENT_TIMEOUT_MS: '9000', MAINTENANCE_TX_TIMEOUT_MS: '8000' }),
      ),
    ).toThrow(/must be </)
  })

  it('accepts statementTimeoutMs BELOW txTimeoutMs', () => {
    const cfg = resolveMaintenanceConfig(
      validEnv({ MAINTENANCE_STATEMENT_TIMEOUT_MS: '7999', MAINTENANCE_TX_TIMEOUT_MS: '8000' }),
    )
    expect(cfg.mode).toBe('enabled')
  })

  it('MAINTENANCE_MODE=disabled is the ONLY explicit off-path (values not required)', () => {
    expect(resolveMaintenanceConfig({ MAINTENANCE_MODE: 'disabled' } as NodeJS.ProcessEnv)).toEqual({
      mode: 'disabled',
    })
  })

  it('an unsupported MAINTENANCE_MODE throws (never coerced to disabled or enabled)', () => {
    expect(() => resolveMaintenanceConfig({ MAINTENANCE_MODE: 'off' } as NodeJS.ProcessEnv)).toThrow(
      /unsupported MAINTENANCE_MODE/,
    )
  })

  it('enabled/unset stays FAIL-CLOSED: missing required values throw (never a silent default cadence)', () => {
    expect(() => resolveMaintenanceConfig({} as NodeJS.ProcessEnv)).toThrow(/Refusing to start/)
    expect(() =>
      resolveMaintenanceConfig(validEnv({ MAINTENANCE_FLOOR_IDLE_MS: '' })),
    ).toThrow(/MAINTENANCE_FLOOR_IDLE_MS/)
    expect(() =>
      resolveMaintenanceConfig(validEnv({ MAINTENANCE_SWEEP_OUTBOX_ENABLED: 'yes' })),
    ).toThrow(/MAINTENANCE_SWEEP_OUTBOX_ENABLED/)
  })
})

describe('PR-D primary — the REAL maintenance registration (buildMaintenanceRegistration)', () => {
  it('registers EXACTLY the three sweeps with their correct Phase-B domains', () => {
    const reg = buildMaintenanceRegistration(untouchablePrisma(), enabledConfig(), stubSink())
    expect(reg.sweeps).toHaveLength(3) // exactly — an omitted OR extra sweep fails
    const byName = new Map(reg.sweeps.map((s) => [s.spec.name, s.spec]))
    expect([...byName.keys()].sort()).toEqual(['claim-stale', 'outbox-reconcile', 'pending-hours-promote'])
    expect(byName.get('outbox-reconcile')!.sideEffectDomain).toBe('REDIS')
    expect(byName.get('pending-hours-promote')!.sideEffectDomain).toBe('DATABASE')
    expect(byName.get('claim-stale')!.sideEffectDomain).toBe('DATABASE')
    // distinct advisory-lock identities
    expect(new Set(reg.sweeps.map((s) => s.spec.lockKey)).size).toBe(3)
  })

  // PR-D correction round: each sweep's enable flag is tested INDEPENDENTLY in
  // BOTH states, with the varied sweep always differing from the two held
  // sweeps. Mutation coverage: hardcoding ANY flag to true fails that flag's
  // false-vector; hardcoding to false fails its true-vector; and every
  // pairwise field SWAP is caught because in each vector the varied flag
  // differs from both others (a swap involving the varied sweep flips its
  // observed value). Expectations read from the VALIDATED config field itself,
  // so the field-to-sweep mapping is explicit, not restated literals.
  const ENABLE_FLAG_MATRIX: Array<{
    label: string
    env: Record<string, string>
  }> = [
    {
      label: 'outbox=true, others=false',
      env: {
        MAINTENANCE_SWEEP_OUTBOX_ENABLED: 'true',
        MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED: 'false',
        MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED: 'false',
      },
    },
    {
      label: 'outbox=false, others=true',
      env: {
        MAINTENANCE_SWEEP_OUTBOX_ENABLED: 'false',
        MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED: 'true',
        MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED: 'true',
      },
    },
    {
      label: 'pending-hours=true, others=false',
      env: {
        MAINTENANCE_SWEEP_OUTBOX_ENABLED: 'false',
        MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED: 'true',
        MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED: 'false',
      },
    },
    {
      label: 'pending-hours=false, others=true',
      env: {
        MAINTENANCE_SWEEP_OUTBOX_ENABLED: 'true',
        MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED: 'false',
        MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED: 'true',
      },
    },
    {
      label: 'claim-stale=true, others=false',
      env: {
        MAINTENANCE_SWEEP_OUTBOX_ENABLED: 'false',
        MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED: 'false',
        MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED: 'true',
      },
    },
    {
      label: 'claim-stale=false, others=true',
      env: {
        MAINTENANCE_SWEEP_OUTBOX_ENABLED: 'true',
        MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED: 'true',
        MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED: 'false',
      },
    },
  ]

  it.each(ENABLE_FLAG_MATRIX)(
    'threads each REAL per-sweep enable flag independently in both states ($label)',
    ({ env }) => {
      const maintenance = enabledConfig(env)
      const reg = buildMaintenanceRegistration(untouchablePrisma(), maintenance, stubSink())
      const enabled = new Map(reg.sweeps.map((s) => [s.spec.name, s.enabled]))
      // The explicit field-to-sweep mapping, asserted from the VALIDATED config:
      expect(enabled.get('outbox-reconcile')).toBe(maintenance.sweepOutboxEnabled)
      expect(enabled.get('pending-hours-promote')).toBe(maintenance.sweepPendingHoursEnabled)
      expect(enabled.get('claim-stale')).toBe(maintenance.sweepClaimStaleEnabled)
      // Sanity: the validated fields really carry this vector's raw values
      // (guards against the fixture and the resolver drifting together).
      expect(maintenance.sweepOutboxEnabled).toBe(env.MAINTENANCE_SWEEP_OUTBOX_ENABLED === 'true')
      expect(maintenance.sweepPendingHoursEnabled).toBe(env.MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED === 'true')
      expect(maintenance.sweepClaimStaleEnabled).toBe(env.MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED === 'true')
    },
  )

  it('every sweep shares the VALIDATED idle cadence: cfg.idleMs === floorIdleMs (> 300000 by validation)', () => {
    const maintenance = enabledConfig({ MAINTENANCE_FLOOR_IDLE_MS: '1800000' })
    const reg = buildMaintenanceRegistration(untouchablePrisma(), maintenance, stubSink())
    expect(reg.cfg.idleMs).toBe(maintenance.floorIdleMs)
    expect(reg.cfg.idleMs).toBeGreaterThan(MAINTENANCE_IDLE_FLOOR_MIN_MS)
    expect(reg.cfg.activeMs).toBe(maintenance.floorActiveMs)
    // ONE shared idleMs for all sweeps by construction — there is no per-sweep
    // idle value; the scheduler applies cfg.idleMs to every registered sweep.
  })

  it('wires all four AlertSink seams (recordSweepFailure / alertDegraded / sweepRecovered / onSweepRun)', () => {
    const sink = stubSink()
    const reg = buildMaintenanceRegistration(untouchablePrisma(), enabledConfig(), sink)
    reg.cfg.recordSweepFailure!('outbox-reconcile', 'FAILURE', new Error('x'))
    reg.cfg.alertDegraded!('outbox-reconcile', 3)
    reg.cfg.sweepRecovered!('outbox-reconcile')
    reg.cfg.onSweepRun!({ name: 'outbox-reconcile', state: 'SUCCESS', durationMs: 1, full: false })
    expect(sink.sweepFailure).toHaveBeenCalledTimes(1)
    expect(sink.sweepDegraded).toHaveBeenCalledWith('outbox-reconcile', 3)
    expect(sink.sweepRecovered).toHaveBeenCalledWith('outbox-reconcile')
    expect(sink.sweepRun).toHaveBeenCalledTimes(1)
  })

  it('pins the remaining cfg wiring structurally (M-1): clock seams unswapped + backoff relations hold; the LITERAL candidate numbers stay deliberately unpinned (benchmark/owner-gated)', () => {
    const reg = buildMaintenanceRegistration(untouchablePrisma(), enabledConfig(), stubSink())
    // Swap-catcher for the two clock seams: wall-clock epoch ms is ~1.7e12,
    // performance.now() is process-uptime ms (tiny). A nowMs/monotonicNowMs
    // swap or a Date.now-as-monotonic mutation fails these magnitudes.
    expect(reg.cfg.nowMs()).toBeGreaterThan(1e12)
    expect(reg.cfg.monotonicNowMs()).toBeLessThan(1e12)
    expect(reg.cfg.monotonicNowMs()).toBeGreaterThanOrEqual(0)
    // Relations, not values: base < max (a base/max swap fails), and every
    // bound is a positive integer. The guard pins WIRING SHAPE only — it does
    // NOT approve the candidate numbers, which remain benchmark/owner-gated.
    expect(reg.cfg.degradedBaseMs).toBeLessThan(reg.cfg.degradedMaxMs)
    for (const v of [
      reg.cfg.emptyScansToIdle,
      reg.cfg.degradedBaseMs,
      reg.cfg.degradedMaxMs,
      reg.cfg.alertAfterFailures,
      reg.cfg.stopDrainMs,
    ]) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThan(0)
    }
  })

  it('is PURE: construction touches no prisma property and launches no sink call (no connection created)', () => {
    const sink = stubSink()
    // untouchablePrisma throws on ANY property access — reaching the expects
    // below proves the factory only CAPTURED the reference.
    const reg = buildMaintenanceRegistration(untouchablePrisma(), enabledConfig(), sink)
    expect(reg.sweeps).toHaveLength(3)
    for (const fn of [sink.sweepRun, sink.sweepFailure, sink.sweepDegraded, sink.sweepRecovered, sink.stop]) {
      expect(fn).not.toHaveBeenCalled()
    }
  })

  it('main() consumes the SAME factory — no parallel duplicated wiring path in worker.ts', () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'src/worker.ts'), 'utf8')
    const calls = workerSource.match(/buildMaintenanceRegistration\(/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(2) // the definition + the main() call site
    expect(workerSource).toMatch(/startMaintenanceScheduler\(prisma, registration\.cfg, registration\.sweeps\)/)
    // the old inline construction may not resurface next to the scheduler start
    expect(workerSource).not.toMatch(/startMaintenanceScheduler\(\s*prisma,\s*\{/)
  })

  it('no deleted BullMQ repeatable scheduler survives: processors export no schedule* function', () => {
    for (const mod of [outboxModule, pendingHoursModule, claimStaleModule]) {
      expect(Object.keys(mod).filter((k) => /^schedule/i.test(k))).toEqual([])
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. Deterministic-jobId producer guard (static scan + runtime pins)
// ─────────────────────────────────────────────────────────────────────────────

/** The single sanctioned BullMQ producer implementation file. */
const QUEUE_HELPER_FILE = 'src/api/queues/index.ts'

/** Current production producer sites (facts recorded, not statically proven
 *  deterministic — determinism is a review-time property per site):
 *    P1 src/api/shared/notify.ts               EMAIL       jobId = communicationLogId
 *    P2 src/api/queues/processors/moderation.ts MODERATION jobId = branchPhotoId
 *    P3 src/api/queues/processors/outboxReconciler.ts EMAIL jobId = CommunicationLog id
 *    P4 src/api/merchant/branch/service.ts     MAINTENANCE jobId = promote-hours-${branchId} (delayed nudge)
 *  All four route through enqueue(), which REQUIRES jobId at the type level
 *  (EnqueueOptions) and asserts non-empty + no-colon at runtime. */
const KNOWN_PRODUCER_FILES = [
  'src/api/shared/notify.ts',
  'src/api/queues/processors/moderation.ts',
  'src/api/queues/processors/outboxReconciler.ts',
  'src/api/merchant/branch/service.ts',
]

interface Violation {
  file: string
  rule: string
  match: string
}

/** Pure scanner (proven against fixtures below). Line-movement-resilient:
 *  matches constructs, never line numbers. */
export function scanBullmqProducerContract(source: string, file: string): Violation[] {
  const v: Violation[] = []
  const isHelper = file === QUEUE_HELPER_FILE

  // (1) `Queue` may exist as a VALUE only inside the helper. A type-only
  // specifier (`type Queue`) is harmless anywhere; a namespace import smuggles
  // the value, so it is banned outside the helper too.
  // CodeRabbit PR #355: the clause capture excludes quote characters so it can
  // never lazily span a PRECEDING import statement (whose `from '...'` tail
  // contains quotes) and inspect the wrong brace group. A real import clause
  // ({...} / * as x / ident, possibly multi-line) never contains a quote.
  for (const m of source.matchAll(/import\s+([^'"]+?)\s+from\s+['"]bullmq['"]/g)) {
    const clause = m[1]
    if (/\*\s+as\s+\w+/.test(clause) && !isHelper) {
      v.push({ file, rule: 'bullmq-namespace-import', match: m[0].slice(0, 80) })
    }
    const named = clause.match(/\{([^}]*)\}/)
    if (named) {
      const hasValueQueue = named[1]
        .split(',')
        .map((s) => s.trim())
        .some((s) => s === 'Queue' || s.startsWith('Queue as'))
      if (hasValueQueue && !isHelper) {
        v.push({ file, rule: 'queue-value-import-outside-helper', match: m[0].slice(0, 80) })
      }
    }
  }

  // (1b — M-2) Non-static bullmq access outside the helper: dynamic import(),
  // require(), and re-exports can smuggle the Queue value past rule (1). No
  // production consumer uses these today (Workers use static imports), so ANY
  // occurrence outside the helper is a violation outright.
  if (!isHelper) {
    if (/\bimport\s*\(\s*['"]bullmq['"]\s*\)/.test(source)) {
      v.push({ file, rule: 'bullmq-dynamic-import-outside-helper', match: "import('bullmq')" })
    }
    if (/\brequire\s*\(\s*['"]bullmq['"]\s*\)/.test(source)) {
      v.push({ file, rule: 'bullmq-require-outside-helper', match: "require('bullmq')" })
    }
    for (const m of source.matchAll(/export\s+\{([^}]*)\}\s+from\s+['"]bullmq['"]/g)) {
      const reexportsValueQueue = m[1]
        .split(',')
        .map((s) => s.trim())
        .some((s) => s === 'Queue' || s.startsWith('Queue as'))
      if (reexportsValueQueue) {
        v.push({ file, rule: 'queue-value-reexport-outside-helper', match: m[0].slice(0, 80) })
      }
    }
  }

  // (2) makeQueue() (the Queue factory — NOT makeQueueConnection) is
  // helper-internal: any outside caller could bypass enqueue()'s jobId contract.
  if (!isHelper && /\bmakeQueue(?!Connection)\s*\(/.test(source)) {
    v.push({ file, rule: 'makeQueue-call-outside-helper', match: 'makeQueue(' })
  }

  // (3) No bulk producer API anywhere (bypasses per-job jobId discipline).
  if (/\.addBulk\s*\(/.test(source)) {
    v.push({ file, rule: 'addBulk', match: '.addBulk(' })
  }

  // (4) No BullMQ repeatable / job-scheduler registration ANYWHERE (the
  // deleted 60s repeatables must never return; the process-local scheduler is
  // the only recurring mechanism). Covers the current v5 APIs; a renamed
  // future API is a known limitation of this secondary defence.
  for (const token of [/\bupsertJobScheduler\b/, /\bJobScheduler\b/, /\bremoveRepeatable\b/]) {
    if (token.test(source)) v.push({ file, rule: 'repeatable-scheduler-api', match: String(token) })
  }
  for (const token of [/\brepeat\s*:/, /\bevery\s*:/]) {
    if (token.test(source)) v.push({ file, rule: 'repeatable-options-token', match: String(token) })
  }

  return v
}

describe('PR-D producer guard — no BullMQ producer outside the enqueue() helper', () => {
  const files = collectSourceFiles()

  it('scans a non-trivial backend source set (sanity: the scan boundary is not empty/misrooted)', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(files.some((f) => rel(f) === QUEUE_HELPER_FILE)).toBe(true)
  })

  it('REAL src/ contains zero producer-contract violations', () => {
    const violations = files.flatMap((f) => scanBullmqProducerContract(readFileSync(f, 'utf8'), rel(f)))
    expect(violations).toEqual([])
  })

  it('every known producer site still routes through enqueue() (membership pin; new sites are caught by the rules above)', () => {
    for (const file of KNOWN_PRODUCER_FILES) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, `${file} should call enqueue(`).toMatch(/\benqueue\s*\(/)
    }
  })

  it('the helper keeps the TYPE-LEVEL required jobId (EnqueueOptions) and stays the sole .add() implementation', () => {
    const helper = readFileSync(resolve(process.cwd(), QUEUE_HELPER_FILE), 'utf8')
    expect(helper).toMatch(/EnqueueOptions = JobsOptions & \{ jobId: string \}/)
    // exactly ONE Queue add call in the helper — the enqueue() body
    expect(helper.match(/\bq\.add\s*\(/g)).toHaveLength(1)
  })

  it('runtime enforcement holds: enqueue() rejects a missing/blank jobId and a colon jobId BEFORE touching Redis', async () => {
    // These throw before makeQueue(), so no connection is attempted.
    await expect(enqueue('guard-q', {}, {} as never)).rejects.toThrow(/jobId is REQUIRED/)
    await expect(enqueue('guard-q', {}, { jobId: '   ' })).rejects.toThrow(/jobId is REQUIRED/)
    await expect(enqueue('guard-q', {}, { jobId: 'a:b' })).rejects.toThrow(/must not contain/)
  })

  describe('scanner PROOF against violating fixtures (mutation resistance of the scan itself)', () => {
    it('detects a direct Queue value import + unkeyed add (a producer bypass omitting jobId)', () => {
      const fixture = `
        import { Queue } from 'bullmq'
        const q = new Queue('sneaky')
        void q.add('job', { data: 1 }) // no jobId — would bypass the contract
      `
      const v = scanBullmqProducerContract(fixture, 'src/api/sneaky.ts')
      expect(v.map((x) => x.rule)).toContain('queue-value-import-outside-helper')
    })

    it('detects a Queue value import even when a NON-bullmq import precedes it (CodeRabbit PR #355 regression fixture)', () => {
      const fixture = `
        import { readFileSync } from 'node:fs'
        import { something } from './elsewhere'
        import { Queue } from 'bullmq'
        const q = new Queue('sneaky')
      `
      const v = scanBullmqProducerContract(fixture, 'src/api/sneaky.ts')
      expect(v.map((x) => x.rule)).toContain('queue-value-import-outside-helper')
      // multi-line named import is still caught (the clause legitimately spans lines)
      const multiline = `import {\n  Worker,\n  Queue,\n} from 'bullmq'`
      expect(
        scanBullmqProducerContract(multiline, 'src/api/sneaky2.ts').map((x) => x.rule),
      ).toContain('queue-value-import-outside-helper')
    })

    it('detects a makeQueue() bypass outside the helper', () => {
      const fixture = `import { makeQueue } from './api/queues'\nconst q = await makeQueue('x')\nawait q.add('x', {})`
      const v = scanBullmqProducerContract(fixture, 'src/somewhere.ts')
      expect(v.map((x) => x.rule)).toContain('makeQueue-call-outside-helper')
    })

    it('detects addBulk', () => {
      const v = scanBullmqProducerContract(`await q.addBulk([{ name: 'a', data: {} }])`, 'src/x.ts')
      expect(v.map((x) => x.rule)).toContain('addBulk')
    })

    it('detects repeatable/scheduler registration (repeat:, every:, upsertJobScheduler)', () => {
      expect(
        scanBullmqProducerContract(`await q.add('j', {}, { repeat: { every: 60000 } })`, 'src/x.ts').length,
      ).toBeGreaterThan(0)
      expect(
        scanBullmqProducerContract(`await q.upsertJobScheduler('sweep', { every: 60000 })`, 'src/x.ts').length,
      ).toBeGreaterThan(0)
    })

    it('detects non-static bullmq smuggling (dynamic import, require, value re-export) outside the helper (M-2)', () => {
      expect(
        scanBullmqProducerContract(`const { Queue } = await import('bullmq')`, 'src/x.ts').map((x) => x.rule),
      ).toContain('bullmq-dynamic-import-outside-helper')
      expect(
        scanBullmqProducerContract(`const bull = require('bullmq')`, 'src/x.ts').map((x) => x.rule),
      ).toContain('bullmq-require-outside-helper')
      expect(
        scanBullmqProducerContract(`export { Queue } from 'bullmq'`, 'src/x.ts').map((x) => x.rule),
      ).toContain('queue-value-reexport-outside-helper')
      // a TYPE-only re-export stays legitimate
      expect(scanBullmqProducerContract(`export { type Queue } from 'bullmq'`, 'src/x.ts')).toEqual([])
    })

    it('does NOT flag legitimate non-producer code (Worker consumers, type-only Queue, Set.add, makeQueueConnection)', () => {
      const fixture = `
        import { Worker, type Queue, type Job } from 'bullmq'
        import { makeQueueConnection } from '../connection'
        const seen = new Set<string>()
        seen.add('x')
        const w = new Worker('q', async () => {}, { connection: makeQueueConnection() as never })
        void w
      `
      expect(scanBullmqProducerContract(fixture, 'src/api/queues/processors/legit.ts')).toEqual([])
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. SECONDARY — backend timer scan (explicitly secondary to layer A; cannot
// see variable-derived cadence or non-listed scheduler libraries)
// ─────────────────────────────────────────────────────────────────────────────

interface TimerAllowEntry {
  file: string
  /** Stable SEMANTIC identity of the call site (never a line number). */
  context: RegExp
  /** Expected occurrence count — a new timer mimicking an allowed shape still
   *  changes the count and must be deliberately classified here. */
  count: number
  justification: string
}

/** The complete, justified backend timer allow-list. setInterval's allow-list
 *  is EMPTY by design. */
const TIMER_ALLOW_LIST: TimerAllowEntry[] = [
  {
    file: 'src/api/queues/maintenanceScheduler.ts',
    context: /timer = setTimeout\(\(\) => \{/,
    count: 1,
    justification:
      'THE one sanctioned recurring backend timer: the maintenance scheduler re-arm. Its cadence is governed by the PRIMARY contract (validated floorIdleMs > 300000 / per-sweep degraded backoff), not by this scan.',
  },
  {
    file: 'src/api/queues/maintenanceScheduler.ts',
    context: /bound = setTimeout\(\(\) => res\('timeout'\)/,
    count: 2,
    justification: 'One-shot bounded deadlines for stop() drain and forceJoin() — shutdown controls, no DB work.',
  },
  {
    file: 'src/api/queues/maintenanceMetrics.ts',
    context: /bound = setTimeout\(\(\) => res\('timeout'\), ALERT_SINK_STOP_DRAIN_MS\)/,
    count: 1,
    justification: 'One-shot bounded drain deadline for AlertSink.stop() — shutdown control, no DB work.',
  },
  {
    file: 'src/api/queues/index.ts',
    context: /setTimeout\(\(\) => res\(true\), QUEUE_CLOSE_TIMEOUT_MS\)/,
    count: 1,
    justification: 'One-shot bounded queue-close deadline in closeQueues() — shutdown control, no DB work.',
  },
  {
    file: 'src/workerShutdown.ts',
    context: /timer = setTimeout\(\(\) => res\('timeout'\), ms\)/,
    count: 1,
    justification: 'One-shot boundedPhase deadline in the shutdown coordinator — shutdown control, no DB work.',
  },
]

/** Pure scanner (proven against fixtures below). */
export function scanBackendTimers(source: string, file: string): Violation[] {
  const v: Violation[] = []
  if (/\bsetInterval\s*\(/.test(source)) {
    v.push({ file, rule: 'setInterval (allow-list is EMPTY)', match: 'setInterval(' })
  }
  const lines = source.split('\n')
  const allowedForFile = TIMER_ALLOW_LIST.filter((e) => e.file === file)
  const matchedCounts = new Map<TimerAllowEntry, number>()
  for (const line of lines) {
    if (!/\bsetTimeout\s*\(/.test(line)) continue
    const entry = allowedForFile.find((e) => e.context.test(line))
    if (!entry) {
      v.push({ file, rule: 'unclassified setTimeout', match: line.trim().slice(0, 100) })
    } else {
      matchedCounts.set(entry, (matchedCounts.get(entry) ?? 0) + 1)
    }
  }
  for (const entry of allowedForFile) {
    const seen = matchedCounts.get(entry) ?? 0
    if (seen !== entry.count) {
      v.push({
        file,
        rule: 'allow-list count drift',
        match: `${entry.context} expected ${entry.count}, saw ${seen}`,
      })
    }
  }
  return v
}

describe('PR-D secondary — backend timer scan (src/ only; tests + apps/ excluded)', () => {
  const files = collectSourceFiles()

  it('REAL src/ contains zero unclassified timers and every allow-list entry matches its expected count', () => {
    const violations = files.flatMap((f) => scanBackendTimers(readFileSync(f, 'utf8'), rel(f)))
    expect(violations).toEqual([])
  })

  it('every allow-list entry points at a file that exists and carries a justification', () => {
    for (const entry of TIMER_ALLOW_LIST) {
      expect(files.map(rel)).toContain(entry.file)
      expect(entry.justification.length).toBeGreaterThan(20)
    }
  })

  describe('scanner PROOF against violating fixtures', () => {
    it('flags any setInterval (empty allow-list)', () => {
      const v = scanBackendTimers(`setInterval(() => pollDb(), 1000)`, 'src/api/new-poller.ts')
      expect(v.map((x) => x.rule)).toContain('setInterval (allow-list is EMPTY)')
    })

    it('flags an unclassified setTimeout in a NEW file', () => {
      const v = scanBackendTimers(`setTimeout(() => scanDb(), 30_000)`, 'src/api/new-timer.ts')
      expect(v.map((x) => x.rule)).toContain('unclassified setTimeout')
    })

    it('flags an allowed SHAPE appearing in the wrong file', () => {
      const v = scanBackendTimers(`timer = setTimeout(() => {`, 'src/api/elsewhere.ts')
      expect(v.map((x) => x.rule)).toContain('unclassified setTimeout')
    })

    it('flags a COUNT drift (a second timer mimicking an allowed shape in the allowed file)', () => {
      const doubled = `timer = setTimeout(() => {\n  a()\ntimer = setTimeout(() => {\n  b()`
      const v = scanBackendTimers(doubled, 'src/api/queues/maintenanceScheduler.ts')
      expect(v.some((x) => x.rule === 'allow-list count drift')).toBe(true)
    })
  })
})
