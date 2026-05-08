import { renderHook } from '@testing-library/react-native'
import * as Brightness from 'expo-brightness'
import { useBrightnessBoost } from '@/features/voucher/hooks/useBrightnessBoost'

jest.mock('expo-brightness', () => ({
  getBrightnessAsync: jest.fn().mockResolvedValue(0.4),
  setBrightnessAsync: jest.fn().mockResolvedValue(undefined),
}))

describe('useBrightnessBoost', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(Brightness.getBrightnessAsync as jest.Mock).mockResolvedValue(0.4)
    ;(Brightness.setBrightnessAsync as jest.Mock).mockResolvedValue(undefined)
  })

  it('captures current brightness and sets to 1 when active', async () => {
    renderHook(() => useBrightnessBoost(true))
    // Allow the async capture+set chain to settle.
    await Promise.resolve()
    await Promise.resolve()
    expect(Brightness.getBrightnessAsync).toHaveBeenCalledTimes(1)
    expect(Brightness.setBrightnessAsync).toHaveBeenCalledWith(1)
  })

  it('restores prior brightness on unmount', async () => {
    const { unmount } = renderHook(() => useBrightnessBoost(true))
    await Promise.resolve()
    await Promise.resolve()
    unmount()
    // setBrightnessAsync called twice: once with 1 (boost), once with 0.4 (restore).
    expect(Brightness.setBrightnessAsync).toHaveBeenLastCalledWith(0.4)
  })

  it('is a no-op when active=false', () => {
    renderHook(() => useBrightnessBoost(false))
    expect(Brightness.getBrightnessAsync).not.toHaveBeenCalled()
    expect(Brightness.setBrightnessAsync).not.toHaveBeenCalled()
  })

  it('survives Brightness.getBrightnessAsync rejection silently (best-effort contract)', async () => {
    ;(Brightness.getBrightnessAsync as jest.Mock).mockRejectedValueOnce(new Error('LowPowerMode'))
    expect(() => renderHook(() => useBrightnessBoost(true))).not.toThrow()
    // Wait for the rejection to flush.
    await new Promise((r) => setTimeout(r, 10))
    // setBrightnessAsync(1) should NOT fire because getBrightness failed
    // before we captured the prior value.
    expect(Brightness.setBrightnessAsync).not.toHaveBeenCalled()
  })

  it('does not crash on restore when capture failed (no prior value)', async () => {
    ;(Brightness.getBrightnessAsync as jest.Mock).mockRejectedValueOnce(new Error('Permission'))
    const { unmount } = renderHook(() => useBrightnessBoost(true))
    await new Promise((r) => setTimeout(r, 10))
    expect(() => unmount()).not.toThrow()
  })
})
