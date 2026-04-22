import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('@/features/profile/hooks/useSupportTickets', () => ({
  useSupportTickets: jest.fn().mockReturnValue({ data: { items: [], total: 0 }, isLoading: false }),
  useSupportTicketDetail: jest.fn().mockReturnValue({ data: null, isLoading: false }),
}))

jest.mock('@/features/profile/hooks/useCreateTicket', () => ({
  useCreateTicket: jest.fn().mockReturnValue({ mutate: jest.fn(), isPending: false }),
}))

import { GetHelpModal } from '../components/GetHelpModal'

describe('GetHelpModal', () => {
  it('shows empty state when no tickets', () => {
    render(<GetHelpModal visible={true} onDismiss={jest.fn()} />)
    expect(screen.getByText(/no open tickets/i)).toBeTruthy()
  })

  it('shows new ticket button', () => {
    render(<GetHelpModal visible={true} onDismiss={jest.fn()} />)
    expect(screen.getByText(/new ticket/i)).toBeTruthy()
  })

  it('navigates to new ticket form on button press', () => {
    render(<GetHelpModal visible={true} onDismiss={jest.fn()} />)
    fireEvent.press(screen.getByText(/new ticket/i))
    expect(screen.getByText(/topic/i)).toBeTruthy()
  })
})
