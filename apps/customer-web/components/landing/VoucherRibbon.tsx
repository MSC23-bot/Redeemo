'use client'

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The brand's R is two voucher ribbons: flowing bands with die-cut perforation
 * notches (owner direction 2026-07-07). This is that motif as a section
 * divider: a gradient ribbon sweeping across the seam, notched edges, dashed
 * tear line, drifting gently with scroll while a soft light pulse travels
 * along the perforation. Decorative only: aria-hidden, no pointer events,
 * static for reduced-motion visitors.
 */

const VIEW_W = 1440
const VIEW_H = 240
const HALF_W = 27 // ribbon half-thickness
const SAMPLES = 140
const NOTCH_EVERY = 7 // samples between die-cut notches
const NOTCH_R = 8

// Centreline: one relaxed S-bend, edge to edge with bleed past both sides.
const P0 = { x: -80, y: 78 }
const P1 = { x: 380, y: 210 }
const P2 = { x: 1020, y: -40 }
const P3 = { x: 1540, y: 165 }

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

// Geometry is pure module-scope math: identical on server and client.
const centre: { x: number; y: number }[] = []
const top: { x: number; y: number }[] = []
const bottom: { x: number; y: number }[] = []
for (let i = 0; i <= SAMPLES; i++) {
  const t = i / SAMPLES
  const p = bezier(t)
  const tan = bezierTangent(t)
  const nx = -tan.y
  const ny = tan.x
  centre.push(p)
  top.push({ x: p.x + nx * HALF_W, y: p.y + ny * HALF_W })
  bottom.push({ x: p.x - nx * HALF_W, y: p.y - ny * HALF_W })
}

const toPath = (pts: { x: number; y: number }[]) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

const RIBBON_PATH = `${toPath(top)} ${[...bottom]
  .reverse()
  .map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
  .join(' ')} Z`

const TEAR_PATH = toPath(centre)

// Die-cut notches sit ON both edges so the mask punches semicircular dents.
const NOTCHES: { cx: number; cy: number }[] = []
for (let i = Math.floor(NOTCH_EVERY / 2); i <= SAMPLES; i += NOTCH_EVERY) {
  NOTCHES.push({ cx: top[i].x, cy: top[i].y })
  NOTCHES.push({ cx: bottom[i].x, cy: bottom[i].y })
}

export function VoucherRibbon({ flip = false }: { flip?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const x = useScrollLinked(useTransform(scrollYProgress, [0, 1], [-36, 36]))
  // Light pulse travels the tear line as the divider crosses the viewport.
  const dashOffset = useScrollLinked(useTransform(scrollYProgress, [0, 1], [1750, -150]))

  // Mask ids must differ per instance or the two mounts collide.
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
          scaleY: flip ? -1 : 1,
        }}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block w-[112%] -ml-[6%] h-auto"
          style={{ filter: 'drop-shadow(0 14px 22px rgba(190,10,3,0.16))' }}
        >
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#E20C04" />
              <stop offset="1" stopColor="#E84A00" />
            </linearGradient>
            <mask id={`${uid}-cut`} maskUnits="userSpaceOnUse">
              <path d={RIBBON_PATH} fill="#fff" />
              {NOTCHES.map((n, i) => (
                <circle key={i} cx={n.cx} cy={n.cy} r={NOTCH_R} fill="#000" />
              ))}
            </mask>
          </defs>

          {/* Echo ribbon: the logo's R is TWO flowing bands; the second one
              trails softly behind and below */}
          <path
            d={RIBBON_PATH}
            fill="rgba(232,74,0,0.16)"
            transform="translate(26 30)"
          />

          <g mask={`url(#${uid}-cut)`}>
            <path d={RIBBON_PATH} fill={`url(#${uid}-fill)`} />
            {/* Soft top-edge sheen so the band reads as curved, not flat */}
            <path
              d={TEAR_PATH}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={HALF_W * 2}
              strokeDasharray="none"
              transform={`translate(0 ${-HALF_W * 0.55})`}
            />
            {/* Perforated tear line */}
            <path
              d={TEAR_PATH}
              fill="none"
              stroke="rgba(255,249,245,0.7)"
              strokeWidth="2.5"
              strokeDasharray="7 11"
              strokeLinecap="round"
            />
            {/* Scroll-driven light pulse running along the tear line */}
            {!reduceMotion && (
              <motion.path
                d={TEAR_PATH}
                fill="none"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="3"
                strokeDasharray="90 1660"
                strokeLinecap="round"
                style={{ strokeDashoffset: dashOffset }}
              />
            )}
          </g>
        </svg>
      </motion.div>
    </div>
  )
}
