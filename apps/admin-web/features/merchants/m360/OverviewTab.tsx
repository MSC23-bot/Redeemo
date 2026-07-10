'use client'

/**
 * OverviewTab: a composed, read-only summary of the EXISTING merchant detail
 * payload (spec merchant-360-spec.md, Tab 1). No new backend fields.
 *
 *   - Status snapshot: lifecycle + verification pills.
 *   - Identity summary: category, website, and a link to the Business identity
 *     tab for the full record and edit lanes.
 *   - Branches count (derived from the payload). A documents count is NOT shown:
 *     it is not on this payload and A1 adds no backend fields.
 *   - Submit-for-review card (existing component), shown only when the admin
 *     holds `merchant:submit` AND the merchant is in a submittable state.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Globe } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import { SubmitForReviewCard } from '@/features/merchants/SubmitForReviewCard'
import {
  merchantStatusLabel,
  merchantStatusTone,
  verificationLabel,
  verificationTone,
} from '@/lib/ui/adminTones'
import type { MerchantDetail } from '@/lib/api/merchants'

interface OverviewTabProps {
  data: MerchantDetail
  canSubmit: boolean
  onSubmitForReview: () => void
}

export function OverviewTab({ data, canSubmit, onSubmitForReview }: OverviewTabProps) {
  const pathname = usePathname()
  const { merchant, branches } = data
  const showSubmitCard = canSubmit && merchant.canSubmitOnBehalf

  return (
    <div className="space-y-6" data-testid="workspace-overview">
      {/* Submit-for-review card (admin submit-on-behalf), gated + submittable. */}
      {showSubmitCard && (
        <SubmitForReviewCard
          onboardingStep={merchant.onboardingStep}
          submitChecklist={merchant.submitChecklist}
          onSubmit={onSubmitForReview}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Identity summary */}
        <section
          className="rounded-lg border border-border bg-card p-4"
          data-testid="overview-identity-summary"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Identity summary
          </h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="mt-0.5 text-foreground" data-testid="overview-category">
                {merchant.category ?? 'Not set'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Website</dt>
              <dd className="mt-0.5 flex items-center gap-2 text-foreground" data-testid="overview-website">
                <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{merchant.websiteUrl ?? 'Not set'}</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Branches</dt>
              <dd className="mt-0.5 text-foreground" data-testid="overview-branch-count">
                {branches.length}
              </dd>
            </div>
          </dl>
          <Link
            href={`${pathname}?tab=identity`}
            scroll={false}
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            data-testid="overview-open-identity"
          >
            Open business identity
          </Link>
        </section>

        {/* Status snapshot */}
        <section
          className="rounded-lg border border-border bg-card p-4"
          data-testid="overview-status"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Lifecycle</dt>
              <dd>
                <Badge tone={merchantStatusTone(merchant.status)}>
                  {merchantStatusLabel(merchant.status)}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Verification</dt>
              <dd>
                <Badge tone={verificationTone(merchant.verificationStatus)}>
                  {verificationLabel(merchant.verificationStatus)}
                </Badge>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  )
}
