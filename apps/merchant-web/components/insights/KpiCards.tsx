'use client'

/**
 * PR-B Task B4: the Insights overview KPI cards (spec 2.4, screenshot 02).
 *
 * Four KPIs driven by the /overview response:
 *   1) Redemption activity - logged headline + a Confirmed/Awaiting dual-layer
 *      secondary (Confirmed = the validated subset; Awaiting = logged not yet
 *      confirmed). Confirmed is a subset, never additive to logged.
 *   2) Distinct customers - the logged distinct count.
 *   3) Repeat-customer rate - HEADLINE KPI #3. This REPLACES the prototype's "Value
 *      delivered to customers" card; the word "Delivered" must not appear on the
 *      surface (spec 2.4 banned wording).
 *        - value null / insufficient -> "Building your repeat-customer picture"
 *        - { available:false }       -> a calm "Not available" (a gated metric, not
 *          a demographic placeholder).
 *   4) Secondary savings - "Estimated customer savings" (estimatedLogged) +
 *      "Estimated savings on confirmed redemptions" (estimatedConfirmed). These are
 *      ESTIMATED / potential, never "delivered".
 *
 * Each KPI shows its OWN comparison chip ONLY when its comparison != null (completed-
 * period-only; absent on this_month / all / an in-progress custom range). The repeat-
 * rate chip is gated together with the metric.
 *
 * Every metric carries a MetricInfo explainer (counting model, the logged-vs-confirmed
 * relationship, exclusions, the estimate caveat). House style: no em dashes; no emojis;
 * icons via @/lib/icons; colour via CSS var() tokens (never hardcoded hex).
 */
import * as React from 'react'
import { Ticket, Users, Repeat, PoundSterling, TrendingUp, TrendingDown, Minus } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { MetricInfo } from './MetricInfo'
import {
  formatGbp,
  formatCount,
  formatRatePercentValue,
  comparisonChip,
} from '@/lib/insights/format'
import { REPEAT_RATE_EXPLAINER } from '@/lib/insights/display'
import type { InsightsOverview, Comparison } from '@/lib/api/insights'

export interface KpiCardsProps {
  overview: InsightsOverview
  className?: string
}

// --- shared card chrome ------------------------------------------------------

function CardShell({
  testId,
  children,
}: {
  testId: string
  children: React.ReactNode
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  )
}

function CardHead({
  label,
  icon,
  info,
}: {
  label: string
  icon: React.ReactNode
  info: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </span>
        {info}
      </div>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: 'var(--tint)', color: 'var(--coral)' }}
        aria-hidden
      >
        {icon}
      </span>
    </div>
  )
}

// The per-KPI comparison chip. Rendered ONLY when comparison != null. Up reads in the
// success token; down in the warning token; flat is neutral. The directional glyph is
// decorative (the text carries the meaning).
function ComparisonChip({ comparison }: { comparison: Comparison }) {
  if (!comparison) return null
  const chip = comparisonChip(comparison)
  const tone =
    chip.direction === 'up'
      ? // Success-tinted background derived from the token (no --success-bg token exists);
        // mirrors the codebase color-mix convention rather than a hardcoded rgba.
        { color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 10%, transparent)' }
      : chip.direction === 'down'
        ? { color: 'var(--warning)', bg: 'var(--warning-bg)' }
        : { color: 'var(--text-secondary)', bg: 'var(--tint)' }
  const Glyph = chip.direction === 'up' ? TrendingUp : chip.direction === 'down' ? TrendingDown : Minus
  return (
    <span
      className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ color: tone.color, background: tone.bg }}
    >
      <Glyph size={13} aria-hidden />
      {chip.text}
    </span>
  )
}

// --- the cards ---------------------------------------------------------------

export function KpiCards({ overview, className }: KpiCardsProps) {
  const { redemptionActivity, distinctCustomers, repeatRate, savings } = overview

  const repeatGated = 'available' in repeatRate
  const repeatInsufficient =
    !repeatGated && (repeatRate.value === null || repeatRate.insufficient)
  const repeatComparison: Comparison = repeatGated ? null : repeatRate.comparison

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {/* 1) Redemption activity --------------------------------------------- */}
      <CardShell testId="kpi-redemption-activity">
        <CardHead
          label="Redemption activity"
          icon={<Ticket size={18} />}
          info={
            <MetricInfo
              label="About redemption activity"
              ariaLabel="What counts as redemption activity"
            >
              Redemption activity counts every voucher a customer logged in this
              selection. Confirmed is the subset later validated by staff; Awaiting is
              logged but not yet confirmed. Confirmed plus Awaiting equals the logged
              total. Excludes test, deleted, and removed records.
            </MetricInfo>
          }
        />
        <div className="flex flex-col gap-2">
          <span
            className="text-4xl font-semibold leading-none"
            style={{ color: 'var(--navy)' }}
          >
            {formatCount(redemptionActivity.logged)}
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: 'var(--chart-confirmed)' }}
                aria-hidden
              />
              Confirmed{' '}
              <span className="font-semibold" style={{ color: 'var(--navy)' }}>
                {formatCount(redemptionActivity.confirmed)}
              </span>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: 'var(--chart-awaiting)' }}
                aria-hidden
              />
              Awaiting{' '}
              <span className="font-semibold" style={{ color: 'var(--navy)' }}>
                {formatCount(redemptionActivity.awaiting)}
              </span>
            </span>
          </div>
        </div>
        <ComparisonChip comparison={redemptionActivity.comparison} />
      </CardShell>

      {/* 2) Distinct customers --------------------------------------------- */}
      <CardShell testId="kpi-distinct-customers">
        <CardHead
          label="Distinct customers"
          icon={<Users size={18} />}
          info={
            <MetricInfo
              label="About distinct customers"
              ariaLabel="What counts as a distinct customer"
            >
              The number of different customers who logged at least one redemption in
              this selection. A customer who redeemed more than once is counted once.
              Excludes test, deleted, and removed records.
            </MetricInfo>
          }
        />
        <div className="flex flex-col gap-2">
          <span
            className="text-4xl font-semibold leading-none"
            style={{ color: 'var(--navy)' }}
          >
            {formatCount(distinctCustomers.logged)}
          </span>
        </div>
        <ComparisonChip comparison={distinctCustomers.comparison} />
      </CardShell>

      {/* 3) Repeat-customer rate (HEADLINE KPI #3, replaces "Value delivered") */}
      <CardShell testId="kpi-repeat-rate">
        <CardHead
          label="Repeat-customer rate"
          icon={<Repeat size={18} />}
          info={
            <MetricInfo
              label="About the repeat-customer rate"
              ariaLabel="How the repeat-customer rate is measured"
            >
              {REPEAT_RATE_EXPLAINER}
            </MetricInfo>
          }
        />
        {repeatGated ? (
          // Calm gated treatment: this is a metric not available in this build, NOT a
          // demographic placeholder.
          <div className="flex flex-col gap-1">
            <span
              className="text-lg font-semibold leading-snug"
              style={{ color: 'var(--text-secondary)' }}
            >
              Not available
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              This measure is not shown in your view.
            </span>
          </div>
        ) : repeatInsufficient ? (
          <div className="flex flex-col gap-1">
            <span
              className="text-lg font-semibold leading-snug"
              style={{ color: 'var(--text-secondary)' }}
            >
              Building your repeat-customer picture
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              We will show this once enough customers are in view.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span
              className="text-4xl font-semibold leading-none"
              style={{ color: 'var(--navy)' }}
            >
              {formatRatePercentValue(repeatRate.value as number)}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Customers who came back to you.
            </span>
          </div>
        )}
        <ComparisonChip comparison={repeatComparison} />
      </CardShell>

      {/* 4) Secondary savings ---------------------------------------------- */}
      <CardShell testId="kpi-savings">
        <CardHead
          label="Estimated savings"
          icon={<PoundSterling size={18} />}
          info={
            <MetricInfo
              label="About estimated savings"
              ariaLabel="How estimated savings are calculated"
            >
              An estimate of the potential customer savings across logged redemptions,
              based on the stated value of each voucher. The confirmed figure is the
              subset validated by staff. These are estimated, not guaranteed.
            </MetricInfo>
          }
        />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Estimated customer savings
            </span>
            <span
              className="text-2xl font-semibold leading-none"
              style={{ color: 'var(--navy)' }}
            >
              {formatGbp(savings.estimatedLogged)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Estimated savings on confirmed redemptions
            </span>
            <span
              className="text-lg font-semibold leading-none"
              style={{ color: 'var(--text-secondary)' }}
            >
              {formatGbp(savings.estimatedConfirmed)}
            </span>
          </div>
        </div>
        <ComparisonChip comparison={savings.comparison} />
      </CardShell>
    </div>
  )
}
