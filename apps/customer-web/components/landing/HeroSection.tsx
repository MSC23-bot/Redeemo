'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { AppMockupFrame } from '@/components/ui/AppMockupFrame'

const HEADLINE_WORDS = ['Save', 'every', 'month', 'at']
const HEADLINE_ACCENT = 'local businesses'
const HEADLINE_END = 'near you'

export function HeroSection() {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden bg-deep-navy">

      {/* Background: grain + diagonal red shard */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
        <div
          className="absolute -top-40 right-0 w-[600px] h-[700px] opacity-[0.07]"
          style={{ background: 'linear-gradient(135deg, #E2000C 0%, transparent 65%)', transform: 'rotate(-15deg) translateX(20%)' }}
        />
      </div>

      {/* Asymmetric 55:45 grid */}
      <div className="relative z-10 max-w-screen-xl mx-auto w-full px-6 grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-16 lg:gap-20 items-center py-20">

        {/* Left: copy */}
        <div>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-orange-red mb-5"
          >
            UK&apos;s local voucher marketplace
          </motion.p>

          <h1 className="font-display leading-[1.05] text-white mb-7" style={{ fontSize: 'clamp(44px, 5.5vw, 76px)' }}>
            {HEADLINE_WORDS.map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
                className="inline-block mr-[0.25em]"
              >
                {word}
              </motion.span>
            ))}
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + HEADLINE_WORDS.length * 0.08 }}
              className="inline-block gradient-brand-text mr-[0.25em]"
            >
              {HEADLINE_ACCENT}
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + (HEADLINE_WORDS.length + 1) * 0.08 }}
              className="inline-block"
            >
              {HEADLINE_END}
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="text-lg leading-[1.75] text-white/60 max-w-[460px] mb-10"
          >
            One subscription unlocks exclusive vouchers from restaurants,
            cafés, gyms, salons, and more — all within your neighbourhood.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
            className="flex flex-wrap items-center gap-5 mb-12"
          >
            <Link
              href="/subscribe"
              className="inline-block text-white font-semibold text-lg px-10 py-[18px] rounded-xl no-underline"
              style={{ background: 'linear-gradient(135deg, #E2000C, #E84A00)', boxShadow: '0 8px 32px rgba(226,0,12,0.35)' }}
            >
              Start saving — from £6.99/mo
            </Link>
            <Link
              href="/discover"
              className="text-white/60 font-medium text-base no-underline hover:text-white/90 transition-colors"
            >
              Browse for free →
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.1 }}
            className="flex items-center gap-3"
          >
            {['App Store', 'Google Play'].map(label => (
              <div key={label} className="h-10 w-32 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center">
                <span className="font-mono text-[11px] text-white/30 tracking-wide">{label}</span>
              </div>
            ))}
            <span className="text-sm text-white/25">Coming soon</span>
          </motion.div>
        </div>

        {/* Right: phone frame — overflows section bottom, Framer Motion float loop */}
        <motion.div
          initial={{ opacity: 0, y: 30, rotate: 2 }}
          animate={{ opacity: 1, y: [0, -10, 0], rotate: 2 }}
          transition={{
            opacity: { duration: 0.7, delay: 0.4 },
            y: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
            rotate: { duration: 0 },
          }}
          className="flex justify-center lg:justify-end mb-[-80px]"
        >
          <AppMockupFrame size="md" />
        </motion.div>
      </div>
    </section>
  )
}
