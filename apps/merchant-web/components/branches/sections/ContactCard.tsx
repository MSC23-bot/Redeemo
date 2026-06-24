'use client'

// Branches PR-1 F4: the owner-only Contact instant-save card (prototype 03/08).
// View shows the phone / email / website rows + a "Saves instantly" hint + an Edit
// pencil; edit swaps to labelled inputs + Save / Cancel. Save sends ONLY the
// CHANGED DIRECT fields { phone?, email?, websiteUrl? } via PATCH /branches/:id (the
// useUpdateBranchContact hook). A non-owner sees the values read-only with NO edit
// control; the backend owner-only resolver is the real boundary.
//
// SECURITY / SCOPE (plan §6, §F4): isActive is NOT a Contact control. The active /
// closed state is the read-only header status pill from F3; PR-1 exposes no isActive
// toggle anywhere (branch deactivation is the PR-5 lifecycle). F4 therefore sends
// ONLY phone / email / websiteUrl, never isActive or any sensitive identity field
// (address / name are the F7 reviewed-edit lane).
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Phone, Mail, Globe, Pencil } from '@/lib/icons'
import { useUpdateBranchContact } from '@/lib/branches/useBranches'
import type { Branch, BranchUpdateBody } from '@/lib/api/branch'

type ContactField = 'phone' | 'email' | 'websiteUrl'

// Normalise a possibly-null branch value to a trimmed string for diffing / inputs.
function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export function ContactCard({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
  const { toast } = useToast()
  const update = useUpdateBranchContact()

  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState({
    phone: val(branch.phone),
    email: val(branch.email),
    websiteUrl: val(branch.websiteUrl),
  })
  const [actionError, setActionError] = React.useState<string | null>(null)

  function startEdit() {
    setDraft({
      phone: val(branch.phone),
      email: val(branch.email),
      websiteUrl: val(branch.websiteUrl),
    })
    setActionError(null)
    setEditing(true)
  }

  function cancel() {
    setActionError(null)
    setEditing(false)
  }

  // Build a body of ONLY the changed direct fields. Never includes isActive.
  function changedBody(): BranchUpdateBody {
    const body: BranchUpdateBody = {}
    const original: Record<ContactField, string> = {
      phone: val(branch.phone),
      email: val(branch.email),
      websiteUrl: val(branch.websiteUrl),
    }
    ;(['phone', 'email', 'websiteUrl'] as ContactField[]).forEach((f) => {
      const next = draft[f].trim()
      if (next !== original[f]) body[f] = next
    })
    return body
  }

  async function save() {
    const body = changedBody()
    if (Object.keys(body).length === 0) {
      // Nothing changed: treat Save as a calm no-op back to view (no network call).
      setEditing(false)
      return
    }
    setActionError(null)
    try {
      await update.mutateAsync({ id: branch.id, body })
      toast({ message: 'Contact details saved.', variant: 'success' })
      setEditing(false)
    } catch {
      setActionError('We could not save your changes. Check the details and try again.')
    }
  }

  return (
    <Card className="gap-4" data-testid="branch-contact-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Contact</h2>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'rgba(15, 122, 62, 0.10)', color: 'var(--success)' }}
          >
            Saves instantly
          </span>
          {isOwner && !editing ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7390] hover:text-[#010C35]"
            >
              <Pencil size={15} aria-hidden /> Edit
            </button>
          ) : null}
        </div>
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

          <div className="space-y-1.5">
            <Label htmlFor="branch-contact-phone">Phone</Label>
            <Input
              id="branch-contact-phone"
              type="tel"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              placeholder="+44 1223 456 789"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branch-contact-email">Email</Label>
            <Input
              id="branch-contact-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder="hello@example.co.uk"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branch-contact-website">Website</Label>
            <Input
              id="branch-contact-website"
              type="text"
              value={draft.websiteUrl}
              onChange={(e) => setDraft((d) => ({ ...d, websiteUrl: e.target.value }))}
              placeholder="example.co.uk"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button type="button" onClick={save} disabled={update.isPending}>
              {update.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button type="button" variant="secondary" onClick={cancel} disabled={update.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 px-6">
          <ContactRow icon={<Phone size={16} aria-hidden />} value={val(branch.phone)} empty="No phone added" />
          <ContactRow icon={<Mail size={16} aria-hidden />} value={val(branch.email)} empty="No email added" />
          <ContactRow icon={<Globe size={16} aria-hidden />} value={val(branch.websiteUrl)} empty="No website added" />
        </div>
      )}
    </Card>
  )
}

function ContactRow({
  icon,
  value,
  empty,
}: {
  icon: React.ReactNode
  value: string
  empty: string
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span aria-hidden style={{ color: 'var(--text-tertiary)' }}>
        {icon}
      </span>
      {value ? (
        <span className="text-foreground">{value}</span>
      ) : (
        <span className="text-muted-foreground">{empty}</span>
      )}
    </div>
  )
}
