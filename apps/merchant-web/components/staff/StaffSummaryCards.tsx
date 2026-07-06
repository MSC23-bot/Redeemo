'use client'

/**
 * Staff & Access (v1) PR-C: the three summary cards.
 *   - People: headline = TOTAL people (active + deactivated); sub-line reads
 *     "{active} active, {deactivated} deactivated" (or just "{active} active"
 *     when nobody is deactivated; the active figure is never dropped).
 *   - Portal users "X of 8 team members" (hardcoded PORTAL_CAP) + a filled navy
 *     allowance bar and "{n} places left".
 *   - App users "X of 20 validation logins" (hardcoded APP_CAP) + the same
 *     allowance bar treatment.
 * Plus an allowance banner when a cap is full ("contact Redeemo to raise"; no
 * in-product upgrade, spec §2 / §6). Caps are placeholders, not per-merchant
 * configurable in v1.
 *
 * House style: brand tokens (no hardcoded hex), no em-dashes, SVG icons not emojis.
 */
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Users, Globe, Smartphone, Info } from '@/lib/icons'
import { PORTAL_CAP, APP_CAP } from '@/lib/staff/display'

export interface StaffCounts {
  /** Headline for the People card: active + deactivated (everyone, not just active). */
  peopleTotal: number
  peopleActive: number
  peopleDeactivated: number
  portalUsed: number
  appUsed: number
}

/** Filled-navy allowance bar: how much of a cap (portal/app) is used. */
function ProgressBar({ used, cap }: { used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.max(0, (used / cap) * 100)) : 0
  const placesLeft = Math.max(0, cap - used)
  return (
    <div className="mt-2 space-y-1">
      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={cap}
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--subtle)' }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: 'var(--navy)' }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{placesLeft} places left</p>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  progress,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  /** Optional allowance bar (Portal users / App users cards only). */
  progress?: { used: number; cap: number }
}) {
  return (
    <Card className="gap-3 py-5">
      <div className="flex items-start gap-3 px-6">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--tint)', color: 'var(--rose)' }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-semibold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{sub}</p>
          {progress && <ProgressBar used={progress.used} cap={progress.cap} />}
        </div>
      </div>
    </Card>
  )
}

export function StaffSummaryCards({ counts }: { counts: StaffCounts }) {
  const portalFull = counts.portalUsed >= PORTAL_CAP
  const appFull = counts.appUsed >= APP_CAP

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          icon={<Users size={18} />}
          label="People"
          value={String(counts.peopleTotal)}
          sub={
            counts.peopleDeactivated > 0
              ? `${counts.peopleActive} active, ${counts.peopleDeactivated} deactivated`
              : `${counts.peopleActive} active`
          }
        />
        <SummaryCard
          icon={<Globe size={18} />}
          label="Portal users"
          value={`${counts.portalUsed} of ${PORTAL_CAP}`}
          sub="team members"
          progress={{ used: counts.portalUsed, cap: PORTAL_CAP }}
        />
        <SummaryCard
          icon={<Smartphone size={18} />}
          label="App users"
          value={`${counts.appUsed} of ${APP_CAP}`}
          sub="validation logins"
          progress={{ used: counts.appUsed, cap: APP_CAP }}
        />
      </div>

      {(portalFull || appFull) && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-[14px] p-4"
          style={{ background: 'var(--warning-bg)', border: '1px solid #F3D8AE' }}
        >
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
          <div className="text-sm" style={{ color: 'var(--warning)' }}>
            <p className="font-semibold">
              {portalFull && appFull
                ? 'You have reached your portal and app user limits.'
                : portalFull
                  ? 'You have reached your portal user limit.'
                  : 'You have reached your app user limit.'}
            </p>
            <p>Contact Redeemo to raise your limits.</p>
          </div>
        </div>
      )}
    </div>
  )
}
