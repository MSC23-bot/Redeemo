'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

function sanitiseNext(raw: string | null): string {
  if (!raw) return '/discover'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/discover'
  return raw
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeOpacity="0.4"/>
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ── Social icons ────────────────────────────────────────────────────────── */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.28.07 2.18.69 2.92.71.92 0 2.17-.87 3.62-.74 1.61.14 2.79.79 3.6 2.09-3.51 2.1-2.93 6.97.54 8.13-.44.96-.91 1.92-2.68 3.67zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = sanitiseNext(searchParams.get('next'))
  const { login } = useAuth()
  const signedOut = searchParams.get('signedOut') === 'true'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [socialBanner, setSocialBanner] = useState<string | null>(null)

  const handleSocial = (provider: 'apple' | 'google') => {
    const name = provider === 'apple' ? 'Apple' : 'Google'
    setSocialBanner(`${name} sign-in is coming soon. Please continue with email below.`)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      await login(email, password)
      router.push(next)
    } catch (err: unknown) {
      const code = err instanceof ApiError ? (err.code ?? '') : ''
      // Note: web is soft-verify — EMAIL_NOT_VERIFIED / PHONE_NOT_VERIFIED are
      // surfaced as in-app banners once signed in, not as login blockers.
      if (code === 'ACCOUNT_INACTIVE') {
        setError("This account isn't active. Please contact support.")
      } else if (code === 'ACCOUNT_SUSPENDED') {
        setError('Your account has been suspended. Please contact support.')
      } else {
        setError('Incorrect email or password.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Signed-out confirmation banner */}
      {signedOut && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-200"
        >
          <CheckCircleIcon />
          <span>You have been signed out successfully.</span>
        </motion.div>
      )}

      {/* Social login */}
      <div className="flex flex-col gap-3">
        <motion.button
          type="button"
          onClick={() => handleSocial('apple')}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl text-[14px] font-semibold text-white transition-opacity hover:opacity-85"
          style={{ background: '#010C35' }}
        >
          <AppleIcon />
          Continue with Apple
        </motion.button>

        <motion.button
          type="button"
          onClick={() => handleSocial('google')}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl border border-navy/[0.12] text-[14px] font-medium text-navy bg-white transition-colors hover:bg-navy/[0.03]"
        >
          <GoogleIcon />
          Continue with Google
        </motion.button>
      </div>

      <AnimatePresence>
        {socialBanner && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 -mt-1"
          >
            {socialBanner}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-3"
      >
        <div className="flex-1 h-px bg-navy/[0.07]" />
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-navy/30">or with email</span>
        <div className="flex-1 h-px bg-navy/[0.07]" />
      </motion.div>

      {/* Email + password form */}
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-describedby={error ? 'login-form-error' : undefined}
        className="flex flex-col gap-4"
      >
        {/* Email */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
        >
          <label htmlFor="email" className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50 mb-2">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
          />
        </motion.div>

        {/* Password */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18 }}
        >
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="password" className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-[12px] text-navy/40 hover:text-navy transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-navy/35 hover:text-navy/65 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword
                ? <EyeOff size={18} strokeWidth={1.8} />
                : <Eye size={18} strokeWidth={1.8} />
              }
            </button>
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.p
              id="login-form-error"
              role="alert"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[13px] text-[#B91C1C] bg-red-50 border border-red-200 rounded-xl px-4 py-3"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          type="submit"
          disabled={isLoading}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.24 }}
          whileTap={{ scale: 0.98 }}
          className="w-full text-white font-bold text-[16px] py-4 rounded-xl disabled:opacity-60 transition-opacity hover:opacity-90"
          style={{
            background: 'var(--brand-gradient)',
            boxShadow: '0 4px 24px rgba(226,12,4,0.28)',
          }}
        >
          {isLoading ? 'Signing in\u2026' : 'Sign in'}
        </motion.button>
      </form>

      <p className="text-center text-[14px] text-navy/45">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-navy font-medium hover:text-[#E20C04] transition-colors">
          Create one free
        </Link>
      </p>
    </div>
  )
}
