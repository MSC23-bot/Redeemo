// Day-2 Vouchers B3/B4: the client-side derived DISPLAY state of a custom voucher,
// computed from the two independent backend fields (status + approvalStatus). This
// is the single source of truth for the list grouping, the filters, the card badge,
// and the per-state detail render.
//
// Model 1 (spec §4.1): "approved, waiting for go-live" is the NEW combination
// status:PENDING_APPROVAL + approvalStatus:APPROVED — a DISTINCT label, not customer-
// visible (the customer gate requires status:ACTIVE).
//
// The UI NEVER sends status/approvalStatus (server-set); it only READS them to derive
// the display state.

export type VoucherDisplayState =
  | 'live' // status:ACTIVE (+ approvalStatus:APPROVED)
  | 'approved-waiting' // status:PENDING_APPROVAL + approvalStatus:APPROVED (Model 1)
  | 'in-review' // status:PENDING_APPROVAL + approvalStatus:PENDING
  | 'draft' // status:DRAFT + approvalStatus:PENDING
  | 'changes-requested' // status:DRAFT + approvalStatus:CHANGES_REQUESTED
  | 'rejected' // status:INACTIVE + approvalStatus:REJECTED
  | 'finished' // status:INACTIVE/EXPIRED (not rejected)
  | 'unknown'

export interface DisplayStateInput {
  status: string
  approvalStatus: string
}

export function deriveDisplayState({ status, approvalStatus }: DisplayStateInput): VoucherDisplayState {
  if (status === 'ACTIVE') return 'live'
  if (status === 'PENDING_APPROVAL') {
    return approvalStatus === 'APPROVED' ? 'approved-waiting' : 'in-review'
  }
  if (status === 'DRAFT') {
    return approvalStatus === 'CHANGES_REQUESTED' ? 'changes-requested' : 'draft'
  }
  if (status === 'INACTIVE') {
    return approvalStatus === 'REJECTED' ? 'rejected' : 'finished'
  }
  if (status === 'EXPIRED') return 'finished'
  return 'unknown'
}

// The merchant-facing label per display state.
export const DISPLAY_STATE_LABEL: Record<VoucherDisplayState, string> = {
  live: 'Live',
  'approved-waiting': 'Approved, goes live when your business is live',
  'in-review': 'In review',
  draft: 'Draft',
  'changes-requested': 'Changes requested',
  rejected: 'Rejected',
  finished: 'Finished',
  unknown: 'Unknown',
}

// A short badge label (for the compact card chip).
export const DISPLAY_STATE_BADGE: Record<VoucherDisplayState, string> = {
  live: 'Live',
  'approved-waiting': 'Approved, waiting',
  'in-review': 'In review',
  draft: 'Draft',
  'changes-requested': 'Changes requested',
  rejected: 'Rejected',
  finished: 'Finished',
  unknown: 'Unknown',
}

// The top-of-page filter tabs (spec §3.3). "All" is the default.
export type VoucherFilterId = 'all' | 'live' | 'in-review' | 'draft' | 'finished'

export const FILTER_TABS: Array<{ id: VoucherFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'in-review', label: 'In review' },
  { id: 'draft', label: 'Draft' },
  { id: 'finished', label: 'Finished' },
]

// Map a display state to its filter bucket. changes-requested groups with Draft
// (it is editable, status:DRAFT); approved-waiting groups with In review (still
// pending go-live, not yet live); rejected groups with Finished (terminal, archived).
export function filterBucketOf(state: VoucherDisplayState): VoucherFilterId {
  switch (state) {
    case 'live':
      return 'live'
    case 'in-review':
    case 'approved-waiting':
      return 'in-review'
    case 'draft':
    case 'changes-requested':
      return 'draft'
    case 'rejected':
    case 'finished':
    case 'unknown':
    default:
      return 'finished'
  }
}

export function matchesFilter(state: VoucherDisplayState, filter: VoucherFilterId): boolean {
  if (filter === 'all') return true
  return filterBucketOf(state) === filter
}

// Whether the merchant can edit/submit/delete this voucher (only DRAFT, which
// covers draft + changes-requested). Mirrors the backend EDITABLE_STATUSES=['DRAFT'].
export function isEditable(status: string): boolean {
  return status === 'DRAFT'
}
