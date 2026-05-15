// Plan 4 M3b follow-up — LocalityCaption unit tests.

import React from 'react'
import { render } from '@testing-library/react-native'
import { LocalityCaption } from '@/design-system/components/LocalityCaption'

describe('LocalityCaption', () => {
  it('renders the prefixed line for a valid locality name', () => {
    const { getByText } = render(<LocalityCaption localityName="Huddersfield" />)
    expect(getByText('Showing results near Huddersfield')).toBeTruthy()
  })

  it('renders null when localityName is null', () => {
    const { toJSON } = render(<LocalityCaption localityName={null} />)
    expect(toJSON()).toBeNull()
  })

  it('renders null when localityName is undefined', () => {
    const { toJSON } = render(<LocalityCaption localityName={undefined} />)
    expect(toJSON()).toBeNull()
  })

  it('renders null when localityName is an empty string', () => {
    const { toJSON } = render(<LocalityCaption localityName="" />)
    expect(toJSON()).toBeNull()
  })

  it('renders null when localityName is whitespace only', () => {
    const { toJSON } = render(<LocalityCaption localityName="   " />)
    expect(toJSON()).toBeNull()
  })
})
