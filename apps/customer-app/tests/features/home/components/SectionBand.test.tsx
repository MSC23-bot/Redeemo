import React from 'react'
import { Text, StyleSheet } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import { SectionBand } from '@/features/home/components/SectionBand'

describe('SectionBand (Batch 2 — Composition B identity bands)', () => {
  it('renders its children inside the band', () => {
    const { getByText } = render(
      <SectionBand variant="cream" testID="band"><Text>inside</Text></SectionBand>,
    )
    expect(getByText('inside')).toBeTruthy()
  })

  it('cream variant (Featured) is the deepest warm zone with a defining hairline', () => {
    const { getByTestId } = render(
      <SectionBand variant="cream" testID="band"><Text>x</Text></SectionBand>,
    )
    const flat = StyleSheet.flatten(getByTestId('band').props.style)
    // 2026-06-03 background system — both bands now go DEEPER than the body and
    // carry a soft hairline. Featured is the deepest zone, faint brand-rose hairline.
    expect(flat.backgroundColor).toBe('#F6ECE0')
    expect(flat.borderTopWidth).toBe(StyleSheet.hairlineWidth)
    expect(flat.borderBottomWidth).toBe(StyleSheet.hairlineWidth)
    expect(flat.borderColor).toBe('rgba(226, 12, 4, 0.10)')
  })

  it('warm variant (Popular/Trending) uses the brand rose→coral gradient base + glow', () => {
    // 2026-06-03 — built from the REAL brand colours (DESIGN.md §Primary): a
    // brand rose→coral gradient (light shades) via expo-linear-gradient that
    // renders immediately, plus a brand rose→coral radial glow (Svg) once laid out.
    const { getByTestId, queryByTestId } = render(
      <SectionBand variant="warm" testID="band"><Text>x</Text></SectionBand>,
    )
    const band = getByTestId('band')
    const flat = StyleSheet.flatten(band.props.style)
    expect(flat.backgroundColor).toBe('#FEF6F0')
    expect(flat.borderTopWidth).toBe(StyleSheet.hairlineWidth)
    expect(flat.borderBottomWidth).toBe(StyleSheet.hairlineWidth)
    expect(flat.borderColor).toBe('rgba(232, 74, 0, 0.16)')
    // Brand gradient base renders immediately; the radial glow once laid out.
    expect(getByTestId('section-band-base')).toBeTruthy()
    expect(queryByTestId('section-band-glow')).toBeNull()
    fireEvent(band, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 240 } } })
    expect(getByTestId('section-band-glow')).toBeTruthy()
  })
})
