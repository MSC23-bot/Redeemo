'use client'

/**
 * Approval review page — /queue/[id]
 *
 * Fully read-only. No action buttons. Shows the full review context for a
 * single MERCHANT_ONBOARDING approval. Gated on approval:read capability.
 *
 * Layout: two-column (main content left, sidebar right) on lg+, single column
 * on smaller screens.
 */
import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useReview } from '@/lib/review/useReview'
import { MerchantHeader } from '@/features/review/MerchantHeader'
import { ProfileCard } from '@/features/review/ProfileCard'
import { BranchTable } from '@/features/review/BranchTable'
import { DocumentList } from '@/features/review/DocumentList'
import { VoucherList } from '@/features/review/VoucherList'
import { ChecklistSummary } from '@/features/review/ChecklistSummary'
import { ThinAreaFlags } from '@/features/review/ThinAreaFlags'
import { ActivityList } from '@/features/review/ActivityList'

// ── Shared loading / error / forbidden ───────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20" data-testid="review-loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading review" />
    </div>
  )
}

function ForbiddenState() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center" data-testid="review-forbidden">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-semibold text-foreground">Access denied</h2>
      <p className="text-sm text-muted-foreground">
        You do not have permission to view approval reviews. Contact your administrator.
      </p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
      data-testid="review-error"
    >
      <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
      <p className="mb-4 text-sm text-destructive">
        Could not load this review. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-medium text-primary hover:underline"
      >
        Retry
      </button>
    </div>
  )
}

// ── Non-onboarding notice ─────────────────────────────────────────────────────

function NonOnboardingNotice({ type }: { type: string }) {
  return (
    <div
      className="rounded-lg border border-border bg-card px-6 py-10 text-center"
      data-testid="review-non-onboarding"
    >
      <p className="text-sm text-muted-foreground">
        This approval is of type <strong>{type}</strong>. The detailed review view is only
        available for merchant onboarding approvals.
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface ReviewPageProps {
  params: Promise<{ id: string }>
}

export default function ReviewPage({ params }: ReviewPageProps) {
  const { id } = use(params)
  const { ready, can } = useSession()
  const canRead = ready && can('approval:read')
  const { data, isLoading, isError, refetch } = useReview(id, canRead)

  if (!ready) {
    return <LoadingState />
  }

  if (!can('approval:read')) {
    return <ForbiddenState />
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb + back link */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/queue"
          className="flex items-center gap-1.5 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          aria-label="Back to approval queue"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Approval queue</span>
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground font-medium">
          {data?.merchant?.businessName ?? 'Review'}
        </span>
      </nav>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState onRetry={refetch} />
      ) : data.approval.type !== 'MERCHANT_ONBOARDING' ? (
        <NonOnboardingNotice type={data.approval.type} />
      ) : !data.merchant ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <div className="space-y-6">
          {/* Merchant header — full width */}
          <MerchantHeader merchant={data.merchant} approval={data.approval} />

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            {/* Left: main content */}
            <div className="space-y-6 min-w-0">
              <VoucherList vouchers={data.vouchers} />
              <BranchTable branches={data.branches} />
              <DocumentList documents={data.documents} />
              {data.thinAreas && <ThinAreaFlags thinAreas={data.thinAreas} />}
              <ActivityList activity={data.activity} />
            </div>

            {/* Right: sidebar */}
            <div className="space-y-6">
              {data.checklist && <ChecklistSummary checklist={data.checklist} />}
              <ProfileCard merchant={data.merchant} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
