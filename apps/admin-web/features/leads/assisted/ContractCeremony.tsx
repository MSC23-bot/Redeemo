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
 * SIGNING-INTEGRITY CORRECTION (Fable, 2026-07-14): the ceremony must prove the
 * owner reviewed and accepted the EXACT full agreement version the backend records.
 * So (a) the FULL agreement text is fetched (GET /admin/agreement/current) and
 * rendered inline, and the scroll-to-end review gate runs over the FULL text (the
 * enumerated key terms remain a summary ABOVE it, not a replacement); (b) the sign
 * call ECHOES the exact displayed version so display is bound to recorded evidence;
 * (c) if the version changed between the read and the submit the backend returns
 * AGREEMENT_VERSION_MISMATCH (409) and the ceremony FORCES a reload + re-review (never
 * a silent re-sign of a version the owner never saw); (d) the pre-sign legal-review
 * banner is driven by the read's own draft/gated status, not hardcoded.
 *
 * The 7 steps, mapped to this component's phases:
 *   1 Rep pre-check         : the operator confirms the business + named signatory.
 *   2 Hand to owner         : an explicit full-panel handover; the operator cannot
 *                             proceed AS THEMSELVES past this point.
 *   3 Scroll-to-end review  : the owner reviews the FULL agreement; the accept control
 *                             is disabled until they have scrolled to the end.
 *   4 Authority attestation : a separately-ticked "I can bind this business" +
 *                             a free-text role (signerRoleConfirmation).
 *   5 Key-terms acceptance  : the owner ticks acceptance of the enumerated terms.
 *   6 Typed-name signature  : the typed full name is the signature of record. An
 *                             optional stylus draw is deliberately OMITTED here
 *                             (see the note at KEY_TERMS): it is non-gating per
 *                             spec, and the current sign route does not persist a
 *                             drawn image, so a canvas would capture nothing.
 *   7 Timestamped confirm   : the signed evidence + a pointer to the Merchant 360
 *                             contract summary.
 *
 * LEGAL GATE (spec §6): while the presented version is a draft the read reports
 * gated: true, and a persistent banner says the agreement is pending legal review;
 * the success state carries the same note when the sign response reports gated: true.
 * NEVER state or imply solicitor approval. On a production deploy while the gate is
 * on, the sign POST returns AGREEMENT_LEGAL_REVIEW_REQUIRED (403) via NamedGateBanner.
 *
 * REVIEW-NOTES FOLLOW-UP (Fable, 2026-07-15): three signing-integrity gaps closed:
 *   (a) the agreement-text read's Zod only guarantees `text: z.string()`, which
 *       allows ''. The review gate must never arm on empty/absent text, so entry to
 *       the owner panel is gated on `agreementTextPresent` (trimmed length > 0), not
 *       merely on the read having returned SOME object. This is a client-side guard
 *       only; it deliberately does NOT add a sha256 recompute (a separate deferred
 *       decision);
 *   (b) on AGREEMENT_VERSION_MISMATCH the forced reload now has an honest, three-state
 *       notice (reloading / reloaded / failed) instead of unconditionally claiming
 *       "reloaded below": React Query's refetch() does not reject on a fetch error by
 *       default and keeps the previous (stale) data on screen, so the copy only
 *       claims success once the refetch has actually settled without an error, and
 *       shows an honest failure message (with a retry) otherwise; accept stays
 *       blocked while reloading or failed. The backend 409 remains the fail-closed
 *       backstop regardless of what the UI shows;
 *   (c) the mismatch handler now calls the existing resetOwnerState() (full reset:
 *       scroll + authority + key-terms + name + role), not just the scroll/key-terms
 *       pair, so a stale-version event clears ALL acceptance state uniformly and the
 *       owner re-attests everything against the reloaded current text.
 */
import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Lock, ArrowRight, ArrowLeft, CheckCircle2, Download, Info, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/features/shared/Badge'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { useSignAgreement } from '@/lib/agreement/useSignAgreement'
import { useAgreementText } from '@/lib/agreement/useAgreementText'
import { ApiError } from '@/lib/api/client'
import type { SignAgreementResponse } from '@/lib/api/agreement'

// The enumerated key terms, plain English. Adapted to third person (this is the
// witnessed device: the owner is "the business", not "you") from the merchant
// portal set (apps/merchant-web/components/onboarding/contract/
// ContractAgreementForm.tsx), which the spec cites (step 5) as the shared
// key-terms set for both signing paths. These are a reviewable SUMMARY shown ABOVE
// the full agreement text; the binding text in both cases is the identical backend
// agreement, now fetched and rendered IN FULL below with the scroll gate running over
// it (GET /admin/agreement/current). Keep this SET OF SIX aligned with the merchant
// portal's list when either side changes.
const KEY_TERMS: readonly string[] = [
  'This is a 12 month agreement between the business and Redeemo.',
  'Listing is free. The business only pays for optional featured placement and campaigns.',
  'The business agrees to honour the vouchers it publishes and to keep its information accurate.',
  'Customers redeem in person at the branch, and the team validates each redemption.',
  'Redeemo may review, suspend, or remove listings that break the rules or fall short on quality, to protect customers and merchants.',
  'Data is handled under the Redeemo Privacy Policy, and the business is responsible for its staff use of the portal.',
] as const

// ── Persistent legal-review banner (spec §6) ─────────────────────────────────────

// Rendered driven by the agreement read's own status (gated/isDraft), never
// hardcoded (signing-integrity correction (d)): shown iff the presented version is a
// draft/gated, and again at the signed step when the sign response reports gated: true.
// A non-draft version shows NO watermark/pending banner. NEVER states solicitor approval.
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
        {/* Signed-state copy (signing-integrity correction (e)): point ONLY to the
            contract summary the merchant's record (Merchant 360) already carries. Do
            NOT imply the complete signing-evidence surface (the immutable ledger + the
            presigned signed-PDF download) exists yet: that is the separate lane-2
            evidence read (contract:view-evidence), not built here. The button stays
            disabled with honest copy until that read ships. */}
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
  // FIX B: a three-state notice (rather than a boolean) so the copy can honestly
  // distinguish "reload in flight" from "reload succeeded" from "reload failed",
  // instead of unconditionally claiming the text below has been reloaded.
  const [mismatchReload, setMismatchReload] = useState<'reloading' | 'reloaded' | 'failed' | null>(
    null
  )
  const [result, setResult] = useState<SignAgreementResponse | null>(null)

  const agreementQuery = useAgreementText(true)
  const agreement = agreementQuery.data
  const mutation = useSignAgreement(merchantId)
  const scrollRef = useRef<HTMLDivElement>(null)

  // FIX A: the read's Zod only guarantees `text: z.string()`, which allows ''. The
  // scroll/review gate must never arm on empty or whitespace-only text; treat that
  // the same as "no text yet" (blocks entry to the owner panel entirely below).
  const agreementTextPresent = !!agreement && agreement.text.trim().length > 0

  // Re-handover freshness (S1): a Back-then-hand-to-owner cycle must always
  // re-arm the scroll gate and ticks and clear the prior person's identity.
  // Without this, a second owner inherits the first owner's typed name and
  // pre-cleared gates, so the signature of record could be attributed to the
  // wrong person. Called on the owner->precheck Back transition, and
  // defensively again on the precheck->owner hand-to-owner transition, so the
  // owner panel is provably fresh no matter which edge triggered the entry.
  function resetOwnerState() {
    setScrolledToEnd(false)
    setAuthorityAttested(false)
    setKeyTermsAccepted(false)
    setSignerName('')
    setSignerRole('')
    setMismatchReload(null)
  }

  // Step 3 scroll-to-end gate: if the FULL agreement fits without scrolling there is
  // nothing to scroll, so the gate opens immediately; otherwise it stays shut until the
  // owner reaches the end. Re-evaluated when the presented version changes (e.g. after a
  // stale-version refetch swaps the text), so a shorter replacement opens the gate and a
  // longer one keeps it shut until re-scrolled.
  useEffect(() => {
    if (phase !== 'owner') return
    const el = scrollRef.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolledToEnd(true)
  }, [phase, agreement?.version])

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToEnd(true)
  }

  const trimmedName = signerName.trim()
  const trimmedRole = signerRole.trim()
  const canAccept =
    agreementTextPresent &&
    scrolledToEnd &&
    authorityAttested &&
    keyTermsAccepted &&
    trimmedName.length > 0 &&
    trimmedRole.length > 0 &&
    // FIX B: keep signing blocked while a stale-version reload is in flight or has
    // failed (the on-screen text may still be the stale, no-longer-current version).
    mismatchReload !== 'reloading' &&
    mismatchReload !== 'failed' &&
    !mutation.isPending

  // FIX B: re-fetch the current agreement and only claim success once the refetch
  // has actually settled without an error. React Query's refetch() does not reject
  // by default on a fetch failure (it resolves with a result object and keeps the
  // previous/stale data on screen), so read the settled result's `isError` rather
  // than relying on promise rejection. The cast is necessary because the hook types
  // refetch's return as `void` for the common fire-and-forget caller; at runtime it
  // is still the real React Query refetch result.
  function attemptReload() {
    setMismatchReload('reloading')
    const refetchResult = agreementQuery.refetch() as unknown as
      | { isError?: boolean }
      | Promise<{ isError?: boolean } | void>
      | void
    Promise.resolve(refetchResult).then((res) => {
      const failed = !!res && typeof res === 'object' && 'isError' in res && !!res.isError
      setMismatchReload(failed ? 'failed' : 'reloaded')
    })
  }

  async function handleAccept() {
    if (!canAccept || !agreement) return
    // Clear a prior stale-reload notice for this fresh attempt.
    setMismatchReload(null)
    try {
      const res = await mutation.mutateAsync({
        signerName: trimmedName,
        signerRoleConfirmation: trimmedRole,
        // Echo the EXACT version the owner reviewed. Binds display == evidence; a stale
        // echo is refused (AGREEMENT_VERSION_MISMATCH, 409) rather than silently signed.
        agreementVersion: agreement.version,
      })
      setResult(res)
    } catch (err) {
      // Stale-version handling (signing-integrity correction (c)): the version the owner
      // reviewed is no longer current. FORCE a reload + re-review of the CURRENT text; do
      // NOT auto-retry with the new version (the owner must actually see what they sign).
      if (err instanceof ApiError && err.code === 'AGREEMENT_VERSION_MISMATCH') {
        // FIX C: full owner-state reset (not just scroll/key-terms), so the owner
        // re-attests everything (authority, role, typed name too) against the
        // reloaded current text.
        resetOwnerState()
        attemptReload()
      }
      // Any other error surfaces via mutation.error / NamedGateBanner below.
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

  // The ceremony cannot run without the FULL agreement text: the whole point is that
  // the owner reviews the EXACT recorded version. Gate the flow on the read AND on
  // the text being non-trivial (FIX A): a present-but-empty/whitespace-only text is
  // treated the same as "no text yet", closing the empty-text auto-arm window.
  if (!agreement || !agreementTextPresent) {
    return (
      <div className="space-y-4" data-testid="contract-ceremony">
        {agreementQuery.isError ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700"
            data-testid="ceremony-agreement-error"
          >
            <p>The agreement could not be loaded, so it cannot be reviewed or signed right now.</p>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => agreementQuery.refetch()}
                data-testid="ceremony-agreement-retry"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Try again
              </Button>
            </div>
          </div>
        ) : agreement ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700"
            data-testid="ceremony-agreement-empty"
          >
            <p>The agreement text came back empty, so it cannot be reviewed or signed right now.</p>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => agreementQuery.refetch()}
                data-testid="ceremony-agreement-retry"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Try again
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground"
            data-testid="ceremony-agreement-loading"
          >
            Loading the current agreement for review...
          </div>
        )}
      </div>
    )
  }

  const isVersionMismatchError =
    mutation.error instanceof ApiError && mutation.error.code === 'AGREEMENT_VERSION_MISMATCH'

  return (
    <div className="space-y-4" data-testid="contract-ceremony">
      {agreement.gated && <LegalReviewBanner />}

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
        // Steps 3-6: owner reviews the FULL agreement, attests authority, accepts terms, types name.
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

          {/* Stale-version notice (signing-integrity correction (c)): the version changed
              between load and submit; the owner must re-review the current text below.
              FIX B: the wording is honest about the reload's actual outcome, not a
              blanket "reloaded below" claim: neutral while in flight, success copy only
              once the refetch has settled without an error, and an honest failure
              message (with a retry) if the refetch itself failed. */}
          {mismatchReload && (
            <div
              className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              data-testid="ceremony-version-mismatch"
              role="alert"
            >
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {mismatchReload === 'reloading' && (
                  <p>The agreement was updated while this was open. Reloading the current version...</p>
                )}
                {mismatchReload === 'reloaded' && (
                  <p>
                    The agreement was updated while this was open. It has been reloaded below: please
                    read the current version to the end and accept the terms again before signing.
                  </p>
                )}
                {mismatchReload === 'failed' && (
                  <>
                    <p>
                      The agreement was updated while this was open, but the current version could not
                      be reloaded. Try again before signing.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={attemptReload}
                      data-testid="ceremony-reload-retry"
                    >
                      <RefreshCw className="size-4" aria-hidden="true" />
                      Try again
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 3: scroll-to-end review over the FULL agreement (key terms are a
              summary above the complete text; the gate covers the whole container). */}
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
                Full agreement (version {agreement.version})
              </p>
              <p
                className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground"
                data-testid="ceremony-agreement-fulltext"
              >
                {agreement.text}
              </p>
            </div>
          </div>
          {!scrolledToEnd && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="ceremony-scroll-hint">
              Scroll to the end of the full agreement to continue.
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
              <span>I have read the full agreement above and accept the terms of the Redeemo Merchant Agreement.</span>
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

          {/* A version mismatch is surfaced by the dedicated re-review notice above, not
              here, so the two never double up. Any OTHER error surfaces via the banner. */}
          {mutation.error && !isVersionMismatchError && (
            <div className="mt-4">
              {/* STORAGE_NOT_ENABLED override: the shared copy is written for the
                  document-upload flow ("could not be uploaded"), which is the
                  wrong context here. The signature itself is still recorded; only
                  the PDF write failed. */}
              <NamedGateBanner
                error={mutation.error}
                overrides={{
                  STORAGE_NOT_ENABLED:
                    'The signature was recorded, but the signed PDF could not be stored: storage is not enabled in this environment. Try again once storage is enabled, or contact support.',
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
