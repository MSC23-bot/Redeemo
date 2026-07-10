'use client'

/**
 * RmvCoBuildDialog: edit a DRAFT mandatory flagship (RMV) on the merchant's
 * behalf (Option B B5.1, wired in Merchant 360 A3).
 *
 * The edit allow-list is DYNAMIC per voucher: we render an input for EXACTLY the
 * keys in that voucher's `allowedFields`, prefilled from its `merchantFields`, and
 * PATCH only those keys (plus a required reason, audited). The known
 * customer-facing scalar keys (title, description, terms, imageUrl,
 * estimatedSaving) get a typed input; any other allowed key (e.g. the nested
 * `merchantFields` structured blob) is NOT a flat input here, so it is surfaced as
 * an honest note and left to the merchant's guided builder rather than fabricated.
 *
 * Only ever mounted for a DRAFT voucher (the caller gates on status + capability);
 * VOUCHER_NOT_EDITABLE / RMV_FIELD_NOT_ALLOWED / RMV_NOT_FOUND surface via
 * NamedGateBanner if the server state moved on.
 */
import { useMemo, useRef, useState } from 'react'
import { useEditRmv } from '@/lib/vouchers/useAdminVoucherActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AdminRmvVoucher } from '@/lib/api/vouchers'

// The customer-facing scalar keys this co-build card can render as a flat input.
// A voucher's allowedFields is intersected with this map; anything else (the
// nested `merchantFields` structured blob) is left to the guided builder.
const FIELD_META: Record<string, { label: string; kind: 'text' | 'textarea' | 'number' }> = {
  title: { label: 'Title', kind: 'text' },
  description: { label: 'Description', kind: 'textarea' },
  terms: { label: 'Terms', kind: 'textarea' },
  imageUrl: { label: 'Image URL', kind: 'text' },
  estimatedSaving: { label: 'Estimated saving (£)', kind: 'number' },
}

const RENDER_ORDER = ['title', 'description', 'terms', 'imageUrl', 'estimatedSaving'] as const

function coerceToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

interface RmvCoBuildDialogProps {
  merchantId: string
  voucher: AdminRmvVoucher
  onSuccess: () => void
  onCancel: () => void
}

export function RmvCoBuildDialog({
  merchantId,
  voucher,
  onSuccess,
  onCancel,
}: RmvCoBuildDialogProps) {
  const mutation = useEditRmv(merchantId)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  // Renderable keys = the voucher's allowedFields intersected with FIELD_META,
  // in a stable display order. Any allowed key we cannot render flatly is noted.
  const renderKeys = useMemo(
    () => RENDER_ORDER.filter((k) => voucher.allowedFields.includes(k)),
    [voucher.allowedFields]
  )
  const hasStructuredOnly = useMemo(
    () => voucher.allowedFields.some((k) => !(k in FIELD_META)),
    [voucher.allowedFields]
  )

  // Prefill each rendered field from the staged merchantFields (falling back to
  // the top-level value for title / estimatedSaving, which the read exposes).
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const key of renderKeys) {
      const staged = voucher.merchantFields[key]
      if (staged != null) {
        initial[key] = coerceToString(staged)
      } else if (key === 'title') {
        initial[key] = voucher.title
      } else if (key === 'estimatedSaving') {
        initial[key] = coerceToString(voucher.estimatedSaving)
      } else {
        initial[key] = ''
      }
    }
    return initial
  })
  const [reason, setReason] = useState('')

  const trimmedReason = reason.trim()
  const canSubmit = trimmedReason.length > 0 && !mutation.isPending

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    // Build the PATCH payload from ONLY the rendered (allowed) keys.
    const fields: Record<string, unknown> = {}
    for (const key of renderKeys) {
      const raw = values[key] ?? ''
      if (key === 'estimatedSaving') {
        const trimmed = raw.trim()
        const n = Number(trimmed)
        fields[key] = trimmed !== '' && Number.isFinite(n) ? n : trimmed
      } else {
        fields[key] = raw
      }
    }
    try {
      await mutation.mutateAsync({ voucherId: voucher.id, fields, reason: trimmedReason })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Edit mandatory voucher on behalf"
      onClose={onCancel}
      scrimTestId="rmv-cobuild-scrim"
      panelTestId="rmv-cobuild-dialog"
      initialFocusRef={firstFieldRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">
        Co-build: {voucher.title}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Edit the merchant&apos;s mandatory voucher in place. You are acting on the merchant&apos;s
        behalf; your identity and the reason are written to the audit trail.
      </p>

      <div className="space-y-4">
        {renderKeys.map((key, idx) => {
          const meta = FIELD_META[key]
          const inputId = `rmv-field-${key}`
          return (
            <div key={key}>
              <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-foreground">
                {meta.label}
              </label>
              {meta.kind === 'textarea' ? (
                <textarea
                  id={inputId}
                  value={values[key] ?? ''}
                  onChange={(e) => setField(key, e.target.value)}
                  rows={3}
                  data-testid={inputId}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              ) : (
                <Input
                  id={inputId}
                  ref={idx === 0 ? firstFieldRef : undefined}
                  type={meta.kind === 'number' ? 'number' : 'text'}
                  value={values[key] ?? ''}
                  onChange={(e) => setField(key, e.target.value)}
                  data-testid={inputId}
                />
              )}
            </div>
          )
        })}
      </div>

      {hasStructuredOnly && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="rmv-structured-note">
          This voucher type also has structured per-type fields. Those are edited in the
          merchant&apos;s guided builder, not in this co-build card.
        </p>
      )}

      {/* Reason */}
      <label htmlFor="rmv-cobuild-reason" className="mb-1.5 mt-4 block text-sm font-medium text-foreground">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="rmv-cobuild-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are editing this voucher on the merchant's behalf."
        rows={3}
        data-testid="rmv-cobuild-reason"
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="rmv-cobuild-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="rmv-cobuild-submit"
        >
          {mutation.isPending ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </Dialog>
  )
}
