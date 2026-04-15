'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AccountNav } from '@/components/account/AccountNav'
import { authApi, ApiError } from '@/lib/api'
import { clearTokens, clearUser } from '@/lib/auth'
import { AlertTriangle, X, ArrowLeft, ShieldOff, Loader2 } from 'lucide-react'

type Stage = 'confirm' | 'otp' | 'done'

const CONSEQUENCES = [
  'Your account will be permanently anonymised',
  'Your subscription will be cancelled immediately',
  'Your saved favourites and redemption history will be removed',
  'You will be signed out on all devices',
]

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

export default function DeleteAccountPage() {
  const router              = useRouter()
  const [stage, setStage]   = useState<Stage>('confirm')
  const [code, setCode]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    if (stage !== 'done') return
    const timer = setTimeout(() => router.push('/'), 4000)
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

  async function submitOtp(e: React.FormEvent<HTMLFormElement>) {
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
      if (c === 'OTP_INVALID') setError('Incorrect code. Please check and try again.')
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

          {/* Back link */}
          <Link
            href="/account/profile"
            className="inline-flex items-center gap-1.5 text-[13px] text-navy/40 hover:text-navy transition-colors no-underline mb-8"
          >
            <ArrowLeft size={14} strokeWidth={2} />
            Back to profile
          </Link>

          <AnimatePresence mode="wait">

            {/* ── Stage: Confirm ── */}
            {stage === 'confirm' && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease }}
              >
                {/* Page header */}
                <div className="mb-8">
                  <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-2">Danger zone</p>
                  <h1 className="font-display text-[clamp(26px,4vw,36px)] text-navy leading-none mb-3">
                    Delete account
                  </h1>
                  <p className="text-[15px] text-navy/50 leading-relaxed">
                    This is permanent. Please read the below before continuing.
                  </p>
                </div>

                {/* Warning card */}
                <div
                  className="rounded-2xl p-7 mb-6 relative overflow-hidden"
                  style={{ background: '#010C35' }}
                >
                  {/* Subtle red tint */}
                  <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(135deg, rgba(226,0,12,0.14) 0%, transparent 55%)' }}
                  />

                  {/* Icon + label */}
                  <div className="flex items-center gap-3 mb-5 relative z-10">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(226,12,4,0.18)' }}
                    >
                      <AlertTriangle size={17} strokeWidth={2} className="text-[#E20C04]" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#E20C04]/80 mb-0.5">
                        Permanent action
                      </p>
                      <p className="text-[15px] font-semibold text-white leading-none">
                        This cannot be undone
                      </p>
                    </div>
                  </div>

                  {/* Consequences */}
                  <ul className="flex flex-col gap-3 relative z-10" aria-label="What will be deleted">
                    {CONSEQUENCES.map(item => (
                      <li key={item} className="flex items-start gap-3">
                        <span
                          className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: 'rgba(226,12,4,0.14)' }}
                          aria-hidden="true"
                        >
                          <X size={10} strokeWidth={2.5} className="text-[#E20C04]" />
                        </span>
                        <span className="text-[14px] text-white/65 leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Divider */}
                  <div className="border-t border-white/[0.07] mt-5 pt-5 relative z-10">
                    <p className="text-[13px] text-white/35 leading-relaxed">
                      Your redemption history is retained in anonymised form for fraud prevention. All personal data is deleted in line with our Privacy Policy and UK GDPR.
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div className="bg-white rounded-2xl border border-navy/[0.07] p-5 mb-6">
                  <p className="text-[14px] text-navy/60 leading-relaxed">
                    To confirm deletion, we&apos;ll send a 6-digit verification code to your registered phone number. Enter the code to complete the process.
                  </p>
                </div>

                {error && (
                  <motion.p
                    role="alert"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[13px] text-[#B91C1C] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5"
                  >
                    {error}
                  </motion.p>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => void requestOtp()}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-[15px] font-semibold text-white border border-[#B91C1C] disabled:opacity-60 transition-opacity hover:opacity-90"
                    style={{ background: '#B91C1C' }}
                  >
                    {loading
                      ? <><Loader2 size={15} className="animate-spin" /> Sending code</>
                      : 'Send verification code'
                    }
                  </button>
                  <Link
                    href="/account"
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-navy/[0.12] text-navy font-medium text-[15px] bg-white hover:bg-navy/[0.03] transition no-underline"
                  >
                    Keep my account
                  </Link>
                </div>
              </motion.div>
            )}

            {/* ── Stage: OTP ── */}
            {stage === 'otp' && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease }}
              >
                <div className="mb-8">
                  <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-2">Step 2 of 2</p>
                  <h1 className="font-display text-[clamp(24px,4vw,34px)] text-navy leading-none mb-3">
                    Enter the code.
                  </h1>
                  <p className="text-[15px] text-navy/50 leading-relaxed">
                    We&apos;ve sent a 6-digit code to your registered phone number. Enter it below to permanently delete your account.
                  </p>
                </div>

                <form onSubmit={submitOtp}>
                  {/* OTP input */}
                  <div className="mb-5">
                    <label htmlFor="otp-code" className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/45 mb-3">
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
                      onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(null) }}
                      placeholder="000000"
                      className="w-full bg-white border border-navy/[0.1] rounded-xl px-6 py-5 text-[28px] text-navy font-mono tracking-[0.4em] text-center placeholder:text-navy/15 focus:outline-none focus:border-red/30 focus:ring-2 focus:ring-red/[0.07] transition"
                    />
                    {/* Digit count indicator */}
                    <div className="flex justify-center gap-1.5 mt-3">
                      {[0,1,2,3,4,5].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full transition-all duration-150"
                          style={{ background: i < code.length ? '#010C35' : 'rgba(1,12,53,0.12)' }}
                        />
                      ))}
                    </div>
                  </div>

                  {error && (
                    <motion.p
                      role="alert"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[13px] text-[#B91C1C] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5"
                    >
                      {error}
                    </motion.p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || code.length !== 6}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-[15px] font-semibold text-white mb-3 disabled:opacity-50 transition-opacity hover:opacity-90"
                    style={{ background: '#B91C1C' }}
                  >
                    {loading
                      ? <><Loader2 size={15} className="animate-spin" /> Deleting account</>
                      : <><ShieldOff size={15} strokeWidth={2} /> Confirm account deletion</>
                    }
                  </button>

                  <button
                    type="button"
                    onClick={() => { setStage('confirm'); setCode(''); setError(null) }}
                    className="w-full flex items-center justify-center gap-1.5 text-[13px] text-navy/35 hover:text-navy transition-colors py-2 bg-transparent border-none cursor-pointer"
                  >
                    <ArrowLeft size={13} strokeWidth={2} />
                    Start over
                  </button>
                </form>
              </motion.div>
            )}

            {/* ── Stage: Done ── */}
            {stage === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease }}
                className="flex flex-col items-center text-center py-16 gap-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 240, damping: 20, delay: 0.1 }}
                  className="w-16 h-16 rounded-2xl bg-navy/[0.06] flex items-center justify-center"
                >
                  <ShieldOff size={28} strokeWidth={1.5} className="text-navy/40" />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.4, ease }}
                >
                  <h2 className="font-display text-[30px] text-navy leading-tight mb-3">Account deleted.</h2>
                  <p className="text-[15px] text-navy/50 leading-relaxed max-w-[300px] mx-auto">
                    Your account has been permanently removed. We&apos;re sorry to see you go.
                    Redirecting you to the home page now.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <Link
                    href="/"
                    className="text-[13px] text-navy/40 hover:text-navy transition-colors no-underline"
                  >
                    Go to home page now
                  </Link>
                </motion.div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
