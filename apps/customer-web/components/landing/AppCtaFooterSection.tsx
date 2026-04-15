'use client'

import { motion } from 'framer-motion'
import { AppStoreBadge, GooglePlayBadge } from './HeroSection'

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

export function AppCtaFooterSection() {
  return (
    <section
      className="relative overflow-hidden py-20 md:py-28 px-6 text-center"
      style={{ background: '#010C35' }}
    >
      {/* Rose-red glow — bottom-left anchor + upper-right warmth */}
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
          Vouchers in your pocket.{' '}
          <span className="gradient-text">Download free.</span>
        </motion.h2>

        {/* Body */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-[15px] text-white/48 leading-[1.72] mb-9 max-w-[420px] mx-auto"
        >
          Browse and save on the website. Redeem your vouchers in-store with the app.
        </motion.p>

        {/* App store badges */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="flex gap-3 justify-center flex-wrap"
        >
          <AppStoreBadge />
          <GooglePlayBadge />
        </motion.div>
      </div>
    </section>
  )
}
