'use client'

import Image from 'next/image'
import { BrandDeboss } from './BrandDeboss'
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

/**
 * Section 4: the Merchant Portal (owner brief 2026-07-16). Dark stage on the
 * owner-supplied glass-ticket plate; back to navy after Section 3's cream.
 *
 * The centrepiece is a LIVE-RENDERED portal shell: browser chrome, top bar
 * and sidebar are code (which guarantees an identical sidebar on every
 * screen, kills the demo pills and drops the coming-soon items by
 * construction), while each screen's CONTENT pane is a real capture cropped
 * below the top bar and right of the sidebar. The sidebar itself is the
 * switcher: six real destinations flip the pane with a soft slide, the
 * whole window tilts in perspective and follows the pointer, and screens
 * stay alive inside (the dashboard and builder panes slow-scroll, the
 * redemptions screen pops a validation toast, the bell wears its badge).
 *
 * Copy stays light: one glass blurb card narrates the active screen; the
 * locked portal facts from Section 3's former Manage group live here now.
 */

const NAVY = '#010C35'
const EASE = [0.22, 1, 0.36, 1] as const

// Shell design space: content pane captures are 1400x1020 (1728-wide portal,
// content right of the 328px sidebar, below the 64px top bar).
const SHELL = { sidebar: 300, topbar: 56, browser: 40, contentW: 1386, contentH: 1020 }
const SHELL_W = SHELL.sidebar + SHELL.contentW
const SHELL_H = SHELL.browser + SHELL.topbar + SHELL.contentH

// Live stats land on blanked capture regions (surgery 2026-07-16).
const HOME_STATS: StatSpec[] = [
  { value: 318, rect: [0.4315, 0.1961, 0.0375, 0.0275], size: 38, color: NAVY, align: 'right' },
  { value: 212, rect: [0.0577, 0.6284, 0.0562, 0.0333], size: 46, color: NAVY },
  { value: 25, rect: [0.2929, 0.6284, 0.0446, 0.0343], size: 46, color: NAVY },
  { value: 4, rect: [0.5289, 0.6284, 0.0295, 0.0333], size: 46, color: NAVY },
  { value: 'Saturday', rect: [0.7648, 0.6294, 0.1333, 0.0353], size: 40, color: NAVY },
]
const HOME_BARS: BarSpec[] = [
  { x: 0.544, w: 0.0267, bottom: 0.4755, h: 0.0627, color: '#E3E4EA' },
  { x: 0.6039, w: 0.026, bottom: 0.4755, h: 0.0696, color: '#E3E4EA' },
  { x: 0.6638, w: 0.0267, bottom: 0.4755, h: 0.0765, color: '#E3E4EA' },
  { x: 0.7237, w: 0.0267, bottom: 0.4755, h: 0.0912, color: '#E3E4EA' },
  { x: 0.7835, w: 0.0267, bottom: 0.4755, h: 0.1157, color: '#E3E4EA' },
  { x: 0.8442, w: 0.0267, bottom: 0.4755, h: 0.1461, color: '#D14021' },
  { x: 0.904, w: 0.0267, bottom: 0.4755, h: 0.0814, color: '#E3E4EA' },
]
const INSIGHT_STATS: StatSpec[] = [
  { value: 61, rect: [0.0693, 0.2608, 0.0302, 0.0265], size: 36, color: NAVY },
  { value: 41, rect: [0.3564, 0.2608, 0.0316, 0.0265], size: 36, color: NAVY },
  { value: 609, prefix: '£', rect: [0.6436, 0.2598, 0.0692, 0.0275], size: 36, color: NAVY },
]
const INSIGHT_BARS: BarSpec[] = [
  { x: 0.1176, w: 0.033, bottom: 0.6029, h: 0.0167, color: '#E6E3DB', label: '6' },
  { x: 0.2547, w: 0.033, bottom: 0.6029, h: 0.0696, color: '#E6E3DB', label: '28' },
  { x: 0.3925, w: 0.033, bottom: 0.6029, h: 0.1059, color: '#E6E3DB', label: '43' },
  { x: 0.5296, w: 0.033, bottom: 0.6029, h: 0.1343, color: '#E6E3DB', label: '55' },
  { x: 0.6667, w: 0.033, bottom: 0.6029, h: 0.1324, color: '#E6E3DB', label: '54' },
  { x: 0.8045, w: 0.033, bottom: 0.6029, h: 0.148, color: '#D1401F', label: '61' },
]

// The builder FORM column (right rail removed: it renders as the live
// sticky panels beside it, like the real builder).
const FORM_STRIP = { width: 726, height: 2169 }

type Screen = {
  key: string
  nav: string
  title: string
  body: string
}

const SCREENS: Screen[] = [
  {
    key: 'home',
    nav: 'Home',
    title: 'The day at a glance.',
    body: 'Redemptions over time, customers brought in, live vouchers and what needs your attention: the state of play from the second you log in.',
  },
  {
    key: 'vouchers',
    nav: 'Vouchers',
    title: 'Create and manage every offer.',
    body: "The guided builder walks you from voucher type to terms, with the 'How this voucher stacks up' check before anything is submitted.",
  },
  {
    key: 'redemptions',
    nav: 'Redemptions',
    title: 'Every code, verified and logged.',
    body: 'Validate at the till or later, filter by branch, voucher or date, and export your records whenever you need them.',
  },
  {
    key: 'insights',
    nav: 'Insights & reports',
    title: 'Decisions from real activity.',
    body: 'Busiest days, top vouchers and customer patterns, drawn from confirmed redemptions rather than clicks.',
  },
  {
    key: 'branches',
    nav: 'Branches',
    title: 'Every location, one account.',
    body: 'Hours, amenities, photos and branch PINs in one place, with instant updates and main-branch control.',
  },
  {
    key: 'staff',
    nav: 'Staff & access',
    title: 'The right access for every role.',
    body: 'Portal access for managers, app validation for the team at the till: you decide who can do what, and where.',
  },
]

const REASSURANCE = ['Included free with your listing', 'Nothing to install', 'One login, every branch', 'Staff roles built in']

// ── Sidebar (live-rendered: identical on every screen, no demo, no SOON) ─────

const NAV_GROUPS: Array<{ label: string | null; items: Array<{ key: string | null; nav: string; icon: string }> }> = [
  { label: null, items: [{ key: 'home', nav: 'Home', icon: 'home' }] },
  {
    label: 'Vouchers & customers',
    items: [
      { key: 'vouchers', nav: 'Vouchers', icon: 'ticket' },
      { key: 'redemptions', nav: 'Redemptions', icon: 'scan' },
      { key: 'insights', nav: 'Insights & reports', icon: 'chart' },
    ],
  },
  {
    label: 'Locations & team',
    items: [
      { key: 'branches', nav: 'Branches', icon: 'pin' },
      { key: 'staff', nav: 'Staff & access', icon: 'people' },
    ],
  },
  {
    label: 'Business',
    items: [{ key: null, nav: 'Business profile', icon: 'shop' }],
  },
]

function NavIcon({ kind }: { kind: string }) {
  const p = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (kind) {
    case 'home':
      return (
        <svg {...p}>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5.5 9v11h13V9" />
        </svg>
      )
    case 'ticket':
      return (
        <svg {...p}>
          <path d="M3.5 8a2.5 2.5 0 0 0 0 8V19h17v-3a2.5 2.5 0 0 1 0-8V5h-17v3z" transform="scale(0.92) translate(1 1)" />
          <line x1="14.5" y1="6" x2="14.5" y2="18" strokeDasharray="2 3" />
        </svg>
      )
    case 'scan':
      return (
        <svg {...p}>
          <path d="M4 8V5a1 1 0 0 1 1-1h3" />
          <path d="M16 4h3a1 1 0 0 1 1 1v3" />
          <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
          <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
          <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
      )
    case 'chart':
      return (
        <svg {...p}>
          <line x1="5" y1="20" x2="5" y2="12" />
          <line x1="12" y1="20" x2="12" y2="6" />
          <line x1="19" y1="20" x2="19" y2="15" />
        </svg>
      )
    case 'pin':
      return (
        <svg {...p}>
          <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.4" />
        </svg>
      )
    case 'people':
      return (
        <svg {...p}>
          <circle cx="9" cy="8.5" r="3" />
          <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <path d="M16 9a2.5 2.5 0 1 1 2 4" />
          <path d="M17.5 14.5c2 .6 3 2.2 3 4" />
        </svg>
      )
    default:
      return (
        <svg {...p}>
          <path d="M4 9l1.5-4h13L20 9" />
          <path d="M5 9v10h14V9" />
          <path d="M9.5 19v-5h5v5" />
        </svg>
      )
  }
}

function ShellSidebar({ active, onPick, navRefs }: { active: string; onPick: (k: string) => void; navRefs?: React.MutableRefObject<Record<string, HTMLButtonElement | null>> }) {
  return (
    <div className="flex h-full flex-col border-r bg-white" style={{ borderColor: '#EEE9E2', width: SHELL.sidebar }}>
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-6 pb-4 pt-6">
        <Image src="/logo-icon.svg" alt="" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
        <div className="leading-none">
          <p className="text-[17px] font-bold" style={{ color: NAVY }}>
            Redeemo
          </p>
          <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(1,12,53,0.45)' }}>
            For business
          </p>
        </div>
      </div>
      {/* Status */}
      <div className="mx-5 mb-4 rounded-xl px-4 py-2.5" style={{ background: 'rgba(22,163,74,0.09)' }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'rgba(1,12,53,0.45)' }}>
          Business status
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[15px] font-bold" style={{ color: NAVY }}>
          <span className="h-2 w-2 rounded-full bg-[#16A34A]" aria-hidden="true" />
          Live
        </p>
      </div>
      {/* Nav */}
      <div className="flex-1 overflow-hidden px-3.5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label ?? 'top'} className="mb-1.5">
            {group.label ? (
              <p className="px-2.5 pb-2 pt-4 text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(1,12,53,0.38)' }}>
                {group.label}
              </p>
            ) : null}
            {group.items.map((item) => {
              const isActive = item.key === active
              const clickable = item.key !== null
              return (
                <button
                  key={item.nav}
                  ref={
                    clickable && navRefs
                      ? (el) => {
                          navRefs.current[item.key as string] = el
                        }
                      : undefined
                  }
                  onClick={clickable ? () => onPick(item.key as string) : undefined}
                  disabled={!clickable}
                  aria-pressed={clickable ? isActive : undefined}
                  className="group/nav relative mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15.5px] font-semibold transition-colors"
                  style={{
                    color: isActive ? NAVY : clickable ? 'rgba(1,12,53,0.62)' : 'rgba(1,12,53,0.34)',
                    background: isActive ? 'rgba(226,12,4,0.07)' : 'transparent',
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                >
                  {isActive ? <span className="absolute -left-1 bottom-2 top-2 w-[3px] rounded-full" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true" /> : null}
                  <span style={{ color: isActive ? '#E20C04' : 'inherit' }}>
                    <NavIcon kind={item.icon} />
                  </span>
                  {item.nav}
                  {clickable && !isActive ? (
                    <svg
                      className="ml-auto opacity-30 transition-all duration-200 group-hover/nav:translate-x-0.5 group-hover/nav:opacity-70"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  ) : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {/* Foot */}
      <div className="border-t px-6 py-4 text-[13.5px] font-semibold" style={{ borderColor: '#EEE9E2', color: 'rgba(1,12,53,0.45)' }}>
        <p className="mb-1.5">My account</p>
        <p>Help &amp; support</p>
      </div>
    </div>
  )
}

// ── Screens: real content panes, alive inside ─────────────────────────────────

function PaneImage({ src, active, kenburns = false }: { src: string; active: boolean; kenburns?: boolean }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      animate={kenburns && active && !reduceMotion ? { scale: [1, 1.018, 1] } : { scale: 1 }}
      transition={kenburns ? { duration: 16, repeat: Infinity, ease: 'easeInOut' } : undefined}
      style={{ background: '#F8F7F4' }}
    >
      <Image src={src} alt="" fill sizes="1000px" className="object-cover object-top" />
    </motion.div>
  )
}

/** Pointer-scrubbed strip: hovering the window glides the page through the
 *  capture (owner: autonomous auto-scroll read as odd; this puts the motion
 *  under the visitor's hand). */
function PaneStrip({
  src,
  stripW,
  stripH,
  boxW,
  boxH,
  offsetTop = 0,
  left,
  scrub,
}: {
  src: string
  stripW: number
  stripH: number
  boxW: number
  boxH: number
  offsetTop?: number
  left?: number
  scrub: MotionValue<number>
}) {
  const travel = Math.max(0, stripH - (boxH - offsetTop))
  const y = useTransform(scrub, [0, 1], [0, -travel])
  return (
    <div className="absolute overflow-hidden" style={{ left: left ?? (SHELL.contentW - boxW) / 2, top: offsetTop, width: boxW, height: boxH - offsetTop }}>
      <motion.div className="absolute left-0 top-0" style={{ width: stripW, height: stripH, y }}>
        <Image src={src} alt="" fill sizes="1000px" className="object-cover object-top" />
      </motion.div>
    </div>
  )
}

// ── Live stats: count-ups and rising bars over blanked capture regions ──────
// (the baked values are blanked out of the pane assets; these land on the
// real numbers, landing-savings style)

type StatSpec = { value: number | string; prefix?: string; rect: [number, number, number, number]; size: number; color: string; align?: 'left' | 'center' | 'right'; weight?: number }
type BarSpec = { x: number; w: number; bottom: number; h: number; color: string; label?: string }

function CountUpStat({ spec, active }: { spec: StatSpec; active: boolean }) {
  const reduceMotion = useReducedMotion()
  const numeric = typeof spec.value === 'number'
  const [display, setDisplay] = useState<string>(numeric ? '0' : '')
  useEffect(() => {
    if (!active) {
      setDisplay(numeric ? '0' : '')
      return
    }
    if (!numeric || reduceMotion) {
      setDisplay(String(spec.value))
      return
    }
    const target = spec.value as number
    const t0 = performance.now()
    const dur = 1100
    let raf = 0
    const tick = (t: number) => {
      const f = Math.min(1, (t - t0) / dur)
      const eased = 1 - Math.pow(1 - f, 3)
      setDisplay(String(Math.round(target * eased)))
      if (f < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, numeric, reduceMotion, spec.value])
  const [x, y, w, h] = spec.rect
  return (
    <motion.span
      initial={false}
      animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: numeric ? 0 : 8 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="absolute flex items-center"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        justifyContent: spec.align === 'right' ? 'flex-end' : spec.align === 'center' ? 'center' : 'flex-start',
        fontSize: spec.size,
        fontWeight: spec.weight ?? 700,
        color: spec.color,
        fontFamily: 'var(--font-display, inherit)',
        letterSpacing: '-0.5px',
        lineHeight: 1,
      }}
      aria-hidden="true"
    >
      {spec.prefix ?? ''}
      {display}
    </motion.span>
  )
}

function RiseBar({ bar, index, active }: { bar: BarSpec; index: number; active: boolean }) {
  const reduceMotion = useReducedMotion()
  return (
    <>
      <motion.span
        initial={false}
        animate={active ? { scaleY: 1 } : { scaleY: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.6, delay: active && !reduceMotion ? 0.15 + index * 0.07 : 0, ease: EASE }}
        className="absolute origin-bottom rounded-t-[3px]"
        style={{
          left: `${bar.x * 100}%`,
          width: `${bar.w * 100}%`,
          bottom: `${(1 - bar.bottom) * 100}%`,
          height: `${bar.h * 100}%`,
          background: bar.color,
        }}
        aria-hidden="true"
      />
      {bar.label ? (
        <motion.span
          initial={false}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, delay: active && !reduceMotion ? 0.45 + index * 0.07 : 0, ease: EASE }}
          className="absolute flex justify-center font-semibold"
          style={{
            left: `${(bar.x - 0.01) * 100}%`,
            width: `${(bar.w + 0.02) * 100}%`,
            bottom: `${(1 - bar.bottom + bar.h) * 100 + 0.6}%`,
            fontSize: 13,
            color: '#9AA0B0',
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          {bar.label}
        </motion.span>
      ) : null}
    </>
  )
}

function StatsLayer({ stats, bars, active }: { stats: StatSpec[]; bars: BarSpec[]; active: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {stats.map((spec, i) => (
        <CountUpStat key={i} spec={spec} active={active} />
      ))}
      {bars.map((bar, i) => (
        <RiseBar key={i} bar={bar} index={i} active={active} />
      ))}
    </div>
  )
}

/** The redemptions screen pops a validation toast every few seconds. */
function ValidationToast({ active }: { active: boolean }) {
  const [shown, setShown] = useState(false)
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    if (!active || reduceMotion) return
    setShown(true)
    let inner: ReturnType<typeof setTimeout> | null = null
    const id = setInterval(() => {
      setShown(false)
      inner = setTimeout(() => setShown(true), 900)
    }, 5600)
    return () => {
      clearInterval(id)
      if (inner) clearTimeout(inner)
    }
  }, [active, reduceMotion])
  return (
    <motion.div
      initial={false}
      animate={shown ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 18, scale: 0.97 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="absolute bottom-8 right-8 flex items-center gap-3 rounded-2xl bg-white px-5 py-4"
      style={{ boxShadow: '0 18px 44px rgba(1,12,53,0.22)' }}
      aria-hidden="true"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(22,163,74,0.12)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span>
        <span className="block text-[15px] font-bold leading-tight" style={{ color: NAVY }}>
          Code validated
        </span>
        <span className="block text-[12.5px]" style={{ color: '#6B7280' }}>
          Buy one main, get one free · High Street
        </span>
      </span>
    </motion.div>
  )
}

// ── The portal window ─────────────────────────────────────────────────────────

function PortalWindow({ active, onPick, scrub, navRefs }: { active: string; onPick: (k: string) => void; scrub: MotionValue<number>; navRefs?: React.MutableRefObject<Record<string, HTMLButtonElement | null>> }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-white" style={{ width: SHELL_W, height: SHELL_H, boxShadow: '0 60px 140px rgba(0,4,20,0.55), 0 0 0 1px rgba(255,255,255,0.09)' }}>
      {/* Browser chrome */}
      <div className="flex items-center gap-3 border-b px-5" style={{ height: SHELL.browser, borderColor: '#EEE9E2', background: '#FBFAF8' }}>
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
          <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
          <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        </span>
        <span className="mx-auto flex items-center gap-2 rounded-full border px-5 py-1 text-[13px] font-semibold" style={{ borderColor: '#EEE9E2', color: 'rgba(1,12,53,0.55)', background: '#fff' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Redeemo Merchant Portal
        </span>
        <span className="w-[52px]" aria-hidden="true" />
      </div>

      <div className="flex" style={{ height: SHELL.topbar + SHELL.contentH }}>
        <ShellSidebar active={active} onPick={onPick} navRefs={navRefs} />

        <div className="relative flex-1">
          {/* App top bar */}
          <div className="flex items-center justify-end gap-3 border-b px-6" style={{ height: SHELL.topbar, borderColor: '#EEE9E2', background: '#FFFFFF' }}>
            <span className="flex items-center gap-2 rounded-full px-4.5 py-2 text-[13.5px] font-bold text-white" style={{ background: NAVY }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 8V5a1 1 0 0 1 1-1h3" />
                <path d="M16 4h3a1 1 0 0 1 1 1v3" />
                <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
                <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
              Validate a code
            </span>
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full border" style={{ borderColor: '#EEE9E2', color: 'rgba(1,12,53,0.6)' }} aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                <path d="M10.3 20a2 2 0 0 0 3.4 0" />
              </svg>
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 animate-pulse items-center justify-center rounded-full text-[8.5px] font-bold text-white" style={{ background: '#E20C04' }}>
                4
              </span>
            </span>
            <span className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-bold" style={{ borderColor: '#EEE9E2', color: '#E20C04' }} aria-hidden="true">
              OF
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>

          {/* Content pane: screens crossfade with a soft slide */}
          <div className="relative" style={{ width: SHELL.contentW, height: SHELL.contentH }}>
            {SCREENS.map((screen) => {
              const isActive = screen.key === active
              return (
                <motion.div
                  key={screen.key}
                  initial={false}
                  animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: 26 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="absolute inset-0"
                  style={{ pointerEvents: 'none' }}
                  aria-hidden={!isActive}
                >
                  {screen.key === 'home' ? (
                    <>
                      <PaneImage src="/for-businesses/portal/pane-home.webp" active={isActive} />
                      <StatsLayer stats={HOME_STATS} bars={HOME_BARS} active={isActive} />
                      {/* The capture's baked June date is covered with a July
                          chip (owner ruling: the dashboard must not
                          contradict the July redemption records) */}
                      <div
                        className="absolute flex items-center justify-center gap-1.5 bg-white"
                        style={{
                          left: '79.8%',
                          top: '4.6%',
                          width: '17.5%',
                          height: '5.8%',
                          borderRadius: 8,
                          border: '1px solid #E9ECF2',
                          boxShadow: '0 1px 3px rgba(16,24,40,0.05)',
                        }}
                        aria-hidden="true"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span className="whitespace-nowrap font-semibold" style={{ fontSize: 15, color: '#28324E' }}>
                          Tuesday, 7 July 2026
                        </span>
                      </div>
                    </>
                  ) : null}
                  {screen.key === 'vouchers' ? (
                    <div className="absolute inset-0" style={{ background: '#F8F7F4' }}>
                      {/* Form column glides under the pointer... */}
                      <PaneStrip
                        src="/for-businesses/portal/builder-form-strip.webp"
                        stripW={FORM_STRIP.width}
                        stripH={FORM_STRIP.height}
                        boxW={FORM_STRIP.width}
                        boxH={SHELL.contentH}
                        left={26}
                        scrub={scrub}
                      />
                      {/* ...while the stacks-up check and the customer preview
                          stay STICKY, exactly like the real builder */}
                      <div className="absolute" style={{ left: 782, top: 24, width: 580 }}>
                        <div className="relative w-full overflow-hidden rounded-xl" style={{ boxShadow: '0 10px 30px rgba(1,12,53,0.07)' }}>
                          <Image src="/for-businesses/portal/panel-stacksup.webp" alt="" width={1236} height={982} className="h-auto w-full" />
                        </div>
                        <div className="relative mt-4 w-[400px] overflow-hidden rounded-xl" style={{ height: 480, boxShadow: '0 10px 30px rgba(1,12,53,0.07)' }}>
                          <Image src="/for-businesses/portal/panel-preview.webp" alt="" width={1104} height={1801} className="h-auto w-full" />
                          <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: 'linear-gradient(transparent, #F8F7F4)' }} aria-hidden="true" />
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {screen.key === 'redemptions' ? (
                    <>
                      <PaneImage src="/for-businesses/portal/pane-redemptions.webp" active={isActive} kenburns />
                      <ValidationToast active={isActive} />
                    </>
                  ) : null}
                  {screen.key === 'insights' ? (
                    <>
                      <PaneImage src="/for-businesses/portal/pane-insight.webp" active={isActive} />
                      <StatsLayer stats={INSIGHT_STATS} bars={INSIGHT_BARS} active={isActive} />
                    </>
                  ) : null}
                  {screen.key === 'branches' ? <PaneImage src="/for-businesses/portal/pane-branches.webp" active={isActive} kenburns /> : null}
                  {screen.key === 'staff' ? <PaneImage src="/for-businesses/portal/pane-staff.webp" active={isActive} kenburns /> : null}
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── The section ───────────────────────────────────────────────────────────────

// Each screen owns this much page scroll while the tour is pinned.
const TOUR_STEP_SVH = 46

export function PortalSection() {
  const [active, setActive] = useState('home')
  const reduceMotion = useReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  const tourRef = useRef<HTMLDivElement>(null)

  // The pinned tour: page scroll steps through the six screens, so nobody
  // needs to discover the sidebar to see them all. A sidebar click takes
  // over until the visitor scrolls to a different step, then scroll resumes.
  const { scrollYProgress: tourP } = useScroll({ target: tourRef, offset: ['start start', 'end end'] })
  const manualHold = useRef<number | null>(null)
  useMotionValueEvent(tourP, 'change', (v) => {
    const idx = Math.min(SCREENS.length - 1, Math.max(0, Math.floor(v * SCREENS.length)))
    if (manualHold.current !== null) {
      if (manualHold.current === idx) return
      manualHold.current = null
    }
    const key = SCREENS[idx].key
    setActive((prev) => (prev === key ? prev : key))
  })
  const pick = (k: string) => {
    const v = tourP.get()
    manualHold.current = Math.min(SCREENS.length - 1, Math.max(0, Math.floor(v * SCREENS.length)))
    setActive(k)
  }
  const windowWrapRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const navRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [scale, setScale] = useState(0.56)
  const [link, setLink] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  useEffect(() => {
    const el = windowWrapRef.current
    if (!el) return
    const measure = () => setScale(Math.min(1, el.clientWidth / SHELL_W, (window.innerHeight - 370) / SHELL_H))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // The red thread: connect the narrator card to the active sidebar item so
  // nobody misses that the sidebar is clickable. Measured in stage space.
  useEffect(() => {
    const measureLink = () => {
      const stage = stageRef.current
      const card = cardRef.current
      const btn = navRefs.current[active]
      if (!stage || !card || !btn) return
      const sr = stage.getBoundingClientRect()
      const cr = card.getBoundingClientRect()
      const br = btn.getBoundingClientRect()
      setLink({
        x1: cr.right - sr.left,
        y1: cr.top - sr.top + cr.height / 2,
        x2: br.left - sr.left + 4 * (br.width / 240),
        y2: br.top - sr.top + br.height / 2,
      })
    }
    measureLink()
    const ro = new ResizeObserver(measureLink)
    if (stageRef.current) ro.observe(stageRef.current)
    window.addEventListener('scroll', measureLink, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', measureLink)
    }
  }, [active, scale])

  // Hover-scrub: the pointer's height over the window glides the scrolling
  // panes (home dashboard, voucher builder) through their pages.
  const scrubRaw = useMotionValue(0)
  const scrub = useSpring(scrubRaw, { stiffness: 60, damping: 22 })
  const onWindowPointer = (e: React.PointerEvent) => {
    if (reduceMotion) return
    const el = windowWrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const f = (e.clientY - r.top) / r.height
    scrubRaw.set(Math.max(0, Math.min(1, (f - 0.15) / 0.7)))
  }

  const current = SCREENS.find((s) => s.key === active) ?? SCREENS[0]

  return (
    <section className="relative overflow-x-clip" style={{ background: NAVY }}>
      <div className="relative mx-auto max-w-7xl px-6 pb-24 pt-20 md:pb-28 lg:px-10 lg:pb-40 lg:pt-0">
        {/* Header (mobile/tablet: the desktop pin carries its own compact twin) */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55, ease: EASE }}
          className="max-w-[720px] lg:hidden"
        >
          <p className="mb-4 flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.22em] text-white/45">
            <span className="h-[2px] w-6 bg-[#E20C04]" aria-hidden="true" />
            The merchant portal
          </p>
          <h2 className="font-display mb-4 leading-[1.08] text-white" style={{ fontSize: 'clamp(30px, 3.6vw, 46px)', letterSpacing: '-0.6px' }}>
            One place to <span className="gradient-text">manage it&nbsp;all.</span>
          </h2>
          <p className="max-w-[620px] text-[15.5px] leading-[1.65] text-white/60">
            Your control room on Redeemo: shape what customers see, give your team the right access, and watch real results come back.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {REASSURANCE.map((r) => (
              <span key={r} className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] font-semibold text-white/75 backdrop-blur-sm">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {r}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Stage: pinned tour; scroll steps the screens, clicks still work */}
        <div ref={tourRef} className="hidden lg:block" style={{ height: `calc(100svh + ${SCREENS.length * TOUR_STEP_SVH}svh)` }}>
        <div className="sticky top-0 flex h-[100svh] flex-col justify-center pt-[88px]">
        {/* Backdrop: the hero's night street carried through, blurred deep
            into navy so its texture and neon reds glow through as ambience.
            Heavy blur is what makes an image safe here (the sharp plates
            banded at large sizes); the tint must end on solid #010C35 so the
            handoff to the ticket band below stays seamless. */}
        <div aria-hidden="true" className="absolute -z-10 overflow-hidden" style={{ inset: '-2px -100vw', background: '#010C35' }}>
          <div className="absolute left-1/2 top-0 h-full w-[100vw] -translate-x-1/2">
            <Image
              src="/for-businesses/portal/portal-bg-2.webp"
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              style={{
                filter: 'blur(10px) saturate(1.15)',
                transform: 'scale(1.08)',
              }}
            />
            {/* Navy pull-down; solid at the base for the seam */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(1,12,53,0.6) 0%, rgba(1,12,53,0.8) 52%, #010C35 100%)' }} />
          </div>
          {/* Neon accents riding over the texture */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(1100px 640px at 76% -8%, rgba(226,12,4,0.2), transparent 62%), radial-gradient(520px 380px at 12% 20%, rgba(255,64,40,0.13), transparent 68%), radial-gradient(700px 480px at 90% 78%, rgba(232,74,0,0.1), transparent 66%), radial-gradient(900px 620px at 8% 42%, rgba(70,100,200,0.08), transparent 66%)',
            }}
          />
          {/* Film grain unifies the surface */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='280'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='280' height='280' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
              backgroundSize: '280px 280px',
              opacity: 0.05,
              mixBlendMode: 'overlay',
            }}
          />
        </div>
        {/* Whisper-level brand marks pressed into the stage */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <BrandDeboss tone="navy" size={560} rotate={12} style={{ right: '-4%', top: '3%' }} />
          <BrandDeboss tone="navy" size={300} rotate={-10} style={{ left: '1.5%', bottom: '4%' }} />
        </div>
        {/* Compact header shares the pinned screen */}
        <div className="mb-9">
          <p className="mb-3 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">
            <span className="h-[2px] w-6 bg-[#E20C04]" aria-hidden="true" />
            The merchant portal
          </p>
          <h2 className="font-display mb-3 leading-[1.08] text-white" style={{ fontSize: 'clamp(28px, 3vw, 40px)', letterSpacing: '-0.5px' }}>
            One place to <span className="gradient-text">manage it&nbsp;all.</span>
          </h2>
          <p className="mb-5 max-w-[600px] text-[14.5px] leading-[1.6] text-white/60">
            Your control room on Redeemo: shape what customers see, give your team the right access, and watch real results come back.
          </p>
          <div className="flex flex-wrap gap-2.5">
            {REASSURANCE.map((r) => (
              <span key={r} className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-[12px] font-semibold text-white/75">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {r}
              </span>
            ))}
          </div>
        </div>
        <div ref={stageRef} className="relative flex w-full items-center gap-9">
          {/* The red thread from the card to the active sidebar item */}
          {link ? (
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible">
              <defs>
                <linearGradient id="portal-link" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#E20C04" stopOpacity="0.25" />
                  <stop offset="1" stopColor="#FF6B3D" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <motion.path
                initial={false}
                animate={{ d: `M ${link.x1} ${link.y1} C ${link.x1 + 56} ${link.y1}, ${link.x2 - 72} ${link.y2}, ${link.x2} ${link.y2}` }}
                transition={{ type: 'spring', stiffness: 170, damping: 26 }}
                stroke="url(#portal-link)"
                strokeWidth="2"
                fill="none"
                style={{ filter: 'drop-shadow(0 0 6px rgba(226,12,4,0.45))' }}
              />
              <motion.circle
                initial={false}
                animate={{ cx: link.x2, cy: link.y2 }}
                transition={{ type: 'spring', stiffness: 170, damping: 26 }}
                r="3.5"
                fill="#FF6B3D"
                style={{ filter: 'drop-shadow(0 0 6px rgba(226,12,4,0.8))' }}
              />
              <circle cx={link.x1} cy={link.y1} r="3" fill="rgba(255,107,61,0.7)" />
            </svg>
          ) : null}

          {/* Active-screen blurb */}
          <div className="relative w-[300px] flex-shrink-0">
            <div ref={cardRef} className="rounded-2xl border border-white/10 bg-[#081130]/70 p-6 backdrop-blur-md" style={{ boxShadow: '0 24px 60px rgba(0,4,20,0.45)' }}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{current.nav}</p>
              <div className="relative min-h-[170px]">
                {SCREENS.map((screen) => (
                  <motion.div
                    key={screen.key}
                    initial={false}
                    animate={screen.key === active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    className="absolute inset-0"
                    aria-hidden={screen.key !== active}
                  >
                    <h3 className="font-display mb-2.5 text-[21px] leading-snug text-white" style={{ letterSpacing: '-0.2px' }}>
                      {screen.title}
                    </h3>
                    <p className="text-[14px] leading-[1.7] text-white/60">{screen.body}</p>
                  </motion.div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
                {SCREENS.map((screen) => (
                  <span key={screen.key} className="h-1.5 rounded-full transition-all duration-300" style={{ width: screen.key === active ? 22 : 8, background: screen.key === active ? 'var(--brand-gradient)' : 'rgba(255,255,255,0.18)' }} />
                ))}
              </div>
            </div>
            <p className="mt-4 px-1 text-[12px] leading-relaxed text-white/35">Click through the sidebar to explore the real portal. Example data, not live listings.</p>
          </div>

          {/* The window: straight-on, seated on light */}
          <motion.div
            initial={{ opacity: 0, y: 44, scale: 0.965 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, ease: EASE }}
            className="relative min-w-0 flex-1"
          >
            <div ref={windowWrapRef} onPointerMove={onWindowPointer} className="relative">
              <div
                style={{
                  width: SHELL_W * scale,
                  height: SHELL_H * scale,
                  WebkitBoxReflect: 'below 16px linear-gradient(transparent 74%, rgba(255,255,255,0.09))',
                }}
              >
                <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: SHELL_W, height: SHELL_H }}>
                  <PortalWindow active={active} onPick={pick} scrub={scrub} navRefs={navRefs} />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
        </div>
        </div>

        {/* Mobile / tablet: pill switcher + content-pane window */}
        <div className="mt-10 lg:hidden">
          <div className="favour-rail -mx-2 flex gap-2 overflow-x-auto px-2 pb-3" style={{ scrollbarWidth: 'none' }} role="group" aria-label="Portal screens">
            {SCREENS.map((screen) => {
              const isActive = screen.key === active
              return (
                <button
                  key={screen.key}
                  aria-pressed={isActive}
                  onClick={() => setActive(screen.key)}
                  className="flex-shrink-0 rounded-full border px-3.5 py-2 text-[12.5px] font-bold transition-colors"
                  style={{
                    borderColor: isActive ? 'transparent' : 'rgba(255,255,255,0.16)',
                    background: isActive ? 'var(--brand-gradient)' : 'rgba(255,255,255,0.05)',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                  }}
                >
                  {screen.nav}
                </button>
              )
            })}
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/10" style={{ aspectRatio: '1400 / 1020', boxShadow: '0 30px 70px rgba(0,4,20,0.5)' }}>
            {SCREENS.map((screen) => {
              const isActive = screen.key === active
              const src =
                screen.key === 'home'
                  ? '/for-businesses/portal/pane-home.webp'
                  : screen.key === 'vouchers'
                  ? '/for-businesses/journey/journey-builder.webp'
                  : `/for-businesses/portal/pane-${screen.key === 'insights' ? 'insight' : screen.key}.webp`
              return (
                <motion.div key={screen.key} initial={false} animate={isActive ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: 0.4 }} className="absolute inset-0" aria-hidden={!isActive}>
                  <Image src={src} alt="" fill sizes="100vw" className="object-cover object-top" />
                </motion.div>
              )
            })}
          </div>
          <div className="mt-5">
            <h3 className="font-display mb-2 text-[20px] leading-snug text-white" style={{ letterSpacing: '-0.2px' }}>
              {current.title}
            </h3>
            <p className="text-[14px] leading-[1.7] text-white/60">{current.body}</p>
            <p className="mt-3 text-[11.5px] text-white/35">Example data, not live listings.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
