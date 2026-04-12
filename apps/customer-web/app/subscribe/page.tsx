'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { PlanSelector } from '@/components/subscribe/PlanSelector'
import { PaymentForm } from '@/components/subscribe/PaymentForm'
import { subscriptionApi } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'

type Plan = {
  id: string
  name: string
  interval: 'MONTHLY' | 'ANNUAL'
  price: number | string
  currency: string
}

type Subscription = {
  status: string
  plan: { name: string } | null
}

type CheckStep = 'loading' | 'already_subscribed' | 'select_plan' | 'payment' | 'done' | 'error'

const STEPS = ['Plan', 'Payment', 'Done']
const ACTIVE_STATUSES = ['ACTIVE', 'TRIALLING', 'PAST_DUE']

export default function SubscribePage() {
  const [checkStep, setCheckStep] = useState<CheckStep>('loading')
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null)

  useEffect(() => {
    const token = getAccessToken()

    Promise.all([
      subscriptionApi.getPlans(),
      token ? subscriptionApi.getMySubscription().catch(() => null) : Promise.resolve(null),
    ]).then(([plansData, sub]) => {
      setPlans(plansData)
      if (sub && ACTIVE_STATUSES.includes(sub.status)) {
        setCurrentSubscription(sub)
        setCheckStep('already_subscribed')
      } else {
        setCheckStep('select_plan')
      }
    }).catch(() => setCheckStep('error'))
  }, [])

  const handlePlanSelect = (planId: string) => {
    setSelectedPlanId(planId)
    setCheckStep('payment')
  }

  const stepIndex = checkStep === 'payment' ? 1 : checkStep === 'done' ? 2 : 0

  if (checkStep === 'loading') {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <span className="font-mono text-[12px] text-navy/35 animate-pulse">Loading…</span>
      </div>
    )
  }

  if (checkStep === 'error') {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-display text-[28px] text-navy mb-3">Something went wrong</h1>
          <p className="text-[15px] text-navy/50 mb-6">
            We couldn&apos;t load subscription plans. Please refresh and try again.
          </p>
          <button
            onClick={() => { setCheckStep('loading'); window.location.reload() }}
            className="bg-navy text-white font-medium text-[14px] px-6 py-3 rounded-xl hover:bg-navy/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (checkStep === 'already_subscribed') {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center text-2xl mx-auto mb-5" aria-hidden="true">
            ✓
          </div>
          <h1 className="font-display text-[32px] text-navy mb-2">You&apos;re already subscribed</h1>
          <p className="text-[15px] text-navy/50 mb-8">
            You&apos;re on the <strong>{currentSubscription?.plan?.name}</strong> plan.
            Your access continues until your next billing date.
          </p>
          <Link
            href="/account"
            className="inline-block bg-navy text-white font-bold text-[15px] px-8 py-3.5 rounded-xl no-underline hover:bg-navy/90 transition-colors"
          >
            Go to your account
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] px-6 py-16">
      <div className="max-w-screen-sm mx-auto">
        {/* Progress breadcrumb */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 ${i <= stepIndex ? 'text-navy' : 'text-navy/25'}`}>
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition-colors ${
                    i < stepIndex  ? 'bg-red border-red text-white' :
                    i === stepIndex ? 'border-navy text-navy' :
                    'border-navy/20 text-navy/25'
                  }`}
                >
                  {i < stepIndex ? '✓' : i + 1}
                </span>
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase">{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span className="text-navy/15 mx-1" aria-hidden="true">—</span>
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {checkStep === 'select_plan' && (
            <motion.div
              key="plan"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35 }}
            >
              <div className="relative mb-10">
                <span
                  aria-hidden="true"
                  className="absolute -top-6 -left-2 font-display text-[clamp(80px,12vw,140px)] leading-none text-navy opacity-[0.04] pointer-events-none select-none"
                >
                  Plans
                </span>
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-orange-red mb-3 relative z-10">
                  Subscription
                </p>
                <h1 className="font-display text-[clamp(32px,5vw,52px)] text-navy leading-[1.06] relative z-10 mb-3">
                  Choose your plan
                </h1>
                <p className="text-[15px] text-navy/50 leading-relaxed relative z-10">
                  Cancel anytime. No commitment beyond your billing period.
                </p>
              </div>
              <PlanSelector
                plans={plans}
                selectedPlanId={selectedPlanId}
                onSelect={handlePlanSelect}
              />
            </motion.div>
          )}

          {checkStep === 'payment' && selectedPlanId && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={() => setCheckStep('select_plan')}
                  className="text-navy/40 hover:text-navy transition-colors text-[14px]"
                  aria-label="Back to plan selection"
                >
                  ← Back
                </button>
                <h1 className="font-display text-[clamp(24px,3vw,34px)] text-navy">Payment details</h1>
              </div>
              <PaymentForm
                planId={selectedPlanId}
                onSuccess={() => setCheckStep('done')}
              />
            </motion.div>
          )}

          {checkStep === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, type: 'spring', damping: 20 }}
              className="text-center py-10"
            >
              <div className="text-6xl mb-5" aria-hidden="true">🎉</div>
              <h1 className="font-display text-[36px] text-navy mb-2">You&apos;re subscribed!</h1>
              <p className="text-[15px] text-navy/50 mb-8">
                Start discovering exclusive vouchers from local businesses near you.
              </p>
              <Link
                href="/discover"
                className="inline-block bg-gradient-to-br from-red to-orange-red text-white font-bold text-[16px] px-10 py-4 rounded-xl no-underline shadow-[0_4px_24px_rgba(226,0,12,0.25)]"
              >
                Discover local deals
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
