'use client'

/**
 * PipelineColumn : one lane of the prospect board (spec §A2). A neutral card
 * with a 3px top tone bar (the lane tone), a header (label + count pill + hint),
 * and a vertical stack of LeadCards. Empty lanes show a short muted line rather
 * than collapsing, so the board keeps its three-column shape.
 */
import { Badge } from '@/features/shared/Badge'
import { LeadCard } from './LeadCard'
import { LEAD_STAGE_LABEL, LEAD_STAGE_TONE, LEAD_STAGE_HINT, type LeadLaneStage } from '@/lib/ui/adminTones'
import type { Lead } from '@/lib/api/leads'

// The Tailwind tone-bar colour per lane, kept in lockstep with LEAD_STAGE_TONE
// (neutral/info/warn) and reusing the SAME Tailwind scale as Badge's TONE_CLASSES
// (no bespoke hex): neutral -> border, info -> blue-500, warn -> amber-500.
const TONE_BAR_CLASS: Record<LeadLaneStage, string> = {
  LEAD: 'bg-border',
  CONTACTED: 'bg-blue-500',
  VISIT_BOOKED: 'bg-amber-500',
}

interface PipelineColumnProps {
  stage: LeadLaneStage
  leads: Lead[]
  canConvert: boolean
  disabled?: boolean
  onMove: (leadId: string, stage: LeadLaneStage) => void
  onMarkLost: (lead: Lead) => void
  onConvert: (lead: Lead) => void
}

export function PipelineColumn({
  stage,
  leads,
  canConvert,
  disabled,
  onMove,
  onMarkLost,
  onConvert,
}: PipelineColumnProps) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-secondary/20"
      data-testid={`pipeline-column-${stage}`}
      aria-label={LEAD_STAGE_LABEL[stage]}
    >
      <div className={`h-[3px] ${TONE_BAR_CLASS[stage]}`} aria-hidden="true" />
      <div className="p-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{LEAD_STAGE_LABEL[stage]}</h3>
          <span data-testid={`pipeline-count-${stage}`}>
            <Badge tone={LEAD_STAGE_TONE[stage]}>{leads.length}</Badge>
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{LEAD_STAGE_HINT[stage]}</p>

        <div className="mt-3 flex flex-col gap-2">
          {leads.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No prospects in this lane.</p>
          ) : (
            leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                stage={stage}
                canConvert={canConvert}
                disabled={disabled}
                onMove={onMove}
                onMarkLost={onMarkLost}
                onConvert={onConvert}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
