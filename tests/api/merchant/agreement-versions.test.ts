import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  CURRENT_AGREEMENT_VERSION,
  computeContentHash,
  getAgreementVersion,
  getCurrentAgreement,
  listAgreementVersions,
} from '../../../src/api/merchant/agreement/versions'
import { MERCHANT_AGREEMENT_V2_SOURCE } from '../../../src/api/merchant/agreement/agreement-v2-source'

// D65 Slice 0 guard suite. Load-bearing pins:
//  - the embedded canonical source is byte-identical to the on-disk artifact
//    (docs/legal/drafts/merchant-agreement-v2-draft.md) - they can never silently
//    drift;
//  - each published version's stored hash equals a freshly recomputed sha256 over
//    its source (published bytes are immutable + the hash is deterministic);
//  - the [SOLICITOR] markers + DRAFT header survive verbatim (legal-content lock);
//  - resolving an unknown version fails closed (undefined).

const ARTIFACT_PATH = path.resolve(
  __dirname,
  '../../../docs/legal/drafts/merchant-agreement-v2-draft.md',
)

describe('agreement version registry', () => {
  it('embedded v2 source is byte-identical to the on-disk artifact', () => {
    const onDisk = fs.readFileSync(ARTIFACT_PATH, 'utf8')
    expect(MERCHANT_AGREEMENT_V2_SOURCE).toBe(onDisk)
  })

  it('computeContentHash is deterministic and matches a raw sha256', () => {
    const a = computeContentHash(MERCHANT_AGREEMENT_V2_SOURCE)
    const b = computeContentHash(MERCHANT_AGREEMENT_V2_SOURCE)
    const raw = crypto.createHash('sha256').update(MERCHANT_AGREEMENT_V2_SOURCE, 'utf8').digest('hex')
    expect(a).toBe(b)
    expect(a).toBe(raw)
    expect(a).toHaveLength(64)
  })

  it('every published version pins a hash that recomputes from its source (immutable bytes)', () => {
    for (const v of listAgreementVersions()) {
      expect(v.contentHash).toBe(computeContentHash(v.content))
    }
  })

  it('the current version is the v2 draft and matches the artifact hash', () => {
    const current = getCurrentAgreement()
    expect(current.version).toBe(CURRENT_AGREEMENT_VERSION)
    expect(current.version).toBe('2.0-draft')
    expect(current.isDraft).toBe(true)
    const onDisk = fs.readFileSync(ARTIFACT_PATH, 'utf8')
    expect(current.contentHash).toBe(crypto.createHash('sha256').update(onDisk, 'utf8').digest('hex'))
  })

  it('preserves the SOLICITOR markers and the DRAFT header verbatim', () => {
    const src = getCurrentAgreement().content
    expect(src).toContain('LEGAL-REVIEW-REQUIRED')
    expect(src).toContain('DRAFT')
    expect(src).toContain('[SOLICITOR:')
    // The draft footer records 20 collected solicitor questions.
    expect(src).toContain('Collected solicitor questions in this draft: 20')
  })

  it('resolving an unknown version fails closed (undefined)', () => {
    expect(getAgreementVersion('does-not-exist')).toBeUndefined()
    expect(getAgreementVersion('1.0')).toBeUndefined()
    expect(getAgreementVersion('__proto__')).toBeUndefined()
  })
})
