'use client'

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useViewportMode } from '@/components/landing/useViewportMode'
import { useScrollLinked } from '@/components/landing/scroll'
import { BrandStop } from '@/components/ui/BrandStop'

const HeroEmbers = dynamic(() => import('./HeroEmbers').then((m) => m.HeroEmbers), { ssr: false })

/**
 * Cinematic hero v3 for /for-businesses (owner 2026-07-16 round 4): a
 * two-stage pinned cinema.
 *
 *  Stage A (landing): the night-street photo (bg1) with the ANGLED laptop +
 *  phone (offset right) and the headline/CTA. Laptop shows the merchant
 *  portal home; phone shows the customer app category home.
 *
 *  Transition (on scroll): the written content fades away, a second
 *  location-map background (bg2) blends up from the bottom, and the devices
 *  rotate to FACE US, cross-dissolving from the angled cutout into the
 *  front-facing cutout.
 *
 *  Stage B (facing us): front devices centred on bg2, screens cycling
 *  (portal dashboard -> insights -> builder; app categories -> feed), with
 *  the five growth-signal cards arranged AROUND the devices in the space the
 *  cleared text leaves behind.
 *
 * Geometry: bg1/bg2 are the 1672x941 stage design space. Device screen quads
 * were measured from the cutouts' white pixels; the phone occludes a laptop
 * corner in each, reconstructed from the visible corners. All matrix3d values
 * are exact homographies solved offline. Mobile keeps the simpler stacked
 * layout (Stage A only) since it has no room for the pinned cinema.
 */

const STAGE_W = 1672
const STAGE_H = 941

// ── Angled devices (Stage A) ──────────────────────────────────────────────────
const CLUSTER_W = 1268
const CLUSTER_H = 763
const CLUSTER_ANGLED = { x: 648, y: 388, s: 0.62 }

const PHONE_W = 800
const PHONE_H = 1895
const PHONE_RADIUS = 92
const PHONE_MATRIX =
  'matrix3d(0.222873, -0.012369, 0, -0.000045, -0.074780, 0.254085, 0, -0.000036, 0, 0, 1, 0, 1021.3, 179.6, 0, 1)'

const LAPTOP_W = 1728
const LAPTOP_H = 1084
const LAPTOP_RADIUS = 18
const LAPTOP_MATRIX =
  'matrix3d(0.312366, -0.020379, 0, -0.000066, -0.081212, 0.404274, 0, -0.000043, 0, 0, 1, 0, 448.3, 59.6, 0, 1)'

// ── Front-facing devices (Stage B) ────────────────────────────────────────────
const CLUSTER_FRONT_W = 1177
const CLUSTER_FRONT_H = 733
// Centred in the stage; sized to leave room for cards on every side.
const CLUSTER_FRONT = { x: 402, y: 176, s: 0.74 }

const FRONT_LAPTOP_W = 1728
const FRONT_LAPTOP_H = 1088
const FRONT_LAPTOP_RADIUS = 14
const FRONT_LAPTOP_MATRIX =
  'matrix3d(0.500000, 0, 0, 0, -0.000919, 0.500000, 0, 0, 0, 0, 1, 0, 132, 35, 0, 1)'

const FRONT_PHONE_W = 800
const FRONT_PHONE_H = 1917
const FRONT_PHONE_RADIUS = 116
const FRONT_PHONE_MATRIX =
  'matrix3d(0.269102, 0.005709, 0, 0.000010, -0.005763, 0.256325, 0, -0.000005, 0, 0, 1, 0, 943, 191, 0, 1)'

const PORTAL_BG = '#F8F7F4'
const APP_BG = '#FFF9F5'
// Dashboard content pane (scrolls behind fixed chrome) for the ANGLED laptop.
const PANE = { left: 328, top: 79, width: 1386, height: 1005 }
const PANE_STRIP_H = 1761

// ── Growth signal cards ───────────────────────────────────────────────────────
// Stage B anchors: card centres in stage space, arranged AROUND the centred
// front devices (two left, two right, one below). Flat (front devices face us).

type Signal = {
  sx: number
  sy: number
  kicker: string
  title: string
  sub: string
  icon: 'live' | 'clock' | 'tick' | 'repeat'
  countdown?: boolean
  band: [number, number]
}

const SIGNALS: Signal[] = [
  { sx: 286, sy: 300, kicker: 'Offer live', title: '2 for 1 mains', sub: 'Visible to customers nearby', icon: 'live', band: [0.55, 0.62] },
  { sx: 286, sy: 566, kicker: 'Time-limited', title: 'Lunch rush · 20% off', sub: '', icon: 'clock', countdown: true, band: [0.62, 0.69] },
  { sx: 1452, sy: 300, kicker: 'New customer', title: 'A customer just found you', sub: 'Browsing nearby · Food & Drink', icon: 'live', band: [0.69, 0.76] },
  { sx: 1452, sy: 566, kicker: 'At the till', title: 'Redemption confirmed', sub: 'Code R7X4 KM2P · logged', icon: 'tick', band: [0.76, 0.83] },
  { sx: 836, sy: 872, kicker: 'Coming back', title: 'A regular in the making', sub: '3rd visit this month', icon: 'repeat', band: [0.83, 0.9] },
]

const COUNTDOWN_START = 2 * 3600 + 14 * 60 + 33

// ── Stage metrics: replicate object-fit:cover / object-position maths ─────────

type StageMetrics = { s: number; ox: number; oy: number; w: number; h: number }

function useStageMetrics(ref: RefObject<HTMLDivElement | null>, focalX: number): StageMetrics | null {
  const [m, setM] = useState<StageMetrics | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      const s = Math.max(w / STAGE_W, h / STAGE_H)
      setM({ s, ox: (w - STAGE_W * s) * focalX, oy: (h - STAGE_H * s) * 0.5, w, h })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, focalX])
  return m
}

// ── Angled device screens ─────────────────────────────────────────────────────

function AngledPhoneScreen() {
  // Stage A: customer app category home (owner: categories, not merchant cards)
  return (
    <div
      style={{
        position: 'absolute', left: 0, top: 0, width: PHONE_W, height: PHONE_H,
        transform: PHONE_MATRIX, transformOrigin: '0 0', borderRadius: PHONE_RADIUS,
        overflow: 'hidden', background: APP_BG, boxShadow: '0 0 70px rgba(120,150,255,0.2)',
      }}
    >
      <Image src="/app-shots/journey/home-top.jpg" alt="" fill sizes="300px" className="object-cover object-top" />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(168deg, rgba(255,255,255,0.10) 0%, rgba(1,8,30,0.04) 60%, rgba(1,8,30,0.18) 100%)' }} />
    </div>
  )
}

function AngledLaptopScreen({ stripY }: { stripY: MotionValue<number> | number }) {
  return (
    <div
      style={{
        position: 'absolute', left: 0, top: 0, width: LAPTOP_W, height: LAPTOP_H,
        transform: LAPTOP_MATRIX, transformOrigin: '0 0', borderRadius: LAPTOP_RADIUS,
        overflow: 'hidden', background: PORTAL_BG,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: PORTAL_BG }}>
        <Image src="/for-businesses/portal/home-chrome.webp" alt="" fill sizes="520px" className="object-cover object-top" />
        <div style={{ position: 'absolute', left: PANE.left, top: PANE.top, width: PANE.width, height: PANE.height, overflow: 'hidden', background: PORTAL_BG }}>
          <motion.div style={{ position: 'absolute', left: 0, top: 0, width: PANE.width, height: PANE_STRIP_H, y: stripY }}>
            <Image src="/for-businesses/portal/home-content-strip.webp" alt="" fill sizes="480px" className="object-cover object-top" />
          </motion.div>
        </div>
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(1,8,30,0.05) 70%, rgba(1,8,30,0.14) 100%)' }} />
    </div>
  )
}

function AngledCluster({ placement, stripY }: { placement: { x: number; y: number; s: number }; stripY: MotionValue<number> | number }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: placement.x, top: placement.y, width: CLUSTER_W, height: CLUSTER_H, transform: `scale(${placement.s})`, transformOrigin: '0 0' }}>
      <div style={{ position: 'absolute', left: 130, top: 596, width: 900, height: 130, background: 'radial-gradient(closest-side, rgba(0,4,18,0.55), transparent 70%)', filter: 'blur(10px)' }} />
      <div style={{ position: 'absolute', left: 930, top: 660, width: 340, height: 100, background: 'radial-gradient(closest-side, rgba(0,4,18,0.5), transparent 70%)', filter: 'blur(8px)' }} />
      <AngledLaptopScreen stripY={stripY} />
      <Image src="/for-businesses/hero-devices.webp" alt="" width={CLUSTER_W} height={CLUSTER_H} className="absolute left-0 top-0" priority />
      <AngledPhoneScreen />
    </div>
  )
}

// ── Front-facing device screens (Stage B) ─────────────────────────────────────

function FrontLaptopScreen({ dashOp, insightOp, builderOp }: { dashOp: MotionValue<number> | number; insightOp: MotionValue<number> | number; builderOp: MotionValue<number> | number }) {
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: FRONT_LAPTOP_W, height: FRONT_LAPTOP_H, transform: FRONT_LAPTOP_MATRIX, transformOrigin: '0 0', borderRadius: FRONT_LAPTOP_RADIUS, overflow: 'hidden', background: PORTAL_BG }}>
      {([['/for-businesses/portal/home-chrome.webp', dashOp], ['/for-businesses/portal/insight.webp', insightOp], ['/for-businesses/portal/builder.webp', builderOp]] as const).map(([src, op], i) => (
        <motion.div key={i} style={{ position: 'absolute', inset: 0, opacity: op, background: PORTAL_BG }}>
          <Image src={src} alt="" fill sizes="620px" className="object-cover object-top" />
        </motion.div>
      ))}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(155deg, rgba(255,255,255,0.08) 0%, rgba(1,8,30,0.03) 72%, rgba(1,8,30,0.1) 100%)' }} />
    </div>
  )
}

function FrontPhoneScreen({ catOp, feedOp }: { catOp: MotionValue<number> | number; feedOp: MotionValue<number> | number }) {
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: FRONT_PHONE_W, height: FRONT_PHONE_H, transform: FRONT_PHONE_MATRIX, transformOrigin: '0 0', borderRadius: FRONT_PHONE_RADIUS, overflow: 'hidden', background: APP_BG, boxShadow: '0 0 60px rgba(120,150,255,0.18)' }}>
      <motion.div style={{ position: 'absolute', inset: 0, opacity: catOp }}>
        <Image src="/app-shots/journey/home-top.jpg" alt="" fill sizes="300px" className="object-cover object-top" />
      </motion.div>
      <motion.div style={{ position: 'absolute', inset: 0, opacity: feedOp }}>
        <Image src="/app-shots/journey/home-strip.jpg" alt="" fill sizes="300px" className="object-cover object-top" />
      </motion.div>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(168deg, rgba(255,255,255,0.09) 0%, rgba(1,8,30,0.04) 60%, rgba(1,8,30,0.16) 100%)' }} />
    </div>
  )
}

function FrontCluster({ dashOp, insightOp, builderOp, catOp, feedOp }: { dashOp: MotionValue<number> | number; insightOp: MotionValue<number> | number; builderOp: MotionValue<number> | number; catOp: MotionValue<number> | number; feedOp: MotionValue<number> | number }) {
  const p = CLUSTER_FRONT
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: p.x, top: p.y, width: CLUSTER_FRONT_W, height: CLUSTER_FRONT_H, transform: `scale(${p.s})`, transformOrigin: '0 0' }}>
      <div style={{ position: 'absolute', left: 90, top: 636, width: 1000, height: 120, background: 'radial-gradient(closest-side, rgba(0,4,18,0.5), transparent 72%)', filter: 'blur(12px)' }} />
      <FrontLaptopScreen dashOp={dashOp} insightOp={insightOp} builderOp={builderOp} />
      <Image src="/for-businesses/hero-devices-front.webp" alt="" width={CLUSTER_FRONT_W} height={CLUSTER_FRONT_H} className="absolute left-0 top-0" priority />
      <FrontPhoneScreen catOp={catOp} feedOp={feedOp} />
    </div>
  )
}

// ── Signal cards ──────────────────────────────────────────────────────────────

function useCountdown(active: boolean) {
  const [left, setLeft] = useState(COUNTDOWN_START)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setLeft((v) => (v > 1 ? v - 1 : COUNTDOWN_START)), 1000)
    return () => clearInterval(id)
  }, [active])
  const h = Math.floor(left / 3600)
  const m = Math.floor((left % 3600) / 60)
  const s = left % 60
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

function CountdownPill() {
  const countdown = useCountdown(true)
  return (
    <span className="mt-1.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E20C04]/35 bg-[#E20C04]/16 px-2.5 py-1" style={{ boxShadow: 'inset 0 0 0 1px rgba(226,12,4,0.08)' }}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55">Ends in</span>
      <span className="text-[13px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{countdown}</span>
    </span>
  )
}

function SignalIcon({ icon }: { icon: Signal['icon'] }) {
  if (icon === 'tick') {
    return (
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#16A34A]/18">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
      </span>
    )
  }
  if (icon === 'clock') {
    return (
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#E20C04]/16">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF6B5E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>
      </span>
    )
  }
  if (icon === 'repeat') {
    return (
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#D97706]/18">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
      </span>
    )
  }
  return <span className="mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-[#E20C04] shadow-[0_0_10px_rgba(226,12,4,0.9)] animate-pulse" />
}

function SignalChip({ signal, float }: { signal: Signal; float: boolean }) {
  return (
    <motion.div
      animate={float ? { y: [0, -6, 0] } : undefined}
      transition={float ? { duration: 5.6, repeat: Infinity, ease: 'easeInOut', delay: signal.band[0] * 6 } : undefined}
      className="flex items-start gap-3 rounded-2xl border border-white/14 bg-[#0A1436]/72 px-4 py-3.5 backdrop-blur-md"
      style={{ boxShadow: '0 24px 60px rgba(0,4,20,0.5), inset 0 1px 0 rgba(255,255,255,0.09)' }}
    >
      <SignalIcon icon={signal.icon} />
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{signal.kicker}</span>
        <span className="block text-[14px] font-bold leading-snug text-white">{signal.title}</span>
        {signal.countdown ? <CountdownPill /> : <span className="block text-[12px] leading-snug text-white/55">{signal.sub}</span>}
      </span>
    </motion.div>
  )
}

// Stage B card, anchored around the centred front devices (flat).
function FrontSignal({ signal, m, progress, float }: { signal: Signal; m: StageMetrics; progress: MotionValue<number>; float: boolean }) {
  const appear = useScrollLinked(useTransform(progress, [signal.band[0], signal.band[1]], [0, 1]))
  const left = m.ox + signal.sx * m.s
  const top = m.oy + signal.sy * m.s
  return (
    <motion.div className="pointer-events-none absolute z-10" style={{ left, top, width: 224, opacity: appear }}>
      <div style={{ transform: 'translate(-50%, -50%)' }}>
        <SignalChip signal={signal} float={float} />
      </div>
    </motion.div>
  )
}

// ── Shared copy column ────────────────────────────────────────────────────────

function HeroCopy({ registerUrl }: { registerUrl: string }) {
  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/7 px-4 py-2 backdrop-blur-sm">
        <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-[#E20C04]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">For businesses</span>
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }} className="font-display mb-6 leading-[1.08] text-white" style={{ fontSize: 'clamp(32px, 4.2vw, 47px)', letterSpacing: '-0.6px' }}>
        <span className="block">Bring in new customers.</span>
        <span className="gradient-text block pb-[0.14em] leading-[1.14]">Keep your <span className="whitespace-nowrap">margins<BrandStop tone="white" /></span></span>
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.18 }} className="mb-10 max-w-[470px] text-[16px] leading-[1.7] text-white/60 md:text-[17px]">
        List your business on Redeemo for free. No commission. No listing fees. Reach local customers who are already looking for exactly what you offer.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.26 }} className="mb-10 flex flex-wrap gap-2.5">
        {['Free to list', 'No commission. Ever.', '12-month contract', 'Digital verification'].map((t) => (
          <span key={t} className="rounded-full border border-white/12 bg-[#010C35]/40 px-3.5 py-1.5 text-[12px] font-semibold text-white/65 backdrop-blur-sm">{t}</span>
        ))}
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.34 }}>
        <a href={registerUrl} className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-bold text-white no-underline transition-opacity hover:opacity-90" style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 24px rgba(226,12,4,0.38)' }}>
          List your business free
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </a>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.48 }} className="mt-14 grid max-w-[460px] grid-cols-3 gap-6 border-t border-white/[0.08] pt-8">
        {[{ value: '£0', label: 'to list your business' }, { value: '0%', label: 'commission per redemption' }, { value: '1×', label: 'per customer per membership month' }].map((s, i) => (
          <div key={i}>
            <p className="font-display mb-1 leading-none text-white" style={{ fontSize: '30px', letterSpacing: '-0.5px' }}>{s.value}</p>
            <p className="text-[11px] font-medium uppercase leading-snug tracking-[0.1em] text-white/38">{s.label}</p>
          </div>
        ))}
      </motion.div>
    </>
  )
}

// ── Desktop: two-stage pinned cinema ──────────────────────────────────────────

function HeroDesktop({ registerUrl }: { registerUrl: string }) {
  const bandRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: bandRef, offset: ['start start', 'end end'] })
  const m = useStageMetrics(stageRef, 0.68)

  // Copy fades out first
  const copyOpacity = useScrollLinked(useTransform(scrollYProgress, [0.14, 0.28], [1, 0]))
  const copyY = useScrollLinked(useTransform(scrollYProgress, [0.14, 0.28], [0, -48]))

  // bg2 blends up from the bottom (fully hidden in Stage A, full by mid-transition)
  const bg2Reveal = useTransform(scrollYProgress, [0.2, 0.46], ['-30%', '130%'])

  // Angled cluster: hold, then recede (rotate away + zoom past) and fade
  const angledOp = useScrollLinked(useTransform(scrollYProgress, [0.26, 0.4], [1, 0]))
  const angledRotY = useScrollLinked(useTransform(scrollYProgress, [0.26, 0.42], [0, 30]))
  const angledScale = useScrollLinked(useTransform(scrollYProgress, [0.26, 0.42], [1, 1.14]))
  const angledStrip = useScrollLinked(useTransform(scrollYProgress, [0.02, 0.24], [0, -120]))

  // Front cluster: comes forward to face us, handed off just after the angled leaves
  const frontOp = useScrollLinked(useTransform(scrollYProgress, [0.38, 0.52], [0, 1]))
  const frontRotY = useScrollLinked(useTransform(scrollYProgress, [0.38, 0.54], [-24, 0]))
  const frontScale = useScrollLinked(useTransform(scrollYProgress, [0.38, 0.54], [0.86, 1]))

  // Stage B: cycle the front screens
  const dashOp = useScrollLinked(useTransform(scrollYProgress, [0.48, 0.6, 0.66], [1, 1, 0]))
  const insightOp = useScrollLinked(useTransform(scrollYProgress, [0.62, 0.68, 0.82, 0.88], [0, 1, 1, 0]))
  const builderOp = useScrollLinked(useTransform(scrollYProgress, [0.84, 0.9], [0, 1]))
  const catOp = useScrollLinked(useTransform(scrollYProgress, [0.58, 0.7], [1, 0]))
  const feedOp = useScrollLinked(useTransform(scrollYProgress, [0.58, 0.7], [0, 1]))

  const rm = (v: MotionValue<number>, still: number) => (reduceMotion ? still : v)

  return (
    <section ref={bandRef} className="relative -mt-[80px]" style={{ height: '300svh', background: '#010C35' }}>
      <div ref={stageRef} className="sticky top-0 h-[100svh] overflow-hidden">
        {/* Backgrounds: bg1 always, bg2 revealed from the bottom */}
        <Image src="/for-businesses/hero-bg.webp" alt="A customer being served at a small business at night, with a laptop and phone showing Redeemo" fill priority sizes="100vw" className="object-cover" style={{ objectPosition: '68% 50%' }} />
        <motion.div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            ['--rv' as string]: bg2Reveal,
            WebkitMaskImage: 'linear-gradient(to top, #000 var(--rv), transparent calc(var(--rv) + 22%))',
            maskImage: 'linear-gradient(to top, #000 var(--rv), transparent calc(var(--rv) + 22%))',
          }}
        >
          <Image src="/for-businesses/hero-bg2.webp" alt="" fill sizes="100vw" className="object-cover" style={{ objectPosition: '50% 50%' }} />
        </motion.div>

        {/* Device stage overlay (both clusters live here, cover-mapped) */}
        {m ? (
          <div aria-hidden="true" className="absolute left-0 top-0" style={{ width: STAGE_W, height: STAGE_H, transform: `translate(${m.ox}px, ${m.oy}px) scale(${m.s})`, transformOrigin: '0 0' }}>
            {/* Angled (Stage A) */}
            <motion.div className="absolute inset-0" style={{ opacity: angledOp, rotateY: rm(angledRotY, 0), scale: rm(angledScale, 1), transformPerspective: 2200, transformOrigin: '60% 55%' }}>
              <div style={{ position: 'absolute', left: CLUSTER_ANGLED.x + 30 * CLUSTER_ANGLED.s, top: CLUSTER_ANGLED.y + CLUSTER_H * CLUSTER_ANGLED.s - 40, width: CLUSTER_W * CLUSTER_ANGLED.s * 0.95, height: 110, background: 'radial-gradient(closest-side, rgba(130,155,255,0.15), transparent 72%)' }} />
              <AngledCluster placement={CLUSTER_ANGLED} stripY={reduceMotion ? 0 : angledStrip} />
            </motion.div>
            {/* Front (Stage B) */}
            <motion.div className="absolute inset-0" style={{ opacity: frontOp, rotateY: rm(frontRotY, 0), scale: rm(frontScale, 1), transformPerspective: 2200, transformOrigin: '50% 55%' }}>
              <div style={{ position: 'absolute', left: CLUSTER_FRONT.x + 40 * CLUSTER_FRONT.s, top: CLUSTER_FRONT.y + CLUSTER_FRONT_H * CLUSTER_FRONT.s - 30, width: CLUSTER_FRONT_W * CLUSTER_FRONT.s, height: 120, background: 'radial-gradient(closest-side, rgba(130,155,255,0.16), transparent 72%)' }} />
              <FrontCluster dashOp={rm(dashOp, 1)} insightOp={rm(insightOp, 0)} builderOp={rm(builderOp, 0)} catOp={rm(catOp, 1)} feedOp={rm(feedOp, 0)} />
            </motion.div>
          </div>
        ) : null}

        <HeroEmbers progress={scrollYProgress} />

        {/* Scrims: headline zone (Stage A), navbar, footline */}
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ opacity: copyOpacity, background: 'linear-gradient(90deg, rgba(1,12,53,0.94) 0%, rgba(1,12,53,0.6) 32%, rgba(1,12,53,0) 56%)' }} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(1,12,53,0.72) 0%, rgba(1,12,53,0) 150px), linear-gradient(0deg, rgba(1,12,53,0.6) 0%, rgba(1,12,53,0) 170px)' }} />

        {/* Stage B cards, around the front devices */}
        {m ? SIGNALS.map((sig) => <FrontSignal key={sig.kicker} signal={sig} m={m} progress={scrollYProgress} float={!reduceMotion} />) : null}

        {/* Copy (fades out) */}
        <motion.div style={{ opacity: copyOpacity, y: rm(copyY, 0) }} className="relative mx-auto flex h-full max-w-7xl items-start px-6 lg:px-10">
          <div className="max-w-[540px] pt-[120px]">
            <HeroCopy registerUrl={registerUrl} />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ── Mobile / tablet: stacked Stage A + card list ──────────────────────────────

function HeroStacked({ registerUrl }: { registerUrl: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const m = useStageMetrics(stageRef, 0.58)

  let cluster = CLUSTER_ANGLED
  if (m) {
    const visLeft = -m.ox / m.s
    const visW = m.w / m.s
    const cs = (visW * 0.92) / CLUSTER_W
    cluster = { x: visLeft + visW * 0.05, y: 900 - CLUSTER_H * cs, s: cs }
  }

  return (
    <section className="relative -mt-[80px]" style={{ background: '#010C35' }}>
      <div className="px-6 pb-4 pt-[176px]">
        <div className="mx-auto max-w-[600px]">
          <HeroCopy registerUrl={registerUrl} />
        </div>
      </div>

      <div ref={stageRef} className="relative mt-6 h-[64svh] overflow-hidden">
        <Image src="/for-businesses/hero-bg.webp" alt="A small business at night with the Redeemo laptop and phone" fill sizes="100vw" className="object-cover" style={{ objectPosition: '58% 50%' }} />
        {m ? (
          <div aria-hidden="true" className="absolute left-0 top-0" style={{ width: STAGE_W, height: STAGE_H, transform: `translate(${m.ox}px, ${m.oy}px) scale(${m.s})`, transformOrigin: '0 0' }}>
            <AngledCluster placement={cluster} stripY={0} />
          </div>
        ) : null}
        <HeroEmbers />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(1,12,53,1) 0%, rgba(1,12,53,0) 120px), linear-gradient(0deg, rgba(1,12,53,0.85) 0%, rgba(1,12,53,0) 140px)' }} />
      </div>

      <div className="relative mx-auto flex w-full max-w-[440px] flex-col gap-3 px-6 pb-14 pt-2" style={{ marginTop: '-56px' }}>
        {SIGNALS.map((sig, i) => (
          <motion.div key={sig.kicker} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }} aria-hidden="true">
            <SignalChip signal={sig} float={false} />
          </motion.div>
        ))}
      </div>
    </section>
  )
}

export function HeroCinematic({ registerUrl }: { registerUrl: string }) {
  const mode = useViewportMode()
  if (mode === 'desktop') return <HeroDesktop registerUrl={registerUrl} />
  return <HeroStacked registerUrl={registerUrl} />
}
