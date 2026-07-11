/**
 * CreateAccountDialog — field validation, role select (incl. FIELD note),
 * submit payload, error banner (with the EMAIL_ALREADY_EXISTS override).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateAccountDialog } from '../CreateAccountDialog'
import { ApiError } from '@/lib/api/client'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/team/useTeam', () => ({
  useCreateAdmin: jest.fn(() => mockMutation),
}))

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <CreateAccountDialog onSuccess={opts.onSuccess ?? jest.fn()} onCancel={opts.onCancel ?? jest.fn()} />
  )
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('CreateAccountDialog structure', () => {
  it('renders with role=dialog', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /create admin account/i })).toBeInTheDocument()
  })

  it('states the account activates via password reset and the operator never sets/sees the password', () => {
    renderDialog()
    expect(screen.getByTestId('create-account-intro')).toHaveTextContent('password-reset flow')
    expect(screen.getByTestId('create-account-intro')).toHaveTextContent('never set or see their password')
  })

  it('defaults the role select to OPERATIONS', () => {
    renderDialog()
    expect(screen.getByTestId('create-account-role')).toHaveValue('OPERATIONS')
  })

  it('offers all 5 assignable roles including FIELD', () => {
    renderDialog()
    const select = screen.getByTestId('create-account-role') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual(['OPERATIONS', 'FINANCE', 'CONTENT', 'SUPPORT', 'FIELD'])
  })

  it('shows the FIELD email-enablement note only when FIELD is selected', () => {
    renderDialog()
    expect(screen.queryByTestId('create-account-field-note')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('create-account-role'), { target: { value: 'FIELD' } })
    expect(screen.getByTestId('create-account-field-note')).toHaveTextContent('need email enablement to log in')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('create-account-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when the scrim is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('create-account-scrim'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('CreateAccountDialog validation', () => {
  it('shows field errors and does not submit when all fields are empty', () => {
    renderDialog()
    fireEvent.click(screen.getByTestId('create-account-submit'))
    expect(screen.getByTestId('create-account-email-error')).toHaveTextContent('Email is required.')
    expect(screen.getByTestId('create-account-first-name-error')).toHaveTextContent('First name is required.')
    expect(screen.getByTestId('create-account-last-name-error')).toHaveTextContent('Last name is required.')
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('rejects a malformed email', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('create-account-email'), { target: { value: 'not-an-email' } })
    fireEvent.change(screen.getByTestId('create-account-first-name'), { target: { value: 'A' } })
    fireEvent.change(screen.getByTestId('create-account-last-name'), { target: { value: 'B' } })
    fireEvent.click(screen.getByTestId('create-account-submit'))
    expect(screen.getByTestId('create-account-email-error')).toHaveTextContent('Enter a valid email address.')
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })
})

describe('CreateAccountDialog submit', () => {
  it('calls create with the trimmed fields and the selected role', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'a1' })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.change(screen.getByTestId('create-account-email'), { target: { value: '  rep@redeemo.com  ' } })
    fireEvent.change(screen.getByTestId('create-account-first-name'), { target: { value: ' Rep ' } })
    fireEvent.change(screen.getByTestId('create-account-last-name'), { target: { value: ' One ' } })
    fireEvent.change(screen.getByTestId('create-account-role'), { target: { value: 'FIELD' } })
    fireEvent.click(screen.getByTestId('create-account-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        email: 'rep@redeemo.com',
        firstName: 'Rep',
        lastName: 'One',
        role: 'FIELD',
      })
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('stays disabled while pending', () => {
    mockMutation.isPending = true
    renderDialog()
    expect(screen.getByTestId('create-account-submit')).toBeDisabled()
  })
})

describe('CreateAccountDialog error banner', () => {
  it('renders NamedGateBanner when mutation.error is set', () => {
    const err = Object.assign(new Error('boom'), { code: 'ADMIN_CAPABILITY_DENIED' })
    const { useCreateAdmin } = jest.requireMock('@/lib/team/useTeam') as {
      useCreateAdmin: jest.MockedFunction<() => typeof mockMutation>
    }
    useCreateAdmin.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })

  it('overrides EMAIL_ALREADY_EXISTS with account-context copy (not the M6 "owner email" wording)', () => {
    const err = new ApiError(409, { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Exists' } })
    const { useCreateAdmin } = jest.requireMock('@/lib/team/useTeam') as {
      useCreateAdmin: jest.MockedFunction<() => typeof mockMutation>
    }
    useCreateAdmin.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    const banner = screen.getByTestId('named-gate-banner')
    expect(banner).toHaveTextContent('An account with this email already exists. Use a different email.')
    expect(banner).not.toHaveTextContent('owner email')
  })
})
