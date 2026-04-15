'use client'

import { motion } from 'framer-motion'
import { AppStoreBadge, GooglePlayBadge } from './HeroSection'

type Step = {
  n: number
  title: string
  body: string
}

const GET_STARTED: Step[] = [
  {
    n: 1,
    title: 'Download the app',
    body: 'Free on iOS and Android. Browse merchants and vouchers near you straight away. No account needed.',
  },
  {
    n: 2,
    title: 'Subscribe from £6.99',
    body: 'Choose monthly or annual. Your vouchers unlock instantly across every merchant on Redeemo.',
  },
]

const REDEEMING: Step[] = [
  {
    n: 3,
    title: 'Find a merchant near you',
    body: 'Browse merchants in the app by location or category. When you find somewhere worth visiting, go there.',
  },
  {
    n: 4,
    title: 'Tap redeem on your voucher',
    body: 'Open your voucher in the app and tap Redeem. The app confirms you are at the venue.',
  },
  {
    n: 5,
    title: 'Show your code',
    body: 'Your unique voucher code appears on screen. Show it to staff or let them scan the QR.',
  },
  {
    n: 6,
    title: 'Pay less',
    body: 'Discount applied at the till. No minimum spend surprises. No awkward moments. Done.',
  },
]

function StepCard({ step, tone, delay }: { step: Step; tone: 'brand' | 'success'; delay: number }) {
  const badgeStyle =
    tone === 'brand'
      ? { background: 'var(--brand-gradient)', color: '#FFFFFF' }
      : { background: '#16A34A', color: '#FFFFFF' }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className="flex gap-4 items-start rounded-2xl border border-[#E5E0D8] bg-white p-6 hover:shadow-[0_4px_20px_rgba(1,12,53,0.06)] transition-shadow"
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-[14px]"
        style={badgeStyle}
        aria-hidden="true"
      >
        {step.n}
      </div>
      <div>
        <h3 className="font-body text-[15px] font-bold text-[#010C35] mb-1.5">{step.title}</h3>
        <p className="text-[14px] text-[#4B5563] leading-[1.65]">{step.body}</p>
      </div>
    </motion.div>
  )
}

export function HowItWorksSection() {
  return (
    <section style={{ background: '#FAFAF8' }} className="py-20 md:py-24 px-6">
      <div className="max-w-7xl mx-auto">

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="text-center max-w-[640px] mx-auto mb-14"
        >
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Simple to join. Even simpler to redeem.
          </h2>
          <p className="text-[15px] text-[#4B5563] leading-[1.7]">
            Everything happens in the app. Browse merchants, find vouchers, and redeem in seconds.
          </p>
        </motion.div>

        {/* Group 1: Get Started */}
        <div className="mb-12">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-5"
          >
            Get started
          </motion.p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {GET_STARTED.map((s, i) => (
              <StepCard key={s.n} step={s} tone="brand" delay={i * 0.08} />
            ))}
          </div>
        </div>

        {/* Group 2: Redeeming */}
        <div className="mb-10">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#16A34A] mb-5"
          >
            Redeeming a voucher
          </motion.p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {REDEEMING.map((s, i) => (
              <StepCard key={s.n} step={s} tone="success" delay={i * 0.07} />
            ))}
          </div>
        </div>

        {/* Ready to start ribbon */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="rounded-2xl bg-[#FEF6F5] border border-[#EDE8E8] px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <p className="text-[15px] text-[#010C35] font-medium">
            Ready to start? Download the app. It&apos;s free.
          </p>
          <div className="flex gap-3 flex-shrink-0 flex-wrap">
            <AppStoreBadge />
            <GooglePlayBadge />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
