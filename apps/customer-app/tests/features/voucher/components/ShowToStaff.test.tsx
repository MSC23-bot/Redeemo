import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShowToStaff } from '@/features/voucher/components/ShowToStaff'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: {
    getMyRedemptionByCode: jest.fn(),
    postScreenshotFlag: jest.fn().mockResolvedValue({ logged: true }),
  },
}))

jest.mock('expo-brightness', () => ({
  getBrightnessAsync: jest.fn().mockResolvedValue(0.5),
  setBrightnessAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('expo-screen-capture', () => ({
  addScreenshotListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  preventScreenCaptureAsync: jest.fn(),
  allowScreenCaptureAsync: jest.fn(),
}))

const baseProps = {
  visible: true,
  redemptionCode: 'K3F9P7',
  voucherTitle: '2-for-1 Burgers',
  voucherType: 'BOGO' as const,
  merchantName: 'Acme Café',
  branchName: 'Shoreditch',
  customerName: 'Jane Doe',
  redeemedAt: '2026-04-22T13:00:00Z',
  onDone: jest.fn(),
}

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('ShowToStaff', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: false, validatedAt: null, validationMethod: null,
      voucherId: 'v1', merchantName: 'Acme Café', branchName: 'Shoreditch',
    })
  })

  it('renders QR with formatted code and a11y label', async () => {
    const { getByText, getByLabelText } = wrap(<ShowToStaff {...baseProps} />)
    expect(getByText('K3F 9P7')).toBeTruthy()
    expect(getByLabelText('Redemption code. K, 3, F, 9, P, 7.')).toBeTruthy()
  })

  it('renders voucher type badge', () => {
    const { getByText } = wrap(<ShowToStaff {...baseProps} />)
    expect(getByText('BUY ONE GET ONE FREE')).toBeTruthy()
  })

  it('renders LIVE badge', () => {
    const { getByText } = wrap(<ShowToStaff {...baseProps} />)
    expect(getByText('LIVE')).toBeTruthy()
  })

  it('displays live date and time', () => {
    const { getByTestId } = wrap(<ShowToStaff {...baseProps} />)
    expect(getByTestId('live-clock')).toBeTruthy()
  })

  it('renders customer name in info card', () => {
    const { getByText } = wrap(<ShowToStaff {...baseProps} />)
    expect(getByText('Jane Doe')).toBeTruthy()
  })

  it('calls onDone when Done is tapped', () => {
    const onDone = jest.fn()
    const { getByText } = wrap(<ShowToStaff {...baseProps} onDone={onDone} />)
    fireEvent.press(getByText('Done'))
    expect(onDone).toHaveBeenCalled()
  })

  it('does not render when visible is false', () => {
    const { queryByText } = wrap(<ShowToStaff {...baseProps} visible={false} />)
    expect(queryByText('K3F 9P7')).toBeNull()
  })

  it('shows validated state when polling returns isValidated=true', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: true, validatedAt: '2026-04-22T14:00:00Z',
      validationMethod: 'QR_SCAN', voucherId: 'v1', merchantName: 'Acme Café', branchName: 'Shoreditch',
    })

    const { findByText } = wrap(<ShowToStaff {...baseProps} />)
    expect(await findByText(/Validated/i)).toBeTruthy()
  })

  it('auto-dismiss cancels when user taps during validated state', async () => {
    jest.useFakeTimers()
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: true, validatedAt: '2026-04-22T14:00:00Z',
      validationMethod: 'QR_SCAN', voucherId: 'v1', merchantName: 'Acme Café', branchName: 'Shoreditch',
    })
    const onDone = jest.fn()

    const { findByTestId } = wrap(<ShowToStaff {...baseProps} onDone={onDone} />)
    const surface = await findByTestId('validated-surface')
    fireEvent.press(surface)

    jest.advanceTimersByTime(5_000)
    expect(onDone).not.toHaveBeenCalled()
    jest.useRealTimers()
  })
})
