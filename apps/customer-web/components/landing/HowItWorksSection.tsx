'use client'

import { motion } from 'framer-motion'

const steps = [
  { number: '01', title: 'Subscribe', body: 'Choose monthly or annual. Cancel any time — no lock-in, no hidden fees.' },
  { number: '02', title: 'Discover', body: 'Browse exclusive offers from local restaurants, gyms, salons, and more near you.' },
  { number: '03', title: 'Redeem in-store', body: 'Show your code. The merchant validates it in seconds. Saving done.' },
]

export function HowItWorksSection() {
  return (
    <section className="bg-[#F8F9FA] py-24 px-6 overflow-hidden">
      <div className="max-w-screen-xl mx-auto">

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-20"
        >
          <p className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-red mb-4">How it works</p>
          <h2 className="font-display text-navy leading-[1.1]" style={{ fontSize: 'clamp(32px, 4vw, 52px)' }}>Three steps to local savings</h2>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 relative">
          {/* Connector line — desktop only */}
          <div aria-hidden className="hidden lg:block absolute top-[72px] left-[16.5%] right-[16.5%] h-px bg-navy/10" />

          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: i * 0.12 }}
              className="relative pb-12 lg:pb-0 px-0 lg:px-10 first:pl-0 last:pr-0"
            >
              {/* Oversized background number */}
              <div
                aria-hidden
                className="absolute top-0 left-0 font-display leading-none select-none pointer-events-none text-navy"
                style={{ fontSize: 'clamp(120px, 14vw, 200px)', opacity: 0.04, lineHeight: 1 }}
              >
                {step.number}
              </div>

              <div className="relative pt-12 lg:pt-16">
                <div
                  className="w-4 h-4 rounded-full mb-8 relative z-10"
                  style={{ background: 'var(--brand-gradient)' }}
                />
                <h3 className="font-display text-3xl text-navy mb-4 leading-tight">{step.title}</h3>
                <p className="text-base leading-relaxed text-navy/55 max-w-[260px]">{step.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
