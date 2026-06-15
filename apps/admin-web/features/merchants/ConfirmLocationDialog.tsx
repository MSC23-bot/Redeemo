'use client'

/**
 * ConfirmLocationDialog: admin manually confirms a branch's coordinates.
 *
 * Manual latitude + longitude number inputs (NO map). Validates ranges
 * (latitude -90..90, longitude -180..180); submit is disabled until both are
 * present and in range. On submit -> useConfirmLocation for the given branch.
 * On error (e.g. BRANCH_NOT_FOUND): NamedGateBanner inside.
 * Accessible via the shared Dialog primitive: role=dialog, aria-label,
 * focus-on-open, Escape + scrim close, Tab focus-trap, focus-restore.
 */
import { useRef, useState } from 'react'
import { useConfirmLocation } from '@/lib/merchants/useMerchantActions'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmLocationDialogProps {
  branchId: string
  branchName: string
  approvalId: string
  onSuccess: () => void
  onCancel: () => void
}

/** Parse a coordinate input. Returns null for empty or non-numeric values. */
function parseCoord(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function ConfirmLocationDialog({
  branchId,
  branchName,
  approvalId,
  onSuccess,
  onCancel,
}: ConfirmLocationDialogProps) {
  const [latRaw, setLatRaw] = useState('')
  const [lngRaw, setLngRaw] = useState('')
  const mutation = useConfirmLocation(approvalId)
  const latRef = useRef<HTMLInputElement>(null)

  const lat = parseCoord(latRaw)
  const lng = parseCoord(lngRaw)

  // Validity: present AND within range. Only surface a message once the field
  // has content (so an untouched form is not painted red).
  const latInRange = lat !== null && lat >= -90 && lat <= 90
  const lngInRange = lng !== null && lng >= -180 && lng <= 180
  const latError = latRaw.trim() !== '' && !latInRange ? 'Latitude must be between -90 and 90.' : undefined
  const lngError = lngRaw.trim() !== '' && !lngInRange ? 'Longitude must be between -180 and 180.' : undefined

  const canSubmit = latInRange && lngInRange && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit || lat === null || lng === null) return
    try {
      await mutation.mutateAsync({ branchId, input: { latitude: lat, longitude: lng } })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Confirm branch location"
      onClose={onCancel}
      scrimTestId="confirm-location-scrim"
      panelTestId="confirm-location-dialog"
      initialFocusRef={latRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Confirm branch location</h2>
      <p className="mb-4 text-xs text-muted-foreground">{branchName}</p>

      <p className="mb-4 text-sm text-muted-foreground" data-testid="confirm-location-copy">
        Enter the exact coordinates for this branch (for example from Google Maps). This sets the
        branch location to manually confirmed.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="confirm-location-latitude"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Latitude
          </label>
          <input
            id="confirm-location-latitude"
            ref={latRef}
            type="number"
            inputMode="decimal"
            step="any"
            value={latRaw}
            onChange={(e) => setLatRaw(e.target.value)}
            placeholder="53.6450"
            aria-invalid={latError ? true : undefined}
            aria-describedby={latError ? 'confirm-location-latitude-error' : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
            data-testid="confirm-location-latitude"
          />
          {latError && (
            <p
              id="confirm-location-latitude-error"
              className="mt-1 text-xs text-destructive"
              data-testid="confirm-location-latitude-error"
            >
              {latError}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm-location-longitude"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Longitude
          </label>
          <input
            id="confirm-location-longitude"
            type="number"
            inputMode="decimal"
            step="any"
            value={lngRaw}
            onChange={(e) => setLngRaw(e.target.value)}
            placeholder="-1.7830"
            aria-invalid={lngError ? true : undefined}
            aria-describedby={lngError ? 'confirm-location-longitude-error' : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
            data-testid="confirm-location-longitude"
          />
          {lngError && (
            <p
              id="confirm-location-longitude-error"
              className="mt-1 text-xs text-destructive"
              data-testid="confirm-location-longitude-error"
            >
              {lngError}
            </p>
          )}
        </div>
      </div>

      {/* Error banner (e.g. BRANCH_NOT_FOUND). */}
      {mutation.error && (
        <div className="mt-4">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="confirm-location-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="confirm-location-submit"
        >
          {mutation.isPending ? 'Confirming...' : 'Confirm location'}
        </Button>
      </div>
    </Dialog>
  )
}
