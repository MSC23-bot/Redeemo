export function MerchantPricingSection() {
  const freePlan = {
    tier: 'Standard listing',
    price: 'Free',
    period: 'Always free to list',
    features: [
      'Full merchant profile',
      'Two mandatory vouchers',
      'Branch management',
      'Redemption tracking',
      'Customer analytics dashboard',
      'No commission on redemptions',
    ],
  }

  const featuredPlan = {
    tier: 'Featured placement',
    price: 'Custom',
    period: 'Priced per campaign',
    features: [
      'Everything in Standard',
      'Top placement in local discovery feed',
      'Home page featured section',
      'Configurable radius targeting',
      'Campaign duration you set',
      'Dedicated account support',
    ],
  }

  return (
    <section id="pricing" className="bg-navy py-24 px-6">
      <div className="max-w-screen-xl mx-auto">
        <div className="text-center mb-16">
          <p className="font-mono text-xs tracking-[0.12em] uppercase text-orange-red mb-4">Merchant pricing</p>
          <h2 className="font-display text-[clamp(30px,3.5vw,48px)] font-normal text-white leading-[1.15] mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-base text-white/50 max-w-[480px] mx-auto">
            No commission. No per-redemption fees. Pay only for the reach you want.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-[860px] mx-auto">
          {/* Free card */}
          <div className="rounded-[20px] p-10 border border-white/[0.1]">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-white/40 mb-3">{freePlan.tier}</p>
            <p className="font-display text-[52px] text-white leading-none mb-1.5">{freePlan.price}</p>
            <p className="font-mono text-sm text-white/35 mb-8">{freePlan.period}</p>
            <ul className="flex flex-col gap-3">
              {freePlan.features.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-white/65 leading-snug">
                  <span className="text-orange flex-shrink-0 mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Featured card */}
          <div
            className="rounded-[20px] p-10 border border-orange/25"
            style={{ background: 'rgba(238,105,4,0.08)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-orange-red mb-3">{featuredPlan.tier}</p>
            <p className="font-display text-[52px] text-white leading-none mb-1.5">{featuredPlan.price}</p>
            <p className="font-mono text-sm text-white/35 mb-8">{featuredPlan.period}</p>
            <ul className="flex flex-col gap-3 mb-8">
              {featuredPlan.features.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-white/65 leading-snug">
                  <span className="text-orange flex-shrink-0 mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="mailto:merchants@redeemo.com"
              className="block text-center text-white font-semibold text-[15px] py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #E2000C, #EE6904)' }}
            >
              Enquire about featured
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
