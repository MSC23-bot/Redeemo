import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))
jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))

import { SuccessPopup } from '@/features/voucher/components/SuccessPopup'

function defaults(overrides: Partial<React.ComponentProps<typeof SuccessPopup>> = {}) {
  return {
    visible: true,
    redemptionCode: 'A7K2P9X4',
    redeemedAt: '2026-05-06T14:32:00Z',
    voucherTitle: 'Free Filter Coffee with Any Thali',
    voucherType: 'FREEBIE' as const,
    merchantName: 'Covelum Restaurant',
    branchName: 'Brightlingsea',
    onShowToStaff: jest.fn(),
    onRateReview: jest.fn(),
    onDone: jest.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof SuccessPopup>
}

describe('SuccessPopup — render + content', () => {
  it('renders nothing when visible=false', () => {
    const { queryByTestId } = render(<SuccessPopup {...defaults({ visible: false })} />)
    expect(queryByTestId('success-popup')).toBeNull()
  })

  it('renders the popup when visible', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-popup')).toBeTruthy()
    expect(getByTestId('success-popup-scrim')).toBeTruthy()
    expect(getByTestId('success-check-ring')).toBeTruthy()
  })

  it('formats the redemption code as 4+4 with a single space', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    const code = getByTestId('success-code')
    expect(code.props.children).toBe('A7K2 P9X4')
  })

  it('shows the voucher title + merchant name in the strip', () => {
    const { getByText } = render(<SuccessPopup {...defaults()} />)
    expect(getByText('Free Filter Coffee with Any Thali')).toBeTruthy()
    expect(getByText('Covelum Restaurant')).toBeTruthy()
  })

  it('uses the per-voucher-type label (FREEBIE → "Freebie")', () => {
    const { getByText } = render(<SuccessPopup {...defaults({ voucherType: 'FREEBIE' })} />)
    // The label is "Freebie"; CSS upper-cases at render time but the
    // rendered string is the original-case label.
    expect(getByText('Freebie')).toBeTruthy()
  })

  it('uses BOGO label for BOGO vouchers', () => {
    const { getByText } = render(<SuccessPopup {...defaults({ voucherType: 'BOGO' })} />)
    expect(getByText('BOGO')).toBeTruthy()
  })

  it('shows formatted date + time', () => {
    const { getByText } = render(<SuccessPopup {...defaults()} />)
    // 2026-05-06 → "06 May 2026" (en-GB)
    expect(getByText(/06 May 2026/)).toBeTruthy()
  })

  it('shows branch name', () => {
    const { getByText } = render(<SuccessPopup {...defaults()} />)
    expect(getByText('Brightlingsea')).toBeTruthy()
  })

  it('falls back to em-dash when branch name is null', () => {
    const { getByText } = render(<SuccessPopup {...defaults({ branchName: null })} />)
    expect(getByText('—')).toBeTruthy()
  })
})

describe('SuccessPopup — three CTAs', () => {
  it('Show to Staff fires onShowToStaff', () => {
    const onShowToStaff = jest.fn()
    const { getByTestId } = render(<SuccessPopup {...defaults({ onShowToStaff })} />)
    fireEvent.press(getByTestId('success-show-to-staff'))
    expect(onShowToStaff).toHaveBeenCalledTimes(1)
  })

  it('Rate & Review fires onRateReview', () => {
    const onRateReview = jest.fn()
    const { getByTestId } = render(<SuccessPopup {...defaults({ onRateReview })} />)
    fireEvent.press(getByTestId('success-rate-review'))
    expect(onRateReview).toHaveBeenCalledTimes(1)
  })

  it('Done fires onDone', () => {
    const onDone = jest.fn()
    const { getByTestId } = render(<SuccessPopup {...defaults({ onDone })} />)
    fireEvent.press(getByTestId('success-done'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('CTAs do not fire each other (independent handlers)', () => {
    const onShowToStaff = jest.fn()
    const onRateReview = jest.fn()
    const onDone = jest.fn()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onShowToStaff, onRateReview, onDone })} />,
    )
    fireEvent.press(getByTestId('success-show-to-staff'))
    expect(onShowToStaff).toHaveBeenCalledTimes(1)
    expect(onRateReview).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('SuccessPopup — focus-loss persistence (parent-controlled)', () => {
  it('stays mounted across rerender with same visible=true (no internal hide on focus)', () => {
    const { getByTestId, rerender } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-popup')).toBeTruthy()
    // Simulate a parent rerender (e.g. focus event from useFocusEffect).
    rerender(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-popup')).toBeTruthy()
  })
})
