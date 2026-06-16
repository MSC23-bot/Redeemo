'use client'

/**
 * ProposeMerchantEditDialog: a SUPER_ADMIN proposes a change to a merchant's
 * SENSITIVE identity text fields (businessName / tradingName / description) on
 * the merchant's behalf (Option B B2.5-web).
 *
 * This does NOT mutate the merchant. It creates a review request that routes
 * into the B1 pending-edit lane; an admin then approves/rejects it. The copy
 * makes that explicit ("sent for review / not applied until approved").
 *
 *   - Three text inputs prefilled from the current values. Editing any of them,
 *     plus a mandatory reason, enables submit.
 *   - Changed-field detection: only fields whose trimmed value is non-empty AND
 *     differs from the current value are sent. An emptied field is treated as
 *     "leave unchanged" (clearing a value to null is NOT supported in this slice;
 *     the backend route accepts non-empty strings only).
 *   - NO confirmation checkbox (owner decision): the mandatory reason is the gate
 *     because this is a proposal, not an immediate mutation.
 *   - On error: NamedGateBanner inside the dialog.
 *   - Accessible via the shared Dialog primitive (focus-trap, Escape + scrim
 *     close, focus-restore).
 *
 * The Propose affordance that opens this is gated on merchant:propose-edit
 * (SUPER_ADMIN); the backend route is the real enforcement.
 */
import { useRef, useState } from 'react'
import { useProposeMerchantEdit } from '@/lib/merchants/useMerchantActions'
import type { ProposeMerchantEditInput } from '@/lib/api/merchants'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ProposeMerchantEditDialogProps {
  merchantId: string
  current: { businessName: string; tradingName: string | null; description: string | null }
  onSuccess: () => void
  onCancel: () => void
}

export function ProposeMerchantEditDialog({
  merchantId,
  current,
  onSuccess,
  onCancel,
}: ProposeMerchantEditDialogProps) {
  const [businessName, setBusinessName] = useState(current.businessName ?? '')
  const [tradingName, setTradingName] = useState(current.tradingName ?? '')
  const [description, setDescription] = useState(current.description ?? '')
  const [reason, setReason] = useState('')
  const mutation = useProposeMerchantEdit(merchantId)
  const nameRef = useRef<HTMLInputElement>(null)

  // Changed-field detection: send a field only when its trimmed value is
  // non-empty AND differs from the current value. Emptied -> omitted (no clear).
  function buildChangedFields(): Omit<ProposeMerchantEditInput, 'reason'> {
    const out: Omit<ProposeMerchantEditInput, 'reason'> = {}
    const bn = businessName.trim()
    const tn = tradingName.trim()
    const desc = description.trim()
    if (bn !== '' && bn !== current.businessName) out.businessName = bn
    if (tn !== '' && tn !== (current.tradingName ?? '')) out.tradingName = tn
    if (desc !== '' && desc !== (current.description ?? '')) out.description = desc
    return out
  }

  const changed = buildChangedFields()
  const hasChange = Object.keys(changed).length > 0
  const trimmedReason = reason.trim()
  const canSubmit = hasChange && trimmedReason.length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync({ ...changed, reason: trimmedReason })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Propose identity changes"
      onClose={onCancel}
      scrimTestId="propose-merchant-edit-scrim"
      panelTestId="propose-merchant-edit-dialog"
      initialFocusRef={nameRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Propose identity changes</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        These changes are sent for review and are not applied until an admin approves them. Recorded
        in the audit log as a proposal on the merchant&apos;s behalf.
      </p>

      {/* Business name */}
      <label
        htmlFor="propose-business-name"
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        Business name
      </label>
      <Input
        id="propose-business-name"
        ref={nameRef}
        type="text"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        data-testid="propose-merchant-edit-business-name"
      />

      {/* Trading name */}
      <label
        htmlFor="propose-trading-name"
        className="mb-1.5 mt-4 block text-sm font-medium text-foreground"
      >
        Trading name
      </label>
      <Input
        id="propose-trading-name"
        type="text"
        value={tradingName}
        onChange={(e) => setTradingName(e.target.value)}
        data-testid="propose-merchant-edit-trading-name"
      />

      {/* Description */}
      <label
        htmlFor="propose-description"
        className="mb-1.5 mt-4 block text-sm font-medium text-foreground"
      >
        Description
      </label>
      <textarea
        id="propose-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="propose-merchant-edit-description"
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Edit any of these fields. Clearing a value is not supported here.
      </p>

      {/* Reason */}
      <label
        htmlFor="propose-reason"
        className="mb-1.5 mt-4 block text-sm font-medium text-foreground"
      >
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="propose-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are proposing these changes on the merchant's behalf."
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="propose-merchant-edit-reason"
      />

      {/* Error banner */}
      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="propose-merchant-edit-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="propose-merchant-edit-submit"
        >
          {mutation.isPending ? 'Sending...' : 'Send for review'}
        </Button>
      </div>
    </Dialog>
  )
}
