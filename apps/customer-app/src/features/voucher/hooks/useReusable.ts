import { useEffect, useState } from 'react'

/**
 * useReusable — REUSABLE voucher state derivation (M5 Task 10).
 *
 * Sibling to `useTimeLimited`. Returns the same shape that
 * `<VoucherDetailScreen>` plugs into `<HeroStatusBlock>` for the
 * countdown primary + supporting line, but the inputs are simpler:
 *   • `availableAgainAt` (ISO string from the customer payload) gates
 *     the cooldown vs available state.
 *   • `expiryDate` (ISO) is consumed only to derive the D44
 *     "expiry-before-cooldown" suppression flag (spec §7.4
 *     amendment 2026-05-12 — frontend-computed at render time, no new
 *     backend metadata).
 *
 * Tick model: a per-second `setInterval` runs ONLY while we're in
 * cooldown; the available state is steady. When the cooldown elapses
 * during a tick, `inCooldown` flips false and the next render skips
 * arming the interval (cleanup runs on the previous effect first).
 *
 * Spec §7.3, §7.4.
 */

export type ReusableState = {
  /** 'reusable-cooldown' while `availableAgainAt > now`; otherwise 'reusable-available'. */
  windowState: 'reusable-available' | 'reusable-cooldown'
  /** ms until `availableAgainAt`; null when not in cooldown. */
  msToOpen: number | null
  /** Parsed `availableAgainAt` Date when in cooldown; null otherwise. */
  nextWindowStartsAt: Date | null
  /**
   * D44 frontend-computed flag — `availableAgainAt > expiryDate`. When
   * true, callers MUST suppress the standard "Available again in …"
   * countdown copy and show the locked replacement string instead
   * (spec §7.4).
   */
  cooldownExtendsPastExpiry: boolean
}

export function useReusable(
  availableAgainAt: string | null,
  expiryDate: string | null,
): ReusableState {
  const [now, setNow] = useState(() => new Date())

  const availableAgainDate = availableAgainAt ? new Date(availableAgainAt) : null
  const inCooldown = !!(
    availableAgainDate
    && !Number.isNaN(availableAgainDate.getTime())
    && availableAgainDate.getTime() > now.getTime()
  )

  // Per-second tick ONLY while in cooldown — drives the consumer-visible
  // countdown (`<HeroStatusBlock>` primary + disabled CTA copy). Cleanup
  // on unmount AND when `inCooldown` flips false (the cooldown elapsed
  // during a tick → next effect run skips arming the interval).
  useEffect(() => {
    if (!inCooldown) return
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [inCooldown])

  const expiryDateObj = expiryDate ? new Date(expiryDate) : null
  const cooldownExtendsPastExpiry = !!(
    availableAgainDate
    && expiryDateObj
    && !Number.isNaN(availableAgainDate.getTime())
    && !Number.isNaN(expiryDateObj.getTime())
    && availableAgainDate.getTime() > expiryDateObj.getTime()
  )

  if (inCooldown && availableAgainDate) {
    return {
      windowState: 'reusable-cooldown',
      msToOpen: availableAgainDate.getTime() - now.getTime(),
      nextWindowStartsAt: availableAgainDate,
      cooldownExtendsPastExpiry,
    }
  }

  return {
    windowState: 'reusable-available',
    msToOpen: null,
    nextWindowStartsAt: null,
    cooldownExtendsPastExpiry: false,
  }
}
