/**
 * DeactivateConfirm — serious consequence copy, submit calls deactivate,
 * error banner (e.g. ADMIN_SELF_ACTION_FORBIDDEN, ADMIN_NOT_FOUND).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeactivateConfirm } from '../DeactivateConfirm'
import { ApiError } from '@/lib/api/client'
import type { TeamAdmin } from '@/lib/api/team'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/team/useTeam', () => ({
  useDeactivateAdmin: jest.fn(() => mockMutation),
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

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <DeactivateConfirm admin={ADMIN} onSuccess={opts.onSuccess ?? jest.fn()} onCancel={opts.onCancel ?? jest.fn()} />
  )
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('DeactivateConfirm structure', () => {
  it('renders with role=dialog and the admin name in the heading', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /deactivate admin account/i })).toBeInTheDocument()
    expect(screen.getByText(/Deactivate Olu Ops\?/)).toBeInTheDocument()
  })

  it('renders the serious consequence copy', () => {
    renderDialog()
    const copy = screen.getByTestId('deactivate-admin-consequence-copy')
    expect(copy).toHaveTextContent('immediately signs')
    expect(copy).toHaveTextContent('blocks them from signing back in')
    expect(copy).toHaveTextContent('does not delete their account or history')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('deactivate-admin-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when the scrim is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('deactivate-admin-scrim'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('DeactivateConfirm submit', () => {
  it('calls deactivate (no args) and calls onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'a1', email: 'ops@redeemo.com', role: 'OPERATIONS', isActive: false })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.click(screen.getByTestId('deactivate-admin-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith()
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    expect(screen.getByTestId('deactivate-admin-submit')).toBeDisabled()
  })
})

describe('DeactivateConfirm error banner', () => {
  it('renders NamedGateBanner when mutation.error is set (e.g. ADMIN_SELF_ACTION_FORBIDDEN)', () => {
    const err = new ApiError(400, { error: { code: 'ADMIN_SELF_ACTION_FORBIDDEN', message: 'No.' } })
    const { useDeactivateAdmin } = jest.requireMock('@/lib/team/useTeam') as {
      useDeactivateAdmin: jest.MockedFunction<() => typeof mockMutation>
    }
    useDeactivateAdmin.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('deactivate-admin-error-banner')).toBeInTheDocument()
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'You cannot perform this action on your own account.'
    )
  })

  it('renders NamedGateBanner for ADMIN_NOT_FOUND', () => {
    const err = new ApiError(404, { error: { code: 'ADMIN_NOT_FOUND', message: 'Not found.' } })
    const { useDeactivateAdmin } = jest.requireMock('@/lib/team/useTeam') as {
      useDeactivateAdmin: jest.MockedFunction<() => typeof mockMutation>
    }
    useDeactivateAdmin.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This admin account no longer exists. The list has refreshed.'
    )
  })
})
