'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, X } from 'lucide-react'
import { subscriptionApi, ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const DISMISS_KEY = 'redeemo_subscribe_nudge_dismissed'

// Hide on auth, onboarding, and subscribe flows so it never gets in the way.
const HIDDEN_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify',
  '/delete-account',
  '/subscribe',
]

function isDismissed(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(DISMISS_KEY) === '1'
}

function dismiss() {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(DISMISS_KEY, '1')
}

const SUBSCRIBED_STATUSES = new Set(['ACTIVE', 'TRIALLING'])

export function SubscriptionNudge() {
  const { user, isLoading } = useAuth()
  const pathname = usePathname()

  const [dismissed, setDismissed] = useState(true) // Default true so nothing flashes before the check.
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null)

  useEffect(() => {
    setDismissed(isDismissed())
  }, [user?.id])

  useEffect(() => {
    let cancelled = false
    if (!user) {
      setIsSubscribed(null)
      return
    }
    void (async () => {
      try {
        const sub = await subscriptionApi.getMySubscription()
        if (cancelled) return
        setIsSubscribed(!!sub && SUBSCRIBED_STATUSES.has(sub.status))
      } catch (err) {
        if (cancelled) return
        // 401 = not authed (middleware will redirect); other errors → hide the nudge.
        if (err instanceof ApiError && err.statusCode === 401) setIsSubscribed(null)
        else setIsSubscribed(true) // Fail-closed: don't nag if the check fails.
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  if (isLoading || !user) return null
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null
  if (dismissed) return null
  if (isSubscribed !== false) return null

  return (
    <div
      role="status"
      className="flex items-center gap-3 px-6 py-3 text-[13px] bg-[#FFF7ED] border-b border-[#FED7AA] text-[#9A3412]"
    >
      <Sparkles size={16} strokeWidth={1.8} className="flex-shrink-0 text-[#D97706]" />
      <div className="flex-1 leading-snug">
        Unlock exclusive vouchers from local businesses — subscribe from <strong className="font-semibold">£6.99/month</strong>.
      </div>
      <Link
        href="/subscribe"
        className="text-[12px] font-semibold underline underline-offset-2 text-[#9A3412] hover:text-[#7C2D12]"
      >
        See plans
      </Link>
      <button
        onClick={() => { dismiss(); setDismissed(true) }}
        aria-label="Dismiss subscription banner"
        className="flex-shrink-0 text-[#9A3412]/70 hover:text-[#9A3412] transition-colors bg-transparent border-none cursor-pointer"
      >
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  )
}
