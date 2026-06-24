/**
 * MerchantHeader — top section of the review screen.
 *
 * Shows the merchant logo/initials, business name, trading name, status badges,
 * submission date, and the approval type. Purely read-only.
 */
import { Badge } from '@/features/shared/Badge'
import { cn } from '@/lib/utils'
import type { ReviewMerchant, ReviewApproval } from '@/lib/api/review'
import type { BadgeTone } from '@/features/shared/Badge'

interface MerchantHeaderProps {
  merchant: ReviewMerchant
  approval: ReviewApproval
}

function statusTone(status: string): BadgeTone {
  if (status === 'ACTIVE') return 'success'
  if (status === 'SUSPENDED') return 'danger'
  if (status === 'PENDING_APPROVAL') return 'warn'
  return 'neutral'
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    PENDING_APPROVAL: 'Pending approval',
    INACTIVE: 'Inactive',
    REJECTED: 'Rejected',
  }
  return map[status] ?? status
}

function verificationTone(status: string): BadgeTone {
  if (status === 'VERIFIED') return 'success'
  if (status === 'REJECTED') return 'danger'
  return 'warn'
}

function verificationLabel(status: string): string {
  if (status === 'VERIFIED') return 'Verified'
  if (status === 'REJECTED') return 'Rejected'
  return 'Pending verification'
}

function contractTone(status: string): BadgeTone {
  if (status === 'SIGNED') return 'success'
  if (status === 'PENDING') return 'warn'
  return 'neutral'
}

function contractLabel(status: string): string {
  if (status === 'SIGNED') return 'Contract signed'
  if (status === 'PENDING') return 'Contract pending'
  return status
}

function approvalTypeLabel(type: ReviewApproval['type']): string {
  const map: Record<ReviewApproval['type'], string> = {
    MERCHANT_ONBOARDING: 'Merchant onboarding review',
    VOUCHER: 'Voucher review',
    MERCHANT_PROFILE_EDIT: 'Profile edit review',
    MERCHANT_IDENTITY_EDIT: 'Identity edit review',
    BRANCH_IDENTITY_EDIT: 'Branch edit review',
    BRANCH_CREATE: 'New branch review',
    BRANCH_CLOSE: 'Branch close review',
  }
  return map[type] ?? type
}

function MerchantLogo({
  logoUrl,
  name,
}: {
  logoUrl: string | null
  name: string
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className="size-16 rounded-lg object-cover border border-border"
      />
    )
  }

  return (
    <span
      aria-label={name}
      className={cn(
        'inline-flex size-16 shrink-0 items-center justify-center rounded-lg',
        'bg-primary/10 text-xl font-bold text-primary border border-border'
      )}
    >
      {initials || '?'}
    </span>
  )
}

export function MerchantHeader({ merchant, approval }: MerchantHeaderProps) {
  const submittedDate = new Date(approval.submittedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="rounded-lg border border-border bg-card px-6 py-5" data-testid="merchant-header">
      <div className="flex items-start gap-4">
        <MerchantLogo logoUrl={merchant.logoUrl} name={merchant.businessName} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-foreground truncate">
              {merchant.businessName}
            </h1>
            {merchant.tradingName && merchant.tradingName !== merchant.businessName && (
              <span className="text-sm text-muted-foreground">
                (trading as {merchant.tradingName})
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            {approvalTypeLabel(approval.type)} · Submitted {submittedDate}
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge tone={statusTone(merchant.status)}>{statusLabel(merchant.status)}</Badge>
            <Badge tone={verificationTone(merchant.verificationStatus)}>
              {verificationLabel(merchant.verificationStatus)}
            </Badge>
            <Badge tone={contractTone(merchant.contractStatus)}>
              {contractLabel(merchant.contractStatus)}
            </Badge>
            {merchant.category && (
              <Badge tone="neutral">{merchant.category}</Badge>
            )}
          </div>
        </div>
      </div>

      {merchant.description && (
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-4">
          {merchant.description}
        </p>
      )}
    </div>
  )
}
