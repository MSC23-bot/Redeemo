'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { AppMockupFrame } from '@/components/ui/AppMockupFrame'

const FEATURES = [
  'Browse offers by category or map',
  'Instant in-store redemption',
  'Track your monthly savings',
  'Favourites for quick access',
]

export function AppMockupSection() {
  return (
    <section className="bg-white py-24 px-6 overflow-hidden">
      <div className="max-w-screen-xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">

        <motion.div
          initial={{ opacity: 0, x: -32 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-red mb-4">Mobile app</p>
          <h2 className="font-display text-navy leading-[1.1] mb-6" style={{ fontSize: 'clamp(32px, 4vw, 52px)' }}>
            Redeem anywhere,{' '}
            <span className="gradient-brand-text">in seconds</span>
          </h2>
          <p className="text-[16px] leading-[1.75] text-navy/60 mb-8 max-w-[440px]">
            The Redeemo app puts your vouchers at your fingertips. Tap to redeem in-store — no printing, no fuss. Your savings history is always there when you need it.
          </p>

          <ul className="flex flex-col gap-3.5 mb-10">
            {FEATURES.map(item => (
              <li key={item} className="flex items-center gap-3 text-[15px] text-navy/75">
                <span className="w-1.5 h-1.5 rounded-full bg-red flex-shrink-0" aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          <Link
            href="/subscribe"
            className="inline-block text-white font-semibold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #E2000C, #EE6904)' }}
          >
            Get started
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 32 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="flex justify-center items-center gap-5"
        >
          <div className="-translate-y-8">
            <AppMockupFrame size="sm" />
          </div>
          <div className="translate-y-8">
            <AppMockupFrame size="sm" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
