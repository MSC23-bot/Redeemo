'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { AppStoreBadge, GooglePlayBadge } from './HeroSection'
import { isMarketplaceLive } from '@/lib/prelaunch'
import { RibbonPeek } from './RibbonPeek'

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * The app closer (owner 2026-07-14 rebuild): the pricing shelf above
 * already asks for the account, so this panel's job is app
 * anticipation, not a repeated sign-up line. One phone mockup stands
 * THROUGH the navy panel (protruding past its top and bottom edges),
 * two die-cut offer chips float beside it, and the CTA keeps the same
 * /register destination but changes job: "Be first to get the app".
 * The dotted eyebrow pill was removed (owner: felt AI-generic).
 */

/** Mini die-cut voucher chip that floats beside the phone. */
function OfferChip({
  headline,
  sub,
  className,
  rotate,
  delay,
}: {
  headline: string
  sub: string
  className: string
  rotate: number
  delay: number
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.55, delay, ease }}
      className={`absolute z-20 ${className}`}
      style={{ rotate }}
    >
      <motion.div
        animate={reduceMotion ? undefined : { y: [0, -9, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: delay * 3 }}
        style={{ filter: 'drop-shadow(0 12px 24px rgba(1,12,53,0.35))' }}
      >
        <div
          className="bg-white rounded-xl px-4 py-2.5"
          style={{
            maskImage:
              'radial-gradient(circle at 0 50%, transparent 5.5px, black 6px), radial-gradient(circle at 100% 50%, transparent 5.5px, black 6px)',
            WebkitMaskImage:
              'radial-gradient(circle at 0 50%, transparent 5.5px, black 6px), radial-gradient(circle at 100% 50%, transparent 5.5px, black 6px)',
            maskComposite: 'intersect',
            WebkitMaskComposite: 'source-in',
          }}
        >
          <p className="font-display text-[15px] leading-none text-[#E20C04]">{headline}</p>
          <p className="text-[10.5px] text-[#010C35]/60 font-semibold mt-1 whitespace-nowrap">{sub}</p>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** The phone, rising out of the panel on scroll. */
function AppPhone() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 90, rotate: -10 }}
      whileInView={{ opacity: 1, y: 0, rotate: -5 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ type: 'spring', stiffness: 70, damping: 16 }}
      className="relative w-[190px] lg:w-[250px]"
      aria-hidden="true"
    >
      <div
        className="rounded-[36px] lg:rounded-[44px] bg-[#10101c] p-[7px] lg:p-[9px]"
        style={{ boxShadow: '0 34px 70px rgba(1,12,53,0.45), 0 8px 24px rgba(1,12,53,0.3)' }}
      >
        <div className="relative rounded-[29px] lg:rounded-[35px] overflow-hidden h-[392px] lg:h-[516px]">
          <Image
            src="/app-shots/journey/voucher-detail.jpg"
            alt=""
            fill
            sizes="250px"
            className="object-cover object-top"
          />
        </div>
      </div>
      <OfferChip
        headline="2 FOR 1"
        sub="Mains, Mon-Thu"
        className="-left-16 lg:-left-24 top-[18%]"
        rotate={-7}
        delay={0.25}
      />
      <OfferChip
        headline="£10 OFF"
        sub="First visit"
        className="-right-12 lg:-right-20 top-[62%]"
        rotate={6}
        delay={0.4}
      />
    </motion.div>
  )
}

export function AppCtaFooterSection() {
  const marketplaceLive = isMarketplaceLive()

  return (
    <section className="px-6 pt-24 pb-16 md:pt-28 md:pb-24 overflow-x-clip" style={{ background: '#FFF9F5' }}>
      {/* Contained navy panel on cream; the phone deliberately stands
          through its top and bottom edges, so clipping lives on an inner
          layer, never on the panel itself */}
      <div className="relative max-w-[1080px] mx-auto">
        <div
          className="relative rounded-[28px]"
          style={{ background: '#010C35', boxShadow: '0 28px 64px rgba(1,12,53,0.22)' }}
        >
          {/* Clipped effects layer */}
          <div aria-hidden="true" className="absolute inset-0 rounded-[28px] overflow-hidden pointer-events-none">
            <RibbonPeek side="right" top="10%" width={220} />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(640px circle at 12% 130%, rgba(226,12,4,0.40), transparent 55%), radial-gradient(380px circle at 92% -15%, rgba(200,50,0,0.18), transparent 55%)',
              }}
            />
          </div>

          <div className="relative grid lg:grid-cols-[1fr_320px] gap-0 items-center">
            {/* Copy */}
            <div className="px-7 pt-12 pb-8 lg:px-14 lg:py-16 text-center lg:text-left order-2 lg:order-1">
              <motion.h2
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, ease }}
                className="font-display text-white leading-[1.08] mb-4"
                style={{ fontSize: 'clamp(26px, 3.6vw, 46px)', letterSpacing: '-0.5px' }}
              >
                Vouchers in your pocket.{' '}
                <span className="gradient-text block">
                  {marketplaceLive ? 'Download free.' : 'Redemption in seconds.'}
                </span>
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="text-[13.5px] md:text-[15px] text-white/50 leading-[1.7] mb-8 max-w-[440px] mx-auto lg:mx-0"
              >
                {marketplaceLive
                  ? 'Browse and save on the website. Redeem your vouchers in-store with the app.'
                  : 'Redeemo lives in the app: browse nearby, redeem at the till, and see exactly what you saved. It arrives with launch on iOS and Android, and your account carries straight over.'}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.25 }}
                className="flex flex-col items-center lg:items-start gap-3"
              >
                {marketplaceLive ? (
                  <div className="flex gap-3 justify-center lg:justify-start flex-wrap items-center">
                    <AppStoreBadge />
                    <GooglePlayBadge />
                  </div>
                ) : (
                  <>
                    <Link
                      href="/register"
                      className="inline-flex items-center gap-2 text-white font-bold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
                      style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 20px rgba(226,12,4,0.3)' }}
                    >
                      Be first to get the app
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </Link>
                    <p className="text-[12px] text-white/35">Free to join, no card&nbsp;needed.</p>
                  </>
                )}
              </motion.div>
            </div>

            {/* Phone zone: protrudes past the panel's top edge on all
                viewports (and past the bottom edge on desktop) */}
            <div className="relative flex justify-center lg:justify-start -mt-14 lg:mt-0 lg:-my-10 order-1 lg:order-2 pointer-events-none">
              <AppPhone />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
