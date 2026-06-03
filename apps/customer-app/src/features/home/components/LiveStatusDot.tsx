import { View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { color } from '@/design-system'
import { PulsingDot } from '@/design-system/motion/PulsingDot'

/**
 * Open / closed status dot for the Home cards (2026-06-03, owner direction:
 * give the open/closed sign motion).
 *
 * "Open" is a LIVE state, so the dot gently pulses — the same <PulsingDot> the
 * redemption LIVE badge uses, so "live now" reads consistently across the app
 * (and unlike the looping rail glyphs, a pulse genuinely encodes an ongoing
 * state here, the right reason to loop). It is tuned MUCH softer than the LIVE
 * badge though — a small status dot should breathe, not throb — so it barely
 * shrinks and only half-dims, slowly. "Closed" is a calm, static grey dot — no
 * motion, because nothing is live. Reduce-motion safe via <PulsingDot> (a
 * steady green dot, no pulse, when reduce-motion is on).
 */
export function LiveStatusDot({
  open,
  size = 6,
  style,
}: {
  open: boolean
  size?: number
  style?: StyleProp<ViewStyle>
}) {
  if (open) {
    // Soft, slow breath (not the LIVE badge's strong throb): barely shrinks,
    // only half-dims, ~2.4s cycle. Owner feedback 2026-06-03 — "too intense".
    return (
      <PulsingDot
        color={color.savingsGreen}
        size={size}
        minScale={0.92}
        minOpacity={0.6}
        duration={1200}
        style={style}
      />
    )
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color.text.tertiary }, style]} />
  )
}
