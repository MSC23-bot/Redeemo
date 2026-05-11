/**
 * Format availabilityWindows[] into a human-readable schedule string (M4b-3).
 *
 * §AJ3 canonical client-side implementation. Backend error payload
 * (`VOUCHER_OUTSIDE_AVAILABILITY_WINDOW`) carries ONLY `nextWindowAt` —
 * the schedule string is derived here from `voucher.availabilityWindows`,
 * which is already on every customer payload.
 *
 * Examples:
 *   Mon-Fri 11-15      → "Mon-Fri, 11am-3pm"
 *   Tue only 18-22     → "Tuesdays, 6-10pm"
 *   Mon 11-15 + 18-22  → "Mondays, 11am-3pm and 6pm-10pm"
 *   Fri 22-24 + Sat 0-2 → "Fridays, 10pm-2am"  (cross-midnight detected)
 *
 * Used by:
 *   - <CouponBodyCard> "Availability" TL-only section (M4d D.1)
 *   - PIN sheet boundary-race recovery copy (M4b-9)
 */

import type { AvailabilityWindow } from './timeLimitedWindow'

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const DAYS_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

function format12h(time: string): string {
  // "11:00" → "11am", "12:00" → "12pm", "15:00" → "3pm", "24:00" → "12am" (next day)
  if (time === '24:00') return '12am'
  // Inputs are validated upstream (M4a-7 regex), so split-and-parse always yields
  // two valid integers. Local intermediates are typed as `number` to satisfy
  // `noUncheckedIndexedAccess`.
  const parts = time.split(':')
  const hh = parseInt(parts[0] ?? '0', 10)
  const mm = parseInt(parts[1] ?? '0', 10)
  const period = hh < 12 ? 'am' : 'pm'
  const h12 = hh === 0 ? 12 : hh <= 12 ? hh : hh - 12
  if (mm === 0) return `${h12}${period}`
  return `${h12}:${String(mm).padStart(2, '0')}${period}`
}

type Group = {
  days: number[]   // sorted ascending, may contain wraparound (e.g. [6, 0])
  openTime: string
  closeTime: string
}

function compactDayList(days: number[]): string {
  // Sort, detect contiguous range. Preserves Sun=0 wraparound for Sat-Sun.
  // All values are 0-6 (validated upstream in Zod); array indexing with
  // non-null-assert satisfies TS's noUncheckedIndexedAccess.
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 1) return `${DAYS_FULL[sorted[0]!]}s`  // plural "Tuesdays"

  // Check contiguous (allow wrap: e.g. [6, 0] = Sat-Sun if 0 follows 6 in cycle).
  const isContiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1)
  const isWeekendWrap = sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6  // [Sun, Sat]
  if (isContiguous) {
    return `${DAYS_SHORT[sorted[0]!]}-${DAYS_SHORT[sorted[sorted.length - 1]!]}`
  }
  if (isWeekendWrap) {
    return 'Sat-Sun'
  }
  // Non-contiguous fallback — join with commas: "Mon, Wed, Fri"
  return sorted.map(d => DAYS_SHORT[d]).join(', ')
}

export function formatScheduleString(windows: AvailabilityWindow[]): string {
  if (windows.length === 0) return ''

  // Step 1: detect cross-midnight pairs and merge.
  // A pair is (dayN, "XX:YY", "24:00") + (dayN+1 mod 7, "00:00", "ZZ:WW")
  // → treat as one logical window on dayN with closeTime "ZZ:WW" representing
  //   next-day's close time displayed in 12h format as "Xam".
  const consumed = new Set<number>()
  type MergedWindow = AvailabilityWindow & { crossMidnightCloseDisplay?: string }
  const merged: MergedWindow[] = []

  for (let i = 0; i < windows.length; i++) {
    if (consumed.has(i)) continue
    const w = windows[i]!  // bounded by loop guard
    if (w.closeTime === '24:00') {
      const nextDay = (w.dayOfWeek + 1) % 7
      const partnerIdx = windows.findIndex(
        (x, j) => j !== i && !consumed.has(j) && x.dayOfWeek === nextDay && x.openTime === '00:00'
      )
      if (partnerIdx >= 0) {
        consumed.add(partnerIdx)
        merged.push({
          dayOfWeek: w.dayOfWeek,
          openTime:  w.openTime,
          closeTime: w.closeTime,  // keep "24:00" as sentinel
          crossMidnightCloseDisplay: format12h(windows[partnerIdx]!.closeTime),
        })
        consumed.add(i)
        continue
      }
    }
    merged.push(w)
    consumed.add(i)
  }

  // Step 2: group by (openTime, closeTime, crossMidnightCloseDisplay).
  const groupMap = new Map<string, Group>()
  for (const w of merged) {
    const key = `${w.openTime}__${w.closeTime}__${w.crossMidnightCloseDisplay ?? ''}`
    const g = groupMap.get(key) ?? { days: [], openTime: w.openTime, closeTime: w.closeTime }
    g.days.push(w.dayOfWeek)
    groupMap.set(key, g)
  }

  // Step 3: render each group's string.
  // Multiple groups joined with " and ".
  // English elision: collapse open-time period suffix when (a) both share the
  // same period (am/am or pm/pm), (b) open hour ≠ 12 (noon would be ambiguous
  // when elided), AND (c) this is the only time range across the whole output
  // — i.e. exactly one group AND no cross-midnight close display. Applied only
  // at the final-render stage so split-day "and" joins keep both suffixes.
  const entries = Array.from(groupMap.entries())
  const isSingleRange = entries.length === 1
  const groupStrings = entries.map(([key, g]) => {
    const dayPart = compactDayList(g.days)
    const partnerCloseDisplay = key.split('__')[2]
    const closeDisplay = partnerCloseDisplay || format12h(g.closeTime)
    const openDisplay = format12h(g.openTime)
    let renderedOpen = openDisplay
    if (isSingleRange && !partnerCloseDisplay) {
      const openHour = parseInt(g.openTime.split(':')[0] ?? '0', 10)
      const openPeriod = openHour < 12 ? 'am' : 'pm'
      const closeHour = parseInt(g.closeTime.split(':')[0] ?? '0', 10)
      const closePeriod = closeHour < 12 || closeHour === 24 ? 'am' : 'pm'
      if (openPeriod === closePeriod && openHour !== 12 && /(am|pm)$/.test(openDisplay)) {
        renderedOpen = openDisplay.replace(/(am|pm)$/, '')
      }
    }
    return `${dayPart}, ${renderedOpen}-${closeDisplay}`
  })

  // Same-day-different-hours: detect when groupStrings would all share the SAME
  // dayPart and join inner times with "and" instead.
  // (Mondays 11am-3pm + Mondays 6pm-10pm → "Mondays, 11am-3pm and 6pm-10pm")
  if (groupStrings.length > 1) {
    const firstDayPart = groupStrings[0]!.split(', ')[0]!
    if (groupStrings.every(s => s.startsWith(firstDayPart + ','))) {
      const timePart = groupStrings.map(s => s.split(', ')[1]!).join(' and ')
      return `${firstDayPart}, ${timePart}`
    }
  }

  return groupStrings.join(' and ')
}
