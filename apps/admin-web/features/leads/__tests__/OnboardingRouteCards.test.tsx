import React from 'react'
import { render, screen } from '@testing-library/react'
import { CreateDraftCard, AssistedOnboardingCard } from '../OnboardingRouteCards'

jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
})

describe('CreateDraftCard', () => {
  it('renders a live link to /merchants/new when the admin has merchant:create-draft', () => {
    render(<CreateDraftCard canCreateDraft />)

    const link = screen.getByTestId('leads-create-draft-link')
    expect(link).toHaveAttribute('href', '/merchants/new')
    expect(screen.queryByTestId('leads-create-draft-locked')).not.toBeInTheDocument()
  })

  it('renders a disabled button + locked note (never a dead link) when the capability is absent', () => {
    render(<CreateDraftCard canCreateDraft={false} />)

    expect(screen.queryByTestId('leads-create-draft-link')).not.toBeInTheDocument()
    const button = screen.getByTestId('leads-create-draft-button-disabled')
    expect(button).toBeDisabled()
    expect(screen.getByTestId('leads-create-draft-locked')).toHaveTextContent('Needs merchant:create-draft')
  })

  it('always shows the honest manual-handover note (email is currently off)', () => {
    render(<CreateDraftCard canCreateDraft />)

    expect(screen.getByTestId('leads-create-draft-email-note')).toHaveTextContent(/manual/i)
  })
})

describe('AssistedOnboardingCard', () => {
  it('renders a live "Start assisted onboarding" CTA to the create-draft form when canAssist', () => {
    render(<AssistedOnboardingCard canAssist />)

    const link = screen.getByTestId('leads-assisted-link')
    expect(link).toHaveAttribute('href', '/merchants/new')
    expect(screen.queryByTestId('leads-assisted-button-disabled')).not.toBeInTheDocument()
  })

  it('renders a disabled button + locked note (never a dead link) when the capability is absent', () => {
    render(<AssistedOnboardingCard canAssist={false} />)

    expect(screen.queryByTestId('leads-assisted-link')).not.toBeInTheDocument()
    const button = screen.getByTestId('leads-assisted-button-disabled')
    expect(button).toBeDisabled()
    expect(screen.getByTestId('leads-assisted-locked')).toHaveTextContent('Needs merchant:create-draft')
  })

  it('explains the create-draft-first begin path and honest step gating', () => {
    render(<AssistedOnboardingCard canAssist />)
    expect(screen.getByTestId('leads-assisted-begin-note')).toHaveTextContent(/create the draft to begin/i)
  })

  it('shows the Net-new badge', () => {
    render(<AssistedOnboardingCard canAssist />)
    expect(screen.getByText('Net-new')).toBeInTheDocument()
  })
})
