'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import { useRef } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The app journey (owner brief 2026-07-12; copy approved 2026-07-13; revision
 * round 2026-07-13): one pinned phone walks the real customer app through
 * five chapters: Discovery, Merchant profile, Voucher detail, Redemption,
 * Savings. Owner revisions applied: NO horizontal tilt (the screen must stay
 * fully readable: only gentle vertical tilt, sideways drift and breathing);
 * chapter one opens on the REAL home screen (search + categories) before the
 * feed scroll; no collapsed-header overlay in chapter two (the strip is too
 * short to collapse honestly, and the overlay duplicated the tab row); taps
 * are brand red; the voucher detail shows FULL SCREEN (no camera zooms) and
 * is tapped on Redeem; redemption taps High Street then Confirm; the PIN
 * boxes fully cover the baked ones; the success moment gets a confetti
 * burst and a tap on View voucher code; the QR card pops OUT of the phone;
 * the savings chapter counts all three numbers and stays on one screen.
 *
 * All scroll-linked values go through useScrollLinked (Chrome ScrollTimeline
 * misbinds stacked layers otherwise; see components/landing/scroll.ts).
 */

const CHAPTERS = [
  {
    kicker: '01 · Find',
    title: 'Every place worth knowing, in one scroll.',
    body: 'Open the app and your area is already laid out: featured places, trending near you, and every category that matters. Each one carries a member voucher. Browsing is free, so you can see everything before you spend a penny.',
    still: '/app-shots/journey/home-top.jpg',
  },
  {
    kicker: '02 · Choose',
    title: 'Get the full picture before you go.',
    body: 'Tap a place and everything you want to know is in one spot: photos, opening hours, location, member reviews, and the vouchers it offers. No juggling three apps and a search engine. If it is on Redeemo, someone chose it.',
    still: '/app-shots/journey/profile-strip.jpg',
  },
  {
    kicker: '03 · Know',
    title: 'No small-print surprises.',
    body: 'The saving, the terms, where it works and when: all in plain English before you commit. When it says buy one main, get one free, that is exactly what happens at the till.',
    still: '/app-shots/journey/voucher-detail.jpg',
  },
  {
    kicker: '04 · Redeem',
    title: 'At the venue, it takes seconds.',
    body: "Tap redeem when you arrive. A quick PIN from the counter confirms you're really there, then your code appears and staff check it on the spot. It works like paying, except you pay less.",
    still: '/app-shots/journey/qr-screen.jpg',
  },
  {
    kicker: '05 · Keep score',
    title: 'Watch it add up.',
    body: 'Every redemption is logged: what you saved, where, and how the months are trending. One dinner voucher typically covers the month of membership. Everything after that is keeping score.',
    still: '/app-shots/journey/savings-top-full.jpg',
  },
]

const RAIL = ['Find', 'Choose', 'Know', 'Redeem', 'Keep score']

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
const KEY_TIMES = [0.36, 0.42, 0.48, 0.54]

// Savings trend bars (fractions of the 888x1890 capture): [x, w, topFrac]
const BARS: Array<[number, number, number]> = [
  [0.12, 0.07, 0.5575], [0.258, 0.07, 0.5575], [0.397, 0.07, 0.5575],
  [0.535, 0.071, 0.437], [0.674, 0.07, 0.489], [0.812, 0.07, 0.48],
]
const BAR_BASE = 0.575

// Confetti: deterministic burst in brand colours (dx%, fall px, rotate, colour, size, delay)
const CONFETTI: Array<[number, number, number, string, number, number]> = [
  [-120, 210, 200, '#E20C04', 8, 0], [-92, 250, -160, '#E84A00', 7, 0.01], [-66, 190, 140, '#16A34A', 6, 0.02],
  [-44, 260, -220, '#F5B301', 8, 0], [-20, 230, 180, '#2563EB', 7, 0.015], [4, 270, -140, '#E20C04', 9, 0.005],
  [26, 220, 160, '#7C3AED', 6, 0.02], [50, 255, -190, '#16A34A', 8, 0.01], [74, 200, 150, '#E84A00', 7, 0],
  [100, 245, -170, '#F5B301', 6, 0.015], [124, 215, 130, '#E20C04', 7, 0.02], [-105, 165, -120, '#2563EB', 6, 0.025],
  [-58, 285, 210, '#E84A00', 6, 0.03], [12, 175, -150, '#16A34A', 7, 0.025], [64, 290, 170, '#E20C04', 6, 0.03],
  [112, 180, -130, '#7C3AED', 7, 0.025], [-30, 300, 120, '#F5B301', 6, 0.035], [38, 195, -110, '#2563EB', 6, 0.035],
]

function useBand(progress: MotionValue<number>, input: number[], output: number[]) {
  return useScrollLinked(useTransform(progress, input, output))
}

/** A visible fingertip in brand red: dot + expanding ring */
function Tap({ local, at, x, y }: { local: MotionValue<number>; at: [number, number]; x: string; y: string }) {
  const mid = (at[0] + at[1]) / 2
  const opacity = useBand(local, [at[0], at[0] + 0.015, mid, at[1]], [0, 1, 1, 0])
  const ring = useBand(local, [at[0], at[1]], [0.5, 2.1])
  const ringOpacity = useBand(local, [at[0], mid, at[1]], [0.6, 0.35, 0])
  return (
    <div className="absolute pointer-events-none" style={{ left: x, top: y }}>
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full"
        style={{ opacity, background: 'rgba(226,12,4,0.5)', boxShadow: '0 2px 12px rgba(226,12,4,0.4), inset 0 0 0 1.5px rgba(255,255,255,0.85)' }}
      />
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-[#E20C04]"
        style={{ opacity: ringOpacity, scale: ring }}
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
  const [dx, fall, rot, colour, size, delay] = p
  const t0 = 0.635 + delay
  const t1 = t0 + 0.17
  const y = useBand(local, [t0, t1], [-30, fall])
  const x = useBand(local, [t0, t1], [0, dx])
  const rotate = useBand(local, [t0, t1], [0, rot])
  const opacity = useBand(local, [t0, t0 + 0.02, t1 - 0.04, t1], [0, 1, 1, 0])
  return (
    <motion.span
      className="absolute rounded-[2px] pointer-events-none"
      style={{ left: '50%', top: '36%', width: size, height: size * 0.6, background: colour, x, y, rotate, opacity }}
    />
  )
}

function Stage() {
  const trackRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })

  const bg = useTransform(
    scrollYProgress,
    [0, 0.2, 0.4, 0.6, 0.8, 1],
    ['#FFF9F5', '#FFFFFF', '#FFFFFF', '#FFF6F3', '#FFFFFF', '#FFF9F5'],
  )

  // The phone never tilts sideways (owner): it drifts gently, nods forward
  // and back, and breathes: the screen stays fully readable throughout
  const rotX = useBand(scrollYProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], [4, -2.5, 3.5, -2.5, 3, -2])
  const driftX = useBand(scrollYProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], [10, -10, 8, -9, 7, -6])
  const phoneY = useBand(scrollYProgress, [0, 1], [14, -14])

  // Chapter screen opacities (crossfade at each 0.2 boundary)
  const op1 = useBand(scrollYProgress, [0, 0.185, 0.205], [1, 1, 0])
  const op2 = useBand(scrollYProgress, [0.185, 0.205, 0.385, 0.405], [0, 1, 1, 0])
  const op3 = useBand(scrollYProgress, [0.385, 0.405, 0.585, 0.605], [0, 1, 1, 0])
  const op4 = useBand(scrollYProgress, [0.585, 0.605, 0.785, 0.805], [0, 1, 1, 0])
  const op5 = useBand(scrollYProgress, [0.785, 0.805, 1], [0, 1, 1])

  const L1 = useTransform(scrollYProgress, [0, 0.2], [0, 1])
  const L2 = useTransform(scrollYProgress, [0.2, 0.4], [0, 1])
  const L3 = useTransform(scrollYProgress, [0.4, 0.6], [0, 1])
  const L4 = useTransform(scrollYProgress, [0.6, 0.8], [0, 1])
  const L5 = useTransform(scrollYProgress, [0.8, 1], [0, 1])

  /* Chapter 1: the real home screen first, then the feed scroll */
  const homeTopOp = useBand(L1, [0.26, 0.34], [1, 0])
  const homeY = useBand(L1, [0.34, 0.76], [0, -(HOME_STRIP_H - SCREEN_H)])

  /* Chapter 2: profile scrolls naturally; no overlay, no duplicated tabs */
  const profY = useBand(L2, [0.1, 0.62], [0, -(PROFILE_STRIP_H - SCREEN_H)])

  /* Chapter 3: full screen; the redeem button glows, then gets tapped */
  const redeemGlow = useBand(L3, [0.3, 0.55, 0.72, 0.95], [0, 1, 1, 0.5])

  /* Chapter 4: High Street tap, Confirm tap, PIN, confetti success, QR pop */
  const branchOp = useBand(L4, [0, 0.3, 0.34], [1, 1, 0])
  const pinOp = useBand(L4, [0.3, 0.34, 0.6, 0.65], [0, 1, 1, 0])
  const flash = useBand(L4, [0.6, 0.64, 0.69], [0, 0.55, 0])
  const successOp = useBand(L4, [0.62, 0.67, 0.87, 0.9], [0, 1, 1, 0])
  const successScale = useBand(L4, [0.62, 0.71], [0.93, 1])
  const qrOp = useBand(L4, [0.86, 0.92, 1], [0, 1, 1])
  // The pop-out card lives OUTSIDE the gated screens, so it bands on the
  // global progress and retires itself at the chapter boundary
  const qrPopOp = useBand(scrollYProgress, [0.772, 0.782, 0.786, 0.796], [0, 1, 1, 0])
  const qrPopScale = useBand(scrollYProgress, [0.772, 0.79], [0.82, 1.1])
  const qrPopY = useBand(scrollYProgress, [0.772, 0.79], [26, 0])
  const pinDigitOps = KEY_TIMES.map((t) => useBand(L4, [t + 0.015, t + 0.035], [0, 1]))
  const keyFlashes = KEY_TIMES.map((t) => useBand(L4, [t - 0.015, t, t + 0.03], [0, 1, 0]))

  /* Chapter 5: the ledger counts itself: total, month, redemptions, bars */
  const totalNum = useBand(L5, [0.08, 0.48], [0, 325.45])
  const totalText = useTransform(totalNum, (v) => `£${v.toFixed(2)}`)
  const monthNum = useBand(L5, [0.16, 0.5], [0, 96])
  const monthText = useTransform(monthNum, (v) => `£${v.toFixed(2)}`)
  const redemptionsNum = useBand(L5, [0.26, 0.46], [0, 3])
  const redemptionsText = useTransform(redemptionsNum, (v) => `${Math.round(v)}`)
  const dotOp = useBand(L5, [0.58, 0.64], [0, 1])
  const barsGrow = BARS.map((_, i) => useBand(L5, [0.14 + i * 0.05, 0.32 + i * 0.05], [1, 0]))

  return (
    <div ref={trackRef} className="relative" style={{ height: '720vh' }}>
      <motion.div className="sticky top-0 h-screen overflow-hidden" style={{ background: bg }}>
        <div className="relative max-w-7xl mx-auto h-full px-6 grid grid-cols-[64px_1fr_420px] gap-8 items-center">

          {/* Progress rail */}
          <div className="flex flex-col gap-7 select-none" aria-hidden="true">
            {RAIL.map((label, i) => (
              <RailItem key={label} progress={scrollYProgress} index={i} label={label} />
            ))}
          </div>

          {/* Chapter copy */}
          <div className="relative min-h-[420px] max-w-[560px]">
            {CHAPTERS.map((c, i) => (
              <CopyLayer key={c.kicker} progress={scrollYProgress} index={i} chapter={c} />
            ))}
          </div>

          {/* The phone: upright, readable, gently alive */}
          <div className="justify-self-end relative" style={{ perspective: 1400 }}>
            <motion.div
              className="relative rounded-[50px] bg-[#10101c] p-[10px]"
              style={{
                width: PHONE_W + 20,
                rotateX: rotX,
                x: driftX,
                y: phoneY,
                transformStyle: 'preserve-3d',
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
                    <Tap local={L4} at={[0.07, 0.17]} x="50%" y="79%" />
                    <Tap local={L4} at={[0.2, 0.3]} x="50%" y="94.5%" />
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
                    <Tap local={L4} at={[0.77, 0.86]} x="50%" y="65.5%" />
                  </motion.div>
                  {/* the success lands with a flash and brand confetti */}
                  <motion.div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: flash }} />
                  {CONFETTI.map((p, i) => (
                    <ConfettiPiece key={i} local={L4} p={p} />
                  ))}

                  <motion.div className="absolute inset-0" style={{ opacity: qrOp }}>
                    <Image src="/app-shots/journey/qr-screen.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
                  </motion.div>
                </Screen>

                {/* ── 05 Savings: one screen, counting itself up ── */}
                <Screen opacity={op5} bg="#F8F7F5">
                  <Image src="/app-shots/journey/savings-top.jpg" alt="" fill sizes="340px" className="object-cover object-top" />
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
                  {BARS.map(([bx, bw, btop], i) => (
                    <motion.div
                      key={i}
                      className="absolute bg-white pointer-events-none"
                      style={{
                        left: `${(bx - 0.005) * 100}%`, width: `${(bw + 0.01) * 100}%`,
                        top: `${(btop - 0.007) * 100}%`, height: `${(BAR_BASE - btop + 0.011) * 100}%`,
                        scaleY: barsGrow[i], transformOrigin: 'top',
                      }}
                    />
                  ))}
                  <motion.div
                    className="absolute w-2 h-2 rounded-full bg-[#E20C04]"
                    style={{ left: '83.5%', top: '42.9%', opacity: dotOp }}
                  />
                </Screen>
              </div>

              {/* Notch */}
              <div className="absolute left-1/2 -translate-x-1/2 top-[19px] w-[96px] h-[23px] rounded-full bg-[#10101c]" />
            </motion.div>

            {/* The QR card steps out of the phone for its moment */}
            <motion.div
              className="absolute pointer-events-none rounded-2xl overflow-hidden"
              style={{
                left: '-9%', width: '118%', top: '30%',
                opacity: qrPopOp,
                scale: qrPopScale,
                y: qrPopY,
                boxShadow: '0 30px 70px rgba(20,8,60,0.45), 0 6px 18px rgba(20,8,60,0.3)',
              }}
            >
              <Image src="/app-shots/journey/qr-card.jpg" alt="" width={700} height={689} className="w-full h-auto" />
            </motion.div>

            <p className="mt-4 text-center text-[10px] text-[#010C35]/40">
              App preview · example places, not live listings
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function RailItem({ progress, index, label }: { progress: MotionValue<number>; index: number; label: string }) {
  const a = index * 0.2
  const b = (index + 1) * 0.2
  const active = useBand(progress, [a - 0.02, a + 0.02, b - 0.02, b + 0.02], index === 0 ? [1, 1, 1, 0.28] : index === 4 ? [0.28, 1, 1, 1] : [0.28, 1, 1, 0.28])
  return (
    <motion.div className="flex items-center gap-2.5" style={{ opacity: active }}>
      <span className="w-1.5 h-1.5 rounded-full bg-[#E20C04] flex-shrink-0" />
      <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#010C35] whitespace-nowrap">{label}</span>
    </motion.div>
  )
}

function CopyLayer({ progress, index, chapter }: { progress: MotionValue<number>; index: number; chapter: (typeof CHAPTERS)[number] }) {
  const a = index * 0.2
  const b = (index + 1) * 0.2
  const opacity = useBand(
    progress,
    index === 0 ? [0, 0.15, b - 0.015] : index === 4 ? [a + 0.015, a + 0.05, 1] : [a + 0.015, a + 0.05, b - 0.05, b - 0.015],
    index === 0 ? [1, 1, 0] : index === 4 ? [0, 1, 1] : [0, 1, 1, 0],
  )
  const y = useBand(progress, [a, b], index === 0 ? [0, -24] : index === 4 ? [24, 0] : [24, -24])
  return (
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
      <motion.div style={{ opacity, y }}>
        <p className="text-[12px] font-bold tracking-[0.2em] uppercase mb-5 text-[#E20C04]">{chapter.kicker}</p>
        <h3 className="font-display text-[#010C35] leading-[1.08] mb-5" style={{ fontSize: 'clamp(32px, 3.4vw, 50px)', letterSpacing: '-0.7px' }}>
          {chapter.title}
        </h3>
        <p className="text-[16px] leading-[1.7] max-w-[460px] text-[#4B5563]">{chapter.body}</p>
        {index === 4 && (
          <div className="mt-8 flex items-center gap-4 flex-wrap">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 text-white font-bold text-[15px] px-6 py-3 rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 20px rgba(226,12,4,0.3)' }}
            >
              Create free account
            </Link>
            <span className="text-[13px] text-[#6B7280]">Free to join · founding members get 3 months free at launch</span>
          </div>
        )}
      </motion.div>
    </div>
  )
}

/** Static fallback: mobile and reduced-motion visitors */
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
          <p className="mt-3 text-[12.5px] text-[#6B7280]">Free to join · founding members get 3 months free at launch</p>
        </div>
      </div>
    </section>
  )
}

export function AppJourneySection() {
  const reduceMotion = useReducedMotion()
  return (
    <>
      {!reduceMotion && (
        <div className="hidden lg:block">
          <Stage />
        </div>
      )}
      <div className={reduceMotion ? '' : 'lg:hidden'}>
        <StaticJourney />
      </div>
    </>
  )
}
