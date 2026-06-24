import { render, screen, fireEvent } from '@testing-library/react'
import { CloseBranchSection } from '@/components/branches/sections/CloseBranchSection'
import type { Branch } from '@/lib/api/branch'

// Branches PR-5 §6 (CLOSE): the "Permanently close this branch" section (prototype
// 06/09/10). The close control is now LIVE (was the PR-1 disabled affordance): it opens
// the reason-collecting CloseBranchModal. Owner-only. The main branch disables the
// button with the "make another main first" copy; a PENDING_CLOSE branch shows
// "Close request in review" instead of a second close button (the page banner owns
// Withdraw).

// Stub the modal so the section test stays bounded (the full modal behaviour is covered
// in CloseBranchModal.test.tsx). The stub exposes a marker so we can assert it opened.
jest.mock('@/components/branches/CloseBranchModal', () => ({
  CloseBranchModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="close-branch-modal-stub">
      <button type="button" onClick={onClose}>
        stub-close
      </button>
    </div>
  ),
}))

function branch(over: Record<string, unknown> = {}): Branch {
  return { id: 'b1', name: 'Mill Road', isMainBranch: false, lifecycleStatus: 'LIVE', ...over } as unknown as Branch
}

describe('CloseBranchSection', () => {
  it('renders the "Permanently close this branch" heading + warning copy', () => {
    render(<CloseBranchSection branch={branch()} isOwner />)
    expect(screen.getByText(/permanently close this branch/i)).toBeInTheDocument()
  })

  it('opens the close-request modal when the live close control is clicked (owner)', () => {
    render(<CloseBranchSection branch={branch()} isOwner />)
    const btn = screen.getByTestId('request-close-branch')
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(screen.getByTestId('close-branch-modal-stub')).toBeInTheDocument()
  })

  it('disables the close control with the make-another-main copy on the main branch', () => {
    render(<CloseBranchSection branch={branch({ isMainBranch: true })} isOwner />)
    expect(screen.getByTestId('request-close-branch')).toBeDisabled()
    expect(screen.getByText(/make another branch your main branch first/i)).toBeInTheDocument()
  })

  it('shows "Close request in review" instead of a close button when PENDING_CLOSE', () => {
    render(<CloseBranchSection branch={branch({ lifecycleStatus: 'PENDING_CLOSE' })} isOwner />)
    expect(screen.getByTestId('branch-close-in-review')).toBeInTheDocument()
    expect(screen.queryByTestId('request-close-branch')).not.toBeInTheDocument()
  })

  it('renders nothing for a non-owner (close lifecycle is owner-only)', () => {
    const { container } = render(<CloseBranchSection branch={branch()} isOwner={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  // F14 token nit (carried from PR-1): the warning background must NOT use the raw
  // #FEECEC hex (it uses var(--danger-bg)). jsdom drops var() from the background
  // shorthand, so we regression-guard the raw hex being gone, which is what matters.
  it('does not paint the warning background with the raw #FEECEC hex', () => {
    render(<CloseBranchSection branch={branch()} isOwner />)
    const style = screen.getByTestId('branch-close-section').getAttribute('style') ?? ''
    expect(style.toUpperCase()).not.toContain('#FEECEC')
  })
})
