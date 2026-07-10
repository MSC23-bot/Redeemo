'use client'

/**
 * Dialog: shared modal primitive for the admin console.
 *
 * Renders the project's standard scrim + panel and adds the two pieces of
 * modal accessibility the hand-rolled dialogs were missing:
 *   - a Tab focus-trap (Tab / Shift+Tab cycle within the panel, never escaping
 *     to the page behind the scrim), and
 *   - focus restoration to the trigger element when the dialog unmounts.
 * It also owns Escape-to-close and scrim-click-to-close, and moves focus into
 * the dialog on open (an explicit initialFocusRef, else the first focusable).
 *
 * `placement` (B3): 'center' (default, unchanged) renders the original centred
 * card. 'right' renders a full-height right-edge slide-in panel (no internal
 * padding; callers own their own header/body layout, matching the merchant-web
 * redemption detail drawer's visual DNA) for surfaces like the read-only
 * Redemptions detail drawer that need drawer placement WITHOUT hand-rolling the
 * focus-trap/Escape/scrim logic above a second time. Every existing call site
 * omits `placement` and is byte-identical to before.
 *
 * Parents conditionally MOUNT this (it is "open" whenever rendered); closing is
 * the parent unmounting it via onClose. The scrim/panel testids and aria-label
 * are passed through so each refactored dialog keeps its existing test contract.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

type DialogPlacement = 'center' | 'right'

const OUTER_CLASS: Record<DialogPlacement, string> = {
  center: 'fixed inset-0 z-50 flex items-center justify-center',
  right: 'fixed inset-0 z-50 flex justify-end',
}

const PANEL_CLASS: Record<DialogPlacement, string> = {
  center: 'relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl',
  right:
    'relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card shadow-xl',
}

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
  /** Centred card (default) or a right-edge slide-in drawer. */
  placement?: DialogPlacement
  children: ReactNode
}

export function Dialog({
  label,
  onClose,
  panelTestId,
  scrimTestId,
  initialFocusRef,
  placement = 'center',
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

  return (
    <div className={OUTER_CLASS[placement]} onKeyDown={handleKeyDown}>
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
        className={PANEL_CLASS[placement]}
        data-testid={panelTestId}
      >
        {children}
      </div>
    </div>
  )
}
