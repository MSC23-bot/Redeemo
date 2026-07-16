'use client'

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { useViewportMode } from '@/components/landing/useViewportMode'
import { useScrollLinked } from '@/components/landing/scroll'
import { BrandStop } from '@/components/ui/BrandStop'
import {
  HeroCinematic,
  HeroStage,
  useStageMetrics,
  DeviceCluster,
  CLUSTER_DESKTOP,
  FEED_TRAVEL,
  PANE,
  PANE_STRIP_H,
  STAGE_W,
  STAGE_H,
} from './HeroCinematic'

/**
 * Section 2: "How Redeemo works" journey cinema (owner handoff 2026-07-16).
 *
 * The hero and the journey share ONE pinned band: a continuous device move
 * (hero's angled cluster travels centre-ward and turns to face the viewer)
 * is impossible across two separate sticky sections, so ForBusinessesCinema
 * owns the band and re-hosts the approved HeroStage unchanged as its first
 * slice. As the hero copy and growth cards finish fading, the cafe plate
 * dissolves into the dark local-map plate beneath, the angled cluster
 * crossfades into a front-facing cluster (rotateY handoff on both sides),
 * and four locked beats walk voucher -> discovery -> visit -> validation on
 * the real product screens. Five locked status annotations accumulate as a
 * live-HTML rail; the section ends on the validation-success state and the
 * locked closing line. No CTA in Section 2.
 *
 * Non-desktop, short and reduced-motion viewers get JourneyStacked: four
 * readable scenes (one device state + beat copy + status chips each) with
 * every piece of locked copy present. SSR default is the stacked layout.
 */

// ── Timeline (svh of scroll) ──────────────────────────────────────────────────

const HERO_SCROLL = 75 // matches the approved standalone hero band (175 - 100)
const ARRIVE = 90
const BEAT = 85
const CLOSE = 70
const JOURNEY_SCROLL = ARRIVE + BEAT * 4 + CLOSE // 500
const TOTAL_SCROLL = HERO_SCROLL + JOURNEY_SCROLL // 575
const F_HERO = HERO_SCROLL / TOTAL_SCROLL

// Journey-local fraction helper: svh into [0..1] of the journey slice.
const jf = (svh: number) => svh / JOURNEY_SCROLL

const BEAT_START = [0, 1, 2, 3].map((i) => jf(ARRIVE + i * BEAT)) // 0.18 0.35 0.52 0.69
const CLOSE_START = jf(ARRIVE + BEAT * 4) // 0.86
const FADE = jf(10) // standard crossfade slice (0.02)

// ── Front cluster geometry (calibrated from measured screen quads) ───────────
// The front-facing cutout is cropped to its bbox (268,86 of the 1672x941
// plate); screen rects are bbox-local. Laptop white quad measured at
// (127,26)-(990,572) with near-sharp corners (its bottom-right is occluded by
// the phone body, which the raster handles naturally); phone white quad at
// (937,181)-(1144,682), radius ~24. Content rects OVERDRAW the quads by 2px
// so misregistration can never show a white sliver; the punched laptop hole
// was dilated 2px to match.

const J_BOX = { w: 1165, h: 731 }
const J_PLACE = { x: 690, y: 255, s: 0.6 } // stage-space placement, QA-tuned
const J_LAPTOP = { left: 124, top: 23, width: 869, height: 553, radius: 6 }
const J_PHONE = { left: 935, top: 179, width: 211, height: 505, radius: 26 }

const PORTAL_BG = '#F8F7F4'

// Where the angled cluster travels to before handing off to the front cluster:
// its centre eases toward the front cluster's centre while it turns.
const FRONT_CX = J_PLACE.x + (J_BOX.w * J_PLACE.s) / 2
const FRONT_CY = J_PLACE.y + (J_BOX.h * J_PLACE.s) / 2
const ANGLED_END_S = 0.66 // angled replica's scale as it hands off, centred on the front cluster

// Pins baked into the map plate that stay visible around the devices; a soft
// pulse over each during the discovery beat (restrained: CSS only, no WebGL).
const PULSE_PINS = [
  { x: 322, y: 652 },
  { x: 283, y: 828 },
  { x: 1104, y: 899 },
]

// Left-region scrim, identical to the hero's so the crossfade is invisible.
const SCRIM =
  'linear-gradient(90deg, rgba(1,12,53,0.94) 0%, rgba(1,12,53,0.62) 32%, rgba(1,12,53,0) 58%), linear-gradient(180deg, rgba(1,12,53,0.72) 0%, rgba(1,12,53,0) 150px), linear-gradient(0deg, rgba(1,12,53,0.6) 0%, rgba(1,12,53,0) 170px)'

// ── Locked copy (owner handoff 2026-07-16; do not rewrite) ────────────────────

const EYEBROW = 'HOW REDEEMO WORKS'
const HEADLINE = 'See how a voucher becomes a visit.'
const INTRO =
  'You create the voucher. Redeemo helps local customers discover it, choose your business and use it when they visit. Every confirmed redemption is recorded in your merchant portal.'
const CLOSING = 'From voucher created to redemption confirmed. One clear journey'

type Beat = { label: string; headline: string; body: string }

const BEATS: Beat[] = [
  {
    label: '01',
    headline: 'Create a reason to visit.',
    body: 'Choose the voucher type, set its value and add your terms. The guided builder shows you how it will look to customers before you submit it.',
  },
  {
    label: '02',
    headline: 'Appear when customers are choosing.',
    body: 'Your business and live vouchers appear as local customers browse Redeemo by category, location and what is nearby.',
  },
  {
    label: '03',
    headline: 'Turn interest into a visit.',
    body: 'A customer chooses your voucher, visits your business and presents their Redeemo code when they are ready to use it.',
  },
  {
    label: '04',
    headline: 'Confirm it in seconds.',
    body: 'Your team checks the code in the merchant portal. The redemption is confirmed and recorded against the voucher and branch.',
  },
]

type Status = {
  num: string
  kicker: string
  title: string
  kind: 'red' | 'amber' | 'green'
  at: number // journey progress where it appears
  sx: number // stage-space anchor (card centre)
  sy: number
}

// Anchors: three across the top of the devices, two down the right edge
// (the 16:10 cover-crop hides stage x beyond ~1619, so the right column
// stays inside that; QA-tuned).
const STATUSES: Status[] = [
  { num: '01', kicker: 'Voucher ready', title: 'Terms set. Ready to submit.', kind: 'red', at: 0.24, sx: 830, sy: 132 },
  { num: '02', kicker: 'Offer live', title: 'Visible on Redeemo.', kind: 'red', at: 0.36, sx: 1110, sy: 132 },
  { num: '03', kicker: 'Found nearby', title: 'A customer is viewing your voucher.', kind: 'amber', at: 0.45, sx: 1390, sy: 132 },
  { num: '04', kicker: 'At the till', title: 'Code ready to validate.', kind: 'red', at: 0.62, sx: 1500, sy: 320 },
  { num: '05', kicker: 'Redemption confirmed', title: 'Voucher and branch recorded.', kind: 'green', at: 0.775, sx: 1500, sy: 505 },
]

// ── Status cards (live HTML) ──────────────────────────────────────────────────

function StatusDot({ kind }: { kind: Status['kind'] }) {
  if (kind === 'green') {
    return (
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#16A34A]/20">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    )
  }
  const c = kind === 'amber' ? '#FBBF24' : '#FF4B3E'
  const glow = kind === 'amber' ? 'rgba(251,191,36,0.8)' : 'rgba(226,12,4,0.9)'
  return (
    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center">
      <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: c, boxShadow: `0 0 10px ${glow}` }} />
    </span>
  )
}

function StatusCard({ status }: { status: Status }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 backdrop-blur-md ${
        status.kind === 'green' ? 'border-[#4ADE80]/30 bg-[#071426]/80' : 'border-white/14 bg-[#081130]/78'
      }`}
      style={{ boxShadow: '0 24px 60px rgba(0,4,20,0.55), inset 0 1px 0 rgba(255,255,255,0.08)' }}
    >
      <StatusDot kind={status.kind} />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{status.kicker}</span>
        <span className="block text-[13.5px] font-bold leading-snug text-white">{status.title}</span>
      </span>
      <span className="text-[10px] font-semibold tracking-[0.1em] text-white/25">{status.num}</span>
    </div>
  )
}

// Desktop: appears at its journey moment, then rests dimmed once the next
// status takes over. Flat (no tilt): the camera is now front-on, and the
// cards keep the scene's perspective coherent by matching it.
function DesktopStatus({ status, next, m, jp }: { status: Status; next: number | null; m: { s: number; ox: number; oy: number }; jp: MotionValue<number> }) {
  const opacity = useScrollLinked(
    useTransform(jp, next === null ? [status.at, status.at + 0.025] : [status.at, status.at + 0.025, next, next + 0.025], next === null ? [0, 1] : [0, 1, 1, 0.55]),
  )
  const y = useScrollLinked(useTransform(jp, [status.at, status.at + 0.03], [16, 0]))
  return (
    <div className="pointer-events-none absolute z-10" style={{ left: m.ox + status.sx * m.s, top: m.oy + status.sy * m.s, width: 240 }}>
      <div style={{ transform: 'translate(-50%, -50%)' }}>
        <motion.div style={{ opacity, y }}>
          <StatusCard status={status} />
        </motion.div>
      </div>
    </div>
  )
}

// ── Front-facing device cluster: laptop content under the punched cutout ─────

function ChapterImage({
  src,
  opacity,
  eager = false,
  sizes = '640px',
}: {
  src: string
  opacity: MotionValue<number> | number
  eager?: boolean
  sizes?: string
}) {
  return (
    <motion.div style={{ position: 'absolute', inset: 0, opacity, background: PORTAL_BG }}>
      <Image src={src} alt="" fill sizes={sizes} className="object-cover object-top" loading={eager ? 'eager' : undefined} />
    </motion.div>
  )
}

function FrontDeviceCluster({ jp, armed }: { jp: MotionValue<number>; armed: boolean }) {
  const [s2, s3, s4] = [BEAT_START[1], BEAT_START[2], BEAT_START[3]]
  const confirmAt = s4 + jf(38)

  // Laptop chapters: builder through beats 1-3, then validate -> validated.
  const builderOp = useScrollLinked(useTransform(jp, [s4, s4 + FADE], [1, 0]))
  const validateOp = useScrollLinked(useTransform(jp, [s4, s4 + FADE, confirmAt, confirmAt + FADE], [0, 1, 1, 0]))
  const validatedOp = useScrollLinked(useTransform(jp, [confirmAt, confirmAt + FADE], [0, 1]))

  // Phone chapters: preview -> discovery home -> code -> customer success.
  const previewOp = useScrollLinked(useTransform(jp, [s2, s2 + FADE], [1, 0]))
  const homeOp = useScrollLinked(useTransform(jp, [s2, s2 + FADE, s3, s3 + FADE], [0, 1, 1, 0]))
  const codeOp = useScrollLinked(useTransform(jp, [s3, s3 + FADE, confirmAt, confirmAt + FADE], [0, 1, 1, 0]))
  const successOp = useScrollLinked(useTransform(jp, [confirmAt, confirmAt + FADE], [0, 1]))

  // Focus: the inactive device rests behind a light navy veil.
  const laptopVeil = useScrollLinked(useTransform(jp, [s2, s2 + FADE, s4, s4 + FADE], [0, 0.42, 0.42, 0]))
  const phoneVeil = useScrollLinked(useTransform(jp, [s4, s4 + FADE], [0, 0.3]))

  return (
    <div aria-hidden="true" style={{ position: 'relative', width: J_BOX.w, height: J_BOX.h }}>
      {/* Contact shadow + the plate's warm rim light under the devices */}
      <div
        style={{
          position: 'absolute',
          left: J_BOX.w * 0.06,
          top: J_BOX.h - 54,
          width: J_BOX.w * 0.88,
          height: 110,
          background: 'radial-gradient(closest-side, rgba(0,3,14,0.62), transparent 72%)',
          filter: 'blur(12px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: J_BOX.w * 0.18,
          top: J_BOX.h - 30,
          width: J_BOX.w * 0.64,
          height: 46,
          background: 'radial-gradient(closest-side, rgba(226,60,20,0.16), transparent 75%)',
          filter: 'blur(10px)',
        }}
      />

      {/* Laptop content renders BEHIND the cutout (screen punched to alpha) */}
      <div
        style={{
          position: 'absolute',
          left: J_LAPTOP.left,
          top: J_LAPTOP.top,
          width: J_LAPTOP.width,
          height: J_LAPTOP.height,
          borderRadius: J_LAPTOP.radius,
          overflow: 'hidden',
          background: PORTAL_BG,
        }}
      >
        <ChapterImage src="/for-businesses/journey/journey-builder.webp" opacity={builderOp} eager />
        {armed ? <ChapterImage src="/for-businesses/journey/journey-validate.webp" opacity={validateOp} /> : null}
        {armed ? <ChapterImage src="/for-businesses/journey/journey-validated.webp" opacity={validatedOp} /> : null}
        <motion.div style={{ position: 'absolute', inset: 0, background: '#010C35', opacity: laptopVeil }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(170deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.01) 30%, rgba(1,8,30,0.04) 70%, rgba(1,8,30,0.1) 100%)',
          }}
        />
      </div>

      <Image
        src="/for-businesses/journey/journey-devices.webp"
        alt=""
        width={J_BOX.w}
        height={J_BOX.h}
        className="absolute left-0 top-0"
        style={{ width: J_BOX.w, height: J_BOX.h }}
        priority
      />

      {/* Phone content sits on top, clipped to the screen */}
      <div
        style={{
          position: 'absolute',
          left: J_PHONE.left,
          top: J_PHONE.top,
          width: J_PHONE.width,
          height: J_PHONE.height,
          borderRadius: J_PHONE.radius,
          overflow: 'hidden',
          background: '#0A1030',
        }}
      >
        <ChapterImage src="/for-businesses/journey/journey-phone-preview.webp" opacity={previewOp} eager sizes="220px" />
        {armed ? <ChapterImage src="/for-businesses/journey/journey-phone-home.webp" opacity={homeOp} sizes="220px" /> : null}
        {armed ? <ChapterImage src="/for-businesses/journey/journey-phone-code.webp" opacity={codeOp} sizes="220px" /> : null}
        {armed ? <ChapterImage src="/for-businesses/journey/journey-phone-success.webp" opacity={successOp} sizes="220px" /> : null}
        <motion.div style={{ position: 'absolute', inset: 0, background: '#010C35', opacity: phoneVeil }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(172deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.01) 26%, rgba(1,8,30,0.05) 64%, rgba(1,8,30,0.14) 100%)',
          }}
        />
      </div>
    </div>
  )
}

// ── Copy column: header, beats (crossfading in a fixed slot), closing ─────────

function BeatBlock({ beat }: { beat: Beat }) {
  return (
    <div>
      <span className="font-display block text-[14px] tracking-[0.28em] text-white/30">{beat.label}</span>
      <h3 className="font-display mt-3 text-[24px] leading-[1.18] text-white" style={{ letterSpacing: '-0.3px' }}>
        {beat.headline}
      </h3>
      <p className="mt-3 max-w-[420px] text-[15px] leading-[1.65] text-white/60">{beat.body}</p>
    </div>
  )
}

function JourneyCopyColumn({ jp }: { jp: MotionValue<number> }) {
  const headerOp = useScrollLinked(useTransform(jp, [jf(32), jf(46)], [0, 1]))
  const headerY = useScrollLinked(useTransform(jp, [jf(32), jf(46)], [22, 0]))

  const beatOps = BEATS.map((_, i) => {
    const s = BEAT_START[i]
    const e = i < 3 ? BEAT_START[i + 1] : CLOSE_START
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useScrollLinked(useTransform(jp, [s, s + jf(12), e - jf(6), e], [0, 1, 1, 0]))
  })
  const closeOp = useScrollLinked(useTransform(jp, [CLOSE_START + jf(14), CLOSE_START + jf(30)], [0, 1]))
  const closeY = useScrollLinked(useTransform(jp, [CLOSE_START + jf(14), CLOSE_START + jf(30)], [18, 0]))

  return (
    <div className="relative mx-auto flex h-full max-w-7xl items-center px-6 lg:px-10">
      <motion.div style={{ opacity: headerOp, y: headerY }} className="max-w-[470px] pt-[56px]">
        <p className="mb-4 flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.22em] text-white/45">
          <span className="h-[2px] w-6 bg-[#E20C04]" aria-hidden="true" />
          {EYEBROW}
        </p>
        <h2 className="font-display mb-4 leading-[1.12] text-white" style={{ fontSize: 'clamp(28px, 2.9vw, 38px)', letterSpacing: '-0.5px' }}>
          {HEADLINE}
        </h2>
        <p className="mb-9 max-w-[440px] text-[15px] leading-[1.62] text-white/55">{INTRO}</p>

        {/* Beat slot: blocks crossfade in place; all four stay in the DOM in
            reading order. The closing statement lands in the same slot. */}
        <div className="relative h-[230px]">
          {BEATS.map((beat, i) => (
            <motion.div key={beat.label} style={{ opacity: beatOps[i] }} className="absolute inset-0">
              <BeatBlock beat={beat} />
            </motion.div>
          ))}
          <motion.div style={{ opacity: closeOp, y: closeY }} className="absolute inset-0 flex items-start">
            <p className="font-display max-w-[430px] text-[26px] leading-[1.3] text-white" style={{ letterSpacing: '-0.4px' }}>
              {CLOSING}
              <BrandStop tone="white" />
            </p>
          </motion.div>
        </div>

        {/* Beat progress ticks */}
        <div aria-hidden="true" className="mt-2 flex items-center gap-2">
          {BEATS.map((beat, i) => {
            const s = BEAT_START[i]
            const e = i < 3 ? BEAT_START[i + 1] : CLOSE_START
            return <BeatTick key={beat.label} jp={jp} from={s} to={e} />
          })}
        </div>
      </motion.div>
    </div>
  )
}

function BeatTick({ jp, from, to }: { jp: MotionValue<number>; from: number; to: number }) {
  const active = useScrollLinked(useTransform(jp, [from, from + 0.015, to, to + 0.015], [0, 1, 1, 0]))
  return (
    <span className="relative h-[3px] w-7 overflow-hidden rounded-full bg-white/12">
      <motion.span className="absolute inset-0 rounded-full" style={{ opacity: active, background: 'var(--brand-gradient)' }} />
    </span>
  )
}

// ── The combined pinned band ──────────────────────────────────────────────────

function CinemaBand({ registerUrl }: { registerUrl: string }) {
  const bandRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress: p } = useScroll({ target: bandRef, offset: ['start start', 'end end'] })
  const m = useStageMetrics(stageRef, 0.68)

  const heroP = useTransform(p, [0, F_HERO], [0, 1])
  const jp = useTransform(p, [F_HERO, 1], [0, 1])

  // The hero scene dissolves into the map plate FIRST (the journey's angled
  // replica sits glued over the hero cluster during the fade); only once the
  // hero is gone does the replica travel and turn. Sequencing the two avoids
  // a double image of the devices mid-dissolve.
  const heroOpacity = useScrollLinked(useTransform(jp, [jf(2), jf(14)], [1, 0]))
  const [heroGone, setHeroGone] = useState(false)
  useMotionValueEvent(jp, 'change', (v) => setHeroGone(v > jf(15)))

  // Mount later journey chapters once the visitor starts moving (keeps them
  // out of the first-paint payload; they load ~70svh before they are seen).
  const [armed, setArmed] = useState(false)
  useMotionValueEvent(p, 'change', (v) => {
    if (v > 0.03) setArmed(true)
  })

  // Camera settle: the hero hands over at its 1.04 end scale; the journey
  // stage starts there and eases back to 1 as the devices turn.
  const settle = useScrollLinked(useTransform(jp, [0, jf(42)], [1.04, 1]))

  // Angled cluster travel: from the hero placement toward the front cluster's
  // centre, turning as it goes, then handing off to the front-facing cutout.
  const angledX = useScrollLinked(useTransform(jp, [jf(14), jf(36)], [CLUSTER_DESKTOP.x, FRONT_CX - (1268 * ANGLED_END_S) / 2]))
  const angledY = useScrollLinked(useTransform(jp, [jf(14), jf(36)], [CLUSTER_DESKTOP.y, FRONT_CY - (763 * ANGLED_END_S) / 2]))
  const angledS = useScrollLinked(useTransform(jp, [jf(14), jf(36)], [CLUSTER_DESKTOP.s, ANGLED_END_S]))
  const angledRot = useScrollLinked(useTransform(jp, [jf(14), jf(36)], [0, 13]))
  const angledOp = useScrollLinked(useTransform(jp, [jf(30), jf(40)], [1, 0]))

  const frontX = useScrollLinked(useTransform(jp, [jf(22), jf(46)], [J_PLACE.x + 26, J_PLACE.x]))
  const frontY = useScrollLinked(useTransform(jp, [jf(22), jf(46)], [J_PLACE.y + 40, J_PLACE.y]))
  const frontS = useScrollLinked(useTransform(jp, [jf(22), jf(46)], [J_PLACE.s * 0.94, J_PLACE.s]))
  const frontRot = useScrollLinked(useTransform(jp, [jf(22), jf(46)], [-11, 0]))
  const frontOp = useScrollLinked(useTransform(jp, [jf(30), jf(40)], [0, 1]))

  // Journey scrim + map pin pulses (pulses live during the discovery beat)
  const journeyScrim = useScrollLinked(useTransform(jp, [0, jf(14)], [0, 1]))
  const pulseOp = useScrollLinked(useTransform(jp, [BEAT_START[1], BEAT_START[1] + jf(8), BEAT_START[2], BEAT_START[2] + jf(8)], [0, 1, 1, 0]))

  return (
    <section ref={bandRef} className="relative -mt-[80px]" style={{ height: `${TOTAL_SCROLL + 100}svh`, background: '#010C35' }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* ── Journey backdrop: the map plate, revealed as the hero dissolves ── */}
        <motion.div ref={stageRef} aria-hidden="true" className="absolute inset-0" style={{ scale: settle, transformOrigin: '50% 42%' }}>
          <Image
            src="/for-businesses/journey/journey-map-bg.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: '68% 50%' }}
          />
          {m ? (
            <motion.div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: STAGE_W,
                height: STAGE_H,
                transform: `translate(${m.ox}px, ${m.oy}px) scale(${m.s})`,
                transformOrigin: '0 0',
                opacity: pulseOp,
              }}
            >
              {PULSE_PINS.map((pin) => (
                <span key={`${pin.x}-${pin.y}`} className="absolute block h-9 w-9" style={{ left: pin.x - 18, top: pin.y - 18 }}>
                  <span className="absolute inset-0 rounded-full bg-[#E20C04]/25 animate-ping" style={{ animationDuration: '2.6s' }} />
                  <span className="absolute inset-[14px] rounded-full bg-[#FF5A47]" style={{ boxShadow: '0 0 12px rgba(226,12,4,0.85)' }} />
                </span>
              ))}
            </motion.div>
          ) : null}
        </motion.div>

        {/* ── The approved hero, re-hosted unchanged; fades into the journey ── */}
        <motion.div className="absolute inset-0" style={{ opacity: heroOpacity, visibility: heroGone ? 'hidden' : 'visible' }}>
          <HeroStage registerUrl={registerUrl} progress={heroP} seamless embersOn={!heroGone} />
        </motion.div>

        {/* ── Journey scrim (identical gradient to the hero's) ── */}
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: SCRIM, opacity: journeyScrim }} />

        {/* ── Device clusters: angled replica hands off to the front cutout ── */}
        <motion.div aria-hidden="true" className="absolute inset-0" style={{ scale: settle, transformOrigin: '50% 42%' }}>
          {m ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: STAGE_W,
                height: STAGE_H,
                transform: `translate(${m.ox}px, ${m.oy}px) scale(${m.s})`,
                transformOrigin: '0 0',
                perspective: 1400,
              }}
            >
              {/* Angled cluster at the hero's exact end state (builder up,
                  feed at rest); mounts over the hero's own cluster so the
                  takeover is invisible, then travels and turns. */}
              <motion.div
                style={{ position: 'absolute', left: 0, top: 0, x: angledX, y: angledY, scale: angledS, rotateY: angledRot, opacity: angledOp, transformOrigin: '0 0' }}
              >
                <div style={{ position: 'relative', width: 1268, height: 763 }}>
                  <DeviceCluster placement={{ x: 0, y: 0, s: 1 }} feedY={-FEED_TRAVEL} stripY={-(PANE_STRIP_H - PANE.height)} dashOp={0} insightOp={0} builderOp={1} />
                </div>
              </motion.div>

              {/* Front-facing cluster settles in as the turn completes */}
              <motion.div
                style={{ position: 'absolute', left: 0, top: 0, x: frontX, y: frontY, scale: frontS, rotateY: frontRot, opacity: frontOp, transformOrigin: '0 0' }}
              >
                <FrontDeviceCluster jp={jp} armed={armed} />
              </motion.div>
            </div>
          ) : null}
        </motion.div>

        {/* ── Status rail (decorative; the beats carry the story for AT) ── */}
        <div aria-hidden="true">
          {m
            ? STATUSES.map((status, i) => (
                <DesktopStatus key={status.num} status={status} next={i < STATUSES.length - 1 ? STATUSES[i + 1].at : null} m={m} jp={jp} />
              ))
            : null}
        </div>

        {/* ── Copy column ── */}
        <JourneyCopyColumn jp={jp} />
      </div>
    </section>
  )
}

// ── Stacked journey: mobile / tablet / short / reduced motion ─────────────────

type SceneVisual = { type: 'laptop' | 'phone'; src: string; alt: string }

const SCENE_VISUALS: SceneVisual[] = [
  { type: 'laptop', src: '/for-businesses/journey/journey-builder.webp', alt: 'The guided voucher builder in the Redeemo merchant portal, with a live preview of how the voucher will look to customers' },
  { type: 'phone', src: '/for-businesses/journey/journey-phone-home.webp', alt: 'The Redeemo app home screen where local customers browse by category and location' },
  { type: 'phone', src: '/for-businesses/journey/journey-phone-code.webp', alt: 'A customer presenting their Redeemo code at the till' },
  { type: 'laptop', src: '/for-businesses/journey/journey-validated.webp', alt: 'A confirmed redemption recorded in the Redeemo merchant portal' },
]

const SCENE_STATUSES: number[][] = [[0], [1, 2], [3], [4]]

export function JourneyStacked() {
  return (
    <section className="relative overflow-hidden" style={{ background: '#010C35' }}>
      {/* Map plate as a quiet backdrop */}
      <div aria-hidden="true" className="absolute inset-0">
        <Image src="/for-businesses/journey/journey-map-bg.webp" alt="" fill sizes="100vw" className="object-cover opacity-60" />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, #010C35 0%, rgba(1,12,53,0.35) 22%, rgba(1,12,53,0.35) 78%, #010C35 100%)' }}
        />
      </div>

      <div className="relative px-6 pt-20">
        <div className="mx-auto max-w-[600px]">
          <p className="mb-4 flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.22em] text-white/45">
            <span className="h-[2px] w-6 bg-[#E20C04]" aria-hidden="true" />
            {EYEBROW}
          </p>
          <h2 className="font-display mb-4 leading-[1.12] text-white" style={{ fontSize: 'clamp(28px, 7vw, 36px)', letterSpacing: '-0.5px' }}>
            {HEADLINE}
          </h2>
          <p className="text-[15px] leading-[1.62] text-white/55">{INTRO}</p>
        </div>
      </div>

      <div className="relative">
        {BEATS.map((beat, i) => {
          const visual = SCENE_VISUALS[i]
          return (
            <motion.div
              key={beat.label}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-[600px] px-6 pt-16"
            >
              <BeatBlock beat={beat} />

              {visual.type === 'laptop' ? (
                <div className="relative mt-7 overflow-hidden rounded-2xl border border-white/12" style={{ aspectRatio: '1.58', boxShadow: '0 30px 70px rgba(0,4,20,0.55)' }}>
                  <Image src={visual.src} alt={visual.alt} fill sizes="600px" className="object-cover object-top" />
                </div>
              ) : (
                <div
                  className="relative mx-auto mt-7 overflow-hidden rounded-[34px]"
                  style={{ width: 236, aspectRatio: '0.462', border: '7px solid #141B3E', boxShadow: '0 30px 70px rgba(0,4,20,0.6)' }}
                >
                  <Image src={visual.src} alt={visual.alt} fill sizes="240px" className="object-cover object-top" />
                </div>
              )}

              <div aria-hidden="true" className="mx-auto mt-5 flex max-w-[440px] flex-col gap-3">
                {SCENE_STATUSES[i].map((si) => (
                  <StatusCard key={STATUSES[si].num} status={STATUSES[si]} />
                ))}
              </div>
            </motion.div>
          )
        })}
      </div>

      <div className="relative mx-auto max-w-[600px] px-6 pb-24 pt-20">
        <p className="font-display text-[24px] leading-[1.32] text-white" style={{ letterSpacing: '-0.4px' }}>
          {CLOSING}
          <BrandStop tone="white" />
        </p>
      </div>
    </section>
  )
}

// ── Public component: hero + journey as one experience ───────────────────────

export function ForBusinessesCinema({ registerUrl }: { registerUrl: string }) {
  const mode = useViewportMode()
  const reduceMotion = useReducedMotion()

  // Desktop with motion: one continuous pinned band. Everything else (mobile,
  // tablet, short viewports, reduced motion) reads as stacked scenes; the
  // approved hero keeps its own stacked/static handling.
  if (mode === 'desktop' && !reduceMotion) return <CinemaBand registerUrl={registerUrl} />
  return (
    <>
      <HeroCinematic registerUrl={registerUrl} />
      <JourneyStacked />
    </>
  )
}
