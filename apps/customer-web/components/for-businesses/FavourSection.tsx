'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { BrandStop } from '@/components/ui/BrandStop'

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
 *   C  One place to manage it all    the real portal under a moving
 *                                    spotlight: activating a feature slides
 *                                    a bright window across the screenshot
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

type Item = { num: string; title: string; body: string }

const GROW: Item[] = [
  {
    num: '01',
    title: 'Targeted local marketing',
    body: "Redeemo's location-led discovery does more than place your business in a directory. Geolocation, customer-selected interests and what customers are exploring nearby all feed into who sees you, from personalised discovery to trending and featured areas. And the customers finding you pay for their membership: these are people who have already decided to go out and spend.",
  },
  {
    num: '02',
    title: 'Brand awareness through a complete business profile',
    body: 'Your business gets a dedicated profile across the Redeemo app and website, not just a name in a list. Showcase your imagery, description, opening hours, location and directions, amenities and live vouchers, alongside verified customer reviews. Customers can see who you are, what you offer and why to choose you before they arrive.',
  },
  {
    num: '03',
    title: 'Higher footfall',
    body: 'Being seen is only the first step. A compelling voucher gives customers a clear reason to act: not a click or a follow, but a visit, an order and a first-hand experience of your business.',
  },
  {
    num: '04',
    title: 'Customer retention',
    body: 'The relationship does not have to end after the first redemption. Fresh, seasonal and reusable vouchers introduce more of what you offer, keep you relevant and give customers reasons to come back.',
  },
]

const MARKETING: Item[] = [
  {
    num: '05',
    title: 'Tactical marketing initiatives',
    body: 'Build vouchers around what matters to your business: a new service, a product launch, seasonal demand, an event or something more customers should know about. Seven voucher types to choose from, and you decide what to promote, when it runs and what the terms allow.',
  },
  {
    num: '06',
    title: 'Targeted campaigns for quieter periods',
    body: 'Every business has a quiet Tuesday. Choose the exact days and times a voucher runs, and customers can only redeem it during that window. Point demand at quieter days, off-peak hours or seasonal gaps, and stay in control of when it can be used.',
  },
  {
    num: '07',
    title: 'Digital marketing and featured exposure',
    body: "Redeemo's own marketing brings customers into the platform and towards businesses near them. When you want more reach, optional paid featured placement puts your brand and vouchers in front of more of them, alongside Redeemo-run campaigns.",
  },
  {
    num: '08',
    title: 'Customer base insights',
    body: 'See confirmed redemptions by voucher, date and branch, your busiest days and the customers Redeemo brought in. Export your records when you need them, see which vouchers customers respond to and decide what to run next on real activity, not guesswork.',
  },
]

const MANAGE: Item[] = [
  {
    num: '09',
    title: 'An easy-to-use merchant portal',
    body: 'Manage your entire Redeemo presence from one central merchant portal: update your business and branches, control staff access, create and manage vouchers, verify redemptions and view performance insights. One login, everything in its place.',
  },
  {
    num: '10',
    title: 'Multi-branch management',
    body: 'Run every branch under one Redeemo business account. Merchant-wide vouchers can be accepted at any eligible branch, so customers can visit the location that suits them. And once a voucher is redeemed at one branch, Redeemo automatically holds it until its cycle or reusable frequency allows: fairness across branches never depends on your staff catching it.',
  },
  {
    num: '11',
    title: 'Guided voucher creation',
    body: 'Creating a compelling voucher should not require marketing expertise. Redeemo guides you through value, terms, timing and usage controls step by step, and the "How this voucher stacks up" assessment shows what is strong and what could be better before you submit. Prefer a hand? You can ask the Redeemo team to help build it.',
  },
]

const MARGIN: Item[] = [
  {
    num: '12',
    title: 'Free business listing',
    body: 'List your business, build your profile and use the merchant portal without a listing fee or monthly platform subscription. No hidden platform fees appear later.',
  },
  {
    num: '13',
    title: 'No commission. No redemption fee.',
    body: "Redeemo does not take a percentage when a voucher is used, and there is no separate redemption charge. The saving you choose reaches your customer in full, not a platform's margin.",
  },
  {
    num: '14',
    title: 'Value tied to a real customer visit',
    body: 'You are never charged because someone viewed or clicked your listing. The voucher saving only comes into play when a customer is standing in your business and completes a valid redemption.',
  },
  {
    num: '15',
    title: 'Customer acquisition with built-in limits',
    body: 'Each standard voucher can be redeemed once per customer during their monthly cycle; reusable vouchers follow the frequency you set. The limits are enforced by the system and verified at your till, so you give customers reasons to visit and return without every purchase becoming an open-ended discount.',
  },
]

// ── Shared bits ───────────────────────────────────────────────────────────────

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
              <p className="text-[14.5px] leading-[1.7]" style={{ color: INK }}>
                {item.body}
              </p>
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
                    <span className="block pt-2.5 text-[14px] leading-[1.7]" style={{ color: INK }}>
                      {item.body}
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
              <p className="sr-only">{MARKETING[i].body}</p>
              <Panel active={i === active} />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ── Group C: the portal under a moving spotlight ──────────────────────────────

// Regions of /for-businesses/portal/home-chrome.webp (1728x1084), fractions.
const PORTAL_REGIONS = [
  { x: 0.006, y: 0.05, w: 0.165, h: 0.9 }, // the whole sidebar: one place
  { x: 0.006, y: 0.395, w: 0.165, h: 0.13 }, // Branches + Staff & access
  { x: 0.185, y: 0.62, w: 0.34, h: 0.3 }, // Needs your attention: voucher review
]

function PortalSpotlight() {
  const [active, setActive] = useState(0)
  const r = PORTAL_REGIONS[active]
  const inset = `inset(${(r.y * 100).toFixed(2)}% ${((1 - r.x - r.w) * 100).toFixed(2)}% ${((1 - r.y - r.h) * 100).toFixed(2)}% ${(r.x * 100).toFixed(2)}% round 12px)`

  return (
    <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.25fr_1fr]">
      {/* The portal, dimmed, with a bright window sliding to the active region */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.55, ease: EASE }}
        className="relative overflow-hidden rounded-2xl border border-[#EFE7DD] shadow-[0_28px_70px_rgba(1,12,53,0.13)]"
        style={{ aspectRatio: '1728 / 1084', background: '#F8F7F4' }}
      >
        <Image src="/for-businesses/portal/home-chrome.webp" alt="" fill sizes="(min-width: 1024px) 640px, 100vw" className="object-cover" style={{ filter: 'brightness(0.55) saturate(0.85)' }} />
        <motion.div className="absolute inset-0" initial={false} animate={{ clipPath: inset }} transition={{ type: 'spring', stiffness: 200, damping: 28 }}>
          <Image src="/for-businesses/portal/home-chrome.webp" alt="" fill sizes="(min-width: 1024px) 640px, 100vw" className="object-cover" />
        </motion.div>
        <motion.div
          className="pointer-events-none absolute rounded-xl border-2 border-[#E20C04]/70 shadow-[0_0_0_4px_rgba(226,12,4,0.14)]"
          animate={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 28 }}
          aria-hidden="true"
        />
      </motion.div>

      {/* Feature rows drive the spotlight */}
      <div className="flex flex-col gap-3">
        {MANAGE.map((item, i) => {
          const isActive = i === active
          return (
            <motion.button
              key={item.num}
              initial={{ opacity: 0, x: 18 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.45, delay: i * 0.08, ease: EASE }}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              aria-pressed={isActive}
              className="rounded-2xl border p-6 text-left transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E20C04]"
              style={{
                background: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                borderColor: isActive ? 'rgba(226,12,4,0.3)' : '#EFE7DD',
                boxShadow: isActive ? '0 14px 36px rgba(1,12,53,0.09)' : 'none',
              }}
            >
              <span className="mb-2 flex items-baseline gap-3">
                <span className={`font-display text-[14px] font-semibold ${isActive ? 'gradient-text' : ''}`} style={isActive ? undefined : { color: 'rgba(1,12,53,0.35)' }} aria-hidden="true">
                  {item.num}
                </span>
                <span className="font-display text-[17px] font-semibold leading-snug" style={{ color: NAVY, letterSpacing: '-0.1px' }}>
                  {item.title}
                </span>
              </span>
              <span className="block text-[14px] leading-[1.7]" style={{ color: INK }}>
                {item.body}
              </span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

// ── Group D: the till receipt ─────────────────────────────────────────────────

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
            <p className="text-[14.5px] leading-[1.7]" style={{ color: INK }}>
              {item.body}
            </p>
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
        @media (prefers-reduced-motion: reduce) {
          .favour-radar-sweep, .favour-step, .favour-loop, .favour-shimmer { animation: none; }
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

        {/* C · Manage */}
        <div className="mt-20 md:mt-28">
          <GroupHeader label="Manage" title="One place to manage it all" />
          <PortalSpotlight />
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
