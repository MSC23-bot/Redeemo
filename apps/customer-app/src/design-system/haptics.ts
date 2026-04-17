import * as Haptics from 'expo-haptics'

let enabled = true
export function setHapticsEnabled(v: boolean) { enabled = v }

const guard = (fn: () => Promise<unknown>) => async () => { if (enabled) await fn() }

/** Convenience shorthand for the most common haptic (light impact). */
export const lightHaptic = () => { if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) }
/** Convenience shorthand for error haptic (notification error). */
export const errorHaptic = () => { if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) }
/** Convenience shorthand for success haptic (notification success). */
export const successHaptic = () => { if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) }

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
