'use client'

import Link from 'next/link'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanFeature = { label: string; included: boolean }

type Plan = {
  id: string
  name: string
  price: string
  priceNote: string
  period: string
  badge: { label: string; tone: 'red' | 'amber' } | null
  tone: 'neutral' | 'red' | 'amber'
  features: PlanFeature[]
  cta: { label: string; href: string }
  savingsNote?: string
}

// ── Data ──────────────────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '£0',
    priceNote: '',
    period: 'Always free. No card needed.',
    badge: null,
    tone: 'neutral',
    features: [
      { label: 'Browse all merchants', included: true },
      { label: 'View all vouchers', included: true },
      { label: 'Read member reviews', included: true },
      { label: 'Save favourites', included: true },
      { label: 'Redeem vouchers', included: false },
      { label: 'Savings tracker', included: false },
    ],
    cta: { label: 'Browse for free', href: '/register' },
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: '£6.99',
    priceNote: '/mo',
    period: 'Cancel anytime',
    badge: { label: 'Most popular', tone: 'red' },
    tone: 'red',
    features: [
      { label: 'Everything in free', included: true },
      { label: 'Redeem at all merchants', included: true },
      { label: 'Voucher resets each cycle', included: true },
      { label: 'Personalised picks', included: true },
      { label: 'Savings tracker', included: true },
      { label: 'Cancel anytime', included: true },
    ],
    cta: { label: 'Get monthly access', href: '/subscribe' },
  },
  {
    id: 'annual',
    name: 'Annual',
    price: '£69.99',
    priceNote: '/yr',
    period: 'One payment for the year',
    badge: { label: '2 months free', tone: 'amber' },
    tone: 'amber',
    features: [
      { label: 'Everything in monthly', included: true },
      { label: 'Two months free', included: true },
      { label: 'Priority customer support', included: true },
      { label: 'Pay once, done for the year', included: true },
    ],
    cta: { label: 'Get annual access', href: '/subscribe?plan=annual' },
    savingsNote: 'Save £13.89 vs paying monthly',
  },
]

const FAQS = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel anytime from your account settings. You keep full access until the end of your current billing period. No questions, no hoops.',
  },
  {
    q: 'What happens to my vouchers if I cancel?',
    a: 'You can continue to redeem until your billing period ends. After that, your account switches to the free plan and redemption is paused. Your history and favourites are saved. Resubscribe anytime to restore full access.',
  },
  {
    q: 'Can I share my membership with someone else?',
    a: 'No. Subscriptions are personal and non-transferable. One account per person. Redemption codes are tied to your account and logged.',
  },
  {
    q: 'Is there a free trial?',
    a: "We occasionally offer free trial periods via promo codes. These are not listed publicly but may be available through promotions and partnerships. Browse everything for free on the free plan — no trial needed to see what's available near you.",
  },
  {
    q: "What's the difference between monthly and annual?",
    a: 'Same features. Annual costs £69.99 for the year — roughly £5.83 a month, about two months free compared to paying monthly. Annual subscribers also get priority customer support.',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function ease(): [number, number, number, number] {
  return [0.22, 1, 0.36, 1]
}

function CheckMark({ tone }: { tone: 'red' | 'amber' | 'neutral' }) {
  const bg =
    tone === 'red'
      ? 'var(--brand-gradient)'
      : tone === 'amber'
        ? '#D97706'
        : '#16A34A'
  return (
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-[1px] text-white"
      style={{ background: bg }}
      aria-hidden="true"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}

function CrossMark() {
  return (
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-[1px] bg-[#F3F4F6] border border-[#E5E7EB] text-[#9CA3AF]"
      aria-hidden="true"
    >
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </span>
  )
}

// ── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({ plan, delay }: { plan: Plan; delay: number }) {
  const isRed = plan.tone === 'red'
  const isAmber = plan.tone === 'amber'

  const borderStyle = isRed
    ? { border: '1.5px solid rgba(226,12,4,0.30)', boxShadow: '0 12px 48px rgba(226,12,4,0.13)' }
    : isAmber
      ? { border: '1.5px solid rgba(217,119,6,0.28)', boxShadow: '0 8px_32px rgba(217,119,6,0.10)' }
      : { border: '1.5px solid #EDE8E8' }

  const badgeBg =
    plan.badge?.tone === 'amber'
      ? '#D97706'
      : 'var(--brand-gradient)'

  const ctaBg = isRed
    ? 'var(--brand-gradient)'
    : isAmber
      ? '#D97706'
      : undefined

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay, ease: ease() }}
      whileHover={{ y: -4 }}
      className="relative bg-white rounded-2xl flex flex-col transition-shadow"
      style={{
        ...borderStyle,
        padding: isRed ? '36px 32px' : '32px',
      }}
    >
      {/* Badge */}
      {plan.badge && (
        <div
          role="note"
          aria-label={`${plan.name} plan: ${plan.badge.label}`}
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-white text-[11px] font-bold tracking-[0.08em] px-3.5 py-1.5 rounded-full whitespace-nowrap"
          style={{ background: badgeBg }}
        >
          {plan.badge.label}
        </div>
      )}

      {/* Plan name */}
      <p className={`text-[11px] font-bold tracking-[0.16em] uppercase mb-5 ${
        isRed ? 'text-[#E20C04]' : isAmber ? 'text-[#D97706]' : 'text-[#9CA3AF]'
      }`}>
        {plan.name}
      </p>

      {/* Price */}
      <div className="flex items-end gap-1.5 mb-1">
        <span
          className="font-display text-[#010C35] leading-none"
          style={{ fontSize: isRed ? '52px' : '44px', letterSpacing: '-1px' }}
        >
          {plan.price}
        </span>
        {plan.priceNote && (
          <span className="text-[14px] text-[#9CA3AF] mb-[6px]">{plan.priceNote}</span>
        )}
      </div>
      <p className="text-[13px] text-[#9CA3AF] mb-1">{plan.period}</p>
      {plan.savingsNote && (
        <p className="text-[12px] font-semibold text-[#D97706] mb-0">{plan.savingsNote}</p>
      )}

      {/* Divider */}
      <div
        className="my-6 h-px"
        style={{
          background: isRed
            ? 'linear-gradient(to right, rgba(226,12,4,0.20), transparent)'
            : isAmber
              ? 'linear-gradient(to right, rgba(217,119,6,0.20), transparent)'
              : '#F3F4F6',
        }}
        aria-hidden="true"
      />

      {/* Features */}
      <ul className="flex flex-col gap-3 mb-8 flex-1">
        {plan.features.map(f => (
          <li key={f.label} className="flex items-start gap-3">
            {f.included
              ? <CheckMark tone={plan.tone} />
              : <CrossMark />}
            <span
              className={`text-[14px] leading-[1.45] ${
                f.included ? 'text-[#1F2937]' : 'text-[#C4C9D0] line-through decoration-[#D1D5DB]'
              }`}
            >
              <span className="sr-only">{f.included ? 'Included: ' : 'Not included: '}</span>
              {f.label}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link
        href={plan.cta.href}
        className={`block text-center font-semibold text-[14px] py-3.5 rounded-xl no-underline transition-opacity hover:opacity-90 ${
          ctaBg ? 'text-white' : 'text-[#010C35] border border-[#D1CBC3] hover:border-[#010C35]/40 bg-white'
        }`}
        style={ctaBg ? { background: ctaBg } : undefined}
      >
        {plan.cta.label}
      </Link>
    </motion.div>
  )
}

// ── FAQ item ──────────────────────────────────────────────────────────────────

function FaqItem({ item, index }: { item: { q: string; a: string }; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.38, delay: index * 0.06, ease: ease() }}
      className="border-b border-[#EDE8E8] last:border-0"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-center justify-between gap-4 py-6 cursor-pointer bg-transparent border-none"
        aria-expanded={open}
      >
        <span className="text-[16px] md:text-[17px] font-semibold text-[#010C35] leading-snug">
          {item.q}
        </span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: open ? 'var(--brand-gradient)' : '#F3F4F6' }}
          aria-hidden="true"
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke={open ? 'white' : '#6B7280'}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="text-[15px] text-[#4B5563] leading-[1.72] max-w-[62ch] pb-6">
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PricingContent() {
  return (
    <>
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden py-24 md:py-32 px-6"
        style={{ background: '#010C35' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(860px circle at 80% -15%, rgba(226,12,4,0.28), transparent 52%), radial-gradient(500px circle at 8% 110%, rgba(200,50,0,0.14), transparent 55%)',
          }}
        />

        <div className="relative max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 mb-8 rounded-full border border-white/14 bg-white/7 backdrop-blur-sm px-4 py-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#E20C04] flex-shrink-0 animate-pulse" />
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/55">
              Pricing
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: ease() }}
            className="font-display text-white leading-[1.06] mb-6 max-w-[800px] mx-auto"
            style={{ fontSize: 'clamp(36px, 5vw, 62px)', letterSpacing: '-0.8px' }}
          >
            Start free. Pay only when{' '}
            <span className="gradient-text">you&apos;re ready to redeem.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
            className="text-[16px] md:text-[17px] text-white/52 leading-[1.65] max-w-[500px] mx-auto mb-12"
          >
            Browse every merchant and voucher at no cost. Subscribe when you find somewhere worth visiting.
          </motion.p>

          {/* Trust signals */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.32 }}
            className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3"
          >
            {[
              { icon: '✓', label: 'No card to browse' },
              { icon: '✓', label: 'Cancel anytime' },
              { icon: '✓', label: 'Saves in first visit' },
            ].map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[#E20C04] font-bold text-[13px]">{t.icon}</span>
                <span className="text-[13px] text-white/45 font-medium">{t.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Plan cards ── */}
      <section style={{ background: '#FAFAF8' }} className="py-20 md:py-28 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-7 max-w-[1040px] mx-auto items-start">
            {PLANS.map((plan, i) => (
              <PlanCard key={plan.id} plan={plan} delay={i * 0.1} />
            ))}
          </div>

          {/* Fine print */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="text-center text-[13px] text-[#9CA3AF] mt-8"
          >
            All prices include VAT. Subscriptions renew automatically. Cancel anytime.
          </motion.p>
        </div>
      </section>

      {/* ── Value interstitial ── */}
      <section
        className="relative overflow-hidden py-20 md:py-24 px-6"
        style={{ background: '#010C35' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(600px circle at 50% 50%, rgba(226,12,4,0.16), transparent 60%)',
          }}
        />
        <div className="relative max-w-[720px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.55, ease: ease() }}
          >
            <h2
              className="font-display text-white leading-[1.08] mb-5"
              style={{ fontSize: 'clamp(30px, 4vw, 52px)', letterSpacing: '-0.6px' }}
            >
              Less than one coffee{' '}
              <span className="gradient-text">a week.</span>
            </h2>
            <p className="text-[16px] text-white/48 leading-[1.72] max-w-[460px] mx-auto mb-10">
              Most members save more than their subscription cost in a single redemption. The maths tends to work out very quickly.
            </p>
          </motion.div>

          {/* Stat strip */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="flex justify-center gap-10 flex-wrap"
          >
            {[
              { value: '£6.99', label: 'per month' },
              { value: '£1.75', label: 'per week' },
              { value: '200+', label: 'merchants' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p
                  className="font-display text-white leading-none mb-1"
                  style={{ fontSize: '32px', letterSpacing: '-0.5px' }}
                >
                  {s.value}
                </p>
                <p className="text-[12px] text-white/38 font-medium uppercase tracking-[0.12em]">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-white py-20 md:py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: ease() }}
            className="font-display text-[#010C35] leading-[1.1] mb-10"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Common questions about pricing
          </motion.h2>

          <div>
            {FAQS.map((item, i) => (
              <FaqItem key={item.q} item={item} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section
        className="relative overflow-hidden py-20 md:py-28 px-6"
        style={{ background: '#010C35' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(700px circle at 18% 110%, rgba(226,12,4,0.28), transparent 52%), radial-gradient(400px circle at 88% -10%, rgba(200,50,0,0.10), transparent 50%)',
          }}
        />
        <div className="relative max-w-[640px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.55, ease: ease() }}
          >
            <h2
              className="font-display text-white leading-[1.08] mb-4"
              style={{ fontSize: 'clamp(30px, 4vw, 50px)', letterSpacing: '-0.5px' }}
            >
              Start exploring for free today.
            </h2>
            <p className="text-[15px] text-white/48 leading-[1.7] mb-10">
              No card needed to browse. Subscribe when you find somewhere you want to visit.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.16 }}
            className="flex gap-3 justify-center flex-wrap"
          >
            <Link
              href="/discover"
              className="inline-block text-white/75 font-semibold text-[15px] px-7 py-3.5 rounded-xl border border-white/16 bg-white/7 backdrop-blur-sm no-underline hover:bg-white/12 hover:text-white transition-all"
            >
              Browse free
            </Link>
            <Link
              href="/subscribe"
              className="inline-block text-white font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{
                background: 'var(--brand-gradient)',
                boxShadow: '0 4px 24px rgba(226,12,4,0.38)',
              }}
            >
              Get monthly access
            </Link>
          </motion.div>
        </div>
      </section>
    </>
  )
}
