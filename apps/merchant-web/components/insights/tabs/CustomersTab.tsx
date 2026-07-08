'use client'

/**
 * PR-B Task B6b: the Insights Customers tab (spec 8 / 1.7, screenshot 07 - demographics
 * EXCLUDED).
 *
 * RELEASE-1 scope is deliberately narrow: ONLY the New-vs-returning split + the
 * repeat-customer rate. The demographic sections from the prototype (age, gender,
 * location) are ENTIRELY ABSENT from PR-B - there is no disabled card, skeleton, or
 * "coming soon" placeholder for them. The prototype's anonymity / suppression banner is
 * BANNED (it would advertise data we do not show).
 *
 * Driven by /customers:
 *   - newVsReturning: { newCount, returningCount, total } | { available:false }
 *   - repeatRate:     { value, insufficient, comparison } | { available:false }
 *
 * Locked copy (spec 2.4):
 *   - Labels: "New to you" / "Already a customer" (NOT "Returning"/"came back").
 *   - Repeat-rate insufficient: "Building your repeat-customer picture".
 *   - A gated ({ available:false }) block shows a calm "Not available" treatment - it is
 *     NOT a demographic placeholder.
 *   - "Delivered" / "Value delivered" must not appear.
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens (never hardcoded hex).
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserPlus, Repeat } from '@/lib/icons'
import { getInsightsCustomers, type InsightsFilters } from '@/lib/api/insights'
import { formatCount, formatRatePercentValue, comparisonChip } from '@/lib/insights/format'
import { REPEAT_RATE_EXPLAINER } from '@/lib/insights/display'
import { LoadingStatus, SkeletonCard } from '@/components/ui/skeleton'
import { MetricInfo } from '../MetricInfo'

export interface CustomersTabProps {
  filters: InsightsFilters
}

/** A calm shared "Not available" treatment for a gated block (NOT a demographic stub). */
function NotAvailable() {
  return (
    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
      Not available for this selection.
    </p>
  )
}

export function CustomersTab({ filters }: CustomersTabProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights', 'customers', filters],
    queryFn: () => getInsightsCustomers(filters),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <LoadingStatus label="Loading customers...">
        {/* Two KPI-style cards side by side (new-vs-returning + repeat rate). */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SkeletonCard lines={2} showIcon />
          <SkeletonCard lines={2} showIcon />
        </div>
      </LoadingStatus>
    )
  }

  if (isError || !data) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        We could not load customer activity just now. Please try again.
      </div>
    )
  }

  const nvr = data.newVsReturning
  const nvrAvailable = 'newCount' in nvr
  const total = nvrAvailable ? nvr.total : 0
  const newShare = nvrAvailable && total > 0 ? Math.round((nvr.newCount / total) * 100) : 0
  const returningShare = nvrAvailable && total > 0 ? 100 - newShare : 0

  const rr = data.repeatRate
  const rrAvailable = 'value' in rr
  const rrChip = rrAvailable && rr.comparison ? comparisonChip(rr.comparison) : null

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {/* New-vs-returning -------------------------------------------------- */}
      <section
        data-testid="customers-new-returning"
        className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
                New and existing customers
              </h2>
              <MetricInfo
                label="About new and existing customers"
                ariaLabel="How new and existing customers are counted"
              >
                New to you means a customer redeeming with you for the first time in this
                selection. Already a customer means someone who has redeemed with you
                before. A loyalty signal, counted at the group level only. Excludes test
                accounts, QA accounts, and deleted customers.
              </MetricInfo>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              How many customers are redeeming with you for the first time.
            </p>
          </div>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--tint)', color: 'var(--coral)' }}
            aria-hidden
          >
            <UserPlus size={18} />
          </span>
        </header>

        {nvrAvailable ? (
          <>
            {/* share bar (new vs already-a-customer) */}
            <div
              aria-hidden
              className="flex h-3 w-full overflow-hidden rounded-full"
              style={{ background: 'var(--chart-awaiting)' }}
            >
              <div className="h-full" style={{ width: `${newShare}%`, background: 'var(--coral)' }} />
              <div
                className="h-full"
                style={{ width: `${returningShare}%`, background: 'var(--success)' }}
              />
            </div>

            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <li className="flex flex-col gap-1">
                <span
                  className="flex items-center gap-2 text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: 'var(--coral)' }}
                  />
                  New to you
                </span>
                <span
                  className="text-3xl font-semibold leading-none tabular-nums"
                  style={{ color: 'var(--navy)' }}
                >
                  {formatCount(nvr.newCount)}
                </span>
                {total > 0 ? (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {newShare}% of customers, first time with you
                  </span>
                ) : null}
              </li>
              <li className="flex flex-col gap-1">
                <span
                  className="flex items-center gap-2 text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: 'var(--success)' }}
                  />
                  Already a customer
                </span>
                <span
                  className="text-3xl font-semibold leading-none tabular-nums"
                  style={{ color: 'var(--navy)' }}
                >
                  {formatCount(nvr.returningCount)}
                </span>
                {total > 0 ? (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {returningShare}% have redeemed with you before
                  </span>
                ) : null}
              </li>
            </ul>
          </>
        ) : (
          <NotAvailable />
        )}
      </section>

      {/* Repeat-customer rate --------------------------------------------- */}
      <section
        data-testid="customers-repeat-rate"
        className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
                Repeat-customer rate
              </h2>
              <MetricInfo
                label="About the repeat-customer rate"
                ariaLabel="How the repeat-customer rate is counted"
              >
                {REPEAT_RATE_EXPLAINER}
              </MetricInfo>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              How many of your customers come back to redeem again.
            </p>
          </div>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--tint)', color: 'var(--coral)' }}
            aria-hidden
          >
            <Repeat size={18} />
          </span>
        </header>

        {!rrAvailable ? (
          <NotAvailable />
        ) : rr.insufficient || rr.value === null ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Building your repeat-customer picture. We will show this once there is enough
            activity to be meaningful.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <span
              className="text-4xl font-semibold leading-none tabular-nums"
              style={{ color: 'var(--navy)' }}
            >
              {formatRatePercentValue(rr.value)}
            </span>
            {rrChip ? (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {rrChip.text}
              </span>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
