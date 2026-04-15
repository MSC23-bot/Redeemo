'use client'

import Link from 'next/link'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AppStoreBadge, GooglePlayBadge } from '@/components/landing/HeroSection'

// ── Data ──────────────────────────────────────────────────────────────────────

type Step = {
  n: number
  title: string
  body: string
  note?: string
  badges?: boolean
}

const PHASE_1_STEPS: Step[] = [
  {
    n: 1,
    title: 'Download the Redeemo app',
    body: 'Available free on the App Store and Google Play. Create your account with your email. You can browse all merchants and vouchers immediately on the free plan — no card needed.',
    badges: true,
  },
  {
    n: 2,
    title: 'Subscribe to unlock redemption',
    body: 'Browsing is free. To redeem a voucher at any merchant, you need an active subscription. Monthly is £6.99. Annual is £69.99, roughly two months free. You can also subscribe here on the website before you go.',
    note: 'You can browse every merchant and every voucher on the website or app without subscribing. No card needed to browse.',
  },
]

const PHASE_2_STEPS: Step[] = [
  {
    n: 3,
    title: 'Find a merchant near you',
    body: 'Use the discover page or map to find merchants. Browse their vouchers before you go. Each voucher shows the offer, the terms, and any time or day restrictions. Save your favourites.',
  },
  {
    n: 4,
    title: 'Tap Redeem on your voucher',
    body: "When you're at the venue and ready, open the Redeemo app, find the voucher, and tap Redeem. The app will ask you to enter the branch PIN — a short code held by the merchant that confirms you're physically present.",
    note: 'Ask a member of staff for the branch PIN when you are ready to redeem. It changes periodically and is not shared outside the venue.',
  },
  {
    n: 5,
    title: 'Show your unique code to staff',
    body: 'Once you enter the PIN, the app generates a unique redemption code tied to your account and that visit. Show the QR code or the alphanumeric code to the member of staff.',
  },
  {
    n: 6,
    title: 'Staff validate. You pay less.',
    body: "The member of staff scans the QR code or enters the code in the Redeemo merchant app. The system confirms the code is valid, your voucher is applied, and you see a confirmation in the app. Done.",
  },
]

const FREE_FEATURES = [
  {
    title: 'Browse every merchant',
    sub: 'Thousands of local businesses, fully visible with no account required.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    title: 'View all vouchers and terms',
    sub: 'See every offer at every merchant before you subscribe.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="11" y2="17" />
      </svg>
    ),
  },
  {
    title: 'Read member reviews',
    sub: 'See what other members say about each venue.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: 'Save merchants to favourites',
    sub: 'Build your shortlist. No commitment required.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
  {
    title: 'No card required to browse',
    sub: 'Add payment details only when you choose to subscribe.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
]

const FAQS = [
  {
    q: 'Can I share my membership with someone else?',
    a: 'No. Redeemo subscriptions are personal and non-transferable. Each redemption code is tied to your account and logged. Sharing your account is a breach of our terms and will result in suspension.',
  },
  {
    q: 'What if I forget to redeem at a merchant this month?',
    a: 'Unused vouchers do not carry over to the next cycle. Your subscription cycle resets at each renewal date. There is no penalty for not redeeming.',
  },
  {
    q: 'Is there a minimum spend on the voucher?',
    a: 'It depends on the voucher. Each merchant sets their own terms. Check the voucher details before you visit. Terms are shown clearly on the voucher page.',
  },
  {
    q: 'Do vouchers expire?',
    a: 'Vouchers are available as long as the merchant keeps them active. They do not expire on a fixed date unless the merchant specifies one. Your redemption entitlement resets each subscription cycle.',
  },
  {
    q: 'What if a member of staff refuses my valid voucher?',
    a: 'Contact Redeemo support in the app, not the merchant directly. We will investigate and resolve it. Merchants who join Redeemo commit to honouring valid redemptions as part of their agreement with us.',
  },
]

// ── Sub-components ─────────────────────────────────────────────────────────────

function ease(): [number, number, number, number] {
  return [0.22, 1, 0.36, 1]
}

function CheckCircle({ color }: { color: string }) {
  return (
    <span
      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-white"
      style={{ background: color }}
      aria-hidden="true"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}

// Timeline step — used in both light and dark phases
function TimelineStep({
  step,
  index,
  circleColor,
  connectorColor,
  isLast,
  dark,
}: {
  step: Step
  index: number
  circleColor: string
  connectorColor: string
  isLast: boolean
  dark: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: ease() }}
      className="flex gap-6 md:gap-8"
    >
      {/* Left: circle + connector */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-[15px] text-white flex-shrink-0 shadow-lg"
          style={{ background: circleColor }}
          aria-hidden="true"
        >
          {step.n}
        </div>
        {!isLast && (
          <div
            className="flex-1 w-px mt-3 mb-1 min-h-[48px]"
            style={{
              background: `linear-gradient(to bottom, ${connectorColor}, transparent)`,
            }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Right: content */}
      <div className={`pb-12 flex-1 min-w-0 ${isLast ? '' : ''}`}>
        {/* Large faded step number — atmospheric */}
        <div
          className="font-display font-bold leading-none select-none pointer-events-none mb-2"
          style={{
            fontSize: 'clamp(60px, 8vw, 96px)',
            opacity: dark ? 0.04 : 0.05,
            color: dark ? '#fff' : '#010C35',
            letterSpacing: '-4px',
            lineHeight: 0.8,
            marginTop: '-8px',
          }}
          aria-hidden="true"
        >
          0{step.n}
        </div>

        <h3
          className={`font-display text-[20px] md:text-[22px] font-semibold leading-snug mb-3 -mt-6`}
          style={{
            color: dark ? '#FFFFFF' : '#010C35',
            letterSpacing: '-0.2px',
          }}
        >
          {step.title}
        </h3>
        <p
          className="text-[15px] leading-[1.7] max-w-[60ch]"
          style={{ color: dark ? 'rgba(255,255,255,0.58)' : '#4B5563' }}
        >
          {step.body}
        </p>

        {step.badges && (
          <div className="flex flex-wrap gap-3 mt-5">
            <AppStoreBadge />
            <GooglePlayBadge />
          </div>
        )}

        {step.note && (
          <div
            className="mt-5 px-4 py-3.5 rounded-xl flex gap-3 items-start"
            style={{
              background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(1,12,53,0.04)',
              border: dark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(1,12,53,0.08)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={dark ? 'rgba(255,255,255,0.35)' : '#9CA3AF'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0 mt-[1px]"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p
              className="text-[13px] leading-[1.6]"
              style={{ color: dark ? 'rgba(255,255,255,0.38)' : '#6B7280' }}
            >
              {step.note}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// FAQ accordion item
function FaqItem({ item, index }: { item: { q: string; a: string }; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: ease() }}
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
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={open ? 'white' : '#6B7280'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
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

export function HowItWorksContent() {
  return (
    <>
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden py-24 md:py-32 px-6"
        style={{ background: '#010C35' }}
      >
        {/* Static atmospheric glow */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(900px circle at 75% -20%, rgba(226,12,4,0.30), transparent 52%), radial-gradient(500px circle at 10% 110%, rgba(200,50,0,0.14), transparent 55%)',
          }}
        />

        <div className="relative max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 mb-8 rounded-full border border-white/14 bg-white/7 backdrop-blur-sm px-4 py-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#E20C04] flex-shrink-0 animate-pulse" />
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/55">
              How it works
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: ease() }}
            className="font-display text-white leading-[1.06] mb-6 max-w-[760px]"
            style={{ fontSize: 'clamp(36px, 5vw, 62px)', letterSpacing: '-0.8px' }}
          >
            Simple to join.{' '}
            <span className="gradient-text">Even simpler to redeem.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
            className="text-[16px] md:text-[17px] text-white/52 leading-[1.65] max-w-[520px] mb-10"
          >
            Browse for free. Subscribe when you are ready. Show your phone in the venue. That&apos;s it.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.28 }}
            className="flex flex-wrap items-center gap-3 mb-16"
          >
            <Link
              href="/register"
              className="inline-block text-white font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{
                background: 'var(--brand-gradient)',
                boxShadow: '0 4px 24px rgba(226,12,4,0.38)',
              }}
            >
              Join free
            </Link>
            <Link
              href="#get-the-app"
              className="inline-block text-white/75 font-semibold text-[15px] px-7 py-3.5 rounded-xl border border-white/16 bg-white/7 backdrop-blur-sm no-underline hover:bg-white/12 hover:text-white transition-all"
            >
              Get the app
            </Link>
          </motion.div>

          {/* Quick 3-step visual summary */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.44 }}
            className="flex flex-wrap items-center gap-3 md:gap-0"
          >
            {[
              { n: '①', label: 'Download & browse' },
              { n: '②', label: 'Subscribe to unlock' },
              { n: '③', label: 'Show code at venue' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="text-[15px] font-bold"
                    style={{ color: '#E20C04' }}
                    aria-hidden="true"
                  >
                    {item.n}
                  </span>
                  <span className="text-[13px] text-white/55 font-medium">{item.label}</span>
                </div>
                {i < 2 && (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="hidden md:block mx-3 flex-shrink-0"
                    aria-hidden="true"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                )}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Phase 1: Getting started ── */}
      <section style={{ background: '#FAFAF8' }} className="py-20 md:py-28 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="mb-12"
          >
            <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase text-[#E20C04] mb-2">
              <span
                className="inline-block w-5 h-[2px] rounded-full"
                style={{ background: 'var(--brand-gradient)' }}
                aria-hidden="true"
              />
              Phase 1
            </span>
            <h2
              className="font-display text-[#010C35] leading-[1.1] mt-1"
              style={{ fontSize: 'clamp(22px, 2.8vw, 32px)', letterSpacing: '-0.3px' }}
            >
              Getting started — takes about 2 minutes.
            </h2>
          </motion.div>

          {PHASE_1_STEPS.map((step, i) => (
            <TimelineStep
              key={step.n}
              step={step}
              index={i}
              circleColor="var(--brand-gradient)"
              connectorColor="rgba(226,12,4,0.35)"
              isLast={i === PHASE_1_STEPS.length - 1}
              dark={false}
            />
          ))}
        </div>
      </section>

      {/* ── Phase 2: At the venue (dark) ── */}
      <section
        className="relative overflow-hidden py-20 md:py-28 px-6"
        style={{ background: '#010C35' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(700px circle at 100% 50%, rgba(22,163,74,0.10), transparent 55%), radial-gradient(500px circle at 0% 80%, rgba(226,12,4,0.10), transparent 55%)',
          }}
        />
        <div className="relative max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="mb-12"
          >
            <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase text-[#4ADE80] mb-2">
              <span
                className="inline-block w-5 h-[2px] rounded-full bg-[#16A34A]"
                aria-hidden="true"
              />
              Phase 2
            </span>
            <h2
              className="font-display text-white leading-[1.1] mt-1"
              style={{ fontSize: 'clamp(22px, 2.8vw, 32px)', letterSpacing: '-0.3px' }}
            >
              Redeeming a voucher — in the app, at the venue.
            </h2>
          </motion.div>

          {PHASE_2_STEPS.map((step, i) => (
            <TimelineStep
              key={step.n}
              step={step}
              index={i}
              circleColor="#16A34A"
              connectorColor="rgba(22,163,74,0.35)"
              isLast={i === PHASE_2_STEPS.length - 1}
              dark={true}
            />
          ))}
        </div>
      </section>

      {/* ── Free plan ── */}
      <section style={{ background: '#FAFAF8' }} className="py-20 md:py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: ease() }}
            className="mb-10"
          >
            <h2
              className="font-display text-[#010C35] leading-[1.1] mb-3"
              style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
            >
              What the free plan includes
            </h2>
            <p className="text-[15px] text-[#4B5563] leading-[1.65] max-w-[520px]">
              Everything you need to decide if Redeemo is for you. Redeeming is the one thing that needs a subscription.
            </p>
          </motion.div>

          <div className="flex flex-col gap-4 mb-8">
            {FREE_FEATURES.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.38, delay: i * 0.07, ease: ease() }}
                className="flex items-start gap-4 rounded-xl bg-white border border-[#EDE8E8] px-5 py-4 hover:border-[#010C35]/20 hover:shadow-[0_4px_16px_rgba(1,12,53,0.06)] transition-all"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[#E20C04]"
                  style={{ background: 'rgba(226,12,4,0.08)' }}
                  aria-hidden="true"
                >
                  {item.icon}
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[#010C35] leading-snug">{item.title}</p>
                  <p className="text-[13.5px] text-[#4B5563] leading-[1.55] mt-0.5">{item.sub}</p>
                </div>
                <CheckCircle color="#16A34A" />
              </motion.div>
            ))}

            {/* Excluded — visually distinct */}
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.38, delay: FREE_FEATURES.length * 0.07, ease: ease() }}
              className="flex items-start gap-4 rounded-xl bg-white border border-dashed border-[#D1D5DB] px-5 py-4 opacity-60"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[#9CA3AF]"
                style={{ background: '#F3F4F6' }}
                aria-hidden="true"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-[#6B7280] leading-snug">Redeeming vouchers</p>
                <p className="text-[13.5px] text-[#9CA3AF] leading-[1.55] mt-0.5">Requires an active subscription. From £6.99 a month.</p>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="flex flex-wrap gap-3"
          >
            <Link
              href="/subscribe"
              className="inline-block text-white font-semibold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'var(--brand-gradient)' }}
            >
              Get started, from £6.99/mo
            </Link>
            <Link
              href="/pricing"
              className="inline-block text-[#010C35] font-semibold text-[15px] px-7 py-3.5 rounded-xl border border-[#D1CBC3] bg-white no-underline hover:border-[#010C35]/40 transition-colors"
            >
              View all plans
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ accordion ── */}
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
            Common questions
          </motion.h2>

          <div>
            {FAQS.map((item, i) => (
              <FaqItem key={item.q} item={item} index={i} />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mt-10"
          >
            <Link
              href="/faq"
              className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#E20C04] no-underline hover:underline"
            >
              View full FAQ
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── App CTA footer ── */}
      <section
        id="get-the-app"
        className="relative overflow-hidden py-20 md:py-28 px-6"
        style={{ background: '#010C35' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(700px circle at 20% 110%, rgba(226,12,4,0.28), transparent 52%), radial-gradient(400px circle at 85% -10%, rgba(200,50,0,0.10), transparent 50%)',
          }}
        />
        <div className="relative max-w-[640px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.55, ease: ease() }}
          >
            <span className="inline-block text-[11px] font-bold tracking-[0.18em] uppercase text-white/35 mb-5">
              Redeemo app
            </span>
            <h2
              className="font-display text-white leading-[1.08] mb-5"
              style={{ fontSize: 'clamp(28px, 4vw, 48px)', letterSpacing: '-0.5px' }}
            >
              Redeeming happens in the app.
            </h2>
            <p className="text-[15px] text-white/48 leading-[1.7] mb-9">
              Browse here. Subscribe here. Redeem in the Redeemo app at the venue.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="flex gap-3 justify-center flex-wrap mb-6"
          >
            <AppStoreBadge />
            <GooglePlayBadge />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="text-[13px] text-white/28"
          >
            Or{' '}
            <Link
              href="/subscribe"
              className="text-white/55 font-medium no-underline hover:text-white transition-colors"
            >
              subscribe on the website
            </Link>{' '}
            and download the app before you visit.
          </motion.p>
        </div>
      </section>
    </>
  )
}
