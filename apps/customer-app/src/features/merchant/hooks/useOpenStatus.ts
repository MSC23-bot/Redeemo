import { useEffect, useMemo, useReducer } from 'react'
import type { OpeningHourEntry } from '@/lib/api/merchant'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const WEEKDAY_TO_DOW: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

// Resolve `now` into Europe/London-local day-of-week. Uses
// `Intl.DateTimeFormat` with an explicit `timeZone` to ignore the device
// clock — a user in Qatar (UTC+3) reading a UK merchant gets the same
// "TODAY" highlight as a user in London. UK-only platform per overall
// product spec; international expansion will need a `Merchant.timezone`
// field (deferred — see deferred-followups index §A).
function getLondonTodayDow(now: Date): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
  })
  const weekdayShort = formatter.formatToParts(now).find(p => p.type === 'weekday')?.value ?? 'Sun'
  return WEEKDAY_TO_DOW[weekdayShort] ?? 0
}

// Schedule-grid helper. After P2.10 the hook no longer computes `isOpen`
// or `hoursText` — those came from the legacy server-trust shim that was
// vestigial once `selectedBranch.isOpenNow` started flowing from the
// backend per spec §5.5. Today the hook only marks "TODAY" on the row
// matching London's day-of-week and renders hours strings; the live
// open/closed pill is the parent's responsibility (it now reads
// `selectedBranch.isOpenNow` directly).
//
// 60-second tick keeps the "TODAY" highlight correct across midnight
// without requiring the parent to remount.
export function useOpenStatus(hours: OpeningHourEntry[]) {
  const [tick, forceTick] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    const id = setInterval(forceTick, 60_000)
    return () => clearInterval(id)
  }, [])

  return useMemo(() => {
    const todayDow = getLondonTodayDow(new Date())
    const weekSchedule = DAY_NAMES.map((name, i) => {
      const entry = hours.find(h => h.dayOfWeek === i)
      const isToday = i === todayDow
      if (!entry || entry.isClosed || entry.openTime == null || entry.closeTime == null) {
        return { day: name, shortDay: SHORT_DAYS[i]!, hours: 'Closed', isToday, isClosed: true }
      }
      return {
        day: name,
        shortDay: SHORT_DAYS[i]!,
        hours: `${entry.openTime} – ${entry.closeTime}`,
        isToday,
        isClosed: false,
      }
    })
    return { weekSchedule }
    // `tick` is intentionally in deps to invalidate the memo every 60s so
    // `getLondonTodayDow(new Date())` re-evaluates against fresh wall-clock time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, tick])
}
