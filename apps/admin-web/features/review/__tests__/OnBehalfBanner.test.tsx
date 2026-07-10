/**
 * OnBehalfBanner + ReadOnlyTag — the shared "Read only" tag + on-behalf
 * shield banner building blocks (B2 per-type review body alignment).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { OnBehalfBanner, ReadOnlyTag } from '../OnBehalfBanner'

describe('ReadOnlyTag', () => {
  it('renders the "Read only" label', () => {
    render(<ReadOnlyTag />)
    expect(screen.getByTestId('read-only-tag')).toHaveTextContent('Read only')
  })
})

describe('OnBehalfBanner', () => {
  it('renders its children as the banner copy', () => {
    render(<OnBehalfBanner>Acting on behalf of the merchant.</OnBehalfBanner>)
    expect(screen.getByTestId('on-behalf-banner')).toHaveTextContent(
      'Acting on behalf of the merchant.'
    )
  })
})
