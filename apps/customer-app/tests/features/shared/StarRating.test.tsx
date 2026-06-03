import React from 'react'
import { render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { StarRating } from '@/features/shared/StarRating'

describe('StarRating — Batch 1B type-promote + testID-pinned icon size', () => {
  it('Star icon renders at size=14 (testID-pinned)', () => {
    const { getByTestId } = render(<StarRating rating={4.5} count={12} />)
    // lucide-react-native@1.14 destructures testID off Icon and emits it as
    // `data-testid` on the underlying SVG (web-style, not RN-compatible). We
    // wrap the Star in a View carrying the testID and a numeric `size` prop
    // that mirrors the Star's size, so the plan's intent ("assert size prop
    // directly without coupling to lucide forwardRef internals") is preserved
    // without depending on lucide propagating testID through to RN's SVG.
    expect(getByTestId('star-rating-icon').props.size).toBe(14)
  })

  it('rating Text renders at 13pt Lato-Bold', () => {
    const { getByText } = render(<StarRating rating={4.5} count={12} />)
    const flat = StyleSheet.flatten(getByText('4.5').props.style)
    expect(flat.fontSize).toBe(13)
    expect(flat.fontFamily).toBe('Lato-Bold')
  })

  it('count Text renders at 11pt', () => {
    const { getByText } = render(<StarRating rating={4.5} count={12} />)
    const flat = StyleSheet.flatten(getByText('(12)').props.style)
    expect(flat.fontSize).toBe(11)
  })

  it('rating === null returns null (preserves existing null-guard)', () => {
    const { toJSON } = render(<StarRating rating={null} count={0} />)
    expect(toJSON()).toBeNull()
  })
})
