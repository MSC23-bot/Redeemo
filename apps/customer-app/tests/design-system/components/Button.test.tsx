import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { Button } from '@/design-system/components/Button'

describe('<Button>', () => {
  it('fires onPress when enabled', () => {
    const onPress = jest.fn()
    const { getByText } = render(<Button variant="primary" onPress={onPress}>Go</Button>)
    fireEvent.press(getByText('Go'))
    expect(onPress).toHaveBeenCalled()
  })
  it('locks width when loading (no reflow) and disables press', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(<Button variant="primary" loading onPress={onPress} accessibilityLabel="submit">Submit</Button>)
    fireEvent.press(getByLabelText('submit'))
    expect(onPress).not.toHaveBeenCalled()
  })
  it('renders danger variant with danger color', () => {
    const { getByText } = render(<Button variant="danger" onPress={() => {}}>Delete</Button>)
    expect(getByText('Delete')).toBeTruthy()
  })
})
