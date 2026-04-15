'use client'
import { motion } from 'framer-motion'

type Plan = {
  id: string
  name: string
  interval: 'MONTHLY' | 'ANNUAL'
  price: number | string
  currency: string
}

type Props = {
  plans: Plan[]
  selectedPlanId: string | null
  onSelect: (planId: string) => void
}

function formatPrice(price: number | string, currency: string): string {
  const num = Number(price)
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(num)
}

const INTERVAL_LABELS: Record<string, { period: string; badge: string | null }> = {
  MONTHLY: { period: '/month', badge: null },
  ANNUAL:  { period: '/year',  badge: 'Best value' },
}

export function PlanSelector({ plans, selectedPlanId, onSelect }: Props) {
  return (
    <div role="group" aria-label="Choose a subscription plan" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {plans.map((plan, i) => {
        const isSelected = plan.id === selectedPlanId
        const isAnnual = plan.interval === 'ANNUAL'
        const { period, badge } = INTERVAL_LABELS[plan.interval] ?? { period: '', badge: null }
        const monthly = isAnnual ? Number(plan.price) / 12 : null

        const cardBase = isAnnual ? 'bg-navy text-white' : 'bg-white text-navy'
        const cardBorder = isSelected
          ? isAnnual
            ? 'border-red shadow-[0_0_0_4px_rgba(226,0,12,0.2)]'
            : 'border-red shadow-[0_0_0_4px_rgba(226,0,12,0.08)]'
          : isAnnual
            ? 'border-navy/40 hover:border-red/40'
            : 'border-navy/[0.1] hover:border-navy/25'

        const labelColour  = isAnnual ? 'text-white/40' : 'text-navy/45'
        const priceColour  = isAnnual ? 'text-white'    : 'text-navy'
        const periodColour = isAnnual ? 'text-white/40' : 'text-navy/40'
        const savingColour = isAnnual ? 'text-white/40' : 'text-navy/40'
        const featColour   = isAnnual ? 'text-white/65' : 'text-navy/60'

        return (
          <motion.button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            whileHover={{ y: -3 }}
            aria-pressed={isSelected}
            className={`relative text-left p-7 rounded-2xl border-2 transition-all ${cardBase} ${cardBorder}`}
          >
            {badge && (
              <span className="absolute top-4 right-4 font-mono text-[10px] tracking-[0.1em] uppercase bg-gradient-to-br from-red to-orange-red text-white px-3 py-1 rounded-full">
                {badge}
              </span>
            )}

            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-4 left-4 w-5 h-5 rounded-full bg-gradient-to-br from-red to-orange-red flex items-center justify-center"
                aria-hidden="true"
              >
                <span className="text-white text-[11px]">✓</span>
              </motion.div>
            )}

            <div className={isSelected ? 'pl-7' : ''}>
              <p className={`font-mono text-[11px] tracking-[0.1em] uppercase mb-3 ${labelColour}`}>
                {plan.name}
              </p>

              <div className="flex items-baseline gap-1 mb-1">
                <span className={`font-display text-[42px] leading-none ${priceColour}`}>
                  {formatPrice(plan.price, plan.currency)}
                </span>
                <span className={`font-mono text-[13px] ${periodColour}`}>{period}</span>
              </div>

              {monthly !== null && (
                <p className={`font-mono text-[12px] mb-4 ${savingColour}`}>
                  ≈ {formatPrice(monthly, plan.currency)}/month
                </p>
              )}

              <ul className="flex flex-col gap-2 mt-4">
                {[
                  'Unlimited voucher browsing',
                  'Redeem in the app',
                  'Cancel anytime',
                  ...(isAnnual ? ['~2 months free vs monthly'] : []),
                ].map(feat => (
                  <li key={feat} className={`flex items-center gap-2 text-[13px] ${featColour}`}>
                    <span className="flex-shrink-0 text-orange-red" aria-hidden="true">✓</span>
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
