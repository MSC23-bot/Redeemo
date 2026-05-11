import React from 'react'
import { render } from '@testing-library/react-native'
import { HeroStatusBlock } from '@/features/voucher/components/HeroStatusBlock'

describe('HeroStatusBlock — state rendering (M4d amended D3)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))  // Monday 13:00 BST
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  const NOW = new Date('2026-05-11T12:00:00Z')  // Monday 13:00 BST anchor

  // ── ACTIVE state (msToClose ≥ 1h) ──────────────────────────
  it('active ≥1h: "Available now" + "4h 30m" + "Ends 5:30pm today"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="active"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T10:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T16:30:00Z')}   // 17:30 BST = 5:30pm
        nextWindowStartsAt={null}
        msToClose={4 * 3_600_000 + 30 * 60_000}                  // 4h 30m
        msToOpen={null}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available now')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('4h 30m')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Ends 5:30pm today')
  })

  // ── URGENT state (msToClose <1h, ≥1m) ──────────────────────
  it('urgent <1h: "Closing soon" + "42m 15s" + "Ends 1:42pm today"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T10:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:42:15Z')}   // 13:42:15 BST = 1:42pm
        nextWindowStartsAt={null}
        msToClose={42 * 60_000 + 15_000}                          // 42m 15s
        msToOpen={null}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Closing soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('42m 15s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Ends 1:42pm today')
  })

  // ── URGENT FINAL MINUTE (msToClose <1m, >0) ────────────────
  it('urgent <1m: "Closing soon" + "47s" + "Ends 1pm today"', () => {
    // boundary 2026-05-11T12:00:47Z = 13:00:47 BST → minute=0 → "1pm" (formatClockHour12 omits ":00")
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T10:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:00:47Z')}
        nextWindowStartsAt={null}
        msToClose={47_000}
        msToOpen={null}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Closing soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('47s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Ends 1pm today')
  })

  // ── UNAVAILABLE-TODAY (msToOpen ≥ 1h) ──────────────────────
  it('unavailable-today ≥1h: "Opens today" + "4h 0m" + "Opens 5pm today"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-today"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T16:00:00Z')}      // 17:00 BST = 5pm
        msToClose={null}
        msToOpen={4 * 3_600_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Opens today')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('4h 0m')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Opens 5pm today')
  })

  // ── UNAVAILABLE-TODAY (msToOpen <1h, ≥1m) ──────────────────
  it('unavailable-today <1h: "Opening soon" + "42m 15s" + "Opens 1:42pm today"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-today"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T12:42:15Z')}      // 13:42:15 BST → "1:42pm"
        msToClose={null}
        msToOpen={42 * 60_000 + 15_000}                            // 42m 15s
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Opening soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('42m 15s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Opens 1:42pm today')
  })

  // ── UNAVAILABLE-TODAY (msToOpen <1m, >0) ───────────────────
  it('unavailable-today <1m: "Opening soon" + "47s" + "Opens 1pm today"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-today"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T12:00:47Z')}      // 13:00:47 BST → "1pm"
        msToClose={null}
        msToOpen={47_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Opening soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('47s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Opens 1pm today')
  })

  // ── UNAVAILABLE-FUTURE-DAY (tomorrow, ≥1 day) ──────────────
  it('unavailable-future-day tomorrow ≥1d: "Opens tomorrow" + "1d 0h" + "Opens 1pm tomorrow"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-future-day"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-12T12:00:00Z')}      // Tuesday 13:00 BST = 1pm; 24h from now
        msToClose={null}
        msToOpen={24 * 3_600_000}                                  // exactly 1 day
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Opens tomorrow')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('1d 0h')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Opens 1pm tomorrow')
  })

  // ── UNAVAILABLE-FUTURE-DAY (tomorrow, 1h–<1d) ──────────────
  it('unavailable-future-day tomorrow 13h ahead: "Opens tomorrow" + "13h 0m" + "Opens 2am tomorrow"', () => {
    // now = Mon 12:00 UTC = Mon 13:00 BST. boundary = Tue 01:00 UTC = Tue 02:00 BST = 2am.
    // London-tomorrow. msToOpen ≈ 13h.
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-future-day"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-12T01:00:00Z')}      // Tuesday 02:00 BST = 2am
        msToClose={null}
        msToOpen={13 * 3_600_000}                                  // 13 hours
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Opens tomorrow')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('13h 0m')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Opens 2am tomorrow')
  })

  // ── UNAVAILABLE-FUTURE-DAY (Saturday, multi-day) ───────────
  it('unavailable-future-day Saturday: "Opens Saturday" + "5d 0h" + "Saturday 1pm"', () => {
    // boundary = Saturday 12:00 UTC = Saturday 13:00 BST = 1pm; 5 days from now.
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-future-day"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-16T12:00:00Z')}      // Saturday 13:00 BST = 1pm
        msToClose={null}
        msToOpen={5 * 24 * 3_600_000}                               // 5 days
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Opens Saturday')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('5d 0h')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Saturday 1pm')
  })

  // ── MIDNIGHT-CROSS (unavailable-future-day but <1h to open) ──
  it('unavailable-future-day midnight-cross <1h: "Opening soon" + "30m 0s" + "Opens 12:15am tomorrow"', () => {
    // now = Mon 22:45 UTC = Mon 23:45 BST. boundary = Mon 23:15 UTC = Tue 00:15 BST = 12:15am.
    // msToOpen = 30 minutes; <1h → urgency phrasing "Opening soon".
    const lateMonday = new Date('2026-05-11T22:45:00Z')
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-future-day"
        now={lateMonday}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T23:15:00Z')}      // Tue 00:15 BST = 12:15am
        msToClose={null}
        msToOpen={30 * 60_000}                                      // 30 minutes
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Opening soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('30m 0s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Opens 12:15am tomorrow')
  })

  // ── REDEEMED-THIS-WINDOW (≥ 1 day) ─────────────────────────
  it('redeemed-this-window ≥1d: "Available again" + "1d 0h" + "Opens 1pm tomorrow"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="redeemed-this-window"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-12T12:00:00Z')}
        msToClose={null}
        msToOpen={24 * 3_600_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available again')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('1d 0h')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Opens 1pm tomorrow')
  })

  // ── REDEEMED-THIS-WINDOW (<1h) ─────────────────────────────
  it('redeemed-this-window <1h: "Almost back" + "42m 15s" + "Opens 1:42pm today"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="redeemed-this-window"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T12:42:15Z')}
        msToClose={null}
        msToOpen={42 * 60_000 + 15_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Almost back')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('42m 15s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Opens 1:42pm today')
  })

  // ── REDEEMED-THIS-WINDOW (<1m) ─────────────────────────────
  it('redeemed-this-window <1m: "Almost back" + "47s" + "Opens 1pm today"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="redeemed-this-window"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T12:00:47Z')}
        msToClose={null}
        msToOpen={47_000}
      />,
    )
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Almost back')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('47s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Opens 1pm today')
  })

  // ── HIDDEN STATES ───────────────────────────────────────────
  it('no-windows: renders null', () => {
    const { queryByTestId } = render(
      <HeroStatusBlock
        windowState="no-windows"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={null}
        msToClose={null}
        msToOpen={null}
      />,
    )
    expect(queryByTestId('hero-status-block')).toBeNull()
    expect(queryByTestId('hero-status-eyebrow')).toBeNull()
  })

  it('expired: renders null', () => {
    const { queryByTestId } = render(
      <HeroStatusBlock
        windowState="expired"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={null}
        msToClose={null}
        msToOpen={null}
      />,
    )
    expect(queryByTestId('hero-status-block')).toBeNull()
  })

  // ── HERMES-ROBUST DEFENSIVE PIN ────────────────────────────
  it('does not depend on Intl weekday format (Hermes-stripped CLDR safety)', () => {
    // Mirrors the M4c standing rule: never use weekday: 'long'/'short' or
    // toLocaleTimeString. This test reads the rendered output for all 7
    // weekday futures and verifies all expected weekdays appear.
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    DAYS.forEach((expectedDay, dayIdx) => {
      // base: 2026-05-10 is a Sunday. dayIdx = 0 → Sunday, dayIdx = 1 → Monday, etc.
      const futureNow = new Date('2026-05-04T12:00:00Z')              // Mon of week prior, Mon 13:00 BST
      const targetUtc = new Date('2026-05-10T11:00:00Z')              // Sun 12:00 BST (Sun = dayIdx 0)
      targetUtc.setUTCDate(targetUtc.getUTCDate() + dayIdx)           // shift by dayIdx
      const { getByTestId, unmount } = render(
        <HeroStatusBlock
          windowState="unavailable-future-day"
          now={futureNow}
          currentWindowStartsAt={null}
          currentWindowEndsAt={null}
          nextWindowStartsAt={targetUtc}
          msToClose={null}
          msToOpen={targetUtc.getTime() - futureNow.getTime()}
        />,
      )
      expect(getByTestId('hero-status-eyebrow')).toHaveTextContent(`Opens ${expectedDay}`)
      // Supporting line: "<Weekday> <Hour><am/pm>" — assert via regex to
      // anchor on the weekday name without coupling to the clock-time format.
      expect(getByTestId('hero-status-supporting')).toHaveTextContent(new RegExp(`^${expectedDay} `))
      unmount()
    })
  })
})
