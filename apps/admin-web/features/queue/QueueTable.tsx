/**
 * QueueTable — approval queue row treatments (B1: two-court fidelity).
 *
 * Renders BOTH a wide 7-column `<table>` (desktop) and a narrow card list
 * (mobile) from the SAME `items` + `deriveRow` output, and lets CSS —
 * `hidden md:block` / `md:hidden` — decide which is visible at a given
 * viewport. This is the CP-1/CP-2 "replace, never stack" fix called out in
 * approval-queue-spec.md §A.1: toggling via a stylesheet `display` rule can
 * never leave both trees visible at once the way a JS-computed "isNarrow"
 * flag (out of sync with the real viewport, or racing a resize) previously
 * could.
 *
 * 7 columns per the design spec (§B.1): MERCHANT / TYPE / COURT / WAITING /
 * VERIFICATION / STATUS / OWNER-CLAIM.
 *
 * No action column, no sort-by-click (query-level sort stays oldest-first
 * server-side, per the existing M4/M5 contract — sortable headers are a
 * prototype-only affordance not commissioned in this slice). Each row
 * navigates to /queue/<id> (the review screen).
 */
import Link from 'next/link'
import { Badge } from '@/features/shared/Badge'
import { cn } from '@/lib/utils'
import { deriveRow, getVerificationLabel, getVerificationTone } from './rowHelpers'
import type { AdminApproval } from '@/lib/api/approvals'
import type { DerivedRow } from './rowHelpers'

// ── Claim / owner cell ────────────────────────────────────────────────────────

function ClaimCell({
  approval,
  currentAdminId,
}: {
  approval: AdminApproval
  currentAdminId: string | null
}) {
  if (approval.status === 'CHANGES_REQUESTED') {
    return <span className="text-sm text-muted-foreground italic">Waiting on merchant</span>
  }
  if (
    approval.status === 'APPROVED' ||
    approval.status === 'REJECTED' ||
    approval.status === 'WITHDRAWN'
  ) {
    return <span className="text-sm text-muted-foreground italic">Closed</span>
  }
  if (approval.claimedById == null) {
    return <span className="text-sm text-muted-foreground italic">Unclaimed</span>
  }
  if (approval.claimedById === currentAdminId) {
    return <span className="text-sm font-medium text-foreground">You</span>
  }
  // Claimed by someone else: show their name (falls back to "another admin"
  // when the name could not be resolved) + check for staleness (> 24h).
  const isStale =
    approval.claimedAt != null && Date.now() - new Date(approval.claimedAt).getTime() > 86_400_000
  const claimerName = approval.claimedBy?.name ?? 'another admin'
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-foreground">Claimed by {claimerName}</span>
      {isStale && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          Stale
        </span>
      )}
    </div>
  )
}

// ── Merchant initials avatar ──────────────────────────────────────────────────

function MerchantAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full',
        'bg-primary/10 text-xs font-semibold text-primary'
      )}
    >
      {initials || '?'}
    </span>
  )
}

// ── Court pill (§E: pill w/ dot) ──────────────────────────────────────────────

function CourtPill({ row }: { row: DerivedRow }) {
  return (
    <Badge tone={row.courtTone}>
      <span className="mr-1 inline-block size-1.5 rounded-full bg-current" aria-hidden="true" />
      {row.courtLabel}
    </Badge>
  )
}

// ── Type chip ────────────────────────────────────────────────────────────────

function TypeBadge({ row }: { row: DerivedRow }) {
  return <Badge tone={row.typeTone}>{row.typeLabel}</Badge>
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ row }: { row: DerivedRow }) {
  return <Badge tone={row.statusTone}>{row.displayStatus}</Badge>
}

// ── Waiting cell (age pill + optional merchant-court / closed sub-line) ──────

function WaitingCell({ row }: { row: DerivedRow }) {
  return (
    <div>
      <Badge tone={row.waitingTone}>{row.waitingLabel}</Badge>
      {row.waitingSubLine && (
        <p className="mt-1 max-w-64 text-xs text-muted-foreground">{row.waitingSubLine}</p>
      )}
    </div>
  )
}

// ── Verification / go-live hint ───────────────────────────────────────────────
// Day-2 Vouchers PR-C: a VOUCHER row carries a go-live hint instead of a
// merchant verification status (the voucher-row merchant carries no
// verificationStatus).

function VerificationCell({ item }: { item: AdminApproval }) {
  if (item.type === 'VOUCHER') {
    if (!item.goLiveHint) return <span className="text-muted-foreground">-</span>
    return item.goLiveHint === 'live-now' ? (
      <Badge tone="success">Go live now</Badge>
    ) : (
      <Badge tone="warn">Waiting to go live</Badge>
    )
  }
  if (!item.merchant?.verificationStatus) return <span className="text-muted-foreground">-</span>
  return (
    <Badge tone={getVerificationTone(item.merchant.verificationStatus)}>
      {getVerificationLabel(item.merchant.verificationStatus)}
    </Badge>
  )
}

// ── Primary (merchant / voucher) cell content, shared by both views ─────────

function PrimaryContent({ row }: { row: DerivedRow }) {
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium text-foreground">{row.primaryLabel}</span>
      {row.primarySubLabel && (
        <span className="block truncate text-xs text-muted-foreground">
          {row.primarySubLabel}
        </span>
      )}
    </span>
  )
}

// ── Shared empty state ────────────────────────────────────────────────────────

function EmptyState({ onClearFilter }: { onClearFilter?: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">No items match</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Nothing is waiting under this filter. Approvals appear here as merchants submit them.
      </p>
      {onClearFilter && (
        <button
          type="button"
          onClick={onClearFilter}
          className="mt-3 text-sm font-medium text-primary hover:underline"
        >
          Clear filter
        </button>
      )}
    </div>
  )
}

// ── Wide table (desktop) ──────────────────────────────────────────────────────

const COLUMN_HEADERS = [
  'Merchant',
  'Type',
  'Court',
  'Waiting',
  'Verification',
  'Status',
  'Owner / claim',
]

function WideTable({ items, currentAdminId }: RowsProps) {
  return (
    <div
      data-testid="queue-wide-table"
      className="hidden overflow-hidden rounded-lg border border-border bg-card md:block"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            {COLUMN_HEADERS.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const row = deriveRow(item, currentAdminId)
            return (
              <tr
                key={item.id}
                data-testid={`queue-row-${item.id}`}
                className={cn(
                  'border-b border-border last:border-0',
                  idx % 2 === 0 ? 'bg-card' : 'bg-secondary/10',
                  'hover:bg-muted/40 transition-colors'
                )}
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/queue/${item.id}`}
                    className={cn(
                      'flex items-center gap-3',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm'
                    )}
                    aria-label={`Review ${row.primaryLabel}`}
                  >
                    <MerchantAvatar name={row.businessName} />
                    <PrimaryContent row={row} />
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <TypeBadge row={row} />
                </td>
                <td className="px-4 py-3">
                  <CourtPill row={row} />
                </td>
                <td className="px-4 py-3">
                  <WaitingCell row={row} />
                </td>
                <td className="px-4 py-3">
                  <VerificationCell item={item} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge row={row} />
                </td>
                <td className="px-4 py-3">
                  <ClaimCell approval={item} currentAdminId={currentAdminId} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Narrow cards (mobile) ─────────────────────────────────────────────────────

function NarrowCards({ items, currentAdminId }: RowsProps) {
  return (
    <div data-testid="queue-narrow-cards" className="flex flex-col gap-3 md:hidden">
      {items.map((item) => {
        const row = deriveRow(item, currentAdminId)
        return (
          <Link
            key={item.id}
            href={`/queue/${item.id}`}
            data-testid={`queue-card-${item.id}`}
            aria-label={`Review ${row.primaryLabel}`}
            className={cn(
              'block rounded-lg border border-border bg-card p-4',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <MerchantAvatar name={row.businessName} />
                <PrimaryContent row={row} />
              </div>
              <Badge tone={row.waitingTone} className="shrink-0">
                {row.waitingLabel}
              </Badge>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <TypeBadge row={row} />
              <CourtPill row={row} />
              <StatusBadge row={row} />
            </div>

            {row.waitingSubLine && (
              <p className="mt-2 text-xs text-muted-foreground">{row.waitingSubLine}</p>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <VerificationCell item={item} />
              <ClaimCell approval={item} currentAdminId={currentAdminId} />
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

interface RowsProps {
  items: AdminApproval[]
  currentAdminId: string | null
}

interface QueueTableProps extends RowsProps {
  /** Rendered as a "Clear filter" action inside the empty state, if provided. */
  onClearFilter?: () => void
}

export function QueueTable({ items, currentAdminId, onClearFilter }: QueueTableProps) {
  if (items.length === 0) {
    return <EmptyState onClearFilter={onClearFilter} />
  }

  return (
    <>
      <WideTable items={items} currentAdminId={currentAdminId} />
      <NarrowCards items={items} currentAdminId={currentAdminId} />
    </>
  )
}
