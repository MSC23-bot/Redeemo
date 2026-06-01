import React from 'react'
import { Text as RNText, StyleSheet } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import { HomeChromeCard } from '@/features/home/components/HomeChromeCard'
import { color, radius } from '@/design-system'

// Pressable styles are functions of { pressed }; Views are arrays. Resolve both.
function flat(node: any) {
  const s = node.props.style
  return StyleSheet.flatten(typeof s === 'function' ? s({ pressed: false }) : s)
}

describe('HomeChromeCard (Batch 3 primitive)', () => {
  it('renders a string body', () => {
    const { getByText } = render(<HomeChromeCard variant="note" body="hello" testID="card" />)
    expect(getByText('hello')).toBeTruthy()
  })

  it('renders a node body as-is', () => {
    const { getByText } = render(<HomeChromeCard variant="note" body={<RNText>nodebody</RNText>} testID="card" />)
    expect(getByText('nodebody')).toBeTruthy()
  })

  // ---- D2 surface map (deterministic) ----
  it('hint = white surface + brand-rose hairline + radius.md, no shadow', () => {
    const { getByTestId } = render(
      <HomeChromeCard variant="hint" body="b" inlineAffordance={{ label: 'Update', onPress: () => {} }} testID="card" />,
    )
    const s = flat(getByTestId('card'))
    expect(s.backgroundColor).toBe(color.surface.page)
    expect(s.borderColor).toBe(color.brandRose)
    expect(s.borderRadius).toBe(radius.md)
    expect(s.shadowOpacity).toBeFalsy()
  })

  it('banner = white surface + neutral hairline + radius.lg', () => {
    const s = flat(render(<HomeChromeCard variant="banner" body="b" testID="card" />).getByTestId('card'))
    expect(s.backgroundColor).toBe(color.surface.page)
    expect(s.borderColor).toBe(color.border.subtle)
    expect(s.borderRadius).toBe(radius.lg)
  })

  it('note = white surface + neutral hairline', () => {
    const s = flat(render(<HomeChromeCard variant="note" body="b" testID="card" />).getByTestId('card'))
    expect(s.backgroundColor).toBe(color.surface.page)
    expect(s.borderColor).toBe(color.border.subtle)
  })

  it('empty = warm cream (#FFF9F5) + neutral hairline + radius.lg', () => {
    const s = flat(render(<HomeChromeCard variant="empty" body="b" testID="card" />).getByTestId('card'))
    expect(s.backgroundColor).toBe('#FFF9F5')
    expect(s.borderColor).toBe(color.border.subtle)
    expect(s.borderRadius).toBe(radius.lg)
  })

  // ---- title (D4: Mustica ~20) ----
  it('renders a Mustica ~20 title when provided, omits when not', () => {
    const { getByText, queryByText, rerender } = render(<HomeChromeCard variant="banner" title="Title" body="b" />)
    const t = flat(getByText('Title'))
    expect(t.fontFamily).toBe('MusticaPro-Semibold')
    expect(t.fontSize).toBe(20)
    rerender(<HomeChromeCard variant="note" body="b" />)
    expect(queryByText('Title')).toBeNull()
  })

  // ---- actions → 48pt buttons ----
  it('renders actions as 48pt buttons (navy primary / navy-outline secondary) and fires onPress', () => {
    const onPrimary = jest.fn()
    const onSecondary = jest.fn()
    const { getByLabelText } = render(
      <HomeChromeCard variant="banner" body="b" actions={[
        { label: 'Go', onPress: onPrimary, kind: 'primary' },
        { label: 'Cancel', onPress: onSecondary, kind: 'secondary' },
      ]} />,
    )
    const primary = getByLabelText('Go')
    const secondary = getByLabelText('Cancel')
    expect(flat(primary).height).toBe(48)
    expect(flat(primary).backgroundColor).toBe(color.navy)
    expect(flat(secondary).height).toBe(48)
    expect(flat(secondary).backgroundColor).toBe('transparent')
    expect(flat(secondary).borderColor).toBe(color.navy)
    fireEvent.press(primary)
    fireEvent.press(secondary)
    expect(onPrimary).toHaveBeenCalledTimes(1)
    expect(onSecondary).toHaveBeenCalledTimes(1)
  })

  it('forwards an action accessibilityLabel override', () => {
    const { getByLabelText } = render(
      <HomeChromeCard variant="banner" body="b" actions={[{ label: 'Go', onPress: () => {}, accessibilityLabel: 'Go now' }]} />,
    )
    expect(getByLabelText('Go now')).toBeTruthy()
  })

  // ---- inlineAffordance (hint) ----
  it('inlineAffordance: whole-card press fires onPress and renders the affordance label', () => {
    const onPress = jest.fn()
    const { getByTestId, getByText } = render(
      <HomeChromeCard variant="hint" body="b" accessibilityLabel="Tap me" inlineAffordance={{ label: 'Update', onPress }} testID="card" />,
    )
    expect(getByText('Update')).toBeTruthy()
    expect(getByTestId('card').props.accessibilityLabel).toBe('Tap me')
    fireEvent.press(getByTestId('card'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  // ---- icon slot ----
  it('renders the icon slot when provided', () => {
    const { getByTestId } = render(<HomeChromeCard variant="empty" body="b" icon={<RNText testID="the-icon">i</RNText>} />)
    expect(getByTestId('the-icon')).toBeTruthy()
  })

  // ---- align ----
  it('align="center" centres the body text', () => {
    const { getByText } = render(<HomeChromeCard variant="note" body="centered" align="center" />)
    expect(flat(getByText('centered')).textAlign).toBe('center')
  })

  // ---- tone override ----
  it('tone="accent" forces a brand-rose hairline on a non-hint variant', () => {
    const s = flat(render(<HomeChromeCard variant="banner" body="b" tone="accent" testID="card" />).getByTestId('card'))
    expect(s.borderColor).toBe(color.brandRose)
  })
})
