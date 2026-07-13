'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { isMarketplaceLive } from '@/lib/prelaunch'
import { RibbonPeek } from './RibbonPeek'

/**
 * Pricing as the product's own object (owner 2026-07-13: the plain boxes
 * needed a drastic lift): each plan is a voucher TICKET: a toned header
 * stub, a dashed tear line with die-cut side notches, the plan's facts
 * below, all three the same size. Tickets lift on hover and on touch.
 * Mobile: one screen: the shelf swipes horizontally and opens centred on
 * the Monthly ticket instead of stacking three tall cards.
 */

type Plan = {
  name: string
  price: string
  priceSuffix?: string
  body: string
  cta: string
  href: string
  tone: 'neutral' | 'primary' | 'navy'
  badge?: string
  features: string[]
}

// Plan facts (price/features) never change pre-launch; only the CTA
// destination and label do. Pre-launch, /register IS the waitlist.
function getPlans(marketplaceLive: boolean): Plan[] {
  return [
    {
      name: 'Free',
      price: '£0',
      body: 'Browse everything before you spend anything.',
      cta: marketplaceLive ? 'Start exploring' : 'Create free account',
      href: '/register',
      tone: 'neutral',
      features: [
        'Browse all merchants',
        'View every voucher',
        'Member reviews & favourites',
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
      badge: 'Most popular',
      features: [
        'Everything in Free',
        'Redeem at every merchant',
        'Fresh vouchers each cycle',
        'Savings dashboard',
      ],
    },
    {
      name: 'Annual',
      price: '£69.99',
      priceSuffix: '/yr',
      body: 'Two months free. Pay once, save all year.',
      cta: marketplaceLive ? 'Best value' : 'Get early access',
      href: marketplaceLive ? '/subscribe?plan=annual' : '/register',
      tone: 'navy',
      badge: 'Best value',
      features: [
        'Everything in Monthly',
        'Two months free vs monthly',
        'Priority customer support',
      ],
    },
  ]
}

// The tear line sits under the header stub; the notches are cut from the
// card's own silhouette so the shadow wrapper shows them as real die-cuts.
const TEAR_Y = 132

const HEADERS: Record<Plan['tone'], { bg: string; text: string; sub: string; tick: string }> = {
  neutral: { bg: 'linear-gradient(150deg, #FFF3EC 0%, #FFE8DC 100%)', text: '#010C35', sub: 'rgba(1,12,53,0.55)', tick: '#16A34A' },
  primary: { bg: '#BE0A03 radial-gradient(140% 320% at 70% 0%, #F24E2C 0%, #BE0A03 100%)', text: '#FFFFFF', sub: 'rgba(255,255,255,0.75)', tick: '#E20C04' },
  navy: { bg: 'linear-gradient(155deg, #14235E 0%, #010C35 78%)', text: '#FFFFFF', sub: 'rgba(255,255,255,0.65)', tick: '#E84A00' },
}

function Tick({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 mt-[2px]">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function PlanTicket({ plan, delay }: { plan: Plan; delay: number }) {
  const h = HEADERS[plan.tone]
  const featured = plan.tone === 'primary'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.48, delay, ease: [0.22, 1, 0.36, 1] }}
      className="relative h-full flex-shrink-0 w-[272px] snap-center lg:w-auto"
    >
      <motion.div
        className="relative h-full"
        whileHover={{ y: -10, scale: 1.015 }}
        whileTap={{ y: -6, scale: 1.01 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      >
        {plan.badge && (
          <div
            className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 text-white text-[10.5px] font-bold uppercase tracking-[0.1em] px-3 py-1 rounded-full whitespace-nowrap"
            style={{ background: featured ? 'var(--brand-gradient)' : '#E84A00' }}
          >
            {plan.badge}
          </div>
        )}

        {/* Shadow on a wrapper so the die-cut notches read in the silhouette */}
        <div
          className="h-full"
          style={{
            filter: featured
              ? 'drop-shadow(0 20px 40px rgba(190,10,3,0.22))'
              : 'drop-shadow(0 16px 32px rgba(1,12,53,0.12))',
          }}
        >
          <div
            className="relative h-full w-full bg-white overflow-hidden flex flex-col"
            style={{
              borderRadius: 20,
              maskImage: `radial-gradient(circle at 0 ${TEAR_Y}px, transparent 9.5px, black 10px), radial-gradient(circle at 100% ${TEAR_Y}px, transparent 9.5px, black 10px)`,
              WebkitMaskImage: `radial-gradient(circle at 0 ${TEAR_Y}px, transparent 9.5px, black 10px), radial-gradient(circle at 100% ${TEAR_Y}px, transparent 9.5px, black 10px)`,
              maskComposite: 'intersect',
              WebkitMaskComposite: 'source-in',
            }}
          >
            {/* Header stub */}
            <div className="px-6 pt-5" style={{ height: TEAR_Y, background: h.bg }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-2.5" style={{ color: h.sub }}>
                {plan.name}
              </p>
              <div className="flex items-baseline gap-1">
                <span className="font-display leading-none" style={{ fontSize: 40, letterSpacing: '-0.8px', color: h.text }}>
                  {plan.price}
                </span>
                {plan.priceSuffix && (
                  <span className="text-[13px] font-semibold" style={{ color: h.sub }}>{plan.priceSuffix}</span>
                )}
              </div>
              <p className="mt-1.5 text-[12px] leading-[1.45]" style={{ color: h.sub }}>{plan.body}</p>
            </div>

            {/* Tear line on the notch line */}
            <div aria-hidden="true" className="mx-5 border-t-2 border-dashed border-[#010C35]/12" />

            {/* Facts */}
            <ul className="flex-1 flex flex-col gap-2.5 px-6 pt-5 list-none m-0">
              {plan.features.map(f => (
                <li key={f} className="flex items-start gap-2.5">
                  <Tick color={h.tick} />
                  <span className="text-[13.5px] text-[#374151] leading-[1.45]">{f}</span>
                </li>
              ))}
            </ul>

            <div className="px-5 pb-5 pt-6">
              <Link
                href={plan.href}
                aria-label={`${plan.cta}: ${plan.name} plan`}
                className={`block text-center font-bold text-[14px] py-3 rounded-xl no-underline transition-opacity hover:opacity-90 ${
                  plan.tone === 'neutral' ? 'text-[#010C35] border border-[#D1CBC3] bg-white' : 'text-white'
                }`}
                style={
                  plan.tone === 'primary'
                    ? { background: 'var(--brand-gradient)', boxShadow: '0 4px 16px rgba(226,12,4,0.28)' }
                    : plan.tone === 'navy'
                    ? { background: '#010C35' }
                    : undefined
                }
              >
                {plan.cta}
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function PricingSection() {
  const marketplaceLive = isMarketplaceLive()
  const plans = getPlans(marketplaceLive)
  const rowRef = useRef<HTMLDivElement>(null)

  // Mobile: open the shelf centred on the Monthly ticket, with Free and
  // Annual visibly peeking either side (owner 2026-07-13: they sometimes
  // were not). Centre after layout settles, and again on resize.
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const centre = () => {
      if (window.innerWidth >= 1024) return
      const monthly = el.children[1] as HTMLElement | undefined
      if (monthly) el.scrollLeft = monthly.offsetLeft - (el.clientWidth - monthly.clientWidth) / 2
    }
    const raf = requestAnimationFrame(centre)
    const late = window.setTimeout(centre, 250)
    window.addEventListener('resize', centre)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(late)
      window.removeEventListener('resize', centre)
    }
  }, [])

  return (
    <section className="relative overflow-hidden bg-white py-14 md:py-24 px-6">
      {/* The brand ribbon visits: mid-way between the seam bands, small and
          beside the centred headline so it never crowds content */}
      <RibbonPeek side="left" top="3%" width={200} />
      <div className="max-w-7xl mx-auto">

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center max-w-[640px] mx-auto mb-9 md:mb-14"
        >
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-3 md:mb-4"
            style={{ fontSize: 'clamp(26px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            {marketplaceLive
              ? "Start free. Upgrade when you're ready."
              : 'This is what membership will cost.'}
          </h2>
          <p className="text-[13.5px] md:text-[15px] text-[#4B5563] leading-[1.65]">
            {marketplaceLive
              ? 'If one voucher saves you more than £6.99, the month has paid for itself.'
              : 'Founding members get their first 2 months free at launch: register now to lock it in.'}
          </p>
        </motion.div>

        {/* Desktop: three equal tickets. Mobile: a swipeable shelf, opened
            on Monthly, so pricing fits one screen. */}
        <div
          ref={rowRef}
          className="flex overflow-x-auto snap-x snap-mandatory gap-4 -mx-6 px-6 pb-4 pt-4 lg:grid lg:grid-cols-3 lg:overflow-visible lg:gap-6 lg:mx-auto lg:px-0 lg:pb-0 lg:max-w-[1040px] items-stretch"
          style={{ scrollbarWidth: 'none' }}
        >
          {plans.map((plan, i) => (
            <PlanTicket key={plan.name} plan={plan} delay={i * 0.1} />
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
