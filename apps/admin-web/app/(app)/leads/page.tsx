'use client'

/**
 * Leads & Onboarding hub: /leads (C1).
 *
 * Design contract: docs/superpowers/specs/2026-07-10-admin-panel-module-specs/
 * leads-onboarding-spec.md §A1 (HUB) + plan
 * docs/superpowers/plans/2026-07-10-admin-panel-recruitment-build.md Phase C/C1.
 * OD5 (owner-confirmed layout): ONE nav item, two clearly separated top-level
 * groupings : "How merchants come onboard" (routes) above "In-progress
 * onboardings" (resume) : plus the prospect pipeline as an honestly-gated
 * third section below (2.11 amendment: pipeline lives on the hub, not a
 * separate route).
 *
 *   SECTION 1 "How merchants come onboard":
 *     (a) InboundPointerCard : a read-only pointer at the self-serve queue,
 *         with a real awaiting-review count (existing approvals read).
 *     (b) CreateDraftCard : routes to the EXISTING /merchants/new form.
 *     (c) AssistedOnboardingCard (C2) : routes to /merchants/new to begin the
 *         assisted stepper on a real draft; resume per-row from SECTION 2.
 *   SECTION 2 "In-progress onboardings": draft/incomplete merchants (existing
 *     merchants directory read, pre-live statuses), each linking into
 *     Merchant 360 to continue.
 *   SECTION 3 "Prospect pipeline": honestly gated : the lead model is OD1, an
 *     open owner decision. No kanban, no fake columns, no lead CRUD.
 *
 * Two-layer capability gating: the PAGE fails closed on `merchant:read` (the
 * lowest bar for viewing the hub at all : the same gate the Merchants
 * directory uses). Each affordance inside additionally gates on its OWN
 * capability so a merchant:read-only admin sees the hub with locked/absent
 * affordances rather than a blanket forbidden page:
 *   - the live count fetch needs `approval:read` (mirrors the queue's own gate)
 *   - the "Create a draft" CTA needs `merchant:create-draft`
 *   - "Assisted onboarding" (C2) also gates on `merchant:create-draft` (no
 *     dedicated `merchant:assisted-onboard` capability exists in the mirror, so
 *     the closest real capability for bringing a merchant on directly is used;
 *     it is not invented here). The wizard page additionally fail-closes on
 *     `merchant:read`, and every in-wizard action gates on its own capability.
 * Backend `requireAdminCapability` on the underlying reads stays the
 * enforcement; this is UI gating only.
 */
import { Users, AlertCircle, Loader2 } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useAwaitingReviewCount } from '@/lib/leads/useAwaitingReviewCount'
import { useInProgressOnboardings, IN_PROGRESS_DISPLAY_CAP } from '@/lib/leads/useInProgressOnboardings'
import { InboundPointerCard } from '@/features/leads/InboundPointerCard'
import { CreateDraftCard, AssistedOnboardingCard } from '@/features/leads/OnboardingRouteCards'
import { InProgressOnboardingsSection } from '@/features/leads/InProgressOnboardingsSection'
import { ProspectPipelinePlaceholder } from '@/features/leads/ProspectPipelinePlaceholder'

// ── States ──────────────────────────────────────────────────────────────────

function ForbiddenState() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center" data-testid="leads-forbidden">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-semibold text-foreground">Access denied</h2>
      <p className="text-sm text-muted-foreground">
        You do not have permission to view Leads and onboarding. Contact your administrator.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeadsHubPage() {
  const { ready, can } = useSession()
  const canRead = ready && can('merchant:read')
  const canCreateDraft = can('merchant:create-draft')
  const canReadApprovals = can('approval:read')

  const awaiting = useAwaitingReviewCount({ enabled: canRead && canReadApprovals })
  const inProgress = useInProgressOnboardings({ enabled: canRead })

  if (!ready) {
    return <LoadingState />
  }
  if (!can('merchant:read')) {
    return <ForbiddenState />
  }

  return (
    <div className="space-y-10" data-testid="leads-hub-page">
      {/* Heading */}
      <div>
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Users className="size-4" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold text-foreground">Leads and onboarding</h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          How merchants get onto the platform. Some sign up themselves and you approve them. Some
          you bring on directly, either by handing them a setup link or by building the whole
          account with them in person.
        </p>
      </div>

      {/* SECTION 1: How merchants come onboard */}
      <section className="space-y-4" data-testid="leads-section-onboard" aria-label="How merchants come onboard">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How merchants come onboard
        </h2>

        <InboundPointerCard
          count={awaiting.count}
          isLoading={awaiting.isLoading}
          isError={awaiting.isError}
          canReadApprovals={canReadApprovals}
        />

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Admin-created: bring a merchant on directly
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <CreateDraftCard canCreateDraft={canCreateDraft} />
          <AssistedOnboardingCard canAssist={canCreateDraft} />
        </div>
      </section>

      {/* SECTION 2: In-progress onboardings */}
      <section className="space-y-3" data-testid="leads-section-in-progress" aria-label="In-progress onboardings">
        <InProgressOnboardingsSection
          items={inProgress.items}
          total={inProgress.total}
          isLoading={inProgress.isLoading}
          isError={inProgress.isError}
          onRetry={inProgress.refetch}
          displayCap={IN_PROGRESS_DISPLAY_CAP}
          canAssist={canCreateDraft}
        />
      </section>

      {/* SECTION 3: Prospect pipeline (honestly gated: OD1) */}
      <section className="space-y-3" data-testid="leads-section-pipeline" aria-label="Prospect pipeline">
        <ProspectPipelinePlaceholder />
      </section>
    </div>
  )
}
