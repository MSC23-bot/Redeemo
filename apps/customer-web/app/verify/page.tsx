'use client'

import { useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { authApi, ApiError } from '@/lib/api'

function VerifyForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const email = searchParams.get('email') ?? ''
  const next = searchParams.get('next') ?? '/account'

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setError(null)
    setLoading(true)
    try {
      await authApi.verifyEmail({ email, code })
      router.push(next)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Verification failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setError(null)
    try {
      await authApi.resendVerification(email)
      setResent(true)
    } catch {
      setError('Could not resend code. Please wait a moment and try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-[calc(100dvh-60px)] flex items-center justify-center px-6 bg-white">
      <div className="w-full max-w-[380px]">

        {/* Logo mark */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-display font-semibold text-[22px] mx-auto mb-8"
          style={{ background: 'var(--brand-gradient)' }}
          aria-hidden="true"
        >
          R
        </div>

        <h1 className="font-display text-[#010C35] text-[28px] leading-none mb-2 text-center">
          Check your email
        </h1>
        {email && (
          <p className="text-[14px] text-[#9CA3AF] text-center mb-8">
            We sent a 6-digit code to <span className="text-[#4B5563] font-medium">{email}</span>
          </p>
        )}

        <form onSubmit={e => void handleSubmit(e)} className="flex flex-col gap-4">
          <div>
            <label htmlFor="otp" className="block text-[12px] font-bold tracking-[0.08em] uppercase text-[#9CA3AF] mb-2">
              Verification code
            </label>
            <input
              ref={inputRef}
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full h-12 px-4 rounded-lg border border-[#EDE8E8] text-[#010C35] text-[20px] tracking-[0.3em] text-center placeholder:text-[#D1D5DB] placeholder:tracking-normal outline-none focus:border-[#E20C04] transition-colors font-mono"
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-[13px] text-[#B91C1C] bg-[#FEF2F2] px-4 py-3 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="h-12 rounded-lg text-white font-semibold text-[15px] disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand-gradient)' }}
          >
            {loading ? 'Verifying...' : 'Verify email'}
          </button>
        </form>

        <div className="mt-6 text-center">
          {resent ? (
            <p className="text-[13px] text-[#16A34A]">Code resent. Check your inbox.</p>
          ) : (
            <button
              onClick={() => void handleResend()}
              disabled={resending}
              className="text-[13px] text-[#4B5563] hover:text-[#010C35] transition-colors disabled:opacity-50 bg-transparent border-none cursor-pointer"
            >
              {resending ? 'Resending...' : "Didn't receive it? Resend code"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  )
}
