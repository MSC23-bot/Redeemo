'use client'

/**
 * ProspectPipeline : the Leads & Onboarding hub SECTION 3 (spec §A2). The front
 * half of onboarding: a 3-lane board (Lead / Contacted / Visit booked) of
 * prospects, plus terminal Lost / Converted sections below. Replaces the old
 * ProspectPipelinePlaceholder now that the MerchantLead model is live (#500).
 *
 * Section gate: `lead:manage` (`canManage`). Convert additionally needs
 * `merchant:create-draft` (`canConvert`), mirroring the backend dual gate. Both
 * are UI gating; the backend `requireAdminCapability` is the real enforcement.
 *
 * Overdue is computed client-side (pipelineFormat.isOverdue) at render; the
 * backend overdue param is unused by the board v1. Two fetches back the surface:
 * the live lanes (useLeadsPipeline) and the terminal states (useTerminalLeads).
 */
import { useState } from 'react'
import { Info, Plus } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { PipelineColumn } from './PipelineColumn'
import { AddLeadDialog } from './AddLeadDialog'
import { MarkLostDialog } from './MarkLostDialog'
import { ConvertLeadDialog } from './ConvertLeadDialog'
import { useLeadsPipeline, useTerminalLeads } from '@/lib/leads/useLeadsPipeline'
import { useUpdateLead } from '@/lib/leads/useLeadMutations'
import { LEAD_LANES, type LeadLaneStage } from '@/lib/ui/adminTones'
import type { Lead } from '@/lib/api/leads'

interface ProspectPipelineProps {
  canManage: boolean
  canConvert: boolean
  role: string | null
}

export function ProspectPipeline({ canManage, canConvert, role }: ProspectPipelineProps) {
  const pipeline = useLeadsPipeline({ enabled: canManage })
  const terminal = useTerminalLeads({ enabled: canManage })
  const moveMutation = useUpdateLead()

  const [addOpen, setAddOpen] = useState(false)
  const [lostLead, setLostLead] = useState<Lead | null>(null)
  const [convertLead, setConvertLead] = useState<Lead | null>(null)

  function handleMove(leadId: string, stage: LeadLaneStage) {
    moveMutation.mutate({ leadId, input: { stage } })
  }
  function handleRetry() {
    pipeline.refetch()
    terminal.refetch()
  }

  const lostLeads = terminal.leads.filter((l) => l.stage === 'LOST')
  const convertedLeads = terminal.leads.filter((l) => l.stage === 'CONVERTED')
  const isEmpty =
    !pipeline.isLoading &&
    !pipeline.isError &&
    pipeline.leads.length === 0 &&
    lostLeads.length === 0 &&
    convertedLeads.length === 0

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Prospect pipeline</h2>
          <Badge tone="warn">Net-new</Badge>
        </div>
        {canManage && (
          <Button type="button" size="sm" onClick={() => setAddOpen(true)} data-testid="pipeline-add-lead">
            <Plus aria-hidden="true" />
            Add lead
          </Button>
        )}
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        The front half of onboarding: tracking prospects before anyone creates a draft. Once a
        prospect converts, it hands off to the admin-created routes above.
      </p>

      {!canManage ? (
        <DeniedState role={role} />
      ) : (
        <>
          {/* Honesty note (true today) */}
          <div
            className="flex gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3"
            data-testid="pipeline-honesty-note"
          >
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">
              The lead model is live. One intake is still to come: the customer app&apos;s
              &ldquo;Request a merchant&rdquo; entry point is deferred, and once it ships those
              requests will arrive here as leads tagged with a future source. Marking a lead lost
              requires a reason and is audited, and the pipeline reflects that most prospects do not
              convert.
            </p>
          </div>

          {moveMutation.error && (
            <NamedGateBanner error={moveMutation.error} />
          )}

          {pipeline.isLoading ? (
            <LoadingColumns />
          ) : pipeline.isError ? (
            <ErrorState onRetry={handleRetry} />
          ) : isEmpty ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3" data-testid="pipeline-board">
                {LEAD_LANES.map((stage) => (
                  <PipelineColumn
                    key={stage}
                    stage={stage}
                    leads={pipeline.leads.filter((l) => l.stage === stage)}
                    canConvert={canConvert}
                    disabled={moveMutation.isPending}
                    onMove={handleMove}
                    onMarkLost={setLostLead}
                    onConvert={setConvertLead}
                  />
                ))}
              </div>

              {lostLeads.length > 0 && <LostSection leads={lostLeads} />}
              {convertedLeads.length > 0 && <ConvertedSection leads={convertedLeads} />}
            </>
          )}
        </>
      )}

      {/* Dialogs */}
      {addOpen && (
        <AddLeadDialog onSuccess={() => setAddOpen(false)} onCancel={() => setAddOpen(false)} />
      )}
      {lostLead && (
        <MarkLostDialog lead={lostLead} onSuccess={() => setLostLead(null)} onCancel={() => setLostLead(null)} />
      )}
      {convertLead && (
        <ConvertLeadDialog lead={convertLead} onSuccess={() => setConvertLead(null)} onCancel={() => setConvertLead(null)} />
      )}
    </>
  )
}

// ── Terminal sections ─────────────────────────────────────────────────────────

function LostSection({ leads }: { leads: Lead[] }) {
  return (
    <div className="space-y-2" data-testid="pipeline-lost-section">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lost</h3>
      {leads.map((lead) => (
        <div
          key={lead.id}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 opacity-90"
          data-testid={`lost-row-${lead.id}`}
        >
          <span className="text-sm font-medium text-foreground">{lead.businessName}</span>
          <Badge tone="neutral">Lost</Badge>
          {lead.locationHint && <span className="text-xs text-muted-foreground">{lead.locationHint}</span>}
          {lead.lostReason && (
            <span className="w-full text-xs text-muted-foreground">Reason: {lead.lostReason}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function ConvertedSection({ leads }: { leads: Lead[] }) {
  return (
    <div className="space-y-2" data-testid="pipeline-converted-section">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Converted</h3>
      {leads.map((lead) => (
        <div
          key={lead.id}
          className="flex flex-wrap items-center gap-2 rounded-md border border-green-200 bg-card px-3 py-2"
          data-testid={`converted-row-${lead.id}`}
        >
          <span className="text-sm font-medium text-foreground">{lead.businessName}</span>
          <Badge tone="success">Converted</Badge>
        </div>
      ))}
    </div>
  )
}

// ── States ──────────────────────────────────────────────────────────────────

function DeniedState({ role }: { role: string | null }) {
  return (
    <div
      className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center"
      data-testid="pipeline-denied"
    >
      <Info className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-foreground">Pipeline is restricted</h3>
      <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
        Your role ({role ?? 'unknown'}) does not hold the lead:manage capability. Ask a Super Admin
        if you need it.
      </p>
    </div>
  )
}

function LoadingColumns() {
  return (
    <div className="grid gap-4 md:grid-cols-3" data-testid="pipeline-loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border bg-secondary/20">
          <div className="h-[3px] bg-border" aria-hidden="true" />
          <div className="space-y-3 p-3">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="rounded-lg border border-border bg-card px-6 py-10 text-center"
      data-testid="pipeline-error"
    >
      <p className="text-sm font-medium text-foreground">Could not load the pipeline</p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry} data-testid="pipeline-retry">
        Try again
      </Button>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center"
      data-testid="pipeline-empty"
    >
      <h3 className="text-sm font-semibold text-foreground">No prospects yet</h3>
      <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
        Add your first, or wait for customer requests once that intake ships.
      </p>
    </div>
  )
}
