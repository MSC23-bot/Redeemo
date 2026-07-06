'use client'

import { useId, useState } from 'react'
import { motion } from 'framer-motion'
import { isLeadCaptureLive } from '@/lib/prelaunch'
import { apiFetch } from '@/lib/api'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type Status = 'idle' | 'loading' | 'success' | 'error'

export function WaitlistSection() {
  const emailId = useId()
  const postcodeId = useId()
  const [email, setEmail] = useState('')
  const [postcode, setPostcode] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  // Flag-gated dark: the site only renders this section once lead capture is
  // switched on. The persistence contract for this endpoint (ConsumerWaitlist
  // model + retention/consent handling) is owner decision D1 in
  // docs/superpowers/plans/2026-07-06-prelaunch-website-conversion-rebaseline.md
  // and has not been approved yet, so /api/v1/public/waitlist does not exist
  // in the backend at the time this section was written.
  if (!isLeadCaptureLive()) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    try {
      await apiFetch('/api/v1/public/waitlist', {
        method: 'POST',
        body: JSON.stringify({ email, postcode: postcode || undefined }),
      })
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section id="waitlist" style={{ background: '#FAFAF8' }} className="py-20 md:py-24 px-6">
      <div className="max-w-[560px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="rounded-2xl border border-[#EDE8E8] bg-white p-8 md:p-10 text-center"
        >
          <span className="inline-block text-[11px] font-bold tracking-[0.18em] uppercase text-[#E20C04] mb-4">
            Get first access
          </span>
          <h2
            className="font-display text-[#010C35] leading-[1.15] mb-3"
            style={{ fontSize: 'clamp(24px, 3vw, 34px)', letterSpacing: '-0.3px' }}
          >
            Be first when Redeemo goes live near you.
          </h2>
          <p className="text-[15px] text-[#4B5563] leading-[1.7] mb-8">
            Founding members get first access when we launch in their area.
          </p>

          {status === 'success' ? (
            <p role="status" aria-live="polite" className="text-[15px] font-semibold text-[#16A34A]">
              You&apos;re on the list. We&apos;ll email you before launch.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="text-left" noValidate>
              <div className="mb-4">
                <label htmlFor={emailId} className="block text-[13px] font-semibold text-[#010C35] mb-1.5">
                  Email
                </label>
                <input
                  id={emailId}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-[#D1CBC3] bg-white px-4 py-3 text-[14px] text-[#010C35] outline-none transition-colors focus:border-[#E20C04] focus-visible:ring-2 focus-visible:ring-[#E20C04]/30"
                />
              </div>
              <div className="mb-5">
                <label htmlFor={postcodeId} className="block text-[13px] font-semibold text-[#010C35] mb-1.5">
                  Postcode <span className="font-normal text-[#9CA3AF]">(optional)</span>
                </label>
                <input
                  id={postcodeId}
                  type="text"
                  autoComplete="postal-code"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder="Postcode (optional)"
                  className="w-full rounded-xl border border-[#D1CBC3] bg-white px-4 py-3 text-[14px] text-[#010C35] outline-none transition-colors focus:border-[#E20C04] focus-visible:ring-2 focus-visible:ring-[#E20C04]/30"
                />
              </div>

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full text-center font-semibold text-[14px] text-white py-3 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: 'var(--brand-gradient)' }}
              >
                {status === 'loading' ? 'Joining…' : 'Join the waitlist'}
              </button>

              <p aria-live="polite" className="mt-3 min-h-[18px] text-[13px] text-[#DC2626]">
                {status === 'error' && 'Something went wrong. Try again in a moment.'}
              </p>

              <p className="mt-3 text-[12px] text-[#9CA3AF] leading-[1.6]">
                We&apos;ll only email you about Redeemo&apos;s launch. No marketing lists, unsubscribe anytime.
              </p>
            </form>
          )}
        </motion.div>
      </div>
    </section>
  )
}
