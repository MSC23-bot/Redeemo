'use client'

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The voucher shelf (owner direction 2026-07-08): a pinned stage where
 * vertical scroll drives the seven voucher types horizontally, each card a
 * die-cut voucher with a concrete example from the demo merchants. Desktop
 * only: mobile and reduced-motion visitors get the static VoucherTypesSection
 * that ScrollStory already renders, so this returns null for them.
 *
 * Colours are the customer app's voucher-type tokens: the site speaks the
 * same visual language members meet inside the app.
 */

const CARD_W = 380
const CARD_H = 330
const GAP = 28
const NOTCH_R = 11

const CARD_CLIP = `path('M 20 0 H ${CARD_W - 20} Q ${CARD_W} 0 ${CARD_W} 20 V ${CARD_H / 2 - NOTCH_R} A ${NOTCH_R} ${NOTCH_R} 0 0 0 ${CARD_W} ${CARD_H / 2 + NOTCH_R} V ${CARD_H - 20} Q ${CARD_W} ${CARD_H} ${CARD_W - 20} ${CARD_H} H 20 Q 0 ${CARD_H} 0 ${CARD_H - 20} V ${CARD_H / 2 + NOTCH_R} A ${NOTCH_R} ${NOTCH_R} 0 0 0 0 ${CARD_H / 2 - NOTCH_R} V 20 Q 0 0 20 0 Z')`

type RailType = {
  chip: string
  title: string
  body: string
  example: string
  place: string
  accent: string
  accentBg: string
}

const TYPES: RailType[] = [
  {
    chip: 'BOGO',
    title: 'Buy one, get one free',
    body: 'Order one, and a second arrives on the house.',
    example: 'Two mains, one bill: dinner for two priced for one',
    place: 'Old Foundry Kitchen',
    accent: '#7C3AED',
    accentBg: 'rgba(124,58,237,0.1)',
  },
  {
    chip: 'Discount',
    title: 'Straight discount',
    body: 'A clean percentage or amount off the bill. No riddles.',
    example: 'Half-price day passes, any weekday',
    place: 'Northlight Strength Club',
    accent: '#E20C04',
    accentBg: 'rgba(226,12,4,0.1)',
  },
  {
    chip: 'Freebie',
    title: 'Freebie',
    body: 'Something free with your visit, just for being a member.',
    example: 'A pastry on the house with any coffee',
    place: 'Juniper Coffee',
    accent: '#16A34A',
    accentBg: 'rgba(22,163,74,0.1)',
  },
  {
    chip: 'Spend & save',
    title: 'Spend and save',
    body: 'Pass a spend threshold, watch a chunk come off.',
    example: 'Spend £30 on the good stuff, save £5',
    place: 'Fern & Field Deli',
    accent: '#E84A00',
    accentBg: 'rgba(232,74,0,0.1)',
  },
  {
    chip: 'Package deal',
    title: 'Package deal',
    body: 'A bundle priced better than the sum of its parts.',
    example: 'Cut, wash and hot towel finish, one price',
    place: 'Hatterly & Sons Barbers',
    accent: '#2563EB',
    accentBg: 'rgba(37,99,235,0.1)',
  },
  {
    chip: 'Time-limited',
    title: 'Time-limited',
    body: 'Extra generous, for a short window. Catch it while it is live.',
    example: 'Half-price blow-dries before noon',
    place: 'Amber Room Beauty',
    accent: '#D97706',
    accentBg: 'rgba(217,119,6,0.1)',
  },
  {
    chip: 'Reusable',
    title: 'Reusable',
    body: 'Does not burn out after one visit: it comes back automatically.',
    example: 'Ready again next cycle, nothing to re-claim',
    place: 'Every reusable voucher',
    accent: '#0D9488',
    accentBg: 'rgba(13,148,136,0.1)',
  },
]

const ROW_W = TYPES.length * CARD_W + (TYPES.length - 1) * GAP

function RailCard({ type, index }: { type: RailType; index: number }) {
  return (
    <motion.div
      className="relative flex-shrink-0 cursor-default"
      style={{ width: CARD_W, height: CARD_H, rotate: index % 2 ? 1.3 : -1.3 }}
      whileHover={{ rotate: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {/* Shadow on a wrapper so the die-cut notches read in the silhouette */}
      <div
        className="absolute inset-0"
        style={{ filter: 'drop-shadow(0 14px 26px rgba(1,12,53,0.1))' }}
      >
        <div
          className="h-full w-full bg-white flex flex-col px-8 pt-7 pb-6"
          style={{ clipPath: CARD_CLIP }}
        >
          {/* Type stripe, same recipe as the app's voucher cards */}
          <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: type.accent }} />

          <span
            className="self-start text-[10.5px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full mb-4"
            style={{ color: type.accent, background: type.accentBg }}
          >
            {type.chip}
          </span>

          <h3
            className="font-display text-[#010C35] leading-[1.12] mb-2.5"
            style={{ fontSize: '25px', letterSpacing: '-0.4px' }}
          >
            {type.title}
          </h3>
          <p className="text-[14px] text-[#4B5563] leading-[1.65]">{type.body}</p>

          {/* Stub: the example, behind a tear line like a real voucher */}
          <div className="mt-auto pt-4 border-t border-dashed border-[#010C35]/15">
            <p className="text-[13.5px] font-semibold text-[#010C35] leading-[1.5] mb-1">
              {type.example}
            </p>
            <p className="text-[11.5px] font-medium" style={{ color: type.accent }}>
              {type.place}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
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

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  })

  // The row starts aligned with the content column and sweeps left until its
  // last card rests where the first began.
  const leftPad = Math.max(24, (viewW - 1280) / 2)
  const endX = Math.min(0, viewW - leftPad * 2 - ROW_W)
  const x = useScrollLinked(useTransform(scrollYProgress, [0.04, 0.96], [0, endX]))
  const progress = useScrollLinked(useTransform(scrollYProgress, [0.04, 0.96], [0, 1]))

  // Mobile and reduced-motion visitors get the static VoucherTypesSection
  // via ScrollStory; this stage is the desktop presentation.
  if (reduceMotion) return null

  return (
    <section ref={trackRef} aria-label="Voucher types" className="relative hidden lg:block" style={{ height: '280vh', background: '#FFF9F5' }}>
      <div ref={stageRef} className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center">
        <div className="max-w-7xl mx-auto w-full px-6 mb-12">
          <p className="text-[12px] font-bold tracking-[0.2em] uppercase text-[#E20C04] mb-4">
            What members get
          </p>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2
              className="font-display text-[#010C35] leading-[1.06]"
              style={{ fontSize: 'clamp(34px, 3.8vw, 54px)', letterSpacing: '-0.8px' }}
            >
              Seven ways to pay less.
            </h2>
            <p className="text-[15px] text-[#4B5563] leading-[1.7] max-w-[420px]">
              Every offer on Redeemo is one of seven clear voucher types, always
              labelled, so you know exactly what you are getting before you go.
            </p>
          </div>
        </div>

        {/* The shelf */}
        <motion.div className="flex items-center" style={{ x, gap: GAP, paddingLeft: leftPad, paddingRight: leftPad }}>
          {TYPES.map((type, i) => (
            <RailCard key={type.chip} type={type} index={i} />
          ))}
        </motion.div>

        {/* Perforated progress line: the tear advances as the shelf sweeps */}
        <div className="max-w-7xl mx-auto w-full px-6 mt-12">
          <div className="relative h-[3px]">
            <div className="absolute inset-0 border-t-[3px] border-dotted border-[#010C35]/12" />
            <motion.div
              className="absolute inset-y-0 left-0 w-full origin-left"
              style={{ scaleX: progress, background: 'var(--brand-gradient)' }}
            />
          </div>
          <p className="mt-4 text-[12px] text-[#6B7280]">
            One redemption per place each month. New cycle, fresh set.
          </p>
        </div>
      </div>
    </section>
  )
}
