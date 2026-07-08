'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { AppStoreBadge, GooglePlayBadge } from './HeroSection'
import { isMarketplaceLive } from '@/lib/prelaunch'
import { RibbonPeek } from './RibbonPeek'

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

export function AppCtaFooterSection() {
  const marketplaceLive = isMarketplaceLive()

  return (
    <section
      className="relative overflow-hidden py-20 md:py-28 px-6 text-center"
      style={{ background: '#010C35' }}
    >
      {/* The ribbon's last visit before the footer: far from both seams */}
      <RibbonPeek side="right" top="10%" width={220} />
      {/* Rose-red glow: bottom-left anchor + upper-right warmth */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(640px circle at 12% 130%, rgba(226,12,4,0.40), transparent 55%), radial-gradient(380px circle at 92% -15%, rgba(200,50,0,0.18), transparent 55%)',
        }}
      />

      <div className="relative max-w-[680px] mx-auto">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.4, ease }}
          className="flex items-center justify-center gap-2 mb-6"
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: '#E20C04' }}
            aria-hidden="true"
          />
          <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/35">
            Redeemo app
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.1, ease }}
          className="font-display text-white leading-[1.08] mb-4"
          style={{ fontSize: 'clamp(30px, 4vw, 52px)', letterSpacing: '-0.5px' }}
        >
          {marketplaceLive ? (
            <>
              Vouchers in your pocket. <span className="gradient-text">Download free.</span>
            </>
          ) : (
            <>
              Vouchers in your pocket. <span className="gradient-text">Coming with launch.</span>
            </>
          )}
        </motion.h2>

        {/* Body */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-[15px] text-white/48 leading-[1.72] mb-9 max-w-[420px] mx-auto"
        >
          {marketplaceLive
            ? 'Browse and save on the website. Redeem your vouchers in-store with the app.'
            : 'Browse on the website today. The app and in-store redemption arrive when we go live near you.'}
        </motion.p>

        {/* App store badges / pre-launch CTA */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="flex flex-col items-center gap-3"
        >
          {marketplaceLive ? (
            <div className="flex gap-3 justify-center flex-wrap items-center">
              <AppStoreBadge />
              <GooglePlayBadge />
            </div>
          ) : (
            <>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 text-white font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
                style={{ background: 'var(--brand-gradient)' }}
              >
                Create free account
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <p className="text-[12px] text-white/35">
                The app arrives at launch: iOS &amp; Android
              </p>
            </>
          )}
        </motion.div>
      </div>
    </section>
  )
}
