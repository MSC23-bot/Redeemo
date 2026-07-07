'use client'

/**
 * Dialog: the merchant portal's shared modal primitive.
 *
 * Renders the scrim + centred card and provides the modal accessibility pieces:
 *   - a Tab focus-trap (Tab / Shift+Tab cycle within the panel, never escaping
 *     to the page behind the scrim), and
 *   - focus restoration to the trigger element when the dialog unmounts.
 * It owns Escape-to-close and scrim-click-to-close, and moves focus into the
 * dialog on open (an explicit initialFocusRef, else the first focusable).
 *
 * Parents conditionally MOUNT this (it is "open" whenever rendered); closing is
 * the parent unmounting it via onClose. The scrim/panel testids and aria-label
 * pass through.
 *
 * The overlay + panel render through a React portal into document.body so the
 * `position: fixed` scrim always sizes to the viewport. Without the portal, any
 * ancestor with backdrop-filter / filter / transform / contain (e.g. the
 * topbar's blurred strip) establishes a containing block for fixed descendants,
 * which clipped the logout-confirm dialog to a thin bar at the top of the page.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogProps {
  /** Accessible name for the dialog (maps to aria-label on the panel). */
  label: string
  /** Called on Escape, scrim click (parent unmounts to close). */
  onClose: () => void
  /** data-testid for the panel (preserve each dialog's existing value). */
  panelTestId?: string
  /** data-testid for the scrim (preserve each dialog's existing value). */
  scrimTestId?: string
  /** Element to focus on open; defaults to the first focusable in the panel. */
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

export function Dialog({
  label,
  onClose,
  panelTestId,
  scrimTestId,
  initialFocusRef,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // On open: remember the trigger, move focus in. On close: restore focus.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const target =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      null
    target?.focus()
    return () => {
      previouslyFocused.current?.focus?.()
    }
    // Mount/unmount only: the trigger + initial target are captured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (focusables.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (active === last || !panel.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  // SSR guard: document.body only exists in the browser. The dialog is only ever
  // mounted via client interaction, so on the client the portal is present on the
  // first commit (panelRef is set before the focus effect runs) and there is no
  // hydration mismatch to reconcile.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
        data-testid={scrimTestId}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={label}
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl"
        data-testid={panelTestId}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
