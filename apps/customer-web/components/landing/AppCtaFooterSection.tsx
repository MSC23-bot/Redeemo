'use client'

import Link from 'next/link'
import Image from 'next/image'
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { AppStoreBadge, GooglePlayBadge } from './HeroSection'
import { isMarketplaceLive } from '@/lib/prelaunch'
import { RibbonPeek } from './RibbonPeek'

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

/**
 * The app closer (owner 2026-07-14 rebuild, refined twice): the pricing
 * shelf above already asks for the account, so this panel's job is app
 * anticipation. One phone stands THROUGH the navy panel with balanced
 * top/bottom protrusion, lit by a warm glow so the dimmed screenshot
 * still pops off the navy (owner: it sank). The success sheet plays a
 * live moment when scrolled into view: the "You saved" figure counts up
 * from £0.00 on a DOM replica of the baked pill, and brand confetti
 * falls inside the screen, echoing the app's own redemption behaviour.
 * The ribbon was removed from this panel: it collided with the red
 * headline top-left and with the phone right (owner rounds).
 */

// ── Success-sheet overlay geometry ─────────────────────────────────────
// Fractions of the 800x1740 success-sheet.jpg, sampled from the asset:
// the "You saved £16.00" pill spans x 108-689, y 730-832; pill bg
// rgb(239,240,232); label green rgb(59,155,91); number green
// rgb(39,168,86). The DOM replica covers the baked pill exactly.
const PILL = { left: 0.135, top: 0.4195, width: 0.7263, height: 0.0586 }

// Deterministic confetti (no Math.random: values derive from the index
// and are rounded to 2dp, or React/browser serialisation diverges and
// hydration fails: journey lesson). Falls INSIDE the phone screen.
const r2 = (v: number) => Math.round(v * 100) / 100
const CONFETTI_COLORS = ['#E20C04', '#E84A00', '#F5B301', '#16A34A']
const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  left: r2(6 + ((i * 37 + 13) % 88)),
  delay: r2(((i * 53) % 40) / 50),
  duration: r2(1.7 + ((i * 29) % 50) / 55),
  size: 4 + (i % 3) * 2,
  drift: r2((((i * 17) % 21) - 10) * 1.6),
  rotate: (i * 67) % 360,
  color: CONFETTI_COLORS[i % 4],
}))

function SavedAmountPill({ inView, screenIsSmall }: { inView: boolean; screenIsSmall?: boolean }) {
  const value = useMotionValue(0)
  const text = useTransform(value, (v) => `£${v.toFixed(2)}`)

  useEffect(() => {
    if (!inView) return
    const controls = animate(value, 16, { duration: 1.4, delay: 0.55, ease: 'easeOut' })
    return () => controls.stop()
  }, [inView, value])

  return (
    <div
      className="absolute flex items-center justify-center gap-[0.5em] rounded-[6px] lg:rounded-[9px]"
      style={{
        left: `${PILL.left * 100}%`,
        top: `${PILL.top * 100}%`,
        width: `${PILL.width * 100}%`,
        height: `${PILL.height * 100}%`,
        background: 'rgb(239,240,232)',
      }}
    >
      <span
        className={screenIsSmall ? 'text-[6.5px]' : 'text-[6.5px] lg:text-[10px]'}
        style={{ color: 'rgb(59,155,91)' }}
      >
        You saved
      </span>
      <motion.span
        className={`font-bold ${screenIsSmall ? 'text-[10px]' : 'text-[10px] lg:text-[15.5px]'}`}
        style={{ color: 'rgb(39,168,86)' }}
      >
        {text}
      </motion.span>
    </div>
  )
}

/** Brand confetti raining inside the phone screen on arrival. */
function ScreenConfetti({ inView }: { inView: boolean }) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion || !inView) return null
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
      {CONFETTI.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-[1px]"
          style={{
            left: `${p.left}%`,
            top: '-4%',
            width: p.size,
            height: p.size * 0.55,
            background: p.color,
          }}
          initial={{ y: 0, opacity: 0, rotate: p.rotate }}
          animate={{
            y: [0, 640],
            x: [0, p.drift],
            opacity: [0, 1, 1, 0],
            rotate: p.rotate + 200,
          }}
          transition={{ duration: p.duration, delay: 0.9 + p.delay, ease: [0.3, 0.2, 0.6, 1] }}
        />
      ))}
    </div>
  )
}

/** Mini die-cut voucher chip beside the phone: sways like a hanging
    paper ticket (slow pendulum, each on its own period). */
function OfferChip({
  headline,
  sub,
  className,
  rotate,
  delay,
  swayDuration,
}: {
  headline: string
  sub: string
  className: string
  rotate: number
  delay: number
  swayDuration: number
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, rotate: rotate * 2.5 }}
      whileInView={{ opacity: 1, y: 0, rotate }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.65, delay, ease }}
      className={`absolute z-20 ${className}`}
    >
      <motion.div
        animate={reduceMotion ? undefined : { rotate: [0, 4, 0, -3.5, 0] }}
        transition={{ duration: swayDuration, repeat: Infinity, ease: 'easeInOut', delay: delay * 2 }}
        style={{ filter: 'drop-shadow(0 12px 24px rgba(1,12,53,0.35))', transformOrigin: '50% -30px' }}
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

/** The phone: rises out of the panel, then holds a slow 3D sway. A warm
    glow halo sits behind it so the dark screenshot pops off the navy. */
function AppPhone() {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  // The live moment (count-up + confetti) waits until the phone is
  // nearly fully on screen (owner 2026-07-14: it was firing while the
  // user was still reading the pricing section above, attention not yet
  // on the phone). The entrance spring keeps its earlier trigger.
  const inView = useInView(ref, { once: true, amount: 0.85 })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 90, rotate: -10 }}
      whileInView={{ opacity: 1, y: 0, rotate: -5 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ type: 'spring', stiffness: 70, damping: 16 }}
      className="relative w-[190px] lg:w-[292px]"
      aria-hidden="true"
    >
      {/* Warm halo: lifts the phone off the navy (owner: it sank) */}
      <div
        className="absolute -inset-x-[42%] -inset-y-[20%] pointer-events-none"
        style={{
          background:
            'radial-gradient(closest-side, rgba(232,74,0,0.5), rgba(226,12,4,0.24) 52%, transparent 76%)',
        }}
      />
      <motion.div
        className="relative"
        animate={reduceMotion ? undefined : { rotateY: [0, 4, 0, -4, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformPerspective: 900 }}
      >
        <div
          className="rounded-[36px] lg:rounded-[46px] bg-[#10101c] p-[7px] lg:p-[9px] border border-white/10"
          style={{ boxShadow: '0 34px 70px rgba(1,12,53,0.5), 0 8px 24px rgba(1,12,53,0.32)' }}
        >
          <div className="relative rounded-[29px] lg:rounded-[40px] overflow-hidden h-[392px] lg:h-[602px]">
            <Image
              src="/app-shots/journey/success-sheet.jpg"
              alt=""
              fill
              sizes="292px"
              className="object-cover object-top brightness-[1.07]"
            />
            {/* Live moment: the saved amount counts up on a pixel-matched
                replica of the baked pill, confetti falls in-screen */}
            <SavedAmountPill inView={inView} />
            <ScreenConfetti inView={inView} />
          </div>
        </div>
      </motion.div>
      <OfferChip
        headline="2 FOR 1"
        sub="Dinner for two"
        className="-left-16 lg:-left-24 top-[18%]"
        rotate={-7}
        delay={0.25}
        swayDuration={6.5}
      />
      <OfferChip
        headline="£10 OFF"
        sub="Salon visits"
        className="-right-12 lg:-right-20 top-[62%]"
        rotate={6}
        delay={0.4}
        swayDuration={7.8}
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
          {/* Clipped effects layer (glows only: the ribbon collided with
              the headline or the phone in every corner, owner rounds) */}
          <div aria-hidden="true" className="absolute inset-0 rounded-[28px] overflow-hidden pointer-events-none">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(640px circle at 12% 130%, rgba(226,12,4,0.40), transparent 55%), radial-gradient(380px circle at 92% -15%, rgba(200,50,0,0.18), transparent 55%)',
              }}
            />
          </div>

          {/* A slip of the ribbon in the empty navy between the copy and
              the phone (owner 2026-07-14: missed it after removal): it
              emerges from behind the phone column, low in the gap. The
              phone and copy render later in the DOM, so they paint over
              its edges. Desktop only, like every RibbonPeek. */}
          <div aria-hidden="true" className="hidden xl:block absolute bottom-8 right-[300px] w-[230px] h-[200px] pointer-events-none">
            <RibbonPeek side="right" top="0%" width={210} />
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
                  : 'Redeemo lives in the app: browse nearby, redeem at the till, and see exactly what you saved. It arrives with launch on iOS and Android, and your account carries straight over.'}
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
                    {/* Store badges, non-interactive until the apps exist */}
                    <div className="flex items-center gap-2.5 mt-3 opacity-75">
                      <AppStoreBadge />
                      <GooglePlayBadge />
                    </div>
                    <p className="text-[11px] text-white/30">On both stores at&nbsp;launch</p>
                  </>
                )}
              </motion.div>
            </div>

            {/* Phone zone. Mobile: breaks the top edge only (owner: that
                ratio is right). Desktop: symmetric negative margins plus
                the grid's items-center split the overflow EVENLY between
                the top and bottom edges (measured 54px/54px). */}
            <div className="relative flex justify-center -mt-14 lg:-mt-24 lg:-mb-24 order-1 lg:order-2 pointer-events-none">
              <AppPhone />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
