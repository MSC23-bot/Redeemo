'use client'

// Branches PR-1 F10: the read-only Opening hours card (prototype 03/08). It renders the
// full Monday..Sunday day/time table read-only, including "Closed" days (a missing or
// isClosed row reads Closed). Each open day shows a friendly time range ("11am to
// 11pm"). The Today row is highlighted via the Europe/London weekday from openNow's
// helper.
//
// SCOPE (plan §F10): the Edit control is a DISABLED locked affordance (hours editing
// ships in PR-4) and there is a locked Multi-window affordance (PR-8). The "2 hour
// customer cool off" chip is OMITTED ENTIRELY (cool-off ships in PR-4): it must never
// render, even statically. The card is read-only for everyone.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { Card } from '@/components/ui/card'
import { Clock } from '@/lib/icons'
import { LockedAffordance } from '@/components/branches/LockedAffordance'
import type { OpeningHoursRow } from '@/lib/branches/openNow'
import type { Branch } from '@/lib/api/branch'

// Display order: Monday first through Sunday (prototype 03/08). dayOfWeek 0=Sun.
const DAYS: { dow: number; label: string }[] = [
  { dow: 1, label: 'Monday' },
  { dow: 2, label: 'Tuesday' },
  { dow: 3, label: 'Wednesday' },
  { dow: 4, label: 'Thursday' },
  { dow: 5, label: 'Friday' },
  { dow: 6, label: 'Saturday' },
  { dow: 0, label: 'Sunday' },
]

const LONDON_WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function londonDayOfWeek(now: Date): number {
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' })
    .formatToParts(now)
    .find((p) => p.type === 'weekday')?.value
  return weekday ? LONDON_WEEKDAY_MAP[weekday] : -1
}

// "HH:MM" (24h) -> "9am" / "12:30pm" / "noon" / "midnight".
function friendlyTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h)) return hhmm
  if (m === 0 && h === 12) return 'noon'
  if (m === 0 && (h === 0 || h === 24)) return 'midnight'
  const period = h >= 12 && h < 24 ? 'pm' : 'am'
  let hour12 = h % 12
  if (hour12 === 0) hour12 = 12
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, '0')}${period}`
}

function rowText(row: OpeningHoursRow | undefined): string {
  if (!row || row.isClosed || !row.openTime || !row.closeTime) return 'Closed'
  return `${friendlyTime(row.openTime)} to ${friendlyTime(row.closeTime)}`
}

export function OpeningHoursCard({
  branch,
  isOwner,
  now = new Date(),
}: {
  branch: Branch
  isOwner: boolean
  now?: Date
}) {
  const hours = (branch.openingHours ?? []) as OpeningHoursRow[]
  const todayDow = londonDayOfWeek(now)

  return (
    <Card className="gap-4" data-testid="branch-hours-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div className="flex items-center gap-2">
          <Clock size={16} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="font-display text-lg font-semibold text-foreground">Opening hours</h2>
        </div>
        {/* Locked PR-4 hours-edit affordance (tooltip-only, sits beside the title). */}
        {isOwner ? <LockedAffordance label="Edit" variant="link" subtext={false} /> : null}
      </div>

      <div className="px-6">
        <dl className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {DAYS.map(({ dow, label }) => {
            const row = hours.find((h) => h.dayOfWeek === dow)
            const text = rowText(row)
            const isToday = dow === todayDow
            const closed = text === 'Closed'
            return (
              <div
                key={dow}
                className="flex items-center justify-between py-2.5 text-sm"
                data-testid={`hours-row-${dow}`}
              >
                <dt className="flex items-center gap-2 text-foreground">
                  {label}
                  {isToday ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
                      style={{ background: 'var(--tint-deep)', color: 'var(--rose)' }}
                    >
                      Today
                    </span>
                  ) : null}
                </dt>
                <dd className={closed ? 'text-muted-foreground' : 'text-foreground'}>{text}</dd>
              </div>
            )
          })}
        </dl>

        {/* Locked PR-8 multi-window affordance. Disabled, no network. */}
        {isOwner ? (
          <div className="pt-3">
            <LockedAffordance label="Add a second window" icon={<Clock size={14} aria-hidden />} />
          </div>
        ) : null}
      </div>
    </Card>
  )
}
