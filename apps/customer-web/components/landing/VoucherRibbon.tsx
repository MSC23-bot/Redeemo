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
const NOTCH_T = 0.36 // die-cut notch pair + tear line (the coupon stub)
const NOTCH_R = 14

// Centreline: one confident sweep, edge to edge with bleed past both sides.
const P0 = { x: -80, y: 120 }
const P1 = { x: 420, y: 240 }
const P2 = { x: 980, y: 30 }
const P3 = { x: 1540, y: 160 }

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

// The coupon taper: markedly thicker on the left, slimming as it recedes.
const halfWidth = (t: number) => HALF_W * (1.6 - 1.0 * t)

// Geometry is pure module-scope math: identical on server and client.
type Pt = { x: number; y: number }
const top: Pt[] = []
const bottom: Pt[] = []
const NOTCH_X = bezier(NOTCH_T).x
for (let i = 0; i <= SAMPLES; i++) {
  const t = i / SAMPLES
  const p = bezier(t)
  const tan = bezierTangent(t)
  const w = halfWidth(t)
  let tx = p.x - tan.y * w
  let ty = p.y + tan.x * w
  let bx = p.x + tan.y * w
  let by = p.y - tan.x * w
  // Carve the die-cut notch pair straight into both edges, so the edge
  // lighting wraps around them like a real punched coupon.
  const dTop = tx - NOTCH_X
  if (Math.abs(dTop) < NOTCH_R) {
    const depth = Math.sqrt(NOTCH_R * NOTCH_R - dTop * dTop)
    tx += tan.y * depth
    ty -= tan.x * depth
  }
  const dBot = bx - NOTCH_X
  if (Math.abs(dBot) < NOTCH_R) {
    const depth = Math.sqrt(NOTCH_R * NOTCH_R - dBot * dBot)
    bx -= tan.y * depth
    by += tan.x * depth
  }
  top.push({ x: tx, y: ty })
  bottom.push({ x: bx, y: by })
}

const line = (pts: Pt[], move: boolean) =>
  pts
    .map((p, i) => `${i === 0 && move ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

const BAND_PATH = `${line(top, true)} ${[...bottom]
  .reverse()
  .map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
  .join(' ')} Z`
const TOP_EDGE = line(top, true)
const BOTTOM_EDGE = line(bottom, true)

// The dashed tear line runs stub-style across the band at the notch pair
const NOTCH_I = Math.round(NOTCH_T * SAMPLES)
const TEAR = {
  x1: top[NOTCH_I].x,
  y1: top[NOTCH_I].y + 6,
  x2: bottom[NOTCH_I].x,
  y2: bottom[NOTCH_I].y - 6,
}

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
            <stop offset="0" stopColor="#B00700" />
            <stop offset="0.42" stopColor="#E20C04" />
            <stop offset="1" stopColor="#F0480F" />
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

          {/* The coupon band */}
          <path d={BAND_PATH} fill={`url(#${uid}-band)`} />
          <path d={BAND_PATH} fill={`url(#${uid}-shade)`} />

          <g clipPath={`url(#${uid}-clip)`}>
            {/* Edge lighting: lit top edge, shadowed foot (thickness) */}
            <path d={TOP_EDGE} fill="none" stroke="rgba(255,214,190,0.7)" strokeWidth="3.5" />
            <path d={BOTTOM_EDGE} fill="none" stroke="rgba(40,1,0,0.5)" strokeWidth="4" />

            {/* Stub tear line across the band at the notch pair */}
            <line
              x1={TEAR.x1}
              y1={TEAR.y1}
              x2={TEAR.x2}
              y2={TEAR.y2}
              stroke="rgba(255,249,245,0.75)"
              strokeWidth="3"
              strokeDasharray="9 12"
              strokeLinecap="round"
            />

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
