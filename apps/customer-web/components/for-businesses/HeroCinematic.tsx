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
 * Cinematic hero v2 for /for-businesses (owner 2026-07-16): the scene is now
 * LAYERED. The owner-generated night-street photograph (no devices) is the
 * backdrop; a separate alpha-cutout layer holds a laptop and a leaning phone
 * whose screens come alive: the phone scrubs the real app home feed (home ->
 * featured -> trending -> merchant rows) and the laptop plays three merchant
 * portal chapters (scrolling dashboard -> insights -> voucher builder,
 * demo chrome scrubbed) behind pinned sidebar chrome. Five glass growth
 * signals (offer live -> time-limited countdown -> new customer ->
 * redemption confirmed -> repeat visit) tell the funnel story down the right
 * rail. Layering lets mobile compose the cluster independently of the crop.
 *
 * Geometry: photograph = fixed 1672x941 design space. The device layer was
 * generated on the same canvas but placed 1:1 it would cover the two women
 * at the counter, so the cluster (cropped to 1268x763 at canvas offset
 * 204,81) is deliberately seated at 0.6 scale on the foreground counter.
 * Screen quads were measured from the white pixels per component (the phone
 * occludes the laptop's bottom-right corner; its true corner is
 * reconstructed from edge-line intersections). Both matrix3d values are
 * exact homographies solved offline in cluster-local coordinates. Render
 * order laptop-content -> device layer (laptop screen punched transparent)
 * -> phone-content lets the phone body occlude laptop content naturally.
 */

export const STAGE_W = 1672
export const STAGE_H = 941

// Device cluster: cropped cutout layer, native size and desktop placement.
// Owner 2026-07-16: scaled up and moved left (was 850/420/0.6) for presence
// and to clear the right-hand signal rail.
const CLUSTER_W = 1268
const CLUSTER_H = 763
const CLUSTER_DESKTOP = { x: 596, y: 396, s: 0.645 }

// Phone screen: content design space (800 wide, height matches quad aspect)
const PHONE_W = 800
const PHONE_H = 1895
const PHONE_RADIUS = 92
const PHONE_MATRIX =
  'matrix3d(0.222873, -0.012369, 0, -0.000045, -0.074780, 0.254085, 0, -0.000036, 0, 0, 1, 0, 1021.3, 179.6, 0, 1)'

// Phone feed: pinned app header + nav over a scrolling strip (AppJourney assets)
const FEED_HEADER_H = 194
const FEED_NAV_H = 152
const FEED_STRIP_H = 2421
const FEED_TRAVEL = FEED_STRIP_H - PHONE_H // 526 design px of scroll-scrub

// Laptop screen: content design space and homography. Height matches the
// 16:10 portal capture (1728x1084) so the screenshot fills the screen edge
// to edge with no empty strip; the matrix is re-solved for H=1084 (owner
// 2026-07-16: the previous 1261 left cream space at the bottom).
const LAPTOP_W = 1728
const LAPTOP_H = 1084
const LAPTOP_RADIUS = 18
const LAPTOP_MATRIX =
  'matrix3d(0.312366, -0.020379, 0, -0.000066, -0.081212, 0.404274, 0, -0.000043, 0, 0, 1, 0, 448.3, 59.6, 0, 1)'

const PORTAL_BG = '#F8F7F4'
// Content pane of the dashboard (region that scrolls behind fixed chrome),
// in band-cropped 1728x1084 logical px; top calibrated empirically against
// the rendered chrome (toggle-diff), not just derived from the crop maths.
const PANE = { left: 328, top: 79, width: 1386, height: 1005 }
const PANE_STRIP_H = 1761 // stitched dashboard content strip height (logical)

// ── Growth signal cards ───────────────────────────────────────────────────────
// The funnel, in order. Owner 2026-07-16: the chips sit AROUND the devices in
// the scene's own perspective (not a flat right rail), so they read as part of
// the shot. Each has a stage-space anchor (sx, sy in the 1672x941 design
// space, card centre) and shares CARD_TRANSFORM: a yaw/pitch/roll that matches
// the measured device tilt (right side nearer camera, slight pitch, ~7deg
// roll). Anchors are tuned to frame the devices without covering the screens,
// the faces, or the headline.

// Cards share the devices' own viewpoint (owner 2026-07-16): same yaw
// direction as the laptop/phone and their slight downward pitch, no roll
// (roll is what previously read as crooked). One consistent transform for
// every card = one shared 3D space, like the landing hero's vouchers.
const CARD_TRANSFORM = 'perspective(1600px) rotateY(-14deg) rotateX(4deg)'

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

// Owner-specified arrangement (2026-07-16 round 3): two above the laptop,
// one in the L-gap between the laptop screen and the phone, two beside the
// phone. Anchors are card centres in the 1672x941 stage space.
// Anchors shifted with the cluster (owner 2026-07-16: devices nudged up +22
// right, +34 up) so cards stay aligned to the devices.
const SIGNALS: Signal[] = [
  { sx: 1052, sy: 354, kicker: 'Offer live', title: '2 for 1 mains', sub: 'Visible to customers nearby', icon: 'live', band: [0.05, 0.14] },
  { sx: 1316, sy: 334, kicker: 'Time-limited', title: 'Lunch rush · 20% off', sub: '', icon: 'clock', countdown: true, band: [0.18, 0.27] },
  { sx: 1408, sy: 448, kicker: 'New customer', title: 'A customer just found you', sub: 'Browsing nearby · Food & Drink', icon: 'live', band: [0.31, 0.4] },
  { sx: 1502, sy: 586, kicker: 'At the till', title: 'Redemption confirmed', sub: 'Code R7X4 KM2P · logged', icon: 'tick', band: [0.44, 0.53] },
  { sx: 1502, sy: 772, kicker: 'Coming back', title: 'A regular in the making', sub: '3rd visit this month', icon: 'repeat', band: [0.57, 0.66] },
]

const COUNTDOWN_START = 2 * 3600 + 14 * 60 + 33

// ── Stage metrics: replicate object-fit:cover / object-position maths ─────────

export type StageMetrics = { s: number; ox: number; oy: number; w: number; h: number }

export function useStageMetrics(ref: RefObject<HTMLDivElement | null>, focalX: number): StageMetrics | null {
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

// ── Screen contents ───────────────────────────────────────────────────────────

function PhoneScreen({ feedY }: { feedY: MotionValue<number> | number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: PHONE_W,
        height: PHONE_H,
        transform: PHONE_MATRIX,
        transformOrigin: '0 0',
        borderRadius: PHONE_RADIUS,
        overflow: 'hidden',
        background: '#0A1030',
        boxShadow: '0 0 70px rgba(120,150,255,0.22)',
      }}
    >
      <motion.div style={{ position: 'absolute', left: 0, top: 0, width: PHONE_W, height: FEED_STRIP_H, y: feedY }}>
        <Image src="/app-shots/journey/home-strip.jpg" alt="" fill sizes="300px" className="object-cover object-top" />
      </motion.div>
      <div style={{ position: 'absolute', left: 0, top: 0, width: PHONE_W, height: FEED_HEADER_H }}>
        <Image src="/app-shots/journey/home-header.jpg" alt="" fill sizes="300px" className="object-cover" />
      </div>
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: PHONE_W, height: FEED_NAV_H }}>
        <Image src="/app-shots/journey/home-nav.jpg" alt="" fill sizes="300px" className="object-cover" />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(168deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 24%, rgba(1,8,30,0.05) 62%, rgba(1,8,30,0.20) 100%)',
        }}
      />
    </div>
  )
}

// A laptop chapter: the 16:10 portal capture fills the whole screen (the
// design space is sized to the capture, so object-cover crops nothing).
function LaptopChapter({ src, opacity, children }: { src: string; opacity: MotionValue<number> | number; children?: React.ReactNode }) {
  return (
    <motion.div style={{ position: 'absolute', inset: 0, opacity, background: PORTAL_BG }}>
      <Image src={src} alt="" fill sizes="520px" className="object-cover object-top" />
      {children}
    </motion.div>
  )
}

function LaptopScreen({
  stripY,
  dashOp,
  insightOp,
  builderOp,
}: {
  stripY: MotionValue<number> | number
  dashOp: MotionValue<number> | number
  insightOp: MotionValue<number> | number
  builderOp: MotionValue<number> | number
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: LAPTOP_W,
        height: LAPTOP_H,
        transform: LAPTOP_MATRIX,
        transformOrigin: '0 0',
        borderRadius: LAPTOP_RADIUS,
        overflow: 'hidden',
        background: PORTAL_BG,
      }}
    >
      {/* 01 Dashboard: fixed chrome capture + scrolling content pane */}
      <LaptopChapter src="/for-businesses/portal/home-chrome.webp" opacity={dashOp}>
        <div
          style={{
            position: 'absolute',
            left: PANE.left,
            top: PANE.top,
            width: PANE.width,
            height: PANE.height,
            overflow: 'hidden',
            background: PORTAL_BG,
          }}
        >
          <motion.div style={{ position: 'absolute', left: 0, top: 0, width: PANE.width, height: PANE_STRIP_H, y: stripY }}>
            <Image src="/for-businesses/portal/home-content-strip.webp" alt="" fill sizes="480px" className="object-cover object-top" />
          </motion.div>
        </div>
      </LaptopChapter>

      {/* 02 Insights & reports */}
      <LaptopChapter src="/for-businesses/portal/insight.webp" opacity={insightOp} />

      {/* 03 Voucher builder */}
      <LaptopChapter src="/for-businesses/portal/builder.webp" opacity={builderOp} />

      {/* Glass sheen so the panel sits in the night scene */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 30%, rgba(1,8,30,0.05) 70%, rgba(1,8,30,0.14) 100%)',
        }}
      />
    </div>
  )
}

// ── The device cluster: laptop-content under the punched cutout, phone on top ─

function DeviceCluster({
  placement,
  feedY,
  stripY,
  dashOp,
  insightOp,
  builderOp,
}: {
  placement: { x: number; y: number; s: number }
  feedY: MotionValue<number> | number
  stripY: MotionValue<number> | number
  dashOp: MotionValue<number> | number
  insightOp: MotionValue<number> | number
  builderOp: MotionValue<number> | number
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: placement.x,
        top: placement.y,
        width: CLUSTER_W,
        height: CLUSTER_H,
        transform: `scale(${placement.s})`,
        transformOrigin: '0 0',
      }}
    >
      {/* Contact shadows seating the devices on the counter */}
      <div
        style={{
          position: 'absolute',
          left: 130,
          top: 596,
          width: 900,
          height: 130,
          background: 'radial-gradient(closest-side, rgba(0,4,18,0.55), transparent 70%)',
          filter: 'blur(10px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 930,
          top: 660,
          width: 340,
          height: 100,
          background: 'radial-gradient(closest-side, rgba(0,4,18,0.5), transparent 70%)',
          filter: 'blur(8px)',
        }}
      />
      {/* Laptop content renders BEHIND the cutout: the punched screen reveals
          it and the phone body occludes it naturally */}
      <LaptopScreen stripY={stripY} dashOp={dashOp} insightOp={insightOp} builderOp={builderOp} />
      <Image src="/for-businesses/hero-devices.webp" alt="" width={CLUSTER_W} height={CLUSTER_H} className="absolute left-0 top-0" priority />
      <PhoneScreen feedY={feedY} />
    </div>
  )
}

// ── Signal chips ──────────────────────────────────────────────────────────────

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
  // Compact, human format (owner 2026-07-16): "2h 14m 33s"
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

function SignalIcon({ icon }: { icon: Signal['icon'] }) {
  if (icon === 'tick') {
    return (
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#16A34A]/18">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    )
  }
  if (icon === 'clock') {
    return (
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#E20C04]/16">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF6B5E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
      </span>
    )
  }
  if (icon === 'repeat') {
    return (
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#D97706]/18">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      </span>
    )
  }
  return <span className="mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-[#E20C04] shadow-[0_0_10px_rgba(226,12,4,0.9)] animate-pulse" />
}

function CountdownPill() {
  const countdown = useCountdown(true)
  return (
    <span
      className="mt-1.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E20C04]/35 bg-[#E20C04]/16 px-2.5 py-1"
      style={{ boxShadow: 'inset 0 0 0 1px rgba(226,12,4,0.08)' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55">Ends in</span>
      <span className="text-[13px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {countdown}
      </span>
    </span>
  )
}

// The card body (used flat on mobile, perspective-tilted on desktop).
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

// Desktop: one card, anchored in stage space and tilted into the scene's
// perspective. Static wrappers carry the centring + tilt (framer rewrites the
// transform on animated nodes), the motion node only fades it in.
function DesktopSignal({ signal, m, progress, float }: { signal: Signal; m: StageMetrics; progress: MotionValue<number>; float: boolean }) {
  const appear = useScrollLinked(useTransform(progress, [signal.band[0], signal.band[1]], [0, 1]))
  const left = m.ox + signal.sx * m.s
  const top = m.oy + signal.sy * m.s
  return (
    <div className="pointer-events-none absolute z-10" style={{ left, top, width: 224 }}>
      <div style={{ transform: 'translate(-50%, -50%)' }}>
        <div style={{ transform: CARD_TRANSFORM, transformOrigin: '50% 50%' }}>
          <motion.div style={{ opacity: appear }}>
            <SignalChip signal={signal} float={float} />
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function DesktopSignalLayer({ m, progress, float }: { m: StageMetrics; progress: MotionValue<number>; float: boolean }) {
  return (
    <>
      {SIGNALS.map((sig) => (
        <DesktopSignal key={sig.kicker} signal={sig} m={m} progress={progress} float={float} />
      ))}
    </>
  )
}

// ── Shared copy column (approved copy; unchanged) ─────────────────────────────

function HeroCopy({ registerUrl }: { registerUrl: string }) {
  return (
    <>
      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="font-display mb-5 leading-[1.08] text-white"
        style={{ fontSize: 'clamp(32px, 4.2vw, 46px)', letterSpacing: '-0.6px' }}
      >
        {/* Two lines exactly (owner 2026-07-16); pb on the gradient line so the
            y/g descenders are not clipped by background-clip:text */}
        <span className="block">Bring in new customers.</span>
        <span className="gradient-text block pb-[0.14em] leading-[1.14]">
          Keep your <span className="whitespace-nowrap">margins<BrandStop tone="white" /></span>
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.18 }}
        className="mb-9 max-w-[500px] text-[15.5px] leading-[1.62] text-white/60 md:text-[16px]"
      >
        Redeemo is a digital voucher platform that helps local customers discover your business. Create your own vouchers, set the terms and give new customers a reason to visit.
      </motion.p>

      {/* CTA + trust line */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.26 }} className="mb-10">
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

      {/* Proof strip: three no-cost points + the built-in redemption limit */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mb-9 max-w-[470px] border-t border-white/[0.08] pt-7"
      >
        <div className="grid grid-cols-3 gap-5">
          {[
            { value: '£0', label: 'Listing fee' },
            { value: '0%', label: 'Commission' },
            { value: '£0', label: 'Redemption fee' },
          ].map((s, i) => (
            <div key={i}>
              <p className="font-display mb-1 leading-none text-white" style={{ fontSize: '28px', letterSpacing: '-0.5px' }}>{s.value}</p>
              <p className="text-[11px] font-medium uppercase leading-snug tracking-[0.08em] text-white/38">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] leading-relaxed text-white/50">
          <span className="font-semibold text-white/80">One redemption</span> per voucher, per customer, per monthly cycle
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="grid max-w-[470px] grid-cols-2 gap-x-8 gap-y-3.5"
      >
        {['Merchant portal included', 'Verified redemptions', 'Built-in voucher limits', 'No hidden platform fees'].map((t) => (
          <span key={t} className="flex items-center gap-2.5 text-[13px] font-medium text-white/60">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#E20C04]/80" />
            {t}
          </span>
        ))}
      </motion.div>
    </>
  )
}

// ── Scene: background photograph + aligned overlay canvas ─────────────────────

function Scene({
  m,
  focalX,
  cluster,
  feedY,
  stripY,
  dashOp,
  insightOp,
  builderOp,
}: {
  m: StageMetrics | null
  focalX: number
  cluster: { x: number; y: number; s: number }
  feedY: MotionValue<number> | number
  stripY: MotionValue<number> | number
  dashOp: MotionValue<number> | number
  insightOp: MotionValue<number> | number
  builderOp: MotionValue<number> | number
}) {
  return (
    <>
      <Image
        src="/for-businesses/hero-bg.webp"
        alt="A customer being served at the counter of a small business at night, beside a laptop showing the Redeemo merchant portal and a phone showing the Redeemo app"
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
          {/* Screen light spilling onto the counter beneath the cluster */}
          <div
            style={{
              position: 'absolute',
              left: cluster.x + 30 * cluster.s,
              top: cluster.y + CLUSTER_H * cluster.s - 40,
              width: CLUSTER_W * cluster.s * 0.95,
              height: 110,
              background: 'radial-gradient(closest-side, rgba(130,155,255,0.15), transparent 72%)',
            }}
          />
          <DeviceCluster placement={cluster} feedY={feedY} stripY={stripY} dashOp={dashOp} insightOp={insightOp} builderOp={builderOp} />
        </div>
      ) : null}
    </>
  )
}

// ── Desktop: pinned scroll stage ──────────────────────────────────────────────
// HeroStage renders the CONTENTS of the pinned viewport and takes its scroll
// progress as a prop, so it can be hosted either by the standalone HeroDesktop
// band below, or re-hosted (unchanged) as the opening slice of the combined
// for-businesses cinema band, where Section 2's journey continues the shot.
// `seamless` is set by the combined band: the copy column and growth cards
// fade fully OUT by the end of the hero slice so the device turn that follows
// starts from a clean frame; standalone keeps the approved 0.4 resting fade.

export function HeroStage({
  registerUrl,
  progress,
  seamless = false,
  embersOn = true,
}: {
  registerUrl: string
  progress: MotionValue<number>
  seamless?: boolean
  embersOn?: boolean
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const m = useStageMetrics(stageRef, 0.68)

  const feedY = useScrollLinked(useTransform(progress, [0.04, 0.86], [0, -FEED_TRAVEL]))
  const stripY = useScrollLinked(useTransform(progress, [0.04, 0.4], [0, -(PANE_STRIP_H - PANE.height)]))
  const dashOp = useScrollLinked(useTransform(progress, [0.42, 0.5], [1, 0]))
  const insightOp = useScrollLinked(useTransform(progress, [0.42, 0.5, 0.64, 0.72], [0, 1, 1, 0]))
  const builderOp = useScrollLinked(useTransform(progress, [0.64, 0.72], [0, 1]))
  const stageScale = useScrollLinked(useTransform(progress, [0, 1], [1, 1.04]))
  const copyOpacity = useScrollLinked(useTransform(progress, [0.8, 1], [1, seamless ? 0 : 0.4]))
  const copyY = useScrollLinked(useTransform(progress, [0.8, 1], [0, -26]))
  const signalsOpacity = useScrollLinked(useTransform(progress, [0.86, 1], [1, seamless ? 0 : 1]))

  return (
    <>
      <motion.div ref={stageRef} className="absolute inset-0" style={{ scale: reduceMotion ? 1 : stageScale, transformOrigin: '50% 42%' }}>
        <Scene
          m={m}
          focalX={0.68}
          cluster={CLUSTER_DESKTOP}
          feedY={reduceMotion ? 0 : feedY}
          stripY={reduceMotion ? 0 : stripY}
          dashOp={reduceMotion ? 1 : dashOp}
          insightOp={reduceMotion ? 0 : insightOp}
          builderOp={reduceMotion ? 0 : builderOp}
        />
        {embersOn ? <HeroEmbers progress={progress} /> : null}
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

      {/* Growth signals: perspective-tilted cards framing the devices */}
      <motion.div className="pointer-events-none absolute inset-0" style={{ opacity: signalsOpacity }}>
        {m ? <DesktopSignalLayer m={m} progress={progress} float={!reduceMotion} /> : null}
      </motion.div>

      <motion.div style={{ opacity: reduceMotion ? 1 : copyOpacity, y: reduceMotion ? 0 : copyY }} className="relative mx-auto flex h-full max-w-7xl items-center px-6 lg:px-10">
        <div className="max-w-[540px] pt-[56px]">
          <HeroCopy registerUrl={registerUrl} />
        </div>
      </motion.div>
    </>
  )
}

function HeroDesktop({ registerUrl }: { registerUrl: string }) {
  const bandRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: bandRef, offset: ['start start', 'end end'] })

  return (
    <section ref={bandRef} className="relative -mt-[80px]" style={{ height: '175svh', background: '#010C35' }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <HeroStage registerUrl={registerUrl} progress={scrollYProgress} />
      </div>
    </section>
  )
}

// ── Mobile / tablet: stacked, unpinned ────────────────────────────────────────

export function HeroStacked({ registerUrl }: { registerUrl: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const m = useStageMetrics(stageRef, 0.58)

  // Compose the cluster inside the VISIBLE window of the cover-cropped
  // photograph: near-full width, seated toward the bottom of the band.
  let cluster = CLUSTER_DESKTOP
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
        <Scene m={m} focalX={0.58} cluster={cluster} feedY={0} stripY={0} dashOp={1} insightOp={0} builderOp={0} />
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

      {/* Growth signals as an aligned stack (no diagonal stagger) */}
      <div className="relative mx-auto flex w-full max-w-[440px] flex-col gap-3 px-6 pb-14 pt-2" style={{ marginTop: '-56px' }}>
        {SIGNALS.map((sig, i) => (
          <motion.div
            key={sig.kicker}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden="true"
          >
            <SignalChip signal={sig} float={false} />
          </motion.div>
        ))}
      </div>
    </section>
  )
}

export function HeroCinematic({ registerUrl }: { registerUrl: string }) {
  // Pinned cinema needs free space right of the devices; below 1024 the crop
  // has none (chips and stats collide with the screens), so tablet stacks.
  const mode = useViewportMode()
  if (mode === 'desktop') return <HeroDesktop registerUrl={registerUrl} />
  return <HeroStacked registerUrl={registerUrl} />
}
