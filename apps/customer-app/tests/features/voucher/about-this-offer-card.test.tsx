import React from 'react'
import { render } from '@testing-library/react-native'
import { AboutThisOfferCard } from '@/features/voucher/components/AboutThisOfferCard'

describe('AboutThisOfferCard', () => {
  it('renders the description verbatim', () => {
    const description = 'Order any thali plate and get a complimentary coffee. Available all day.'
    const { getByText, getByTestId } = render(<AboutThisOfferCard description={description} />)
    expect(getByTestId('about-this-offer')).toBeTruthy()
    expect(getByText(description)).toBeTruthy()
  })

  it('renders the title "About this offer"', () => {
    const { getByText } = render(<AboutThisOfferCard description="X" />)
    expect(getByText('About this offer')).toBeTruthy()
  })

  it('returns null for empty descriptions (defensive — orchestrator should already guard)', () => {
    const { queryByTestId } = render(<AboutThisOfferCard description="" />)
    expect(queryByTestId('about-this-offer')).toBeNull()
  })

  it('returns null for whitespace-only descriptions', () => {
    // {expression} form so escape sequences are real (JSX string-literal
    // attribute values would treat "\n" as literal backslash-n).
    const { queryByTestId } = render(<AboutThisOfferCard description={'   \n  '} />)
    expect(queryByTestId('about-this-offer')).toBeNull()
  })

  it('trims surrounding whitespace from the rendered body', () => {
    const description = '  Real description.  '
    const { getByTestId } = render(<AboutThisOfferCard description={description} />)
    expect(getByTestId('about-this-offer-body').props.children).toBe('Real description.')
  })

  it('renders long descriptions without truncation', () => {
    const long = 'A'.repeat(800)
    const { getByTestId } = render(<AboutThisOfferCard description={long} />)
    expect(getByTestId('about-this-offer-body').props.children).toBe(long)
  })
})
