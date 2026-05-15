// Plan 4 M3b follow-up — ViewportLocalityBadge unit tests.

import React from 'react'
import { render } from '@testing-library/react-native'
import { ViewportLocalityBadge } from '@/design-system/components/ViewportLocalityBadge'

describe('ViewportLocalityBadge', () => {
  it('renders "Map centred near {name}" for a valid name', () => {
    const { getByText } = render(<ViewportLocalityBadge localityName="Huddersfield" />)
    expect(getByText('Map centred near Huddersfield')).toBeTruthy()
  })

  it('exposes a matching accessibility label', () => {
    const { getByLabelText } = render(<ViewportLocalityBadge localityName="Brightlingsea" />)
    expect(getByLabelText('Map centred near Brightlingsea')).toBeTruthy()
  })

  it('renders null when localityName is null', () => {
    const { toJSON } = render(<ViewportLocalityBadge localityName={null} />)
    expect(toJSON()).toBeNull()
  })

  it('renders null when localityName is undefined', () => {
    const { toJSON } = render(<ViewportLocalityBadge localityName={undefined} />)
    expect(toJSON()).toBeNull()
  })

  it('renders null when localityName is empty', () => {
    const { toJSON } = render(<ViewportLocalityBadge localityName="" />)
    expect(toJSON()).toBeNull()
  })

  it('renders null when localityName is whitespace only', () => {
    const { toJSON } = render(<ViewportLocalityBadge localityName="   " />)
    expect(toJSON()).toBeNull()
  })
})
