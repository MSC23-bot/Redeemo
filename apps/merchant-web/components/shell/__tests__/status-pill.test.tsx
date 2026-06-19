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
})
