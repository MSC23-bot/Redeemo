// Branches PR-8 (umbrella D9): the SINGLE merchant-web multi-window hours formatter.
//
// Before PR-8 the friendly-time + day-row rendering was duplicated across the day-2
// OpeningHoursCard and the BranchesOverview Today cell. This extracts one formatter so
// both surfaces render N windows per day consistently (e.g. "9am to 2pm, 5pm to 11pm"),
// ordered by openTime, with the 24:00 close rendered as "midnight" and a full
// 00:00 -> 24:00 day rendered as "Open 24 hours".
//
// A truly cross-app shared module is not possible (merchant-web is a separate package
// from customer-web / customer-app; each app carries its own copy). This shared module
// is scoped to merchant-web.

export interface OpeningHoursRow {
  dayOfWeek: number
  openTime?: string | null
  closeTime?: string | null
  isClosed: boolean
}

// "HH:MM" (24h) -> "9am" / "12:30pm" / "noon" / "midnight". 24:00 -> "midnight".
export function friendlyTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h)) return hhmm
  if (m === 0 && h === 12) return 'noon'
  if (m === 0 && (h === 0 || h === 24)) return 'midnight'
  const period = h >= 12 && h < 24 ? 'pm' : 'am'
  let hour12 = h % 12
  if (hour12 === 0) hour12 = 12
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, '0')}${period}`
}

// True for a window that runs the full day (Open 24h): 00:00 -> 24:00.
function isOpen24h(openTime: string, closeTime: string): boolean {
  return openTime === '00:00' && closeTime === '24:00'
}

// Render ALL of a single day's open windows into a human-friendly string. `dayRows`
// is the subset of openingHours rows for ONE dayOfWeek (multiple rows = multiple
// windows). Returns "Closed" when the day has no open window. Windows are ordered by
// openTime; a sole 00:00 -> 24:00 window renders "Open 24 hours".
export function formatDayWindows(dayRows: OpeningHoursRow[]): string {
  const windows = dayRows
    .filter((r) => !r.isClosed && r.openTime && r.closeTime)
    .map((r) => ({ openTime: r.openTime as string, closeTime: r.closeTime as string }))
    .sort((a, b) => openMinutes(a.openTime) - openMinutes(b.openTime))

  if (windows.length === 0) return 'Closed'
  if (windows.length === 1 && isOpen24h(windows[0].openTime, windows[0].closeTime)) {
    return 'Open 24 hours'
  }
  return windows.map((w) => `${friendlyTime(w.openTime)} to ${friendlyTime(w.closeTime)}`).join(', ')
}

// Convenience: pull a single day's windows out of a whole-week openingHours array and
// format them. Used by both the live table and the Today cell.
export function formatDay(openingHours: OpeningHoursRow[], dayOfWeek: number): string {
  return formatDayWindows(openingHours.filter((r) => r.dayOfWeek === dayOfWeek))
}

function openMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return Number.NaN
  return h * 60 + m
}
