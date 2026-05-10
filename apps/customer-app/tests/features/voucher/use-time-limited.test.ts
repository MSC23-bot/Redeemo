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
})
