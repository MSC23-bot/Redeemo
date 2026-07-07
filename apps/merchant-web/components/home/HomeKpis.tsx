'use client'

/**
 * The four Home KPI tiles (home-1, second row). Reuse-only: numbers come from the
 * already-fetched overview / vouchers / busy-times reads. House style: no emojis, no
 * em-dashes, tokens only.
 *
 * "New customers this cycle" is STAGED HONESTLY: it maps to the behavioural
 * new-vs-returning split which is default-OFF / fail-closed, so this tile renders a
 * clearly-gated "coming" state (mirroring the Insights Customers tab's available:false
 * treatment). It NEVER fabricates a number and NEVER substitutes an ungated metric as
 * if it were "new".
 */
import * as React from 'react'
import { Users, Ticket, Clock } from '@/lib/icons'
import { formatCount } from '@/lib/insights/format'

function TileShell({
  testId,
  accent,
  children,
}: {
  testId: string
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-2 rounded-2xl border p-5 shadow-sm"
      style={
        accent
          ? { borderColor: 'var(--tint-deep)', background: 'var(--tint)' }
          : { borderColor: 'var(--border)', background: 'var(--card)' }
      }
    >
      {children}
    </div>
  )
}

function TileLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
      style={{ color: 'var(--text-muted)' }}
    >
      {icon ? (
        <span aria-hidden style={{ color: 'var(--coral)' }}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}

export interface HomeKpisProps {
  /** distinctCustomers.logged (all-time). */
  customersBroughtIn: number
  /** count of ACTIVE vouchers (flagship + custom). */
  liveVouchers: number
  /** busy-times busiest weekday label, or null when not yet known. */
  busiestDay: string | null
}

export function HomeKpis({ customersBroughtIn, liveVouchers, busiestDay }: HomeKpisProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1) Customers brought in (accent tile) */}
      <TileShell testId="home-kpi-customers" accent>
        <TileLabel icon={<Users size={14} />}>Customers brought in</TileLabel>
        <span className="text-4xl font-semibold leading-none" style={{ color: 'var(--navy)' }}>
          {formatCount(customersBroughtIn)}
        </span>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Distinct customers who have redeemed with you.
        </span>
      </TileShell>

      {/* 2) New customers this cycle (STAGED gated/coming - no fabricated number) */}
      <TileShell testId="home-kpi-new-customers">
        <div className="flex items-center justify-between gap-2">
          <TileLabel>New customers this cycle</TileLabel>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          >
            Coming soon
          </span>
        </div>
        <span
          className="text-lg font-semibold leading-snug"
          style={{ color: 'var(--text-secondary)' }}
        >
          Not yet available
        </span>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          The new-versus-returning split is being built. It will show here once ready.
        </span>
      </TileShell>

      {/* 3) Live vouchers */}
      <TileShell testId="home-kpi-live-vouchers">
        <TileLabel icon={<Ticket size={14} />}>Live vouchers</TileLabel>
        <span className="text-4xl font-semibold leading-none" style={{ color: 'var(--navy)' }}>
          {formatCount(liveVouchers)}
        </span>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Vouchers working for you right now.
        </span>
      </TileShell>

      {/* 4) Busiest day (or a gathering-data state) */}
      <TileShell testId="home-kpi-busiest-day">
        <TileLabel icon={<Clock size={14} />}>Busiest day</TileLabel>
        {busiestDay ? (
          <>
            <span
              className="text-3xl font-semibold leading-none"
              style={{ color: 'var(--navy)' }}
            >
              {busiestDay}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Your busiest day of the week so far.
            </span>
          </>
        ) : (
          <>
            <span
              className="text-lg font-semibold leading-snug"
              style={{ color: 'var(--text-secondary)' }}
            >
              Gathering data
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              We will show your busiest day once there are enough redemptions.
            </span>
          </>
        )}
      </TileShell>
    </div>
  )
}
