/**
 * TeamRosterTable — row rendering (role/status/grants pills), the "You"
 * badge, action wiring (change role / grant / revoke / deactivate), the
 * grant<->revoke toggle, and the self-deactivate disable.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamRosterTable } from '../TeamRosterTable'
import type { TeamAdmin } from '@/lib/api/team'

function admin(overrides: Partial<TeamAdmin> = {}): TeamAdmin {
  return {
    id: 'a1',
    email: 'ops@redeemo.com',
    name: 'Olu Ops',
    role: 'OPERATIONS',
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    activeGrants: [],
    ...overrides,
  }
}

function noop() {}

describe('TeamRosterTable — empty state', () => {
  it('shows an empty message when there are no admins', () => {
    render(
      <TeamRosterTable
        items={[]}
        canManage
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.getByText('No admin accounts yet.')).toBeInTheDocument()
  })
})

describe('TeamRosterTable — row rendering', () => {
  it('renders name, email, role, status, created for a row', () => {
    render(
      <TeamRosterTable
        items={[admin()]}
        canManage
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    const row = screen.getByTestId('team-row-a1')
    expect(row).toHaveTextContent('Olu Ops')
    expect(row).toHaveTextContent('ops@redeemo.com')
    expect(row).toHaveTextContent('Operations')
    expect(row).toHaveTextContent('Active')
  })

  it('shows "Deactivated" status for an inactive admin', () => {
    render(
      <TeamRosterTable
        items={[admin({ isActive: false })]}
        canManage
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.getByTestId('team-row-a1')).toHaveTextContent('Deactivated')
  })

  it('shows "None" for active grants when there are none', () => {
    render(
      <TeamRosterTable
        items={[admin()]}
        canManage
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.getByTestId('team-row-a1')).toHaveTextContent('None')
  })

  it('shows a pill for an active approval:action grant', () => {
    render(
      <TeamRosterTable
        items={[admin({ activeGrants: ['approval:action'] })]}
        canManage
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.getByTestId('team-row-a1')).toHaveTextContent('Can approve merchants')
  })

  it('renders the "You" badge on the signed-in admin own row, not on others', () => {
    render(
      <TeamRosterTable
        items={[admin({ id: 'me' }), admin({ id: 'other', email: 'x@y.com' })]}
        canManage
        currentAdminId="me"
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.getByTestId('team-you-badge-me')).toBeInTheDocument()
    expect(screen.queryByTestId('team-you-badge-other')).not.toBeInTheDocument()
  })
})

describe('TeamRosterTable — actions visibility', () => {
  it('hides the actions (shows "-") when canManage is false', () => {
    render(
      <TeamRosterTable
        items={[admin()]}
        canManage={false}
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.queryByTestId('team-change-role-a1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('team-deactivate-a1')).not.toBeInTheDocument()
  })

  it('shows "Grant approve" when the admin has no active approval:action grant', () => {
    render(
      <TeamRosterTable
        items={[admin()]}
        canManage
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.getByTestId('team-grant-approval-a1')).toBeInTheDocument()
    expect(screen.queryByTestId('team-revoke-approval-a1')).not.toBeInTheDocument()
  })

  it('shows "Revoke approve" when the admin already holds approval:action', () => {
    render(
      <TeamRosterTable
        items={[admin({ activeGrants: ['approval:action'] })]}
        canManage
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.getByTestId('team-revoke-approval-a1')).toBeInTheDocument()
    expect(screen.queryByTestId('team-grant-approval-a1')).not.toBeInTheDocument()
  })

  it('shows "-" instead of a Deactivate button for an already-deactivated admin', () => {
    render(
      <TeamRosterTable
        items={[admin({ isActive: false })]}
        canManage
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.queryByTestId('team-deactivate-a1')).not.toBeInTheDocument()
  })
})

describe('TeamRosterTable — self-deactivate disabled', () => {
  it('disables Deactivate on the signed-in admin own row', () => {
    render(
      <TeamRosterTable
        items={[admin({ id: 'me' })]}
        canManage
        currentAdminId="me"
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.getByTestId('team-deactivate-me')).toBeDisabled()
  })

  it('leaves Deactivate enabled on another admin row', () => {
    render(
      <TeamRosterTable
        items={[admin({ id: 'other' })]}
        canManage
        currentAdminId="me"
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    expect(screen.getByTestId('team-deactivate-other')).not.toBeDisabled()
  })
})

describe('TeamRosterTable — action wiring', () => {
  it('calls onChangeRole with the row admin', () => {
    const onChangeRole = jest.fn()
    const a = admin()
    render(
      <TeamRosterTable
        items={[a]}
        canManage
        currentAdminId={null}
        onChangeRole={onChangeRole}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    fireEvent.click(screen.getByTestId('team-change-role-a1'))
    expect(onChangeRole).toHaveBeenCalledWith(a)
  })

  it('calls onGrant with the row admin', () => {
    const onGrant = jest.fn()
    const a = admin()
    render(
      <TeamRosterTable
        items={[a]}
        canManage
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={onGrant}
        onRevoke={noop}
        onDeactivate={noop}
      />
    )
    fireEvent.click(screen.getByTestId('team-grant-approval-a1'))
    expect(onGrant).toHaveBeenCalledWith(a)
  })

  it('calls onRevoke with the row admin', () => {
    const onRevoke = jest.fn()
    const a = admin({ activeGrants: ['approval:action'] })
    render(
      <TeamRosterTable
        items={[a]}
        canManage
        currentAdminId={null}
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={onRevoke}
        onDeactivate={noop}
      />
    )
    fireEvent.click(screen.getByTestId('team-revoke-approval-a1'))
    expect(onRevoke).toHaveBeenCalledWith(a)
  })

  it('calls onDeactivate with the row admin', () => {
    const onDeactivate = jest.fn()
    const a = admin({ id: 'other' })
    render(
      <TeamRosterTable
        items={[a]}
        canManage
        currentAdminId="me"
        onChangeRole={noop}
        onGrant={noop}
        onRevoke={noop}
        onDeactivate={onDeactivate}
      />
    )
    fireEvent.click(screen.getByTestId('team-deactivate-other'))
    expect(onDeactivate).toHaveBeenCalledWith(a)
  })
})
