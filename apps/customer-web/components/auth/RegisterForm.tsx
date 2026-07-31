'use client'
import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Eye, EyeOff, ArrowLeft, CheckCircle2, Check, MapPin, Loader2, X, ChevronDown } from 'lucide-react'
import { COUNTRIES_FOR_PICKER, DEFAULT_COUNTRY, validateNational, type Country } from '@/lib/countries'
import { authApi, profileApi, ApiError } from '@/lib/api'
import { saveTokens, saveUser } from '@/lib/auth'
import { isMarketplaceLive } from '@/lib/prelaunch'

/* ── Constants ─────────────────────────────────────────────────────────────── */

const STEP_HEADINGS = [
  { heading: 'Create your account.', sub: 'Join free, no credit card required.' },
  { heading: 'About you.', sub: 'A few details to personalise your experience.' },
  { heading: 'What are you into?', sub: 'We\'ll tailor your feed to what you love.' },
] as const

const INTERESTS = [
  'Food & Dining',
  'Beauty & Skincare',
  'Fitness & Sport',
  'Shopping',
  'Entertainment & Events',
  'Travel & Leisure',
  'Health & Wellbeing',
  'Professional Development',
]

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

/* ── UK postcode lookup via postcodes.io (free, no API key) ─────────────── */

type PostcodeState = 'idle' | 'loading' | 'valid' | 'invalid'

/* ── Sub-components ────────────────────────────────────────────────────────── */

function PasswordInput({
  id, label, value, onChange, autoComplete, invalid,
}: {
  id: string; label: string; value: string
  onChange: (v: string) => void; autoComplete: string; invalid?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50 mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={e => onChange(e.target.value)}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className={`w-full bg-white border rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:ring-2 transition pr-12 ${
            invalid ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-navy/[0.1] focus:border-red/40 focus:ring-red/[0.08]'
          }`}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-navy/35 hover:text-navy/65 transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
        </button>
      </div>
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const strength = checks.filter(Boolean).length
  const colors = ['', '#E20C04', '#E84A00', '#D97706', '#16A34A']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']

  if (!password) return null
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex gap-1 flex-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i <= strength ? colors[strength] : 'rgba(1,12,53,0.08)' }}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] tracking-wide" style={{ color: colors[strength] || 'transparent' }}>
        {labels[strength]}
      </span>
    </div>
  )
}

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

function Checkbox({
  id, checked, onChange, children,
}: {
  id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
      <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className={`w-5 h-5 rounded-md flex items-center justify-center border flex-shrink-0 mt-0.5 transition-all duration-150 ${
          checked ? 'bg-[#E20C04] border-[#E20C04]' : 'border-navy/20 bg-white'
        }`}
      >
        {checked && <Check size={12} strokeWidth={2.5} className="text-white" />}
      </span>
      <span className="text-[13px] text-navy/55 leading-relaxed">{children}</span>
    </label>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <motion.p
      role="alert"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-[13px] text-[#B91C1C] bg-red-50 border border-red-200 rounded-xl px-4 py-3"
    >
      {message}
    </motion.p>
  )
}

/* ── Main component ────────────────────────────────────────────────────────── */

export function RegisterForm() {
  const [step, setStep] = useState(0)
  const [isSuccess, setIsSuccess] = useState(false)
  const [partialSave, setPartialSave] = useState(false)
  const direction = useRef<1 | -1>(1)

  // Step 0 — credentials
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [socialMessage, setSocialMessage] = useState<string | null>(null)

  // Step 1 — about you
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)

  // Postcode lookup
  const [postcode, setPostcode] = useState('')
  const [postcodeState, setPostcodeState] = useState<PostcodeState>('idle')
  const [postcodeArea, setPostcodeArea] = useState<string | null>(null)
  const postcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 2 — interests
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set())

  // Phone country picker (mirrors the app: UK pinned and default)
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY)
  const [nationalNumber, setNationalNumber] = useState('')

  // Shared. Field problems highlight the field itself; the banner is reserved
  // for network/unknown failures only (owner 2026-07-19).
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const inputTone = (id: string) =>
    fieldErrors[id]
      ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
      : 'border-navy/[0.1] focus:border-red/40 focus:ring-red/[0.08]'

  const fieldMsg = (id: string) =>
    fieldErrors[id] ? (
      <p id={`${id}-error`} role="alert" className="mt-2 text-[12px] text-red-500">
        {fieldErrors[id]}
      </p>
    ) : null

  const applyFieldErrors = (errs: Record<string, string>) => {
    setFieldErrors(errs)
    const first = Object.keys(errs)[0]
    if (first) setTimeout(() => document.getElementById(first)?.focus(), 30)
  }

  /* ── Postcode lookup (postcodes.io — free, no API key) ── */
  const lookupPostcode = async (raw: string) => {
    const stripped = raw.replace(/\s/g, '')
    // Minimum length for a valid UK postcode (outward code only, e.g. "EC1A")
    if (stripped.length < 5) {
      setPostcodeState('idle')
      setPostcodeArea(null)
      return
    }
    setPostcodeState('loading')
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(raw.trim())}`)
      const data = await res.json() as { status: number; result?: { admin_district: string; region: string } }
      if (data.status === 200 && data.result) {
        const r = data.result
        const area = r.admin_district && r.region && r.region !== r.admin_district
          ? `${r.admin_district}, ${r.region}`
          : r.admin_district || r.region
        setPostcodeState('valid')
        setPostcodeArea(area)
      } else {
        setPostcodeState('invalid')
        setPostcodeArea(null)
      }
    } catch {
      setPostcodeState('idle')
      setPostcodeArea(null)
    }
  }

  const handlePostcodeChange = (value: string) => {
    const upper = value.toUpperCase()
    setPostcode(upper)
    setPostcodeArea(null)
    if (postcodeTimer.current) clearTimeout(postcodeTimer.current)
    postcodeTimer.current = setTimeout(() => void lookupPostcode(upper), 450)
  }

  /* ── Navigation ── */
  const goTo = (next: number) => {
    direction.current = next > step ? 1 : -1
    setError(null)
    setFieldErrors({})
    setSocialMessage(null)
    setStep(next)
  }

  const handleSocial = (provider: 'apple' | 'google') => {
    const name = provider === 'apple' ? 'Apple' : 'Google'
    setSocialMessage(`${name} sign-in is coming soon. Please continue with email below for now.`)
  }

  /* ── Validation (field-level; password policy mirrors the backend) ── */
  const validateStep0 = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Please enter a valid email address.'
    const pwOk =
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password)
    if (!pwOk) errs.password = 'Password must include uppercase, lowercase, a number, and a special character.'
    if (password !== confirmPassword) errs['confirm-password'] = 'Passwords do not match.'
    return errs
  }

  const validateStep1 = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (!firstName.trim()) errs.firstName = 'Please enter your first name.'
    if (!lastName.trim()) errs.lastName = 'Please enter your last name.'
    const pv = validateNational(country, nationalNumber)
    if (!pv.ok) errs.phone = pv.message
    if (!dob) {
      errs.dob = 'Please enter your date of birth.'
    } else {
      const cutoff = new Date()
      cutoff.setFullYear(cutoff.getFullYear() - 16)
      if (new Date(dob) > cutoff) errs.dob = 'You must be at least 16 to join Redeemo.'
    }
    return errs
  }

  const handleStep0Next = () => {
    const errs = validateStep0()
    if (Object.keys(errs).length > 0) { applyFieldErrors(errs); return }
    goTo(1)
  }

  const handleStep1Next = () => {
    const errs = validateStep1()
    if (Object.keys(errs).length > 0) { applyFieldErrors(errs); return }
    goTo(2)
  }

  /* ── Submit (accepts explicit interests so skip works correctly) ── */
  const handleSubmit = async (interestsOverride?: Set<string>) => {
    setError(null)
    setIsLoading(true)
    const interestsToSave = interestsOverride ?? selectedInterests
    try {
      const pv = validateNational(country, nationalNumber)
      if (!pv.ok) { goTo(1); applyFieldErrors({ phone: pv.message }); setIsLoading(false); return }
      const res = await authApi.register({ email, password, firstName, lastName, phone: pv.e164, marketingConsent })
      saveTokens(res.accessToken, res.refreshToken)
      saveUser(res.user)

      // Persist the rest of the onboarding data straight to the backend (no localStorage).
      const profilePatch: Record<string, string | boolean> = { newsletterConsent: marketingConsent }
      if (dob) profilePatch.dateOfBirth = new Date(dob).toISOString()
      if (gender) profilePatch.gender = gender
      if (postcode && postcodeState === 'valid') {
        profilePatch.postcode = postcode
        if (postcodeArea) profilePatch.city = postcodeArea
      }

      // Retry once on failure, then surface a non-blocking partial-save notice.
      // Registration itself already succeeded — never block the user here.
      let anyFailed = false
      const retryOnce = async (fn: () => Promise<unknown>): Promise<boolean> => {
        try { await fn(); return true } catch {
          try { await fn(); return true } catch { return false }
        }
      }

      const profileOk = await retryOnce(() => profileApi.update(profilePatch))
      if (!profileOk) anyFailed = true

      if (interestsToSave.size > 0) {
        const interestsOk = await retryOnce(async () => {
          const { interests: avail } = await profileApi.listAvailableInterests()
          const byName = new Map(avail.map((i) => [i.name.toLowerCase(), i.id]))
          const ids = [...interestsToSave]
            .map((n) => byName.get(n.toLowerCase()))
            .filter((id): id is string => typeof id === 'string')
          if (ids.length > 0) await profileApi.updateInterests(ids)
        })
        if (!interestsOk) anyFailed = true
      }

      if (anyFailed) setPartialSave(true)
      setIsSuccess(true)
    } catch (err) {
      const code = err instanceof ApiError ? (err.code ?? '') : ''
      if (code === 'EMAIL_ALREADY_EXISTS') {
        goTo(0)
        applyFieldErrors({ email: 'An account with that email already exists. Try signing in instead.' })
      } else if (code === 'PHONE_ALREADY_EXISTS') {
        goTo(1)
        applyFieldErrors({ phone: 'This phone number is already linked to another account. Please use a different number.' })
      } else if (code === 'PASSWORD_POLICY_VIOLATION') {
        goTo(0)
        applyFieldErrors({ password: 'Password must include uppercase, lowercase, a number, and a special character.' })
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev => {
      const next = new Set(prev)
      if (next.has(interest)) next.delete(interest)
      else next.add(interest)
      return next
    })
  }

  /* slide variants */
  const variants = {
    enter: (d: number) => ({ x: d * 40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d * -40, opacity: 0 }),
  }
  const transition = { duration: 0.26, ease }

  /* ── Success state ─────────────────────────────────────────────────── */
  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease }}
        className="flex flex-col items-center text-center gap-6 py-10"
      >
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 18, delay: 0.1 }}
          className="rounded-2xl flex items-center justify-center"
          style={{
            width: 72, height: 72,
            background: 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)',
            boxShadow: '0 6px 28px rgba(22,163,74,0.32)',
          }}
        >
          <CheckCircle2 size={34} strokeWidth={1.7} className="text-white" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.4, ease }}
        >
          <h2 className="font-display text-[32px] text-navy leading-tight mb-2">
            {isMarketplaceLive() ? "You're in." : "You're a founding member."}
          </h2>
          <p className="text-[15px] text-navy/50 leading-relaxed max-w-[340px] mx-auto">
            We&apos;ve sent a verification link to{' '}
            <strong className="text-navy font-semibold">{email}</strong>.
            {isMarketplaceLive()
              ? ' Click it, then open the Redeemo app to verify your mobile number and finish setting up.'
              : ' Click it to secure your place. We will email you the moment Redeemo launches near you, and your first two months of membership are on us.'}
          </p>
          {partialSave && (
            <p
              role="status"
              className="mt-4 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-[340px] mx-auto"
            >
              Some details couldn&apos;t be saved. You can complete them later from your profile.
            </p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 20px rgba(226,12,4,0.26)' }}
          >
            Go to sign in
          </Link>
        </motion.div>
      </motion.div>
    )
  }

  /* ── Multi-step layout ─────────────────────────────────────────────── */
  return (
    <div>
      {/* Progress pills */}
      <div className="flex items-center gap-1.5 mb-8">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{
              width: i === step ? 28 : 14,
              background: i < step ? '#010C35' : i === step ? '#E20C04' : 'rgba(1,12,53,0.10)',
            }}
            transition={{ duration: 0.35, ease }}
            className="h-1.5 rounded-full"
          />
        ))}
        <span className="ml-auto font-mono text-[10px] tracking-[0.12em] uppercase text-navy/30 select-none">
          {step + 1} / 3
        </span>
      </div>

      {/* Back button (steps 1 + 2) */}
      <AnimatePresence>
        {step > 0 && (
          <motion.button
            type="button"
            onClick={() => goTo(step - 1)}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1.5 text-[13px] text-navy/40 hover:text-navy transition-colors mb-5"
          >
            <ArrowLeft size={14} strokeWidth={2} />
            Back
          </motion.button>
        )}
      </AnimatePresence>

      {/* Step heading */}
      <AnimatePresence mode="wait" custom={direction.current}>
        <motion.div
          key={`heading-${step}`}
          custom={direction.current}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
          className="mb-7"
        >
          <h1
            className="font-display text-navy leading-[1.05] mb-1.5"
            style={{ fontSize: 'clamp(24px, 3vw, 32px)', letterSpacing: '-0.2px' }}
          >
            {STEP_HEADINGS[step].heading}
          </h1>
          <p className="text-[14px] text-navy/45 leading-relaxed">{STEP_HEADINGS[step].sub}</p>
        </motion.div>
      </AnimatePresence>

      {/* Step content */}
      <AnimatePresence mode="wait" custom={direction.current}>
        <motion.div
          key={`step-${step}`}
          custom={direction.current}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
        >

          {/* ══ Step 0: Credentials ══ */}
          {step === 0 && (
            <form className="flex flex-col gap-5" noValidate onSubmit={(e) => { e.preventDefault(); handleStep0Next() }}>
              {/* Social login */}
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handleSocial('apple')}
                  className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl text-[14px] font-semibold text-white transition-opacity hover:opacity-85"
                  style={{ background: '#010C35' }}
                >
                  <AppleIcon />
                  Continue with Apple
                </button>
                <button
                  type="button"
                  onClick={() => handleSocial('google')}
                  className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl border border-navy/[0.12] text-[14px] font-medium text-navy bg-white transition-colors hover:bg-navy/[0.03]"
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
              </div>

              <AnimatePresence>
                {socialMessage && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
                  >
                    {socialMessage}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-navy/[0.07]" />
                <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-navy/30">or with email</span>
                <div className="flex-1 h-px bg-navy/[0.07]" />
              </div>

              {/* Email */}
              <div>
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
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                  className={`w-full bg-white border rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:ring-2 transition ${inputTone('email')}`}
                />
                {fieldMsg('email')}
              </div>

              <div>
                <PasswordInput id="password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" invalid={!!fieldErrors.password} />
                {fieldMsg('password')}
                <PasswordStrength password={password} />
              </div>

              <div>
                <PasswordInput id="confirm-password" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" invalid={!!fieldErrors['confirm-password']} />
                {fieldMsg('confirm-password')}
              </div>

              {error && <ErrorBanner message={error} />}

              <motion.button
                type="submit"
                whileTap={{ scale: 0.98 }}
                className="w-full text-white font-bold text-[16px] py-4 rounded-xl transition-opacity hover:opacity-90"
                style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 24px rgba(226,12,4,0.26)' }}
              >
                Continue
              </motion.button>

              <p className="text-center text-[12px] text-navy/30 leading-relaxed">
                By continuing you agree to our{' '}
                <Link href="/terms" className="underline hover:text-navy/55 transition-colors">Terms</Link>
                {' '}and{' '}
                <Link href="/privacy" className="underline hover:text-navy/55 transition-colors">Privacy Policy</Link>.
              </p>

              <p className="text-center text-[14px] text-navy/45">
                Already have an account?{' '}
                <Link href="/login" className="text-navy font-medium hover:text-[#E20C04] transition-colors">Sign in</Link>
              </p>
            </form>
          )}

          {/* ══ Step 1: About you + location ══ */}
          {step === 1 && (
            <form className="flex flex-col gap-5" noValidate onSubmit={(e) => { e.preventDefault(); handleStep1Next() }}>
              {/* Name fields */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'firstName', label: 'First name', value: firstName, set: setFirstName, auto: 'given-name' },
                  { id: 'lastName',  label: 'Last name',  value: lastName,  set: setLastName,  auto: 'family-name' },
                ].map(f => (
                  <div key={f.id}>
                    <label htmlFor={f.id} className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50 mb-2">
                      {f.label}
                    </label>
                    <input
                      id={f.id}
                      type="text"
                      autoComplete={f.auto}
                      value={f.value}
                      onChange={e => f.set(e.target.value)}
                      required
                      aria-invalid={fieldErrors[f.id] ? true : undefined}
                      aria-describedby={fieldErrors[f.id] ? `${f.id}-error` : undefined}
                      className={`w-full bg-white border rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:ring-2 transition ${inputTone(f.id)}`}
                    />
                    {fieldMsg(f.id)}
                  </div>
                ))}
              </div>

              {/* Phone: country picker + national number (mirrors the app) */}
              <div>
                <label htmlFor="phone" className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50 mb-2">
                  Mobile number
                </label>
                <div className="flex gap-2">
                  <div className={`relative flex-shrink-0 rounded-xl border bg-white transition focus-within:ring-2 ${inputTone('phone')}`}>
                    <span aria-hidden="true" className="flex h-full items-center gap-1.5 px-3.5 text-[15px] text-navy">
                      <span>{country.flag}</span>
                      <span className="font-medium">{country.dial}</span>
                      <ChevronDown size={13} strokeWidth={2.2} className="text-navy/40" />
                    </span>
                    <select
                      id="phone-country"
                      aria-label="Country code"
                      value={country.code}
                      onChange={e => {
                        const next = COUNTRIES_FOR_PICKER.find(c => c.code === e.target.value)
                        if (next) setCountry(next)
                      }}
                      className="absolute inset-0 w-full cursor-pointer opacity-0"
                    >
                      {COUNTRIES_FOR_PICKER.map((c, i) => (
                        <option key={`${c.code}-${i}`} value={c.code}>
                          {`${c.flag} ${c.name} (${c.dial})`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={nationalNumber}
                    onChange={e => setNationalNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                    placeholder={country.example ?? '7700 900000'}
                    required
                    aria-invalid={fieldErrors.phone ? true : undefined}
                    aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                    className={`w-full min-w-0 flex-1 bg-white border rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:ring-2 transition ${inputTone('phone')}`}
                  />
                </div>
                {fieldMsg('phone')}
                <p className="text-[11px] text-navy/35 mt-2 leading-relaxed">
                  We&apos;ll verify this by SMS when you first open the Redeemo app.
                </p>
              </div>

              {/* DOB (required, owner 2026-07-19) + Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dob" className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50 mb-2">
                    Date of birth
                  </label>
                  <input
                    id="dob"
                    type="date"
                    value={dob}
                    onChange={e => setDob(e.target.value)}
                    max={new Date(new Date().setFullYear(new Date().getFullYear() - 16)).toISOString().split('T')[0]}
                    min={new Date(new Date().setFullYear(new Date().getFullYear() - 100)).toISOString().split('T')[0]}
                    autoComplete="bday"
                    required
                    aria-invalid={fieldErrors.dob ? true : undefined}
                    aria-describedby={fieldErrors.dob ? 'dob-error' : undefined}
                    className={`w-full bg-white border rounded-xl px-4 py-3.5 text-[15px] text-navy focus:outline-none focus:ring-2 transition ${inputTone('dob')}`}
                  />
                  {fieldMsg('dob')}
                </div>
                <div>
                  <label htmlFor="gender" className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50 mb-2">
                    Gender
                  </label>
                  <select
                    id="gender"
                    value={gender}
                    onChange={e => setGender(e.target.value)}
                    className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition appearance-none"
                  >
                    <option value="" disabled>Select</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non_binary">Non-binary</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              {/* Postcode lookup */}
              <div>
                <label htmlFor="postcode" className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50 mb-2">
                  Your postcode
                </label>

                {/* Why we ask */}
                <div className="flex items-start gap-2.5 bg-navy/[0.03] border border-navy/[0.06] rounded-xl px-4 py-3 mb-3">
                  <MapPin size={13} strokeWidth={2} className="text-[#E20C04] flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-navy/55 leading-relaxed">
                    We use your postcode to show you offers from local businesses near you. We never share your exact location with merchants.
                  </p>
                </div>

                <div className="relative">
                  <input
                    id="postcode"
                    type="text"
                    value={postcode}
                    onChange={e => handlePostcodeChange(e.target.value)}
                    placeholder="e.g. EC1A 1BB"
                    maxLength={8}
                    autoComplete="postal-code"
                    className={`w-full bg-white border rounded-xl px-4 py-3.5 text-[15px] text-navy uppercase placeholder:normal-case placeholder:text-navy/25 focus:outline-none focus:ring-2 transition pr-11 ${
                      postcodeState === 'valid' ? 'border-green-400 focus:border-green-400 focus:ring-green-100' :
                      postcodeState === 'invalid' ? 'border-red-300 focus:border-red-300 focus:ring-red-50' :
                      'border-navy/[0.1] focus:border-red/40 focus:ring-red/[0.08]'
                    }`}
                  />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    {postcodeState === 'loading' && <Loader2 size={16} className="text-navy/30 animate-spin" />}
                    {postcodeState === 'valid'   && <Check size={16} strokeWidth={2.5} className="text-green-500" />}
                    {postcodeState === 'invalid' && <X size={16} strokeWidth={2.5} className="text-red-400" />}
                  </div>
                </div>

                <AnimatePresence>
                  {postcodeArea && postcodeState === 'valid' && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1.5 text-[12px] text-green-600 mt-2"
                    >
                      <MapPin size={11} strokeWidth={2} />
                      {postcode} · {postcodeArea}
                    </motion.p>
                  )}
                  {postcodeState === 'invalid' && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[12px] text-red-500 mt-2"
                    >
                      We couldn&apos;t find that postcode. Please check and try again.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Marketing consent */}
              <Checkbox id="marketing" checked={marketingConsent} onChange={setMarketingConsent}>
                I&apos;d like to receive exclusive offers and updates from Redeemo by email.
              </Checkbox>

              {error && <ErrorBanner message={error} />}

              <motion.button
                type="submit"
                whileTap={{ scale: 0.98 }}
                className="w-full text-white font-bold text-[16px] py-4 rounded-xl transition-opacity hover:opacity-90"
                style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 24px rgba(226,12,4,0.26)' }}
              >
                Continue
              </motion.button>
            </form>
          )}

          {/* ══ Step 2: Interests ══ */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-2.5">
                {INTERESTS.map((interest, i) => {
                  const selected = selectedInterests.has(interest)
                  return (
                    <motion.button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04, ease }}
                      whileTap={{ scale: 0.97 }}
                      className={`relative flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-left text-[13px] font-medium border transition-all duration-150 ${
                        selected
                          ? 'bg-navy text-white border-navy shadow-sm'
                          : 'bg-white text-navy/65 border-navy/[0.1] hover:border-navy/25 hover:text-navy'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all duration-150 ${
                          selected ? 'bg-[#E20C04]' : 'border border-navy/20'
                        }`}
                      >
                        {selected && <Check size={10} strokeWidth={2.5} className="text-white" />}
                      </span>
                      <span className="leading-snug">{interest}</span>
                    </motion.button>
                  )
                })}
              </div>

              {error && <ErrorBanner message={error} />}

              <motion.button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isLoading}
                whileTap={{ scale: 0.98 }}
                className="w-full text-white font-bold text-[16px] py-4 rounded-xl disabled:opacity-60 transition-opacity hover:opacity-90"
                style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 24px rgba(226,12,4,0.26)' }}
              >
                {isLoading ? 'Creating your account\u2026' : 'Create account'}
              </motion.button>

              <button
                type="button"
                onClick={() => void handleSubmit(new Set())}
                disabled={isLoading}
                className="text-center text-[13px] text-navy/35 hover:text-navy/55 transition-colors bg-transparent border-none cursor-pointer disabled:opacity-40"
              >
                Skip for now
              </button>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  )
}
