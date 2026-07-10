'use client'

/**
 * InProgressOnboardingsSection : Leads & Onboarding hub, SECTION 2 (C1, task
 * brief item 2). A list of draft/incomplete merchants (pre-live statuses:
 * REGISTERED, PENDING_APPROVAL : see lib/leads/useInProgressOnboardings.ts),
 * each row linking straight into Merchant 360 to continue the application.
 *
 * This is a REAL read (the merchants directory, status-filtered), not the
 * prototype's assisted-onboarding-wizard-step resume list (C2, not built):
 * there is no `onResume`/wizard-step here, just "open this merchant in 360
 * and carry on" : matching what actually exists today.
 */
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import { merchantStatusLabel, merchantStatusTone } from '@/lib/ui/adminTones'
import { onboardingStepLabel, formatCreatedDate } from '@/features/leads/leadsFormat'
import type { MerchantSummary } from '@/lib/api/merchants'

export interface InProgressOnboardingsSectionProps {
  items: MerchantSummary[]
  total: number | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  displayCap: number
}

export function InProgressOnboardingsSection({
  items,
  total,
  isLoading,
  isError,
  onRetry,
  displayCap,
}: InProgressOnboardingsSectionProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          In-progress onboardings{total !== undefined ? ` · ${total}` : ''}
        </h2>
        <span className="text-xs text-muted-foreground">Started but not finished; resume any time</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading in-progress onboardings" />
        </div>
      ) : isError ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-center"
          data-testid="leads-in-progress-error"
        >
          <p className="text-sm text-destructive">Could not load in-progress onboardings.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground"
          data-testid="leads-in-progress-empty"
        >
          No draft or in-review merchants right now.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card" data-testid="leads-in-progress-list">
          {items.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              data-testid={`leads-in-progress-row-${m.id}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{m.businessName}</span>
                  <Badge tone={merchantStatusTone(m.status)}>{merchantStatusLabel(m.status)}</Badge>
                  <Badge tone="neutral">{onboardingStepLabel(m.onboardingStep)}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Created {formatCreatedDate(m.createdAt)}
                </p>
              </div>
              <Link href={`/merchants/${m.id}`} data-testid={`leads-continue-${m.id}`}>
                <Button type="button" size="sm">
                  Continue in Merchant 360
                </Button>
              </Link>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && total !== undefined && total > displayCap && (
        <p className="text-xs text-muted-foreground" data-testid="leads-in-progress-more">
          Showing the {displayCap} most recent of {total}.{' '}
          <Link href="/merchants" className="font-medium text-primary hover:underline">
            View all in Merchants
          </Link>
        </p>
      )}
    </>
  )
}
