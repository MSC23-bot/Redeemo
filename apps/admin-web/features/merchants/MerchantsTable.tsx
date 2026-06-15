'use client'

/**
 * MerchantsTable — the WP2 merchants directory table.
 *
 * Columns: Merchant (avatar + name) | Trading name | Status | Verification |
 * Created | Actions. The per-row Suspend / Reactivate actions render only when
 * `canSuspend` is true (mirror of the backend `merchant:suspend` capability —
 * the parent passes `can('merchant:suspend')`) AND the row's lifecycle status
 * permits the action (Suspend for ACTIVE, Reactivate for SUSPENDED). A
 * `merchant:read`-only admin sees the directory but no lifecycle buttons.
 *
 * Badge tones reuse the shared Badge from the queue surface.
 */
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BadgeTone } from '@/features/shared/Badge'
import type { MerchantSummary } from '@/lib/api/merchants'

// ── Status badge ──────────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    PENDING_APPROVAL: 'Pending approval',
    REGISTERED: 'Registered',
    INACTIVE: 'Inactive',
    DELETED: 'Deleted',
  }
  return map[status] ?? status
}

function statusTone(status: string): BadgeTone {
  if (status === 'ACTIVE') return 'success'
  if (status === 'SUSPENDED') return 'danger'
  if (status === 'PENDING_APPROVAL') return 'warn'
  return 'neutral'
}

// ── Verification badge ────────────────────────────────────────────────────────

function verificationLabel(status: string): string {
  if (status === 'VERIFIED') return 'Verified'
  if (status === 'REJECTED') return 'Rejected'
  if (status === 'PENDING') return 'Pending'
  if (status === 'NOT_SUBMITTED') return 'Not submitted'
  return status
}

function verificationTone(status: string): BadgeTone {
  if (status === 'VERIFIED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'PENDING') return 'warn'
  return 'neutral'
}

// ── Created date ──────────────────────────────────────────────────────────────

function formatCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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

// ── Row action cell ───────────────────────────────────────────────────────────

function ActionCell({
  merchant,
  canSuspend,
  onSuspend,
  onReactivate,
}: {
  merchant: MerchantSummary
  canSuspend: boolean
  onSuspend: (m: MerchantSummary) => void
  onReactivate: (m: MerchantSummary) => void
}) {
  if (!canSuspend) {
    return <span className="text-sm text-muted-foreground">-</span>
  }
  if (merchant.status === 'ACTIVE') {
    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => onSuspend(merchant)}
        data-testid={`merchant-suspend-${merchant.id}`}
      >
        Suspend
      </Button>
    )
  }
  if (merchant.status === 'SUSPENDED') {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => onReactivate(merchant)}
        data-testid={`merchant-reactivate-${merchant.id}`}
      >
        Reactivate
      </Button>
    )
  }
  return <span className="text-sm text-muted-foreground">-</span>
}

// ── Table ─────────────────────────────────────────────────────────────────────

interface MerchantsTableProps {
  items: MerchantSummary[]
  canSuspend: boolean
  onSuspend: (m: MerchantSummary) => void
  onReactivate: (m: MerchantSummary) => void
}

export function MerchantsTable({ items, canSuspend, onSuspend, onReactivate }: MerchantsTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No merchants match this search.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Merchant
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Trading name
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Verification
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
              Created
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
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
                  <MerchantAvatar name={item.businessName} />
                  <span className="font-medium text-foreground">{item.businessName}</span>
                </div>
              </td>

              {/* Trading name */}
              <td className="px-4 py-3 text-muted-foreground">{item.tradingName ?? '-'}</td>

              {/* Status */}
              <td className="px-4 py-3">
                <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
              </td>

              {/* Verification */}
              <td className="px-4 py-3">
                <Badge tone={verificationTone(item.verificationStatus)}>
                  {verificationLabel(item.verificationStatus)}
                </Badge>
              </td>

              {/* Created */}
              <td className="px-4 py-3 text-muted-foreground">{formatCreated(item.createdAt)}</td>

              {/* Actions */}
              <td className="px-4 py-3 text-right">
                <ActionCell
                  merchant={item}
                  canSuspend={canSuspend}
                  onSuspend={onSuspend}
                  onReactivate={onReactivate}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
