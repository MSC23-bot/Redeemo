import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MerchantRow } from '@/features/voucher/components/MerchantRow'

// Pin: the `disableChangeBranch` prop must hide the "Change ▾" pill
// AND prevent the Pressable from firing onChangeBranch — both on the
// same render. Locked 2026-05-07 from device QA — a redeemed-this-
// cycle user could otherwise tap the pill, open BranchPickerSheet,
// confirm, and be routed to a PinEntrySheet that was guaranteed to
// fail with ALREADY_REDEEMED.

const baseProps = {
  merchantName:         'Covelum',
  merchantLogoUrl:      null,
  merchantDescriptor:   'Indian Restaurant',
  branchName:           'Brightlingsea',
  branchDistanceMeters: 1500,
  isMultiBranch:        true,
}

describe('MerchantRow — disableChangeBranch', () => {
  it('multi-branch + NOT disabled: renders the "Change ▾" pill + fires onChangeBranch on press', () => {
    const onChangeBranch = jest.fn()
    const { getByLabelText } = render(
      <MerchantRow {...baseProps} onChangeBranch={onChangeBranch} />,
    )
    const pill = getByLabelText('Change ▾')
    expect(pill).toBeTruthy()
    // The whole branch row is the Pressable; we can find it by its
    // accessibilityLabel which mentions "tap to change branch".
    fireEvent.press(getByLabelText(/Tap to change branch/))
    expect(onChangeBranch).toHaveBeenCalled()
  })

  it('multi-branch + DISABLED: hides the "Change ▾" pill', () => {
    const onChangeBranch = jest.fn()
    const { queryByLabelText } = render(
      <MerchantRow
        {...baseProps}
        disableChangeBranch
        onChangeBranch={onChangeBranch}
      />,
    )
    expect(queryByLabelText('Change ▾')).toBeNull()
  })

  it('multi-branch + DISABLED: branch row Pressable does NOT fire onChangeBranch on press', () => {
    const onChangeBranch = jest.fn()
    const { getByLabelText } = render(
      <MerchantRow
        {...baseProps}
        disableChangeBranch
        onChangeBranch={onChangeBranch}
      />,
    )
    // accessibilityLabel collapses to "Redeem at <branch>" (no
    // "tap to change branch" suffix) when disabled.
    fireEvent.press(getByLabelText('Redeem at Brightlingsea'))
    expect(onChangeBranch).not.toHaveBeenCalled()
  })

  it('multi-branch + DISABLED: accessibilityRole flips from button → text', () => {
    const { getByLabelText } = render(
      <MerchantRow {...baseProps} disableChangeBranch onChangeBranch={jest.fn()} />,
    )
    const row = getByLabelText('Redeem at Brightlingsea')
    expect(row.props.accessibilityRole).toBe('text')
  })

  it('single-branch (isMultiBranch=false): "Change ▾" pill never renders even without disableChangeBranch', () => {
    const { queryByLabelText } = render(
      <MerchantRow
        {...baseProps}
        isMultiBranch={false}
        onChangeBranch={jest.fn()}
      />,
    )
    expect(queryByLabelText('Change ▾')).toBeNull()
  })
})

// Locked 2026-05-07 from device QA. The MerchantRow eyebrow + branch
// line must reflect WHAT THE USER CAN DO, not just what branch the
// orchestrator happens to know about. Three modes:
//   • 'redeem'           — active redeemable voucher.
//   • 'redeemed-known'   — redeemed-this-cycle, parent passed the
//                          actual redemption branch.
//   • 'redeemed-unknown' — redeemed-this-cycle, parent has no
//                          persisted redemption branch (M2 reality).
// Critical invariant: 'redeemed-unknown' must NEVER render "REDEEM AT"
// or any branch name (passed branchName could be misleading — it's
// the URL/selectedBranch fallback, not the redemption branch).

describe('MerchantRow — mode prop (redeem / redeemed-known / redeemed-unknown)', () => {
  it('default mode renders "REDEEM AT" eyebrow + branch line + Change pill (active redeemable)', () => {
    const { getByText, getByTestId, getByLabelText } = render(
      <MerchantRow {...baseProps} onChangeBranch={jest.fn()} />,
    )
    expect(getByText('REDEEM AT')).toBeTruthy()
    expect(getByTestId('redeem-at-line')).toBeTruthy()
    // The Change ▾ pill is interactive in default 'redeem' mode.
    expect(getByLabelText('Change ▾')).toBeTruthy()
  })

  it("mode='redeemed-known' renders 'REDEEMED AT' eyebrow + branch line, no 'REDEEM AT', no Change pill", () => {
    const onChangeBranch = jest.fn()
    const { getByText, getByTestId, queryByText, queryByLabelText } = render(
      <MerchantRow
        {...baseProps}
        mode="redeemed-known"
        onChangeBranch={onChangeBranch}
      />,
    )
    expect(getByText('REDEEMED AT')).toBeTruthy()
    // Branch name still rendered (parent passed the actual
    // redemption branch). The branchName + distance share a parent
    // Text node so matching by regex is the right shape here.
    expect(getByText(/Brightlingsea/)).toBeTruthy()
    expect(getByTestId('redeemed-at-line')).toBeTruthy()
    // Critical: NO "REDEEM AT" eyebrow.
    expect(queryByText('REDEEM AT')).toBeNull()
    // Change ▾ pill hidden — voucher's redeemed, can't reopen flow.
    expect(queryByLabelText('Change ▾')).toBeNull()
  })

  it("mode='redeemed-unknown' renders 'REDEEMED THIS CYCLE' eyebrow + NO branch line + no Change pill", () => {
    const onChangeBranch = jest.fn()
    const { getByText, queryByText, queryByTestId, queryByLabelText } = render(
      <MerchantRow
        {...baseProps}
        mode="redeemed-unknown"
        onChangeBranch={onChangeBranch}
      />,
    )
    expect(getByText('REDEEMED THIS CYCLE')).toBeTruthy()
    // Critical invariants:
    //   - NO "REDEEM AT" eyebrow.
    //   - NO branch name (passed branchName='Brightlingsea' COULD
    //     be misleading on return-visit; the row hides it).
    //   - NO Change pill.
    //   - NO redeem-at-line / redeemed-at-line testIDs.
    expect(queryByText('REDEEM AT')).toBeNull()
    expect(queryByText(/Brightlingsea/)).toBeNull()
    expect(queryByTestId('redeem-at-line')).toBeNull()
    expect(queryByTestId('redeemed-at-line')).toBeNull()
    expect(queryByLabelText('Change ▾')).toBeNull()
  })

  it("mode='redeemed-known' tap on branch row does NOT fire onChangeBranch (mode overrides interactivity)", () => {
    const onChangeBranch = jest.fn()
    const { getByLabelText } = render(
      <MerchantRow
        {...baseProps}
        mode="redeemed-known"
        onChangeBranch={onChangeBranch}
      />,
    )
    fireEvent.press(getByLabelText('Redeemed at Brightlingsea'))
    expect(onChangeBranch).not.toHaveBeenCalled()
  })
})
