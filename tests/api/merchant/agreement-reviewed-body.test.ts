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
import { AppError } from '../../../src/api/shared/errors'

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

  // D65 signer-name hardening (SHOULD-FIX): plain trim()/collapse does not touch Unicode
  // default-ignorable code points (they are not \s), so a name built only from these renders
  // visually empty yet used to pass the old length===0 guard. Strip them from the value that
  // is hashed + persisted, not just check for their absence.
  it('strips Unicode default-ignorable code points embedded in otherwise real text', () => {
    const zwsp = String.fromCodePoint(0x200b) // ZERO WIDTH SPACE
    expect(normalizeSignerText(`John${zwsp}Smith`)).toBe('JohnSmith')
    const bom = String.fromCodePoint(0xfeff) // ZERO WIDTH NO-BREAK SPACE / BOM
    expect(normalizeSignerText(`${bom}Jane Smith${bom}`)).toBe('Jane Smith')
  })

  it('strips C0/C1 control characters', () => {
    const bel = String.fromCodePoint(0x0007)
    expect(normalizeSignerText(`Jane${bel}Smith`)).toBe('JaneSmith')
  })

  it('is idempotent after the invisible/control strip (applying it twice is a no-op)', () => {
    const zwsp = String.fromCodePoint(0x200b)
    const once = normalizeSignerText(`${zwsp}Priya Nair${zwsp}`)
    expect(normalizeSignerText(once)).toBe(once)
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

  // FIX 3 (single chokepoint): a personalised body cannot be produced without a real signatory.
  // A value that NORMALIZES to empty (whitespace, tab, or a non-breaking space that passes a route
  // .min(1)) is rejected here, so every caller (both previews, both sign paths, self-serve accept)
  // inherits the guard.
  it('FIX 3: throws AGREEMENT_SIGNER_INVALID when the signer name normalizes to empty', () => {
    expect(() => renderReviewedBody({ ...BASE, signerName: '   ' })).toThrow(AppError)
    try {
      renderReviewedBody({ ...BASE, signerName: ' ' })
    } catch (e) {
      expect((e as AppError).code).toBe('AGREEMENT_SIGNER_INVALID')
    }
  })

  it('FIX 3: throws AGREEMENT_SIGNER_INVALID when the signer role normalizes to empty', () => {
    try {
      renderReviewedBody({ ...BASE, signerRoleConfirmation: '\t\n ' })
      throw new Error('expected AGREEMENT_SIGNER_INVALID')
    } catch (e) {
      expect((e as AppError).code).toBe('AGREEMENT_SIGNER_INVALID')
    }
  })

  // D65 signer-name hardening (SHOULD-FIX, legal-material): the guard above only checked
  // length===0, so a signer name that is VISUALLY empty but not string-empty (Unicode
  // default-ignorable code points, or a lone combining mark with no base letter) used to
  // pass through and produce a "signed" reviewed body with no legible signatory. Each of
  // these normalizes to something that is either empty or has no \p{L}/\p{N} content, and
  // every one must be rejected with AGREEMENT_SIGNER_INVALID before any hash/body derivation.
  describe('D65 hardening: visually-empty / invisible-only / control-only signer values are rejected', () => {
    const cases: Array<[string, string]> = [
      ['ZERO WIDTH SPACE (U+200B)', String.fromCodePoint(0x200b)],
      ['LEFT-TO-RIGHT MARK (U+200E)', String.fromCodePoint(0x200e)],
      ['RIGHT-TO-LEFT MARK (U+200F)', String.fromCodePoint(0x200f)],
      ['WORD JOINER (U+2060)', String.fromCodePoint(0x2060)],
      ['SOFT HYPHEN (U+00AD)', String.fromCodePoint(0x00ad)],
      ['MONGOLIAN VOWEL SEPARATOR (U+180E)', String.fromCodePoint(0x180e)],
      ['ZERO WIDTH NO-BREAK SPACE / BOM (U+FEFF)', String.fromCodePoint(0xfeff)],
      ['lone COMBINING ACUTE ACCENT (U+0301)', String.fromCodePoint(0x0301)],
      ['C0 control BELL (U+0007)', String.fromCodePoint(0x0007)],
      // A mix of several invisible/control code points strung together: still nothing legible.
      [
        'mixed invisible+control run',
        String.fromCodePoint(0x200b, 0x200e, 0x00ad, 0x0007, 0x2060),
      ],
    ]

    it.each(cases)('rejects signerName == %s', (_label, ch) => {
      expect(() => renderReviewedBody({ ...BASE, signerName: ch })).toThrow(AppError)
      try {
        renderReviewedBody({ ...BASE, signerName: ch })
      } catch (e) {
        expect((e as AppError).code).toBe('AGREEMENT_SIGNER_INVALID')
      }
    })

    it.each(cases)('rejects signerRoleConfirmation == %s', (_label, ch) => {
      try {
        renderReviewedBody({ ...BASE, signerRoleConfirmation: ch })
        throw new Error('expected AGREEMENT_SIGNER_INVALID')
      } catch (e) {
        expect((e as AppError).code).toBe('AGREEMENT_SIGNER_INVALID')
      }
    })

    it('rejects a name that is otherwise real text but embeds an invisible run with no legible content added', () => {
      // The whole "name" is invisible/control characters wrapped around nothing legible.
      const invisibleOnly = String.fromCodePoint(0x200b, 0xfeff, 0x200e)
      expect(() => renderReviewedBody({ ...BASE, signerName: invisibleOnly })).toThrow(AppError)
    })
  })

  // Positive control: an honest name + role passes and hashes stably (golden-testable), proving
  // the hardening only rejects illegible values, not real ones.
  it('a normal name + role passes and hashes stably', () => {
    const first = renderReviewedBody({ ...BASE, signerName: 'Jane Q. Smith', signerRoleConfirmation: 'Owner' })
    const second = renderReviewedBody({ ...BASE, signerName: 'Jane Q. Smith', signerRoleConfirmation: 'Owner' })
    expect(first.normalizedSignerName).toBe('Jane Q. Smith')
    expect(first.normalizedSignerRole).toBe('Owner')
    expect(first.reviewedBody).toContain('Jane Q. Smith')
    expect(first.reviewedContentHash).toBe(second.reviewedContentHash)
    expect(first.reviewedContentHash).toBe(
      crypto.createHash('sha256').update(first.reviewedBody, 'utf8').digest('hex'),
    )
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
