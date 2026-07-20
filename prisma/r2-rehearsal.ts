/**
 * r2-rehearsal.ts : prefix-scoped R2 helper for the Part 14 step-7 lanes (owner-gated rehearsal
 * ONLY). Every operation is confined to the disposable prefix `document/rehearsal-r2-<uuid>/`
 * (fail-closed guard in r2-rehearsal.lib.ts): it can NEVER list, read, overwrite or delete any
 * object outside that prefix. It never issues a broad/unprefixed LIST.
 *
 * Subcommands (run via the wrapper's `r2_run` so R2_* arrive as subshell env only):
 *   r2_run node_modules/.bin/tsx prisma/r2-rehearsal.ts list <uuid>          # prefix-scoped LIST
 *   r2_run node_modules/.bin/tsx prisma/r2-rehearsal.ts put <uuid> probe.pdf # PUT tiny disposable object
 *   r2_run node_modules/.bin/tsx prisma/r2-rehearsal.ts verify-empty <uuid>  # exit 1 if prefix non-empty
 *
 * The cleanup tool (not this helper) performs the deletions; this helper only proves the prefix
 * lifecycle (empty -> object present -> empty).
 */
import 'dotenv/config'
import { rehearsalPrefix, assertInsideRehearsalPrefix } from './r2-rehearsal.lib'

const [cmd, uuid, leaf] = process.argv.slice(2)

function env(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`FATAL: ${name} is not set (run via r2_run so R2_* arrive as subshell env).`)
    process.exit(1)
  }
  return v
}

async function main() {
  if (!cmd || !uuid) {
    console.error('usage: r2-rehearsal.ts <list|put|verify-empty> <uuid> [leaf]')
    process.exit(1)
  }
  const prefix = rehearsalPrefix(uuid) // throws on a malformed uuid before any client is built
  const endpoint = env('R2_ENDPOINT')
  const bucket = env('R2_BUCKET')
  const accessKeyId = env('R2_ACCESS_KEY_ID')
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY')
  const { S3Client, ListObjectsV2Command, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } })

  if (cmd === 'list' || cmd === 'verify-empty') {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 100 }))
    const keys = (res.Contents ?? []).map((o) => o.Key ?? '')
    console.log(`prefix ${prefix} contains ${keys.length} object(s)`)
    for (const k of keys) console.log(`  ${k}`)
    if (cmd === 'verify-empty' && keys.length > 0) {
      console.error('FATAL: prefix is not empty.')
      process.exit(1)
    }
    return
  }
  if (cmd === 'put') {
    if (!leaf || leaf.includes('/') || leaf.includes('..')) {
      console.error('FATAL: put requires a plain leaf filename (no slashes).')
      process.exit(1)
    }
    const key = `${prefix}${leaf}`
    assertInsideRehearsalPrefix(key, uuid)
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from('%PDF-rehearsal-disposable'), ContentType: 'application/pdf' }))
    console.log(`put ${key} (25 bytes, disposable)`)
    return
  }
  console.error(`unknown subcommand ${JSON.stringify(cmd)}`)
  process.exit(1)
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : err)
  process.exit(1)
})
