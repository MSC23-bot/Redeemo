'use client'
import { motion } from 'framer-motion'
import { useState } from 'react'

const FAQS = [
  {
    q: 'What is the 12-month contract?',
    a: 'Merchants sign a 12-month listing agreement, accepted digitally during onboarding. This ensures our subscriber base sees stable, committed local businesses and gives you consistent exposure for a full year.',
  },
  {
    q: 'Can I change my vouchers after approval?',
    a: 'Your two mandatory vouchers are fixed once approved. They are the core of your Redeemo listing. You can add custom vouchers (RCV) at any time, subject to a quick admin review.',
  },
  {
    q: 'What happens if I want to suspend or leave?',
    a: 'You can request suspension or offboarding via the merchant portal. Your redemption history is preserved. Your vouchers are immediately hidden from subscribers once suspended.',
  },
  {
    q: 'Is there a commission on redemptions?',
    a: 'None. Redeemo charges no commission on voucher redemptions. Your only optional cost is featured placement when you want extra reach.',
  },
]

function FaqItem({ faq, index }: { faq: typeof FAQS[0]; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.07 }}
      className="border-b border-navy/[0.08]"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left py-7 flex items-center justify-between gap-6 group"
        aria-expanded={open}
      >
        <span className="text-[17px] font-semibold text-navy group-hover:text-red transition-colors">
          {faq.q}
        </span>
        <span
          className="text-navy/30 text-xl flex-shrink-0 transition-transform duration-300"
          style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
          aria-hidden
        >
          +
        </span>
      </button>
      {open && (
        <p className="pb-7 text-[15px] leading-[1.75] text-navy/60 max-w-2xl">
          {faq.a}
        </p>
      )}
    </motion.div>
  )
}

export function MerchantSignupCta() {
  return (
    <>
      {/* FAQ */}
      <section className="bg-white py-24 px-6">
        <div className="max-w-screen-lg mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="font-display text-[clamp(28px,3.5vw,44px)] font-normal text-navy mb-14"
          >
            Common questions
          </motion.h2>
          <div>
            {FAQS.map((faq, i) => (
              <FaqItem key={faq.q} faq={faq} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Full-width closing CTA */}
      <section className="relative bg-deep-navy overflow-hidden py-32 px-6">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(145deg, rgba(226,0,12,0.08) 0%, transparent 55%)' }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-white/[0.03] leading-none whitespace-nowrap select-none pointer-events-none"
          style={{ fontSize: 'clamp(100px, 16vw, 200px)' }}
        >
          Join Redeemo
        </span>

        <div className="relative max-w-screen-md mx-auto text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="font-mono text-xs tracking-[0.12em] uppercase text-orange-red mb-6"
          >
            Ready to grow?
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="font-display text-[clamp(36px,5vw,68px)] font-normal text-white leading-[1.08] mb-6"
          >
            Your customers are already here.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="text-[17px] leading-relaxed text-white/55 mb-12 max-w-lg mx-auto"
          >
            Apply free. We review every merchant to maintain the quality our subscribers expect, so your listing is in good company from day one.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <a
              href="mailto:merchants@redeemo.com"
              className="inline-block text-white font-bold text-[20px] px-14 py-5 rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #E2000C, #E84A00)', boxShadow: '0 0 48px rgba(226,0,12,0.4)' }}
            >
              Apply to join, it&apos;s free
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mt-6 text-[13px] text-white/25 font-mono"
          >
            merchants@redeemo.com
          </motion.p>
        </div>
      </section>
    </>
  )
}
