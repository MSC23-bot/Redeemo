/**
 * ForbiddenState: the shared permission-denied component (honesty-copy sweep,
 * 2026-07-13). Locks the honesty contract from the merged module specs:
 * denied copy must name the capability AND the viewer's role, state "Nothing
 * is broken", and point to a Super Admin; see the component's own doc
 * comment for the exact spec citations.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { ForbiddenState } from '../ForbiddenState'

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}))

import { useSession } from '@/lib/auth/useSession'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>

function mockRole(role: string | null) {
  mockedUseSession.mockReturnValue({
    accessToken: 'test-access-token',
    ready: true,
    isAuthenticated: true,
    role: role as never,
    email: 'ops@redeemo.co.uk',
    adminId: 'admin-1',
    can: () => false,
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

describe('ForbiddenState: page variant', () => {
  it('names the capability, the viewer role, and reassures nothing is broken', () => {
    mockRole('FINANCE')
    render(
      <ForbiddenState
        heading="You do not have access to the approval queue."
        capability="approval:read"
        testId="queue-forbidden"
      />
    )
    const el = screen.getByTestId('queue-forbidden')
    expect(el).toHaveTextContent('You do not have access to the approval queue.')
    expect(el).toHaveTextContent(/approval:read/)
    expect(el).toHaveTextContent(/FINANCE/)
    expect(el).toHaveTextContent(/nothing is broken/i)
    expect(el).toHaveTextContent(/super admin/i)
  })

  it('reflects the actual signed-in role, not a hardcoded one', () => {
    mockRole('SUPPORT')
    render(
      <ForbiddenState heading="You do not have access to Team & roles." capability="admin:manage-team" testId="team-forbidden" />
    )
    expect(screen.getByTestId('team-forbidden')).toHaveTextContent(/SUPPORT/)
  })

  it('falls back gracefully when role is null (should not render literal "null")', () => {
    mockRole(null)
    render(
      <ForbiddenState heading="You do not have access to redemptions." capability="redemption:read" testId="redemptions-forbidden" />
    )
    const text = screen.getByTestId('redemptions-forbidden').textContent ?? ''
    expect(text).not.toMatch(/\(null\)/)
  })

  it('carries no em-dash', () => {
    mockRole('OPERATIONS')
    render(
      <ForbiddenState heading="You cannot create merchant drafts." capability="merchant:create-draft" testId="create-draft-forbidden" />
    )
    const text = screen.getByTestId('create-draft-forbidden').textContent ?? ''
    // Unicode escape, not a literal em-dash character, so this file's own
    // added lines stay clear of the house em-dash ban while still testing
    // for the character's absence in the rendered copy.
    expect(text).not.toMatch(/\u2014/)
  })
})

describe('ForbiddenState: section variant (denied tab inside an otherwise-visible workspace)', () => {
  it('names the subject, capability, and role, distinct from the page variant heading style', () => {
    mockRole('SUPPORT')
    render(
      <ForbiddenState
        variant="section"
        heading="Activity"
        subject="this merchant's activity"
        capability="approval:read"
        testId="workspace-activity-denied"
      />
    )
    const el = screen.getByTestId('workspace-activity-denied')
    expect(el).toHaveTextContent("You do not have access to this merchant's activity.")
    expect(el).toHaveTextContent(/approval:read/)
    expect(el).toHaveTextContent(/SUPPORT/)
    expect(el).toHaveTextContent(/nothing is broken/i)
  })
})
