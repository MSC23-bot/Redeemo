import { describe, it, expect } from 'vitest'
import {
  renderAgreementPdf,
  substitutePlaceholders,
  formatSignedAt,
  DRAFT_WATERMARK_TEXT,
  type RenderAgreementPdfInput,
} from '../../../src/api/merchant/agreement/pdf'

// D65 Slice 2b renderer suite. The renderer writes UNCOMPRESSED content streams
// (compress: false), so the text layer is directly inspectable: content-contains
// pins on the decoded buffer (no golden files). The watermark tests use a SHORT
// synthetic agreement body - the real draft artifact itself contains the words
// "PENDING LEGAL REVIEW" in its header, which would make an absence assertion
// vacuous against the real content.

const SIGNED_AT = new Date('2026-07-14T10:30:00.000Z')

function baseInput(overrides: Partial<RenderAgreementPdfInput> = {}): RenderAgreementPdfInput {
  return {
    version: '2.0-draft',
    contentHash: 'a'.repeat(24) + 'b'.repeat(40),
    content: 'Short synthetic agreement body for renderer tests. Signed by {{signerName}} for {{businessLegalName}}.',
    signerName: 'Priya Nair',
    signerRoleConfirmation: 'Owner',
    businessLegalName: 'Kovalam Tandoori Ltd',
    tradingName: 'Kovalam Tandoori',
    companyNumber: '01234567',
    vatNumber: 'GB999999973',
    method: 'IN_PERSON_ASSISTED',
    witnessLabel: 'Redeemo rep (ops)',
    signedAt: SIGNED_AT,
    ipAddress: '203.0.113.9',
    userAgent: 'RedeemoRepTablet/1.0',
    gated: true,
    ...overrides,
  }
}

// pdfkit (compress: false) writes text as HEX chunks inside `[...] TJ` arrays,
// with kerning numbers splitting runs mid-word (e.g. <4d6572> 20 <63> = "Mer"+"c").
// Decode every hex chunk and rejoin: chunks within one TJ concatenate directly
// (kern values are spacing, not characters); TJ groups join with a newline (one
// per rendered line). `squash` additionally joins EVERYTHING with no separator so
// a long unbroken token (the 64-char hash) survives a mid-word line wrap.
function extractText(buf: Buffer): string {
  const s = buf.toString('latin1')
  const lines: string[] = []
  const tjRe = /\[(.*?)\]\s*TJ/gs
  let m: RegExpExecArray | null
  while ((m = tjRe.exec(s))) {
    let text = ''
    const hexRe = /<([0-9a-fA-F]+)>/g
    let h: RegExpExecArray | null
    while ((h = hexRe.exec(m[1]))) {
      const hex = h[1]
      for (let i = 0; i + 1 < hex.length; i += 2) {
        text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
      }
    }
    lines.push(text)
  }
  return lines.join('\n')
}
const decode = extractText
const squash = (buf: Buffer) => extractText(buf).replace(/\n/g, '')

describe('renderAgreementPdf', () => {
  it('returns a non-empty PDF buffer', async () => {
    const pdf = await renderAgreementPdf(baseInput())
    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(pdf.length).toBeGreaterThan(1000)
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })

  it('footer/evidence stamps version + full hash + signer in the text layer', async () => {
    const input = baseInput()
    const pdf = await renderAgreementPdf(input)
    const text = decode(pdf)
    expect(text).toContain(input.version)
    // The full 64-char hash may wrap mid-token: assert on the squashed text.
    expect(squash(pdf)).toContain(input.contentHash)
    expect(text).toContain('Priya Nair')
    expect(text).toContain('Kovalam Tandoori Ltd')
    expect(text).toContain('Execution and evidence')
  })

  it('stamps the DRAFT watermark while gated', async () => {
    const text = decode(await renderAgreementPdf(baseInput({ gated: true })))
    // The header line carries the exact phrase in one text run at body size.
    expect(text).toContain('DRAFT')
    expect(text).toContain('PENDING LEGAL REVIEW')
    expect(text).toContain('Not for production signing')
  })

  it('omits the watermark + gated copy when the gate is off', async () => {
    const text = decode(await renderAgreementPdf(baseInput({ gated: false })))
    expect(text).not.toContain('PENDING LEGAL REVIEW')
    expect(text).not.toContain('Not for production signing')
  })

  it('self-serve render marks the witness row not-applicable', async () => {
    const text = decode(
      await renderAgreementPdf(baseInput({ method: 'SELF_SERVE_CLICK', witnessLabel: null })),
    )
    expect(text).toContain('Not applicable (self-serve)')
    expect(text).toContain('click-to-agree')
  })

  it('never fails on a malformed drawn-signature image (typed name is the acceptance)', async () => {
    const pdf = await renderAgreementPdf(
      baseInput({ drawnSignature: Buffer.from('not-a-real-png') }),
    )
    expect(pdf.length).toBeGreaterThan(1000)
  })
})

describe('substitutePlaceholders', () => {
  it('substitutes the execution placeholders for display', () => {
    const out = substitutePlaceholders(
      'By {{signerName}} ({{signerRoleConfirmation}}) for {{businessLegalName}} v{{agreementVersion}} hash {{contentHash}}',
      baseInput(),
    )
    expect(out).toBe(
      `By Priya Nair (Owner) for Kovalam Tandoori Ltd v2.0-draft hash ${'a'.repeat(24) + 'b'.repeat(40)}`,
    )
  })

  it('missing optional identity fields render as "Not provided", never undefined', () => {
    const out = substitutePlaceholders(
      'Company {{companyNumber}} VAT {{vatNumber}} trading {{tradingName}}',
      baseInput({ companyNumber: null, vatNumber: null, tradingName: null }),
    )
    expect(out).toBe('Company Not provided VAT Not provided trading Not provided')
    expect(out).not.toContain('undefined')
  })

  it('leaves unknown placeholders untouched (no prototype-chain lookup)', () => {
    const out = substitutePlaceholders('{{unknownField}} and {{constructor}}', baseInput())
    expect(out).toBe('{{unknownField}} and {{constructor}}')
  })
})

describe('formatSignedAt', () => {
  it('renders Europe/London local time (BST for a July instant)', () => {
    // 10:30 UTC on 2026-07-14 is 11:30 in London (BST, UTC+1).
    const label = formatSignedAt(SIGNED_AT)
    expect(label).toContain('14 July 2026')
    expect(label).toContain('11:30')
  })
})

describe('DRAFT_WATERMARK_TEXT (legal-copy lock)', () => {
  it('is the exact spec phrase and never claims approval', () => {
    expect(DRAFT_WATERMARK_TEXT).toBe('DRAFT - PENDING LEGAL REVIEW')
    expect(DRAFT_WATERMARK_TEXT.toLowerCase()).not.toContain('approved')
  })
})
