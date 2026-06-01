import React from 'react'
import { Text, StyleSheet } from 'react-native'
import { render } from '@testing-library/react-native'
import { SectionBand } from '@/features/home/components/SectionBand'

describe('SectionBand (Batch 2 — Composition B identity bands)', () => {
  it('renders its children inside the band', () => {
    const { getByText } = render(
      <SectionBand variant="cream" testID="band"><Text>inside</Text></SectionBand>,
    )
    expect(getByText('inside')).toBeTruthy()
  })

  it('cream variant (Featured §9.4) has NO hairline border', () => {
    const { getByTestId } = render(
      <SectionBand variant="cream" testID="band"><Text>x</Text></SectionBand>,
    )
    const flat = StyleSheet.flatten(getByTestId('band').props.style)
    expect(flat.borderTopWidth).toBeFalsy()
    expect(flat.borderBottomWidth).toBeFalsy()
  })

  it('warm variant (Popular/Trending §9.5) has a brand-coral hairline top + bottom', () => {
    const { getByTestId } = render(
      <SectionBand variant="warm" testID="band"><Text>x</Text></SectionBand>,
    )
    const flat = StyleSheet.flatten(getByTestId('band').props.style)
    expect(flat.borderTopWidth).toBe(StyleSheet.hairlineWidth)
    expect(flat.borderBottomWidth).toBe(StyleSheet.hairlineWidth)
    expect(flat.borderColor).toBe('rgba(232, 74, 0, 0.18)')
  })
})
