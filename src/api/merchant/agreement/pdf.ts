// D65 Slice 2b: server-side PDF renderer for a signed merchant agreement.
//
// Pure JS via pdfkit (spec §7: no headless browser, no new hosted provider). The
// function renders the canonical agreement source (placeholders substituted with the
// signer/merchant data for DISPLAY only - the pinned contentHash is always computed
// over the UNSUBSTITUTED registry source, so substitution here never affects the
// hash), followed by an execution/evidence block. Every page is stamped, via a
// buffered-page pass, with a footer (version + hash + signer + timestamp) and, while
// the legal gate is on, a diagonal "DRAFT - PENDING LEGAL REVIEW" watermark.
//
// LEGAL LOCK: nothing here states or implies solicitor approval. While `gated` the
// watermark is present and the confirmation copy stays "pending legal review".
//
// Returns a Buffer (the caller writes it to private R2 via storage.putObject).

import PDFDocument from 'pdfkit'

export interface RenderAgreementPdfInput {
  /** Pinned agreement version id (e.g. "2.0-draft"). */
  version: string
  /** sha256 of the canonical source (pinned into the evidence record). */
  contentHash: string
  /** The canonical agreement source (markdown) rendered into the body. */
  content: string
  /** Typed full name = the signature of record. */
  signerName: string
  /** Authority attestation role (e.g. "Owner", "Director"). */
  signerRoleConfirmation: string
  /** The merchant's registered / legal business name. */
  businessLegalName: string
  tradingName?: string | null
  companyNumber?: string | null
  vatNumber?: string | null
  method: 'IN_PERSON_ASSISTED' | 'SELF_SERVE_CLICK'
  /** The witnessing rep's display label for in-person signing; null on self-serve. */
  witnessLabel?: string | null
  signedAt: Date
  ipAddress: string
  userAgent: string
  /** True => stamp the DRAFT watermark + pending-legal-review copy (gate on). */
  gated: boolean
  /** Optional stylus/finger signature PNG bytes (non-gating; embedded if present). */
  drawnSignature?: Buffer | null
}

const BRAND_RED = '#E20C04'
const NAVY = '#010C35'
const NOT_PROVIDED = 'Not provided'

/** The DRAFT watermark / gated copy (exported so tests can pin it). */
export const DRAFT_WATERMARK_TEXT = 'DRAFT - PENDING LEGAL REVIEW'

/** London-timezone display of the signing timestamp (evidence + confirmation copy). */
export function formatSignedAt(when: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(when)
  } catch {
    return when.toISOString()
  }
}

function methodLabel(method: RenderAgreementPdfInput['method']): string {
  return method === 'IN_PERSON_ASSISTED'
    ? 'In-person assisted (Redeemo representative device)'
    : 'Self-serve (merchant portal click-to-agree)'
}

/**
 * Substitute the agreement template placeholders with the signing data for DISPLAY.
 * The pinned contentHash is computed elsewhere over the UNSUBSTITUTED source, so this
 * is presentation only and never changes the hash. Exported for unit tests.
 */
export function substitutePlaceholders(source: string, input: RenderAgreementPdfInput): string {
  const map: Record<string, string> = {
    businessLegalName: input.businessLegalName,
    tradingName: input.tradingName || NOT_PROVIDED,
    companyNumber: input.companyNumber || NOT_PROVIDED,
    vatNumber: input.vatNumber || NOT_PROVIDED,
    signerName: input.signerName,
    signerRoleConfirmation: input.signerRoleConfirmation,
    agreementVersion: input.version,
    contentHash: input.contentHash,
    signedAt: formatSignedAt(input.signedAt),
    method: methodLabel(input.method),
    actorAdminName: input.witnessLabel || NOT_PROVIDED,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  }
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, key: string) =>
    Object.hasOwn(map, key) ? map[key] : whole,
  )
}

/**
 * Render the signed agreement to a PDF Buffer. Deterministic-enough (no external
 * fonts; pdfkit's built-in Helvetica). Never throws for missing optional fields.
 */
export function renderAgreementPdf(input: RenderAgreementPdfInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
      // Uncompressed content streams: a text-only evidence PDF stays small, the
      // output is closer to deterministic, and the text layer is directly
      // inspectable (unit tests pin version/hash/signer/watermark by content scan).
      compress: false,
      info: {
        Title: `Redeemo Merchant Agreement ${input.version}`,
        Author: 'Redeemo',
        Subject: `Signed by ${input.signerName}`,
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    try {
      // Header.
      doc.fillColor(NAVY).fontSize(18).font('Helvetica-Bold').text('Redeemo Merchant Agreement')
      doc.moveDown(0.3)
      doc.fillColor('#444').fontSize(10).font('Helvetica')
        .text(`Version ${input.version}   ·   Content hash ${input.contentHash}`)
      if (input.gated) {
        doc.moveDown(0.3)
        doc.fillColor(BRAND_RED).font('Helvetica-Bold').fontSize(10)
          .text(`${DRAFT_WATERMARK_TEXT}. Not for production signing.`)
      }
      doc.moveDown(1)

      // Body: the agreement source with placeholders substituted for display.
      doc.fillColor('#111').font('Helvetica').fontSize(10)
      doc.text(substitutePlaceholders(input.content, input), { align: 'left', lineGap: 2 })

      // Evidence / execution block.
      doc.moveDown(1.5)
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text('Execution and evidence')
      doc.moveDown(0.5)
      doc.fillColor('#111').font('Helvetica').fontSize(10)
      const rows: Array<[string, string]> = [
        ['Signatory (typed full name)', input.signerName],
        ['Role / authority', input.signerRoleConfirmation],
        ['Business (legal name)', input.businessLegalName],
        ['Trading name', input.tradingName || NOT_PROVIDED],
        ['Company number', input.companyNumber || NOT_PROVIDED],
        ['VAT number', input.vatNumber || NOT_PROVIDED],
        ['Agreement version', input.version],
        ['Content hash (sha256)', input.contentHash],
        ['Signing method', methodLabel(input.method)],
        ['Witnessed by (Redeemo rep)', input.witnessLabel || (input.method === 'SELF_SERVE_CLICK' ? 'Not applicable (self-serve)' : NOT_PROVIDED)],
        ['Date/time (Europe/London)', formatSignedAt(input.signedAt)],
        ['IP address', input.ipAddress],
        ['Device / user-agent', input.userAgent],
      ]
      for (const [label, value] of rows) {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
        doc.font('Helvetica').text(value)
      }

      doc.moveDown(0.8)
      doc.font('Helvetica-Oblique').fillColor('#333').fontSize(9).text(
        'The typed full name above is the signatory\'s electronic signature. Where a ' +
          'touchscreen was available, an optional drawn signature may also have been ' +
          'captured; it does not replace the typed name as the acceptance.',
      )

      // Optional drawn signature image (non-gating).
      if (input.drawnSignature && input.drawnSignature.length > 0) {
        try {
          doc.moveDown(0.6)
          doc.fillColor('#111').font('Helvetica-Bold').fontSize(9).text('Drawn signature:')
          doc.image(input.drawnSignature, { fit: [220, 90] })
        } catch {
          // A malformed image must never fail the render (typed name is the acceptance).
        }
      }

      // Per-page watermark (if gated) + footer, via a buffered-page pass so flow is
      // never disturbed.
      stampPages(doc, input)

      doc.end()
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

function stampPages(doc: PDFKit.PDFDocument, input: RenderAgreementPdfInput): void {
  const range = doc.bufferedPageRange()
  const footer =
    `Redeemo Merchant Agreement ${input.version}  ·  hash ${input.contentHash.slice(0, 16)}...  ` +
    `·  signed by ${input.signerName}  ·  ${formatSignedAt(input.signedAt)}`
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)

    if (input.gated) {
      doc.save()
      doc.rotate(-45, { origin: [pageWidth / 2, pageHeight / 2] })
      // N3: legibility. 0.18 reads clearly as a "DRAFT" stamp without obscuring the body
      // (the prior 0.1 was near-invisible on screen + in print).
      doc.fillColor(BRAND_RED).opacity(0.18).font('Helvetica-Bold').fontSize(56)
      doc.text(DRAFT_WATERMARK_TEXT, 0, pageHeight / 2 - 28, {
        width: pageWidth,
        align: 'center',
      })
      doc.restore()
      doc.opacity(1)
    }

    // Footer at the bottom margin.
    doc.save()
    doc.fillColor('#666').opacity(1).font('Helvetica').fontSize(7)
    doc.text(footer, 50, pageHeight - 35, { width: pageWidth - 100, align: 'center', lineBreak: false })
    doc.restore()
  }
  doc.flushPages()
}
