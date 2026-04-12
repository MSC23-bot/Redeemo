'use client'

import { motion } from 'framer-motion'

const claims = [
  { headline: 'Save every month', body: 'Exclusive vouchers from local businesses, refreshed every cycle.' },
  { headline: 'Local, not generic', body: 'Independent restaurants, gyms, salons — not the same chains everywhere.' },
  { headline: 'Redeem in seconds', body: 'Show your code. Validated instantly. No printing, no fuss.' },
]

export function SavingsStatsSection() {
  return (
    <section className="bg-deep-navy py-24 px-6 overflow-hidden">
      <div className="max-w-screen-xl mx-auto divide-y divide-white/[0.06]">
        {claims.map((claim, i) => (
          <motion.div
            key={claim.headline}
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 lg:gap-16 items-baseline py-10 lg:py-14"
          >
            <h2
              className="font-display gradient-brand-text leading-none"
              style={{ fontSize: 'clamp(52px, 7vw, 96px)' }}
            >
              {claim.headline}
            </h2>
            <p className="text-base text-white/45 leading-relaxed max-w-xs">{claim.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
