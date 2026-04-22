jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))
import * as Haptics from 'expo-haptics'
import { haptics, setHapticsEnabled } from '@/design-system/haptics'

describe('haptics', () => {
  beforeEach(() => { jest.clearAllMocks(); setHapticsEnabled(true) })
  it('fires light impact for touch.light', async () => {
    await haptics.touch.light()
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light')
  })
  it('fires success notification', async () => {
    await haptics.success()
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success')
  })
  it('no-ops when globally disabled', async () => {
    setHapticsEnabled(false)
    await haptics.success()
    expect(Haptics.notificationAsync).not.toHaveBeenCalled()
  })
})
