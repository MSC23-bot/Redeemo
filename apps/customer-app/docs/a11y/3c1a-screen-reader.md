# 3C.1a — Screen Reader Audit (VoiceOver / TalkBack)

- Every button has `accessibilityLabel` (explicit or derived from children)
- Form fields: `accessibilityLabel={label}` on TextInput
- Form errors: `accessibilityLiveRegion="polite"` on error Text
- Disabled tabs: `accessibilityRole="button"`, `accessibilityState={{ disabled: true }}`, no `onPress`
- Chips: `accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`
- StepIndicator: `accessibilityRole="progressbar"`, `accessibilityValue={{ min, max, now }}`
- Countdown: plain Text, reads naturally on focus
- OtpField: hidden TextInput has `accessibilityLabel="One-time code"`
- Toast: uses `accessibilityLiveRegion="polite"` for announcements
