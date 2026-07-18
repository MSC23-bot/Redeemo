'use client'

/**
 * AgreementEvidenceCard: the Merchant 360 contract / agreement evidence block
 * (D65 Slice 4, spec docs/superpowers/specs/2026-07-10-d65-in-person-signing.md
 * §8.1).
 *
 * Renders the current contract facts from the EXISTING merchant-detail `agreement`
 * block (contractStatus, signatureMethod, signedAt, contract window). No new
 * backend read is invented here.
 *
 * INTEGRATION NOTE (Slice 4 backend, not in the signing backend PR): the immutable
 * per-signing evidence ledger (MerchantAgreementRecord: agreement version, content
 * hash prefix, signer name + role, method, watermark/gated state) and the
 * short-lived presigned PDF download are served by a NET-NEW admin read
 * (getMerchantDetail `contract` block + a `contract:view-evidence` download route)
 * that this PR's backend dependency (the signing PR) does not add. Until that read
 * ships, this card presents the current-contract summary the detail payload
 * already carries and marks the richer evidence + download as pending. Wire the
 * evidence rows + presigned download here when the Slice 4 read lands.
 */
import { FileSignature, Download } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import type { BadgeTone } from '@/features/shared/Badge'
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

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  )
}

export function AgreementEvidenceCard({ agreement }: { agreement: Agreement | undefined }) {
  const pill = statusPill(agreement?.contractStatus)
  const isSigned = agreement?.contractStatus === 'SIGNED'

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

      {/* Slice 4 pending: the immutable evidence ledger (version, content-hash
          prefix, signer name + role, watermark state) and the short-lived
          presigned PDF download arrive with the net-new admin evidence read. */}
      <div className="mt-4 border-t border-border pt-4">
        <button
          type="button"
          disabled
          data-testid="agreement-download"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground"
        >
          <Download className="size-4" aria-hidden="true" />
          Download signed agreement
        </button>
        <p className="mt-1.5 text-xs text-muted-foreground">
          The signed document download and the full signing evidence (agreement version, content
          hash, signatory, and watermark state) become available with the evidence view.
        </p>
      </div>
    </section>
  )
}
