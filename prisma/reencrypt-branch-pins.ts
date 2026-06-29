/**
 * One-off, security-critical re-encryption tool for `Branch.redemptionPin`.
 *
 * WHAT IT DOES
 *   When the AES-256-GCM ENCRYPTION_KEY is rotated, every existing branch PIN
 *   (the ONLY persisted encrypted column in the schema) must be decrypted with
 *   the OLD key and re-encrypted under the NEW key, otherwise the fail-closed
 *   runtime can no longer decrypt them at redemption time.
 *
 *   This script reads each `Branch.redemptionPin`, decrypts it with the old key
 *   (`decryptWith`), re-encrypts under the new key (`encryptWith`), and writes
 *   it back — ALL inside ONE transaction (atomic; any error rolls everything
 *   back). It is idempotent (rows already decryptable under the new key are
 *   skipped) and read-only by default.
 *
 * SAFETY (non-negotiable):
 *   - Touches ONLY `Branch.redemptionPin`. No other table/column is read or
 *     written. No seed, no Redis, no provider, no rotation.
 *   - NEVER logs plaintext PINs, keys, or connection strings. Output is limited
 *     to counts, branch ids, masked host, tallies, and transaction status.
 *   - Direct DB via `new Pool` + `PrismaPg` + the generated client (mirrors
 *     prisma/reset-covelum-pins.ts). No API, no auth state.
 *   - The migrate path is gated behind explicit confirmation flags + a host
 *     match + an expected-row count + a hard upper bound, so it cannot run
 *     against the wrong DB or an unexpectedly large table by accident.
 *
 * KEYS:
 *   ENCRYPTION_KEY_OLD + ENCRYPTION_KEY_NEW (NOT ENCRYPTION_KEY). Both 64-hex
 *   (32 bytes); the repo-public placeholder ('a'*64) is rejected; OLD === NEW
 *   is rejected.
 *
 * USAGE:
 *   # COUNT (default, read-only):
 *   ENCRYPTION_KEY_OLD=… ENCRYPTION_KEY_NEW=… npx tsx prisma/reencrypt-branch-pins.ts
 *
 *   # DRY-RUN (read-only decrypt tally):
 *   … npx tsx prisma/reencrypt-branch-pins.ts --dry-run
 *
 *   # MIGRATE (the write) — requires ALL of:
 *   … npx tsx prisma/reencrypt-branch-pins.ts --confirm \
 *       --expect-host=<host> --expect-rows=<N> \
 *       --snapshot-confirmed --services-stopped-confirmed
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import { encryptWith, decryptWith } from '../src/api/shared/encryption'

// Hard upper bound on the number of rows the write path will touch. A surprise
// larger count almost certainly means the script is pointed at the wrong DB.
const DEFAULT_BOUND_MAX = 500

// The repo-public placeholder key — must NEVER be accepted (see
// prisma/seed-data/requireEncryptionKey.ts for the rationale).
const PUBLIC_PLACEHOLDER_KEY = 'a'.repeat(64)

const KEY_HEX_RE = /^[0-9a-fA-F]{64}$/

// Strict loopback set (mirrors tests/_shared/loopbackGuard.ts).
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

/** Optional id-scope so tests can target only their fixtures. Production CLI
 *  passes no scope → the whole table. */
export interface BranchScope {
  branchIds?: string[]
}

export interface KeyOptions {
  oldKey: string
  newKey: string
}

export interface DryRunResult {
  affected: number
  okOld: number
  failOld: number
  alreadyNew: number
  /** Branch ids that need migration (decrypt-OK under OLD, not yet NEW). */
  toMigrate: string[]
}

export interface MigrateResult {
  affected: number
  migrated: number
  skippedAlreadyNew: number
}

export interface VerifyResult {
  pass: boolean
  affected: number
  okNew: number
  stillOld: number
}

// The helpers accept the real generated PrismaClient (so callers/tests pass it
// directly with no casts). Inside migrate, the $transaction callback hands us a
// transaction client that also exposes the Branch delegate; we type it
// structurally for the read+update we perform.
type BranchReader = PrismaClient
type BranchTxClient = {
  branch: {
    findMany: (args: {
      where: Record<string, unknown>
      select: { id: true; redemptionPin: true }
    }) => Promise<Array<{ id: string; redemptionPin: string | null }>>
    update: (args: { where: { id: string }; data: { redemptionPin: string } }) => Promise<unknown>
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Key + host validation (pure — no DB, no secret logging)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate ENCRYPTION_KEY_OLD + ENCRYPTION_KEY_NEW. Both must be 64-hex, must
 * NOT be the repo-public placeholder, and must differ. Throws a credential-free
 * error on any violation. Returns the validated pair on success.
 */
export function parseAndValidateKeys(oldKey: string | undefined, newKey: string | undefined): KeyOptions {
  if (!oldKey || !KEY_HEX_RE.test(oldKey)) {
    throw new Error('ENCRYPTION_KEY_OLD must be a 64-character hex string (32 bytes).')
  }
  if (!newKey || !KEY_HEX_RE.test(newKey)) {
    throw new Error('ENCRYPTION_KEY_NEW must be a 64-character hex string (32 bytes).')
  }
  if (oldKey === PUBLIC_PLACEHOLDER_KEY) {
    throw new Error('ENCRYPTION_KEY_OLD is the repo-public placeholder key. Refusing to run.')
  }
  if (newKey === PUBLIC_PLACEHOLDER_KEY) {
    throw new Error('ENCRYPTION_KEY_NEW is the repo-public placeholder key. Refusing to run.')
  }
  if (oldKey === newKey) {
    throw new Error('ENCRYPTION_KEY_OLD and ENCRYPTION_KEY_NEW are identical. Refusing to run (nothing to rotate).')
  }
  return { oldKey, newKey }
}

/** Parse a connection string and return ONLY its hostname (never the raw URL,
 *  which carries credentials). Throws a credential-free error on a bad URL. */
function hostnameOf(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('DATABASE_URL is not a valid URL; refusing to run.')
  }
  return url.hostname
}

/** Mask a hostname for safe logging: loopback printed as-is; anything else is
 *  reduced to its leading label + '****' (e.g. `ep-****`). */
export function maskHost(host: string): string {
  if (LOOPBACK_HOSTS.has(host)) return host
  const firstLabel = host.split('.')[0] ?? ''
  const head = firstLabel.slice(0, 3)
  return `${head}****`
}

/**
 * Assert the DATABASE_URL host equals OR contains the required expect-host.
 * Throws a credential-free error (only the MASKED actual host is mentioned) on
 * mismatch — so the operator can confirm they targeted the right DB before any
 * read/write happens.
 */
export function assertExpectHost(databaseUrl: string, expectHost: string): void {
  if (!expectHost || expectHost.trim() === '') {
    throw new Error('--expect-host / EXPECT_HOST is required for the write path and was empty.')
  }
  const host = hostnameOf(databaseUrl)
  const matches = host === expectHost || host.includes(expectHost)
  if (!matches) {
    throw new Error(
      `DATABASE_URL host (${maskHost(host)}) does not match the required --expect-host. ` +
        'Refusing to run to avoid touching the wrong database.',
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Core operations (DB-driving; take an explicit client + options)
// ─────────────────────────────────────────────────────────────────────────

function whereAffected(scope: BranchScope): Record<string, unknown> {
  const where: Record<string, unknown> = { redemptionPin: { not: null } }
  if (scope.branchIds && scope.branchIds.length > 0) {
    where.id = { in: scope.branchIds }
  }
  return where
}

/** Read-only: count Branch rows with a non-null redemptionPin (within scope). */
export async function countAffected(prisma: BranchReader, scope: BranchScope = {}): Promise<number> {
  return prisma.branch.count({ where: whereAffected(scope) })
}

/**
 * Read-only: classify every affected row. For each, attempt decrypt under OLD
 * (tally okOld / failOld) and under NEW (tally alreadyNew). Returns the ids that
 * still need migration. NO plaintext is ever returned or logged.
 */
export async function dryRunDecrypt(
  prisma: BranchReader,
  opts: KeyOptions & BranchScope,
): Promise<DryRunResult> {
  const rows = await prisma.branch.findMany({
    where: whereAffected({ branchIds: opts.branchIds }),
    select: { id: true, redemptionPin: true },
  })

  let okOld = 0
  let failOld = 0
  let alreadyNew = 0
  const toMigrate: string[] = []

  for (const row of rows) {
    const ct = row.redemptionPin as string
    // Already migrated under the new key?
    let isNew = false
    try {
      decryptWith(ct, opts.newKey)
      isNew = true
    } catch {
      isNew = false
    }
    if (isNew) {
      alreadyNew++
      continue
    }
    // Not new — must be decryptable under the old key to migrate.
    try {
      decryptWith(ct, opts.oldKey)
      okOld++
      toMigrate.push(row.id)
    } catch {
      failOld++
    }
  }

  return { affected: rows.length, okOld, failOld, alreadyNew, toMigrate }
}

/**
 * THE WRITE. Guards (in order):
 *   1. count !== expectRows  → abort (no write)
 *   2. count > boundMax      → abort (no write)
 * Then, inside ONE transaction: for each row that does NOT already decrypt
 * under the new key, decrypt under OLD → re-encrypt under NEW → update. Any
 * error (e.g. a malformed/old-key-undecryptable ciphertext) throws and rolls
 * the whole transaction back. Idempotent: already-NEW rows are skipped.
 */
export async function migrate(
  prisma: BranchReader,
  opts: KeyOptions & BranchScope & { expectRows: number; boundMax?: number },
): Promise<MigrateResult> {
  const boundMax = opts.boundMax ?? DEFAULT_BOUND_MAX
  const scope: BranchScope = { branchIds: opts.branchIds }

  const affected = await countAffected(prisma, scope)
  if (affected !== opts.expectRows) {
    throw new Error(
      `Aborting: affected row count (${affected}) does not match --expect-rows (${opts.expectRows}).`,
    )
  }
  if (affected > boundMax) {
    throw new Error(
      `Aborting: affected row count (${affected}) exceeds the safety bound (boundMax=${boundMax}). ` +
        'Re-run with an explicit higher bound only if you are certain this is the right database.',
    )
  }

  let migrated = 0
  let skippedAlreadyNew = 0

  await prisma.$transaction(async (txRaw) => {
    const tx = txRaw as unknown as BranchTxClient
    const rows = await tx.branch.findMany({
      where: whereAffected(scope),
      select: { id: true, redemptionPin: true },
    })
    for (const row of rows) {
      const ct = row.redemptionPin as string
      // Idempotent skip: already decryptable under the new key.
      let alreadyNew = false
      try {
        decryptWith(ct, opts.newKey)
        alreadyNew = true
      } catch {
        alreadyNew = false
      }
      if (alreadyNew) {
        skippedAlreadyNew++
        continue
      }
      // Decrypt under OLD (throws → tx rolls back) then re-encrypt under NEW.
      const plaintext = decryptWith(ct, opts.oldKey)
      const reEncrypted = encryptWith(plaintext, opts.newKey)
      await tx.branch.update({ where: { id: row.id }, data: { redemptionPin: reEncrypted } })
      migrated++
    }
  })

  return { affected, migrated, skippedAlreadyNew }
}

/**
 * Read-only post-migration check: every affected row must decrypt under NEW and
 * NONE may still decrypt under OLD. NO plaintext returned/logged.
 */
export async function verify(prisma: BranchReader, opts: KeyOptions & BranchScope): Promise<VerifyResult> {
  const rows = await prisma.branch.findMany({
    where: whereAffected({ branchIds: opts.branchIds }),
    select: { id: true, redemptionPin: true },
  })
  let okNew = 0
  let stillOld = 0
  for (const row of rows) {
    const ct = row.redemptionPin as string
    let isNew = false
    try {
      decryptWith(ct, opts.newKey)
      isNew = true
      okNew++
    } catch {
      isNew = false
    }
    // Independently check it can NOT still be read with the old key.
    try {
      decryptWith(ct, opts.oldKey)
      stillOld++
    } catch {
      /* good — not old-key-decryptable */
    }
    void isNew
  }
  const pass = okNew === rows.length && stillOld === 0
  return { pass, affected: rows.length, okNew, stillOld }
}

// ─────────────────────────────────────────────────────────────────────────
// CLI (only runs when invoked directly via tsx)
// ─────────────────────────────────────────────────────────────────────────

interface CliArgs {
  mode: 'count' | 'dry-run' | 'confirm'
  expectHost?: string
  expectRows?: number
  snapshotConfirmed: boolean
  servicesStoppedConfirmed: boolean
}

export function parseCliArgs(argv: string[], env: NodeJS.ProcessEnv): CliArgs {
  const has = (flag: string) => argv.includes(flag)
  const valueOf = (flag: string): string | undefined => {
    const pref = `${flag}=`
    const hit = argv.find((a) => a.startsWith(pref))
    return hit ? hit.slice(pref.length) : undefined
  }

  let mode: CliArgs['mode'] = 'count'
  if (has('--confirm')) mode = 'confirm'
  else if (has('--dry-run')) mode = 'dry-run'

  const expectRowsRaw = valueOf('--expect-rows')
  return {
    mode,
    expectHost: valueOf('--expect-host') ?? env.EXPECT_HOST,
    expectRows: expectRowsRaw !== undefined ? Number(expectRowsRaw) : undefined,
    snapshotConfirmed: has('--snapshot-confirmed'),
    servicesStoppedConfirmed: has('--services-stopped-confirmed'),
  }
}

async function main(): Promise<void> {
  dotenv.config()

  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set.')
    process.exit(2)
  }

  const keys = parseAndValidateKeys(process.env.ENCRYPTION_KEY_OLD, process.env.ENCRYPTION_KEY_NEW)
  const args = parseCliArgs(process.argv.slice(2), process.env)

  const dbHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL as string).hostname
    } catch {
      return ''
    }
  })()
  console.log(`Target DB host (masked): ${maskHost(dbHost)}`)

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter } as never)

  try {
    if (args.mode === 'count') {
      const n = await countAffected(prisma)
      console.log(`COUNT: ${n} branch row(s) have a redemptionPin.`)
      return
    }

    if (args.mode === 'dry-run') {
      const r = await dryRunDecrypt(prisma, keys)
      console.log(
        `DRY-RUN: affected=${r.affected} okOld=${r.okOld} failOld=${r.failOld} ` +
          `alreadyNew=${r.alreadyNew} toMigrate=${r.toMigrate.length}`,
      )
      console.log(`DRY-RUN branch ids to migrate: ${r.toMigrate.join(', ') || '(none)'}`)
      return
    }

    // mode === 'confirm' — the WRITE. Require every confirmation flag.
    const missing: string[] = []
    if (!args.expectHost) missing.push('--expect-host=<host>')
    if (args.expectRows === undefined || Number.isNaN(args.expectRows)) missing.push('--expect-rows=<N>')
    if (!args.snapshotConfirmed) missing.push('--snapshot-confirmed')
    if (!args.servicesStoppedConfirmed) missing.push('--services-stopped-confirmed')
    if (missing.length > 0) {
      console.error(`ERROR: --confirm requires all of: ${missing.join(', ')}`)
      process.exit(2)
    }

    // Host match BEFORE any read/write.
    assertExpectHost(process.env.DATABASE_URL as string, args.expectHost as string)

    const res = await migrate(prisma, {
      ...keys,
      expectRows: args.expectRows as number,
    })
    console.log(
      `MIGRATE: affected=${res.affected} migrated=${res.migrated} skippedAlreadyNew=${res.skippedAlreadyNew} (transaction committed)`,
    )

    const v = await verify(prisma, keys)
    console.log(`VERIFY: pass=${v.pass} okNew=${v.okNew} stillOld=${v.stillOld} affected=${v.affected}`)
    if (!v.pass) {
      console.error('ERROR: verify FAILED after migration.')
      process.exit(1)
    }
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

// Only run the CLI when invoked directly (not when imported by tests).
const invokedDirectly = (() => {
  const entry = process.argv[1] ?? ''
  return entry.includes('reencrypt-branch-pins')
})()

if (invokedDirectly) {
  main().catch((e) => {
    // Print the error MESSAGE only (never the full object, which could echo a
    // connection string). Defensive: messages here are credential-free.
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
