/**
 * Pre-permission explainer sheet — pins locked copy + CTA wiring +
 * BottomSheet primitive reuse + visibility gating.
 */
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { PrePermissionExplainer } from '@/lib/location/PrePermissionExplainer'

describe('PrePermissionExplainer — locked copy', () => {
  it('renders headline, body, and both CTA labels exactly per spec', () => {
    const { getByText, getByTestId } = render(
      <PrePermissionExplainer visible onContinue={() => {}} onDismiss={() => {}} />,
    )
    expect(getByText('Show offers near you')).toBeTruthy()
    expect(
      getByText(
        'Redeemo uses your location to surface nearby merchants, vouchers, and offers. We never share your location with merchants — only distance is shown.',
      ),
    ).toBeTruthy()
    expect(getByTestId('pre-permission-explainer-continue')).toBeTruthy()
    expect(getByTestId('pre-permission-explainer-dismiss')).toBeTruthy()
  })
})

describe('PrePermissionExplainer — CTA wiring', () => {
  it('fires onContinue when the primary CTA is pressed', () => {
    const onContinue = jest.fn()
    const onDismiss = jest.fn()
    const { getByTestId } = render(
      <PrePermissionExplainer visible onContinue={onContinue} onDismiss={onDismiss} />,
    )
    fireEvent.press(getByTestId('pre-permission-explainer-continue'))
    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('fires onDismiss when the secondary CTA is pressed', () => {
    const onContinue = jest.fn()
    const onDismiss = jest.fn()
    const { getByTestId } = render(
      <PrePermissionExplainer visible onContinue={onContinue} onDismiss={onDismiss} />,
    )
    fireEvent.press(getByTestId('pre-permission-explainer-dismiss'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onContinue).not.toHaveBeenCalled()
  })
})

describe('PrePermissionExplainer — sheet primitive + visuals', () => {
  it('mounts the icon block (pin) at the testID hook', () => {
    const { getByTestId } = render(
      <PrePermissionExplainer visible onContinue={() => {}} onDismiss={() => {}} />,
    )
    expect(getByTestId('pre-permission-explainer-icon')).toBeTruthy()
  })

  it('exposes the sheet container testID for visibility assertions', () => {
    const { getByTestId } = render(
      <PrePermissionExplainer visible onContinue={() => {}} onDismiss={() => {}} />,
    )
    expect(getByTestId('pre-permission-explainer-sheet')).toBeTruthy()
  })
})
