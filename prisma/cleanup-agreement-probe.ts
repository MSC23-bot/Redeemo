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
 *   2. optionally deletes the captured R2 objects (only when --delete-r2 is passed AND the R2_* env
 *      is present).
 * It deletes NOTHING else; run the existing prefix fixture sweep afterwards for the merchant itself.
 *
 * SAFETY:
 *   - DRY-RUN BY DEFAULT: prints what it WOULD delete. Pass --apply to execute.
 *   - --prefix is REQUIRED and must be at least 8 chars (a distinctive probe prefix, e.g.
 *     "RedeemoProbe-"), so a broad or empty match is impossible.
 *   - Refuses to run if the matched merchant count exceeds --max (default 5): a probe window
 *     creates one or two merchants, not dozens.
 *   - Uses plain SQL over `pg` (no generated client needed) against process.env.DATABASE_URL;
 *     POINTING IT AT THE RIGHT ENVIRONMENT IS THE OPERATOR'S RESPONSIBILITY. It never touches
 *     production unless you hand it production credentials: do not.
 *
 * Usage:
 *   DATABASE_URL=<staging DIRECT uri> npx tsx prisma/cleanup-agreement-probe.ts --prefix "RedeemoProbe-"            # dry run
 *   DATABASE_URL=... npx tsx prisma/cleanup-agreement-probe.ts --prefix "RedeemoProbe-" --apply                     # delete DB rows
 *   DATABASE_URL=... R2_...=... npx tsx prisma/cleanup-agreement-probe.ts --prefix "RedeemoProbe-" --apply --delete-r2
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
const max = Number(argValue('--max') ?? '5')

if (!prefix || prefix.length < 8) {
  console.error('FATAL: --prefix is required and must be >= 8 chars (a distinctive probe prefix).')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set.')
  process.exit(1)
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
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

    // 1. Delete the agreement rows (unblocks the merchant FK-restrict for the fixture sweep).
    const del = await client.query('DELETE FROM "MerchantAgreementRecord" WHERE "merchantId" = ANY($1)', [ids])
    console.log(`\nDeleted ${del.rowCount} MerchantAgreementRecord row(s).`)

    // 2. Optionally delete the R2 objects for the captured keys.
    if (deleteR2 && records.rowCount) {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3')
      const endpoint = process.env.R2_ENDPOINT
      const bucket = process.env.R2_BUCKET // the PRIVATE document bucket
      const accessKeyId = process.env.R2_ACCESS_KEY_ID
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
      if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
        console.error('R2 env incomplete (R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY): DB rows are deleted; remove these keys manually:')
        for (const r of records.rows) console.error(`  ${r.pdfKey}`)
        process.exit(2)
      }
      const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } })
      for (const r of records.rows) {
        if (!r.pdfKey || !String(r.pdfKey).startsWith('document/')) {
          console.error(`  SKIP non-document key: ${r.pdfKey}`)
          continue
        }
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: r.pdfKey }))
        console.log(`  R2 deleted: ${r.pdfKey}`)
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
