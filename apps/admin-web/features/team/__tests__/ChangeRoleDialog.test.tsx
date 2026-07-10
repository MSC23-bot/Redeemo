/**
 * ChangeRoleDialog — current-role display, submit-disabled-when-unchanged,
 * submit payload, timing note, error banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChangeRoleDialog } from '../ChangeRoleDialog'
import type { TeamAdmin } from '@/lib/api/team'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/team/useTeam', () => ({
  useSetAdminRole: jest.fn(() => mockMutation),
}))

const ADMIN: TeamAdmin = {
  id: 'a1',
  email: 'ops@redeemo.com',
  name: 'Olu Ops',
  role: 'OPERATIONS',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  activeGrants: [],
}

function renderDialog(opts: { admin?: TeamAdmin; onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <ChangeRoleDialog
      admin={opts.admin ?? ADMIN}
      onSuccess={opts.onSuccess ?? jest.fn()}
      onCancel={opts.onCancel ?? jest.fn()}
    />
  )
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('ChangeRoleDialog structure', () => {
  it('renders with role=dialog', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /change role/i })).toBeInTheDocument()
  })

  it('shows the admin name and current role', () => {
    renderDialog()
    expect(screen.getByTestId('change-role-current')).toHaveTextContent('Olu Ops')
    expect(screen.getByTestId('change-role-current')).toHaveTextContent('Operations')
  })

  it('preselects the select to the admin current role', () => {
    renderDialog()
    expect(screen.getByTestId('change-role-select')).toHaveValue('OPERATIONS')
  })

  it('shows the effect-timing honesty note', () => {
    renderDialog()
    expect(screen.getByTestId('change-role-timing-note')).toHaveTextContent('within about 15 minutes')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('change-role-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('ChangeRoleDialog submission gating', () => {
  it('submit disabled when the role is unchanged', () => {
    renderDialog()
    expect(screen.getByTestId('change-role-submit')).toBeDisabled()
  })

  it('submit enabled once a different role is picked', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('change-role-select'), { target: { value: 'FIELD' } })
    expect(screen.getByTestId('change-role-submit')).not.toBeDisabled()
  })

  it('stays disabled while pending even with a changed role', () => {
    mockMutation.isPending = true
    renderDialog()
    fireEvent.change(screen.getByTestId('change-role-select'), { target: { value: 'FIELD' } })
    expect(screen.getByTestId('change-role-submit')).toBeDisabled()
  })
})

describe('ChangeRoleDialog submit', () => {
  it('calls setRole with the newly selected role and calls onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'a1', email: 'ops@redeemo.com', role: 'FIELD', isActive: true })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.change(screen.getByTestId('change-role-select'), { target: { value: 'FIELD' } })
    fireEvent.click(screen.getByTestId('change-role-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith('FIELD')
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})

describe('ChangeRoleDialog error banner', () => {
  it('renders NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('boom'), { code: 'ADMIN_NOT_FOUND' })
    const { useSetAdminRole } = jest.requireMock('@/lib/team/useTeam') as {
      useSetAdminRole: jest.MockedFunction<() => typeof mockMutation>
    }
    useSetAdminRole.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
