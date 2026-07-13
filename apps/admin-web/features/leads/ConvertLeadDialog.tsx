'use client'

/**
 * ConvertLeadDialog : convert a prospect to a merchant draft (spec §c). Owner
 * details are supplied fresh (a single contact name cannot be trusted to split
 * into first/last, and a lead may have no contact email), pre-filled from the
 * lead where sensible. On success the merchant draft exists; the dialog links to
 * the new merchant's 360. The affordance that opens this is gated on BOTH
 * lead:manage AND merchant:create-draft (mirroring the backend dual gate).
 */
import { useRef, useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { useConvertLead } from '@/lib/leads/useLeadMutations'
import { splitContactName } from './pipelineFormat'
import type { Lead } from '@/lib/api/leads'

interface ConvertLeadDialogProps {
  lead: Lead
  onSuccess: () => void
  onCancel: () => void
}

function trimOrUndefined(value: string): string | undefined {
  const t = value.trim()
  return t.length > 0 ? t : undefined
}

export function ConvertLeadDialog({ lead, onSuccess, onCancel }: ConvertLeadDialogProps) {
  const prefill = splitContactName(lead.contactName)
  const [ownerEmail, setOwnerEmail] = useState(lead.contactEmail ?? '')
  const [ownerFirstName, setOwnerFirstName] = useState(prefill.first)
  const [ownerLastName, setOwnerLastName] = useState(prefill.last)
  const [tradingName, setTradingName] = useState('')
  const [convertedMerchantId, setConvertedMerchantId] = useState<string | null>(null)

  const mutation = useConvertLead()
  const emailRef = useRef<HTMLInputElement>(null)

  const canSubmit =
    ownerEmail.trim().length > 0 &&
    ownerFirstName.trim().length > 0 &&
    ownerLastName.trim().length > 0 &&
    !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      const result = await mutation.mutateAsync({
        leadId: lead.id,
        input: {
          ownerEmail: ownerEmail.trim(),
          ownerFirstName: ownerFirstName.trim(),
          ownerLastName: ownerLastName.trim(),
          tradingName: trimOrUndefined(tradingName),
        },
      })
      setConvertedMerchantId(result.merchantId)
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  if (convertedMerchantId) {
    return (
      <Dialog label="Lead converted" onClose={onSuccess} scrimTestId="convert-lead-scrim" panelTestId="convert-lead-dialog">
        <h2 className="mb-1 text-base font-semibold text-foreground">Draft created</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {lead.businessName} is now a merchant draft. The owner sets their own password and finishes
          onboarding; nothing goes live until it is approved through the queue.
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onSuccess} data-testid="convert-lead-done">
            Done
          </Button>
          <Button asChild data-testid="convert-lead-open-360">
            <Link href={`/merchants/${convertedMerchantId}`}>Open the merchant&apos;s 360</Link>
          </Button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      label="Convert lead to merchant draft"
      onClose={onCancel}
      scrimTestId="convert-lead-scrim"
      panelTestId="convert-lead-dialog"
      initialFocusRef={emailRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Convert to merchant draft</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Creates a merchant draft for {lead.businessName} and links this lead to it. No password is set
        here: a setup email is sent to the owner so they finish onboarding themselves.
      </p>

      <div className="grid gap-3">
        <div>
          <label htmlFor="convert-owner-email" className="mb-1.5 block text-sm font-medium text-foreground">
            Owner email
          </label>
          <Input id="convert-owner-email" ref={emailRef} type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} data-testid="convert-owner-email" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="convert-owner-first" className="mb-1.5 block text-sm font-medium text-foreground">
              Owner first name
            </label>
            <Input id="convert-owner-first" type="text" value={ownerFirstName} onChange={(e) => setOwnerFirstName(e.target.value)} data-testid="convert-owner-first" />
          </div>
          <div>
            <label htmlFor="convert-owner-last" className="mb-1.5 block text-sm font-medium text-foreground">
              Owner last name
            </label>
            <Input id="convert-owner-last" type="text" value={ownerLastName} onChange={(e) => setOwnerLastName(e.target.value)} data-testid="convert-owner-last" />
          </div>
        </div>
        <div>
          <label htmlFor="convert-trading-name" className="mb-1.5 block text-sm font-medium text-foreground">
            Trading name (optional)
          </label>
          <Input id="convert-trading-name" type="text" value={tradingName} onChange={(e) => setTradingName(e.target.value)} data-testid="convert-trading-name" />
        </div>
      </div>

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending} data-testid="convert-lead-cancel">
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit} data-testid="convert-lead-submit">
          {mutation.isPending ? 'Converting...' : 'Convert to draft'}
        </Button>
      </div>
    </Dialog>
  )
}
