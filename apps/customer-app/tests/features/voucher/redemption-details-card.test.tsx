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
    voucherType: 'FREEBIE' as const,
    voucherTitle: 'Free Filter Coffee with Any Thali',
    merchantName: 'Covelum Restaurant',
    estimatedSaving: 2.50,
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

  // Voucher summary block (locked 2026-05-07 from device QA). The
  // card identifies exactly what was redeemed via merchant + type +
  // title + "Save up to" amount, so the customer/staff don't have
  // to scan the rest of the page.

  describe('voucher summary block', () => {
    it('renders the voucher type label uppercased', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults({ voucherType: 'FREEBIE' })} />)
      // FREEBIE → "Freebie" → uppercase "FREEBIE".
      expect(getByTestId('redemption-details-type').props.children).toBe('FREEBIE')
    })

    it('renders BOGO type as uppercased "BUY ONE, GET ONE FREE"', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults({ voucherType: 'BOGO' })} />)
      expect(getByTestId('redemption-details-type').props.children).toBe('BUY ONE, GET ONE FREE')
    })

    it('renders the voucher title', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
      expect(getByTestId('redemption-details-title').props.children).toBe('Free Filter Coffee with Any Thali')
    })

    it('renders the merchant name', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
      expect(getByTestId('redemption-details-merchant').props.children).toBe('Covelum Restaurant')
    })

    it('renders "Save up to £X" for the estimated saving', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults({ estimatedSaving: 2.50 })} />)
      // formatPounds(2.50) → "£2.50"
      const node = getByTestId('redemption-details-saving')
      expect(node.props.children).toEqual(['Save up to ', '£2.50'])
    })

    it('formats whole pounds without decimals', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults({ estimatedSaving: 5 })} />)
      const node = getByTestId('redemption-details-saving')
      expect(node.props.children).toEqual(['Save up to ', '£5'])
    })

    it('renders the "Save up to" disclaimer copy', () => {
      const { getByTestId, getByText } = render(<RedemptionDetailsCard {...defaults()} />)
      expect(getByTestId('redemption-details-saving-disclaimer')).toBeTruthy()
      // Pin the substance of the copy without locking the exact
      // wording — copy may evolve.
      expect(
        getByText(/Save up to.*maximum estimated saving/i),
      ).toBeTruthy()
      expect(getByText(/actual saving may depend/i)).toBeTruthy()
    })

    it('summary block renders BEFORE the redemption code in the rendered tree', () => {
      // Eye should land on "what was redeemed" before "what's the
      // code". The summary box has a lower DOM index than the code
      // box.
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
      const card = getByTestId('redemption-details-card')
      const ids = card
        .findAll((el: any) => typeof el.props?.testID === 'string')
        .map((el: any) => el.props.testID as string)
      const summaryIdx = ids.indexOf('redemption-details-summary')
      const codeIdx = ids.indexOf('redemption-details-code')
      expect(summaryIdx).toBeGreaterThanOrEqual(0)
      expect(codeIdx).toBeGreaterThan(summaryIdx)
    })
  })
})
