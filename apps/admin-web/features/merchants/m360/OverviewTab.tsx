'use client'

/**
 * OverviewTab: a composed, read-only summary of the EXISTING merchant detail
 * payload (spec merchant-360-spec.md, Tab 1). No new backend fields.
 *
 *   - Status snapshot: lifecycle + verification pills.
 *   - Identity summary: category, website, branches / documents counts, and the
 *     contract status (A4 `agreement`), plus a link to the Business identity tab.
 *   - Primary contact (account owner): the A4 `owner` block (name / email / phone),
 *     with a verified-email indicator and the multi-owner hint.
 *   - Submit-for-review card (existing component), shown only when the admin
 *     holds `merchant:submit` AND the merchant is in a submittable state.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Globe, Mail, Phone, BadgeCheck } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import { SubmitForReviewCard } from '@/features/merchants/SubmitForReviewCard'
import { AgreementEvidenceCard } from '@/features/merchants/m360/AgreementEvidenceCard'
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

// Prettify a contract status enum (SIGNED / NOT_SIGNED) for display.
function contractLabel(status: string | undefined): string {
  if (status === 'SIGNED') return 'Signed'
  if (status === 'NOT_SIGNED') return 'Not signed'
  return status ?? 'Unknown'
}

export function OverviewTab({ data, canSubmit, onSubmitForReview }: OverviewTabProps) {
  const pathname = usePathname()
  const { merchant, branches } = data
  const showSubmitCard = canSubmit && merchant.canSubmitOnBehalf
  const owner = merchant.owner ?? null
  const extraOwners = (merchant.ownerCount ?? 0) - 1

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
                {merchant.headerCounts?.branches ?? branches.length}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Documents</dt>
              <dd className="mt-0.5 text-foreground" data-testid="overview-documents-count">
                {merchant.documentsCount ?? '-'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contract</dt>
              <dd className="mt-0.5 text-foreground" data-testid="overview-contract">
                {contractLabel(merchant.agreement?.contractStatus)}
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

          {/* Primary contact (account owner) — A4 owner block. This is the
              account owner's own contact; there is no separate business-level
              contact (branch contacts live on the Branches tab). */}
          <div className="mt-5 border-t border-border pt-4" data-testid="overview-owner">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Primary contact (account owner)
            </h3>
            {owner ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="sr-only">Name</dt>
                  <dd className="font-medium text-foreground" data-testid="overview-owner-name">
                    {owner.name}
                  </dd>
                  <Badge tone="neutral">Owner</Badge>
                  {extraOwners > 0 && (
                    <span className="text-xs text-muted-foreground" data-testid="overview-owner-more">
                      +{extraOwners} more owner{extraOwners === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-foreground" data-testid="overview-owner-email">
                  <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="break-all">{owner.email}</span>
                  {owner.emailVerified && (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-green-700"
                      data-testid="overview-owner-verified"
                    >
                      <BadgeCheck className="size-3.5" aria-hidden="true" />
                      Verified
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-foreground" data-testid="overview-owner-phone">
                  <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {owner.phone ? (
                    <span>{owner.phone}</span>
                  ) : (
                    <span className="italic text-muted-foreground">Not set</span>
                  )}
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground" data-testid="overview-owner-empty">
                No account owner is on record for this merchant yet.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* D65 Slice 4: contract / agreement evidence block. */}
      <AgreementEvidenceCard agreement={merchant.agreement} />
    </div>
  )
}
