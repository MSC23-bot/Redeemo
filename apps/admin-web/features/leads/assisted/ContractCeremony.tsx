'use client'

/**
 * ContractCeremony: the D65 in-person assisted contract-signing ceremony (spec
 * docs/superpowers/specs/2026-07-10-d65-in-person-signing.md §2, steps 1-7).
 *
 * OD6 correction (owner decision 2026-07-10): the earlier "no admin signing
 * route" gate is superseded. There IS now a witnessed ceremony: the Redeemo rep
 * WITNESSES the owner's signature on the rep's device; the owner personally
 * reviews and types their full name (the signature of record). The rep is
 * recorded server-side as the witness (actorAdminId), NEVER as the signatory
 * (admin-never-signs is preserved). The click-to-agree portal/claim path stays
 * the fallback for a self-onboarding owner.
 *
 * The 7 steps, mapped to this component's phases:
 *   1 Rep pre-check         : the operator confirms the business + named signatory.
 *   2 Hand to owner         : an explicit full-panel handover; the operator cannot
 *                             proceed AS THEMSELVES past this point.
 *   3 Scroll-to-end review  : the owner reviews the agreement; the accept control
 *                             is disabled until they have scrolled to the end.
 *   4 Authority attestation : a separately-ticked "I can bind this business" +
 *                             a free-text role (signerRoleConfirmation).
 *   5 Key-terms acceptance  : the owner ticks acceptance of the enumerated terms.
 *   6 Typed-name signature  : the typed full name is the signature of record. An
 *                             optional stylus draw is deliberately OMITTED here
 *                             (see the note at KEY_TERMS): it is non-gating per
 *                             spec, and the current sign route does not persist a
 *                             drawn image, so a canvas would capture nothing.
 *   7 Timestamped confirm   : the signed evidence + a download affordance.
 *
 * LEGAL GATE (spec §6): the agreement is pending legal review (fail-closed
 * default). A persistent banner says so; the success state carries the same
 * note when the backend reports `gated: true`. NEVER state or imply solicitor
 * approval. On a production deploy while the gate is on, the sign POST returns
 * AGREEMENT_LEGAL_REVIEW_REQUIRED (403), surfaced via NamedGateBanner.
 */
import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Lock, ArrowRight, ArrowLeft, CheckCircle2, Download, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/features/shared/Badge'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { useSignAgreement } from '@/lib/agreement/useSignAgreement'
import type { SignAgreementResponse } from '@/lib/api/agreement'

// The enumerated key terms, plain English. Verbatim from the merchant portal
// path (apps/merchant-web/components/onboarding/contract/ContractAgreementForm.tsx),
// which the spec cites (step 5) as the shared key-terms set for both signing
// paths. INTEGRATION NOTE: the admin surface has no agreement-text read route
// today (the full text is served only on the merchant-scoped GET
// /merchant/onboarding/contract, which an admin session cannot call). These
// enumerated terms are the reviewable summary; the complete legal wording is
// rendered into the downloadable signed PDF and will render inline here once an
// admin-facing agreement-text read ships.
const KEY_TERMS: readonly string[] = [
  'This is a 12-month agreement between the business and Redeemo.',
  'Listing is free. The business only pays for optional featured placement and campaigns.',
  'The business agrees to honour the vouchers it publishes and to keep its information accurate.',
  'Customers redeem in person at the branch, and the team validates each redemption.',
  'Redeemo may review, suspend, or remove listings that break the rules or fall short on quality, to protect customers and merchants.',
  'Data is handled under the Redeemo Privacy Policy, and the business is responsible for its staff use of the portal.',
] as const

// ── Persistent legal-review banner (spec §6) ─────────────────────────────────────

function LegalReviewBanner() {
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      data-testid="ceremony-legal-banner"
      role="note"
    >
      <p>
        This agreement is pending legal review and is not for production signing. On staging it can
        be signed end to end for review; the signed document is watermarked until legal review is
        complete.
      </p>
    </div>
  )
}

// ── Signed confirmation (step 7) ─────────────────────────────────────────────────

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  )
}

const londonTimestampFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatSignedAt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : londonTimestampFmt.format(d)
}

function SignedConfirmation({
  result,
  signerName,
  signerRole,
  businessLegalName,
  onDone,
}: {
  result: SignAgreementResponse
  signerName: string
  signerRole: string
  businessLegalName: string
  onDone: () => void
}) {
  return (
    <div
      className="rounded-lg border border-emerald-200 bg-emerald-50 p-5"
      data-testid="ceremony-signed"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">Agreement signed by the owner</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Accepted in person on the operator&apos;s device. 12-month term.
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-4 rounded-lg border border-emerald-200 bg-card p-4 sm:grid-cols-2">
        <EvidenceRow label="Signatory" value={`${signerName} (${signerRole})`} />
        <EvidenceRow label="Business" value={businessLegalName} />
        <EvidenceRow label="Method" value="Accepted in person on the operator's device" />
        <EvidenceRow label="Signed" value={formatSignedAt(result.signedAt)} />
        <EvidenceRow label="Agreement version" value={result.agreementVersion} />
        <EvidenceRow label="Accepted by admin?" value="No: the owner's own act" />
      </dl>

      {result.gated && (
        <div
          className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          data-testid="ceremony-signed-gated"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            The signed document is watermarked as a draft pending legal review. It becomes final once
            legal review is complete.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {/* Download affordance. INTEGRATION NOTE: the presigned-PDF read is the
            Slice 4 backend (contract:view-evidence + an evidence-download route),
            not present in the signing backend PR. Until it ships, the control is
            disabled with an honest note; wire it to the presign read when Slice 4
            lands. */}
        <div>
          <Button type="button" variant="outline" disabled data-testid="ceremony-download">
            <Download className="size-4" aria-hidden="true" />
            Download signed agreement
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            The signed document download becomes available with the evidence view.
          </p>
        </div>
        <Button type="button" onClick={onDone} data-testid="ceremony-continue">
          Continue to go-live review
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

// ── The ceremony ─────────────────────────────────────────────────────────────────

interface ContractCeremonyProps {
  merchantId: string
  /** The registered business legal name the owner signs for. */
  businessLegalName: string
  /** Advance to the go-live review step once signing is confirmed. */
  onDone: () => void
}

export function ContractCeremony({ merchantId, businessLegalName, onDone }: ContractCeremonyProps) {
  const [phase, setPhase] = useState<'precheck' | 'owner'>('precheck')
  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const [authorityAttested, setAuthorityAttested] = useState(false)
  const [keyTermsAccepted, setKeyTermsAccepted] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signerRole, setSignerRole] = useState('')
  const [result, setResult] = useState<SignAgreementResponse | null>(null)

  const mutation = useSignAgreement(merchantId)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Step 3 scroll-to-end gate: if the agreement text fits without scrolling there
  // is nothing to scroll, so the gate opens immediately; otherwise it stays shut
  // until the owner reaches the end.
  useEffect(() => {
    if (phase !== 'owner') return
    const el = scrollRef.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolledToEnd(true)
  }, [phase])

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToEnd(true)
  }

  const trimmedName = signerName.trim()
  const trimmedRole = signerRole.trim()
  const canAccept =
    scrolledToEnd &&
    authorityAttested &&
    keyTermsAccepted &&
    trimmedName.length > 0 &&
    trimmedRole.length > 0 &&
    !mutation.isPending

  async function handleAccept() {
    if (!canAccept) return
    try {
      const res = await mutation.mutateAsync({
        signerName: trimmedName,
        signerRoleConfirmation: trimmedRole,
      })
      setResult(res)
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  if (result) {
    return (
      <div className="space-y-4" data-testid="contract-ceremony">
        {result.gated && <LegalReviewBanner />}
        <SignedConfirmation
          result={result}
          signerName={trimmedName}
          signerRole={trimmedRole}
          businessLegalName={businessLegalName}
          onDone={onDone}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="contract-ceremony">
      <LegalReviewBanner />

      {phase === 'precheck' ? (
        // Steps 1-2: rep pre-check + explicit hand-to-owner.
        <div
          className="rounded-lg border border-border bg-card p-5"
          data-testid="ceremony-precheck"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Redeemo Merchant Agreement</h3>
            <Badge tone="neutral">12-month term</Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            Confirm the business identity and the named signatory on screen with the owner, then hand
            the device over. The owner reviews and signs it themselves.
          </p>

          <div className="mt-4 rounded-md border border-border bg-secondary/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Signing for
            </p>
            <p className="mt-1 text-sm font-medium text-foreground" data-testid="ceremony-business-name">
              {businessLegalName}
            </p>
          </div>

          <div
            className="mt-4 flex items-start gap-2 rounded-md border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground"
            data-testid="ceremony-operator-note"
          >
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              You, the operator, cannot accept this agreement. Acceptance is the owner&apos;s own act.
              Hand the device to the owner or an authorised signatory to review and sign. You are
              recorded as the witness, never as the signatory.
            </p>
          </div>

          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={() => setPhase('owner')} data-testid="ceremony-hand-to-owner">
              Hand to the owner to review and sign
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : (
        // Steps 3-6: owner reviews, attests authority, accepts terms, types name.
        <div
          className="rounded-lg border border-primary/30 bg-card p-5"
          data-testid="ceremony-owner-panel"
        >
          <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            Owner only: the device has been handed over
          </div>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            Please review and accept your Redeemo agreement
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            You are accepting the 12-month Redeemo Merchant Agreement for{' '}
            <span className="font-medium text-foreground">{businessLegalName}</span>. Only you, the
            owner or an authorised signatory, can accept this. The rep cannot accept for you.
          </p>

          {/* Step 3: scroll-to-end review of the enumerated key terms. */}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            data-testid="ceremony-agreement-scroll"
            className="mt-4 max-h-48 overflow-auto rounded-md border border-border bg-secondary/20 p-4 text-sm text-muted-foreground"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Key terms
            </p>
            <ul className="list-disc space-y-2 pl-5">
              {KEY_TERMS.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ul>
            <p className="mt-3 border-t border-border pt-3 text-xs">
              This is the enumerated summary. The complete agreement wording is included in the signed
              document you can download after signing, and is pending final legal review.
            </p>
          </div>
          {!scrolledToEnd && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="ceremony-scroll-hint">
              Scroll to the end of the agreement to continue.
            </p>
          )}

          {/* Step 4: authority attestation + role. */}
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={authorityAttested}
                onChange={(e) => setAuthorityAttested(e.target.checked)}
                data-testid="ceremony-authority"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                I am the owner or an authorised signatory able to bind {businessLegalName} to this
                agreement.
              </span>
            </label>

            <div>
              <label
                htmlFor="ceremony-role"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Your role
              </label>
              <input
                id="ceremony-role"
                type="text"
                value={signerRole}
                onChange={(e) => setSignerRole(e.target.value)}
                placeholder="e.g. Owner, Director"
                data-testid="ceremony-role"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Step 5: enumerated key-terms acceptance. */}
            <label className="flex items-start gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={keyTermsAccepted}
                onChange={(e) => setKeyTermsAccepted(e.target.checked)}
                data-testid="ceremony-key-terms"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>I have read and accept the key terms of the Redeemo Merchant Agreement above.</span>
            </label>

            {/* Step 6: typed full name = the signature of record. */}
            <div>
              <label
                htmlFor="ceremony-name"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Your full name (your signature)
              </label>
              <input
                id="ceremony-name"
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Type your full name"
                data-testid="ceremony-name"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Your typed full name is your signature. This records your name, role, the time, this
                device, and the agreement version. The operator does not sign.
              </p>
            </div>
          </div>

          {mutation.error && (
            <div className="mt-4">
              <NamedGateBanner error={mutation.error} />
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPhase('precheck')}
              disabled={mutation.isPending}
              data-testid="ceremony-back"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Button>
            <Button
              type="button"
              onClick={handleAccept}
              disabled={!canAccept}
              data-testid="ceremony-accept"
            >
              {mutation.isPending ? 'Signing...' : 'I accept and sign the agreement'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
