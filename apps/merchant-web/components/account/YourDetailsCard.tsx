'use client'

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Pencil, Lock, Smartphone, Info } from '@/lib/icons'
import { useUpdateMerchantAccount } from '@/lib/account/useUpdateMerchantAccount'
import { StagedContactChangeModal } from './StagedContactChangeModal'
import type { MerchantAccount } from '@/lib/api/account'

// My Account "Your details" (myaccount-1 prototype). The prototype shows a single
// combined "Full name" text box; the backend PATCH (src/api/merchant/account)
// requires firstName/lastName as two separate required strings. Splitting a
// free-typed "Full name" string on whitespace is lossy for real names (accented
// characters, single-word names, multi-part surnames), so this deliberately shows
// First name / Last name as two fields under one "Full name" heading rather than
// one combined box that would need a fragile split - functionally faithful to the
// design's intent, not pixel-identical to its single input.
function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?'
}

export function YourDetailsCard({
  account,
  businessName,
}: {
  account: MerchantAccount
  businessName: string | null
}) {
  const { toast } = useToast()
  const update = useUpdateMerchantAccount()

  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState({
    firstName: account.firstName,
    lastName: account.lastName,
    jobTitle: account.jobTitle ?? '',
  })
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [contactModal, setContactModal] = React.useState<'email' | 'phone' | null>(null)

  function startEdit() {
    setDraft({ firstName: account.firstName, lastName: account.lastName, jobTitle: account.jobTitle ?? '' })
    setFieldError(null)
    setActionError(null)
    setEditing(true)
  }

  function cancel() {
    setFieldError(null)
    setActionError(null)
    setEditing(false)
  }

  async function save() {
    const firstName = draft.firstName.trim()
    const lastName = draft.lastName.trim()
    if (!firstName || !lastName) {
      setFieldError('Enter both a first and last name.')
      return
    }
    setFieldError(null)

    const jobTitle = draft.jobTitle.trim()
    const unchanged =
      firstName === account.firstName && lastName === account.lastName && jobTitle === (account.jobTitle ?? '')
    if (unchanged) {
      setEditing(false)
      return
    }

    setActionError(null)
    try {
      await update.mutateAsync({ firstName, lastName, jobTitle: jobTitle.length > 0 ? jobTitle : null })
      toast({ message: 'Your details have been saved.', variant: 'success' })
      setEditing(false)
    } catch {
      setActionError('We could not save your changes. Check the details and try again.')
    }
  }

  return (
    <Card className="gap-4" data-testid="your-details-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Your details</h2>
        {!editing ? (
          <Button type="button" variant="secondary" size="sm" onClick={startEdit} data-testid="your-details-edit">
            <Pencil size={14} aria-hidden />
            Edit
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-4 px-6">
          {actionError ? (
            <p
              role="alert"
              className="rounded-[10px] border px-3 py-2 text-sm font-medium"
              style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
            >
              {actionError}
            </p>
          ) : null}
          {fieldError ? (
            <p role="alert" className="text-xs font-medium" style={{ color: 'var(--destructive)' }}>
              {fieldError}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Full name</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="your-details-first-name">First name</Label>
                <Input
                  id="your-details-first-name"
                  value={draft.firstName}
                  onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
                  disabled={update.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="your-details-last-name">Last name</Label>
                <Input
                  id="your-details-last-name"
                  value={draft.lastName}
                  onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
                  disabled={update.isPending}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="your-details-job-title">Job title</Label>
            <Input
              id="your-details-job-title"
              value={draft.jobTitle}
              onChange={(e) => setDraft((d) => ({ ...d, jobTitle: e.target.value }))}
              disabled={update.isPending}
              placeholder="Owner"
            />
          </div>

          <div className="flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-sm" style={{ background: '#FFF9F5' }}>
            <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              Your login email and mobile are how you sign in, so each is changed through its own confirmed step
              below rather than edited here.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={cancel} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={update.isPending}>
              {update.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-6">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
          >
            {initials(account.firstName, account.lastName)}
          </span>
          <div>
            <p className="text-base font-semibold text-foreground">
              {account.firstName} {account.lastName}
            </p>
            <p className="text-sm text-muted-foreground">
              {account.jobTitle || 'Team member'}
              {businessName ? ` · ${businessName}` : ''}
            </p>
          </div>
        </div>
      )}

      <div className="border-t border-border" />

      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Login email</p>
            <Badge variant="neutral" className="gap-1">
              <Lock size={10} aria-hidden />
              Used to sign in
            </Badge>
          </div>
          <p className="text-sm font-semibold text-foreground">{account.email}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setContactModal('email')} data-testid="change-email-open">
          Change email
        </Button>
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Mobile number</p>
            <Badge variant="neutral" className="gap-1">
              <Smartphone size={10} aria-hidden />
              Where login codes go
            </Badge>
          </div>
          <p className="text-sm font-semibold text-foreground">{account.phone || 'Not added yet'}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setContactModal('phone')} data-testid="change-phone-open">
          Change phone
        </Button>
      </div>

      {contactModal ? (
        <StagedContactChangeModal
          kind={contactModal}
          currentValue={contactModal === 'email' ? account.email : account.phone || 'Not added yet'}
          onClose={() => setContactModal(null)}
        />
      ) : null}
    </Card>
  )
}
