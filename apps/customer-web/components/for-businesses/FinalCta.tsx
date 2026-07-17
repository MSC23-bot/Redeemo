'use client'

import { useRef } from 'react'
import Image from 'next/image'
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
    title: 'Two flagship vouchers',
    body: 'Set with us before you go live, so customers always find real value.',
  },
  {
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15l2 2 4-4" />
      </svg>
    ),
    title: 'A 12-month partnership agreement',
    body: 'One clear term, signed digitally during onboarding.',
  },
]

// Decorative barcode for the ticket stub. Purely visual; hidden from AT.
const BARCODE = [3, 1, 2, 1, 4, 1, 1, 2, 3, 1, 2, 4, 1, 1, 3, 2, 1, 1, 4, 2, 1, 3, 1, 2, 2, 1, 3, 1]

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
    <section id="register-interest" className="relative scroll-mt-20" style={{ background: '#FFF9F5' }}>
      {/* The handoff: the portal's navy flows straight into this band, then the
          page returns to cream. The ticket straddles the boundary, so the seam
          is carried by the object rather than a hard break. */}
      <div className="absolute inset-x-0 top-0 h-[230px] lg:h-[300px]" style={{ background: '#010C35' }} aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(640px circle at 82% 108%, rgba(226,12,4,0.12), transparent 55%)' }}
        />
      </div>

      <div id="pricing" className="relative mx-auto max-w-[1120px] scroll-mt-24 px-4 pb-16 pt-14 sm:px-6 md:pb-24 lg:pt-20">
        {/* The ticket: the page has been about vouchers all the way down; the
            closer is the business's own. drop-shadow (not box-shadow) so the
            shadow follows the die-cut silhouette. */}
        <motion.div
          initial={{ opacity: 0, y: 44, rotate: -1.4 }}
          whileInView={{ opacity: 1, y: 0, rotate: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.85, ease: EASE }}
          style={{ filter: 'drop-shadow(0 30px 46px rgba(1,12,53,0.28)) drop-shadow(0 6px 14px rgba(1,12,53,0.12))' }}
        >
          <div className="merchant-ticket flex flex-col overflow-hidden rounded-[26px] lg:flex-row" style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFDFB 100%)' }}>
            {/* Main body */}
            <div className="min-w-0 flex-1 px-6 py-9 sm:px-9 md:px-12 md:py-12">
              <p className="mb-2.5 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#E20C04]">
                <span className="h-[2px] w-6 rounded-full bg-[#E20C04]" aria-hidden="true" />
                Get started
              </p>
              <h2 className="font-display mb-4 leading-[1.06] text-[#010C35]" style={{ fontSize: 'clamp(30px, 3.6vw, 46px)', letterSpacing: '-0.6px' }}>
                Ready to list <span className="gradient-text">your&nbsp;business?</span>
              </h2>
              <p className="mb-8 max-w-[600px] text-[14.5px] leading-[1.7] text-[#4B5563]">
                Create your free Merchant Portal account and start building your listing today. Before you go live you&rsquo;ll set two flagship vouchers, your commitment to customers; from there, add custom vouchers whenever you need them, with your own value, terms and timing.
              </p>

              {/* The wall of zeros, printed on the ticket */}
              <div className="grid auto-rows-fr grid-cols-2 gap-2.5 lg:grid-cols-4">
                {ZEROS.map((z, i) => (
                  <motion.div
                    key={z.label}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.5, delay: i * 0.08, ease: EASE }}
                    className="group rounded-xl border p-4 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(226,12,4,0.4)]"
                    style={{ background: '#FFF9F5', borderColor: 'rgba(1,12,53,0.09)' }}
                  >
                    <p className="font-display mb-1 text-[#010C35]" style={{ fontSize: 'clamp(26px, 2.4vw, 34px)', lineHeight: 1, letterSpacing: '-1px' }}>
                      <span className="sr-only">{`${z.prefix}0${z.suffix}`}</span>
                      <span aria-hidden="true">
                        {z.prefix}
                        <ZeroReel reel={z.reel} delay={0.25 + i * 0.12} />
                        {z.suffix}
                      </span>
                    </p>
                    <p className="text-[12px] font-semibold text-[#1F2937]">{z.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#6B7280]">{z.detail}</p>
                  </motion.div>
                ))}
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-[#4B5563]">
                Your only cost is the offer you designed, and only when a customer walks&nbsp;in.
              </p>

              {/* What we ask in return */}
              <div className="mt-7 border-t pt-6" style={{ borderColor: 'rgba(1,12,53,0.08)' }}>
                <p className="mb-3.5 text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#6B7280]">What we ask in return</p>
                <div className="grid gap-x-8 gap-y-3.5 md:grid-cols-2">
                  {ASKS.map((a) => (
                    <div key={a.title} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[#E20C04]" style={{ background: 'rgba(226,12,4,0.08)' }}>
                        {a.icon}
                      </span>
                      <span>
                        <span className="block text-[13px] font-semibold text-[#010C35]">{a.title}</span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-[#6B7280]">{a.body}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* The tear-off stub: the action lives here */}
            <div
              className="flex h-[260px] flex-col items-center justify-center gap-3.5 border-t-2 border-dashed px-7 lg:h-auto lg:w-[330px] lg:flex-shrink-0 lg:border-l-2 lg:border-t-0"
              style={{ borderColor: 'rgba(1,12,53,0.14)', background: '#FFF9F5' }}
            >
              <Image src="/logo-icon.svg" alt="" width={38} height={38} aria-hidden="true" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#010C35]/45">Your invitation</p>
              <a
                href={registerUrl}
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl px-7 py-3.5 text-center text-[14.5px] font-bold text-white no-underline transition-transform duration-300 hover:-translate-y-0.5"
                style={{ background: 'var(--brand-gradient)', boxShadow: '0 6px 24px rgba(226,12,4,0.35)' }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 -left-[60%] w-[45%] transition-transform duration-700 ease-out group-hover:translate-x-[340%] motion-reduce:hidden"
                  style={{ background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.28), transparent)', transform: 'skewX(-16deg)' }}
                />
                List your business free
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </a>
              <p className="text-center text-[12px] leading-snug text-[#6B7280]">About two minutes. No card details required.</p>
              <div aria-hidden="true" className="mt-1 flex flex-col items-center gap-1.5">
                <svg width="150" height="26" viewBox="0 0 150 26">
                  {(() => {
                    let x = 0
                    return BARCODE.map((w, i) => {
                      const bar = <rect key={i} x={x} y="0" width={w * 1.7} height="26" fill="#010C35" opacity={0.82} />
                      x += w * 1.7 + 2.2
                      return bar
                    })
                  })()}
                </svg>
                <p className="text-[8.5px] font-semibold uppercase tracking-[0.34em] text-[#9CA3AF]">Redeemo merchants</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <style>{`
        /* Die-cut perforation notches, real transparency so the ticket sits on
           the navy band and the cream below alike. Stub is 240px tall on
           mobile (bottom tear) and 330px wide on desktop (side tear); the
           notch positions must track those constants. */
        .merchant-ticket {
          mask-image:
            radial-gradient(circle 12px at 0 calc(100% - 260px), transparent 11px, black 12px),
            radial-gradient(circle 12px at 100% calc(100% - 260px), transparent 11px, black 12px);
          -webkit-mask-image:
            radial-gradient(circle 12px at 0 calc(100% - 260px), transparent 11px, black 12px),
            radial-gradient(circle 12px at 100% calc(100% - 260px), transparent 11px, black 12px);
          mask-composite: intersect;
          -webkit-mask-composite: source-in;
        }
        @media (min-width: 1024px) {
          .merchant-ticket {
            mask-image:
              radial-gradient(circle 12px at calc(100% - 330px) 0, transparent 11px, black 12px),
              radial-gradient(circle 12px at calc(100% - 330px) 100%, transparent 11px, black 12px);
            -webkit-mask-image:
              radial-gradient(circle 12px at calc(100% - 330px) 0, transparent 11px, black 12px),
              radial-gradient(circle 12px at calc(100% - 330px) 100%, transparent 11px, black 12px);
          }
        }
      `}</style>
    </section>
  )
}
