'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { AppStoreBadge, GooglePlayBadge } from './HeroSection'
import { isMarketplaceLive } from '@/lib/prelaunch'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type Step = {
  n: number
  title: string
  body: string
}

// The hero already tells the visual story (phone demo + facts strip); this section
// is intentionally a single, simple 3-step strip rather than a duplicate walkthrough.
const STEPS: Step[] = [
  {
    n: 1,
    title: 'Browse free',
    body: 'See every place and voucher near you before you spend anything.',
  },
  {
    n: 2,
    title: 'Subscribe when ready',
    body: 'From £6.99 a month. Every voucher included. Cancel anytime.',
  },
  {
    n: 3,
    title: 'Redeem in-store',
    body: 'Go to the venue, tap redeem, show your phone. Done.',
  },
]

function StepCard({ step, delay }: { step: Step; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      className="rounded-2xl border border-[#E5E0D8] bg-white p-8 hover:shadow-[0_8px_28px_rgba(1,12,53,0.06)] transition-shadow"
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center font-display text-[18px] mb-5"
        style={{ background: 'var(--brand-gradient)', color: '#FFFFFF' }}
        aria-hidden="true"
      >
        {step.n}
      </div>
      <h3 className="font-body text-[17px] font-bold text-[#010C35] mb-2">{step.title}</h3>
      <p className="text-[14px] text-[#4B5563] leading-[1.65]">{step.body}</p>
    </motion.div>
  )
}

export function HowItWorksSection() {
  const marketplaceLive = isMarketplaceLive()

  return (
    <section style={{ background: '#FAFAF8' }} className="py-20 md:py-24 px-6">
      <div className="max-w-7xl mx-auto">

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="text-center max-w-[640px] mx-auto mb-14"
        >
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Simple to join. Even simpler to redeem.
          </h2>
          <p className="text-[15px] text-[#4B5563] leading-[1.7]">
            Three steps, start to finish. No apps within apps, no faff at the till.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
          {STEPS.map((s, i) => (
            <StepCard key={s.n} step={s} delay={i * 0.1} />
          ))}
        </div>

        {/* Ribbon */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45, ease: EASE }}
          className="rounded-2xl bg-[#FEF6F5] border border-[#EDE8E8] px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          {marketplaceLive ? (
            <>
              <p className="text-[15px] text-[#010C35] font-medium">
                Ready to start? Download the app. It&apos;s free.
              </p>
              <div className="flex gap-3 flex-shrink-0 flex-wrap">
                <AppStoreBadge />
                <GooglePlayBadge />
              </div>
            </>
          ) : (
            <>
              <p className="text-[15px] text-[#010C35] font-medium">
                The app arrives with launch.
              </p>
              <Link
                href="/how-it-works"
                className="text-[14px] font-semibold text-[#E20C04] no-underline hover:underline flex-shrink-0"
              >
                See the full journey &rarr;
              </Link>
            </>
          )}
        </motion.div>
      </div>
    </section>
  )
}
