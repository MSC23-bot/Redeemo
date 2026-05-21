import fs from 'node:fs'
import path from 'node:path'

/**
 * Phase 2.5 + 3a negative-pin meta-test.
 *
 * Locks the post-Phase-2.5-and-3a invariant that NO surface-local
 * branchToMerchantTile adapter AND no merchant-first contract artefacts
 * remain in the customer-app source tree. Prevents future PRs from
 * reintroducing either pattern by:
 *
 *   Phase 2.5 pins:
 *   1. Asserting the 3 adapter file paths do NOT exist.
 *   2. Asserting NO source file under apps/customer-app/src/** imports
 *      `branchToMerchantTile` or `branchToMerchantTileProps`.
 *   3. Asserting NO source file under apps/customer-app/src/features/**
 *      imports the old shared component path `'@/features/shared/MerchantTile'`.
 *
 *   Phase 3a pins (new):
 *   4. Asserting NO source file imports the legacy `MerchantTile` type
 *      alias from `'@/lib/api/discovery'` (Task F deleted it).
 *   5. Asserting NO source file imports the legacy `makeMerchantTile`
 *      fixture (Task D deleted the file).
 *
 * If any of these fail, the relevant phase's structural goal is broken.
 * Do NOT relax these pins; instead, fix the offending import path.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const SRC_ROOT  = path.join(REPO_ROOT, 'apps/customer-app/src')

const FORBIDDEN_ADAPTER_PATHS = [
  'apps/customer-app/src/features/home/utils/branchToMerchantTile.ts',
  'apps/customer-app/src/features/search/utils/branchToMerchantTile.ts',
]

// Patterns target RUNTIME usages of the deleted adapter — import
// statements + function-call expressions. Bare prose mentions in
// comments are harmless and intentionally not flagged (Task E + Task F
// of Phase 2.5 already swept the meaningful comment references; any
// remaining historical mentions in docs / older comments don't violate
// the structural invariant this test locks).
const FORBIDDEN_IMPORT_PATTERNS = [
  // Bare-word import: `import { branchToMerchantTile, ... }` (single-line).
  /^\s*import\b[^/]*\bbranchToMerchantTile(?:Props)?\b/,
  // Module-path import: `from '../utils/branchToMerchantTile'` or similar.
  /from\s+['"][^'"]*\/branchToMerchantTile['"]/,
  // Function-call expression: `branchToMerchantTile(branch)` or `branchToMerchantTileProps(branch)`.
  /\bbranchToMerchantTile(?:Props)?\s*\(/,
  // Old shared-component import path (post-Phase-2.5 the file is BranchTile.tsx).
  /from\s+['"]@\/features\/shared\/MerchantTile['"]/,
]

function walkSync(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkSync(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('Phase 2.5 — surface-local branchToMerchantTile adapter is fully removed', () => {
  it('no forbidden adapter file path exists on disk', () => {
    for (const rel of FORBIDDEN_ADAPTER_PATHS) {
      const abs = path.join(REPO_ROOT, rel)
      expect(fs.existsSync(abs)).toBe(false)
    }
  })

  it('no source file imports branchToMerchantTile / branchToMerchantTileProps', () => {
    const files = walkSync(SRC_ROOT)
    const offenders: { file: string; line: number; pattern: string }[] = []
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8').split('\n')
      content.forEach((line, idx) => {
        for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
          if (pattern.test(line)) {
            offenders.push({ file: path.relative(REPO_ROOT, file), line: idx + 1, pattern: pattern.source })
          }
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('no source file under features/** imports the old shared MerchantTile component path', () => {
    const featuresDir = path.join(SRC_ROOT, 'features')
    const files = walkSync(featuresDir)
    const offenders: string[] = []
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      if (/from\s+['"]@\/features\/shared\/MerchantTile['"]/.test(content)) {
        offenders.push(path.relative(REPO_ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })

  // Phase 3a additions (2026-05-21) — block reintroduction of the
  // merchant-first tile contract at the customer-app source layer.
  // Phase 3a deleted the `MerchantTile` type alias + the `makeMerchantTile`
  // fixture. These pins are belt-and-braces (tsc covers reintroduction
  // because the symbols don't exist post Task F + Task D), but they
  // serve as a standing structural guard against silent regressions.

  it('Phase 3a — no source file imports the legacy MerchantTile type from @/lib/api/discovery', () => {
    const files = walkSync(SRC_ROOT)
    const pattern = /import\s+(?:type\s+)?\{[^}]*\bMerchantTile\b[^}]*\}\s+from\s+['"]@\/lib\/api\/discovery['"]/
    const offenders: { file: string; line: number }[] = []
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8').split('\n')
      content.forEach((line, idx) => {
        if (pattern.test(line)) {
          offenders.push({ file: path.relative(REPO_ROOT, file), line: idx + 1 })
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('Phase 3a — no source file imports the legacy makeMerchantTile fixture', () => {
    const files = walkSync(SRC_ROOT)
    const pattern = /import\s+\{[^}]*\bmakeMerchantTile\b[^}]*\}/
    const offenders: { file: string; line: number }[] = []
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8').split('\n')
      content.forEach((line, idx) => {
        if (pattern.test(line)) {
          offenders.push({ file: path.relative(REPO_ROOT, file), line: idx + 1 })
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
