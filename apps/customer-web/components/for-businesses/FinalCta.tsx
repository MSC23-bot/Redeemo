'use client'

import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

// The wall of zeros: every number a business owner braces for, rolled to
// nothing. Reels end on the true figure; the roll is theatre, the 0 is fact.
const ZEROS = [
  {
    reel: ['3', '8', '5', '0'],
    prefix: '£',
    suffix: '',
    label: 'Listing fee',
    detail: 'Being listed and discoverable costs nothing.',
  },
  {
    reel: ['6', '1', '9', '0'],
    prefix: '£',
    suffix: '',
    label: 'Monthly platform fee',
    detail: 'No subscription and no charge for the portal.',
  },
  {
    reel: ['8', '2', '7', '0'],
    prefix: '',
    suffix: '%',
    label: 'Commission',
    detail: 'We never take a cut of your sales.',
  },
  {
    reel: ['4', '9', '2', '0'],
    prefix: '£',
    suffix: '',
    label: 'Redemption fee',
    detail: 'Validating a customer’s voucher costs nothing.',
  },
]

const ASKS = [
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
    title: 'Two flagship vouchers',
    body: 'Set with us before you go live, so customers always find real value.',
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15l2 2 4-4" />
      </svg>
    ),
    title: 'A 12-month partnership agreement',
    body: 'One clear term, signed digitally during onboarding.',
  },
]

// Odometer reel: rolls through decoy digits and settles on the real figure.
// Hidden from AT; the accessible value lives on the parent stat.
function ZeroReel({ reel, delay }: { reel: string[]; delay: number }) {
  const reduceMotion = useReducedMotion()
  // Observe the clipped 1em window, not the 4em strip inside it: the strip can
  // never be half-visible through the clip, so whileInView would never fire.
  const windowRef = useRef<HTMLSpanElement>(null)
  const inView = useInView(windowRef, { once: true, amount: 0.6 })
  return (
    <span ref={windowRef} className="inline-block overflow-hidden align-bottom" style={{ height: '1em' }} aria-hidden="true">
      <motion.span
        className="flex flex-col"
        initial={{ y: '0em', opacity: 0 }}
        animate={inView ? { y: `-${reel.length - 1}em`, opacity: 1 } : undefined}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { y: { duration: 1.15, delay, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.25, delay } }
        }
      >
        {reel.map((d, i) => (
          <span key={i} className="block" style={{ height: '1em', lineHeight: 1 }}>
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  )
}

export function FinalCta({ registerUrl }: { registerUrl: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <section id="register-interest" className="scroll-mt-20 px-6 py-14 md:py-24" style={{ background: '#FFF9F5' }}>
      {/* Contained navy panel on cream: full-bleed navy collided with the navy
          footer directly below (owner 2026-07-13) */}
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.7, ease: EASE }}
        className="relative mx-auto max-w-[1080px] overflow-hidden rounded-[28px] px-6 py-12 md:px-14 md:py-16"
        style={{ background: '#010C35', boxShadow: '0 28px 64px rgba(1,12,53,0.22)' }}
      >
        {/* Interior light */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(700px circle at 18% 112%, rgba(226,12,4,0.28), transparent 52%), radial-gradient(460px circle at 88% -12%, rgba(232,74,0,0.14), transparent 55%)',
          }}
        />
        {/* One shine sweep as the panel arrives (transform-only; skipped
            entirely under prefers-reduced-motion) */}
        {!reduceMotion ? (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-[38%]"
            style={{ background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.055), transparent)', left: '-45%', skewX: -14 }}
            initial={{ x: '0%' }}
            whileInView={{ x: '440%' }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 1.4, delay: 0.5, ease: 'easeInOut' }}
          />
        ) : null}

        <div className="relative mx-auto max-w-[760px] text-center">
          <span className="mb-3 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
            <span className="inline-block h-[2px] w-5 rounded-full bg-[#E20C04]" aria-hidden="true" />
            Get started
            <span className="inline-block h-[2px] w-5 rounded-full bg-[#E20C04]" aria-hidden="true" />
          </span>
          <h2 className="font-display mb-5 leading-[1.08] text-white" style={{ fontSize: 'clamp(30px, 4vw, 50px)', letterSpacing: '-0.5px' }}>
            Ready to list <span className="gradient-text">your&nbsp;business?</span>
          </h2>
          <p className="mx-auto mb-10 max-w-[640px] text-[15px] leading-[1.7] text-white/55">
            Create your free Merchant Portal account and start building your listing today. Before you go live you&rsquo;ll set two flagship vouchers, your commitment to customers; from there, add custom vouchers whenever you need them, with your own value, terms and timing.
          </p>
        </div>

        {/* The wall of zeros */}
        <div className="relative mx-auto grid max-w-[880px] auto-rows-fr grid-cols-2 gap-3 md:grid-cols-4">
          {ZEROS.map((z, i) => (
            <motion.div
              key={z.label}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.5, delay: i * 0.08, ease: EASE }}
              className="group rounded-2xl border border-white/10 bg-white/[0.05] p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(226,12,4,0.45)] hover:bg-white/[0.07]"
              style={{ boxShadow: '0 10px 30px rgba(0,4,20,0.3)' }}
            >
              <p className="font-display mb-1.5 text-white" style={{ fontSize: 'clamp(30px, 3.2vw, 42px)', lineHeight: 1, letterSpacing: '-1px' }}>
                <span className="sr-only">{`${z.prefix}0${z.suffix}`}</span>
                <span aria-hidden="true">
                  {z.prefix}
                  <ZeroReel reel={z.reel} delay={0.25 + i * 0.12} />
                  {z.suffix}
                </span>
              </p>
              <p className="text-[12.5px] font-semibold text-white/80">{z.label}</p>
              <p className="mt-1 text-[11.5px] leading-snug text-white/60 transition-colors duration-300 group-hover:text-white/80">{z.detail}</p>
            </motion.div>
          ))}
        </div>
        <p className="relative mx-auto mt-6 max-w-[520px] text-center text-[13.5px] leading-relaxed text-white/55">
          Your only cost is the offer you designed, and only when a customer walks&nbsp;in.
        </p>

        {/* What we ask in return */}
        <div className="relative mx-auto mt-10 max-w-[760px]">
          <div className="mb-4 flex items-center gap-4" aria-hidden="true">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/50">What we ask in return</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {ASKS.map((a, i) => (
              <motion.div
                key={a.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.5, delay: 0.1 + i * 0.1, ease: EASE }}
                className="flex items-start gap-3.5 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left"
                style={{
                  // Die-cut ticket notches: real transparency, echoes the voucher
                  // tickets in the section above
                  maskImage:
                    'radial-gradient(circle 8px at 0 50%, transparent 7px, black 8px), radial-gradient(circle 8px at 100% 50%, transparent 7px, black 8px)',
                  WebkitMaskImage:
                    'radial-gradient(circle 8px at 0 50%, transparent 7px, black 8px), radial-gradient(circle 8px at 100% 50%, transparent 7px, black 8px)',
                  maskComposite: 'intersect',
                  WebkitMaskComposite: 'source-in',
                }}
              >
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#FF6B3D]" style={{ background: 'rgba(226,12,4,0.14)' }}>
                  {a.icon}
                </span>
                <span>
                  <span className="block text-[13.5px] font-semibold text-white">{a.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-white/60">{a.body}</span>
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="relative mt-11 text-center">
          <a
            href={registerUrl}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl px-8 py-4 text-[15px] font-bold text-white no-underline transition-transform duration-300 hover:-translate-y-0.5"
            style={{ background: 'var(--brand-gradient)', boxShadow: '0 6px 28px rgba(226,12,4,0.4)' }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 -left-[60%] w-[45%] transition-transform duration-700 ease-out group-hover:translate-x-[340%] motion-reduce:hidden"
              style={{ background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.28), transparent)', transform: 'skewX(-16deg)' }}
            />
            List your business free
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
          <p className="mt-4 text-[12.5px] text-white/60">About two minutes. No card details required.</p>
        </div>
      </motion.div>
    </section>
  )
}
