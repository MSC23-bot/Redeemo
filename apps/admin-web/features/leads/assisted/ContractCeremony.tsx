'use client'

/**
 * ContractCeremony: the D65 in-person assisted contract-signing ceremony, reworked to the
 * PERSONALISED-agreement contract (decision doc 2026-07-15-d65-legal-object).
 *
 * WHAT THE OWNER REVIEWS + SIGNS is the merchant-PERSONALISED contractual body (party +
 * signatory + known-before facts resolved), not the raw template. The lifecycle:
 *
 *   1 Rep pre-check      : the operator confirms the business + hands the device over. The
 *                          operator can never accept AS THEMSELVES (they are the witness).
 *   2 Signer identity    : the owner types their full name (the signature of record) + role.
 *                          These are contractual inputs to the body, so they are entered FIRST.
 *   3 Generate + review  : a POST preview renders the personalised body server-side (signer
 *                          PII in the body, never a URL/query). The owner reviews the COMPLETE
 *                          personalised body with an honest scroll-to-end gate over it.
 *   4 Attest + accept    : authority attestation + key-terms acceptance.
 *   5 Pre-sign NOTICE    : a SEPARATE notice of what signing evidence will be recorded
 *                          (date/time, IP, device, witnessing rep) shown as WILL-BE-recorded,
 *                          never as completed facts.
 *   6 Sign               : echoes the reviewed version + the server-authoritative
 *                          reviewedContentHash. The backend re-derives + compares.
 *   7 Confirm            : the signed evidence + a pointer to the Merchant 360 summary.
 *
 * INVALIDATION (decision doc §4): changing ANY contractual input (signer name / role) clears
 * the previewed body + resets the scroll + acceptance gates, so the owner must regenerate and
 * re-review. The body cannot be signed unless it was generated from the CURRENT inputs.
 *
 * STALE (decision doc §10): a sign that returns AGREEMENT_REVIEW_HASH_MISMATCH (a contractual
 * input changed since review, or a tampered echo) or AGREEMENT_VERSION_MISMATCH (template
 * drift) FORCES a reload + re-review: the previewed body + gates are cleared and the owner
 * must regenerate the current body and re-accept. The backend 409 is the fail-closed backstop
 * regardless of what the UI shows; the ceremony never silently re-signs.
 *
 * LEGAL GATE (decision doc §6): while the presented version is a draft the preview reports
 * gated: true and a banner says the agreement is pending legal review; the success state
 * carries the same note when the sign response reports gated: true. NEVER state or imply
 * solicitor approval. On a production deploy while the gate is on, the sign POST returns
 * AGREEMENT_LEGAL_REVIEW_REQUIRED (403) via NamedGateBanner.
 */
import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Lock, ArrowRight, ArrowLeft, CheckCircle2, Download, Info, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/features/shared/Badge'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { useSignAgreement } from '@/lib/agreement/useSignAgreement'
import { useAgreementPreview } from '@/lib/agreement/useAgreementPreview'
import { ApiError } from '@/lib/api/client'
import type { SignAgreementResponse, AgreementPreviewResponse } from '@/lib/api/agreement'

// The enumerated key terms, plain English, shown as a reviewable SUMMARY above the full
// personalised agreement body (which is fetched and rendered IN FULL with the scroll gate over
// it). Keep this SET OF SIX aligned with the merchant portal's list when either side changes.
const KEY_TERMS: readonly string[] = [
  'This is a 12 month agreement between the business and Redeemo.',
  'Listing is free. The business only pays for optional featured placement and campaigns.',
  'The business agrees to honour the vouchers it publishes and to keep its information accurate.',
  'Customers redeem in person at the branch, and the team validates each redemption.',
  'Redeemo may review, suspend, or remove listings that break the rules or fall short on quality, to protect customers and merchants.',
  'Data is handled under the Redeemo Privacy Policy, and the business is responsible for its staff use of the portal.',
] as const

// ── Persistent legal-review banner (decision doc §6) ────────────────────────────
// Driven by the preview's own status (gated), never hardcoded. NEVER states solicitor approval.
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
        {/* Signed-state copy points ONLY to the contract summary the merchant's record
            (Merchant 360) already carries. The full signed-document download is the separate
            lane-2 evidence read, not built here, so the button stays disabled with honest copy. */}
        <div>
          <Button type="button" variant="outline" disabled data-testid="ceremony-download">
            <Download className="size-4" aria-hidden="true" />
            Download signed agreement
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            The contract summary (status, method, signed date, and term window) is on the merchant&apos;s
            record under Merchant 360. The full signed-document download follows with the evidence view.
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

// ── Pre-sign evidence NOTICE (decision doc §2) ───────────────────────────────────
// Lists WHAT WILL BE recorded at signing; deliberately NOT shown as completed facts.
function PreSignEvidenceNotice() {
  return (
    <div
      className="mt-4 flex items-start gap-2 rounded-md border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground"
      data-testid="ceremony-presign-notice"
      role="note"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium text-foreground">When you sign, we will record the following signing evidence:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>the date and time of signing</li>
          <li>the IP address and this device</li>
          <li>the witnessing Redeemo representative</li>
        </ul>
        <p className="mt-1">
          These are recorded as evidence of the signing event at the moment you sign. They are not
          part of the agreement terms above.
        </p>
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
  const [signerName, setSignerName] = useState('')
  const [signerRole, setSignerRole] = useState('')
  // The currently-previewed personalised body + its server-authoritative hash. Cleared whenever
  // a contractual input changes (invalidation) or a stale sign forces a re-review.
  const [preview, setPreview] = useState<AgreementPreviewResponse | null>(null)
  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const [authorityAttested, setAuthorityAttested] = useState(false)
  const [keyTermsAccepted, setKeyTermsAccepted] = useState(false)
  // A forced re-review notice: 'reviewHash' (a contractual input changed / tampered echo) or
  // 'version' (template drift). Both force regenerate + re-review before signing.
  const [staleNotice, setStaleNotice] = useState<'reviewHash' | 'version' | null>(null)
  const [result, setResult] = useState<SignAgreementResponse | null>(null)

  const previewMutation = useAgreementPreview(merchantId)
  const signMutation = useSignAgreement(merchantId)
  const scrollRef = useRef<HTMLDivElement>(null)

  const trimmedName = signerName.trim()
  const trimmedRole = signerRole.trim()

  function resetAcceptanceGates() {
    setScrolledToEnd(false)
    setAuthorityAttested(false)
    setKeyTermsAccepted(false)
  }

  // Full owner-state reset (hand-to-owner + Back): clears identity, the previewed body, all
  // gates, and any stale notice, so a second owner never inherits the first owner's state.
  function resetOwnerState() {
    setSignerName('')
    setSignerRole('')
    setPreview(null)
    resetAcceptanceGates()
    setStaleNotice(null)
  }

  // INVALIDATION: any change to a contractual input invalidates the previewed body (its hash no
  // longer matches the inputs) and resets the review + acceptance gates, so the owner must
  // regenerate + re-review before signing.
  function onSignerNameChange(value: string) {
    setSignerName(value)
    if (preview) setPreview(null)
    resetAcceptanceGates()
  }
  function onSignerRoleChange(value: string) {
    setSignerRole(value)
    if (preview) setPreview(null)
    resetAcceptanceGates()
  }

  const canGenerate = trimmedName.length > 0 && trimmedRole.length > 0 && !previewMutation.isPending

  async function generatePreview() {
    if (!canGenerate) return
    setStaleNotice(null)
    try {
      const res = await previewMutation.mutateAsync({
        signerName: trimmedName,
        signerRoleConfirmation: trimmedRole,
      })
      resetAcceptanceGates()
      setPreview(res)
    } catch {
      // Preview errors (rate limit, capability, pre-live scope) surface via NamedGateBanner.
    }
  }

  // Step 3 scroll-to-end gate: if the full personalised body fits without scrolling there is
  // nothing to scroll, so the gate opens immediately; otherwise it stays shut until the owner
  // reaches the end. Re-evaluated when a new body is previewed.
  useEffect(() => {
    if (phase !== 'owner' || !preview) return
    const el = scrollRef.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolledToEnd(true)
  }, [phase, preview])

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToEnd(true)
  }

  const canSign =
    !!preview &&
    scrolledToEnd &&
    authorityAttested &&
    keyTermsAccepted &&
    !signMutation.isPending

  async function handleAccept() {
    if (!canSign || !preview) return
    try {
      const res = await signMutation.mutateAsync({
        signerName: trimmedName,
        signerRoleConfirmation: trimmedRole,
        // Echo the EXACT version + hash the owner reviewed. Binds display == evidence; a stale
        // echo is refused (409) rather than silently signed.
        agreementVersion: preview.version,
        reviewedContentHash: preview.reviewedContentHash,
      })
      setResult(res)
    } catch (err) {
      // Stale handling (decision doc §10): the reviewed body/version is no longer current.
      // FORCE regenerate + re-review of the CURRENT body; never auto-retry (the owner must
      // actually see what they sign). Clear the previewed body + gates so the Generate step
      // reappears; the backend 409 remains the fail-closed backstop.
      if (err instanceof ApiError && err.code === 'AGREEMENT_REVIEW_HASH_MISMATCH') {
        setStaleNotice('reviewHash')
        setPreview(null)
        resetAcceptanceGates()
      } else if (err instanceof ApiError && err.code === 'AGREEMENT_VERSION_MISMATCH') {
        setStaleNotice('version')
        setPreview(null)
        resetAcceptanceGates()
      }
      // Any other error surfaces via signMutation.error / NamedGateBanner below.
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

  const isMismatchError =
    signMutation.error instanceof ApiError &&
    (signMutation.error.code === 'AGREEMENT_VERSION_MISMATCH' ||
      signMutation.error.code === 'AGREEMENT_REVIEW_HASH_MISMATCH')

  return (
    <div className="space-y-4" data-testid="contract-ceremony">
      {(preview?.gated ?? false) && <LegalReviewBanner />}

      {phase === 'precheck' ? (
        // Steps 1-2: rep pre-check + explicit hand-to-owner.
        <div className="rounded-lg border border-border bg-card p-5" data-testid="ceremony-precheck">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Redeemo Merchant Agreement</h3>
            <Badge tone="neutral">12-month term</Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            Confirm the business identity with the owner, then hand the device over. The owner enters
            their own name, reviews the agreement personalised to their business, and signs it themselves.
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
            <Button
              type="button"
              onClick={() => {
                resetOwnerState()
                setPhase('owner')
              }}
              data-testid="ceremony-hand-to-owner"
            >
              Hand to the owner to review and sign
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : (
        // Steps 2-6: the owner enters identity, generates + reviews the personalised body,
        // attests, and signs.
        <div className="rounded-lg border border-primary/30 bg-card p-5" data-testid="ceremony-owner-panel">
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

          {/* Step 2: the owner's identity. These personalise the agreement body, so they are
              entered FIRST; changing either after generating clears the reviewed body. */}
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="ceremony-name" className="mb-1 block text-sm font-medium text-foreground">
                Your full name (your signature)
              </label>
              <input
                id="ceremony-name"
                type="text"
                value={signerName}
                onChange={(e) => onSignerNameChange(e.target.value)}
                placeholder="Type your full name"
                data-testid="ceremony-name"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="ceremony-role" className="mb-1 block text-sm font-medium text-foreground">
                Your role
              </label>
              <input
                id="ceremony-role"
                type="text"
                value={signerRole}
                onChange={(e) => onSignerRoleChange(e.target.value)}
                placeholder="e.g. Owner, Director"
                data-testid="ceremony-role"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* Forced re-review notice (decision doc §10): a stale sign cleared the reviewed body;
              the owner must regenerate the current version and review it again. */}
          {staleNotice && !preview && (
            <div
              className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              data-testid="ceremony-review-stale"
              role="alert"
            >
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                {staleNotice === 'version'
                  ? 'The agreement was updated since you reviewed it. Generate the current version and review it to the end again before signing.'
                  : 'The agreement details changed since you reviewed it. Generate the current version and review it to the end again before signing.'}
              </p>
            </div>
          )}

          {!preview ? (
            // Step 3a: generate the personalised body to review.
            <div className="mt-4">
              {previewMutation.error && (
                <div className="mb-3">
                  <NamedGateBanner error={previewMutation.error} />
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Enter your name and role above, then generate your agreement to review the exact terms
                personalised to your business.
              </p>
              <Button
                type="button"
                className="mt-3"
                onClick={generatePreview}
                disabled={!canGenerate}
                data-testid="ceremony-generate"
              >
                <FileText className="size-4" aria-hidden="true" />
                {previewMutation.isPending ? 'Preparing your agreement...' : 'Generate my agreement to review'}
              </Button>
            </div>
          ) : (
            // Steps 3b-6: review the personalised body, attest, and sign.
            <>
              {/* Step 3b: scroll-to-end review over the FULL personalised body. */}
              <div
                ref={scrollRef}
                onScroll={onScroll}
                data-testid="ceremony-agreement-scroll"
                className="mt-4 max-h-72 overflow-auto rounded-md border border-border bg-secondary/20 p-4 text-sm text-muted-foreground"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Key terms (summary)
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  {KEY_TERMS.map((term) => (
                    <li key={term}>{term}</li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Your agreement (version {preview.version})
                  </p>
                  <p
                    className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground"
                    data-testid="ceremony-agreement-fulltext"
                  >
                    {preview.personalisedText}
                  </p>
                </div>
              </div>
              {!scrolledToEnd && (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="ceremony-scroll-hint">
                  Scroll to the end of your agreement to continue.
                </p>
              )}

              {/* Step 4: authority attestation + key-terms acceptance. */}
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

                <label className="flex items-start gap-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={keyTermsAccepted}
                    onChange={(e) => setKeyTermsAccepted(e.target.checked)}
                    data-testid="ceremony-key-terms"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span>I have read the full agreement above and accept the terms of the Redeemo Merchant Agreement.</span>
                </label>
              </div>

              {/* Step 5: the pre-sign evidence notice (what WILL be recorded, not completed facts). */}
              <PreSignEvidenceNotice />

              {/* A stale mismatch is surfaced by the dedicated re-review notice above (after the
                  body is cleared), not here. Any OTHER sign error surfaces via the banner. */}
              {signMutation.error && !isMismatchError && (
                <div className="mt-4">
                  <NamedGateBanner
                    error={signMutation.error}
                    overrides={{
                      STORAGE_NOT_ENABLED:
                        'The signature could not be recorded because document storage is not enabled in this environment. A signature is only binding once the signed PDF is stored. Try again once storage is enabled, or contact support.',
                    }}
                  />
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetOwnerState()
                    setPhase('precheck')
                  }}
                  disabled={signMutation.isPending}
                  data-testid="ceremony-back"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleAccept}
                  disabled={!canSign}
                  data-testid="ceremony-accept"
                >
                  {signMutation.isPending ? 'Signing...' : 'I accept and sign the agreement'}
                </Button>
              </div>
            </>
          )}

          {/* Back is always available (also before generating). */}
          {!preview && (
            <div className="mt-5 flex justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetOwnerState()
                  setPhase('precheck')
                }}
                data-testid="ceremony-back"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
