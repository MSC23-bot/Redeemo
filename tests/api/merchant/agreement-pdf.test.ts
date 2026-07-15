import { describe, it, expect } from 'vitest'
import {
  renderAgreementPdf,
  formatSignedAt,
  DRAFT_WATERMARK_TEXT,
  type RenderAgreementPdfInput,
} from '../../../src/api/merchant/agreement/pdf'

// D65 Slice 2b + personalised-agreement renderer suite. The renderer writes UNCOMPRESSED
// content streams (compress: false), so the text layer is directly inspectable: content-
// contains pins on the decoded buffer (no golden files). The renderer now renders the exact
// personalised `reviewedBody` (already substituted by the shared module) plus ONE
// event-evidence block; it no longer substitutes placeholders and no longer re-lists the
// contractual facts in an evidence table (decision doc §7).

const SIGNED_AT = new Date('2026-07-14T10:30:00.000Z')

// A distinctive synthetic reviewed body: the shared module produces the real one, so here we
// only need a body whose presence + absence of duplication is checkable.
const REVIEWED_BODY =
  'PERSONALISED-BODY-START. Signatory full name (typed): Priya Nair. Role / authority: Owner. ' +
  'Business: Kovalam Tandoori Ltd. Agreement version: 2.1-draft. Signing method: In-person ' +
  'assisted (Redeemo representative device). PERSONALISED-BODY-END.'

function baseInput(overrides: Partial<RenderAgreementPdfInput> = {}): RenderAgreementPdfInput {
  return {
    version: '2.1-draft',
    contentHash: 'a'.repeat(24) + 'b'.repeat(40),
    reviewedBody: REVIEWED_BODY,
    signerName: 'Priya Nair',
    method: 'IN_PERSON_ASSISTED',
    witnessLabel: 'Sam Rep (sam.rep@redeemo.com)',
    signedAt: SIGNED_AT,
    ipAddress: '203.0.113.9',
    userAgent: 'RedeemoRepTablet/1.0',
    gated: true,
    ...overrides,
  }
}

// pdfkit (compress: false) writes text as HEX chunks inside `[...] TJ` arrays, with kerning
// numbers splitting runs mid-word. Decode every hex chunk and rejoin: chunks within one TJ
// concatenate directly (kern values are spacing, not characters); TJ groups join with a
// newline. `squash` additionally joins EVERYTHING with no separator so a long unbroken token
// survives a mid-word line wrap.
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

  it('renders the personalised reviewedBody verbatim as the document body', async () => {
    const text = squash(await renderAgreementPdf(baseInput()))
    expect(text).toContain('PERSONALISED-BODY-START')
    expect(text).toContain('PERSONALISED-BODY-END')
    expect(text).toContain('Priya Nair')
    expect(text).toContain('Kovalam Tandoori Ltd')
  })

  it('appends ONE signing-evidence block with ONLY event-created values (no contractual re-listing)', async () => {
    const text = decode(await renderAgreementPdf(baseInput()))
    const squashed = squash(await renderAgreementPdf(baseInput()))
    // The single evidence block header + the event fields.
    expect(text).toContain('Signing evidence')
    expect(text).toContain('IP address')
    expect(text).toContain('Device / user-agent')
    expect(text).toContain('203.0.113.9')
    expect(text).toContain('RedeemoRepTablet/1.0')
    expect(squashed).toContain('Sam Rep (sam.rep@redeemo.com)')
    expect(text).toContain('11:30') // London-local signing timestamp
    // The renderer STOPPED composing the old duplicate evidence TABLE of contractual facts:
    // the pre-rework labels are gone (those facts live in the reviewedBody exactly once).
    expect(text).not.toContain('Execution and evidence')
    expect(text).not.toContain('Content hash (sha256)')
    expect(text).not.toContain('Signatory (typed full name)')
    expect(text).not.toContain('Business (legal name)')
  })

  it('stamps the DRAFT watermark while gated', async () => {
    const text = decode(await renderAgreementPdf(baseInput({ gated: true })))
    expect(text).toContain('DRAFT')
    expect(text).toContain('PENDING LEGAL REVIEW')
    expect(text).toContain('Not for production signing')
  })

  it('omits the watermark + gated copy when the gate is off', async () => {
    const text = decode(await renderAgreementPdf(baseInput({ gated: false })))
    expect(text).not.toContain('PENDING LEGAL REVIEW')
    expect(text).not.toContain('Not for production signing')
  })

  it('N3: the gated watermark uses the raised 0.18 fill opacity (legible), absent when ungated', async () => {
    const gated = (await renderAgreementPdf(baseInput({ gated: true }))).toString('latin1')
    expect(/\/ca\s+0\.18/.test(gated)).toBe(true)
    const ungated = (await renderAgreementPdf(baseInput({ gated: false }))).toString('latin1')
    expect(/\/ca\s+0\.18/.test(ungated)).toBe(false)
  })

  it('N3: the watermark is present on every page of a multi-page gated document', async () => {
    const longBody = Array.from(
      { length: 60 },
      (_, i) => `Clause ${i + 1}. Agreement body line forcing the document to span multiple pages.`,
    ).join('\n')
    const pdf = await renderAgreementPdf(baseInput({ gated: true, reviewedBody: longBody }))
    const squashed = squash(pdf)
    // The page-identity footer stamps the 16-char hash prefix once per page (footer only; the
    // body here contains no such run), so it counts pages.
    const hashPrefix = 'a'.repeat(16)
    const pageCount = (squashed.match(new RegExp(hashPrefix, 'g')) ?? []).length
    const watermarkHits = (squashed.match(/DRAFT - PENDING LEGAL REVIEW/g) ?? []).length
    expect(pageCount).toBeGreaterThan(1) // genuinely multi-page
    expect(watermarkHits).toBe(pageCount + 1) // one stamp per page + the page-1 header notice
  })

  it('self-serve render marks the witness row not-applicable', async () => {
    const text = decode(
      await renderAgreementPdf(baseInput({ method: 'SELF_SERVE_CLICK', witnessLabel: null })),
    )
    expect(text).toContain('Not applicable (self-serve)')
  })

  it('never fails on a malformed drawn-signature image (typed name is the acceptance)', async () => {
    const pdf = await renderAgreementPdf(
      baseInput({ drawnSignature: Buffer.from('not-a-real-png') }),
    )
    expect(pdf.length).toBeGreaterThan(1000)
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
