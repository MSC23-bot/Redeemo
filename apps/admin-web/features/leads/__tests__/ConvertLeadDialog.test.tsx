/**
 * ConvertLeadDialog: owner-field prefill + required gating, convert submit body,
 * and the success view linking to the new merchant's 360.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConvertLeadDialog } from '../ConvertLeadDialog'
import { ApiError } from '@/lib/api/client'
import type { Lead } from '@/lib/api/leads'

jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
})

const mockMutateAsync = jest.fn()
const mockMutation = { mutateAsync: mockMutateAsync, isPending: false, error: null as Error | null }

jest.mock('@/lib/leads/useLeadMutations', () => ({
  useConvertLead: () => mockMutation,
}))

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-conv-1',
    businessName: 'The Green Larder',
    categoryGuess: 'Food and drink',
    locationHint: 'Bath',
    contactName: 'Marta Vane',
    contactEmail: 'marta@greenlarder.example',
    contactPhone: null,
    source: 'REP_VISIT',
    stage: 'VISIT_BOOKED',
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

function renderDialog(lead: Lead, opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(<ConvertLeadDialog lead={lead} onSuccess={opts.onSuccess ?? jest.fn()} onCancel={opts.onCancel ?? jest.fn()} />)
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('ConvertLeadDialog', () => {
  it('prefills owner email + first/last from the lead contact', () => {
    renderDialog(makeLead())
    expect(screen.getByTestId('convert-owner-email')).toHaveValue('marta@greenlarder.example')
    expect(screen.getByTestId('convert-owner-first')).toHaveValue('Marta')
    expect(screen.getByTestId('convert-owner-last')).toHaveValue('Vane')
  })

  it('states the truthful post-convert setup path and never claims a setup email is sent', () => {
    renderDialog(makeLead())
    const dialog = screen.getByTestId('convert-lead-dialog')
    // Truthful: owner completes setup via the secure claim/reset flow; auto emails are a later step.
    expect(dialog).toHaveTextContent(/secure claim\/reset flow/i)
    expect(dialog).toHaveTextContent(/later email-enablement step/i)
    // Regression guard: the old false claim ("a setup email is sent to the owner") must not return.
    expect(dialog).not.toHaveTextContent(/setup email is sent/i)
    expect(dialog).not.toHaveTextContent(/email is sent to the owner/i)
  })

  it('disables submit until email + first + last are present', () => {
    renderDialog(makeLead({ contactName: null, contactEmail: null }))
    expect(screen.getByTestId('convert-lead-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('convert-owner-email'), { target: { value: 'owner@x.example' } })
    fireEvent.change(screen.getByTestId('convert-owner-first'), { target: { value: 'Alex' } })
    expect(screen.getByTestId('convert-lead-submit')).toBeDisabled() // still no last name
    fireEvent.change(screen.getByTestId('convert-owner-last'), { target: { value: 'Rivers' } })
    expect(screen.getByTestId('convert-lead-submit')).not.toBeDisabled()
  })

  it('submits the owner fields and shows a success view linking to the merchant 360', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      draft: { merchantId: 'm-new-42', ownerAdminId: 'a-1', ownerEmail: 'marta@greenlarder.example', passwordSetupRequired: true },
      leadId: 'lead-conv-1',
      merchantId: 'm-new-42',
    })
    renderDialog(makeLead())
    fireEvent.click(screen.getByTestId('convert-lead-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith({
      leadId: 'lead-conv-1',
      input: { ownerEmail: 'marta@greenlarder.example', ownerFirstName: 'Marta', ownerLastName: 'Vane', tradingName: undefined },
    })
    const link = await screen.findByTestId('convert-lead-open-360')
    expect(link).toHaveAttribute('href', '/merchants/m-new-42')
    // Success view states the truthful setup path, not a "sets their own password" email claim.
    const dialog = screen.getByTestId('convert-lead-dialog')
    expect(dialog).toHaveTextContent(/secure claim\/reset flow/i)
  })

  it('renders the lead-code banner on a convert error (LEAD_ALREADY_CONVERTED)', () => {
    mockMutation.error = new ApiError(409, { error: { code: 'LEAD_ALREADY_CONVERTED', message: 'Already converted' } })
    renderDialog(makeLead())
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('already been converted')
  })
})
