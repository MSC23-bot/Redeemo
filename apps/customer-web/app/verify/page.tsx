'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { authApi, ApiError } from '@/lib/api'

function VerifyTokenHandler() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState<string>('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    if (!token) {
      setStatus('error')
      setMessage('This verification link is missing a token. Please use the link from your email.')
      return
    }
    void (async () => {
      try {
        await authApi.verifyEmail(token)
        setStatus('success')
        setMessage('Your email is verified.')
      } catch (err) {
        setStatus('error')
        setMessage(
          err instanceof ApiError
            ? err.message
            : 'This link is invalid or has expired. Request a new one from your account.',
        )
      }
    })()
  }, [token])

  return (
    <div className="min-h-[calc(100dvh-60px)] flex items-center justify-center px-6 bg-white">
      <div className="w-full max-w-[380px] text-center">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-display font-semibold text-[22px] mx-auto mb-8"
          style={{ background: 'var(--brand-gradient)' }}
          aria-hidden="true"
        >
          R
        </div>

        {status === 'verifying' && (
          <>
            <h1 className="font-display text-[#010C35] text-[28px] leading-none mb-2">Verifying your email…</h1>
            <p className="text-[14px] text-[#9CA3AF]">One moment please.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 className="font-display text-[#010C35] text-[28px] leading-none mb-2">Email verified.</h1>
            <p className="text-[14px] text-[#4B5563] mb-8">{message}</p>
            <Link
              href="/discover"
              className="inline-flex items-center justify-center h-12 px-6 rounded-lg text-white font-semibold text-[15px] transition-opacity hover:opacity-90"
              style={{ background: 'var(--brand-gradient)' }}
            >
              Continue
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="font-display text-[#010C35] text-[28px] leading-none mb-2">Something went wrong.</h1>
            <p className="text-[14px] text-[#B91C1C] bg-[#FEF2F2] px-4 py-3 rounded-lg mb-6">{message}</p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center h-12 px-6 rounded-lg text-white font-semibold text-[15px] transition-opacity hover:opacity-90"
              style={{ background: 'var(--brand-gradient)' }}
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyTokenHandler />
    </Suspense>
  )
}
