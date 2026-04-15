'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Lock, ChevronDown, MessageCircle, Check, Loader2, Camera, Paperclip, X, Image as ImageIcon } from 'lucide-react'
import { profileApi, ApiError, type ProfileData } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

type Props = { profile: ProfileData }

/* ── Field (text / read-only) ───────────────────────────────────────────── */
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
        className={`w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/35 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition ${
          readOnly ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      />
    </div>
  )
}

/* ── SelectField ─────────────────────────────────────────────────────────── */
function SelectField({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/45 mb-2">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition appearance-none pr-10"
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown
          size={16}
          strokeWidth={1.8}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none"
        />
      </div>
    </div>
  )
}

/* ── Date of birth — three linked selects ───────────────────────────────── */
function DateOfBirthField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value ? value.split('-') : ['', '', '']
  const [year, setYear]   = useState(parts[0] ?? '')
  const [month, setMonth] = useState(parts[1] ?? '')
  const [day, setDay]     = useState(parts[2] ?? '')

  const emit = (d: string, m: string, y: string) => {
    if (d && m && y) onChange(`${y}-${m}-${d}`)
    else onChange('')
  }
  const handleDay   = (v: string) => { setDay(v);   emit(v, month, year) }
  const handleMonth = (v: string) => { setMonth(v); emit(day, v, year)   }
  const handleYear  = (v: string) => { setYear(v);  emit(day, month, v)  }

  const currentYear = new Date().getFullYear()
  const DAYS   = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const YEARS  = Array.from({ length: 100 }, (_, i) => String(currentYear - 16 - i))

  const selCls = "w-full bg-white border border-navy/[0.1] rounded-xl px-3 py-3.5 text-[15px] text-navy focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition appearance-none pr-7"
  const chevCls = "absolute right-2.5 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none"

  return (
    <div className="sm:col-span-2">
      <span className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/45 mb-2">
        Date of birth
      </span>
      <div className="grid grid-cols-3 gap-2">
        <div className="relative">
          <select value={day} onChange={e => handleDay(e.target.value)} aria-label="Day of birth" className={selCls}>
            <option value="">Day</option>
            {DAYS.map(d => <option key={d} value={d}>{parseInt(d, 10)}</option>)}
          </select>
          <ChevronDown size={13} strokeWidth={1.8} className={chevCls} />
        </div>
        <div className="relative">
          <select value={month} onChange={e => handleMonth(e.target.value)} aria-label="Month of birth" className={selCls}>
            <option value="">Month</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </select>
          <ChevronDown size={13} strokeWidth={1.8} className={chevCls} />
        </div>
        <div className="relative">
          <select value={year} onChange={e => handleYear(e.target.value)} aria-label="Year of birth" className={selCls}>
            <option value="">Year</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <ChevronDown size={13} strokeWidth={1.8} className={chevCls} />
        </div>
      </div>
    </div>
  )
}

/* ── Avatar upload ───────────────────────────────────────────────────────── */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

function AvatarUpload({
  name, currentUrl, onChange,
}: {
  name: string
  currentUrl: string | null
  onChange: (dataUrl: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSizeError(null)
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) {
      setSizeError('Image must be under 3 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      if (ev.target?.result) onChange(ev.target.result as string)
    }
    reader.readAsDataURL(file)
    // Reset input so same file can be picked again
    e.target.value = ''
  }

  return (
    <div className="flex items-center gap-5 pb-6 border-b border-navy/[0.06]">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center select-none"
          style={{ background: 'var(--brand-gradient)' }}
        >
          {currentUrl ? (
            <img src={currentUrl} alt="Profile photo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-bold text-2xl">{getInitials(name)}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Change profile photo"
          className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-navy/10 shadow-sm flex items-center justify-center hover:bg-navy/[0.04] transition-colors"
        >
          <Camera size={13} strokeWidth={2} className="text-navy/60" />
        </button>
      </div>

      <div>
        <p className="text-[14px] font-semibold text-navy mb-0.5">Profile photo</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-[13px] font-medium text-[#E20C04] hover:opacity-75 transition-opacity bg-transparent border-none cursor-pointer p-0"
        >
          {currentUrl ? 'Change photo' : 'Upload photo'}
        </button>
        <p className="text-[11px] text-navy/35 mt-0.5">JPG, PNG or GIF · Max 3 MB</p>
        {sizeError && <p className="text-[12px] text-[#B91C1C] mt-1">{sizeError}</p>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="sr-only"
        aria-hidden="true"
      />
    </div>
  )
}

/* ── Constants ───────────────────────────────────────────────────────────── */
const GENDER_OPTIONS = [
  { value: '',                  label: 'Select gender' },
  { value: 'Male',              label: 'Male' },
  { value: 'Female',            label: 'Female' },
  { value: 'Non-binary',        label: 'Non-binary' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
  { value: 'Other',             label: 'Other' },
]

const SUPPORT_TOPICS = [
  { value: '',                  label: 'Select a topic' },
  { value: 'Account issue',     label: 'Account issue' },
  { value: 'Subscription',      label: 'Subscription' },
  { value: 'Technical problem', label: 'Technical problem' },
  { value: 'Voucher dispute',   label: 'Voucher dispute' },
  { value: 'General enquiry',   label: 'General enquiry' },
  { value: 'Other',             label: 'Other' },
]

/* ── Attachment pill ─────────────────────────────────────────────────────── */
type AttachmentFile = { name: string; dataUrl: string; type: string }

function AttachmentPill({ file, onRemove }: { file: AttachmentFile; onRemove: () => void }) {
  const isImage = file.type.startsWith('image/')
  return (
    <div className="flex items-center gap-2 bg-navy/[0.04] border border-navy/[0.08] rounded-lg px-3 py-2 text-[13px] text-navy/70 max-w-[220px]">
      {isImage
        ? <img src={file.dataUrl} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
        : <ImageIcon size={14} className="flex-shrink-0 text-navy/40" />
      }
      <span className="truncate flex-1 min-w-0">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="flex-shrink-0 text-navy/30 hover:text-navy/60 transition-colors"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function ProfileForm({ profile }: Props) {
  const { updateUser } = useAuth()
  const [values, setValues] = useState({
    firstName:   profile.firstName,
    dateOfBirth: profile.dateOfBirth
      ? new Date(profile.dateOfBirth).toISOString().split('T')[0]
      : '',
    gender:      profile.gender ?? '',
    addressLine1: profile.addressLine1 ?? '',
    city:        profile.city ?? '',
    postcode:    profile.postcode ?? '',
    profileImageUrl: profile.profileImageUrl ?? '',
  })
  const [newsletter, setNewsletter] = useState(profile.newsletterConsent)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Change password
  const [pwOpen, setPwOpen] = useState(false)
  const [pwValues, setPwValues] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  // Interests
  const [interestsOpen, setInterestsOpen] = useState(false)
  const [allInterests, setAllInterests] = useState<{ id: string; name: string }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(profile.interests.map(i => i.id))
  )
  const [interestsSaving, setInterestsSaving] = useState(false)
  const [interestsError, setInterestsError] = useState<string | null>(null)
  const [interestsSuccess, setInterestsSuccess] = useState(false)

  // Contact support
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportTopic, setSupportTopic] = useState('')
  const [supportMessage, setSupportMessage] = useState('')
  const [attachments, setAttachments] = useState<AttachmentFile[]>([])
  const [supportSending, setSupportSending] = useState(false)
  const [supportSent, setSupportSent] = useState(false)
  const [supportError, setSupportError] = useState<string | null>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)

  const set = (field: keyof typeof values) => (v: string) =>
    setValues(prev => ({ ...prev, [field]: v }))

  // Load all available interests when the section opens
  useEffect(() => {
    if (!interestsOpen || allInterests.length > 0) return
    profileApi.listAvailableInterests()
      .then(res => setAllInterests(res.interests))
      .catch(() => {/* silently ignore — chips won't show */})
  }, [interestsOpen, allInterests.length])

  const toggleInterest = useCallback(async (id: string) => {
    setInterestsError(null)
    setInterestsSuccess(false)
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
    setInterestsSaving(true)
    try {
      await profileApi.updateInterests([...next])
      setInterestsSuccess(true)
      setTimeout(() => setInterestsSuccess(false), 2000)
    } catch {
      setInterestsError('Could not save. Please try again.')
      // revert
      setSelectedIds(selectedIds)
    } finally {
      setInterestsSaving(false)
    }
  }, [selectedIds])

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await profileApi.update({
        name:              values.firstName || undefined,
        dateOfBirth:       values.dateOfBirth ? new Date(values.dateOfBirth).toISOString() : undefined,
        gender:            values.gender || undefined,
        addressLine1:      values.addressLine1 || undefined,
        city:              values.city || undefined,
        postcode:          values.postcode || undefined,
        profileImageUrl:   values.profileImageUrl || undefined,
        newsletterConsent: newsletter,
      })
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
      setSaveSuccess(true)
      successTimerRef.current = setTimeout(() => setSaveSuccess(false), 3000)
      // Sync profile image into AuthContext so Navbar updates immediately
      if (values.profileImageUrl !== (profile.profileImageUrl ?? '')) {
        updateUser({ profileImageUrl: values.profileImageUrl || null })
      }
    } catch {
      setSaveError('Could not save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPwError(null)
    if (pwValues.next !== pwValues.confirm) { setPwError('New passwords do not match.'); return }
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

  const handleAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) continue // skip > 5MB
      const reader = new FileReader()
      reader.onload = ev => {
        if (ev.target?.result) {
          setAttachments(prev => [
            ...prev,
            { name: file.name, dataUrl: ev.target!.result as string, type: file.type },
          ])
        }
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const handleSupportSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSupportError(null)
    if (!supportTopic) { setSupportError('Please select a topic.'); return }
    if (supportMessage.trim().length < 20) { setSupportError('Please write at least 20 characters.'); return }
    setSupportSending(true)
    try {
      // TODO: wire to POST /api/v1/customer/support/message when built
      // attachments would be included in the request body
      await new Promise(r => setTimeout(r, 900))
      setSupportSent(true)
      setSupportMessage('')
      setSupportTopic('')
      setAttachments([])
    } catch {
      setSupportError('Could not send your message. Please try again.')
    } finally {
      setSupportSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">

      {/* ── Avatar upload ── */}
      <AvatarUpload
        name={`${profile.firstName} ${profile.lastName}`.trim() || profile.email}
        currentUrl={values.profileImageUrl || null}
        onChange={url => setValues(v => ({ ...v, profileImageUrl: url }))}
      />

      {/* ── Profile completeness bar ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35">
            Profile completeness
          </span>
          <span className="font-mono text-[12px] text-navy/55">{profile.profileCompleteness}%</span>
        </div>
        <div className="h-1.5 bg-navy/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'var(--brand-gradient)' }}
            initial={{ width: 0 }}
            animate={{ width: `${profile.profileCompleteness}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <p className="text-[11px] text-navy/35 mt-1.5">
          Complete all fields to reach 100% — profile photo, interests, address and phone all count.
        </p>
      </div>

      {/* ── Profile fields form ── */}
      <form onSubmit={handleSave}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
          <Field label="First name" value={values.firstName} onChange={set('firstName')} />
          <Field label="Last name"  value={profile.lastName} readOnly />
          <Field label="Email address" value={profile.email} readOnly />
          <Field label="Phone number"  value={profile.phone ?? 'Not added'} readOnly />
          <DateOfBirthField value={values.dateOfBirth} onChange={set('dateOfBirth')} />
          <SelectField
            label="Gender"
            value={values.gender}
            onChange={set('gender')}
            options={GENDER_OPTIONS}
          />
          <Field label="Address line 1" value={values.addressLine1} onChange={set('addressLine1')} />
          <Field label="City"     value={values.city}     onChange={set('city')} />
          <Field label="Postcode" value={values.postcode} onChange={set('postcode')} />
        </div>

        {/* Locked fields note */}
        <div className="flex items-start gap-2.5 bg-navy/[0.03] border border-navy/[0.06] rounded-xl px-4 py-3 mb-5">
          <Lock size={12} strokeWidth={2} className="text-navy/35 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-navy/50 leading-relaxed">
            Email and phone number require identity verification to change.
            To update either, use the <button type="button" onClick={() => setSupportOpen(true)} className="underline hover:text-navy/70 transition-colors bg-transparent border-none cursor-pointer text-[12px] text-navy/50 p-0">Contact support</button> form below.
          </p>
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

        {saveError && <p className="text-red text-[13px] mb-3" role="alert">{saveError}</p>}

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

      {/* ── Interests ─ collapsible ── */}
      <div className="border-t border-navy/[0.06] pt-6">
        <button
          type="button"
          onClick={() => setInterestsOpen(o => !o)}
          className="flex items-center gap-2 font-mono text-[12px] tracking-[0.08em] uppercase text-navy/50 hover:text-navy transition-colors"
          aria-expanded={interestsOpen}
        >
          <span
            aria-hidden
            className="transition-transform duration-200"
            style={{ display: 'inline-block', transform: interestsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >▶</span>
          Interests
          {selectedIds.size > 0 && (
            <span className="ml-1 font-sans font-medium text-[11px] text-white bg-[#E20C04] rounded-full px-1.5 py-0.5 normal-case tracking-normal">
              {selectedIds.size}
            </span>
          )}
        </button>

        <AnimatePresence>
          {interestsOpen && (
            <motion.div
              key="interests-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-4">
                <p className="text-[13px] text-navy/50 mb-4 leading-relaxed">
                  Select the categories that interest you most. We use these to personalise your experience.
                </p>

                {allInterests.length === 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-9 w-28 bg-navy/[0.05] rounded-full animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allInterests.map(interest => {
                      const active = selectedIds.has(interest.id)
                      return (
                        <motion.button
                          key={interest.id}
                          type="button"
                          onClick={() => toggleInterest(interest.id)}
                          disabled={interestsSaving}
                          whileTap={{ scale: 0.96 }}
                          className={`px-4 py-2 rounded-full text-[13px] font-medium border transition-all duration-150 ${
                            active
                              ? 'bg-[#010C35] border-[#010C35] text-white shadow-sm'
                              : 'bg-white border-navy/[0.15] text-navy/60 hover:border-navy/30 hover:text-navy'
                          } ${interestsSaving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {active && <Check size={12} strokeWidth={2.5} className="inline mr-1.5 -mt-0.5" />}
                          {interest.name}
                        </motion.button>
                      )
                    })}
                  </div>
                )}

                <div className="flex items-center gap-3 mt-3 h-5">
                  {interestsSaving && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-[12px] text-navy/40">
                      <Loader2 size={12} className="animate-spin" /> Saving…
                    </motion.span>
                  )}
                  <AnimatePresence>
                    {interestsSuccess && (
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px] text-green-600 font-medium">
                        ✓ Saved
                      </motion.span>
                    )}
                    {interestsError && (
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px] text-[#B91C1C]">
                        {interestsError}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Change password ─ collapsible ── */}
      <div className="border-t border-navy/[0.06] pt-6">
        <button
          type="button"
          onClick={() => { setPwOpen(o => !o); setPwError(null); setPwSuccess(false) }}
          className="flex items-center gap-2 font-mono text-[12px] tracking-[0.08em] uppercase text-navy/50 hover:text-navy transition-colors"
          aria-expanded={pwOpen}
        >
          <span
            aria-hidden
            className="transition-transform duration-200"
            style={{ display: 'inline-block', transform: pwOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >▶</span>
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
                  { field: 'current', label: 'Current password',     id: 'pw-current' },
                  { field: 'next',    label: 'New password',          id: 'pw-new'     },
                  { field: 'confirm', label: 'Confirm new password',  id: 'pw-confirm' },
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
                {pwError   && <p className="text-red text-[13px]" role="alert">{pwError}</p>}
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

      {/* ── Contact support ─ collapsible ── */}
      <div className="border-t border-navy/[0.06] pt-6">
        <button
          type="button"
          onClick={() => { setSupportOpen(o => !o); setSupportError(null) }}
          className="flex items-center gap-2 font-mono text-[12px] tracking-[0.08em] uppercase text-navy/50 hover:text-navy transition-colors"
          aria-expanded={supportOpen}
        >
          <span
            aria-hidden
            className="transition-transform duration-200"
            style={{ display: 'inline-block', transform: supportOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >▶</span>
          Contact support
        </button>

        <AnimatePresence>
          {supportOpen && (
            <motion.div
              key="support-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <AnimatePresence mode="wait">
                {supportSent ? (
                  <motion.div
                    key="sent"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-5 bg-green-50 border border-green-200 rounded-2xl p-6 flex items-start gap-4"
                  >
                    <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Check size={16} strokeWidth={2.5} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-green-800 mb-1">Message sent</p>
                      <p className="text-[13px] text-green-700 leading-relaxed">
                        We&apos;ve received your message and will get back to you within 1–2 business days.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSupportSent(false)}
                        className="text-[12px] text-green-600 hover:text-green-800 transition-colors mt-3 underline bg-transparent border-none cursor-pointer"
                      >
                        Send another message
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.form
                    key="support-form"
                    onSubmit={handleSupportSubmit}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-5 flex flex-col gap-4 max-w-lg"
                  >
                    <SelectField
                      label="Topic"
                      value={supportTopic}
                      onChange={setSupportTopic}
                      options={SUPPORT_TOPICS}
                    />

                    <div>
                      <label htmlFor="support-message" className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/45 mb-2">
                        Message
                      </label>
                      <textarea
                        id="support-message"
                        value={supportMessage}
                        onChange={e => setSupportMessage(e.target.value)}
                        placeholder="Describe your issue or question…"
                        rows={4}
                        className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition resize-none leading-relaxed"
                      />
                      <p className="font-mono text-[10px] text-navy/30 mt-1.5 text-right">
                        {supportMessage.trim().length} chars {supportMessage.trim().length < 20 && `· min 20`}
                      </p>
                    </div>

                    {/* Attachments */}
                    <div>
                      <span className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/45 mb-2">
                        Attachments <span className="normal-case font-sans tracking-normal text-navy/30">(optional)</span>
                      </span>
                      {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {attachments.map((file, i) => (
                            <AttachmentPill
                              key={i}
                              file={file}
                              onRemove={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                            />
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => attachInputRef.current?.click()}
                        className="flex items-center gap-2 text-[13px] font-medium text-navy/50 hover:text-navy border border-dashed border-navy/[0.15] hover:border-navy/30 rounded-xl px-4 py-2.5 transition-colors bg-transparent cursor-pointer"
                      >
                        <Paperclip size={13} strokeWidth={1.8} />
                        Add screenshot or file
                      </button>
                      <p className="text-[11px] text-navy/30 mt-1.5">
                        JPG, PNG, PDF or GIF · Max 5 MB each
                      </p>
                      <input
                        ref={attachInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        multiple
                        onChange={handleAttach}
                        className="sr-only"
                        aria-hidden="true"
                      />
                    </div>

                    {supportError && (
                      <p className="text-[13px] text-[#B91C1C] bg-red-50 border border-red-200 rounded-xl px-4 py-3" role="alert">
                        {supportError}
                      </p>
                    )}

                    <motion.button
                      type="submit"
                      disabled={supportSending}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-2 bg-navy text-white font-bold text-[14px] px-7 py-3 rounded-xl disabled:opacity-60 w-fit"
                    >
                      {supportSending
                        ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                        : <><MessageCircle size={14} strokeWidth={2} /> Send message</>
                      }
                    </motion.button>
                  </motion.form>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Danger zone ── */}
      <div className="border-t border-navy/[0.06] pt-8 mt-2">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-navy/25 mb-4">Danger zone</p>
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/60 px-5 py-4">
          <div>
            <p className="text-[14px] font-medium text-navy mb-0.5">Delete account</p>
            <p className="text-[12px] text-navy/45 leading-relaxed">
              Permanently remove your account and all personal data.
            </p>
          </div>
          <Link
            href="/account/delete"
            className="flex-shrink-0 ml-5 text-[13px] font-medium text-[#B91C1C] hover:underline no-underline transition-colors"
          >
            Delete
          </Link>
        </div>
      </div>
    </div>
  )
}
