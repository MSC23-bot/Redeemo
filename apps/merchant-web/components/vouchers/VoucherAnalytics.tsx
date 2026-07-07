'use client'

/**
 * Slice E: per-voucher analytics, surfaced on the custom voucher detail page.
 *
 * A read-only stats section: four headline tiles (Redemptions / Customers / Days
 * live / Confirmed in person), a monthly "Redemptions over time" chart (reuses the
 * Insights <BarSeries>), a "When it is used" block (busiest days + times of day as
 * ORDINAL intensity bands, never raw counts, mirroring the Insights busy-times
 * privacy contract), and a "Where it is used" per-branch breakdown.
 *
 * Zero-redemption vouchers render a calm "No redemptions yet" empty state.
 *
 * House style: no emojis (SVG icons via @/lib/icons), no em dashes, colour via CSS
 * var() tokens (brand hexes live in tokens, never hardcoded here).
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ticket, Users, Clock, CheckCircle2, TrendingUp, MapPin } from '@/lib/icons'
import { getVoucherAnalytics, type VoucherAnalytics as VoucherAnalyticsData } from '@/lib/api/voucher'
import { BarSeries } from '@/components/insights/charts/BarSeries'

/** Mon=0..Sun=6 (the server day order). */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
/** The six locked Europe/London dayparts (index-aligned to the server daypart order). */
const DAYPART_LABELS = ['Overnight', 'Morning', 'Lunch', 'Afternoon', 'Evening', 'Late'] as const

/** The intensity ramp tokens, index 0..3 (same ramp the Insights heatmap uses). */
const INTENSITY_TOKENS = [
  'var(--chart-intensity-0)',
  'var(--chart-intensity-1)',
  'var(--chart-intensity-2)',
  'var(--chart-intensity-3)',
] as const

const INTENSITY_WORD = ['No redemptions', 'Quiet', 'Steady', 'Busy'] as const

function money(n: number): string {
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? String(r) : r.toFixed(2)
}

/** A short "3 May 2026" style date for the days-live subline. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function VoucherAnalytics({ voucherId }: { voucherId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['voucher-analytics', voucherId],
    queryFn: () => getVoucherAnalytics(voucherId),
    enabled: !!voucherId,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <SectionCard>
        <div role="status" aria-live="polite" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Loading this voucher&rsquo;s stats...
        </div>
      </SectionCard>
    )
  }

  if (isError || !data) {
    return (
      <SectionCard>
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            We could not load this voucher&rsquo;s stats just now.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border px-3 py-1.5 text-sm font-semibold"
            style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}
          >
            Try again
          </button>
        </div>
      </SectionCard>
    )
  }

  if (data.totals.logged === 0) {
    return (
      <SectionCard>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ background: 'var(--tint)', color: 'var(--coral)' }}
            aria-hidden
          >
            <TrendingUp size={20} />
          </span>
          <p className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
            No redemptions yet
          </p>
          <p className="max-w-sm text-sm" style={{ color: 'var(--text-secondary)' }}>
            Once customers start redeeming this voucher, its stats appear here: redemptions over
            time, your busiest days and times, and how it performs across your branches.
          </p>
        </div>
      </SectionCard>
    )
  }

  return (
    <div className="space-y-6" data-testid="voucher-analytics">
      <Tiles data={data} />
      <TrendCard data={data} />
      <div className="grid gap-6 lg:grid-cols-2">
        <WhenUsedCard data={data} />
        <WhereUsedCard data={data} />
      </div>
    </div>
  )
}

// --- Tiles --------------------------------------------------------------------

function Tiles({ data }: { data: VoucherAnalyticsData }) {
  const { totals, lifecycle } = data
  const liveDate = formatDate(lifecycle.liveSince)
  const daysLiveValue = lifecycle.daysLive == null ? 'Not live yet' : String(lifecycle.daysLive)
  const daysLiveSub =
    lifecycle.daysLive == null
      ? 'Not submitted or approved yet'
      : liveDate
        ? `since ${liveDate}`
        : 'days live'

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        icon={<Ticket size={16} />}
        label="Redemptions"
        value={String(totals.logged)}
        sub={
          totals.estimatedSavingLogged > 0
            ? `£${money(totals.estimatedSavingLogged)} saved for customers`
            : 'in total'
        }
      />
      <Tile
        icon={<Users size={16} />}
        label="Customers"
        value={String(totals.distinctCustomers)}
        sub={totals.distinctCustomers === 1 ? 'unique customer' : 'unique customers'}
      />
      <Tile
        icon={<Clock size={16} />}
        label="Days live"
        value={daysLiveValue}
        sub={daysLiveSub}
      />
      <Tile
        icon={<CheckCircle2 size={16} />}
        label="Confirmed in person"
        value={`${Math.round(totals.confirmedInPersonPct)}%`}
        sub={`${totals.confirmed} of ${totals.logged} by your team`}
        accent="success"
      />
    </div>
  )
}

function Tile({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  accent?: 'success'
}) {
  const valueColour = accent === 'success' ? 'var(--success)' : 'var(--navy)'
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          aria-hidden
        >
          {icon}
        </span>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tabular-nums" style={{ color: valueColour }}>
        {value}
      </p>
      <p className="mt-0.5 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        {sub}
      </p>
    </div>
  )
}

// --- Trend --------------------------------------------------------------------

const TREND_MONTHS = 8

function TrendCard({ data }: { data: VoucherAnalyticsData }) {
  // Reuse the Insights BarSeries. Show the most recent TREND_MONTHS buckets, oldest
  // to newest, mapped to the {label, logged, confirmed} the chart consumes.
  const months = data.trend.months.slice(-TREND_MONTHS)
  const series = months.map((m) => ({
    label: monthShort(m.monthStartLondon),
    logged: m.logged,
    confirmed: m.confirmed,
  }))
  return (
    <SectionCard>
      <CardHeader icon={<TrendingUp size={18} />} title="Redemptions over time">
        {months.length > 0 ? `Last ${months.length} ${months.length === 1 ? 'month' : 'months'}` : null}
      </CardHeader>
      {series.length > 0 ? (
        <BarSeries data={series} />
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No monthly redemptions to chart yet.
        </p>
      )}
    </SectionCard>
  )
}

/** `2026-05-01` -> `May`. */
function monthShort(monthStart: string): string {
  const d = new Date(`${monthStart}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return monthStart
  return d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
}

// --- When it is used ----------------------------------------------------------

function WhenUsedCard({ data }: { data: VoucherAnalyticsData }) {
  const { days, dayparts, busiestDay, busiestDaypart } = data.whenUsed
  const dayCaption = busiestDay != null ? `Busiest on ${fullDay(busiestDay)}.` : null
  const partCaption = busiestDaypart != null ? `Most used at ${DAYPART_LABELS[busiestDaypart] ?? ''}.` : null
  const caption = [dayCaption, partCaption].filter(Boolean).join(' ')

  return (
    <SectionCard>
      <CardHeader icon={<Clock size={18} />} title="When it is used">
        {caption || 'Relative intensity, not exact counts.'}
      </CardHeader>

      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Busiest days
          </p>
          <div className="flex items-end gap-2" role="img" aria-label={daysAria(days)}>
            {days.map((slot) => (
              <div key={slot.index} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-20 w-full items-end">
                  <div
                    className="w-full rounded-md"
                    style={{
                      height: `${bandHeightPct(slot.intensity)}%`,
                      minHeight: 4,
                      background: INTENSITY_TOKENS[slot.intensity] ?? INTENSITY_TOKENS[0],
                    }}
                  />
                </div>
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {DAY_LABELS[slot.index] ?? ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Times of day
          </p>
          <ul className="space-y-2" role="img" aria-label={daypartsAria(dayparts)}>
            {dayparts.map((slot) => (
              <li key={slot.index} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                  {DAYPART_LABELS[slot.index] ?? ''}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--chart-intensity-0)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${bandHeightPct(slot.intensity)}%`,
                      background: INTENSITY_TOKENS[Math.max(1, slot.intensity)] ?? INTENSITY_TOKENS[1],
                    }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  {INTENSITY_WORD[slot.intensity]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Shown as relative intensity bands, not exact numbers, so quiet slots cannot be traced back
          to individual customers. In UK time. Excludes test and deleted accounts.
        </p>
      </div>
    </SectionCard>
  )
}

/** A band 0..3 -> a bar fill percentage. 0 stays visible as a faint baseline. */
function bandHeightPct(band: number): number {
  switch (band) {
    case 3:
      return 100
    case 2:
      return 66
    case 1:
      return 33
    default:
      return 8
  }
}

function fullDay(index: number): string {
  return (
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][index] ??
    (DAY_LABELS[index] ?? '')
  )
}

function daysAria(days: VoucherAnalyticsData['whenUsed']['days']): string {
  return (
    'Busiest days, relative intensity. ' +
    days.map((s) => `${DAY_LABELS[s.index] ?? ''}: ${INTENSITY_WORD[s.intensity]}`).join('. ') +
    '.'
  )
}

function daypartsAria(dayparts: VoucherAnalyticsData['whenUsed']['dayparts']): string {
  return (
    'Times of day, relative intensity. ' +
    dayparts.map((s) => `${DAYPART_LABELS[s.index] ?? ''}: ${INTENSITY_WORD[s.intensity]}`).join('. ') +
    '.'
  )
}

// --- Where it is used ---------------------------------------------------------

function WhereUsedCard({ data }: { data: VoucherAnalyticsData }) {
  const branches = data.whereUsed.branches
  return (
    <SectionCard>
      <CardHeader icon={<MapPin size={18} />} title="Where it is used">
        {branches.length > 1
          ? 'How this voucher performs across your branches.'
          : 'This voucher is redeemed at your branch.'}
      </CardHeader>
      {branches.length > 0 ? (
        <ul className="space-y-3">
          {branches.map((b) => (
            <li key={b.branchId} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-semibold" style={{ color: 'var(--navy)' }}>
                  {b.name}
                </span>
                <span className="shrink-0 text-[13px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {b.logged} ({Math.round(b.sharePct)}%)
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--chart-intensity-0)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, b.sharePct)}%`, background: 'var(--chart-logged)' }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No branch activity to show yet.
        </p>
      )}
      {branches.length === 1 ? (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Add more branches to see how this voucher performs across each location.
        </p>
      ) : null}
    </SectionCard>
  )
}

// --- Shared chrome ------------------------------------------------------------

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm" style={{ borderColor: 'var(--border)' }}>
      {children}
    </section>
  )
}

function CardHeader({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          aria-hidden
        >
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
            {title}
          </h2>
          {children ? (
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {children}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  )
}
