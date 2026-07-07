'use client'

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The brand's R is two voucher ribbons. Owner reference (2026-07-07): a satin,
 * dimensional ribbon: deep-red gradient, a twist fold where the band flips to
 * its darker back face, lit top edge, ONE die-cut voucher notch. Explicitly
 * not the flat "road with dots" look. Decorative only: aria-hidden, no pointer
 * events, static for reduced-motion visitors.
 */

const VIEW_W = 1440
const VIEW_H = 260
const HALF_W = 40 // ribbon half-thickness at full width
const SAMPLES = 160
const FOLD_T = 0.58 // where the band twists over itself
const FOLD_SPAN = 0.085 // how quickly it pinches
const NOTCH_T = 0.44 // die-cut voucher bite, on the bright front face
const NOTCH_R = 15

// Centreline: one relaxed S-bend, edge to edge with bleed past both sides.
const P0 = { x: -80, y: 88 }
const P1 = { x: 380, y: 230 }
const P2 = { x: 1020, y: -50 }
const P3 = { x: 1540, y: 180 }

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

// Band half-width pinches to a sliver at the fold: that pinch is the twist.
function halfWidth(t: number) {
  const s = Math.min(1, Math.abs(t - FOLD_T) / FOLD_SPAN)
  const smooth = s * s * (3 - 2 * s)
  return HALF_W * (0.12 + 0.88 * smooth)
}

// Geometry is pure module-scope math: identical on server and client.
type Pt = { x: number; y: number }
const top: Pt[] = []
const bottom: Pt[] = []
for (let i = 0; i <= SAMPLES; i++) {
  const t = i / SAMPLES
  const p = bezier(t)
  const tan = bezierTangent(t)
  const w = halfWidth(t)
  top.push({ x: p.x - tan.y * w, y: p.y + tan.x * w })
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

// Segments overlap by two samples so the pinch never opens a hairline gap.
const FRONT_PATH = bandPath(0, Math.min(FOLD_I + 2, SAMPLES))
const BACK_PATH = bandPath(Math.max(FOLD_I - 2, 0), SAMPLES)
const FRONT_TOP_EDGE = line(top.slice(0, FOLD_I + 1), true)
const BACK_TOP_EDGE = line(top.slice(FOLD_I, SAMPLES + 1), true)
const FRONT_BOTTOM_EDGE = line(bottom.slice(0, FOLD_I + 1), true)

const NOTCH = top[Math.round(NOTCH_T * SAMPLES)]

export function VoucherRibbon({ flip = false }: { flip?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const x = useScrollLinked(useTransform(scrollYProgress, [0, 1], [-36, 36]))
  // Satin sheen: a soft diagonal light band sweeps along the ribbon with scroll.
  const sheenX = useScrollLinked(useTransform(scrollYProgress, [0, 1], [-620, 1720]))

  // Gradient/mask ids must differ per instance or the two mounts collide.
  const uid = flip ? 'rib-b' : 'rib-a'

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="relative pointer-events-none select-none -my-10 md:-my-14"
      style={{ height: 170, zIndex: 5 }}
    >
      <motion.div
        className="absolute inset-x-0 top-1/2"
        style={{
          x: reduceMotion ? 0 : x,
          y: '-50%',
          // Mirror horizontally for variety; never vertically, which would
          // flip the satin lighting upside down.
          scaleX: flip ? -1 : 1,
        }}
      >
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block w-[112%] -ml-[6%] h-auto">
          <defs>
            {/* Front face: satin red travelling toward coral light */}
            <linearGradient id={`${uid}-front`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#B00700" />
              <stop offset="0.35" stopColor="#E20C04" />
              <stop offset="0.58" stopColor="#F04314" />
            </linearGradient>
            {/* Back face after the twist: the band's darker underside */}
            <linearGradient id={`${uid}-back`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0.55" stopColor="#8E0B04" />
              <stop offset="1" stopColor="#C43509" />
            </linearGradient>
            {/* Cylindrical light: lit along the top, falling into shadow below */}
            <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFD9C4" stopOpacity="0.34" />
              <stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0" />
              <stop offset="1" stopColor="#4A0300" stopOpacity="0.38" />
            </linearGradient>
            <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
              <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.22" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <mask id={`${uid}-cut`} maskUnits="userSpaceOnUse">
              <path d={FRONT_PATH} fill="#fff" />
              <path d={BACK_PATH} fill="#fff" />
              {/* ONE die-cut voucher bite */}
              <circle cx={NOTCH.x} cy={NOTCH.y} r={NOTCH_R} fill="#000" />
            </mask>
          </defs>

          {/* Grounding shadow, soft and warm */}
          <g opacity="0.2" transform="translate(6 20)">
            <path d={FRONT_PATH} fill="#6B0A03" style={{ filter: 'blur(14px)' }} />
            <path d={BACK_PATH} fill="#6B0A03" style={{ filter: 'blur(14px)' }} />
          </g>

          <g mask={`url(#${uid}-cut)`}>
            {/* Band thickness peeking beneath the front face */}
            <path d={FRONT_PATH} fill="#7A0E06" transform="translate(0 5)" />

            {/* Back face (behind the twist), then front face over it */}
            <path d={BACK_PATH} fill={`url(#${uid}-back)`} />
            <path d={BACK_PATH} fill={`url(#${uid}-shade)`} />
            <path d={FRONT_PATH} fill={`url(#${uid}-front)`} />
            <path d={FRONT_PATH} fill={`url(#${uid}-shade)`} />

            {/* Edge lighting: lit top edge, shadowed lower edge */}
            <path d={FRONT_TOP_EDGE} fill="none" stroke="rgba(255,205,180,0.55)" strokeWidth="2" />
            <path d={BACK_TOP_EDGE} fill="none" stroke="rgba(255,160,130,0.28)" strokeWidth="1.5" />
            <path d={FRONT_BOTTOM_EDGE} fill="none" stroke="rgba(60,2,0,0.45)" strokeWidth="2" />

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
        </svg>
      </motion.div>
    </div>
  )
}
