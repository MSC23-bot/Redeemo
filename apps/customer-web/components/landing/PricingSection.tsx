'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { isMarketplaceLive } from '@/lib/prelaunch'
import { RibbonPeek } from './RibbonPeek'

type Plan = {
  name: string
  price: string
  priceSuffix?: string
  body: string
  cta: string
  href: string
  tone: 'neutral' | 'primary' | 'gold'
  badge?: string
  features: string[]
}

// Plan facts (price/features) never change pre-launch; only the CTA destination and
// label do. Pre-launch, /register IS the waitlist, so every CTA funnels there instead
// of stopping at /how-it-works.
function getPlans(marketplaceLive: boolean): Plan[] {
  return [
    {
      name: 'Free',
      price: '£0',
      body: 'Browse every merchant and voucher. No card needed.',
      cta: marketplaceLive ? 'Start exploring' : 'Create free account',
      href: '/register',
      tone: 'neutral',
      features: [
        'Browse all merchants',
        'View every voucher',
        'Read member reviews',
        'Save favourites',
      ],
    },
    {
      name: 'Monthly',
      price: '£6.99',
      priceSuffix: '/mo',
      body: 'Full voucher access. Cancel anytime.',
      cta: marketplaceLive ? 'Get started' : 'Get early access',
      href: marketplaceLive ? '/subscribe' : '/register',
      tone: 'primary',
      features: [
        'Everything in Free',
        'Redeem at all merchants',
        'One voucher per merchant/cycle',
        'Savings dashboard',
        'Personalised recommendations',
      ],
    },
    {
      name: 'Annual',
      price: '£69.99',
      priceSuffix: '/yr',
      body: 'Two months free. Pay once, save all year.',
      cta: marketplaceLive ? 'Best value' : 'Get early access',
      href: marketplaceLive ? '/subscribe?plan=annual' : '/register',
      tone: 'gold',
      badge: 'Best value',
      features: [
        'Everything in Monthly',
        '~2 months free vs monthly',
        'Priority customer support',
      ],
    },
  ]
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 mt-[1px]">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function PlanCard({ plan, delay }: { plan: Plan; delay: number }) {
  const isPrimary = plan.tone === 'primary'
  const isGold = plan.tone === 'gold'

  const checkColor = isPrimary ? '#E20C04' : isGold ? '#D97706' : '#16A34A'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.48, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className={`relative rounded-2xl p-8 flex flex-col border ${
        isPrimary
          ? 'border-[#E20C04] bg-white shadow-[0_12px_40px_rgba(226,12,4,0.14)]'
          : isGold
          ? 'border-[#D97706]/40 bg-white shadow-[0_8px_28px_rgba(217,119,6,0.10)]'
          : 'border-[#EDE8E8] bg-white'
      }`}
    >
      {plan.badge && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap"
          style={{ background: '#D97706' }}
        >
          {plan.badge}
        </div>
      )}

      <p
        className={`text-[11px] font-bold uppercase tracking-[0.14em] mb-3 ${
          isPrimary ? 'text-[#E20C04]' : isGold ? 'text-[#D97706]' : 'text-[#9CA3AF]'
        }`}
      >
        {plan.name}
      </p>

      <div className="mb-2">
        <span className="font-display text-[#010C35] text-[44px] leading-none">{plan.price}</span>
        {plan.priceSuffix && (
          <span className="text-[14px] text-[#9CA3AF] ml-1">{plan.priceSuffix}</span>
        )}
      </div>

      <p className="text-[13.5px] text-[#6B7280] leading-[1.55] mb-6">{plan.body}</p>

      {/* Feature list */}
      <ul className="space-y-2.5 mb-8 flex-1">
        {plan.features.map(f => (
          <li key={f} className="flex items-start gap-2.5">
            <CheckIcon color={checkColor} />
            <span className="text-[13.5px] text-[#374151] leading-[1.45]">{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={plan.href}
        aria-label={`${plan.cta}: ${plan.name} plan`}
        className={`mt-auto block text-center font-semibold text-[14px] py-3 rounded-xl no-underline transition-opacity hover:opacity-90 ${
          isPrimary
            ? 'text-white'
            : isGold
            ? 'text-white'
            : 'text-[#010C35] border border-[#D1CBC3] bg-white hover:border-[#010C35]/40'
        }`}
        style={
          isPrimary
            ? { background: 'var(--brand-gradient)' }
            : isGold
            ? { background: '#D97706' }
            : undefined
        }
      >
        {plan.cta}
      </Link>
    </motion.div>
  )
}

export function PricingSection() {
  const marketplaceLive = isMarketplaceLive()
  const plans = getPlans(marketplaceLive)

  return (
    <section className="relative overflow-hidden bg-white py-20 md:py-24 px-6">
      {/* The brand ribbon visits: mid-way between the seam bands, small and
          beside the centred headline so it never crowds content */}
      <RibbonPeek side="left" top="3%" width={200} />
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
            {marketplaceLive
              ? "Start free. Upgrade when you're ready."
              : 'This is what membership will cost.'}
          </h2>
          <p className="text-[15px] text-[#4B5563] leading-[1.7]">
            {marketplaceLive
              ? 'If one voucher saves you more than £6.99, the month has paid for itself.'
              : 'Founding members get their first 3 months free at launch: register now to lock it in.'}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1040px] mx-auto items-start">
          {plans.map((plan, i) => (
            <PlanCard key={plan.name} plan={plan} delay={i * 0.1} />
          ))}
        </div>

        {marketplaceLive && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="text-center mt-10"
          >
            <Link href="/pricing" className="text-[14px] font-semibold text-[#E20C04] no-underline hover:underline">
              Compare all plans &rarr;
            </Link>
          </motion.div>
        )}
      </div>
    </section>
  )
}
