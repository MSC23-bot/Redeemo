/**
 * Human-readable cooldown duration formatter for the <ReusableRulesCard>
 * body — "Available again every <duration>".
 *
 * Distinct from countdownFormat.formatDuration which produces compact
 * countdown shapes ("4h 0m", "30m 15s"). This helper produces natural-
 * language forms ("4 hours", "30 minutes", "1 day", "7 days") suitable
 * for sentence-form copy.
 *
 * Spec §9 copy ledger (ReusableRulesCard body).
 */
export function formatCooldownDurationHuman(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`

  const hours = Math.floor(minutes / 60)
  const remainderMinutes = minutes % 60
  if (hours < 24) {
    const hoursLabel = hours === 1 ? '1 hour' : `${hours} hours`
    if (remainderMinutes === 0) return hoursLabel
    const minutesLabel = remainderMinutes === 1 ? '1 minute' : `${remainderMinutes} minutes`
    return `${hoursLabel} ${minutesLabel}`
  }

  const days = Math.floor(hours / 24)
  const remainderHours = hours % 24
  const daysLabel = days === 1 ? '1 day' : `${days} days`
  if (remainderHours === 0) return daysLabel
  const hoursLabel = remainderHours === 1 ? '1 hour' : `${remainderHours} hours`
  return `${daysLabel} ${hoursLabel}`
}
