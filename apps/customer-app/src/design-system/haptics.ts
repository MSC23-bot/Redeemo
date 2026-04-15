import * as Haptics from 'expo-haptics'

let enabled = true
export function setHapticsEnabled(v: boolean) { enabled = v }

const guard = (fn: () => Promise<unknown>) => async () => { if (enabled) await fn() }

export const haptics = {
  touch: {
    light:  guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
    medium: guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  },
  success:   guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning:   guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error:     guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  selection: guard(() => Haptics.selectionAsync()),
}
