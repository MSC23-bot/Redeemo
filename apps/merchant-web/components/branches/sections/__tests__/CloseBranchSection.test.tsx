import { render, screen, fireEvent } from '@testing-library/react'
import { CloseBranchSection } from '@/components/branches/sections/CloseBranchSection'

// Branches PR-1 F13: the "Permanently close this branch" section (prototype 06/09/10).
// It carries the red warning styling + the prototype copy, but the close control is a
// DISABLED locked affordance (lifecycle ships in PR-5). It performs NO network/action.
// The close lifecycle is owner-only, so a non-owner sees nothing.

const apiFetch = jest.fn()
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual('@/lib/api/client')
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) }
})

beforeEach(() => {
  apiFetch.mockReset()
})

describe('CloseBranchSection', () => {
  it('renders the "Permanently close this branch" heading + warning copy', () => {
    render(<CloseBranchSection isOwner />)
    expect(screen.getByText(/permanently close this branch/i)).toBeInTheDocument()
  })

  it('renders the close control disabled (locked)', () => {
    render(<CloseBranchSection isOwner />)
    const btn = screen.getByRole('button', { name: /close.*permanently|request to close/i })
    expect(btn).toBeDisabled()
  })

  it('fires no action / network call when clicked', () => {
    render(<CloseBranchSection isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /close.*permanently|request to close/i }))
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('shows the rollout subtext so the disabled state reads as intentional', () => {
    render(<CloseBranchSection isOwner />)
    expect(screen.getByText(/coming in this branches rollout/i)).toBeInTheDocument()
  })

  it('renders nothing for a non-owner (close lifecycle is owner-only)', () => {
    const { container } = render(<CloseBranchSection isOwner={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  // F14 token nit: the warning background must NOT use the raw #FEECEC hex (it now uses
  // the var(--danger-bg) token). jsdom's CSS parser silently DROPS a `var()` value from
  // the `background` shorthand, so the positive token presence is not jsdom-observable;
  // we regression-guard the raw hex being gone, which is the regression that matters.
  it('does not paint the warning background with the raw #FEECEC hex', () => {
    render(<CloseBranchSection isOwner />)
    const style = screen.getByTestId('branch-close-section').getAttribute('style') ?? ''
    expect(style.toUpperCase()).not.toContain('#FEECEC')
  })
})
