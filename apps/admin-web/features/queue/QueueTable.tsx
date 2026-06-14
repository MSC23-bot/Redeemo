/**
 * QueueTable — approval queue table.
 *
 * Columns: Merchant | Type | Waiting | Verification | Status | Owner
 * No action column. Rows are non-clickable (review = M4, actions = M5).
 */
import { UrgencyBadge } from './UrgencyBadge'
import { cn } from '@/lib/utils'
import type { AdminApproval } from '@/lib/api/approvals'

// ── Derived display status ────────────────────────────────────────────────────

function getDisplayStatus(approval: AdminApproval): string {
  if (approval.status === 'CHANGES_REQUESTED') return 'Changes requested'
  if (approval.status === 'PENDING' && approval.claimedById != null) return 'Under review'
  return 'Submitted'
}

// ── Type label ────────────────────────────────────────────────────────────────

function getTypeLabel(type: AdminApproval['type']): string {
  const map: Record<AdminApproval['type'], string> = {
    MERCHANT_ONBOARDING: 'Onboarding',
    VOUCHER: 'Voucher',
    MERCHANT_PROFILE_EDIT: 'Profile edit',
    MERCHANT_IDENTITY_EDIT: 'Identity edit',
    BRANCH_IDENTITY_EDIT: 'Branch edit',
  }
  return map[type] ?? type
}

// ── Claim / owner cell ────────────────────────────────────────────────────────

function ClaimCell({
  approval,
  currentAdminId,
}: {
  approval: AdminApproval
  currentAdminId: string | null
}) {
  if (approval.status === 'CHANGES_REQUESTED') {
    return (
      <span className="text-sm text-muted-foreground italic">Waiting on merchant</span>
    )
  }
  if (approval.claimedById == null) {
    return <span className="text-sm text-muted-foreground italic">Unclaimed</span>
  }
  if (approval.claimedById === currentAdminId) {
    return <span className="text-sm font-medium text-foreground">You</span>
  }
  // Claimed by someone else — check for staleness (> 24h).
  const isStale =
    approval.claimedAt != null &&
    Date.now() - new Date(approval.claimedAt).getTime() > 86_400_000
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-foreground">Claimed</span>
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

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ label }: { label: string }) {
  let colour = 'bg-secondary text-muted-foreground'
  if (label === 'Submitted') colour = 'bg-blue-50 text-blue-700 border border-blue-200'
  if (label === 'Under review')
    colour = 'bg-amber-50 text-amber-700 border border-amber-200'
  if (label === 'Changes requested')
    colour = 'bg-orange-50 text-orange-700 border border-orange-200'

  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', colour)}>
      {label}
    </span>
  )
}

// ── Verification badge ────────────────────────────────────────────────────────

function VerificationBadge({ status }: { status: string }) {
  let colour = 'bg-secondary text-muted-foreground'
  if (status === 'VERIFIED') colour = 'bg-green-50 text-green-700 border border-green-200'
  if (status === 'REJECTED') colour = 'bg-red-50 text-red-700 border border-red-200'
  if (status === 'PENDING') colour = 'bg-yellow-50 text-yellow-700 border border-yellow-200'
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', colour)}>
      {status}
    </span>
  )
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: AdminApproval['type'] }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      {getTypeLabel(type)}
    </span>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

interface QueueTableProps {
  items: AdminApproval[]
  currentAdminId: string | null
}

export function QueueTable({ items, currentAdminId }: QueueTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No items match this filter.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Merchant
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Type
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Waiting
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Verification
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Owner
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const businessName = item.merchant?.businessName ?? 'Unknown merchant'
            const displayStatus = getDisplayStatus(item)

            return (
              <tr
                key={item.id}
                className={cn(
                  'border-b border-border last:border-0',
                  idx % 2 === 0 ? 'bg-card' : 'bg-secondary/10'
                )}
              >
                {/* Merchant */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <MerchantAvatar name={businessName} />
                    <span className="font-medium text-foreground">{businessName}</span>
                  </div>
                </td>

                {/* Type */}
                <td className="px-4 py-3">
                  <TypeBadge type={item.type} />
                </td>

                {/* Waiting + urgency */}
                <td className="px-4 py-3">
                  <UrgencyBadge submittedAtIso={item.submittedAt} />
                </td>

                {/* Verification */}
                <td className="px-4 py-3">
                  {item.merchant ? (
                    <VerificationBadge status={item.merchant.verificationStatus} />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge label={displayStatus} />
                </td>

                {/* Owner / claim state */}
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
