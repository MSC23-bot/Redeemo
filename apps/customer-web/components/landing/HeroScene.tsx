'use client'

import Image from 'next/image'
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { PhoneFrame } from './PhoneDemo'
import { useScrollLinked } from './scroll'

/**
 * The hero scene, rebuilt in code from the owner's approved Higgsfield
 * composition (2026-07-08): phone centre-right showing the REAL app, voucher
 * cards floating around it, the brand ribbon weaving behind. The AI-film
 * version failed the quality bar on large displays (soft 1080p text, fixed
 * 16:9 collisions, jittery motion), so every element here is DOM: crisp at
 * any resolution, brand-exact, and the motion is spring physics driven by
 * cursor and scroll. Desktop only; PhoneDemo remains the mobile hero.
 */

const CARD_CLIP = (w: number, h: number, r: number, notch: number) =>
  `path('M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h / 2 - notch} A ${notch} ${notch} 0 0 0 ${w} ${h / 2 + notch} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${h / 2 + notch} A ${notch} ${notch} 0 0 0 0 ${h / 2 - notch} V ${r} Q 0 0 ${r} 0 Z')`

// Launch-safe example vouchers: fictional demo merchants, claims that echo
// the headline. Colours stay inside the brand system.
const CARDS = [
  {
    key: 'bogo',
    type: 'BOGO',
    title: 'Buy one main, get one free',
    place: 'Old Foundry Kitchen',
    w: 224,
    h: 116,
    style: { top: '3%', left: '-10%', rotate: -7 },
    depth: 1.25,
    floatDur: 5.2,
    bg: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)',
    ink: '#FFFFFF',
    sub: 'rgba(255,255,255,0.75)',
    pillBg: 'rgba(255,255,255,0.18)',
    pillInk: '#FFFFFF',
  },
  {
    key: 'freebie',
    type: 'FREEBIE',
    title: 'Free pastry with your coffee',
    place: 'Juniper Coffee',
    w: 212,
    h: 112,
    style: { top: '14%', right: '-6%', rotate: 6 },
    depth: 0.8,
    floatDur: 6.1,
    bg: '#FFFFFF',
    ink: '#010C35',
    sub: '#6B7280',
    pillBg: 'rgba(226,12,4,0.08)',
    pillInk: '#E20C04',
  },
  {
    key: 'discount',
    type: '50% OFF',
    title: 'Half-price day passes',
    place: 'Northlight Strength Club',
    w: 216,
    h: 112,
    style: { bottom: '18%', left: '-8%', rotate: 5 },
    depth: 1.0,
    floatDur: 5.7,
    bg: '#010C35',
    ink: '#FFFFFF',
    sub: 'rgba(255,255,255,0.6)',
    pillBg: 'rgba(232,74,0,0.28)',
    pillInk: '#FFB38A',
  },
  {
    key: 'spend',
    type: '£10 OFF',
    title: '£10 off your first cut',
    place: 'Hatterly & Sons Barbers',
    w: 208,
    h: 108,
    style: { bottom: '4%', right: '-2%', rotate: -5 },
    depth: 1.15,
    floatDur: 6.6,
    bg: '#FFF3EC',
    ink: '#010C35',
    sub: '#8A5A44',
    pillBg: 'rgba(226,12,4,0.1)',
    pillInk: '#BE0A03',
  },
] as const

function VoucherCard({
  card,
  parX,
  parY,
  scrollY,
  reduceMotion,
}: {
  card: (typeof CARDS)[number]
  parX: MotionValue<number>
  parY: MotionValue<number>
  scrollY: MotionValue<number>
  reduceMotion: boolean
}) {
  const x = useTransform(parX, (v) => v * card.depth * 14)
  const y = useTransform([parY, scrollY] as const, ([py, sy]: number[]) => py * card.depth * 10 + sy * card.depth)
  const { rotate, ...pos } = card.style as Record<string, number | string> & { rotate: number }

  return (
    <motion.div className="absolute" style={{ ...pos, x, y, zIndex: card.depth > 1 ? 30 : 10 }}>
      <motion.div
        animate={reduceMotion ? undefined : { y: [0, -9, 0], rotate: [rotate, rotate + 1.5, rotate] }}
        transition={{ duration: card.floatDur, repeat: Infinity, ease: 'easeInOut' }}
        style={{ rotate }}
      >
        {/* Shadow lives outside the clipped element so the die-cut notches read */}
        <div
          className="absolute inset-2 rounded-2xl"
          style={{ boxShadow: '0 22px 44px rgba(97,20,4,0.22)' }}
          aria-hidden="true"
        />
        <div
          className="relative px-4 py-3 flex flex-col justify-between"
          style={{
            width: card.w,
            height: card.h,
            background: card.bg,
            clipPath: CARD_CLIP(card.w, card.h, 16, 9),
            border: card.bg === '#FFFFFF' ? '1px solid rgba(1,12,53,0.08)' : undefined,
          }}
        >
          <span
            className="self-start text-[10px] font-bold tracking-[0.12em] uppercase rounded-full px-2.5 py-1"
            style={{ background: card.pillBg, color: card.pillInk }}
          >
            {card.type}
          </span>
          <div>
            <p className="font-display text-[15.5px] leading-[1.15] mb-0.5" style={{ color: card.ink }}>
              {card.title}
            </p>
            <p className="text-[11px] font-medium" style={{ color: card.sub }}>
              {card.place}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  // Cursor parallax source (-0.5..0.5 each axis), listening on the section
  const rawPX = useMotionValue(0)
  const rawPY = useMotionValue(0)
  const parX = useSpring(rawPX, { stiffness: 50, damping: 16, mass: 0.9 })
  const parY = useSpring(rawPY, { stiffness: 50, damping: 16, mass: 0.9 })

  useEffect(() => {
    if (reduceMotion) return
    const section = ref.current?.closest('section')
    if (!section) return
    const onMove = (e: MouseEvent) => {
      const rect = section.getBoundingClientRect()
      rawPX.set((e.clientX - rect.left) / rect.width - 0.5)
      rawPY.set((e.clientY - rect.top) / rect.height - 0.5)
    }
    const onLeave = () => {
      rawPX.set(0)
      rawPY.set(0)
    }
    section.addEventListener('mousemove', onMove, { passive: true })
    section.addEventListener('mouseleave', onLeave, { passive: true })
    return () => {
      section.removeEventListener('mousemove', onMove)
      section.removeEventListener('mouseleave', onLeave)
    }
  }, [rawPX, rawPY, reduceMotion])

  // Scroll parallax: the scene lifts gently as the visitor scrolls away
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const sceneScrollY = useScrollLinked(useTransform(scrollYProgress, [0, 1], [0, -30]))

  // Phone tilt follows the cursor a few degrees, on top of a resting pose
  const phoneRY = useTransform(parX, (v) => -10 + v * 6)
  const phoneRX = useTransform(parY, (v) => 2 + v * -4)

  return (
    <div ref={ref} className="relative h-[600px] select-none" aria-hidden="true" style={{ perspective: 1400 }}>
      {/* The brand ribbon weaving behind the scene */}
      <svg
        viewBox="0 0 640 600"
        className="absolute -inset-x-16 inset-y-0 w-[calc(100%+128px)] h-full"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="hero-rib" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E20C04" />
            <stop offset="1" stopColor="#E84A00" />
          </linearGradient>
        </defs>
        <motion.g style={{ y: reduceMotion ? 0 : sceneScrollY }}>
          <path
            d="M -80 150 C 120 60, 240 240, 330 300 S 560 480, 740 420 L 740 470 C 540 540, 400 400, 300 350 S 80 200, -80 210 Z"
            fill="url(#hero-rib)"
            opacity="0.9"
          />
          <path
            d="M -80 150 C 120 60, 240 240, 330 300 S 560 480, 740 420"
            fill="none"
            stroke="rgba(255,214,190,0.5)"
            strokeWidth="2"
          />
        </motion.g>
      </svg>

      {/* The phone: the real app, code-rendered, always crisp */}
      <motion.div
        className="absolute left-1/2 top-1/2 z-20"
        style={{
          x: '-50%',
          y: '-50%',
          rotateY: reduceMotion ? -10 : phoneRY,
          rotateX: reduceMotion ? 2 : phoneRX,
          transformStyle: 'preserve-3d',
          scale: 1.12,
        }}
      >
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        >
          <PhoneFrame dark={false}>
            <Image src="/app-shots/home-top.png" alt="" fill sizes="272px" className="object-cover object-top" priority />
          </PhoneFrame>
        </motion.div>
      </motion.div>

      {/* Floating example vouchers */}
      {CARDS.map((card) => (
        <VoucherCard
          key={card.key}
          card={card}
          parX={parX}
          parY={parY}
          scrollY={sceneScrollY}
          reduceMotion={!!reduceMotion}
        />
      ))}

      <p className="absolute -bottom-1 inset-x-0 text-center text-[10px]" style={{ color: 'rgba(1,12,53,0.4)' }}>
        Example vouchers · real offers vary by place
      </p>
    </div>
  )
}
