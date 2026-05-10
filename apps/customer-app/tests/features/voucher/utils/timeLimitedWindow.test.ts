import {
  parseTimeString,
  getCurrentWindowOccurrence,
  getNextWindowOccurrence,
  getWindowState,
  type AvailabilityWindow,
} from '@/features/voucher/utils/timeLimitedWindow'

const LUNCH_MON_FRI: AvailabilityWindow[] = [1, 2, 3, 4, 5].map(d => ({
  dayOfWeek: d, openTime: '11:00', closeTime: '15:00',
}))

describe('parseTimeString (customer-app mirror)', () => {
  it('parses HH:mm and the "24:00" sentinel', () => {
    expect(parseTimeString('11:00')).toBe(660)
    expect(parseTimeString('24:00')).toBe(1440)
  })
})

describe('getCurrentWindowOccurrence (client-side)', () => {
  it('returns current open window matching backend behaviour', () => {
    // Monday 2026-05-11 13:00 BST = 12:00 UTC
    const now = new Date('2026-05-11T12:00:00Z')
    const result = getCurrentWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result).not.toBeNull()
    expect(result!.endsAt.toISOString()).toBe('2026-05-11T14:00:00.000Z')
  })

  it('half-open: 15:00 BST is NO LONGER active', () => {
    const now = new Date('2026-05-11T14:00:00Z')
    expect(getCurrentWindowOccurrence(LUNCH_MON_FRI, now)).toBeNull()
  })
})

describe('getNextWindowOccurrence (client-side)', () => {
  it('finds the next opening', () => {
    const now = new Date('2026-05-11T14:00:00Z') // Monday 15:00 BST — window just closed
    const result = getNextWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result).not.toBeNull()
    expect(result!.startsAt.toISOString()).toBe('2026-05-12T10:00:00.000Z') // Tue 11:00 BST
  })
})

describe('getWindowState', () => {
  it('returns "active" when inside a window and >60 min remain', () => {
    // Monday 11:30 BST — 3h 30m left of an 11-15 window
    const now = new Date('2026-05-11T10:30:00Z')
    const state = getWindowState({
      availabilityWindows: LUNCH_MON_FRI,
      currentWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',
      },
      nextWindow: null,
      redeemedWindow: null,
    }, now)
    expect(state).toBe('active')
  })

  it('returns "urgent" when inside a window and <60 min remain', () => {
    // Monday 14:50 BST — 10m left
    const now = new Date('2026-05-11T13:50:00Z')
    const state = getWindowState({
      availabilityWindows: LUNCH_MON_FRI,
      currentWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',
      },
      nextWindow: null,
      redeemedWindow: null,
    }, now)
    expect(state).toBe('urgent')
  })

  it('returns "unavailable-today" when next window opens today', () => {
    // Monday 09:00 BST — next window opens at 11:00 BST today
    const now = new Date('2026-05-11T08:00:00Z')
    const state = getWindowState({
      availabilityWindows: LUNCH_MON_FRI,
      currentWindow: null,
      nextWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',
      },
      redeemedWindow: null,
    }, now)
    expect(state).toBe('unavailable-today')
  })

  it('returns "unavailable-future-day" when next window opens tomorrow+', () => {
    // Saturday 12:00 BST — next is Monday 11:00 BST
    const now = new Date('2026-05-16T11:00:00Z')
    const state = getWindowState({
      availabilityWindows: LUNCH_MON_FRI,
      currentWindow: null,
      nextWindow: {
        startsAt: '2026-05-18T10:00:00.000Z',
        endsAt:   '2026-05-18T14:00:00.000Z',
      },
      redeemedWindow: null,
    }, now)
    expect(state).toBe('unavailable-future-day')
  })

  it('returns "no-windows" when availabilityWindows is empty', () => {
    const state = getWindowState({
      availabilityWindows: [],
      currentWindow: null,
      nextWindow: null,
      redeemedWindow: null,
    }, new Date())
    expect(state).toBe('no-windows')
  })

  it('client-side override: as clock ticks past backend-computed currentWindow.endsAt, state flips to unavailable', () => {
    // Backend payload says current window ends at 14:00 UTC; client clock is
    // 14:01 UTC. State must flip without re-fetching.
    const now = new Date('2026-05-11T14:01:00Z')
    const state = getWindowState({
      availabilityWindows: LUNCH_MON_FRI,
      currentWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',  // already past
      },
      nextWindow: {
        startsAt: '2026-05-12T10:00:00.000Z',
        endsAt:   '2026-05-12T14:00:00.000Z',
      },
      redeemedWindow: null,
    }, now)
    expect(state).toBe('unavailable-future-day') // next window is tomorrow
  })
})
