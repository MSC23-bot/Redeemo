/**
 * QueueTable — approval queue table.
 *
 * Columns: Merchant | Type | Waiting | Verification | Status | Owner
 * No action column. Each row navigates to /queue/<id> (the review screen, M4).
 * Actions remain M5.
 */
import Link from 'next/link'
import { UrgencyBadge } from './UrgencyBadge'
import { Badge } from '@/features/shared/Badge'
import { cn } from '@/lib/utils'
import type { AdminApproval } from '@/lib/api/approvals'
import type { BadgeTone } from '@/features/shared/Badge'

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
// CORRECT M4 colour semantics (per the M4 spec):
//   Submitted       -> warn (amber) — waiting for admin action
//   Under review    -> info (blue)  — claimed and being reviewed
//   Changes requested -> danger (red) — action required from merchant

function getStatusBadgeTone(label: string): BadgeTone {
  if (label === 'Submitted') return 'warn'
  if (label === 'Under review') return 'info'
  if (label === 'Changes requested') return 'danger'
  return 'neutral'
}

function StatusBadge({ label }: { label: string }) {
  return <Badge tone={getStatusBadgeTone(label)}>{label}</Badge>
}

// ── Verification badge ────────────────────────────────────────────────────────
// Sentence-case labels (Verified / Pending / Rejected) — not ALL_CAPS.

function getVerificationLabel(status: string): string {
  if (status === 'VERIFIED') return 'Verified'
  if (status === 'REJECTED') return 'Rejected'
  if (status === 'PENDING') return 'Pending'
  return status
}

function getVerificationTone(status: string): BadgeTone {
  if (status === 'VERIFIED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'PENDING') return 'warn'
  return 'neutral'
}

function VerificationBadge({ status }: { status: string }) {
  return (
    <Badge tone={getVerificationTone(status)}>{getVerificationLabel(status)}</Badge>
  )
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: AdminApproval['type'] }) {
  return <Badge tone="neutral">{getTypeLabel(type)}</Badge>
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
                  idx % 2 === 0 ? 'bg-card' : 'bg-secondary/10',
                  'hover:bg-muted/40 transition-colors'
                )}
              >
                {/* Merchant — cell contains the row-level link */}
                <td className="px-4 py-3">
                  <Link
                    href={`/queue/${item.id}`}
                    className={cn(
                      'flex items-center gap-3',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm'
                    )}
                    aria-label={`Review ${businessName}`}
                  >
                    <MerchantAvatar name={businessName} />
                    <span className="font-medium text-foreground">{businessName}</span>
                  </Link>
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
