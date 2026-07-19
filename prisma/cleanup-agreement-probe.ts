/**
 * cleanup-agreement-probe.ts : targeted cleanup for D65 sign-probe residue (migration-window
 * prerequisite; see docs/runbooks/2026-07-18-migration-readiness-staging-first.md Part 6.2).
 *
 * The existing fixture sweep cannot delete a probe merchant once the D65 sign probe has run,
 * because MerchantAgreementRecord.merchant is ON DELETE RESTRICT and no existing script removes
 * those rows; and deleting the DB row does not remove the signed-PDF object from the private R2
 * bucket (pdfKey is deliberately never API-exposed). This script closes exactly those two gaps:
 *   1. lists/deletes MerchantAgreementRecord rows for merchants whose businessName starts with the
 *      probe prefix, capturing each row's pdfKey BEFORE deletion;
 *   2. with --delete-r2, deletes the captured R2 objects. The R2 configuration is validated and
 *      the client constructed BEFORE any database row is deleted, so a misconfigured R2 can never
 *      strand freshly-orphaned objects. Per-object failures are collected and reported; any
 *      failure exits non-zero with the unreconciled keys listed for manual follow-up.
 *   It deletes NOTHING else; run the existing prefix fixture sweep afterwards for the merchant.
 *
 * SAFETY:
 *   - DRY-RUN BY DEFAULT: prints what it WOULD delete. --apply executes.
 *   - --apply additionally REQUIRES:
 *       --target <host-substring> : must appear in the DATABASE_URL host (explicit target-identity
 *         gate; e.g. --target ep-round-wave). Refuses to run if it does not match.
 *       REDEEMO_CLEANUP_OWNER_APPROVED=yes in the environment (explicit owner gate).
 *   - --prefix is REQUIRED, >= 8 chars, LIKE-escaped (broad/empty match impossible).
 *   - --max is a BOUNDED POSITIVE SAFE INTEGER (1..100, default 5): NaN/Infinity/floats/zero/
 *     negatives are rejected outright, so the cap cannot be bypassed with a malformed value.
 *   - Plain SQL over `pg` against process.env.DATABASE_URL. POINTING IT AT THE RIGHT ENVIRONMENT
 *     IS THE OPERATOR'S RESPONSIBILITY (that is what --target re-checks). Never production.
 *
 * Usage (repo-local binaries only; do NOT use bare `npx tsx`, which can fall back to downloading):
 *   DATABASE_URL=<staging DIRECT uri> node_modules/.bin/tsx prisma/cleanup-agreement-probe.ts --prefix "RedeemoProbe-"
 *   DATABASE_URL=... REDEEMO_CLEANUP_OWNER_APPROVED=yes node_modules/.bin/tsx prisma/cleanup-agreement-probe.ts \
 *     --prefix "RedeemoProbe-" --apply --target <host-substring> [--delete-r2]
 */
import 'dotenv/config'
import { Client } from 'pg'

const args = process.argv.slice(2)
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const prefix = argValue('--prefix')
const apply = args.includes('--apply')
const deleteR2 = args.includes('--delete-r2')
const targetGate = argValue('--target')

// --max: bounded positive safe integer only. Number('abc') is NaN, Number('') is 0, 'Infinity'
// parses to Infinity: all rejected by the isSafeInteger + range gate below.
const maxRaw = argValue('--max') ?? '5'
const max = Number(maxRaw)
if (!Number.isSafeInteger(max) || max < 1 || max > 100) {
  console.error(`FATAL: --max must be a positive integer between 1 and 100 (got ${JSON.stringify(maxRaw)}).`)
  process.exit(1)
}

if (!prefix || prefix.length < 8) {
  console.error('FATAL: --prefix is required and must be >= 8 chars (a distinctive probe prefix).')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set.')
  process.exit(1)
}

// --apply gates: explicit target identity + explicit owner approval.
let dbHost = ''
try {
  dbHost = new URL(process.env.DATABASE_URL).hostname
} catch {
  console.error('FATAL: DATABASE_URL is not a parseable URL.')
  process.exit(1)
}
if (apply) {
  if (!targetGate) {
    console.error('FATAL: --apply requires --target <host-substring> (explicit target-identity gate).')
    process.exit(1)
  }
  if (!dbHost.includes(targetGate)) {
    console.error(`FATAL: --target ${JSON.stringify(targetGate)} does not match the DATABASE_URL host ${JSON.stringify(dbHost)}. Refusing.`)
    process.exit(1)
  }
  if (process.env.REDEEMO_CLEANUP_OWNER_APPROVED !== 'yes') {
    console.error('FATAL: --apply requires REDEEMO_CLEANUP_OWNER_APPROVED=yes in the environment (owner gate).')
    process.exit(1)
  }
}

type S3Bits = {
  s3: import('@aws-sdk/client-s3').S3Client
  DeleteObjectCommand: typeof import('@aws-sdk/client-s3').DeleteObjectCommand
  bucket: string
}

/** Validate R2 config and construct the client. Called BEFORE any DB deletion when --delete-r2. */
async function prepareR2(): Promise<S3Bits> {
  const endpoint = process.env.R2_ENDPOINT
  const bucket = process.env.R2_BUCKET // the PRIVATE document bucket
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    console.error('FATAL: --delete-r2 requires R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY. Nothing was deleted (DB rows untouched).')
    process.exit(1)
  }
  const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } })
  return { s3, DeleteObjectCommand, bucket }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    console.log(`Target host: ${dbHost}${apply ? ` (matched --target ${JSON.stringify(targetGate)})` : ' (dry run)'}`)
    // Escape LIKE wildcards in the prefix so it matches literally.
    const likePrefix = prefix!.replace(/[\\%_]/g, (m) => `\\${m}`) + '%'
    const merchants = await client.query(
      'SELECT id, "businessName" FROM "Merchant" WHERE "businessName" LIKE $1 ORDER BY "businessName"',
      [likePrefix],
    )
    console.log(`Matched ${merchants.rowCount} merchant(s) with prefix ${JSON.stringify(prefix)}:`)
    for (const m of merchants.rows) console.log(`  ${m.id}  ${m.businessName}`)
    if (merchants.rowCount === 0) return
    if ((merchants.rowCount ?? 0) > max) {
      console.error(`FATAL: matched ${merchants.rowCount} merchants > --max ${max}. Narrow the prefix.`)
      process.exit(1)
    }

    const ids = merchants.rows.map((m) => m.id)
    const records = await client.query(
      'SELECT id, "merchantId", "agreementVersion", "pdfKey", "signedAt" FROM "MerchantAgreementRecord" WHERE "merchantId" = ANY($1)',
      [ids],
    )
    console.log(`\n${records.rowCount} MerchantAgreementRecord row(s) (pdfKey captured BEFORE any delete):`)
    for (const r of records.rows) console.log(`  ${r.id}  v${r.agreementVersion}  signedAt=${r.signedAt?.toISOString?.() ?? r.signedAt}  pdfKey=${r.pdfKey}`)

    if (!apply) {
      console.log('\nDRY RUN (no --apply): nothing deleted. R2 keys above must be removed separately if rows are deleted.')
      return
    }

    // If R2 deletion is requested, VALIDATE + CONSTRUCT the client BEFORE deleting any DB row, so a
    // bad R2 config aborts with the database untouched (no freshly-orphaned objects).
    const r2 = deleteR2 && records.rowCount ? await prepareR2() : null

    // 1. Delete the agreement rows (unblocks the merchant FK-restrict for the fixture sweep).
    const del = await client.query('DELETE FROM "MerchantAgreementRecord" WHERE "merchantId" = ANY($1)', [ids])
    console.log(`\nDeleted ${del.rowCount} MerchantAgreementRecord row(s).`)

    // 2. Delete the R2 objects for the captured keys, collecting per-object failures.
    if (r2 && records.rowCount) {
      const failures: string[] = []
      for (const r of records.rows) {
        if (!r.pdfKey || !String(r.pdfKey).startsWith('document/')) {
          console.error(`  SKIP non-document key: ${r.pdfKey}`)
          failures.push(String(r.pdfKey))
          continue
        }
        try {
          await r2.s3.send(new r2.DeleteObjectCommand({ Bucket: r2.bucket, Key: r.pdfKey }))
          console.log(`  R2 deleted: ${r.pdfKey}`)
        } catch (err) {
          console.error(`  R2 DELETE FAILED: ${r.pdfKey} (${err instanceof Error ? err.name : typeof err})`)
          failures.push(r.pdfKey)
        }
      }
      if (failures.length) {
        console.error(`\nPARTIAL R2 FAILURE: ${failures.length} object(s) NOT deleted. DB rows are already removed; reconcile these keys manually:`)
        for (const k of failures) console.error(`  ${k}`)
        process.exit(2)
      }
    } else if (records.rowCount) {
      console.log('R2 objects NOT deleted (no --delete-r2). Keys listed above; remove them once the window closes.')
    }
    console.log('\nDone. Now run the existing prefix fixture sweep to delete the merchant(s) themselves.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
