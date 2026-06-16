'use client'

/**
 * SubmitForReviewCard (B3-web): the admin submit-for-approval-on-behalf affordance
 * on /merchants/[id]. Shows the LIVE onboarding submit checklist (branch + contract
 * + RMV; §B3-GATE-DRIFT preserved, no docs-uploaded / branch-user gates) and a
 * Submit / Resubmit button.
 *
 *   - The button is DISABLED until all three gates pass (submitChecklist.all_complete).
 *   - Unmet gates stay visible with a distinct icon + text (never colour-only) plus
 *     an sr-only "Met:" / "Not met:" label, so the admin sees exactly what is blocking.
 *   - Submitting only QUEUES review on the merchant's behalf. It does NOT approve,
 *     go live, verify, or accept the contract (the dialog states the boundary).
 *   - Copy is "Submit for review" by default and "Resubmit for review" when the
 *     merchant is in the changes-requested (NEEDS_CHANGES) state.
 *
 * Visibility (can('merchant:submit') && canSubmitOnBehalf) is the page's decision;
 * this card assumes it is only mounted when appropriate.
 */
import { Check, X, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GATE_LABELS } from '@/features/review/NamedGateBanner'
import type { SubmitChecklist } from '@/lib/api/merchants'

// The three live submit gates, in display order. Keys are the SubmitChecklist
// flags; labels are shared with NamedGateBanner via GATE_LABELS.
const GATE_ORDER = ['branch_created', 'contract_signed', 'rmv_configured'] as const

export function SubmitForReviewCard({
  onboardingStep,
  submitChecklist,
  onSubmit,
}: {
  onboardingStep: string
  submitChecklist: SubmitChecklist
  onSubmit: () => void
}) {
  const isResubmit = onboardingStep === 'NEEDS_CHANGES'
  const cta = isResubmit ? 'Resubmit for review' : 'Submit for review'

  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="merchant-submit-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-muted-foreground">{cta}</h2>
          <p className="mt-1 text-sm text-foreground">
            Submit this merchant&apos;s application for review on their behalf. This queues it for an
            admin to review. It does not approve the merchant, take them live, or accept their contract.
          </p>
        </div>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!submitChecklist.all_complete}
          data-testid="merchant-submit-button"
        >
          <Send className="size-4" aria-hidden="true" />
          {cta}
        </Button>
      </div>

      <ul className="mt-3 grid gap-1.5" data-testid="merchant-submit-checklist">
        {GATE_ORDER.map((key) => {
          const met = submitChecklist[key]
          return (
            <li
              key={key}
              className="flex items-center gap-2 text-sm text-foreground"
              data-testid={`submit-gate-${key}`}
              data-met={met ? 'true' : 'false'}
            >
              {met ? (
                <Check className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <X className="size-4 shrink-0 text-destructive" aria-hidden="true" />
              )}
              <span className="sr-only">{met ? 'Met:' : 'Not met:'}</span>
              <span>{GATE_LABELS[key]}</span>
            </li>
          )
        })}
      </ul>

      {!submitChecklist.all_complete && (
        <p
          className="mt-2 text-xs text-muted-foreground"
          data-testid="merchant-submit-incomplete-note"
        >
          Complete all requirements before submitting for review.
        </p>
      )}
    </section>
  )
}
