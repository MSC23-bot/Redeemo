import { renderHook, act } from '@testing-library/react-native'
import {
  PRESENTATION_WINDOW_MS,
  isPresentationActive,
  usePresentationActive,
} from '@/features/voucher/utils/presentationWindow'

// =========================================================================
// Pure helper — isPresentationActive(redeemedAt, now)
// =========================================================================

describe('isPresentationActive', () => {
  it('exports the constant as exactly 2 hours', () => {
    expect(PRESENTATION_WINDOW_MS).toBe(2 * 60 * 60 * 1000)
    expect(PRESENTATION_WINDOW_MS).toBe(7_200_000)
  })

  it('returns true 1 minute after redemption', () => {
    const redeemedAt = '2026-05-08T12:00:00.000Z'
    const now        = new Date('2026-05-08T12:01:00.000Z').getTime()
    expect(isPresentationActive(redeemedAt, now)).toBe(true)
  })

  it('returns true at 1h 59m (just inside the window)', () => {
    const redeemedAt = '2026-05-08T12:00:00.000Z'
    const now        = new Date('2026-05-08T13:59:59.000Z').getTime()
    expect(isPresentationActive(redeemedAt, now)).toBe(true)
  })

  it('returns false at exactly 2 hours (boundary closed)', () => {
    const redeemedAt = '2026-05-08T12:00:00.000Z'
    const now        = new Date('2026-05-08T14:00:00.000Z').getTime()
    expect(isPresentationActive(redeemedAt, now)).toBe(false)
  })

  it('returns false at 2h 1s (past boundary)', () => {
    const redeemedAt = '2026-05-08T12:00:00.000Z'
    const now        = new Date('2026-05-08T14:00:01.000Z').getTime()
    expect(isPresentationActive(redeemedAt, now)).toBe(false)
  })

  it('returns false on malformed ISO string (defensive — never throw)', () => {
    expect(isPresentationActive('not-a-date', Date.now())).toBe(false)
    expect(isPresentationActive('', Date.now())).toBe(false)
  })

  it('returns true with default `now` when redeemedAt is "now"', () => {
    const redeemedAt = new Date().toISOString()
    expect(isPresentationActive(redeemedAt)).toBe(true)
  })
})

// =========================================================================
// Hook — usePresentationActive(redeemedAt)
//
// Pins the setTimeout-at-expiry pattern: re-render exactly ONCE when the
// window flips closed, NOT on every render or via a polling interval.
// =========================================================================

describe('usePresentationActive (hook)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    // Pin a fixed system time so `Date.now()` inside the hook is
    // deterministic relative to the redeemedAt strings used below.
    jest.setSystemTime(new Date('2026-05-08T12:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns false when redeemedAt is null', () => {
    const { result } = renderHook(() => usePresentationActive(null))
    expect(result.current).toBe(false)
  })

  it('returns true immediately after redemption (within window)', () => {
    const { result } = renderHook(() =>
      usePresentationActive('2026-05-08T11:30:00.000Z'), // 30 min ago
    )
    expect(result.current).toBe(true)
  })

  it('returns false on mount when window already expired', () => {
    const { result } = renderHook(() =>
      usePresentationActive('2026-05-08T09:00:00.000Z'), // 3h ago
    )
    expect(result.current).toBe(false)
  })

  it('flips from true → false at the 2h boundary (single timer)', () => {
    // Redeemed 1h 30m ago — window flips at +30 min from now.
    const redeemedAt = '2026-05-08T10:30:00.000Z'
    const { result } = renderHook(() => usePresentationActive(redeemedAt))
    expect(result.current).toBe(true)

    // Advance 29m 59s — still inside window.
    act(() => {
      jest.advanceTimersByTime(29 * 60 * 1000 + 59 * 1000)
    })
    expect(result.current).toBe(true)

    // Cross the boundary — single setTimeout fires, hook re-renders.
    act(() => {
      jest.advanceTimersByTime(2_000)
    })
    expect(result.current).toBe(false)
  })

  it('does NOT poll — only one timer is armed for the lifetime of the window', () => {
    // If the hook polled (e.g. setInterval(1s)), there would be hundreds
    // of scheduled timers across a 30-minute span. With setTimeout-at-
    // expiry there's exactly one.
    const redeemedAt = '2026-05-08T10:30:00.000Z' // expires in 30 min
    renderHook(() => usePresentationActive(redeemedAt))
    expect(jest.getTimerCount()).toBe(1)

    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000) // +10 min, still inside
    })
    expect(jest.getTimerCount()).toBe(1)
  })

  it('clears the timer on unmount (no leaked timers)', () => {
    const { unmount } = renderHook(() =>
      usePresentationActive('2026-05-08T11:30:00.000Z'),
    )
    expect(jest.getTimerCount()).toBe(1)
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('re-arms the timer when redeemedAt changes (e.g. fresh redemption replaces stale)', () => {
    const { result, rerender } = renderHook(
      ({ at }: { at: string | null }) => usePresentationActive(at),
      { initialProps: { at: '2026-05-08T09:00:00.000Z' } }, // already expired
    )
    expect(result.current).toBe(false)

    rerender({ at: '2026-05-08T11:30:00.000Z' }) // fresh, 30m ago
    expect(result.current).toBe(true)
    expect(jest.getTimerCount()).toBe(1)
  })

  it('does not arm a timer when window is already expired on mount', () => {
    renderHook(() =>
      usePresentationActive('2026-05-08T09:00:00.000Z'), // 3h ago
    )
    // Already-expired path returns early — no timer scheduled.
    expect(jest.getTimerCount()).toBe(0)
  })

  it('treats malformed ISO defensively (no timer, returns false)', () => {
    const { result } = renderHook(() => usePresentationActive('not-a-date'))
    expect(result.current).toBe(false)
    expect(jest.getTimerCount()).toBe(0)
  })
})
