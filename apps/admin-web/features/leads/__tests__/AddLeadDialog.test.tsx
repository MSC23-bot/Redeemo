/**
 * AddLeadDialog — required-field gating, no-personal-data hint, and the
 * non-blocking duplicate-warning notice shown after a successful create.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddLeadDialog } from '../AddLeadDialog'

const mockMutateAsync = jest.fn()
const mockMutation = { mutateAsync: mockMutateAsync, isPending: false, error: null as Error | null }

jest.mock('@/lib/leads/useLeadMutations', () => ({
  useCreateLead: () => mockMutation,
}))

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(<AddLeadDialog onSuccess={opts.onSuccess ?? jest.fn()} onCancel={opts.onCancel ?? jest.fn()} />)
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('AddLeadDialog structure + gating', () => {
  it('renders role=dialog with the no-personal-data hint', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /add lead/i })).toBeInTheDocument()
    expect(screen.getByTestId('add-lead-dialog')).toHaveTextContent(
      /do not put personal or contact details/i
    )
  })

  it('Add disabled until the business name is present', () => {
    renderDialog()
    expect(screen.getByTestId('add-lead-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('add-lead-business'), { target: { value: 'Anchor Street Coffee' } })
    expect(screen.getByTestId('add-lead-submit')).not.toBeDisabled()
  })

  it('submits the trimmed business name and omits blank optionals', async () => {
    mockMutateAsync.mockResolvedValueOnce({ lead: { id: 'lead-new' }, duplicateWarning: null })
    renderDialog()
    fireEvent.change(screen.getByTestId('add-lead-business'), { target: { value: '  Anchor Street Coffee  ' } })
    fireEvent.change(screen.getByTestId('add-lead-category'), { target: { value: 'Food and drink' } })
    fireEvent.click(screen.getByTestId('add-lead-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    const arg = mockMutateAsync.mock.calls[0][0]
    expect(arg.businessName).toBe('Anchor Street Coffee')
    expect(arg.categoryGuess).toBe('Food and drink')
    expect(arg.contactEmail).toBeUndefined()
  })
})

describe('AddLeadDialog duplicate warning (non-blocking)', () => {
  it('shows the amber duplicate notice after a create that returned a warning', async () => {
    const onSuccess = jest.fn()
    mockMutateAsync.mockResolvedValueOnce({
      lead: { id: 'lead-new' },
      duplicateWarning: {
        count: 1,
        sample: [{ id: 'lead-dup', businessName: 'Anchor Street Coffee', locationHint: 'Bristol BS1' }],
      },
    })
    renderDialog({ onSuccess })
    fireEvent.change(screen.getByTestId('add-lead-business'), { target: { value: 'Anchor Street Coffee' } })
    fireEvent.click(screen.getByTestId('add-lead-submit'))

    // Non-blocking: the lead WAS created (onSuccess not auto-fired) and the
    // warning is surfaced afterwards for the operator to review.
    await waitFor(() => expect(screen.getByTestId('add-lead-duplicate-warning')).toBeInTheDocument())
    expect(screen.getByTestId('add-lead-duplicate-warning')).toHaveTextContent('Anchor Street Coffee')
    expect(screen.getByTestId('add-lead-duplicate-warning')).toHaveTextContent('Bristol BS1')
    expect(onSuccess).not.toHaveBeenCalled()

    // Dismiss closes via onSuccess.
    fireEvent.click(screen.getByTestId('add-lead-done'))
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('closes immediately (no notice) when the create returned no warning', async () => {
    const onSuccess = jest.fn()
    mockMutateAsync.mockResolvedValueOnce({ lead: { id: 'lead-new' }, duplicateWarning: null })
    renderDialog({ onSuccess })
    fireEvent.change(screen.getByTestId('add-lead-business'), { target: { value: 'Fresh Prospect' } })
    fireEvent.click(screen.getByTestId('add-lead-submit'))
    // The "added" view shows a Done button, but no duplicate warning.
    await waitFor(() => expect(screen.getByTestId('add-lead-done')).toBeInTheDocument())
    expect(screen.queryByTestId('add-lead-duplicate-warning')).not.toBeInTheDocument()
  })
})
