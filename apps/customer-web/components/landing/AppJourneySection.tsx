'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import { useRef } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The app journey (owner brief 2026-07-12, copy approved 2026-07-13): one
 * pinned phone walks through the real customer app in five chapters:
 * Discovery, Merchant profile, Voucher detail, Redemption, Savings. The
 * screens are the owner's real captures (public/app-shots/journey), brought
 * alive with in-frame scrolling, header collapses, visible taps, camera
 * zooms, live PIN entry on the real keyboard, a success moment, the staff
 * QR reveal, and counting savings. The phone itself turns in 3D between
 * chapters. Desktop cinema only: mobile and reduced-motion get the static
 * five-block fallback below (same copy, one still per chapter).
 *
 * All scroll-linked values go through useScrollLinked (Chrome ScrollTimeline
 * misbinds stacked layers otherwise; see components/landing/scroll.ts).
 */

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

// Approved copy (2026-07-13)
const CHAPTERS = [
  {
    kicker: '01 · Find',
    title: 'Every place worth knowing, in one scroll.',
    body: 'Open the app and your area is already laid out: featured places, trending near you, and every category that matters. Each one carries a member voucher. Browsing is free, so you can see everything before you spend a penny.',
    still: '/app-shots/journey/home-strip.jpg',
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

// Phone geometry: screens are 1320x2868 captures shown at 400px wide
const PHONE_W = 400
const SCREEN_H = Math.round((PHONE_W * 2868) / 1320) // 869
const HOME_STRIP_H = Math.round((PHONE_W * 2421) / 800) // 1210
const PROFILE_STRIP_H = Math.round((PHONE_W * 2350) / 800) // 1175

// PIN keypad geometry, as fractions of the pin-screen capture
const PIN_KEYS: Record<string, [number, number]> = {
  '1': [0.168, 0.719], '2': [0.497, 0.719], '3': [0.826, 0.719],
  '4': [0.168, 0.777], '5': [0.497, 0.777], '6': [0.826, 0.777],
  '7': [0.168, 0.835], '8': [0.497, 0.835], '9': [0.826, 0.835],
  '0': [0.497, 0.894],
}
const PIN_DIGITS = ['4', '7', '2', '9']
const PIN_BOX_LEFTS = [0.206, 0.36, 0.514, 0.669]
const PIN_BOX = { top: 0.415, w: 0.12, h: 0.0675 }

// Savings trend bars (fractions of the 888x1890 capture): [x, w, topFrac]
const BARS: Array<[number, number, number]> = [
  [0.124, 0.062, 0.5635], [0.262, 0.062, 0.5635], [0.401, 0.062, 0.5635],
  [0.539, 0.063, 0.443], [0.678, 0.062, 0.495], [0.816, 0.062, 0.486],
]
const BAR_BASE = 0.572

function useBand(progress: MotionValue<number>, input: number[], output: number[]) {
  return useScrollLinked(useTransform(progress, input, output))
}

/** A visible fingertip: dot + expanding ring at a fixed screen position */
function Tap({ local, at, x, y }: { local: MotionValue<number>; at: [number, number]; x: string; y: string }) {
  const mid = (at[0] + at[1]) / 2
  const opacity = useBand(local, [at[0], at[0] + 0.015, mid, at[1]], [0, 1, 1, 0])
  const ring = useBand(local, [at[0], at[1]], [0.5, 2.1])
  const ringOpacity = useBand(local, [at[0], mid, at[1]], [0.55, 0.3, 0])
  return (
    <div className="absolute pointer-events-none" style={{ left: x, top: y }}>
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full"
        style={{ opacity, background: 'rgba(255,255,255,0.45)', boxShadow: '0 2px 14px rgba(1,12,53,0.3), inset 0 0 0 1.5px rgba(255,255,255,0.8)' }}
      />
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border-2 border-white"
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

function Stage() {
  const trackRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })

  const bg = useTransform(
    scrollYProgress,
    [0, 0.2, 0.4, 0.6, 0.8, 1],
    ['#FFF9F5', '#FFFFFF', '#FFFFFF', '#FFF6F3', '#FFFFFF', '#FFF9F5'],
  )

  // The phone turns in 3D as chapters hand over
  const rotY = useBand(scrollYProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], [14, -9, 7, -11, 6, -4])
  const rotX = useBand(scrollYProgress, [0, 0.5, 1], [4, 1, 3])
  const phoneY = useBand(scrollYProgress, [0, 1], [18, -18])

  // Chapter screen opacities (crossfade at each 0.2 boundary)
  const op1 = useBand(scrollYProgress, [0, 0.185, 0.205], [1, 1, 0])
  const op2 = useBand(scrollYProgress, [0.185, 0.205, 0.385, 0.405], [0, 1, 1, 0])
  const op3 = useBand(scrollYProgress, [0.385, 0.405, 0.585, 0.605], [0, 1, 1, 0])
  const op4 = useBand(scrollYProgress, [0.585, 0.605, 0.785, 0.805], [0, 1, 1, 0])
  const op5 = useBand(scrollYProgress, [0.785, 0.805, 1], [0, 1, 1])

  // Locals (0..1 within each chapter)
  const L1 = useTransform(scrollYProgress, [0, 0.2], [0, 1])
  const L2 = useTransform(scrollYProgress, [0.2, 0.4], [0, 1])
  const L3 = useTransform(scrollYProgress, [0.4, 0.6], [0, 1])
  const L4 = useTransform(scrollYProgress, [0.6, 0.8], [0, 1])
  const L5 = useTransform(scrollYProgress, [0.8, 1], [0, 1])

  /* Chapter 1: the home feed scrolls under its pinned header; stop exactly
     where the strip's baked tab bar meets the pinned overlay */
  const homeY = useBand(L1, [0.1, 0.72], [0, -(HOME_STRIP_H - SCREEN_H)])

  /* Chapter 2: profile scrolls until its baked tab row tucks under the
     collapsed header (152px), which fades in just before they meet */
  const profY = useBand(L2, [0.12, 0.62], [0, -(PROFILE_STRIP_H - SCREEN_H + 39)])
  const collapsedOp = useBand(L2, [0.48, 0.58], [0, 1])

  /* Chapter 3: camera work over the voucher detail */
  const z3scale = useBand(L3, [0, 0.2, 0.32, 0.48, 0.6, 0.78, 0.9, 1], [1, 1.3, 1.3, 1.3, 1.3, 1.24, 1.24, 1.06])
  // pan = (0.5 - focus) * dimension * scale
  const z3x = useBand(L3, [0, 0.2, 0.32, 0.48, 0.6, 0.78, 0.9, 1], [0, -146, -146, 62, 62, 0, 0, 0])
  const z3y = useBand(L3, [0, 0.2, 0.32, 0.48, 0.6, 0.78, 0.9, 1], [0, 271, 271, -104, -104, -348, -348, -87])
  const redeemGlow = useBand(L3, [0.62, 0.78, 0.95], [0, 1, 0.7])

  /* Chapter 4: branch confirm, PIN on the real keyboard, success, QR */
  const branchOp = useBand(L4, [0, 0.2, 0.24], [1, 1, 0])
  const pinOp = useBand(L4, [0.2, 0.24, 0.6, 0.66], [0, 1, 1, 0])
  const successOp = useBand(L4, [0.6, 0.66, 0.8, 0.85], [0, 1, 1, 0])
  const successScale = useBand(L4, [0.6, 0.7], [0.92, 1])
  const qrOp = useBand(L4, [0.8, 0.86, 1], [0, 1, 1])
  const qrRise = useBand(L4, [0.8, 0.9], [30, 0])
  const flash = useBand(L4, [0.585, 0.63, 0.68], [0, 0.55, 0])

  /* Chapter 5: the ledger counts itself up */
  const totalNum = useBand(L5, [0.06, 0.46], [0, 325.45])
  const totalText = useTransform(totalNum, (v) => `£${v.toFixed(2)}`)
  const topOp = useBand(L5, [0, 0.66, 0.72], [1, 1, 0])
  const moreOp = useBand(L5, [0.66, 0.72, 1], [0, 1, 1])
  const moreY = useBand(L5, [0.66, 0.78], [50, 0])
  const dotOp = useBand(L5, [0.5, 0.56], [0, 1])
  const barsGrow = [
    useBand(L5, [0.12, 0.3], [1, 0]),
    useBand(L5, [0.16, 0.34], [1, 0]),
    useBand(L5, [0.2, 0.38], [1, 0]),
    useBand(L5, [0.24, 0.42], [1, 0]),
    useBand(L5, [0.28, 0.46], [1, 0]),
    useBand(L5, [0.32, 0.5], [1, 0]),
  ]
  const rowReveals = [
    useBand(L5, [0.78, 0.85], [1, 0]),
    useBand(L5, [0.83, 0.9], [1, 0]),
    useBand(L5, [0.88, 0.95], [1, 0]),
  ]
  const pinDigitOps = [
    useBand(L4, [0.3, 0.32], [0, 1]),
    useBand(L4, [0.38, 0.4], [0, 1]),
    useBand(L4, [0.46, 0.48], [0, 1]),
    useBand(L4, [0.54, 0.56], [0, 1]),
  ]
  const keyFlashes = [
    useBand(L4, [0.285, 0.3, 0.32], [0, 1, 0]),
    useBand(L4, [0.365, 0.38, 0.4], [0, 1, 0]),
    useBand(L4, [0.445, 0.46, 0.48], [0, 1, 0]),
    useBand(L4, [0.525, 0.54, 0.56], [0, 1, 0]),
  ]

  return (
    <div ref={trackRef} className="relative" style={{ height: '720vh' }}>
      <motion.div className="sticky top-0 h-screen overflow-hidden" style={{ background: bg }}>
        <div className="relative max-w-7xl mx-auto h-full px-6 grid grid-cols-[64px_1fr_460px] gap-8 items-center">

          {/* Progress rail */}
          <div className="flex flex-col gap-7 select-none" aria-hidden="true">
            {RAIL.map((label, i) => {
              return <RailItem key={label} progress={scrollYProgress} index={i} label={label} />
            })}
          </div>

          {/* Chapter copy */}
          <div className="relative min-h-[420px] max-w-[560px]">
            {CHAPTERS.map((c, i) => (
              <CopyLayer key={c.kicker} progress={scrollYProgress} index={i} chapter={c} />
            ))}
          </div>

          {/* The phone, turning in space */}
          <div className="justify-self-end" style={{ perspective: 1400 }}>
            <motion.div
              className="relative rounded-[58px] bg-[#10101c] p-[11px]"
              style={{
                width: PHONE_W + 22,
                rotateY: rotY,
                rotateX: rotX,
                y: phoneY,
                transformStyle: 'preserve-3d',
                boxShadow: '0 42px 90px rgba(1,12,53,0.28), 0 10px 26px rgba(1,12,53,0.16), inset 0 0 0 2px rgba(255,255,255,0.06)',
              }}
            >
              <div className="relative rounded-[47px] overflow-hidden bg-[#FFF9F5]" style={{ width: PHONE_W, height: SCREEN_H }}>

                {/* ── 01 Discovery ── */}
                <Screen opacity={op1}>
                  <motion.div className="absolute inset-x-0" style={{ y: homeY, top: 0, height: HOME_STRIP_H }}>
                    <Image src="/app-shots/journey/home-strip.jpg" alt="" fill sizes="400px" className="object-cover object-top" />
                  </motion.div>
                  {/* Sticky brand header + tab bar, exactly like the app */}
                  <div className="absolute inset-x-0 top-0" style={{ height: 97 }}>
                    <Image src="/app-shots/journey/home-header.jpg" alt="" fill sizes="400px" className="object-cover" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0" style={{ height: 76 }}>
                    <Image src="/app-shots/journey/home-nav.jpg" alt="" fill sizes="400px" className="object-cover" />
                  </div>
                  <Tap local={L1} at={[0.8, 0.96]} x="34%" y="66%" />
                </Screen>

                {/* ── 02 Merchant profile ── */}
                <Screen opacity={op2}>
                  <motion.div className="absolute inset-x-0" style={{ y: profY, top: 0, height: PROFILE_STRIP_H }}>
                    <Image src="/app-shots/journey/profile-strip.jpg" alt="" fill sizes="400px" className="object-cover object-top" />
                  </motion.div>
                  <motion.div className="absolute inset-x-0 top-0" style={{ height: 152, opacity: collapsedOp }}>
                    <Image src="/app-shots/journey/profile-collapsed.jpg" alt="" fill sizes="400px" className="object-cover" />
                  </motion.div>
                  <Tap local={L2} at={[0.78, 0.94]} x="76%" y="86%" />
                </Screen>

                {/* ── 03 Voucher detail ── */}
                <Screen opacity={op3}>
                  <motion.div className="absolute inset-0" style={{ scale: z3scale, x: z3x, y: z3y }}>
                    <Image src="/app-shots/journey/voucher-detail.jpg" alt="" fill sizes="400px" className="object-cover object-top" />
                    {/* The redeem button presents itself */}
                    <motion.div
                      className="absolute rounded-2xl pointer-events-none"
                      style={{
                        left: '4.5%', width: '91%', top: '86.9%', height: '7.6%',
                        opacity: redeemGlow,
                        boxShadow: '0 0 0 3px rgba(255,255,255,0.65), 0 0 34px rgba(226,12,4,0.55)',
                      }}
                    />
                  </motion.div>
                </Screen>

                {/* ── 04 Redemption ── */}
                <Screen opacity={op4} bg="#2a1a3e">
                  <motion.div className="absolute inset-0" style={{ opacity: branchOp }}>
                    <Image src="/app-shots/journey/branch-sheet.jpg" alt="" fill sizes="400px" className="object-cover object-top" />
                    <Tap local={L4} at={[0.13, 0.24]} x="50%" y="94.5%" />
                  </motion.div>

                  <motion.div className="absolute inset-0" style={{ opacity: pinOp }}>
                    <Image src="/app-shots/journey/pin-screen.jpg" alt="" fill sizes="400px" className="object-cover object-top" />
                    {/* Clean PIN boxes drawn over the capture, filled live */}
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
                        <motion.span className="font-display text-[26px] text-[#010C35]" style={{ opacity: pinDigitOps[i] }}>
                          {PIN_DIGITS[i]}
                        </motion.span>
                      </div>
                    ))}
                    {/* Key presses on the real keyboard */}
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
                    <Image src="/app-shots/journey/success-sheet.jpg" alt="" fill sizes="400px" className="object-cover object-top" />
                  </motion.div>
                  {/* the success moment lands with a soft flash */}
                  <motion.div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: flash }} />

                  <motion.div className="absolute inset-0" style={{ opacity: qrOp, y: qrRise }}>
                    <Image src="/app-shots/journey/qr-screen.jpg" alt="" fill sizes="400px" className="object-cover object-top" />
                  </motion.div>
                </Screen>

                {/* ── 05 Savings ── */}
                <Screen opacity={op5} bg="#F8F7F5">
                  <motion.div className="absolute inset-0" style={{ opacity: topOp }}>
                    <Image src="/app-shots/journey/savings-top.jpg" alt="" fill sizes="400px" className="object-cover object-top" />
                    {/* The total counts itself up over the blanked capture */}
                    <div className="absolute flex items-center" style={{ left: '4.8%', top: '13.9%', height: '5.8%' }}>
                      <motion.span className="font-display text-white leading-none" style={{ fontSize: 44, letterSpacing: '-1px' }}>
                        {totalText}
                      </motion.span>
                    </div>
                    {/* Trend bars grow in sequence: covers shrink away */}
                    {BARS.map(([bx, bw, btop], i) => (
                      <motion.div
                        key={i}
                        className="absolute bg-white pointer-events-none"
                        style={{
                          left: `${bx * 100}%`, width: `${bw * 100}%`,
                          top: `${btop * 100}%`, height: `${(BAR_BASE - btop) * 100}%`,
                          scaleY: barsGrow[i], transformOrigin: 'top',
                        }}
                      />
                    ))}
                    <motion.div
                      className="absolute w-2.5 h-2.5 rounded-full bg-[#E20C04]"
                      style={{ left: '83.5%', top: '42.7%', opacity: dotOp }}
                    />
                  </motion.div>
                  <motion.div className="absolute inset-0" style={{ opacity: moreOp, y: moreY, background: '#F8F7F5' }}>
                    <div className="absolute inset-x-0 top-0" style={{ height: (PHONE_W * 1586) / 800 }}>
                      <Image src="/app-shots/journey/savings-more.jpg" alt="" fill sizes="400px" className="object-cover object-top" />
                    </div>
                    {/* Recent redemptions arrive one by one */}
                    {[0.555, 0.69, 0.825].map((top, i) => (
                      <motion.div
                        key={i}
                        className="absolute pointer-events-none"
                        style={{ left: 0, right: 0, top: `${top * 100}%`, height: '13%', background: '#F8F7F5', opacity: rowReveals[i] }}
                      />
                    ))}
                  </motion.div>
                </Screen>
              </div>

              {/* Notch */}
              <div className="absolute left-1/2 -translate-x-1/2 top-[22px] w-[112px] h-[26px] rounded-full bg-[#10101c]" />
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
      <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#010C35] whitespace-nowrap [writing-mode:horizontal-tb]">{label}</span>
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
