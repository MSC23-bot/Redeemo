import { useMemo } from 'react'
import type { OpeningHourEntry } from '@/lib/api/merchant'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function parseTime(t: string): number {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return h * 60 + m
}

export function useOpenStatus(hours: OpeningHourEntry[]) {
  return useMemo(() => {
    const now = new Date()
    const todayDow = now.getDay()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    // openTime / closeTime are nullable on the wire (closed days come back
    // as null). Treat null-times the same as `isClosed: true` everywhere
    // — defensive at the boundary so the rest of this hook can assume
    // non-null when it reads them.
    const todayEntry = hours.find(h => h.dayOfWeek === todayDow)
    const todayOpen  = todayEntry && !todayEntry.isClosed && todayEntry.openTime  != null ? todayEntry.openTime  : null
    const todayClose = todayEntry && !todayEntry.isClosed && todayEntry.closeTime != null ? todayEntry.closeTime : null
    const isOpen = todayOpen != null && todayClose != null
      ? currentMinutes >= parseTime(todayOpen) && currentMinutes < parseTime(todayClose)
      : false

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
  }, [hours])
}
