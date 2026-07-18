// D65 Slice 2b + personalised-agreement rework: server-side PDF renderer for a signed
// merchant agreement.
//
// Pure JS via pdfkit (spec §7: no headless browser, no new hosted provider). ONE
// AUTHORITATIVE COMPOSITION (decision doc 2026-07-15-d65-legal-object §7): the document
// body IS the exact personalised `reviewedBody` produced by the shared reviewedBody module
// (contractual party + signatory + known-before facts already resolved). The renderer NO
// LONGER substitutes placeholders and NO LONGER re-lists the contractual facts in an
// evidence table: those live in the reviewed body exactly once. It appends exactly ONE
// "Signing evidence" block carrying ONLY the EVENT-CREATED values (final signedAt, IP,
// user-agent, the witnessing rep, and the optional drawn-signature note). So no field is
// composed twice and the two can never diverge (the pre-rework defect: the substituted
// Execution section AND a renderer table listed the same values and could diverge).
//
// pdfHash (decision doc §17) is taken by the CALLER over the exact bytes this returns, at
// upload time; this module only produces the bytes.
//
// Every page is stamped, via a buffered-page pass, with a page-identity footer (version +
// short canonical hash: document furniture, not evidence) and, when the caller marks the
// version a DRAFT (isVersionWatermarked -> `gated`), a diagonal "DRAFT - PENDING LEGAL
// REVIEW" watermark. The watermark reflects the VERSION's own legal status, NOT the
// AGREEMENT_LEGAL_REVIEW_REQUIRED env flag (a clean non-draft bound in production is never
// watermarked).
//
// LEGAL LOCK: nothing here states or implies solicitor approval.
//
// Returns a Buffer (the caller hashes it, then writes it to private R2 via putObject).

import PDFDocument from 'pdfkit'
import { methodLabel, type AgreementSignMethodValue } from './reviewedBody'

export interface RenderAgreementPdfInput {
  /** Pinned agreement version id (e.g. "2.1-draft"). */
  version: string
  /** sha256 of the canonical source (pinned into the evidence record; page-identity stamp). */
  contentHash: string
  /**
   * The exact personalised reviewed body (contractual party + signatory + known-before
   * facts already resolved by the shared reviewedBody module). Rendered verbatim as the
   * document body; the renderer does not substitute or re-list any of its fields.
   */
  reviewedBody: string
  /** Typed full name = the signature of record (used for PDF metadata only, never re-listed). */
  signerName: string
  method: AgreementSignMethodValue
  /**
   * The witnessing rep's display label for in-person signing; null on self-serve. The
   * ceremony passes the SERVER-looked-up rep identity (name + email), never client text.
   * EVENT-CREATED evidence.
   */
  witnessLabel?: string | null
  /** EVENT-CREATED evidence. */
  signedAt: Date
  ipAddress: string
  userAgent: string
  /** True => stamp the DRAFT watermark + pending-legal-review copy (from the VERSION's draft
   * status, not the env flag). */
  gated: boolean
  /** Optional stylus/finger signature PNG bytes (non-gating; embedded if present). */
  drawnSignature?: Buffer | null
}

const BRAND_RED = '#E20C04'
const NAVY = '#010C35'
const NOT_APPLICABLE_SELF_SERVE = 'Not applicable (self-serve)'
const NOT_PROVIDED = 'Not provided'

/** The DRAFT watermark / gated copy (exported so tests can pin it). */
export const DRAFT_WATERMARK_TEXT = 'DRAFT - PENDING LEGAL REVIEW'

/** London-timezone display of the signing timestamp (evidence block). */
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

/**
 * Render the signed agreement to a PDF Buffer. Deterministic-enough (no external fonts;
 * pdfkit's built-in Helvetica). Never throws for missing optional fields.
 */
export function renderAgreementPdf(input: RenderAgreementPdfInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
      // Uncompressed content streams: a text-only evidence PDF stays small, the output is
      // closer to deterministic, and the text layer is directly inspectable (unit tests pin
      // body/evidence/watermark by content scan).
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
      // Header. The version + canonical hash are part of the reviewed body's Execution
      // section (known-before facts), so they are NOT re-listed here; the header carries
      // only the document title + (when gated) the draft notice.
      doc.fillColor(NAVY).fontSize(18).font('Helvetica-Bold').text('Redeemo Merchant Agreement')
      if (input.gated) {
        doc.moveDown(0.3)
        doc.fillColor(BRAND_RED).font('Helvetica-Bold').fontSize(10)
          .text(`${DRAFT_WATERMARK_TEXT}. Not for production signing.`)
      }
      doc.moveDown(1)

      // Body: the EXACT personalised reviewed body, rendered verbatim (already substituted
      // by the shared module; no placeholder resolution or field re-listing happens here).
      doc.fillColor('#111').font('Helvetica').fontSize(10)
      doc.text(input.reviewedBody, { align: 'left', lineGap: 2 })

      // ONE signing-evidence block: ONLY the EVENT-CREATED values (§7). The contractual +
      // signatory + known-before facts are in the reviewed body above and are not repeated.
      doc.moveDown(1.5)
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text('Signing evidence')
      doc.moveDown(0.3)
      doc.fillColor('#555').font('Helvetica-Oblique').fontSize(9).text(
        'Recorded at the moment of signing. The contractual terms, the signatory, the business, ' +
          'the agreement version, its content hash, and the signing method are set out in the ' +
          'agreement body above and are not repeated here.',
      )
      doc.moveDown(0.5)
      doc.fillColor('#111').font('Helvetica').fontSize(10)
      const rows: Array<[string, string]> = [
        ['Date/time (Europe/London)', formatSignedAt(input.signedAt)],
        ['IP address', input.ipAddress],
        ['Device / user-agent', input.userAgent],
        [
          'Witnessed by (Redeemo rep)',
          input.witnessLabel ||
            (input.method === 'SELF_SERVE_CLICK' ? NOT_APPLICABLE_SELF_SERVE : NOT_PROVIDED),
        ],
      ]
      for (const [label, value] of rows) {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
        doc.font('Helvetica').text(value)
      }

      doc.moveDown(0.8)
      doc.font('Helvetica-Oblique').fillColor('#333').fontSize(9).text(
        'The typed full name in the agreement body above is the signatory\'s electronic ' +
          'signature. Where a touchscreen was available, an optional drawn signature may also ' +
          'have been captured; it does not replace the typed name as the acceptance.',
      )

      // Optional drawn signature image (non-gating, event evidence).
      if (input.drawnSignature && input.drawnSignature.length > 0) {
        try {
          doc.moveDown(0.6)
          doc.fillColor('#111').font('Helvetica-Bold').fontSize(9).text('Drawn signature:')
          doc.image(input.drawnSignature, { fit: [220, 90] })
        } catch {
          // A malformed image must never fail the render (typed name is the acceptance).
        }
      }

      // Per-page watermark (if gated) + page-identity footer, via a buffered-page pass so
      // flow is never disturbed.
      stampPages(doc, input)

      doc.end()
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

function stampPages(doc: PDFKit.PDFDocument, input: RenderAgreementPdfInput): void {
  const range = doc.bufferedPageRange()
  // Page-identity furniture only (version + short canonical hash). No event field is placed
  // in the footer, so nothing in the evidence block is duplicated here.
  const footer =
    `Redeemo Merchant Agreement ${input.version}  ·  hash ${input.contentHash.slice(0, 16)}...`
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)

    if (input.gated) {
      doc.save()
      doc.rotate(-45, { origin: [pageWidth / 2, pageHeight / 2] })
      // N3: legibility. 0.18 reads clearly as a "DRAFT" stamp without obscuring the body.
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
