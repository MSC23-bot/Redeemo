'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe'
import { subscriptionApi, ApiError } from '@/lib/api'

type Props = {
  planId: string
  promoCode?: string
  onSuccess: () => void
}

function StripePaymentForm({ planId, promoCode, onSuccess }: Props) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setError(null)
    setIsLoading(true)

    try {
      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      })

      if (stripeError) {
        setError(stripeError.message ?? 'Card setup failed. Please try again.')
        return
      }

      const paymentMethodId = typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent?.payment_method?.id

      if (!paymentMethodId) {
        setError('Could not retrieve payment method. Please try again.')
        return
      }

      await subscriptionApi.create({ planId, paymentMethodId, promoCode })
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Payment details">
      <div className="bg-white rounded-2xl border border-navy/[0.08] p-6 mb-5">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error && (
        <motion.p
          id="payment-error"
          role="alert"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red text-[13px] mb-4"
        >
          {error}
        </motion.p>
      )}

      <motion.button
        type="submit"
        disabled={!stripe || isLoading}
        whileTap={{ scale: 0.98 }}
        className="w-full bg-gradient-to-br from-red to-orange-red text-white font-bold text-[16px] py-4 rounded-xl disabled:opacity-60 shadow-[0_4px_24px_rgba(226,0,12,0.25)] hover:shadow-[0_4px_32px_rgba(226,0,12,0.4)] transition-shadow"
      >
        {isLoading ? 'Processing…' : 'Subscribe now'}
      </motion.button>

      <p className="text-center text-[12px] text-navy/35 mt-3">
        Secured by Stripe. Cancel anytime.
      </p>
    </form>
  )
}

export function PaymentForm({ planId, promoCode, onSuccess }: Props) {
  const router = useRouter()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setClientSecret(null)
    setFetchError(null)
    subscriptionApi.createSetupIntent()
      .then(data => {
        if (!cancelled) setClientSecret(data.clientSecret)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.statusCode === 401) {
          router.push('/login?next=/subscribe')
          return
        }
        setFetchError('Could not initialise payment. Please refresh and try again.')
      })
    return () => { cancelled = true }
  }, [planId]) // router is stable — intentionally excluded from deps

  if (fetchError) {
    return <p className="text-red text-[14px]">{fetchError}</p>
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="font-mono text-[12px] text-navy/35 animate-pulse">Loading payment form…</span>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Elements stripe={getStripe()} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
        <StripePaymentForm planId={planId} promoCode={promoCode} onSuccess={onSuccess} />
      </Elements>
    </motion.div>
  )
}
