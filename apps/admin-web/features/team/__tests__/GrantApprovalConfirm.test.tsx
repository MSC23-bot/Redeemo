/**
 * GrantApprovalConfirm — plain-language consequence copy, submit calls grant
 * with 'approval:action', error banner (e.g. CAPABILITY_NOT_GRANTABLE).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GrantApprovalConfirm } from '../GrantApprovalConfirm'
import { ApiError } from '@/lib/api/client'
import type { TeamAdmin } from '@/lib/api/team'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/team/useTeam', () => ({
  useGrantCapability: jest.fn(() => mockMutation),
}))

const ADMIN: TeamAdmin = {
  id: 'field-1',
  email: 'rep@redeemo.com',
  name: 'Rep One',
  role: 'FIELD',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  activeGrants: [],
}

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <GrantApprovalConfirm admin={ADMIN} onSuccess={opts.onSuccess ?? jest.fn()} onCancel={opts.onCancel ?? jest.fn()} />
  )
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('GrantApprovalConfirm structure', () => {
  it('renders with role=dialog and the admin name in the heading', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /grant approval capability/i })).toBeInTheDocument()
    expect(screen.getByText(/Rep One/)).toBeInTheDocument()
  })

  it('renders the plain-language consequence copy (any merchant; self-approvals always audited)', () => {
    renderDialog()
    const copy = screen.getByTestId('grant-approval-consequence-copy')
    expect(copy).toHaveTextContent('any merchant')
    expect(copy).toHaveTextContent('Self-approvals are always audited')
  })

  it('renders the grant effect-timing note (not immediate, ~15 minutes)', () => {
    renderDialog()
    expect(screen.getByTestId('grant-approval-timing-note')).toHaveTextContent('within about 15 minutes')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('grant-approval-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when the scrim is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('grant-approval-scrim'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('GrantApprovalConfirm submit', () => {
  it('calls grant with approval:action and calls onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'g1', capability: 'approval:action', grantedAt: '2026-07-01T00:00:00.000Z', alreadyGranted: false })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.click(screen.getByTestId('grant-approval-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith('approval:action')
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    expect(screen.getByTestId('grant-approval-submit')).toBeDisabled()
  })
})

describe('GrantApprovalConfirm error banner', () => {
  it('renders NamedGateBanner when mutation.error is set (e.g. CAPABILITY_NOT_GRANTABLE)', () => {
    const err = new ApiError(400, { error: { code: 'CAPABILITY_NOT_GRANTABLE', message: 'No.' } })
    const { useGrantCapability } = jest.requireMock('@/lib/team/useTeam') as {
      useGrantCapability: jest.MockedFunction<() => typeof mockMutation>
    }
    useGrantCapability.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('grant-approval-error-banner')).toBeInTheDocument()
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('This capability cannot be granted from this screen.')
  })
})
