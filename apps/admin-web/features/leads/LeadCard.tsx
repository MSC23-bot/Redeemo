'use client'

/**
 * LeadCard : one prospect card in a pipeline lane (spec §B2). Renders the
 * business name, category/location guess line, source chip(s), contact, the
 * next-action box (with client-side Overdue flagging), the assigned rep, and the
 * per-card action buttons (lane moves + Mark lost + Convert).
 *
 * Anonymised leads (anonymisedAt set: the 6-month contact-PII retention sweep
 * ran) render the contact block as a muted retention line and HIDE every edit
 * action (the backend 409s LEAD_ANONYMISED on any mutation).
 */
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import { LEAD_STAGE_LABEL, type LeadLaneStage } from '@/lib/ui/adminTones'
import {
  sourceLabel,
  isFutureIntake,
  categoryLocationLine,
  isOverdue,
  formatDueDate,
  nextLane,
  prevLane,
} from './pipelineFormat'
import type { Lead } from '@/lib/api/leads'

interface LeadCardProps {
  lead: Lead
  stage: LeadLaneStage
  canConvert: boolean
  disabled?: boolean
  onMove: (leadId: string, stage: LeadLaneStage) => void
  onMarkLost: (lead: Lead) => void
  onConvert: (lead: Lead) => void
}

export function LeadCard({
  lead,
  stage,
  canConvert,
  disabled = false,
  onMove,
  onMarkLost,
  onConvert,
}: LeadCardProps) {
  const catLine = categoryLocationLine(lead.categoryGuess, lead.locationHint)
  const source = sourceLabel(lead.source)
  const overdue = isOverdue(lead.dueDate)
  const dueLabel = formatDueDate(lead.dueDate)
  const anonymised = lead.anonymisedAt != null
  const forward = nextLane(stage)
  const back = prevLane(stage)
  const contactSuffix = lead.contactPhone ? ` · ${lead.contactPhone}` : ''

  return (
    <div
      className="rounded-lg border border-border bg-card p-3 shadow-xs"
      data-testid={`lead-card-${lead.id}`}
    >
      <p className="text-sm font-semibold text-foreground">{lead.businessName}</p>
      {catLine && <p className="mt-0.5 text-xs text-muted-foreground">{catLine}</p>}

      {/* Source chip(s) */}
      {source && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{source}</Badge>
          {isFutureIntake(lead.source) && <Badge tone="warn">Future intake</Badge>}
        </div>
      )}

      {/* Contact */}
      {anonymised ? (
        <p className="mt-2 text-xs italic text-muted-foreground" data-testid={`lead-anonymised-${lead.id}`}>
          Contact details anonymised (data retention)
        </p>
      ) : (
        lead.contactName && (
          <p className="mt-2 text-xs text-foreground">
            {lead.contactName}
            {contactSuffix}
          </p>
        )
      )}

      {/* Next-action box */}
      {lead.nextAction && (
        <div className="mt-2 rounded-md border border-border bg-secondary/40 px-2.5 py-2">
          <p className="text-xs text-foreground">Next: {lead.nextAction}</p>
          {dueLabel && (
            <p className={overdue ? 'mt-0.5 text-xs font-medium text-red-700' : 'mt-0.5 text-xs text-muted-foreground'}>
              Due {dueLabel}
              {overdue && (
                <span
                  className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
                  data-testid={`lead-overdue-${lead.id}`}
                >
                  Overdue
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Assigned rep (id only; roster name-resolution is a follow-up) */}
      {lead.assignedRepId && (
        <p className="mt-2 text-xs text-muted-foreground">Rep: {lead.assignedRepId}</p>
      )}

      {/* Actions (hidden entirely for an anonymised lead: the backend 409s) */}
      {!anonymised && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {forward && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={disabled}
              onClick={() => onMove(lead.id, forward)}
              data-testid={`lead-move-forward-${lead.id}`}
            >
              Move to {LEAD_STAGE_LABEL[forward]}
            </Button>
          )}
          {back && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={disabled}
              onClick={() => onMove(lead.id, back)}
              data-testid={`lead-move-back-${lead.id}`}
            >
              Back to {LEAD_STAGE_LABEL[back]}
            </Button>
          )}
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={disabled}
            onClick={() => onMarkLost(lead)}
            data-testid={`lead-mark-lost-${lead.id}`}
          >
            Mark lost
          </Button>
          {canConvert && (
            <Button
              type="button"
              size="xs"
              disabled={disabled}
              onClick={() => onConvert(lead)}
              data-testid={`lead-convert-${lead.id}`}
            >
              Convert
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
