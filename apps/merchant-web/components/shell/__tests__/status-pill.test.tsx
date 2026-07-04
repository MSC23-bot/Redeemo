import { render, screen } from '@testing-library/react'
import { StatusPill, type LifecycleState } from '../StatusPill'

const ALL: { state: LifecycleState; label: string }[] = [
  { state: 'setup', label: 'Setting up' },
  { state: 'submitted', label: 'Submitted' },
  { state: 'in_review', label: 'In review' },
  { state: 'changes', label: 'Changes needed' },
  { state: 'live', label: 'Live' },
  { state: 'live_new', label: 'Live, just started' },
  { state: 'suspended', label: 'Suspended' },
  { state: 'rejected', label: 'Not approved' },
]

describe('StatusPill', () => {
  it.each(ALL)('renders the $state state as "$label"', ({ state, label }) => {
    render(<StatusPill state={state} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('defaults to "setup" when no state is given', () => {
    render(<StatusPill />)
    expect(screen.getByText('Setting up')).toBeInTheDocument()
  })

  // Shell wave: prototype two-line pill with the BUSINESS STATUS micro-label.
  it('renders the "Business status" micro-label above the state text', () => {
    render(<StatusPill state="live" />)
    expect(screen.getByText('Business status')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  // Shell wave: collapsed 72px rail renders the labelled dot only.
  it('dotOnly renders an accessible dot without the text label', () => {
    render(<StatusPill state="suspended" dotOnly />)
    expect(screen.queryByText('Suspended')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Business status: Suspended' })).toBeInTheDocument()
  })
})
