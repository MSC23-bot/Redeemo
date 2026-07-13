'use client'

import dynamic from 'next/dynamic'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useScrollLinked } from './scroll'
import { useViewportMode } from './useViewportMode'

// Navy background, red radial glow and the live 3D ribbon: moved here from
// the retired Redeemo Standard section (owner 2026-07-13).
const RibbonScene3D = dynamic(() => import('./RibbonScene3D').then((m) => m.RibbonScene3D), { ssr: false })

/**
 * The voucher shelf (owner direction 2026-07-08): the seven voucher types as
 * die-cut cards. Desktop: a pinned stage where vertical scroll sweeps the
 * shelf horizontally. Mobile: the same cards as a native swipe carousel (no
 * scroll-jacking on touch). Reduced-motion visitors get the static
 * VoucherTypesSection that ScrollStory renders, so this returns null for them.
 *
 * Card anatomy (owner v4): each card is a real voucher: a tinted header
 * carrying a bespoke SVG motif of the TYPE MECHANIC (not a category), a
 * dashed tear line aligned with the die-cut side notches, and below the tear
 * the title, the mechanic in a sentence, and the kinds of deals it produces.
 * Copy rules: examples are kinds of deals, not forced arithmetic; never
 * named merchants; values only where they explain the mechanic.
 */

const CARD_W = 380
const CARD_H = 340
const NOTCH_R = 11
const GAP = 28
// The tear line (and its die-cut notches) sits at 44% height: header above,
// content below, like a real coupon stub.
const NOTCH_F = 0.44

const cardClip = (w: number, h: number) => {
  const ny = Math.round(h * NOTCH_F)
  return `path('M 20 0 H ${w - 20} Q ${w} 0 ${w} 20 V ${ny - NOTCH_R} A ${NOTCH_R} ${NOTCH_R} 0 0 0 ${w} ${ny + NOTCH_R} V ${h - 20} Q ${w} ${h} ${w - 20} ${h} H 20 Q 0 ${h} 0 ${h - 20} V ${ny + NOTCH_R} A ${NOTCH_R} ${NOTCH_R} 0 0 0 0 ${ny - NOTCH_R} V 20 Q 0 0 20 0 Z')`
}

type RailType = {
  key: string
  chip: string
  title: string
  body: string
  deals: string
  accent: string
  accentBg: string
}

const TYPES: RailType[] = [
  {
    key: 'bogo',
    chip: 'BOGO',
    title: 'Buy one, get one free',
    body: 'Order one and a second arrives on the house.',
    deals: 'A second coffee free · a second main free · one to share for nothing',
    accent: '#7C3AED',
    accentBg: 'rgba(124,58,237,0.1)',
  },
  {
    key: 'discount',
    chip: 'Discount',
    title: 'Straight discount',
    body: 'A clean cut off the bill, stated up front.',
    deals: '20% off the bill · £10 off a treatment · money off, plain and simple',
    accent: '#E20C04',
    accentBg: 'rgba(226,12,4,0.1)',
  },
  {
    key: 'freebie',
    chip: 'Freebie',
    title: 'Freebie',
    body: 'Something extra, free with your visit.',
    deals: 'A pastry with your coffee · a side with your main · a taster on the house',
    accent: '#16A34A',
    accentBg: 'rgba(22,163,74,0.1)',
  },
  {
    key: 'spend',
    chip: 'Spend & save',
    title: 'Spend and save',
    body: 'Pass a spend level and money comes off.',
    deals: 'Spend £40, save £10 · stock up and save · bigger baskets, bigger rewards',
    accent: '#E84A00',
    accentBg: 'rgba(232,74,0,0.1)',
  },
  {
    key: 'package',
    chip: 'Package deal',
    title: 'Package deal',
    body: 'A bundle priced better than its parts.',
    deals: 'Cut and finish as one booking · lunch combos · sessions bundled for less',
    accent: '#2563EB',
    accentBg: 'rgba(37,99,235,0.1)',
  },
  {
    key: 'time',
    chip: 'Time-limited',
    title: 'Time-limited',
    body: 'Extra generous, for a short window.',
    deals: 'Off-peak prices · morning-only treats · catch it while it is live',
    accent: '#D97706',
    accentBg: 'rgba(217,119,6,0.1)',
  },
  {
    key: 'reusable',
    chip: 'Reusable',
    title: 'Reusable',
    body: 'It does not burn out: it returns after every visit.',
    deals: 'Your usual order, cheaper every time · the regular that rewards you',
    accent: '#0D9488',
    accentBg: 'rgba(13,148,136,0.1)',
  },
]

const ROW_W = TYPES.length * CARD_W + (TYPES.length - 1) * GAP

/**
 * Bespoke motifs: each draws the TYPE'S MECHANIC. Bold rounded shapes in the
 * type colour + white, sized for the card header. viewBox 0 0 96 96.
 */
function Motif({ kind, accent }: { kind: string; accent: string }) {
  switch (kind) {
    case 'bogo':
      // Two tickets: the one you pay for, and its twin on the house
      return (
        <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <g transform="rotate(-8 48 38)">
            <rect x="16" y="22" width="64" height="32" rx="7" fill="#fff" opacity="0.92" stroke={accent} strokeWidth="2" />
            <line x1="62" y1="27" x2="62" y2="49" stroke={accent} strokeWidth="2" strokeDasharray="3 4" opacity="0.5" />
            <rect x="24" y="32" width="24" height="4" rx="2" fill={accent} opacity="0.35" />
            <rect x="24" y="40" width="16" height="4" rx="2" fill={accent} opacity="0.2" />
          </g>
          <g transform="rotate(5 48 62)">
            <rect x="16" y="46" width="64" height="32" rx="7" fill={accent} />
            <line x1="62" y1="51" x2="62" y2="73" stroke="#fff" strokeWidth="2" strokeDasharray="3 4" opacity="0.7" />
            <text x="39" y="67" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" fontFamily="inherit" letterSpacing="0.5">
              FREE
            </text>
          </g>
        </svg>
      )
    case 'discount':
      // The percent roundel: money off, stated up front
      return (
        <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <circle cx="63" cy="30" r="10" fill={accent} opacity="0.18" />
          <circle cx="24" cy="68" r="6" fill={accent} opacity="0.25" />
          <circle cx="46" cy="52" r="27" fill={accent} />
          <circle cx="37" cy="43" r="5" fill="none" stroke="#fff" strokeWidth="3" />
          <circle cx="55" cy="61" r="5" fill="none" stroke="#fff" strokeWidth="3" />
          <line x1="36" y1="64" x2="57" y2="40" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M74 52 l3 6 6 3 -6 3 -3 6 -3-6 -6-3 6-3 Z" fill={accent} opacity="0.55" />
        </svg>
      )
    case 'freebie':
      // A gift, on the house
      return (
        <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <rect x="22" y="42" width="52" height="34" rx="6" fill={accent} />
          <rect x="18" y="30" width="60" height="15" rx="5" fill={accent} opacity="0.8" />
          <rect x="43" y="30" width="10" height="46" fill="#fff" opacity="0.9" />
          <path d="M48 30 c-5-11 -19-10 -16-2 c2 6 10 5 16 2 Z" fill={accent} />
          <path d="M48 30 c5-11 19-10 16-2 c-2 6 -10 5 -16 2 Z" fill={accent} />
          <path d="M76 18 l2.4 4.8 4.8 2.4 -4.8 2.4 -2.4 4.8 -2.4-4.8 -4.8-2.4 4.8-2.4 Z" fill={accent} opacity="0.5" />
          <circle cx="16" cy="24" r="3.5" fill={accent} opacity="0.3" />
        </svg>
      )
    case 'spend':
      // The receipt with a saving printed on it
      return (
        <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <path
            d="M26 16 h38 v58 l-4.75 -4 -4.75 4 -4.75 -4 -4.75 4 -4.75 -4 -4.75 4 -4.75 -4 -4.75 4 Z"
            fill="#fff"
            opacity="0.95"
            stroke={accent}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <rect x="33" y="26" width="20" height="4" rx="2" fill={accent} opacity="0.3" />
          <rect x="33" y="35" width="24" height="4" rx="2" fill={accent} opacity="0.3" />
          <rect x="33" y="44" width="16" height="4" rx="2" fill={accent} opacity="0.3" />
          <rect x="31" y="54" width="28" height="11" rx="5.5" fill={accent} />
          <text x="45" y="62.5" textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff" fontFamily="inherit" letterSpacing="0.6">
            SAVE
          </text>
          <circle cx="70" cy="66" r="12" fill={accent} />
          <text x="70" y="71" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" fontFamily="inherit">
            £
          </text>
        </svg>
      )
    case 'package':
      // One strap around several things: bundled and priced as one
      return (
        <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <circle cx="33" cy="38" r="9" fill={accent} opacity="0.3" />
          <circle cx="50" cy="33" r="10" fill={accent} opacity="0.5" />
          <circle cx="66" cy="39" r="8" fill={accent} opacity="0.3" />
          <rect x="20" y="44" width="56" height="32" rx="6" fill={accent} />
          <rect x="20" y="54" width="56" height="9" fill="#fff" opacity="0.85" />
          <rect x="43" y="50" width="10" height="17" rx="3" fill={accent} opacity="0.9" />
          <g transform="rotate(14 74 46)">
            <rect x="68" y="40" width="16" height="11" rx="3" fill="#fff" stroke={accent} strokeWidth="2" />
            <circle cx="72" cy="45.5" r="1.6" fill={accent} />
          </g>
        </svg>
      )
    case 'time':
      // The stopwatch: generous, but the window is ticking
      return (
        <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <rect x="42" y="12" width="12" height="8" rx="3" fill={accent} />
          <line x1="65" y1="22" x2="70" y2="27" stroke={accent} strokeWidth="4" strokeLinecap="round" />
          <circle cx="48" cy="54" r="28" fill="#fff" opacity="0.95" stroke={accent} strokeWidth="3.5" />
          <path d="M48 54 L48 31 A23 23 0 0 1 68 43 Z" fill={accent} opacity="0.85" />
          <line x1="48" y1="54" x2="37" y2="63" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="48" cy="54" r="3" fill={accent} />
          <line x1="12" y1="46" x2="20" y2="46" stroke={accent} strokeWidth="3.5" strokeLinecap="round" opacity="0.45" />
          <line x1="8" y1="56" x2="18" y2="56" stroke={accent} strokeWidth="3.5" strokeLinecap="round" opacity="0.25" />
        </svg>
      )
    case 'reusable':
      // The loop: redeem, return, repeat
      return (
        <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <path d="M26 42 a24 24 0 0 1 41 -7" stroke={accent} strokeWidth="6" strokeLinecap="round" />
          <path d="M67 26 l1.5 10.5 -10.5 -1.5" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M70 58 a24 24 0 0 1 -41 7" stroke={accent} strokeWidth="6" strokeLinecap="round" />
          <path d="M29 74 l-1.5 -10.5 10.5 1.5" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="32" y="40" width="32" height="20" rx="5" fill="#fff" opacity="0.95" stroke={accent} strokeWidth="2.5" />
          <line x1="55" y1="44" x2="55" y2="56" stroke={accent} strokeWidth="2" strokeDasharray="2.5 3" opacity="0.6" />
          <rect x="37" y="47" width="12" height="4" rx="2" fill={accent} opacity="0.4" />
        </svg>
      )
    default:
      return null
  }
}

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
  const notchY = Math.round(height * NOTCH_F)
  const motifSize = notchY - 34
  return (
    <motion.div
      className="relative flex-shrink-0 cursor-default snap-center"
      style={{ width, height, rotate: tilt ? (index % 2 ? 1.3 : -1.3) : 0 }}
      whileHover={{ rotate: 0, y: -10 }}
      whileTap={{ rotate: 0, y: -8, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {/* Shadow on a wrapper so the die-cut notches read in the silhouette;
          deeper now the cards lift off a navy stage rather than cream */}
      <div className="absolute inset-0" style={{ filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.38))' }}>
        <div className="relative h-full w-full bg-white overflow-hidden" style={{ clipPath: cardClip(width, height) }}>
          {/* Header: the type's world, tinted in its colour */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0"
            style={{ height: notchY, background: `linear-gradient(150deg, ${type.accentBg}, rgba(255,255,255,0))` }}
          />
          {/* Type stripe, same recipe as the app's voucher cards */}
          <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: type.accent }} />

          {/* The mechanic, drawn: two tickets, a stopwatch, a receipt... */}
          <div className="absolute" style={{ right: 22, top: 17, width: motifSize, height: motifSize }}>
            <Motif kind={type.key} accent={type.accent} />
          </div>

          <span
            className="absolute left-6 top-6 text-[10.5px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full text-white"
            style={{ background: type.accent }}
          >
            {type.chip}
          </span>

          {/* Tear line on the notch line: header is the stub, content below */}
          <div
            aria-hidden="true"
            className="absolute left-5 right-5 border-t-2 border-dashed border-[#010C35]/12"
            style={{ top: notchY - 1 }}
          />

          <div className="relative flex flex-col h-full px-6 pb-5" style={{ paddingTop: notchY + 18 }}>
            <h3 className="font-display text-[#010C35] leading-[1.12] mb-2" style={{ fontSize: '24px', letterSpacing: '-0.4px' }}>
              {type.title}
            </h3>
            <p className="text-[13.5px] text-[#4B5563] leading-[1.55]">{type.body}</p>
            <p className="mt-auto text-[12.5px] leading-[1.65] text-[#6B7280]">
              <span className="font-bold" style={{ color: type.accent }}>
                Deals like:
              </span>{' '}
              {type.deals}
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
      <p className="text-[12px] font-bold tracking-[0.2em] uppercase text-white/40 mb-4">What members get</p>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="font-display text-white leading-[1.06]" style={{ fontSize: 'clamp(30px, 3.8vw, 54px)', letterSpacing: '-0.8px' }}>
          Seven ways to pay less.
        </h2>
        <p className="text-[15px] text-white/55 leading-[1.7] max-w-[420px]">
          Every offer on Redeemo is one of seven clear voucher types, always
          labelled, so you know exactly what you are getting before you go.
        </p>
      </div>
    </div>
  )
}

const FOOTER_LINE =
  'One membership unlocks all seven, wherever you see them. One redemption per place each month (reusables come back sooner).'

export function VoucherTypesRail() {
  const trackRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const mTrackRef = useRef<HTMLDivElement>(null)
  const mRowRef = useRef<HTMLDivElement>(null)
  const touchingRef = useRef(false)
  const reduceMotion = useReducedMotion()
  const mode = useViewportMode()
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

  // Mobile: the same pinned sweep (owner 2026-07-13), but driven through
  // the row's native scrollLeft so a horizontal thumb-swipe still works:
  // vertical scroll sweeps the shelf; a touch takes over; scroll re-syncs.
  const { scrollYProgress: mScroll } = useScroll({ target: mTrackRef, offset: ['start start', 'end end'] })
  const mProgress = useScrollLinked(useTransform(mScroll, [0.05, 0.95], [0, 1]))
  useEffect(() => {
    const row = mRowRef.current
    if (!row) return
    return mProgress.on('change', (p) => {
      if (touchingRef.current) return
      row.scrollLeft = p * (row.scrollWidth - row.clientWidth)
    })
  }, [mProgress])

  // Reduced-motion visitors get a plain swipe carousel; so do SHORT
  // viewports (landscape phones, owner 2026-07-13): a pinned 100svh stage
  // cannot hold header + cards in ~330px of height, but a natural-scroll
  // carousel can, and the navy world still travels with it.
  if (reduceMotion || mode === 'short') {
    return (
      <section aria-label="Voucher types" className="relative overflow-hidden py-16" style={{ background: '#010C35' }}>
        {/* Red radial glow, matching the Redeemo Standard treatment it was
            moved from (owner 2026-07-13) */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(600px circle at 0% 48%, rgba(226,12,4,0.16), transparent 54%), radial-gradient(420px circle at 100% 120%, rgba(200,50,0,0.14), transparent 50%)',
          }}
        />
        {!reduceMotion && (
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <RibbonScene3D preset="navy" />
          </div>
        )}
        <div className="relative mb-8">
          <ShelfHeader />
        </div>
        <div className="relative flex overflow-x-auto snap-x snap-mandatory gap-4 px-6 pb-6" style={{ scrollbarWidth: 'none' }}>
          {TYPES.map((type, i) => (
            <RailCard key={type.chip} type={type} index={i} width={318} height={330} tilt={false} />
          ))}
        </div>
        <div className="relative px-6 mt-2">
          <p className="text-[12px] text-white/50 leading-[1.6]">Swipe for more · {FOOTER_LINE}</p>
        </div>
      </section>
    )
  }

  return (
    <>
      {/* Desktop: pinned stage, vertical scroll sweeps the shelf sideways */}
      {/* no overflow-hidden on the pinned tracks: it breaks position:sticky;
          the sticky stage inside clips its own layers */}
      <section ref={trackRef} aria-label="Voucher types" className="relative hidden lg:block" style={{ height: '280vh', background: '#010C35' }}>
        <div ref={stageRef} className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center">
          {/* Red radial glow, matching the Redeemo Standard treatment it was
              moved from (owner 2026-07-13) */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(600px circle at 0% 48%, rgba(226,12,4,0.16), transparent 54%), radial-gradient(420px circle at 100% 120%, rgba(200,50,0,0.14), transparent 50%)',
            }}
          />

          {/* The live 3D brand ribbon, carried over from the retired section
              so the shelf keeps the navy stage's dramatic register */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <RibbonScene3D preset="navy" />
          </div>

          <div className="relative mb-12">
            <ShelfHeader />
          </div>

          <motion.div className="relative flex items-center" style={{ x, gap: GAP, paddingLeft: leftPad, paddingRight: leftPad }}>
            {TYPES.map((type, i) => (
              <RailCard key={type.chip} type={type} index={i} />
            ))}
          </motion.div>

          {/* Perforated progress line: the tear advances as the shelf sweeps */}
          <div className="relative max-w-7xl mx-auto w-full px-6 mt-12">
            <div className="relative h-[3px]">
              <div className="absolute inset-0 border-t-[3px] border-dotted border-white/20" />
              <motion.div className="absolute inset-y-0 left-0 w-full origin-left" style={{ scaleX: progress, background: 'var(--brand-gradient)' }} />
            </div>
            <p className="mt-4 text-[12px] text-white/50">{FOOTER_LINE}</p>
          </div>
        </div>
      </section>

      {/* Mobile: the SAME pinned sweep, tilts and all, plus native swipe */}
      <section ref={mTrackRef} aria-label="Voucher types" className="relative lg:hidden" style={{ height: '240vh', background: '#010C35' }}>
        <div className="sticky top-0 h-[100svh] overflow-hidden flex flex-col justify-center">
          {/* Red radial glow, matching the Redeemo Standard treatment it was
              moved from (owner 2026-07-13) */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(600px circle at 0% 48%, rgba(226,12,4,0.16), transparent 54%), radial-gradient(420px circle at 100% 120%, rgba(200,50,0,0.14), transparent 50%)',
            }}
          />

          {/* The live 3D brand ribbon, mobile included (owner 2026-07-13):
              the 3D must travel */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <RibbonScene3D preset="navy" />
          </div>

          <div className="relative mb-7">
            <ShelfHeader />
          </div>
          <div
            ref={mRowRef}
            className="relative flex items-center overflow-x-auto gap-4 px-6 pt-3 pb-5"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
            onTouchStart={() => { touchingRef.current = true }}
            onTouchEnd={() => { window.setTimeout(() => { touchingRef.current = false }, 600) }}
          >
            {TYPES.map((type, i) => (
              <RailCard key={type.chip} type={type} index={i} width={286} height={332} />
            ))}
          </div>
          <div className="relative px-6 mt-5">
            <div className="relative h-[3px]">
              <div className="absolute inset-0 border-t-[3px] border-dotted border-white/20" />
              <motion.div className="absolute inset-y-0 left-0 w-full origin-left" style={{ scaleX: mProgress, background: 'var(--brand-gradient)' }} />
            </div>
            <p className="mt-3 text-[11.5px] text-white/50 leading-[1.6]">{FOOTER_LINE}</p>
          </div>
        </div>
      </section>
    </>
  )
}
