import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))
jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))

import { RedemptionDetailsCard } from '@/features/voucher/components/RedemptionDetailsCard'

function defaults(overrides: Partial<React.ComponentProps<typeof RedemptionDetailsCard>> = {}) {
  return {
    redemptionCode: 'A7K2P9X4',
    redeemedAt: '2026-05-06T14:32:00Z',
    branchName: 'Brightlingsea',
    onShowToStaff: jest.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof RedemptionDetailsCard>
}

describe('RedemptionDetailsCard', () => {
  it('renders the card with all key sections', () => {
    const { getByTestId, getByText } = render(<RedemptionDetailsCard {...defaults()} />)
    expect(getByTestId('redemption-details-card')).toBeTruthy()
    expect(getByText('Redemption Details')).toBeTruthy()
    expect(getByTestId('redemption-details-code')).toBeTruthy()
  })

  it('formats the redemption code as 4+4 with single space', () => {
    const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
    const code = getByTestId('redemption-details-code')
    expect(code.props.children).toBe('A7K2 P9X4')
  })

  it('shows the branch name', () => {
    const { getByText } = render(<RedemptionDetailsCard {...defaults()} />)
    expect(getByText('Brightlingsea')).toBeTruthy()
  })

  it('falls back to em-dash when branch is null', () => {
    const { getByText } = render(<RedemptionDetailsCard {...defaults({ branchName: null })} />)
    expect(getByText('—')).toBeTruthy()
  })

  it('shows formatted date in en-GB locale', () => {
    const { getAllByText } = render(<RedemptionDetailsCard {...defaults()} />)
    // "06 May 2026" appears in the subtitle AND the Date info row.
    const matches = getAllByText(/06 May 2026/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('shows the Show-to-Staff stub button as disabled (M2 stub for M3 QR)', () => {
    const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
    const stub = getByTestId('redemption-details-show-to-staff-stub')
    expect(stub.props.accessibilityState).toEqual({ disabled: true })
  })

  it('Show-to-Staff stub does NOT fire its handler when pressed (disabled)', () => {
    const onShowToStaff = jest.fn()
    const { getByTestId } = render(
      <RedemptionDetailsCard {...defaults({ onShowToStaff })} />,
    )
    fireEvent.press(getByTestId('redemption-details-show-to-staff-stub'))
    // disabled prop stops the press event.
    expect(onShowToStaff).not.toHaveBeenCalled()
  })

  it('stub copy explicitly calls out the next-milestone scope', () => {
    const { getByText } = render(<RedemptionDetailsCard {...defaults()} />)
    expect(getByText(/next milestone/i)).toBeTruthy()
  })

  it('does not render any QR section in M2', () => {
    const { queryByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
    // No QR-shaped testIDs that would indicate M3 QR sneaking into M2.
    expect(queryByTestId('redemption-details-qr')).toBeNull()
    expect(queryByTestId('redemption-details-qr-svg')).toBeNull()
  })
})
