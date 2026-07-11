/**
 * RevokeApprovalConfirm — plain-language consequence copy (immediate,
 * signed-out), submit calls revoke with 'approval:action', error banner
 * (e.g. GRANT_NOT_FOUND).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RevokeApprovalConfirm } from '../RevokeApprovalConfirm'
import { ApiError } from '@/lib/api/client'
import type { TeamAdmin } from '@/lib/api/team'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/team/useTeam', () => ({
  useRevokeCapability: jest.fn(() => mockMutation),
}))

const ADMIN: TeamAdmin = {
  id: 'field-1',
  email: 'rep@redeemo.com',
  name: 'Rep One',
  role: 'FIELD',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  activeGrants: ['approval:action'],
}

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <RevokeApprovalConfirm admin={ADMIN} onSuccess={opts.onSuccess ?? jest.fn()} onCancel={opts.onCancel ?? jest.fn()} />
  )
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('RevokeApprovalConfirm structure', () => {
  it('renders with role=dialog and the admin name in the heading', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /revoke approval capability/i })).toBeInTheDocument()
    expect(screen.getByText(/Rep One/)).toBeInTheDocument()
  })

  it('renders the immediate-effect consequence copy (signed out, next request)', () => {
    renderDialog()
    const copy = screen.getByTestId('revoke-approval-consequence-copy')
    expect(copy).toHaveTextContent('no longer be able to approve any merchant')
    expect(copy).toHaveTextContent('takes effect immediately')
    expect(copy).toHaveTextContent('signed out')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('revoke-approval-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('RevokeApprovalConfirm submit', () => {
  it('calls revoke with approval:action and calls onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ capability: 'approval:action', revokedCount: 1 })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.click(screen.getByTestId('revoke-approval-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith('approval:action')
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    expect(screen.getByTestId('revoke-approval-submit')).toBeDisabled()
  })
})

describe('RevokeApprovalConfirm error banner', () => {
  it('renders NamedGateBanner when mutation.error is set (e.g. GRANT_NOT_FOUND)', () => {
    const err = new ApiError(404, { error: { code: 'GRANT_NOT_FOUND', message: 'Not found.' } })
    const { useRevokeCapability } = jest.requireMock('@/lib/team/useTeam') as {
      useRevokeCapability: jest.MockedFunction<() => typeof mockMutation>
    }
    useRevokeCapability.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('revoke-approval-error-banner')).toBeInTheDocument()
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This capability grant no longer exists. The list has refreshed.'
    )
  })
})
