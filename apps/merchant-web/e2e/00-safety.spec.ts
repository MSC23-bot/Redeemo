/**
 * PR-G1b safety Layer 1, second checkpoint: the on-disk production build that
 * `next start` serves must carry the dead-port sentinel. The webServer command
 * already asserts this after a FRESH build (assert-dead-port.mjs); this spec
 * re-asserts from the test runner so the `reuseExistingServer` local path (no
 * rebuild) is covered too. If a developer's .env.local overrode
 * NEXT_PUBLIC_API_URL in the stale build, the run fails here with a clear
 * message instead of silently pointing the client at a real API base.
 * (Residual edge: a foreign server already bound to 3103 serving a different
 * build tree - the context.route mock layer remains the backstop for that.)
 */
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SENTINEL = '127.0.0.1:9411'
const NEXT_DIR = join(__dirname, '..', '.next')

// Hashed chunks ACCUMULATE across builds, so scan ONLY the files the CURRENT
// build's manifests reference (a stale compliant chunk must not mask a bad
// current build - the exact unsoundness caught during negative validation).
function manifestFiles(name: string): string[] {
  const p = join(NEXT_DIR, name)
  if (!existsSync(p)) return []
  const files = new Set<string>()
  const collect = (v: unknown): void => {
    if (typeof v === 'string' && v.endsWith('.js')) files.add(v)
    else if (Array.isArray(v)) v.forEach(collect)
    else if (v && typeof v === 'object') Object.values(v).forEach(collect)
  }
  collect(JSON.parse(readFileSync(p, 'utf8')))
  return [...files]
}

test('SAFETY: the served build has the dead loopback API base inlined', () => {
  const files = [...new Set([...manifestFiles('build-manifest.json'), ...manifestFiles('app-build-manifest.json')])]
  expect(files.length, '.next build manifests must exist').toBeGreaterThan(0)
  const found = files.some((rel) => {
    const p = join(NEXT_DIR, rel)
    return existsSync(p) && readFileSync(p, 'utf8').includes(SENTINEL)
  })
  expect(
    found,
    `current build must contain NEXT_PUBLIC_API_URL sentinel ${SENTINEL} - a .env.local likely overrode the build env; remove it for smoke runs`,
  ).toBe(true)
})
