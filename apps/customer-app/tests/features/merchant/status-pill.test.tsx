import React from 'react'
import { render } from '@testing-library/react-native'
import { StatusPill } from '@/features/merchant/components/StatusPill'

describe('StatusPill', () => {
  it('renders Open with green tint', () => {
    const { getByText, getByLabelText } = render(<StatusPill state="open" label="Open" />)
    expect(getByText('Open')).toBeTruthy()
    expect(getByLabelText('Status: Open')).toBeTruthy()
  })

  it('renders Closing soon with amber tint', () => {
    const { getByText, getByLabelText } = render(<StatusPill state="closing-soon" label="Closing soon" />)
    expect(getByText('Closing soon')).toBeTruthy()
    expect(getByLabelText('Status: Closing soon')).toBeTruthy()
  })

  it('renders Closed with red tint', () => {
    const { getByText, getByLabelText } = render(<StatusPill state="closed" label="Closed" />)
    expect(getByText('Closed')).toBeTruthy()
    expect(getByLabelText('Status: Closed')).toBeTruthy()
  })
})
