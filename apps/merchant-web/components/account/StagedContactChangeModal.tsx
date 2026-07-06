'use client'

import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X } from '@/lib/icons'

// "Change email" / "Change phone" (§BP-ACC): NO backend flow exists yet for either
// - both are how the person SIGNS IN, so changing either needs its own confirmed
// step (verify the new address/number before it takes over), which has not been
// built. Rather than faking a working change (or silently doing nothing), this is
// an honest staged notice: present, clearly labelled as not live yet, with a real
// path to get it done today (contact Redeemo).
export function StagedContactChangeModal({
  kind,
  currentValue,
  onClose,
}: {
  kind: 'email' | 'phone'
  currentValue: string
  onClose: () => void
}) {
  const noun = kind === 'email' ? 'login email' : 'mobile number'
  return (
    <Dialog
      label={`Change ${noun}`}
      onClose={onClose}
      panelTestId={`change-${kind}-modal`}
      scrimTestId={`change-${kind}-scrim`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">Change your {noun}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="mt-4 space-y-3 text-sm text-muted-foreground">
        <p>
          Your current {noun} is <span className="font-medium text-foreground">{currentValue}</span>.
        </p>
        <p role="status">
          Changing your {noun} is a confirmed step, so no one can be locked out or moved to the wrong address by
          mistake. This isn&apos;t live in the portal yet: for now, it&apos;s handled with Redeemo directly.{' '}
          <a href="mailto:support@redeemo.com" className="font-medium text-primary underline underline-offset-2">
            Contact us
          </a>{' '}
          to change it.
        </p>
      </div>

      <div className="mt-5 flex items-center justify-end border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  )
}
