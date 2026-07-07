import { render, screen } from '@testing-library/react'
import { PendingEditBanner } from '@/components/business-profile/PendingEditBanner'
import type { MerchantProfile } from '@/lib/api/profile'

// Fidelity polish (2026-07-07 audit): the banner used to show only generic
// "awaiting Redeemo review" copy with no field detail. It now diffs the pending
// edit's proposedChanges against the current profile + shows the submission date.

function profile(over: Partial<MerchantProfile> = {}): MerchantProfile {
  return {
    id: 'm1',
    businessName: 'The Old Foundry Kitchen Ltd',
    status: 'ACTIVE',
    onboardingStep: 'LIVE',
    tradingName: 'The Old Foundry Kitchen',
    description: 'Our original description.',
    logoUrl: 'https://cdn.example.com/logo-old.png',
    bannerUrl: null,
    pendingEdits: [],
    ...over,
  } as MerchantProfile
}

describe('PendingEditBanner', () => {
  it('renders nothing when there is no PENDING edit', () => {
    const { container } = render(<PendingEditBanner profile={profile({ pendingEdits: [] })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the field diff (old -> new) + the submitted date for a sample proposedChanges', () => {
    render(
      <PendingEditBanner
        profile={profile({
          pendingEdits: [
            {
              id: 'e1',
              status: 'PENDING',
              createdAt: '2026-06-17T09:00:00.000Z',
              proposedChanges: { tradingName: 'The New Foundry' },
            },
          ],
        })}
      />,
    )
    const diff = screen.getByTestId('business-profile-pending-edit-diff')
    expect(diff).toHaveTextContent('Trading name:')
    expect(diff).toHaveTextContent('The Old Foundry Kitchen')
    expect(diff).toHaveTextContent('The New Foundry')
    expect(screen.getByText(/submitted 17 june 2026/i)).toBeInTheDocument()
  })

  it('shows a friendly label for an image field instead of the raw URL', () => {
    render(
      <PendingEditBanner
        profile={profile({
          pendingEdits: [
            {
              id: 'e1',
              status: 'PENDING',
              createdAt: '2026-06-17T09:00:00.000Z',
              proposedChanges: { logoUrl: 'https://cdn.example.com/logo-new-secret.png' },
            },
          ],
        })}
      />,
    )
    const diff = screen.getByTestId('business-profile-pending-edit-diff')
    expect(diff).toHaveTextContent('Logo image (change pending)')
    expect(diff).not.toHaveTextContent('https://cdn.example.com')
  })

  it('renders no diff block when the pending edit carries no labelled proposedChanges', () => {
    render(
      <PendingEditBanner
        profile={profile({
          pendingEdits: [{ id: 'e1', status: 'PENDING', createdAt: '2026-06-17T09:00:00.000Z' }],
        })}
      />,
    )
    expect(screen.getByTestId('business-profile-pending-edit-banner')).toBeInTheDocument()
    expect(screen.queryByTestId('business-profile-pending-edit-diff')).not.toBeInTheDocument()
  })
})
