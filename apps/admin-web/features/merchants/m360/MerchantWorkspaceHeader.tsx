'use client'

/**
 * MerchantWorkspaceHeader: the Merchant 360 workspace header card
 * (spec merchant-360-spec.md §A3).
 *
 * Left: logo tile (the merchant logo when present, otherwise initials), the
 * trading/business name, a sub-line, and the two status pills (lifecycle +
 * verification). Right: the single lifecycle action, computed from the live
 * status and gated exactly as the existing directory suspend/reactivate flow
 * (the `merchant:suspend` capability, surfaced here as `canLifecycle`):
 *
 *   ACTIVE     + canLifecycle -> "Suspend merchant"    (danger)  -> onSuspend()
 *   SUSPENDED  + canLifecycle -> "Reactivate merchant"           -> onReactivate()
 *   ACTIVE/SUSPENDED, no cap  -> a lock chip naming the capability
 *   any other lifecycle       -> no action (Pending / Draft / Registered / etc.)
 *
 * The stat strip shows Branches / Active vouchers / Redemptions, all from the A4
 * `headerCounts` read (real, not fabricated). Rating stays off the strip: it needs
 * a net-new reviews aggregation, so it is honestly absent rather than shown as an
 * empty star.
 */
import { Lock } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import {
  merchantStatusLabel,
  merchantStatusTone,
  verificationLabel,
  verificationTone,
} from '@/lib/ui/adminTones'

interface MerchantWorkspaceHeaderProps {
  businessName: string
  tradingName: string | null
  category: string | null
  status: string
  verificationStatus: string
  logoUrl: string | null
  branchCount: number
  // undefined = count not supplied by this backend version: render a dash, never a fabricated 0
  activeVouchers: number | undefined
  totalRedemptions: number | undefined
  canLifecycle: boolean
  onSuspend: () => void
  onReactivate: () => void
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function MerchantWorkspaceHeader({
  businessName,
  tradingName,
  category,
  status,
  verificationStatus,
  logoUrl,
  branchCount,
  activeVouchers,
  totalRedemptions,
  canLifecycle,
  onSuspend,
  onReactivate,
}: MerchantWorkspaceHeaderProps) {
  const hasLifecycleAction = status === 'ACTIVE' || status === 'SUSPENDED'
  const subLineParts = [tradingName ? `Trading as ${tradingName}` : null, category].filter(
    (p): p is string => p != null && p !== ''
  )

  return (
    <header
      className="rounded-lg border border-border bg-card p-6"
      data-testid="merchant-workspace-header"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {/* Logo tile / initials */}
          <span
            className="flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-sm font-semibold text-muted-foreground"
            aria-hidden="true"
            data-testid="merchant-workspace-logo"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              initials(businessName)
            )}
          </span>

          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground">{businessName}</h1>
            {subLineParts.length > 0 && (
              <p className="mt-0.5 text-sm text-muted-foreground">{subLineParts.join(' · ')}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={merchantStatusTone(status)}>{merchantStatusLabel(status)}</Badge>
              <Badge tone={verificationTone(verificationStatus)}>
                {verificationLabel(verificationStatus)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Lifecycle action column */}
        <div className="flex shrink-0 items-center gap-2">
          {status === 'ACTIVE' && canLifecycle && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onSuspend}
              data-testid="lifecycle-suspend-btn"
            >
              Suspend merchant
            </Button>
          )}
          {status === 'SUSPENDED' && canLifecycle && (
            <Button
              type="button"
              size="sm"
              onClick={onReactivate}
              data-testid="lifecycle-reactivate-btn"
            >
              Reactivate merchant
            </Button>
          )}
          {hasLifecycleAction && !canLifecycle && (
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground"
              data-testid="lifecycle-gated"
            >
              <Lock className="size-3" aria-hidden="true" />
              Lifecycle actions need the merchant:suspend capability
            </span>
          )}
        </div>
      </div>

      {/* Stat strip (A4 real counts: Branches / Active vouchers / Redemptions) */}
      <dl className="mt-5 flex flex-wrap gap-8 border-t border-border pt-4">
        <div data-testid="workspace-stat-branches">
          <dt className="text-xs text-muted-foreground">Branches</dt>
          <dd className="text-lg font-semibold text-foreground">{branchCount}</dd>
        </div>
        <div data-testid="workspace-stat-active-vouchers">
          <dt className="text-xs text-muted-foreground">Active vouchers</dt>
          <dd className="text-lg font-semibold text-foreground">{activeVouchers ?? '-'}</dd>
        </div>
        <div data-testid="workspace-stat-redemptions">
          <dt className="text-xs text-muted-foreground">Redemptions</dt>
          <dd className="text-lg font-semibold text-foreground">{totalRedemptions ?? '-'}</dd>
        </div>
      </dl>
    </header>
  )
}
