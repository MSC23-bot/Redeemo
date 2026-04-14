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
    a: 'You keep full access until the end of your current billing period. No partial refunds. Your access simply stops at the natural end of the period you paid for.',
  },
  {
    q: 'Is there a free trial?',
    a: 'No open free trials. Redeemo is free to browse forever. Paid trials are occasionally available via promo codes issued through specific promotions.',
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
                    style={{ background: 'var(--brand-gradient)' }}
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
                        aria-hidden="true"
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
                    style={{ background: 'var(--brand-gradient)' }}
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
                  <span className="text-[#9CA3AF] flex-shrink-0 mt-0.5 transition-transform group-open:rotate-45 text-[20px] leading-none" aria-hidden="true">+</span>
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
              style={{ background: 'var(--brand-gradient)' }}
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
