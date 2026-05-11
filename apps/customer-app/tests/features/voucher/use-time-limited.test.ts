import { renderHook, act } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { useTimeLimited } from '@/features/voucher/hooks/useTimeLimited'
import type { VoucherDetail } from '@/lib/api/voucher'

const baseVoucher = (overrides: Partial<VoucherDetail> = {}): VoucherDetail => ({
  id: 'v1', title: 'Test', type: 'TIME_LIMITED',
  description: null, terms: null, imageUrl: null,
  estimatedSaving: 5, expiryDate: null, code: null,
  status: 'ACTIVE', approvalStatus: 'APPROVED',
  merchant: { id: 'm1', businessName: 'X', tradingName: null, logoUrl: null, status: 'ACTIVE' },
  isRedeemedThisCycle: false, isFavourited: false,
  availableAgainAt: null,
  availabilityWindows: [],
  currentWindow: null,
  nextWindow: null,
  redeemedWindow: null,
  ...overrides,
})

describe('useTimeLimited — real implementation (M4b-4)', () => {
  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  it('returns isTimeLimited:false for non-TIME_LIMITED vouchers', () => {
    const { result } = renderHook(() => useTimeLimited(baseVoucher({ type: 'BOGO' })))
    expect(result.current.isTimeLimited).toBe(false)
    expect(result.current.windowState).toBe('no-windows')
  })

  it('returns windowState:"active" when inside an open window with >60 min remaining', () => {
    jest.setSystemTime(new Date('2026-05-11T11:00:00Z'))
    const voucher = baseVoucher({
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',
      },
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.isTimeLimited).toBe(true)
    expect(result.current.windowState).toBe('active')
  })

  it('flips to "urgent" when crossing the 60-min-remaining threshold', () => {
    jest.setSystemTime(new Date('2026-05-11T12:50:00Z'))
    const voucher = baseVoucher({
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',
      },
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.windowState).toBe('active')

    act(() => { jest.advanceTimersByTime(10 * 60_000) })
    expect(result.current.windowState).toBe('urgent')
  })

  it('flips to "unavailable-future-day" when crossing the window-close boundary', () => {
    jest.setSystemTime(new Date('2026-05-11T13:30:00Z'))
    const voucher = baseVoucher({
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',
      },
      nextWindow: {
        startsAt: '2026-05-12T10:00:00.000Z',
        endsAt:   '2026-05-12T14:00:00.000Z',
      },
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.windowState).toBe('urgent')

    act(() => { jest.advanceTimersByTime(31 * 60_000) })
    expect(result.current.windowState).toBe('unavailable-future-day')
  })

  it('AppState resume recomputes state from current time', () => {
    jest.setSystemTime(new Date('2026-05-11T13:00:00Z'))
    const voucher = baseVoucher({
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',
      },
      nextWindow: {
        startsAt: '2026-05-12T10:00:00.000Z',
        endsAt:   '2026-05-12T14:00:00.000Z',
      },
    })
    const appStateSpy = jest.spyOn(AppState, 'addEventListener')
    const { result } = renderHook(() => useTimeLimited(voucher))

    expect(result.current.windowState).toBe('urgent')

    jest.setSystemTime(new Date('2026-05-11T15:00:00Z'))
    const changeHandler = appStateSpy.mock.calls.find(c => c[0] === 'change')?.[1] as Function
    expect(changeHandler).toBeDefined()
    act(() => { changeHandler('active') })

    expect(result.current.windowState).toBe('unavailable-future-day')

    appStateSpy.mockRestore()
  })

  it('exposes nextBoundaryAt for the consumer (when state changes)', () => {
    jest.setSystemTime(new Date('2026-05-11T11:00:00Z'))
    const voucher = baseVoucher({
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',
      },
    })
    const { result } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.nextBoundaryAt).toEqual(new Date('2026-05-11T14:00:00.000Z'))
  })

  it('null voucher → safe defaults', () => {
    const { result } = renderHook(() => useTimeLimited(null))
    expect(result.current.isTimeLimited).toBe(false)
    expect(result.current.windowState).toBe('no-windows')
  })

  // ── Unmount-cleanup pins (Gate F review, 2026-05-11) ────────────────
  // The hook subscribes to a module-level AppState fan-out and schedules
  // a boundary `setTimeout` + per-minute `setInterval`. These tests pin
  // that none of those leak after unmount:
  //   1. last-hook unmount releases the module-level AppState subscription;
  //   2. pending boundary timer cannot call setState after unmount
  //      (would trigger React's "setState on unmounted component" warning).

  it('last hook to unmount releases the module-level AppState subscription', () => {
    // Stub AppState.addEventListener to return a capturable subscription
    // object — lets us assert .remove() fires on last unmount. The module-
    // level fan-out lazily registers the underlying AppState listener
    // (on first subscriber) and releases it when the listener Set drains.
    //
    // Call-count assertions here are deliberately behaviour-only — RTL's
    // renderHook can double-invoke effects (mount → cleanup → re-mount
    // cycle under StrictMode-style setups), which churns add/remove pairs
    // during the mount cycle itself. The contract under test is the
    // POST-unmount behaviour: after the last hook unmounts, the active
    // subscription must have its remove() called.
    const removeSpy = jest.fn()
    const addSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: removeSpy } as unknown as { remove: () => void })

    jest.setSystemTime(new Date('2026-05-11T11:00:00Z'))
    const voucher = baseVoucher({
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',
      },
    })

    const a = renderHook(() => useTimeLimited(voucher))
    const b = renderHook(() => useTimeLimited(voucher))

    // At least one underlying AppState 'change' subscription was registered.
    expect(addSpy.mock.calls.filter(c => c[0] === 'change').length).toBeGreaterThan(0)

    // Clear the remove-spy history so we only count the post-unmount
    // cleanup, not any setup-cycle churn from RTL effect double-invoke.
    removeSpy.mockClear()

    // Unmount one — the OTHER hook still has a live listener in the
    // module-level Set, so the underlying subscription must stay alive
    // (no remove() during this transition).
    a.unmount()
    expect(removeSpy).not.toHaveBeenCalled()

    // Unmount the last — set drains to 0 → underlying subscription is
    // released. The fan-out's "nullify on last-unsubscribe" path runs.
    b.unmount()
    expect(removeSpy).toHaveBeenCalled()

    addSpy.mockRestore()
  })

  // ── M4d additive return shape (Task A.3) ────────────────────────────
  // Purely additive: currentWindow + nextWindow + msToClose + msToOpen
  // are exposed alongside the existing 3 fields. Feeds the M4d
  // HeroStatusBlock progress bar (% completed) and the final-60s seconds
  // tick. No new interval/timer logic — that's A.4.

  describe('M4d additive return shape (Task A.3)', () => {
    it('exposes currentWindow + msToClose when in active state', () => {
      jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
      const voucher = baseVoucher({
        availabilityWindows: [{ dayOfWeek: 1, openTime: '10:00', closeTime: '15:00' }],
        currentWindow: {
          startsAt: '2026-05-11T10:00:00.000Z',
          endsAt:   '2026-05-11T15:00:00.000Z',
        },
        nextWindow: null,
      })
      const { result } = renderHook(() => useTimeLimited(voucher))
      expect(result.current.currentWindow).toEqual({
        startsAt: new Date('2026-05-11T10:00:00.000Z'),
        endsAt:   new Date('2026-05-11T15:00:00.000Z'),
      })
      expect(result.current.msToClose).toBe(3 * 60 * 60_000)  // 3h = 10_800_000
      expect(result.current.nextWindow).toBeNull()
      expect(result.current.msToOpen).toBeNull()
    })

    it('exposes nextWindow + msToOpen when in unavailable-today state', () => {
      jest.setSystemTime(new Date('2026-05-11T12:00:00Z'))
      const voucher = baseVoucher({
        availabilityWindows: [{ dayOfWeek: 1, openTime: '17:00', closeTime: '19:00' }],
        currentWindow: null,
        nextWindow: {
          startsAt: '2026-05-11T17:00:00.000Z',
          endsAt:   '2026-05-11T19:00:00.000Z',
        },
      })
      const { result } = renderHook(() => useTimeLimited(voucher))
      expect(result.current.currentWindow).toBeNull()
      expect(result.current.msToClose).toBeNull()
      expect(result.current.nextWindow).toEqual({
        startsAt: new Date('2026-05-11T17:00:00.000Z'),
        endsAt:   new Date('2026-05-11T19:00:00.000Z'),
      })
      expect(result.current.msToOpen).toBe(5 * 60 * 60_000)  // 5h = 18_000_000
    })

    it('returns all four fields null when not TIME_LIMITED', () => {
      const { result } = renderHook(() => useTimeLimited(baseVoucher({ type: 'BOGO' })))
      expect(result.current.currentWindow).toBeNull()
      expect(result.current.nextWindow).toBeNull()
      expect(result.current.msToClose).toBeNull()
      expect(result.current.msToOpen).toBeNull()
    })
  })

  it('pending boundary timer does not call setState after unmount (no React warning)', () => {
    jest.setSystemTime(new Date('2026-05-11T11:00:00Z'))
    const voucher = baseVoucher({
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: {
        startsAt: '2026-05-11T10:00:00.000Z',
        endsAt:   '2026-05-11T14:00:00.000Z',
      },
    })
    const { result, unmount } = renderHook(() => useTimeLimited(voucher))
    expect(result.current.windowState).toBe('active')

    // Capture console.error to detect React's "setState on unmounted
    // component" warning. Without proper cleanup in the boundary-timer
    // effect's return function, advancing fake timers past the urgency-
    // crossing would fire `recompute()` → `setComputed(...)` → React
    // warns. With cleanup, the timer is cleared during unmount and no
    // recompute fires.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    unmount()

    // Advance well past the boundary timer's would-be fire window.
    act(() => { jest.advanceTimersByTime(4 * 60 * 60_000) })

    const setStateWarnings = errSpy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && /unmounted/i.test(a)),
    )
    expect(setStateWarnings).toEqual([])

    errSpy.mockRestore()
  })
})
