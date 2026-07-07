'use client'

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The section-seam ribbon, v4 (owner 2026-07-08): the twist-fold version read
 * as a "DNA strand". This one is the Redeemo icon's language instead: ONE
 * bold coupon band, unapologetically thicker on the left and tapering as it
 * sweeps right, with a die-cut notch pair and a dashed tear line across it
 * like a real voucher stub. The divider still owns the seam: topColor fills
 * everything above the band, bottomColor everything below, so the section
 * boundary follows the curve. Decorative only; static for reduced motion.
 */

const VIEW_W = 1440
const VIEW_H = 300
const HALF_W = 52 // base half-thickness (scaled by the taper below)
const SAMPLES = 400
const NOTCH_TS = [0.28, 0.76] // die-cut notch pairs + tear lines (coupon stubs)
const NOTCH_R = 14
const FOLD_T = 0.55 // the band folds over itself here, showing its back face
const FOLD_SPAN = 0.07

// Centreline: a confident sweep with real bends, edge to edge with bleed.
const P0 = { x: -80, y: 140 }
const P1 = { x: 430, y: 250 }
const P2 = { x: 970, y: 10 }
const P3 = { x: 1540, y: 185 }

// Fills bleed past the viewBox so the scroll drift never exposes a gap.
const BLEED_X = 100
const BLEED_Y = 80

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

// The coupon taper: markedly thicker on the left, slimming as it recedes,
// with the fold's gather where the band twists over
function foldPinch(t: number) {
  const s = Math.min(1, Math.abs(t - FOLD_T) / FOLD_SPAN)
  const smooth = s * s * (3 - 2 * s)
  return 0.38 + 0.62 * smooth
}
const halfWidth = (t: number) => HALF_W * (1.6 - 1.0 * t) * foldPinch(t)

// Geometry is pure module-scope math: identical on server and client.
type Pt = { x: number; y: number }
const top: Pt[] = []
const bottom: Pt[] = []
const NOTCH_XS = NOTCH_TS.map((t) => bezier(t).x)
for (let i = 0; i <= SAMPLES; i++) {
  const t = i / SAMPLES
  const p = bezier(t)
  const tan = bezierTangent(t)
  const w = halfWidth(t)
  let tx = p.x - tan.y * w
  let ty = p.y + tan.x * w
  let bx = p.x + tan.y * w
  let by = p.y - tan.x * w
  // Carve each die-cut notch pair straight into both edges, so the edge
  // lighting wraps around them like a real punched coupon.
  for (const nx of NOTCH_XS) {
    const dTop = tx - nx
    if (Math.abs(dTop) < NOTCH_R) {
      const depth = Math.sqrt(NOTCH_R * NOTCH_R - dTop * dTop)
      tx += tan.y * depth
      ty -= tan.x * depth
    }
    const dBot = bx - nx
    if (Math.abs(dBot) < NOTCH_R) {
      const depth = Math.sqrt(NOTCH_R * NOTCH_R - dBot * dBot)
      bx -= tan.y * depth
      by += tan.x * depth
    }
  }
  top.push({ x: tx, y: ty })
  bottom.push({ x: bx, y: by })
}

const line = (pts: Pt[], move: boolean) =>
  pts
    .map((p, i) => `${i === 0 && move ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

const FOLD_I = Math.round(FOLD_T * SAMPLES)
const bandPath = (from: number, to: number) => {
  const t = top.slice(from, to + 1)
  const b = bottom.slice(from, to + 1).reverse()
  return `${line(t, true)} ${b.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} Z`
}
// Segments overlap a few samples so the fold never opens a hairline gap
const FRONT_PATH = bandPath(0, Math.min(FOLD_I + 4, SAMPLES))
const BACK_PATH = bandPath(Math.max(FOLD_I - 4, 0), SAMPLES)
const BAND_PATH = bandPath(0, SAMPLES)
const TOP_EDGE = line(top, true)
const BOTTOM_EDGE = line(bottom, true)

// Dashed tear lines run stub-style across the band at each notch pair
const TEARS = NOTCH_TS.map((t) => {
  const i = Math.round(t * SAMPLES)
  return { x1: top[i].x, y1: top[i].y + 6, x2: bottom[i].x, y2: bottom[i].y - 6 }
})

// The seam itself: topColor above the band, bottomColor below it.
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
  // Satin sheen: a soft light band sweeps along the coupon with scroll.
  const sheenX = useScrollLinked(useTransform(scrollYProgress, [0, 1], [-620, 1720]))

  // Gradient/clip ids must differ per instance or the two mounts collide.
  const uid = flip ? 'rib-b' : 'rib-a'

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="relative pointer-events-none select-none h-[130px] md:h-[240px]"
      style={{ background: topColor }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        style={{ transform: flip ? 'scaleX(-1)' : undefined }}
      >
        <defs>
          <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8E0B04" />
            <stop offset="0.28" stopColor="#E20C04" />
            <stop offset="0.5" stopColor="#C11004" />
            <stop offset="0.74" stopColor="#EE3A0C" />
            <stop offset="1" stopColor="#F0480F" />
          </linearGradient>
          {/* Back face beyond the fold: the band's darker underside */}
          <linearGradient id={`${uid}-back`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0.5" stopColor="#8E0B04" />
            <stop offset="0.78" stopColor="#B92F08" />
            <stop offset="1" stopColor="#D63A0A" />
          </linearGradient>
          {/* Shade travel along the length: the bends read as different
              tones, like the artwork ribbon catching the light */}
          <linearGradient id={`${uid}-bends`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3D0200" stopOpacity="0.2" />
            <stop offset="0.22" stopColor="#3D0200" stopOpacity="0" />
            <stop offset="0.46" stopColor="#3D0200" stopOpacity="0.22" />
            <stop offset="0.62" stopColor="#FFFFFF" stopOpacity="0.1" />
            <stop offset="0.85" stopColor="#3D0200" stopOpacity="0.16" />
            <stop offset="1" stopColor="#3D0200" stopOpacity="0" />
          </linearGradient>
          {/* Cylindrical light: lit crest rolling into shadow at the foot */}
          <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFE0CC" stopOpacity="0.42" />
            <stop offset="0.4" stopColor="#FFFFFF" stopOpacity="0.04" />
            <stop offset="1" stopColor="#3D0200" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.22" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <path d={BAND_PATH} />
          </clipPath>
        </defs>

        <motion.g style={{ x: reduceMotion ? 0 : x }}>
          {/* The section break follows the coupon, never a straight line */}
          <path d={TOP_FILL} fill={topColor} />
          <path d={BOTTOM_FILL} fill={bottomColor} />

          {/* Soft contact shadow hugging the underside */}
          <path
            d={BOTTOM_EDGE}
            fill="none"
            stroke="rgba(30,2,0,0.3)"
            strokeWidth="18"
            transform="translate(0 8)"
            style={{ filter: 'blur(10px)' }}
          />

          {/* The coupon band folds over itself at the twist: the far side
              shows its darker back face */}
          <path d={BACK_PATH} fill={`url(#${uid}-back)`} />
          <path d={FRONT_PATH} fill={`url(#${uid}-band)`} />
          <path d={BAND_PATH} fill={`url(#${uid}-bends)`} />
          <path d={BAND_PATH} fill={`url(#${uid}-shade)`} />

          <g clipPath={`url(#${uid}-clip)`}>
            {/* Edge lighting: lit top edge, shadowed foot (thickness) */}
            <path d={TOP_EDGE} fill="none" stroke="rgba(255,214,190,0.7)" strokeWidth="3.5" />
            <path d={BOTTOM_EDGE} fill="none" stroke="rgba(40,1,0,0.5)" strokeWidth="4" />

            {/* Stub tear lines across the band at each notch pair */}
            {TEARS.map((tear, i) => (
              <line
                key={i}
                x1={tear.x1}
                y1={tear.y1}
                x2={tear.x2}
                y2={tear.y2}
                stroke="rgba(255,249,245,0.75)"
                strokeWidth="3"
                strokeDasharray="9 12"
                strokeLinecap="round"
              />
            ))}

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
