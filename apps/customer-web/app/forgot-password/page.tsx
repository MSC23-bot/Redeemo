'use client'
import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AuthShell } from '@/components/auth/AuthShell'
import { authApi } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
    } catch {
      // Never reveal whether email exists — always show the sent state
    } finally {
      setLoading(false)
      setSent(true)
    }
  }

  const heading    = sent ? 'Check your inbox'     : 'Forgot your password?'
  const subheading = sent
    ? `If ${email} is registered, we've sent a reset link. Check your spam folder if it doesn't arrive within a couple of minutes.`
    : "Enter your email and we'll send you a reset link."

  return (
    <AuthShell heading={heading} subheading={subheading}>
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Link
              href="/login"
              className="text-[14px] text-navy/50 hover:text-navy transition-colors underline underline-offset-4"
            >
              Back to login
            </Link>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="mb-6">
              <label htmlFor="email" className="block text-[12px] font-medium text-navy/60 mb-1.5 uppercase tracking-wide">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red text-white font-medium text-[15px] py-4 rounded-xl hover:opacity-90 transition disabled:opacity-60 mb-4"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <Link
              href="/login"
              className="block text-center text-[14px] text-navy/45 hover:text-navy transition-colors"
            >
              Back to login
            </Link>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}
