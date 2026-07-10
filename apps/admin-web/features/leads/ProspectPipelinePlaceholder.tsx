'use client'

/**
 * ProspectPipelinePlaceholder : Leads & Onboarding hub, SECTION 3 (C1, task
 * brief item 3). The prospect pipeline (pre-draft lead tracking: Lead ->
 * Contacted -> Visit booked, per the design spec) is honestly GATED: the lead
 * data model is OD1, an open owner decision (plan
 * docs/superpowers/plans/2026-07-10-admin-panel-recruitment-build.md §OD),
 * and no lead table exists in the schema. This renders the section header + a
 * short, honest explanation only : NO kanban, NO fake columns, NO lead CRUD.
 * Mirrors the established M360 PlaceholderTab visual pattern
 * (features/merchants/m360/PlaceholderTab.tsx) for consistency with the rest
 * of the admin panel's honest-placeholder convention.
 */
import { Info } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'

export function ProspectPipelinePlaceholder() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Prospect pipeline</h2>
        <Badge tone="warn">Net-new</Badge>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        The front half of onboarding: tracking prospects before anyone creates a draft or starts
        an application.
      </p>
      <section
        className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center"
        data-testid="leads-pipeline-gated"
      >
        <Info className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">Not built yet</h3>
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
          Pre-draft lead tracking needs a lead data model, which is an open owner decision.
          No lead table exists yet, so nothing is tracked here. Once the model is approved, this
          section will show prospects moving from first contact through to a converted draft or
          application.
        </p>
      </section>
    </>
  )
}
