'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { authApi, ApiError } from '@/lib/api'
import { saveTokens } from '@/lib/auth'

function sanitiseNext(raw: string | null): string {
  if (!raw) return '/discover'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/discover'
  return raw
}

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server'
  const key = 'redeemo_device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

const FIELDS = [
  { name: 'email',    label: 'Email address', type: 'email',    autoComplete: 'email' },
  { name: 'password', label: 'Password',       type: 'password', autoComplete: 'current-password' },
] as const

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = sanitiseNext(searchParams.get('next'))

  const [values, setValues] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const deviceId = getOrCreateDeviceId()
      const data = await authApi.login({
        email:      values.email,
        password:   values.password,
        deviceId,
        deviceType: 'web',
        deviceName: navigator.userAgent.slice(0, 100),
      })
      saveTokens(data.accessToken, data.refreshToken)
      router.push(next)
    } catch (err: unknown) {
      const code = err instanceof ApiError ? (err.code ?? '') : ''
      if (code === 'ACCOUNT_NOT_ACTIVE') {
        setError("Your account isn't active yet. Check your email for a verification link.")
      } else if (code === 'ACCOUNT_SUSPENDED') {
        setError('Your account has been suspended. Contact support.')
      } else {
        setError('Incorrect email or password.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-describedby={error ? 'login-form-error' : undefined}>
      <div className="flex flex-col gap-4 mb-6">
        {FIELDS.map((field, i) => (
          <motion.div
            key={field.name}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.07 }}
          >
            <label
              htmlFor={field.name}
              className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50 mb-2"
            >
              {field.label}
            </label>
            <input
              id={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              value={values[field.name]}
              onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
              required
              className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
            />
          </motion.div>
        ))}
      </div>

      {error && (
        <motion.p
          id="login-form-error"
          role="alert"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red text-[13px] mb-4"
        >
          {error}
        </motion.p>
      )}

      <div className="flex justify-end mb-6">
        <Link href="/forgot-password" className="text-[13px] text-navy/45 hover:text-navy transition-colors">
          Forgot password?
        </Link>
      </div>

      <motion.button
        type="submit"
        disabled={isLoading}
        whileTap={{ scale: 0.98 }}
        className="w-full bg-gradient-to-br from-red to-orange-red text-white font-bold text-[16px] py-4 rounded-xl disabled:opacity-60 transition-opacity shadow-[0_4px_24px_rgba(226,0,12,0.25)] hover:shadow-[0_4px_32px_rgba(226,0,12,0.4)] transition-shadow"
      >
        {isLoading ? 'Signing in\u2026' : 'Sign in'}
      </motion.button>

      <p className="text-center text-[14px] text-navy/45 mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-navy font-medium hover:text-red transition-colors">
          Create one free
        </Link>
      </p>
    </form>
  )
}
