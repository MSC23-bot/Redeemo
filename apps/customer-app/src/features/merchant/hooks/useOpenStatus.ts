import { useMemo } from 'react'
import type { OpeningHourEntry } from '@/lib/api/merchant'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function useOpenStatus(hours: OpeningHourEntry[]) {
  return useMemo(() => {
    const now = new Date()
    const todayDow = now.getDay()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    const todayEntry = hours.find(h => h.dayOfWeek === todayDow)
    const isOpen = todayEntry && !todayEntry.isClosed
      ? currentMinutes >= parseTime(todayEntry.openTime) && currentMinutes < parseTime(todayEntry.closeTime)
      : false

    const closingTime = todayEntry && !todayEntry.isClosed ? todayEntry.closeTime : null
    const hoursText = isOpen && closingTime ? `Closes ${closingTime}` : todayEntry && !todayEntry.isClosed ? `Opens ${todayEntry.openTime}` : 'Closed today'

    const weekSchedule = DAY_NAMES.map((name, i) => {
      const entry = hours.find(h => h.dayOfWeek === i)
      const isToday = i === todayDow
      if (!entry || entry.isClosed) {
        return { day: name, shortDay: SHORT_DAYS[i], hours: 'Closed', isToday, isClosed: true }
      }
      return {
        day: name,
        shortDay: SHORT_DAYS[i],
        hours: `${entry.openTime} – ${entry.closeTime}`,
        isToday,
        isClosed: false,
      }
    })

    return { isOpen, hoursText, weekSchedule, todayDow }
  }, [hours])
}
