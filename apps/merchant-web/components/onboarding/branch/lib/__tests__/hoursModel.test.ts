import {
  DAY_LABELS,
  defaultHoursState,
  hoursStateFromBranch,
  toHoursPayload,
  validateHoursState,
  applyOpen24h,
  copyMondayToWeekdays,
  copyMondayToAllDays,
  type DayHours,
} from '@/components/onboarding/branch/lib/hoursModel'

// M2 F4 (B4): the SINGLE-period-per-day opening-hours model. These tests pin the
// load-bearing backend contract:
//   - one row per day Mon..Sun (dayOfWeek 1..6,0 -> a 7-row payload),
//   - CLOSED days OMIT openTime/closeTime entirely (NOT null) so the route zod
//     (z.string().optional()) accepts them,
//   - overnight (close < open) is accepted,
//   - Open 24h = 00:00 -> 24:00,
//   - client validation MIRRORS B4 (open day needs both times, open !== close,
//     24:00 only as closeTime, well-formed HH:MM).

function open(dayOfWeek: number, openTime: string, closeTime: string): DayHours {
  return { dayOfWeek, isClosed: false, openTime, closeTime }
}
function closed(dayOfWeek: number): DayHours {
  return { dayOfWeek, isClosed: true, openTime: '', closeTime: '' }
}

describe('hoursModel: shape + defaults', () => {
  it('exposes 7 days Monday..Sunday in display order with the canonical dayOfWeek numbers', () => {
    expect(DAY_LABELS.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(DAY_LABELS[0].label).toMatch(/monday/i)
    expect(DAY_LABELS[6].label).toMatch(/sunday/i)
  })

  it('defaultHoursState seeds 7 open weekday-ish rows with a sensible default', () => {
    const state = defaultHoursState()
    expect(state).toHaveLength(7)
    expect(state.every((d) => d.openTime === '09:00' && d.closeTime === '17:00' && !d.isClosed)).toBe(true)
    expect(state.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })
})

describe('hoursModel: hoursStateFromBranch (prefill)', () => {
  it('maps a branch openingHours array into the 7-row display state, defaulting missing days to closed', () => {
    const state = hoursStateFromBranch([
      { dayOfWeek: 1, openTime: '08:30', closeTime: '22:00', isClosed: false },
      { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },
    ])
    expect(state).toHaveLength(7)
    const monday = state.find((d) => d.dayOfWeek === 1)!
    expect(monday).toMatchObject({ openTime: '08:30', closeTime: '22:00', isClosed: false })
    const sunday = state.find((d) => d.dayOfWeek === 0)!
    expect(sunday.isClosed).toBe(true)
    // A day absent from the source becomes closed (not a phantom open row).
    const tuesday = state.find((d) => d.dayOfWeek === 2)!
    expect(tuesday.isClosed).toBe(true)
  })

  it('returns the default state when given an empty/undefined source', () => {
    expect(hoursStateFromBranch([])).toEqual(defaultHoursState())
    expect(hoursStateFromBranch(undefined)).toEqual(defaultHoursState())
  })
})

describe('hoursModel: toHoursPayload (the POST body)', () => {
  it('emits one row per day and OMITS openTime/closeTime on closed days (never null)', () => {
    const state: DayHours[] = [
      open(1, '09:00', '17:00'),
      open(2, '09:00', '17:00'),
      open(3, '09:00', '17:00'),
      open(4, '09:00', '17:00'),
      open(5, '09:00', '17:00'),
      open(6, '10:00', '16:00'),
      closed(0),
    ]
    const payload = toHoursPayload(state)
    expect(payload).toHaveLength(7)

    const sunday = payload.find((r) => r.dayOfWeek === 0)!
    expect(sunday.isClosed).toBe(true)
    // The critical contract: closed rows must NOT carry the keys at all.
    expect('openTime' in sunday).toBe(false)
    expect('closeTime' in sunday).toBe(false)
    // Defensive: no row anywhere carries a null time.
    for (const row of payload) {
      expect((row as Record<string, unknown>).openTime).not.toBeNull()
      expect((row as Record<string, unknown>).closeTime).not.toBeNull()
    }

    const monday = payload.find((r) => r.dayOfWeek === 1)!
    expect(monday).toEqual({ dayOfWeek: 1, isClosed: false, openTime: '09:00', closeTime: '17:00' })
  })

  it('accepts an overnight period (close < open) without rejecting', () => {
    const state = [open(5, '18:00', '02:00'), closed(0), closed(1), closed(2), closed(3), closed(4), closed(6)]
    expect(() => validateHoursState(state)).not.toThrow()
    const payload = toHoursPayload(state)
    const friday = payload.find((r) => r.dayOfWeek === 5)!
    expect(friday).toEqual({ dayOfWeek: 5, isClosed: false, openTime: '18:00', closeTime: '02:00' })
  })

  it('emits Open 24h as openTime 00:00 -> closeTime 24:00', () => {
    const state = [open(1, '00:00', '24:00'), closed(2), closed(3), closed(4), closed(5), closed(6), closed(0)]
    expect(() => validateHoursState(state)).not.toThrow()
    const monday = toHoursPayload(state).find((r) => r.dayOfWeek === 1)!
    expect(monday).toEqual({ dayOfWeek: 1, isClosed: false, openTime: '00:00', closeTime: '24:00' })
  })
})

describe('hoursModel: validateHoursState (client-side mirror of B4)', () => {
  it('passes a fully valid week', () => {
    const state = defaultHoursState()
    expect(validateHoursState(state)).toEqual({})
  })

  it('flags an open day missing one of the two times', () => {
    const state = [{ dayOfWeek: 1, isClosed: false, openTime: '09:00', closeTime: '' } as DayHours, closed(2), closed(3), closed(4), closed(5), closed(6), closed(0)]
    const errors = validateHoursState(state)
    expect(errors[1]).toMatch(/both an opening and a closing time/i)
  })

  it('rejects open === close (zero-length period) inline', () => {
    const state = [open(1, '09:00', '09:00'), closed(2), closed(3), closed(4), closed(5), closed(6), closed(0)]
    const errors = validateHoursState(state)
    expect(errors[1]).toMatch(/same|identical|cannot be the same/i)
  })

  it('rejects 24:00 used as an opening time', () => {
    const state = [{ dayOfWeek: 1, isClosed: false, openTime: '24:00', closeTime: '06:00' } as DayHours, closed(2), closed(3), closed(4), closed(5), closed(6), closed(0)]
    const errors = validateHoursState(state)
    expect(errors[1]).toMatch(/opening time/i)
  })

  it('rejects a malformed time', () => {
    const state = [{ dayOfWeek: 1, isClosed: false, openTime: '9am', closeTime: '17:00' } as DayHours, closed(2), closed(3), closed(4), closed(5), closed(6), closed(0)]
    const errors = validateHoursState(state)
    expect(errors[1]).toBeTruthy()
  })

  it('does not flag a closed day even with no times', () => {
    const errors = validateHoursState([closed(1), closed(2), closed(3), closed(4), closed(5), closed(6), closed(0)])
    expect(errors).toEqual({})
  })
})

describe('hoursModel: helpers', () => {
  it('applyOpen24h sets 00:00 -> 24:00 and opens the day', () => {
    const row = applyOpen24h(closed(1))
    expect(row).toMatchObject({ dayOfWeek: 1, isClosed: false, openTime: '00:00', closeTime: '24:00' })
  })

  it('copyMondayToWeekdays copies Monday open/close to Tue..Fri only', () => {
    const state = [open(1, '08:00', '20:00'), closed(2), closed(3), closed(4), closed(5), open(6, '10:00', '14:00'), closed(0)]
    const next = copyMondayToWeekdays(state)
    for (const dow of [2, 3, 4, 5]) {
      const row = next.find((d) => d.dayOfWeek === dow)!
      expect(row).toMatchObject({ openTime: '08:00', closeTime: '20:00', isClosed: false })
    }
    // Saturday + Sunday untouched.
    expect(next.find((d) => d.dayOfWeek === 6)).toMatchObject({ openTime: '10:00', closeTime: '14:00' })
    expect(next.find((d) => d.dayOfWeek === 0)!.isClosed).toBe(true)
  })

  it('copyMondayToAllDays copies Monday to every other day', () => {
    const state = [open(1, '08:00', '20:00'), closed(2), closed(3), closed(4), closed(5), closed(6), closed(0)]
    const next = copyMondayToAllDays(state)
    for (const dow of [2, 3, 4, 5, 6, 0]) {
      expect(next.find((d) => d.dayOfWeek === dow)).toMatchObject({ openTime: '08:00', closeTime: '20:00', isClosed: false })
    }
  })
})
