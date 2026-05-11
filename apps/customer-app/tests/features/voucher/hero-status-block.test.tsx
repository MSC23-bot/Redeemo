import React from 'react'
import { render, configure } from '@testing-library/react-native'
import { HeroStatusBlock } from '@/features/voucher/components/HeroStatusBlock'

// B.3 introduces accessibilityElementsHidden + importantForAccessibility=
// 'no-hide-descendants' on the hero-status-primary Text when the per-second
// tick is firing (countdown <1h). RNTL v13 filters such elements out of
// getByTestId / queryByTestId by default, which would break the pre-existing
// B.1 / B.2 text-rendering + progress-bar assertions that read text content
// off the primary testID for those same under-1h states. Opting into
// `defaultIncludeHiddenElements: true` for this file keeps both the existing
// assertions and the new a11y pins working without altering B.1 / B.2 test
// bodies. (RNTL config is process-scoped — bracketed in beforeAll/afterAll
// so it doesn't leak to other test files in the run.)
const RNTL_CONFIG_PREV = { defaultIncludeHiddenElements: false as boolean }
beforeAll(() => {
  configure({ defaultIncludeHiddenElements: true })
})
afterAll(() => {
  configure({ defaultIncludeHiddenElements: RNTL_CONFIG_PREV.defaultIncludeHiddenElements })
})

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
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Window ends 5:30pm today')
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Ending soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('42m 15s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Window ends 1:42pm today')
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Ending soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('47s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Window ends 1pm today')
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available later today')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('4h 0m')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available from 5pm today')
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('42m 15s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available from 1:42pm today')
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('47s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available from 1pm today')
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available tomorrow')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('1d 0h')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available from 1pm tomorrow')
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available tomorrow')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('13h 0m')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available from 2am tomorrow')
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available Saturday')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('5d 0h')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available from Saturday 1pm')
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('30m 0s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available from 12:15am tomorrow')
  })

  // ── REDEEMED-THIS-WINDOW (≥ 1 day) ─────────────────────────
  it('redeemed-this-window ≥1d: "Available again" + "1d 0h" + "Available again from 1pm tomorrow"', () => {
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
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available again from 1pm tomorrow')
  })

  // ── REDEEMED-THIS-WINDOW (<1h) ─────────────────────────────
  it('redeemed-this-window <1h: "Almost back" + "42m 15s" + "Available again from 1:42pm today"', () => {
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('42m 15s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available again from 1:42pm today')
  })

  // ── REDEEMED-THIS-WINDOW (<1m) ─────────────────────────────
  it('redeemed-this-window <1m: "Almost back" + "47s" + "Available again from 1pm today"', () => {
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
    expect(getByTestId('hero-status-eyebrow')).toHaveTextContent('Available soon')
    expect(getByTestId('hero-status-primary')).toHaveTextContent('47s')
    expect(getByTestId('hero-status-supporting')).toHaveTextContent('Available again from 1pm today')
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
      expect(getByTestId('hero-status-eyebrow')).toHaveTextContent(`Available ${expectedDay}`)
      // Supporting line: "Available from <Weekday> <Hour><am/pm>" (TL wording
      // amendment 2026-05-11 D4 — verb prefix on future-day too). Regex
      // anchors on the weekday name within the prefixed phrase without
      // coupling to the clock-time format.
      expect(getByTestId('hero-status-supporting')).toHaveTextContent(new RegExp(`^Available from ${expectedDay} `))
      unmount()
    })
  })
})

describe('HeroStatusBlock — progress bar (spec D4)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  const NOW = new Date('2026-05-11T12:00:00Z')

  // ── CLOSING DIRECTION — bar EMPTIES, colour by urgency ────
  it('active state: bar EMPTIES, width % = msToClose / totalWindowMs, green at >60min', () => {
    // Window 10:00 → 15:00 UTC (5-hour window). Now = 12:00 UTC. msToClose = 3h = 75% remaining.
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="active"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T10:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T15:00:00Z')}
        nextWindowStartsAt={null}
        msToClose={3 * 3_600_000}
        msToOpen={null}
      />,
    )
    const fill = getByTestId('hero-status-progress-bar-fill')
    expect(fill.props.style).toEqual(
      expect.objectContaining({ width: '60%', backgroundColor: '#34D399' }),
    )
  })

  it('urgent state >15min: amber', () => {
    // Window 11:00 → 12:30 UTC. Now = 12:00 UTC. msToClose = 30min. Total = 90min. → 33% remaining.
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T11:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:30:00Z')}
        nextWindowStartsAt={null}
        msToClose={30 * 60_000}
        msToOpen={null}
      />,
    )
    const fill = getByTestId('hero-status-progress-bar-fill')
    expect(fill.props.style).toEqual(
      expect.objectContaining({ backgroundColor: '#FBBF24' }),
    )
  })

  it('urgent state ≤15min: coral', () => {
    // Window 11:00 → 12:10 UTC. msToClose = 10min. Total = 70min. → ~14% remaining.
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T11:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:10:00Z')}
        nextWindowStartsAt={null}
        msToClose={10 * 60_000}
        msToOpen={null}
      />,
    )
    const fill = getByTestId('hero-status-progress-bar-fill')
    expect(fill.props.style).toEqual(
      expect.objectContaining({ backgroundColor: '#FB7185' }),
    )
  })

  it('urgent state exactly 15min: coral (inclusive boundary)', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T11:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:15:00Z')}
        nextWindowStartsAt={null}
        msToClose={15 * 60_000}
        msToOpen={null}
      />,
    )
    const fill = getByTestId('hero-status-progress-bar-fill')
    expect(fill.props.style).toEqual(
      expect.objectContaining({ backgroundColor: '#FB7185' }),
    )
  })

  // ── OPENING DIRECTION — bar FILLS, neutral colour ─────────
  it('unavailable-today: bar FILLS left→right, width % = 1 - msToOpen/24h', () => {
    // msToOpen = 4 hours. 4/24 = 16.67%. fill width = 1 - 16.67% = 83.33%.
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-today"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T16:00:00Z')}
        msToClose={null}
        msToOpen={4 * 3_600_000}
      />,
    )
    const fill = getByTestId('hero-status-progress-bar-fill')
    expect(fill.props.style).toEqual(
      expect.objectContaining({ width: '83%', backgroundColor: 'rgba(255,255,255,0.65)' }),
    )
  })

  it('unavailable-future-day (tomorrow) under 1h to open: bar FILLS, near full', () => {
    // msToOpen = 30 min. 30/(24*60) ≈ 2%. fill width ≈ 98%.
    const lateMonday = new Date('2026-05-11T22:45:00Z')
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-future-day"
        now={lateMonday}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T23:15:00Z')}
        msToClose={null}
        msToOpen={30 * 60_000}
      />,
    )
    const fill = getByTestId('hero-status-progress-bar-fill')
    expect(fill.props.style).toEqual(
      expect.objectContaining({ width: '98%', backgroundColor: 'rgba(255,255,255,0.65)' }),
    )
  })

  it('unavailable-future-day multi-day: bar FILLS capped at 0% when msToOpen exceeds 24h', () => {
    // msToOpen = 2 days = 48h. 48/24 = 2. fill width = 1 - 2 = -100% → capped at 0%.
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-future-day"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-13T12:00:00Z')}
        msToClose={null}
        msToOpen={2 * 24 * 3_600_000}
      />,
    )
    const fill = getByTestId('hero-status-progress-bar-fill')
    expect(fill.props.style).toEqual(
      expect.objectContaining({ width: '0%' }),
    )
  })

  // ── HIDDEN STATES — bar NOT rendered ──────────────────────
  it('redeemed-this-window: progress bar HIDDEN', () => {
    const { queryByTestId } = render(
      <HeroStatusBlock
        windowState="redeemed-this-window"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T16:00:00Z')}
        msToClose={null}
        msToOpen={4 * 3_600_000}
      />,
    )
    expect(queryByTestId('hero-status-progress-bar-fill')).toBeNull()
    expect(queryByTestId('hero-status-progress-bar')).toBeNull()
  })

  it('expired: progress bar HIDDEN (component itself returns null)', () => {
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
    expect(queryByTestId('hero-status-progress-bar-fill')).toBeNull()
  })

  it('no-windows: progress bar HIDDEN (component itself returns null)', () => {
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
    expect(queryByTestId('hero-status-progress-bar-fill')).toBeNull()
  })

  // ── DEFENSIVE — closing without window bounds renders no bar ──
  it('active state with missing currentWindowStartsAt: bar HIDDEN (defensive)', () => {
    const { queryByTestId } = render(
      <HeroStatusBlock
        windowState="active"
        now={NOW}
        currentWindowStartsAt={null}                                // defensive null
        currentWindowEndsAt={new Date('2026-05-11T15:00:00Z')}
        nextWindowStartsAt={null}
        msToClose={3 * 3_600_000}
        msToOpen={null}
      />,
    )
    expect(queryByTestId('hero-status-progress-bar-fill')).toBeNull()
  })
})

describe('HeroStatusBlock — accessibility (spec D10 amendment)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  const NOW = new Date('2026-05-11T12:00:00Z')

  // ── PRIMARY HIDDEN FROM A11Y TREE WHEN UNDER-1H TICK ACTIVE ────

  it('urgent <1m: primary Text hidden from a11y tree', () => {
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
    const primary = getByTestId('hero-status-primary')
    expect(primary.props.accessibilityElementsHidden).toBe(true)
    expect(primary.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('urgent <1h ≥1m: primary Text hidden from a11y tree (per-second tick band)', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T10:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:42:15Z')}
        nextWindowStartsAt={null}
        msToClose={42 * 60_000 + 15_000}
        msToOpen={null}
      />,
    )
    const primary = getByTestId('hero-status-primary')
    expect(primary.props.accessibilityElementsHidden).toBe(true)
    expect(primary.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('active ≥1h: primary Text VISIBLE to a11y tree (no per-second tick)', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="active"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T10:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T16:30:00Z')}
        nextWindowStartsAt={null}
        msToClose={4 * 3_600_000 + 30 * 60_000}
        msToOpen={null}
      />,
    )
    const primary = getByTestId('hero-status-primary')
    expect(primary.props.accessibilityElementsHidden).not.toBe(true)
    expect(primary.props.importantForAccessibility).not.toBe('no-hide-descendants')
  })

  it('unavailable-today <1h to open: primary Text hidden from a11y tree', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-today"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T12:42:15Z')}
        msToClose={null}
        msToOpen={42 * 60_000 + 15_000}
      />,
    )
    const primary = getByTestId('hero-status-primary')
    expect(primary.props.accessibilityElementsHidden).toBe(true)
  })

  it('redeemed-this-window <1h to next: primary Text hidden from a11y tree', () => {
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
    const primary = getByTestId('hero-status-primary')
    expect(primary.props.accessibilityElementsHidden).toBe(true)
  })

  // ── STABLE COARSE LABELS ON POLITE LIVE REGION ────────────────

  it('urgent <1m: live-region label is "Closes in under a minute"', () => {
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
    const region = getByTestId('hero-status-live-region')
    expect(region.props.accessibilityLiveRegion).toBe('polite')
    expect(region.props.accessibilityLabel).toBe('Ending in under a minute')
  })

  it('urgent <1h ≥1m: live-region label is "Closes in about 42 minutes"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="urgent"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T10:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T12:42:15Z')}
        nextWindowStartsAt={null}
        msToClose={42 * 60_000 + 15_000}
        msToOpen={null}
      />,
    )
    const region = getByTestId('hero-status-live-region')
    expect(region.props.accessibilityLabel).toBe('Ending in about 42 minutes')
  })

  it('active ≥1h: live-region label is the eyebrow "Voucher available now"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="active"
        now={NOW}
        currentWindowStartsAt={new Date('2026-05-11T10:00:00Z')}
        currentWindowEndsAt={new Date('2026-05-11T16:30:00Z')}
        nextWindowStartsAt={null}
        msToClose={4 * 3_600_000 + 30 * 60_000}
        msToOpen={null}
      />,
    )
    const region = getByTestId('hero-status-live-region')
    // Eyebrow-as-label fallback. Active eyebrow is "Available now"; for a11y
    // we prefix "Voucher " for clarity. The amended D10 spec gives this exact
    // string.
    expect(region.props.accessibilityLabel).toBe('Voucher available now')
  })

  it('unavailable-today <1m: live-region label is "Opens in under a minute"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-today"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T12:00:47Z')}
        msToClose={null}
        msToOpen={47_000}
      />,
    )
    const region = getByTestId('hero-status-live-region')
    expect(region.props.accessibilityLabel).toBe('Available in under a minute')
  })

  it('unavailable-today <1h ≥1m: live-region label is "Opens in about 42 minutes"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-today"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T12:42:15Z')}
        msToClose={null}
        msToOpen={42 * 60_000 + 15_000}
      />,
    )
    const region = getByTestId('hero-status-live-region')
    expect(region.props.accessibilityLabel).toBe('Available in about 42 minutes')
  })

  it('unavailable-today ≥1h: live-region label is the eyebrow "Opens today"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-today"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T16:00:00Z')}
        msToClose={null}
        msToOpen={4 * 3_600_000}
      />,
    )
    const region = getByTestId('hero-status-live-region')
    expect(region.props.accessibilityLabel).toBe('Available later today')
  })

  it('unavailable-future-day ≥1 day (Saturday): live-region label is "Opens Saturday"', () => {
    const { getByTestId } = render(
      <HeroStatusBlock
        windowState="unavailable-future-day"
        now={NOW}
        currentWindowStartsAt={null}
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-16T12:00:00Z')}
        msToClose={null}
        msToOpen={5 * 24 * 3_600_000}
      />,
    )
    const region = getByTestId('hero-status-live-region')
    expect(region.props.accessibilityLabel).toBe('Available Saturday')
  })

  it('redeemed-this-window <1m: live-region label is "Available again in under a minute"', () => {
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
    const region = getByTestId('hero-status-live-region')
    expect(region.props.accessibilityLabel).toBe('Available again in under a minute')
  })

  it('redeemed-this-window ≥1h: live-region label is the eyebrow "Available again"', () => {
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
    const region = getByTestId('hero-status-live-region')
    expect(region.props.accessibilityLabel).toBe('Available again')
  })

  // ── STABILITY: label DOES NOT change across per-second ticks ──

  it('urgent <1m: live-region label is STABLE across multiple per-second updates', () => {
    const baseStart = new Date('2026-05-11T10:00:00Z')
    const renderProps = (msToClose: number) => ({
      windowState: 'urgent' as const,
      now: NOW,
      currentWindowStartsAt: baseStart,
      currentWindowEndsAt: new Date(NOW.getTime() + msToClose),
      nextWindowStartsAt: null,
      msToClose,
      msToOpen: null,
    })
    const { getByTestId, rerender } = render(<HeroStatusBlock {...renderProps(47_000)} />)
    const initialLabel = getByTestId('hero-status-live-region').props.accessibilityLabel
    expect(initialLabel).toBe('Ending in under a minute')
    rerender(<HeroStatusBlock {...renderProps(46_000)} />)
    expect(getByTestId('hero-status-live-region').props.accessibilityLabel).toBe(initialLabel)
    rerender(<HeroStatusBlock {...renderProps(30_000)} />)
    expect(getByTestId('hero-status-live-region').props.accessibilityLabel).toBe(initialLabel)
    rerender(<HeroStatusBlock {...renderProps(1_000)} />)
    expect(getByTestId('hero-status-live-region').props.accessibilityLabel).toBe(initialLabel)
  })

  it('urgent <1h ≥1m: live-region label is STABLE across same-minute per-second updates', () => {
    // Within the same minute bucket (42m 15s → 42m 14s → 42m 1s), Math.round(ms/60_000)
    // gives a single-minute rounding shift between "42 minutes" and "41 minutes" at
    // around the 41:30 mark. Test that updates WITHIN the same rounded-minute don't
    // change the label.
    const baseStart = new Date('2026-05-11T10:00:00Z')
    const renderProps = (msToClose: number) => ({
      windowState: 'urgent' as const,
      now: NOW,
      currentWindowStartsAt: baseStart,
      currentWindowEndsAt: new Date(NOW.getTime() + msToClose),
      nextWindowStartsAt: null,
      msToClose,
      msToOpen: null,
    })
    // 42m 15s → Math.round(2535000/60000) = 42 minutes.
    const { getByTestId, rerender } = render(<HeroStatusBlock {...renderProps(42 * 60_000 + 15_000)} />)
    const labelA = getByTestId('hero-status-live-region').props.accessibilityLabel
    expect(labelA).toBe('Ending in about 42 minutes')
    // 42m 10s → Math.round(2530000/60000) = 42 minutes.
    rerender(<HeroStatusBlock {...renderProps(42 * 60_000 + 10_000)} />)
    expect(getByTestId('hero-status-live-region').props.accessibilityLabel).toBe(labelA)
    // 42m 1s → Math.round(2521000/60000) = 42 minutes.
    rerender(<HeroStatusBlock {...renderProps(42 * 60_000 + 1_000)} />)
    expect(getByTestId('hero-status-live-region').props.accessibilityLabel).toBe(labelA)
  })

  // ── HIDDEN STATES: no live-region rendered ────────────────────

  it('no-windows: live-region NOT rendered (component is null)', () => {
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
    expect(queryByTestId('hero-status-live-region')).toBeNull()
  })

  it('expired: live-region NOT rendered (component is null)', () => {
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
    expect(queryByTestId('hero-status-live-region')).toBeNull()
  })
})
