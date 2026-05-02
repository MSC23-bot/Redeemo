import { useEffect, useMemo, useState } from 'react'
import type { OpeningHourEntry } from '@/lib/api/merchant'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function parseTime(t: string): number {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return h * 60 + m
}

// Stop-gap until the branch-aware spec lands. Two real bugs this addresses:
//
//   1. Two consumers (MetaSection and AboutTab) call this hook independently;
//      `useMemo([hours])` only recomputes when `hours` changes, so the two
//      memoised results captured at different mount times can disagree on
//      the live `isOpen` boolean (e.g. one mounted at 11:58 says "Closed,
//      opens 12:00" while the other mounted at 12:01 says "Open now").
//      The 60-second `tick` below forces both consumers to recompute on the
//      same minute boundary, so they stay in sync.
//
//   2. Local computation here uses `now.getHours()` etc. — i.e. the user's
//      device timezone. A user in Qatar (UTC+3) reading a UK merchant gets
//      a wrong answer (UK time is 3h behind their device). When the caller
//      passes `serverIsOpenNow`, that authoritative server-computed value
//      (already in `Europe/London` per `src/api/shared/isOpenNow.ts`) wins
//      for the live `isOpen` boolean. The weekly schedule grid still uses
//      device time because "TODAY" sensibly tracks the user's calendar day.
//
// The proper fix lives in the branch-aware spec §5.5 + §7.1 — `selectedBranch.isOpenNow`
// computed server-side per branch. This hook becomes vestigial then.
export function useOpenStatus(hours: OpeningHourEntry[], serverIsOpenNow?: boolean) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  return useMemo(() => {
    const now = new Date()
    const todayDow = now.getDay()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    // openTime / closeTime are nullable on the wire (closed days come back
    // as null). Treat null-times the same as `isClosed: true` — defensive
    // at the boundary so the rest of this hook can assume non-null reads.
    const todayEntry = hours.find(h => h.dayOfWeek === todayDow)
    const todayOpen  = todayEntry && !todayEntry.isClosed && todayEntry.openTime  != null ? todayEntry.openTime  : null
    const todayClose = todayEntry && !todayEntry.isClosed && todayEntry.closeTime != null ? todayEntry.closeTime : null
    const localIsOpen = todayOpen != null && todayClose != null
      ? currentMinutes >= parseTime(todayOpen) && currentMinutes < parseTime(todayClose)
      : false

    // Server value wins when supplied. Local fallback only for callers that
    // haven't been wired through to the server's authoritative answer (or
    // for tests that don't care about the timezone correctness).
    const isOpen = serverIsOpenNow ?? localIsOpen

    const hoursText = isOpen && todayClose
      ? `Closes ${todayClose}`
      : todayOpen
      ? `Opens ${todayOpen}`
      : 'Closed today'

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

    return { isOpen, hoursText, weekSchedule, todayDow }
    // `tick` intentionally in deps so the memo recomputes once per minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, serverIsOpenNow, tick])
}
