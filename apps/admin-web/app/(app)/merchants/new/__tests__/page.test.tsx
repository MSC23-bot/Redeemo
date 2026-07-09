/**
 * /merchants/new page — capability + ready gate.
 *   - session not ready -> loader
 *   - lacks merchant:create-draft -> forbidden
 *   - authorised -> CreateDraftForm
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import CreateMerchantDraftPage from '../page'

// ── Mock next/link ────────────────────────────────────────────────────────────

jest.mock('next/link', () => {
  return function MockLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  }
})

// ── Mock useSession ───────────────────────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}))

// ── Mock CreateDraftForm so we only test the gate ─────────────────────────────

jest.mock('@/features/merchants/CreateDraftForm', () => ({
  CreateDraftForm: () => <div data-testid="create-draft-form-mock" />,
}))

import { useSession } from '@/lib/auth/useSession'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>

function mockSession(opts: { ready?: boolean; can?: (cap: string) => boolean } = {}) {
  mockedUseSession.mockReturnValue({
    accessToken: 'test-access-token',
    ready: opts.ready ?? true,
    isAuthenticated: true,
    role: 'OPERATIONS',
    email: 'ops@redeemo.co.uk',
    adminId: 'admin-me',
    can: opts.can ?? (() => true),
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

afterEach(() => jest.clearAllMocks())

describe('CreateMerchantDraftPage gate', () => {
  it('shows the loader while session is not ready', () => {
    mockSession({ ready: false, can: () => false })
    render(<CreateMerchantDraftPage />)
    expect(screen.getByTestId('create-draft-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('create-draft-forbidden')).not.toBeInTheDocument()
    expect(screen.queryByTestId('create-draft-form-mock')).not.toBeInTheDocument()
  })

  it('shows forbidden when the admin lacks merchant:create-draft', () => {
    mockSession({ can: (cap) => cap !== 'merchant:create-draft' })
    render(<CreateMerchantDraftPage />)
    expect(screen.getByTestId('create-draft-forbidden')).toBeInTheDocument()
    expect(screen.queryByTestId('create-draft-form-mock')).not.toBeInTheDocument()
  })

  it('renders the form when the admin has merchant:create-draft', () => {
    mockSession({ can: () => true })
    render(<CreateMerchantDraftPage />)
    expect(screen.getByTestId('create-draft-form-mock')).toBeInTheDocument()
    expect(screen.queryByTestId('create-draft-forbidden')).not.toBeInTheDocument()
  })

  it('renders only when the specific capability is granted (not a different cap)', () => {
    mockSession({ can: (cap) => cap === 'approval:read' })
    render(<CreateMerchantDraftPage />)
    expect(screen.getByTestId('create-draft-forbidden')).toBeInTheDocument()
  })
})
