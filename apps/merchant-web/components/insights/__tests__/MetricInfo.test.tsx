/**
 * PR-B Task B9 tests for the shared accessible MetricInfo tooltip/popover.
 *
 * MetricInfo is the explanatory affordance wired into every Insights KPI / chart /
 * chip / state. The "i" trigger reveals caller-supplied content on HOVER, keyboard
 * FOCUS, and CLICK/TAP (never hover-only), so keyboard + touch users reach it.
 *
 * Pins:
 *  - opens on pointer hover (mouse enter)
 *  - opens on keyboard focus (Tab-reachable, not hover-only)
 *  - opens on click, and a second click closes (toggle)
 *  - Escape closes and returns focus to the trigger
 *  - an outside click closes
 *  - the trigger exposes aria-label + aria-expanded + aria-describedby; the popover
 *    has role="tooltip" and is associated with the trigger so AT announces it
 *  - the content text is exposed to assistive tech when open
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MetricInfo } from '../MetricInfo'

function renderInfo(props: Partial<React.ComponentProps<typeof MetricInfo>> = {}) {
  return render(
    <MetricInfo label="About redemption activity" {...props}>
      Logged counts every redemption your customers started. Confirmed is the subset
      your staff validated in store.
    </MetricInfo>,
  )
}

describe('MetricInfo trigger affordance', () => {
  it('renders an info button with an accessible label and collapsed initial state', () => {
    renderInfo()
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // No popover content while collapsed.
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('uses the explicit aria-label when provided (overrides the visible label fallback)', () => {
    renderInfo({ ariaLabel: 'Explain redemption activity' })
    expect(
      screen.getByRole('button', { name: /explain redemption activity/i }),
    ).toBeInTheDocument()
  })
})

describe('MetricInfo open triggers (hover + focus + click, not hover-only)', () => {
  it('opens on pointer hover', async () => {
    renderInfo()
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    fireEvent.mouseEnter(trigger)
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes when the pointer leaves (hover-out)', async () => {
    renderInfo()
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    fireEvent.mouseEnter(trigger)
    await screen.findByRole('tooltip')
    fireEvent.mouseLeave(trigger)
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })

  it('opens on keyboard focus alone (keyboard-only users reach it, not hover-only)', async () => {
    renderInfo()
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    fireEvent.focus(trigger)
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

  it('is reachable by Tab and opens via keyboard interaction', async () => {
    const user = userEvent.setup()
    renderInfo()
    await user.tab()
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    expect(trigger).toHaveFocus()
    // Focus alone reveals the explanation for keyboard users.
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

  it('opens on click', async () => {
    const user = userEvent.setup()
    renderInfo()
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    await user.click(trigger)
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes on a second click (toggle)', async () => {
    const user = userEvent.setup()
    renderInfo()
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    await user.click(trigger)
    await screen.findByRole('tooltip')
    await user.click(trigger)
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})

describe('MetricInfo dismissal + focus management', () => {
  it('Escape closes the popover and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderInfo()
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    await user.click(trigger)
    await screen.findByRole('tooltip')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('an outside click closes the popover', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <MetricInfo label="About redemption activity">Logged vs confirmed explainer.</MetricInfo>
        <button type="button">elsewhere</button>
      </div>,
    )
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    await user.click(trigger)
    await screen.findByRole('tooltip')
    await user.click(screen.getByRole('button', { name: /elsewhere/i }))
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})

describe('MetricInfo assistive-tech wiring', () => {
  it('exposes the content text to assistive tech via role=tooltip when open', async () => {
    const user = userEvent.setup()
    renderInfo()
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    await user.click(trigger)
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent(/logged counts every redemption/i)
  })

  it('associates the trigger with the popover via aria-describedby when open', async () => {
    const user = userEvent.setup()
    renderInfo()
    const trigger = screen.getByRole('button', { name: /about redemption activity/i })
    await user.click(trigger)
    const tip = await screen.findByRole('tooltip')
    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(tip).toHaveAttribute('id', describedBy as string)
  })
})
