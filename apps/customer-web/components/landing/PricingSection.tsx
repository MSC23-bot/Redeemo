import Link from 'next/link'

const plans = [
  {
    name: 'Monthly',
    price: '£6.99',
    period: 'per month',
    badge: null as string | null,
    features: [
      'Unlimited voucher browsing',
      'One redemption per voucher per cycle',
      'All local categories',
      'Cancel any time',
    ],
    cta: 'Subscribe monthly',
    highlight: false,
  },
  {
    name: 'Annual',
    price: '£69.99',
    period: 'per year',
    badge: 'Best value — 2 months free' as string | null,
    features: [
      'Everything in Monthly',
      'Save ~£14 vs monthly billing',
      'Priority access to new merchants',
      'Cancel any time',
    ],
    cta: 'Subscribe annually',
    highlight: true,
  },
]

export function PricingSection() {
  return (
    <section className="bg-white py-24 px-6">
      <div className="max-w-screen-xl mx-auto">
        <div className="text-center mb-16">
          <p className="font-mono text-xs tracking-[0.12em] uppercase text-red mb-4">Pricing</p>
          <h2 className="font-display text-navy leading-[1.15] mb-4" style={{ fontSize: 'clamp(32px, 4vw, 52px)' }}>
            One subscription, unlimited local savings
          </h2>
          <p className="text-base text-navy/55 max-w-[480px] mx-auto">
            Free to browse. Subscribe to unlock redemptions.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-[800px] mx-auto">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`relative rounded-[20px] p-10 ${plan.highlight ? 'bg-navy' : 'bg-white border border-navy/[0.1]'}`}
            >
              {plan.badge && (
                <div
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-white text-xs font-semibold px-4 py-1 rounded-full whitespace-nowrap"
                  style={{ background: 'linear-gradient(135deg, #E2000C, #EE6904)' }}
                >
                  {plan.badge}
                </div>
              )}

              <p className={`text-xs font-semibold uppercase tracking-[0.05em] mb-3 ${plan.highlight ? 'text-white/50' : 'text-navy/50'}`}>
                {plan.name}
              </p>
              <div className="mb-1">
                <span className={`font-display text-[52px] leading-none ${plan.highlight ? 'text-white' : 'text-navy'}`}>
                  {plan.price}
                </span>
              </div>
              <p className={`font-mono text-sm mb-8 ${plan.highlight ? 'text-white/40' : 'text-navy/40'}`}>
                {plan.period}
              </p>

              <ul className="flex flex-col gap-3 mb-9">
                {plan.features.map(f => (
                  <li key={f} className={`flex items-start gap-2.5 text-sm leading-snug ${plan.highlight ? 'text-white/75' : 'text-navy/70'}`}>
                    <span className="text-red flex-shrink-0 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/subscribe"
                className={`block text-center font-semibold text-[15px] py-3.5 rounded-xl no-underline transition-opacity hover:opacity-90 ${plan.highlight ? 'text-white' : 'text-white bg-navy'}`}
                style={plan.highlight ? { background: 'linear-gradient(135deg, #E2000C, #E84A00)' } : undefined}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center mt-6 text-xs text-navy/40">
          Free plan available — browse all merchants and vouchers without subscribing.
        </p>
      </div>
    </section>
  )
}
