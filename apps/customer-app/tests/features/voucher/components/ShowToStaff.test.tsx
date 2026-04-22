import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ShowToStaff } from '@/features/voucher/components/ShowToStaff'

describe('ShowToStaff', () => {
  const baseProps = {
    visible: true,
    redemptionCode: 'ABC1234567',
    voucherTitle: 'BOGO Pizza',
    voucherType: 'BOGO' as const,
    merchantName: 'Pizza Palace',
    branchName: 'High Street',
    customerName: 'Shebin C.',
    redeemedAt: '2026-04-17T10:00:00Z',
    onDone: jest.fn(),
  }

  it('renders voucher type badge', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText('BUY ONE GET ONE FREE')).toBeTruthy()
  })

  it('renders redemption code prominently', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText('ABC1234567')).toBeTruthy()
  })

  it('renders LIVE badge', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText('LIVE')).toBeTruthy()
  })

  it('displays live date and time', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    expect(getByTestId('live-clock')).toBeTruthy()
  })

  it('renders customer name in info card', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText('Shebin C.')).toBeTruthy()
  })

  it('calls onDone when Done is tapped', () => {
    const onDone = jest.fn()
    const { getByText } = render(<ShowToStaff {...baseProps} onDone={onDone} />)
    fireEvent.press(getByText('Done'))
    expect(onDone).toHaveBeenCalled()
  })

  it('does not render when visible is false', () => {
    const { queryByText } = render(<ShowToStaff {...baseProps} visible={false} />)
    expect(queryByText('ABC1234567')).toBeNull()
  })
})
