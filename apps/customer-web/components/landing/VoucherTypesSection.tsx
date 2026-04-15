'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

type VoucherType = {
  title: string
  body: string
  accent: string
  accentBg: string
  icon: ReactNode
}

const VOUCHER_TYPES: VoucherType[] = [
  {
    title: 'Buy one get one free',
    body: 'Pay for one, get two. The classic BOGO offer at places worth visiting.',
    accent: '#7C3AED',
    accentBg: 'rgba(124,58,237,0.1)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 2v7a3 3 0 0 0 3 3v10"/>
        <path d="M6 12a3 3 0 0 0 3-3V2"/>
        <path d="M14 2h3a4 4 0 0 1 0 8h-3V2z"/>
        <path d="M14 14h3a4 4 0 0 1 0 8h-3v-8z"/>
      </svg>
    ),
  },
  {
    title: '50% off',
    body: 'Straight discount on the bill or a specific item.',
    accent: '#E20C04',
    accentBg: 'rgba(226,12,4,0.1)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="19" y1="5" x2="5" y2="19"/>
        <circle cx="7" cy="7" r="2.5"/>
        <circle cx="17" cy="17" r="2.5"/>
      </svg>
    ),
  },
  {
    title: 'Freebie',
    body: 'A free coffee, starter, or class just for showing up as a member.',
    accent: '#16A34A',
    accentBg: 'rgba(22,163,74,0.1)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="8" width="18" height="4" rx="1"/>
        <path d="M12 8v13"/>
        <path d="M5 12v9h14v-9"/>
        <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8"/>
        <path d="M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8"/>
      </svg>
    ),
  },
  {
    title: 'Spend and save',
    body: 'Spend £X, get £Y off. For higher-spend visits.',
    accent: '#D97706',
    accentBg: 'rgba(217,119,6,0.1)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 12V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1"/>
        <path d="M22 13h-6a2 2 0 0 0 0 4h6v-4z"/>
        <circle cx="17" cy="15" r="0.5" fill="currentColor"/>
      </svg>
    ),
  },
  {
    title: 'Package deal',
    body: 'Bundled value. A meal and a drink, a class and a guest pass.',
    accent: '#2563EB',
    accentBg: 'rgba(37,99,235,0.1)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16.5 9.4 7.55 4.24"/>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <path d="M3.27 6.96 12 12.01l8.73-5.05"/>
        <path d="M12 22.08V12"/>
      </svg>
    ),
  },
  {
    title: 'Fixed discount',
    body: '£5 off, £10 off. You always know exactly what you save.',
    accent: '#0D9488',
    accentBg: 'rgba(13,148,136,0.1)',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
    ),
  },
]

export function VoucherTypesSection() {
  return (
    <section className="bg-white py-20 md:py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="text-center max-w-[620px] mx-auto mb-14"
        >
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Every kind of voucher. In one place.
          </h2>
          <p className="text-[15px] text-[#4B5563] leading-[1.7]">
            From buy-one-get-one-free dining to free gym sessions. Here&apos;s what you&apos;ll find on Redeemo.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {VOUCHER_TYPES.map((type, i) => (
            <motion.div
              key={type.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{
                duration: 0.45,
                delay: i * 0.07,
                ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
              }}
              whileHover={{ y: -4 }}
              className="rounded-2xl border border-[#EDE8E8] bg-white p-7 cursor-default transition-shadow hover:shadow-[0_8px_28px_rgba(1,12,53,0.08)]"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                style={{ background: type.accentBg, color: type.accent }}
              >
                {type.icon}
              </div>
              <h3 className="font-body text-[16px] font-bold text-[#010C35] mb-2">{type.title}</h3>
              <p className="text-[14px] text-[#4B5563] leading-[1.65]">{type.body}</p>

              <div
                className="mt-5 h-[2px] w-8 rounded-full"
                style={{ background: type.accent, opacity: 0.5 }}
                aria-hidden="true"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
