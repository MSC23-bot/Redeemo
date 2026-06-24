import { useEffect, useMemo, useReducer } from 'react'
import type { OpeningHourEntry } from '@/lib/api/merchant'
import { getLondonClock } from '../utils/londonNow'
import { formatDayHours } from '../utils/branchHoursFormat'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// Day-of-week now resolved through the shared `getLondonClock(now).dow`
// helper. The previous inline implementation read `weekday: 'short'` via
// `Intl.DateTimeFormat` and looked up the resulting string in a
// `{ Sun: 0, Mon: 1, ... }` map; that path silently fell back to Sunday
// when the device's Hermes build lacked en-GB short-weekday CLDR data
// (the on-device "TODAY badge stuck on Sunday" symptom reported on
// Tue 2026-05-05). The new helper uses numeric date parts only, which
// are universally supported, then derives DOW via `getUTCDay()`.

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
    const todayDow = getLondonClock(new Date()).dow
    const weekSchedule = DAY_NAMES.map((name, i) => {
      const isToday = i === todayDow
      // Branches PR-8 (D9): group ALL of this day's rows into N windows via
      // the shared multi-window formatter. A closed day (one isClosed row,
      // OR zero open windows) renders "Closed"; an open day renders its
      // windows comma-joined and openTime-ascending; 24:00 close →
      // "to midnight"; a full 00:00→24:00 day → "Open 24 hours"; an overnight
      // window (close < open) renders honestly ("6:00 pm to 2:00 am").
      const text = formatDayHours(hours, i)
      return {
        day: name,
        shortDay: SHORT_DAYS[i]!,
        hours: text,
        isToday,
        isClosed: text === 'Closed',
      }
    })
    return { weekSchedule }
    // `tick` is intentionally in deps to invalidate the memo every 60s so
    // `getLondonTodayDow(new Date())` re-evaluates against fresh wall-clock time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, tick])
}
