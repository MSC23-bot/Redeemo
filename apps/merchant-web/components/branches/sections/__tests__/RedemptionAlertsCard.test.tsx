import { render, screen, fireEvent } from '@testing-library/react'
import { RedemptionAlertsCard } from '@/components/branches/sections/RedemptionAlertsCard'

// Branches PR-1 F13: the Redemption alerts card (prototype 04). The card is ALWAYS
// VISIBLE (do NOT hide the whole card) but ALL its controls are DISABLED locked
// affordances (alerts ship in PR-7). It performs NO network write.

const apiFetch = jest.fn()
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual('@/lib/api/client')
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) }
})

beforeEach(() => {
  apiFetch.mockReset()
})

describe('RedemptionAlertsCard', () => {
  it('renders the card (always visible) with its heading', () => {
    render(<RedemptionAlertsCard isOwner />)
    expect(screen.getByText(/redemption alerts/i)).toBeInTheDocument()
  })

  it('renders an "Add an extra recipient" control that is disabled', () => {
    render(<RedemptionAlertsCard isOwner />)
    // The Add control is locked; assert at least one disabled control is present.
    const addBtn = screen.getByRole('button', { name: /add/i })
    expect(addBtn).toBeDisabled()
  })

  it('any interactive control in the card is disabled', () => {
    render(<RedemptionAlertsCard isOwner />)
    const buttons = screen.getAllByRole('button')
    for (const b of buttons) expect(b).toBeDisabled()
  })

  it('fires no network call even when controls are clicked', () => {
    render(<RedemptionAlertsCard isOwner />)
    for (const b of screen.getAllByRole('button')) fireEvent.click(b)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('shows the rollout subtext so the disabled state reads as intentional', () => {
    render(<RedemptionAlertsCard isOwner />)
    expect(screen.getByText(/coming in this branches rollout/i)).toBeInTheDocument()
  })
})
