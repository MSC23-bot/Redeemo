'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AccountNav } from '@/components/account/AccountNav'
import { subscriptionApi, ApiError } from '@/lib/api'

type PageSubscription = {
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

type CancelStep = 'idle' | 'reason' | 'confirm' | 'cancelling' | 'cancelled'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(price / 100)
}

export default function SubscriptionPage() {
  const router = useRouter()
  const [subscription, setSubscription] = useState<PageSubscription | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [cancelStep, setCancelStep] = useState<CancelStep>('idle')
  const [cancelReason, setCancelReason] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  useEffect(() => {
    subscriptionApi.get()
      .then(data => {
        setSubscription(data as unknown as PageSubscription)
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
      const updated = await subscriptionApi.get()
      setSubscription(updated as unknown as PageSubscription)
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
                style={{ background: 'var(--brand-gradient)' }}
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
                  style={{ background: 'var(--brand-gradient)' }}
                >
                  Active
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-[14px] mb-6">
                <div>
                  <p className="text-[#9CA3AF] mb-0.5">Price</p>
                  <p className="font-medium text-[#010C35]">
                    {sub.plan ? formatPrice(sub.plan.price, sub.plan.currency) : 'N/A'}
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
                  <fieldset className="flex flex-col gap-2 mb-5 border-none p-0 m-0">
                    <legend className="sr-only">Cancellation reason</legend>
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
                  </fieldset>
                  {cancelReason === 'Other' && (
                    <textarea
                      value={otherReason}
                      onChange={e => setOtherReason(e.target.value)}
                      placeholder="Tell us more (optional)"
                      aria-label="Additional cancellation details"
                      className="w-full h-24 px-4 py-3 rounded-lg border border-[#EDE8E8] text-[14px] text-[#010C35] placeholder:text-[#9CA3AF] outline-none focus:border-[#E20C04] resize-none mb-4 transition-colors"
                    />
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (!cancelReason) return
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

              {/* Step 2: Confirm */}
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
                      style={{ background: 'var(--brand-gradient)' }}
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
                style={{ background: 'var(--brand-gradient)' }}
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
