'use client'

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The brand's R is two voucher ribbons. Owner references (2026-07-07): a
 * satin, dimensional ribbon in perspective: wide where it enters the frame,
 * narrowing as it recedes, twisting to its darker back face, with the section
 * boundary FOLLOWING the ribbon (in the reference the ribbon is the horizon
 * between light sky and dark ground: never a straight break behind it).
 *
 * So this is an in-flow divider that owns the seam: it paints `topColor`
 * above the band and `bottomColor` below it, and the band's curve is the
 * transition. No negative margins, no overlap with section content.
 */

const VIEW_W = 1440
const VIEW_H = 260
const HALF_W = 42 // ribbon half-thickness at scale 1
const SAMPLES = 400
const FOLD_T = 0.58 // where the band twists over itself
const FOLD_SPAN = 0.085 // how quickly it pinches
const NOTCH_T = 0.4 // die-cut voucher bite, carved into the bright face
const NOTCH_R = 16

// Centreline: one relaxed S-bend, edge to edge with bleed past both sides.
const P0 = { x: -80, y: 96 }
const P1 = { x: 380, y: 238 }
const P2 = { x: 1020, y: -42 }
const P3 = { x: 1540, y: 172 }

// Fills bleed past the viewBox so the scroll drift never exposes a gap.
const BLEED_X = 100
const BLEED_Y = 60

function bezier(t: number) {
  const u = 1 - t
  return {
    x: u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x,
    y: u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y,
  }
}

function bezierTangent(t: number) {
  const u = 1 - t
  const x =
    3 * u * u * (P1.x - P0.x) + 6 * u * t * (P2.x - P1.x) + 3 * t * t * (P3.x - P2.x)
  const y =
    3 * u * u * (P1.y - P0.y) + 6 * u * t * (P2.y - P1.y) + 3 * t * t * (P3.y - P2.y)
  const len = Math.hypot(x, y) || 1
  return { x: x / len, y: y / len }
}

// Perspective: the band enters wide (near the viewer) and recedes narrower.
function taper(t: number) {
  return 1.42 - 0.82 * t
}

// The band pinches to a sliver at the fold: that pinch is the twist.
function pinch(t: number) {
  const s = Math.min(1, Math.abs(t - FOLD_T) / FOLD_SPAN)
  const smooth = s * s * (3 - 2 * s)
  return 0.12 + 0.88 * smooth
}

const halfWidth = (t: number) => HALF_W * taper(t) * pinch(t)

// Geometry is pure module-scope math: identical on server and client.
type Pt = { x: number; y: number }
const top: Pt[] = []
const bottom: Pt[] = []
const NOTCH_C = bezier(NOTCH_T)
for (let i = 0; i <= SAMPLES; i++) {
  const t = i / SAMPLES
  const p = bezier(t)
  const tan = bezierTangent(t)
  const w = halfWidth(t)
  let tx = p.x - tan.y * w
  let ty = p.y + tan.x * w
  // Carve the die-cut voucher bite straight into the top edge, so the edge
  // highlight wraps around it like a real punched notch.
  const along = tx - NOTCH_C.x
  if (Math.abs(along) < NOTCH_R) {
    const depth = Math.sqrt(NOTCH_R * NOTCH_R - along * along)
    tx += tan.y * depth
    ty -= tan.x * depth
  }
  top.push({ x: tx, y: ty })
  bottom.push({ x: p.x + tan.y * w, y: p.y - tan.x * w })
}

const FOLD_I = Math.round(FOLD_T * SAMPLES)

const line = (pts: Pt[], move: boolean) =>
  pts
    .map((p, i) => `${i === 0 && move ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

function bandPath(from: number, to: number) {
  const t = top.slice(from, to + 1)
  const b = bottom.slice(from, to + 1).reverse()
  return `${line(t, true)} ${line(b, false)} Z`
}

// Segments overlap by a few samples so the pinch never opens a hairline gap.
const FRONT_PATH = bandPath(0, Math.min(FOLD_I + 4, SAMPLES))
const BACK_PATH = bandPath(Math.max(FOLD_I - 4, 0), SAMPLES)
const FRONT_TOP_EDGE = line(top.slice(0, FOLD_I + 1), true)
const BACK_TOP_EDGE = line(top.slice(FOLD_I, SAMPLES + 1), true)
const FRONT_BOTTOM_EDGE = line(bottom.slice(0, FOLD_I + 1), true)

// The seam itself: topColor fills everything above the band's top edge,
// bottomColor everything below its bottom edge. The band is the horizon.
const TOP_FILL = `M${-BLEED_X} ${-BLEED_Y} L${VIEW_W + BLEED_X} ${-BLEED_Y} L${VIEW_W + BLEED_X} ${top[SAMPLES].y.toFixed(1)} ${[...top]
  .reverse()
  .map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
  .join(' ')} L${-BLEED_X} ${top[0].y.toFixed(1)} Z`
const BOTTOM_FILL = `M${-BLEED_X} ${bottom[0].y.toFixed(1)} ${line(bottom, false)} L${VIEW_W + BLEED_X} ${bottom[SAMPLES].y.toFixed(1)} L${VIEW_W + BLEED_X} ${VIEW_H + BLEED_Y} L${-BLEED_X} ${VIEW_H + BLEED_Y} Z`

export function VoucherRibbon({
  flip = false,
  topColor,
  bottomColor,
}: {
  flip?: boolean
  topColor: string
  bottomColor: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const x = useScrollLinked(useTransform(scrollYProgress, [0, 1], [-34, 34]))
  // Satin sheen: a soft diagonal light band sweeps along the ribbon with scroll.
  const sheenX = useScrollLinked(useTransform(scrollYProgress, [0, 1], [-620, 1720]))

  // Gradient/clip ids must differ per instance or the two mounts collide.
  const uid = flip ? 'rib-b' : 'rib-a'

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="relative pointer-events-none select-none h-[130px] md:h-[250px]"
      style={{ background: topColor }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        style={{ transform: flip ? 'scaleX(-1)' : undefined }}
      >
        <defs>
          {/* Front face: satin red travelling toward coral light */}
          <linearGradient id={`${uid}-front`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#A80600" />
            <stop offset="0.35" stopColor="#E20C04" />
            <stop offset="0.58" stopColor="#F04314" />
          </linearGradient>
          {/* Back face after the twist: the band's darker underside */}
          <linearGradient id={`${uid}-back`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0.55" stopColor="#820A03" />
            <stop offset="1" stopColor="#B92F08" />
          </linearGradient>
          {/* Cylindrical light: lit along the top, rolling into deep shadow */}
          <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFE0CC" stopOpacity="0.5" />
            <stop offset="0.34" stopColor="#FFFFFF" stopOpacity="0.05" />
            <stop offset="0.72" stopColor="#3D0200" stopOpacity="0.22" />
            <stop offset="1" stopColor="#2A0100" stopOpacity="0.52" />
          </linearGradient>
          <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.24" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <path d={FRONT_PATH} />
            <path d={BACK_PATH} />
          </clipPath>
        </defs>

        <motion.g style={{ x: reduceMotion ? 0 : x }}>
          {/* The section break follows the ribbon, never a straight line */}
          <path d={TOP_FILL} fill={topColor} />
          <path d={BOTTOM_FILL} fill={bottomColor} />

          {/* Soft contact shadow the band casts onto the lower ground: a
              blurred stroke hugging the lower edge; the band overpaints the
              half that spills upward */}
          <path
            d={line(bottom, true)}
            fill="none"
            stroke="rgba(30,2,0,0.3)"
            strokeWidth="16"
            transform="translate(0 7)"
            style={{ filter: 'blur(9px)' }}
          />

          {/* Back face (behind the twist), then front face over it */}
          <path d={BACK_PATH} fill={`url(#${uid}-back)`} />
          <path d={BACK_PATH} fill={`url(#${uid}-shade)`} />
          <path d={FRONT_PATH} fill={`url(#${uid}-front)`} />
          <path d={FRONT_PATH} fill={`url(#${uid}-shade)`} />

          <g clipPath={`url(#${uid}-clip)`}>
            {/* Edge lighting: lit top edge, shadowed lower edge (thickness) */}
            <path d={FRONT_TOP_EDGE} fill="none" stroke="rgba(255,214,190,0.75)" strokeWidth="3.5" />
            <path d={BACK_TOP_EDGE} fill="none" stroke="rgba(255,170,140,0.35)" strokeWidth="2.5" />
            <path d={FRONT_BOTTOM_EDGE} fill="none" stroke="rgba(40,1,0,0.55)" strokeWidth="4" />

            {/* Scroll-driven sheen sweeping the satin */}
            {!reduceMotion && (
              <motion.g style={{ x: sheenX }}>
                <rect
                  x="-160"
                  y="-40"
                  width="420"
                  height={VIEW_H + 80}
                  fill={`url(#${uid}-sheen)`}
                  transform="skewX(-18)"
                />
              </motion.g>
            )}
          </g>
        </motion.g>
      </svg>
    </div>
  )
}
