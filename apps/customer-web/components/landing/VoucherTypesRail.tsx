'use client'

import Image from 'next/image'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The voucher shelf (owner direction 2026-07-08): the seven voucher types as
 * die-cut cards with the customer app's own category illustrations. Desktop:
 * a pinned stage where vertical scroll sweeps the shelf horizontally.
 * Mobile: the same cards as a native swipe carousel (no scroll-jacking on
 * touch). Reduced-motion visitors get the static VoucherTypesSection that
 * ScrollStory renders, so this returns null for them.
 *
 * Copy rules: examples are generic scopes, never named merchants (nothing
 * fictional may read as a real business on the landing page). Colours are
 * the app's voucher-type tokens.
 */

const CARD_W = 380
const CARD_H = 340
const NOTCH_R = 11
const GAP = 28

const cardClip = (w: number, h: number) =>
  `path('M 20 0 H ${w - 20} Q ${w} 0 ${w} 20 V ${h / 2 - NOTCH_R} A ${NOTCH_R} ${NOTCH_R} 0 0 0 ${w} ${h / 2 + NOTCH_R} V ${h - 20} Q ${w} ${h} ${w - 20} ${h} H 20 Q 0 ${h} 0 ${h - 20} V ${h / 2 + NOTCH_R} A ${NOTCH_R} ${NOTCH_R} 0 0 0 0 ${h / 2 - NOTCH_R} V 20 Q 0 0 20 0 Z')`

type RailType = {
  chip: string
  title: string
  body: string
  scenario: string
  takeback: string
  art: string
  accent: string
  accentBg: string
}

const TYPES: RailType[] = [
  {
    chip: 'BOGO',
    title: 'Buy one, get one free',
    body: 'Order one, and a second arrives on the house.',
    scenario: 'Date night: two £14 mains, one bill for £14.',
    takeback: '£14 back: two months of membership, one dinner',
    art: '/category-art/plated-dish.png',
    accent: '#7C3AED',
    accentBg: 'rgba(124,58,237,0.1)',
  },
  {
    chip: 'Discount',
    title: 'Straight discount',
    body: 'A clean percentage or amount off the bill. No riddles.',
    scenario: '20% off a £45 monthly gym pass.',
    takeback: '£9 back without changing your routine',
    art: '/category-art/dumbbells.png',
    accent: '#E20C04',
    accentBg: 'rgba(226,12,4,0.1)',
  },
  {
    chip: 'Freebie',
    title: 'Freebie',
    body: 'Something free with your visit, just for being a member.',
    scenario: 'A £3 pastry on the house with your coffee.',
    takeback: 'Small, monthly, and it adds up',
    art: '/category-art/coffee-cup.png',
    accent: '#16A34A',
    accentBg: 'rgba(22,163,74,0.1)',
  },
  {
    chip: 'Spend & save',
    title: 'Spend and save',
    body: 'Pass a spend threshold, watch a chunk come off.',
    scenario: '£10 off when you spend £40 stocking up.',
    takeback: '£10 back on things you were buying anyway',
    art: '/category-art/picnic-basket.png',
    accent: '#E84A00',
    accentBg: 'rgba(232,74,0,0.1)',
  },
  {
    chip: 'Package deal',
    title: 'Package deal',
    body: 'A bundle priced better than the sum of its parts.',
    scenario: '£30 of barbering for £22, in one booking.',
    takeback: '£8 back in the chair',
    art: '/category-art/gift-box.png',
    accent: '#2563EB',
    accentBg: 'rgba(37,99,235,0.1)',
  },
  {
    chip: 'Time-limited',
    title: 'Time-limited',
    body: 'Extra generous, for a short window. Catch it while it is live.',
    scenario: 'A £20 blow-dry for £10, weekdays before noon.',
    takeback: '£10 back for going early',
    art: '/category-art/vanity-mirror.png',
    accent: '#D97706',
    accentBg: 'rgba(217,119,6,0.1)',
  },
  {
    chip: 'Reusable',
    title: 'Reusable',
    body: 'Does not burn out after one visit: it comes back automatically.',
    scenario: '£2 off your usual coffee, every visit.',
    takeback: 'A habit that pays you back weekly',
    art: '/category-art/water-bottle.png',
    accent: '#0D9488',
    accentBg: 'rgba(13,148,136,0.1)',
  },
]

const ROW_W = TYPES.length * CARD_W + (TYPES.length - 1) * GAP

function RailCard({
  type,
  index,
  width = CARD_W,
  height = CARD_H,
  tilt = true,
}: {
  type: RailType
  index: number
  width?: number
  height?: number
  tilt?: boolean
}) {
  return (
    <motion.div
      className="relative flex-shrink-0 cursor-default snap-center"
      style={{ width, height, rotate: tilt ? (index % 2 ? 1.3 : -1.3) : 0 }}
      whileHover={{ rotate: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {/* Shadow on a wrapper so the die-cut notches read in the silhouette */}
      <div className="absolute inset-0" style={{ filter: 'drop-shadow(0 14px 26px rgba(1,12,53,0.1))' }}>
        <div
          className="relative h-full w-full bg-white flex flex-col px-7 pt-7 pb-6 overflow-hidden"
          style={{ clipPath: cardClip(width, height) }}
        >
          {/* Type stripe, same recipe as the app's voucher cards */}
          <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: type.accent }} />
          {/* A soft wash of the type colour behind the illustration */}
          <div
            aria-hidden="true"
            className="absolute -right-14 top-16 w-56 h-56 rounded-full"
            style={{ background: type.accentBg, filter: 'blur(6px)' }}
          />
          {/* The app's own category illustration, bleeding off the die-cut edge */}
          <div className="absolute -right-5 top-[88px] w-[168px] h-[168px] rotate-[8deg]">
            <Image src={type.art} alt="" fill sizes="168px" className="object-contain drop-shadow-[0_10px_14px_rgba(1,12,53,0.12)]" />
          </div>

          <span
            className="self-start text-[10.5px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full mb-4"
            style={{ color: type.accent, background: type.accentBg }}
          >
            {type.chip}
          </span>

          <h3 className="relative font-display text-[#010C35] leading-[1.12] mb-2.5 max-w-[220px]" style={{ fontSize: '24px', letterSpacing: '-0.4px' }}>
            {type.title}
          </h3>
          <p className="relative text-[13.5px] text-[#4B5563] leading-[1.6] max-w-[200px]">{type.body}</p>

          {/* Stub: a moment you recognise and the money that comes back,
              behind a tear line like a real voucher */}
          <div className="relative mt-auto pt-4 border-t border-dashed border-[#010C35]/15 bg-white/60">
            <p className="text-[13.5px] font-semibold text-[#010C35] leading-[1.5] mb-1">{type.scenario}</p>
            <p className="text-[11.5px] font-bold" style={{ color: type.accent }}>
              {type.takeback}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function ShelfHeader() {
  return (
    <div className="max-w-7xl mx-auto w-full px-6">
      <p className="text-[12px] font-bold tracking-[0.2em] uppercase text-[#E20C04] mb-4">What members get</p>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="font-display text-[#010C35] leading-[1.06]" style={{ fontSize: 'clamp(30px, 3.8vw, 54px)', letterSpacing: '-0.8px' }}>
          Seven ways to pay less.
        </h2>
        <p className="text-[15px] text-[#4B5563] leading-[1.7] max-w-[420px]">
          Every offer on Redeemo is one of seven clear voucher types, always
          labelled, so you know exactly what you are getting before you go.
        </p>
      </div>
    </div>
  )
}

export function VoucherTypesRail() {
  const trackRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const [viewW, setViewW] = useState(1440)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setViewW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })

  // The row starts aligned with the content column and sweeps left until its
  // last card rests where the first began.
  const leftPad = Math.max(24, (viewW - 1280) / 2)
  const endX = Math.min(0, viewW - leftPad * 2 - ROW_W)
  const x = useScrollLinked(useTransform(scrollYProgress, [0.04, 0.96], [0, endX]))
  const progress = useScrollLinked(useTransform(scrollYProgress, [0.04, 0.96], [0, 1]))

  // Reduced-motion visitors get the static VoucherTypesSection via ScrollStory.
  if (reduceMotion) return null

  return (
    <>
      {/* Desktop: pinned stage, vertical scroll sweeps the shelf sideways */}
      <section ref={trackRef} aria-label="Voucher types" className="relative hidden lg:block" style={{ height: '280vh', background: '#FFF9F5' }}>
        <div ref={stageRef} className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center">
          <div className="mb-12">
            <ShelfHeader />
          </div>

          <motion.div className="flex items-center" style={{ x, gap: GAP, paddingLeft: leftPad, paddingRight: leftPad }}>
            {TYPES.map((type, i) => (
              <RailCard key={type.chip} type={type} index={i} />
            ))}
          </motion.div>

          {/* Perforated progress line: the tear advances as the shelf sweeps */}
          <div className="max-w-7xl mx-auto w-full px-6 mt-12">
            <div className="relative h-[3px]">
              <div className="absolute inset-0 border-t-[3px] border-dotted border-[#010C35]/12" />
              <motion.div className="absolute inset-y-0 left-0 w-full origin-left" style={{ scaleX: progress, background: 'var(--brand-gradient)' }} />
            </div>
            <p className="mt-4 text-[12px] text-[#6B7280]">
              Any place can run any type: restaurants, cafes, gyms, salons, delis and beyond.
              One redemption per place each month (reusables come back sooner).
            </p>
          </div>
        </div>
      </section>

      {/* Mobile: the same shelf as a native swipe carousel */}
      <section aria-label="Voucher types" className="lg:hidden py-16" style={{ background: '#FFF9F5' }}>
        <div className="mb-8">
          <ShelfHeader />
        </div>
        <div
          className="flex overflow-x-auto snap-x snap-mandatory gap-4 px-6 pb-6"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {TYPES.map((type, i) => (
            <RailCard key={type.chip} type={type} index={i} width={318} height={330} tilt={false} />
          ))}
        </div>
        <div className="px-6 mt-2">
          <p className="text-[12px] text-[#6B7280] leading-[1.6]">
            Swipe for more · Any place can run any type: restaurants, cafes, gyms,
            salons, delis and beyond. One redemption per place each month
            (reusables come back sooner).
          </p>
        </div>
      </section>
    </>
  )
}
