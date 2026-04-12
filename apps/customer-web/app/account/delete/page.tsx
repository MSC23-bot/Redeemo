'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AccountNav } from '@/components/account/AccountNav'
import { authApi, ApiError } from '@/lib/api'
import { clearTokens, clearUser } from '@/lib/auth'

type Stage = 'confirm' | 'otp' | 'done'

export default function DeleteAccountPage() {
  const router            = useRouter()
  const [stage, setStage] = useState<Stage>('confirm')
  const [code, setCode]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Redirect after deletion — cleaned up on unmount
  useEffect(() => {
    if (stage !== 'done') return
    const timer = setTimeout(() => router.push('/'), 3000)
    return () => clearTimeout(timer)
  }, [stage, router])

  async function requestOtp() {
    setError(null)
    setLoading(true)
    try {
      await authApi.sendDeletionOtp()
      setStage('otp')
    } catch (err: unknown) {
      const errCode = err instanceof ApiError ? err.code ?? '' : ''
      if (errCode === 'PHONE_NOT_VERIFIED') {
        setError('You need a verified phone number to delete your account. Please add one in your profile settings first.')
      } else {
        setError('Failed to send verification code. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { actionToken } = await authApi.verifyDeletionOtp(code)
      await authApi.deleteAccount(actionToken)
      clearTokens()
      clearUser()
      setStage('done')
    } catch (err: unknown) {
      const c = err instanceof ApiError ? err.code ?? '' : ''
      if (c === 'OTP_INVALID') setError('Incorrect code. Please try again.')
      else if (c === 'OTP_MAX_ATTEMPTS') setError('Too many attempts. Please request a new code.')
      else if (c === 'ACTION_TOKEN_INVALID') setError('Verification expired. Please start over.')
      else setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />
        <main className="flex-1 max-w-lg">
          <div className="mb-8">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-2">Account</p>
            <h1 className="font-display text-[clamp(26px,4vw,38px)] text-navy leading-none">Delete account</h1>
          </div>

          <AnimatePresence mode="wait">
            {stage === 'confirm' && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {/* Warning panel */}
                <div className="bg-deep-navy rounded-2xl p-8 mb-6 relative overflow-hidden">
                  <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(135deg, rgba(226,0,12,0.12) 0%, transparent 50%)' }}
                  />
                  <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-red/80 mb-4 relative z-10">
                    Permanent action
                  </p>
                  <h2 className="font-display text-[22px] text-white leading-snug mb-4 relative z-10">
                    This cannot be undone
                  </h2>
                  <ul className="space-y-2 relative z-10" aria-label="What will happen">
                    {[
                      'Your account will be permanently anonymised',
                      'Your subscription will be cancelled immediately',
                      'Your saved favourites and redemption history will be removed',
                      'You will be signed out on all devices',
                    ].map(item => (
                      <li key={item} className="flex items-start gap-2.5 text-[14px] text-white/65 leading-snug">
                        <span className="text-red mt-0.5 flex-shrink-0" aria-hidden>×</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {error && (
                  <p className="text-[13px] text-red mb-4 bg-red/[0.06] border border-red/20 rounded-xl px-4 py-3" role="alert">
                    {error}
                  </p>
                )}

                <p className="text-[14px] text-navy/55 mb-6">
                  We&apos;ll send a verification code to your registered phone number to confirm.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={requestOtp}
                    disabled={loading}
                    className="flex-1 bg-red text-white font-medium text-[15px] py-3.5 rounded-xl hover:opacity-90 transition disabled:opacity-60"
                  >
                    {loading ? 'Sending code…' : 'Send verification code'}
                  </button>
                  <Link
                    href="/account"
                    className="flex-1 bg-white border border-navy/[0.12] text-navy font-medium text-[15px] py-3.5 rounded-xl text-center hover:bg-navy/[0.03] transition no-underline"
                  >
                    Cancel
                  </Link>
                </div>
              </motion.div>
            )}

            {stage === 'otp' && (
              <motion.form
                key="otp"
                onSubmit={submitOtp}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-[15px] text-navy/60 mb-6">
                  Enter the 6-digit code sent to your phone.
                </p>

                {error && (
                  <p className="text-[13px] text-red mb-4 bg-red/[0.06] border border-red/20 rounded-xl px-4 py-3" role="alert">
                    {error}
                  </p>
                )}

                <div className="mb-6">
                  <label htmlFor="otp-code" className="block text-[12px] font-medium text-navy/60 mb-1.5 uppercase tracking-wide">
                    Verification code
                  </label>
                  <input
                    id="otp-code"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[20px] text-navy font-mono tracking-[0.3em] text-center placeholder:text-navy/20 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full bg-red text-white font-medium text-[15px] py-4 rounded-xl hover:opacity-90 transition disabled:opacity-60 mb-3"
                >
                  {loading ? 'Deleting account…' : 'Confirm account deletion'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStage('confirm'); setCode(''); setError(null) }}
                  className="w-full text-[14px] text-navy/40 hover:text-navy transition py-2"
                >
                  Start over
                </button>
              </motion.form>
            )}

            {stage === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-4">Done</p>
                <h2 className="font-display text-[28px] text-navy leading-tight mb-4">
                  Your account has been deleted.
                </h2>
                <p className="text-[15px] text-navy/55 mb-6">
                  We&apos;re sorry to see you go. Redirecting you to the home page…
                </p>
                <Link href="/" className="text-[14px] text-navy/45 hover:text-navy transition underline underline-offset-4">
                  Go to home page
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
