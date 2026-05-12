import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HowItWorks } from '@/features/voucher/components/HowItWorks'

// M4d Phase E / Task E.1 — spec D9 lock:
// TIME_LIMITED users see one additional step "Check the Window"
// inserted at position 1 (between the first orientation step and the
// shared "Tell Staff First" step). Non-TL users keep the existing
// 5-step list.
//
// NOTE: the `how-it-works-steps` container also renders a sibling
// "connector" line View as its first child (decorative vertical
// timeline). So `container.children.length === stepCount + 1`. We
// subtract 1 in the assertions to keep the test about step count,
// not internal layout structure.

const stepCountOf = (container: { children: readonly unknown[] }) =>
  container.children.length - 1 // subtract decorative connector View

describe('HowItWorks — step count by subscription + voucher type (M4d D9)', () => {
  it('subscribed + non-TL: 5 steps', () => {
    const { getByTestId } = render(
      <HowItWorks isSubscribed={true} voucherType="BOGO" />,
    )
    // Subscribed defaults to collapsed; expand to access the steps container.
    fireEvent.press(getByTestId('how-it-works-toggle'))
    const steps = getByTestId('how-it-works-steps')
    expect(stepCountOf(steps)).toBe(5)
  })

  it('subscribed + TIME_LIMITED: 6 steps with "Check the Window" at index 1', () => {
    const { getByTestId, getByText } = render(
      <HowItWorks isSubscribed={true} voucherType="TIME_LIMITED" />,
    )
    fireEvent.press(getByTestId('how-it-works-toggle'))
    expect(stepCountOf(getByTestId('how-it-works-steps'))).toBe(6)
    expect(getByText('Check the Window')).toBeTruthy()
  })

  it('free + non-TL: 5 steps', () => {
    const { getByTestId } = render(
      <HowItWorks isSubscribed={false} voucherType="BOGO" />,
    )
    // Free defaults to expanded — steps directly accessible.
    expect(stepCountOf(getByTestId('how-it-works-steps'))).toBe(5)
  })

  it('free + TIME_LIMITED: 6 steps with Subscribe → Check Window → standard 4', () => {
    const { getByTestId, getByText } = render(
      <HowItWorks isSubscribed={false} voucherType="TIME_LIMITED" />,
    )
    expect(stepCountOf(getByTestId('how-it-works-steps'))).toBe(6)
    expect(getByText('Subscribe to Unlock')).toBeTruthy()
    expect(getByText('Check the Window')).toBeTruthy()
  })

  it('TL subscribed: Check the Window step body contains the locked copy', () => {
    const { getByTestId, getByText } = render(
      <HowItWorks isSubscribed={true} voucherType="TIME_LIMITED" />,
    )
    fireEvent.press(getByTestId('how-it-works-toggle'))
    expect(
      getByText(/Make sure the voucher is available before ordering/),
    ).toBeTruthy()
    expect(
      getByText(
        /Time-limited offers can only be redeemed during the days and hours shown above/,
      ),
    ).toBeTruthy()
  })

  // M5 Task 10 — REUSABLE-specific HowItWorks step.
  it('subscribed + REUSABLE: 6 steps with "Use it again" at index 1', () => {
    const { getByTestId, getByText } = render(
      <HowItWorks isSubscribed={true} voucherType="REUSABLE" />,
    )
    fireEvent.press(getByTestId('how-it-works-toggle'))
    expect(stepCountOf(getByTestId('how-it-works-steps'))).toBe(6)
    expect(getByText('Use it again')).toBeTruthy()
  })

  it('free + REUSABLE: 6 steps with Subscribe → Use it again → standard 4', () => {
    const { getByTestId, getByText } = render(
      <HowItWorks isSubscribed={false} voucherType="REUSABLE" />,
    )
    expect(stepCountOf(getByTestId('how-it-works-steps'))).toBe(6)
    expect(getByText('Subscribe to Unlock')).toBeTruthy()
    expect(getByText('Use it again')).toBeTruthy()
  })

  it('REUSABLE subscribed: "Use it again" step body contains the locked copy', () => {
    const { getByTestId, getByText } = render(
      <HowItWorks isSubscribed={true} voucherType="REUSABLE" />,
    )
    fireEvent.press(getByTestId('how-it-works-toggle'))
    expect(
      getByText(
        /After you redeem this voucher, it becomes available again after a short time/,
      ),
    ).toBeTruthy()
    expect(getByText(/The exact timing depends on the offer/)).toBeTruthy()
  })

  it('REUSABLE + TL are mutually exclusive — REUSABLE shows "Use it again" NOT "Check the Window"', () => {
    const { getByTestId, getByText, queryByText } = render(
      <HowItWorks isSubscribed={true} voucherType="REUSABLE" />,
    )
    fireEvent.press(getByTestId('how-it-works-toggle'))
    expect(getByText('Use it again')).toBeTruthy()
    expect(queryByText('Check the Window')).toBeNull()
  })
})
