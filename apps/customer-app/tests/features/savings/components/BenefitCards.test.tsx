import React from 'react'
import { render } from '@testing-library/react-native'
import { BenefitCards } from '@/features/savings/components/BenefitCards'

describe('BenefitCards', () => {
  it('renders 4 cards for "free" variant (includes Cancel-anytime card)', () => {
    const { getByTestId, queryByTestId } = render(<BenefitCards variant="free" />)
    expect(getByTestId('savings-benefit-cards-free')).toBeTruthy()
    expect(getByTestId('savings-benefit-card-location')).toBeTruthy()
    expect(getByTestId('savings-benefit-card-redeem')).toBeTruthy()
    expect(getByTestId('savings-benefit-card-roi')).toBeTruthy()
    expect(getByTestId('savings-benefit-card-cancel')).toBeTruthy()
    expect(queryByTestId('savings-benefit-cards-subscriber-empty')).toBeNull()
  })

  it('renders 3 cards for "subscriber-empty" variant (drops Cancel-anytime card)', () => {
    const { getByTestId, queryByTestId } = render(<BenefitCards variant="subscriber-empty" />)
    expect(getByTestId('savings-benefit-cards-subscriber-empty')).toBeTruthy()
    expect(getByTestId('savings-benefit-card-location')).toBeTruthy()
    expect(getByTestId('savings-benefit-card-redeem')).toBeTruthy()
    expect(getByTestId('savings-benefit-card-roi')).toBeTruthy()
    expect(queryByTestId('savings-benefit-card-cancel')).toBeNull()
  })
})
