'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

/**
 * The definition section (owner direction 2026-07-08): a cold visitor has no
 * idea what Redeemo is; say it plainly, early, before the product cinema.
 * Editorial layout on purpose: a definition statement with the three things
 * the app actually does beside it as a numbered ledger, not icon cards. The
 * "what it is not" line rides as struck-through chips: the anti deal-site
 * positioning made visual.
 */

const PILLARS = [
  {
    n: '01',
    title: 'Find local offers',
    body: 'Restaurants, cafes, gyms, salons, shops and days out near you, each carrying its own member voucher.',
  },
  {
    n: '02',
    title: 'Redeem in store',
    body: 'Tap redeem when you are there and show your code at the counter. Staff confirm it in seconds.',
  },
  {
    n: '03',
    title: 'Track your savings',
    body: 'Every redeemed voucher and every pound it saved you, kept in one place.',
  },
]

const NOTS = ['No hunting for codes', 'No screenshots', 'No deal-site games']

function CrossGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="flex-shrink-0">
      <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="#E20C04" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

const rise = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0 },
}

export function WhatIsRedeemoSection() {
  return (
    <section className="relative overflow-hidden bg-white py-24 md:py-32 px-6" aria-label="What is Redeemo">
      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-24 items-start">

        {/* The definition */}
        <motion.div
          variants={rise}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-[12px] font-bold tracking-[0.2em] uppercase text-[#E20C04] mb-5">What is Redeemo</p>
          <h2
            className="font-display text-[#010C35] leading-[1.08] mb-6"
            style={{ fontSize: 'clamp(32px, 3.6vw, 52px)', letterSpacing: '-0.8px' }}
          >
            Made for the places you actually go.
          </h2>
          <p className="text-[16.5px] text-[#4B5563] leading-[1.75] max-w-[520px] mb-4">
            Redeemo is a lifestyle savings app. Local businesses of every kind
            and size come together in one simple app, each offering vouchers
            you can only get as a member.
          </p>
          <p className="text-[16.5px] text-[#4B5563] leading-[1.75] max-w-[520px] mb-8">
            Browse what is near you for free, choose a voucher, and use it when
            you&nbsp;visit.
          </p>

          {/* What it is not */}
          <div className="flex flex-wrap gap-2.5 mb-9">
            {NOTS.map((line) => (
              <span
                key={line}
                className="inline-flex items-center gap-2 rounded-full border border-[#010C35]/12 px-3.5 py-1.5 text-[13px] text-[#6B7280]"
              >
                <CrossGlyph />
                {line}
              </span>
            ))}
          </div>

          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-1.5 text-[15px] font-bold text-[#E20C04] no-underline hover:opacity-80 transition-opacity"
          >
            See how it works
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8 h9 M8.5 3.5 L13 8 l-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </motion.div>

        {/* The ledger: what the app does, three lines, no cards */}
        <div className="lg:pt-16">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.n}
              variants={rise}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className={`grid grid-cols-[72px_1fr] gap-5 items-start py-7 ${i > 0 ? 'border-t border-[#010C35]/10' : 'lg:pt-0'}`}
            >
              <span
                aria-hidden="true"
                className="font-display leading-none select-none"
                style={{ fontSize: '44px', color: 'rgba(226,12,4,0.18)', letterSpacing: '-1px' }}
              >
                {p.n}
              </span>
              <div>
                <h3 className="text-[19px] font-semibold text-[#010C35] mb-1.5 leading-snug">{p.title}</h3>
                <p className="text-[14.5px] text-[#4B5563] leading-[1.7] max-w-[380px]">{p.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
