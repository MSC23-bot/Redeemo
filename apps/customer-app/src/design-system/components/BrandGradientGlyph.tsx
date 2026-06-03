import { useId } from 'react'
import type { ImageSourcePropType } from 'react-native'
import Svg, { Defs, LinearGradient, Stop, Rect, Mask, Image as SvgImage, Path } from 'react-native-svg'
import { color } from '../tokens'

/**
 * Brand red->orange gradient fills for the Home rail glyphs (2026-06-03, owner
 * direction: tint every rail icon with the same gradient as the Explore-all
 * round arrow button, `color.brandGradient` = #E20C04 -> #E84A00, diagonal).
 *
 * No `@react-native-masked-view` dependency: a white-on-transparent PNG glyph
 * is used as an SVG luminance mask over a gradient rect; vector marks (star /
 * flame) fill their path with the same gradient directly. Each instance gets a
 * collision-proof gradient id (useId, colons stripped — colons are invalid in
 * SVG url() refs and clash across <Svg> roots on Android).
 */
const GRAD = color.brandGradient

/** A white PNG glyph painted with the brand gradient (glyph as SVG mask). */
export function BrandGradientPng({
  source,
  width,
  height,
}: {
  source: ImageSourcePropType
  width: number
  height: number
}) {
  const raw = useId().replace(/:/g, '')
  const gid = `bgGrad${raw}`
  const mid = `bgMask${raw}`
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={GRAD[0]} />
          <Stop offset="1" stopColor={GRAD[1]} />
        </LinearGradient>
        <Mask id={mid}>
          <SvgImage href={source} width={width} height={height} preserveAspectRatio="xMidYMid meet" />
        </Mask>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${gid})`} mask={`url(#${mid})`} />
    </Svg>
  )
}

/** A vector path filled with the brand gradient (used for the star + flame). */
export function BrandGradientVector({
  path,
  size,
  viewBox = '0 0 24 24',
}: {
  path: string
  size: number
  viewBox?: string
}) {
  const raw = useId().replace(/:/g, '')
  const gid = `bgGradV${raw}`
  return (
    <Svg width={size} height={size} viewBox={viewBox}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={GRAD[0]} />
          <Stop offset="1" stopColor={GRAD[1]} />
        </LinearGradient>
      </Defs>
      <Path d={path} fill={`url(#${gid})`} />
    </Svg>
  )
}
