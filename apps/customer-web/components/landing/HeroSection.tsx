'use client'

import Link from 'next/link'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { useRef, useCallback } from 'react'
import { PhoneDemo } from './PhoneDemo'
import { HeroFilm } from './HeroFilm'
import { isLeadCaptureLive, isMarketplaceLive } from '@/lib/prelaunch'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

// Launch-safe facts only: mechanics, not unverifiable scale claims.
const FACTS = [
  { value: 'Free', label: 'to browse. No card needed.' },
  { value: '£6.99', label: 'a month to redeem' },
  { value: 'Monthly', label: 'vouchers, fresh each cycle' },
]

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const marketplaceLive = isMarketplaceLive()
  const leadCaptureLive = isLeadCaptureLive()

  // Raw mouse position (0–100 as percentage of section)
  const rawX = useMotionValue(88)
  const rawY = useMotionValue(-12)

  // Spring-smoothed values — slow, luxurious follow
  const glowX = useSpring(rawX, { stiffness: 40, damping: 20, mass: 1.4 })
  const glowY = useSpring(rawY, { stiffness: 40, damping: 20, mass: 1.4 })

  const glowBg = useTransform(
    [glowX, glowY],
    ([x, y]) =>
      `radial-gradient(700px circle at ${x}% ${y}%, rgba(226,12,4,0.07), transparent 55%)`,
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      // Continuous background repaint: skipped for reduced-motion visitors
      // (touch devices never fire mousemove, so they get the static glow).
      if (reduceMotion) return
      const rect = sectionRef.current?.getBoundingClientRect()
      if (!rect) return
      rawX.set(((e.clientX - rect.left) / rect.width) * 100)
      rawY.set(((e.clientY - rect.top) / rect.height) * 100)
    },
    [rawX, rawY, reduceMotion],
  )

  const primaryCta = marketplaceLive
    ? { href: '/register', label: "Start browsing. It's free." }
    : leadCaptureLive
      ? { href: '#waitlist', label: 'Join the waitlist' }
      : { href: '/how-it-works', label: 'See how Redeemo works' }

  const secondaryCta = marketplaceLive
    ? { href: '/subscribe', label: 'See plans' }
    : { href: '/for-businesses', label: 'Got a business?' }

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      className="relative overflow-hidden px-6 pt-16 pb-14 md:pt-20 md:pb-20"
      style={{ background: '#FFF9F5' }}
    >
      {/* Cursor-following red glow (visible on mobile, where the film is off) */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: glowBg }}
      />

      {/* The owner-made hero film: full-bleed on desktop, phone centre-right,
          left third clean for the text. Scroll push-in + cursor tilt live in
          the component. Mobile keeps the code-rendered PhoneDemo below. */}
      <div className="hidden lg:block absolute inset-0" aria-hidden="true">
        <HeroFilm />
      </div>

      <div className="relative max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,620px)_1fr] gap-14 lg:gap-8 items-center lg:min-h-[560px]">

          {/* ── Left: Text ── */}
          <div>
            {/* Eyebrow */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 mb-7 rounded-full border border-[#010C35]/10 bg-white px-4 py-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#E20C04] flex-shrink-0 animate-pulse" />
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#010C35]/55">
                {marketplaceLive
                  ? 'Restaurants · Cafes · Gyms · Wellness'
                  : 'Launching soon · Restaurants · Cafes · Gyms · Wellness'}
              </span>
            </motion.div>

            {/* H1 */}
            <motion.h1
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08, ease: EASE }}
              className="font-display text-[#010C35] leading-[1.06] mb-5 max-w-[620px]"
              style={{ fontSize: 'clamp(32px, 4.2vw, 56px)', letterSpacing: '-1px' }}
            >
              Dinner for two, priced for one.{' '}
              <span className="gradient-text">Half-price workouts.</span>{' '}
              Free pastries with your coffee.
            </motion.h1>

            {/* Sub */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.18 }}
              className="text-[16px] text-[#4B5563] leading-[1.65] mb-9 max-w-[490px]"
            >
              Redeemo is a membership of independent places near you: restaurants,
              cafes, gyms, salons. Every one includes member vouchers like these,
              fresh each month, from £6.99. Browse free first.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.27 }}
              className="flex flex-wrap gap-3 mb-10"
            >
              <Link
                href={primaryCta.href}
                className="inline-flex items-center gap-2 text-white font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
                style={{
                  background: 'var(--brand-gradient)',
                  boxShadow: '0 4px 24px rgba(226,12,4,0.38)',
                }}
              >
                {primaryCta.label}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <Link
                href={secondaryCta.href}
                className="inline-flex items-center text-[#010C35]/75 font-semibold text-[15px] px-7 py-3.5 rounded-xl border border-[#010C35]/15 bg-white no-underline hover:border-[#010C35]/35 hover:text-[#010C35] transition-all"
              >
                {secondaryCta.label}
              </Link>
            </motion.div>

            {/* Launch-safe facts */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.42 }}
              className="flex items-center gap-7 flex-wrap"
            >
              {FACTS.map((s, i) => (
                <div key={i} className="flex items-baseline gap-1.5">
                  <span
                    className="font-display text-[#010C35] leading-none"
                    style={{ fontSize: '22px', letterSpacing: '-0.3px' }}
                  >
                    {s.value}
                  </span>
                  <span className="text-[12px] text-[#6B7280] font-medium">{s.label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ── Right: the product itself (mobile/tablet only; on desktop the
                 film carries the phone) ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
            className="flex justify-center lg:hidden"
          >
            <PhoneDemo />
          </motion.div>
        </div>

        {/* App availability strip */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.56 }}
          className="mt-14 pt-8 border-t border-[#010C35]/10 flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <p className="text-[11.5px] text-[#010C35]/55 uppercase tracking-[0.14em] font-semibold flex-shrink-0">
            {marketplaceLive
              ? 'Redeem in the app · Download free'
              : 'The app arrives with launch · iOS & Android'}
          </p>
          <div className="flex gap-3 flex-wrap items-center">
            <AppStoreBadge />
            <GooglePlayBadge />
            {!marketplaceLive && (
              <span className="text-[11px] text-[#6B7280] font-semibold rounded-full border border-[#010C35]/12 px-3 py-1.5">
                Coming at launch
              </span>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export function AppStoreBadge() {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-xl bg-[#010C35] border border-white/15 text-white px-4 py-2.5">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      <div className="flex flex-col leading-tight text-left">
        <span className="text-[9px] text-white/55">Download on the</span>
        <span className="text-[13px] font-semibold">App Store</span>
      </div>
    </div>
  )
}

export function GooglePlayBadge() {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-xl bg-[#010C35] border border-white/15 text-white px-4 py-2.5">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3.1 2.54C2.73 2.88 2.5 3.4 2.5 4.08v15.84c0 .68.23 1.2.6 1.54l.08.07 8.88-8.88v-.23L3.18 2.47zm11.93 9.67-2.96-2.96L3.8 1.97l10.45 6.06zm.95 0 2.82-1.64c.85-.49.85-1.28 0-1.77L14.27 6.8 11.3 9.77zM3.8 22.03l8.27-8.28 2.96-2.96L14.25 9.5z" />
      </svg>
      <div className="flex flex-col leading-tight text-left">
        <span className="text-[9px] text-white/55">Get it on</span>
        <span className="text-[13px] font-semibold">Google Play</span>
      </div>
    </div>
  )
}
