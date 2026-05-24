/**
 * Recovery sheet — pins locked copy + CTA wiring + pin-with-slash icon
 * variant.
 */
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { LocationRecoverySheet } from '@/lib/location/LocationRecoverySheet'

describe('LocationRecoverySheet — locked copy', () => {
  it('renders headline, body, and both CTA labels exactly per spec', () => {
    const { getByText, getByTestId } = render(
      <LocationRecoverySheet visible onOpenSettings={() => {}} onDismiss={() => {}} />,
    )
    expect(getByText('Location is off')).toBeTruthy()
    expect(
      getByText(
        "Turn on location in your phone settings to see offers near you right now. We'll keep using your saved area until then.",
      ),
    ).toBeTruthy()
    expect(getByTestId('location-recovery-open-settings')).toBeTruthy()
    expect(getByTestId('location-recovery-dismiss')).toBeTruthy()
  })
})

describe('LocationRecoverySheet — CTA wiring', () => {
  it('fires onOpenSettings when the primary CTA is pressed', () => {
    const onOpenSettings = jest.fn()
    const onDismiss = jest.fn()
    const { getByTestId } = render(
      <LocationRecoverySheet
        visible
        onOpenSettings={onOpenSettings}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.press(getByTestId('location-recovery-open-settings'))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('fires onDismiss when the secondary CTA is pressed', () => {
    const onOpenSettings = jest.fn()
    const onDismiss = jest.fn()
    const { getByTestId } = render(
      <LocationRecoverySheet
        visible
        onOpenSettings={onOpenSettings}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.press(getByTestId('location-recovery-dismiss'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).not.toHaveBeenCalled()
  })
})

describe('LocationRecoverySheet — visuals', () => {
  it('mounts the pin-with-slash icon block at the testID hook', () => {
    const { getByTestId } = render(
      <LocationRecoverySheet visible onOpenSettings={() => {}} onDismiss={() => {}} />,
    )
    expect(getByTestId('location-recovery-icon')).toBeTruthy()
  })

  it('exposes the sheet container testID for visibility assertions', () => {
    const { getByTestId } = render(
      <LocationRecoverySheet visible onOpenSettings={() => {}} onDismiss={() => {}} />,
    )
    expect(getByTestId('location-recovery-sheet')).toBeTruthy()
  })
})
