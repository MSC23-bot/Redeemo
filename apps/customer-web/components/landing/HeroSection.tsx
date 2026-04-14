'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

export function HeroSection() {
  return (
    <section
      className="relative overflow-hidden py-24 md:py-32 px-6"
      style={{ background: 'linear-gradient(160deg, #FFF8F7 0%, #FFFFFF 60%)' }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="max-w-[680px]">

          {/* Eyebrow */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-5"
          >
            UK&apos;s local voucher membership
          </motion.p>

          {/* H1 */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="font-display text-[#010C35] leading-[1.08] mb-6"
            style={{ fontSize: 'clamp(40px, 5.5vw, 68px)', letterSpacing: '-1px' }}
          >
            The membership that{' '}
            <span className="gradient-text">
              rewards you locally.
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.22 }}
            className="text-[15px] leading-[1.65] text-[#4B5563] max-w-[440px] mb-10"
          >
            One subscription unlocks exclusive vouchers from restaurants, cafes, gyms, salons, and more — all within your neighbourhood.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.34 }}
            className="flex flex-wrap items-center gap-4 mb-10"
          >
            <Link
              href="/subscribe"
              className="inline-block text-white font-semibold text-[15px] px-7 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'var(--brand-gradient)' }}
            >
              Get started — from £6.99/mo
            </Link>
            <Link
              href="/how-it-works"
              className="text-[15px] font-medium text-[#4B5563] no-underline hover:text-[#010C35] transition-colors"
            >
              See how it works &rarr;
            </Link>
          </motion.div>

          {/* Stats card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.46 }}
            className="inline-flex items-center gap-8 bg-white border border-[#EDE8E8] rounded-xl px-7 py-4 shadow-sm"
          >
            {[
              { value: '500+', label: 'merchants' },
              { value: '£6.99', label: 'per month' },
              { value: '1x', label: 'per merchant/cycle' },
            ].map((stat, i) => (
              <div key={stat.label} className={`flex flex-col items-center gap-0.5 ${i > 0 ? 'border-l border-[#EDE8E8] pl-8' : ''}`}>
                <span className="font-display font-semibold text-[22px] leading-none gradient-text">
                  {stat.value}
                </span>
                <span className="text-[11px] text-[#9CA3AF] font-medium tracking-wide">
                  {stat.label}
                </span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
