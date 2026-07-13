import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  CURRENT_AGREEMENT_VERSION,
  LEGACY_CONTRACT_VERSION,
  LEGACY_CONTRACT_TEXT,
  computeContentHash,
  getAgreementVersion,
  getCurrentAgreement,
  getLatestNonDraftAgreement,
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
    expect(getAgreementVersion('2.0')).toBeUndefined() // the frozen 2.0 is not registered yet
    expect(getAgreementVersion('__proto__')).toBeUndefined()
  })

  // REBASELINE (review-round S2): '1.0' is now a REGISTERED non-draft legacy fallback
  // entry (it previously resolved to undefined). It exists so PRODUCTION can serve/bind
  // it with truthful evidence while the current version is a draft.
  it('the legacy 1.0 is registered as a NON-DRAFT entry with its own recomputable hash', () => {
    const legacy = getAgreementVersion(LEGACY_CONTRACT_VERSION)
    expect(legacy).toBeDefined()
    expect(legacy!.version).toBe('1.0')
    expect(legacy!.isDraft).toBe(false)
    expect(legacy!.content).toBe(LEGACY_CONTRACT_TEXT)
    expect(legacy!.contentHash).toBe(computeContentHash(LEGACY_CONTRACT_TEXT))
    // Truthful: a distinct hash from the draft, and no em-dash in the legacy text
    // (style lock). The em-dash is built from its code point to keep the diff clean.
    expect(legacy!.contentHash).not.toBe(getCurrentAgreement().contentHash)
    expect(legacy!.content).not.toContain(String.fromCharCode(0x2014))
  })

  it('getLatestNonDraftAgreement returns the legacy 1.0 while the current version is a draft', () => {
    const latest = getLatestNonDraftAgreement()
    expect(latest).toBeDefined()
    expect(latest!.version).toBe('1.0')
    expect(latest!.isDraft).toBe(false)
  })
})
