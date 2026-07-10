/**
 * Dialog: shared modal primitive.
 *
 * Pins the two accessibility pieces the hand-rolled dialogs were missing:
 *   - Tab / Shift+Tab focus-trap (cycles within the panel),
 *   - focus restoration to the trigger on unmount.
 * Plus the contract it inherits from the old hand-rolled skeleton: role/aria,
 * Escape-close, scrim-close, focus-on-open (explicit ref or first focusable).
 */
import React, { useRef } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Dialog } from '../dialog'

// A small harness that mounts a Dialog with two buttons inside and lets the
// caller target the second button via initialFocusRef.
function TwoButtonDialog({
  onClose = jest.fn(),
  focusSecond = false,
}: {
  onClose?: () => void
  focusSecond?: boolean
}) {
  const secondRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      label="Test dialog"
      onClose={onClose}
      panelTestId="test-dialog"
      scrimTestId="test-scrim"
      initialFocusRef={focusSecond ? (secondRef as React.RefObject<HTMLElement | null>) : undefined}
    >
      <button data-testid="btn-first">First</button>
      <button ref={secondRef} data-testid="btn-second">
        Second
      </button>
    </Dialog>
  )
}

describe('Dialog role + aria', () => {
  it('renders role=dialog with aria-label, aria-modal, and the passed testids', () => {
    render(<TwoButtonDialog />)
    const panel = screen.getByTestId('test-dialog')
    expect(panel).toHaveAttribute('role', 'dialog')
    expect(panel).toHaveAttribute('aria-label', 'Test dialog')
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('dialog', { name: /test dialog/i })).toBe(panel)
    expect(screen.getByTestId('test-scrim')).toBeInTheDocument()
  })
})

describe('Dialog close behaviour', () => {
  it('calls onClose once on Escape', () => {
    const onClose = jest.fn()
    render(<TwoButtonDialog onClose={onClose} />)
    fireEvent.keyDown(screen.getByTestId('test-dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose once on scrim click', () => {
    const onClose = jest.fn()
    render(<TwoButtonDialog onClose={onClose} />)
    fireEvent.click(screen.getByTestId('test-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Dialog focus on open', () => {
  it('focuses the explicit initialFocusRef target when provided', () => {
    act(() => {
      render(<TwoButtonDialog focusSecond />)
    })
    expect(screen.getByTestId('btn-second')).toHaveFocus()
  })

  it('focuses the first focusable when no initialFocusRef is given', () => {
    act(() => {
      render(<TwoButtonDialog />)
    })
    expect(screen.getByTestId('btn-first')).toHaveFocus()
  })
})

describe('Dialog focus trap', () => {
  it('Tab from the last focusable wraps to the first', () => {
    render(<TwoButtonDialog />)
    const first = screen.getByTestId('btn-first')
    const last = screen.getByTestId('btn-second')
    act(() => {
      last.focus()
    })
    expect(last).toHaveFocus()
    fireEvent.keyDown(screen.getByTestId('test-dialog'), { key: 'Tab' })
    expect(first).toHaveFocus()
  })

  it('Shift+Tab from the first focusable wraps to the last', () => {
    render(<TwoButtonDialog />)
    const first = screen.getByTestId('btn-first')
    const last = screen.getByTestId('btn-second')
    act(() => {
      first.focus()
    })
    expect(first).toHaveFocus()
    fireEvent.keyDown(screen.getByTestId('test-dialog'), { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })
})

describe('Dialog placement (B3: right-side drawer)', () => {
  it('defaults to the centred card classes when placement is omitted (no regression for existing callers)', () => {
    render(<TwoButtonDialog />)
    const panel = screen.getByTestId('test-dialog')
    expect(panel.className).toMatch(/max-w-lg/)
    expect(panel.className).toMatch(/rounded-xl/)
    expect(panel.parentElement?.className).toMatch(/items-center/)
    expect(panel.parentElement?.className).toMatch(/justify-center/)
  })

  it('placement="right" renders a full-height right-edge panel instead of the centred card', () => {
    render(
      <Dialog label="Drawer" onClose={jest.fn()} panelTestId="right-dialog" scrimTestId="right-scrim" placement="right">
        <button>Only</button>
      </Dialog>
    )
    const panel = screen.getByTestId('right-dialog')
    expect(panel.className).toMatch(/h-full/)
    expect(panel.className).toMatch(/border-l/)
    expect(panel.className).not.toMatch(/max-w-lg/)
    expect(panel.parentElement?.className).toMatch(/justify-end/)
    expect(panel.parentElement?.className).not.toMatch(/items-center/)
  })

  it('placement="right" keeps the same Escape/scrim/focus-trap behaviour', () => {
    const onClose = jest.fn()
    render(
      <Dialog label="Drawer" onClose={onClose} panelTestId="right-dialog" scrimTestId="right-scrim" placement="right">
        <button>Only</button>
      </Dialog>
    )
    fireEvent.keyDown(screen.getByTestId('right-dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('right-scrim'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('Dialog focus restore on close', () => {
  it('restores focus to the element that was focused before the dialog mounted', () => {
    // Render a trigger outside the dialog, focus it, then mount the dialog so the
    // dialog captures it as previouslyFocused. Unmounting restores focus to it.
    function Host({ open }: { open: boolean }) {
      return (
        <>
          <button data-testid="trigger">Open</button>
          {open ? <TwoButtonDialog /> : null}
        </>
      )
    }
    const { rerender } = render(<Host open={false} />)
    const trigger = screen.getByTestId('trigger')
    act(() => {
      trigger.focus()
    })
    expect(trigger).toHaveFocus()

    // Mount the dialog (focus moves inside, away from the trigger).
    act(() => {
      rerender(<Host open />)
    })
    expect(trigger).not.toHaveFocus()

    // Unmount the dialog: focus returns to the trigger.
    act(() => {
      rerender(<Host open={false} />)
    })
    expect(trigger).toHaveFocus()
  })
})
