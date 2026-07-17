'use client'

import { motion, useMotionValue, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { BrandStop } from '@/components/ui/BrandStop'
import { Motif } from '@/components/landing/VoucherTypesRail'
import { useScrollLinked } from '@/components/landing/scroll'
import { useViewportMode } from '@/components/landing/useViewportMode'

/**
 * Section 3: "Everything in your favour" (owner copy locked 2026-07-16 after
 * the seven-sweep edit; keeps the paying-members line in 01 and the honest
 * paid-featured disclosure in 07).
 *
 * The section leaves the cinema's navy for the brand cream and gives each of
 * the four locked groups its OWN treatment so nothing repeats:
 *   A  Grow your local presence      spotlight bento: four cards, each with
 *                                    a living micro-visual (radar, profile,
 *                                    footfall, return loop)
 *   B  Marketing built around you    an interactive console: vertical tabs
 *                                    driving a visual panel (voucher-type
 *                                    chips, quiet-hours calendar, featured
 *                                    card, busiest-days chart)
 *   C  Seven ways to bring them in   a rail of die-cut voucher tickets in
 *                                    the app's type colours with the landing
 *                                    rail's motifs (owner 2026-07-16: the
 *                                    portal group moved out to become its
 *                                    own Section 4)
 *   D  A model that protects margin  a navy till receipt that prints its
 *                                    zeros, beside the four money items
 *
 * Everything is in-flow (no pinning: the page stays a sane length); motion
 * is whileInView reveals plus the interactive systems above. No WebGL here:
 * the page already carries one canvas and the light theme wants calm.
 */

const EASE = [0.22, 1, 0.36, 1] as const
const NAVY = '#010C35'
const CREAM = '#FFF9F5'
const INK = '#4B5563'

// ── Locked copy ───────────────────────────────────────────────────────────────

const EYEBROW = 'WHY BUSINESSES CHOOSE REDEEMO'
const INTRO =
  'More local visibility. More reasons for customers to visit. More control over what you offer, and no platform fees taking a cut.'

type Item = { num: string; title: string; lead: string; body: string; chips?: string[] }

const GROW: Item[] = [
  {
    num: '01',
    title: 'Targeted local marketing',
    lead: 'Reach customers already looking nearby.',
    body: 'Geolocation, interests and what customers explore nearby all shape who sees you. And they pay to be members: people who have already decided to go out and spend.',
  },
  {
    num: '02',
    title: 'Brand awareness through a complete business profile',
    lead: 'A profile that sells the visit, not just a listing.',
    body: 'Customers see who you are and why to choose you before they arrive.',
    chips: ['Photos', 'Opening hours', 'Directions', 'Amenities', 'Live vouchers', 'Verified reviews'],
  },
  {
    num: '03',
    title: 'Higher footfall',
    lead: 'From seen to standing at your counter.',
    body: 'A compelling voucher turns being noticed into a visit, an order and a first-hand experience of your business.',
  },
  {
    num: '04',
    title: 'Customer retention',
    lead: 'First visits become regulars.',
    body: 'Fresh, seasonal and reusable vouchers keep you relevant and give customers reasons to come back.',
  },
]

const MARKETING: Item[] = [
  {
    num: '05',
    title: 'Tactical marketing initiatives',
    lead: 'Promote what matters, when it matters.',
    body: 'A launch, an event, seasonal demand: seven voucher types, with your value, your terms and your timing.',
  },
  {
    num: '06',
    title: 'Targeted campaigns for quieter periods',
    lead: 'Every business has a quiet Tuesday.',
    body: 'Set the exact days and hours a voucher can be redeemed, and point demand at the gaps.',
  },
  {
    num: '07',
    title: 'Digital marketing and featured exposure',
    lead: "Redeemo's marketing works for you too.",
    body: 'Our campaigns bring customers toward businesses near them. Want more reach? Optional paid featured placement puts you in front of more of them.',
  },
  {
    num: '08',
    title: 'Customer base insights',
    lead: 'Decide on real activity, not guesswork.',
    body: 'Confirmed redemptions by voucher, date and branch, your busiest days, exportable any time.',
  },
]

// The seven voucher types, in the app's own colours, with the landing rail's
// bespoke motifs. Merchant-lens copy: what each type is FOR, with a generic
// example that translates across business types.
type VoucherKind = { key: string; name: string; tag: string; body: string; accent: string; accentBg: string }

const VOUCHER_KINDS: VoucherKind[] = [
  {
    key: 'bogo',
    name: 'Buy one get one free',
    tag: 'Two through the door',
    body: 'A free second brings pairs through the door. Perfect for introducing what you want more customers to try.',
    accent: '#7C3AED',
    accentBg: 'rgba(124,58,237,0.1)',
  },
  {
    key: 'discount',
    name: 'Discount',
    tag: 'You choose the number',
    body: 'A clean saving everyone understands instantly: a percentage off or a set amount off, your call.',
    accent: '#E20C04',
    accentBg: 'rgba(226,12,4,0.1)',
  },
  {
    key: 'time',
    name: 'Time-limited',
    tag: 'You set the window',
    body: 'Runs only in the window you set: days, dates and hours. Outside it, customers see it as unavailable to redeem.',
    accent: '#D97706',
    accentBg: 'rgba(217,119,6,0.1)',
  },
  {
    key: 'freebie',
    name: 'Freebie',
    tag: 'On the house',
    body: 'A small free extra that makes trying you effortless, and shows off what you do best.',
    accent: '#16A34A',
    accentBg: 'rgba(22,163,74,0.1)',
  },
  {
    key: 'spend',
    name: 'Spend & save',
    tag: 'Nudges the basket up',
    body: 'Rewards a bigger basket: the order goes up and the customer still feels the win.',
    accent: '#E84A00',
    accentBg: 'rgba(232,74,0,0.1)',
  },
  {
    key: 'package',
    name: 'Package deal',
    tag: 'Bundled as one',
    body: 'Bundle what goes together at one price. Easier to say yes to, and it showcases your range.',
    accent: '#2563EB',
    accentBg: 'rgba(37,99,235,0.1)',
  },
  {
    key: 'reusable',
    name: 'Reusable',
    tag: 'It keeps coming back',
    body: 'The same customer can use it again after the gap you set: hourly, every few hours, daily or your own interval. Built for regulars.',
    accent: '#0D9488',
    accentBg: 'rgba(13,148,136,0.1)',
  },
]

const MARGIN: Item[] = [
  {
    num: '09',
    title: 'Free business listing',
    lead: '£0 to list. £0 monthly.',
    body: 'Your profile and the full merchant portal, with no hidden platform fees later.',
  },
  {
    num: '10',
    title: 'No commission. No redemption fee.',
    lead: 'Your saving reaches your customer in full.',
    body: 'Redeemo never takes a percentage when a voucher is used.',
  },
  {
    num: '11',
    title: 'Value tied to a real customer visit',
    lead: 'Never pay for views or clicks.',
    body: 'The voucher saving only comes into play when a customer is standing in your business.',
  },
  {
    num: '12',
    title: 'Customer acquisition with built-in limits',
    lead: 'Generous, never open-ended.',
    body: 'Once per customer per monthly cycle for standard vouchers, your frequency for reusable ones: enforced by the system and verified at your till.',
  },
]

// ── Shared bits ───────────────────────────────────────────────────────────────

// Two-layer copy (owner 2026-07-16): a bold one-line takeaway scanners catch,
// then a short body for readers. Spans only: this also renders inside buttons.
function ItemCopy({ item, size = 'md' }: { item: Item; size?: 'md' | 'sm' }) {
  return (
    <>
      <span className={`block ${size === 'md' ? 'text-[14.5px]' : 'text-[14px]'} leading-[1.7]`} style={{ color: INK }}>
        <span className="font-semibold" style={{ color: NAVY }}>
          {item.lead}
        </span>{' '}
        {item.body}
      </span>
      {item.chips ? (
        <span className="mt-3.5 flex flex-wrap gap-2">
          {item.chips.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#010C35]/10 bg-[#FFF9F5] px-2.5 py-1 text-[11.5px] font-semibold"
              style={{ color: NAVY }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {c}
            </span>
          ))}
        </span>
      ) : null}
    </>
  )
}

function GroupHeader({ label, title, accent }: { label: string; title: string; accent?: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-90px' }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.65, ease: EASE }}
      className="mb-10"
    >
      <p className="mb-3 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(1,12,53,0.45)' }}>
        <motion.span
          className="h-[2px] w-5 origin-left rounded-full bg-[#E20C04]"
          aria-hidden="true"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: EASE }}
        />
        {label}
      </p>
      <h3 className="font-display leading-[1.1]" style={{ color: NAVY, fontSize: 'clamp(24px, 2.6vw, 34px)', letterSpacing: '-0.4px' }}>
        {title}
        {accent ? (
          <>
            {' '}
            <span className="gradient-text">{accent}</span>
          </>
        ) : null}
      </h3>
    </motion.div>
  )
}

// ── Group A: spotlight bento with living micro-visuals ────────────────────────

function RadarViz() {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: 'linear-gradient(150deg, #FFF3EC, #FFE9DE)' }}>
      {[86, 140, 196].map((d) => (
        <span
          key={d}
          className="absolute rounded-full border"
          style={{ width: d, height: d, left: '50%', top: '58%', transform: 'translate(-50%, -50%)', borderColor: 'rgba(226,12,4,0.18)' }}
        />
      ))}
      {/* Sweep */}
      <span
        className="favour-radar-sweep absolute"
        style={{
          width: 196,
          height: 196,
          left: '50%',
          top: '58%',
          marginLeft: -98,
          marginTop: -98,
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, rgba(226,12,4,0.16), transparent 24%)',
        }}
      />
      {[
        { x: '38%', y: '44%', d: '0s' },
        { x: '62%', y: '66%', d: '0.9s' },
        { x: '70%', y: '38%', d: '1.7s' },
      ].map((p) => (
        <span key={p.x} className="absolute" style={{ left: p.x, top: p.y }}>
          <span className="absolute -inset-2 animate-ping rounded-full bg-[#E20C04]/20" style={{ animationDuration: '2.8s', animationDelay: p.d }} />
          <span className="relative block h-2.5 w-2.5 rounded-full bg-[#E20C04] shadow-[0_0_8px_rgba(226,12,4,0.6)]" />
        </span>
      ))}
      <span className="absolute left-1/2 top-[58%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#010C35]" />
    </div>
  )
}

function ProfileViz() {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: 'linear-gradient(150deg, #F2F0FF, #E9E5FF)' }}>
      {/* Fanned mini profile cards; the front one carries the detail */}
      <div className="absolute left-1/2 top-1/2 h-[92px] w-[150px] -translate-x-1/2 -translate-y-1/2 rotate-[-7deg] rounded-xl bg-white/55 shadow-sm transition-transform duration-500 group-hover:rotate-[-11deg] group-hover:-translate-x-[62%]" />
      <div className="absolute left-1/2 top-1/2 h-[92px] w-[150px] -translate-x-1/2 -translate-y-1/2 rotate-[5deg] rounded-xl bg-white/75 shadow-sm transition-transform duration-500 group-hover:rotate-[9deg] group-hover:-translate-x-[38%]" />
      <div className="absolute left-1/2 top-1/2 w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-2.5 shadow-[0_10px_26px_rgba(1,12,53,0.12)] transition-transform duration-500 group-hover:-translate-y-[56%]">
        <div className="mb-2 h-9 rounded-lg" style={{ background: 'linear-gradient(120deg, #E84A00, #E20C04)' }} />
        <div className="mb-1.5 h-2 w-3/4 rounded bg-[#010C35]/80" />
        <div className="mb-2 h-1.5 w-1/2 rounded bg-[#010C35]/25" />
        <div className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((s) => (
            <svg key={s} width="9" height="9" viewBox="0 0 24 24" fill="#F5B301">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z" />
            </svg>
          ))}
          <span className="ml-1 rounded-full bg-[#16A34A]/12 px-1.5 py-0.5 text-[8px] font-bold text-[#16A34A]">Verified</span>
        </div>
      </div>
    </div>
  )
}

function FootfallViz() {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: 'linear-gradient(150deg, #FFF8EA, #FFEFD2)' }}>
      {/* Doorway */}
      <div className="absolute right-[14%] top-1/2 h-[104px] w-[74px] -translate-y-1/2 rounded-t-[40px] border-[3px] border-[#D97706]/50 bg-white/60" />
      <div className="absolute right-[16.5%] top-1/2 h-[86px] w-[52px] -translate-y-1/2 rounded-t-[32px] bg-[#D97706]/15" />
      {/* Footsteps walking in */}
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="favour-step absolute h-2.5 w-2.5 rounded-full bg-[#D97706]"
          style={{ left: `${16 + i * 15}%`, top: i % 2 ? '58%' : '66%', animationDelay: `${i * 0.35}s` }}
        />
      ))}
      <svg className="absolute right-[30%] top-[38%]" width="46" height="22" viewBox="0 0 46 22" fill="none" aria-hidden="true">
        <path d="M2 20 C 18 20, 30 14, 42 4" stroke="#D97706" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="3 6" />
        <path d="M34 3 L 43 3 L 41 12" stroke="#D97706" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  )
}

function RetentionViz() {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: 'linear-gradient(150deg, #EAF7EF, #DCF2E5)' }}>
      <div className="absolute left-1/2 top-1/2 h-[110px] w-[110px] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
        <svg className="absolute inset-0" width="110" height="110" viewBox="0 0 110 110" fill="none">
          <circle cx="55" cy="55" r="40" stroke="rgba(22,163,74,0.18)" strokeWidth="7" />
          <path
            className="favour-loop"
            d="M55 15 a40 40 0 1 1 -28.28 11.72"
            stroke="#16A34A"
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
            strokeDasharray="251"
          />
        </svg>
        {/* The arrowhead rides the drawing tip (same path, same timing) */}
        <span className="favour-loop-arrow absolute left-0 top-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: 'translate(-8px, -8px)' }}>
            <path d="M3 12 L13 8 L5 2" stroke="#16A34A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" transform="rotate(24 8 8)" />
          </svg>
        </span>
      </div>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-[15px] text-[#166534]">3rd visit</span>
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#166534] shadow-sm">
        Coming back this month
      </span>
    </div>
  )
}

const GROW_VIZ = [RadarViz, ProfileViz, FootfallViz, RetentionViz]

function GrowBento() {
  const reduceMotion = useReducedMotion()
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {GROW.map((item, i) => {
        const Viz = GROW_VIZ[i]
        return (
          <motion.article
            key={item.num}
            initial={{ opacity: 0, y: 30, filter: 'blur(6px)' }}
            whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            viewport={{ once: true, margin: '-70px' }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.6, delay: i * 0.09, ease: EASE }}
            whileHover={{ y: -4 }}
            className="group overflow-hidden rounded-3xl border border-[#EFE7DD] bg-white transition-shadow duration-300 hover:shadow-[0_18px_44px_rgba(1,12,53,0.09)]"
          >
            <div className="h-[168px]" aria-hidden="true">
              <Viz />
            </div>
            <div className="p-7">
              <div className="mb-2.5 flex items-baseline gap-3">
                <span className="gradient-text font-display text-[16px] font-semibold" aria-hidden="true">
                  {item.num}
                </span>
                <h4 className="font-display text-[18px] font-semibold leading-snug" style={{ color: NAVY, letterSpacing: '-0.1px' }}>
                  {item.title}
                </h4>
              </div>
              <ItemCopy item={item} />
            </div>
          </motion.article>
        )
      })}
    </div>
  )
}

// ── Group B: interactive console ──────────────────────────────────────────────

const VOUCHER_TYPES: Array<{ chip: string; accent: string }> = [
  { chip: 'BOGO', accent: '#7C3AED' },
  { chip: 'Discount', accent: '#E20C04' },
  { chip: 'Freebie', accent: '#16A34A' },
  { chip: 'Spend & save', accent: '#E84A00' },
  { chip: 'Package deal', accent: '#2563EB' },
  { chip: 'Time-limited', accent: '#D97706' },
  { chip: 'Reusable', accent: '#0D9488' },
]

function ChipsViz({ active }: { active: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
      <p className="text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(1,12,53,0.4)' }}>
        Seven voucher types
      </p>
      <div className="flex max-w-[340px] flex-wrap items-center justify-center gap-2.5">
        {VOUCHER_TYPES.map((t, i) => (
          <motion.span
            key={t.chip}
            initial={false}
            animate={active ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 14, scale: 0.9 }}
            transition={{ duration: 0.38, delay: active ? i * 0.06 : 0, ease: EASE }}
            className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold"
            style={{ color: t.accent, background: `${t.accent}14`, border: `1px solid ${t.accent}30` }}
          >
            {t.chip}
          </motion.span>
        ))}
      </div>
      <p className="text-[12.5px]" style={{ color: INK }}>
        You choose the value, the terms and the timing.
      </p>
    </div>
  )
}

const CAL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const CAL_WINDOW = new Set(['Tue-1', 'Tue-2', 'Wed-1', 'Wed-2'])

function CalendarViz({ active }: { active: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <div className="grid grid-cols-7 gap-1.5">
        {CAL_DAYS.map((d) => (
          <span key={d} className="text-center text-[10px] font-bold uppercase tracking-wide" style={{ color: 'rgba(1,12,53,0.4)' }}>
            {d}
          </span>
        ))}
        {[0, 1, 2].map((row) =>
          CAL_DAYS.map((d, col) => {
            const inWindow = CAL_WINDOW.has(`${d}-${row}`)
            return (
              <motion.span
                key={`${d}-${row}`}
                initial={false}
                animate={
                  active && inWindow
                    ? { background: 'rgba(226,12,4,0.16)', borderColor: 'rgba(226,12,4,0.5)', scale: 1 }
                    : { background: 'rgba(1,12,53,0.04)', borderColor: 'rgba(1,12,53,0.07)', scale: 1 }
                }
                transition={{ duration: 0.4, delay: active && inWindow ? 0.25 + (row * 7 + col) * 0.012 : 0 }}
                className="h-9 w-10 rounded-md border"
              />
            )
          }),
        )}
      </div>
      <motion.span
        initial={false}
        animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="inline-flex items-center gap-2 rounded-full bg-[#E20C04]/10 px-3 py-1.5 text-[12px] font-bold text-[#B00A03]"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#E20C04]" />
        Tue + Wed, 2pm to 5pm: redeemable only in this window
      </motion.span>
    </div>
  )
}

function FeaturedViz({ active }: { active: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <motion.div
        initial={false}
        animate={active ? { opacity: 1, y: 0, rotate: -1.5 } : { opacity: 0, y: 16, rotate: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="relative w-[250px] overflow-hidden rounded-2xl bg-white shadow-[0_16px_40px_rgba(1,12,53,0.14)]"
      >
        <div className="relative h-[104px] overflow-hidden" style={{ background: 'linear-gradient(120deg, #2b1210, #6b2417 55%, #a63a1c)' }}>
          <span className="favour-shimmer absolute inset-0" />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white" style={{ background: 'var(--brand-gradient)' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z" />
            </svg>
            Featured
          </span>
        </div>
        <div className="p-3.5">
          <p className="font-display text-[15px]" style={{ color: NAVY }}>
            The Old Foundry Kitchen
          </p>
          <p className="text-[11.5px]" style={{ color: INK }}>
            Restaurant · Huddersfield · 3 live vouchers
          </p>
        </div>
      </motion.div>
      <motion.p
        initial={false}
        animate={active ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="rounded-full border border-[#010C35]/10 bg-white px-3 py-1.5 text-[11.5px] font-semibold"
        style={{ color: INK }}
      >
        Optional paid placement: only when you want the extra reach
      </motion.p>
    </div>
  )
}

const BARS = [34, 40, 30, 46, 62, 100, 78] // busiest day: Saturday

function InsightsViz({ active }: { active: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
      <div className="flex h-[120px] items-end gap-3">
        {BARS.map((h, i) => (
          <div key={i} className="flex w-8 flex-col items-center gap-1.5">
            <motion.span
              initial={false}
              animate={active ? { scaleY: 1 } : { scaleY: 0 }}
              transition={{ duration: 0.5, delay: active ? 0.1 + i * 0.06 : 0, ease: EASE }}
              className="w-full origin-bottom rounded-t-md"
              style={{ height: `${h}px`, background: i === 5 ? 'var(--brand-gradient)' : 'rgba(1,12,53,0.14)' }}
            />
            <span className="text-[9.5px] font-bold uppercase" style={{ color: i === 5 ? '#B00A03' : 'rgba(1,12,53,0.4)' }}>
              {CAL_DAYS[i]}
            </span>
          </div>
        ))}
      </div>
      <motion.div initial={false} animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }} transition={{ duration: 0.4, delay: 0.55 }} className="flex items-center gap-2.5">
        <span className="rounded-full bg-[#E20C04]/10 px-3 py-1.5 text-[11.5px] font-bold text-[#B00A03]">Busiest day: Saturday</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#010C35]/12 bg-white px-3 py-1.5 text-[11.5px] font-semibold" style={{ color: NAVY }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="M6 11l6 6 6-6" />
            <path d="M4 21h16" />
          </svg>
          Export CSV
        </span>
      </motion.div>
    </div>
  )
}

function MarketingConsole() {
  const [active, setActive] = useState(0)
  const [engaged, setEngaged] = useState(false)
  const reduceMotion = useReducedMotion()
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  // Gentle auto-advance until the visitor takes over
  useEffect(() => {
    if (reduceMotion || engaged) return
    timer.current = setInterval(() => setActive((a) => (a + 1) % MARKETING.length), 4600)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [reduceMotion, engaged])

  const pick = (i: number) => {
    setEngaged(true)
    setActive(i)
  }

  // APG tablist keyboard support: vertical arrows move + focus, roving tabindex
  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const next = (active + dir + MARKETING.length) % MARKETING.length
    pick(next)
    tabRefs.current[next]?.focus()
  }

  const PANELS = [ChipsViz, CalendarViz, FeaturedViz, InsightsViz]

  return (
    <motion.div
      initial={{ opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.7, ease: EASE }}
      className="overflow-hidden rounded-3xl border border-[#EFE7DD] bg-white shadow-[0_24px_60px_rgba(1,12,53,0.07)]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.05fr]">
        {/* Tabs */}
        <div role="tablist" aria-label="Marketing built around your business" aria-orientation="vertical" onKeyDown={onTablistKeyDown} className="flex flex-col p-4 lg:p-6">
          {MARKETING.map((item, i) => {
            const isActive = i === active
            return (
              <button
                key={item.num}
                ref={(el) => {
                  tabRefs.current[i] = el
                }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`favour-panel-${i}`}
                id={`favour-tab-${i}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => pick(i)}
                className="relative rounded-2xl px-5 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E20C04]"
                style={{ background: isActive ? 'rgba(226,12,4,0.05)' : 'transparent' }}
              >
                <span
                  className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full transition-opacity"
                  style={{ background: 'var(--brand-gradient)', opacity: isActive ? 1 : 0 }}
                  aria-hidden="true"
                />
                <span className="flex items-baseline gap-3">
                  <span className={`font-display text-[14px] font-semibold ${isActive ? 'gradient-text' : ''}`} style={isActive ? undefined : { color: 'rgba(1,12,53,0.35)' }} aria-hidden="true">
                    {item.num}
                  </span>
                  <span className="font-display text-[16.5px] font-semibold leading-snug" style={{ color: NAVY, letterSpacing: '-0.1px' }}>
                    {item.title}
                  </span>
                </span>
                {/* Collapsing body is decorative inside the tab (it would
                    otherwise inflate the tab's accessible name); the same
                    text is exposed to AT inside the active tabpanel. */}
                <span
                  aria-hidden="true"
                  className="grid transition-[grid-template-rows,opacity] duration-500"
                  style={{ gridTemplateRows: isActive ? '1fr' : '0fr', opacity: isActive ? 1 : 0 }}
                >
                  <span className="overflow-hidden">
                    <span className="block pt-2.5">
                      <ItemCopy item={item} size="sm" />
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Visual panel */}
        <div className="relative min-h-[380px] border-t border-[#EFE7DD] lg:border-l lg:border-t-0" style={{ background: 'linear-gradient(160deg, #FFFDFB, #FFF4EC)' }}>
          {PANELS.map((Panel, i) => (
            <div
              key={i}
              role="tabpanel"
              id={`favour-panel-${i}`}
              aria-labelledby={`favour-tab-${i}`}
              aria-hidden={i !== active}
              className="absolute inset-0 transition-opacity duration-500"
              style={{ opacity: i === active ? 1 : 0, pointerEvents: i === active ? 'auto' : 'none' }}
            >
              <p className="sr-only">{`${MARKETING[i].lead} ${MARKETING[i].body}`}</p>
              <Panel active={i === active} />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ── Group C: seven voucher tickets, swept by the page's own scroll ───────────
// Die-cut tickets in the app's type colours with the landing rail's motifs.
// Desktop pins briefly and the row sweeps across as the visitor scrolls
// (owner 2026-07-16: horizontally hidden tickets were being missed), so all
// seven are seen with nothing to grab. Mobile / short / reduced motion keep
// a native swipe rail. Time-limited and Reusable are FEATURED tickets with
// richer interiors: the set window + live countdown + in-app availability
// states, and the comes-back frequency cycle.

const TICKET_W = 380 // uniform: every type earns the same stage

function useTicketCountdown(active: boolean) {
  const START = 2 * 86400 + 11 * 3600 + 43 * 60 + 16
  const [left, setLeft] = useState(START)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setLeft((v) => (v > 1 ? v - 1 : START)), 1000)
    return () => clearInterval(id)
  }, [active, START])
  const d = Math.floor(left / 86400)
  const h = Math.floor((left % 86400) / 3600)
  const m = Math.floor((left % 3600) / 60)
  const sec = left % 60
  return [String(d).padStart(2, '0'), String(h).padStart(2, '0'), String(m).padStart(2, '0'), String(sec).padStart(2, '0')]
}

const WINDOW_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WINDOW_ON = [1, 2] // Tue + Wed

function TimeLimitedExtras({ accent }: { accent: string }) {
  const reduceMotion = useReducedMotion()
  const [d, h, m, sec] = useTicketCountdown(!reduceMotion)
  return (
    <div className="flex flex-col gap-3.5">
      {/* The window you set */}
      <div className="flex flex-wrap items-center gap-1.5">
        {WINDOW_DAYS.map((day, i) => {
          const on = WINDOW_ON.includes(i)
          return (
            <span
              key={i}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold"
              style={on ? { background: accent, color: '#fff' } : { background: 'rgba(1,12,53,0.05)', color: 'rgba(1,12,53,0.4)' }}
            >
              {day}
            </span>
          )
        })}
        <span className="ml-1 rounded-md px-2 py-1 text-[11px] font-bold" style={{ background: 'rgba(217,119,6,0.12)', color: accent }}>
          2pm to 5pm
        </span>
      </div>

      {/* Live countdown */}
      <div className="flex items-end gap-1.5" aria-hidden="true">
        <span className="mr-1 self-center text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(1,12,53,0.45)' }}>
          Ends in
        </span>
        {[
          [d, 'days'],
          [h, 'hrs'],
          [m, 'mins'],
          [sec, 'secs'],
        ].map(([v, label]) => (
          <span key={label} className="flex flex-col items-center">
            <span
              className="min-w-[34px] rounded-lg px-1.5 py-1 text-center font-display text-[16px] text-white"
              style={{ background: NAVY, fontVariantNumeric: 'tabular-nums' }}
            >
              {v}
            </span>
            <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(1,12,53,0.4)' }}>
              {label}
            </span>
          </span>
        ))}
      </div>

      {/* How customers see it, in and out of the window */}
      <div className="flex flex-col gap-1.5 text-[11.5px] font-semibold">
        <span className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(22,163,74,0.1)', color: '#166534' }}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#16A34A]" aria-hidden="true" />
          In the window: live and redeemable in the app
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(1,12,53,0.05)', color: 'rgba(1,12,53,0.5)' }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[#9CA3AF]" aria-hidden="true" />
          Outside it: shown as unavailable to redeem
        </span>
      </div>
    </div>
  )
}

function ReusableExtras({ accent }: { accent: string }) {
  return (
    <div className="flex flex-col gap-3.5">
      {/* The reuse gap, exactly as the builder offers it */}
      <div className="flex flex-wrap items-center gap-1.5">
        {['Every hour', 'Every 4 hours', 'Once a day', 'Custom'].map((f, i) => (
          <span
            key={f}
            className="rounded-md px-2.5 py-1.5 text-[11px] font-bold"
            style={i === 1 ? { background: accent, color: '#fff' } : { background: 'rgba(1,12,53,0.05)', color: 'rgba(1,12,53,0.4)' }}
          >
            {f}
          </span>
        ))}
      </div>

      {/* The cycle: used, then back again */}
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: 'rgba(13,148,136,0.1)', color: '#0F766E' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Used today
        </span>
        <svg width="20" height="14" viewBox="0 0 24 16" fill="none" aria-hidden="true">
          <path d="M2 8 h17" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="2.5 3.5" />
          <path d="M15 3 l5 5 -5 5" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: 'rgba(1,12,53,0.05)', color: NAVY }}>
          <svg className="favour-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 3v6h-6" />
          </svg>
          Ready again in 4 hours
        </span>
      </div>

      <p className="text-[11.5px] font-semibold" style={{ color: 'rgba(1,12,53,0.45)' }}>
        Any gap from 30 minutes: no re-claiming, no admin.
      </p>
    </div>
  )
}

// Shared bits for the five standard extras rows
function ExtraPill({ text, accent, accentBg }: { text: string; accent: string; accentBg: string }) {
  return (
    <span className="inline-flex self-start rounded-lg px-2.5 py-1.5 text-[12px] font-bold" style={{ color: accent, background: accentBg }}>
      {text}
    </span>
  )
}

function ExtraChip({ text, on, accent }: { text: string; on?: boolean; accent: string }) {
  return (
    <span
      className="rounded-md px-2.5 py-1.5 text-[11px] font-bold"
      style={on ? { background: accent, color: '#fff' } : { background: 'rgba(1,12,53,0.05)', color: 'rgba(1,12,53,0.4)' }}
    >
      {text}
    </span>
  )
}

function BogoExtras({ accent }: { accent: string }) {
  const bg = 'rgba(124,58,237,0.1)'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="rounded-md border px-2.5 py-1.5 text-[11px] font-bold" style={{ borderColor: 'rgba(1,12,53,0.12)', color: NAVY }}>
          1st · They buy one
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span className="rounded-md px-2.5 py-1.5 text-[11px] font-bold text-white" style={{ background: accent }}>
          2nd · Free
        </span>
      </div>
      <ExtraPill text="Two for one on anything you choose" accent={accent} accentBg={bg} />
      <p className="text-[11.5px] font-semibold" style={{ color: 'rgba(1,12,53,0.45)' }}>
        Mates, dates, colleagues: one bill, two people.
      </p>
    </div>
  )
}

function DiscountExtras({ accent }: { accent: string }) {
  const bg = 'rgba(226,12,4,0.1)'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: 'rgba(1,12,53,0.12)' }}>
          <span className="px-2.5 py-1.5 text-[11px] font-bold text-white" style={{ background: accent }}>
            % off
          </span>
          <span className="px-2.5 py-1.5 text-[11px] font-bold" style={{ color: 'rgba(1,12,53,0.45)' }}>
            £ off
          </span>
        </span>
        <ExtraChip text="10" accent={accent} />
        <ExtraChip text="15" accent={accent} />
        <ExtraChip text="20" on accent={accent} />
      </div>
      <ExtraPill text="A £30 order becomes £24" accent={accent} accentBg={bg} />
      <p className="text-[11.5px] font-semibold" style={{ color: 'rgba(1,12,53,0.45)' }}>
        Percentage or pounds: you set the number.
      </p>
    </div>
  )
}

function FreebieExtras({ accent }: { accent: string }) {
  const bg = 'rgba(22,163,74,0.1)'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span
          className="rotate-[-4deg] rounded-md border-2 border-dashed px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ borderColor: accent, color: accent }}
        >
          On the house
        </span>
        <ExtraChip text="With any purchase" on accent={accent} />
      </div>
      <ExtraPill text="Coffee, taster, dessert or upgrade: your call" accent={accent} accentBg={bg} />
      <p className="text-[11.5px] font-semibold" style={{ color: 'rgba(1,12,53,0.45)' }}>
        The easiest first yes a new customer can say.
      </p>
    </div>
  )
}

function SpendExtras({ accent }: { accent: string }) {
  const bg = 'rgba(232,74,0,0.1)'
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="relative h-2 w-full max-w-[240px] overflow-visible rounded-full" style={{ background: 'rgba(1,12,53,0.07)' }}>
          <span className="absolute bottom-0 left-0 top-0 rounded-full" style={{ width: '62%', background: accent }} />
          <span className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: '62%', background: accent, boxShadow: '0 1px 4px rgba(1,12,53,0.25)' }} />
        </div>
        <div className="mt-1.5 flex max-w-[240px] items-center justify-between text-[10px] font-bold" style={{ color: 'rgba(1,12,53,0.4)' }}>
          <span>£0</span>
          <span style={{ color: accent }}>£30 unlocks the saving</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <ExtraChip text="£20" accent={accent} />
        <ExtraChip text="£30" on accent={accent} />
        <ExtraChip text="£50" accent={accent} />
      </div>
      <ExtraPill text="Spend £30, save £5" accent={accent} accentBg={bg} />
    </div>
  )
}

function PackageExtras({ accent }: { accent: string }) {
  const bg = 'rgba(37,99,235,0.1)'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        {['1', '2', '3'].map((nth) => (
          <span key={nth} className="flex h-8 w-8 items-center justify-center rounded-md text-[12px] font-bold" style={{ background: 'rgba(37,99,235,0.12)', color: accent }}>
            {nth}
          </span>
        ))}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <line x1="5" y1="9" x2="19" y2="9" />
          <line x1="5" y1="15" x2="19" y2="15" />
        </svg>
        <span className="rounded-md px-2.5 py-1.5 text-[11px] font-bold text-white" style={{ background: accent }}>
          £45 · one price
        </span>
      </div>
      <ExtraPill text="Three together, one price" accent={accent} accentBg={bg} />
      <p className="text-[11.5px] font-semibold" style={{ color: 'rgba(1,12,53,0.45)' }}>
        Easier to say yes to, and it shows your range.
      </p>
    </div>
  )
}

const EXTRAS: Record<string, (props: { accent: string }) => React.ReactNode> = {
  bogo: BogoExtras,
  discount: DiscountExtras,
  time: TimeLimitedExtras,
  freebie: FreebieExtras,
  spend: SpendExtras,
  package: PackageExtras,
  reusable: ReusableExtras,
}

function VoucherTicket({ kind, index, sweep = false }: { kind: VoucherKind; index: number; sweep?: boolean }) {
  const Extras = EXTRAS[kind.key]
  return (
    <motion.li
      initial={sweep ? false : { opacity: 0, y: 30, rotate: index % 2 ? 1.6 : -1.6 }}
      whileInView={sweep ? undefined : { opacity: 1, y: 0, rotate: 0 }}
      viewport={sweep ? undefined : { once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: EASE }}
      whileHover={{ y: -8, rotate: index % 2 ? 0.8 : -0.8 }}
      className="group/ticket relative flex flex-shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-white"
      style={{
        width: `min(${TICKET_W}px, calc(100vw - 64px))`,
        border: '1px solid #EFE7DD',
        // Embossed voucher surface: drop shadow + raised top light + pressed base
        boxShadow:
          '0 18px 44px rgba(1,12,53,0.09), inset 0 1.5px 0 rgba(255,255,255,0.95), inset 0 -2px 0 rgba(1,12,53,0.05)',
      }}
    >
      {/* Accent header with the type's motif; the tag sits clear of the badge */}
      <div className="relative flex h-[92px] items-center justify-center overflow-hidden" style={{ background: kind.accentBg }}>
        <span className="favour-shimmer absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/ticket:opacity-100" aria-hidden="true" />
        <div className="h-[66px] w-[66px] transition-transform duration-300 group-hover/ticket:scale-110" aria-hidden="true">
          <Motif kind={kind.key} accent={kind.accent} />
        </div>
        <span
          className="absolute left-3.5 top-3.5 max-w-[65%] rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.07em] leading-tight text-white"
          style={{ background: kind.accent, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 3px rgba(1,12,53,0.15)' }}
        >
          {kind.name}
        </span>
        <span
          className="absolute bottom-3 right-3.5 rounded-full bg-white/90 px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.1em]"
          style={{ color: kind.accent, boxShadow: '0 1px 3px rgba(1,12,53,0.08)' }}
        >
          {kind.tag}
        </span>
      </div>

      {/* Die-cut: punched side notches (inset-shaded) + dashed tear line */}
      <div className="relative h-0" aria-hidden="true">
        <span
          className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full"
          style={{ background: CREAM, border: '1px solid #EFE7DD', boxShadow: 'inset -2px 0 3px rgba(1,12,53,0.1)' }}
        />
        <span
          className="absolute -right-[11px] -top-[11px] h-[22px] w-[22px] rounded-full"
          style={{ background: CREAM, border: '1px solid #EFE7DD', boxShadow: 'inset 2px 0 3px rgba(1,12,53,0.1)' }}
        />
        <span className="absolute left-5 right-5 top-0 border-t border-dashed" style={{ borderColor: 'rgba(1,12,53,0.18)' }} />
      </div>

      {/* Copy + the type's own working parts */}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[13.5px] leading-[1.65]" style={{ color: INK }}>
          {kind.body}
        </p>
        {/* The working parts breathe in the remaining space, so shorter
            interiors never pool empty space above the foot */}
        <div className="flex flex-1 flex-col justify-center py-3">
          <Extras accent={kind.accent} />
        </div>
        {/* Blind-embossed foot, like pressed card stock */}
        <p
          aria-hidden="true"
          className="pt-2 text-center text-[9px] font-bold uppercase tracking-[0.3em] select-none"
          style={{ color: 'rgba(1,12,53,0.1)', textShadow: '0 1px 0 rgba(255,255,255,0.9)' }}
        >
          Redeemo · Member voucher
        </p>
      </div>
    </motion.li>
  )
}

// Shared header for both showcase modes (compact: on desktop it shares one
// pinned screen with the tickets, the bar and the fair-use strip)
function VoucherShowcaseHeader() {
  return (
    <div className="mb-5">
      <p className="mb-2.5 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(1,12,53,0.45)' }}>
        <span className="h-[2px] w-5 rounded-full bg-[#E20C04]" aria-hidden="true" />
        Your vouchers
      </p>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
        <h3 className="font-display leading-[1.1]" style={{ color: NAVY, fontSize: 'clamp(24px, 2.4vw, 32px)', letterSpacing: '-0.4px' }}>
          Seven ways to bring <span className="gradient-text">customers&nbsp;in</span>
        </h3>
        <p className="text-[14px] leading-snug" style={{ color: INK }}>
          Every type is yours to shape: your value, your terms, your timing.
        </p>
      </div>
    </div>
  )
}

// Desktop: the band pins and the page's own scroll sweeps the tickets across.
function VoucherSweep() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLUListElement>(null)
  const [travel, setTravel] = useState(600)

  useEffect(() => {
    const measure = () => {
      const row = rowRef.current
      const vp = row?.parentElement
      if (!row || !vp) return
      setTravel(Math.max(0, row.scrollWidth - vp.clientWidth))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (rowRef.current) ro.observe(rowRef.current)
    if (rowRef.current?.parentElement) ro.observe(rowRef.current.parentElement)
    return () => ro.disconnect()
  }, [])

  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ['start start', 'end end'] })
  const sweepX = useScrollLinked(useTransform(scrollYProgress, [0.04, 0.96], [0, -travel]))
  // Scroll drives the sweep; a pan offset lets visitors pull the row
  // themselves. IMPORTANT: this is a pan gesture, not framer drag: drag
  // would try to own the (derived) x value and judder against it. The
  // accumulator itself is clamped so the row never banks up invisible
  // offset past its bounds.
  const dragX = useMotionValue(0)
  const panBy = (delta: number) => {
    const lo = -travel - sweepX.get()
    const hi = -sweepX.get()
    dragX.set(Math.max(lo, Math.min(hi, dragX.get() + delta)))
  }
  const x = useTransform([sweepX, dragX] as const, ([a, b]: number[]) => Math.max(-travel, Math.min(0, a + b)))
  const prog = useTransform(x, (v) => (travel > 0 ? Math.min(1, Math.max(0, -v / travel)) : 0))
  const leftFade = useTransform(prog, [0, 0.04], [0, 1])
  const rightFade = useTransform(prog, [0.96, 1], [1, 0])

  return (
    <div ref={wrapRef} style={{ height: `calc(100svh + ${travel + 120}px)` }}>
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden">
        <VoucherShowcaseHeader />
        <div className="relative">
          <motion.div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-12" style={{ background: `linear-gradient(90deg, ${CREAM}, transparent)`, opacity: leftFade }} />
          <motion.div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-12" style={{ background: `linear-gradient(270deg, ${CREAM}, transparent)`, opacity: rightFade }} />
          <motion.ul
            ref={rowRef}
            className="flex w-max cursor-grab items-stretch gap-5 pb-4 pt-2 active:cursor-grabbing"
            style={{ x, touchAction: 'pan-y' }}
            onPan={(_, info) => panBy(info.delta.x)}
            aria-label="The seven voucher types"
          >
            {VOUCHER_KINDS.map((kind, i) => (
              <VoucherTicket key={kind.key} kind={kind} index={i} sweep />
            ))}
          </motion.ul>
        </div>
        {/* Full-width progress bar: the shadowed track says there is more */}
        <div
          className="mt-4 h-[5px] overflow-hidden rounded-full"
          style={{ background: 'rgba(1,12,53,0.08)', boxShadow: 'inset 0 1px 2.5px rgba(1,12,53,0.16)' }}
          aria-hidden="true"
        >
          <motion.span className="block h-full origin-left rounded-full" style={{ scaleX: prog, background: 'var(--brand-gradient)', boxShadow: '0 1px 4px rgba(226,12,4,0.35)' }} />
        </div>

        {/* The fair-use strip shares the screen; tiles light as the sweep
            passes their third */}
        <VoucherFairness prog={prog} />
      </div>
    </div>
  )
}

// Mobile / short / reduced motion: a native swipe rail with arrows.
function VoucherRail() {
  const railRef = useRef<HTMLUListElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const [prog, setProg] = useState(0)

  const onRailScroll = () => {
    const el = railRef.current
    if (!el) return
    // snap-mandatory rests the rail at the first snap point (~8px), so the
    // "at start" band must be wider than that
    setAtStart(el.scrollLeft < 16)
    setAtEnd(el.scrollLeft > el.scrollWidth - el.clientWidth - 16)
    setProg(Math.min(1, Math.max(0, el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth))))
  }

  useEffect(() => {
    onRailScroll()
  }, [])

  const nudge = (dir: number) => {
    railRef.current?.scrollBy({ left: dir * 560, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <VoucherShowcaseHeader />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 top-40 z-10 w-10 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, ${CREAM}, transparent)`, opacity: atStart ? 0 : 1 }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 top-40 z-10 w-10 transition-opacity duration-300"
        style={{ background: `linear-gradient(270deg, ${CREAM}, transparent)`, opacity: atEnd ? 0 : 1 }}
      />

      <ul
        ref={railRef}
        onScroll={onRailScroll}
        className="favour-rail -mx-2 flex snap-x snap-mandatory items-stretch gap-5 overflow-x-auto px-2 pb-5 pt-2"
        aria-label="The seven voucher types"
      >
        {VOUCHER_KINDS.map((kind, i) => (
          <VoucherTicket key={kind.key} kind={kind} index={i} />
        ))}
      </ul>

      <div className="h-[4px] max-w-[300px] overflow-hidden rounded-full" style={{ background: 'rgba(1,12,53,0.08)' }} aria-hidden="true">
        <span className="block h-full origin-left rounded-full transition-transform duration-200" style={{ transform: `scaleX(${prog})`, background: 'var(--brand-gradient)' }} />
      </div>
      <div className="mt-3 flex items-center justify-end gap-2.5">
        {[-1, 1].map((dir) => (
          <button
            key={dir}
            onClick={() => nudge(dir)}
            aria-label={dir < 0 ? 'Scroll voucher types back' : 'Scroll voucher types forward'}
            className="flex h-10 w-10 items-center justify-center rounded-full border bg-white transition-colors hover:border-[#E20C04]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E20C04]"
            style={{ borderColor: '#EFE7DD', color: NAVY }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: dir < 0 ? 'rotate(180deg)' : undefined }}>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}

// Fair-use strip (owner 2026-07-16 round 3): lives on the SAME pinned screen
// as the tickets; each tile lights as the sweep passes its third, lifts on
// hover, and its medallion warms to the brand gradient. No "unlimited"
// framing (misleading; see the consumer-side rule on the same word).
const FAIR_POINTS = [
  {
    icon: 'stack' as const,
    at: 0.12,
    lead: 'As many vouchers as you need.',
    body: 'You decide how many offers you run, what they say and what they give.',
  },
  {
    icon: 'shield' as const,
    at: 0.5,
    lead: 'One redemption per customer, per cycle.',
    body: 'Each voucher works once per cycle, then renews: a fresh reason to return, never a loophole.',
  },
  {
    icon: 'refresh' as const,
    at: 0.88,
    lead: 'Reusable, on your terms.',
    body: 'Reusable vouchers work again after the gap you choose: from every 30 minutes to once a day, or your own interval.',
  },
]

function FairIcon({ kind, stroke }: { kind: 'stack' | 'shield' | 'refresh'; stroke: string }) {
  if (kind === 'stack') {
    return (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3z" />
        <path d="M3 12l9 4.5 9-4.5" />
        <path d="M3 16.5L12 21l9-4.5" />
      </svg>
    )
  }
  if (kind === 'shield') {
    return (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2.5l7.5 3.5v5.5c0 4.6-3.2 7.9-7.5 9.5-4.3-1.6-7.5-4.9-7.5-9.5V6l7.5-3.5z" />
        <path d="M10.2 9.5l2-1.5v8" />
      </svg>
    )
  }
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 3.5V8h-4.5" />
      <path d="M9.5 12.2l1.8 1.8 3.4-3.6" />
    </svg>
  )
}

function FairTile({ pt, prog }: { pt: (typeof FAIR_POINTS)[number]; prog?: ReturnType<typeof useMotionValue<number>> }) {
  const fallback = useMotionValue(1)
  const source = prog ?? fallback
  const lit = useTransform(source, [Math.max(0, pt.at - 0.12), pt.at], [0, 1])
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="group/fair relative flex items-start gap-3.5 overflow-hidden rounded-2xl border bg-white px-4 py-3.5 transition-shadow duration-300 hover:shadow-[0_14px_34px_rgba(1,12,53,0.1)]"
      style={{ borderColor: '#EFE7DD', boxShadow: '0 8px 22px rgba(1,12,53,0.04)' }}
    >
      {/* Medallion: warms to the brand gradient as the sweep reaches it,
          and on hover */}
      <span className="relative mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(226,12,4,0.07)', border: '1px solid rgba(226,12,4,0.14)' }} aria-hidden="true">
        <span className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover/fair:opacity-100" style={{ background: 'var(--brand-gradient)' }} />
        <motion.span className="absolute inset-0 rounded-xl" style={{ background: 'var(--brand-gradient)', opacity: lit }} />
        <span className="relative">
          <span className="absolute inset-0 flex items-center justify-center opacity-100 transition-opacity duration-200 group-hover/fair:opacity-0">
            <motion.span style={{ opacity: useTransform(lit, (v) => 1 - v) }}>
              <FairIcon kind={pt.icon} stroke="#E20C04" />
            </motion.span>
          </span>
          <span className="flex items-center justify-center">
            <motion.span style={{ opacity: lit }} className="transition-opacity duration-200 group-hover/fair:!opacity-100">
              <FairIcon kind={pt.icon} stroke="#FFFFFF" />
            </motion.span>
          </span>
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold leading-snug" style={{ color: NAVY }}>
          {pt.lead}
        </span>
        <span className="mt-1 block text-[12px] leading-[1.55]" style={{ color: INK }}>
          {pt.body}
        </span>
      </span>
      {/* Activation underline */}
      <motion.span aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-[2.5px] origin-left" style={{ background: 'var(--brand-gradient)', scaleX: lit }} />
    </motion.div>
  )
}

function VoucherFairness({ prog }: { prog?: ReturnType<typeof useMotionValue<number>> }) {
  return (
    <div className="mt-5">
      <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(1,12,53,0.45)' }}>
        Generous to customers. Protected for you.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {FAIR_POINTS.map((pt) => (
          <FairTile key={pt.icon} pt={pt} prog={prog} />
        ))}
      </div>
    </div>
  )
}

function VoucherShowcase() {
  const mode = useViewportMode()
  const reduceMotion = useReducedMotion()
  if (mode === 'desktop' && !reduceMotion) return <VoucherSweep />
  return (
    <>
      <VoucherRail />
      <VoucherFairness />
    </>
  )
}

// ── Group D: the till receipt ────────────────────────────────────────────────

const RECEIPT_LINES: Array<{ label: string; value: string; strong?: boolean }> = [
  { label: 'Listing fee', value: '£0.00' },
  { label: 'Monthly platform subscription', value: '£0.00' },
  { label: 'Commission per redemption', value: '0%' },
  { label: 'Redemption fee', value: '£0.00' },
  { label: 'Hidden fees', value: 'None' },
]

function ReceiptLine({ line, index }: { line: (typeof RECEIPT_LINES)[number]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.35, delay: 0.3 + index * 0.14, ease: EASE }}
      className="flex items-baseline justify-between gap-4 py-2"
    >
      <span className="text-[13px] tracking-wide text-white/65">{line.label}</span>
      <span className="flex-1 border-b border-dotted border-white/20" aria-hidden="true" />
      <span className="font-display text-[16px] text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {line.value}
      </span>
    </motion.div>
  )
}

function MarginReceipt() {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotate: 1.4 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.7, ease: EASE }}
      className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]"
    >
      {/* The receipt */}
      <motion.div
        initial={{ opacity: 0, y: 26, rotate: 0 }}
        whileInView={{ opacity: 1, y: 0, rotate: -1.6 }}
        viewport={{ once: true, margin: '-70px' }}
        transition={{ duration: 0.6, ease: EASE }}
        className="relative mx-auto w-full max-w-[380px] px-8 pb-12 pt-9 lg:sticky lg:top-28"
        style={{ background: NAVY, boxShadow: '0 34px 80px rgba(1,12,53,0.28)', borderRadius: '10px 10px 0 0' }}
      >
        {/* Torn receipt edge */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 h-[12px]"
          style={{
            background: `linear-gradient(-45deg, ${CREAM} 8px, transparent 0), linear-gradient(45deg, ${CREAM} 8px, transparent 0)`,
            backgroundSize: '16px 16px',
            backgroundPosition: 'bottom',
            backgroundRepeat: 'repeat-x',
          }}
        />
        <p className="mb-1 text-center font-display text-[17px] tracking-[0.06em] text-white">REDEEMO</p>
        <p className="mb-6 text-center text-[10.5px] font-bold uppercase tracking-[0.24em] text-white/40">What listing costs you</p>
        <div className="mb-5 border-t border-dashed border-white/20" aria-hidden="true" />
        {RECEIPT_LINES.map((line, i) => (
          <ReceiptLine key={line.label} line={line} index={i} />
        ))}
        <div className="mb-4 mt-5 border-t border-dashed border-white/20" aria-hidden="true" />
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.45, delay: 0.85 }}
          className="flex items-baseline justify-between"
        >
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/75">You keep</span>
          <span className="gradient-text font-display text-[24px]" style={{ letterSpacing: '-0.4px' }}>
            your margin
          </span>
        </motion.div>
        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-white/30">The saving you fund goes to your customer</p>
      </motion.div>

      {/* The four money items */}
      <div className="flex flex-col gap-7">
        {MARGIN.map((item, i) => (
          <motion.article
            key={item.num}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.45, delay: i * 0.06, ease: EASE }}
            className="border-b border-[#EFE7DD] pb-7 last:border-b-0"
          >
            <div className="mb-2 flex items-baseline gap-3">
              <span className="gradient-text font-display text-[15px] font-semibold" aria-hidden="true">
                {item.num}
              </span>
              <h4 className="font-display text-[18px] font-semibold leading-snug" style={{ color: NAVY, letterSpacing: '-0.1px' }}>
                {item.title}
              </h4>
            </div>
            <ItemCopy item={item} />
          </motion.article>
        ))}
      </div>
    </motion.div>
  )
}

// ── The section ───────────────────────────────────────────────────────────────

export function FavourSection() {
  const reduceMotion = useReducedMotion()
  return (
    <section className="relative -mt-[70px]" style={{ background: 'transparent' }}>
      {/* Seam: the cream sheet sweeps up over the cinema's night scene
          (night to daylight), a broad curve rather than a hard edge */}
      <svg aria-hidden="true" className="block h-[90px] w-full md:h-[110px]" viewBox="0 0 1440 110" preserveAspectRatio="none">
        <path d="M0,110 C 480,0 960,0 1440,110 Z" fill={CREAM} />
      </svg>
      <div className="relative" style={{ background: CREAM }}>
        {/* Sunrise glow at the crest of the curve */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[90px] left-0 right-0 h-[260px]"
          style={{ background: 'radial-gradient(620px 200px at 50% 40px, rgba(232,74,0,0.1), transparent 70%)' }}
        />

        {/* Brand blushes: soft coral and red tinted gradients scattered
            organically down the section, each melting into the cream */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute" style={{ width: 760, height: 560, right: '2%', top: '2.5%', background: 'radial-gradient(closest-side, rgba(232,74,0,0.06), transparent)' }} />
          <div className="absolute" style={{ width: 640, height: 640, left: '-6%', top: '21%', background: 'radial-gradient(closest-side, rgba(226,12,4,0.045), transparent)' }} />
          <div className="absolute" style={{ width: 800, height: 600, right: '-8%', top: '47%', background: 'radial-gradient(closest-side, rgba(232,74,0,0.05), transparent)' }} />
          <div className="absolute" style={{ width: 680, height: 680, left: '4%', top: '70%', background: 'radial-gradient(closest-side, rgba(232,74,0,0.055), transparent)' }} />
          <div className="absolute" style={{ width: 900, height: 480, left: '28%', top: '91%', background: 'radial-gradient(closest-side, rgba(226,12,4,0.04), transparent)' }} />
        </div>

      <style>{`
        .favour-radar-sweep { animation: favourSweep 5.2s linear infinite; }
        @keyframes favourSweep { to { transform: rotate(360deg); } }
        .favour-step { opacity: 0; animation: favourStep 2.6s ease-in-out infinite; }
        @keyframes favourStep { 0% { opacity: 0; } 18% { opacity: 1; } 48% { opacity: 1; } 70% { opacity: 0; } 100% { opacity: 0; } }
        .favour-loop { stroke-dashoffset: 251; animation: favourLoop 3.4s ease-in-out infinite; }
        @keyframes favourLoop { 0% { stroke-dashoffset: 251; } 55% { stroke-dashoffset: 40; } 100% { stroke-dashoffset: 40; } }
        .favour-loop-arrow { offset-path: path('M55 15 a40 40 0 1 1 -28.28 11.72'); offset-rotate: auto; animation: favourLoopArrow 3.4s ease-in-out infinite; }
        @keyframes favourLoopArrow { 0% { offset-distance: 0%; } 55% { offset-distance: 100%; } 100% { offset-distance: 100%; } }
        .favour-shimmer { background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.28) 50%, transparent 62%); animation: favourShimmer 3.2s ease-in-out infinite; }
        @keyframes favourShimmer { 0% { transform: translateX(-100%); } 60% { transform: translateX(100%); } 100% { transform: translateX(100%); } }
        .favour-rail { scrollbar-width: none; }
        .favour-rail::-webkit-scrollbar { display: none; }
        .favour-spin { animation: favourSpin 3.6s linear infinite; }
        @keyframes favourSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .favour-radar-sweep, .favour-step, .favour-loop, .favour-shimmer, .favour-spin, .favour-loop-arrow { animation: none; }
          .favour-loop-arrow { offset-distance: 100%; }
          .favour-step { opacity: 1; }
          .favour-loop { stroke-dashoffset: 40; }
        }
      `}</style>

      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-6 md:pb-32">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55, ease: EASE }}
          className="mb-16 max-w-[680px] md:mb-20"
        >
          <p className="mb-4 flex items-center gap-2.5 text-[11.5px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(1,12,53,0.45)' }}>
            <span className="h-[2px] w-6 bg-[#E20C04]" aria-hidden="true" />
            {EYEBROW}
          </p>
          <h2 className="font-display mb-4 leading-[1.08]" style={{ color: NAVY, fontSize: 'clamp(32px, 4vw, 50px)', letterSpacing: '-0.7px' }}>
            Everything in <span className="gradient-text">your&nbsp;favour.</span>
          </h2>
          <p className="text-[15.5px] leading-[1.65]" style={{ color: INK }}>
            {INTRO}
          </p>
        </motion.div>

        {/* A · Grow */}
        <GroupHeader label="Grow" title="Grow your" accent="local presence" />
        <GrowBento />

        {/* B · Marketing */}
        <div className="mt-20 md:mt-28">
          <GroupHeader label="Promote" title="Marketing built around" accent="your business" />
          <MarketingConsole />
        </div>

        {/* C · Voucher types (tighter: the pinned sweep carries its own air) */}
        <div className="mt-16 lg:mt-6">
          <VoucherShowcase />
        </div>

        {/* D · Margin */}
        <div className="mt-16 lg:mt-10">
          <GroupHeader label="Your margin" title="A model that protects" accent="your margin" />
          <MarginReceipt />
        </div>

        {/* Closing statement */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-70px' }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: EASE }}
          className="mx-auto mt-24 max-w-[900px] text-center md:mt-32"
        >
          <p className="font-display leading-[1.3]" style={{ color: NAVY, fontSize: 'clamp(23px, 2.6vw, 34px)', letterSpacing: '-0.5px' }}>
            The voucher gets them through the door.
            <br />
            Your business gives them a reason to <span className="whitespace-nowrap">return<BrandStop /></span>
          </p>
        </motion.div>
      </div>
      </div>
      {/* Seam out: the portal's navy sweeps up over the cream, mirroring the
          curve that opened this section */}
      <svg aria-hidden="true" className="block h-[90px] w-full md:h-[110px]" viewBox="0 0 1440 110" preserveAspectRatio="none" style={{ background: CREAM }}>
        <path d="M0,110 C 480,0 960,0 1440,110 L1440,110 L0,110 Z" fill="#010C35" />
      </svg>
    </section>
  )
}
