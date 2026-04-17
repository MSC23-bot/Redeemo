import { renderHook, act } from '@testing-library/react-native'
import { useTimeLimited } from '@/features/voucher/hooks/useTimeLimited'

describe('useTimeLimited', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('returns "active" state when voucher has not expired', () => {
    const expiryDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    const { result } = renderHook(() => useTimeLimited({ type: 'TIME_LIMITED', expiryDate }))

    expect(result.current.state).toBe('active')
    expect(result.current.remainingSeconds).toBeGreaterThan(0)
    expect(result.current.formattedCountdown).toMatch(/\d+d \d+h \d+m/)
  })

  it('returns "expired" state when expiryDate is in the past', () => {
    const expiryDate = new Date(Date.now() - 60_000).toISOString()
    const { result } = renderHook(() => useTimeLimited({ type: 'TIME_LIMITED', expiryDate }))

    expect(result.current.state).toBe('expired')
    expect(result.current.remainingSeconds).toBe(0)
  })

  it('transitions from active to expired when countdown reaches zero', () => {
    const expiryDate = new Date(Date.now() + 3000).toISOString()
    const { result } = renderHook(() => useTimeLimited({ type: 'TIME_LIMITED', expiryDate }))

    expect(result.current.state).toBe('active')
    act(() => { jest.advanceTimersByTime(4000) })
    expect(result.current.state).toBe('expired')
  })

  it('returns "inactive" for non-TIME_LIMITED vouchers', () => {
    const { result } = renderHook(() => useTimeLimited({ type: 'BOGO', expiryDate: null }))
    expect(result.current.state).toBe('inactive')
  })

  it('formats countdown as "Xd Xh Xm" for multi-day durations', () => {
    const expiryDate = new Date(Date.now() + (2 * 24 * 60 * 60 + 14 * 60 * 60 + 32 * 60) * 1000).toISOString()
    const { result } = renderHook(() => useTimeLimited({ type: 'TIME_LIMITED', expiryDate }))
    expect(result.current.formattedCountdown).toMatch(/2d 14h 3[12]m/)
  })

  it('formats countdown as "Xh Xm Xs" when under 24 hours', () => {
    const expiryDate = new Date(Date.now() + (3 * 60 * 60 + 15 * 60) * 1000).toISOString()
    const { result } = renderHook(() => useTimeLimited({ type: 'TIME_LIMITED', expiryDate }))
    expect(result.current.formattedCountdown).toMatch(/3h 1[45]m \d+s/)
  })
})
