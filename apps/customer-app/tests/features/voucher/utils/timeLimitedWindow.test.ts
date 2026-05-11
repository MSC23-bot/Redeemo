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

// ── DST: BST → GMT boundary crossing (Gate F review, 2026-05-11) ──────
// UK DST ends at 01:00 UTC on the last Sunday of October — clocks roll
// back from 02:00 BST to 01:00 GMT. 2026: Sun 2026-10-25.
// UK DST starts at 01:00 UTC on the last Sunday of March — clocks jump
// from 01:00 GMT to 02:00 BST. 2026: Sun 2026-03-29.
//
// `londonDateAtMinute` (internal to timeLimitedWindow) reads `shortOffset`
// for the TARGET-day utcMidnight. These tests exercise it INDIRECTLY via
// the public API (`getCurrentWindowOccurrence` / `getNextWindowOccurrence`)
// to confirm a dayOffset that crosses the DST switch yields the correct
// UTC instant on the OTHER side. Locked baseline mirrors the backend
// helper at `src/api/shared/voucherAvailability.ts`.

describe('DST boundary handling — BST → GMT (last Sunday of October)', () => {
  it('getNextWindowOccurrence: Fri-during-BST → Mon-post-fallback opens at 11:00 GMT (NOT 11:00 BST)', () => {
    // Fri 2026-10-23 15:00 BST = 14:00 UTC. Mon-Fri lunch (11-15) just
    // closed. Saturday/Sunday not in LUNCH_MON_FRI → next opening is
    // Monday 2026-10-26. By then DST has ended (Sun 2026-10-25 01:00 UTC),
    // so Mon 11:00 LONDON = 11:00 GMT = 2026-10-26T11:00:00Z. The function
    // must read shortOffset for utcMidnight=2026-10-26T00:00:00Z (GMT) →
    // offset=0 → returns 11:00 UTC. If it had used Fri's offset (BST),
    // the result would be wrong by one hour.
    const now = new Date('2026-10-23T14:00:00Z')
    const result = getNextWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result).not.toBeNull()
    expect(result!.startsAt.toISOString()).toBe('2026-10-26T11:00:00.000Z')
  })

  it('getNextWindowOccurrence: Sat-during-BST → Mon-post-fallback opens at 11:00 GMT', () => {
    // Sat 2026-10-24 15:00 BST = 14:00 UTC. Same expected result —
    // dayOffset=2 lands on Mon 2026-10-26 (post-fallback).
    const now = new Date('2026-10-24T14:00:00Z')
    const result = getNextWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result).not.toBeNull()
    expect(result!.startsAt.toISOString()).toBe('2026-10-26T11:00:00.000Z')
  })

  it('getCurrentWindowOccurrence: Mon-post-fallback 13:00 GMT → window endsAt = 15:00 GMT', () => {
    // Mon 2026-10-26 13:00 UTC = 13:00 GMT (post-fallback). Inside the
    // 11-15 GMT window. dayOffset=0, minute=900 (15:00) → utcMidnight
    // 2026-10-26T00:00:00Z is post-fallback (GMT), offset=0, so endsAt =
    // 2026-10-26T15:00:00Z. NOT 14:00Z (which would be BST treatment).
    const now = new Date('2026-10-26T13:00:00Z')
    const result = getCurrentWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result).not.toBeNull()
    expect(result!.endsAt.toISOString()).toBe('2026-10-26T15:00:00.000Z')
  })
})

describe('DST boundary handling — GMT → BST (last Sunday of March)', () => {
  it('getNextWindowOccurrence: Fri-during-GMT → Mon-post-spring-forward opens at 11:00 BST', () => {
    // Fri 2026-03-27 15:00 GMT = 15:00 UTC. Mon-Fri lunch just closed.
    // Next opening = Mon 2026-03-30 11:00 LONDON. By then DST has begun
    // (Sun 2026-03-29 01:00 UTC) → 11:00 BST = 10:00 UTC. The function
    // must read shortOffset for utcMidnight=2026-03-30T00:00:00Z (BST,
    // offset +60) so it subtracts 60 min from utcMidnight: result =
    // 2026-03-29T23:00:00Z + 11h = 2026-03-30T10:00:00Z. If it had used
    // Fri's offset (GMT, 0), result would be 11:00 UTC (one hour wrong).
    const now = new Date('2026-03-27T15:00:00Z')
    const result = getNextWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result).not.toBeNull()
    expect(result!.startsAt.toISOString()).toBe('2026-03-30T10:00:00.000Z')
  })

  it('getCurrentWindowOccurrence: Mon-post-spring-forward 12:00 BST → window endsAt = 15:00 BST = 14:00 UTC', () => {
    // Mon 2026-03-30 12:00 BST = 11:00 UTC. Inside the 11-15 BST window.
    // Expected endsAt: 15:00 BST = 14:00 UTC. utcMidnight=2026-03-30T00:00:00Z
    // is post-spring-forward (BST, +60), so endsAt = utcMidnight - 60 + 900
    // = 2026-03-30T14:00:00Z. ✓
    const now = new Date('2026-03-30T11:00:00Z')
    const result = getCurrentWindowOccurrence(LUNCH_MON_FRI, now)
    expect(result).not.toBeNull()
    expect(result!.endsAt.toISOString()).toBe('2026-03-30T14:00:00.000Z')
  })
})
