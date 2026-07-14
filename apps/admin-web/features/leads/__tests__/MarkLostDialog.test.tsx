/**
 * MarkLostDialog: reason REQUIRED, no-personal-data hint, LOST-move submit body,
 * and the lead-code error banner (LEAD_LOST_REASON_REQUIRED).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MarkLostDialog } from '../MarkLostDialog'
import { ApiError } from '@/lib/api/client'
import type { Lead } from '@/lib/api/leads'

const mockMutateAsync = jest.fn()
const mockMutation = { mutateAsync: mockMutateAsync, isPending: false, error: null as Error | null }

jest.mock('@/lib/leads/useLeadMutations', () => ({
  useUpdateLead: () => mockMutation,
}))

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-lost-1',
    businessName: 'Old City Vinyl',
    categoryGuess: null,
    locationHint: 'Bristol',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    source: null,
    stage: 'CONTACTED',
    nextAction: null,
    dueDate: null,
    assignedRepId: null,
    lostReason: null,
    convertedMerchantId: null,
    lastActivityAt: '2026-07-12T09:00:00.000Z',
    anonymisedAt: null,
    createdAt: '2026-07-10T09:00:00.000Z',
    updatedAt: '2026-07-12T09:00:00.000Z',
    ...overrides,
  }
}

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(<MarkLostDialog lead={makeLead()} onSuccess={opts.onSuccess ?? jest.fn()} onCancel={opts.onCancel ?? jest.fn()} />)
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('MarkLostDialog', () => {
  it('renders role=dialog with the no-personal-data analytics hint', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /mark lead as lost/i })).toBeInTheDocument()
    expect(screen.getByTestId('mark-lost-dialog')).toHaveTextContent(
      'Do not put personal or contact details in the reason: it is kept for analytics.'
    )
  })

  it('disables submit until a non-empty reason is entered (reason required)', () => {
    renderDialog()
    expect(screen.getByTestId('mark-lost-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('mark-lost-reason'), { target: { value: '   ' } })
    expect(screen.getByTestId('mark-lost-submit')).toBeDisabled() // whitespace does not count
    fireEvent.change(screen.getByTestId('mark-lost-reason'), { target: { value: 'No budget this quarter' } })
    expect(screen.getByTestId('mark-lost-submit')).not.toBeDisabled()
  })

  it('submits a LOST stage move with the trimmed reason', async () => {
    mockMutateAsync.mockResolvedValueOnce(makeLead({ stage: 'LOST' }))
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    fireEvent.change(screen.getByTestId('mark-lost-reason'), { target: { value: '  No budget this quarter  ' } })
    fireEvent.click(screen.getByTestId('mark-lost-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith({
      leadId: 'lead-lost-1',
      input: { stage: 'LOST', lostReason: 'No budget this quarter' },
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('renders the lead-code banner when the mutation errors (LEAD_LOST_REASON_REQUIRED)', () => {
    mockMutation.error = new ApiError(400, { error: { code: 'LEAD_LOST_REASON_REQUIRED', message: 'Reason required' } })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('A reason is required to mark a lead as lost.')
  })
})
