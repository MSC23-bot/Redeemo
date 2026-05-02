import { useEffect, useMemo, useReducer } from 'react'
import type { OpeningHourEntry } from '@/lib/api/merchant'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const WEEKDAY_TO_DOW: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

function parseTime(t: string): number {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return h * 60 + m
}

// Resolve `now` into Europe/London-local day-of-week + minutes-since-midnight.
// Mirrors the server-side helper in `src/api/shared/isOpenNow.ts` so the two
// agree by construction. Using `Intl.DateTimeFormat` with an explicit
// `timeZone` ignores the device timezone entirely — a user in Qatar (UTC+3)
// reading a UK merchant gets the same answer as a user in London. UK-only
// platform per overall product spec; international expansion will need a
// `Merchant.timezone` field (deferred — see deferred-followups index §A).
function getLondonTime(now: Date): { todayDow: number; currentMinutes: number } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  false,
  })
  const parts = formatter.formatToParts(now)
  const weekdayShort = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
  const hour   = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  return {
    todayDow:       WEEKDAY_TO_DOW[weekdayShort] ?? 0,
    currentMinutes: hour * 60 + minute,
  }
}

// Stop-gap until the branch-aware spec lands. Real bugs this addresses:
//
//   1. Two consumers (MetaSection and AboutTab) call this hook independently;
//      `useMemo([hours])` only recomputes when `hours` changes, so the two
//      memoised results captured at different mount times can disagree on
//      the live `isOpen` boolean (e.g. one mounted at 11:58 says "Closed,
//      opens 12:00" while the other mounted at 12:01 says "Open now"). The
//      60-second tick below forces both consumers to recompute on the same
//      minute boundary, so they stay in sync.
//
//   2. Server-authoritative live status. When the caller passes
//      `serverIsOpenNow` (computed in `Europe/London` server-side per
//      `src/api/shared/isOpenNow.ts`), that wins for the `isOpen` boolean.
//      Local fallback is preserved only for tests / older callers that
//      haven't been wired through.
//
//   3. Display text + schedule must also be in Europe/London. The previous
//      version read `now.getDay()` / `now.getHours()` (device timezone),
//      which produced wrong "Opens 09:00" / "Closed today" / "TODAY" labels
//      for users abroad — the server boolean was right but the surrounding
//      text contradicted it. `getLondonTime` resolves this end-to-end.
//
// The proper fix lives in the branch-aware spec §5.5 + §7.1 — `selectedBranch.isOpenNow`
// computed server-side per branch. This hook becomes vestigial then.
export function useOpenStatus(hours: OpeningHourEntry[], serverIsOpenNow?: boolean) {
  // Force-tick reducer — no integer-overflow accumulator, just a fresh
  // identity each minute that invalidates the memo.
  const [tick, forceTick] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    const id = setInterval(forceTick, 60_000)
    return () => clearInterval(id)
  }, [])

  return useMemo(() => {
    const { todayDow, currentMinutes } = getLondonTime(new Date())

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

    // When server says "open" but we have no closeTime to display (e.g. the
    // day's hours weren't returned), fall back to "Open now" — never claim
    // the venue is closed when the server said the opposite.
    const hoursText = isOpen
      ? (todayClose ? `Closes ${todayClose}` : 'Open now')
      : todayOpen ? `Opens ${todayOpen}` : 'Closed today'

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
    // `tick` is intentionally in deps to invalidate the memo every 60s so
    // `getLondonTime(new Date())` re-evaluates against fresh wall-clock time.
    // The linter sees `tick` as unused inside the body and flags it as
    // "unnecessary"; suppressing here is the documented exception.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, serverIsOpenNow, tick])
}
