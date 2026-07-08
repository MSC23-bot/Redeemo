'use client'

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The brand ribbon peeking in from a viewport edge (owner 2026-07-08: the
 * ribbon should flow through the site, not only at section breaks: "just a
 * peek of it on the side, that comes and goes"). A loop of the voucher
 * ribbon slides in from the side as its host section scrolls through the
 * viewport, drifts, and slides back out. Decorative only; never intercepts
 * the pointer; hidden below lg (small screens have no side room to spare).
 *
 * Mount INSIDE a relatively-positioned section, near its top level:
 *   <RibbonPeek side="right" top="30%" />
 */

const ASSETS = {
  right: { src: '/ribbon/peek-r.png', w: 555, h: 545 },
  left: { src: '/ribbon/peek-l.png', w: 338, h: 351 },
} as const

export function RibbonPeek({
  side,
  top,
  width = 300,
  className = '',
}: {
  side: 'left' | 'right'
  top: string
  /** Keep small: the ribbon visits, it never competes with content */
  width?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const a = ASSETS[side]
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })

  // Slide in as the section enters, ease back out as it leaves: the ribbon
  // visits, it does not live here. Offsets are fractions of the piece width.
  const inset = useScrollLinked(
    useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [width * 0.9, width * 0.22, width * 0.3, width * 0.95]),
  )
  const x = useTransform(inset, (v) => (side === 'right' ? v : -v))
  const rotate = useScrollLinked(useTransform(scrollYProgress, [0, 1], side === 'right' ? [4, -5] : [-4, 5]))

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`hidden xl:block absolute pointer-events-none select-none ${side === 'right' ? 'right-0' : 'left-0'} ${className}`}
      style={{ top, width, height: Math.round((width * a.h) / a.w) }}
    >
      <motion.img
        src={a.src}
        alt=""
        className="absolute inset-0 h-full w-full"
        style={{
          x: reduceMotion ? (side === 'right' ? width * 0.35 : -width * 0.35) : x,
          rotate: reduceMotion ? 0 : rotate,
          filter: 'drop-shadow(0 14px 24px rgba(190,10,3,0.16))',
        }}
      />
    </div>
  )
}
