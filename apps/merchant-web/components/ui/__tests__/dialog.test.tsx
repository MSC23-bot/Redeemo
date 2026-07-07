import { render, screen, fireEvent, within } from '@testing-library/react'
import { useRef } from 'react'
import { Dialog } from '../dialog'

/**
 * Regression coverage for the topbar-clipping bug (staging acceptance 2026-07):
 * the shared Dialog must render through a portal into document.body so its
 * `position: fixed` scrim escapes any ancestor containing block established by
 * backdrop-filter / filter / transform / contain (the topbar's blurred strip).
 * These tests also pin the accessibility contract that must survive the portal:
 * focus trap, scrim-click close, Escape close, and the passed-through testids.
 */
describe('Dialog (shared modal primitive)', () => {
  it('portals the overlay + panel to document.body, escaping any ancestor containing block', () => {
    const { container } = render(
      <Dialog label="Portalled" onClose={() => {}} panelTestId="portal-panel" scrimTestId="portal-scrim">
        <button type="button">Inside</button>
      </Dialog>,
    )

    const panel = screen.getByRole('dialog')
    const scrim = screen.getByTestId('portal-scrim')

    // The dialog is NOT a descendant of the component's local render container:
    // it was portalled out, which is exactly what lets a fixed scrim ignore a
    // filtered/transformed ancestor and size to the viewport.
    expect(container).not.toContainElement(panel)
    expect(document.body).toContainElement(panel)
    expect(document.body).toContainElement(scrim)
  })

  it('renders the panel a11y attributes and passes through both testids', () => {
    render(
      <Dialog label="My dialog" onClose={() => {}} panelTestId="p" scrimTestId="s">
        <button type="button">Ok</button>
      </Dialog>,
    )
    const panel = screen.getByRole('dialog')
    expect(panel).toHaveAttribute('aria-label', 'My dialog')
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByTestId('p')).toBe(panel)
    expect(screen.getByTestId('s')).toBeInTheDocument()
  })

  it('scrim click calls onClose', () => {
    const onClose = jest.fn()
    render(
      <Dialog label="Closable" onClose={onClose} scrimTestId="scrim">
        <button type="button">Ok</button>
      </Dialog>,
    )
    fireEvent.click(screen.getByTestId('scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape calls onClose', () => {
    const onClose = jest.fn()
    render(
      <Dialog label="Escapable" onClose={onClose}>
        <button type="button">Ok</button>
      </Dialog>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves initial focus into the panel on open (first focusable by default)', () => {
    render(
      <Dialog label="Focus" onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Second</button>
      </Dialog>,
    )
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('honours an explicit initialFocusRef', () => {
    function Harness() {
      const ref = useRef<HTMLButtonElement>(null)
      return (
        <Dialog label="Focus" onClose={() => {}} initialFocusRef={ref}>
          <button type="button">First</button>
          <button ref={ref} type="button">
            Second
          </button>
        </Dialog>
      )
    }
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus()
  })

  it('traps Tab focus: Tab from the last focusable cycles to the first, Shift+Tab from the first cycles to the last', () => {
    render(
      <Dialog label="Trap" onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Dialog>,
    )
    const panel = screen.getByRole('dialog')
    const first = within(panel).getByRole('button', { name: 'First' })
    const last = within(panel).getByRole('button', { name: 'Last' })

    last.focus()
    fireEvent.keyDown(panel, { key: 'Tab' })
    expect(first).toHaveFocus()

    first.focus()
    fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  it('restores focus to the trigger when the dialog unmounts', () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <div>
          <button type="button" data-testid="trigger">
            Trigger
          </button>
          {open && (
            <Dialog label="Restore" onClose={() => {}}>
              <button type="button">Inside</button>
            </Dialog>
          )}
        </div>
      )
    }
    const { rerender } = render(<Harness open={false} />)
    const trigger = screen.getByTestId('trigger')
    trigger.focus()
    expect(trigger).toHaveFocus()

    rerender(<Harness open={true} />)
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus()

    rerender(<Harness open={false} />)
    expect(trigger).toHaveFocus()
  })
})
