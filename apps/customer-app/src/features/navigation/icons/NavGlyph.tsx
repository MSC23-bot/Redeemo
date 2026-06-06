import React from 'react'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { BrandGradientVector } from '@/design-system/components/BrandGradientGlyph'
import { REDEEMO_NAV_ICONS, type NavIconName } from './navIconPaths'
import { NAV_INK, NAV_OUTLINE_STROKE } from '../navTokens'

type Props = {
  name: NavIconName
  /** outline = inactive line icon (warm-ink stroke); filled = active solid icon (brand gradient). */
  weight: 'outline' | 'filled'
  size: number
  testID: string
}

/**
 * Renders one bespoke Redeemo nav icon (NavIconName) in one weight at `size`.
 * Both weights are the same metaphor authored to the same per-icon viewBox, so
 * they read at the same optical size:
 *   • outline → warm-ink STROKE (round caps/joins) over the outline path.
 *   • filled  → brand red->orange gradient FILL of the filled path
 *               (via BrandGradientVector — default nonzero, which the paths
 *               are authored for).
 */
export function NavGlyph({ name, weight, size, testID }: Props) {
  const icon = REDEEMO_NAV_ICONS[name]

  if (weight === 'filled') {
    return (
      <View testID={testID}>
        <BrandGradientVector path={icon.filled} size={size} viewBox={icon.viewBox} />
      </View>
    )
  }

  return (
    <Svg width={size} height={size} viewBox={icon.viewBox} testID={testID}>
      <Path
        d={icon.outline}
        fill="none"
        stroke={NAV_INK}
        strokeWidth={NAV_OUTLINE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
