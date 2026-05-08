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

  it('Show-to-Staff button is live in M3 (no longer disabled)', () => {
    const { getByTestId, queryByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
    // M2 stub testID is gone — replaced by the live testID.
    expect(queryByTestId('redemption-details-show-to-staff-stub')).toBeNull()
    const button = getByTestId('redemption-details-show-to-staff')
    expect(button.props.accessibilityState?.disabled).toBeFalsy()
  })

  it('Show-to-Staff button fires onShowToStaff when pressed', () => {
    const onShowToStaff = jest.fn()
    const { getByTestId } = render(
      <RedemptionDetailsCard {...defaults({ onShowToStaff })} />,
    )
    fireEvent.press(getByTestId('redemption-details-show-to-staff'))
    expect(onShowToStaff).toHaveBeenCalledTimes(1)
  })

  it('Show-to-Staff button accessibility label drops the next-milestone suffix', () => {
    const { getByLabelText } = render(<RedemptionDetailsCard {...defaults()} />)
    expect(getByLabelText('Show redemption code to staff')).toBeTruthy()
  })

  it('does not render the validated pill by default', () => {
    const { queryByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
    expect(queryByTestId('redemption-details-validated-pill')).toBeNull()
  })

  it('renders the "Validated by staff" pill when isValidated is true', () => {
    const { getByText, getByTestId } = render(
      <RedemptionDetailsCard {...defaults({ isValidated: true })} />,
    )
    expect(getByTestId('redemption-details-validated-pill')).toBeTruthy()
    expect(getByText(/Validated by staff/i)).toBeTruthy()
  })

  it('does not render any QR section in M2/M3 — the QR is owned by ShowToStaff', () => {
    const { queryByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
    // The QR is a property of the full-screen ShowToStaff surface,
    // NOT of the inline card. The card surfaces the code in 4+4 and
    // routes to ShowToStaff via Show-to-Staff button.
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

    it('renders "Saved up to £X" (past tense, post-redemption) for the estimated saving', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults({ estimatedSaving: 2.50 })} />)
      // formatPounds(2.50) → "£2.50". Past-tense copy because the
      // card is shown AFTER redemption — "Save up to" would imply
      // the discount is still pending. Locked 2026-05-07 from device
      // QA.
      const node = getByTestId('redemption-details-saving')
      expect(node.props.children).toEqual(['Saved up to ', '£2.50'])
    })

    it('formats whole pounds without decimals', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults({ estimatedSaving: 5 })} />)
      const node = getByTestId('redemption-details-saving')
      expect(node.props.children).toEqual(['Saved up to ', '£5'])
    })

    it('saving copy is past tense ("Saved", not "Save") so it does NOT regress to pre-redemption wording', () => {
      // Regression pin (locked 2026-05-07 from device QA) — explicit
      // negative assertion catches a future copy edit that
      // accidentally reverts to the present-tense pre-redemption
      // form.
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
      const savingChildren = getByTestId('redemption-details-saving').props.children
      expect(savingChildren[0]).toMatch(/^Saved up to /)
      expect(savingChildren[0]).not.toMatch(/^Save up to /)
    })

    it('renders the "Saved up to" disclaimer copy (past tense)', () => {
      const { getByTestId, getByText } = render(<RedemptionDetailsCard {...defaults()} />)
      expect(getByTestId('redemption-details-saving-disclaimer')).toBeTruthy()
      // Pin the substance of the copy without locking the exact
      // wording — copy may evolve. Both tense and the
      // "actual saving may depend" qualifier must be present.
      expect(
        getByText(/Saved up to.*maximum estimated saving/i),
      ).toBeTruthy()
      expect(getByText(/actual saving may depend/i)).toBeTruthy()
    })

    it('disclaimer uses past tense — does NOT use the pre-redemption "Save up to" form', () => {
      // Mirrors the saving-copy regression pin — the disclaimer
      // must read as a post-redemption explanation, not a
      // pre-redemption claim.
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
      const disclaimer = getByTestId('redemption-details-saving-disclaimer')
      const text = String(disclaimer.props.children ?? '')
      expect(text).toMatch(/Saved up to/)
      expect(text).not.toMatch(/“Save up to”/)
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

  // Presentation-window state machine (locked 2026-05-08, owner direction
  // PR #49). The card surfaces the redemption code + Show-to-Staff button
  // ONLY when both gates pass:
  //   - isPresentationActive = true (≤2h since redemption)
  //   - isValidated = false (staff hasn't verified yet)
  // When either gate fails, the code surface collapses to a tip line
  // pointing at Profile → Redemption History; the rest of the card
  // (header, summary, info rows, disclaimer) stays so the surface still
  // answers "what / where / when".
  describe('presentation-window state machine', () => {
    it('default (isPresentationActive omitted, isValidated false): shows code + Show-to-Staff', () => {
      // Back-compat default — when the prop is unspecified the gate is
      // open. SuccessPopup test fixtures + the in-memory just-redeemed
      // flow rely on this.
      const { getByTestId, queryByTestId } = render(
        <RedemptionDetailsCard {...defaults()} />,
      )
      expect(getByTestId('redemption-details-code')).toBeTruthy()
      expect(getByTestId('redemption-details-show-to-staff')).toBeTruthy()
      expect(queryByTestId('redemption-details-history-tip')).toBeNull()
    })

    it('isPresentationActive=true + !isValidated: shows code + Show-to-Staff (in-window persisted return)', () => {
      const { getByTestId, queryByTestId } = render(
        <RedemptionDetailsCard
          {...defaults({ isPresentationActive: true, isValidated: false })}
        />,
      )
      expect(getByTestId('redemption-details-code')).toBeTruthy()
      expect(getByTestId('redemption-details-show-to-staff')).toBeTruthy()
      expect(queryByTestId('redemption-details-history-tip')).toBeNull()
    })

    it('isPresentationActive=false: hides code, hides Show-to-Staff, shows history tip', () => {
      const { getByTestId, queryByTestId } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      expect(queryByTestId('redemption-details-code')).toBeNull()
      expect(queryByTestId('redemption-details-show-to-staff')).toBeNull()
      expect(getByTestId('redemption-details-history-tip')).toBeTruthy()
    })

    it('isValidated=true (regardless of window): hides code + button, shows tip + validated pill', () => {
      // Validation is terminal — once staff has scanned, the user no
      // longer needs the code re-exposed even if they're inside the
      // 2h window.
      const { getByTestId, queryByTestId } = render(
        <RedemptionDetailsCard
          {...defaults({ isPresentationActive: true, isValidated: true })}
        />,
      )
      expect(queryByTestId('redemption-details-code')).toBeNull()
      expect(queryByTestId('redemption-details-show-to-staff')).toBeNull()
      expect(getByTestId('redemption-details-history-tip')).toBeTruthy()
      expect(getByTestId('redemption-details-validated-pill')).toBeTruthy()
    })

    it('history tip copy points to Profile → Redemption History', () => {
      const { getByText } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      expect(
        getByText(/find this code in Profile → Redemption History/i),
      ).toBeTruthy()
    })

    it('non-sensitive details remain when window expired (header / summary / info rows / disclaimer)', () => {
      // The card still answers "what was used, where, when" even with
      // the code surface collapsed. Critical for the "I redeemed
      // something hours ago, what was it?" return-visit case.
      const { getByText, getByTestId } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      // Header
      expect(getByText('Redemption Details')).toBeTruthy()
      // Voucher summary block
      expect(getByTestId('redemption-details-summary')).toBeTruthy()
      expect(getByTestId('redemption-details-title')).toBeTruthy()
      expect(getByTestId('redemption-details-merchant')).toBeTruthy()
      // Branch / date / time info row (one of three)
      expect(getByText('Brightlingsea')).toBeTruthy()
      // Saving disclaimer
      expect(getByTestId('redemption-details-saving-disclaimer')).toBeTruthy()
    })

    it('Show-to-Staff is also hidden under a press-attempt fallback (regression pin)', () => {
      // Belt-and-braces: if a future refactor reintroduces the button
      // without re-evaluating the gate, this test will fail because
      // there's no testID to press.
      const { queryByTestId } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      expect(queryByTestId('redemption-details-show-to-staff')).toBeNull()
    })
  })
})
