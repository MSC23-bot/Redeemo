'use client'

/**
 * OnboardingRouteCards : Leads & Onboarding hub, SECTION 1(b)+1(c) (C1, spec
 * §A1 pts.2-3): the two "admin-created: bring a merchant on directly" route
 * cards, shown side by side.
 *
 *   - CreateDraftCard routes to the EXISTING /merchants/new form (not
 *     rebuilt). Capability-gated on `merchant:create-draft`: when absent, the
 *     primary button is rendered `disabled` with an adjacent locked note
 *     ("Needs merchant:create-draft", matching the design spec's own copy)
 *     rather than either hiding the card or leaving a clickable dead button.
 *   - AssistedOnboardingCard (C2) routes to the shipped create-draft form to
 *     begin: the assisted stepper runs on a REAL draft merchant, so the account
 *     must exist first; the rep then runs the 9-step wizard on it from the
 *     In-progress list below (or the created draft). No dedicated
 *     `merchant:assisted-onboard` capability exists in the AdminCapability mirror
 *     (it is not invented here), so the card gates on the closest real
 *     capability for bringing a merchant on directly, `merchant:create-draft`;
 *     when absent it renders disabled with a locked note, never a dead button.
 */
import Link from 'next/link'
import { UserPlus, Building2 } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'

const CREATE_DRAFT_BULLETS = [
  'Fast: under a minute for the operator',
  'Merchant does their own onboarding',
  'Operator never sets a password',
]

const ASSISTED_BULLETS = [
  'Rep drives every step on behalf',
  'Merchant never uses the portal to onboard',
  'Every step audited; merchant sets password at handover',
]

export function CreateDraftCard({ canCreateDraft }: { canCreateDraft: boolean }) {
  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card p-5"
      data-testid="leads-create-draft-card"
    >
      <span
        className="flex size-9 items-center justify-center rounded-md bg-secondary text-muted-foreground"
        aria-hidden="true"
      >
        <UserPlus className="size-4" />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-foreground">Create a draft and hand off</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        A short form: six essentials. The owner gets a secure setup email, sets their own
        password, and finishes onboarding themselves. Best when the merchant is willing and able
        to use the Merchant Portal.
      </p>
      <p className="mt-2 text-xs text-muted-foreground" data-testid="leads-create-draft-email-note">
        The setup link travels by email, and email sending is not switched on yet, so today the
        handover is manual: create the draft, then pass the merchant the link yourself.
      </p>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {CREATE_DRAFT_BULLETS.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

      <div className="mt-4 flex-1" />

      {canCreateDraft ? (
        <Link href="/merchants/new" data-testid="leads-create-draft-link">
          <Button type="button" className="w-full">
            Create a draft
          </Button>
        </Link>
      ) : (
        <div>
          <Button
            type="button"
            className="w-full"
            disabled
            aria-describedby="leads-create-draft-locked-note"
            data-testid="leads-create-draft-button-disabled"
          >
            Create a draft
          </Button>
          <p
            id="leads-create-draft-locked-note"
            className="mt-1.5 text-xs text-muted-foreground"
            data-testid="leads-create-draft-locked"
          >
            Needs merchant:create-draft
          </p>
        </div>
      )}
    </div>
  )
}

export function AssistedOnboardingCard({ canAssist }: { canAssist: boolean }) {
  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card p-5"
      data-testid="leads-assisted-card"
    >
      <span
        className="flex size-9 items-center justify-center rounded-md bg-secondary text-muted-foreground"
        aria-hidden="true"
      >
        <Building2 className="size-4" />
      </span>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">Assisted onboarding</h3>
        <Badge tone="warn">Net-new</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Build the entire account with the merchant, in person: profile, branches, vouchers,
        documents, so they never have to touch the Merchant Portal. Best for a rep sitting with a
        non-technical business.
      </p>
      <p className="mt-2 text-xs text-muted-foreground" data-testid="leads-assisted-begin-note">
        Create the draft to begin, then run the 9-step stepper on it. Resume any time from
        In-progress below. Staff and contract are owner-signed steps, so the wizard gates them
        honestly.
      </p>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {ASSISTED_BULLETS.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

      <div className="mt-4 flex-1" />

      {canAssist ? (
        <Link href="/merchants/new" data-testid="leads-assisted-link">
          <Button type="button" className="w-full">
            Start assisted onboarding
          </Button>
        </Link>
      ) : (
        <div>
          <Button
            type="button"
            className="w-full"
            disabled
            aria-describedby="leads-assisted-locked-note"
            data-testid="leads-assisted-button-disabled"
          >
            Start assisted onboarding
          </Button>
          <p
            id="leads-assisted-locked-note"
            className="mt-1.5 text-xs text-muted-foreground"
            data-testid="leads-assisted-locked"
          >
            Needs merchant:create-draft
          </p>
        </div>
      )}
    </div>
  )
}
