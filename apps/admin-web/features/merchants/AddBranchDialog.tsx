'use client'

/**
 * AddBranchDialog: a SUPER_ADMIN creates a branch for a merchant on the merchant's
 * behalf (Option B B2.4-web).
 *
 *   - name / addressLine1 / city / postcode are required; addressLine2 + contact
 *     (phone/email/websiteUrl) are optional and omitted from the body when blank.
 *   - latitude/longitude are NOT collected (location resolves from the postcode;
 *     pin-precise correction is the separate confirm-location flow).
 *   - A mandatory reason; Save disabled until the required fields + reason are
 *     non-empty and not pending. The reason is recorded in the audit log.
 *   - On error: NamedGateBanner (POSTCODE_REQUIRED / POSTCODE_NOT_FOUND /
 *     GAZETTEER_UNAVAILABLE / MERCHANT_NOT_FOUND).
 *
 * The Edit affordance that opens this is gated on merchant:manage-branches
 * (SUPER_ADMIN); the backend route is the real enforcement.
 */
import { useRef, useState } from 'react'
import { useCreateBranch } from '@/lib/merchants/useMerchantActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AddBranchDialogProps {
  merchantId: string
  onSuccess: () => void
  onCancel: () => void
}

function trimOrUndefined(value: string): string | undefined {
  const t = value.trim()
  return t.length > 0 ? t : undefined
}

export function AddBranchDialog({ merchantId, onSuccess, onCancel }: AddBranchDialogProps) {
  const [name, setName] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [postcode, setPostcode] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [reason, setReason] = useState('')
  const mutation = useCreateBranch(merchantId)
  const nameRef = useRef<HTMLInputElement>(null)

  const required = [name, addressLine1, city, postcode].every((v) => v.trim().length > 0)
  const canSubmit = required && reason.trim().length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync({
        name: name.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: trimOrUndefined(addressLine2),
        city: city.trim(),
        postcode: postcode.trim(),
        phone: trimOrUndefined(phone),
        email: trimOrUndefined(email),
        websiteUrl: trimOrUndefined(websiteUrl),
        reason: reason.trim(),
      })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Add branch"
      onClose={onCancel}
      scrimTestId="add-branch-scrim"
      panelTestId="add-branch-dialog"
      initialFocusRef={nameRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Add branch</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Recorded in the audit log as an admin change on the merchant&apos;s behalf. The branch location
        resolves from the postcode; refine the pin afterwards with Confirm location.
      </p>

      <div className="grid gap-3">
        <Field id="add-branch-name" label="Branch name" testId="add-branch-name" value={name} onChange={setName} inputRef={nameRef} />
        <Field id="add-branch-address1" label="Address line 1" testId="add-branch-address1" value={addressLine1} onChange={setAddressLine1} />
        <Field id="add-branch-address2" label="Address line 2 (optional)" testId="add-branch-address2" value={addressLine2} onChange={setAddressLine2} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="add-branch-city" label="City" testId="add-branch-city" value={city} onChange={setCity} />
          <Field id="add-branch-postcode" label="Postcode" testId="add-branch-postcode" value={postcode} onChange={setPostcode} />
        </div>
        <Field id="add-branch-phone" label="Phone (optional)" testId="add-branch-phone" value={phone} onChange={setPhone} />
        <Field id="add-branch-email" label="Email (optional)" testId="add-branch-email" value={email} onChange={setEmail} />
        <Field id="add-branch-website" label="Website (optional)" testId="add-branch-website" value={websiteUrl} onChange={setWebsiteUrl} />
      </div>

      <label htmlFor="add-branch-reason" className="mb-1.5 mt-4 block text-sm font-medium text-foreground">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="add-branch-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are adding this branch on the merchant's behalf."
        rows={2}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="add-branch-reason"
      />

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending} data-testid="add-branch-cancel">
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit} data-testid="add-branch-submit">
          {mutation.isPending ? 'Adding...' : 'Add branch'}
        </Button>
      </div>
    </Dialog>
  )
}

function Field({
  id, label, testId, value, onChange, inputRef,
}: {
  id: string; label: string; testId: string; value: string
  onChange: (v: string) => void; inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      <Input id={id} ref={inputRef} type="text" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
    </div>
  )
}
