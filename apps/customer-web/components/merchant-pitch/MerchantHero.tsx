'use client'
import { motion } from 'framer-motion'
import Link from 'next/link'

export function MerchantHero() {
  return (
    <section className="relative bg-deep-navy overflow-hidden">
      {/* Diagonal red shard */}
      <div
        aria-hidden
        className="absolute top-0 right-0 w-[55%] h-full pointer-events-none"
        style={{ background: 'linear-gradient(135deg, transparent 40%, rgba(226,0,12,0.06) 100%)' }}
      />
      {/* Grain texture */}
      <svg aria-hidden className="absolute inset-0 w-full h-full opacity-[0.025] pointer-events-none">
        <filter id="merchant-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#merchant-grain)" />
      </svg>

      <div className="relative max-w-screen-xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-16 lg:gap-0 min-h-[80vh] items-center py-28 lg:py-36">
        {/* Left: headline + CTA */}
        <div className="lg:pr-16">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="font-mono text-xs tracking-[0.12em] uppercase text-orange-red mb-6"
          >
            For local businesses
          </motion.p>

          <h1 className="font-display text-[clamp(40px,5.5vw,72px)] font-normal text-white leading-[1.08] mb-8">
            {['Reach local buyers.', 'Free to list,'].map((line, i) => (
              <motion.span
                key={line}
                className="block"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: i * 0.1 }}
              >
                {line}
              </motion.span>
            ))}
            <motion.span
              className="block gradient-brand-text"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
            >
              always.
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-lg leading-relaxed text-white/60 mb-10 max-w-md"
          >
            List your business free. Pay only when you want extra reach.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-wrap gap-4 items-center"
          >
            <Link
              href="mailto:merchants@redeemo.com"
              className="inline-block text-white font-bold text-base px-10 py-[18px] rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #E2000C, #E84A00)', boxShadow: '0 0 32px rgba(226,0,12,0.35)' }}
            >
              Apply to join — it&apos;s free
            </Link>
            <a
              href="#how-it-works"
              className="text-white/60 font-medium text-base hover:text-white/90 transition-colors flex items-center gap-2"
            >
              See how it works <span aria-hidden>↓</span>
            </a>
          </motion.div>
        </div>

        {/* Right: stat block — desktop only */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="hidden lg:flex flex-col items-start justify-center gap-6 lg:pl-12 border-l border-white/[0.06]"
        >
          {[
            { label: 'Listing fee', value: '£0' },
            { label: 'Commission per redemption', value: '0%' },
            { label: 'Commitment', value: '12 months' },
          ].map(({ label, value }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.35 + i * 0.1 }}
              className="flex flex-col gap-1"
            >
              <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-white/35">{label}</span>
              <span className="font-display leading-none text-white" style={{ fontSize: 'clamp(40px, 4.5vw, 64px)' }}>{value}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
