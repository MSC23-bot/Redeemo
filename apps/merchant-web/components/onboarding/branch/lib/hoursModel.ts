// Branches PR-8 (umbrella D9): the MULTI-WINDOW opening-hours model for the branch
// step + the day-2 editor.
//
// The merged backend (BranchOpeningHours, no longer @@unique([branchId, dayOfWeek]))
// now stores N>=1 (open, close) windows per (branch, day). This module is the client
// mirror of that model + the validator, plus the helpers the editors need:
//   - a 7-row display state (Monday..Sunday), each open day carrying windows[],
//   - prefill from a branch openingHours array (GROUPING rows by dayOfWeek into
//     windows[], NOT a last-wins collapse),
//   - the POST body builder that emits N rows per open day + one isClosed row per
//     closed day (the route zod is z.string().optional() and REJECTS an explicit null,
//     so closed rows OMIT openTime/closeTime),
//   - client-side validation mirroring validateOpeningHours (per-row format + per-day
//     no-overlap WITHIN a day AND CROSS-day overnight spill, so the user gets inline
//     errors, while the backend POST /hours stays the authority),
//   - Open-24h (a single 00:00 -> 24:00 window), and the copy-Monday bulk helpers.
//
// Overnight (close < open, e.g. 18:00 -> 02:00) is the FIRST-CLASS encoding for a
// window that crosses midnight, exactly like the backend validator. 24:00 stays the
// literal end-of-day close sentinel (allowed only as a closeTime).

// dayOfWeek uses the backend convention: 0 = Sunday .. 6 = Saturday. The display
// order is Monday-first, so DAY_LABELS lists 1,2,3,4,5,6,0.
export const DAY_LABELS: { dayOfWeek: number; label: string; short: string }[] = [
  { dayOfWeek: 1, label: 'Monday', short: 'Mon' },
  { dayOfWeek: 2, label: 'Tuesday', short: 'Tue' },
  { dayOfWeek: 3, label: 'Wednesday', short: 'Wed' },
  { dayOfWeek: 4, label: 'Thursday', short: 'Thu' },
  { dayOfWeek: 5, label: 'Friday', short: 'Fri' },
  { dayOfWeek: 6, label: 'Saturday', short: 'Sat' },
  { dayOfWeek: 0, label: 'Sunday', short: 'Sun' },
]

// A single open window. openTime/closeTime are always present strings in the editor
// state (the omit-not-null normalisation happens at payload time for closed days).
export interface HoursWindow {
  openTime: string
  closeTime: string
}

// The form-facing display row. An open day carries N>=1 windows; a closed day carries
// isClosed:true with an empty windows array.
export interface DayHours {
  dayOfWeek: number
  isClosed: boolean
  windows: HoursWindow[]
}

// The branch openingHours rows as the backend returns them (nullable times). Multiple
// rows may share a dayOfWeek under the multi-window model.
export interface BranchHoursRow {
  dayOfWeek: number
  openTime?: string | null
  closeTime?: string | null
  isClosed: boolean
}

// The exact POST /branches/:id/hours row shape. Closed rows OMIT the time keys; an
// open day emits ONE row PER window (so a day can contribute multiple rows).
export type HoursPayloadRow =
  | { dayOfWeek: number; isClosed: true }
  | { dayOfWeek: number; isClosed: false; openTime: string; closeTime: string }

// "HH:MM" with hours 00-23 and minutes 00-59. The "24:00" sentinel is checked
// separately (allowed only as a closeTime) - mirrors the backend HHMM_REGEX.
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

const MINUTES_PER_DAY = 24 * 60 // 1440

const DEFAULT_OPEN = '09:00'
const DEFAULT_CLOSE = '17:00'

// A fresh week: every day open 09:00 -> 17:00 (one window). The merchant tunes from there.
export function defaultHoursState(): DayHours[] {
  return DAY_LABELS.map(({ dayOfWeek }) => ({
    dayOfWeek,
    isClosed: false,
    windows: [{ openTime: DEFAULT_OPEN, closeTime: DEFAULT_CLOSE }],
  }))
}

// Build the 7-row display state from a branch openingHours array. Multiple rows that
// share a dayOfWeek GROUP into that day's windows[] (ordered by openTime) - the safe
// in-UI migration of existing single-window rows (NO last-wins drop). Days absent from
// the source, or marked closed, default to closed (never a phantom open row).
export function hoursStateFromBranch(rows: BranchHoursRow[] | undefined): DayHours[] {
  if (!rows || rows.length === 0) return defaultHoursState()

  const closedDays = new Set<number>()
  const openWindowsByDay = new Map<number, HoursWindow[]>()
  for (const r of rows) {
    if (r.isClosed) {
      closedDays.add(r.dayOfWeek)
      continue
    }
    if (r.openTime == null || r.closeTime == null) continue
    const list = openWindowsByDay.get(r.dayOfWeek) ?? []
    list.push({ openTime: r.openTime, closeTime: r.closeTime })
    openWindowsByDay.set(r.dayOfWeek, list)
  }

  return DAY_LABELS.map(({ dayOfWeek }) => {
    const windows = openWindowsByDay.get(dayOfWeek)
    if (windows && windows.length > 0) {
      const sorted = [...windows].sort((a, b) => openMinutes(a.openTime) - openMinutes(b.openTime))
      return { dayOfWeek, isClosed: false, windows: sorted }
    }
    // No open windows for this day (absent, or an explicit closed row): closed.
    return { dayOfWeek, isClosed: true, windows: [] }
  })
}

// Build the POST body. N rows per open day (one per window); closed days carry ONLY
// { dayOfWeek, isClosed } (the time keys are omitted, NOT null) so the route zod
// accepts them.
export function toHoursPayload(state: DayHours[]): HoursPayloadRow[] {
  const out: HoursPayloadRow[] = []
  for (const d of state) {
    if (d.isClosed || d.windows.length === 0) {
      out.push({ dayOfWeek: d.dayOfWeek, isClosed: true })
      continue
    }
    for (const w of d.windows) {
      out.push({ dayOfWeek: d.dayOfWeek, isClosed: false, openTime: w.openTime, closeTime: w.closeTime })
    }
  }
  return out
}

// --- validation -------------------------------------------------------------
// Half-open interval [start, end) in minutes.
interface Interval {
  start: number
  end: number
}

// Parse the "open" minute (open is never the "24:00" sentinel). Returns NaN on
// malformed input (only used after a format check for the sort path).
function openMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return Number.NaN
  return h * 60 + m
}

// Parse a validated "HH:MM" (or the "24:00" close sentinel) into minutes-since-midnight.
function toMinutes(hhmm: string): number {
  if (hhmm === '24:00') return MINUTES_PER_DAY
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// True iff two HALF-OPEN intervals overlap. Abutting (a.end === b.start) does NOT overlap.
function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

// Client-side validation mirroring the backend validateOpeningHours, keyed by
// dayOfWeek so the form can render an inline error against the offending row. An
// empty object means valid. The backend POST /hours remains the authority.
//
// Per open day: each window needs both times, well-formed (24:00 only as a close),
// open !== close (zero-length reject). Then per-day NO-OVERLAP on half-open intervals
// WITHIN the day AND a CROSS-DAY check: an overnight window (close < open) on day D
// spills into D+1 as [00:00, close); a window on D+1 that overlaps that spill is
// rejected (7-day wrap). A closed day with no windows can still receive a prior-day
// spill (nothing to reject).
export function validateHoursState(state: DayHours[]): Record<number, string> {
  const errors: Record<number, string> = {}

  // Per-day same-day window intervals [open, sameDayEnd), and the overnight spill close.
  const sameDayWindows = new Map<number, Interval[]>()
  const overnightSpills = new Map<number, number>() // dayOfWeek -> the LATEST overnight close (minutes) spilling into the NEXT day

  for (const d of state) {
    if (d.isClosed) continue // closed days carry no windows, nothing to validate

    if (d.windows.length === 0) {
      errors[d.dayOfWeek] = 'Add at least one opening window, or mark the day closed.'
      continue
    }

    let dayInvalid = false
    const dayIntervals: Interval[] = []
    let daySpill: number | undefined

    for (const w of d.windows) {
      if (!w.openTime || !w.closeTime) {
        errors[d.dayOfWeek] = 'Add both an opening and a closing time, or remove the window.'
        dayInvalid = true
        break
      }
      if (!HHMM_REGEX.test(w.openTime)) {
        errors[d.dayOfWeek] = 'Opening time must be a 24 hour time like 09:00.'
        dayInvalid = true
        break
      }
      if (w.closeTime !== '24:00' && !HHMM_REGEX.test(w.closeTime)) {
        errors[d.dayOfWeek] = 'Closing time must be a 24 hour time like 17:00, or 24:00 for midnight.'
        dayInvalid = true
        break
      }
      if (w.openTime === w.closeTime) {
        errors[d.dayOfWeek] = 'Opening and closing times cannot be the same.'
        dayInvalid = true
        break
      }

      const openMins = toMinutes(w.openTime)
      const closeMins = toMinutes(w.closeTime)
      // Same-day part: [open, close) same-day, or [open, 24:00) for an overnight window.
      const sameDayEnd = closeMins > openMins ? closeMins : MINUTES_PER_DAY
      dayIntervals.push({ start: openMins, end: sameDayEnd })
      if (closeMins < openMins) {
        // Overnight: spills into the NEXT day as [0, close). Keep the LATEST close.
        daySpill = daySpill === undefined ? closeMins : Math.max(daySpill, closeMins)
      }
    }

    if (dayInvalid) continue

    // WITHIN-DAY no-overlap (sort by start, scan adjacent half-open intervals).
    const sorted = [...dayIntervals].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      if (overlaps(sorted[i - 1], sorted[i])) {
        errors[d.dayOfWeek] = 'Opening windows on the same day cannot overlap.'
        dayInvalid = true
        break
      }
    }
    if (dayInvalid) continue

    sameDayWindows.set(d.dayOfWeek, sorted)
    if (daySpill !== undefined) overnightSpills.set(d.dayOfWeek, daySpill)
  }

  // CROSS-DAY no-overlap: an overnight window on day D spills into D+1 (7-day wrap) as
  // [0, spillClose). Reject any of the next day's OWN windows that overlap that spill.
  for (const [day, spillClose] of overnightSpills) {
    const nextDay = (day + 1) % 7
    if (errors[nextDay]) continue // already flagged for another reason
    const spill: Interval = { start: 0, end: spillClose }
    const nextWindows = sameDayWindows.get(nextDay) ?? []
    for (const w of nextWindows) {
      if (overlaps(spill, w)) {
        errors[nextDay] = 'This window overlaps the overnight hours carried over from the day before.'
        break
      }
    }
  }

  return errors
}

// Set a single day to Open 24h: a single 00:00 -> 24:00 window, open.
export function applyOpen24h(row: DayHours): DayHours {
  return { ...row, isClosed: false, windows: [{ openTime: '00:00', closeTime: '24:00' }] }
}

// --- per-window add / remove ------------------------------------------------
// Append a fresh empty window to a day (used by the "Add a window" control). The new
// window seeds from the day's last window close so the merchant only edits the times.
export function addWindow(row: DayHours): DayHours {
  const last = row.windows[row.windows.length - 1]
  const seedOpen = last ? last.closeTime : DEFAULT_OPEN
  return {
    ...row,
    isClosed: false,
    windows: [...row.windows, { openTime: seedOpen === '24:00' ? DEFAULT_OPEN : seedOpen, closeTime: DEFAULT_CLOSE }],
  }
}

// Remove a window by index. Removing the last window leaves the day with zero windows;
// the editor then treats it as closed at payload time (toHoursPayload emits an isClosed
// row for a zero-window day).
export function removeWindow(row: DayHours, index: number): DayHours {
  return { ...row, windows: row.windows.filter((_, i) => i !== index) }
}

// Patch a single window's open/close time by index.
export function setWindow(row: DayHours, index: number, patch: Partial<HoursWindow>): DayHours {
  return {
    ...row,
    windows: row.windows.map((w, i) => (i === index ? { ...w, ...patch } : w)),
  }
}

function mondayOf(state: DayHours[]): DayHours | undefined {
  return state.find((d) => d.dayOfWeek === 1)
}

function copyMondayTo(state: DayHours[], targetDays: number[]): DayHours[] {
  const monday = mondayOf(state)
  if (!monday) return state
  return state.map((d) =>
    targetDays.includes(d.dayOfWeek)
      ? { ...d, isClosed: monday.isClosed, windows: monday.windows.map((w) => ({ ...w })) }
      : d,
  )
}

// Copy Monday's windows to Tuesday..Friday only (the working-week helper).
export function copyMondayToWeekdays(state: DayHours[]): DayHours[] {
  return copyMondayTo(state, [2, 3, 4, 5])
}

// Copy Monday's windows to every other day.
export function copyMondayToAllDays(state: DayHours[]): DayHours[] {
  return copyMondayTo(state, [2, 3, 4, 5, 6, 0])
}
