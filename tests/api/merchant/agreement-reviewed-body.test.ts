import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import {
  normalizeSignerText,
  methodLabel,
  substituteAgreementPlaceholders,
  renderReviewedBody,
  NOT_PROVIDED,
} from '../../../src/api/merchant/agreement/reviewedBody'
import { getCurrentAgreement } from '../../../src/api/merchant/agreement/versions'

// D65 personalised-agreement SHARED render/normalize/hash module suite (decision doc §4/§13).
// Deterministic + golden-testable: the SAME module feeds the admin preview, the sign path, the
// self-serve accept, and the PDF body, so both lanes cannot diverge.

// A synthetic source exercising every placeholder class (party + signatory + known-before).
const SRC =
  'Party {{businessLegalName}} (t/a {{tradingName}}), company {{companyNumber}}, VAT ' +
  '{{vatNumber}}.\nSigned by {{signerName}} ({{signerRoleConfirmation}}).\nAgreement ' +
  'v{{agreementVersion}} hash {{contentHash}} method {{method}}.'

const BASE = {
  version: '2.1-draft',
  canonicalContentHash: 'c'.repeat(64),
  content: SRC,
  method: 'IN_PERSON_ASSISTED' as const,
  businessLegalName: 'Kovalam Tandoori Ltd',
  tradingName: 'Kovalam Tandoori',
  companyNumber: '01234567',
  vatNumber: 'GB999999973',
  signerName: 'Priya Nair',
  signerRoleConfirmation: 'Owner',
}

describe('normalizeSignerText', () => {
  it('applies NFC, collapses internal whitespace, and trims; idempotent', () => {
    expect(normalizeSignerText('  Priya   Nair  ')).toBe('Priya Nair')
    expect(normalizeSignerText('Priya\t\nNair')).toBe('Priya Nair')
    expect(normalizeSignerText(normalizeSignerText('  a   b  '))).toBe('a b')
    expect(normalizeSignerText(null)).toBe('')
    expect(normalizeSignerText(undefined)).toBe('')
  })

  it('NFC-normalizes canonically-equivalent inputs to the SAME string', () => {
    const composed = 'André' // é as one codepoint
    const decomposed = 'André' // e + combining acute
    expect(composed).not.toBe(decomposed) // different bytes...
    expect(normalizeSignerText(composed)).toBe(normalizeSignerText(decomposed)) // ...same after NFC
  })
})

describe('methodLabel', () => {
  it('maps both signing methods', () => {
    expect(methodLabel('IN_PERSON_ASSISTED')).toBe('In-person assisted (Redeemo representative device)')
    expect(methodLabel('SELF_SERVE_CLICK')).toBe('Self-serve (merchant portal click-to-agree)')
  })
})

describe('substituteAgreementPlaceholders', () => {
  it('substitutes own-property keys only; leaves unknown + prototype keys literal', () => {
    const out = substituteAgreementPlaceholders('{{a}} {{unknownField}} {{constructor}}', { a: 'X' })
    expect(out).toBe('X {{unknownField}} {{constructor}}')
  })
})

describe('renderReviewedBody', () => {
  it('is deterministic (golden): same inputs -> same body + same hash; hash == sha256(body)', () => {
    const a = renderReviewedBody(BASE)
    const b = renderReviewedBody({ ...BASE })
    expect(a.reviewedBody).toBe(b.reviewedBody)
    expect(a.reviewedContentHash).toBe(b.reviewedContentHash)
    // Self-verifying: the stored reviewedBody is the exact pre-image of the hash.
    expect(a.reviewedContentHash).toBe(
      crypto.createHash('sha256').update(a.reviewedBody, 'utf8').digest('hex'),
    )
    // Golden body: every placeholder resolved to its normalized/known value.
    expect(a.reviewedBody).toBe(
      'Party Kovalam Tandoori Ltd (t/a Kovalam Tandoori), company 01234567, VAT GB999999973.\n' +
        'Signed by Priya Nair (Owner).\n' +
        'Agreement v2.1-draft hash cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc ' +
        'method In-person assisted (Redeemo representative device).',
    )
    expect(a.normalizedSignerName).toBe('Priya Nair')
    expect(a.normalizedSignerRole).toBe('Owner')
  })

  it('normalizes signer inputs before substituting + hashing (NFC/whitespace equivalent -> same hash)', () => {
    const messy = renderReviewedBody({ ...BASE, signerName: '  Priya   Nair ', signerRoleConfirmation: 'Owner ' })
    const clean = renderReviewedBody({ ...BASE, signerName: 'Priya Nair', signerRoleConfirmation: 'Owner' })
    expect(messy.reviewedBody).toBe(clean.reviewedBody)
    expect(messy.reviewedContentHash).toBe(clean.reviewedContentHash)
  })

  it('renders unset optional identity fields as "Not provided", never undefined', () => {
    const r = renderReviewedBody({ ...BASE, tradingName: null, companyNumber: null, vatNumber: '' })
    expect(r.reviewedBody).toContain(`t/a ${NOT_PROVIDED}`)
    expect(r.reviewedBody).toContain(`company ${NOT_PROVIDED}`)
    expect(r.reviewedBody).toContain(`VAT ${NOT_PROVIDED}`)
    expect(r.reviewedBody).not.toContain('undefined')
  })

  it('BINDS version AND canonical hash: changing either changes reviewedContentHash', () => {
    const base = renderReviewedBody(BASE).reviewedContentHash
    const otherVersion = renderReviewedBody({ ...BASE, version: '2.2-draft' }).reviewedContentHash
    const otherHash = renderReviewedBody({ ...BASE, canonicalContentHash: 'd'.repeat(64) }).reviewedContentHash
    expect(otherVersion).not.toBe(base)
    expect(otherHash).not.toBe(base)
  })

  it('over the REAL current agreement source: NO contractual placeholder is left unresolved', () => {
    const agreement = getCurrentAgreement()
    const r = renderReviewedBody({
      version: agreement.version,
      canonicalContentHash: agreement.contentHash,
      content: agreement.content,
      method: 'IN_PERSON_ASSISTED',
      businessLegalName: 'Kovalam Tandoori Ltd',
      tradingName: 'Kovalam Tandoori',
      companyNumber: '01234567',
      vatNumber: 'GB999999973',
      signerName: 'Priya Nair',
      signerRoleConfirmation: 'Owner',
    })
    // The template was trimmed of event placeholders, so after resolving the contractual +
    // signatory + known-before set there are NO {{...}} tokens left anywhere in the body.
    expect(r.reviewedBody).not.toMatch(/\{\{[a-zA-Z0-9_]+\}\}/)
    // And it carries the resolved personalisation.
    expect(r.reviewedBody).toContain('Kovalam Tandoori Ltd')
    expect(r.reviewedBody).toContain('Priya Nair')
    expect(r.reviewedBody).toContain(agreement.version)
    expect(r.reviewedBody).toContain(agreement.contentHash)
    // No event-created value leaked into the reviewed body (evidence-only, appended to the PDF).
    expect(r.reviewedBody).not.toContain('{{signedAt}}')
    expect(r.reviewedBody).not.toContain('{{ipAddress}}')
  })

  it('parity: assisted vs self-serve differ ONLY by the method label, sharing the same module', () => {
    const assisted = renderReviewedBody({ ...BASE, method: 'IN_PERSON_ASSISTED' })
    const selfServe = renderReviewedBody({ ...BASE, method: 'SELF_SERVE_CLICK' })
    // Same normalizer + substitution; the only intended difference is the method-label text.
    expect(assisted.reviewedBody.replace(methodLabel('IN_PERSON_ASSISTED'), 'M')).toBe(
      selfServe.reviewedBody.replace(methodLabel('SELF_SERVE_CLICK'), 'M'),
    )
  })
})
