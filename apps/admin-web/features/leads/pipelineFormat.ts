/**
 * pipelineFormat : pure display-derivation helpers for the Prospect pipeline
 * board (spec §A2/§B2). No JSX, kept separate from the components so every
 * label/format/overdue mapping is unit-testable without rendering (mirrors
 * features/queue/rowHelpers.ts + features/leads/leadsFormat.ts).
 */
import type { LeadSource } from '@/lib/api/leads'
import type { LeadLaneStage } from '@/lib/ui/adminTones'

// Source labels (spec §B2 `pipSourceLabel`, extended to the full 6-value backend
// SOURCE enum). Falls back to the raw token for a future source the map does not
// yet know about, rather than rendering blank.
const SOURCE_LABELS: Record<string, string> = {
  REP_VISIT: 'Rep visit',
  INBOUND_ENQUIRY: 'Inbound enquiry',
  PHONE: 'Phone',
  SOCIAL: 'Social',
  EMAIL_CAMPAIGN: 'Email campaign',
  CUSTOMER_REQUEST: 'Customer request',
}

export function sourceLabel(source: string | null): string | null {
  if (source == null) return null
  return SOURCE_LABELS[source] ?? source
}

/**
 * CUSTOMER_REQUEST is the deferred customer-app "Request a merchant" intake: it
 * carries the amber "Future intake" chip (that entry point is not built yet, so
 * no such lead exists today, but the treatment is ready for when it ships).
 */
export function isFutureIntake(source: string | null): boolean {
  return source === 'CUSTOMER_REQUEST'
}

/**
 * The category/location secondary line: "{categoryGuess} (guess) · {locationHint}".
 * The category is always suffixed "(guess)" (§B2). Returns null when neither
 * field is present, so the caller omits the line entirely.
 */
export function categoryLocationLine(
  categoryGuess: string | null,
  locationHint: string | null
): string | null {
  const parts: string[] = []
  if (categoryGuess) parts.push(`${categoryGuess} (guess)`)
  if (locationHint) parts.push(locationHint)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Overdue = a due date strictly in the past, computed CLIENT-SIDE at render
 * (the spec's hardcoded prototype "today" is dropped; the backend overdue query
 * param is unused by the board v1). A null/absent/unparseable due date is never
 * overdue.
 */
export function isOverdue(dueDate: string | null, now: Date = new Date()): boolean {
  if (!dueDate) return false
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return false
  return due.getTime() < now.getTime()
}

/** "10 Jul 2026" : matches formatCreatedDate's en-GB format. */
export function formatDueDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Lane move targets (spec §c). Forward advances a lane; back regresses one.
// Visit booked has NO forward move (`advanceLabel: null`); Lead has no back move.
const NEXT_LANE: Record<LeadLaneStage, LeadLaneStage | null> = {
  LEAD: 'CONTACTED',
  CONTACTED: 'VISIT_BOOKED',
  VISIT_BOOKED: null,
}
const PREV_LANE: Record<LeadLaneStage, LeadLaneStage | null> = {
  LEAD: null,
  CONTACTED: 'LEAD',
  VISIT_BOOKED: 'CONTACTED',
}

export function nextLane(stage: LeadLaneStage): LeadLaneStage | null {
  return NEXT_LANE[stage]
}
export function prevLane(stage: LeadLaneStage): LeadLaneStage | null {
  return PREV_LANE[stage]
}

/** Best-effort split of a single contact name into first/last for convert prefill. */
export function splitContactName(contactName: string | null): { first: string; last: string } {
  if (!contactName) return { first: '', last: '' }
  const parts = contactName.trim().split(/\s+/)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export type { LeadSource }
