'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { isMarketplaceLive } from '@/lib/prelaunch'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * The founding-member ticket (owner 2026-07-08): pre-launch, creating an
 * account IS the waitlist. No email form: the section is the offer itself,
 * shaped as the product's own object: a voucher with a tear-line stub. The
 * stub carries the claim CTA into /register.
 *
 * The 3-months-free launch incentive is owner-directed copy; the fulfilment
 * mechanism (marking the founding cohort, granting the free period, the
 * profile badge) is an Admin Panel follow-up recorded in
 * docs/deferrals/open-register.md (§FOUND.1). Section disappears at launch.
 */

const PERKS = [
  'Three months of full membership, free at launch',
  'Founding member badge on your profile',
  'First to know when we reach your town',
]

function Tick() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0 mt-[3px]">
      <circle cx="8" cy="8" r="7.25" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      <path d="M5 8.2 L7.2 10.4 L11 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function WaitlistSection() {
  // At launch the founding window has closed; Pricing and the app CTAs take over.
  if (isMarketplaceLive()) return null

  return (
    <section id="waitlist" style={{ background: '#FAFAF8' }} className="py-12 md:py-28 px-6">
      <div className="max-w-[1020px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{ filter: 'drop-shadow(0 24px 48px rgba(190,10,3,0.22))' }}
        >
          <div
            className="relative overflow-hidden rounded-[28px] grid md:grid-cols-[1fr_340px]"
            style={{ background: '#BE0A03 radial-gradient(130% 320% at 20% 0%, #F24E2C 0%, #BE0A03 100%)' }}
          >
            {/* Die-cut notches where the stub tears off (desktop) */}
            <div aria-hidden="true" className="hidden md:block absolute w-6 h-6 rounded-full -top-3 right-[328px]" style={{ background: '#FAFAF8' }} />
            <div aria-hidden="true" className="hidden md:block absolute w-6 h-6 rounded-full -bottom-3 right-[328px]" style={{ background: '#FAFAF8' }} />

            {/* Main: the offer */}
            <div className="px-6 py-7 md:px-12 md:py-12">
              <p className="text-[11px] md:text-[11.5px] font-bold tracking-[0.2em] uppercase text-white/65 mb-3 md:mb-4">Founding member offer</p>
              <h2
                className="font-display text-white leading-[1.1] mb-3 md:mb-4"
                style={{ fontSize: 'clamp(23px, 3.2vw, 42px)', letterSpacing: '-0.6px', textWrap: 'balance' }}
              >
                Join before launch. Three months on us.
              </h2>
              <p className="text-[13.5px] md:text-[15px] text-white/85 leading-[1.6] md:leading-[1.7] max-w-[440px] mb-4 md:mb-7" style={{ textWrap: 'pretty' }}>
                Create your free account today and your place is saved as a
                founding member: full membership, every voucher included, free
                for your first three months when Redeemo goes live.
              </p>
              <ul className="flex flex-col gap-2 md:gap-2.5 list-none p-0 m-0">
                {PERKS.map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 text-[13px] md:text-[14px] text-white/95 leading-[1.5]">
                    <Tick />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>

            {/* Stub: tear here, claim it */}
            <div className="relative px-6 py-7 md:px-8 md:py-12 flex flex-col items-center justify-center text-center border-t-2 md:border-t-0 md:border-l-2 border-dashed border-white/35">
              <p className="font-display text-white leading-none mb-1" style={{ fontSize: 'clamp(32px, 4vw, 46px)', letterSpacing: '-1px' }}>
                3 months
              </p>
              <p className="text-[11px] md:text-[12px] font-bold tracking-[0.18em] uppercase text-white/70 mb-4 md:mb-7">Free at launch</p>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 bg-white text-[#BE0A03] font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
              >
                Create free account
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <p className="mt-3 md:mt-4 text-[11.5px] md:text-[12px] text-white/60">Free to join · no card needed · takes a minute</p>
            </div>
          </div>
        </motion.div>

        {/* Where the rollout starts: quiet, at the point of conversion */}
        <p className="mt-4 md:mt-6 text-center text-[12px] md:text-[13px] text-[#6B7280] leading-[1.6]">
          Rolling out first in Huddersfield and the surrounding areas, then more
          towns and cities across the UK. Join now and we will tell you the
          moment we reach yours.
        </p>
      </div>
    </section>
  )
}
