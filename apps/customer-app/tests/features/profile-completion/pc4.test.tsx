jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ base64: 'x'.repeat(200_000), uri: 'file://a.jpg', width: 1024, height: 1024 }],
  }),
  MediaTypeOptions: { Images: 'Images' },
}))
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockResolvedValue({ base64: 'y'.repeat(200_000), uri: 'file://b.jpg' }),
  SaveFormat: { JPEG: 'jpeg' },
}))

import { renderHook, act } from '@testing-library/react-native'
import { useAvatarPicker } from '@/features/profile-completion/hooks/useAvatarPicker'

describe('useAvatarPicker', () => {
  it('rejects images over 150kb', async () => {
    const { result } = renderHook(() => useAvatarPicker())
    await act(async () => { await result.current.pick() })
    expect(result.current.error).toMatch(/too large/i)
  })
})
