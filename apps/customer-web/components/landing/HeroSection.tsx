'use client'

import Link from 'next/link'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useRef, useCallback } from 'react'

const FLOAT_CARDS = [
  {
    label: 'BOGO',
    title: 'Buy One Get One Free',
    merchant: 'Pasta Palace · Manchester',
    saving: 'Save £22',
    stripe: '#7C3AED',
    bg: 'rgba(124,58,237,0.12)',
    border: 'rgba(124,58,237,0.28)',
    text: '#C4B5FD',
    top: 0,
    left: 16,
    rotate: -5,
    entryDelay: 0.35,
    floatDelay: 0,
    floatDuration: 3.8,
  },
  {
    label: 'DISCOUNT',
    title: '50% Off — First Class',
    merchant: 'FitZone Studio · Leeds',
    saving: 'Save £15',
    stripe: '#E20C04',
    bg: 'rgba(226,12,4,0.12)',
    border: 'rgba(226,12,4,0.28)',
    text: '#FCA5A5',
    top: 118,
    left: 68,
    rotate: 4,
    entryDelay: 0.5,
    floatDelay: 0.9,
    floatDuration: 4.5,
  },
  {
    label: 'FREEBIE',
    title: 'Free Pastry with Any Drink',
    merchant: 'The Coffee Room · Birmingham',
    saving: 'Save £4',
    stripe: '#16A34A',
    bg: 'rgba(22,163,74,0.12)',
    border: 'rgba(22,163,74,0.28)',
    text: '#86EFAC',
    top: 242,
    left: 8,
    rotate: -2,
    entryDelay: 0.65,
    floatDelay: 1.7,
    floatDuration: 4.1,
  },
]

const STATS = [
  { value: '200+', label: 'merchants' },
  { value: '7', label: 'voucher types' },
  { value: '£6.99', label: 'per month' },
]

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null)

  // Raw mouse position (0–100 as percentage of section)
  const rawX = useMotionValue(88)
  const rawY = useMotionValue(-12)

  // Spring-smoothed values — slow, luxurious follow
  const glowX = useSpring(rawX, { stiffness: 40, damping: 20, mass: 1.4 })
  const glowY = useSpring(rawY, { stiffness: 40, damping: 20, mass: 1.4 })

  // Derived CSS string so motion.div can interpolate it
  const glowBg = useTransform(
    [glowX, glowY],
    ([x, y]) =>
      `radial-gradient(700px circle at ${x}% ${y}%, rgba(226,12,4,0.36), transparent 52%)`,
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const rect = sectionRef.current?.getBoundingClientRect()
      if (!rect) return
      rawX.set(((e.clientX - rect.left) / rect.width) * 100)
      rawY.set(((e.clientY - rect.top) / rect.height) * 100)
    },
    [rawX, rawY],
  )

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      className="relative overflow-hidden px-6 pt-16 pb-14 md:pt-20 md:pb-20"
      style={{ background: '#010C35' }}
    >
      {/* Cursor-following red glow */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: glowBg }}
      />

      <div className="relative max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-10 lg:gap-6 items-center">

          {/* ── Left: Text ── */}
          <div>
            {/* Eyebrow */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 mb-7 rounded-full border border-white/14 bg-white/7 backdrop-blur-sm px-4 py-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#E20C04] flex-shrink-0 animate-pulse" />
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/55">
                Restaurants · Cafes · Gyms · Wellness
              </span>
            </motion.div>

            {/* H1 */}
            <motion.h1
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
              className="font-display text-white leading-[1.06] mb-5 max-w-[620px]"
              style={{ fontSize: 'clamp(38px, 5vw, 66px)', letterSpacing: '-1px' }}
            >
              The best local spots in your city.{' '}
              <span className="gradient-text">Members pay less.</span>
            </motion.h1>

            {/* Sub */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.18 }}
              className="text-[16px] text-white/52 leading-[1.65] mb-9 max-w-[490px]"
            >
              Independent restaurants, cafes, gyms, and studios — each with exclusive vouchers. Subscribe from £6.99/mo to unlock them all.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.27 }}
              className="flex flex-wrap gap-3 mb-10"
            >
              <Link
                href="/register"
                className="inline-flex items-center gap-2 text-white font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
                style={{
                  background: 'var(--brand-gradient)',
                  boxShadow: '0 4px 24px rgba(226,12,4,0.38)',
                }}
              >
                Start exploring — it&apos;s free
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <Link
                href="/subscribe"
                className="inline-flex items-center text-white/75 font-semibold text-[15px] px-7 py-3.5 rounded-xl border border-white/16 bg-white/7 backdrop-blur-sm no-underline hover:bg-white/12 hover:text-white transition-all"
              >
                See plans
              </Link>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.42 }}
              className="flex items-center gap-7 flex-wrap"
            >
              {STATS.map((s, i) => (
                <div key={i} className="flex items-baseline gap-1.5">
                  <span
                    className="font-display text-white leading-none"
                    style={{ fontSize: '22px', letterSpacing: '-0.3px' }}
                  >
                    {s.value}
                  </span>
                  <span className="text-[12px] text-white/38 font-medium">{s.label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ── Right: Floating voucher preview cards ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="hidden lg:block relative flex-shrink-0"
            style={{ height: '390px' }}
          >
            {FLOAT_CARDS.map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: card.entryDelay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                style={{
                  position: 'absolute',
                  top: card.top,
                  left: card.left,
                  rotate: `${card.rotate}deg`,
                }}
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{
                    duration: card.floatDuration,
                    delay: card.floatDelay,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  <div
                    className="relative rounded-2xl overflow-hidden"
                    style={{
                      width: '272px',
                      background: 'rgba(255,255,255,0.07)',
                      border: `1px solid ${card.border}`,
                      backdropFilter: 'blur(20px)',
                      boxShadow: `0 24px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)`,
                    }}
                  >
                    {/* Left stripe */}
                    <div
                      className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                      style={{ background: card.stripe }}
                      aria-hidden="true"
                    />
                    {/* Content */}
                    <div className="pl-6 pr-5 pt-4 pb-3">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span
                          className="text-[9.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full border"
                          style={{ color: card.text, background: card.bg, borderColor: card.border }}
                        >
                          {card.label}
                        </span>
                        <span
                          className="text-[10px] font-bold text-white px-2.5 py-1 rounded-full flex-shrink-0"
                          style={{ background: card.stripe }}
                        >
                          {card.saving}
                        </span>
                      </div>
                      <p
                        className="font-display text-white text-[15px] leading-[1.25] mb-1.5"
                        style={{ letterSpacing: '-0.1px' }}
                      >
                        {card.title}
                      </p>
                      <p className="text-[11.5px] text-white/42">{card.merchant}</p>
                    </div>
                    {/* Dashed separator */}
                    <div className="relative mx-4 py-2.5">
                      <div
                        className="absolute inset-x-0 top-1/2"
                        style={{ borderTop: '1px dashed rgba(255,255,255,0.14)', transform: 'translateY(-50%)' }}
                      />
                    </div>
                    {/* Stub */}
                    <div
                      className="pl-6 pr-5 pb-3.5 flex items-center gap-1.5"
                      style={{ background: card.bg }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: card.stripe }} aria-hidden="true">
                        <rect x="5" y="2" width="14" height="20" rx="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
                      </svg>
                      <span className="text-[10.5px] text-white/42 font-medium">Redeem in app</span>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* App badges strip */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.56 }}
          className="mt-14 pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <p className="text-[11.5px] text-white/30 uppercase tracking-[0.14em] font-semibold flex-shrink-0">
            Redeem in the app — Download free
          </p>
          <div className="flex gap-3 flex-wrap">
            <AppStoreBadge />
            <GooglePlayBadge />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export function AppStoreBadge() {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-xl bg-[#010C35] border border-white/15 text-white px-4 py-2.5 cursor-default hover:border-white/25 transition-colors">
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
    <div className="inline-flex items-center gap-2.5 rounded-xl bg-[#010C35] border border-white/15 text-white px-4 py-2.5 cursor-default hover:border-white/25 transition-colors">
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
