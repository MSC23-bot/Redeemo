'use client'

/**
 * CreateDraftForm: admin creates an owner-claimed draft merchant.
 *
 * Six fields (matching the backend contract):
 *   businessName    (required)
 *   tradingName     (optional)
 *   ownerEmail      (required, email)
 *   ownerFirstName  (required)
 *   ownerLastName   (required)
 *   jobTitle        (optional)
 *
 * On submit -> useCreateDraft. On EMAIL_ALREADY_EXISTS -> NamedGateBanner.
 * On success -> a calm success panel. The success copy never claims the email
 * was delivered (only that it is triggered) and never references a claim token.
 */
import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { CheckCircle2, Store } from 'lucide-react'
import { useCreateDraft } from '@/lib/merchants/useMerchantActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Button } from '@/components/ui/button'
import type { CreateDraftResponse } from '@/lib/api/merchants'

// A pragmatic email shape: a non-empty local part, an @, a dotted domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface FieldErrors {
  businessName?: string
  ownerEmail?: string
  ownerFirstName?: string
  ownerLastName?: string
}

function validate(fields: {
  businessName: string
  ownerEmail: string
  ownerFirstName: string
  ownerLastName: string
}): FieldErrors {
  const errors: FieldErrors = {}
  if (!fields.businessName.trim()) errors.businessName = 'Business name is required.'
  if (!fields.ownerEmail.trim()) {
    errors.ownerEmail = 'Owner email is required.'
  } else if (!EMAIL_RE.test(fields.ownerEmail.trim())) {
    errors.ownerEmail = 'Enter a valid email address.'
  }
  if (!fields.ownerFirstName.trim()) errors.ownerFirstName = 'First name is required.'
  if (!fields.ownerLastName.trim()) errors.ownerLastName = 'Last name is required.'
  return errors
}

interface TextFieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: 'text' | 'email'
  error?: string
  testId: string
  autoComplete?: string
}

function TextField({
  id,
  label,
  value,
  onChange,
  required = false,
  type = 'text',
  error,
  testId,
  autoComplete,
}: TextFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span className="text-destructive"> *</span>
        ) : (
          <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
        )}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
        data-testid={testId}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

interface CreateDraftFormProps {
  /** Called after a successful create so the parent can show a global success state if desired. */
  onCreated?: (response: CreateDraftResponse) => void
}

export function CreateDraftForm({ onCreated }: CreateDraftFormProps) {
  const [businessName, setBusinessName] = useState('')
  const [tradingName, setTradingName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerFirstName, setOwnerFirstName] = useState('')
  const [ownerLastName, setOwnerLastName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  const mutation = useCreateDraft()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mutation.isPending) return
    const nextErrors = validate({ businessName, ownerEmail, ownerFirstName, ownerLastName })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    mutation.mutate(
      {
        businessName: businessName.trim(),
        tradingName: tradingName.trim() || undefined,
        ownerEmail: ownerEmail.trim(),
        ownerFirstName: ownerFirstName.trim(),
        ownerLastName: ownerLastName.trim(),
        jobTitle: jobTitle.trim() || undefined,
      },
      {
        onSuccess: (response) => onCreated?.(response),
      }
    )
  }

  // ── Success panel ────────────────────────────────────────────────────────────
  if (mutation.isSuccess) {
    return (
      <div
        className="rounded-lg border border-green-200 bg-green-50 px-6 py-8 text-center"
        data-testid="create-draft-success"
      >
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 text-green-700">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mb-2 text-lg font-semibold text-foreground">Draft created</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Draft created. A set-password (account setup) email is triggered automatically for the owner.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/queue" data-testid="create-draft-success-queue-link">
            <Button type="button" variant="outline">
              Back to queue
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6" data-testid="create-draft-form">
      {/* Intro: makes the admin-created -> owner-claimed -> approved lifecycle explicit. */}
      <div
        className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 px-4 py-3"
        data-testid="create-draft-intro"
      >
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Store className="size-4" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          You are creating the merchant on their behalf. The owner claims the account by setting their
          own password from an email link, completes onboarding, and the merchant goes live only after
          you approve it. They never set up payment here.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <TextField
          id="businessName"
          label="Business name"
          value={businessName}
          onChange={setBusinessName}
          required
          error={errors.businessName}
          testId="create-draft-business-name"
          autoComplete="organization"
        />
        <TextField
          id="tradingName"
          label="Trading name"
          value={tradingName}
          onChange={setTradingName}
          testId="create-draft-trading-name"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id="ownerFirstName"
            label="Owner first name"
            value={ownerFirstName}
            onChange={setOwnerFirstName}
            required
            error={errors.ownerFirstName}
            testId="create-draft-owner-first-name"
            autoComplete="given-name"
          />
          <TextField
            id="ownerLastName"
            label="Owner last name"
            value={ownerLastName}
            onChange={setOwnerLastName}
            required
            error={errors.ownerLastName}
            testId="create-draft-owner-last-name"
            autoComplete="family-name"
          />
        </div>

        <TextField
          id="ownerEmail"
          label="Owner email"
          value={ownerEmail}
          onChange={setOwnerEmail}
          required
          type="email"
          error={errors.ownerEmail}
          testId="create-draft-owner-email"
          autoComplete="email"
        />
        <TextField
          id="jobTitle"
          label="Job title"
          value={jobTitle}
          onChange={setJobTitle}
          testId="create-draft-job-title"
          autoComplete="organization-title"
        />
      </div>

      {/* Error banner (e.g. EMAIL_ALREADY_EXISTS). */}
      {mutation.error && (
        <div data-testid="create-draft-error">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Link href="/queue">
          <Button type="button" variant="outline" disabled={mutation.isPending}>
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={mutation.isPending} data-testid="create-draft-submit">
          {mutation.isPending ? 'Creating...' : 'Create draft merchant'}
        </Button>
      </div>
    </form>
  )
}
