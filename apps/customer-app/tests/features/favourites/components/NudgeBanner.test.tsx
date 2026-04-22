import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { NudgeBanner } from '@/features/favourites/components/NudgeBanner'

describe('NudgeBanner', () => {
  it('renders subscribe prompt text', () => {
    const { getByText } = render(
      <NudgeBanner onSubscribe={jest.fn()} onDismiss={jest.fn()} />,
    )
    expect(getByText(/Subscribe to redeem/)).toBeTruthy()
  })

  it('calls onSubscribe when banner is tapped', () => {
    const onSubscribe = jest.fn()
    const { getByRole } = render(
      <NudgeBanner onSubscribe={onSubscribe} onDismiss={jest.fn()} />,
    )
    fireEvent.press(getByRole('button'))
    expect(onSubscribe).toHaveBeenCalled()
  })

  it('calls onDismiss when X is tapped', () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = render(
      <NudgeBanner onSubscribe={jest.fn()} onDismiss={onDismiss} />,
    )
    fireEvent.press(getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalled()
  })
})
