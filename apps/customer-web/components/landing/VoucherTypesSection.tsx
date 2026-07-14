'use client'

import { motion } from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type VoucherType = {
  title: string
  chip: string
  body: string
  example: string
  accent: string
  accentBg: string
}

// Colours match the customer app's voucher-type design tokens exactly, so the
// marketing site speaks the same visual language members see once inside the app.
const VOUCHER_TYPES: VoucherType[] = [
  {
    title: 'Buy one get one free',
    chip: 'BOGO',
    body: 'Order one, get a second on the house.',
    example: 'Two mains for the price of one',
    accent: '#7C3AED',
    accentBg: 'rgba(124,58,237,0.1)',
  },
  {
    title: 'Discount',
    chip: 'Discount',
    body: 'A straight percentage or amount off your bill.',
    example: '20% off your total bill',
    accent: '#E20C04',
    accentBg: 'rgba(226,12,4,0.1)',
  },
  {
    title: 'Freebie',
    chip: 'Freebie',
    body: 'A free extra, on the house, just for being a member.',
    example: 'Free coffee with any breakfast',
    accent: '#16A34A',
    accentBg: 'rgba(22,163,74,0.1)',
  },
  {
    title: 'Spend and save',
    chip: 'Spend & save',
    body: 'Spend a set amount, save a fixed sum.',
    example: 'Spend £30, save £5',
    accent: '#E84A00',
    accentBg: 'rgba(232,74,0,0.1)',
  },
  {
    title: 'Package deal',
    chip: 'Package deal',
    body: 'A bundle priced lower than booking separately.',
    example: 'Class plus guest pass, one price',
    accent: '#2563EB',
    accentBg: 'rgba(37,99,235,0.1)',
  },
  {
    title: 'Time-limited',
    chip: 'Time-limited',
    body: 'A short-window offer, live for a set period.',
    example: 'Half price, weekday lunches only',
    accent: '#D97706',
    accentBg: 'rgba(217,119,6,0.1)',
  },
  {
    title: 'Reusable',
    chip: 'Reusable',
    body: 'Comes back fresh every cycle, automatically.',
    example: 'Ready again next month, no re-claim',
    accent: '#0D9488',
    accentBg: 'rgba(13,148,136,0.1)',
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
          transition={{ duration: 0.5, ease: EASE }}
          className="text-center max-w-[620px] mx-auto mb-14"
        >
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Every kind of voucher. In one place.
          </h2>
          <p className="text-[15px] text-[#4B5563] leading-[1.7]">
            Seven voucher types, always clearly labelled, so you know exactly what you&apos;re getting before you go.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {VOUCHER_TYPES.map((type, i) => (
            <motion.div
              key={type.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: i * 0.06, ease: EASE }}
              whileHover={{ y: -4 }}
              className="relative rounded-2xl border border-[#EDE8E8] bg-white pl-6 pr-6 py-6 overflow-hidden cursor-default transition-shadow hover:shadow-[0_8px_28px_rgba(1,12,53,0.08)]"
            >
              {/* 3px left stripe in the type colour */}
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ background: type.accent }}
              />

              <span
                className="inline-block text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full mb-3"
                style={{ color: type.accent, background: type.accentBg }}
              >
                {type.chip}
              </span>

              <h3 className="font-body text-[16px] font-bold text-[#010C35] mb-1.5">{type.title}</h3>
              <p className="text-[13.5px] text-[#4B5563] leading-[1.6] mb-4">{type.body}</p>

              <div
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
                style={{ background: type.accentBg, color: type.accent }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {type.example}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
