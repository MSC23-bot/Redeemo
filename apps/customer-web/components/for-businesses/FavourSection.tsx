'use client'

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
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
const HEADLINE = 'Everything in your favour.'
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
type VoucherKind = { key: string; name: string; body: string; examples: string[]; featured?: 'time' | 'reusable'; accent: string; accentBg: string }

const VOUCHER_KINDS: VoucherKind[] = [
  {
    key: 'bogo',
    name: 'Buy one get one free',
    body: 'A free second brings pairs through the door. Perfect for introducing what you want more customers to try.',
    examples: ['Two for one on anything you choose'],
    accent: '#7C3AED',
    accentBg: 'rgba(124,58,237,0.1)',
  },
  {
    key: 'discount',
    name: 'Discount',
    body: 'A clean saving everyone understands instantly: a percentage off or a set amount off, your call.',
    examples: ['20% off', '£5 off'],
    accent: '#E20C04',
    accentBg: 'rgba(226,12,4,0.1)',
  },
  {
    key: 'time',
    name: 'Time-limited',
    body: 'Runs only in the window you set: days, dates and hours. Outside it, customers see it as unavailable to redeem.',
    examples: [],
    featured: 'time',
    accent: '#D97706',
    accentBg: 'rgba(217,119,6,0.1)',
  },
  {
    key: 'freebie',
    name: 'Freebie',
    body: 'A small free extra that makes trying you effortless, and shows off what you do best.',
    examples: ['A free extra with any purchase'],
    accent: '#16A34A',
    accentBg: 'rgba(22,163,74,0.1)',
  },
  {
    key: 'spend',
    name: 'Spend & save',
    body: 'Rewards a bigger basket: the order goes up and the customer still feels the win.',
    examples: ['Spend £30, save £5'],
    accent: '#E84A00',
    accentBg: 'rgba(232,74,0,0.1)',
  },
  {
    key: 'package',
    name: 'Package deal',
    body: 'Bundle what goes together at one price. Easier to say yes to, and it showcases your range.',
    examples: ['Three together, one price'],
    accent: '#2563EB',
    accentBg: 'rgba(37,99,235,0.1)',
  },
  {
    key: 'reusable',
    name: 'Reusable',
    body: 'Returns on the frequency you choose: weekly, fortnightly or monthly. Built for regulars and the visit that becomes a habit.',
    examples: [],
    featured: 'reusable',
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

function GroupHeader({ label, title }: { label: string; title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mb-10"
    >
      <p className="mb-3 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(1,12,53,0.45)' }}>
        <span className="h-[2px] w-5 rounded-full bg-[#E20C04]" aria-hidden="true" />
        {label}
      </p>
      <h3 className="font-display leading-[1.1]" style={{ color: NAVY, fontSize: 'clamp(24px, 2.6vw, 34px)', letterSpacing: '-0.4px' }}>
        {title}
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
      <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" width="110" height="110" viewBox="0 0 110 110" fill="none" aria-hidden="true">
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
        <path d="M18 34 L27 26 L30 38" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-[15px] text-[#166534]">3rd visit</span>
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#166534] shadow-sm">
        Coming back this month
      </span>
    </div>
  )
}

const GROW_VIZ = [RadarViz, ProfileViz, FootfallViz, RetentionViz]

function GrowBento() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {GROW.map((item, i) => {
        const Viz = GROW_VIZ[i]
        return (
          <motion.article
            key={item.num}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5, delay: (i % 2) * 0.08, ease: EASE }}
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
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, ease: EASE }}
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

const TICKET_W = 264
const TICKET_W_FEATURED = 420

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
      {/* The frequency you choose */}
      <div className="flex flex-wrap items-center gap-1.5">
        {['Weekly', 'Fortnightly', 'Monthly'].map((f, i) => (
          <span
            key={f}
            className="rounded-md px-2.5 py-1.5 text-[11px] font-bold"
            style={i === 0 ? { background: accent, color: '#fff' } : { background: 'rgba(1,12,53,0.05)', color: 'rgba(1,12,53,0.4)' }}
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
          Back next week
        </span>
      </div>

      <p className="text-[11.5px] font-semibold" style={{ color: 'rgba(1,12,53,0.45)' }}>
        No re-claiming, no admin: it simply returns.
      </p>
    </div>
  )
}

function VoucherTicket({ kind, index, sweep = false }: { kind: VoucherKind; index: number; sweep?: boolean }) {
  const featured = Boolean(kind.featured)
  return (
    <motion.li
      initial={sweep ? false : { opacity: 0, y: 30, rotate: index % 2 ? 1.6 : -1.6 }}
      whileInView={sweep ? undefined : { opacity: 1, y: 0, rotate: 0 }}
      viewport={sweep ? undefined : { once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: EASE }}
      whileHover={{ y: -8, rotate: index % 2 ? 0.8 : -0.8 }}
      className="group/ticket relative flex-shrink-0 snap-start overflow-hidden rounded-2xl bg-white"
      style={{
        width: featured ? `min(${TICKET_W_FEATURED}px, calc(100vw - 64px))` : TICKET_W,
        boxShadow: featured ? `0 22px 52px rgba(1,12,53,0.12), 0 0 0 1.5px ${kind.accent}55` : '0 16px 40px rgba(1,12,53,0.08)',
        border: featured ? 'none' : '1px solid #EFE7DD',
        marginTop: sweep ? (index % 2 ? 18 : 0) : 0,
      }}
    >
      {/* Accent header with the type's motif */}
      <div className="relative flex h-[104px] items-center justify-center overflow-hidden" style={{ background: kind.accentBg }}>
        <span className="favour-shimmer absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/ticket:opacity-100" aria-hidden="true" />
        <div className="h-[76px] w-[76px] transition-transform duration-300 group-hover/ticket:scale-110" aria-hidden="true">
          <Motif kind={kind.key} accent={kind.accent} />
        </div>
        <span
          className="absolute left-3.5 top-3.5 max-w-[70%] rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.07em] leading-tight text-white"
          style={{ background: kind.accent }}
        >
          {kind.name}
        </span>
        {featured ? (
          <span className="absolute right-3.5 top-3.5 rounded-full bg-white px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.1em]" style={{ color: kind.accent }}>
            {kind.featured === 'time' ? 'You set the window' : 'It keeps coming back'}
          </span>
        ) : null}
      </div>

      {/* Perforation: notches + dashed tear line */}
      <div className="relative h-0" aria-hidden="true">
        <span className="absolute -left-[9px] -top-[9px] h-[18px] w-[18px] rounded-full" style={{ background: CREAM, border: '1px solid #EFE7DD' }} />
        <span className="absolute -right-[9px] -top-[9px] h-[18px] w-[18px] rounded-full" style={{ background: CREAM, border: '1px solid #EFE7DD' }} />
        <span className="absolute left-4 right-4 top-0 border-t border-dashed" style={{ borderColor: 'rgba(1,12,53,0.18)' }} />
      </div>

      {/* Copy */}
      <div className="p-5">
        <p className="text-[13.5px] leading-[1.65]" style={{ color: INK }}>
          {kind.body}
        </p>
        {kind.examples.length ? (
          <span className="mt-3.5 flex flex-wrap gap-2">
            {kind.examples.map((ex) => (
              <span key={ex} className="inline-flex rounded-lg px-2.5 py-1.5 text-[12px] font-bold" style={{ color: kind.accent, background: kind.accentBg }}>
                {ex}
              </span>
            ))}
          </span>
        ) : null}
        {kind.featured === 'time' ? (
          <div className="mt-4">
            <TimeLimitedExtras accent={kind.accent} />
          </div>
        ) : null}
        {kind.featured === 'reusable' ? (
          <div className="mt-4">
            <ReusableExtras accent={kind.accent} />
          </div>
        ) : null}
      </div>
    </motion.li>
  )
}

// Shared header for both showcase modes
function VoucherShowcaseHeader() {
  return (
    <>
      <GroupHeader label="Your vouchers" title="Seven ways to bring customers in" />
      <p className="-mt-6 mb-8 max-w-[560px] text-[15px] leading-[1.65]" style={{ color: INK }}>
        Every type is yours to shape: your value, your terms, your timing.
      </p>
    </>
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
  const x = useScrollLinked(useTransform(scrollYProgress, [0.04, 0.96], [0, -travel]))
  const leftFade = useScrollLinked(useTransform(scrollYProgress, [0.04, 0.12], [0, 1]))
  const rightFade = useScrollLinked(useTransform(scrollYProgress, [0.88, 0.96], [1, 0]))

  return (
    <div ref={wrapRef} style={{ height: `calc(100svh + ${travel + 240}px)` }}>
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden">
        <VoucherShowcaseHeader />
        <div className="relative">
          <motion.div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-12" style={{ background: `linear-gradient(90deg, ${CREAM}, transparent)`, opacity: leftFade }} />
          <motion.div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-12" style={{ background: `linear-gradient(270deg, ${CREAM}, transparent)`, opacity: rightFade }} />
          <motion.ul ref={rowRef} className="flex w-max items-start gap-5 pb-4 pt-2" style={{ x }} aria-label="The seven voucher types">
            {VOUCHER_KINDS.map((kind, i) => (
              <VoucherTicket key={kind.key} kind={kind} index={i} sweep />
            ))}
          </motion.ul>
        </div>
        <motion.p className="mt-2 text-[11.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'rgba(1,12,53,0.35)', opacity: rightFade }}>
          Keep scrolling: all seven sweep past
        </motion.p>
      </div>
    </div>
  )
}

// Mobile / short / reduced motion: a native swipe rail with arrows.
function VoucherRail() {
  const railRef = useRef<HTMLUListElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const onRailScroll = () => {
    const el = railRef.current
    if (!el) return
    // snap-mandatory rests the rail at the first snap point (~8px), so the
    // "at start" band must be wider than that
    setAtStart(el.scrollLeft < 16)
    setAtEnd(el.scrollLeft > el.scrollWidth - el.clientWidth - 16)
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
        className="favour-rail -mx-2 flex snap-x snap-mandatory items-start gap-5 overflow-x-auto px-2 pb-5 pt-2"
        aria-label="The seven voucher types"
      >
        {VOUCHER_KINDS.map((kind, i) => (
          <VoucherTicket key={kind.key} kind={kind} index={i} />
        ))}
      </ul>

      <div className="mt-2 flex items-center justify-end gap-2.5">
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

function VoucherShowcase() {
  const mode = useViewportMode()
  const reduceMotion = useReducedMotion()
  if (mode === 'desktop' && !reduceMotion) return <VoucherSweep />
  return <VoucherRail />
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
  return (
    <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
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
    </div>
  )
}

// ── The section ───────────────────────────────────────────────────────────────

export function FavourSection() {
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

      <style>{`
        .favour-radar-sweep { animation: favourSweep 5.2s linear infinite; }
        @keyframes favourSweep { to { transform: rotate(360deg); } }
        .favour-step { opacity: 0; animation: favourStep 2.6s ease-in-out infinite; }
        @keyframes favourStep { 0% { opacity: 0; } 18% { opacity: 1; } 48% { opacity: 1; } 70% { opacity: 0; } 100% { opacity: 0; } }
        .favour-loop { stroke-dashoffset: 251; animation: favourLoop 3.4s ease-in-out infinite; }
        @keyframes favourLoop { 0% { stroke-dashoffset: 251; } 55% { stroke-dashoffset: 40; } 100% { stroke-dashoffset: 40; } }
        .favour-shimmer { background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.28) 50%, transparent 62%); animation: favourShimmer 3.2s ease-in-out infinite; }
        @keyframes favourShimmer { 0% { transform: translateX(-100%); } 60% { transform: translateX(100%); } 100% { transform: translateX(100%); } }
        .favour-rail { scrollbar-width: none; }
        .favour-rail::-webkit-scrollbar { display: none; }
        .favour-spin { animation: favourSpin 3.6s linear infinite; }
        @keyframes favourSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .favour-radar-sweep, .favour-step, .favour-loop, .favour-shimmer, .favour-spin { animation: none; }
          .favour-step { opacity: 1; }
          .favour-loop { stroke-dashoffset: 40; }
        }
      `}</style>

      <div className="mx-auto max-w-6xl px-6 pb-24 pt-6 md:pb-32">
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
            {HEADLINE}
          </h2>
          <p className="text-[15.5px] leading-[1.65]" style={{ color: INK }}>
            {INTRO}
          </p>
        </motion.div>

        {/* A · Grow */}
        <GroupHeader label="Grow" title="Grow your local presence" />
        <GrowBento />

        {/* B · Marketing */}
        <div className="mt-20 md:mt-28">
          <GroupHeader label="Promote" title="Marketing built around your business" />
          <MarketingConsole />
        </div>

        {/* C · Voucher types */}
        <div className="mt-20 md:mt-28">
          <VoucherShowcase />
        </div>

        {/* D · Margin */}
        <div className="mt-20 md:mt-28">
          <GroupHeader label="Your margin" title="A model that protects your margin" />
          <MarginReceipt />
        </div>

        {/* Closing statement */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-70px' }}
          transition={{ duration: 0.6, ease: EASE }}
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
    </section>
  )
}
