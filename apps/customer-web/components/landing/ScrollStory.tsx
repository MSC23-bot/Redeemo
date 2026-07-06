'use client'

import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useRef } from 'react'

/**
 * Keeps a scroll-linked value on the JS animation path. Chrome promotes
 * directly-bound scroll transforms to native ScrollTimeline animations, and
 * that promotion misbinds for these stacked layers (inline style froze at 1
 * while the native animation drove the computed value elsewhere). The spring
 * both defeats the promotion and softens the crossfades.
 */
function useScrollLinked(value: MotionValue<number>) {
  return useSpring(value, { stiffness: 320, damping: 40, mass: 0.5 })
}
import { BrowseScreen, CodeScreen, PhoneFrame, StatusBar } from './PhoneDemo'
import { VoucherTypesSection } from './VoucherTypesSection'
import { HowItWorksSection } from './HowItWorksSection'

/**
 * Scroll-driven product story (owner direction 2026-07-06): one pinned phone
 * travels through three chapters (find, choose, redeem) while the background
 * makes the cream-white-navy journey and the phone screen changes to match.
 * Desktop only; mobile and reduced-motion visitors get the static sections,
 * which remain the no-JS/SEO content as well.
 *
 * Everything on the scroll path is a motion transform. No React state updates
 * during scroll: state churn re-created the chapter nodes mid-scroll and froze
 * their bindings, and it re-rendered the tree every frame besides.
 */

const CHAPTERS = [
  {
    kicker: '01 · Find',
    title: 'Places worth knowing about.',
    body: 'Independent kitchens, coffee houses, studios and salons, chosen one by one. Browse them all free, before you spend anything.',
    ink: '#010C35',
    sub: '#4B5563',
    kickerColour: '#E20C04',
  },
  {
    kicker: '02 · Choose',
    title: 'Every kind of voucher. One membership.',
    body: 'One voucher per place, each month. A new cycle brings them back, fresh.',
    ink: '#010C35',
    sub: '#4B5563',
    kickerColour: '#E20C04',
  },
  {
    kicker: '03 · Redeem',
    title: 'Show your code. Pay less.',
    body: 'At the venue, tap redeem and show your phone. Verified in seconds, once per place per month. No minimum-spend tricks.',
    ink: '#FFFFFF',
    sub: 'rgba(255,255,255,0.55)',
    kickerColour: 'rgba(255,255,255,0.45)',
  },
]

// Chapter visibility bands (scroll progress). Background flips to navy only
// after chapter two's navy-ink text has fully left the stage.
const CH_BANDS: [number[], number[]][] = [
  [[0, 0.22, 0.28], [1, 1, 0]],
  [[0.3, 0.36, 0.54, 0.6], [0, 1, 1, 0]],
  [[0.68, 0.76, 1], [0, 1, 1]],
]

// Voucher variants the phone cycles through in chapter two. Colours are the
// app's voucher-type tokens; places are the site-wide synthetic examples.
const VOUCHER_VARIANTS = [
  {
    key: 'bogo',
    chip: 'Buy one get one free',
    colour: '#7C3AED',
    tint: 'rgba(124,58,237,0.08)',
    title: 'Buy one main, get one free',
    merchant: 'The Old Foundry Kitchen',
  },
  {
    key: 'freebie',
    chip: 'Freebie',
    colour: '#16A34A',
    tint: 'rgba(22,163,74,0.08)',
    title: 'Free pastry with any drink',
    merchant: 'Juniper Coffee',
  },
  {
    key: 'spend',
    chip: 'Spend and save',
    colour: '#E84A00',
    tint: 'rgba(232,74,0,0.08)',
    title: 'Spend £30, save £8',
    merchant: 'The Old Foundry Kitchen',
  },
  {
    key: 'timed',
    chip: 'Time-limited',
    colour: '#D97706',
    tint: 'rgba(217,119,6,0.08)',
    title: 'Half price, weekday lunches',
    merchant: 'Fern & Field Deli',
  },
]

// Chapter two's inner band, subdivided evenly per variant with hard cuts.
const VARIANT_BAND: [number, number] = [0.3, 0.56]

function variantOpacityRange(i: number): [number[], number[]] {
  const [a, b] = VARIANT_BAND
  const span = (b - a) / VOUCHER_VARIANTS.length
  const start = a + i * span
  const end = start + span
  const fade = 0.012
  if (i === 0) return [[start, end - fade, end], [1, 1, 0]]
  if (i === VOUCHER_VARIANTS.length - 1) return [[start, start + fade, 1], [0, 1, 1]]
  return [[start, start + fade, end - fade, end], [0, 1, 1, 0]]
}

const OTHER_TYPES = 'Plus discounts, package deals and reusable vouchers.'

function StoryVoucherScreen({ variant }: { variant: (typeof VOUCHER_VARIANTS)[number] }) {
  return (
    <div className="h-full flex flex-col" style={{ background: '#FFF9F5' }}>
      <StatusBar />
      <div className="px-4 flex-1 flex flex-col justify-center pb-6">
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(1,12,53,0.08)', background: '#FFFFFF' }}>
          <div className="px-4 pt-4 pb-3" style={{ background: variant.tint }}>
            <span
              className="text-[8px] font-bold tracking-[0.1em] uppercase px-2 py-1 rounded-full text-white"
              style={{ background: variant.colour }}
            >
              {variant.chip}
            </span>
            <p className="font-display text-[17px] leading-[1.2] mt-2.5" style={{ color: '#010C35' }}>
              {variant.title}
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'rgba(1,12,53,0.5)' }}>{variant.merchant}</p>
          </div>
          <div className="px-4 py-3 space-y-2">
            {['Included with your membership', 'Once per month, fresh each cycle'].map((line) => (
              <div key={line} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: variant.colour }} />
                <p className="text-[9.5px]" style={{ color: 'rgba(1,12,53,0.6)' }}>{line}</p>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4">
            <div className="rounded-xl py-2.5 text-center text-[11px] font-bold text-white" style={{ background: 'var(--brand-gradient)' }}>
              Redeem at the venue
            </div>
          </div>
        </div>
        <p className="text-center text-[8.5px] mt-3" style={{ color: 'rgba(1,12,53,0.4)' }}>
          Example voucher
        </p>
      </div>
    </div>
  )
}

function VariantLayer({ progress, index, children }: {
  progress: MotionValue<number>
  index: number
  children: React.ReactNode
}) {
  const [input, output] = variantOpacityRange(index)
  const opacity = useScrollLinked(useTransform(progress, input, output))
  return (
    <motion.div className="absolute inset-0" style={{ opacity }}>
      {children}
    </motion.div>
  )
}

function ChapterLayer({ progress, index, children }: {
  progress: MotionValue<number>
  index: number
  children: React.ReactNode
}) {
  const [input, output] = CH_BANDS[index]
  const opacity = useScrollLinked(useTransform(progress, input, output))
  const y = useScrollLinked(useTransform(
    progress,
    [input[0], input[input.length - 1]],
    index === 0 ? [0, -28] : index === CHAPTERS.length - 1 ? [28, 0] : [28, -28],
  ))
  return (
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
      <motion.div style={{ opacity, y }}>{children}</motion.div>
    </div>
  )
}

function StoryStage() {
  const trackRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })

  const bg = useTransform(
    scrollYProgress,
    [0, 0.26, 0.34, 0.6, 0.72, 1],
    ['#FFF9F5', '#FFF9F5', '#FFFFFF', '#FFFFFF', '#010C35', '#010C35'],
  )

  // Phone screen layers
  const browseOpacity = useScrollLinked(useTransform(scrollYProgress, [0, 0.24, 0.31], [1, 1, 0]))
  const voucherOpacity = useScrollLinked(useTransform(scrollYProgress, [0.27, 0.34, 0.56, 0.63], [0, 1, 1, 0]))
  const codeOpacity = useScrollLinked(useTransform(scrollYProgress, [0.6, 0.72, 1], [0, 1, 1]))

  // Gentle phone drift so the pin never feels frozen
  const phoneY = useScrollLinked(useTransform(scrollYProgress, [0, 1], [16, -16]))
  const phoneRotate = useScrollLinked(useTransform(scrollYProgress, [0, 0.5, 1], [-2, 0, 2]))

  // Chrome that must flip with the navy chapter
  const lightCaptionOpacity = useScrollLinked(useTransform(scrollYProgress, [0.6, 0.72], [1, 0]))
  const darkCaptionOpacity = useScrollLinked(useTransform(scrollYProgress, [0.6, 0.72], [0, 1]))

  // Variant progress dashes (chapter two)
  const dashScales = VOUCHER_VARIANTS.map((_, i) => {
    const [input, output] = variantOpacityRange(i)
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length list, stable order
    return useScrollLinked(useTransform(scrollYProgress, input, output))
  })

  return (
    <div ref={trackRef} className="relative" style={{ height: '340vh' }}>
      <motion.div className="sticky top-0 h-screen overflow-hidden" style={{ background: bg }}>
        <div className="max-w-7xl mx-auto h-full px-6 grid grid-cols-[1fr_420px] gap-8 items-center">

          {/* Chapter text (stacked, crossfading) */}
          <div className="relative min-h-[380px]">
            {CHAPTERS.map((c, i) => (
              <ChapterLayer key={c.kicker} progress={scrollYProgress} index={i}>
                <p className="text-[12px] font-bold tracking-[0.2em] uppercase mb-5" style={{ color: c.kickerColour }}>
                  {c.kicker}
                </p>
                <h3
                  className="font-display leading-[1.06] mb-5 max-w-[560px]"
                  style={{ fontSize: 'clamp(34px, 3.8vw, 56px)', letterSpacing: '-0.8px', color: c.ink }}
                >
                  {c.title}
                </h3>
                <p className="text-[16px] leading-[1.7] max-w-[440px]" style={{ color: c.sub }}>
                  {c.body}
                </p>

                {i === 1 && (
                  <div className="mt-8">
                    {/* Stacked wordmarks, one visible per variant band */}
                    <div className="relative h-[46px]">
                      {VOUCHER_VARIANTS.map((v, vi) => (
                        <VariantLayer key={v.key} progress={scrollYProgress} index={vi}>
                          <p
                            className="font-display leading-none"
                            style={{ fontSize: 'clamp(26px, 2.6vw, 38px)', letterSpacing: '-0.5px', color: v.colour }}
                          >
                            {v.chip}
                          </p>
                        </VariantLayer>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      {VOUCHER_VARIANTS.map((v, vi) => (
                        <span key={v.key} className="relative h-[4px] w-[24px] rounded-full overflow-hidden" aria-hidden="true" style={{ background: 'rgba(1,12,53,0.12)' }}>
                          <motion.span
                            className="absolute inset-0 rounded-full"
                            style={{ background: v.colour, opacity: dashScales[vi] }}
                          />
                        </span>
                      ))}
                    </div>
                    <p className="mt-4 text-[13.5px]" style={{ color: '#6B7280' }}>{OTHER_TYPES}</p>
                  </div>
                )}
              </ChapterLayer>
            ))}
          </div>

          {/* The pinned phone */}
          <motion.div style={{ y: phoneY, rotate: phoneRotate }} className="justify-self-end">
            <PhoneFrame dark={false}>
              <motion.div className="absolute inset-0" style={{ opacity: browseOpacity }}>
                <BrowseScreen />
              </motion.div>
              <motion.div className="absolute inset-0" style={{ opacity: voucherOpacity }}>
                {VOUCHER_VARIANTS.map((v, vi) => (
                  <VariantLayer key={v.key} progress={scrollYProgress} index={vi}>
                    <StoryVoucherScreen variant={v} />
                  </VariantLayer>
                ))}
              </motion.div>
              <motion.div className="absolute inset-0" style={{ opacity: codeOpacity }}>
                <CodeScreen />
              </motion.div>
            </PhoneFrame>
            <div className="relative mt-3 h-[16px] text-center">
              <motion.p className="absolute inset-x-0 text-[10px]" style={{ color: 'rgba(1,12,53,0.4)', opacity: lightCaptionOpacity }}>
                App preview · example places, not live listings
              </motion.p>
              <motion.p className="absolute inset-x-0 text-[10px]" style={{ color: 'rgba(255,255,255,0.5)', opacity: darkCaptionOpacity }}>
                App preview · example places, not live listings
              </motion.p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

export function ScrollStory() {
  const reduceMotion = useReducedMotion()

  return (
    <>
      {/* Static fallback: mobile, reduced motion, no-JS and crawlers */}
      <div className={reduceMotion ? '' : 'lg:hidden'}>
        <VoucherTypesSection />
        <HowItWorksSection />
      </div>
      {!reduceMotion && (
        <div className="hidden lg:block">
          <StoryStage />
        </div>
      )}
    </>
  )
}
