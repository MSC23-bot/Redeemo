'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Mail, Phone, X } from 'lucide-react'
import { authApi, ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

// Routes where we don't show the nudges (auth/onboarding + the verify page itself).
const HIDDEN_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify', '/delete-account']

const EMAIL_DISMISS_KEY = 'redeemo_email_banner_dismissed'
const PHONE_DISMISS_KEY = 'redeemo_phone_banner_dismissed'

function isDismissed(key: string): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(key) === '1'
}

function dismiss(key: string) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(key, '1')
}

export function VerificationBanners() {
  const { user, isLoading } = useAuth()
  const pathname = usePathname()

  const [emailDismissed, setEmailDismissed] = useState(false)
  const [phoneDismissed, setPhoneDismissed] = useState(false)
  const [emailResending, setEmailResending] = useState(false)
  const [emailResent, setEmailResent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  useEffect(() => {
    setEmailDismissed(isDismissed(EMAIL_DISMISS_KEY))
    setPhoneDismissed(isDismissed(PHONE_DISMISS_KEY))
  }, [user?.id])

  if (isLoading || !user) return null
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null

  // Only show once the profile has actually hydrated — otherwise we'd flash a
  // banner for every freshly-logged-in user before /profile comes back.
  if (user.emailVerified === undefined && user.phoneVerified === undefined) return null

  const showEmail = user.emailVerified === false && !emailDismissed
  const showPhone = user.phoneVerified === false && !phoneDismissed

  if (!showEmail && !showPhone) return null

  async function handleResend() {
    if (!user?.email) return
    setEmailError(null)
    setEmailResending(true)
    try {
      await authApi.resendVerification(user.email)
      setEmailResent(true)
    } catch (err) {
      setEmailError(
        err instanceof ApiError
          ? err.message
          : 'Could not resend the verification email. Please try again shortly.',
      )
    } finally {
      setEmailResending(false)
    }
  }

  return (
    <div className="flex flex-col">
      {showEmail && (
        <div
          role="status"
          className="flex items-center gap-3 px-6 py-3 text-[13px] bg-amber-50 border-b border-amber-200 text-amber-900"
        >
          <Mail size={16} strokeWidth={1.8} className="flex-shrink-0 text-amber-700" />
          <div className="flex-1 leading-snug">
            {emailResent ? (
              <span>
                Verification email sent — check your inbox at{' '}
                <strong className="font-semibold">{user.email}</strong>.
              </span>
            ) : emailError ? (
              <span className="text-[#B91C1C]">{emailError}</span>
            ) : (
              <span>
                Verify your email to unlock savings updates and receipts. We sent a link to{' '}
                <strong className="font-semibold">{user.email}</strong>.
              </span>
            )}
          </div>
          {!emailResent && (
            <button
              onClick={() => void handleResend()}
              disabled={emailResending}
              className="text-[12px] font-semibold underline underline-offset-2 text-amber-900 hover:text-amber-700 disabled:opacity-50 bg-transparent border-none cursor-pointer"
            >
              {emailResending ? 'Sending…' : 'Resend email'}
            </button>
          )}
          <button
            onClick={() => { dismiss(EMAIL_DISMISS_KEY); setEmailDismissed(true) }}
            aria-label="Dismiss email verification banner"
            className="flex-shrink-0 text-amber-700/70 hover:text-amber-900 transition-colors bg-transparent border-none cursor-pointer"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      )}

      {showPhone && (
        <div
          role="status"
          className="flex items-center gap-3 px-6 py-3 text-[13px] bg-[#EFF6FF] border-b border-[#DBEAFE] text-[#1E3A8A]"
        >
          <Phone size={16} strokeWidth={1.8} className="flex-shrink-0 text-[#2563EB]" />
          <div className="flex-1 leading-snug">
            Verify your mobile number to use vouchers in-store. Open the Redeemo app to confirm your number.
          </div>
          <button
            onClick={() => { dismiss(PHONE_DISMISS_KEY); setPhoneDismissed(true) }}
            aria-label="Dismiss phone verification banner"
            className="flex-shrink-0 text-[#1E3A8A]/70 hover:text-[#1E3A8A] transition-colors bg-transparent border-none cursor-pointer"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  )
}
