import React from 'react'
import { render } from '@testing-library/react-native'
import { Text } from '@/design-system/Text'
import { color, typography } from '@/design-system/tokens'

describe('<Text>', () => {
  it('defaults to body.md + text.primary', () => {
    const { getByText } = render(<Text>Hello</Text>)
    const el = getByText('Hello')
    expect(el.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ fontSize: 16, color: color.text.primary }),
    ]))
  })
  it('renders specified variant', () => {
    const { getByText } = render(<Text variant="display.lg">Big</Text>)
    const el = getByText('Big')
    expect(el.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ fontSize: typography['display.lg'].fontSize }),
    ]))
  })
  it('refuses tertiary on body without meta prop', () => {
    const { getByText } = render(<Text variant="body.md" color="tertiary">x</Text>)
    expect(getByText('x').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: color.text.primary }),
    ]))
  })
  it('allows tertiary when meta=true', () => {
    const { getByText } = render(<Text variant="label.md" color="tertiary" meta>x</Text>)
    expect(getByText('x').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: color.text.tertiary }),
    ]))
  })
})
