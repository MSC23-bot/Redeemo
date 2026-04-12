'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { authApi, ApiError } from '@/lib/api'

type Step = 'form' | 'success'

const FIELDS = [
  { name: 'firstName', label: 'First name',   type: 'text',     autoComplete: 'given-name' },
  { name: 'lastName',  label: 'Last name',     type: 'text',     autoComplete: 'family-name' },
  { name: 'email',     label: 'Email address', type: 'email',    autoComplete: 'email' },
  { name: 'password',  label: 'Password',       type: 'password', autoComplete: 'new-password' },
] as const

type FieldName = (typeof FIELDS)[number]['name']

export function RegisterForm() {
  const [step, setStep] = useState<Step>('form')
  const [values, setValues] = useState<Record<FieldName, string>>({
    firstName: '', lastName: '', email: '', password: '',
  })
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      await authApi.register({
        firstName:       values.firstName,
        lastName:        values.lastName,
        email:           values.email,
        password:        values.password,
        marketingConsent,
      })
      setStep('success')
    } catch (err: unknown) {
      const code = err instanceof ApiError ? (err.code ?? '') : ''
      if (code === 'EMAIL_ALREADY_EXISTS') {
        setError('An account with that email already exists. Try signing in instead.')
      } else if (code === 'PASSWORD_POLICY_VIOLATION') {
        setError('Password must be at least 8 characters and include a number and uppercase letter.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AnimatePresence mode="wait">
      {step === 'form' ? (
        <motion.form
          key="form"
          onSubmit={handleSubmit}
          noValidate
          aria-describedby={error ? 'register-form-error' : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
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

          {/* Marketing consent — proper input checkbox */}
          <label htmlFor="marketing-consent" className="flex items-start gap-3 cursor-pointer mb-6">
            <input
              id="marketing-consent"
              type="checkbox"
              className="sr-only"
              checked={marketingConsent}
              onChange={e => setMarketingConsent(e.target.checked)}
            />
            <span
              aria-hidden="true"
              className={`w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 mt-0.5 transition-colors ${
                marketingConsent ? 'bg-red border-red' : 'border-navy/20'
              }`}
            >
              {marketingConsent && <span className="text-white text-[11px]">&#10003;</span>}
            </span>
            <span className="text-[13px] text-navy/55 leading-relaxed">
              I&apos;d like to receive offers and updates from Redeemo by email.
            </span>
          </label>

          {error && (
            <motion.p
              id="register-form-error"
              role="alert"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red text-[13px] mb-4"
            >
              {error}
            </motion.p>
          )}

          <motion.button
            type="submit"
            disabled={isLoading}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-gradient-to-br from-red to-orange-red text-white font-bold text-[16px] py-4 rounded-xl disabled:opacity-60 shadow-[0_4px_24px_rgba(226,0,12,0.25)] hover:shadow-[0_4px_32px_rgba(226,0,12,0.4)] transition-shadow"
          >
            {isLoading ? 'Creating account\u2026' : 'Create free account'}
          </motion.button>

          <p className="text-center text-[12px] text-navy/35 mt-4 leading-relaxed">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="underline hover:text-navy/60">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" className="underline hover:text-navy/60">Privacy Policy</Link>.
          </p>

          <p className="text-center text-[14px] text-navy/45 mt-5">
            Already have an account?{' '}
            <Link href="/login" className="text-navy font-medium hover:text-red transition-colors">
              Sign in
            </Link>
          </p>
        </motion.form>
      ) : (
        <motion.div
          key="success"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center text-center gap-6 py-8"
        >
          <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center text-3xl">
            &#10003;
          </div>
          <div>
            <h2 className="font-display text-[26px] text-navy mb-2">Check your email</h2>
            <p className="text-[15px] leading-relaxed text-navy/55 max-w-xs">
              We&apos;ve sent a verification link to <strong className="text-navy">{values.email}</strong>.
              Click it to activate your account, then come back to sign in.
            </p>
          </div>
          <Link
            href="/login"
            className="font-mono text-[12px] tracking-[0.1em] uppercase text-navy/45 hover:text-navy transition-colors"
          >
            Go to sign in &rarr;
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
