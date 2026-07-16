'use client'

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
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
const BEAT = 85
const CLOSE = 70
const JOURNEY_SCROLL = ARRIVE + BEAT * 4 + CLOSE // 480
const TOTAL_SCROLL = HERO_SCROLL + JOURNEY_SCROLL // 555
const F_HERO = HERO_SCROLL / TOTAL_SCROLL

// Journey-local fraction helper: svh into [0..1] of the journey slice.
const jf = (svh: number) => svh / JOURNEY_SCROLL

const BEAT_START = [0, 1, 2, 3].map((i) => jf(ARRIVE + i * BEAT))
const CLOSE_START = jf(ARRIVE + BEAT * 4)
const FADE = jf(10) // standard crossfade slice
const CONFIRM_AT = BEAT_START[3] + jf(38) // validated success + green stop

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
  at: number // journey progress where this stop activates
}

const STATUSES: Status[] = [
  { num: '01', kicker: 'Voucher ready', title: 'Terms set. Ready to submit.', kind: 'red', at: 0.2 },
  { num: '02', kicker: 'Offer live', title: 'Visible on Redeemo.', kind: 'red', at: 0.345 },
  { num: '03', kicker: 'Found nearby', title: 'A customer is viewing your voucher.', kind: 'amber', at: 0.42 },
  { num: '04', kicker: 'At the till', title: 'Code ready to validate.', kind: 'red', at: 0.565 },
  { num: '05', kicker: 'Redemption confirmed', title: 'Voucher and branch recorded.', kind: 'green', at: CONFIRM_AT + 0.012 },
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

// The app home feed, scroll-scrubbed: the hero's own assets (pinned header +
// nav over a moving strip), rendered in an 800-wide design space scaled into
// the phone's screen rect.
function PhoneFeed({ opacity, feedY }: { opacity: MotionValue<number> | number; feedY: MotionValue<number> | number }) {
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
    </motion.div>
  )
}

function FrontDeviceCluster({ jp, armed }: { jp: MotionValue<number>; armed: boolean }) {
  const [s1, s2, s3, s4] = BEAT_START

  // Laptop: builder (pinned chrome + scrolling pane) -> validate -> validated.
  const builderOp = useScrollLinked(useTransform(jp, [s4, s4 + FADE], [1, 0]))
  const validateOp = useScrollLinked(useTransform(jp, [s4, s4 + FADE, CONFIRM_AT, CONFIRM_AT + FADE], [0, 1, 1, 0]))
  const validatedOp = useScrollLinked(useTransform(jp, [CONFIRM_AT, CONFIRM_AT + FADE], [0, 1]))
  const paneY = useScrollLinked(useTransform(jp, [s1 + jf(6), s2 - jf(8)], [0, -PANE_TRAVEL]))

  // Phone: customer preview -> home feed scroll -> code -> customer success.
  const previewOp = useScrollLinked(useTransform(jp, [s2, s2 + FADE], [1, 0]))
  const feedOp = useScrollLinked(useTransform(jp, [s2, s2 + FADE, s3, s3 + FADE], [0, 1, 1, 0]))
  const feedY = useScrollLinked(useTransform(jp, [s2 + jf(4), s3 - jf(6)], [0, -FEED_TRAVEL2]))
  const codeOp = useScrollLinked(useTransform(jp, [s3, s3 + FADE, CONFIRM_AT, CONFIRM_AT + FADE], [0, 1, 1, 0]))
  const successOp = useScrollLinked(useTransform(jp, [CONFIRM_AT, CONFIRM_AT + FADE], [0, 1]))

  // Focus: the resting device sits behind a light navy veil.
  const laptopVeil = useScrollLinked(useTransform(jp, [s2, s2 + FADE, s4, s4 + FADE], [0, 0.42, 0.42, 0]))
  const phoneVeil = useScrollLinked(useTransform(jp, [s4, s4 + FADE], [0, 0.3]))

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
        <ChapterImage src="/for-businesses/journey/journey-phone-preview.webp" opacity={previewOp} eager sizes="220px" />
        <PhoneFeed opacity={feedOp} feedY={feedY} />
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
  const headerOp = useScrollLinked(useTransform(jp, [jf(26), jf(40)], [0, 1]))
  const headerY = useScrollLinked(useTransform(jp, [jf(26), jf(40)], [22, 0]))

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

  // Mount later journey chapters once the visitor starts moving (keeps them
  // out of the first-paint payload; they load well before they are seen).
  const [armed, setArmed] = useState(false)
  useMotionValueEvent(p, 'change', (v) => {
    if (v > 0.03) setArmed(true)
  })

  // Change events do not fire on mount: seed both states for reloads and
  // deep links that restore scroll mid-band (otherwise the armed chapters
  // stay unmounted and the screens sit blank until the first scroll).
  useEffect(() => {
    if (p.get() > 0.03) setArmed(true)
    setHeroGone(jp.get() > jf(14))
  }, [p, jp])

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
                  <FrontDeviceCluster jp={jp} armed={armed} />
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
                  <StatusChip key={STATUSES[si].num} status={STATUSES[si]} />
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
