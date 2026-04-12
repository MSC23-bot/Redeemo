'use client'
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AuthShell } from '@/components/auth/AuthShell'
import { authApi, ApiError } from '@/lib/api'

function ResetPasswordForm() {
  const params      = useSearchParams()
  const token       = params.get('token') ?? ''
  const router      = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [done, setDone]               = useState(false)
  const [error, setError]             = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!token) {
      setError('Reset link is missing or invalid. Please request a new one.')
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(token, newPassword)
      setDone(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch (err: unknown) {
      const code = err instanceof ApiError ? err.code ?? '' : ''
      if (code === 'TOKEN_INVALID' || code === 'TOKEN_EXPIRED') {
        setError('This reset link has expired or already been used. Please request a new one.')
      } else if (code === 'PASSWORD_POLICY_VIOLATION') {
        setError('Password must be at least 8 characters and include a number and uppercase letter.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const isExpiredError = error?.includes('expired') || error?.includes('invalid')

  const heading    = done ? 'Password updated'  : 'Set a new password'
  const subheading = done
    ? 'Your password has been changed. Redirecting you to login…'
    : 'Choose a new password. Min 8 characters, at least one number and uppercase letter.'

  return (
    <AuthShell heading={heading} subheading={subheading}>
      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Link href="/login" className="text-[14px] text-navy/50 hover:text-navy transition underline underline-offset-4">
              Go to login
            </Link>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error && (
              <div className="mb-5 p-3.5 bg-red/[0.06] border border-red/20 rounded-xl" role="alert">
                <p className="text-[13px] text-red leading-snug">{error}</p>
                {isExpiredError && (
                  <Link
                    href="/forgot-password"
                    className="text-[13px] text-red underline underline-offset-2 mt-1 inline-block"
                  >
                    Request a new reset link
                  </Link>
                )}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label htmlFor="new-password" className="block text-[12px] font-medium text-navy/60 mb-1.5 uppercase tracking-wide">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  autoFocus
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-[12px] font-medium text-navy/60 mb-1.5 uppercase tracking-wide">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full bg-red text-white font-medium text-[15px] py-4 rounded-xl hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}

// useSearchParams must be wrapped in Suspense in Next.js App Router
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
