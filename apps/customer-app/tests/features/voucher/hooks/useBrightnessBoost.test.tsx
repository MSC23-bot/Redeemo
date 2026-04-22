import { renderHook, act } from '@testing-library/react-native'
import * as Brightness from 'expo-brightness'
import { useBrightnessBoost } from '@/features/voucher/hooks/useBrightnessBoost'

jest.mock('expo-brightness', () => ({
  getBrightnessAsync: jest.fn(),
  setBrightnessAsync: jest.fn(),
}))

describe('useBrightnessBoost', () => {
  beforeEach(() => jest.clearAllMocks())

  it('captures current brightness then sets to 1.0 on mount', async () => {
    ;(Brightness.getBrightnessAsync as jest.Mock).mockResolvedValue(0.42)
    ;(Brightness.setBrightnessAsync as jest.Mock).mockResolvedValue(undefined)

    renderHook(() => useBrightnessBoost(true))
    await act(async () => {})

    expect(Brightness.getBrightnessAsync).toHaveBeenCalled()
    expect(Brightness.setBrightnessAsync).toHaveBeenCalledWith(1)
  })

  it('restores previous brightness on unmount', async () => {
    ;(Brightness.getBrightnessAsync as jest.Mock).mockResolvedValue(0.42)
    ;(Brightness.setBrightnessAsync as jest.Mock).mockResolvedValue(undefined)

    const { unmount } = renderHook(() => useBrightnessBoost(true))
    await act(async () => {})
    ;(Brightness.setBrightnessAsync as jest.Mock).mockClear()

    unmount()
    await act(async () => {})

    expect(Brightness.setBrightnessAsync).toHaveBeenCalledWith(0.42)
  })

  it('swallows errors silently (best-effort)', async () => {
    ;(Brightness.getBrightnessAsync as jest.Mock).mockRejectedValue(new Error('denied'))
    expect(() => renderHook(() => useBrightnessBoost(true))).not.toThrow()
  })

  it('does nothing when active=false', async () => {
    renderHook(() => useBrightnessBoost(false))
    await act(async () => {})
    expect(Brightness.getBrightnessAsync).not.toHaveBeenCalled()
  })
})
