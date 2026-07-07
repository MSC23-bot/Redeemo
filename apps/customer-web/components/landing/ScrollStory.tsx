'use client'

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion'
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
import Image from 'next/image'
import { CodeScreen, PhoneFrame } from './PhoneDemo'
import { VoucherTypesSection } from './VoucherTypesSection'

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
    title: 'Money off, everywhere you already go.',
    body: 'Independent kitchens, coffee houses, studios and salons, chosen one by one. Every place carries its saving. Browse them all free.',
    ink: '#010C35',
    sub: '#4B5563',
    kickerColour: '#E20C04',
  },
  {
    kicker: '02 · Choose',
    title: 'Every place. Every voucher. One membership.',
    body: 'Nothing is held back. No premium tier, no add-ons: £6.99 covers every voucher at every place. Each one is yours once a month, then it comes back fresh.',
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

const OTHER_TYPES = 'Buy one get one free, freebies, spend-and-save, package deals, time-limited, reusable and straight discounts.'

function Shot({ src }: { src: string }) {
  return <Image src={src} alt="" fill sizes="272px" className="object-cover object-top" />
}


function ChapterBackdrop({ progress, band, name, children }: {
  progress: MotionValue<number>
  band: [number, number, number, number]
  name: string
  children?: React.ReactNode
}) {
  const opacity = useScrollLinked(useTransform(progress, band, [0, 1, 1, 0]))
  const videoRef = useRef<HTMLVideoElement>(null)
  useMotionValueEvent(opacity, 'change', (v) => {
    const el = videoRef.current
    if (!el) return
    if (v > 0.05 && el.paused) el.play().catch(() => {})
    if (v <= 0.05 && !el.paused) el.pause()
  })
  return (
    <motion.div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ opacity }}>
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="metadata"
        poster={`/app-motion/${name}.jpg`}
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src={`/app-motion/${name}.mp4`} type="video/mp4" />
      </video>
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

  // Phone screen layers: real app captures per chapter
  const browseOpacity = useScrollLinked(useTransform(scrollYProgress, [0, 0.24, 0.31], [1, 1, 0]))
  const voucherOpacity = useScrollLinked(useTransform(scrollYProgress, [0.27, 0.34, 0.56, 0.63], [0, 1, 1, 0]))
  const codeOpacity = useScrollLinked(useTransform(scrollYProgress, [0.6, 0.72, 1], [0, 1, 1]))
  // Chapter one: the stitched real home page scrolls inside the frame
  const homeScrollY = useScrollLinked(useTransform(scrollYProgress, [0.02, 0.3], [0, -820]))
  // Chapter three: the real redemption journey: sheet -> PIN -> code
  const sheetOpacity = useScrollLinked(useTransform(scrollYProgress, [0.6, 0.66, 0.74, 0.78], [0, 1, 1, 0]))
  const pinOpacity = useScrollLinked(useTransform(scrollYProgress, [0.74, 0.78, 0.86, 0.9], [0, 1, 1, 0]))
  const codeScreenOpacity = useScrollLinked(useTransform(scrollYProgress, [0.86, 0.9, 1], [0, 1, 1]))

  // Gentle phone drift so the pin never feels frozen
  const phoneY = useScrollLinked(useTransform(scrollYProgress, [0, 1], [16, -16]))
  const phoneRotate = useScrollLinked(useTransform(scrollYProgress, [0, 0.5, 1], [-2, 0, 2]))

  // Chrome that must flip with the navy chapter
  const lightCaptionOpacity = useScrollLinked(useTransform(scrollYProgress, [0.6, 0.72], [1, 0]))
  const darkCaptionOpacity = useScrollLinked(useTransform(scrollYProgress, [0.6, 0.72], [0, 1]))

  return (
    <div ref={trackRef} className="relative" style={{ height: '340vh' }}>
      <motion.div className="sticky top-0 h-screen overflow-hidden" style={{ background: bg }}>
        {/* Backdrop ambience PARKED (owner 2026-07-07: wants the phone INSIDE
            the generated film, not scenery behind the code phone). Assets kept
            in public/app-motion for reference; reintroduce only per new brief. */}
        <div className="relative max-w-7xl mx-auto h-full px-6 grid grid-cols-[1fr_420px] gap-8 items-center">

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
                  <p className="mt-6 text-[13.5px] max-w-[420px] leading-[1.7]" style={{ color: '#6B7280' }}>
                    {OTHER_TYPES}
                  </p>
                )}
              </ChapterLayer>
            ))}
          </div>

          {/* The pinned phone */}
          <motion.div style={{ y: phoneY, rotate: phoneRotate }} className="justify-self-end">
            <PhoneFrame dark={false}>
              <motion.div className="absolute inset-0 overflow-hidden" style={{ opacity: browseOpacity }}>
                <motion.div className="absolute inset-x-0 top-0" style={{ y: homeScrollY, height: 1404 }}>
                  <Image src="/app-shots/home-tall.png" alt="" fill sizes="272px" className="object-cover object-top" />
                </motion.div>
              </motion.div>
              <motion.div className="absolute inset-0" style={{ opacity: voucherOpacity }}>
                <Shot src="/app-shots/voucher-bogo.png" />
              </motion.div>
              <motion.div className="absolute inset-0" style={{ opacity: codeOpacity }}>
                <motion.div className="absolute inset-0" style={{ opacity: sheetOpacity }}><Shot src="/app-shots/redeem-sheet.png" /></motion.div>
                <motion.div className="absolute inset-0" style={{ opacity: pinOpacity }}><Shot src="/app-shots/redeem-pin.png" /></motion.div>
                <motion.div className="absolute inset-0" style={{ opacity: codeScreenOpacity }}><CodeScreen /></motion.div>
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
      </div>
      {!reduceMotion && (
        <div className="hidden lg:block">
          <StoryStage />
        </div>
      )}
    </>
  )
}
