'use client'

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useViewportMode } from '@/components/landing/useViewportMode'
import { useScrollLinked } from '@/components/landing/scroll'
import { BrandStop } from '@/components/ui/BrandStop'
import { HeroCinematic, HeroStage, useStageMetrics, STAGE_W, STAGE_H } from './HeroCinematic'

/**
 * Section 2: "How Redeemo works" journey cinema (owner handoff 2026-07-16;
 * round 2 after owner feedback 2026-07-16).
 *
 * The hero and the journey share ONE pinned band: ForBusinessesCinema owns
 * the band and re-hosts the approved HeroStage unchanged as its first slice.
 * Round 2 transition (owner: the travelling cluster read as "floating"): the
 * whole hero plate dissolves and pulls back while the dark local-map plate
 * settles in beneath; the front-facing device pair then turns into place
 * where it stands (rotateY + scale settle, no positional flight).
 *
 * Each beat drives the screens (owner: screens must tell the beat's story,
 * with motion inside the devices):
 *   01 create   laptop ACTIVE: real builder page, pinned chrome + scrolling
 *               content pane (same technique as the hero dashboard);
 *               phone previews the customer-facing voucher.
 *   02 appear   phone ACTIVE: the app home feed scroll-scrubs (the hero's
 *               own feed assets); laptop rests behind a veil.
 *   03 visit    phone ACTIVE: the present-to-staff code screen.
 *   04 confirm  laptop ACTIVE: validate modal -> validated success;
 *               the phone mirrors the customer's success state.
 *
 * The five locked statuses draw as a JOURNEY ROUTE under the devices: five
 * stops on a progress line over the map plate (owner: no scattered cards),
 * activating in step with the beats; the last stop confirms green. Locked
 * closing line ends the section. No CTA.
 *
 * Non-desktop / short / reduced-motion viewers get JourneyStacked: four
 * readable scenes with every piece of locked copy present (SSR default).
 */

// ── Timeline (svh of scroll) ──────────────────────────────────────────────────

const HERO_SCROLL = 75 // matches the approved standalone hero band (175 - 100)
const ARRIVE = 70
const BEAT = 100 // round 3: each beat carries a multi-screen story
const CLOSE = 70
const JOURNEY_SCROLL = ARRIVE + BEAT * 4 + CLOSE // 540
const TOTAL_SCROLL = HERO_SCROLL + JOURNEY_SCROLL // 615
const F_HERO = HERO_SCROLL / TOTAL_SCROLL

// Journey-local fraction helper: svh into [0..1] of the journey slice.
const jf = (svh: number) => svh / JOURNEY_SCROLL

const BEAT_START = [0, 1, 2, 3].map((i) => jf(ARRIVE + i * BEAT))
const CLOSE_START = jf(ARRIVE + BEAT * 4)

// ── Choreography (owner spec 2026-07-16 round 3) ─────────────────────────────
// Every keyframe is an svh offset in journey space (b1=70, b2=170, b3=270,
// b4=370, close=470). The two devices tell one synchronised story, mirroring
// the landing page's app journey:
//   laptop: builder scroll -> "created" toast -> portal home -> redemptions
//           (awaiting codes) -> Validate tapped -> modal rises -> validated
//           success + confetti + toast
//   phone:  home categories -> feed scrolls to a merchant + tap -> merchant
//           profile scrolls to its vouchers + tap -> voucher detail ->
//           Redeem tapped -> branch sheet -> PIN typed -> success + confetti
//           -> View code tapped -> QR code (held while the merchant
//           validates: the customer presents BEFORE the laptop confirms)
const K = {
  // laptop
  paneScrub: [76, 122] as const,
  toastCreated: { in: [126, 132] as const, out: [152, 158] as const },
  portalHome: [156, 164] as const,
  redemptions: [318, 328] as const,
  tapValidate: [414, 424] as const, // after the QR completes at 406: present, THEN confirm
  modalDim: [426, 432] as const,
  modalRise: [432, 442] as const,
  validated: [446, 452] as const,
  laptopConfetti: 448,
  toastValidated: [454, 460] as const,
  // phone
  feedStart: [172, 180] as const, // home-top hands over to the live feed
  feedScrub: [180, 210] as const,
  tapMerchant: [214, 224] as const,
  profile: [226, 234] as const,
  profScrub: [234, 262] as const,
  tapVoucher: [264, 274] as const,
  detail: [276, 284] as const,
  redeemGlow: [286, 316] as const,
  tapRedeem: [298, 308] as const,
  branch: [310, 318] as const,
  tapBranch: [320, 328] as const,
  tapConfirm: [332, 340] as const,
  pin: [342, 350] as const,
  pinKeys: [354, 360, 366, 372] as const,
  pinFlash: [376, 380, 384] as const,
  success: [378, 386] as const,
  phoneConfetti: 380,
  tapViewCode: [392, 400] as const,
  qr: [400, 406] as const, // fully presented before the staff tap Validate
}
const kf = (pair: readonly [number, number]) => [jf(pair[0]), jf(pair[1])] as [number, number]

// ── Front cluster geometry (calibrated from measured screen quads) ───────────
// The front-facing cutout is cropped to its bbox (268,86 of the 1672x941
// plate); screen rects are bbox-local. The laptop white quad measured at
// (127,26)-(990,572) with near-sharp corners (its bottom-right is occluded by
// the phone body, which the raster handles naturally). The phone rect covers
// every white screen pixel down to threshold 195 plus margin (round 1's tight
// quad left a white ring around the content). Content overdraws the quads so
// misregistration can never show a white sliver.

const J_BOX = { w: 1165, h: 731 }
const J_PLACE = { x: 690, y: 245, s: 0.6 } // stage-space placement, QA-tuned
const J_LAPTOP = { left: 124, top: 23, width: 869, height: 553, radius: 6 }
// True white-component bounds (930,176)-(1151,692) + 2px margin; round 1 used
// the fitted-quad corners, ~7px inside the component, hence the white ring.
const J_PHONE = { left: 928, top: 174, width: 226, height: 522, radius: 24 }

const PORTAL_BG = '#F8F7F4'

// Builder chrome pane (measured from the 1440x2233 capture: sidebar/content
// divider at x=261, topbar divider at y=63): the sidebar and top bar stay
// pinned while the content strip scrolls behind them, exactly like the hero
// dashboard's pane.
const BUILDER = { w: 1440, h: 911, paneLeft: 262, paneTop: 64 }
const BUILDER_STRIP_H = 2233 - BUILDER.paneTop
const PANE_TRAVEL = 720 // partial scroll through the form during beat 01

// Phone app-feed reuse (the hero's own journey assets): 800-wide design space.
const FEED = { w: 800, headerH: 194, navH: 152, stripH: 2421 }
const PHONE_DESIGN_H = Math.round((FEED.w * J_PHONE.height) / J_PHONE.width)
const FEED_TRAVEL2 = FEED.stripH - PHONE_DESIGN_H

// Journey route: five stops on a progress line under the devices, drawn over
// the map plate like a route. Stage-space geometry.
const ROUTE = { y: 782, x0: 745, x1: 1405 }

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
const HEADLINE_LEAD = 'See how a voucher becomes'
const HEADLINE_INK = 'a visit.'
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
  at: number // journey progress where this stop activates
}

// Stops fire at their on-screen moments: terms taking shape, the portal home
// with the phone browsing, the voucher detail open, the QR presented, the
// validated confirmation.
const STATUSES: Status[] = [
  { num: '01', kicker: 'Voucher ready', title: 'Terms set. Ready to submit.', kind: 'red', at: jf(115) },
  { num: '02', kicker: 'Offer live', title: 'Visible on Redeemo.', kind: 'red', at: jf(176) },
  { num: '03', kicker: 'Found nearby', title: 'A customer is viewing your voucher.', kind: 'amber', at: jf(284) },
  { num: '04', kicker: 'At the till', title: 'Code ready to validate.', kind: 'red', at: jf(412) },
  { num: '05', kicker: 'Redemption confirmed', title: 'Voucher and branch recorded.', kind: 'green', at: jf(452) },
]

// ── Journey route: five stops on a filling line over the map ─────────────────

const STOP_X = STATUSES.map((_, i) => ROUTE.x0 + ((ROUTE.x1 - ROUTE.x0) / (STATUSES.length - 1)) * i)

function RouteStop({ status, x, jp }: { status: Status; x: number; jp: MotionValue<number> }) {
  const lit = useScrollLinked(useTransform(jp, [status.at, status.at + 0.02], [0, 1]))
  const dotScale = useScrollLinked(useTransform(jp, [status.at, status.at + 0.025], [1, 1.15]))
  const kickerOp = useScrollLinked(useTransform(jp, [status.at, status.at + 0.02], [0.38, 1]))
  const c = status.kind === 'green' ? '#4ADE80' : status.kind === 'amber' ? '#FBBF24' : '#FF4B3E'
  const glow = status.kind === 'green' ? 'rgba(74,222,128,0.7)' : status.kind === 'amber' ? 'rgba(251,191,36,0.7)' : 'rgba(226,12,4,0.8)'
  return (
    <div style={{ position: 'absolute', left: x, top: ROUTE.y, width: 0 }}>
      {/* Base dot (always visible, quiet) */}
      <span
        className="absolute block rounded-full"
        style={{ left: -5, top: -5, width: 10, height: 10, border: '1.5px solid rgba(255,255,255,0.35)', background: '#0A1436' }}
      />
      {/* Lit dot */}
      <motion.span
        className="absolute block rounded-full"
        style={{ left: -5, top: -5, width: 10, height: 10, background: c, boxShadow: `0 0 14px ${glow}`, opacity: lit, scale: dotScale }}
      />
      {/* Kicker under the stop */}
      <motion.span
        className="absolute block whitespace-nowrap text-center text-[10.5px] font-bold uppercase tracking-[0.14em]"
        style={{ left: 0, top: 16, transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.85)', opacity: kickerOp }}
      >
        {status.kicker}
      </motion.span>
    </div>
  )
}

// The active stop's locked line, one motion node per status (own component so
// each hook call sits at a component top level).
function RouteTitle({ status, next, jp }: { status: Status; next: number | null; jp: MotionValue<number> }) {
  const opacity = useScrollLinked(
    useTransform(jp, next === null ? [status.at, status.at + 0.02] : [status.at, status.at + 0.02, next, next + 0.02], next === null ? [0, 1] : [0, 1, 1, 0]),
  )
  return (
    <motion.p
      className="absolute inset-0 text-center text-[13.5px] font-semibold text-white"
      style={{ opacity, textShadow: '0 2px 14px rgba(0,4,20,0.9)' }}
    >
      {status.title}
    </motion.p>
  )
}

function JourneyRoute({ jp }: { jp: MotionValue<number> }) {
  const routeIn = useScrollLinked(useTransform(jp, [jf(34), jf(48)], [0, 1]))
  // The line fills stop to stop as each status activates.
  const fill = useScrollLinked(
    useTransform(
      jp,
      STATUSES.map((s) => s.at),
      STATUSES.map((_, i) => i / (STATUSES.length - 1)),
    ),
  )
  return (
    <motion.div style={{ opacity: routeIn }}>
      {/* Base line + filling line */}
      <div
        style={{ position: 'absolute', left: ROUTE.x0, top: ROUTE.y - 1, width: ROUTE.x1 - ROUTE.x0, height: 2, background: 'rgba(255,255,255,0.14)', borderRadius: 2 }}
      />
      <motion.div
        style={{
          position: 'absolute',
          left: ROUTE.x0,
          top: ROUTE.y - 1,
          width: ROUTE.x1 - ROUTE.x0,
          height: 2,
          borderRadius: 2,
          background: 'linear-gradient(90deg, #E20C04, #FF6B3D)',
          boxShadow: '0 0 12px rgba(226,12,4,0.55)',
          scaleX: fill,
          transformOrigin: '0 50%',
        }}
      />
      {STATUSES.map((status, i) => (
        <RouteStop key={status.num} status={status} x={STOP_X[i]} jp={jp} />
      ))}
      {/* The active stop's locked line, centred under the route */}
      <div style={{ position: 'absolute', left: ROUTE.x0, top: ROUTE.y + 44, width: ROUTE.x1 - ROUTE.x0, height: 24 }}>
        {STATUSES.map((status, i) => (
          <RouteTitle key={status.num} status={status} next={i < STATUSES.length - 1 ? STATUSES[i + 1].at : null} jp={jp} />
        ))}
      </div>
    </motion.div>
  )
}

// ── Status chips (stacked layout) ─────────────────────────────────────────────

function StatusChip({ status }: { status: Status }) {
  const c = status.kind === 'green' ? '#4ADE80' : status.kind === 'amber' ? '#FBBF24' : '#FF4B3E'
  const glow = status.kind === 'green' ? 'rgba(74,222,128,0.7)' : status.kind === 'amber' ? 'rgba(251,191,36,0.7)' : 'rgba(226,12,4,0.8)'
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border border-white/14 bg-[#081130]/78 px-4 py-3.5 backdrop-blur-md"
      style={{ boxShadow: '0 24px 60px rgba(0,4,20,0.55), inset 0 1px 0 rgba(255,255,255,0.08)' }}
    >
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${glow}` }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{status.kicker}</span>
        <span className="block text-[13.5px] font-bold leading-snug text-white">{status.title}</span>
      </span>
      <span className="text-[10px] font-semibold tracking-[0.1em] text-white/25">{status.num}</span>
    </div>
  )
}

// ── Front-facing device cluster ───────────────────────────────────────────────

function useBand(progress: MotionValue<number>, input: number[], output: number[]) {
  return useScrollLinked(useTransform(progress, input, output))
}

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

// ── Cover-crop remaps ─────────────────────────────────────────────────────────
// Full-screen phone captures (800x1738-1740) render object-cover into the
// 226x522 screen rect: height fits, width is cropped, so capture x-fractions
// must be remapped (same trick as the landing journey's savX).
const CAP = { w: 800, h: 1738 }
const CAP_DISP_W = CAP.w * (J_PHONE.height / CAP.h)
const CAP_OFF_X = (CAP_DISP_W - J_PHONE.width) / 2
const capX = (f: number) => (f * CAP_DISP_W - CAP_OFF_X) / J_PHONE.width
// The portal redemptions capture (1728x1084) cover-cropped into the laptop rect.
const RED_DISP_W = 1728 * (J_LAPTOP.height / 1084)
const RED_OFF_X = (RED_DISP_W - J_LAPTOP.width) / 2
const lapX = (f: number) => (f * RED_DISP_W - RED_OFF_X) / J_LAPTOP.width

// PIN keypad geometry (fractions of the pin-screen capture; measured for the
// landing journey and reused verbatim: same source image).
const PIN_KEYS: Record<string, [number, number]> = {
  '1': [0.168, 0.719], '2': [0.497, 0.719], '3': [0.826, 0.719],
  '4': [0.168, 0.777], '5': [0.497, 0.777], '6': [0.826, 0.777],
  '7': [0.168, 0.835], '8': [0.497, 0.835], '9': [0.826, 0.835],
  '0': [0.497, 0.894],
}
const PIN_DIGITS = ['4', '7', '2', '9']
const PIN_BOX_LEFTS = [0.198, 0.352, 0.506, 0.661]
const PIN_BOX = { top: 0.409, w: 0.136, h: 0.08 }
const PIN_KEY_TIMES = K.pinKeys.map((svh) => jf(svh))

// Merchant profile strip in the phone's 800-wide design space.
const PROFILE_STRIP_H = 2350
const PROFILE_TRAVEL = PROFILE_STRIP_H - PHONE_DESIGN_H

// Deterministic confetti (hash-based so SSR and client renders agree),
// straight from the landing journey's proven recipe.
const CONFETTI_COLOURS = ['#E20C04', '#E84A00', '#F5B301', '#16A34A', '#2563EB', '#7C3AED', '#FF7A64']
function makeConfetti(count: number, seed: number) {
  return Array.from({ length: count }, (_, i) => {
    const h = (n: number) => {
      const s = Math.sin((i + seed) * n) * 10000
      return s - Math.floor(s)
    }
    const r2 = (v: number) => Math.round(v * 100) / 100
    return {
      x: r2(3 + h(12.9898) * 94),
      sway: Math.round((h(78.233) - 0.5) * 80),
      fall: Math.round(300 + h(43.317) * 300),
      rot: Math.round((h(9.421) - 0.5) * 720),
      colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
      size: r2(6 + h(27.61) * 6),
      delay: r2(h(3.7) * jf(8)),
      round: i % 3 === 0,
    }
  })
}
const PHONE_CONFETTI = makeConfetti(30, 1)
const LAPTOP_CONFETTI = makeConfetti(34, 7)

function ConfettiPiece({ jp, p, t0 }: { jp: MotionValue<number>; p: ReturnType<typeof makeConfetti>[number]; t0: number }) {
  const start = t0 + p.delay
  const end = start + jf(30)
  const mid = (start + end) / 2
  const y = useBand(jp, [start, end], [0, p.fall])
  const x = useBand(jp, [start, mid, end], [0, p.sway * 0.55, p.sway])
  const rotate = useBand(jp, [start, end], [0, p.rot])
  const opacity = useBand(jp, [start, start + jf(1), end - jf(8), end], [0, 1, 1, 0])
  return (
    <motion.span
      className={`absolute pointer-events-none ${p.round ? 'rounded-full' : 'rounded-[2px]'}`}
      style={{ left: `${p.x}%`, top: -14, width: p.size, height: p.round ? p.size : Math.round(p.size * 55) / 100, background: p.colour, x, y, rotate, opacity }}
    />
  )
}

/** The landing journey's fingertip: pressing core + double ripple. */
function Tap({ jp, at, x, y, size = 34 }: { jp: MotionValue<number>; at: readonly [number, number]; x: string; y: string; size?: number }) {
  const [a, b] = kf(at)
  const span = b - a
  const opacity = useBand(jp, [a, a + span * 0.1, b - span * 0.1, b], [0, 1, 1, 0])
  const press = useBand(jp, [a, a + span * 0.25, a + span * 0.45, a + span * 0.65, b], [0.6, 1.08, 0.78, 1.05, 1])
  const ring1 = useBand(jp, [a + span * 0.35, b], [0.5, 2.9])
  const ring1Op = useBand(jp, [a + span * 0.35, a + span * 0.5, b], [0, 0.8, 0])
  const ring2 = useBand(jp, [a + span * 0.5, b], [0.4, 3.9])
  const ring2Op = useBand(jp, [a + span * 0.5, a + span * 0.65, b], [0, 0.55, 0])
  const box = { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }
  return (
    <div className="pointer-events-none absolute" style={{ left: x, top: y }}>
      <motion.div
        className="absolute rounded-full"
        style={{
          ...box,
          opacity,
          scale: press,
          background: 'radial-gradient(circle, rgba(226,12,4,0.9) 0%, rgba(226,12,4,0.55) 55%, rgba(226,12,4,0.25) 100%)',
          boxShadow: '0 4px 18px rgba(226,12,4,0.55), inset 0 0 0 2.5px rgba(255,255,255,0.95)',
        }}
      />
      <motion.div className="absolute rounded-full border-[3px] border-[#E20C04]" style={{ ...box, opacity: ring1Op, scale: ring1 }} />
      <motion.div className="absolute rounded-full border-2 border-[#E20C04]" style={{ ...box, opacity: ring2Op, scale: ring2 }} />
    </div>
  )
}

/** One PIN digit appearing in its entry box as its key is pressed. */
function PinDigit({ jp, keyTime, digit }: { jp: MotionValue<number>; keyTime: number; digit: string }) {
  const opacity = useBand(jp, [keyTime + jf(1), keyTime + jf(3)], [0, 1])
  return (
    <motion.span className="font-display text-[15px] text-[#010C35]" style={{ opacity }}>
      {digit}
    </motion.span>
  )
}

/** The keypad flash for one PIN key press. */
function KeyFlash({ jp, keyTime, digit }: { jp: MotionValue<number>; keyTime: number; digit: string }) {
  const opacity = useBand(jp, [keyTime - jf(1), keyTime, keyTime + jf(2.5)], [0, 1, 0])
  const [kx, ky] = PIN_KEYS[digit]
  const left = capX(kx - 0.145)
  const width = capX(kx + 0.145) - left
  return (
    <motion.div
      className="pointer-events-none absolute rounded-lg"
      style={{
        left: `${left * 100}%`,
        top: `${(ky - 0.024) * 100}%`,
        width: `${width * 100}%`,
        height: '4.8%',
        opacity,
        background: 'rgba(226,12,4,0.22)',
        boxShadow: '0 0 0 2px rgba(226,12,4,0.45)',
      }}
    />
  )
}

/** A portal toast in the laptop's bottom-LEFT corner (the phone body
 *  occludes the screen's bottom-right, where portal toasts would live). */
function LaptopToast({ opacity, y, text }: { opacity: MotionValue<number>; y: MotionValue<number>; text: string }) {
  return (
    <motion.div
      className="absolute bottom-5 left-5 flex items-center gap-2.5 rounded-xl px-4 py-3"
      style={{ opacity, y, background: 'rgba(13,23,42,0.94)', boxShadow: '0 14px 34px rgba(1,8,30,0.35)' }}
    >
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#16A34A]/25">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span className="whitespace-nowrap text-[17px] font-semibold text-white">{text}</span>
    </motion.div>
  )
}

// The app home feed, scroll-scrubbed: the hero's own assets (pinned header +
// nav over a moving strip), rendered in an 800-wide design space scaled into
// the phone's screen rect. Opens on the real home screen (home-top overlay).
function PhoneFeed({
  opacity,
  homeTopOp,
  feedY,
}: {
  opacity: MotionValue<number> | number
  homeTopOp: MotionValue<number> | number
  feedY: MotionValue<number> | number
}) {
  const s = J_PHONE.width / FEED.w
  return (
    <motion.div style={{ position: 'absolute', inset: 0, opacity, background: '#0A1030' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: FEED.w, height: PHONE_DESIGN_H, transform: `scale(${s})`, transformOrigin: '0 0' }}>
        <motion.div style={{ position: 'absolute', left: 0, top: 0, width: FEED.w, height: FEED.stripH, y: feedY }}>
          <Image src="/app-shots/journey/home-strip.jpg" alt="" fill sizes="260px" className="object-cover object-top" />
        </motion.div>
        <div style={{ position: 'absolute', left: 0, top: 0, width: FEED.w, height: FEED.headerH }}>
          <Image src="/app-shots/journey/home-header.jpg" alt="" fill sizes="260px" className="object-cover" />
        </div>
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: FEED.w, height: FEED.navH }}>
          <Image src="/app-shots/journey/home-nav.jpg" alt="" fill sizes="260px" className="object-cover" />
        </div>
      </div>
      {/* The real home screen (categories) opens the story */}
      <motion.div className="absolute inset-0" style={{ opacity: homeTopOp }}>
        <Image src="/app-shots/journey/home-top.jpg" alt="" fill sizes="240px" className="object-cover object-top" loading="eager" />
      </motion.div>
    </motion.div>
  )
}

function FrontDeviceCluster({ jp }: { jp: MotionValue<number> }) {
  // ── Laptop timeline ──
  const paneY = useBand(jp, kf(K.paneScrub), [0, -PANE_TRAVEL])
  const builderOp = useBand(jp, kf(K.portalHome), [1, 0])
  const homeOp = useBand(jp, [...kf(K.portalHome), ...kf(K.redemptions)], [0, 1, 1, 0])
  const redemptionsOp = useBand(jp, kf(K.redemptions), [0, 1])
  const toastCreatedOp = useBand(jp, [...kf(K.toastCreated.in), ...kf(K.toastCreated.out)], [0, 1, 1, 0])
  const toastCreatedY = useBand(jp, kf(K.toastCreated.in), [14, 0])
  const laptopVeil = useBand(jp, [jf(174), jf(182), jf(396), jf(404)], [0, 0.4, 0.4, 0])
  const modalDim = useBand(jp, [...kf(K.modalDim), jf(444), jf(448)], [0, 0.45, 0.45, 0])
  const modalOp = useBand(jp, kf(K.modalRise), [0, 1])
  const modalY = useBand(jp, kf(K.modalRise), [30, 0])
  const validateFullOp = useBand(jp, [jf(442), jf(445), jf(446), jf(452)], [0, 1, 1, 0])
  const validatedOp = useBand(jp, kf(K.validated), [0, 1])
  const toastValidatedOp = useBand(jp, kf(K.toastValidated), [0, 1])
  const toastValidatedY = useBand(jp, kf(K.toastValidated), [14, 0])

  // ── Phone timeline ──
  const homeTopOp = useBand(jp, kf(K.feedStart), [1, 0])
  const feedY = useBand(jp, kf(K.feedScrub), [0, -FEED_TRAVEL2])
  const feedLayerOp = useBand(jp, kf(K.profile), [1, 0])
  const profileOp = useBand(jp, [...kf(K.profile), ...kf(K.detail)], [0, 1, 1, 0])
  const profY = useBand(jp, kf(K.profScrub), [0, -PROFILE_TRAVEL])
  const detailOp = useBand(jp, [...kf(K.detail), ...kf(K.branch)], [0, 1, 1, 0])
  const redeemGlow = useBand(jp, [jf(K.redeemGlow[0]), jf(K.redeemGlow[0] + 10), jf(K.redeemGlow[1] - 8), jf(K.redeemGlow[1])], [0, 1, 1, 0.4])
  const branchOp = useBand(jp, [...kf(K.branch), ...kf(K.pin)], [0, 1, 1, 0])
  const pinOp = useBand(jp, [...kf(K.pin), ...kf(K.success)], [0, 1, 1, 0])
  const pinFlash = useBand(jp, [jf(K.pinFlash[0]), jf(K.pinFlash[1]), jf(K.pinFlash[2])], [0, 0.55, 0])
  const successOp = useBand(jp, [...kf(K.success), ...kf(K.qr)], [0, 1, 1, 0])
  const successScale = useBand(jp, [jf(K.success[0]), jf(K.success[1] + 6)], [0.94, 1])
  const qrOp = useBand(jp, kf(K.qr), [0, 1])

  const laptopScale = J_LAPTOP.width / BUILDER.w

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
        {/* Builder in its own 1440x911 design space: full chrome pinned, the
            content pane scrolls behind it during beat 01 */}
        <motion.div style={{ position: 'absolute', left: 0, top: 0, width: BUILDER.w, height: BUILDER.h, transform: `scale(${laptopScale})`, transformOrigin: '0 0', opacity: builderOp, background: PORTAL_BG }}>
          <div
            style={{
              position: 'absolute',
              left: BUILDER.paneLeft,
              top: BUILDER.paneTop,
              width: BUILDER.w - BUILDER.paneLeft,
              height: BUILDER.h - BUILDER.paneTop,
              overflow: 'hidden',
              background: PORTAL_BG,
            }}
          >
            <motion.div style={{ position: 'absolute', left: 0, top: 0, width: BUILDER.w - BUILDER.paneLeft, height: BUILDER_STRIP_H, y: paneY }}>
              <Image src="/for-businesses/journey/journey-builder-strip.webp" alt="" fill sizes="540px" className="object-cover object-top" />
            </motion.div>
          </div>
          <Image src="/for-businesses/journey/journey-builder.webp" alt="" fill sizes="540px" className="object-cover object-top" style={{ clipPath: `polygon(0 0, 100% 0, 100% ${BUILDER.paneTop}px, ${BUILDER.paneLeft}px ${BUILDER.paneTop}px, ${BUILDER.paneLeft}px 100%, 0 100%)` }} />
        </motion.div>

        {/* Portal home, then the redemptions queue (2 codes awaiting). The
            dashboard capture's baked June date chip is covered by a
            replacement pill (styled to match) reading a July date, so the
            dashboard cannot contradict the July redemption records
            (owner 2026-07-16). */}
        {(
          <motion.div style={{ position: 'absolute', inset: 0, opacity: homeOp, background: PORTAL_BG }}>
            <Image src="/for-businesses/portal/home-chrome.webp" alt="" fill sizes="640px" className="object-cover object-top" />
            <div
              className="absolute flex items-center justify-center gap-1.5 bg-white"
              style={{
                left: `${lapX(1436 / 1728) * 100}%`,
                width: `${(lapX(1676 / 1728) - lapX(1436 / 1728)) * 100}%`,
                top: `${(112 / 1084) * 100}%`,
                height: `${(58 / 1084) * 100}%`,
                borderRadius: 7,
                border: '1px solid #E9ECF2',
                boxShadow: '0 1px 3px rgba(16,24,40,0.05)',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className="whitespace-nowrap font-semibold" style={{ fontSize: 13, color: '#28324E' }}>
                Tuesday, 7 July 2026
              </span>
            </div>
          </motion.div>
        )}
        <ChapterImage src="/for-businesses/portal/redemptions.webp" opacity={redemptionsOp} />

        {/* Focus veil while the phone carries the story */}
        <motion.div style={{ position: 'absolute', inset: 0, background: '#010C35', opacity: laptopVeil }} />

        {/* Staff tap Validate a code, the modal rises, the code checks out */}
        <Tap jp={jp} at={K.tapValidate} x={`${lapX(0.902) * 100}%`} y="13.6%" size={44} />
        <motion.div style={{ position: 'absolute', inset: 0, background: 'rgba(7,12,32,0.75)', opacity: modalDim }} />
        {(
          <motion.div style={{ position: 'absolute', inset: 0, opacity: modalOp, y: modalY }}>
            <Image
              src="/for-businesses/journey/journey-validate.webp"
              alt=""
              fill
              sizes="640px"
              className="object-cover object-top"
              style={{ clipPath: 'inset(15% 27% 15% 27% round 14px)' }}
            />
          </motion.div>
        )}
        <ChapterImage src="/for-businesses/journey/journey-validate.webp" opacity={validateFullOp} />
        <ChapterImage src="/for-businesses/journey/journey-validated.webp" opacity={validatedOp} />

        {/* Confirmation moment: brand confetti + portal toast */}
        {(
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {LAPTOP_CONFETTI.map((p, i) => (
              <ConfettiPiece key={i} jp={jp} p={p} t0={jf(K.laptopConfetti)} />
            ))}
          </div>
        )}
        <LaptopToast opacity={toastCreatedOp} y={toastCreatedY} text="Voucher successfully created." />
        <LaptopToast opacity={toastValidatedOp} y={toastValidatedY} text="Voucher successfully validated." />

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
        loading="eager"
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
        {/* Home (categories) -> the feed scrolls to a merchant, tapped */}
        <PhoneFeed opacity={feedLayerOp} homeTopOp={homeTopOp} feedY={feedY} />
        <motion.div className="pointer-events-none absolute inset-0" style={{ opacity: feedLayerOp }}>
          <Tap jp={jp} at={K.tapMerchant} x="34%" y="63%" />
        </motion.div>

        {/* Merchant profile scrolls down to its vouchers, one is tapped */}
        {(
          <motion.div style={{ position: 'absolute', inset: 0, opacity: profileOp, background: '#FFF9F5' }}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: FEED.w,
                height: PHONE_DESIGN_H,
                transform: `scale(${J_PHONE.width / FEED.w})`,
                transformOrigin: '0 0',
              }}
            >
              <motion.div style={{ position: 'absolute', left: 0, top: 0, width: FEED.w, height: PROFILE_STRIP_H, y: profY }}>
                <Image src="/app-shots/journey/profile-strip.jpg" alt="" fill sizes="260px" className="object-cover object-top" />
              </motion.div>
            </div>
            <Tap jp={jp} at={K.tapVoucher} x="76%" y="86%" />
          </motion.div>
        )}

        {/* Voucher detail: Redeem glows, then gets tapped */}
        {(
          <motion.div style={{ position: 'absolute', inset: 0, opacity: detailOp, background: '#FFF9F5' }}>
            <Image src="/app-shots/journey/voucher-detail.jpg" alt="" fill sizes="240px" className="object-cover object-top" />
            <motion.div
              className="pointer-events-none absolute rounded-xl"
              style={{
                left: `${capX(0.045) * 100}%`,
                width: `${(capX(0.955) - capX(0.045)) * 100}%`,
                top: '86.9%',
                height: '7.6%',
                opacity: redeemGlow,
                boxShadow: '0 0 0 2px rgba(255,255,255,0.6), 0 0 22px rgba(226,12,4,0.5)',
              }}
            />
            <Tap jp={jp} at={K.tapRedeem} x="50%" y="90.5%" />
          </motion.div>
        )}

        {/* Redemption: branch sheet, PIN typed on the keypad, success */}
        {(
          <motion.div style={{ position: 'absolute', inset: 0, opacity: branchOp, background: '#2a1a3e' }}>
            <Image src="/app-shots/journey/branch-sheet.jpg" alt="" fill sizes="240px" className="object-cover object-top" />
            <Tap jp={jp} at={K.tapBranch} x="50%" y="79%" />
            <Tap jp={jp} at={K.tapConfirm} x="50%" y="94.5%" />
          </motion.div>
        )}
        {(
          <motion.div style={{ position: 'absolute', inset: 0, opacity: pinOp, background: '#2a1a3e' }}>
            <Image src="/app-shots/journey/pin-screen.jpg" alt="" fill sizes="240px" className="object-cover object-top" />
            {PIN_BOX_LEFTS.map((left, i) => (
              <div
                key={i}
                className="absolute flex items-center justify-center rounded-lg bg-white"
                style={{
                  left: `${capX(left) * 100}%`,
                  top: `${PIN_BOX.top * 100}%`,
                  width: `${(capX(left + PIN_BOX.w) - capX(left)) * 100}%`,
                  height: `${PIN_BOX.h * 100}%`,
                  border: '1.5px solid #F1D9D4',
                }}
              >
                <PinDigit jp={jp} keyTime={PIN_KEY_TIMES[i]} digit={PIN_DIGITS[i]} />
              </div>
            ))}
            {PIN_DIGITS.map((d, i) => (
              <KeyFlash key={i} jp={jp} keyTime={PIN_KEY_TIMES[i]} digit={d} />
            ))}
          </motion.div>
        )}
        {(
          <motion.div style={{ position: 'absolute', inset: 0, opacity: successOp, scale: successScale, background: '#2a1a3e' }}>
            <Image src="/app-shots/journey/success-sheet.jpg" alt="" fill sizes="240px" className="object-cover object-top" />
            <Tap jp={jp} at={K.tapViewCode} x="50%" y="65.5%" />
          </motion.div>
        )}
        <motion.div className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: pinFlash }} />
        {(
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {PHONE_CONFETTI.map((p, i) => (
              <ConfettiPiece key={i} jp={jp} p={p} t0={jf(K.phoneConfetti)} />
            ))}
          </div>
        )}

        {/* The QR + code, presented at the till while the merchant validates */}
        <ChapterImage src="/app-shots/journey/qr-screen.jpg" opacity={qrOp} sizes="240px" />

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

// One beat's copy block fading through its window (own component so the
// hook sits at a component top level, like every other mapped layer here).
function BeatLayer({ jp, index }: { jp: MotionValue<number>; index: number }) {
  const s = BEAT_START[index]
  const e = index < 3 ? BEAT_START[index + 1] : CLOSE_START
  const opacity = useBand(jp, [s, s + jf(12), e - jf(6), e], [0, 1, 1, 0])
  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      <BeatBlock beat={BEATS[index]} />
    </motion.div>
  )
}

function JourneyCopyColumn({ jp }: { jp: MotionValue<number> }) {
  const headerOp = useScrollLinked(useTransform(jp, [jf(26), jf(40)], [0, 1]))
  const headerY = useScrollLinked(useTransform(jp, [jf(26), jf(40)], [22, 0]))
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
          {HEADLINE_LEAD} <span className="gradient-text">{HEADLINE_INK}</span>
        </h2>
        <p className="mb-9 max-w-[440px] text-[15px] leading-[1.62] text-white/55">{INTRO}</p>

        {/* Beat slot: blocks crossfade in place; all four stay in the DOM in
            reading order. The closing statement lands in the same slot. */}
        <div className="relative h-[230px]">
          {BEATS.map((beat, i) => (
            <BeatLayer key={beat.label} jp={jp} index={i} />
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

  // Arrival: the whole hero plate dissolves and pulls back (no device
  // flight); the map plate settles beneath; the front pair turns into place
  // where it stands.
  const heroOpacity = useScrollLinked(useTransform(jp, [jf(2), jf(13)], [1, 0]))
  const heroPull = useScrollLinked(useTransform(jp, [0, jf(13)], [1, 0.985]))
  // Visibility tracks the opacity value itself so the hero's CTA can never
  // sit invisible-but-focusable over the journey, whatever the scroll state.
  const heroVisibility = useTransform(heroOpacity, (v) => (v < 0.02 ? 'hidden' : 'visible'))
  const [heroGone, setHeroGone] = useState(false)
  useMotionValueEvent(jp, 'change', (v) => setHeroGone(v > jf(14)))

  // Change events do not fire on mount: seed for reloads and deep links
  // that restore scroll mid-band. All journey layers stay mounted from the
  // start: layers mounted mid-scroll subscribe unreliably to the motion
  // chain (found in QA: a deep reload left the screens blank), and the
  // deferred-payload win was minor next to that failure mode.
  useEffect(() => {
    setHeroGone(jp.get() > jf(14))
  }, [jp])

  const mapScale = useScrollLinked(useTransform(jp, [0, jf(44)], [1.05, 1]))

  const frontOp = useScrollLinked(useTransform(jp, [jf(10), jf(24)], [0, 1]))
  const frontRot = useScrollLinked(useTransform(jp, [jf(10), jf(36)], [-15, 0]))
  const frontScale = useScrollLinked(useTransform(jp, [jf(10), jf(36)], [1.06, 1]))
  const frontY = useScrollLinked(useTransform(jp, [jf(10), jf(36)], [26, 0]))

  // Journey scrim + map pin pulses (pulses live during the discovery beat)
  const journeyScrim = useScrollLinked(useTransform(jp, [0, jf(13)], [0, 1]))
  const pulseOp = useScrollLinked(useTransform(jp, [BEAT_START[1], BEAT_START[1] + jf(8), BEAT_START[2], BEAT_START[2] + jf(8)], [0, 1, 1, 0]))

  return (
    <section ref={bandRef} className="relative -mt-[80px]" style={{ height: `${TOTAL_SCROLL + 100}svh`, background: '#010C35' }}>
      {/* Navbar anchor: lands where the hero hands over to the journey */}
      <div id="how-it-works" aria-hidden="true" className="absolute left-0 h-px w-px" style={{ top: `${HERO_SCROLL + ARRIVE}svh` }} />
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* ── Journey backdrop: the map plate, revealed as the hero dissolves ── */}
        <motion.div ref={stageRef} aria-hidden="true" className="absolute inset-0" style={{ scale: mapScale, transformOrigin: '50% 42%' }}>
          {/* Needed at the seam (~75svh in) but hidden behind the hero at
              first paint: eager so it fetches immediately, NOT priority so
              it never contends with the hero's LCP image. */}
          <Image
            src="/for-businesses/journey/journey-map-bg.webp"
            alt=""
            fill
            loading="eager"
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

        {/* ── The approved hero, re-hosted unchanged; dissolves into the journey ── */}
        <motion.div className="absolute inset-0" style={{ opacity: heroOpacity, scale: heroPull, transformOrigin: '50% 45%', visibility: heroVisibility }}>
          <HeroStage registerUrl={registerUrl} progress={heroP} seamless embersOn={!heroGone} />
        </motion.div>

        {/* ── Journey scrim (identical gradient to the hero's) ── */}
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: SCRIM, opacity: journeyScrim }} />

        {/* ── Devices + journey route in stage space ── */}
        <div aria-hidden="true" className="absolute inset-0">
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
              {/* Soft light pooling behind the devices so they lift off the map */}
              <motion.div
                style={{
                  position: 'absolute',
                  left: J_PLACE.x - 60,
                  top: J_PLACE.y - 40,
                  width: J_BOX.w * J_PLACE.s + 120,
                  height: J_BOX.h * J_PLACE.s + 90,
                  background: 'radial-gradient(closest-side, rgba(90,120,220,0.14), transparent 74%)',
                  opacity: frontOp,
                }}
              />
              <motion.div
                style={{
                  position: 'absolute',
                  left: J_PLACE.x,
                  top: J_PLACE.y,
                  width: J_BOX.w * J_PLACE.s,
                  height: J_BOX.h * J_PLACE.s,
                  opacity: frontOp,
                  rotateY: frontRot,
                  scale: frontScale,
                  y: frontY,
                  transformOrigin: '50% 60%',
                }}
              >
                <div style={{ transform: `scale(${J_PLACE.s})`, transformOrigin: '0 0' }}>
                  <FrontDeviceCluster jp={jp} />
                </div>
              </motion.div>

              <JourneyRoute jp={jp} />
            </div>
          ) : null}
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

      {/* Navbar anchor for the reduced-motion path (lands on the header) */}
      <span id="how-it-works" aria-hidden="true" className="absolute left-0 top-0 block h-px w-px scroll-mt-24" />
      <div className="relative px-6 pt-20">
        <div className="mx-auto max-w-[600px]">
          <p className="mb-4 flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.22em] text-white/45">
            <span className="h-[2px] w-6 bg-[#E20C04]" aria-hidden="true" />
            {EYEBROW}
          </p>
          <h2 className="font-display mb-4 leading-[1.12] text-white" style={{ fontSize: 'clamp(28px, 7vw, 36px)', letterSpacing: '-0.5px' }}>
            {HEADLINE_LEAD} <span className="gradient-text">{HEADLINE_INK}</span>
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
                  <StatusChip key={STATUSES[si].num} status={STATUSES[si]} />
                ))}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Extra tail room: the next section's cream curve overlaps this edge */}
      <div className="relative mx-auto max-w-[600px] px-6 pb-36 pt-20">
        <p className="font-display text-[24px] leading-[1.32] text-white" style={{ letterSpacing: '-0.4px' }}>
          {CLOSING}
          <BrandStop tone="white" />
        </p>
      </div>
    </section>
  )
}

// ── Mobile / tablet scroll-driven journey cinema ─────────────────────────────
// The full pinned journey on portrait and landscape (owner 2026-07-17): the
// SAME scroll choreography as the desktop band drives BOTH device screens, on a
// band that covers the journey ONLY (HeroStacked stays as the mobile hero). The
// timeline is journey space verbatim (JOURNEY_SCROLL svh over the band), so the
// K keyframe map, FrontDeviceCluster and the beat copy line up frame for frame
// with the desktop cinema; only the composition around the cluster is rebuilt
// for the narrow stage (compact copy at the top, the cluster filling the middle
// at viewport width, a condensed five-stop route stepper at the foot). Landscape
// phones and squat tablet windows ('short') get the same pieces side by side.

// Fit a fixed design box into a measured container (object-contain maths), run
// in a layout effect so the scale is set before first paint (no pop-in).
function useFitScale(ref: RefObject<HTMLDivElement | null>, boxW: number, boxH: number): number {
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      setScale(Math.min(w / boxW, h / boxH))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, boxW, boxH])
  return scale
}

// One condensed route stop: a dot on the filling line plus its locked kicker.
function MobileStepDot({ status, jp }: { status: Status; jp: MotionValue<number> }) {
  const lit = useScrollLinked(useTransform(jp, [status.at, status.at + 0.02], [0, 1]))
  const kickerOp = useScrollLinked(useTransform(jp, [status.at, status.at + 0.02], [0.4, 1]))
  const c = status.kind === 'green' ? '#4ADE80' : status.kind === 'amber' ? '#FBBF24' : '#FF4B3E'
  const glow = status.kind === 'green' ? 'rgba(74,222,128,0.7)' : status.kind === 'amber' ? 'rgba(251,191,36,0.7)' : 'rgba(226,12,4,0.8)'
  return (
    <div className="relative flex flex-1 flex-col items-center">
      <span className="relative block h-3 w-3">
        <span className="absolute inset-0 rounded-full" style={{ border: '1.5px solid rgba(255,255,255,0.35)', background: '#0A1436' }} />
        <motion.span className="absolute inset-0 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${glow}`, opacity: lit }} />
      </span>
      <motion.span
        className="mt-1.5 block px-0.5 text-center text-[8.5px] font-bold uppercase leading-[1.18] tracking-[0.06em] text-white"
        style={{ opacity: kickerOp }}
      >
        {status.kicker}
      </motion.span>
    </div>
  )
}

// The five-stop route condensed for the mobile foot: dots on a filling line,
// each locked kicker beneath, and the active stop's locked title under the line.
function MobileStepper({ jp }: { jp: MotionValue<number> }) {
  const routeIn = useScrollLinked(useTransform(jp, [jf(30), jf(46)], [0, 1]))
  const fill = useScrollLinked(
    useTransform(
      jp,
      STATUSES.map((s) => s.at),
      STATUSES.map((_, i) => i / (STATUSES.length - 1)),
    ),
  )
  return (
    <motion.div style={{ opacity: routeIn }}>
      <div className="relative">
        <div className="absolute left-[10%] right-[10%] top-[5px] h-[2px] rounded-full bg-white/15" />
        <motion.div
          className="absolute left-[10%] top-[5px] h-[2px] rounded-full"
          style={{
            width: '80%',
            scaleX: fill,
            transformOrigin: '0 50%',
            background: 'linear-gradient(90deg, #E20C04, #FF6B3D)',
            boxShadow: '0 0 10px rgba(226,12,4,0.5)',
          }}
        />
        <div className="relative flex">
          {STATUSES.map((status) => (
            <MobileStepDot key={status.num} status={status} jp={jp} />
          ))}
        </div>
      </div>
      <div className="relative mt-2.5 h-9">
        {STATUSES.map((status, i) => (
          <RouteTitle key={status.num} status={status} next={i < STATUSES.length - 1 ? STATUSES[i + 1].at : null} jp={jp} />
        ))}
      </div>
    </motion.div>
  )
}

// The compact copy column: persistent eyebrow, then a fixed slot where the
// section intro, the four beats and the closing line crossfade in reading
// order (the beats reuse BeatLayer, exactly as the desktop column does).
function MobileCopyStack({ jp, slotH }: { jp: MotionValue<number>; slotH: number }) {
  const eyebrowOp = useScrollLinked(useTransform(jp, [jf(2), jf(12)], [0, 1]))
  const introOp = useScrollLinked(useTransform(jp, [jf(6), jf(18), jf(62), jf(76)], [0, 1, 1, 0]))
  const introY = useScrollLinked(useTransform(jp, [jf(6), jf(18)], [16, 0]))
  const closeOp = useScrollLinked(useTransform(jp, [CLOSE_START + jf(10), CLOSE_START + jf(26)], [0, 1]))
  const closeY = useScrollLinked(useTransform(jp, [CLOSE_START + jf(10), CLOSE_START + jf(26)], [16, 0]))
  return (
    <>
      <motion.p
        style={{ opacity: eyebrowOp }}
        className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white/45"
      >
        <span className="h-[2px] w-6 bg-[#E20C04]" aria-hidden="true" />
        {EYEBROW}
      </motion.p>
      <div className="relative mt-3" style={{ height: slotH }}>
        {/* Section intro (arrival), then the beats, then the close: one slot */}
        <motion.div style={{ opacity: introOp, y: introY }} className="absolute inset-0">
          <h2 className="font-display leading-[1.14] text-white" style={{ fontSize: 'clamp(23px, 6.2vw, 30px)', letterSpacing: '-0.4px' }}>
            {HEADLINE_LEAD} <span className="gradient-text">{HEADLINE_INK}</span>
          </h2>
          <p className="mt-3 max-w-[440px] text-[13.5px] leading-[1.56] text-white/60">{INTRO}</p>
        </motion.div>
        {BEATS.map((beat, i) => (
          <BeatLayer key={beat.label} jp={jp} index={i} />
        ))}
        <motion.div style={{ opacity: closeOp, y: closeY }} className="absolute inset-0 flex items-start">
          <p className="font-display max-w-[430px] text-[22px] leading-[1.3] text-white" style={{ letterSpacing: '-0.4px' }}>
            {CLOSING}
            <BrandStop tone="white" />
          </p>
        </motion.div>
      </div>
    </>
  )
}

function JourneyCinemaMobile({ side }: { side: boolean }) {
  const bandRef = useRef<HTMLDivElement>(null)
  const deviceRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress: jp } = useScroll({ target: bandRef, offset: ['start start', 'end end'] })
  const scale = useFitScale(deviceRef, J_BOX.w, J_BOX.h)

  // Arrival: the cluster settles in over the first svh, then the beats drive it.
  const clusterOp = useScrollLinked(useTransform(jp, [jf(2), jf(18)], [0, 1]))
  const clusterY = useScrollLinked(useTransform(jp, [jf(2), jf(22)], [24, 0]))

  const device = (
    <div ref={deviceRef} className="relative min-h-0 flex-1">
      <motion.div className="absolute inset-0 flex items-center justify-center" style={{ opacity: clusterOp, y: clusterY }}>
        <div aria-hidden="true" style={{ width: J_BOX.w, height: J_BOX.h, transform: `scale(${scale})`, transformOrigin: '50% 50%' }}>
          <FrontDeviceCluster jp={jp} />
        </div>
      </motion.div>
    </div>
  )

  return (
    <section ref={bandRef} className="relative" style={{ height: `${JOURNEY_SCROLL + 100}svh`, background: '#010C35' }}>
      {/* Navbar anchor: lands at the band start with the journey header visible */}
      <span id="how-it-works" aria-hidden="true" className="absolute left-0 top-0 block h-px w-px scroll-mt-24" />
      <div className="sticky top-0 flex h-[100svh] flex-col overflow-hidden">
        {/* Backdrop: the map plate as a quiet navy ambience (no stage maths) */}
        <div aria-hidden="true" className="absolute inset-0">
          <Image src="/for-businesses/journey/journey-map-bg.webp" alt="" fill sizes="100vw" className="object-cover" style={{ opacity: 0.5, objectPosition: '62% 50%' }} />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, #010C35 0%, rgba(1,12,53,0.6) 26%, rgba(1,12,53,0.34) 52%, rgba(1,12,53,0.74) 80%, #010C35 100%)' }}
          />
          {side ? (
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(1,12,53,0.9) 0%, rgba(1,12,53,0.55) 34%, rgba(1,12,53,0) 60%)' }} />
          ) : null}
        </div>

        {side ? (
          // Landscape / short: copy left, devices right, stepper along the foot
          <>
            <div className="relative flex min-h-0 flex-1">
              <div className="flex w-[42%] flex-col justify-center px-6 pt-[62px]">
                <MobileCopyStack jp={jp} slotH={150} />
              </div>
              {device}
            </div>
            <div className="relative px-6 pb-3">
              <MobileStepper jp={jp} />
            </div>
          </>
        ) : (
          // Portrait: compact copy on top, cluster in the middle, stepper below
          <>
            <div className="relative px-6 pt-[92px]">
              <MobileCopyStack jp={jp} slotH={176} />
            </div>
            {device}
            <div className="relative px-6 pb-6">
              <MobileStepper jp={jp} />
            </div>
          </>
        )}
      </div>
    </section>
  )
}

// ── Public component: hero + journey as one experience ───────────────────────

export function ForBusinessesCinema({ registerUrl }: { registerUrl: string }) {
  const mode = useViewportMode()
  const reduceMotion = useReducedMotion()

  // Reduced motion (any viewport): the content-complete stacked scenes. The
  // approved hero keeps its own stacked/static handling.
  if (reduceMotion) {
    return (
      <>
        <HeroCinematic registerUrl={registerUrl} />
        <JourneyStacked />
      </>
    )
  }

  // Desktop with motion: one continuous pinned band (hero + journey).
  if (mode === 'desktop') return <CinemaBand registerUrl={registerUrl} />

  // Mobile / tablet / short with motion: HeroStacked leads, then the full
  // scroll-driven journey cinema (portrait, or side-by-side when squat).
  return (
    <>
      <HeroCinematic registerUrl={registerUrl} />
      <JourneyCinemaMobile side={mode === 'short'} />
    </>
  )
}
