'use client'

import { useId } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FileUpload } from '@/components/ui/file-upload'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

// M2 F3 (D4): the Tier-1 business-profile step. Built with react-hook-form +
// zodResolver. Tier-1 ONLY per the conflict ledger (F3 scope): logo + cover image
// (B5 upload), business description (required, 600-char counter), public website,
// registered + trading business name, company number, and a VAT Yes/No toggle that
// reveals a VAT number field. The prototype's Section 2 (About you) + Section 3
// (business type / charity / UTR / registered address) + the Values chips are M3 and
// are NOT built here.
//
// Validation seam: "Save and continue" runs zodResolver (description + businessName
// required) and only fires onSaveContinue on a valid form. "Save and finish later"
// bypasses validation entirely and fires onSaveLater with whatever is filled (a true
// partial save). Both surface the same ProfileFormValues; the page maps that to the
// PATCH body. Sensitive fields write directly in the draft window (B1); the page maps
// the backend SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST error defensively.

const DESC_LIMIT = 600

const schema = z.object({
  businessName: z.string().trim().min(1, 'Registered business name is required.'),
  tradingName: z.string(),
  description: z.string().trim().min(1, 'Business description is required.').max(DESC_LIMIT),
  websiteUrl: z.string(),
  companyNumber: z.string(),
  vatRegistered: z.boolean(),
  vatNumber: z.string(),
  logoUrl: z.string(),
  bannerUrl: z.string(),
})

export type ProfileFormValues = z.infer<typeof schema>

interface BusinessProfileFormProps {
  initialValues: ProfileFormValues
  onSaveContinue: (values: ProfileFormValues) => void
  onSaveLater: (values: ProfileFormValues) => void
  onBack: () => void
  saving: boolean
  saveError: string | null
}

export function BusinessProfileForm({
  initialValues,
  onSaveContinue,
  onSaveLater,
  onBack,
  saving,
  saveError,
}: BusinessProfileFormProps) {
  const ids = useFieldIds()
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
    // Validate on submit so "Save and finish later" never trips a required error and
    // the user gets the gate only when they ask to continue.
    mode: 'onSubmit',
  })

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
          Setup step 3 of 6
        </span>
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-[880px] flex-1 px-7 pb-36 pt-9">
        <div>
          <h1 className="font-display text-[36px] font-semibold leading-[1.1] tracking-tight text-[#010C35]">
            Complete your business profile
          </h1>
          <p className="mt-3.5 max-w-[60ch] text-[16px] leading-relaxed text-[#566079]">
            This is how customers see you, plus the details we use to verify your business.
          </p>
        </div>

        <form onSubmit={handleSubmit((values) => onSaveContinue(values))} noValidate>
          {/* Section 1: public profile */}
          <section className="mt-9 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
            <SectionHeading n={1} title="Your public profile" badge="What customers see" />

            {/* Logo + cover */}
            <div className="mt-5 grid gap-[18px] sm:grid-cols-[148px_1fr]">
              <Controller
                control={control}
                name="logoUrl"
                render={({ field }) => (
                  <div>
                    <FileUpload
                      kind="logo"
                      label={field.value ? 'Logo added' : 'Upload logo'}
                      hint="Square, PNG or JPG, at least 512 by 512 pixels, up to 2 MB."
                      onUploaded={(url) => field.onChange(url)}
                    />
                  </div>
                )}
              />
              <Controller
                control={control}
                name="bannerUrl"
                render={({ field }) => (
                  <div>
                    <FileUpload
                      kind="banner"
                      label={field.value ? 'Cover image added' : 'Upload a brand cover image'}
                      hint="Wide, JPG or PNG, at least 1600 by 600 pixels, up to 5 MB. Optional."
                      onUploaded={(url) => field.onChange(url)}
                    />
                  </div>
                )}
              />
            </div>

            {/* Description */}
            <div className="mt-6">
              <Controller
                control={control}
                name="description"
                render={({ field }) => (
                  <Textarea
                    id={ids.description}
                    label="Business description"
                    maxLength={DESC_LIMIT}
                    placeholder="Tell customers what makes you special, what you offer, and why they will love it."
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    hint="Tell customers what makes you special, what you offer, and why they will love it."
                  />
                )}
              />
              <FieldError message={errors.description?.message} />
            </div>

            {/* Public website */}
            <div className="mt-6 max-w-[420px]">
              <TextField
                id={ids.websiteUrl}
                label="Public website"
                optional
                type="url"
                placeholder="oldfoundrykitchen.co.uk"
                {...register('websiteUrl')}
              />
            </div>
          </section>

          {/* Section 2: business names + registration */}
          <section className="mt-6 rounded-[20px] border border-[#EFE7E2] bg-white p-7 shadow-[0_30px_70px_-50px_rgba(1,12,53,0.35),0_2px_6px_rgba(1,12,53,0.04)]">
            <SectionHeading n={2} title="Your business name and registration" badge="Private" />
            <p className="mt-2 max-w-[64ch] text-[13.5px] leading-relaxed text-[#8089A4]">
              Used to verify your business. Not shown to customers.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextField
                  id={ids.businessName}
                  label="Registered business name"
                  placeholder="Your Business Ltd"
                  {...register('businessName')}
                />
                <FieldError message={errors.businessName?.message} />
              </div>
              <div className="sm:col-span-2">
                <TextField
                  id={ids.tradingName}
                  label="Trading name"
                  optional
                  placeholder="The name customers know you by"
                  {...register('tradingName')}
                />
              </div>
              <div>
                <TextField
                  id={ids.companyNumber}
                  label="Company number"
                  optional
                  placeholder="09872341"
                  hint="8 digits, or letters then 6 digits."
                  {...register('companyNumber')}
                />
              </div>
            </div>

            {/* VAT block */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 sm:items-end">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#3A465F]">Are you VAT registered?</span>
                <Controller
                  control={control}
                  name="vatRegistered"
                  render={({ field }) => (
                    <div className="flex items-center gap-3">
                      <Switch
                        label="VAT registered"
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked)
                          // Switching to No clears the VAT number so the PATCH never
                          // carries a stale number for a non-registered business.
                          if (!checked) setValue('vatNumber', '')
                        }}
                      />
                      <span className="text-sm font-semibold text-[#010C35]">{field.value ? 'Yes' : 'No'}</span>
                    </div>
                  )}
                />
                <span className="text-xs text-[#8089A4]">
                  Optional. A business under the £90,000 threshold may not be registered.
                </span>
              </div>
              <Controller
                control={control}
                name="vatRegistered"
                render={({ field: vatField }) =>
                  vatField.value ? (
                    <div>
                      <TextField
                        id={ids.vatNumber}
                        label="VAT number"
                        placeholder="GB 213 9874 22"
                        hint="GB then 9 digits."
                        {...register('vatNumber')}
                      />
                    </div>
                  ) : (
                    <div />
                  )
                }
              />
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
        </form>
      </main>

      {/* Sticky footer: dual CTA */}
      <footer className="sticky bottom-0 border-t border-[#EFE7E2] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[880px] flex-wrap items-center gap-3.5 px-7 py-[18px]">
          <p className="min-w-[200px] flex-1 text-[13px] leading-relaxed text-[#8089A4]">
            Save and continue marks this step done. Save and finish later keeps your progress.
          </p>
          <button
            type="button"
            onClick={() => onSaveLater(getValues())}
            disabled={saving}
            className="h-[52px] rounded-[13px] border-[1.5px] border-[#D7DBE2] bg-white px-[22px] text-[15px] font-bold text-[#010C35] transition-colors hover:bg-[#F8F9FB] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save and finish later
          </button>
          <button
            type="button"
            onClick={handleSubmit((values) => onSaveContinue(values))}
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
    description: `${prefix}-description`,
    websiteUrl: `${prefix}-website`,
    businessName: `${prefix}-business-name`,
    tradingName: `${prefix}-trading-name`,
    companyNumber: `${prefix}-company-number`,
    vatNumber: `${prefix}-vat-number`,
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

// A labelled text input matching the prototype field visual. The label's htmlFor is
// wired to the id so getByLabelText resolves it; rhf register spreads through.
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <span role="alert" className="mt-1.5 block text-xs font-medium text-[#B91C1C]">
      {message}
    </span>
  )
}
