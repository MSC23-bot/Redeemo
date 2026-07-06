'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import { isLeadCaptureLive } from '@/lib/prelaunch'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

// Owner decision D-F: merchant contact address (deploy-security runbook §6).
const MERCHANT_EMAIL = 'merchants@redeemo.co.uk'

const MAILTO = `mailto:${MERCHANT_EMAIL}?subject=${encodeURIComponent(
  'Listing my business on Redeemo',
)}&body=${encodeURIComponent(
  'Business name:\nTown or city:\nWhat you do (e.g. restaurant, salon, gym):\nBest way to reach you:\n',
)}`

const CATEGORIES = [
  'Food & drink',
  'Beauty & wellness',
  'Health & fitness',
  'Shopping',
  'Out & about',
  'Home & local services',
  'Other',
]

// Pending owner decision D1 (MerchantLead persistence contract): the form below is
// flag-gated dark until the backend slice is approved and built. Until then the
// section captures interest through the owner-decided merchant mailbox.
const INTEREST_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1/public/merchant-interest`

type FormState = 'idle' | 'submitting' | 'success' | 'error'

export function MerchantInterestSection() {
  const leadCaptureLive = isLeadCaptureLive()
  const [state, setState] = useState<FormState>('idle')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    setState('submitting')
    try {
      const res = await fetch(INTEREST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(String(res.status))
      setState('success')
      form.reset()
    } catch {
      setState('error')
    }
  }

  return (
    <section id="register-interest" className="bg-white py-20 md:py-28 px-6 scroll-mt-20">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center justify-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase text-[#9CA3AF] mb-3">
            <span className="inline-block w-5 h-[2px] rounded-full bg-[#E20C04]" aria-hidden="true" />
            Register your interest
          </span>
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-3"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Get your business ready for launch.
          </h2>
          <p className="text-[15px] text-[#4B5563] leading-[1.65] max-w-[520px] mx-auto">
            Tell us about your business and we will reply with next steps. Early
            merchants are live in the app from day one, before anyone else.
          </p>
        </motion.div>

        {leadCaptureLive ? (
          <motion.form
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: 0.08, ease: EASE }}
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[#E5E0D8] bg-[#FAFAF8] p-7 md:p-9"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mi-business" className="text-[13px] font-bold text-[#010C35]">Business name</label>
                <input
                  id="mi-business" name="businessName" required
                  className="rounded-xl border border-[#E5E0D8] bg-white px-4 py-3 text-[14px] text-[#010C35] outline-none focus:border-[#E20C04] focus:ring-2 focus:ring-[#E20C04]/15"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mi-contact" className="text-[13px] font-bold text-[#010C35]">Your name</label>
                <input
                  id="mi-contact" name="contactName" required
                  className="rounded-xl border border-[#E5E0D8] bg-white px-4 py-3 text-[14px] text-[#010C35] outline-none focus:border-[#E20C04] focus:ring-2 focus:ring-[#E20C04]/15"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mi-email" className="text-[13px] font-bold text-[#010C35]">Email</label>
                <input
                  id="mi-email" name="email" type="email" required
                  className="rounded-xl border border-[#E5E0D8] bg-white px-4 py-3 text-[14px] text-[#010C35] outline-none focus:border-[#E20C04] focus:ring-2 focus:ring-[#E20C04]/15"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mi-phone" className="text-[13px] font-bold text-[#010C35]">Phone <span className="font-normal text-[#9CA3AF]">(optional)</span></label>
                <input
                  id="mi-phone" name="phone" type="tel"
                  className="rounded-xl border border-[#E5E0D8] bg-white px-4 py-3 text-[14px] text-[#010C35] outline-none focus:border-[#E20C04] focus:ring-2 focus:ring-[#E20C04]/15"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mi-town" className="text-[13px] font-bold text-[#010C35]">Town or city</label>
                <input
                  id="mi-town" name="town" required
                  className="rounded-xl border border-[#E5E0D8] bg-white px-4 py-3 text-[14px] text-[#010C35] outline-none focus:border-[#E20C04] focus:ring-2 focus:ring-[#E20C04]/15"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mi-category" className="text-[13px] font-bold text-[#010C35]">What you do</label>
                <select
                  id="mi-category" name="category" required defaultValue=""
                  className="rounded-xl border border-[#E5E0D8] bg-white px-4 py-3 text-[14px] text-[#010C35] outline-none focus:border-[#E20C04] focus:ring-2 focus:ring-[#E20C04]/15"
                >
                  <option value="" disabled>Choose a category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="inline-flex items-center justify-center gap-2 text-white font-bold text-[15px] px-7 py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
                style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 24px rgba(226,12,4,0.30)' }}
              >
                {state === 'submitting' ? 'Sending...' : 'Register interest'}
              </button>
              <p className="text-[12px] text-[#9CA3AF] leading-snug">
                We only use this to contact you about listing on Redeemo.
              </p>
            </div>
            <p aria-live="polite" className="mt-4 text-[13.5px] font-semibold">
              {state === 'success' && (
                <span className="text-[#16A34A]">Thanks. We have your details and will be in touch with next steps.</span>
              )}
              {state === 'error' && (
                <span className="text-[#B91C1C]">Something went wrong. Try again in a moment, or email {MERCHANT_EMAIL}.</span>
              )}
            </p>
          </motion.form>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: 0.08, ease: EASE }}
            className="rounded-2xl border border-[#E5E0D8] bg-[#FAFAF8] p-8 md:p-10 text-center"
          >
            <p className="text-[15px] text-[#4B5563] leading-[1.7] max-w-[480px] mx-auto mb-7">
              Email us your business name, town, and what you do. A real person
              reads every message and replies with next steps.
            </p>
            <a
              href={MAILTO}
              className="inline-flex items-center gap-2.5 text-white font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 24px rgba(226,12,4,0.30)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Email {MERCHANT_EMAIL}
            </a>
            <p className="mt-5 text-[12.5px] text-[#9CA3AF]">
              Prefer a call? Include your number and we will phone you back.
            </p>
          </motion.div>
        )}
      </div>
    </section>
  )
}
