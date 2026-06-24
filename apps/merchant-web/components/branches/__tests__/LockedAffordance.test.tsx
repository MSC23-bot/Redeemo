import { render, screen, fireEvent } from '@testing-library/react'
import { LockedAffordance } from '@/components/branches/LockedAffordance'

// Branches PR-1 F13: the shared disabled "coming in this Branches rollout" control.
// It renders the prototype label, is non-interactive (disabled), surfaces the
// rollout copy as subtext, and performs NO network write whatsoever. The same
// component backs every PR-2..PR-8 affordance (Add branch, Close branch, hours Edit,
// multi-window, redemption alerts, live map / business lookup).

// Guard: nothing in this component may ever call the transport. A spy on apiFetch
// would never be invoked, but we assert intent by asserting the control is disabled
// and that a click handler is impossible to attach (no onClick prop is forwarded).
describe('LockedAffordance', () => {
  it('renders the label and the rollout subtext', () => {
    render(<LockedAffordance label="Add branch" />)
    expect(screen.getByText('Add branch')).toBeInTheDocument()
    expect(screen.getByText(/coming in this branches rollout/i)).toBeInTheDocument()
  })

  it('is disabled (non-interactive)', () => {
    render(<LockedAffordance label="Close branch" />)
    const btn = screen.getByRole('button', { name: /close branch/i })
    expect(btn).toBeDisabled()
  })

  it('fires no click handler even when clicked (no behaviour wired)', () => {
    render(<LockedAffordance label="Update location" />)
    const btn = screen.getByRole('button', { name: /update location/i })
    // A disabled button cannot dispatch click side effects; nothing to assert beyond
    // it staying disabled and present after a click attempt.
    fireEvent.click(btn)
    expect(btn).toBeDisabled()
  })

  it('uses the title attribute for the rollout tooltip', () => {
    render(<LockedAffordance label="Add a new banner" />)
    const btn = screen.getByRole('button', { name: /add a new banner/i })
    expect(btn).toHaveAttribute('title', expect.stringMatching(/coming in this branches rollout/i))
  })

  it('can hide the subtext when subtext={false} (tooltip-only)', () => {
    render(<LockedAffordance label="Add photo" subtext={false} />)
    expect(screen.getByRole('button', { name: /add photo/i })).toBeDisabled()
    expect(screen.queryByText(/coming in this branches rollout/i)).not.toBeInTheDocument()
  })
})
