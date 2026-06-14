/**
 * CreateDraftForm — 6 fields, required + email validation, success copy
 * (non-absolute, no token), EMAIL_ALREADY_EXISTS banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateDraftForm } from '../CreateDraftForm'
import { ApiError } from '@/lib/api/client'

// ── Mock next/link ────────────────────────────────────────────────────────────

jest.mock('next/link', () => {
  return function MockLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  }
})

// ── Mock useCreateDraft ───────────────────────────────────────────────────────

const mockMutate = jest.fn()
const mockMutation: {
  mutate: jest.Mock
  isPending: boolean
  isSuccess: boolean
  error: Error | null
} = {
  mutate: mockMutate,
  isPending: false,
  isSuccess: false,
  error: null,
}

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useCreateDraft: jest.fn(() => mockMutation),
}))

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.isSuccess = false
  mockMutation.error = null
})

function fillRequired() {
  fireEvent.change(screen.getByTestId('create-draft-business-name'), {
    target: { value: 'Acme Coffee' },
  })
  fireEvent.change(screen.getByTestId('create-draft-owner-first-name'), {
    target: { value: 'Olivia' },
  })
  fireEvent.change(screen.getByTestId('create-draft-owner-last-name'), {
    target: { value: 'Owner' },
  })
  fireEvent.change(screen.getByTestId('create-draft-owner-email'), {
    target: { value: 'owner@acme.test' },
  })
}

// ── Structure: exactly 6 fields ───────────────────────────────────────────────

describe('CreateDraftForm structure', () => {
  it('renders exactly 6 fields', () => {
    render(<CreateDraftForm />)
    expect(screen.getByTestId('create-draft-business-name')).toBeInTheDocument()
    expect(screen.getByTestId('create-draft-trading-name')).toBeInTheDocument()
    expect(screen.getByTestId('create-draft-owner-first-name')).toBeInTheDocument()
    expect(screen.getByTestId('create-draft-owner-last-name')).toBeInTheDocument()
    expect(screen.getByTestId('create-draft-owner-email')).toBeInTheDocument()
    expect(screen.getByTestId('create-draft-job-title')).toBeInTheDocument()
  })

  it('renders the admin-created / owner-claimed / approval intro copy', () => {
    render(<CreateDraftForm />)
    const intro = screen.getByTestId('create-draft-intro')
    expect(intro).toHaveTextContent(/on their behalf/i)
    expect(intro).toHaveTextContent(/claims the account/i)
    expect(intro).toHaveTextContent(/goes live only after you approve/i)
  })
})

// ── Validation ────────────────────────────────────────────────────────────────

describe('CreateDraftForm validation', () => {
  it('blocks submit and shows required errors when fields are empty', () => {
    render(<CreateDraftForm />)
    fireEvent.click(screen.getByTestId('create-draft-submit'))
    expect(mockMutate).not.toHaveBeenCalled()
    expect(screen.getByTestId('create-draft-business-name-error')).toBeInTheDocument()
    expect(screen.getByTestId('create-draft-owner-first-name-error')).toBeInTheDocument()
    expect(screen.getByTestId('create-draft-owner-last-name-error')).toBeInTheDocument()
    expect(screen.getByTestId('create-draft-owner-email-error')).toBeInTheDocument()
  })

  it('rejects an invalid email format', () => {
    render(<CreateDraftForm />)
    fillRequired()
    fireEvent.change(screen.getByTestId('create-draft-owner-email'), {
      target: { value: 'not-an-email' },
    })
    fireEvent.click(screen.getByTestId('create-draft-submit'))
    expect(mockMutate).not.toHaveBeenCalled()
    expect(screen.getByTestId('create-draft-owner-email-error')).toHaveTextContent(/valid email/i)
  })

  it('calls mutate with trimmed fields (optional fields omitted when blank)', async () => {
    render(<CreateDraftForm />)
    fillRequired()
    fireEvent.click(screen.getByTestId('create-draft-submit'))
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    const [payload] = mockMutate.mock.calls[0]
    expect(payload).toEqual({
      businessName: 'Acme Coffee',
      tradingName: undefined,
      ownerEmail: 'owner@acme.test',
      ownerFirstName: 'Olivia',
      ownerLastName: 'Owner',
      jobTitle: undefined,
    })
  })

  it('includes optional fields when provided', async () => {
    render(<CreateDraftForm />)
    fillRequired()
    fireEvent.change(screen.getByTestId('create-draft-trading-name'), {
      target: { value: 'Acme' },
    })
    fireEvent.change(screen.getByTestId('create-draft-job-title'), {
      target: { value: 'Director' },
    })
    fireEvent.click(screen.getByTestId('create-draft-submit'))
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    const [payload] = mockMutate.mock.calls[0]
    expect(payload.tradingName).toBe('Acme')
    expect(payload.jobTitle).toBe('Director')
  })
})

// ── Success state ───────────────────────────────────────────────────────────────

describe('CreateDraftForm success state', () => {
  it('shows the non-absolute setup-email copy and never references a token', () => {
    mockMutation.isSuccess = true
    render(<CreateDraftForm />)
    const success = screen.getByTestId('create-draft-success')
    // Non-absolute: "triggered", not "has been emailed / delivered".
    expect(success).toHaveTextContent(
      'A set-password (account setup) email is triggered automatically for the owner.'
    )
    expect(success).not.toHaveTextContent(/has been emailed/i)
    expect(success).not.toHaveTextContent(/delivered/i)
    // No token anywhere.
    expect(success).not.toHaveTextContent(/token/i)
    // No resend / delivery-status UI.
    expect(screen.queryByText(/resend/i)).not.toBeInTheDocument()
  })

  it('does NOT render the form fields once successful', () => {
    mockMutation.isSuccess = true
    render(<CreateDraftForm />)
    expect(screen.queryByTestId('create-draft-business-name')).not.toBeInTheDocument()
  })
})

// ── Error banner ────────────────────────────────────────────────────────────────

describe('CreateDraftForm error banner', () => {
  it('renders the NamedGateBanner with the EMAIL_ALREADY_EXISTS copy', () => {
    const err = new ApiError(409, { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Exists' } })
    const { useCreateDraft } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useCreateDraft: jest.MockedFunction<() => typeof mockMutation>
    }
    useCreateDraft.mockReturnValueOnce({ ...mockMutation, error: err })
    render(<CreateDraftForm />)
    expect(screen.getByTestId('create-draft-error')).toBeInTheDocument()
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'An account with this email already exists. Use a different owner email.'
    )
  })
})
