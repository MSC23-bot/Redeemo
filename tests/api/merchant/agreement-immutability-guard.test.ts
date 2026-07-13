import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// D65 security seam (plan "Security seams"): MerchantAgreementRecord is IMMUTABLE
// and APPEND-ONLY as an application-level contract. This grep-guard walks every
// TypeScript source file under src/ and asserts NO call site ever issues an
// update / updateMany / delete / deleteMany / upsert against the model. A
// superseding agreement version must produce a NEW row; prior rows (and their
// PDFs) are never touched. If this test fails, the mutation is the bug: do not
// weaken the guard.

const SRC_ROOT = path.resolve(__dirname, '../../../src')

const FORBIDDEN = /merchantAgreementRecord\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\s*\(/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && full.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('MerchantAgreementRecord immutability (append-only contract)', () => {
  it('no src/ call site ever updates, deletes, or upserts an agreement record', () => {
    const offenders: string[] = []
    for (const file of walk(SRC_ROOT)) {
      const content = fs.readFileSync(file, 'utf8')
      if (FORBIDDEN.test(content)) offenders.push(path.relative(SRC_ROOT, file))
    }
    expect(offenders).toEqual([])
  })

  it('the create call sites exist (the guard is scanning real code, not an empty tree)', () => {
    // Non-vacuous check: the ceremony service + the self-serve retrofit both CREATE
    // records - if these disappear the guard above would pass trivially.
    const creates: string[] = []
    for (const file of walk(SRC_ROOT)) {
      const content = fs.readFileSync(file, 'utf8')
      if (/merchantAgreementRecord\s*\.\s*create\s*\(/.test(content)) {
        creates.push(path.relative(SRC_ROOT, file))
      }
    }
    expect(creates.sort()).toEqual([
      'api/merchant/agreement/service.ts',
      'api/merchant/onboarding/service.ts',
    ])
  })
})
