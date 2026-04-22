import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { PinEntrySheet } from '@/features/voucher/components/PinEntrySheet'

describe('PinEntrySheet', () => {
  const baseProps = {
    visible: true,
    onDismiss: jest.fn(),
    onSubmit: jest.fn(),
    merchantName: 'Pizza Palace',
    merchantLogo: null,
    branchName: 'High Street',
    isLoading: false,
    error: null as { code: string; attemptsRemaining?: number } | null,
    lockoutSeconds: 0,
  }

  it('renders merchant info and PIN title', () => {
    const { getAllByText, getByText } = render(<PinEntrySheet {...baseProps} />)
    expect(getAllByText('Pizza Palace').length).toBeGreaterThanOrEqual(1)
    expect(getByText('Enter Branch PIN')).toBeTruthy()
  })

  it('renders instruction text with merchant name bolded', () => {
    const { getByText } = render(<PinEntrySheet {...baseProps} />)
    expect(getByText(/Ask a staff member/)).toBeTruthy()
  })

  it('renders 4 PIN boxes', () => {
    const { getAllByLabelText } = render(<PinEntrySheet {...baseProps} />)
    const boxes = getAllByLabelText(/PIN digit/)
    expect(boxes).toHaveLength(4)
  })

  it('renders disclaimer banner', () => {
    const { getByText } = render(<PinEntrySheet {...baseProps} />)
    expect(getByText(/Entering the correct PIN/)).toBeTruthy()
  })

  it('renders disabled redeem button when no PIN entered', () => {
    const { getByText } = render(<PinEntrySheet {...baseProps} />)
    expect(getByText('Redeem Voucher')).toBeTruthy()
  })

  it('shows error state with wrong PIN', () => {
    const { getByText } = render(
      <PinEntrySheet {...baseProps} error={{ code: 'INVALID_PIN', attemptsRemaining: 3 }} />,
    )
    expect(getByText('Incorrect PIN')).toBeTruthy()
    expect(getByText(/3 attempts remaining/)).toBeTruthy()
  })

  it('shows lockout state', () => {
    const { getByText } = render(
      <PinEntrySheet {...baseProps} lockoutSeconds={734} />,
    )
    expect(getByText('Too Many Attempts')).toBeTruthy()
  })
})
