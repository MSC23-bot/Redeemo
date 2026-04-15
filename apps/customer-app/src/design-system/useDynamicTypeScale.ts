import { PixelRatio, useWindowDimensions } from 'react-native'

/** Returns the font-scale multiplier, clamped [1, 1.4] for layout safety. */
export function useDynamicTypeScale(): number {
  useWindowDimensions() // subscribe to resize / orientation
  return Math.min(Math.max(PixelRatio.getFontScale(), 1), 1.4)
}
