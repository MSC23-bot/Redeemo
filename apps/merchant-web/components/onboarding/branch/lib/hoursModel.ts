// M2 F4 (B4): the SINGLE-period-per-day opening-hours model for the branch step.
//
// The merged backend (BranchOpeningHours @@unique([branchId, dayOfWeek])) stores
// exactly ONE (open, close) period per (branch, day). This module is the client
// mirror of that model + the B4 validator, plus the helpers the form needs:
//   - a 7-row display state (Monday..Sunday),
//   - prefill from a branch openingHours array,
//   - the POST body builder that OMITS openTime/closeTime on closed days (the route
//     zod is z.string().optional() and REJECTS an explicit null),
//   - client-side validation mirroring validateOpeningHours (so the user gets inline
//     errors, while the backend POST /hours stays the authority),
//   - Open-24h (00:00 -> 24:00), and the copy-Monday bulk helpers.
//
// Overnight (close < open, e.g. 18:00 -> 02:00) is ACCEPTED, exactly like B4.

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

// The form-facing display row. openTime/closeTime are always present strings in the
// state (empty when closed); the omit-not-null normalisation happens at payload time.
export interface DayHours {
  dayOfWeek: number
  isClosed: boolean
  openTime: string
  closeTime: string
}

// The branch openingHours rows as the backend returns them (nullable times).
export interface BranchHoursRow {
  dayOfWeek: number
  openTime?: string | null
  closeTime?: string | null
  isClosed: boolean
}

// The exact POST /branches/:id/hours row shape. Closed rows OMIT the time keys.
export type HoursPayloadRow =
  | { dayOfWeek: number; isClosed: true }
  | { dayOfWeek: number; isClosed: false; openTime: string; closeTime: string }

// "HH:MM" with hours 00-23 and minutes 00-59. The "24:00" sentinel is checked
// separately (allowed only as a closeTime) - mirrors the backend HHMM_REGEX.
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

const DEFAULT_OPEN = '09:00'
const DEFAULT_CLOSE = '17:00'

// A fresh week: every day open 09:00 -> 17:00. The merchant tunes from there.
export function defaultHoursState(): DayHours[] {
  return DAY_LABELS.map(({ dayOfWeek }) => ({
    dayOfWeek,
    isClosed: false,
    openTime: DEFAULT_OPEN,
    closeTime: DEFAULT_CLOSE,
  }))
}

// Build the 7-row display state from a branch openingHours array. Days absent from
// the source default to closed (never a phantom open row). Times normalise to
// strings (null -> '').
export function hoursStateFromBranch(rows: BranchHoursRow[] | undefined): DayHours[] {
  if (!rows || rows.length === 0) return defaultHoursState()
  const byDay = new Map<number, BranchHoursRow>()
  for (const r of rows) byDay.set(r.dayOfWeek, r)
  return DAY_LABELS.map(({ dayOfWeek }) => {
    const src = byDay.get(dayOfWeek)
    if (!src || src.isClosed) {
      return { dayOfWeek, isClosed: true, openTime: '', closeTime: '' }
    }
    return {
      dayOfWeek,
      isClosed: false,
      openTime: src.openTime ?? '',
      closeTime: src.closeTime ?? '',
    }
  })
}

// Build the POST body. ONE row per day; closed rows carry ONLY { dayOfWeek, isClosed }
// (the time keys are omitted, NOT null) so the route zod accepts them.
export function toHoursPayload(state: DayHours[]): HoursPayloadRow[] {
  return state.map((d) => {
    if (d.isClosed) {
      return { dayOfWeek: d.dayOfWeek, isClosed: true }
    }
    return {
      dayOfWeek: d.dayOfWeek,
      isClosed: false,
      openTime: d.openTime,
      closeTime: d.closeTime,
    }
  })
}

// Client-side validation mirroring the backend validateOpeningHours, keyed by
// dayOfWeek so the form can render an inline error against the offending row. An
// empty object means valid. The backend POST /hours remains the authority.
export function validateHoursState(state: DayHours[]): Record<number, string> {
  const errors: Record<number, string> = {}
  for (const d of state) {
    if (d.isClosed) continue // closed days carry no times, nothing to validate

    if (!d.openTime || !d.closeTime) {
      errors[d.dayOfWeek] = 'Add both an opening and a closing time, or mark the day closed.'
      continue
    }
    if (!HHMM_REGEX.test(d.openTime)) {
      errors[d.dayOfWeek] = 'Opening time must be a 24 hour time like 09:00.'
      continue
    }
    if (d.closeTime !== '24:00' && !HHMM_REGEX.test(d.closeTime)) {
      errors[d.dayOfWeek] = 'Closing time must be a 24 hour time like 17:00, or 24:00 for midnight.'
      continue
    }
    if (d.openTime === d.closeTime) {
      errors[d.dayOfWeek] = 'Opening and closing times cannot be the same.'
      continue
    }
  }
  return errors
}

// Set a single day to Open 24h: 00:00 -> 24:00, open.
export function applyOpen24h(row: DayHours): DayHours {
  return { ...row, isClosed: false, openTime: '00:00', closeTime: '24:00' }
}

function mondayOf(state: DayHours[]): DayHours | undefined {
  return state.find((d) => d.dayOfWeek === 1)
}

function copyMondayTo(state: DayHours[], targetDays: number[]): DayHours[] {
  const monday = mondayOf(state)
  if (!monday) return state
  return state.map((d) =>
    targetDays.includes(d.dayOfWeek)
      ? { ...d, isClosed: monday.isClosed, openTime: monday.openTime, closeTime: monday.closeTime }
      : d,
  )
}

// Copy Monday's open/close to Tuesday..Friday only (the working-week helper).
export function copyMondayToWeekdays(state: DayHours[]): DayHours[] {
  return copyMondayTo(state, [2, 3, 4, 5])
}

// Copy Monday's open/close to every other day.
export function copyMondayToAllDays(state: DayHours[]): DayHours[] {
  return copyMondayTo(state, [2, 3, 4, 5, 6, 0])
}
