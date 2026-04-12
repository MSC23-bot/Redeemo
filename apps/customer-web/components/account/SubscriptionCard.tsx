'use client'
import Link from 'next/link'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { subscriptionApi, type MySubscription } from '@/lib/api'

const STATUS_LABELS: Record<string, { label: string; colour: string }> = {
  ACTIVE:    { label: 'Active',    colour: 'bg-green-50 text-green-700 border-green-200' },
  TRIALLING: { label: 'Trial',     colour: 'bg-blue-50 text-blue-700 border-blue-200' },
  PAST_DUE:  { label: 'Past due',  colour: 'bg-amber-50 text-amber-700 border-amber-200' },
  CANCELLED: { label: 'Cancelled', colour: 'bg-navy/[0.05] text-navy/50 border-navy/10' },
}

export function SubscriptionCard({ subscription }: { subscription: MySubscription | null }) {
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  const handleCancel = async () => {
    if (!confirm("Cancel your subscription? You'll keep access until the end of your billing period.")) return
    setCancelling(true)
    try {
      await subscriptionApi.cancel()
      setCancelled(true)
    } finally {
      setCancelling(false)
    }
  }

  if (!subscription || cancelled) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white border border-navy/[0.08] rounded-2xl p-6"
      >
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-2">Subscription</p>
        <p className="font-display text-[20px] text-navy mb-1">
          {cancelled ? 'Cancellation confirmed' : 'No active subscription'}
        </p>
        <p className="text-[14px] text-navy/50 mb-5">
          {cancelled && subscription
            ? `Access continues until ${new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
            : 'Subscribe to unlock voucher redemption in the app.'}
        </p>
        {!cancelled && (
          <Link
            href="/subscribe"
            className="inline-block bg-gradient-to-br from-red to-orange-red text-white font-bold text-[14px] px-6 py-3 rounded-xl no-underline"
          >
            Subscribe now
          </Link>
        )}
      </motion.div>
    )
  }

  const statusInfo = STATUS_LABELS[subscription.status] ?? { label: subscription.status, colour: 'bg-navy/[0.05] text-navy/50 border-navy/10' }
  const periodEnd = new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white border border-navy/[0.08] rounded-2xl p-6"
    >
      <div className="flex items-start justify-between mb-4">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35">Subscription</p>
        <span className={`font-mono text-[10px] tracking-wide uppercase px-3 py-1 rounded-full border ${statusInfo.colour}`}>
          {statusInfo.label}
        </span>
      </div>

      <p className="font-display text-[24px] text-navy leading-none mb-1">
        {subscription.plan?.name ?? 'Redeemo Plan'}
      </p>
      <p className="font-mono text-[13px] text-navy/40 mb-5">
        {subscription.cancelAtPeriodEnd
          ? `Access until ${periodEnd}`
          : `Renews ${periodEnd}`}
      </p>

      {!subscription.cancelAtPeriodEnd && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="text-[13px] text-navy/40 hover:text-red transition-colors underline-offset-2 hover:underline disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel subscription'}
        </button>
      )}
    </motion.div>
  )
}
