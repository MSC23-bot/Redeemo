import { useEffect, useState, useCallback } from 'react'
import type { VoucherType } from '@/lib/api/redemption'

type TimeLimitedState = 'inactive' | 'active' | 'expired' | 'outside_window'

type TimeLimitedResult = {
  state: TimeLimitedState
  remainingSeconds: number
  formattedCountdown: string
  expiryDateFormatted: string | null
  nextWindowLabel: string | null
  scheduleLabel: string | null
}

type Params = {
  type: VoucherType
  expiryDate: string | null
  availabilitySchedule?: { days: number[]; startTime: string; endTime: string } | null
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0s'

  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  return `${hours}h ${minutes}m ${seconds}s`
}

function formatExpiryDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function useTimeLimited({ type, expiryDate, availabilitySchedule }: Params): TimeLimitedResult {
  const computeRemaining = useCallback(() => {
    if (!expiryDate) return 0
    return Math.max(0, Math.floor((new Date(expiryDate).getTime() - Date.now()) / 1000))
  }, [expiryDate])

  const [remainingSeconds, setRemainingSeconds] = useState(computeRemaining)

  useEffect(() => {
    if (type !== 'TIME_LIMITED' || !expiryDate) return

    setRemainingSeconds(computeRemaining())

    const id = setInterval(() => {
      const next = computeRemaining()
      setRemainingSeconds(next)
      if (next <= 0) clearInterval(id)
    }, 1000)

    return () => clearInterval(id)
  }, [type, expiryDate, computeRemaining])

  if (type !== 'TIME_LIMITED') {
    return {
      state: 'inactive',
      remainingSeconds: 0,
      formattedCountdown: '',
      expiryDateFormatted: null,
      nextWindowLabel: null,
      scheduleLabel: null,
    }
  }

  const expired = expiryDate ? new Date(expiryDate).getTime() <= Date.now() : false
  const state: TimeLimitedState = expired ? 'expired' : 'active'

  return {
    state,
    remainingSeconds,
    formattedCountdown: formatCountdown(remainingSeconds),
    expiryDateFormatted: expiryDate ? formatExpiryDate(expiryDate) : null,
    nextWindowLabel: null,
    scheduleLabel: availabilitySchedule
      ? `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].filter((_, i) => availabilitySchedule.days.includes(i)).join('\u2013')}, ${availabilitySchedule.startTime}\u2013${availabilitySchedule.endTime}`
      : null,
  }
}
