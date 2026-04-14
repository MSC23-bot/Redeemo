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
    body: 'Browse free. No card needed. To unlock voucher redemptions, choose a Monthly (£6.99) or Annual (£69.99) plan. Cancel any time.',
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
    note: 'The branch PIN is not a secret. It is displayed in-venue. If you cannot find it, ask a member of staff.',
  },
  {
    n: '06',
    title: 'Show your code to the member of staff to validate',
    body: 'The app generates a unique redemption code. Show it to the member of staff. They scan or enter it in the Redeemo merchant app to validate.',
    note: 'If a merchant refuses a valid voucher, contact Redeemo support, not the merchant directly.',
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
    a: 'No. You can browse all merchants and voucher details on this website for free. Redemption requires the mobile app. That is by design, not a restriction.',
  },
  {
    q: 'Can I use Redeemo in any city?',
    a: 'Redeemo is available across the UK. Merchant density varies by location. Enter your postcode or allow location access to see what is near you.',
  },
  {
    q: 'What happens if a merchant refuses my voucher?',
    a: 'Contact Redeemo support directly. Do not negotiate with the merchant. All merchants sign a contract committing to honour valid redemptions.',
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

function StepBlock({ step }: { step: (typeof PHASE1_STEPS | typeof PHASE2_STEPS)[0] }) {
  return (
    <div className="flex gap-6 items-start">
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0"
        style={{ background: 'var(--brand-gradient)' }}
        aria-hidden="true"
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
        <div className="max-w-[640px] mx-auto">
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
        <div className="max-w-[640px] mx-auto">
          <h2 className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9CA3AF] mb-8">
            Phase 1: Getting started
          </h2>
          <div className="flex flex-col gap-10">
            {PHASE1_STEPS.map(step => (
              <StepBlock key={step.n} step={step} />
            ))}
          </div>
        </div>
      </section>

      {/* Phase 2 */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-[640px] mx-auto">
          <h2 className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9CA3AF] mb-8">
            Phase 2: Redeeming a voucher
          </h2>
          <div className="flex flex-col gap-10">
            {PHASE2_STEPS.map(step => (
              <StepBlock key={step.n} step={step} />
            ))}
          </div>
        </div>
      </section>

      {/* Free plan features */}
      <section className="bg-[#FEF6F5] py-16 px-6">
        <div className="max-w-[640px] mx-auto">
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
                  style={f.included ? { background: 'var(--brand-gradient)' } : undefined}
                  aria-hidden="true"
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
              style={{ background: 'var(--brand-gradient)' }}
            >
              Get started, from £6.99/mo
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

      {/* FAQ accordion */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-[640px] mx-auto">
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
                  <span className="text-[#9CA3AF] flex-shrink-0 mt-0.5 transition-transform group-open:rotate-45 text-[20px] leading-none" aria-hidden="true">+</span>
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
        style={{ background: 'var(--brand-gradient)' }}
      >
        <div className="max-w-[480px] mx-auto">
          <h2 className="font-display text-white text-[28px] leading-[1.1] mb-4">
            Ready to start saving?
          </h2>
          <p className="text-[14px] text-white/75 mb-8">
            Download the app to redeem vouchers in-store. Browse free on the website anytime.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <button disabled aria-label="App Store — coming soon" className="h-11 px-6 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center cursor-not-allowed opacity-70">
              <span className="text-[13px] font-semibold text-white">App Store</span>
            </button>
            <button disabled aria-label="Google Play — coming soon" className="h-11 px-6 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center cursor-not-allowed opacity-70">
              <span className="text-[13px] font-semibold text-white">Google Play</span>
            </button>
          </div>
          <p className="mt-4 text-[12px] text-white/50">Apps coming soon</p>
        </div>
      </section>
    </>
  )
}
