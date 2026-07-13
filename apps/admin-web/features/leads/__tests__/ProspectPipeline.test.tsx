/**
 * ProspectPipeline — board render from hook data, capability gating (denied /
 * Add-lead / Convert), client-side overdue, anonymised-card treatment, terminal
 * Lost / Converted sections, and the loading / error / empty states.
 *
 * The data + mutation hooks are mocked (house idiom): no raw fetch, no
 * QueryClientProvider needed.
 */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ProspectPipeline } from '../ProspectPipeline'
import { ApiError } from '@/lib/api/client'
import type { Lead } from '@/lib/api/leads'

// next/link (ConvertLeadDialog uses it; statically imported).
jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
})

const mockUseLeadsPipeline = jest.fn()
const mockUseTerminalLeads = jest.fn()
jest.mock('@/lib/leads/useLeadsPipeline', () => ({
  useLeadsPipeline: (opts?: unknown) => mockUseLeadsPipeline(opts),
  useTerminalLeads: (opts?: unknown) => mockUseTerminalLeads(opts),
}))

const mockUpdateMutate = jest.fn()
const mockUpdateMutation = { mutate: mockUpdateMutate, mutateAsync: jest.fn(), isPending: false, error: null as Error | null }
jest.mock('@/lib/leads/useLeadMutations', () => ({
  useUpdateLead: () => mockUpdateMutation,
  useCreateLead: () => ({ mutateAsync: jest.fn(), isPending: false, error: null }),
  useConvertLead: () => ({ mutateAsync: jest.fn(), isPending: false, error: null }),
}))

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    businessName: 'Anchor Street Coffee',
    categoryGuess: 'Food and drink',
    locationHint: 'Bristol BS1',
    contactName: 'Marta Vane',
    contactEmail: 'marta@anchorstreet.example',
    contactPhone: '+44 117 000 0000',
    source: 'REP_VISIT',
    stage: 'LEAD',
    nextAction: 'Call back after the weekend',
    dueDate: null,
    assignedRepId: 'rep-shebin',
    lostReason: null,
    convertedMerchantId: null,
    lastActivityAt: '2026-07-12T09:00:00.000Z',
    anonymisedAt: null,
    createdAt: '2026-07-10T09:00:00.000Z',
    updatedAt: '2026-07-12T09:00:00.000Z',
    ...overrides,
  }
}

function setLanes(leads: Lead[], extra: Partial<{ isLoading: boolean; isError: boolean; refetch: () => void }> = {}) {
  mockUseLeadsPipeline.mockReturnValue({ leads, isLoading: false, isError: false, refetch: jest.fn(), ...extra })
}
function setTerminal(leads: Lead[], extra: Partial<{ refetch: () => void }> = {}) {
  mockUseTerminalLeads.mockReturnValue({ leads, isLoading: false, isError: false, refetch: jest.fn(), ...extra })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUpdateMutation.isPending = false
  mockUpdateMutation.error = null
  setLanes([])
  setTerminal([])
})

describe('ProspectPipeline capability gate', () => {
  it('shows the denied state (with the role) when canManage is false', () => {
    render(<ProspectPipeline canManage={false} canConvert={false} role="FINANCE" />)
    expect(screen.getByTestId('pipeline-denied')).toHaveTextContent('Pipeline is restricted')
    expect(screen.getByTestId('pipeline-denied')).toHaveTextContent('FINANCE')
    expect(screen.queryByTestId('pipeline-board')).not.toBeInTheDocument()
  })

  it('hides the "Add lead" button when canManage is false', () => {
    render(<ProspectPipeline canManage={false} canConvert={false} role="FINANCE" />)
    expect(screen.queryByTestId('pipeline-add-lead')).not.toBeInTheDocument()
  })

  it('gates the lane read hooks on canManage (enabled:false when denied)', () => {
    render(<ProspectPipeline canManage={false} canConvert={false} role="FINANCE" />)
    expect(mockUseLeadsPipeline).toHaveBeenCalledWith({ enabled: false })
    expect(mockUseTerminalLeads).toHaveBeenCalledWith({ enabled: false })
  })
})

describe('ProspectPipeline board render', () => {
  it('renders the three lanes and places cards in their stage column', () => {
    setLanes([
      makeLead({ id: 'lead-a', businessName: 'Anchor Street Coffee', stage: 'LEAD' }),
      makeLead({ id: 'lead-b', businessName: 'Fern and Fable Books', stage: 'CONTACTED' }),
      makeLead({ id: 'lead-c', businessName: 'Redcliffe Barbers', stage: 'VISIT_BOOKED' }),
    ])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)

    const leadCol = screen.getByTestId('pipeline-column-LEAD')
    const contactedCol = screen.getByTestId('pipeline-column-CONTACTED')
    const visitCol = screen.getByTestId('pipeline-column-VISIT_BOOKED')

    expect(within(leadCol).getByTestId('lead-card-lead-a')).toHaveTextContent('Anchor Street Coffee')
    expect(within(contactedCol).getByTestId('lead-card-lead-b')).toHaveTextContent('Fern and Fable Books')
    expect(within(visitCol).getByTestId('lead-card-lead-c')).toHaveTextContent('Redcliffe Barbers')

    expect(within(leadCol).getByTestId('pipeline-count-LEAD')).toHaveTextContent('1')
  })

  it('renders the category (guess) line and the source chip', () => {
    setLanes([makeLead({ id: 'lead-a', categoryGuess: 'Food and drink', locationHint: 'Bristol BS1', source: 'REP_VISIT' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    const card = screen.getByTestId('lead-card-lead-a')
    expect(card).toHaveTextContent('Food and drink (guess) · Bristol BS1')
    expect(card).toHaveTextContent('Rep visit')
  })

  it('shows the amber "Future intake" chip for a CUSTOMER_REQUEST lead', () => {
    setLanes([makeLead({ id: 'lead-cr', source: 'CUSTOMER_REQUEST' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.getByTestId('lead-card-lead-cr')).toHaveTextContent('Future intake')
  })

  it('renders the honesty note that reflects the true current state', () => {
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    const note = screen.getByTestId('pipeline-honesty-note')
    expect(note).toHaveTextContent('The lead model is live')
    expect(note).toHaveTextContent('Request a merchant')
    expect(note).toHaveTextContent(/requires a reason and is audited/i)
  })
})

describe('ProspectPipeline overdue flagging (client-side)', () => {
  it('flags a lead with a past due date as Overdue', () => {
    setLanes([makeLead({ id: 'lead-od', dueDate: '2020-01-01T00:00:00.000Z' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.getByTestId('lead-overdue-lead-od')).toBeInTheDocument()
  })

  it('does NOT flag a lead with a far-future due date', () => {
    setLanes([makeLead({ id: 'lead-fut', dueDate: '2099-01-01T00:00:00.000Z' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.queryByTestId('lead-overdue-lead-fut')).not.toBeInTheDocument()
  })
})

describe('ProspectPipeline convert gating', () => {
  it('shows the Convert button when canConvert is true', () => {
    setLanes([makeLead({ id: 'lead-a' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.getByTestId('lead-convert-lead-a')).toBeInTheDocument()
  })

  it('HIDES the Convert button when canConvert is false (backend dual gate parity)', () => {
    setLanes([makeLead({ id: 'lead-a' })])
    render(<ProspectPipeline canManage canConvert={false} role="FIELD" />)
    expect(screen.queryByTestId('lead-convert-lead-a')).not.toBeInTheDocument()
    // The other actions are still present (only Convert is dual-gated).
    expect(screen.getByTestId('lead-mark-lost-lead-a')).toBeInTheDocument()
  })
})

describe('ProspectPipeline anonymised treatment', () => {
  it('replaces the contact block with a retention line and hides edit actions', () => {
    setLanes([makeLead({ id: 'lead-anon', anonymisedAt: '2026-01-01T00:00:00.000Z', contactName: 'Marta Vane' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    const card = screen.getByTestId('lead-card-lead-anon')
    expect(within(card).getByTestId('lead-anonymised-lead-anon')).toHaveTextContent('Contact details anonymised (data retention)')
    expect(card).not.toHaveTextContent('Marta Vane')
    expect(screen.queryByTestId('lead-mark-lost-lead-anon')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lead-convert-lead-anon')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lead-move-forward-lead-anon')).not.toBeInTheDocument()
  })
})

describe('ProspectPipeline stage moves', () => {
  it('calls the update mutation with the forward lane when "Move to Contacted" is clicked', () => {
    setLanes([makeLead({ id: 'lead-a', stage: 'LEAD' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    fireEvent.click(screen.getByTestId('lead-move-forward-lead-a'))
    expect(mockUpdateMutate).toHaveBeenCalledWith({ leadId: 'lead-a', input: { stage: 'CONTACTED' } })
  })

  it('offers no forward move on a Visit-booked card, but offers a back move', () => {
    setLanes([makeLead({ id: 'lead-v', stage: 'VISIT_BOOKED' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.queryByTestId('lead-move-forward-lead-v')).not.toBeInTheDocument()
    expect(screen.getByTestId('lead-move-back-lead-v')).toBeInTheDocument()
  })

  it('surfaces a move error in a NamedGateBanner', () => {
    mockUpdateMutation.error = new ApiError(409, { error: { code: 'LEAD_ALREADY_CONVERTED', message: 'Already converted' } })
    setLanes([makeLead({ id: 'lead-a' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('already been converted')
  })
})

describe('ProspectPipeline terminal sections', () => {
  it('renders the Lost section with the reason', () => {
    setTerminal([makeLead({ id: 'lead-lost', businessName: 'Old City Vinyl', stage: 'LOST', lostReason: 'Closed the shop' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    const lost = screen.getByTestId('pipeline-lost-section')
    expect(lost).toHaveTextContent('Old City Vinyl')
    expect(lost).toHaveTextContent('Reason: Closed the shop')
  })

  it('renders the Converted section', () => {
    setTerminal([makeLead({ id: 'lead-conv', businessName: 'The Green Larder', stage: 'CONVERTED', convertedMerchantId: 'm-9' })])
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.getByTestId('pipeline-converted-section')).toHaveTextContent('The Green Larder')
  })
})

describe('ProspectPipeline load / error / empty states', () => {
  it('shows skeleton columns while the board is loading', () => {
    setLanes([], { isLoading: true })
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.getByTestId('pipeline-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('pipeline-board')).not.toBeInTheDocument()
  })

  it('shows the error state with a Try again that refetches both reads', () => {
    const laneRefetch = jest.fn()
    const terminalRefetch = jest.fn()
    setLanes([], { isError: true, refetch: laneRefetch })
    setTerminal([], { refetch: terminalRefetch })
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.getByTestId('pipeline-error')).toHaveTextContent('Could not load the pipeline')
    fireEvent.click(screen.getByTestId('pipeline-retry'))
    expect(laneRefetch).toHaveBeenCalledTimes(1)
    expect(terminalRefetch).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state when there are no live or terminal leads', () => {
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.getByTestId('pipeline-empty')).toHaveTextContent('No prospects yet')
  })
})

describe('ProspectPipeline Add-lead dialog', () => {
  it('opens the Add-lead dialog when the header button is clicked', () => {
    render(<ProspectPipeline canManage canConvert role="FIELD" />)
    expect(screen.queryByTestId('add-lead-dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pipeline-add-lead'))
    expect(screen.getByTestId('add-lead-dialog')).toBeInTheDocument()
  })
})
