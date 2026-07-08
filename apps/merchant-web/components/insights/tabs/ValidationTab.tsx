'use client'

/**
 * PR-B Task B6a: the Insights Validation tab (spec 9 / 1.8, screenshot 10).
 *
 * Driven by /validation:
 *   1) "Validation summary": confirmed + awaiting totals + the completion rate.
 *      completionRate is a 0..1 FRACTION on the wire and is displayed as a whole-number
 *      percent via formatRateAsPercent (rate * 100), never as the raw fraction.
 *      Framing (spec 2.4 locked): "Confirmed = validated by staff; Awaiting = logged,
 *      not yet confirmed." The prototype's "honoured" wording is BANNED.
 *   2) "How they were confirmed": an ADAPTIVE method breakdown from methods[]. It is
 *      shown ONLY when MORE THAN ONE method has data (count > 0). With zero or one
 *      method-with-data the split is not informative, so the whole card is hidden.
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens (never hardcoded hex).
 */
import * as React from 'react'
import { CircleCheck, ScanLine } from '@/lib/icons'
import { useQuery } from '@tanstack/react-query'
import { getInsightsValidation, type InsightsFilters } from '@/lib/api/insights'
import { formatCount, formatRateAsPercent } from '@/lib/insights/format'
import { LoadingStatus, SkeletonCard } from '@/components/ui/skeleton'
import { MetricInfo } from '../MetricInfo'

export interface ValidationTabProps {
  filters: InsightsFilters
}

/** Human-readable validation-method label (QR_SCAN -> "QR scan", MANUAL -> "Manual entry"). */
function methodLabel(method: string): string {
  const map: Record<string, string> = {
    QR_SCAN: 'QR scan',
    MANUAL: 'Manual entry',
    MANUAL_ENTRY: 'Manual entry',
  }
  if (map[method]) return map[method]
  const words = method.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const METHOD_TOKEN = ['var(--navy)', 'var(--vt-bogo)', 'var(--coral)', 'var(--vt-reusable)']

export function ValidationTab({ filters }: ValidationTabProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights', 'validation', filters],
    queryFn: () => getInsightsValidation(filters),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <LoadingStatus label="Loading validation...">
        {/* Two cards side by side (the confirmed/awaiting summary + the adaptive
            confirmation-method breakdown, which the real content sometimes hides). */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SkeletonCard lines={3} showIcon />
          <SkeletonCard lines={3} showIcon />
        </div>
      </LoadingStatus>
    )
  }

  if (isError || !data) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        We could not load validation activity just now. Please try again.
      </div>
    )
  }

  // Adaptive method breakdown: only meaningful when MORE THAN ONE method has data.
  const methodsWithData = data.methods.filter((m) => m.count > 0)
  const showMethods = methodsWithData.length > 1
  const methodTotal = methodsWithData.reduce((sum, m) => sum + m.count, 0)

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {/* 1) Validation summary --------------------------------------------- */}
      <section
        data-testid="validation-summary"
        className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
                Confirmed and awaiting
              </h2>
              <MetricInfo
                label="About confirmed and awaiting"
                ariaLabel="What confirmed and awaiting mean"
              >
                Confirmed = validated by staff; Awaiting = logged, not yet confirmed.
                The completion rate is the share of logged redemptions that staff have
                confirmed. Awaiting is an operational queue, not a headline figure.
                Excludes test accounts, QA accounts, and deleted customers.
              </MetricInfo>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Confirmed = validated by staff; Awaiting = logged, not yet confirmed.
            </p>
          </div>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--tint)', color: 'var(--coral)' }}
            aria-hidden
          >
            <CircleCheck size={18} />
          </span>
        </header>

        {/* completion-rate bar (confirmed as a share of logged) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Completion rate
            </span>
            <span
              className="text-2xl font-semibold leading-none tabular-nums"
              style={{ color: 'var(--navy)' }}
            >
              {formatRateAsPercent(data.completionRate)}
            </span>
          </div>
          <div
            aria-hidden
            className="h-2.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--chart-awaiting)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(Math.max(0, Math.min(1, data.completionRate)) * 100)}%`,
                background: 'var(--success)',
              }}
            />
          </div>
        </div>

        {/* confirmed + awaiting rows */}
        <ul className="flex flex-col">
          <li
            className="flex items-center justify-between gap-3 border-b py-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: 'var(--success)' }}
                />
                Confirmed
              </span>
              <span className="pl-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                Validated by staff.
              </span>
            </span>
            <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--navy)' }}>
              {formatCount(data.confirmed)}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 py-3">
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: 'var(--warning)' }}
                />
                Awaiting
              </span>
              <span className="pl-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                Logged, not yet confirmed. An operational queue, not a headline figure.
              </span>
            </span>
            <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--navy)' }}>
              {formatCount(data.awaiting)}
            </span>
          </li>
        </ul>
      </section>

      {/* 2) Adaptive method breakdown (only when >1 method has data) -------- */}
      {showMethods ? (
        <section
          data-testid="validation-methods"
          className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <header className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
                  How they were confirmed
                </h2>
                <MetricInfo
                  label="About the confirmation methods"
                  ariaLabel="How the confirmation-method split is counted"
                >
                  The split between QR scans in the staff app and manual code entry,
                  across confirmed redemptions in this selection. Shown only when more
                  than one method is in use. Excludes test accounts, QA accounts, and
                  deleted customers.
                </MetricInfo>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                The split between QR scans in the staff app and manual code entry.
              </p>
            </div>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'var(--tint)', color: 'var(--coral)' }}
              aria-hidden
            >
              <ScanLine size={18} />
            </span>
          </header>

          <ul className="flex flex-col gap-3">
            {methodsWithData.map((m, i) => {
              const pct = methodTotal > 0 ? Math.round((m.count / methodTotal) * 100) : 0
              const color = METHOD_TOKEN[i % METHOD_TOKEN.length]
              return (
                <li key={m.method} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: color }}
                      />
                      {methodLabel(m.method)}
                    </span>
                    <span className="shrink-0 text-base font-semibold tabular-nums" style={{ color: 'var(--navy)' }}>
                      {formatCount(m.count)}
                    </span>
                  </div>
                  <div
                    aria-hidden
                    className="h-2 w-full overflow-hidden rounded-full"
                    style={{ background: 'var(--chart-awaiting)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {pct}% of confirmations
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
