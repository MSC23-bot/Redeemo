/**
 * rowHelpers — pure display-derivation for a single queue row.
 *
 * No JSX: kept separate from QueueTable.tsx so every label/tone mapping is
 * unit-testable without rendering. `deriveRow` is the single entry point the
 * wide table and narrow card list both call, so the two views can never
 * silently drift from each other's row treatment.
 */
import { ageToneForHours, courtOf, COURT_LABEL, COURT_TONE, typeChipTone } from '@/lib/ui/adminTones'
import type { Court } from '@/lib/ui/adminTones'
import { hoursWaiting, formatWaiting } from '@/lib/queue/urgency'
import type { BadgeTone } from '@/features/shared/Badge'
import type { AdminApproval } from '@/lib/api/approvals'

// ── Status (two-value extension: B1 adds Approved/Rejected for History) ────
//
// CORRECT colour semantics (pre-existing M4 spec + B1 History extension):
//   Submitted          -> warn (amber)  — waiting for admin action
//   Under review        -> info (blue)   — claimed and being reviewed
//   Changes requested   -> danger (red)  — action required from merchant
//   Approved            -> success (green)
//   Rejected            -> danger (red)
//   Withdrawn           -> neutral (grey) — a calm terminal state, not an error

export function getDisplayStatus(approval: AdminApproval): string {
  if (approval.status === 'WITHDRAWN') return 'Withdrawn'
  if (approval.status === 'APPROVED') return 'Approved'
  if (approval.status === 'REJECTED') return 'Rejected'
  if (approval.status === 'CHANGES_REQUESTED') return 'Changes requested'
  if (approval.status === 'PENDING' && approval.claimedById != null) return 'Under review'
  return 'Submitted'
}

export function getStatusBadgeTone(label: string): BadgeTone {
  if (label === 'Submitted') return 'warn'
  if (label === 'Under review') return 'info'
  if (label === 'Changes requested') return 'danger'
  if (label === 'Approved') return 'success'
  if (label === 'Rejected') return 'danger'
  if (label === 'Withdrawn') return 'neutral'
  return 'neutral'
}

// ── Type label (finer than the 4-group chip tone; text stays precise) ──────

function getVoucherEditTypeLabel(item: AdminApproval): string {
  if (item.voucherEditKind === 'END') return 'Voucher end request'
  if (item.voucherEditKind === 'CHANGE') return 'Voucher change request'
  return 'Voucher edit request'
}

export function getTypeLabel(item: AdminApproval): string {
  if (item.type === 'VOUCHER_EDIT') return getVoucherEditTypeLabel(item)
  const map: Record<Exclude<AdminApproval['type'], 'VOUCHER_EDIT'>, string> = {
    MERCHANT_ONBOARDING: 'Onboarding',
    VOUCHER: 'Voucher',
    MERCHANT_PROFILE_EDIT: 'Profile edit',
    MERCHANT_IDENTITY_EDIT: 'Identity edit',
    BRANCH_IDENTITY_EDIT: 'Branch edit',
    BRANCH_CREATE: 'Branch: add',
    BRANCH_CLOSE: 'Branch: close',
  }
  return map[item.type] ?? item.type
}

// Day-2 Vouchers PR-C: friendly customer-facing voucher-type label for the
// VOUCHER row's voucher summary.
const VOUCHER_TYPE_LABELS: Record<string, string> = {
  BOGO: 'BOGO',
  DISCOUNT: 'Discount',
  FREEBIE: 'Freebie',
  SPEND_AND_SAVE: 'Spend and save',
  PACKAGE_DEAL: 'Package deal',
  TIME_LIMITED: 'Time limited',
  REUSABLE: 'Reusable',
}

export function voucherTypeLabel(type: string): string {
  return VOUCHER_TYPE_LABELS[type] ?? type
}

// ── Verification (onboarding rows) ──────────────────────────────────────────
// Sentence-case labels (Verified / Pending / Rejected) — not ALL_CAPS.

export function getVerificationLabel(status: string): string {
  if (status === 'VERIFIED') return 'Verified'
  if (status === 'REJECTED') return 'Rejected'
  if (status === 'PENDING') return 'Pending'
  return status
}

export function getVerificationTone(status: string): BadgeTone {
  if (status === 'VERIFIED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'PENDING') return 'warn'
  return 'neutral'
}

// ── Waiting age + merchant-court / closed-row sub-line ──────────────────────
//
// approval-queue-spec.md §E age-tint boundaries (>=12h amber, >=36h red) do
// not apply to a "closed" (terminal) row: colouring a resolved item as
// urgent would be misleading, so History rows always render neutral.

const TERMINAL_VERB: Partial<Record<AdminApproval['status'], string>> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
}

export function waitingLabel(item: Pick<AdminApproval, 'submittedAt'>): string {
  return formatWaiting(item.submittedAt)
}

export function waitingTone(item: Pick<AdminApproval, 'submittedAt'>, court: Court): BadgeTone {
  if (court === 'closed') return 'neutral'
  return ageToneForHours(hoursWaiting(item.submittedAt))
}

/**
 * Sub-line under the waiting pill: "with merchant · changes requested" for
 * the Awaiting-merchant court, "{Approved|Rejected|Withdrawn} {age} ago" for
 * a closed (History) row, or null for a live "you"/"other" row.
 */
export function waitingSubLine(
  item: Pick<AdminApproval, 'status' | 'actionedAt' | 'submittedAt'>,
  court: Court
): string | null {
  if (court === 'merchant') return 'with merchant · changes requested'
  if (court === 'closed') {
    const verb = TERMINAL_VERB[item.status] ?? 'Closed'
    const agoIso = item.actionedAt ?? item.submittedAt
    return `${verb} ${formatWaiting(agoIso)} ago`
  }
  return null
}

// ── Combined per-row derivation ─────────────────────────────────────────────

export interface DerivedRow {
  court: Court
  courtLabel: string
  courtTone: BadgeTone
  displayStatus: string
  statusTone: BadgeTone
  typeLabel: string
  typeTone: BadgeTone
  waitingLabel: string
  waitingTone: BadgeTone
  waitingSubLine: string | null
  businessName: string
  isVoucherRow: boolean
  primaryLabel: string
  /** Voucher rows only: "{businessName} · {voucherType}" under the title. */
  primarySubLabel: string | null
}

export function deriveRow(item: AdminApproval, currentAdminId: string | null): DerivedRow {
  const court = courtOf(item, currentAdminId)
  const businessName = item.merchant?.businessName ?? 'Unknown merchant'
  const isVoucherRow = item.type === 'VOUCHER'
  const displayStatus = getDisplayStatus(item)

  return {
    court,
    courtLabel: COURT_LABEL[court],
    courtTone: COURT_TONE[court],
    displayStatus,
    statusTone: getStatusBadgeTone(displayStatus),
    typeLabel: getTypeLabel(item),
    typeTone: typeChipTone(item.type),
    waitingLabel: waitingLabel(item),
    waitingTone: waitingTone(item, court),
    waitingSubLine: waitingSubLine(item, court),
    businessName,
    isVoucherRow,
    // Day-2 Vouchers PR-C: a VOUCHER row leads with the voucher title and
    // shows "{business} · {voucher type}" as a sub-line.
    primaryLabel: isVoucherRow && item.voucher ? item.voucher.title : businessName,
    primarySubLabel:
      isVoucherRow && item.voucher
        ? `${businessName} · ${voucherTypeLabel(item.voucher.type)}`
        : null,
  }
}
