'use client'

import { useId, useState } from 'react'
import { FileUpload } from '@/components/ui/file-upload'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { LocationLookupField, type LocationPick } from '@/components/branches/LocationLookupField'
import { Plus, X } from '@/lib/icons'
import {
  DAY_LABELS,
  addWindow,
  applyOpen24h,
  copyMondayToAllDays,
  copyMondayToWeekdays,
  removeWindow,
  setWindow,
  validateHoursState,
  type DayHours,
} from '@/components/onboarding/branch/lib/hoursModel'
import type { Amenity } from '@/lib/api/branch'

// M2 F4: the "Add your main branch" step. Built without react-hook-form because the
// opening-hours field array + the amenity chips + the photo array are local
// component state with cross-field rules (the hours validator); a single useState
// model is clearer than a heavily-Controller'd rhf form. The page owns the API
// calls; this form owns presentation + the create-minimum + hours + PIN client
// validation, and surfaces the assembled values on the dual CTA.

const ABOUT_LIMIT = 600
const MAX_PHOTOS = 8
const PIN_REGEX = /^\d{4}$/

export interface BranchFormValues {
  name: string
  about: string
  addressLine1: string
  addressLine2: string
  city: string
  postcode: string
  phone: string
  email: string
  websiteUrl: string
  bannerUrl: string
  photos: string[]
  pin: string
  hours: DayHours[]
  amenityIds: string[]
  // Branches PR-6: the opaque token from a Google location pick (resolved server-side
  // to admin-review metadata on create; NEVER lat/lng). Empty when the address was
  // typed by hand, or after a manual address edit clears a prior pick.
  candidateToken: string
}

export interface HeadOfficeAddress {
  addressLine1: string
  addressLine2: string
  city: string
  postcode: string
}

interface BranchStepFormProps {
  initialValues: BranchFormValues
  amenities: Amenity[]
  onSaveContinue: (values: BranchFormValues) => void
  onSaveLater: (values: BranchFormValues) => void
  onBack: () => void
  saving: boolean
  saveError: string | null
  /** The merchant business description, offered as a one-tap prefill for the branch about. */
  businessDescription: string | null
  /** The registered/head-office address, offered as a one-tap "same as head office" prefill. */
  headOffice: HeadOfficeAddress | null
}

interface FieldErrors {
  name?: string
  addressLine1?: string
  city?: string
  postcode?: string
  pin?: string
}

export function BranchStepForm({
  initialValues,
  amenities,
  onSaveContinue,
  onSaveLater,
  onBack,
  saving,
  saveError,
  businessDescription,
  headOffice,
}: BranchStepFormProps) {
  const ids = useFieldIds()
  const [values, setValues] = useState<BranchFormValues>(initialValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [hoursErrors, setHoursErrors] = useState<Record<number, string>>({})

  function set<K extends keyof BranchFormValues>(key: K, value: BranchFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  // PR-6: a manual edit to an address field invalidates a prior Google-pick token, so
  // a stale token never rides along with a hand-typed address.
  function setAddressField(
    key: 'addressLine1' | 'addressLine2' | 'city' | 'postcode',
    value: string,
  ) {
    setValues((prev) => ({ ...prev, [key]: value, candidateToken: '' }))
  }

  // PR-6: autofill the existing address fields from a Google pick + hold the token.
  function applyPick(pick: LocationPick) {
    setValues((prev) => ({
      ...prev,
      addressLine1: pick.addressParts.addressLine1 ?? prev.addressLine1,
      city: pick.addressParts.city ?? prev.city,
      postcode: pick.addressParts.postcode ?? prev.postcode,
      candidateToken: pick.candidateToken,
    }))
  }

  function patchDay(dayOfWeek: number, fn: (d: DayHours) => DayHours) {
    setValues((prev) => ({
      ...prev,
      hours: prev.hours.map((d) => (d.dayOfWeek === dayOfWeek ? fn(d) : d)),
    }))
  }

  function toggleAmenity(id: string) {
    setValues((prev) => ({
      ...prev,
      amenityIds: prev.amenityIds.includes(id)
        ? prev.amenityIds.filter((x) => x !== id)
        : [...prev.amenityIds, id],
    }))
  }

  function validateForContinue(v: BranchFormValues): { ok: boolean; field: FieldErrors; hours: Record<number, string> } {
    const field: FieldErrors = {}
    if (!v.name.trim()) field.name = 'Branch name is required.'
    if (!v.addressLine1.trim()) field.addressLine1 = 'Address line 1 is required.'
    if (!v.city.trim()) field.city = 'Town or city is required.'
    if (!v.postcode.trim()) field.postcode = 'Postcode is required.'
    if (v.pin.trim() && !PIN_REGEX.test(v.pin.trim())) field.pin = 'The PIN must be exactly 4 digits.'
    const hours = validateHoursState(v.hours)
    const ok = Object.keys(field).length === 0 && Object.keys(hours).length === 0
    return { ok, field, hours }
  }

  function handleContinue() {
    const { ok, field, hours } = validateForContinue(values)
    setErrors(field)
    setHoursErrors(hours)
    if (!ok) return
    onSaveContinue(values)
  }

  function handleSaveLater() {
    // Finish-later does NOT require the create-minimum (the page gates that), but it
    // runs the SAME client hours mirror as continue, so invalid hours surface inline
    // here rather than as a backend OPENING_HOURS_INVALID 400. Days left closed carry
    // no times and pass cleanly, so finish-later still works without setting hours.
    const hours = validateHoursState(values.hours)
    setHoursErrors(hours)
    if (Object.keys(hours).length > 0) return
    onSaveLater(values)
  }

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#FFFFFF_0%,#FFF6F1_100%)] text-[#010C35]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-3.5 border-b border-[#EEF1F4] bg-white/90 px-5 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-[38px] items-center gap-1.5 rounded-[10px] border border-[#E5E7EB] bg-white pl-2.5 pr-3 text-[13px] font-bold text-[#455373] transition-colors hover:bg-[#F8F9FA]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back to dashboard
        </button>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-[20px] bg-[#FEF0EE] px-3 text-[12px] font-extrabold uppercase tracking-wider text-[#E84A00]">
          <span className="size-1.5 rounded-full bg-[#E84A00]" aria-hidden="true" />
          Setup step 4 of 6
        </span>
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-[880px] flex-1 px-7 pb-36 pt-9">
        <div>
          <h1 className="font-display text-[36px] font-semibold leading-[1.1] tracking-tight text-[#010C35]">
            Add your main branch
          </h1>
          <p className="mt-3.5 max-w-[60ch] text-[16px] leading-relaxed text-[#566079]">
            This is the location customers visit and where they redeem. You can add more branches once you are live.
          </p>
        </div>

        {/* Section 1: branch details */}
        <section className="mt-9 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
          <SectionHeading n={1} title="Branch details" />

          <div className="mt-5 grid gap-4">
            <div>
              <TextField
                id={ids.name}
                label="Branch name"
                placeholder="Old Foundry Kitchen, Huddersfield"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
              />
              <FieldError message={errors.name} />
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#3A465F]">Branch description</span>
                {businessDescription ? (
                  <button
                    type="button"
                    onClick={() => set('about', businessDescription)}
                    className="text-[12.5px] font-bold text-[#E20C04] hover:underline"
                  >
                    Use my business description
                  </button>
                ) : null}
              </div>
              <div className="mt-1.5">
                <Textarea
                  id={ids.about}
                  label="Branch description"
                  maxLength={ABOUT_LIMIT}
                  placeholder="Anything specific to this location, like parking, accessibility, or what makes it special."
                  value={values.about}
                  onChange={(e) => set('about', e.target.value)}
                  hint="Optional. Leave blank to use your business description."
                  className="[&>label]:sr-only"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: address */}
        <section className="mt-6 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <SectionHeading n={2} title="Address" />
            {headOffice ? (
              <button
                type="button"
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    addressLine1: headOffice.addressLine1,
                    addressLine2: headOffice.addressLine2,
                    city: headOffice.city,
                    postcode: headOffice.postcode,
                    // A manual prefill is not a Google pick: clear any held token.
                    candidateToken: '',
                  }))
                }
                className="text-[12.5px] font-bold text-[#E20C04] hover:underline"
              >
                Same as head office
              </button>
            ) : null}
          </div>

          {/* PR-6: business / address lookup. Picking a result autofills the address
              fields below + holds the token for the create submit. The merchant
              reviews/edits before saving. No map, no pin, no coordinates. */}
          <div className="mt-5">
            <LocationLookupField id={`${ids.addressLine1}-lookup`} onPick={applyPick} />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField
                id={ids.addressLine1}
                label="Address line 1"
                placeholder="12 Mill Lane"
                value={values.addressLine1}
                onChange={(e) => setAddressField('addressLine1', e.target.value)}
              />
              <FieldError message={errors.addressLine1} />
            </div>
            <div className="sm:col-span-2">
              <TextField
                id={ids.addressLine2}
                label="Address line 2"
                optional
                placeholder="Unit, floor, or building"
                value={values.addressLine2}
                onChange={(e) => setAddressField('addressLine2', e.target.value)}
              />
            </div>
            <div>
              <TextField
                id={ids.city}
                label="Town or city"
                placeholder="Huddersfield"
                value={values.city}
                onChange={(e) => setAddressField('city', e.target.value)}
              />
              <FieldError message={errors.city} />
            </div>
            <div>
              <TextField
                id={ids.postcode}
                label="Postcode"
                placeholder="HD1 1AA"
                value={values.postcode}
                onChange={(e) => setAddressField('postcode', e.target.value)}
              />
              <FieldError message={errors.postcode} />
            </div>
          </div>

          <p className="mt-4 rounded-[12px] bg-[#FFF6EE] px-4 py-3 text-[13px] leading-relaxed text-[#8A5A1E]">
            We confirm your exact location before you go live, so the pin on the map is spot on for customers.
          </p>
        </section>

        {/* Section 3: customer contact */}
        <section className="mt-6 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
          <SectionHeading n={3} title="Customer contact for this branch" badge="Optional" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <TextField
                id={ids.phone}
                label="Branch phone"
                optional
                type="tel"
                placeholder="+44 1484 000000"
                value={values.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </div>
            <div>
              <TextField
                id={ids.email}
                label="Branch email"
                optional
                type="email"
                placeholder="hello@oldfoundry.co.uk"
                value={values.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 max-w-[420px]">
              <TextField
                id={ids.websiteUrl}
                label="Branch website"
                optional
                type="url"
                placeholder="oldfoundry.co.uk"
                value={values.websiteUrl}
                onChange={(e) => set('websiteUrl', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Section 4: opening hours */}
        <section className="mt-6 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
          <SectionHeading n={4} title="Opening hours" />
          <div className="mt-3 flex flex-wrap gap-2.5">
            <BulkButton onClick={() => set('hours', copyMondayToWeekdays(values.hours))}>
              Copy Monday to weekdays
            </BulkButton>
            <BulkButton onClick={() => set('hours', copyMondayToAllDays(values.hours))}>
              Copy Monday to all days
            </BulkButton>
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            {DAY_LABELS.map(({ dayOfWeek, label }) => {
              const day = values.hours.find((d) => d.dayOfWeek === dayOfWeek)!
              const rowError = hoursErrors[dayOfWeek]
              return (
                <div
                  key={dayOfWeek}
                  data-testid={`hours-row-${dayOfWeek}`}
                  className="rounded-[14px] border border-[#EFE7E2] bg-[#FCFBFA] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <span className="w-[92px] shrink-0 text-sm font-bold text-[#010C35]">{label}</span>
                    <div className="flex items-center gap-2">
                      <Switch
                        label={`Open on ${label}`}
                        checked={!day.isClosed}
                        onCheckedChange={(open) =>
                          patchDay(dayOfWeek, (d) =>
                            open
                              ? {
                                  ...d,
                                  isClosed: false,
                                  windows: d.windows.length > 0 ? d.windows : [{ openTime: '09:00', closeTime: '17:00' }],
                                }
                              : { ...d, isClosed: true, windows: [] },
                          )
                        }
                      />
                      <span className="text-[13px] font-semibold text-[#566079]">
                        {day.isClosed ? 'Closed' : 'Open'}
                      </span>
                    </div>

                    {!day.isClosed ? (
                      <div className="flex flex-col gap-2">
                        {day.windows.map((w, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2">
                            <TimeField
                              id={`${ids.hoursPrefix}-${dayOfWeek}-${i}-open`}
                              label={`${label} opening time, window ${i + 1}`}
                              value={w.openTime}
                              onChange={(v) => patchDay(dayOfWeek, (d) => setWindow(d, i, { openTime: v }))}
                            />
                            <span aria-hidden="true" className="text-sm text-[#8089A4]">
                              to
                            </span>
                            <TimeField
                              id={`${ids.hoursPrefix}-${dayOfWeek}-${i}-close`}
                              label={`${label} closing time, window ${i + 1}`}
                              value={w.closeTime}
                              onChange={(v) => patchDay(dayOfWeek, (d) => setWindow(d, i, { closeTime: v }))}
                            />
                            {i === 0 ? (
                              <button
                                type="button"
                                onClick={() => patchDay(dayOfWeek, (d) => applyOpen24h(d))}
                                className="rounded-[8px] border border-[#E3E7EE] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#455373] hover:border-[#E20C04] hover:text-[#E20C04]"
                              >
                                Open 24 hours
                              </button>
                            ) : null}
                            {day.windows.length > 1 ? (
                              <button
                                type="button"
                                data-testid={`remove-window-${dayOfWeek}-${i}`}
                                aria-label={`Remove ${label} window ${i + 1}`}
                                onClick={() => patchDay(dayOfWeek, (d) => removeWindow(d, i))}
                                className="inline-flex size-7 items-center justify-center rounded-[8px] border border-[#E3E7EE] bg-white text-[#8089A4] hover:border-[#E20C04] hover:text-[#E20C04]"
                              >
                                <X size={14} aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        ))}
                        <button
                          type="button"
                          data-testid={`add-window-${dayOfWeek}`}
                          onClick={() => patchDay(dayOfWeek, (d) => addWindow(d))}
                          className="inline-flex w-fit items-center gap-1 rounded-[8px] px-1.5 py-1 text-[12px] font-bold text-[#E20C04] hover:underline"
                        >
                          <Plus size={13} aria-hidden />
                          Add a window
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {rowError ? <FieldError message={rowError} /> : null}
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[#8089A4]">
            Use 24 hour times. Add a window for a split day (for example a lunch close). A closing time earlier
            than the opening time means you stay open past midnight.
          </p>
        </section>

        {/* Section 5: amenities */}
        <section className="mt-6 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
          <SectionHeading n={5} title="Amenities" badge="Optional" />
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#8089A4]">
            Tap the amenities customers can expect at this branch.
          </p>
          {amenities.length === 0 ? (
            <p className="mt-4 text-[13.5px] text-[#8089A4]">
              No amenities to choose from for your category yet. You can skip this.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2.5">
              {amenities.map((a) => {
                const selected = values.amenityIds.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleAmenity(a.id)}
                    className={cn(
                      'inline-flex h-[34px] items-center rounded-full border-[1.5px] px-3.5 text-[13px] font-bold transition-colors',
                      selected
                        ? 'border-[#010C35] bg-[#010C35] text-white'
                        : 'border-[#E3E7EE] bg-white text-[#455373] hover:border-[#E20C04] hover:text-[#E20C04]',
                    )}
                  >
                    {a.name}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Section 6: photos + banner */}
        <section className="mt-6 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
          <SectionHeading n={6} title="Photos" badge="Optional" />

          <div className="mt-5">
            <span className="text-sm font-semibold text-[#3A465F]">Branch banner</span>
            <div className="mt-2 max-w-[420px]">
              <FileUpload
                kind="banner"
                label={values.bannerUrl ? 'Branch banner added' : 'Upload a branch banner'}
                hint="Wide, JPG or PNG, at least 1600 by 600 pixels, up to 5 MB."
                onUploaded={(url) => set('bannerUrl', url)}
              />
            </div>
          </div>

          <div className="mt-6">
            <span className="text-sm font-semibold text-[#3A465F]">Branch photos</span>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#8089A4]">
              Up to {MAX_PHOTOS}. Photos go to our team for a quick review before they appear on your page.
            </p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {values.photos.map((url, i) => (
                <div key={`${url}-${i}`} className="relative size-[88px] overflow-hidden rounded-[12px] border border-[#E3E7EE] bg-[#F8F9FB]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Branch photo ${i + 1}`} className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove branch photo ${i + 1}`}
                    onClick={() => set('photos', values.photos.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-[#010C35]/80 text-[11px] font-bold text-white"
                  >
                    x
                  </button>
                </div>
              ))}
              {values.photos.length < MAX_PHOTOS ? (
                <div className="w-[200px]">
                  <FileUpload
                    kind="photo"
                    label="Add a branch photo"
                    onUploaded={(url) => set('photos', [...values.photos, url])}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* Section 7: redemption PIN */}
        <section className="mt-6 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
          <SectionHeading n={7} title="Redemption PIN" />
          <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-[#566079]">
            Staff enter this PIN to confirm a customer redemption in store. Choose a 4 digit code and share it only
            with the people who serve customers at this branch.
          </p>
          <div className="mt-5 max-w-[200px]">
            <TextField
              id={ids.pin}
              label="Redemption PIN"
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              value={values.pin}
              onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <FieldError message={errors.pin} />
          </div>
        </section>

        {saveError ? (
          <div
            role="alert"
            className="mt-6 rounded-[14px] border border-[#F4CFC9] bg-[#FEECEC] px-4 py-3 text-[13.5px] font-medium text-[#B91C1C]"
          >
            {saveError}
          </div>
        ) : null}
      </main>

      {/* Sticky footer: dual CTA */}
      <footer className="sticky bottom-0 border-t border-[#EFE7E2] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[880px] flex-wrap items-center gap-3.5 px-7 py-[18px]">
          <p className="min-w-[200px] flex-1 text-[13px] leading-relaxed text-[#8089A4]">
            Save and continue marks this step done. Save and finish later keeps your progress.
          </p>
          <button
            type="button"
            onClick={handleSaveLater}
            disabled={saving}
            className="h-[52px] rounded-[13px] border-[1.5px] border-[#D7DBE2] bg-white px-[22px] text-[15px] font-bold text-[#010C35] transition-colors hover:bg-[#F8F9FB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save and finish later
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            className="h-[52px] rounded-[13px] px-7 text-[15.5px] font-extrabold text-white transition-transform enabled:hover:-translate-y-px disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg,#E20C04 0%,#E84A00 100%)',
              boxShadow: '0 14px 30px -12px rgba(226,12,4,0.6)',
            }}
          >
            {saving ? 'Saving...' : 'Save and continue'}
          </button>
        </div>
      </footer>
    </div>
  )
}

function useFieldIds() {
  const prefix = useId()
  return {
    name: `${prefix}-name`,
    about: `${prefix}-about`,
    addressLine1: `${prefix}-address1`,
    addressLine2: `${prefix}-address2`,
    city: `${prefix}-city`,
    postcode: `${prefix}-postcode`,
    phone: `${prefix}-phone`,
    email: `${prefix}-email`,
    websiteUrl: `${prefix}-website`,
    pin: `${prefix}-pin`,
    hoursPrefix: `${prefix}-hours`,
  }
}

function SectionHeading({ n, title, badge }: { n: number; title: string; badge?: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span
        aria-hidden="true"
        className="inline-flex size-6 items-center justify-center rounded-full bg-[#010C35] text-[12px] font-extrabold text-white"
      >
        {n}
      </span>
      <h2 className="font-display text-[22px] font-semibold text-[#010C35]">{title}</h2>
      {badge ? <span className="ml-1.5 text-[12px] font-bold text-[#8089A4]">{badge}</span> : null}
    </div>
  )
}

interface TextFieldProps extends React.ComponentProps<'input'> {
  id: string
  label: string
  optional?: boolean
  hint?: string
}

const TextField = ({ id, label, optional, hint, className, ...props }: TextFieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-semibold text-[#3A465F]">
      {label}
      {optional ? <span className="text-[11px] font-medium text-[#8089A4]">Optional</span> : null}
    </label>
    <input
      id={id}
      className={cn(
        'h-12 rounded-[12px] border-[1.5px] border-[#E3E7EE] bg-[#FCFCFD] px-[15px] text-[15px] text-[#010C35] outline-none transition-[border-color,background] focus-visible:border-[#E20C04] focus-visible:bg-white',
        className,
      )}
      {...props}
    />
    {hint ? <span className="text-xs text-[#8089A4]">{hint}</span> : null}
  </div>
)

function TimeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <span className="inline-flex flex-col">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        aria-label={label}
        type="text"
        inputMode="numeric"
        placeholder="09:00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-[88px] rounded-[10px] border-[1.5px] border-[#E3E7EE] bg-white px-2.5 text-center text-[14px] tabular-nums text-[#010C35] outline-none focus-visible:border-[#E20C04]"
      />
    </span>
  )
}

function BulkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[#E3E7EE] bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-[#455373] transition-colors hover:border-[#E20C04] hover:text-[#E20C04]"
    >
      {children}
    </button>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <span role="alert" className="mt-1.5 block text-xs font-medium text-[#B91C1C]">
      {message}
    </span>
  )
}
