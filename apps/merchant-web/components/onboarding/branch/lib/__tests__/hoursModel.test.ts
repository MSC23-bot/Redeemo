import {
  DAY_LABELS,
  defaultHoursState,
  hoursStateFromBranch,
  toHoursPayload,
  validateHoursState,
  applyOpen24h,
  addWindow,
  removeWindow,
  setWindow,
  copyMondayToWeekdays,
  copyMondayToAllDays,
  type DayHours,
} from '@/components/onboarding/branch/lib/hoursModel'

// Branches PR-8 (umbrella D9): the MULTI-WINDOW-per-day opening-hours model. These
// tests pin the load-bearing backend contract:
//   - N>=1 windows per open day (one row per window in the payload),
//   - CLOSED days OMIT openTime/closeTime entirely (NOT null), one isClosed row,
//   - hoursStateFromBranch GROUPS multi-row backend data by dayOfWeek into windows[]
//     (no last-wins drop),
//   - overnight (close < open) is accepted; WITHIN-day overlap + CROSS-day overnight
//     spill overlap are rejected; abutting windows are accepted,
//   - Open 24h = a single 00:00 -> 24:00 window,
//   - client validation MIRRORS the backend validateOpeningHours.

function open(dayOfWeek: number, ...windows: [string, string][]): DayHours {
  return {
    dayOfWeek,
    isClosed: false,
    windows: windows.map(([openTime, closeTime]) => ({ openTime, closeTime })),
  }
}
function closed(dayOfWeek: number): DayHours {
  return { dayOfWeek, isClosed: true, windows: [] }
}
// A full week that is closed everywhere except the supplied open days.
function week(...openDays: DayHours[]): DayHours[] {
  const byDay = new Map<number, DayHours>()
  for (const d of openDays) byDay.set(d.dayOfWeek, d)
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => byDay.get(dow) ?? closed(dow))
}

describe('hoursModel: shape + defaults', () => {
  it('exposes 7 days Monday..Sunday in display order with the canonical dayOfWeek numbers', () => {
    expect(DAY_LABELS.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(DAY_LABELS[0].label).toMatch(/monday/i)
    expect(DAY_LABELS[6].label).toMatch(/sunday/i)
  })

  it('defaultHoursState seeds 7 open rows, each with a single 09:00 -> 17:00 window', () => {
    const state = defaultHoursState()
    expect(state).toHaveLength(7)
    expect(
      state.every(
        (d) =>
          !d.isClosed &&
          d.windows.length === 1 &&
          d.windows[0].openTime === '09:00' &&
          d.windows[0].closeTime === '17:00',
      ),
    ).toBe(true)
    expect(state.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })
})

describe('hoursModel: hoursStateFromBranch (prefill + GROUP by day)', () => {
  it('maps a branch openingHours array into the 7-row display state, defaulting missing days to closed', () => {
    const state = hoursStateFromBranch([
      { dayOfWeek: 1, openTime: '08:30', closeTime: '22:00', isClosed: false },
      { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },
    ])
    expect(state).toHaveLength(7)
    const monday = state.find((d) => d.dayOfWeek === 1)!
    expect(monday.isClosed).toBe(false)
    expect(monday.windows).toEqual([{ openTime: '08:30', closeTime: '22:00' }])
    expect(state.find((d) => d.dayOfWeek === 0)!.isClosed).toBe(true)
    // A day absent from the source becomes closed (not a phantom open row).
    expect(state.find((d) => d.dayOfWeek === 2)!.isClosed).toBe(true)
  })

  it('GROUPS multiple rows for the same dayOfWeek into windows[] (NO last-wins drop), ordered by openTime', () => {
    const state = hoursStateFromBranch([
      // Deliberately out of order to prove the sort.
      { dayOfWeek: 1, openTime: '17:00', closeTime: '23:00', isClosed: false },
      { dayOfWeek: 1, openTime: '09:00', closeTime: '14:00', isClosed: false },
    ])
    const monday = state.find((d) => d.dayOfWeek === 1)!
    expect(monday.isClosed).toBe(false)
    // Both windows preserved (the old single-window model would have dropped one).
    expect(monday.windows).toEqual([
      { openTime: '09:00', closeTime: '14:00' },
      { openTime: '17:00', closeTime: '23:00' },
    ])
  })

  it('returns the default state when given an empty/undefined source', () => {
    expect(hoursStateFromBranch([])).toEqual(defaultHoursState())
    expect(hoursStateFromBranch(undefined)).toEqual(defaultHoursState())
  })
})

describe('hoursModel: toHoursPayload (the POST body)', () => {
  it('emits one row per WINDOW and OMITS openTime/closeTime on closed days (never null)', () => {
    const state = week(
      open(1, ['09:00', '14:00'], ['17:00', '23:00']),
      open(6, ['10:00', '16:00']),
    )
    const payload = toHoursPayload(state)

    // Monday contributes TWO rows (one per window); the closed days contribute one each.
    const monday = payload.filter((r) => r.dayOfWeek === 1)
    expect(monday).toEqual([
      { dayOfWeek: 1, isClosed: false, openTime: '09:00', closeTime: '14:00' },
      { dayOfWeek: 1, isClosed: false, openTime: '17:00', closeTime: '23:00' },
    ])

    const sunday = payload.find((r) => r.dayOfWeek === 0)!
    expect(sunday.isClosed).toBe(true)
    expect('openTime' in sunday).toBe(false)
    expect('closeTime' in sunday).toBe(false)
    // Defensive: no row anywhere carries a null time.
    for (const row of payload) {
      expect((row as Record<string, unknown>).openTime).not.toBeNull()
      expect((row as Record<string, unknown>).closeTime).not.toBeNull()
    }
  })

  it('emits a closed row for a day left with zero windows', () => {
    const state = week({ dayOfWeek: 1, isClosed: false, windows: [] })
    const monday = toHoursPayload(state).filter((r) => r.dayOfWeek === 1)
    expect(monday).toEqual([{ dayOfWeek: 1, isClosed: true }])
  })

  it('accepts an overnight window (close < open) without rejecting', () => {
    const state = week(open(5, ['18:00', '02:00']))
    expect(validateHoursState(state)).toEqual({})
    const friday = toHoursPayload(state).filter((r) => r.dayOfWeek === 5)
    expect(friday).toEqual([{ dayOfWeek: 5, isClosed: false, openTime: '18:00', closeTime: '02:00' }])
  })

  it('emits Open 24h as a single 00:00 -> 24:00 window', () => {
    const state = week(open(1, ['00:00', '24:00']))
    expect(validateHoursState(state)).toEqual({})
    const monday = toHoursPayload(state).filter((r) => r.dayOfWeek === 1)
    expect(monday).toEqual([{ dayOfWeek: 1, isClosed: false, openTime: '00:00', closeTime: '24:00' }])
  })
})

describe('hoursModel: validateHoursState (client mirror of the multi-window validator)', () => {
  it('passes a fully valid week', () => {
    expect(validateHoursState(defaultHoursState())).toEqual({})
  })

  it('passes a valid split day (two non-overlapping windows)', () => {
    expect(validateHoursState(week(open(1, ['09:00', '14:00'], ['17:00', '23:00'])))).toEqual({})
  })

  it('accepts ABUTTING windows on the same day (prev.close === next.open)', () => {
    expect(validateHoursState(week(open(1, ['09:00', '14:00'], ['14:00', '23:00'])))).toEqual({})
  })

  it('rejects WITHIN-day overlapping windows', () => {
    const errors = validateHoursState(week(open(1, ['09:00', '13:00'], ['12:00', '18:00'])))
    expect(errors[1]).toMatch(/overlap/i)
  })

  it('rejects a CROSS-day overlap: Monday 18:00-02:00 spill vs Tuesday 01:00-03:00', () => {
    const errors = validateHoursState(week(open(1, ['18:00', '02:00']), open(2, ['01:00', '03:00'])))
    // The TUESDAY window is the one rejected (it overlaps the prior-day spill).
    expect(errors[2]).toMatch(/overnight|carried over|day before/i)
  })

  it('accepts a CROSS-day ABUTTING boundary: Monday 18:00-02:00 spill then Tuesday 02:00-05:00', () => {
    expect(validateHoursState(week(open(1, ['18:00', '02:00']), open(2, ['02:00', '05:00'])))).toEqual({})
  })

  it('wraps Sunday overnight spill into Monday (7-day wrap)', () => {
    const errors = validateHoursState(week(open(0, ['22:00', '03:00']), open(1, ['01:00', '09:00'])))
    expect(errors[1]).toMatch(/overnight|carried over|day before/i)
  })

  it('allows a CLOSED day to still receive a prior-day overnight spill (nothing originates that day)', () => {
    // Monday overnight spills into a CLOSED Tuesday: no Tuesday window, nothing to reject.
    expect(validateHoursState(week(open(1, ['18:00', '02:00']), closed(2)))).toEqual({})
  })

  it('flags a window missing one of the two times', () => {
    const errors = validateHoursState(week({ dayOfWeek: 1, isClosed: false, windows: [{ openTime: '09:00', closeTime: '' }] }))
    expect(errors[1]).toMatch(/both an opening and a closing time/i)
  })

  it('rejects open === close (zero-length window) inline', () => {
    const errors = validateHoursState(week(open(1, ['09:00', '09:00'])))
    expect(errors[1]).toMatch(/same|identical|cannot be the same/i)
  })

  it('rejects 24:00 used as an opening time', () => {
    const errors = validateHoursState(week({ dayOfWeek: 1, isClosed: false, windows: [{ openTime: '24:00', closeTime: '06:00' }] }))
    expect(errors[1]).toMatch(/opening time/i)
  })

  it('rejects a malformed time', () => {
    const errors = validateHoursState(week({ dayOfWeek: 1, isClosed: false, windows: [{ openTime: '9am', closeTime: '17:00' }] }))
    expect(errors[1]).toBeTruthy()
  })

  it('flags an open day left with zero windows', () => {
    const errors = validateHoursState(week({ dayOfWeek: 1, isClosed: false, windows: [] }))
    expect(errors[1]).toMatch(/at least one opening window|mark the day closed/i)
  })

  it('does not flag a closed day even with no windows', () => {
    expect(validateHoursState(week())).toEqual({})
  })
})

describe('hoursModel: window helpers', () => {
  it('applyOpen24h sets a single 00:00 -> 24:00 window and opens the day', () => {
    const row = applyOpen24h(closed(1))
    expect(row).toEqual({ dayOfWeek: 1, isClosed: false, windows: [{ openTime: '00:00', closeTime: '24:00' }] })
  })

  it('addWindow appends a fresh window seeded from the prior close', () => {
    const row = addWindow(open(1, ['09:00', '14:00']))
    expect(row.windows).toHaveLength(2)
    expect(row.windows[1]).toEqual({ openTime: '14:00', closeTime: '17:00' })
  })

  it('addWindow on an Open-24h day seeds the new window from the default (not 24:00)', () => {
    const row = addWindow(open(1, ['00:00', '24:00']))
    expect(row.windows[1].openTime).toBe('09:00')
  })

  it('removeWindow drops the window at the given index', () => {
    const row = removeWindow(open(1, ['09:00', '14:00'], ['17:00', '23:00']), 0)
    expect(row.windows).toEqual([{ openTime: '17:00', closeTime: '23:00' }])
  })

  it('setWindow patches a single window time by index', () => {
    const row = setWindow(open(1, ['09:00', '14:00'], ['17:00', '23:00']), 1, { closeTime: '22:00' })
    expect(row.windows[1]).toEqual({ openTime: '17:00', closeTime: '22:00' })
    expect(row.windows[0]).toEqual({ openTime: '09:00', closeTime: '14:00' })
  })

  it('copyMondayToWeekdays copies Monday windows to Tue..Fri only', () => {
    const state = week(open(1, ['08:00', '12:00'], ['13:00', '20:00']), open(6, ['10:00', '14:00']))
    const next = copyMondayToWeekdays(state)
    for (const dow of [2, 3, 4, 5]) {
      const row = next.find((d) => d.dayOfWeek === dow)!
      expect(row.isClosed).toBe(false)
      expect(row.windows).toEqual([
        { openTime: '08:00', closeTime: '12:00' },
        { openTime: '13:00', closeTime: '20:00' },
      ])
    }
    // Saturday + Sunday untouched.
    expect(next.find((d) => d.dayOfWeek === 6)!.windows).toEqual([{ openTime: '10:00', closeTime: '14:00' }])
    expect(next.find((d) => d.dayOfWeek === 0)!.isClosed).toBe(true)
  })

  it('copyMondayToAllDays copies Monday windows to every other day (deep copy)', () => {
    const state = week(open(1, ['08:00', '20:00']))
    const next = copyMondayToAllDays(state)
    for (const dow of [2, 3, 4, 5, 6, 0]) {
      expect(next.find((d) => d.dayOfWeek === dow)!.windows).toEqual([{ openTime: '08:00', closeTime: '20:00' }])
    }
    // Deep copy: mutating a copied window must not bleed back into Monday.
    next.find((d) => d.dayOfWeek === 2)!.windows[0].openTime = '06:00'
    expect(next.find((d) => d.dayOfWeek === 1)!.windows[0].openTime).toBe('08:00')
  })
})
