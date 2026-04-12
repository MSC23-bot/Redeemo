'use client'
import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { profileApi, ApiError, type ProfileData } from '@/lib/api'

type Props = { profile: ProfileData }

function Field({
  label, value, onChange, type = 'text', readOnly = false,
}: {
  label: string; value: string; onChange?: (v: string) => void
  type?: string; readOnly?: boolean
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/45 mb-2">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        readOnly={readOnly}
        className={`w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition ${
          readOnly ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      />
    </div>
  )
}

export function ProfileForm({ profile }: Props) {
  const [values, setValues] = useState({
    firstName:   profile.firstName,
    dateOfBirth: profile.dateOfBirth
      ? new Date(profile.dateOfBirth).toISOString().split('T')[0]
      : '',
    gender:   profile.gender ?? '',
    city:     profile.city ?? '',
    postcode: profile.postcode ?? '',
  })
  const [newsletter, setNewsletter] = useState(profile.newsletterConsent)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pwOpen, setPwOpen] = useState(false)
  const [pwValues, setPwValues] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  const set = (field: keyof typeof values) => (v: string) =>
    setValues(prev => ({ ...prev, [field]: v }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await profileApi.update({
        firstName:    values.firstName || undefined,
        dateOfBirth:  values.dateOfBirth ? new Date(values.dateOfBirth).toISOString() : null,
        gender:       values.gender || null,
        city:         values.city || null,
        postcode:     values.postcode || null,
        newsletterConsent: newsletter,
      })
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
      setSaveSuccess(true)
      successTimerRef.current = setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setSaveError('Could not save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    if (pwValues.next !== pwValues.confirm) {
      setPwError('New passwords do not match.')
      return
    }
    setPwSaving(true)
    try {
      await profileApi.changePassword(pwValues.current, pwValues.next)
      setPwSuccess(true)
      setPwValues({ current: '', next: '', confirm: '' })
    } catch (err: unknown) {
      setPwError(
        err instanceof ApiError && err.code === 'CURRENT_PASSWORD_INCORRECT'
          ? 'Current password is incorrect.'
          : 'Could not change password. Please try again.'
      )
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Profile completeness bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35">
            Profile completeness
          </span>
          <span className="font-mono text-[12px] text-navy/55">{profile.profileCompleteness}%</span>
        </div>
        <div className="h-1.5 bg-navy/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-red to-orange-red rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${profile.profileCompleteness}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Profile fields form */}
      <form onSubmit={handleSave}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <Field label="First name" value={values.firstName} onChange={set('firstName')} />
          <Field label="Last name" value={profile.lastName} readOnly />
          <Field label="Email" value={profile.email} readOnly />
          <Field label="Date of birth" value={values.dateOfBirth} onChange={set('dateOfBirth')} type="date" />
          <Field label="Gender" value={values.gender} onChange={set('gender')} />
          <Field label="City" value={values.city} onChange={set('city')} />
          <Field label="Postcode" value={values.postcode} onChange={set('postcode')} />
        </div>

        {/* Newsletter consent */}
        <label className="flex items-center gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            id="newsletter-consent"
            checked={newsletter}
            onChange={e => setNewsletter(e.target.checked)}
            className="sr-only"
          />
          <span
            aria-hidden
            className={`w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 transition-colors ${
              newsletter ? 'bg-red border-red' : 'border-navy/20'
            }`}
          >
            {newsletter && <span className="text-white text-[11px]">✓</span>}
          </span>
          <span className="text-[13px] text-navy/60">Receive offers and updates from Redeemo by email</span>
        </label>

        {saveError && (
          <p className="text-red text-[13px] mb-3" role="alert">{saveError}</p>
        )}

        <div className="flex items-center gap-4">
          <motion.button
            type="submit"
            disabled={saving}
            whileTap={{ scale: 0.98 }}
            className="bg-gradient-to-br from-red to-orange-red text-white font-bold text-[15px] px-8 py-3.5 rounded-xl disabled:opacity-60 shadow-[0_4px_20px_rgba(226,0,12,0.2)] hover:shadow-[0_4px_28px_rgba(226,0,12,0.35)] transition-shadow"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </motion.button>
          <AnimatePresence>
            {saveSuccess && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-[13px] text-green-600 font-medium"
              >
                ✓ Saved
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </form>

      {/* Change password — collapsible */}
      <div className="border-t border-navy/[0.06] pt-6">
        <button
          type="button"
          onClick={() => { setPwOpen(o => !o); setPwError(null); setPwSuccess(false) }}
          className="flex items-center gap-2 font-mono text-[12px] tracking-[0.08em] uppercase text-navy/50 hover:text-navy transition-colors"
          aria-expanded={pwOpen}
        >
          <span
            className="transition-transform duration-200"
            style={{ display: 'inline-block', transform: pwOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
            aria-hidden
          >
            ▶
          </span>
          Change password
        </button>

        <AnimatePresence>
          {pwOpen && (
            <motion.form
              key="pw-form"
              onSubmit={handleChangePassword}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4 mt-5 max-w-sm">
                {[
                  { field: 'current', label: 'Current password', id: 'pw-current' },
                  { field: 'next',    label: 'New password',      id: 'pw-new' },
                  { field: 'confirm', label: 'Confirm new password', id: 'pw-confirm' },
                ].map(({ field, label, id }) => (
                  <div key={field}>
                    <label htmlFor={id} className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/45 mb-2">
                      {label}
                    </label>
                    <input
                      id={id}
                      type="password"
                      value={pwValues[field as keyof typeof pwValues]}
                      onChange={e => setPwValues(v => ({ ...v, [field]: e.target.value }))}
                      required
                      className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
                    />
                  </div>
                ))}
                {pwError && <p className="text-red text-[13px]" role="alert">{pwError}</p>}
                {pwSuccess && <p className="text-green-600 text-[13px] font-medium">✓ Password changed</p>}
                <motion.button
                  type="submit"
                  disabled={pwSaving}
                  whileTap={{ scale: 0.98 }}
                  className="bg-navy text-white font-bold text-[14px] px-7 py-3 rounded-xl disabled:opacity-60 w-fit"
                >
                  {pwSaving ? 'Updating…' : 'Update password'}
                </motion.button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
