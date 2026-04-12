'use client'

import { motion } from 'framer-motion'

const HERO_QUOTE = {
  quote: "I saved over £200 in my first two months. The local restaurant vouchers alone are worth the subscription.",
  name: 'Sarah M.',
  location: 'Manchester',
}

const SUPPORTING_QUOTES = [
  { quote: "Finally a voucher app that has places I actually want to go. Not the same chains everywhere.", name: 'James T.', location: 'Leeds' },
  { quote: "Showed my code, validated in seconds. No awkward paper coupons.", name: 'Priya K.', location: 'Birmingham' },
]

export function TestimonialsSection() {
  return (
    <section className="bg-white py-24 px-6">
      <div className="max-w-screen-xl mx-auto">

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-red mb-16"
        >
          What subscribers say
        </motion.p>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12 lg:gap-16 items-start">

          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div
              className="font-display text-navy/[0.06] leading-none select-none mb-[-20px]"
              style={{ fontSize: 'clamp(80px, 10vw, 140px)' }}
              aria-hidden
            >
              &ldquo;
            </div>
            <blockquote className="font-display text-navy leading-[1.35] mb-10 not-italic" style={{ fontSize: 'clamp(22px, 2.5vw, 32px)' }}>
              {HERO_QUOTE.quote}
            </blockquote>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(135deg, #E2000C, #EE6904)' }} />
              <div>
                <p className="font-semibold text-navy text-sm">{HERO_QUOTE.name}</p>
                <p className="font-mono text-xs text-navy/40">{HERO_QUOTE.location}</p>
              </div>
            </div>
          </motion.div>

          <div className="flex flex-col gap-8">
            {SUPPORTING_QUOTES.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.1 }}
                className="bg-surface-muted rounded-2xl p-7 border border-navy/[0.05]"
              >
                <p className="text-sm leading-relaxed text-navy/65 mb-5 italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(135deg, #E2000C, #EE6904)' }} />
                  <div>
                    <p className="font-semibold text-navy text-xs">{t.name}</p>
                    <p className="font-mono text-[10px] text-navy/40">{t.location}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
