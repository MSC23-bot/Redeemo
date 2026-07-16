'use client'

import { motion } from 'framer-motion'
import { ForBusinessesCinema } from './JourneyCinematic'
import { FavourSection } from './FavourSection'
import { PortalSection } from './PortalSection'
import { MerchantInterestSection } from './MerchantInterestSection'
import { merchantPortalRegisterUrl } from '@/lib/prelaunch'

// ── Data ──────────────────────────────────────────────────────────────────────



const STEPS = [
  { n: 1, title: 'Create your account', body: 'Register on the merchant portal. Takes 2 minutes. No payment details required.' },
  { n: 2, title: 'Set up your profile and branches', body: 'Add your business details, photos, and location. We verify and approve each listing.' },
  { n: 3, title: 'Create your two standard offers', body: 'Work with us to set the right standard member offers for your business type, then add any custom vouchers on top.' },
  { n: 4, title: 'Go live', body: 'Once approved by Redeemo, your business is visible to every nearby member. You are live.' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function ease(): [number, number, number, number] { return [0.22, 1, 0.36, 1] }

// ── Page ──────────────────────────────────────────────────────────────────────

export function ForBusinessesContent() {
  // Merchants register in the merchant portal, not this consumer site.
  const registerUrl = merchantPortalRegisterUrl()

  return (
    <>
      {/* ── 1. Hero: cinematic night-street stage with the live app phone ── */}
      <ForBusinessesCinema registerUrl={registerUrl} />


      {/* ── 2-3. Everything in your favour (Section 3) ── */}
      <FavourSection />

      {/* ── 4. The Merchant Portal (Section 4) ── */}
      <PortalSection />

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
              Two standard offers. Unlimited custom&nbsp;vouchers.
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
              <span className="gradient-text">your&nbsp;business?</span>
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
            No listing fees. No commission. 12-month contract&nbsp;required.
          </motion.p>
        </div>
        </div>
      </section>
    </>
  )
}
