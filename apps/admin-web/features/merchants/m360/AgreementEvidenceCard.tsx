'use client'

/**
 * AgreementEvidenceCard: the Merchant 360 contract / agreement evidence block
 * (D65 Slice 4 summary + lane-2 evidence read, decision doc
 * docs/superpowers/specs/2026-07-15-d65-legal-object-decision.md §11/§17).
 *
 * The card always renders the current-contract summary from the EXISTING merchant-detail
 * `agreement` block (contractStatus, method, signed date, term window). ON TOP of that, when the
 * admin holds `contract:view-evidence` and the contract is signed, it offers a "View signing
 * evidence" ACTION that loads the ORDINARY-tier evidence detail ON EXPLICIT CLICK ONLY (never
 * auto-fetched, so opening M360 does not fire the audited read). The loaded detail shows the
 * agreement version + status, the canonical + reviewed content hashes, the signatory name + role,
 * the method, the signed timestamp, and the witness NAME, plus a "Download signed PDF" button that
 * hits the SERVER-PROXIED pdf route (a normal authenticated download, NOT a presigned link).
 *
 * WITHHELD tier (§11): witnessEmail / ipAddress / userAgent are never in the payload and are never
 * shown here (reserved for a future separately-gated legal-export surface). The copy never states
 * or implies solicitor approval (owner-locked framing).
 */
import { useState } from 'react'
import { FileSignature, Download, ShieldCheck, Loader2 } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import type { BadgeTone } from '@/features/shared/Badge'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { agreementApi } from '@/lib/api/agreement'
import { useAgreementEvidence } from '@/lib/agreement/useAgreementEvidence'
import type { Agreement } from '@/lib/api/merchants'

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Not recorded'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'Not recorded' : dateTimeFmt.format(d)
}
function formatDate(iso: string | null): string {
  if (!iso) return 'Not set'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'Not set' : dateFmt.format(d)
}

function statusPill(status: string | undefined): { label: string; tone: BadgeTone } {
  if (status === 'SIGNED') return { label: 'Signed', tone: 'success' }
  if (status === 'NOT_SIGNED') return { label: 'Not signed', tone: 'warn' }
  return { label: status ?? 'Unknown', tone: 'neutral' }
}

// Prettify the signature-method enum for display.
function methodLabel(method: string | null): string {
  if (!method) return 'Not recorded'
  if (method === 'CLICK_TO_AGREE') return 'Click to agree'
  if (method === 'ZOHO_SIGN') return 'Zoho Sign'
  const words = method.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// The download surfaces STORAGE_NOT_ENABLED (shared copy is document-upload-specific), so give it
// download-appropriate wording here without changing its meaning elsewhere.
const EVIDENCE_ERROR_OVERRIDES: Record<string, string> = {
  STORAGE_NOT_ENABLED:
    'The signed PDF is not available because document storage is not enabled yet. Please try again later or contact support.',
  EVIDENCE_NOT_FOUND:
    'No signing-evidence record was found for this merchant. If the contract was accepted through the older self-serve flow, a full evidence record may not exist.',
  AGREEMENT_EVIDENCE_INTEGRITY_FAILURE:
    'The stored signed agreement could not be verified, so it was not released. This has been flagged for reconciliation; please contact support.',
  AGREEMENT_EVIDENCE_RATE_LIMITED:
    'Too many evidence requests. Please wait a moment and try again.',
}

function EvidenceRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm text-foreground${mono ? ' break-all font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

interface AgreementEvidenceCardProps {
  agreement: Agreement | undefined
  /** The merchant whose evidence this card reads (the M360 subject). */
  merchantId: string
  /** UI gate mirror of contract:view-evidence (OPERATIONS + SUPER_ADMIN). */
  canViewEvidence: boolean
}

export function AgreementEvidenceCard({ agreement, merchantId, canViewEvidence }: AgreementEvidenceCardProps) {
  const pill = statusPill(agreement?.contractStatus)
  const isSigned = agreement?.contractStatus === 'SIGNED'

  // Load-on-click: the evidence read is disabled until the admin explicitly requests it, so opening
  // M360 never auto-fetches (or audits) the evidence.
  const [requested, setRequested] = useState(false)
  const evidence = useAgreementEvidence(merchantId, requested)

  // The download is a plain one-shot handler (no react-query) so the card carries no QueryClient
  // dependency of its own. A normal authenticated download: the server-proxied bytes are turned
  // into a client-side download; no presigned URL is ever involved (decision doc §17).
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<unknown>(null)

  async function handleDownload() {
    setDownloading(true)
    setDownloadError(null)
    try {
      const blob = await agreementApi.downloadEvidencePdf(merchantId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `signed-agreement-${merchantId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setDownloadError(err)
    } finally {
      setDownloading(false)
    }
  }

  const showEvidenceAction = canViewEvidence && isSigned

  return (
    <section
      className="rounded-lg border border-border bg-card p-4"
      data-testid="agreement-evidence-card"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <FileSignature className="size-4" aria-hidden="true" />
          Contract and agreement
        </h2>
        <Badge tone={pill.tone}>{pill.label}</Badge>
      </div>

      {isSigned ? (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2" data-testid="agreement-evidence-facts">
          <EvidenceRow label="Signed" value={formatDateTime(agreement?.signedAt ?? null)} />
          <EvidenceRow label="Method" value={methodLabel(agreement?.signatureMethod ?? null)} />
          <EvidenceRow label="Term starts" value={formatDate(agreement?.contractStartDate ?? null)} />
          <EvidenceRow label="Term ends" value={formatDate(agreement?.contractEndDate ?? null)} />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="agreement-evidence-unsigned">
          This merchant has not signed the 12-month agreement yet. Signing happens in the assisted
          onboarding contract step (in person) or through the owner&apos;s Merchant Portal
          claim/setup link.
        </p>
      )}

      {/* D65 lane-2: the signing-evidence read, gated on contract:view-evidence + a signed
          contract. Loaded on EXPLICIT click only (never auto-fetched). */}
      {showEvidenceAction && (
        <div className="mt-4 border-t border-border pt-4">
          {!requested ? (
            <button
              type="button"
              onClick={() => setRequested(true)}
              data-testid="agreement-view-evidence"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              View signing evidence
            </button>
          ) : evidence.isFetching && !evidence.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="agreement-evidence-loading">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading signing evidence...
            </div>
          ) : evidence.isError ? (
            <NamedGateBanner error={evidence.error} overrides={EVIDENCE_ERROR_OVERRIDES} />
          ) : evidence.data ? (
            <div data-testid="agreement-evidence-detail">
              {evidence.data.gated && (
                <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="agreement-evidence-draft">
                  This agreement version is a draft and is pending legal review.
                </p>
              )}
              <dl className="grid gap-4 sm:grid-cols-2">
                <EvidenceRow label="Agreement version" value={evidence.data.agreementVersion} />
                <EvidenceRow label="Method" value={methodLabel(evidence.data.method)} />
                <EvidenceRow label="Signatory" value={evidence.data.signerName} />
                <EvidenceRow label="Signatory role" value={evidence.data.signerRoleConfirmation} />
                <EvidenceRow label="Signed" value={formatDateTime(evidence.data.signedAt)} />
                <EvidenceRow label="Witness" value={evidence.data.witnessName ?? 'None (self-serve)'} />
                <EvidenceRow label="Canonical content hash" value={evidence.data.contentHash} mono />
                <EvidenceRow label="Reviewed content hash" value={evidence.data.reviewedContentHash} mono />
              </dl>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  data-testid="agreement-evidence-download"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloading ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="size-4" aria-hidden="true" />
                  )}
                  Download signed PDF
                </button>
                {downloadError != null && (
                  <div className="mt-3">
                    <NamedGateBanner error={downloadError} overrides={EVIDENCE_ERROR_OVERRIDES} />
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
