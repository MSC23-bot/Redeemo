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
