'use client'

/**
 * CreateAccountDialog: SUPER_ADMIN creates a new admin account (Team & Roles S2).
 *
 * Fields: email, first name, last name, base role (incl. FIELD). The backend
 * sets a random, unusable password — the account activates through the
 * password-reset flow once transactional email is enabled (#477); no email is
 * sent by this action today. Picking FIELD shows a short honest note: the rep
 * account can be created now, but cannot log in until email is live.
 *
 * On error: NamedGateBanner, with a context-specific override for
 * EMAIL_ALREADY_EXISTS (the shared M6 copy says "owner email", which does not
 * fit an admin-account context).
 */
import { useRef, useState } from 'react'
import { useCreateAdmin } from '@/lib/team/useTeam'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ASSIGNABLE_ROLE_OPTIONS } from './labels'
import type { AssignableRole } from '@/lib/api/team'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ERROR_OVERRIDES = {
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists. Use a different email.',
}

interface FieldErrors {
  email?: string
  firstName?: string
  lastName?: string
}

function validate(fields: { email: string; firstName: string; lastName: string }): FieldErrors {
  const errors: FieldErrors = {}
  if (!fields.email.trim()) {
    errors.email = 'Email is required.'
  } else if (!EMAIL_RE.test(fields.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (!fields.firstName.trim()) errors.firstName = 'First name is required.'
  if (!fields.lastName.trim()) errors.lastName = 'Last name is required.'
  return errors
}

interface CreateAccountDialogProps {
  onSuccess: () => void
  onCancel: () => void
}

export function CreateAccountDialog({ onSuccess, onCancel }: CreateAccountDialogProps) {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<AssignableRole>('OPERATIONS')
  const [errors, setErrors] = useState<FieldErrors>({})
  const mutation = useCreateAdmin()
  const emailRef = useRef<HTMLInputElement>(null)

  async function handleSubmit() {
    if (mutation.isPending) return
    const nextErrors = validate({ email, firstName, lastName })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    try {
      await mutation.mutateAsync({
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
      })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Create admin account"
      onClose={onCancel}
      scrimTestId="create-account-scrim"
      panelTestId="create-account-dialog"
      initialFocusRef={emailRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Create admin account</h2>
      <p className="mb-4 text-sm text-muted-foreground" data-testid="create-account-intro">
        The account activates through the password-reset flow once email is live. You never set
        or see their password.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="create-account-email" className="mb-1.5 block text-sm font-medium text-foreground">
            Email <span className="text-destructive">*</span>
          </label>
          <Input
            id="create-account-email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'create-account-email-error' : undefined}
            data-testid="create-account-email"
          />
          {errors.email && (
            <p id="create-account-email-error" className="mt-1 text-xs text-destructive" data-testid="create-account-email-error">
              {errors.email}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="create-account-first-name" className="mb-1.5 block text-sm font-medium text-foreground">
              First name <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-account-first-name"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              aria-invalid={errors.firstName ? true : undefined}
              aria-describedby={errors.firstName ? 'create-account-first-name-error' : undefined}
              data-testid="create-account-first-name"
            />
            {errors.firstName && (
              <p id="create-account-first-name-error" className="mt-1 text-xs text-destructive" data-testid="create-account-first-name-error">
                {errors.firstName}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="create-account-last-name" className="mb-1.5 block text-sm font-medium text-foreground">
              Last name <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-account-last-name"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              aria-invalid={errors.lastName ? true : undefined}
              aria-describedby={errors.lastName ? 'create-account-last-name-error' : undefined}
              data-testid="create-account-last-name"
            />
            {errors.lastName && (
              <p id="create-account-last-name-error" className="mt-1 text-xs text-destructive" data-testid="create-account-last-name-error">
                {errors.lastName}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="create-account-role" className="mb-1.5 block text-sm font-medium text-foreground">
            Role
          </label>
          <select
            id="create-account-role"
            value={role}
            onChange={(e) => setRole(e.target.value as AssignableRole)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="create-account-role"
          >
            {ASSIGNABLE_ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {role === 'FIELD' && (
            <p className="mt-1.5 text-xs text-muted-foreground" data-testid="create-account-field-note">
              Field reps need email enablement to log in. You can create the account now; it can sign
              in once email is turned on.
            </p>
          )}
        </div>
      </div>

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} overrides={ERROR_OVERRIDES} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="create-account-cancel"
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={mutation.isPending} data-testid="create-account-submit">
          {mutation.isPending ? 'Creating...' : 'Create account'}
        </Button>
      </div>
    </Dialog>
  )
}
