/**
 * PR-G1b safety Layer 1 enforcement: verify the CURRENT production build has
 * the dead loopback port inlined as NEXT_PUBLIC_API_URL.
 *
 * Why this exists: Layer 1 (the dead-port NEXT_PUBLIC_API_URL) is ENFORCED,
 * never assumed. Adjudicated empirically for this lane's invocation: process
 * env WINS over a developer's .env.local at `next build` - but this check
 * makes that precedence irrelevant (any inversion across Next versions, or any
 * other env source overriding the API base, fails the lane before start).
 *
 * Soundness: hashed chunks ACCUMULATE in .next/static/chunks across builds, so
 * a naive directory grep can match a STALE chunk from an earlier compliant
 * build (the exact trap the first draft of this script fell into). It
 * therefore scans ONLY the chunk files referenced by the CURRENT build's
 * manifests (build-manifest.json + app-build-manifest.json). The lane also
 * cleans .next before building (webServer command) as defence-in-depth.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SENTINEL = '127.0.0.1:9411'
const nextDir = join(process.cwd(), '.next')

function manifestFiles(name) {
  const p = join(nextDir, name)
  if (!existsSync(p)) return []
  const manifest = JSON.parse(readFileSync(p, 'utf8'))
  const files = new Set()
  const collect = (v) => {
    if (typeof v === 'string' && v.endsWith('.js')) files.add(v)
    else if (Array.isArray(v)) v.forEach(collect)
    else if (v && typeof v === 'object') Object.values(v).forEach(collect)
  }
  collect(manifest)
  return [...files]
}

const files = [...new Set([...manifestFiles('build-manifest.json'), ...manifestFiles('app-build-manifest.json')])]
if (files.length === 0) {
  console.error('[e2e-safety] No build manifests found - run next build first.')
  process.exit(1)
}

let found = false
for (const rel of files) {
  const p = join(nextDir, rel)
  if (existsSync(p) && readFileSync(p, 'utf8').includes(SENTINEL)) {
    found = true
    break
  }
}

if (!found) {
  console.error(
    `[e2e-safety] The CURRENT build's chunks do NOT contain the dead-port sentinel ${SENTINEL}.\n` +
      `Something overrode NEXT_PUBLIC_API_URL at build time (check for a .env.local /\n` +
      `.env.production in apps/merchant-web). The lane refuses to start against an\n` +
      `unknown API base.`,
  )
  process.exit(1)
}
console.log(`[e2e-safety] Current build carries the dead-port sentinel ${SENTINEL} (${files.length} manifest chunks scanned).`)
