'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import { useRef } from 'react'
import { useScrollLinked } from './scroll'
import { useViewportMode } from './useViewportMode'
import { BrandStop } from '@/components/ui/BrandStop'

/**
 * The app journey (owner brief 2026-07-12; copy approved 2026-07-13; revision
 * round 2026-07-13): one pinned phone walks the real customer app through
 * five chapters: Discovery, Merchant profile, Voucher detail, Redemption,
 * Savings. Owner revisions applied (rounds 2026-07-13): the phone is
 * COMPLETELY STILL (any motion read as odd); chapter one opens on the REAL
 * home screen (search + categories) before the feed scroll; no collapsed-
 * header overlay in chapter two (the strip is too short to collapse
 * honestly, and the overlay duplicated the tab row); taps are brand red and
 * deliberately loud (pressing core + double ripple); the voucher detail
 * shows FULL SCREEN (no camera zooms) and is tapped on Redeem; redemption
 * taps High Street then Confirm; the PIN boxes fully cover the baked ones;
 * the success moment RAINS confetti from the top of the phone screen and
 * taps View voucher code; nothing pops out of the phone (the QR pop-out
 * card was cut); the QR screen gets a LONG dwell (it is the significant
 * screen) and the savings screen arrives by SLIDING UP over it: a new flow
 * gets a new transition, not the in-flow crossfade; the trend bars are DOM
 * replicas of the (now blanked) baked bars so all six visibly spring up,
 * Feb-Apr stubs included; the Jul dot is present from screen arrival; the
 * numbers are coherent (this month GBP46 > top places 26+12, Beauty Salon
 * 26 matches, redemptions 23, May visibly below Jul).
 *
 * The savings capture (800x1703) is slightly wider than the screen under
 * object-cover, so overlays aligned to its pixels must go through savX():
 * raw fractions land ~1% left of the artwork and leak red at bar edges.
 *
 * All scroll-linked values go through useScrollLinked (Chrome ScrollTimeline
 * misbinds stacked layers otherwise; see components/landing/scroll.ts).
 */

const CHAPTERS = [
  {
    kicker: '01 · Browse',
    title: 'Every place worth knowing, in one scroll.',
    body: 'Open the app and your area is already laid out: featured places, trending near you, and every category that matters. Each one carries a member voucher. Browsing is free, so you can see everything before you spend a penny.',
    still: '/app-shots/journey/home-top.jpg',
  },
  {
    kicker: '02 · Choose',
    // "before you go." belongs to ch3; this one is the one-tap profile
    title: 'Everything about a place, in one tap.',
    body: 'Tap a place and everything you want to know is in one spot: photos, opening hours, location, member reviews, and the vouchers it offers. No juggling three apps and a search engine. If it is on Redeemo, someone chose it.',
    still: '/app-shots/journey/profile-strip.jpg',
  },
  {
    kicker: '03 · Check',
    title: 'See what you save before you go.',
    body: 'Every voucher shows exactly what it is worth, and the terms in plain English: where it works, when, and for whom. When it says buy one main, get one free, that is exactly what happens at the till.',
    still: '/app-shots/journey/voucher-detail.jpg',
  },
  {
    kicker: '04 · Redeem & save',
    title: 'At the venue, it takes seconds.',
    body: "Tap redeem when you arrive. A quick PIN from the counter confirms you're really there, then your code appears and staff check it on the spot. It works like paying, except you pay less.",
    still: '/app-shots/journey/qr-screen.jpg',
  },
  {
    kicker: '05 · Keep score',
    title: 'Watch it add up.',
    body: 'Every redemption is logged: what you saved, where, and how the months are trending. One dinner voucher typically covers the month of membership. Everything after that is keeping score.',
    still: '/app-shots/journey/savings-top-full.jpg?v=4',
  },
]

// Rail rulings (owner 2026-07-14): Redeem stays (Redeemo is derived from
// redeem) and carries the saving at its true moment; Browse is the free
// entry; Check replaces Know (the reassurance now lives in ch3's body).
const RAIL = ['Browse', 'Choose', 'Check', 'Redeem & save', 'Keep score']

// Phone geometry: captures are 1320x2868, shown at 340px wide so the phone
// sits inside the viewport with air above and below
const PHONE_W = 340
const SCREEN_H = Math.round((PHONE_W * 2868) / 1320) // 739
const HOME_STRIP_H = Math.round((PHONE_W * 2421) / 800)
const PROFILE_STRIP_H = Math.round((PHONE_W * 2350) / 800)
const HOME_HEADER_H = Math.round((PHONE_W * 194) / 800)
const HOME_NAV_H = Math.round((PHONE_W * 152) / 800)

// PIN keypad geometry, fractions of the pin-screen capture
const PIN_KEYS: Record<string, [number, number]> = {
  '1': [0.168, 0.719], '2': [0.497, 0.719], '3': [0.826, 0.719],
  '4': [0.168, 0.777], '5': [0.497, 0.777], '6': [0.826, 0.777],
  '7': [0.168, 0.835], '8': [0.497, 0.835], '9': [0.826, 0.835],
  '0': [0.497, 0.894],
}
const PIN_DIGITS = ['4', '7', '2', '9']
const PIN_BOX_LEFTS = [0.198, 0.352, 0.506, 0.661]
const PIN_BOX = { top: 0.409, w: 0.136, h: 0.08 }
const KEY_TIMES = [0.32, 0.37, 0.42, 0.47]

// Chapter boundaries in global progress. Chapter four runs long so the QR
// screen (the significant one) holds before the savings flow slides in.
const CH_BOUNDS = [0, 0.2, 0.4, 0.6, 0.84, 1]

// Savings capture geometry: the 800x1703 image is cropped ~3.5px each side
// by object-cover, so capture x-fractions must be remapped to the container
const SAV_CAP = { w: 800, h: 1703 }
const SAV_SCALE = Math.max(PHONE_W / SAV_CAP.w, SCREEN_H / SAV_CAP.h)
const SAV_OFF_X = (SAV_CAP.w * SAV_SCALE - PHONE_W) / 2
const savX = (f: number) => (f * SAV_CAP.w * SAV_SCALE - SAV_OFF_X) / PHONE_W

// Savings trend bars: the baked bars are BLANKED out of the capture and
// these DOM replicas spring up in their place. Heights are set so the six
// months sum EXACTLY to the GBP325.45 total (account opened in Feb):
// 28 + 35 + 42 + 78 + 56 + 86.45. Jul (this month, GBP86.45) is tallest,
// so no one can average their way to a contradiction (owner 2026-07-13).
// [x, w, h, colour] in capture fractions; scale = the TRUE baked Jul bar
// height (0.086; the 0.1421 first measured included the baked trend dot
// floating above it) / GBP86.45.
const BAR_BASELINE = 0.5716
const BAR_SPECS: Array<[number, number, number, string]> = [
  [0.1263, 0.0612, 0.0279, '#FACAC8'], [0.265, 0.0612, 0.0348, '#FACAC8'],
  [0.4012, 0.0625, 0.0418, '#FACAC8'], [0.5387, 0.065, 0.0776, '#FACAC8'],
  [0.6775, 0.0638, 0.0557, '#FACAC8'], [0.815, 0.065, 0.086, '#E20B06'],
]

// Top places / By category amounts: blanked in the capture, re-set here so
// the maths reads true against GBP46 this month (owner 2026-07-13)
const AMOUNT_ROWS: Array<{ yc: number; v: string }> = [
  { yc: 0.7089, v: '£26.00' }, { yc: 0.7718, v: '£12.00' }, { yc: 0.9008, v: '£26.00' },
]

// Confetti: a deterministic rain from the top of the phone screen. Hash-based
// pseudo-randoms keep SSR and client renders identical.
const CONFETTI_COLOURS = ['#E20C04', '#E84A00', '#F5B301', '#16A34A', '#2563EB', '#7C3AED', '#FF7A64']
const CONFETTI = Array.from({ length: 42 }, (_, i) => {
  const h = (n: number) => {
    const s = Math.sin((i + 1) * n) * 10000
    return s - Math.floor(s)
  }
  // Everything is rounded: full-precision floats in inline styles fail
  // hydration (the browser serialises them shorter than React's strings)
  const r2 = (v: number) => Math.round(v * 100) / 100
  return {
    x: r2(3 + h(12.9898) * 94),
    sway: Math.round((h(78.233) - 0.5) * 90),
    fall: Math.round(340 + h(43.317) * 380),
    rot: Math.round((h(9.421) - 0.5) * 720),
    colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
    size: r2(6 + h(27.61) * 6),
    delay: r2(h(3.7) * 0.06),
    round: i % 3 === 0,
  }
})

function useBand(progress: MotionValue<number>, input: number[], output: number[]) {
  return useScrollLinked(useTransform(progress, input, output))
}

/** A loud, unmissable fingertip in brand red: pressing core + double ripple */
function Tap({ local, at, x, y }: { local: MotionValue<number>; at: [number, number]; x: string; y: string }) {
  const span = at[1] - at[0]
  const opacity = useBand(local, [at[0], at[0] + 0.012, at[1] - 0.012, at[1]], [0, 1, 1, 0])
  // The core arrives, presses down, and springs back: a real tap, not a dot
  const press = useBand(
    local,
    [at[0], at[0] + span * 0.25, at[0] + span * 0.45, at[0] + span * 0.65, at[1]],
    [0.6, 1.08, 0.78, 1.05, 1],
  )
  const ring1 = useBand(local, [at[0] + span * 0.35, at[1]], [0.5, 2.9])
  const ring1Op = useBand(local, [at[0] + span * 0.35, at[0] + span * 0.5, at[1]], [0, 0.8, 0])
  const ring2 = useBand(local, [at[0] + span * 0.5, at[1]], [0.4, 3.9])
  const ring2Op = useBand(local, [at[0] + span * 0.5, at[0] + span * 0.65, at[1]], [0, 0.55, 0])
  return (
    <div className="absolute pointer-events-none" style={{ left: x, top: y }}>
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full"
        style={{
          opacity,
          scale: press,
          background: 'radial-gradient(circle, rgba(226,12,4,0.9) 0%, rgba(226,12,4,0.55) 55%, rgba(226,12,4,0.25) 100%)',
          boxShadow: '0 4px 18px rgba(226,12,4,0.55), inset 0 0 0 2.5px rgba(255,255,255,0.95)',
        }}
      />
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full border-[3px] border-[#E20C04]"
        style={{ opacity: ring1Op, scale: ring1 }}
      />
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full border-2 border-[#E20C04]"
        style={{ opacity: ring2Op, scale: ring2 }}
      />
    </div>
  )
}

function Screen({ opacity, children, bg = '#FFF9F5' }: { opacity: MotionValue<number>; children: React.ReactNode; bg?: string }) {
  return (
    <motion.div className="absolute inset-0 overflow-hidden" style={{ opacity, background: bg }}>
      {children}
    </motion.div>
  )
}

function ConfettiPiece({ local, p }: { local: MotionValue<number>; p: (typeof CONFETTI)[number] }) {
  const t0 = 0.565 + p.delay
  const t1 = t0 + 0.2
  const mid = (t0 + t1) / 2
  const y = useBand(local, [t0, t1], [0, p.fall])
  const x = useBand(local, [t0, mid, t1], [0, p.sway * 0.55, p.sway])
  const rotate = useBand(local, [t0, t1], [0, p.rot])
  const opacity = useBand(local, [t0, t0 + 0.015, t1 - 0.05, t1], [0, 1, 1, 0])
  return (
    <motion.span
      className={`absolute pointer-events-none ${p.round ? 'rounded-full' : 'rounded-[2px]'}`}
      style={{
        left: `${p.x}%`,
        top: -14,
        width: p.size,
        height: p.round ? p.size : Math.round(p.size * 55) / 100,
        background: p.colour,
        x,
        y,
        rotate,
        opacity,
      }}
    />
  )
}

function Stage() {
  const trackRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })
  // Layout is mode-driven, not breakpoint-driven: landscape phones are
  // "mobile width" with a fraction of the height (owner 2026-07-13), so
  // 'short' lays copy and phone side by side and sizes the phone to fit
  const mode = useViewportMode()
  const phoneScale = mode === 'desktop' ? 1 : mode === 'tablet' ? 0.68 : mode === 'short' ? 0.4 : 0.55

  const bg = useTransform(
    scrollYProgress,
    CH_BOUNDS,
    ['#FFF9F5', '#FFFFFF', '#FFFFFF', '#FFF6F3', '#FFFFFF', '#FFF9F5'],
  )

  // The rail spine fills node by node as chapters begin
  const railFill = useBand(scrollYProgress, CH_BOUNDS, [0, 0.25, 0.5, 0.75, 1, 1])

  // Chapter screen opacities (crossfades within the app flow). The phone
  // itself is completely still (owner 2026-07-13): the life is on-screen.
  // Chapter five does NOT crossfade: it is a new flow, so it slides up
  // over the QR screen instead (see ch5Y below).
  const op1 = useBand(scrollYProgress, [0, 0.185, 0.205], [1, 1, 0])
  const op2 = useBand(scrollYProgress, [0.185, 0.205, 0.385, 0.405], [0, 1, 1, 0])
  const op3 = useBand(scrollYProgress, [0.385, 0.405, 0.585, 0.605], [0, 1, 1, 0])
  const op4 = useBand(scrollYProgress, [0.585, 0.605, 0.875, 0.895], [0, 1, 1, 0])

  const L1 = useTransform(scrollYProgress, [CH_BOUNDS[0], CH_BOUNDS[1]], [0, 1])
  const L2 = useTransform(scrollYProgress, [CH_BOUNDS[1], CH_BOUNDS[2]], [0, 1])
  const L3 = useTransform(scrollYProgress, [CH_BOUNDS[2], CH_BOUNDS[3]], [0, 1])
  const L4 = useTransform(scrollYProgress, [CH_BOUNDS[3], CH_BOUNDS[4]], [0, 1])
  const L5 = useTransform(scrollYProgress, [0.875, 1], [0, 1])

  // The flow break: savings pushes up like a fresh app context while the
  // QR screen dims beneath it
  const ch5Y = useBand(scrollYProgress, [0.835, 0.875], [SCREEN_H, 0])
  const qrDim = useBand(scrollYProgress, [0.835, 0.875], [0, 0.35])

  /* Chapter 1: the real home screen first, then the feed scroll */
  const homeTopOp = useBand(L1, [0.26, 0.34], [1, 0])
  const homeY = useBand(L1, [0.34, 0.76], [0, -(HOME_STRIP_H - SCREEN_H)])

  /* Chapter 2: profile scrolls naturally; no overlay, no duplicated tabs */
  const profY = useBand(L2, [0.1, 0.62], [0, -(PROFILE_STRIP_H - SCREEN_H)])

  /* Chapter 3: full screen; the redeem button glows, then gets tapped */
  const redeemGlow = useBand(L3, [0.3, 0.55, 0.72, 0.95], [0, 1, 1, 0.5])

  /* Chapter 4: High Street tap, Confirm tap, PIN, confetti success, then a
     LONG QR dwell: the flow's destination screen holds until the next flow
     pushes in */
  const branchOp = useBand(L4, [0, 0.26, 0.3], [1, 1, 0])
  const pinOp = useBand(L4, [0.26, 0.3, 0.54, 0.59], [0, 1, 1, 0])
  const flash = useBand(L4, [0.54, 0.58, 0.62], [0, 0.55, 0])
  const successOp = useBand(L4, [0.56, 0.6, 0.78, 0.83], [0, 1, 1, 0])
  const successScale = useBand(L4, [0.56, 0.64], [0.93, 1])
  const qrOp = useBand(L4, [0.8, 0.85, 1], [0, 1, 1])
  const pinDigitOps = KEY_TIMES.map((t) => useBand(L4, [t + 0.012, t + 0.03], [0, 1]))
  const keyFlashes = KEY_TIMES.map((t) => useBand(L4, [t - 0.012, t, t + 0.025], [0, 1, 0]))

  /* Chapter 5: the ledger counts itself: total, month, redemptions, bars */
  const totalNum = useBand(L5, [0.06, 0.46], [0, 325.45])
  const totalText = useTransform(totalNum, (v) => `£${v.toFixed(2)}`)
  const monthNum = useBand(L5, [0.12, 0.5], [0, 86.45])
  const monthText = useTransform(monthNum, (v) => `£${v.toFixed(2)}`)
  const redemptionsNum = useBand(L5, [0.2, 0.48], [0, 23])
  const redemptionsText = useTransform(redemptionsNum, (v) => `${Math.round(v)}`)
  const barsGrow = BAR_SPECS.map(([, , h], i) =>
    useBand(L5, [0.26 + i * 0.08, 0.36 + i * 0.08, 0.42 + i * 0.08], [0, h < 0.02 ? 2.4 : 1.12, 1]),
  )

  return (
    <div ref={trackRef} className="relative" style={{ height: '780vh', background: '#FFF9F5' }}>
      {/* svh on mobile: iOS Safari's vh includes the collapsed toolbar */}
      <motion.div className="sticky top-0 h-[100svh] lg:h-screen overflow-hidden" style={{ background: bg }}>
        <div
          className={`relative max-w-7xl mx-auto h-full px-6 ${
            mode === 'desktop'
              ? 'grid grid-cols-[164px_1fr_400px] gap-8 items-center'
              : mode === 'short'
              ? 'flex flex-row items-center justify-center gap-10 pt-2'
              : 'flex flex-col justify-center gap-3 pt-6'
          }`}
        >

          {/* Progress rail (desktop only): numbered nodes on a spine that
              fills with the scroll; the active step glows in the brand
              gradient. Column widened to 164px so two-word labels never
              collide with the copy (owner 2026-07-14). */}
          {mode === 'desktop' && (
            <div className="relative flex flex-col gap-7 select-none" aria-hidden="true">
              <div className="absolute left-[11px] top-3 bottom-3 w-[2px] rounded-full bg-[#010C35]/10" />
              <motion.div
                className="absolute left-[11px] top-3 bottom-3 w-[2px] rounded-full origin-top"
                style={{ scaleY: railFill, background: 'var(--brand-gradient)' }}
              />
              {RAIL.map((label, i) => (
                <RailItem key={label} progress={scrollYProgress} index={i} label={label} />
              ))}
            </div>
          )}

          {/* Chapter copy */}
          <div
            className={
              mode === 'desktop'
                ? 'relative min-h-[420px] max-w-[560px]'
                : mode === 'short'
                ? 'relative flex-1 min-h-[250px] max-w-[440px]'
                : `relative ${mode === 'tablet' ? 'min-h-[290px]' : 'min-h-[250px]'} max-w-[560px] w-full`
            }
          >
            {CHAPTERS.map((c, i) => (
              <CopyLayer key={c.kicker} progress={scrollYProgress} index={i} chapter={c} />
            ))}
          </div>

          {/* The phone: upright, still, readable: all the life is on-screen.
              Below desktop the whole phone (overlays, taps, confetti and
              all) scales as one object via a transform; the footprint must
              clear the REAL viewport height (portrait iOS ~740px with
              toolbars; landscape phones ~330px, hence 'short'). */}
          <div
            className={`relative ${mode === 'desktop' ? 'justify-self-end' : mode === 'short' ? 'flex-shrink-0' : 'self-center'}`}
            style={
              mode === 'desktop'
                ? undefined
                : { width: Math.round((PHONE_W + 20) * phoneScale), height: Math.round(759 * phoneScale) + (mode === 'short' ? 0 : 22) }
            }
          >
            <div className="origin-top-left" style={{ width: PHONE_W + 20, scale: phoneScale === 1 ? undefined : phoneScale }}>
            <div
              className="relative rounded-[50px] bg-[#10101c] p-[10px]"
              style={{
                width: PHONE_W + 20,
                boxShadow: '0 36px 80px rgba(1,12,53,0.26), 0 8px 22px rgba(1,12,53,0.15), inset 0 0 0 2px rgba(255,255,255,0.06)',
              }}
            >
              <div className="relative rounded-[41px] overflow-hidden bg-[#FFF9F5]" style={{ width: PHONE_W, height: SCREEN_H }}>

                {/* ── 01 Discovery ── */}
                <Screen opacity={op1}>
                  <motion.div className="absolute inset-x-0" style={{ y: homeY, top: 0, height: HOME_STRIP_H }}>
                    <Image src="/app-shots/journey/home-strip.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
                  </motion.div>
                  <div className="absolute inset-x-0 top-0" style={{ height: HOME_HEADER_H }}>
                    <Image src="/app-shots/journey/home-header.jpg" alt="" fill sizes="340px" className="object-cover" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0" style={{ height: HOME_NAV_H }}>
                    <Image src="/app-shots/journey/home-nav.jpg" alt="" fill sizes="340px" className="object-cover" />
                  </div>
                  {/* The real home screen opens the chapter */}
                  <motion.div className="absolute inset-0" style={{ opacity: homeTopOp }}>
                    <Image src="/app-shots/journey/home-top.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
                  </motion.div>
                  <Tap local={L1} at={[0.82, 0.97]} x="34%" y="66%" />
                </Screen>

                {/* ── 02 Merchant profile ── */}
                <Screen opacity={op2}>
                  <motion.div className="absolute inset-x-0" style={{ y: profY, top: 0, height: PROFILE_STRIP_H }}>
                    <Image src="/app-shots/journey/profile-strip.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
                  </motion.div>
                  <Tap local={L2} at={[0.78, 0.94]} x="76%" y="86%" />
                </Screen>

                {/* ── 03 Voucher detail: full screen, no camera tricks ── */}
                <Screen opacity={op3}>
                  <Image src="/app-shots/journey/voucher-detail.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
                  <motion.div
                    className="absolute rounded-2xl pointer-events-none"
                    style={{
                      left: '4.5%', width: '91%', top: '86.9%', height: '7.6%',
                      opacity: redeemGlow,
                      boxShadow: '0 0 0 3px rgba(255,255,255,0.6), 0 0 30px rgba(226,12,4,0.5)',
                    }}
                  />
                  <Tap local={L3} at={[0.74, 0.92]} x="50%" y="90.5%" />
                </Screen>

                {/* ── 04 Redemption ── */}
                <Screen opacity={op4} bg="#2a1a3e">
                  <motion.div className="absolute inset-0" style={{ opacity: branchOp }}>
                    <Image src="/app-shots/journey/branch-sheet.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
                    <Tap local={L4} at={[0.05, 0.14]} x="50%" y="79%" />
                    <Tap local={L4} at={[0.16, 0.25]} x="50%" y="94.5%" />
                  </motion.div>

                  <motion.div className="absolute inset-0" style={{ opacity: pinOp }}>
                    <Image src="/app-shots/journey/pin-screen.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
                    {PIN_BOX_LEFTS.map((left, i) => (
                      <div
                        key={i}
                        className="absolute rounded-xl bg-white flex items-center justify-center"
                        style={{
                          left: `${left * 100}%`, top: `${PIN_BOX.top * 100}%`,
                          width: `${PIN_BOX.w * 100}%`, height: `${PIN_BOX.h * 100}%`,
                          border: '2px solid #F1D9D4',
                        }}
                      >
                        <motion.span className="font-display text-[22px] text-[#010C35]" style={{ opacity: pinDigitOps[i] }}>
                          {PIN_DIGITS[i]}
                        </motion.span>
                      </div>
                    ))}
                    {PIN_DIGITS.map((d, i) => {
                      const [kx, ky] = PIN_KEYS[d]
                      return (
                        <motion.div
                          key={i}
                          className="absolute rounded-lg pointer-events-none"
                          style={{
                            left: `${(kx - 0.145) * 100}%`, top: `${(ky - 0.024) * 100}%`,
                            width: '29%', height: '4.8%',
                            opacity: keyFlashes[i],
                            background: 'rgba(226,12,4,0.22)',
                            boxShadow: '0 0 0 2px rgba(226,12,4,0.45)',
                          }}
                        />
                      )
                    })}
                  </motion.div>

                  <motion.div className="absolute inset-0" style={{ opacity: successOp, scale: successScale }}>
                    <Image src="/app-shots/journey/success-sheet.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
                    <Tap local={L4} at={[0.68, 0.77]} x="50%" y="65.5%" />
                  </motion.div>
                  {/* the success lands with a flash and brand confetti */}
                  <motion.div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: flash }} />
                  {CONFETTI.map((p, i) => (
                    <ConfettiPiece key={i} local={L4} p={p} />
                  ))}

                  <motion.div className="absolute inset-0" style={{ opacity: qrOp }}>
                    <Image src="/app-shots/journey/qr-screen.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
                  </motion.div>
                  {/* the redemption flow dims as the savings flow pushes in */}
                  <motion.div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: qrDim }} />
                </Screen>

                {/* ── 05 Savings: a NEW flow, so it slides up over the QR
                       screen instead of crossfading, then counts itself up ── */}
                <motion.div
                  className="absolute inset-0 overflow-hidden"
                  style={{ y: ch5Y, background: '#F8F7F5', boxShadow: '0 -22px 48px rgba(1,12,53,0.4)' }}
                >
                  {/* ?v=3: the asset was re-baked in place (bars + amounts
                      blanked); the query busts optimizer + browser caches */}
                  <Image src="/app-shots/journey/savings-top.jpg?v=3" alt="" fill sizes="340px" className="object-cover object-top" />
                  <div className="absolute flex items-center" style={{ left: '4.8%', top: '13.9%', height: '5.6%' }}>
                    <motion.span className="font-display text-white leading-none" style={{ fontSize: 37, letterSpacing: '-0.8px' }}>
                      {totalText}
                    </motion.span>
                  </div>
                  <div className="absolute flex items-center" style={{ left: '8.6%', top: '25.4%', height: '3.6%' }}>
                    <motion.span className="font-display text-white leading-none" style={{ fontSize: 19 }}>
                      {monthText}
                    </motion.span>
                  </div>
                  <div className="absolute flex items-center" style={{ left: '55.2%', top: '25.4%', height: '3.6%' }}>
                    <motion.span className="font-display text-white leading-none" style={{ fontSize: 19 }}>
                      {redemptionsText}
                    </motion.span>
                  </div>
                  {BAR_SPECS.map(([bx, bw, bh, colour], i) => (
                    <motion.div
                      key={i}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${savX(bx) * 100}%`, width: `${(savX(bx + bw) - savX(bx)) * 100}%`,
                        top: `${(BAR_BASELINE - bh) * 100}%`, height: `${bh * 100}%`,
                        background: colour, borderRadius: '3px 3px 0 0',
                        scaleY: barsGrow[i], transformOrigin: 'bottom',
                      }}
                    />
                  ))}
                  {/* the current-month dot sits above the Jul bar from the
                      moment the screen arrives (owner: no delayed pop-in) */}
                  {/* the design's own dot position (it was baked at y 0.429
                      before the bar-blank erased it) */}
                  <div
                    className="absolute w-2 h-2 -translate-x-1/2 rounded-full bg-[#E20C04]"
                    style={{ left: `${savX(0.8469) * 100}%`, top: '42.9%' }}
                  />
                  {/* Top places + By category amounts, re-set over the
                      blanked capture so the sums read true against £46 */}
                  {AMOUNT_ROWS.map((row) => (
                    <div
                      key={row.yc}
                      className="absolute flex items-center justify-end"
                      style={{ left: `${savX(0.7) * 100}%`, width: `${(savX(0.915) - savX(0.7)) * 100}%`, top: `${(row.yc - 0.012) * 100}%`, height: '2.4%' }}
                    >
                      <span className="font-body font-semibold" style={{ fontSize: 13, color: '#16A951' }}>{row.v}</span>
                    </div>
                  ))}
                </motion.div>
              </div>

              {/* Notch */}
              <div className="absolute left-1/2 -translate-x-1/2 top-[19px] w-[96px] h-[23px] rounded-full bg-[#10101c]" />
            </div>
            </div>

            {/* absolute below desktop: the scaled phone keeps its unscaled
                layout height, so normal flow would land this far too low.
                Hidden when short: no vertical room for it. */}
            {mode !== 'short' && (
              <p className={mode === 'desktop' ? 'mt-4 text-center text-[10px] text-[#010C35]/40' : 'absolute bottom-0 inset-x-0 text-center text-[9px] text-[#010C35]/40'}>
                App preview · example places, not live listings
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function RailItem({ progress, index, label }: { progress: MotionValue<number>; index: number; label: string }) {
  const a = CH_BOUNDS[index]
  const b = CH_BOUNDS[index + 1]
  // The node fills the moment its chapter begins and stays filled
  const filled = useBand(
    progress,
    index === 0 ? [0, 0.001] : [a - 0.015, a + 0.015],
    index === 0 ? [1, 1] : [0, 1],
  )
  // The glow ring belongs to the ACTIVE chapter only
  const glow = useBand(
    progress,
    [a - 0.02, a + 0.02, b - 0.02, b + 0.02],
    index === 0 ? [1, 1, 1, 0] : index === 4 ? [0, 1, 1, 1] : [0, 1, 1, 0],
  )
  const labelOp = useBand(
    progress,
    [a - 0.02, a + 0.02, b - 0.02, b + 0.02],
    index === 0 ? [1, 1, 1, 0.32] : index === 4 ? [0.32, 1, 1, 1] : [0.32, 1, 1, 0.32],
  )
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-6 h-6 flex-shrink-0">
        <motion.div
          className="absolute -inset-[5px] rounded-full"
          style={{ opacity: glow, boxShadow: '0 0 0 5px rgba(226,12,4,0.12), 0 4px 16px rgba(226,12,4,0.3)' }}
        />
        <div className="absolute inset-0 rounded-full bg-[#FFF9F5] border-[1.5px] border-[#010C35]/20" />
        <motion.div className="absolute inset-0 rounded-full" style={{ opacity: filled, background: 'var(--brand-gradient)' }} />
        <span className="absolute inset-0 flex items-center justify-center text-[10.5px] font-bold text-[#010C35]/45">{index + 1}</span>
        <motion.span className="absolute inset-0 flex items-center justify-center text-[10.5px] font-bold text-white" style={{ opacity: filled }}>
          {index + 1}
        </motion.span>
      </div>
      <motion.span
        className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#010C35] whitespace-nowrap"
        style={{ opacity: labelOp }}
      >
        {label}
      </motion.span>
    </div>
  )
}

function CopyLayer({ progress, index, chapter }: { progress: MotionValue<number>; index: number; chapter: (typeof CHAPTERS)[number] }) {
  const a = CH_BOUNDS[index]
  const b = CH_BOUNDS[index + 1]
  const opacity = useBand(
    progress,
    index === 0 ? [0, 0.15, b - 0.015] : index === 4 ? [a + 0.015, a + 0.05, 1] : [a + 0.015, a + 0.05, b - 0.05, b - 0.015],
    index === 0 ? [1, 1, 0] : index === 4 ? [0, 1, 1] : [0, 1, 1, 0],
  )
  const y = useBand(progress, [a, b], index === 0 ? [0, -24] : index === 4 ? [24, 0] : [24, -24])
  return (
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
      <motion.div style={{ opacity, y }}>
        <p className="text-[11px] lg:text-[12px] font-bold tracking-[0.2em] uppercase mb-2 lg:mb-5 text-[#E20C04]">{chapter.kicker}</p>
        <h3 className="font-display text-[#010C35] leading-[1.08] mb-2.5 lg:mb-5" style={{ fontSize: 'clamp(24px, 3.4vw, 50px)', letterSpacing: '-0.7px' }}>
          {/* finale gets the journey's one Brand Full Stop (text mirrors
              CHAPTERS[4].title) */}
          {index === 4 ? (
            <>Watch it add <span className="whitespace-nowrap">up<BrandStop /></span></>
          ) : (
            chapter.title
          )}
        </h3>
        <p className="text-[13.5px] lg:text-[16px] leading-[1.55] lg:leading-[1.7] max-w-[460px] text-[#4B5563]">{chapter.body}</p>
        {index === 4 && (
          <div className="mt-4 lg:mt-8 flex items-center gap-3 lg:gap-4 flex-wrap">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 text-white font-bold text-[15px] px-6 py-3 rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 20px rgba(226,12,4,0.3)' }}
            >
              Create free account
            </Link>
            <span className="hidden lg:inline text-[13px] text-[#6B7280]">Free to join, no card needed · 2 months free at&nbsp;launch</span>
          </div>
        )}
      </motion.div>
    </div>
  )
}

/** Static fallback: reduced-motion visitors */
function StaticJourney() {
  return (
    <section className="px-6 py-16" style={{ background: '#FFF9F5' }} aria-label="How the app works">
      <div className="max-w-xl mx-auto flex flex-col gap-14">
        {CHAPTERS.map((c) => (
          <div key={c.kicker}>
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase mb-3 text-[#E20C04]">{c.kicker}</p>
            <h3 className="font-display text-[#010C35] leading-[1.1] mb-3" style={{ fontSize: '26px', letterSpacing: '-0.4px' }}>
              {c.title}
            </h3>
            <p className="text-[14.5px] leading-[1.65] text-[#4B5563] mb-5">{c.body}</p>
            <div className="relative mx-auto w-[260px] rounded-[40px] bg-[#10101c] p-[8px]" style={{ boxShadow: '0 22px 48px rgba(1,12,53,0.2)' }}>
              <div className="relative rounded-[33px] overflow-hidden" style={{ height: 480 }}>
                <Image src={c.still} alt="" fill sizes="260px" className="object-cover object-top" />
              </div>
            </div>
          </div>
        ))}
        <div className="text-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 text-white font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline"
            style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 20px rgba(226,12,4,0.3)' }}
          >
            Create free account
          </Link>
          <p className="mt-3 text-[12.5px] text-[#6B7280]">Free to join · founding members get 2 months free at launch</p>
        </div>
      </div>
    </section>
  )
}

export function AppJourneySection() {
  // The cinema runs at EVERY viewport (owner 2026-07-13: mobile must get
  // the real animated journey, not stills); the static fallback is for
  // reduced-motion visitors only.
  const reduceMotion = useReducedMotion()
  return reduceMotion ? <StaticJourney /> : <Stage />
}
