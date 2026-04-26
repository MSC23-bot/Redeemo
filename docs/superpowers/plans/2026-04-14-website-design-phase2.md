# Redeemo Customer Website — New Pages (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the nine pages that are currently missing from the customer website — all marketing pages, the map view, the OTP verification page, and the account subscription management page.

**Prerequisite:** Phase 1 (`docs/superpowers/plans/2026-04-14-website-design-phase1.md`) must be complete. This plan assumes the correct design tokens and rebuilt Navbar/Footer are already in place.

**Architecture:** All new pages live in `apps/customer-web/app/`. Static marketing pages (how-it-works, pricing, for-businesses, about, faq) are Server Components. Insider is a static shell (no CMS API yet — renders placeholder content). Map uses Mapbox GL JS with a `'use client'` wrapper. Verify and account/subscription are client components.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS v4, Framer Motion, TypeScript. Map: `mapbox-gl` + `react-map-gl`.

**Working directory for all commands:** `/Users/shebinchaliyath/Desktop/Claude Code/Redeemo/.worktrees/customer-web/`

**App root:** `apps/customer-web/` (relative to working directory above)

**Design tokens recap (use these values everywhere):**
- Brand gradient: `linear-gradient(135deg, #E20C04 0%, #E84A00 100%)`
- Navy text: `#010C35`
- Secondary text: `#4B5563`
- Muted text: `#9CA3AF`
- Warm tint bg: `#FEF6F5`
- Neutral bg: `#F8F9FA`
- Border: `#EDE8E8`
- Destructive: `#B91C1C`

---

## File Map

| File | Action | Notes |
|---|---|---|
| `apps/customer-web/app/how-it-works/page.tsx` | Create | Static Server Component |
| `apps/customer-web/app/pricing/page.tsx` | Create | Static Server Component |
| `apps/customer-web/app/for-businesses/page.tsx` | Create | Static Server Component, navy hero |
| `apps/customer-web/app/about/page.tsx` | Create | Static Server Component |
| `apps/customer-web/app/faq/page.tsx` | Create | Client Component (accordion + search state) |
| `apps/customer-web/app/insider/page.tsx` | Create | Static shell — no CMS yet |
| `apps/customer-web/app/insider/[slug]/page.tsx` | Create | Static shell — 404 fallback |
| `apps/customer-web/app/map/page.tsx` | Create | Client Component, Mapbox |
| `apps/customer-web/app/verify/page.tsx` | Create | Client Component, OTP flow |
| `apps/customer-web/app/account/subscription/page.tsx` | Create | Client Component, 3-step cancel flow |

---

## Task 1: /how-it-works page

**Files:**
- Create: `apps/customer-web/app/how-it-works/page.tsx`

**Layout:** Page title section → Phase 1 steps (Getting started) → Phase 2 steps (Redeeming) → Free plan features list → FAQ accordion → App download CTA. Background alternates: white → neutral gray → white → warm tint.

- [ ] **Step 1: Create the directory and page file**

```bash
mkdir -p apps/customer-web/app/how-it-works
```

Create `apps/customer-web/app/how-it-works/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'Learn how to subscribe, discover merchants, and redeem vouchers with Redeemo.',
}

const PHASE1_STEPS = [
  {
    n: '01',
    title: 'Download the app and create a free account',
    body: 'Redeemo is available on iOS and Android. Create your account in under two minutes. No payment details required for the free plan.',
    note: null,
  },
  {
    n: '02',
    title: 'Choose a subscription plan',
    body: 'Browse free — no card needed. To unlock voucher redemptions, choose a Monthly (£6.99) or Annual (£69.99) plan. Cancel any time.',
    note: null,
  },
  {
    n: '03',
    title: 'Browse merchants near you and save your favourites',
    body: 'Discover restaurants, cafes, gyms, salons, and more within your neighbourhood. Save merchants to your favourites for quick access.',
    note: null,
  },
]

const PHASE2_STEPS = [
  {
    n: '04',
    title: 'Open the merchant page in the app',
    body: 'Navigate to the merchant you want to visit. Review the available vouchers and their terms before you go.',
    note: null,
  },
  {
    n: '05',
    title: 'Enter the branch PIN shown in-venue',
    body: 'When you arrive at the venue, enter the branch PIN displayed in-store to verify your presence.',
    note: 'The branch PIN is not a secret — it is displayed in-venue. If you cannot find it, ask a member of staff.',
  },
  {
    n: '06',
    title: 'Show your code to the member of staff to validate',
    body: 'The app generates a unique redemption code. Show it to the member of staff. They scan or enter it in the Redeemo merchant app to validate.',
    note: 'If a merchant refuses a valid voucher, contact Redeemo support — not the merchant directly.',
  },
]

const FREE_FEATURES = [
  { label: 'Discover merchants near you', included: true },
  { label: 'View all offers and voucher details', included: true },
  { label: 'Access merchant info and opening hours', included: true },
  { label: 'Read ratings and reviews', included: true },
  { label: 'No credit card required', included: true },
  { label: 'Redeem offers in-store', included: false, gate: 'Requires a paid plan' },
]

const FAQ_ITEMS = [
  {
    q: 'Do I need the app to browse merchants?',
    a: 'No. You can browse all merchants and voucher details on this website for free. Redemption requires the mobile app — that is by design, not a restriction.',
  },
  {
    q: 'Can I use Redeemo in any city?',
    a: 'Redeemo is available across the UK. Merchant density varies by location. Enter your postcode or allow location access to see what is near you.',
  },
  {
    q: 'What happens if a merchant refuses my voucher?',
    a: 'Contact Redeemo support directly — do not negotiate with the merchant. All merchants sign a contract committing to honour valid redemptions.',
  },
  {
    q: 'Can I use a voucher more than once per month?',
    a: 'Each voucher can be redeemed once per subscription cycle per merchant. Your cycle starts on your subscription date, not the calendar month. Unused vouchers do not carry over.',
  },
  {
    q: 'What is the branch PIN?',
    a: 'Each merchant branch has a unique PIN displayed in-venue. You enter it in the app to confirm you are physically present at the location before a redemption code is generated.',
  },
]

function StepBlock({ step, isPhase2 = false }: { step: typeof PHASE1_STEPS[0]; isPhase2?: boolean }) {
  return (
    <div className="flex gap-6 items-start">
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
        aria-hidden
      >
        {step.n}
      </div>
      <div className="flex-1 pt-2">
        <h3 className="font-body text-[16px] font-bold text-[#010C35] mb-2 leading-snug">
          {step.title}
        </h3>
        <p className="text-[14px] text-[#4B5563] leading-[1.65] mb-2">{step.body}</p>
        {step.note && (
          <p className="text-[13px] text-[#9CA3AF] italic">{step.note}</p>
        )}
      </div>
    </div>
  )
}

export default function HowItWorksPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-white py-16 px-6 border-b border-[#EDE8E8]">
        <div className="max-w-7xl mx-auto max-w-[640px]">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-4">
            How it works
          </p>
          <h1
            className="font-display text-[#010C35] leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(32px, 4vw, 52px)', letterSpacing: '-0.3px' }}
          >
            Straightforward by design.
          </h1>
          <p className="text-[15px] text-[#4B5563] leading-[1.65] max-w-[480px]">
            Six steps from sign-up to your first saved voucher. No gimmicks, no advance booking, no faff.
          </p>
        </div>
      </section>

      {/* Phase 1 */}
      <section className="bg-[#F8F9FA] py-16 px-6">
        <div className="max-w-7xl mx-auto max-w-[640px]">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9CA3AF] mb-8">
            Phase 1 — Getting started
          </p>
          <div className="flex flex-col gap-10">
            {PHASE1_STEPS.map(step => (
              <StepBlock key={step.n} step={step} />
            ))}
          </div>
        </div>
      </section>

      {/* Phase 2 */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-7xl mx-auto max-w-[640px]">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9CA3AF] mb-8">
            Phase 2 — Redeeming a voucher
          </p>
          <div className="flex flex-col gap-10">
            {PHASE2_STEPS.map(step => (
              <StepBlock key={step.n} step={step} isPhase2 />
            ))}
          </div>
        </div>
      </section>

      {/* Free plan features */}
      <section className="bg-[#FEF6F5] py-16 px-6">
        <div className="max-w-7xl mx-auto max-w-[640px]">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-8"
            style={{ fontSize: 'clamp(22px, 3vw, 32px)' }}
          >
            What you get on the free plan
          </h2>
          <ul className="flex flex-col gap-4">
            {FREE_FEATURES.map(f => (
              <li key={f.label} className="flex items-start gap-3">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${
                    f.included
                      ? 'text-white'
                      : 'bg-[#F8F9FA] border border-[#EDE8E8] text-[#9CA3AF]'
                  }`}
                  style={f.included ? { background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' } : undefined}
                  aria-hidden
                >
                  {f.included ? '✓' : '×'}
                </span>
                <div>
                  <span className={`text-[14px] ${f.included ? 'text-[#010C35]' : 'text-[#9CA3AF] line-through'}`}>
                    {f.label}
                  </span>
                  {f.gate && (
                    <span className="block text-[12px] text-[#E20C04] font-medium mt-0.5">{f.gate}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex gap-4 flex-wrap">
            <Link
              href="/subscribe"
              className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
            >
              Get started — from £6.99/mo
            </Link>
            <Link
              href="/pricing"
              className="inline-block text-[#4B5563] font-medium text-[14px] px-6 py-3 rounded-lg border border-[#EDE8E8] bg-white no-underline hover:border-[#010C35] transition-colors"
            >
              View all plans
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ accordion — client island needed for expand/collapse */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-7xl mx-auto max-w-[640px]">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-8"
            style={{ fontSize: 'clamp(22px, 3vw, 32px)' }}
          >
            Common questions
          </h2>
          <div className="flex flex-col divide-y divide-[#EDE8E8]">
            {FAQ_ITEMS.map(item => (
              <details key={item.q} className="group py-5">
                <summary className="flex justify-between items-start gap-4 cursor-pointer list-none">
                  <span className="text-[15px] font-medium text-[#010C35] leading-snug">{item.q}</span>
                  <span className="text-[#9CA3AF] flex-shrink-0 mt-0.5 transition-transform group-open:rotate-45 text-[20px] leading-none">+</span>
                </summary>
                <p className="mt-4 text-[14px] text-[#4B5563] leading-[1.65]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* App CTA */}
      <section
        className="py-16 px-6 text-center"
        style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
      >
        <div className="max-w-[480px] mx-auto">
          <h2 className="font-display text-white text-[28px] leading-[1.1] mb-4">
            Ready to start saving?
          </h2>
          <p className="text-[14px] text-white/75 mb-8">
            Download the app to redeem vouchers in-store. Browse free on the website anytime.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <div className="h-11 px-6 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center">
              <span className="text-[13px] font-semibold text-white">App Store</span>
            </div>
            <div className="h-11 px-6 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center">
              <span className="text-[13px] font-semibold text-white">Google Play</span>
            </div>
          </div>
          <p className="mt-4 text-[12px] text-white/50">Apps coming soon</p>
        </div>
      </section>
    </>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Visual check**

Open http://localhost:3001/how-it-works. Confirm: page title section, two-phase step layout with gradient circles, free plan checklist, native HTML `<details>` FAQ accordion, gradient CTA at bottom.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-web/app/how-it-works/
git commit -m "feat: add /how-it-works page"
```

---

## Task 2: /pricing page

**Files:**
- Create: `apps/customer-web/app/pricing/page.tsx`

**Layout:** Anchor copy → Three plan cards (Free, Monthly, Annual) → FAQ accordion → Dual CTA.

- [ ] **Step 1: Create the directory and page**

```bash
mkdir -p apps/customer-web/app/pricing
```

Create `apps/customer-web/app/pricing/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple, transparent pricing. Browse free or subscribe from £6.99 a month.',
}

const PLANS = [
  {
    name: 'Free',
    price: '£0',
    period: null,
    badge: null,
    cta: { label: 'Start for free', href: '/register', style: 'ghost' as const },
    features: [
      { label: 'Discover all merchants', included: true },
      { label: 'View all offers and voucher details', included: true },
      { label: 'Read ratings and reviews', included: true },
      { label: 'No credit card required', included: true },
      { label: 'Redeem offers in-store', included: false },
      { label: 'Savings tracker', included: false },
    ],
  },
  {
    name: 'Monthly',
    price: '£6.99',
    period: 'per month',
    badge: 'Most popular',
    cta: { label: 'Get monthly', href: '/subscribe', style: 'gradient' as const },
    features: [
      { label: 'Everything in Free', included: true },
      { label: 'Redeem offers at all merchants', included: true },
      { label: 'Personalised recommendations', included: true },
      { label: 'Savings tracker', included: true },
      { label: 'Monthly voucher renewal', included: true },
      { label: 'Cancel any time', included: true },
    ],
  },
  {
    name: 'Annual',
    price: '£69.99',
    period: 'per year',
    badge: '2 months free',
    cta: { label: 'Get annual', href: '/subscribe', style: 'gradient' as const },
    features: [
      { label: 'Everything in Monthly', included: true },
      { label: '~£14 saving vs monthly billing', included: true },
      { label: 'Priority customer support', included: true },
      { label: 'Cancel any time', included: true },
      { label: 'Access until end of subscription year on cancellation', included: true },
    ],
  },
]

const FAQ_ITEMS = [
  {
    q: 'What happens when I cancel?',
    a: 'You keep full access until the end of your current billing period. No partial refunds — your access simply stops at the natural end of the period you paid for.',
  },
  {
    q: 'Is there a free trial?',
    a: 'No open free trials — Redeemo is free to browse forever. Paid trials are occasionally available via promo codes issued through specific promotions.',
  },
  {
    q: 'Can I share my account with family?',
    a: 'No. Subscriptions are personal and non-transferable. One account per person. Account sharing would undermine the one-redemption-per-cycle model that makes the merchant relationship work.',
  },
  {
    q: 'Can I switch between monthly and annual?',
    a: 'Yes. You can switch plans from your account page. When upgrading to annual, the remaining value of your monthly plan is applied as a credit.',
  },
  {
    q: 'What is your refund policy?',
    a: 'We do not offer refunds for used subscription periods. If you believe there has been a billing error, contact Redeemo support and we will review your case.',
  },
]

export default function PricingPage() {
  return (
    <>
      {/* Header */}
      <section className="bg-white py-16 px-6 border-b border-[#EDE8E8]">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-4">
            Pricing
          </p>
          <h1
            className="font-display text-[#010C35] leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(32px, 4vw, 52px)', letterSpacing: '-0.3px' }}
          >
            Less than one coffee a week.
          </h1>
          <p className="text-[15px] text-[#4B5563] max-w-[400px] mx-auto">
            Free to browse. Subscribe to unlock redemptions at all merchants.
          </p>
        </div>
      </section>

      {/* Plan cards */}
      <section className="bg-[#F8F9FA] py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[960px] mx-auto">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className="relative bg-white rounded-xl border border-[#EDE8E8] p-8 flex flex-col"
              >
                {plan.badge && (
                  <div
                    className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-white text-[11px] font-bold px-4 py-1 rounded-full whitespace-nowrap"
                    style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
                  >
                    {plan.badge}
                  </div>
                )}

                <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF] mb-3">
                  {plan.name}
                </p>
                <div className="mb-1">
                  <span className="font-display text-[42px] leading-none text-[#010C35]">
                    {plan.price}
                  </span>
                </div>
                {plan.period ? (
                  <p className="text-[13px] text-[#9CA3AF] mb-8">{plan.period}</p>
                ) : (
                  <p className="text-[13px] text-[#9CA3AF] mb-8">always</p>
                )}

                <ul className="flex flex-col gap-3 mb-8 flex-1">
                  {plan.features.map(f => (
                    <li key={f.label} className="flex items-start gap-2.5">
                      <span
                        className={`flex-shrink-0 mt-0.5 text-[13px] font-bold ${
                          f.included ? 'text-[#E20C04]' : 'text-[#D1D5DB]'
                        }`}
                        aria-hidden
                      >
                        {f.included ? '✓' : '×'}
                      </span>
                      <span
                        className={`text-[13px] leading-snug ${
                          f.included ? 'text-[#4B5563]' : 'text-[#D1D5DB]'
                        }`}
                      >
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>

                {plan.cta.style === 'gradient' ? (
                  <Link
                    href={plan.cta.href}
                    className="block text-center text-white font-semibold text-[14px] py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
                    style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
                  >
                    {plan.cta.label}
                  </Link>
                ) : (
                  <Link
                    href={plan.cta.href}
                    className="block text-center text-[#010C35] font-semibold text-[14px] py-3 rounded-lg border border-[#EDE8E8] no-underline hover:border-[#010C35] transition-colors"
                  >
                    {plan.cta.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-[640px] mx-auto">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-8"
            style={{ fontSize: 'clamp(22px, 3vw, 32px)' }}
          >
            Pricing questions
          </h2>
          <div className="flex flex-col divide-y divide-[#EDE8E8]">
            {FAQ_ITEMS.map(item => (
              <details key={item.q} className="group py-5">
                <summary className="flex justify-between items-start gap-4 cursor-pointer list-none">
                  <span className="text-[15px] font-medium text-[#010C35] leading-snug">{item.q}</span>
                  <span className="text-[#9CA3AF] flex-shrink-0 mt-0.5 transition-transform group-open:rotate-45 text-[20px] leading-none">+</span>
                </summary>
                <p className="mt-4 text-[14px] text-[#4B5563] leading-[1.65]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Dual CTA */}
      <section className="bg-[#FEF6F5] py-16 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-6"
            style={{ fontSize: 'clamp(26px, 3.5vw, 42px)' }}
          >
            Start saving today.
          </h2>
          <div className="flex justify-center gap-4 flex-wrap">
            <Link
              href="/subscribe"
              className="inline-block text-white font-semibold text-[14px] px-7 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
            >
              Subscribe now
            </Link>
            <Link
              href="/discover"
              className="inline-block text-[#4B5563] font-medium text-[14px] px-7 py-3.5 rounded-lg border border-[#EDE8E8] bg-white no-underline hover:border-[#010C35] transition-colors"
            >
              Browse free first
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Visual check**

Open http://localhost:3001/pricing. Confirm three plan cards side by side (Free with ghost CTA, Monthly with "Most popular" badge and gradient CTA, Annual with "2 months free" badge), FAQ accordion below, dual CTA section.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-web/app/pricing/
git commit -m "feat: add /pricing page — three plan cards, FAQ, dual CTA"
```

---

## Task 3: /for-businesses page

**Files:**
- Create: `apps/customer-web/app/for-businesses/page.tsx`

**Key design rule:** This is the ONLY page with a full-width navy hero section above the footer. It targets Marcus (merchant persona) — authoritative, fact-driven tone.

- [ ] **Step 1: Create the directory and page**

```bash
mkdir -p apps/customer-web/app/for-businesses
```

Create `apps/customer-web/app/for-businesses/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'For Businesses',
  description: 'List your business on Redeemo. No commission, no performance fees, full digital verification.',
}

const COMMERCIAL_FACTS = [
  {
    title: 'No double margin hit',
    body: 'Tastecard merchants pay a performance fee on every visit on top of the discount they absorb. Redeemo takes nothing. Your only cost is the offer you designed.',
  },
  {
    title: 'One redemption per cycle converts regulars, not subsidises them',
    body: 'A Tastecard regular who visits twice a week gets 50% off every visit, forever. A Redeemo member who visits four times a month gets the offer once. The other three visits are at full price. Redeemo acquires customers for you.',
  },
  {
    title: 'Digital verification and full reconciliation data',
    body: 'Tastecard has no audit trail. Redeemo generates a unique code per redemption, validates it at point of use, and logs everything. You can see every Redeemo redemption, when it happened, and through which offer.',
  },
]

const HOW_IT_WORKS_STEPS = [
  { n: '01', title: 'Apply online', body: 'Complete your business profile and submit documents. Takes under 10 minutes.' },
  { n: '02', title: 'Submit your two standard vouchers', body: 'Every merchant on Redeemo offers two standard vouchers (typically BOGO). You control the terms.' },
  { n: '03', title: 'Get approved', body: 'A Redeemo team member reviews your profile and approves your listing. Usually within 48 hours.' },
  { n: '04', title: 'Start receiving members', body: 'Your listing goes live. Redeemo subscribers near you can discover, save, and visit your venue.' },
]

const WHAT_YOU_GET = [
  { category: 'Merchant portal (web)', items: ['Voucher creation and management', 'Business profile and branch management', 'Redemption history and analytics', 'Campaign management'] },
  { category: 'Merchant app (mobile)', items: ['QR code scanning for in-store validation', 'Manual code entry', 'Real-time redemption tracking', 'Branch-level reporting'] },
]

const COMPARISON = [
  { dimension: 'Commission per visit', redeemo: 'None. Ever.', tastecard: 'Performance fee + discount absorbed' },
  { dimension: 'Offer structure', redeemo: 'You design your own', tastecard: 'Imposed: 50% off or BOGO only' },
  { dimension: 'Redemption limit per member', redeemo: 'One per cycle — converts new customers', tastecard: 'Unlimited — permanently subsidises regulars' },
  { dimension: 'Verification method', redeemo: 'QR code or unique digital code', tastecard: 'Card shown to staff, no audit trail' },
  { dimension: 'Reconciliation data', redeemo: 'Full per-redemption history', tastecard: 'None' },
  { dimension: 'Fraud protection', redeemo: 'Code tied to account, system-enforced', tastecard: 'None — card sharing undetectable' },
  { dimension: 'Merchant quality control', redeemo: 'Admin approval required', tastecard: 'Open listing — known accuracy issues' },
]

export default function ForBusinessesPage() {
  return (
    <>
      {/* Hero — navy, the one exception to the warm-light rule */}
      <section className="bg-[#010C35] py-20 px-6">
        <div className="max-w-7xl mx-auto max-w-[680px]">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40 mb-5">
            For businesses
          </p>
          <h1
            className="font-display text-white leading-[1.08] mb-6"
            style={{ fontSize: 'clamp(32px, 4.5vw, 58px)', letterSpacing: '-0.5px' }}
          >
            No commission. No performance fees. No margin cuts.
          </h1>
          <p className="text-[15px] text-white/60 leading-[1.65] max-w-[520px] mb-10">
            Redeemo connects your venue with local subscribers who pay a membership to find places like yours. You sign a 12-month contract and offer two standard vouchers. That is the entire commercial arrangement.
          </p>
          <div className="flex gap-4 flex-wrap">
            <Link
              href="/contact"
              className="inline-block text-white font-semibold text-[14px] px-7 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
            >
              Get listed free
            </Link>
            <Link
              href="/how-it-works"
              className="inline-block text-white/70 font-medium text-[14px] px-7 py-3.5 rounded-lg border border-white/20 no-underline hover:text-white hover:border-white/40 transition-colors"
            >
              How it works for members
            </Link>
          </div>
        </div>
      </section>

      {/* Three commercial facts */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9CA3AF] mb-10">
            Three facts to know before deciding
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {COMMERCIAL_FACTS.map((fact, i) => (
              <div key={fact.title} className="border-l-[3px] border-[#010C35] pl-6">
                <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF] mb-3">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h3 className="font-body text-[16px] font-bold text-[#010C35] mb-3 leading-snug">
                  {fact.title}
                </h3>
                <p className="text-[14px] text-[#4B5563] leading-[1.65]">{fact.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works for merchants */}
      <section className="bg-[#FEF6F5] py-16 px-6">
        <div className="max-w-7xl mx-auto max-w-[640px]">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-10"
            style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}
          >
            How to get listed
          </h2>
          <div className="flex flex-col gap-8">
            {HOW_IT_WORKS_STEPS.map(step => (
              <div key={step.n} className="flex gap-5 items-start">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
                  aria-hidden
                >
                  {step.n}
                </div>
                <div className="pt-2">
                  <h3 className="font-body text-[15px] font-bold text-[#010C35] mb-1">{step.title}</h3>
                  <p className="text-[14px] text-[#4B5563] leading-[1.65]">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-10"
            style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}
          >
            What merchants get
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {WHAT_YOU_GET.map(section => (
              <div key={section.category} className="bg-[#F8F9FA] rounded-xl p-8">
                <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF] mb-5">
                  {section.category}
                </p>
                <ul className="flex flex-col gap-3">
                  {section.items.map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="text-[#E20C04] font-bold text-[13px] flex-shrink-0 mt-0.5" aria-hidden>✓</span>
                      <span className="text-[14px] text-[#4B5563]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="bg-[#F8F9FA] py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-8"
            style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}
          >
            Redeemo vs Tastecard
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[#EDE8E8] bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#EDE8E8]">
                  <th className="px-6 py-4 text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF] w-[35%]">Dimension</th>
                  <th className="px-6 py-4 text-[11px] font-bold tracking-[0.12em] uppercase text-[#E20C04]">Redeemo</th>
                  <th className="px-6 py-4 text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF]">Tastecard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE8E8]">
                {COMPARISON.map(row => (
                  <tr key={row.dimension}>
                    <td className="px-6 py-4 text-[13px] font-medium text-[#010C35]">{row.dimension}</td>
                    <td className="px-6 py-4 text-[13px] text-[#4B5563]">{row.redeemo}</td>
                    <td className="px-6 py-4 text-[13px] text-[#9CA3AF]">{row.tastecard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Social proof placeholder */}
      <section className="bg-[#FEF6F5] py-16 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-[13px] text-[#9CA3AF]">Merchant testimonials coming soon.</p>
        </div>
      </section>

      {/* Apply CTA — gradient section */}
      <section
        className="py-20 px-6 text-center"
        style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
      >
        <div className="max-w-[520px] mx-auto">
          <h2 className="font-display text-white text-[32px] leading-[1.1] mb-4">
            Apply for free. Takes under 10 minutes.
          </h2>
          <p className="text-[14px] text-white/70 mb-8">
            No fees to list. No commission on redemptions. Sign a 12-month commitment to your members and start growing.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-white text-[#E20C04] font-bold text-[15px] px-8 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
          >
            Get listed free
          </Link>
        </div>
      </section>
    </>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Visual check**

Open http://localhost:3001/for-businesses. Confirm: navy hero (only page with navy hero above footer), three commercial facts with navy left-border accent, comparison table, gradient apply CTA at bottom.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-web/app/for-businesses/
git commit -m "feat: add /for-businesses page — navy hero, comparison table, merchant facts"
```

---

## Task 4: /about page

**Files:**
- Create: `apps/customer-web/app/about/page.tsx`

- [ ] **Step 1: Create the directory and page**

```bash
mkdir -p apps/customer-web/app/about
```

Create `apps/customer-web/app/about/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About Redeemo',
  description: 'Redeemo is a UK-based local voucher membership connecting consumers with local businesses.',
}

const STATS = [
  { value: 'UK', label: 'Based and focused' },
  { value: '£0', label: 'Commission to merchants' },
  { value: 'Free', label: 'To list as a merchant' },
  { value: 'One price', label: 'One subscription' },
]

const VALUES = [
  {
    title: 'For members',
    body: 'A subscription that earns its keep. Every month, you unlock vouchers at local merchants you actually want to visit. The saving is the receipt. The experience comes first.',
  },
  {
    title: 'For merchants',
    body: 'No commission. No performance fees. Merchants set their own offers, receive digital verification on every redemption, and own their customer relationships. Redeemo is a platform, not a partner extracting margin.',
  },
  {
    title: 'For local communities',
    body: 'Money spent locally stays local. Redeemo exists to make it easier for people to discover and return to independent businesses in their neighbourhood, not to drive footfall to chains.',
  },
  {
    title: 'Our commitment',
    body: 'No dark patterns. No auto-renewing without notice. No data sold. Redeemo operates on trust: with members, with merchants, and with the communities it serves.',
  },
]

export default function AboutPage() {
  return (
    <>
      {/* Stat bar */}
      <section className="bg-[#010C35] py-10 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 md:divide-x md:divide-white/[0.08]">
            {STATS.map(stat => (
              <div key={stat.value} className="flex flex-col items-center text-center md:px-8">
                <span className="font-display text-white text-[28px] leading-none mb-1">{stat.value}</span>
                <span className="text-[11px] text-white/40 font-medium tracking-wide">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-7xl mx-auto max-w-[640px]">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-6">
            Our story
          </p>
          <h1
            className="font-display text-[#010C35] leading-[1.1] mb-8"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Built for the places that make a neighbourhood worth living in.
          </h1>
          <div className="flex flex-col gap-5 text-[15px] text-[#4B5563] leading-[1.75]">
            <p>
              Redeemo started from a simple frustration: the best local restaurants, gyms, and shops rarely have any way to reward loyal customers, while big chains run endless promotions. The tools that exist for independent businesses, like Tastecard and Groupon, take a cut of every transaction and offer merchants no control over their own offers.
            </p>
            <p>
              We built Redeemo differently. Merchants set their own vouchers. Redeemo takes no commission, ever. Members pay a modest monthly subscription to unlock those offers. One redemption per merchant per cycle means the economics work for everyone: the member saves money on a real visit, the merchant acquires a new customer at full price the next time.
            </p>
            <p>
              We are UK-based and UK-focused. Every design decision, every policy, every feature exists to serve local businesses and the people who live near them.
            </p>
          </div>
        </div>
      </section>

      {/* Four value cards */}
      <section className="bg-[#FEF6F5] py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-10"
            style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}
          >
            What we stand for
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {VALUES.map(v => (
              <div key={v.title} className="bg-white rounded-xl border border-[#EDE8E8] p-8">
                <h3 className="font-body text-[16px] font-bold text-[#010C35] mb-3">{v.title}</h3>
                <p className="text-[14px] text-[#4B5563] leading-[1.75]">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Press placeholder */}
      <section className="bg-white py-16 px-6 border-t border-[#EDE8E8]">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9CA3AF] mb-6">
            Press
          </p>
          <p className="text-[14px] text-[#9CA3AF]">
            Media coverage and press assets coming soon.{' '}
            <Link href="/contact" className="text-[#E20C04] no-underline hover:underline">
              Contact us
            </Link>{' '}
            for press enquiries.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-[#F8F9FA] py-16 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}
          >
            Get in touch
          </h2>
          <p className="text-[14px] text-[#4B5563] mb-6">
            Questions, feedback, or just want to say hello.
          </p>
          <Link
            href="/contact"
            className="inline-block text-white font-semibold text-[14px] px-7 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
          >
            Contact us
          </Link>
        </div>
      </section>
    </>
  )
}
```

- [ ] **Step 2: Run typecheck and commit**

```bash
cd apps/customer-web && npm run typecheck
git add apps/customer-web/app/about/
git commit -m "feat: add /about page — story, value cards, press placeholder"
```

---

## Task 5: /faq page

**Files:**
- Create: `apps/customer-web/app/faq/page.tsx`

The FAQ requires client-side state for search filtering and sidebar navigation, so it is a Client Component.

- [ ] **Step 1: Create the directory and page**

```bash
mkdir -p apps/customer-web/app/faq
```

Create `apps/customer-web/app/faq/page.tsx`:

```tsx
'use client'

import { useState, useMemo } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'

// Note: metadata export cannot be used in Client Components.
// Set page title via the layout or a generateMetadata wrapper if needed.

const FAQ_SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    items: [
      { q: 'Is Redeemo free to join?', a: 'Yes. Creating an account and browsing merchants is completely free. To redeem vouchers in-store, you need a paid subscription (from £6.99/month).' },
      { q: 'Do I need to download an app?', a: 'You can browse merchants and vouchers on this website for free. Redemption requires the Redeemo mobile app, which is available on iOS and Android.' },
      { q: 'Where is Redeemo available?', a: 'Redeemo is available across the UK. Merchant density varies by location — enter your postcode to see what is near you.' },
      { q: 'How do I create an account?', a: 'Click "Join free" and complete the registration form. You will receive a verification code to confirm your email address.' },
    ],
  },
  {
    id: 'subscription',
    title: 'Subscription and billing',
    items: [
      { q: 'What plans are available?', a: 'Free (browse only), Monthly (£6.99/month), and Annual (£69.99/year — approximately 2 months free).' },
      { q: 'Can I cancel at any time?', a: 'Yes. Cancel from your account page at any time. You keep access until the end of your current billing period. No partial refunds.' },
      { q: 'Is there a free trial?', a: 'No open free trials. Paid trials are occasionally available via promo codes issued through specific promotions.' },
      { q: 'Can I share my account?', a: 'No. Subscriptions are personal and non-transferable. One account per person.' },
      { q: 'What payment methods do you accept?', a: 'All major credit and debit cards via Stripe. No PayPal or bank transfer at this time.' },
    ],
  },
  {
    id: 'vouchers',
    title: 'Vouchers and redemption',
    items: [
      { q: 'How many times can I use a voucher per month?', a: 'Once per merchant per subscription cycle. Your cycle starts on your subscription date, not the calendar month. Unused vouchers do not carry over.' },
      { q: 'What is a branch PIN?', a: 'Each merchant branch has a unique PIN displayed in-venue. You enter it in the app to confirm you are physically present before a redemption code is generated.' },
      { q: 'Can I redeem vouchers on the website?', a: 'No. Redemption is mobile-app only. The website is for browsing, account management, and subscription purchase.' },
      { q: 'What if a merchant refuses my valid voucher?', a: 'Contact Redeemo support — not the merchant. All merchants sign a contract committing to honour valid redemptions. We will resolve it.' },
      { q: 'Do vouchers expire?', a: 'Redemption codes generated in-app are valid until the end of your current subscription cycle. The voucher itself is available as long as the merchant keeps it active.' },
    ],
  },
  {
    id: 'merchants',
    title: 'Merchants',
    items: [
      { q: 'How do merchants join?', a: 'Merchants apply via the For Businesses page. Listing is free. A 12-month contract is required, and merchants must offer two standard vouchers to be approved.' },
      { q: 'Do merchants pay a commission?', a: 'No. Redeemo charges no commission, no performance fees, and no listing fee. The only cost to merchants is the discount offered in their vouchers.' },
      { q: 'How do I suggest a merchant?', a: 'Use the "Suggest a merchant" option in the app or contact us via the website. We review all suggestions and reach out to suitable businesses.' },
    ],
  },
  {
    id: 'account',
    title: 'Account',
    items: [
      { q: 'How do I change my password?', a: 'Go to Account, then Profile, and use the "Change password" option at the bottom of the form.' },
      { q: 'How do I delete my account?', a: 'Go to Account, then Profile, scroll to the Danger zone at the bottom of the page, and follow the deletion steps. Account deletion is permanent and cannot be undone.' },
      { q: 'What data does Redeemo store about me?', a: 'Your name, email, subscription status, and redemption history. We do not share personal data with merchants. See our Privacy Policy for full details.' },
    ],
  },
  {
    id: 'technical',
    title: 'Technical',
    items: [
      { q: 'The app is not working. What do I do?', a: 'Force-close and reopen the app. If the issue persists, check for an app update in the App Store or Google Play. Contact support if the problem continues.' },
      { q: 'I am not receiving verification emails.', a: 'Check your spam folder. If the email is not there within a few minutes, contact support with your registered email address.' },
    ],
  },
]

export default function FaqPage() {
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState(FAQ_SECTIONS[0].id)

  const filtered = useMemo(() => {
    if (!query.trim()) return FAQ_SECTIONS
    const q = query.toLowerCase()
    return FAQ_SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(
        item => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
      ),
    })).filter(section => section.items.length > 0)
  }, [query])

  return (
    <>
      {/* Search hero */}
      <section className="bg-white py-14 px-6 border-b border-[#EDE8E8]">
        <div className="max-w-7xl mx-auto text-center max-w-[560px] mx-auto">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-4">Help centre</p>
          <h1
            className="font-display text-[#010C35] leading-[1.1] mb-6"
            style={{ fontSize: 'clamp(28px, 4vw, 48px)', letterSpacing: '-0.3px' }}
          >
            How can we help?
          </h1>
          <input
            type="search"
            placeholder="Search questions..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full h-12 px-5 rounded-lg border border-[#EDE8E8] text-[15px] text-[#010C35] placeholder:text-[#9CA3AF] outline-none focus:border-[#E20C04] transition-colors"
          />
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 py-12 lg:flex lg:gap-12">

        {/* Sidebar nav — desktop only */}
        {!query && (
          <nav aria-label="FAQ sections" className="hidden lg:flex flex-col gap-1 w-52 flex-shrink-0 sticky top-24 self-start">
            {FAQ_SECTIONS.map(section => (
              <button
                key={section.id}
                onClick={() => {
                  setActiveSection(section.id)
                  document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={`text-left px-4 py-2.5 rounded-lg text-[14px] transition-colors ${
                  activeSection === section.id
                    ? 'bg-white text-[#010C35] font-semibold shadow-sm border border-[#EDE8E8]'
                    : 'text-[#4B5563] hover:text-[#010C35] hover:bg-[#F8F9FA]'
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
        )}

        {/* Accordion content */}
        <main className="flex-1">
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-[15px] text-[#9CA3AF] mb-4">No results for &ldquo;{query}&rdquo;</p>
              <button onClick={() => setQuery('')} className="text-[14px] text-[#E20C04] font-medium hover:underline">
                Clear search
              </button>
            </div>
          )}

          {filtered.map(section => (
            <div key={section.id} id={section.id} className="mb-12 scroll-mt-24">
              <h2
                className="font-display text-[#010C35] mb-6"
                style={{ fontSize: 'clamp(18px, 2.5vw, 26px)' }}
              >
                {section.title}
              </h2>
              <div className="flex flex-col divide-y divide-[#EDE8E8] border border-[#EDE8E8] rounded-xl overflow-hidden">
                {section.items.map(item => (
                  <details key={item.q} className="group bg-white">
                    <summary className="flex justify-between items-start gap-4 cursor-pointer list-none px-6 py-5">
                      <span className="text-[15px] font-medium text-[#010C35] leading-snug">{item.q}</span>
                      <span className="text-[#9CA3AF] flex-shrink-0 mt-0.5 transition-transform group-open:rotate-45 text-[20px] leading-none">+</span>
                    </summary>
                    <div className="px-6 pb-5">
                      <p className="text-[14px] text-[#4B5563] leading-[1.65]">{item.a}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}

          {/* Support CTA */}
          {!query && (
            <div className="mt-4 bg-[#F8F9FA] rounded-xl p-8 text-center">
              <h3 className="font-display text-[#010C35] text-[20px] mb-3">Still have questions?</h3>
              <p className="text-[14px] text-[#4B5563] mb-5">Our support team is here to help.</p>
              <Link
                href="/contact"
                className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
              >
                Contact support
              </Link>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Run typecheck and commit**

```bash
cd apps/customer-web && npm run typecheck
git add apps/customer-web/app/faq/
git commit -m "feat: add /faq page — searchable accordion, sidebar navigation, support CTA"
```

---

## Task 6: /insider pages (listing + single post)

**Files:**
- Create: `apps/customer-web/app/insider/page.tsx` — static shell, no CMS API yet
- Create: `apps/customer-web/app/insider/[slug]/page.tsx` — 404 fallback until CMS is wired

- [ ] **Step 1: Create directories**

```bash
mkdir -p apps/customer-web/app/insider/\[slug\]
```

- [ ] **Step 2: Create insider listing page**

Create `apps/customer-web/app/insider/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Insider',
  description: 'Local guides, member picks, and staff recommendations from the Redeemo community.',
}

const CATEGORIES = ['All', 'Food & Drink', 'Health & Fitness', 'Beauty', 'Wellness', 'Local Guides', "Members' Picks"]

export default function InsiderPage() {
  return (
    <>
      {/* Header */}
      <section className="bg-white py-16 px-6 border-b border-[#EDE8E8]">
        <div className="max-w-7xl mx-auto">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-4">
            Insider
          </p>
          <h1
            className="font-display text-[#010C35] leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(32px, 4vw, 52px)', letterSpacing: '-0.3px' }}
          >
            Guides, picks, and hidden gems.
          </h1>
          <p className="text-[15px] text-[#4B5563] max-w-[480px]">
            Written by Redeemo members and our local editors. Real places, real experiences.
          </p>
        </div>
      </section>

      {/* Category filter pills */}
      <section className="bg-white border-b border-[#EDE8E8] sticky top-[60px] z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex gap-2 overflow-x-auto scrollbar-none">
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                i === 0
                  ? 'text-white'
                  : 'bg-white border border-[#EDE8E8] text-[#4B5563] hover:border-[#010C35] hover:text-[#010C35]'
              }`}
              style={i === 0 ? { background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' } : undefined}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Empty state — placeholder until CMS is wired */}
      <section className="bg-[#F8F9FA] py-24 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center text-white text-[24px] font-display"
            style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
            aria-hidden
          >
            i
          </div>
          <h2 className="font-display text-[#010C35] text-[24px] mb-3">Content coming soon</h2>
          <p className="text-[14px] text-[#9CA3AF] max-w-[360px] mx-auto mb-8">
            The Insider is being curated. Check back soon for local guides, member picks, and staff recommendations.
          </p>
          <Link
            href="/discover"
            className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
          >
            Discover merchants instead
          </Link>
        </div>
      </section>
    </>
  )
}
```

- [ ] **Step 3: Create single post page (404 fallback)**

Create `apps/customer-web/app/insider/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'Insider Post' }

// All dynamic post routes 404 until a CMS API is connected.
// When CMS is available: fetch post by slug, render full article layout.
export default function InsiderPostPage() {
  notFound()
}
```

- [ ] **Step 4: Run typecheck and commit**

```bash
cd apps/customer-web && npm run typecheck
git add apps/customer-web/app/insider/
git commit -m "feat: add /insider shell — listing page with placeholder, single post 404 fallback"
```

---

## Task 7: /map page (Mapbox placeholder)

**Files:**
- Create: `apps/customer-web/app/map/page.tsx`

**Note on Mapbox:** The full map implementation requires a `NEXT_PUBLIC_MAPBOX_TOKEN` environment variable and the `mapbox-gl` package. This task creates a functional page shell with a placeholder that degrades gracefully. The Mapbox integration is a separate task once the token is available.

- [ ] **Step 1: Create the directory and page**

```bash
mkdir -p apps/customer-web/app/map
```

Create `apps/customer-web/app/map/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Map',
  description: 'Find Redeemo merchants on a map near you.',
}

export default function MapPage() {
  return (
    <div className="relative h-[calc(100dvh-60px)] flex flex-col">

      {/* Filter bar — pinned top */}
      <div className="bg-white border-b border-[#EDE8E8] px-6 py-3 flex items-center gap-3 z-10">
        <div className="flex gap-2 overflow-x-auto scrollbar-none flex-1">
          {['All', 'Food & Drink', 'Gyms', 'Salons', 'Wellness', 'Retail'].map((cat, i) => (
            <button
              key={cat}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                i === 0
                  ? 'text-white'
                  : 'bg-white border border-[#EDE8E8] text-[#4B5563] hover:border-[#010C35]'
              }`}
              style={i === 0 ? { background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' } : undefined}
            >
              {cat}
            </button>
          ))}
        </div>
        <button className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#EDE8E8] text-[13px] font-medium text-[#4B5563] hover:border-[#010C35] transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M2 4h10M4 7h6M5.5 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Filters
        </button>
      </div>

      {/* Map placeholder */}
      <div className="flex-1 bg-[#F8F9FA] flex items-center justify-center relative">
        <div className="text-center px-6">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
            aria-hidden
          >
            {/* Map pin icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
          </div>
          <h2 className="font-display text-[#010C35] text-[24px] mb-3">Map coming soon</h2>
          <p className="text-[14px] text-[#9CA3AF] max-w-[320px] mx-auto mb-8">
            The map view is being integrated. In the meantime, use the Discover page to find merchants near you.
          </p>
          <Link
            href="/discover"
            className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
          >
            Browse merchants instead
          </Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck and commit**

```bash
cd apps/customer-web && npm run typecheck
git add apps/customer-web/app/map/
git commit -m "feat: add /map page shell — filter bar, Mapbox placeholder with discover fallback"
```

---

## Task 8: /verify page (OTP)

**Files:**
- Create: `apps/customer-web/app/verify/page.tsx`

This page handles two use cases: post-registration email verification and any future second-factor flows. It reads `?email=` from the URL and accepts a 6-digit OTP.

- [ ] **Step 1: Create the directory and page**

```bash
mkdir -p apps/customer-web/app/verify
```

Create `apps/customer-web/app/verify/page.tsx`:

```tsx
'use client'

import { useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { authApi, ApiError } from '@/lib/api'

function VerifyForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const email = searchParams.get('email') ?? ''
  const next = searchParams.get('next') ?? '/account'

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setError(null)
    setLoading(true)
    try {
      await authApi.verifyEmail({ email, code })
      router.push(next)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Verification failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setError(null)
    try {
      await authApi.resendVerification(email)
      setResent(true)
    } catch {
      setError('Could not resend code. Please wait a moment and try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-[calc(100dvh-60px)] flex items-center justify-center px-6 bg-white">
      <div className="w-full max-w-[380px]">

        {/* Logo mark */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-display font-semibold text-[22px] mx-auto mb-8"
          style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
          aria-hidden
        >
          R
        </div>

        <h1 className="font-display text-[#010C35] text-[28px] leading-none mb-2 text-center">
          Check your email
        </h1>
        {email && (
          <p className="text-[14px] text-[#9CA3AF] text-center mb-8">
            We sent a 6-digit code to <span className="text-[#4B5563] font-medium">{email}</span>
          </p>
        )}

        <form onSubmit={e => void handleSubmit(e)} className="flex flex-col gap-4">
          <div>
            <label htmlFor="otp" className="block text-[12px] font-bold tracking-[0.08em] uppercase text-[#9CA3AF] mb-2">
              Verification code
            </label>
            <input
              ref={inputRef}
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full h-12 px-4 rounded-lg border border-[#EDE8E8] text-[#010C35] text-[20px] tracking-[0.3em] text-center placeholder:text-[#D1D5DB] placeholder:tracking-normal outline-none focus:border-[#E20C04] transition-colors font-mono"
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-[13px] text-[#B91C1C] bg-[#FEF2F2] px-4 py-3 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="h-12 rounded-lg text-white font-semibold text-[15px] disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
          >
            {loading ? 'Verifying...' : 'Verify email'}
          </button>
        </form>

        <div className="mt-6 text-center">
          {resent ? (
            <p className="text-[13px] text-[#16A34A]">Code resent. Check your inbox.</p>
          ) : (
            <button
              onClick={() => void handleResend()}
              disabled={resending}
              className="text-[13px] text-[#4B5563] hover:text-[#010C35] transition-colors disabled:opacity-50 bg-transparent border-none cursor-pointer"
            >
              {resending ? 'Resending...' : "Didn't receive it? Resend code"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  )
}
```

**Note:** `authApi.verifyEmail` and `authApi.resendVerification` may not exist yet in `lib/api.ts`. If they do not, add them:

```ts
// Add to authApi in apps/customer-web/lib/api.ts:
verifyEmail: (params: { email: string; code: string }) =>
  apiFetch<{ message: string }>('/api/v1/customer/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify(params),
  }),

resendVerification: (email: string) =>
  apiFetch<{ message: string }>('/api/v1/customer/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Fix any missing method errors by adding the api stubs above to `lib/api.ts`. Re-run typecheck until clean.

- [ ] **Step 3: Commit**

```bash
git add apps/customer-web/app/verify/ apps/customer-web/lib/api.ts
git commit -m "feat: add /verify OTP page, add verifyEmail and resendVerification to authApi"
```

---

## Task 9: /account/subscription page (3-step cancel flow)

**Files:**
- Create: `apps/customer-web/app/account/subscription/page.tsx`

**Cancel flow:** 3-step inline (no separate page):
1. Reason selection (required from 7 options)
2. Conditional retention offer (shown only if user has unredeemed saved vouchers OR has saved > £6.99)
3. Confirm with exact access-end date

- [ ] **Step 1: Create the directory and page**

```bash
mkdir -p apps/customer-web/app/account/subscription
```

Create `apps/customer-web/app/account/subscription/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AccountNav } from '@/components/account/AccountNav'
import { subscriptionApi, ApiError } from '@/lib/api'

type MySubscription = {
  status: string
  plan: { name: string; interval: string; price: number; currency: string } | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  paymentMethod?: { last4: string; brand: string } | null
}

const CANCEL_REASONS = [
  'Too expensive',
  'Not enough merchants near me',
  'Not using it enough',
  'Found a better alternative',
  'Cancelling temporarily',
  'Privacy concerns',
  'Other',
]

type CancelStep = 'idle' | 'reason' | 'retention' | 'confirm' | 'cancelling' | 'cancelled'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(price / 100)
}

export default function SubscriptionPage() {
  const router = useRouter()
  const [subscription, setSubscription] = useState<MySubscription | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [cancelStep, setCancelStep] = useState<CancelStep>('idle')
  const [cancelReason, setCancelReason] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  useEffect(() => {
    subscriptionApi.get()
      .then(data => {
        setSubscription(data as MySubscription)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.statusCode === 401) {
          router.push('/login?next=/account/subscription')
          return
        }
        if (err instanceof ApiError && err.statusCode === 404) {
          setSubscription(null)
          setIsLoading(false)
          return
        }
        setIsLoading(false)
      })
  }, [router])

  async function handleCancelConfirm() {
    setCancelStep('cancelling')
    setCancelError(null)
    try {
      await subscriptionApi.cancel()
      // Re-fetch to get updated state
      const updated = await subscriptionApi.get()
      setSubscription(updated as MySubscription)
      setCancelStep('cancelled')
    } catch {
      setCancelError('Could not cancel. Please try again or contact support.')
      setCancelStep('confirm')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA]">
        <AccountNav variant="mobile" />
        <div className="max-w-7xl mx-auto px-6 py-10 lg:flex lg:gap-12">
          <AccountNav variant="desktop" />
          <main className="flex-1 max-w-2xl animate-pulse">
            <div className="h-4 w-28 bg-[#010C35]/[0.06] rounded mb-3" />
            <div className="h-8 w-48 bg-[#010C35]/[0.06] rounded mb-8" />
            <div className="h-[180px] bg-[#010C35]/[0.04] rounded-xl" />
          </main>
        </div>
      </div>
    )
  }

  const sub = subscription
  const isActive = sub && ['ACTIVE', 'TRIALLING'].includes(sub.status)
  const isCancelled = sub?.cancelAtPeriodEnd || sub?.status === 'CANCELLED'

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <AccountNav variant="mobile" />
      <div className="max-w-7xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />

        <main className="flex-1 max-w-2xl">
          <div className="mb-8">
            <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF] mb-2">Account</p>
            <h1 className="font-display text-[clamp(26px,4vw,38px)] text-[#010C35] leading-none">Subscription</h1>
          </div>

          {/* No subscription state */}
          {!sub && (
            <div className="bg-white rounded-xl border border-[#EDE8E8] p-8 text-center">
              <p className="text-[15px] text-[#4B5563] mb-6">You do not have an active subscription.</p>
              <Link
                href="/subscribe"
                className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
              >
                View plans
              </Link>
            </div>
          )}

          {/* Active subscription details */}
          {sub && isActive && (
            <div className="bg-white rounded-xl border border-[#EDE8E8] p-8 mb-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF] mb-1">Current plan</p>
                  <p className="font-display text-[22px] text-[#010C35]">{sub.plan?.name ?? 'Unknown plan'}</p>
                </div>
                <span
                  className="text-[11px] font-bold px-3 py-1 rounded-full text-white"
                  style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
                >
                  Active
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-[14px] mb-6">
                <div>
                  <p className="text-[#9CA3AF] mb-0.5">Price</p>
                  <p className="font-medium text-[#010C35]">
                    {sub.plan ? formatPrice(sub.plan.price, sub.plan.currency) : '—'}
                    {sub.plan?.interval === 'MONTHLY' ? '/month' : '/year'}
                  </p>
                </div>
                {sub.currentPeriodEnd && (
                  <div>
                    <p className="text-[#9CA3AF] mb-0.5">
                      {isCancelled ? 'Access until' : 'Renews'}
                    </p>
                    <p className="font-medium text-[#010C35]">{formatDate(sub.currentPeriodEnd)}</p>
                  </div>
                )}
                {sub.paymentMethod && (
                  <div>
                    <p className="text-[#9CA3AF] mb-0.5">Payment method</p>
                    <p className="font-medium text-[#010C35]">
                      {sub.paymentMethod.brand.charAt(0).toUpperCase() + sub.paymentMethod.brand.slice(1)} ending {sub.paymentMethod.last4}
                    </p>
                  </div>
                )}
              </div>

              {/* Cancel flow */}
              {!isCancelled && cancelStep === 'idle' && (
                <div className="border-t border-[#EDE8E8] pt-5">
                  <button
                    onClick={() => setCancelStep('reason')}
                    className="text-[13px] text-[#9CA3AF] hover:text-[#4B5563] transition-colors bg-transparent border-none cursor-pointer"
                  >
                    Cancel subscription
                  </button>
                </div>
              )}

              {/* Step 1: Reason */}
              {cancelStep === 'reason' && (
                <div className="border-t border-[#EDE8E8] pt-5">
                  <p className="text-[14px] font-medium text-[#010C35] mb-4">Why are you cancelling?</p>
                  <div className="flex flex-col gap-2 mb-5">
                    {CANCEL_REASONS.map(reason => (
                      <label key={reason} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="cancel-reason"
                          value={reason}
                          checked={cancelReason === reason}
                          onChange={() => setCancelReason(reason)}
                          className="w-4 h-4 accent-[#E20C04]"
                        />
                        <span className="text-[14px] text-[#4B5563]">{reason}</span>
                      </label>
                    ))}
                  </div>
                  {cancelReason === 'Other' && (
                    <textarea
                      value={otherReason}
                      onChange={e => setOtherReason(e.target.value)}
                      placeholder="Tell us more (optional)"
                      className="w-full h-24 px-4 py-3 rounded-lg border border-[#EDE8E8] text-[14px] text-[#010C35] placeholder:text-[#9CA3AF] outline-none focus:border-[#E20C04] resize-none mb-4 transition-colors"
                    />
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (!cancelReason) return
                        // Skip retention offer — go straight to confirm (retention logic simplified; full implementation checks savings API)
                        setCancelStep('confirm')
                      }}
                      disabled={!cancelReason}
                      className="text-[14px] font-medium text-[#B91C1C] border border-[#B91C1C]/30 bg-[#FEF2F2] px-5 py-2.5 rounded-lg disabled:opacity-40 hover:bg-[#FEE2E2] transition-colors"
                    >
                      Continue to cancel
                    </button>
                    <button
                      onClick={() => { setCancelReason(''); setCancelStep('idle') }}
                      className="text-[14px] font-medium text-[#4B5563] px-5 py-2.5 rounded-lg hover:text-[#010C35] transition-colors bg-transparent border-none cursor-pointer"
                    >
                      Keep subscription
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Confirm */}
              {(cancelStep === 'confirm' || cancelStep === 'cancelling') && (
                <div className="border-t border-[#EDE8E8] pt-5">
                  {sub.currentPeriodEnd && (
                    <p className="text-[14px] text-[#4B5563] mb-5">
                      Your subscription will end on <strong className="text-[#010C35]">{formatDate(sub.currentPeriodEnd)}</strong>. You keep full access until that date.
                    </p>
                  )}
                  {cancelError && (
                    <p role="alert" className="text-[13px] text-[#B91C1C] bg-[#FEF2F2] px-4 py-3 rounded-lg mb-4">
                      {cancelError}
                    </p>
                  )}
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => { setCancelReason(''); setCancelStep('idle') }}
                      className="text-[14px] font-semibold text-white px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
                      style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
                    >
                      Keep my membership
                    </button>
                    <button
                      onClick={() => void handleCancelConfirm()}
                      disabled={cancelStep === 'cancelling'}
                      className="text-[14px] font-medium text-[#9CA3AF] border border-[#EDE8E8] px-6 py-2.5 rounded-lg hover:text-[#4B5563] hover:border-[#4B5563] disabled:opacity-50 transition-colors bg-transparent cursor-pointer"
                    >
                      {cancelStep === 'cancelling' ? 'Cancelling...' : 'Confirm cancellation'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cancelled state */}
          {(isCancelled || cancelStep === 'cancelled') && sub && (
            <div className="bg-white rounded-xl border border-[#EDE8E8] p-8">
              <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF] mb-2">Subscription</p>
              <p className="font-display text-[20px] text-[#010C35] mb-3">Cancelled</p>
              {sub.currentPeriodEnd && (
                <p className="text-[14px] text-[#4B5563] mb-6">
                  Your access continues until <strong className="text-[#010C35]">{formatDate(sub.currentPeriodEnd)}</strong>.
                </p>
              )}
              <Link
                href="/subscribe"
                className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
              >
                Reactivate subscription
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors. `subscriptionApi.get()` returns `MySubscription` — verify the type shape matches `lib/api.ts:MySubscription`. If there are field mismatches, align the local `MySubscription` type in this file to what the API returns.

- [ ] **Step 3: Visual check**

Log in as `customer@redeemo.com` / `Customer1234!` and navigate to http://localhost:3001/account/subscription. Confirm: subscription details card, "Cancel subscription" link at bottom, cancel flow with reason selection radio buttons, confirm step with exact date and two buttons ("Keep my membership" primary gradient, "Confirm cancellation" ghost).

- [ ] **Step 4: Commit**

```bash
git add apps/customer-web/app/account/subscription/
git commit -m "feat: add /account/subscription page — active state, 3-step cancel flow, cancelled state"
```

---

## Phase 2 Complete

All nine missing pages are now built. The customer website has full page coverage per the design spec.

**Summary of pages added:**
- `/how-it-works` — 6-step two-phase layout, free plan features, FAQ, app CTA
- `/pricing` — three plan cards, FAQ accordion, dual CTA
- `/for-businesses` — navy hero, commercial facts, comparison table, merchant how-it-works, apply CTA
- `/about` — stat bar, story, value cards, press placeholder, contact
- `/faq` — searchable accordion, sidebar navigation, support CTA
- `/insider` — category pills, placeholder state, single post 404 fallback
- `/map` — filter bar, placeholder with discover fallback
- `/verify` — OTP input, resend flow, post-registration use case
- `/account/subscription` — subscription details, 3-step inline cancel flow, cancelled state

**Typecheck command (run at any time to verify all pages):**
```bash
cd /Users/shebinchaliyath/Desktop/Claude\ Code/Redeemo/.worktrees/customer-web/apps/customer-web && npm run typecheck
```
