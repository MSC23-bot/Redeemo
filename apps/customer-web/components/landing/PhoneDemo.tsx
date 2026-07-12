'use client'

import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

/**
 * Code-rendered preview of the Redeemo app inside a phone frame. Three screens
 * (browse, voucher, redemption code) built from the app's real design language:
 * its fonts, voucher-type colours, and the app's own 3D category card art.
 * Example places are clearly synthetic. Purely illustrative: nothing inside the
 * frame is interactive; the step controls beside it drive the scene.
 */

const STEPS = [
  { key: 'browse', label: 'Find a place near you', caption: 'Browse quality local spots and the vouchers each one includes.' },
  { key: 'voucher', label: 'Pick your voucher', caption: 'Every membership voucher, one per place each month.' },
  { key: 'code', label: 'Show your code. Pay less.', caption: 'Your code appears in the app when you redeem at the venue.' },
] as const

const CYCLE_MS = 4200

// Voucher-type colours from the customer app's design tokens
const BOGO_PURPLE = '#7C3AED'
const FREEBIE_GREEN = '#16A34A'

export function StatusBar({ dark = false }: { dark?: boolean }) {
  const c = dark ? 'rgba(255,255,255,0.65)' : 'rgba(1,12,53,0.55)'
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-1">
      <span className="text-[10px] font-semibold" style={{ color: c }}>9:41</span>
      <div className="flex items-center gap-1" aria-hidden="true">
        <span className="inline-block w-3 h-[7px] rounded-[1.5px]" style={{ border: `1px solid ${c}` }} />
        <span className="inline-block w-[3px] h-[7px] rounded-[1px]" style={{ background: c }} />
      </div>
    </div>
  )
}

export function BrowseScreen() {
  return (
    <div className="h-full flex flex-col" style={{ background: '#FFF9F5' }}>
      <StatusBar />
      <div className="px-4 pt-2">
        <p className="text-[10px] font-medium" style={{ color: 'rgba(1,12,53,0.45)' }}>Good evening</p>
        <p className="font-display text-[16px] leading-tight" style={{ color: '#010C35' }}>Near you</p>
        <div
          className="mt-2.5 flex items-center gap-1.5 rounded-full px-3 py-2"
          style={{ background: '#FFFFFF', border: '1px solid rgba(1,12,53,0.08)' }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(1,12,53,0.4)" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <span className="text-[10px]" style={{ color: 'rgba(1,12,53,0.38)' }}>Search places</span>
        </div>
      </div>
      <div className="mt-3 pl-4 flex gap-2 overflow-hidden" aria-hidden="true">
        <Image src="/app-demo/cat-food-drink.png" alt="" width={104} height={66} className="rounded-lg flex-shrink-0" style={{ width: 104, height: 'auto' }} />
        <Image src="/app-demo/cat-beauty-wellness.png" alt="" width={104} height={66} className="rounded-lg flex-shrink-0" style={{ width: 104, height: 'auto' }} />
        <Image src="/app-demo/cat-health-fitness.png" alt="" width={104} height={66} className="rounded-lg flex-shrink-0" style={{ width: 104, height: 'auto' }} />
      </div>
      <div className="px-4 mt-3 space-y-2">
        <div className="rounded-xl p-3" style={{ background: '#FFFFFF', border: '1px solid rgba(1,12,53,0.07)' }}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11.5px] font-bold leading-tight" style={{ color: '#010C35' }}>The Old Foundry Kitchen</p>
              <p className="text-[9.5px] mt-0.5" style={{ color: 'rgba(1,12,53,0.45)' }}>Kitchen &amp; bar · 0.4 mi</p>
            </div>
            <span
              className="text-[8px] font-bold tracking-[0.08em] uppercase px-2 py-1 rounded-full flex-shrink-0"
              style={{ color: BOGO_PURPLE, background: 'rgba(124,58,237,0.1)' }}
            >
              BOGO
            </span>
          </div>
          <p className="text-[9.5px] mt-1.5 font-medium" style={{ color: 'rgba(1,12,53,0.6)' }}>Buy one main, get one free</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: '#FFFFFF', border: '1px solid rgba(1,12,53,0.07)' }}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11.5px] font-bold leading-tight" style={{ color: '#010C35' }}>Juniper Coffee</p>
              <p className="text-[9.5px] mt-0.5 whitespace-nowrap" style={{ color: 'rgba(1,12,53,0.45)' }}>Independent coffee house · 0.7 mi</p>
            </div>
            <span
              className="text-[8px] font-bold tracking-[0.08em] uppercase px-2 py-1 rounded-full flex-shrink-0"
              style={{ color: FREEBIE_GREEN, background: 'rgba(22,163,74,0.1)' }}
            >
              Freebie
            </span>
          </div>
          <p className="text-[9.5px] mt-1.5 font-medium" style={{ color: 'rgba(1,12,53,0.6)' }}>Free pastry with any drink</p>
        </div>
      </div>
    </div>
  )
}

function VoucherScreen() {
  return (
    <div className="h-full flex flex-col" style={{ background: '#FFF9F5' }}>
      <StatusBar />
      <div className="px-4 flex-1 flex flex-col justify-center pb-6">
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(1,12,53,0.08)', background: '#FFFFFF' }}>
          <div className="px-4 pt-4 pb-3" style={{ background: 'rgba(124,58,237,0.08)' }}>
            <span
              className="text-[8px] font-bold tracking-[0.1em] uppercase px-2 py-1 rounded-full"
              style={{ color: '#FFFFFF', background: BOGO_PURPLE }}
            >
              Buy one get one free
            </span>
            <p className="font-display text-[17px] leading-[1.2] mt-2.5" style={{ color: '#010C35' }}>
              Buy one main, get one free
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'rgba(1,12,53,0.5)' }}>The Old Foundry Kitchen</p>
          </div>
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: BOGO_PURPLE }} />
              <p className="text-[9.5px]" style={{ color: 'rgba(1,12,53,0.6)' }}>Included with your membership</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: BOGO_PURPLE }} />
              <p className="text-[9.5px]" style={{ color: 'rgba(1,12,53,0.6)' }}>Once per month, fresh each cycle</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: BOGO_PURPLE }} />
              <p className="text-[9.5px]" style={{ color: 'rgba(1,12,53,0.6)' }}>Valid 7 days a week</p>
            </div>
          </div>
          <div className="px-4 pb-4">
            <div
              className="rounded-xl py-2.5 text-center text-[11px] font-bold text-white"
              style={{ background: 'var(--brand-gradient)' }}
            >
              Redeem at the venue
            </div>
          </div>
        </div>
        <p className="text-center text-[8.5px] mt-3" style={{ color: 'rgba(1,12,53,0.35)' }}>
          Example voucher
        </p>
      </div>
    </div>
  )
}

export function CodeScreen() {
  return (
    <div className="h-full flex flex-col" style={{ background: '#010C35' }}>
      <StatusBar dark />
      <div className="px-4 flex-1 flex flex-col items-center justify-center text-center pb-8">
        <p className="text-[9px] font-bold tracking-[0.16em] uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Show this at the till
        </p>
        <div
          className="mt-3 w-[104px] h-[104px] rounded-xl p-2.5 grid grid-cols-7 grid-rows-7 gap-[2px]"
          style={{ background: '#FFFFFF' }}
          aria-hidden="true"
        >
          {'1111111100000110111011010001011101101000001111111000101001101110010110001110100101011000110111011110011'
            .slice(0, 49)
            .split('')
            .map((bit, i) => (
              <span key={i} className="rounded-[1.5px]" style={{ background: bit === '1' ? '#010C35' : 'transparent' }} />
            ))}
        </div>
        <p className="font-display text-white text-[22px] tracking-[0.12em] mt-3.5" style={{ letterSpacing: '2px' }}>
          K7PT 4QND
        </p>
        <p className="text-[9.5px] mt-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>The Old Foundry Kitchen</p>
        <p className="text-[9px] mt-3 px-3 py-1.5 rounded-full" style={{ color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.07)' }}>
          Staff scan or enter the code
        </p>
      </div>
    </div>
  )
}

function ShotScreen({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="absolute inset-0">
      <Image src={src} alt={alt} fill sizes="272px" className="object-cover object-top" />
    </div>
  )
}

const HomeShotScreen = () => <ShotScreen src="/app-shots/home-top.png" alt="" />
const VoucherShotScreen = () => <ShotScreen src="/app-shots/voucher-bogo.png" alt="" />

const SCREENS = [HomeShotScreen, VoucherShotScreen, CodeScreen]

/** Shared illustrative phone shell; screens render inside as absolute layers. */
export function PhoneFrame({ children, dark = false, width = 272, height = 548 }: {
  children: React.ReactNode
  dark?: boolean
  width?: number
  height?: number
}) {
  return (
    <div
      aria-hidden="true"
      className="relative rounded-[42px] p-[10px] flex-shrink-0"
      style={{
        width,
        background: 'linear-gradient(160deg, #26305C, #010C35)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 30px 80px rgba(1,12,53,0.28), inset 0 1px 0 rgba(255,255,255,0.10)',
      }}
    >
      <div className="relative rounded-[33px] overflow-hidden" style={{ height, background: '#FFF9F5' }}>
        <div
          className="absolute top-[7px] left-1/2 -translate-x-1/2 w-[74px] h-[17px] rounded-full z-10"
          style={{ background: '#010C35' }}
        />
        {children}
        <div
          className="absolute bottom-[9px] left-1/2 -translate-x-1/2 w-[86px] h-[4px] rounded-full z-10"
          style={{ background: dark ? 'rgba(255,255,255,0.35)' : 'rgba(1,12,53,0.25)' }}
        />
      </div>
    </div>
  )
}

export function PhoneDemo() {
  const reduceMotion = useReducedMotion()
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (reduceMotion || paused) return
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), CYCLE_MS)
    return () => clearInterval(t)
  }, [reduceMotion, paused])

  const Screen = SCREENS[step]

  return (
    <div
      className="flex flex-col items-center gap-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <p className="sr-only">
        Preview of the Redeemo app: browse local places and their vouchers, open a
        voucher, and show the redemption code at the venue. The places shown are
        examples, not live listings.
      </p>

      {/* Phone frame (illustrative only) */}
      <PhoneFrame dark={step === 2}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32 }}
            className="absolute inset-0"
          >
            <Screen />
          </motion.div>
        </AnimatePresence>
      </PhoneFrame>

      {/* Step controls: real, accessible, drive the scene */}
      <div className="w-full max-w-[300px]">
        <div className="flex flex-col gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => { setStep(i); setPaused(true) }}
              aria-pressed={i === step}
              className="group flex items-start gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors"
              style={{
                background: i === step ? 'rgba(1,12,53,0.05)' : 'transparent',
                border: `1px solid ${i === step ? 'rgba(1,12,53,0.10)' : 'transparent'}`,
              }}
            >
              <span
                className="mt-[3px] w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold transition-colors"
                style={{
                  background: i === step ? 'var(--brand-gradient)' : 'rgba(1,12,53,0.08)',
                  color: i === step ? '#FFFFFF' : 'rgba(1,12,53,0.55)',
                }}
              >
                {i + 1}
              </span>
              <span>
                <span
                  className="block text-[13px] font-bold leading-snug transition-colors"
                  style={{ color: i === step ? '#010C35' : 'rgba(1,12,53,0.55)' }}
                >
                  {s.label}
                </span>
                <span
                  className={i === step ? 'block text-[11.5px] mt-0.5 leading-snug' : 'sr-only'}
                  style={i === step ? { color: '#4B5563' } : undefined}
                >
                  {s.caption}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-[10px] mt-3 text-center" style={{ color: '#6B7280' }}>
          App preview · example places, not live listings
        </p>
      </div>
    </div>
  )
}
