'use client'

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useViewportMode } from '@/components/landing/useViewportMode'
import { useScrollLinked } from '@/components/landing/scroll'
import { BrandStop } from '@/components/ui/BrandStop'

const HeroEmbers = dynamic(() => import('./HeroEmbers').then((m) => m.HeroEmbers), { ssr: false })

/**
 * Cinematic hero for /for-businesses (owner 2026-07-15): the generated
 * night-street photograph becomes the stage; the giant phone standing in it
 * gets a LIVE app screen (real home feed, header and nav pinned, the feed
 * scrubbing with page scroll) projected into the photo's own perspective;
 * three "growth signal" glass chips tell the funnel story alongside
 * (offer live -> new customer -> redemption confirmed); a WebGL ember
 * field extends the street bokeh. Headline column sits over the photo's
 * navy left. Desktop pins for a short scroll chapter; mobile stacks.
 *
 * Geometry: the photo is treated as a fixed 1672x941 design space. The
 * phone-screen quad was measured from pixels (scanline colour fits):
 * TL(1110.1,178.0) TR(1351.3,153.9) BR(1298.1,831.9) BL(1057.9,821.9).
 * PHONE_MATRIX is the exact homography mapping an 800x2197 screen rect
 * onto that quad (solved offline; see docs in the PR). The background
 * renders as object-fit:cover with the SAME focal maths applied to the
 * overlay layer, so the projection stays glued at every viewport.
 */

const STAGE_W = 1672
const STAGE_H = 941

// Screen design space: 800 wide (native capture width); height matches the
// photographed phone's taller aspect, so the app renders at natural
// proportions with a taller feed viewport. Nothing stretches.
const SCREEN_W = 800
const SCREEN_H = 2197
const HEADER_H = 194
const NAV_H = 152
const STRIP_H = 2421
const FEED_TRAVEL = STRIP_H - SCREEN_H // 224 design px of scroll-scrub
const SCREEN_RADIUS = 88

const PHONE_MATRIX =
  'matrix3d(0.216633, -0.039807, 0, -0.000063, -0.027192, 0.290431, 0, -0.000003, 0, 0, 1, 0, 1110.087005, 177.9913, 0, 1)'

// ── Growth signal chips ───────────────────────────────────────────────────────
// The funnel, in order, anchored to quiet spots in the photograph. Copy is
// illustrative UI (customer lens; code uses the real 4+4 format).

type Signal = {
  x: number
  y: number
  kicker: string
  title: string
  sub: string
  tick?: boolean
  band: [number, number]
}

const SIGNALS: Signal[] = [
  { x: 1462, y: 238, kicker: 'Offer live', title: '2 for 1 mains', sub: 'Visible to customers nearby', band: [0.08, 0.2] },
  { x: 1484, y: 468, kicker: 'New customer', title: 'A customer just found you', sub: 'Browsing nearby · Food & Drink', band: [0.28, 0.4] },
  { x: 1454, y: 698, kicker: 'At the till', title: 'Redemption confirmed', sub: 'Code R7X4 KM2P · logged', tick: true, band: [0.48, 0.6] },
]

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

// ── The live phone screen, projected into the photograph ──────────────────────

function PhoneScreen({ feedY }: { feedY: MotionValue<number> | number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: SCREEN_W,
        height: SCREEN_H,
        transform: PHONE_MATRIX,
        transformOrigin: '0 0',
        borderRadius: SCREEN_RADIUS,
        overflow: 'hidden',
        background: '#0A1030',
        boxShadow: '0 0 90px rgba(110,140,255,0.30), 0 0 260px rgba(80,110,230,0.16)',
      }}
    >
      {/* Scrolling home feed under pinned header + nav (AppJourney layering) */}
      <motion.div style={{ position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: STRIP_H, y: feedY }}>
        <Image src="/app-shots/journey/home-strip.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
      </motion.div>
      <div style={{ position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: HEADER_H }}>
        <Image src="/app-shots/journey/home-header.jpg" alt="" fill sizes="340px" className="object-cover" />
      </div>
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: SCREEN_W, height: NAV_H }}>
        <Image src="/app-shots/journey/home-nav.jpg" alt="" fill sizes="340px" className="object-cover" />
      </div>
      {/* Night-scene glass: soft top sheen, gentle shadow into the chin */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(168deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 22%, rgba(1,8,30,0.05) 60%, rgba(1,8,30,0.22) 100%)',
        }}
      />
    </div>
  )
}

// ── Signal chip ───────────────────────────────────────────────────────────────

function SignalChip({ signal, style, appear, float }: { signal: Signal; style?: React.CSSProperties; appear?: MotionValue<number>; float: boolean }) {
  return (
    // Positioning wrapper stays static: framer-motion rebuilds `transform`
    // on animated elements, so the centring translate must live one level up.
    <div aria-hidden="true" style={style} className="pointer-events-none">
      <motion.div style={appear ? { opacity: appear, scale: appear } : undefined}>
      <motion.div
        animate={float ? { y: [0, -6, 0] } : undefined}
        transition={float ? { duration: 5.6, repeat: Infinity, ease: 'easeInOut', delay: signal.band[0] * 6 } : undefined}
        className="flex items-start gap-3 rounded-2xl border border-white/14 bg-[#0A1436]/62 px-4 py-3.5 backdrop-blur-md"
        style={{ boxShadow: '0 18px 48px rgba(0,4,20,0.45), inset 0 1px 0 rgba(255,255,255,0.08)' }}
      >
        {signal.tick ? (
          <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#16A34A]/18">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        ) : (
          <span className="mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-[#E20C04] shadow-[0_0_10px_rgba(226,12,4,0.9)] animate-pulse" />
        )}
        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{signal.kicker}</span>
          <span className="block text-[14px] font-bold leading-snug text-white">{signal.title}</span>
          <span className="block text-[12px] leading-snug text-white/55">{signal.sub}</span>
        </span>
      </motion.div>
      </motion.div>
    </div>
  )
}

function DesktopSignal({ signal, m, progress, float }: { signal: Signal; m: StageMetrics; progress: MotionValue<number>; float: boolean }) {
  const appear = useScrollLinked(useTransform(progress, [signal.band[0], signal.band[1]], [0, 1]))
  const left = Math.min(Math.max(m.ox + signal.x * m.s, 140), m.w - 140)
  const top = m.oy + signal.y * m.s
  return <SignalChip signal={signal} appear={appear} float={float} style={{ position: 'absolute', left, top, transform: 'translate(-50%, -50%)', width: 'max-content', maxWidth: 252 }} />
}

// ── Shared copy column ────────────────────────────────────────────────────────

function HeroCopy({ registerUrl }: { registerUrl: string }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/7 px-4 py-2 backdrop-blur-sm"
      >
        <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-[#E20C04]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">For businesses</span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="font-display mb-6 max-w-[820px] leading-[1.06] text-white"
        style={{ fontSize: 'clamp(36px, 5vw, 62px)', letterSpacing: '-0.8px' }}
      >
        Bring in new customers.{' '}
        <span className="gradient-text block">
          Keep your <span className="whitespace-nowrap">margins<BrandStop tone="white" /></span>
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.18 }}
        className="mb-10 max-w-[540px] text-[16px] leading-[1.7] text-white/60 md:text-[17px]"
      >
        List your business on Redeemo for free. No commission. No listing fees. Reach local customers who are already looking for exactly what you offer.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.26 }}
        className="mb-10 flex flex-wrap gap-2.5"
      >
        {['Free to list', 'No commission. Ever.', '12-month contract', 'Digital verification'].map((t) => (
          <span key={t} className="rounded-full border border-white/12 bg-[#010C35]/40 px-3.5 py-1.5 text-[12px] font-semibold text-white/65 backdrop-blur-sm">
            {t}
          </span>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.34 }}>
        <a
          href={registerUrl}
          className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-bold text-white no-underline transition-opacity hover:opacity-90"
          style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 24px rgba(226,12,4,0.38)' }}
        >
          List your business free
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.48 }}
        className="mt-14 grid grid-cols-3 gap-6 border-t border-white/[0.08] pt-8"
      >
        {[
          { value: '£0', label: 'to list your business' },
          { value: '0%', label: 'commission per redemption' },
          { value: '1×', label: 'per customer per membership month' },
        ].map((s, i) => (
          <div key={i}>
            <p className="font-display mb-1 leading-none text-white" style={{ fontSize: '30px', letterSpacing: '-0.5px' }}>
              {s.value}
            </p>
            <p className="text-[11px] font-medium uppercase leading-snug tracking-[0.1em] text-white/38">{s.label}</p>
          </div>
        ))}
      </motion.div>
    </>
  )
}

// ── Scene (image + projected screen + glow), shared desktop/mobile ────────────

function Scene({ m, focalX, feedY, children }: { m: StageMetrics | null; focalX: number; feedY: MotionValue<number> | number; children?: React.ReactNode }) {
  return (
    <>
      <Image
        src="/for-businesses/hero-scene.webp"
        alt="A customer being served at the counter of a small business at night, beside a phone showing the Redeemo app"
        fill
        priority
        sizes="100vw"
        className="object-cover"
        style={{ objectPosition: `${focalX * 100}% 50%` }}
      />
      {m ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: STAGE_W,
            height: STAGE_H,
            transform: `translate(${m.ox}px, ${m.oy}px) scale(${m.s})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Screen light spilling onto the counter */}
          <div
            style={{
              position: 'absolute',
              left: 940,
              top: 800,
              width: 520,
              height: 130,
              background: 'radial-gradient(closest-side, rgba(110,140,255,0.16), transparent 72%)',
            }}
          />
          <PhoneScreen feedY={feedY} />
        </div>
      ) : null}
      {children}
    </>
  )
}

// ── Desktop: pinned scroll chapter ────────────────────────────────────────────

function HeroDesktop({ registerUrl }: { registerUrl: string }) {
  const bandRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: bandRef, offset: ['start start', 'end end'] })
  const m = useStageMetrics(stageRef, 0.68)

  const feedY = useScrollLinked(useTransform(scrollYProgress, [0.04, 0.86], [0, -FEED_TRAVEL]))
  const stageScale = useScrollLinked(useTransform(scrollYProgress, [0, 1], [1, 1.04]))
  const copyOpacity = useScrollLinked(useTransform(scrollYProgress, [0.8, 1], [1, 0.4]))
  const copyY = useScrollLinked(useTransform(scrollYProgress, [0.8, 1], [0, -26]))

  return (
    <section ref={bandRef} className="relative -mt-[80px]" style={{ height: '175svh', background: '#010C35' }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* Stage: photograph + projected live screen, zooming very gently */}
        <motion.div ref={stageRef} className="absolute inset-0" style={{ scale: reduceMotion ? 1 : stageScale, transformOrigin: '50% 42%' }}>
          <Scene m={m} focalX={0.68} feedY={reduceMotion ? 0 : feedY} />
          <HeroEmbers progress={scrollYProgress} />
        </motion.div>

        {/* Scrims: headline zone, navbar, footline */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(1,12,53,0.94) 0%, rgba(1,12,53,0.62) 32%, rgba(1,12,53,0) 58%), linear-gradient(180deg, rgba(1,12,53,0.72) 0%, rgba(1,12,53,0) 150px), linear-gradient(0deg, rgba(1,12,53,0.6) 0%, rgba(1,12,53,0) 170px)',
          }}
        />

        {/* Growth signals, glued to the photograph */}
        {m
          ? SIGNALS.map((sig) => (
              <DesktopSignal key={sig.kicker} signal={sig} m={m} progress={scrollYProgress} float={!reduceMotion} />
            ))
          : null}

        {/* Copy column over the navy left */}
        <motion.div style={{ opacity: reduceMotion ? 1 : copyOpacity, y: reduceMotion ? 0 : copyY }} className="relative mx-auto flex h-full max-w-7xl items-center px-6 lg:px-10">
          <div className="max-w-[600px] pt-[80px]">
            <HeroCopy registerUrl={registerUrl} />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ── Mobile / short: stacked, unpinned ─────────────────────────────────────────

function HeroStacked({ registerUrl }: { registerUrl: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const m = useStageMetrics(stageRef, 0.72)

  return (
    <section className="relative -mt-[80px]" style={{ background: '#010C35' }}>
      <div className="px-6 pb-4 pt-[176px]">
        <div className="mx-auto max-w-[600px]">
          <HeroCopy registerUrl={registerUrl} />
        </div>
      </div>

      <div ref={stageRef} className="relative mt-6 h-[62svh] overflow-hidden">
        <Scene m={m} focalX={0.72} feedY={0} />
        <HeroEmbers />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(1,12,53,1) 0%, rgba(1,12,53,0) 120px), linear-gradient(0deg, rgba(1,12,53,0.85) 0%, rgba(1,12,53,0) 140px)',
          }}
        />
      </div>

      {/* Growth signals as a flowing stack */}
      <div className="relative mx-auto flex w-full max-w-[600px] flex-col gap-3 px-6 pb-14 pt-2" style={{ marginTop: '-56px' }}>
        {SIGNALS.map((sig, i) => (
          <motion.div
            key={sig.kicker}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginLeft: i * 18 }}
          >
            <SignalChip signal={sig} float={false} />
          </motion.div>
        ))}
      </div>
    </section>
  )
}

export function HeroCinematic({ registerUrl }: { registerUrl: string }) {
  // Pinned cinema needs free space right of the phone; below 1024 the crop
  // has none (chips and stats collide with the screen), so tablet stacks.
  const mode = useViewportMode()
  if (mode === 'desktop') return <HeroDesktop registerUrl={registerUrl} />
  return <HeroStacked registerUrl={registerUrl} />
}
