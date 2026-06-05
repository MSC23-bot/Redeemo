import React from 'react'
import { StyleSheet, useWindowDimensions } from 'react-native'
import Svg, { Path, Defs, RadialGradient, Stop, Rect, Filter, FeGaussianBlur } from 'react-native-svg'
import { color } from '@/design-system'

// Brand-header redesign (2026-06-05). Single smooth wave that forms the brand
// header's bottom edge, dropping into the warm-peach body. Filled with the body
// colour (color.surface.body === #FFF9F5) so the wave + body read as one
// continuous surface; the brand gradient shows ABOVE the curve.
export const WAVE_HEIGHT = 44

// On-brand typography colour: a warm off-white (not plain #FFF) that sits
// nicely on the red surface. Used for the greeting + location + status label.
export const ON_BRAND_TEXT = '#FFF3EC'

export type RadialStop = { offset: string; color: string }

/**
 * Organic radial brand fill (owner direction 2026-06-05: no straight vertical
 * gradient on the header — a soft, directionless flow instead). Same SVG recipe
 * as the Home category cards. Caller supplies the measured width/height so the
 * radial fills the surface exactly; returns null until measured.
 */
export function HeaderRadialGradient({
  width,
  height,
  gid,
  cx,
  cy,
  r,
  stops,
}: {
  width: number
  height: number
  gid: string
  cx: string
  cy: string
  r: string
  stops: ReadonlyArray<RadialStop>
}) {
  if (width <= 0 || height <= 0) return null
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={gid} cx={cx} cy={cy} r={r}>
          {stops.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${gid})`} />
    </Svg>
  )
}

export function HomeHeaderWave() {
  // The header spans the full screen width, so the window width is a reliable
  // concrete width for the SVG (more robust than "100%" in react-native-svg).
  const { width } = useWindowDimensions()
  return (
    <Svg
      width={width}
      height={WAVE_HEIGHT}
      viewBox="0 0 300 74"
      preserveAspectRatio="none"
      style={styles.wave}
      pointerEvents="none"
    >
      <Defs>
        {/* Real gaussian blur on a stroke that traces the curve — an even,
            clearly-visible soft shadow that follows the WHOLE wavy edge (a
            vertical gradient can't, since the edge dips from y≈12 to y≈55). */}
        <Filter id="wave-shadow-blur" x="-5%" y="-150%" width="110%" height="500%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
        </Filter>
      </Defs>
      <Path d="M0,74 L0,46 C90,64 175,10 300,26 L300,74 Z" fill={color.surface.body} />
      <Path
        d="M0,49 C90,67 175,13 300,29"
        stroke="#5A1709"
        strokeOpacity="0.7"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        filter="url(#wave-shadow-blur)"
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  wave: { position: 'absolute', left: 0, bottom: -1 },
})
