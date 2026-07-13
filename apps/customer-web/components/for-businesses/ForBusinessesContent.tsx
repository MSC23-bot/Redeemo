'use client'

import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { PortalShowcaseSection } from './PortalShowcaseSection'
import { MerchantInterestSection } from './MerchantInterestSection'
import { merchantPortalRegisterUrl } from '@/lib/prelaunch'

// The merchant page's own 3D scene: drifting die-cut voucher cards (owner
// 2026-07-13: business-relevant WebGL, not the ribbon). Client-only.
const VoucherCards3D = dynamic(() => import('./VoucherCards3D').then((m) => m.VoucherCards3D), { ssr: false })

// ── Data ──────────────────────────────────────────────────────────────────────

const VALUE_PROPS = [
  {
    title: 'Free to list. Always.',
    body: 'No listing fee. No monthly subscription. No commission per redemption. The only cost you incur is the value of the offer you design, and only when a customer walks through your door.',
  },
  {
    title: 'Reach customers already looking for you.',
    body: 'Local customers browse by location and category. When someone near you searches for a restaurant, gym, or salon, your business appears. Targeted visibility with no upfront ad spend.',
  },
  {
    title: 'Increase footfall.',
    body: 'Customers come in specifically because your voucher drew them. That visit often converts into a regular customer. The voucher gets them through the door. Your business keeps them.',
  },
  {
    title: 'You only spend when a customer turns up.',
    body: 'Unlike paid ads, the only cost is the offer you set, and only when a customer actually visits and spends. Your spend is tied to a real visit, not a click.',
  },
  {
    title: 'One voucher per member per month.',
    body: 'Members redeem once per subscription cycle per merchant. You attract customers and turn them into regulars. You are not subsidising every visit forever.',
  },
  {
    title: 'Full digital verification.',
    body: 'Every redemption generates a unique code. Staff scan or enter it. No card sharing. No fraud. Every redemption confirmed, logged, and attributable.',
  },
  {
    title: 'Real redemption data.',
    body: 'See every redemption by offer, date, and branch. Understand what is working. Export your data. No guesswork, no manual tallying.',
  },
  {
    title: 'Quality local customers, not bargain hunters.',
    body: 'These are local customers who plan to spend on a good experience, not chase the cheapest option. They are your kind of customer.',
  },
]

const COMPARISONS = [
  {
    claim: 'No double margin hit.',
    detail:
      'Other platforms charge merchants a performance commission on top of the discount they absorb. Redeemo takes nothing. Your only cost is the offer you designed.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    claim: 'Acquires customers. Doesn\'t subsidise them.',
    detail:
      'A member redeems once per cycle per merchant. The other visits in that month are at full price. Redeemo acquires new customers. It does not permanently discount your regulars.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    claim: 'Full audit trail. No disputes.',
    detail:
      'Every redemption generates a unique digital code tied to the member\'s account. Staff validate it in the merchant app. You see every redemption: when, which offer, which branch. No card sharing, no guesswork.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
  },
]

const STEPS = [
  { n: 1, title: 'Create your account', body: 'Register on the merchant portal. Takes 2 minutes. No payment details required.' },
  { n: 2, title: 'Set up your profile and branches', body: 'Add your business details, photos, and location. We verify and approve each listing.' },
  { n: 3, title: 'Create your two standard offers', body: 'Work with us to set the right standard member offers for your business type, then add any custom vouchers on top.' },
  { n: 4, title: 'Go live', body: 'Once approved by Redeemo, your business is visible to every nearby member. You are live.' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function ease(): [number, number, number, number] { return [0.22, 1, 0.36, 1] }

// ── Page ──────────────────────────────────────────────────────────────────────

export function ForBusinessesContent() {
  // Merchants register in the merchant portal, not this consumer site.
  const registerUrl = merchantPortalRegisterUrl()

  return (
    <>
      {/* ── 1. Hero ── */}
      <section
        className="relative overflow-hidden -mt-[80px] pt-[176px] pb-24 md:pt-[208px] md:pb-32 px-6"
        style={{ background: '#010C35' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(900px circle at 85% -10%, rgba(226,12,4,0.30), transparent 52%), radial-gradient(500px circle at 5% 115%, rgba(200,50,0,0.14), transparent 55%)',
          }}
        />

        {/* The vouchers a business designs, drifting in 3D */}
        <div className="absolute inset-0 opacity-60 lg:opacity-100">
          <VoucherCards3D />
        </div>

        <div className="relative max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 mb-8 rounded-full border border-white/14 bg-white/7 backdrop-blur-sm px-4 py-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#E20C04] flex-shrink-0 animate-pulse" />
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/55">
              For businesses
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: ease() }}
            className="font-display text-white leading-[1.06] mb-6 max-w-[820px]"
            style={{ fontSize: 'clamp(36px, 5vw, 62px)', letterSpacing: '-0.8px' }}
          >
            Bring in new customers.{' '}
            <span className="gradient-text block">Keep your margins.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
            className="text-[16px] md:text-[17px] text-white/52 leading-[1.7] max-w-[540px] mb-10"
          >
            List your business on Redeemo for free. No commission. No listing fees. Reach local customers who are already looking for exactly what you offer.
          </motion.p>

          {/* Trust pills */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.26 }}
            className="flex flex-wrap gap-2.5 mb-10"
          >
            {['Free to list', 'No commission. Ever.', '12-month contract', 'Digital verification'].map((t) => (
              <span
                key={t}
                className="text-[12px] font-semibold text-white/60 px-3.5 py-1.5 rounded-full border border-white/12 bg-white/5"
              >
                {t}
              </span>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.34 }}
          >
            <a
              href={registerUrl}
              className="inline-flex items-center gap-2 text-white font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{
                background: 'var(--brand-gradient)',
                boxShadow: '0 4px 24px rgba(226,12,4,0.38)',
              }}
            >
              List your business free
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
          </motion.div>

          {/* Stats strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.48 }}
            className="mt-16 pt-8 border-t border-white/[0.08] flex flex-wrap gap-10"
          >
            {[
              { value: '£0', label: 'to list your business' },
              { value: '0%', label: 'commission per redemption' },
              { value: '1×', label: 'redemption per member per cycle' },
            ].map((s, i) => (
              <div key={i}>
                <p
                  className="font-display text-white leading-none mb-1"
                  style={{ fontSize: '30px', letterSpacing: '-0.5px' }}
                >
                  {s.value}
                </p>
                <p className="text-[12px] text-white/38 font-medium uppercase tracking-[0.1em]">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── 2. Value props ── */}
      <section style={{ background: '#FAFAF8' }} className="py-20 md:py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: ease() }}
            className="mb-14"
          >
            <h2
              className="font-display text-[#010C35] leading-[1.1] mb-3"
              style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
            >
              Everything in your favour.
            </h2>
            <p className="text-[15px] text-[#4B5563] leading-[1.65] max-w-[500px]">
              Here is what listing on Redeemo actually means for your business.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {VALUE_PROPS.map((prop, i) => (
              <motion.article
                key={prop.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.45, delay: (i % 2) * 0.07, ease: ease() }}
                whileHover={{ y: -3 }}
                className="relative rounded-2xl border border-[#E5E0D8] bg-white p-7 md:p-8 overflow-hidden cursor-default transition-shadow hover:shadow-[0_8px_28px_rgba(1,12,53,0.07)]"
              >
                {/* Faded number */}
                <span
                  className="absolute top-4 right-5 font-display font-bold leading-none select-none pointer-events-none"
                  style={{
                    fontSize: '64px',
                    color: '#010C35',
                    opacity: 0.035,
                    letterSpacing: '-3px',
                  }}
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>

                <div className="flex items-baseline gap-3 mb-3">
                  <span
                    className="font-display text-[18px] leading-none font-semibold gradient-text flex-shrink-0"
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-display text-[17px] font-semibold text-[#010C35] leading-snug" style={{ letterSpacing: '-0.1px' }}>
                    {prop.title}
                  </h3>
                </div>
                <p className="text-[14.5px] text-[#4B5563] leading-[1.7]">
                  {prop.body}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Three commercial facts (dark) ── */}
      <section
        className="relative overflow-hidden py-20 md:py-28 px-6"
        style={{ background: '#010C35' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(700px circle at 15% 50%, rgba(226,12,4,0.13), transparent 55%), radial-gradient(500px circle at 90% 80%, rgba(226,12,4,0.09), transparent 55%)',
          }}
        />

        <div className="relative max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: ease() }}
            className="mb-14"
          >
            <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase text-white/38 mb-3">
              <span className="inline-block w-5 h-[2px] rounded-full bg-[#E20C04]" aria-hidden="true" />
              The Redeemo difference
            </span>
            <h2
              className="font-display text-white leading-[1.08] max-w-[680px]"
              style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.4px' }}
            >
              Not like what you&apos;ve tried before.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {COMPARISONS.map((c, i) => (
              <motion.div
                key={c.claim}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: ease() }}
                className="rounded-2xl p-7 flex flex-col gap-5"
                style={{
                  background: 'rgba(255,255,255,0.055)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-[#E20C04]"
                  style={{ background: 'rgba(226,12,4,0.12)' }}
                  aria-hidden="true"
                >
                  {c.icon}
                </div>
                <div>
                  <h3
                    className="font-display text-white text-[18px] font-semibold leading-snug mb-3"
                    style={{ letterSpacing: '-0.1px' }}
                  >
                    {c.claim}
                  </h3>
                  <p className="text-[14px] text-white/48 leading-[1.7]">{c.detail}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. Voucher structure ── */}
      <section className="bg-white py-20 md:py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: ease() }}
            className="mb-12"
          >
            <h2
              className="font-display text-[#010C35] leading-[1.1] mb-3 max-w-[720px]"
              style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
            >
              Two standard offers. Unlimited custom vouchers.
            </h2>
            <p className="text-[15px] text-[#4B5563] leading-[1.65] max-w-[600px]">
              Every merchant on Redeemo commits to two standard member offers as part of the platform quality standard. Beyond that, you are free to create as many custom vouchers as your business needs.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Standard */}
            <motion.article
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.48, ease: ease() }}
              className="rounded-2xl bg-white p-7 md:p-8 relative overflow-hidden"
              style={{ border: '1.5px solid rgba(226,12,4,0.20)', boxShadow: '0 6px_24px rgba(226,12,4,0.07)' }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
                style={{ background: 'var(--brand-gradient)' }}
                aria-hidden="true"
              />
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#E20C04] mb-2 mt-2">
                Standard offers <span className="text-[#9CA3AF] font-normal normal-case tracking-normal">×2 required</span>
              </p>
              <h3 className="font-display text-[#010C35] text-[20px] font-semibold mb-3" style={{ letterSpacing: '-0.1px' }}>
                Your quality commitment.
              </h3>
              <p className="text-[14.5px] text-[#4B5563] leading-[1.7]">
                Two mandatory vouchers are required before your listing goes live. These form the Redeemo quality commitment to members. We work with you to set offers that are commercially viable for your specific business type.
              </p>
            </motion.article>

            {/* Custom */}
            <motion.article
              initial={{ opacity: 0, x: 16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.48, delay: 0.1, ease: ease() }}
              className="rounded-2xl bg-white p-7 md:p-8 relative overflow-hidden"
              style={{ border: '1.5px solid rgba(22,163,74,0.22)', boxShadow: '0 6px 24px rgba(22,163,74,0.07)' }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl bg-[#16A34A]"
                aria-hidden="true"
              />
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#16A34A] mb-2 mt-2">
                Custom vouchers <span className="text-[#9CA3AF] font-normal normal-case tracking-normal">unlimited</span>
              </p>
              <h3 className="font-display text-[#010C35] text-[20px] font-semibold mb-3" style={{ letterSpacing: '-0.1px' }}>
                Your offers, your terms.
              </h3>
              <p className="text-[14.5px] text-[#4B5563] leading-[1.7]">
                On top of your standard offers, create as many custom vouchers as you want. Seasonal promotions, specific products or services. You design them, set the terms, time windows, and quantity limits.
              </p>
            </motion.article>
          </div>
        </div>
      </section>

      {/* ── 5. Merchant Portal showcase (real screens, example data) ── */}
      <PortalShowcaseSection />

      {/* ── 6. Getting started (dark, timeline) ── */}
      <section
        className="relative overflow-hidden py-20 md:py-28 px-6"
        style={{ background: '#010C35' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(600px circle at 50% 0%, rgba(226,12,4,0.14), transparent 60%)',
          }}
        />

        <div className="relative max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: ease() }}
            className="mb-12"
          >
            <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase text-white/35 mb-3">
              <span className="inline-block w-5 h-[2px] rounded-full bg-[#E20C04]" aria-hidden="true" />
              Getting started
            </span>
            <h2
              className="font-display text-white leading-[1.08]"
              style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.4px' }}
            >
              Up and running in minutes.
            </h2>
          </motion.div>

          <ol>
            {STEPS.map((step, i) => (
              <motion.li
                key={step.n}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.48, delay: i * 0.1, ease: ease() }}
                className="flex gap-6 md:gap-8"
              >
                {/* Circle + connector */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-[15px] text-white flex-shrink-0 shadow-lg"
                    style={{ background: 'var(--brand-gradient)' }}
                    aria-label={`Step ${step.n}`}
                  >
                    {step.n}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className="flex-1 w-px mt-3 mb-1 min-h-[48px]"
                      style={{ background: 'linear-gradient(to bottom, rgba(226,12,4,0.35), transparent)' }}
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* Content */}
                <div className="pb-10 flex-1 min-w-0">
                  <div
                    className="font-display font-bold leading-none select-none pointer-events-none mb-2"
                    style={{ fontSize: '72px', opacity: 0.04, color: '#fff', letterSpacing: '-4px', lineHeight: 0.8, marginTop: '-6px' }}
                    aria-hidden="true"
                  >
                    0{step.n}
                  </div>
                  <h3
                    className="font-display text-white text-[20px] font-semibold leading-snug mb-2 -mt-4"
                    style={{ letterSpacing: '-0.2px' }}
                  >
                    {step.title}
                  </h3>
                  <p className="text-[14.5px] text-white/50 leading-[1.7]">{step.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 7. Register interest (working journey; form flag-gated pending D1) ── */}
      <MerchantInterestSection />

      {/* ── 8. Final CTA ── */}
      <section
        className="px-6 py-12 md:py-20"
        style={{ background: '#FFF9F5' }}
      >
        {/* A contained navy panel on cream: the full-bleed navy collided with the
            footer's navy right below it (owner 2026-07-13) */}
        <div
          className="relative overflow-hidden max-w-[1080px] mx-auto rounded-[28px] px-6 py-12 md:py-16 text-center"
          style={{ background: '#010C35', boxShadow: '0 28px 64px rgba(1,12,53,0.22)' }}
        >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(700px circle at 20% 110%, rgba(226,12,4,0.30), transparent 52%), radial-gradient(400px circle at 85% -10%, rgba(200,50,0,0.10), transparent 50%)',
          }}
        />
        {/* Soft divider from getting-started section */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} aria-hidden="true" />

        <div className="relative max-w-[640px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.55, ease: ease() }}
          >
            <h2
              className="font-display text-white leading-[1.08] mb-5"
              style={{ fontSize: 'clamp(30px, 4vw, 50px)', letterSpacing: '-0.5px' }}
            >
              Ready to list{' '}
              <span className="gradient-text">your business?</span>
            </h2>
            <p className="text-[15px] text-white/48 leading-[1.7] mb-10 max-w-[440px] mx-auto">
              Free to join. No commission. Your only cost is the offer you designed, and only when a customer walks in.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.16 }}
            className="flex gap-3 justify-center flex-wrap"
          >
            <a
              href={registerUrl}
              className="inline-flex items-center gap-2 text-white font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{
                background: 'var(--brand-gradient)',
                boxShadow: '0 4px 24px rgba(226,12,4,0.38)',
              }}
            >
              List your business free
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mt-5 text-[13px] text-white/25"
          >
            No listing fees. No commission. 12-month contract required.
          </motion.p>
        </div>
        </div>
      </section>
    </>
  )
}
